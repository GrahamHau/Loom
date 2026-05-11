import { AppError } from "./ai-service.js";
import { rawState } from "./repository.js";

function settings() {
  return rawState().settings || {};
}

function configuredSettings() {
  const s = settings();
  if (!s.search_enabled) return null;
  if (!s.search_provider || !s.search_api_key) {
    throw new AppError(400, "search_not_configured", "Search Service 未配置完整，请填写 Provider 和 API Key。");
  }
  return s;
}

function trimText(value, limit = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizeResults(items, limit = 5) {
  return (items || [])
    .filter(Boolean)
    .map((item) => ({
      title: trimText(item.title || item.name || ""),
      url: item.url || item.link || "",
      snippet: trimText(item.snippet || item.content || item.body || item.description || ""),
      source: trimText(item.source || item.domain || item.site || ""),
    }))
    .filter((item) => item.title || item.snippet || item.url)
    .slice(0, limit);
}

async function searchTavily(query, s, limit) {
  const endpoint = String(s.search_api_url || "https://api.tavily.com/search").replace(/\/+$/, "");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${s.search_api_key}`,
    },
    body: JSON.stringify({
      query,
      max_results: limit,
      search_depth: s.search_model || "basic",
      include_answer: false,
      include_images: false,
      include_raw_content: false,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError(response.status, "search_request_failed", "Tavily 请求失败。", body);
  }
  return normalizeResults(body.results, limit);
}

async function searchSerpApi(query, s, limit) {
  const endpoint = String(s.search_api_url || "https://serpapi.com/search.json").replace(/\/+$/, "");
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", s.search_api_key);
  url.searchParams.set("engine", s.search_model || "google");
  url.searchParams.set("num", String(limit));
  url.searchParams.set("hl", "en");
  const response = await fetch(url.toString());
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError(response.status, "search_request_failed", "SerpApi 请求失败。", body);
  }
  return normalizeResults(body.organic_results, limit);
}

export async function searchWeb(query, { limit = 5 } = {}) {
  const s = configuredSettings();
  if (!s) return [];
  if (!query) return [];
  if (s.search_provider === "serpapi") {
    return searchSerpApi(query, s, limit);
  }
  return searchTavily(query, s, limit);
}

export async function buildSearchContext(query, { limit = 4 } = {}) {
  try {
    const results = await searchWeb(query, { limit });
    if (!results.length) return "";
    return results.map((item, index) => (
      `${index + 1}. ${item.title}\nURL: ${item.url}\n摘要: ${item.snippet}`
    )).join("\n\n");
  } catch (error) {
    return `搜索上下文不可用：${error.message}`;
  }
}
