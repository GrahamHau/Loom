import { db, migrate } from "../server/db.js";
import { withNewsDedupeKeys, isCrossSourceNewsStoryKey, isSpecificNewsStoryKey } from "../server/news-dedupe.js";

const apply = process.argv.includes("--apply");
const maxRows = Math.max(1, Number(process.env.BACKFILL_NEWS_DEDUPE_LIMIT || 5000));

function parseJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function appendUnique(list, value, limit = 12) {
  const next = cleanText(value);
  const current = Array.isArray(list) ? list.map((item) => cleanText(item)).filter(Boolean) : [];
  return Array.from(new Set([...current, next].filter(Boolean))).slice(-limit);
}

function isWechatRow(row = {}) {
  const classification = parseJsonObject(row.classification_json);
  return String(classification.source_type || "").toLowerCase().includes("wechat") ||
    String(classification.source_group || "").toLowerCase() === "wechat-exporter" ||
    String(row.original_url || "").includes("mp.weixin.qq.com") ||
    String(row.source_name || "").includes("公众号");
}

function mapRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    source_id: row.source_id,
    source: row.source_name,
    source_authority: row.source_authority,
    original_title: row.original_title,
    original_url: row.original_url,
    original_content: row.original_content || row.original_summary || "",
    titleZh: row.title_zh || row.original_title,
    summary: row.summary_zh || row.original_summary || "",
    contentZh: row.content_zh || "",
    type: row.type,
    thumbnail_url: row.thumbnail_url || "",
    thumbHue: row.thumb_hue ?? 40,
    published_at: row.published_at,
    date: String(row.published_at || "").slice(0, 10),
    classification: parseJsonObject(row.classification_json),
  };
}

function betterRow(a, b) {
  if (isWechatRow(a) !== isWechatRow(b)) return isWechatRow(b) ? b : a;
  if (Boolean(b.thumbnail_url) !== Boolean(a.thumbnail_url)) return b.thumbnail_url ? b : a;
  if (Boolean(b.summary_zh) !== Boolean(a.summary_zh)) return b.summary_zh ? b : a;
  if (String(b.published_at || "") !== String(a.published_at || "")) return String(b.published_at || "") > String(a.published_at || "") ? b : a;
  return String(b.updated_at || "") > String(a.updated_at || "") ? b : a;
}

function groupKeysFor(row) {
  const classification = parseJsonObject(row.classification_json);
  const nearMergeKey = cleanText(classification.near_merge_key);
  const storyKey = cleanText(classification.story_key);
  const sourceName = cleanText(row.source_name);
  const title = cleanText(row.title_zh || row.original_title);
  const keys = [];
  if (nearMergeKey && classification.host_key && storyKey && storyKey !== "generic") {
    keys.push(`near::${row.user_id}::${nearMergeKey}`);
  }
  if (sourceName && isSpecificNewsStoryKey(storyKey)) {
    keys.push(`story::${row.user_id}::${sourceName}::${storyKey}`);
  }
  if (isCrossSourceNewsStoryKey(storyKey)) {
    keys.push(`cross-story::${row.user_id}::${storyKey}`);
  }
  if (sourceName && title) {
    keys.push(`title::${row.user_id}::${sourceName}::${title}`);
  }
  return keys;
}

function mergeClassification(keeper, duplicate) {
  const current = parseJsonObject(keeper.classification_json);
  const extra = parseJsonObject(duplicate.classification_json);
  return JSON.stringify({
    ...extra,
    ...current,
    duplicate_urls: appendUnique(current.duplicate_urls, duplicate.original_url),
    deduped_from: appendUnique(current.deduped_from, duplicate.id),
  });
}

migrate();

const rows = db.prepare(`
  SELECT *
  FROM news_items
  ORDER BY datetime(COALESCE(published_at, created_at)) DESC, updated_at DESC
  LIMIT ?
`).all(maxRows);

const updateKeys = db.prepare(`
  UPDATE news_items
  SET classification_json = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND user_id = ?
`);

let keysUpdated = 0;
const keyedRows = rows.map((row) => {
  const item = withNewsDedupeKeys(mapRow(row), { force: true });
  const mergedClassification = {
    ...parseJsonObject(row.classification_json),
    ...(item.classification || {}),
  };
  const classificationJson = JSON.stringify(mergedClassification);
  if (apply && classificationJson !== (row.classification_json || "")) {
    keysUpdated += updateKeys.run(classificationJson, row.id, row.user_id).changes;
  }
  return { ...row, classification_json: classificationJson };
});

const groups = new Map();
for (const row of keyedRows) {
  for (const key of groupKeysFor(row)) {
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
}

const candidateGroups = Array.from(groups.entries())
  .map(([key, list]) => [key, Array.from(new Map(list.map((row) => [row.id, row])).values())])
  .filter(([, list]) => list.length > 1);

const duplicateIds = new Set();
const mergePlans = [];
for (const [key, list] of candidateGroups) {
  const remaining = list.filter((row) => !duplicateIds.has(row.id));
  if (remaining.length <= 1) continue;
  let keeper = remaining[0];
  for (const row of remaining.slice(1)) keeper = betterRow(keeper, row);
  const duplicates = remaining.filter((row) => row.id !== keeper.id);
  if (!duplicates.length) continue;
  for (const duplicate of duplicates) duplicateIds.add(duplicate.id);
  mergePlans.push({ key, keeper, duplicates });
}

let deletedNews = 0;
if (apply) {
  const tx = db.transaction(() => {
    for (const plan of mergePlans) {
      let nextThumbnail = plan.keeper.thumbnail_url || "";
      let nextClassification = plan.keeper.classification_json || "{}";
      for (const duplicate of plan.duplicates) {
        nextThumbnail = nextThumbnail || duplicate.thumbnail_url || "";
        nextClassification = mergeClassification({ ...plan.keeper, classification_json: nextClassification }, duplicate);
      }
      db.prepare(`
        UPDATE news_items
        SET thumbnail_url = ?, classification_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(nextThumbnail, nextClassification, plan.keeper.id, plan.keeper.user_id);
      for (const duplicate of plan.duplicates) {
        deletedNews += db.prepare("DELETE FROM news_items WHERE id = ? AND user_id = ?").run(duplicate.id, duplicate.user_id).changes;
      }
    }
  });
  tx();
}

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  scanned: rows.length,
  keysUpdated,
  mergeGroups: mergePlans.length,
  duplicateRows: Array.from(duplicateIds).length,
  deletedNews,
  examples: mergePlans.slice(0, 20).map((plan) => ({
    key: plan.key,
    keep: {
      id: plan.keeper.id,
      source: plan.keeper.source_name,
      title: plan.keeper.title_zh || plan.keeper.original_title,
      url: plan.keeper.original_url,
    },
    merge: plan.duplicates.map((row) => ({
      id: row.id,
      source: row.source_name,
      title: row.title_zh || row.original_title,
      url: row.original_url,
    })),
  })),
}, null, 2));
