import Parser from "rss-parser";
import { callLLM } from "./ai-service.js";
import { fetchPageImage } from "./content-fetcher.js";
import { listPendingNewsForLlm, updateNews, upsertNews, updateNewsSource } from "./repository.js";

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
  "content_zh": "中文正文，保留原文关键信息，120-300字。"
}`;

const NEWS_LLM_INPUT_LIMIT = 1600;
const NEWS_LLM_MAX_TOKENS = 520;
const FETCH_TIMEOUT_MS = 30000;
const OFFICIAL_IMAGE_ENRICH_MAX_PER_SOURCE = Number(process.env.OFFICIAL_IMAGE_ENRICH_MAX_PER_SOURCE || 12);

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
  return isOfficialManagedSource(source);
}

async function enrichOfficialImages(source, newsItems) {
  if (!isOfficialManagedSource(source)) return newsItems;
  let remaining = Math.max(0, OFFICIAL_IMAGE_ENRICH_MAX_PER_SOURCE);
  for (const item of newsItems) {
    if (item.thumbnail_url || remaining <= 0) continue;
    remaining -= 1;
    try {
      const page = await fetchPageImage(item.original_url);
      if (page.image) {
        item.thumbnail_url = page.image;
        item.classification = {
          ...(item.classification || {}),
          image_enriched: true,
          image_source: "page_meta",
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
  const feed = await fetchFeed(source);
  const items = [...(feed.items || [])]
    .sort((a, b) => new Date(publishedAtOf(b)).getTime() - new Date(publishedAtOf(a)).getTime())
    .slice(0, 50);

  const newsItems = [];
  for (const item of items) {
    const originalUrl = item.link || item.guid || "";
    if (!originalUrl) continue;
    const classified = await classifyNews({ source, item });
    if (!classified) continue;
    const publishedAt = publishedAtOf(item);
    newsItems.push({
      source_id: source.id,
      source: source.name,
      source_authority: source.authority || "watchlist",
      original_title: stripHtml(item.title || ""),
      original_url: originalUrl,
      original_content: stripHtml(item.contentSnippet || item.summary || item.content || "").slice(0, 2000),
      published_at: publishedAt,
      date: publishedAt.slice(0, 10),
      time: "",
      thumbnail_url: extractThumbnail(item),
      thumbHue: classified.type === "新品发布" ? 220 : 40,
      ...classified,
    });
  }

  await enrichOfficialImages(source, newsItems);
  const result = upsertNews(userId, newsItems);
  updateNewsSource(userId, source.id, {
    last_fetched_at: new Date().toISOString(),
    last_item_count: items.length,
    last_error: null,
  });
  return { source_id: source.id, source: source.name, fetched: items.length, kept: newsItems.length, ...result };
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
        system: NEWS_LLM_SYSTEM_PROMPT,
        user: content,
        maxTokens: NEWS_LLM_MAX_TOKENS,
      });
      if (result?.keep) {
        updateNews(userId, item.id, {
          type: mapType(result.type) || "行业趋势",
          titleZh: result.title_zh || item.titleZh,
          summary: result.summary_zh || item.summary,
          contentZh: result.content_zh || item.contentZh || "",
          is_kept: 1,
          llm_processed: 1,
          needsTranslation: false,
          classification: { reason: "manual_llm" },
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
