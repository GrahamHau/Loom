import { nanoid } from "nanoid";
import { getState, saveState } from "./db.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function bootstrap() {
  const state = clone(getState());
  if (state.settings) {
    state.settings = maskSettings(state.settings);
  }
  return state;
}

export function rawState() {
  return clone(getState());
}

function nowIso() {
  return new Date().toISOString();
}

export function mutate(mutator) {
  const state = rawState();
  const result = mutator(state);
  saveState(state);
  return result;
}

export function maskSettings(settings) {
  const masked = { ...settings };
  if (masked.llm_api_key) masked.llm_api_key = "********";
  if (masked.feishu_app_secret) masked.feishu_app_secret = "********";
  return masked;
}

export function createProduct(input) {
  return mutate((state) => {
    const product = {
      id: input.id || nanoid(10),
      emoji: input.emoji || "📦",
      name: input.name || "未命名竞品",
      category: input.category || "未分类",
      tags: input.tags || [],
      status: input.status || "新录入",
      ai_summary: input.ai_summary || "",
      selling_points: input.selling_points || [],
      negative_keywords: input.negative_keywords || [],
      synced_at: null,
      feishu_record_id: null,
      created_at: input.created_at || nowIso(),
      updated_at: input.updated_at || nowIso(),
      platforms: input.platforms || [],
      ...input,
    };
    state.products.unshift(product);
    return product;
  });
}

export function updateProduct(id, patch) {
  return mutate((state) => {
    const item = state.products.find((product) => product.id === id);
    if (!item) return null;
    Object.assign(item, patch, { updated_at: nowIso() });
    return item;
  });
}

export function deleteProduct(id) {
  return mutate((state) => {
    const before = state.products.length;
    state.products = state.products.filter((product) => product.id !== id);
    return before !== state.products.length;
  });
}

export function createDemand(input) {
  return mutate((state) => {
    const demand = {
      id: input.id || nanoid(10),
      title: input.title || "未命名需求",
      thumbHue: input.thumbHue ?? 200,
      summary: input.summary || "",
      source: input.source || "manual",
      date: input.date || new Date().toISOString().slice(0, 10),
      innovation: input.innovation || "待分类",
      scenarios: input.scenarios || [],
      painpoints: input.painpoints || [],
      synced_at: null,
      feishu_record_id: null,
      created_at: input.created_at || nowIso(),
      updated_at: input.updated_at || nowIso(),
      ...input,
    };
    state.demands.unshift(demand);
    return demand;
  });
}

export function updateDemand(id, patch) {
  return mutate((state) => {
    const item = state.demands.find((demand) => demand.id === id);
    if (!item) return null;
    Object.assign(item, patch, { updated_at: nowIso() });
    return item;
  });
}

export function deleteDemand(id) {
  return mutate((state) => {
    const before = state.demands.length;
    state.demands = state.demands.filter((demand) => demand.id !== id);
    return before !== state.demands.length;
  });
}

export function listNews() {
  return rawState().news;
}

export function updateNews(id, patch) {
  return mutate((state) => {
    const item = state.news.find((news) => news.id === id);
    if (!item) return null;
    Object.assign(item, patch, { updated_at: nowIso() });
    return item;
  });
}

export function deleteNews(id) {
  return mutate((state) => {
    const before = state.news.length;
    state.news = state.news.filter((news) => news.id !== id);
    return before !== state.news.length;
  });
}

function newsDedupeKey(news) {
  if (news.source_id && news.original_url) return `${news.source_id}::${news.original_url}`;
  return `${news.source_id || news.source || "unknown"}::${news.original_title || news.titleZh || ""}::${news.published_at || news.date || ""}`;
}

function googleNewsTitleKey(news) {
  const source = String(news.source || "");
  const originalUrl = String(news.original_url || "");
  if (!source.includes("Google News") && !originalUrl.includes("news.google.")) return "";
  const title = String(news.original_title || news.titleZh || "").replace(/\s+/g, " ").trim().toLowerCase();
  return title ? `${news.source_id || source || "unknown"}::title::${title}` : "";
}

export function upsertNews(items) {
  return mutate((state) => {
    const existing = new Map((state.news || []).map((item) => [newsDedupeKey(item), item]));
    const googleTitleIndex = new Map();
    for (const item of state.news || []) {
      const titleKey = googleNewsTitleKey(item);
      if (titleKey && !googleTitleIndex.has(titleKey)) googleTitleIndex.set(titleKey, item);
    }
    const inserted = [];
    const updated = [];
    for (const input of items) {
      const key = newsDedupeKey(input);
      const titleKey = googleNewsTitleKey(input);
      const current = existing.get(key) || (titleKey ? googleTitleIndex.get(titleKey) : null);
      if (current) {
        Object.assign(current, input, {
          id: current.id,
          starred: current.starred ?? false,
          unread: current.unread ?? true,
          updated_at: nowIso(),
        });
        updated.push(current);
      } else {
        const item = {
          id: input.id || nanoid(10),
          starred: false,
          unread: true,
          created_at: nowIso(),
          updated_at: nowIso(),
          synced_at: null,
          feishu_record_id: null,
          ...input,
        };
        state.news.unshift(item);
        existing.set(key, item);
        if (titleKey) googleTitleIndex.set(titleKey, item);
        inserted.push(item);
      }
    }
    const seen = new Set();
    state.news = (state.news || []).filter((item) => {
      const key = googleNewsTitleKey(item) || newsDedupeKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    state.news.sort((a, b) => String(b.published_at || b.date || "").localeCompare(String(a.published_at || a.date || "")));
    return { inserted, updated };
  });
}

export function listNewsSources() {
  return rawState().rssSources || [];
}

export function createNewsSource(input) {
  return mutate((state) => {
    state.rssSources ||= [];
    const source = {
      id: input.id || nanoid(10),
      name: input.name || "未命名数据源",
      url: input.url || "",
      type: input.type || "rss",
      interval: Number(input.interval || input.fetch_interval || 60),
      active: input.active ?? input.is_active ?? true,
      last_fetched_at: input.last_fetched_at || null,
      last_error: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    state.rssSources.unshift(source);
    return source;
  });
}

export function updateNewsSource(id, patch) {
  return mutate((state) => {
    const item = (state.rssSources || []).find((source) => source.id === id);
    if (!item) return null;
    Object.assign(item, patch, { updated_at: nowIso() });
    if (patch.fetch_interval && !patch.interval) item.interval = Number(patch.fetch_interval);
    if (patch.is_active !== undefined && patch.active === undefined) item.active = Boolean(patch.is_active);
    return item;
  });
}

export function deleteNewsSource(id) {
  return mutate((state) => {
    const before = (state.rssSources || []).length;
    state.rssSources = (state.rssSources || []).filter((source) => source.id !== id);
    return before !== state.rssSources.length;
  });
}

export function createResearch(input) {
  return mutate((state) => {
    state.research ||= [];
    const research = {
      id: input.id || nanoid(10),
      title: input.title || "未命名调研项目",
      desc: input.desc || input.description || "",
      status: input.status || "草稿",
      date: input.date || new Date().toISOString().slice(0, 10),
      products: input.products || input.matched_products || [],
      demands: input.demands || input.matched_demands || [],
      analysis: input.analysis || null,
      created_at: nowIso(),
      updated_at: nowIso(),
      ...input,
    };
    state.research.unshift(research);
    return research;
  });
}

export function updateResearch(id, patch) {
  return mutate((state) => {
    const item = (state.research || []).find((research) => research.id === id);
    if (!item) return null;
    Object.assign(item, patch, { updated_at: nowIso() });
    if (patch.description && !patch.desc) item.desc = patch.description;
    if (patch.matched_products && !patch.products) item.products = patch.matched_products;
    if (patch.matched_demands && !patch.demands) item.demands = patch.matched_demands;
    return item;
  });
}

export function deleteResearch(id) {
  return mutate((state) => {
    const before = (state.research || []).length;
    state.research = (state.research || []).filter((research) => research.id !== id);
    return before !== state.research.length;
  });
}

export function markSynced(kind, records) {
  return mutate((state) => {
    const list = state[kind] || [];
    const syncedAt = nowIso();
    for (const record of records) {
      const item = list.find((entry) => entry.id === record.local_id);
      if (item) {
        item.synced_at = syncedAt;
        if (record.record_id) item.feishu_record_id = record.record_id;
      }
    }
    return { synced_at: syncedAt, count: records.length };
  });
}

export function updateSettings(patch) {
  return mutate((state) => {
    const next = { ...patch };
    for (const key of ["llm_api_key", "feishu_app_secret"]) {
      if (next[key] === "********" || next[key] === "") delete next[key];
    }
    state.settings = { ...(state.settings || {}), ...next };
    return maskSettings(state.settings);
  });
}
