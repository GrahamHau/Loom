import Parser from "rss-parser";
import { callLLM } from "./ai-service.js";
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

function heuristicClassifyNews({ item }) {
  const text = cleanText([
    item.title,
    item.contentSnippet,
    item.content,
    item.summary,
  ].filter(Boolean).join(" "));
  if (!text) return null;

  const productPattern = /\b(announce[sd]?|announcing|launch(?:ed|es|ing)?|release[sd]?|releasing|introduce[sd]?|introducing|unveil(?:ed|s|ing)?|debut(?:ed|s|ing)?|new|preorder|pre-order|available now)\b|新品|发布|推出|上新|发售|正式亮相|正式发布|登场/i;
  const trendPattern = /\b(trend|market|report|survey|forecast|analysis|rumor|leak|hands-on|review)\b|趋势|报告|预测|分析|评测|传闻|曝光/i;

  if (productPattern.test(text)) {
    return {
      type: "新品发布",
      titleZh: item.title || "未命名新品",
      summary: cleanText(item.contentSnippet || item.summary || item.content).slice(0, 180),
    };
  }

  if (trendPattern.test(text)) {
    return {
      type: "行业趋势",
      titleZh: item.title || "未命名资讯",
      summary: cleanText(item.contentSnippet || item.summary || item.content).slice(0, 180),
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
如果保留，返回 {"keep":true,"type":"新品发布或行业趋势","title_zh":"中文标题","summary_zh":"80字以内中文摘要"}。

来源：${source.name}
标题：${item.title}
链接：${item.link}
内容：${content}`,
    });
    if (!result.keep) return null;
    return {
      type: ["新品发布", "行业趋势"].includes(result.type) ? result.type : "行业趋势",
      titleZh: result.title_zh || item.title || "未命名资讯",
      summary: result.summary_zh || item.contentSnippet || "",
    };
  } catch {
    return heuristicClassifyNews({ source, item });
  }
}

export async function collectSource(source) {
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
