import { nanoid } from "nanoid";
import {
  acquireLock,
  db,
  ensureSampleUserState,
  ensureUserState,
  getLegacyUserId,
  getUserState,
  getUserIdByApiToken,
  releaseLock,
  revokeApiToken,
  revokeUserApiTokens,
  upsertApiToken,
  saveUserState,
} from "./db.js";
import { normalizeTagGroups } from "./tag-config.js";
import { buildEmptyState } from "./seed.js";
import { DEFAULT_NEWS_SOURCES, isRecentSampleNews, isSampleWorkspace, sampleSourceId, SAMPLE_NEWS_MAX_AGE_HOURS, SAMPLE_NEWS_SOURCES } from "./sample-workspace.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function userSummaryFromState(state, fallback = {}) {
  const source = state?.user || {};
  return {
    id: fallback.id || source.id || "",
    name: fallback.name || source.name || "LOOM",
    role: fallback.role || source.role || "成员",
    initials: fallback.initials || source.initials || "L",
    email: fallback.email || source.email || "",
    auth_provider: fallback.auth_provider || source.auth_provider || "password",
  };
}

function newsCountsFrom(items) {
  const typed = items.filter((item) => item.type);
  return {
    all: typed.length,
    new_product: typed.filter((item) => item.type === "新品发布").length,
    trend: typed.filter((item) => item.type === "行业趋势").length,
    starred: typed.filter((item) => item.starred).length,
  };
}

function onboardingMeta(state, news = []) {
  if (!isSampleWorkspace(state)) return state.onboarding || {};
  const userId = state?.user?.id || "";
  const sampleNews = news.filter((item) => isRecentSampleNews(item));
  const latestFetchedAt = (state.rssSources || [])
    .map((source) => source.last_fetched_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const latestNewsAt = sampleNews
    .map((item) => item.published_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  return {
    ...(state.onboarding || {}),
    sampleWorkspace: true,
    liveNews: true,
    visitorOnly: userId === getLegacyUserId(),
    canExitSample: userId !== getLegacyUserId(),
    newsMaxAgeHours: SAMPLE_NEWS_MAX_AGE_HOURS,
    latestFetchedAt,
    latestNewsAt,
    liveNewsReady: sampleNews.length > 0,
  };
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email || "",
    name: row.name,
    initials: row.initials || "L",
    role: row.role || "成员",
    status: row.status || "active",
    auth_provider: row.auth_provider || "password",
    feishu_open_id: row.feishu_open_id || null,
    feishu_union_id: row.feishu_union_id || null,
    feishu_tenant_key: row.feishu_tenant_key || null,
    avatar_url: row.avatar_url || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at || null,
  };
}

function requireState(userId) {
  const state = getUserState(userId);
  if (state) return clone(state);
  const user = findUserById(userId);
  if (!user) return null;
  return clone(ensureUserState(user));
}

function saveStateForUser(userId, state) {
  saveUserState(userId, state);
}

function mutateUserState(userId, mutator) {
  const current = requireState(userId) || buildEmptyState({ id: userId });
  const result = mutator(current);
  saveStateForUser(userId, current);
  return result;
}

function mapNewsRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    source_id: row.source_id,
    source: row.source_name,
    source_authority: row.source_authority,
    original_title: row.original_title,
    original_url: row.original_url,
    original_content: row.original_content || row.original_summary || "",
    published_at: row.published_at,
    date: String(row.published_at || "").slice(0, 10),
    time: "",
    thumbnail_url: row.thumbnail_url || "",
    thumbHue: row.thumb_hue ?? 40,
    type: row.type,
    titleZh: row.title_zh || row.original_title,
    summary: row.summary_zh || row.original_summary || "",
    contentZh: row.content_zh || "",
    needsTranslation: Boolean(row.needs_translation),
    classification: row.classification_json ? JSON.parse(row.classification_json) : null,
    starred: Boolean(row.is_starred),
    unread: !row.is_read,
    synced_at: row.synced_at,
    feishu_record_id: row.feishu_record_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapNewsSourceRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    url: row.url,
    type: row.type,
    language: row.language || "",
    authority: row.authority || "watchlist",
    group: row.group_name || "custom",
    source_group: row.source_group || row.group_name || "custom",
    brand: row.brand || "",
    interval: row.fetch_interval,
    fetch_interval: row.fetch_interval,
    active: Boolean(row.is_active),
    is_active: Boolean(row.is_active),
    last_fetched_at: row.last_fetched_at,
    last_item_count: Number(row.last_item_count || 0),
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function clampFetchInterval(value) {
  const interval = Number(value || 60);
  return Math.min(1440, Math.max(30, Number.isFinite(interval) ? interval : 60));
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text || text === "null" || text === "undefined") return fallback;
  return text;
}

function cleanTitle(value, fallback) {
  return cleanText(value, fallback).slice(0, 120);
}

function cleanSummary(value, fallback = "") {
  return cleanText(value, fallback).slice(0, 800);
}

function cleanArray(value, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item)).filter(Boolean).slice(0, limit);
}

function cleanVisibleComments(value, limit = 80) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object") return null;
    const content = cleanText(item.content).slice(0, 600);
    if (!content) return null;
    return {
      id: cleanText(item.id).slice(0, 120),
      user_id: cleanText(item.user_id).slice(0, 120),
      user_name: cleanText(item.user_name || item.username || item.author).slice(0, 120),
      content,
      like_count: Number(item.like_count || item.likes || 0),
      posted_at_text: cleanText(item.posted_at_text || item.time || item.date).slice(0, 120),
      location: cleanText(item.location).slice(0, 60),
      is_reply: Boolean(item.is_reply),
    };
  }).filter(Boolean).slice(0, limit);
}

function cleanPlatformArray(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).map((platform, index) => ({
    id: cleanText(platform?.id, nanoid(8)),
    platform: cleanText(platform?.platform, "unknown"),
    url: cleanText(platform?.url || platform?.source_url),
    price: cleanText(platform?.price),
    cost: cleanText(platform?.cost),
    rating: platform?.rating ?? null,
    reviews: platform?.reviews ?? 0,
    sales: cleanText(platform?.sales),
    fetched_at: cleanText(platform?.fetched_at, nowIso()),
    order: index,
  }));
}

function cleanRecordList(value) {
  return cleanArray(value, 20);
}

export function maskSettings(settings) {
  const masked = { ...settings };
  if (masked.llm_api_key) masked.llm_api_key = "********";
  if (masked.search_api_key) masked.search_api_key = "********";
  if (masked.search_tavily_api_key) masked.search_tavily_api_key = "********";
  if (masked.search_serpapi_api_key) masked.search_serpapi_api_key = "********";
  if (masked.feishu_app_secret) masked.feishu_app_secret = "********";
  return masked;
}

export function ensureLocalUser(input = {}) {
  const user = {
    id: input.id || nanoid(12),
    email: cleanText(input.email),
    name: cleanTitle(input.name, "LOOM"),
    initials: cleanText(input.initials || String(input.name || "L").trim().replace(/\s+/g, "").slice(0, 2).toUpperCase(), "L").slice(0, 2).toUpperCase(),
    role: cleanTitle(input.role, "成员"),
    status: cleanText(input.status, "active"),
    auth_provider: cleanText(input.auth_provider, "password"),
    feishu_open_id: input.feishu_open_id || null,
    feishu_union_id: input.feishu_union_id || null,
    feishu_tenant_key: input.feishu_tenant_key || null,
    avatar_url: cleanText(input.avatar_url),
    created_at: input.created_at || nowIso(),
    updated_at: nowIso(),
    last_login_at: input.last_login_at || null,
  };
  db.prepare(`
    INSERT INTO users (
      id, email, name, initials, role, status, auth_provider,
      feishu_open_id, feishu_union_id, feishu_tenant_key, avatar_url,
      created_at, updated_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      initials = excluded.initials,
      role = excluded.role,
      status = excluded.status,
      auth_provider = excluded.auth_provider,
      feishu_open_id = COALESCE(excluded.feishu_open_id, users.feishu_open_id),
      feishu_union_id = COALESCE(excluded.feishu_union_id, users.feishu_union_id),
      feishu_tenant_key = COALESCE(excluded.feishu_tenant_key, users.feishu_tenant_key),
      avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
      updated_at = excluded.updated_at,
      last_login_at = COALESCE(excluded.last_login_at, users.last_login_at)
  `).run(
    user.id, user.email, user.name, user.initials, user.role, user.status, user.auth_provider,
    user.feishu_open_id, user.feishu_union_id, user.feishu_tenant_key, user.avatar_url,
    user.created_at, user.updated_at, user.last_login_at
  );
  const saved = findUserById(user.id);
  if (input.withSampleWorkspace) {
    ensureSampleUserState(saved);
    ensureSampleNewsSources(saved.id);
  } else {
    ensureUserState(saved);
    ensureDefaultNewsSources(saved.id);
  }
  return saved;
}

export function findUserById(userId) {
  return mapUserRow(db.prepare("SELECT * FROM users WHERE id = ?").get(userId));
}

export function findUserByFeishuProfile(profile) {
  return mapUserRow(db.prepare(`
    SELECT *
    FROM users
    WHERE (feishu_open_id = ? AND ? <> '')
       OR (feishu_union_id = ? AND ? <> '')
    LIMIT 1
  `).get(
    String(profile.open_id || ""),
    String(profile.open_id || ""),
    String(profile.union_id || ""),
    String(profile.union_id || "")
  ));
}

export function touchUserLogin(userId) {
  const current = findUserById(userId);
  if (!current) return null;
  db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), userId);
  return findUserById(userId);
}

export function listAllUsers() {
  return db.prepare("SELECT * FROM users ORDER BY created_at ASC").all().map(mapUserRow);
}

export function bootstrap(userId) {
  const state = requireState(userId);
  if (!state) return null;
  const allNews = listNews(userId);
  const news = isSampleWorkspace(state) ? allNews.filter((item) => isRecentSampleNews(item)) : allNews;
  state.news = news.slice(0, 30);
  state.newsCounts = newsCountsFrom(news);
  state.rssSources = listNewsSources(userId);
  state.onboarding = onboardingMeta(state, news);
  state.user = userSummaryFromState(state, findUserById(userId) || { id: userId });
  if (state.settings) {
    state.settings = { ...state.settings, tag_groups: normalizeTagGroups(state.settings.tag_groups) };
    state.settings = maskSettings(state.settings);
  }
  return state;
}

export function rawState(userId) {
  const state = requireState(userId);
  if (!state) return null;
  state.user = userSummaryFromState(state, findUserById(userId) || { id: userId });
  if (state.settings) {
    state.settings = { ...state.settings, tag_groups: normalizeTagGroups(state.settings.tag_groups) };
  }
  return state;
}

export function createProduct(userId, input) {
  return mutateUserState(userId, (state) => {
    const product = {
      id: input.id || nanoid(10),
      emoji: cleanText(input.emoji, "📦"),
      name: cleanTitle(input.name, "未命名竞品"),
      category: cleanTitle(input.category, "未分类"),
      tags: cleanArray(input.tags),
      status: cleanTitle(input.status, "新录入"),
      ai_summary: cleanSummary(input.ai_summary),
      selling_points: cleanArray(input.selling_points),
      negative_keywords: cleanArray(input.negative_keywords),
      related_product_id: cleanText(input.related_product_id, ""),
      related_product_name: cleanText(input.related_product_name, ""),
      sample: Boolean(input.sample),
      synced_at: null,
      feishu_record_id: null,
      created_at: input.created_at || nowIso(),
      updated_at: input.updated_at || nowIso(),
      platforms: cleanPlatformArray(input.platforms),
    };
    state.products ||= [];
    state.products.unshift(product);
    return product;
  });
}

export function updateProduct(userId, id, patch) {
  return mutateUserState(userId, (state) => {
    const item = (state.products || []).find((product) => product.id === id);
    if (!item) return null;
    const next = {
      ...(patch.name !== undefined ? { name: cleanTitle(patch.name, item.name) } : {}),
      ...(patch.category !== undefined ? { category: cleanTitle(patch.category, item.category) } : {}),
      ...(patch.status !== undefined ? { status: cleanTitle(patch.status, item.status) } : {}),
      ...(patch.emoji !== undefined ? { emoji: cleanText(patch.emoji, item.emoji) } : {}),
      ...(patch.ai_summary !== undefined ? { ai_summary: cleanSummary(patch.ai_summary, item.ai_summary) } : {}),
      ...(patch.tags !== undefined ? { tags: cleanArray(patch.tags) } : {}),
      ...(patch.selling_points !== undefined ? { selling_points: cleanArray(patch.selling_points) } : {}),
      ...(patch.negative_keywords !== undefined ? { negative_keywords: cleanArray(patch.negative_keywords) } : {}),
      ...(patch.related_product_id !== undefined ? { related_product_id: cleanText(patch.related_product_id, item.related_product_id || "") } : {}),
      ...(patch.related_product_name !== undefined ? { related_product_name: cleanText(patch.related_product_name, item.related_product_name || "") } : {}),
      ...(patch.platforms !== undefined ? { platforms: cleanPlatformArray(patch.platforms) } : {}),
      updated_at: nowIso(),
    };
    Object.assign(item, next);
    return item;
  });
}

export function deleteProduct(userId, id) {
  return mutateUserState(userId, (state) => {
    const before = (state.products || []).length;
    state.products = (state.products || []).filter((product) => product.id !== id);
    return before !== state.products.length;
  });
}

export function createDemand(userId, input) {
  return mutateUserState(userId, (state) => {
    const demand = {
      id: input.id || nanoid(10),
      title: cleanTitle(input.title, "未命名需求"),
      thumbHue: input.thumbHue ?? 200,
      summary: cleanSummary(input.summary),
      original_content: cleanSummary(input.original_content || input.content),
      source: cleanText(input.source, "manual"),
      source_url: cleanText(input.source_url || input.url),
      url: cleanText(input.url || input.source_url),
      author: cleanText(input.author || input.username),
      likes: Number(input.likes || 0),
      collects: Number(input.collects || 0),
      shares: Number(input.shares || 0),
      comments: Number(input.comments || 0),
      thumbnail_url: cleanText(input.thumbnail_url || input.image),
      image: cleanText(input.image || input.thumbnail_url),
      visible_comments: cleanVisibleComments(input.visible_comments),
      date: input.date || new Date().toISOString().slice(0, 10),
      innovation: cleanTitle(input.innovation, "待分类"),
      scenarios: cleanArray(input.scenarios),
      painpoints: cleanArray(input.painpoints),
      sample: Boolean(input.sample),
      synced_at: null,
      feishu_record_id: null,
      created_at: input.created_at || nowIso(),
      updated_at: input.updated_at || nowIso(),
    };
    state.demands ||= [];
    state.demands.unshift(demand);
    return demand;
  });
}

export function updateDemand(userId, id, patch) {
  return mutateUserState(userId, (state) => {
    const item = (state.demands || []).find((demand) => demand.id === id);
    if (!item) return null;
    const next = {
      ...patch,
      ...(patch.title !== undefined ? { title: cleanTitle(patch.title, item.title) } : {}),
      ...(patch.summary !== undefined ? { summary: cleanSummary(patch.summary, item.summary) } : {}),
      ...(patch.original_content !== undefined ? { original_content: cleanSummary(patch.original_content, item.original_content || "") } : {}),
      ...(patch.source !== undefined ? { source: cleanText(patch.source, item.source) } : {}),
      ...(patch.source_url !== undefined ? { source_url: cleanText(patch.source_url, item.source_url || "") } : {}),
      ...(patch.url !== undefined ? { url: cleanText(patch.url, item.url || "") } : {}),
      ...(patch.author !== undefined ? { author: cleanText(patch.author, item.author || "") } : {}),
      ...(patch.likes !== undefined ? { likes: Number(patch.likes || 0) } : {}),
      ...(patch.collects !== undefined ? { collects: Number(patch.collects || 0) } : {}),
      ...(patch.shares !== undefined ? { shares: Number(patch.shares || 0) } : {}),
      ...(patch.comments !== undefined ? { comments: Number(patch.comments || 0) } : {}),
      ...(patch.visible_comments !== undefined ? { visible_comments: cleanVisibleComments(patch.visible_comments) } : {}),
      ...(patch.thumbnail_url !== undefined ? { thumbnail_url: cleanText(patch.thumbnail_url, item.thumbnail_url || "") } : {}),
      ...(patch.image !== undefined ? { image: cleanText(patch.image, item.image || "") } : {}),
      ...(patch.innovation !== undefined ? { innovation: cleanTitle(patch.innovation, item.innovation) } : {}),
      ...(patch.scenarios !== undefined ? { scenarios: cleanArray(patch.scenarios) } : {}),
      ...(patch.painpoints !== undefined ? { painpoints: cleanArray(patch.painpoints) } : {}),
      updated_at: nowIso(),
    };
    Object.assign(item, next);
    return item;
  });
}

export function deleteDemand(userId, id) {
  return mutateUserState(userId, (state) => {
    const before = (state.demands || []).length;
    state.demands = (state.demands || []).filter((demand) => demand.id !== id);
    return before !== state.demands.length;
  });
}

export function createResearch(userId, input) {
  return mutateUserState(userId, (state) => {
    state.research ||= [];
    const research = {
      id: input.id || nanoid(10),
      title: cleanTitle(input.title, "未命名调研项目"),
      desc: cleanSummary(input.desc || input.description || ""),
      status: cleanTitle(input.status, "草稿"),
      date: input.date || new Date().toISOString().slice(0, 10),
      products: cleanRecordList(input.products || input.matched_products || []),
      demands: cleanRecordList(input.demands || input.matched_demands || []),
      analysis: Array.isArray(input.analysis) ? input.analysis.slice(0, 20) : input.analysis || null,
      sample: Boolean(input.sample),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    state.research.unshift(research);
    return research;
  });
}

export function updateResearch(userId, id, patch) {
  return mutateUserState(userId, (state) => {
    const item = (state.research || []).find((research) => research.id === id);
    if (!item) return null;
    const next = {
      ...(patch.title !== undefined ? { title: cleanTitle(patch.title, item.title) } : {}),
      ...(patch.desc !== undefined ? { desc: cleanSummary(patch.desc, item.desc) } : {}),
      ...(patch.description !== undefined && patch.desc === undefined ? { desc: cleanSummary(patch.description, item.desc) } : {}),
      ...(patch.status !== undefined ? { status: cleanTitle(patch.status, item.status) } : {}),
      ...(patch.products !== undefined ? { products: cleanRecordList(patch.products) } : {}),
      ...(patch.demands !== undefined ? { demands: cleanRecordList(patch.demands) } : {}),
      ...(patch.matched_products !== undefined && patch.products === undefined ? { products: cleanRecordList(patch.matched_products) } : {}),
      ...(patch.matched_demands !== undefined && patch.demands === undefined ? { demands: cleanRecordList(patch.matched_demands) } : {}),
      ...(patch.analysis !== undefined ? { analysis: Array.isArray(patch.analysis) ? patch.analysis.slice(0, 20) : patch.analysis } : {}),
      updated_at: nowIso(),
    };
    Object.assign(item, next);
    return item;
  });
}

export function deleteResearch(userId, id) {
  return mutateUserState(userId, (state) => {
    const before = (state.research || []).length;
    state.research = (state.research || []).filter((research) => research.id !== id);
    return before !== state.research.length;
  });
}

export function updateSettings(userId, patch) {
  return mutateUserState(userId, (state) => {
    const allowed = [
      "llm_api_type",
      "llm_api_url",
      "llm_model",
      "llm_api_key",
      "llm_timeout_ms",
      "search_provider",
      "search_enabled",
      "search_api_url",
      "search_api_key",
      "search_model",
      "search_tavily_enabled",
      "search_tavily_api_key",
      "search_tavily_api_url",
      "search_tavily_mode",
      "search_serpapi_enabled",
      "search_serpapi_api_key",
      "search_serpapi_api_url",
      "search_serpapi_engine",
      "tag_groups",
      "feishu_app_id",
      "feishu_app_secret",
      "feishu_base_token",
      "feishu_products_table_id",
      "feishu_demands_table_id",
      "feishu_news_table_id",
      "feishu_table_token",
      "rss_collect_enabled",
      "rss_collect_interval_ms",
    ];
    const next = {};
    for (const key of allowed) {
      if (patch[key] !== undefined) next[key] = patch[key];
    }
    for (const key of ["llm_api_key", "search_api_key", "search_tavily_api_key", "search_serpapi_api_key", "feishu_app_secret"]) {
      if (next[key] === "********" || next[key] === "") delete next[key];
    }
    state.settings = { ...(state.settings || {}), ...next };
    state.settings.tag_groups = normalizeTagGroups(state.settings.tag_groups);
    return maskSettings(state.settings);
  });
}

export function finishSampleWorkspace(userId) {
  if (userId === getLegacyUserId()) {
    const state = requireState(userId);
    if (!state) return null;
    state.onboarding = onboardingMeta(state, listNews(userId));
    return state;
  }
  return mutateUserState(userId, (state) => {
    state.onboarding = {
      ...(state.onboarding || {}),
      sampleWorkspace: false,
      sampleDismissed: true,
      dismissed_at: nowIso(),
    };
    state.products = (state.products || []).filter((item) => !item.sample);
    state.demands = (state.demands || []).filter((item) => !item.sample);
    state.research = (state.research || []).filter((item) => !item.sample);
    ensureDefaultNewsSources(userId);
    return state;
  });
}

export function listNews(userId) {
  return db.prepare(`
    SELECT *
    FROM news_items
    WHERE user_id = ?
    ORDER BY published_at DESC, created_at DESC
  `).all(userId).map(mapNewsRow);
}

export function listPendingNewsForLlm(userId, limit = 20) {
  return db.prepare(`
    SELECT *
    FROM news_items
    WHERE user_id = ? AND (llm_processed = 0 OR needs_translation = 1)
    ORDER BY published_at DESC, created_at DESC
    LIMIT ?
  `).all(userId, limit).map(mapNewsRow);
}

export function updateNews(userId, id, patch) {
  const current = db.prepare("SELECT * FROM news_items WHERE id = ? AND user_id = ?").get(id, userId);
  if (!current) return null;
  db.prepare(`
    UPDATE news_items
    SET is_read = ?,
        is_starred = ?,
        type = COALESCE(?, type),
        title_zh = COALESCE(?, title_zh),
        summary_zh = COALESCE(?, summary_zh),
        content_zh = COALESCE(?, content_zh),
        is_kept = COALESCE(?, is_kept),
        llm_processed = COALESCE(?, llm_processed),
        needs_translation = COALESCE(?, needs_translation),
        classification_json = COALESCE(?, classification_json),
        updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    patch.unread !== undefined ? (patch.unread ? 0 : 1) : (patch.is_read !== undefined ? (patch.is_read ? 1 : 0) : current.is_read),
    patch.starred !== undefined ? (patch.starred ? 1 : 0) : (patch.is_starred !== undefined ? (patch.is_starred ? 1 : 0) : current.is_starred),
    patch.type ?? null,
    patch.titleZh ?? null,
    patch.summary ?? null,
    patch.contentZh ?? null,
    patch.is_kept ?? null,
    patch.llm_processed ?? null,
    patch.needsTranslation !== undefined ? (patch.needsTranslation ? 1 : 0) : null,
    patch.classification ? JSON.stringify(patch.classification) : null,
    nowIso(),
    id,
    userId
  );
  return listNews(userId).find((item) => item.id === id) || null;
}

export function deleteNews(userId, id) {
  return db.prepare("DELETE FROM news_items WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

export function upsertNews(userId, items) {
  const inserted = [];
  const updated = [];
  const selectStmt = db.prepare("SELECT * FROM news_items WHERE user_id = ? AND original_url = ?");
  const updateImageStmt = db.prepare(`
    UPDATE news_items
    SET thumbnail_url = ?,
        classification_json = COALESCE(?, classification_json),
        updated_at = ?
    WHERE id = ? AND user_id = ?
  `);
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO news_items (
      id, user_id, source_id, source_name, source_authority, original_title, original_url,
      original_summary, original_content, title_zh, summary_zh, content_zh, type, thumbnail_url,
      thumb_hue, is_kept, is_read, is_starred, published_at, llm_processed, needs_translation,
      classification_json, synced_at, feishu_record_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction((records) => {
    for (const input of records) {
      if (!input.original_url) continue;
      const current = selectStmt.get(userId, input.original_url);
      if (current) {
        if (!current.thumbnail_url && input.thumbnail_url) {
          const mappedCurrent = mapNewsRow(current);
          const classificationJson = input.classification ? JSON.stringify({
            ...(current.classification_json ? JSON.parse(current.classification_json) : {}),
            ...input.classification,
          }) : null;
          updateImageStmt.run(input.thumbnail_url, classificationJson, nowIso(), current.id, userId);
          updated.push({ ...mappedCurrent, thumbnail_url: input.thumbnail_url, classification: input.classification || mappedCurrent.classification });
        }
        continue;
      }
      const payload = {
        id: input.id || nanoid(10),
        user_id: userId,
        source_id: input.source_id || "unknown",
        source_name: input.source || "",
        source_authority: input.source_authority || input.classification?.authority || "watchlist",
        original_title: input.original_title || input.titleZh || "",
        original_url: input.original_url || `${input.source_id || "unknown"}::${input.id || nanoid(6)}`,
        original_summary: input.summary || "",
        original_content: input.original_content || "",
        title_zh: input.titleZh || input.original_title || "",
        summary_zh: input.summary || "",
        content_zh: input.contentZh || "",
        type: input.type || null,
        thumbnail_url: input.thumbnail_url || "",
        thumb_hue: Number(input.thumbHue ?? 40),
        is_kept: input.type ? 1 : 0,
        is_read: 0,
        is_starred: 0,
        published_at: input.published_at || input.date || nowIso(),
        llm_processed: input.llmProcessed !== undefined ? (input.llmProcessed ? 1 : 0) : (input.type ? 1 : 0),
        needs_translation: input.needsTranslation ? 1 : 0,
        classification_json: input.classification ? JSON.stringify(input.classification) : null,
        synced_at: null,
        feishu_record_id: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      const result = insertStmt.run(
        payload.id, payload.user_id, payload.source_id, payload.source_name, payload.source_authority, payload.original_title, payload.original_url,
        payload.original_summary, payload.original_content, payload.title_zh, payload.summary_zh, payload.content_zh, payload.type, payload.thumbnail_url,
        payload.thumb_hue, payload.is_kept, payload.is_read, payload.is_starred, payload.published_at, payload.llm_processed, payload.needs_translation,
        payload.classification_json, payload.synced_at, payload.feishu_record_id, payload.created_at, payload.updated_at
      );
      if (result.changes > 0) inserted.push(payload);
    }
  })(items);
  return { inserted, updated };
}

export function listNewsSources(userId) {
  return db.prepare(`
    SELECT *
    FROM news_sources
    WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(userId).map(mapNewsSourceRow);
}

export function createNewsSource(userId, input) {
  const normalizedUrl = cleanText(input.url);
  const existingByUrl = normalizedUrl
    ? db.prepare("SELECT * FROM news_sources WHERE user_id = ? AND url = ?").get(userId, normalizedUrl)
    : null;
  if (existingByUrl) {
    return updateNewsSource(userId, existingByUrl.id, {
      ...input,
      url: normalizedUrl,
    });
  }
    const source = {
      id: input.id || nanoid(10),
      user_id: userId,
      name: cleanTitle(input.name, "未命名数据源"),
      url: normalizedUrl,
      type: cleanText(input.type, "rss"),
      language: cleanText(input.language),
      authority: cleanText(input.authority, "watchlist"),
      group_name: cleanText(input.group, "custom"),
      source_group: cleanText(input.source_group || input.group, "custom"),
      brand: cleanTitle(input.brand, ""),
      fetch_interval: clampFetchInterval(input.interval || input.fetch_interval || 60),
      is_active: input.active ?? input.is_active ?? true ? 1 : 0,
      last_fetched_at: input.last_fetched_at || null,
      last_item_count: Number(input.last_item_count || 0),
      last_error: cleanText(input.last_error),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  db.prepare(`
    INSERT INTO news_sources (
      id, user_id, name, url, type, language, authority, group_name, source_group, brand,
      fetch_interval, is_active, last_fetched_at, last_item_count, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    source.id, source.user_id, source.name, source.url, source.type, source.language, source.authority, source.group_name, source.source_group, source.brand,
    source.fetch_interval, source.is_active, source.last_fetched_at, source.last_item_count, source.last_error, source.created_at, source.updated_at
  );
  return listNewsSources(userId).find((item) => item.id === source.id) || null;
}

export function ensureSampleNewsSources(userId) {
  const existing = new Set(listNewsSources(userId).map((source) => source.id));
  const created = [];
  for (const source of SAMPLE_NEWS_SOURCES) {
    const id = sampleSourceId(userId, source.id);
    if (existing.has(id)) continue;
    created.push(createNewsSource(userId, {
      ...source,
      id,
      type: "rss",
      active: true,
      is_active: true,
    }));
  }
  return created;
}

export function ensureDefaultNewsSources(userId) {
  const existing = new Set(listNewsSources(userId).map((source) => source.id));
  const created = [];
  for (const source of DEFAULT_NEWS_SOURCES) {
    const id = sampleSourceId(userId, source.id);
    if (existing.has(id)) continue;
    created.push(createNewsSource(userId, {
      ...source,
      id,
      type: "rss",
      active: true,
      is_active: true,
    }));
  }
  return created;
}

export function updateNewsSource(userId, id, patch) {
  const current = db.prepare("SELECT * FROM news_sources WHERE id = ? AND user_id = ?").get(id, userId);
  if (!current) return null;
  db.prepare(`
    UPDATE news_sources
    SET name = ?, url = ?, type = ?, language = ?, authority = ?, group_name = ?, source_group = ?, brand = ?,
        fetch_interval = ?, is_active = ?, last_fetched_at = ?, last_item_count = ?, last_error = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    patch.name !== undefined ? cleanTitle(patch.name, current.name) : current.name,
    patch.url !== undefined ? cleanText(patch.url, current.url) : current.url,
    patch.type !== undefined ? cleanText(patch.type, current.type) : current.type,
    patch.language !== undefined ? cleanText(patch.language, current.language) : current.language,
    patch.authority !== undefined ? cleanText(patch.authority, current.authority) : current.authority,
    patch.group !== undefined ? cleanText(patch.group, current.group_name) : current.group_name,
    patch.source_group !== undefined ? cleanText(patch.source_group, patch.group ?? current.source_group ?? current.group_name) : (patch.group !== undefined ? cleanText(patch.group, current.source_group || current.group_name) : current.source_group || current.group_name),
    patch.brand !== undefined ? cleanTitle(patch.brand, current.brand) : current.brand,
    patch.fetch_interval !== undefined || patch.interval !== undefined ? clampFetchInterval(patch.fetch_interval ?? patch.interval) : current.fetch_interval,
    patch.is_active !== undefined ? (patch.is_active ? 1 : 0) : (patch.active !== undefined ? (patch.active ? 1 : 0) : current.is_active),
    patch.last_fetched_at ?? current.last_fetched_at,
    patch.last_item_count !== undefined ? Number(patch.last_item_count || 0) : Number(current.last_item_count || 0),
    patch.last_error !== undefined ? cleanText(patch.last_error, current.last_error) : current.last_error,
    nowIso(),
    id,
    userId
  );
  return listNewsSources(userId).find((item) => item.id === id) || null;
}

export function deleteNewsSource(userId, id) {
  return db.prepare("DELETE FROM news_sources WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

export function clearNewsSources(userId) {
  return db.prepare("DELETE FROM news_sources WHERE user_id = ?").run(userId).changes;
}

export function markSynced(userId, kind, records) {
  if (kind === "news") {
    const syncedAt = nowIso();
    const stmt = db.prepare(`
      UPDATE news_items
      SET synced_at = ?, feishu_record_id = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `);
    const tx = db.transaction((rows) => {
      for (const record of rows) {
        stmt.run(syncedAt, record.record_id || null, syncedAt, record.local_id, userId);
      }
    });
    tx(records);
    return { synced_at: syncedAt, count: records.length };
  }
  return mutateUserState(userId, (state) => {
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

export function ensureLegacyWorkspace() {
  const existing = findUserById(getLegacyUserId());
  const user = existing || ensureLocalUser({
    id: getLegacyUserId(),
    name: "visitor",
    initials: "VI",
    role: "产品经理",
    auth_provider: "password",
  });
  ensureSampleUserState(user, { force: true });
  ensureSampleNewsSources(user.id);
  return user;
}

export {
  acquireLock,
  getUserIdByApiToken,
  releaseLock,
  revokeApiToken,
  revokeUserApiTokens,
  upsertApiToken,
};
