import { AppError, callLLM, isLLMConfigured } from "./ai-service.js";
import { readJson, writeJson } from "./db.js";
import { visibleNewsItems } from "./repository.js";

const MAX_DIGEST_ITEMS = 24;
const DIGEST_INPUT_LIMIT = 1800;

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function clampText(value, limit = 240) {
  return cleanText(value).replace(/\s+/g, " ").slice(0, limit);
}

function sourceDate(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sourceText(item = {}) {
  return [
    item.titleZh || item.original_title,
    item.summary,
    item.contentZh,
    item.original_content,
  ].filter(Boolean).join("\n");
}

function localDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.LOCALE_TIMEZONE || process.env.TZ || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function digestCacheKey(userId, dateKey, limit) {
  return `news_daily_digest:${userId}:${dateKey}:${limit}`;
}

function digestNewsItems(userId, limit = MAX_DIGEST_ITEMS) {
  return visibleNewsItems(userId)
    .filter((item) => item?.type)
    .sort((a, b) => sourceDate(b.published_at || b.created_at) - sourceDate(a.published_at || a.created_at))
    .slice(0, limit)
    .map((item, index) => ({
      index: index + 1,
      id: item.id,
      title: clampText(item.titleZh || item.original_title, 120),
      source: clampText(item.source || "未知来源", 80),
      type: clampText(item.type || "行业趋势", 24),
      summary: clampText(item.summary || item.contentZh || item.original_content, 220),
      published_at: item.published_at || item.created_at || "",
      text: clampText(sourceText(item), 360),
    }));
}

function normalizeKind(value) {
  const raw = cleanText(value, "unknown_signal").toLowerCase();
  if (["launch", "trend", "funding", "policy", "unknown_signal"].includes(raw)) return raw;
  if (/新品|发布|launch|product/.test(raw)) return "launch";
  if (/趋势|trend|market/.test(raw)) return "trend";
  if (/融资|funding|finance/.test(raw)) return "funding";
  if (/政策|policy|regulation/.test(raw)) return "policy";
  return "unknown_signal";
}

function normalizeInsight(input = {}, index = 0) {
  const sourceIndexes = Array.isArray(input.source_indexes)
    ? input.source_indexes.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
    : [];
  return {
    id: cleanText(input.id, `digest-${index + 1}`),
    kind: normalizeKind(input.kind),
    headline: clampText(input.headline, 80),
    connection: clampText(input.connection, 120),
    sourceCount: Math.max(1, Number(input.source_count || sourceIndexes.length || 1)),
    sourceIndexes: sourceIndexes.slice(0, 5),
  };
}

function fallbackDigest(items) {
  const insights = items.slice(0, 3).map((item, index) => normalizeInsight({
    id: `fallback-${item.id || index}`,
    kind: item.type === "新品发布" ? "launch" : "trend",
    headline: item.title,
    connection: item.summary ? `来源摘要：${item.summary}` : "",
    source_count: 1,
    source_indexes: [item.index],
  }, index));
  return {
    mode: "fallback",
    generated_at: new Date().toISOString(),
    item_count: items.length,
    summary: items.length ? "LLM 暂不可用，先按最新信息流生成基础摘要。" : "今天还没有可用于总结的信息流。",
    insights,
  };
}

export async function generateDailyNewsDigest(userId, { limit = MAX_DIGEST_ITEMS, force = false } = {}) {
  if (!isLLMConfigured(userId)) {
    throw new AppError(400, "llm_not_configured", "配置 LLM 后才能生成今日总结。");
  }
  const normalizedLimit = Math.min(MAX_DIGEST_ITEMS, Math.max(3, Number(limit || MAX_DIGEST_ITEMS)));
  const dateKey = localDateKey();
  const cacheKey = digestCacheKey(userId, dateKey, normalizedLimit);
  if (!force) {
    const cached = readJson(cacheKey, null);
    if (cached?.digest) {
      return {
        ...cached.digest,
        cached: true,
        cache_date: cached.date || dateKey,
      };
    }
  }

  const items = digestNewsItems(userId, normalizedLimit);
  if (!items.length) {
    const empty = {
      mode: "empty",
      generated_at: new Date().toISOString(),
      item_count: 0,
      summary: "今天还没有可用于总结的信息流。",
      insights: [],
      cached: false,
      cache_date: dateKey,
    };
    writeJson(cacheKey, { date: dateKey, user_id: userId, limit: normalizedLimit, digest: empty });
    return empty;
  }

  const input = items.map((item) => [
    `#${item.index}`,
    `标题：${item.title}`,
    `来源：${item.source}`,
    `类型：${item.type}`,
    item.summary ? `摘要：${item.summary}` : "",
    item.text ? `正文线索：${item.text}` : "",
    item.published_at ? `时间：${item.published_at}` : "",
  ].filter(Boolean).join("\n")).join("\n\n").slice(0, DIGEST_INPUT_LIMIT * 4);

  try {
    const result = await callLLM({
      userId,
      purpose: force ? "news:daily_digest:refresh" : "news:daily_digest",
      system: [
        "你是 LOOM 的产品情报分析助手，服务摄影/影像配件产品经理。",
        "你要基于真实信息流生成今日总结，只能使用用户提供的新闻条目，不要编造来源。",
        "请优先判断：新品动态、行业趋势、融资/政策、陌生但值得追踪的信号。",
        "只返回 JSON。",
      ].join("\n"),
      user: [
        "请分析下面的信息流，返回 JSON：",
        "{",
        '  "summary": "一句话概括今天最值得看的变化",',
        '  "insights": [',
        '    {"kind":"launch|trend|funding|policy|unknown_signal","headline":"不超过36字的判断","connection":"为什么值得产品经理关注，不超过60字","source_count":1,"source_indexes":[1]}',
        "  ]",
        "}",
        "要求：insights 最多 4 条；source_indexes 必须引用上方编号；没有足够依据就少写。",
        "",
        input,
      ].join("\n"),
      maxTokens: 700,
      temperature: 0.2,
    });
    const insights = (Array.isArray(result?.insights) ? result.insights : [])
      .map((item, index) => normalizeInsight(item, index))
      .filter((item) => item.headline)
      .slice(0, 4);
    if (!insights.length) {
      const digest = {
        ...fallbackDigest(items),
        cached: false,
        cache_date: dateKey,
      };
      writeJson(cacheKey, { date: dateKey, user_id: userId, limit: normalizedLimit, digest });
      return digest;
    }
    const digest = {
      mode: "ai",
      generated_at: new Date().toISOString(),
      item_count: items.length,
      summary: clampText(result.summary, 120),
      insights,
      cached: false,
      cache_date: dateKey,
    };
    writeJson(cacheKey, { date: dateKey, user_id: userId, limit: normalizedLimit, digest });
    return digest;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "daily_digest_failed", "今日总结生成失败。", { message: error.message });
  }
}
