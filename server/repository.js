import { nanoid } from "nanoid";
import {
  db,
  ensureUserState,
  getLegacyUserId,
  getUserState,
  saveUserState,
} from "./db.js";
import { normalizeTagGroups } from "./tag-config.js";
import { buildEmptyState } from "./seed.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function userSummaryFromState(state, fallback = {}) {
  const source = state?.user || {};
  return {
    id: source.id || fallback.id || "",
    name: source.name || fallback.name || "LOOM",
    role: source.role || fallback.role || "成员",
    initials: source.initials || fallback.initials || "L",
    auth_provider: source.auth_provider || fallback.auth_provider || "password",
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
  const ensured = ensureUserState(user);
  return clone(ensured);
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
    email: input.email || "",
    name: input.name || "LOOM",
    initials: input.initials || String(input.name || "L").trim().replace(/\s+/g, "").slice(0, 2).toUpperCase() || "L",
    role: input.role || "成员",
    status: input.status || "active",
    auth_provider: input.auth_provider || "password",
    feishu_open_id: input.feishu_open_id || null,
    feishu_union_id: input.feishu_union_id || null,
    feishu_tenant_key: input.feishu_tenant_key || null,
    avatar_url: input.avatar_url || "",
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
  ensureUserState(saved);
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

export function bootstrap(userId) {
  const state = requireState(userId);
  if (!state) return null;
  const news = listNews(userId);
  state.news = news.slice(0, 30);
  state.newsCounts = newsCountsFrom(news);
  state.rssSources = listNewsSources(userId);
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
  if (state?.settings) {
    state.settings = { ...state.settings, tag_groups: normalizeTagGroups(state.settings.tag_groups) };
  }
  return state;
}

export function createProduct(userId, input) {
  return mutateUserState(userId, (state) => {
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
    state.products ||= [];
    state.products.unshift(product);
    return product;
  });
}

export function updateProduct(userId, id, patch) {
  return mutateUserState(userId, (state) => {
    const item = (state.products || []).find((product) => product.id === id);
    if (!item) return null;
    Object.assign(item, patch, { updated_at: nowIso() });
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
    state.demands ||= [];
    state.demands.unshift(demand);
    return demand;
  });
}

export function updateDemand(userId, id, patch) {
  return mutateUserState(userId, (state) => {
    const item = (state.demands || []).find((demand) => demand.id === id);
    if (!item) return null;
    Object.assign(item, patch, { updated_at: nowIso() });
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

export function updateResearch(userId, id, patch) {
  return mutateUserState(userId, (state) => {
    const item = (state.research || []).find((research) => research.id === id);
    if (!item) return null;
    Object.assign(item, patch, { updated_at: nowIso() });
    if (patch.description && !patch.desc) item.desc = patch.description;
    if (patch.matched_products && !patch.products) item.products = patch.matched_products;
    if (patch.matched_demands && !patch.demands) item.demands = patch.matched_demands;
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
    const next = { ...patch };
    for (const key of ["llm_api_key", "search_api_key", "search_tavily_api_key", "search_serpapi_api_key", "feishu_app_secret"]) {
      if (next[key] === "********" || next[key] === "") delete next[key];
    }
    state.settings = { ...(state.settings || {}), ...next };
    state.settings.tag_groups = normalizeTagGroups(state.settings.tag_groups);
    return maskSettings(state.settings);
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
    WHERE user_id = ? AND llm_processed = 0
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
  const selectStmt = db.prepare("SELECT * FROM news_items WHERE user_id = ? AND original_url = ?");
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
      if (current) continue;
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
  return { inserted, updated: [] };
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
  const source = {
    id: input.id || nanoid(10),
    user_id: userId,
    name: input.name || "未命名数据源",
    url: input.url || "",
    type: input.type || "rss",
    language: input.language || "",
    authority: input.authority || "watchlist",
    group_name: input.group || "custom",
    source_group: input.source_group || input.group || "custom",
    brand: input.brand || "",
    fetch_interval: clampFetchInterval(input.interval || input.fetch_interval || 60),
    is_active: input.active ?? input.is_active ?? true ? 1 : 0,
    last_fetched_at: input.last_fetched_at || null,
    last_item_count: Number(input.last_item_count || 0),
    last_error: input.last_error || null,
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

export function updateNewsSource(userId, id, patch) {
  const current = db.prepare("SELECT * FROM news_sources WHERE id = ? AND user_id = ?").get(id, userId);
  if (!current) return null;
  db.prepare(`
    UPDATE news_sources
    SET name = ?, url = ?, type = ?, language = ?, authority = ?, group_name = ?, source_group = ?, brand = ?,
        fetch_interval = ?, is_active = ?, last_fetched_at = ?, last_item_count = ?, last_error = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    patch.name ?? current.name,
    patch.url ?? current.url,
    patch.type ?? current.type,
    patch.language ?? current.language,
    patch.authority ?? current.authority,
    patch.group ?? current.group_name,
    patch.source_group ?? patch.group ?? current.source_group ?? current.group_name,
    patch.brand ?? current.brand,
    patch.fetch_interval !== undefined || patch.interval !== undefined ? clampFetchInterval(patch.fetch_interval ?? patch.interval) : current.fetch_interval,
    patch.is_active !== undefined ? (patch.is_active ? 1 : 0) : (patch.active !== undefined ? (patch.active ? 1 : 0) : current.is_active),
    patch.last_fetched_at ?? current.last_fetched_at,
    patch.last_item_count !== undefined ? Number(patch.last_item_count || 0) : Number(current.last_item_count || 0),
    patch.last_error ?? current.last_error,
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

export function listAllUsers() {
  return db.prepare("SELECT * FROM users ORDER BY created_at ASC").all().map(mapUserRow);
}

export function ensureLegacyWorkspace() {
  const existing = findUserById(getLegacyUserId());
  if (existing) return existing;
  return ensureLocalUser({
    id: getLegacyUserId(),
    name: "Graham",
    initials: "G",
    role: "产品经理",
    auth_provider: "password",
  });
}
