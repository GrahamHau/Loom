import Parser from "rss-parser";
import { callLLM } from "./ai-service.js";
import { fetchPageImage, resolvePageUrl } from "./content-fetcher.js";
import { withNewsDedupeKeys } from "./news-dedupe.js";
import { findReusableNewsThumbnail, listNews, listPendingNewsForLlm, updateNews, upsertNews, updateNewsSource } from "./repository.js";

const parser = new Parser({
  timeout: 20000,
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      ["content:encoded", "contentEncoded"],
      ["enclosure", "enclosure"],
    ],
  },
});

const RSS_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
};

const NEWS_LLM_SYSTEM_PROMPT = `你是一个信息筛选助手，服务于摄影/影像器材行业（灯光、稳定器、三脚架、相机配件、收音设备、手机配件）的产品经理。

先把输入内容翻译/整理成中文，再判断是否属于以下两类之一：

【保留 - new_product】：某品牌正式发布了新产品、新型号、新SKU，或产品重大功能更新。必须是具体产品发布，不是泛泛评论。

【保留 - trend】：有数据支撑的市场报告、技术方向变化、消费趋势分析、行业重要动态。

【直接丢弃（keep=false）】：
- 纯广告/促销/折扣/赠品
- 招聘/招商/合作邀请
- 企业社会责任/赞助活动
- 博客游记/旅行摄影（无产品发布或趋势价值）
- 摄影技巧教程（无产品/趋势价值）
- 二手市场/拍卖
- 赠品抽奖（如 "Giveaway Live Now"）

严格返回 JSON，不输出任何其他内容：
{
  "keep": true | false,
  "type": "new_product" | "trend" | null,
  "title_zh": "中文标题，15字以内，直接说是什么（例：神牛发布ML100Bi II双色温灯）",
  "summary_zh": "80字以内中文摘要，提炼核心信息。",
  "content_zh": "中文正文，保留原文关键信息，120-300字。",
  "story_key": "同一新闻事件的短英文key，格式 brand-product-event，例如 sony-a7r-vi-launch；不确定则为空",
  "story_event": "launch|review|leak|poll|preorder|firmware|price|trend|other",
  "dedupe_confidence": 0 到 1
}`;

const NEWS_LLM_INPUT_LIMIT = 1600;
const NEWS_LLM_MAX_TOKENS = 520;
const FETCH_TIMEOUT_MS = 30000;
const OFFICIAL_IMAGE_ENRICH_MAX_PER_SOURCE = Number(process.env.OFFICIAL_IMAGE_ENRICH_MAX_PER_SOURCE || 12);
const RECENT_NEWS_WINDOW_DAYS = Math.max(1, Number(process.env.NEWS_RECENT_WINDOW_DAYS || 5));
const GOOGLE_NEWS_HOSTS = new Set(["news.google.com", "news.url.google.com"]);
const WECHAT_EXPORTER_SOURCE_TYPES = new Set(["wechat_exporter", "wechat-exporter", "wechat"]);
const WECHAT_EXPORTER_MAX_PER_SOURCE = Math.max(1, Number(process.env.WECHAT_EXPORTER_MAX_PER_SOURCE || 50));
const WECHAT_EXPORTER_DEFAULT_BASE_URL = String(process.env.WECHAT_EXPORTER_BASE_URL || "").trim();
const WECHAT_EXPORTER_DEFAULT_AUTH_KEY = String(process.env.WECHAT_EXPORTER_AUTH_KEY || "").trim();
const WECHAT_IMAGE_ENRICH_MAX_PER_SOURCE = Math.min(20, Math.max(1, Number(process.env.WECHAT_IMAGE_ENRICH_MAX_PER_SOURCE || 8)));
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
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function shouldCollectSource(source, now = new Date()) {
  if (source.active === false || !source.url) return false;
  const intervalMinutes = Number(source.fetch_interval || source.interval || 60);
  const intervalMs = Math.max(30, intervalMinutes) * 60 * 1000;
  if (!source.last_fetched_at) return true;
  const lastFetched = new Date(source.last_fetched_at);
  if (Number.isNaN(lastFetched.getTime())) return true;
  return now.getTime() - lastFetched.getTime() >= intervalMs;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function arrayFirst(value) {
  return Array.isArray(value) ? value.find(Boolean) : value;
}

function safeUrl(rawUrl, baseUrl) {
  try {
    return new URL(String(rawUrl || ""), baseUrl);
  } catch {
    return null;
  }
}

function isGoogleNewsUrl(rawUrl) {
  const url = safeUrl(rawUrl);
  return Boolean(url && GOOGLE_NEWS_HOSTS.has(url.hostname.toLowerCase()));
}

function isWechatExporterSource(source = {}) {
  return WECHAT_EXPORTER_SOURCE_TYPES.has(String(source.type || "").toLowerCase());
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

function extractSourceHomepage(item) {
  const source = arrayFirst(item.source);
  return source?.url || source?.$?.url || "";
}

function sourceHostname(item) {
  const homepage = extractSourceHomepage(item);
  const url = safeUrl(homepage);
  return url?.hostname.replace(/^www\./, "").toLowerCase() || "";
}

function titleSlug(value) {
  return stripHtml(String(value || "")
    .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, "$1 $2"))
    .replace(/\s+-\s+[^-]+$/g, "")
    .toLowerCase()
    .replace(/['"“”‘’]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

const MERGE_KEY_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "to", "for", "of", "with", "in", "on", "at",
  "launch", "launches", "launched", "launching",
  "announce", "announces", "announced", "announcing",
  "introduce", "introduces", "introduced", "introducing",
  "release", "releases", "released", "releasing",
  "debut", "debuts", "debuted", "debuting",
  "official", "presented", "preview", "first", "look", "review", "hands", "hand", "rumor", "rumour", "teaser",
  "发布", "推出", "上市", "首发", "亮相", "登场", "发售", "开售", "正式发布", "正式推出",
  "新机", "新品", "相机", "镜头", "套装",
]);

function normalizeMergeTitle(value) {
  return titleSlug(value)
    .replace(/-(发布|推出|上市|首发|亮相|登场|发售|开售|正式发布|正式推出)(?=-|$)/g, "-")
    .replace(/^(发布|推出|上市|首发|亮相|登场|发售|开售|正式发布|正式推出)-/g, "")
    .replace(/(新品|新机|复古套装|套装)(发布|推出|上市|首发|亮相|登场|发售|开售|正式发布|正式推出)$/g, "$1")
    .replace(/(go-\d+s?)(发布|推出|上市|首发|亮相|登场|发售|开售)$/g, "$1")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizedSourceHome(source) {
  const url = safeUrl(source);
  if (!url) return String(source || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  return `${url.protocol}//${url.hostname.replace(/^www\./, "").toLowerCase()}`;
}

function extractThumbnail(item) {
  const mediaContent = arrayFirst(item.mediaContent);
  const mediaThumbnail = arrayFirst(item.mediaThumbnail);
  const enclosure = arrayFirst(item.enclosure);
  const direct = enclosure?.url || mediaContent?.$?.url || mediaContent?.url || mediaThumbnail?.$?.url || mediaThumbnail?.url;
  if (direct) return direct;
  const html = String(item.content || item.contentEncoded || item.summary || "");
  const meta = html.match(/<meta\s+[^>]*(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["'][^>]*content=["']([^"']+)["']/i)?.[1];
  if (meta) return meta;
  return html.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1] || "";
}

export function extractRssThumbnail(item) {
  return extractThumbnail(item);
}

async function resolveOriginalArticleUrl(item) {
  const originalUrl = item.link || item.guid || "";
  if (!originalUrl || !isGoogleNewsUrl(originalUrl)) return normalizeUrlForDedupe(originalUrl);
  try {
    const resolvedUrl = await resolvePageUrl(originalUrl);
    if (resolvedUrl && !isGoogleNewsUrl(resolvedUrl)) return normalizeUrlForDedupe(resolvedUrl);
  } catch {
    // Google News links are still stable enough as a fallback dedupe key.
  }
  const host = sourceHostname(item);
  const slug = titleSlug(item.title);
  if (host && slug) return `google-news://${host}/${slug}`;
  return normalizeUrlForDedupe(originalUrl);
}

export const __rssTestUtils = {
  isGoogleNewsUrl,
  normalizeUrlForDedupe,
  resolveOriginalArticleUrl,
  titleSlug,
  parseWechatExporterSourceUrl,
  mergeKeyForItem,
  imageLookupUrlForItem,
  dedupeKeyForItem,
  shouldRetryImageEnrichment,
};

function dedupeKeyForItem(item = {}) {
  const normalizedUrl = normalizeUrlForDedupe(item.original_url || item.article_url || "");
  if (normalizedUrl && !normalizedUrl.startsWith("google-news://")) return normalizedUrl;
  const source = normalizedSourceHome(item.classification?.source_homepage || item.source || "");
  const title = titleSlug(item.titleZh || item.original_title || "");
  return `${source}::${title}`;
}

function mergeKeyForItem(item = {}) {
  const title = canonicalTitleKey(item);
  if (title) return title;
  const fallbackTitle = titleSlug(item.titleZh || item.original_title || "");
  if (fallbackTitle) return fallbackTitle;
  const source = normalizedSourceHome(item.classification?.source_homepage || item.source || "");
  return source || normalizeUrlForDedupe(item.original_url || item.article_url || "") || "";
}

function canonicalTitleKey(item = {}) {
  const tokens = normalizeMergeTitle(item.titleZh || item.original_title || "")
    .split("-")
    .filter(Boolean)
    .filter((token) => !MERGE_KEY_STOPWORDS.has(token));
  if (tokens.length >= 2) return tokens.slice(0, 6).join("-");
  return tokens[0] || "";
}

async function annotateMergedItems(items = []) {
  return items.map((item) => withNewsDedupeKeys({
    ...item,
    classification: {
      ...(item.classification || {}),
      merge_key: mergeKeyForItem(item),
      merge_title: item.titleZh || item.original_title || "",
    },
  }));
}

function imageLookupUrlForItem(item = {}) {
  const primary = String(item.article_url || item.original_url || "").trim();
  if (primary && !primary.startsWith("google-news://")) return primary;
  const fallback = String(item.classification?.rss_url || "").trim();
  if (fallback && /^https?:\/\//i.test(fallback)) return fallback;
  const sourceHome = String(item.classification?.source_homepage || "").trim();
  if (sourceHome && /^https?:\/\//i.test(sourceHome)) return sourceHome;
  return "";
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

function publishedAtOf(item) {
  const candidates = [item.isoDate, item.pubDate, item.published, item.updated].filter(Boolean);
  for (const value of candidates) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function mapType(type) {
  if (type === "new_product") return "新品发布";
  if (type === "trend") return "行业趋势";
  return null;
}

export function heuristicClassifyNews({ item }) {
  const title = stripHtml(item.title);
  const content = stripHtml([item.contentSnippet, item.summary, item.content].filter(Boolean).join(" "));
  const lower = `${title}\n${content}`.toLowerCase();
  const sourceName = String(item.sourceName || "").toLowerCase();
  const launchPattern = /\b(launch(?:ed|es|ing)?|announce[sd]?|announcing|release[sd]?|releasing|introduce[sd]?|introducing|unveil(?:ed|s|ing)?|debut(?:ed|s|ing)?|正式发布|正式推出|新品发布|发售|上市)\b/i;
  const productPattern = /\b(camera|lens|drone|gimbal|light|tripod|rig|cage|mount|microphone|monitor|stabilizer|battery|charger|accessory|iphone|ipad|macbook)\b|相机|镜头|无人机|云台|补光灯|三脚架|麦克风|监视器|稳定器|电池|充电器|配件/i;
  const trendPattern = /\b(trend|market|report|survey|forecast|analysis)\b|趋势|报告|预测|分析/i;
  const rejectPattern = /\b(giveaway|discount|coupon|hiring|career|sponsor|sponsored|travel|tutorial|how to|used market|auction)\b|赠品|抽奖|折扣|招聘|赞助|游记|教程|二手|拍卖/i;
  const teaserPattern = /\b(teaser|rumou?r|expected|coming soon|next week|preview|first look|set to debut)\b|预告|爆料|传闻|即将/i;
  const weakEvidencePattern = /\b(without official|discussion|conversation|discusses|reportedly|may|could|fits the market)\b/i;
  const collectionPattern = /\b(collection|wallpaper|watch band|band)\b|系列|壁纸|表带/i;
  const ambiguousPattern = /\b(update|workflow|feature|series|lineup)\b|更新|功能|系列/i;
  const mediaSourcePattern = /\b(petapixel|dpreview|fstoppers|youtube|creator)\b/i;

  if (rejectPattern.test(lower)) return null;
  if (collectionPattern.test(lower) && !launchPattern.test(lower)) return null;
  if (collectionPattern.test(lower) && !/\b(camera|lens|drone|gimbal|light|tripod|rig|cage|mount|microphone|monitor|stabilizer|battery|charger)\b|相机|镜头|无人机|云台|补光灯|三脚架|麦克风|监视器|稳定器|电池|充电器/i.test(lower)) {
    return null;
  }
  if (teaserPattern.test(lower) && launchPattern.test(lower)) return null;
  if (launchPattern.test(lower) && productPattern.test(lower)) {
    if (weakEvidencePattern.test(lower) && mediaSourcePattern.test(sourceName || lower)) {
      return {
        type: "行业趋势",
        titleZh: title || "未命名资讯",
        summary: content.slice(0, 80),
        needsTranslation: true,
        classification: { reason: "media_launch_downgraded_to_trend" },
      };
    }
    return {
      type: "新品发布",
      titleZh: title || "未命名新品",
      summary: content.slice(0, 80),
      needsTranslation: true,
      classification: { reason: "heuristic_new_product" },
    };
  }
  if (trendPattern.test(lower)) {
    return {
      type: "行业趋势",
      titleZh: title || "未命名资讯",
      summary: content.slice(0, 80),
      needsTranslation: true,
      classification: { reason: "heuristic_trend" },
    };
  }
  if (ambiguousPattern.test(lower)) {
    return {
      type: "待判定",
      titleZh: title || "未命名资讯",
      summary: content.slice(0, 80),
      needsTranslation: true,
      classification: { reason: "heuristic_ambiguous" },
    };
  }
  return null;
}

async function classifyNews({ source, item }) {
  const heuristic = heuristicClassifyNews({ source, item: { ...item, sourceName: source.name } });
  if (heuristic && heuristic.type !== "待判定") {
    const requiresOfficialTranslation = isOfficialManagedSource(source);
    return {
      ...heuristic,
      llmProcessed: !requiresOfficialTranslation,
      needsTranslation: requiresOfficialTranslation || heuristic.needsTranslation,
    };
  }
  return {
    type: null,
    titleZh: stripHtml(item.title || "") || "未命名资讯",
    summary: stripHtml(item.contentSnippet || item.summary || item.content).slice(0, 80),
    contentZh: "",
    needsTranslation: true,
    classification: { reason: "pending_manual_llm" },
    llmProcessed: false,
  };
}

async function fetchFeed(source) {
  const response = await fetchWithTimeout(source.url, {
    headers: RSS_HEADERS,
    redirect: "follow",
  });
  if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
  return parser.parseString(await response.text());
}

function isOfficialManagedSource(source = {}) {
  const authority = String(source.authority || "").toLowerCase();
  const group = String(source.source_group || source.group || "").toLowerCase();
  const id = String(source.id || "").toLowerCase();
  return authority === "official" ||
    authority === "aggregator" ||
    group === "sample-live" ||
    id.startsWith("rss-") ||
    id.startsWith("sample-news-");
}

export function shouldEnrichSourceImages(source) {
  const type = String(source?.type || "rss").toLowerCase();
  return type === "rss" || type === "atom" || isOfficialManagedSource(source);
}

function buildWechatExporterApiUrl(origin, pathPrefix, endpoint) {
  const path = `${String(pathPrefix || "").replace(/\/+$/g, "")}/${endpoint.replace(/^\/+/g, "")}`.replace(/\/{2,}/g, "/");
  return new URL(path.startsWith("/") ? path : `/${path}`, origin).toString();
}

function parseWechatExporterSourceUrl(source) {
  const parsed = safeUrl(source?.url);
  if (!parsed) throw new Error("公众号源地址无效");

  const articlePath = "/api/public/v1/article";
  const markerIndex = parsed.pathname.indexOf(articlePath);
  const pathPrefix = markerIndex >= 0
    ? parsed.pathname.slice(0, markerIndex)
    : parsed.pathname.replace(/\/+$/g, "");

  const authKey = parsed.searchParams.get("authKey") ||
    parsed.searchParams.get("auth_key") ||
    parsed.searchParams.get("x_auth_key") ||
    parsed.searchParams.get("authkey") ||
    WECHAT_EXPORTER_DEFAULT_AUTH_KEY;

  return {
    articleEndpoint: buildWechatExporterApiUrl(parsed.origin, pathPrefix, articlePath),
    accountByUrlEndpoint: buildWechatExporterApiUrl(parsed.origin, pathPrefix, "/api/public/v1/accountbyurl"),
    authKey,
    fakeid: parsed.searchParams.get("fakeid") || parsed.searchParams.get("id") || "",
    accountUrl: parsed.searchParams.get("accountUrl") ||
      parsed.searchParams.get("account_url") ||
      parsed.searchParams.get("articleUrl") ||
      parsed.searchParams.get("article_url") ||
      "",
    begin: Math.max(0, Number(parsed.searchParams.get("begin") || 0)),
    size: Math.min(20, Math.max(1, Number(parsed.searchParams.get("size") || WECHAT_EXPORTER_MAX_PER_SOURCE))),
  };
}

function injectWechatExporterDefaults(source) {
  if (!isWechatExporterSource(source) || !WECHAT_EXPORTER_DEFAULT_BASE_URL) return source;
  const rawUrl = String(source?.url || "").trim();
  const baseUrl = new URL(externalLikeUrl(WECHAT_EXPORTER_DEFAULT_BASE_URL));
  if (!baseUrl.pathname.includes("/api/public/v1/article")) {
    baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/g, "")}/api/public/v1/article`.replace(/\/{2,}/g, "/");
  }
  if (!rawUrl) return { ...source, url: baseUrl.toString() };
  if (safeUrl(rawUrl)) return source;
  return { ...source, url: new URL(rawUrl, baseUrl).toString() };
}

function externalLikeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

async function fetchWechatExporterJson(url, authKey) {
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      ...(authKey ? { "X-Auth-Key": authKey } : {}),
    },
    redirect: "follow",
  });
  if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error("公众号源返回了无法解析的响应");
  }
}

async function resolveWechatExporterFakeId(config) {
  if (config.fakeid) return config.fakeid;
  if (!config.accountUrl) throw new Error("公众号源缺少 fakeid 或文章链接");
  const requestUrl = new URL(config.accountByUrlEndpoint);
  requestUrl.searchParams.set("url", config.accountUrl);
  const result = await fetchWechatExporterJson(requestUrl.toString(), config.authKey);
  if (result?.base_resp?.ret !== 0) {
    throw new Error(result?.base_resp?.err_msg || "公众号查询失败");
  }
  const fakeid = result?.list?.[0]?.fakeid;
  if (!fakeid) throw new Error("未能从文章链接解析出公众号ID");
  return fakeid;
}

function publishedAtFromWechatArticle(article) {
  const timestamp = Number(article?.update_time || article?.create_time || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return new Date().toISOString();
  const millis = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function classifyWechatExporterArticle(source, article) {
  const title = stripHtml(article?.title || "");
  const summary = stripHtml(article?.digest || article?.author_name || title).slice(0, 160);
  const heuristic = heuristicClassifyNews({
    source,
    item: {
      title,
      contentSnippet: summary,
      sourceName: source.name,
    },
  });
  const lower = `${title}\n${summary}`.toLowerCase();
  const looksLikeProduct = /新品|发布|正式推出|上市|升级|更新|app|固件|镜头|相机|补光灯|灯|麦克风|云台|稳定器|三脚架|电池|充电|配件|支架|笼|滤镜|手电筒|flash|light|mic|microphone|gimbal|tripod|lens|camera/i.test(lower);
  const looksLikeEvent = /报名|展会|课程|直播|抽奖|周年庆|活动|体验会|招募|优惠|福利|五一|双11|618/i.test(lower);
  const type = heuristic?.type && heuristic.type !== "待判定"
    ? heuristic.type
    : looksLikeProduct && !looksLikeEvent
      ? "新品发布"
      : "行业趋势";
  return {
    type,
    titleZh: title || "未命名资讯",
    summary: summary || title || "公众号文章",
    contentZh: "",
    needsTranslation: false,
    llmProcessed: false,
    classification: {
      ...(heuristic?.classification || {}),
      reason: heuristic?.classification?.reason || "wechat_exporter_default",
      source_type: "wechat_exporter",
      source_group: source.source_group || source.group || "",
    },
  };
}

async function collectWechatExporterSource(userId, source) {
  const config = parseWechatExporterSourceUrl(source);
  if (!config.authKey) throw new Error("公众号源缺少 Auth Key");
  const fakeid = await resolveWechatExporterFakeId(config);
  const requestUrl = new URL(config.articleEndpoint);
  requestUrl.searchParams.set("fakeid", fakeid);
  requestUrl.searchParams.set("begin", String(config.begin));
  requestUrl.searchParams.set("size", String(config.size));

  const result = await fetchWechatExporterJson(requestUrl.toString(), config.authKey);
  if (result?.base_resp?.ret !== 0) {
    throw new Error(result?.base_resp?.err_msg || "公众号文章拉取失败");
  }

  const items = Array.isArray(result?.articles) ? result.articles : [];
  const newsItems = items
    .map((article) => {
      const originalUrl = normalizeUrlForDedupe(article?.link || "");
      if (!originalUrl) return null;
      const publishedAt = publishedAtFromWechatArticle(article);
      const classified = classifyWechatExporterArticle(source, article);
      return {
        source_id: source.id,
        source: source.name,
        source_authority: source.authority || "watchlist",
        original_title: stripHtml(article?.title || ""),
        original_url: originalUrl,
        article_url: originalUrl,
        original_content: stripHtml(article?.digest || article?.author_name || article?.title || "").slice(0, 2000),
        published_at: publishedAt,
        date: publishedAt.slice(0, 10),
        time: "",
        thumbnail_url: article?.cover || article?.cover_img || article?.pic_cdn_url_235_1 || article?.pic_cdn_url_1_1 || "",
        thumbHue: classified.type === "新品发布" ? 220 : 40,
        ...classified,
        classification: {
          ...(classified.classification || {}),
          fakeid,
          article_aid: article?.aid || "",
          article_author: stripHtml(article?.author_name || ""),
          source_group: source.source_group || source.group || "",
        },
      };
    })
    .filter(Boolean);

  await enrichWechatImages(newsItems);
  const mergedNewsItems = await annotateMergedItems(newsItems);
  const upserted = upsertNews(userId, mergedNewsItems);
  updateNewsSource(userId, source.id, {
    last_fetched_at: new Date().toISOString(),
    last_item_count: items.length,
    last_error: null,
  });
  return { source_id: source.id, source: source.name, fetched: items.length, kept: mergedNewsItems.length, ...upserted };
}

async function enrichWechatImages(newsItems) {
  let remaining = Math.max(0, WECHAT_IMAGE_ENRICH_MAX_PER_SOURCE);
  for (const item of newsItems) {
    if (!shouldRetryImageEnrichment(item) || remaining <= 0) continue;
    remaining -= 1;
    try {
      const page = await fetchPageImage(item.article_url || item.original_url || "");
      if (page.image) {
        item.thumbnail_url = page.image;
        item.classification = {
          ...(item.classification || {}),
          image_enriched: true,
          image_source: "wechat_page_meta",
        };
      } else {
        item.classification = {
          ...(item.classification || {}),
          image_enriched: false,
        };
      }
      await sleep(250);
    } catch (error) {
      item.classification = {
        ...(item.classification || {}),
        image_enriched: false,
        image_error: error.message || "image_fetch_failed",
      };
    }
  }
  return newsItems;
}

async function enrichOfficialImages(source, newsItems) {
  if (!isOfficialManagedSource(source)) return newsItems;
  let remaining = Math.max(0, OFFICIAL_IMAGE_ENRICH_MAX_PER_SOURCE);
  for (const item of newsItems) {
    if (!shouldRetryImageEnrichment(item)) continue;
    const reusableThumbnail = findReusableNewsThumbnail({
      originalUrl: imageLookupUrlForItem(item),
      mergeKey: item.classification?.merge_key || mergeKeyForItem(item),
      titleZh: item.titleZh || item.original_title || "",
      userId: source.user_id || "",
    });
    if (reusableThumbnail) {
      item.thumbnail_url = reusableThumbnail;
      item.classification = {
        ...(item.classification || {}),
        image_enriched: true,
        image_source: "reused_known_thumbnail",
      };
      continue;
    }
    if (remaining <= 0) continue;
    remaining -= 1;
    let lastError = "";
    try {
      const candidateUrls = [
        imageLookupUrlForItem(item),
        String(item.classification?.rss_url || "").trim(),
        String(item.classification?.source_homepage || "").trim(),
      ].filter((url, index, array) => url && /^https?:\/\//i.test(url) && array.indexOf(url) === index);
      for (const imageUrl of candidateUrls) {
        try {
          const page = await fetchPageImage(imageUrl);
          if (page.articleUrl && isGoogleNewsUrl(item.original_url)) {
            item.original_url = normalizeUrlForDedupe(page.articleUrl);
            item.article_url = item.original_url;
          }
          if (page.image) {
            item.thumbnail_url = page.image;
            item.classification = {
              ...(item.classification || {}),
              image_enriched: true,
              image_source: "page_meta",
            };
            break;
          }
        } catch (error) {
          lastError = error.message || "image_fetch_failed";
        }
      }
      if (!item.thumbnail_url || shouldRetryImageEnrichment(item)) {
        item.classification = {
          ...(item.classification || {}),
          image_enriched: false,
          ...(lastError ? { image_error: lastError } : {}),
        };
      }
      await sleep(250);
    } catch (error) {
      item.classification = {
        ...(item.classification || {}),
        image_enriched: false,
        image_error: error.message || "image_fetch_failed",
      };
    }
  }
  return newsItems;
}

export async function collectSource(userId, source) {
  source = injectWechatExporterDefaults(source);
  if (isWechatExporterSource(source)) {
    return collectWechatExporterSource(userId, source);
  }
  const feed = await fetchFeed(source);
  const cutoffMs = Date.now() - RECENT_NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const items = [...(feed.items || [])]
    .sort((a, b) => new Date(publishedAtOf(b)).getTime() - new Date(publishedAtOf(a)).getTime())
    .filter((item) => publishedAtOf(item) && new Date(publishedAtOf(item)).getTime() >= cutoffMs)
    .slice(0, 50);

  const newsItems = [];
  for (const item of items) {
    if (!(item.link || item.guid)) continue;
    const classified = await classifyNews({ source, item });
    if (!classified) continue;
    const publishedAt = publishedAtOf(item);
    const articleUrl = await resolveOriginalArticleUrl(item);
    const fallbackUrl = item.link || item.guid || "";
    newsItems.push({
      source_id: source.id,
      source: source.name,
      source_authority: source.authority || "watchlist",
      original_title: stripHtml(item.title || ""),
      original_url: articleUrl || fallbackUrl,
      article_url: articleUrl || fallbackUrl,
      original_content: stripHtml(item.contentSnippet || item.summary || item.content || "").slice(0, 2000),
      published_at: publishedAt,
      date: publishedAt.slice(0, 10),
      time: "",
      thumbnail_url: extractThumbnail(item),
      thumbHue: classified.type === "新品发布" ? 220 : 40,
      ...classified,
      classification: {
        ...(classified.classification || {}),
        ...(fallbackUrl && articleUrl && articleUrl !== fallbackUrl ? { rss_url: fallbackUrl } : {}),
        ...(extractSourceHomepage(item) ? { source_homepage: extractSourceHomepage(item) } : {}),
        source_group: source.source_group || source.group || "",
      },
    });
  }

  await enrichOfficialImages(source, newsItems);
  const mergedNewsItems = await annotateMergedItems(newsItems);
  const result = upsertNews(userId, mergedNewsItems);
  updateNewsSource(userId, source.id, {
    last_fetched_at: new Date().toISOString(),
    last_item_count: items.length,
    last_error: null,
  });
  return { source_id: source.id, source: source.name, fetched: items.length, kept: mergedNewsItems.length, ...result };
}

export async function collectSources(userId, sources) {
  const active = sources.filter((source) => source.active !== false && source.url);
  const results = [];
  for (const source of active) {
    try {
      results.push(await collectSource(userId, source));
    } catch (error) {
      const message = error.message || "采集失败";
      console.error(`[News Fetch] ${source.name}: ${message}`);
      updateNewsSource(userId, source.id, {
        last_fetched_at: new Date().toISOString(),
        last_item_count: 0,
        last_error: message,
      });
      results.push({ source_id: source.id, source: source.name, error: message, fetched: 0, kept: 0, inserted: [], updated: [] });
    }
    await sleep(1000);
  }
  return {
    results,
    inserted: results.reduce((sum, result) => sum + (result.inserted?.length || 0), 0),
    updated: results.reduce((sum, result) => sum + (result.updated?.length || 0), 0),
    errors: results.filter((result) => result.error),
  };
}

export async function collectDueSources(userId, sources, now = new Date()) {
  const dueSources = sources.filter((source) => shouldCollectSource(source, now));
  return collectSources(userId, dueSources);
}

export async function processNewsWithLlm(userId, limit = 20) {
  const pending = listPendingNewsForLlm(userId, limit);
  let processed = 0;
  let kept = 0;
  let filtered = 0;
  let failed = 0;
  const errors = [];

  for (const item of pending) {
    const content = [
      `来源：${item.source}`,
      `标题：${stripHtml(item.original_title || "").slice(0, 180)}`,
      `摘要：${stripHtml(item.original_content || "").slice(0, NEWS_LLM_INPUT_LIMIT)}`,
    ].join("\n\n");

    try {
      const result = await callLLM({
        userId,
        purpose: "news:process_llm",
        system: NEWS_LLM_SYSTEM_PROMPT,
        user: content,
        maxTokens: NEWS_LLM_MAX_TOKENS,
      });
      if (result?.keep) {
        const llmClassification = {
          reason: "manual_llm",
          ...(result.story_event ? { story_event: String(result.story_event).slice(0, 32) } : {}),
          ...(Number.isFinite(Number(result.dedupe_confidence)) ? { dedupe_confidence: Number(result.dedupe_confidence) } : {}),
        };
        const keyed = withNewsDedupeKeys({
          ...item,
          titleZh: result.title_zh || item.titleZh,
          summary: result.summary_zh || item.summary,
          contentZh: result.content_zh || item.contentZh || "",
          type: mapType(result.type) || "行业趋势",
          classification: {
            ...(item.classification || {}),
            ...llmClassification,
          },
        }, {
          force: true,
          storyKeyHint: Number(result.dedupe_confidence) >= 0.78 ? result.story_key : "",
        });
        updateNews(userId, item.id, {
          type: mapType(result.type) || "行业趋势",
          titleZh: result.title_zh || item.titleZh,
          summary: result.summary_zh || item.summary,
          contentZh: result.content_zh || item.contentZh || "",
          is_kept: 1,
          llm_processed: 1,
          needsTranslation: false,
          classification: keyed.classification,
        });
        kept += 1;
      } else {
        updateNews(userId, item.id, {
          is_kept: 0,
          llm_processed: 1,
          classification: { reason: "manual_llm_filtered" },
        });
        filtered += 1;
      }
      processed += 1;
    } catch (error) {
      failed += 1;
      errors.push({ id: item.id, title: item.original_title || item.titleZh, message: error.message || "LLM 处理失败" });
    }
  }

  return {
    processed,
    kept,
    filtered,
    failed,
    errors: errors.slice(0, 5),
    remaining: listPendingNewsForLlm(userId, 1000).length,
  };
}
