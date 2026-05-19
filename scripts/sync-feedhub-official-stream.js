#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = process.env.FEEDHUB_BASE_URL || "https://rss.ddsm24.site";
const DEFAULT_CATALOG_URL = process.env.FEEDHUB_DELIVERY_CATALOG_URL || `${DEFAULT_BASE_URL}/api/delivery/catalog`;
const KEEP_DAYS = Math.max(1, Number(process.env.FEEDHUB_OFFICIAL_STREAM_DAYS || 5));
const CONSUMER_NAME = process.env.FEEDHUB_DELIVERY_CONSUMER || "Loom";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("[sync-feedhub-official-stream]", error);
    process.exitCode = 1;
  });
}

async function main() {
  const [{ getLegacyUserId }, repository] = await Promise.all([
    import("../server/db.js"),
    import("../server/repository.js"),
  ]);
  const { listAllUsers, pruneNewsOlderThan, syncOfficialNewsToUser, upsertNews } = repository;
  const streamUrls = await resolveStreamUrlsFromRuntime(process.argv.slice(2));
  const userId = getLegacyUserId();
  const streamResults = [];
  const sourceGroups = new Set();

  for (const url of streamUrls) {
    const payload = await fetchFeedHubStream(url);
    const bundles = Array.isArray(payload.items) ? payload.items : [];
    const items = bundles.map(feedHubBundleToLoomNews).filter(Boolean);
    for (const item of items) {
      if (item.classification?.source_group) sourceGroups.add(item.classification.source_group);
    }
    const result = upsertNews(userId, items);
    streamResults.push({
      url,
      source: payload.source,
      category: payload.category,
      received: bundles.length,
      inserted: result.inserted.length,
      updated: result.updated.length,
    });
  }

  const pruneGroups = Array.from(new Set(["official-google-news", "official-default", "wechat-exporter", ...sourceGroups]));
  const pruned = pruneNewsOlderThan(userId, { sourceGroups: pruneGroups, olderThanDays: KEEP_DAYS });
  const distributed = listAllUsers()
    .filter((user) => user.id !== userId)
    .map((user) => {
      const synced = syncOfficialNewsToUser(user.id);
      return { userId: user.id, inserted: synced.inserted.length, updated: synced.updated.length };
    });

  console.log(JSON.stringify({
    mode: "feedhub-delivery-catalog",
    catalog_url: DEFAULT_CATALOG_URL,
    streams: streamResults,
    received: streamResults.reduce((sum, item) => sum + item.received, 0),
    inserted: streamResults.reduce((sum, item) => sum + item.inserted, 0),
    updated: streamResults.reduce((sum, item) => sum + item.updated, 0),
    pruned,
    distributed,
  }, null, 2));
}

async function resolveStreamUrlsFromRuntime(args) {
  if (args.length) return args;
  if (process.env.FEEDHUB_OFFICIAL_STREAM_URL) return [process.env.FEEDHUB_OFFICIAL_STREAM_URL];
  const response = await fetch(DEFAULT_CATALOG_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`FeedHub catalog failed: HTTP ${response.status}`);
  const catalog = await response.json();
  return resolveFeedHubStreamUrls(catalog, DEFAULT_BASE_URL, KEEP_DAYS, CONSUMER_NAME);
}

async function fetchFeedHubStream(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`FeedHub stream failed: HTTP ${response.status}`);
  return response.json();
}

export function resolveFeedHubStreamUrls(catalog, baseUrl = DEFAULT_BASE_URL, sinceDays = KEEP_DAYS, consumerName = CONSUMER_NAME) {
  const groups = Array.isArray(catalog?.groups) ? catalog.groups : Array.isArray(catalog?.categories) ? catalog.categories : [];
  const hasTargetConfig = groups.some((group) => Array.isArray(group?.targets) || Array.isArray(group?.target_ids));
  return groups
    .filter((group) => Number(group.feed_count || 0) > 0)
    .filter((group) => !hasTargetConfig || groupTargetsConsumer(group, consumerName))
    .map((group) => {
      const rawUrl = String(group.delivery_url || `/api/delivery/stream?category_id=${group.id || ""}`);
      const url = new URL(rawUrl, baseUrl);
      url.searchParams.set("since", `${Math.max(1, Number(sinceDays || 5))}d`);
      return url.toString();
    });
}

function groupTargetsConsumer(group, consumerName) {
  const expected = cleanText(consumerName).toLowerCase();
  const targets = Array.isArray(group?.targets) ? group.targets : [];
  if (targets.some((target) => cleanText(target?.title || target?.id || target).toLowerCase() === expected)) return true;
  const targetIds = Array.isArray(group?.target_ids) ? group.target_ids : [];
  return targetIds.some((targetId) => cleanText(targetId).toLowerCase() === expected);
}

export function feedHubBundleToLoomNews(bundle) {
  const canonicalUrl = cleanText(bundle.canonical_url || bundle.url);
  const url = canonicalUrl || cleanText(bundle.url);
  if (!url) return null;
  const sourceName = cleanText(bundle.source_name || bundle.publisher || "FeedHub");
  const sourceType = cleanText(bundle.source_type || "google_news");
  const sourceGroup = sourceGroupForFeedHubType(sourceType);
  const sourceId = `feedhub-${sourceGroup}`;
  const title = cleanText(bundle.title_zh || bundle.title_original);
  return {
    id: cleanText(bundle.bundle_id || bundle.id),
    source_id: sourceId,
    source: sourceName,
    source_authority: "watchlist",
    original_title: cleanText(bundle.title_original || title),
    original_url: url,
    original_content: cleanText(bundle.summary),
    titleZh: cleanText(bundle.title_zh || title),
    summary: cleanText(bundle.summary),
    contentZh: "",
    type: sourceType === "google_news" ? "行业趋势" : "资讯",
    thumbnail_url: cleanText(bundle.thumbnail_url),
    thumbHue: sourceType === "google_news" ? 40 : 160,
    published_at: cleanText(bundle.published_at),
    llmProcessed: true,
    needsTranslation: false,
    classification: {
      source_group: sourceGroup,
      source_type: sourceType,
      source_label: sourceName,
      source_homepage: url ? homepageForUrl(url) : "",
      feedhub_bundle_id: cleanText(bundle.bundle_id || bundle.id),
      feedhub_cluster_id: cleanText(bundle.cluster_id || bundle.bundle_id || bundle.id),
      feedhub_source_count: Number(bundle.source_count || (Array.isArray(bundle.sources) ? bundle.sources.length : 1)),
      feedhub_sources: Array.isArray(bundle.sources) ? bundle.sources : [],
      image_fetch_status: cleanText(bundle.image_fetch_status),
      image_fetch_error: cleanText(bundle.image_fetch_error),
      raw_entry_id: bundle.raw_entry_id ?? null,
      miniflux_entry_id: bundle.miniflux_entry_id ?? null,
      merge_key: cleanText(bundle.bundle_id || bundle.cluster_id || url),
      story_key: cleanText(bundle.cluster_id || bundle.bundle_id || ""),
    },
  };
}

function sourceGroupForFeedHubType(sourceType) {
  const normalized = cleanText(sourceType).toLowerCase();
  if (normalized === "google_news" || normalized === "google-news") return "official-google-news";
  if (normalized === "wechat" || normalized === "wechat_exporter" || normalized === "wechat-exporter") return "wechat-exporter";
  return normalized || "rss";
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function homepageForUrl(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return "";
  }
}
