import { db, migrate } from "../server/db.js";
import { fetchPageImage } from "../server/content-fetcher.js";
import { findReusableNewsThumbnail } from "../server/repository.js";

const BATCH_LIMIT = Math.max(1, Number(process.env.NEWS_THUMB_BACKFILL_LIMIT || 300));
const SLEEP_MS = Math.max(0, Number(process.env.NEWS_THUMB_BACKFILL_SLEEP_MS || 150));
const GOOGLE_NEWS_HOSTS = new Set(["news.google.com", "news.url.google.com"]);
const IMAGE_BAD_HOST_PATTERNS = [
  /news\.google\.com/i,
  /gstatic\.com/i,
  /googleusercontent\.com/i,
];
const IMAGE_BAD_PATH_PATTERNS = [
  /\/favicon\./i,
  /sprite/i,
  /logo/i,
  /placeholder/i,
  /default/i,
  /share_save/i,
  /addtoany/i,
  /buttons\/share/i,
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeUrl(rawUrl, baseUrl) {
  try {
    return new URL(String(rawUrl || ""), baseUrl);
  } catch {
    return null;
  }
}

function normalizeUrlForDedupe(rawUrl) {
  const url = safeUrl(rawUrl);
  if (!url) return String(rawUrl || "").trim();
  url.hash = "";
  for (const param of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "fbclid", "gclid", "mc_cid", "mc_eid"]) {
    url.searchParams.delete(param);
  }
  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function shouldRetryImageEnrichment(item = {}) {
  const image = String(item.thumbnail_url || item.image || "").trim();
  if (!image) return true;
  try {
    const parsed = new URL(image);
    if (IMAGE_BAD_HOST_PATTERNS.some((pattern) => pattern.test(parsed.hostname))) return true;
    if (/googleusercontent\.com/i.test(parsed.hostname) && /(?:^|[=/?&])s0-w\d+/i.test(parsed.pathname + parsed.search)) return true;
    if (IMAGE_BAD_PATH_PATTERNS.some((pattern) => pattern.test(parsed.pathname))) return true;
    return false;
  } catch {
    return true;
  }
}

function isGoogleNewsLike(item = {}) {
  const primaryUrl = safeUrl(item.original_url || item.article_url || "");
  if (primaryUrl && GOOGLE_NEWS_HOSTS.has(primaryUrl.hostname.toLowerCase())) return true;
  const source = String(item.source_name || "").toLowerCase();
  return source.includes("google news");
}

function candidateUrlsForItem(item = {}) {
  const urls = [
    item.article_url || item.original_url || "",
    item.rss_url || "",
    item.source_homepage || "",
  ];
  return urls.filter((url, index, array) => url && /^https?:\/\//i.test(url) && array.indexOf(url) === index);
}

function parseClassification(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function mergeClassification(current, patch) {
  const next = { ...(current || {}), ...(patch || {}) };
  return Object.keys(next).length ? JSON.stringify(next) : null;
}

function mapRow(row) {
  const classification = parseClassification(row.classification_json);
  return {
    ...row,
    classification,
    rss_url: String(classification.rss_url || "").trim(),
    source_homepage: String(classification.source_homepage || "").trim(),
    merge_key: String(classification.merge_key || "").trim(),
    title_zh: String(row.title_zh || "").trim(),
  };
}

function buildSelectionSql() {
  return `
    SELECT id, user_id, source_id, source_name, source_authority, original_url, title_zh, thumbnail_url, classification_json
    FROM news_items
    WHERE (
        COALESCE(thumbnail_url, '') = ''
        OR lower(COALESCE(thumbnail_url, '')) LIKE '%googleusercontent.com%'
        OR lower(COALESCE(thumbnail_url, '')) LIKE '%share_save%'
        OR lower(COALESCE(thumbnail_url, '')) LIKE '%addtoany%'
      )
      AND EXISTS (
        SELECT 1
        FROM news_sources ns
        WHERE ns.id = news_items.source_id
          AND lower(COALESCE(ns.type, 'rss')) IN ('rss', 'atom', 'wechat_exporter')
      )
    ORDER BY published_at DESC, created_at DESC
    LIMIT ?
  `;
}

function siblingImageForItem(item) {
  return findReusableNewsThumbnail({
    originalUrl: item.original_url || "",
    mergeKey: item.merge_key || "",
    titleZh: item.title_zh || "",
    excludeId: item.id || "",
    userId: item.user_id || "",
  });
}

async function main() {
  migrate();
  const rows = db.prepare(buildSelectionSql()).all(BATCH_LIMIT).map(mapRow);
  const updateStmt = db.prepare(`
    UPDATE news_items
    SET original_url = ?,
        thumbnail_url = ?,
        classification_json = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `);

  let processed = 0;
  let updated = 0;
  let failed = 0;
  const skipped = [];

  for (const item of rows) {
    processed += 1;
    if (!shouldRetryImageEnrichment(item)) continue;

    const siblingImage = siblingImageForItem(item);
    if (siblingImage) {
      const classification = mergeClassification(item.classification, {
        image_enriched: true,
        image_source: "backfill_merge_key",
        image_error: null,
      });
      updateStmt.run(item.original_url, siblingImage, classification, item.id, item.user_id);
      updated += 1;
      if (SLEEP_MS > 0) await sleep(Math.min(SLEEP_MS, 30));
      continue;
    }

    let finalImage = "";
    let finalUrl = item.original_url;
    let lastError = "";
    for (const candidateUrl of candidateUrlsForItem(item)) {
      try {
        const page = await fetchPageImage(candidateUrl);
        if (page.articleUrl && isGoogleNewsLike(item)) {
          finalUrl = normalizeUrlForDedupe(page.articleUrl);
        }
        if (page.image) {
          finalImage = page.image;
          break;
        }
      } catch (error) {
        lastError = error.message || "image_fetch_failed";
      }
    }

    if (finalImage) {
      const classification = mergeClassification(item.classification, {
        image_enriched: true,
        image_source: "backfill_page_meta",
        ...(finalUrl && finalUrl !== item.original_url ? { decoded_article_url: finalUrl } : {}),
        ...(lastError ? { image_error: lastError } : { image_error: null }),
      });
      updateStmt.run(item.original_url, finalImage, classification, item.id, item.user_id);
      updated += 1;
    } else {
      const classification = mergeClassification(item.classification, {
        image_enriched: false,
        ...(lastError ? { image_error: lastError } : {}),
      });
      updateStmt.run(item.original_url, item.thumbnail_url || "", classification, item.id, item.user_id);
      failed += 1;
      if (skipped.length < 15) skipped.push({ source: item.source_name, url: item.original_url, error: lastError || "no_image_found" });
    }

    if (SLEEP_MS > 0) await sleep(SLEEP_MS);
  }

  console.log(JSON.stringify({
    processed,
    updated,
    failed,
    remaining_unfilled: db.prepare("SELECT COUNT(*) AS count FROM news_items WHERE COALESCE(thumbnail_url,'') = ''").get().count,
    skipped,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
