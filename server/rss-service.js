import Parser from "rss-parser";
import { callLLM } from "./ai-service.js";
import { cleanHtml, fetchPageContent, fetchPageHtml } from "./content-fetcher.js";
import { upsertNews, updateNewsSource } from "./repository.js";

const parser = new Parser({
  timeout: 20000,
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

const IMAGE_FETCH_TIMEOUT_MS = 8000;

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function firstHtmlImage(html) {
  const metaTags = String(html || "").match(/<meta\s+[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const isImageMeta = /\b(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["']/i.test(tag);
    if (!isImageMeta) continue;
    const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
    if (content) return decodeHtml(content.trim());
  }

  const img = String(html || "").match(/<img[^>]+\bsrc=["']([^"']+)["']/i)?.[1];
  return img ? decodeHtml(img.trim()) : "";
}

function normalizeImageUrl(image, baseUrl) {
  if (!image) return "";
  try {
    return new URL(image, baseUrl).toString();
  } catch {
    return image;
  }
}

function pickImage(item) {
  const baseUrl = item.link || item.guid || "";
  const image = item.enclosure?.url ||
    item.mediaThumbnail?.$?.url ||
    item.mediaContent?.$?.url ||
    firstHtmlImage(item.content || item.summary || "") ||
    "";
  return normalizeImageUrl(image, baseUrl);
}

function absoluteUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url || "";
  }
}

function parsePageLinks({ html, baseUrl, includePatterns = [], excludePatterns = [] }) {
  const seen = new Set();
  const links = [];
  for (const match of String(html || "").matchAll(/href=["']([^"'#]+)["']/gi)) {
    const raw = match[1];
    const url = absoluteUrl(raw, baseUrl);
    if (!/^https?:/i.test(url)) continue;
    if (excludePatterns.some((pattern) => pattern.test(url))) continue;
    if (includePatterns.length && !includePatterns.some((pattern) => pattern.test(url))) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    links.push(url);
  }
  return links;
}

async function fetchArticleImage(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 PM-Copilot/0.1 (+https://github.com/GrahamHau/PM-Copilot)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) return "";
    const html = await response.text();
    return normalizeImageUrl(firstHtmlImage(html), response.url || parsed.toString());
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveImage(item) {
  const feedImage = pickImage(item);
  if (feedImage) return feedImage;
  return fetchArticleImage(item.link || item.guid || "");
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function cleanText(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sourceAuthority(source) {
  if (source.authority) return source.authority;
  const name = String(source.name || "").toLowerCase();
  if (source.official === true || /newsroom|official|neewer news|apple newsroom/.test(name)) return "official";
  if (/google news/.test(name)) return "aggregator";
  return "watchlist";
}

function extractSignals({ source, item }) {
  const title = cleanText(item.title);
  const text = cleanText([
    item.title,
    item.contentSnippet,
    item.content,
    item.summary,
  ].filter(Boolean).join(" "));
  const authority = sourceAuthority(source);
  const lower = `${title}\n${text}`.toLowerCase();
  const strongLaunchPattern = /\b(launch(?:ed|es|ing)?|announce[sd]?|announcing|release[sd]?|releasing|introduce[sd]?|introducing|unveil(?:ed|s|ing)?|debut(?:ed|s|ing)?|preorder|pre-order|available now|正式发布|正式推出|新品发布|发售|上市)\b/i;
  const weakLaunchPattern = /\b(new|coming soon|on the way|adds?|update[sd]?|now live)\b|新品|推出|上新|亮相|登场/i;
  const trendPattern = /\b(trend|market|report|survey|forecast|analysis|rumor|leak|hands-on|review|opinion|guide|how to)\b|趋势|报告|预测|分析|评测|传闻|曝光|指南|观点/i;
  const nonProductPattern = /\b(giveaway|archive|archives|exhibition|gallery|photographing|photographer|lawsuit|war|award|awards|firmware|software update|collection|pride collection|design is basically locked|could be|expected|teaser|rumor|rumour|leak)\b|摄影师|影展|档案|奖项|诉讼|固件|软件更新|系列配色|预热|传闻|曝光/i;
  const productNounPattern = /\b(camera|lens|drone|gimbal|light|monolight|fixture|fixtures|filter|tripod|rig|cage|mount|microphone|monitor|stabilizer|battery|charger|accessory|accessories|iphone\s+\d|ipad|macbook|lumix|alpha|eos|z mount|x mount|gfx)\b|相机|镜头|无人机|云台|补光灯|灯具|滤镜|三脚架|兔笼|支架|麦克风|监视器|稳定器|电池|充电器|配件/i;
  const officialTargetPattern = /\b(camera|lens|drone|gimbal|light|monolight|fixture|filter|tripod|rig|cage|mount|microphone|monitor|stabilizer|battery|charger|accessory|accessories|iphone\s+\d|ipad|macbook|lumix|alpha|eos|z mount|x mount|gfx)\b|相机|镜头|无人机|云台|补光灯|灯具|滤镜|三脚架|兔笼|支架|麦克风|监视器|稳定器|电池|充电器|配件/i;

  return {
    authority,
    hasStrongLaunch: strongLaunchPattern.test(lower),
    hasWeakLaunch: weakLaunchPattern.test(lower),
    hasTrend: trendPattern.test(lower),
    hasNonProduct: nonProductPattern.test(lower),
    hasProductNoun: productNounPattern.test(lower),
    hasOfficialTarget: officialTargetPattern.test(lower),
    text,
  };
}

export function heuristicClassifyNews({ source, item }) {
  const signals = extractSignals({ source, item });
  if (!signals?.text) return null;

  const isOfficialLaunch = signals.authority === "official" && signals.hasStrongLaunch && signals.hasProductNoun && signals.hasOfficialTarget && !signals.hasNonProduct;
  const isAggregatorLaunch = signals.authority === "aggregator" && signals.hasStrongLaunch && signals.hasProductNoun && !signals.hasNonProduct;

  if (isOfficialLaunch || isAggregatorLaunch) {
    return {
      type: "新品发布",
      titleZh: item.title || "未命名新品",
      summary: cleanText(item.contentSnippet || item.summary || item.content).slice(0, 180),
      contentZh: "",
      needsTranslation: true,
      classification: {
        authority: signals.authority,
        reason: isOfficialLaunch ? "official_strong_launch" : "aggregator_strong_launch",
      },
    };
  }

  if (signals.hasTrend || signals.hasWeakLaunch || signals.hasStrongLaunch) {
    return {
      type: "行业趋势",
      titleZh: item.title || "未命名资讯",
      summary: cleanText(item.contentSnippet || item.summary || item.content).slice(0, 180),
      contentZh: "",
      needsTranslation: true,
      classification: {
        authority: signals.authority,
        reason: signals.hasNonProduct ? "non_product_or_broad_news" : "watchlist_or_weak_launch",
      },
    };
  }

  return null;
}

async function classifyNews({ source, item }) {
  const content = [
    item.title,
    item.contentSnippet,
    item.content,
    item.summary,
  ].filter(Boolean).join("\n\n").slice(0, 5000);

  try {
    const result = await callLLM({
      system: "你是一个产品经理的信息筛选助手。只返回 JSON。",
      user: `判断以下 RSS 内容是否属于新品发布或行业趋势。无关内容返回 {"keep":false}。
分类规则：
1. "新品发布"优先来自官方源，且必须是具体硬件/配件/相机/镜头/无人机/补光灯/支架等产品的正式发布、上市、发售、预售。
2. 传闻、评测、摄影作品、展览、奖项、档案、教程、观点、促销、抽奖、固件/软件更新不要归为新品发布；如果对产品经理有参考价值，可归为"行业趋势"。
3. 非官方聚合源只有在标题和正文都明确是具体产品 launch/announce/release/unveil 时才可归为"新品发布"。

如果保留，返回 {"keep":true,"type":"新品发布或行业趋势","title_zh":"中文标题","summary_zh":"80字以内中文摘要","content_zh":"300字以内中文正文摘译","reason":"分类原因"}。

来源：${source.name}
来源权威度：${sourceAuthority(source)}
标题：${item.title}
链接：${item.link}
内容：${content}`,
    });
    if (!result.keep) return null;
    return {
      type: ["新品发布", "行业趋势"].includes(result.type) ? result.type : "行业趋势",
      titleZh: result.title_zh || item.title || "未命名资讯",
      summary: result.summary_zh || item.contentSnippet || "",
      contentZh: result.content_zh || result.summary_zh || "",
      needsTranslation: false,
      classification: {
        authority: sourceAuthority(source),
        reason: result.reason || "llm",
      },
    };
  } catch {
    return heuristicClassifyNews({ source, item });
  }
}

function pageSourcePatterns(source) {
  const id = String(source.id || "");
  if (id === "page-dji-media-center") {
    return {
      include: [/\/media-center\/announcements\//i],
      exclude: [/\/media-center\/media-coverage/i],
    };
  }
  if (id === "page-insta360-blog-news") {
    return {
      include: [/\/blog\/news\//i, /\/blog\/.*launch/i, /\/blog\/.*new-/i],
      exclude: [/\/category\//i],
    };
  }
  if (id === "page-smallrig-blog") {
    return {
      include: [/smallrig\.com\/.*\/blog\/[^/?#]+$/i],
      exclude: [/\/global\/blog$/i, /\/category\//i],
    };
  }
  return {
    include: [],
    exclude: [],
  };
}

async function collectPageSource(source) {
  const landing = await fetchPageHtml(source.url);
  const patterns = pageSourcePatterns(source);
  const links = parsePageLinks({
    html: landing.html,
    baseUrl: source.url,
    includePatterns: patterns.include,
    excludePatterns: patterns.exclude,
  }).slice(0, 12);

  const newsItems = [];
  for (const link of links) {
    try {
      const page = await fetchPageContent(link);
      const item = {
        title: page.title,
        link: page.url,
        contentSnippet: page.description,
        content: cleanHtml(page.content).slice(0, 2000),
        summary: page.description,
      };
      const classified = await classifyNews({ source, item });
      if (!classified) continue;
      newsItems.push({
        source_id: source.id,
        source: source.name,
        source_authority: sourceAuthority(source),
        original_title: page.title || "",
        original_url: page.url,
        original_content: cleanHtml(page.content).slice(0, 2000),
        published_at: new Date().toISOString(),
        date: formatDate(new Date().toISOString()),
        time: "",
        thumbnail_url: page.image || "",
        thumbHue: classified.type === "新品发布" ? 220 : 40,
        ...classified,
      });
    } catch {
      // skip individual page failures; source-level error is handled above
    }
  }

  const result = upsertNews(newsItems);
  updateNewsSource(source.id, { last_fetched_at: new Date().toISOString(), last_error: null, active: true });
  return { source_id: source.id, source: source.name, fetched: links.length, kept: newsItems.length, ...result };
}

export async function collectSource(source) {
  if (source.type === "page") {
    return collectPageSource(source);
  }
  const feed = await parser.parseURL(source.url);
  const newsItems = [];
  for (const item of (feed.items || []).slice(0, 20)) {
    const classified = await classifyNews({ source, item });
    if (!classified) continue;
    const published = item.isoDate || item.pubDate || new Date().toISOString();
    const thumbnail_url = await resolveImage(item);
    newsItems.push({
      source_id: source.id,
      source: source.name,
      source_authority: sourceAuthority(source),
      original_title: item.title || "",
      original_url: item.link || item.guid || "",
      original_content: String(item.contentSnippet || item.content || "").slice(0, 2000),
      published_at: published,
      date: formatDate(published),
      time: "",
      thumbnail_url,
      thumbHue: classified.type === "新品发布" ? 220 : 40,
      ...classified,
    });
  }
  const result = upsertNews(newsItems);
  updateNewsSource(source.id, { last_fetched_at: new Date().toISOString(), last_error: null });
  return { source_id: source.id, source: source.name, fetched: feed.items?.length || 0, kept: newsItems.length, ...result };
}

export async function collectSources(sources) {
  const active = sources.filter((source) => source.active !== false && source.url);
  const results = [];
  for (const source of active) {
    try {
      results.push(await collectSource(source));
    } catch (error) {
      updateNewsSource(source.id, { last_error: error.message || "采集失败" });
      results.push({ source_id: source.id, source: source.name, error: error.message || "采集失败", fetched: 0, kept: 0, inserted: [], updated: [] });
    }
  }
  return {
    results,
    inserted: results.reduce((sum, result) => sum + (result.inserted?.length || 0), 0),
    updated: results.reduce((sum, result) => sum + (result.updated?.length || 0), 0),
    errors: results.filter((result) => result.error),
  };
}
