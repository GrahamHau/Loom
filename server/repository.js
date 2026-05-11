import { nanoid } from "nanoid";
import { db, getState, saveState } from "./db.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function bootstrap() {
  const state = clone(getState());
  state.news = listNews();
  state.rssSources = listNewsSources();
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
  return db.prepare(`
    SELECT *
    FROM news_items
    ORDER BY published_at DESC, created_at DESC
  `).all().map(mapNewsRow);
}

export function listPendingNewsForLlm(limit = 20) {
  return db.prepare(`
    SELECT *
    FROM news_items
    WHERE llm_processed = 0
    ORDER BY published_at DESC, created_at DESC
    LIMIT ?
  `).all(limit).map(mapNewsRow);
}

export function updateNews(id, patch) {
  const current = db.prepare("SELECT * FROM news_items WHERE id = ?").get(id);
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
    WHERE id = ?
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
    id
  );
  return listNews().find((item) => item.id === id) || null;
}

export function deleteNews(id) {
  return db.prepare("DELETE FROM news_items WHERE id = ?").run(id).changes > 0;
}

export function upsertNews(items) {
  const inserted = [];
  const selectStmt = db.prepare("SELECT * FROM news_items WHERE original_url = ?");
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
      const current = selectStmt.get(input.original_url);
      if (current) continue;
      const payload = {
        id: input.id || nanoid(10),
        user_id: input.user_id || "default",
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
      if (result.changes > 0) {
        inserted.push(payload);
      }
    }
  })(items);
  return { inserted, updated: [] };
}

export function listNewsSources() {
  return db.prepare(`
    SELECT *
    FROM news_sources
    ORDER BY created_at ASC
  `).all().map(mapNewsSourceRow);
}

export function createNewsSource(input) {
  const source = {
    id: input.id || nanoid(10),
    user_id: input.user_id || "default",
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
  return listNewsSources().find((item) => item.id === source.id) || null;
}

export function updateNewsSource(id, patch) {
  const current = db.prepare("SELECT * FROM news_sources WHERE id = ?").get(id);
  if (!current) return null;
  db.prepare(`
    UPDATE news_sources
    SET name = ?, url = ?, type = ?, language = ?, authority = ?, group_name = ?, source_group = ?, brand = ?,
        fetch_interval = ?, is_active = ?, last_fetched_at = ?, last_item_count = ?, last_error = ?, updated_at = ?
    WHERE id = ?
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
    id
  );
  return listNewsSources().find((item) => item.id === id) || null;
}

export function deleteNewsSource(id) {
  return db.prepare("DELETE FROM news_sources WHERE id = ?").run(id).changes > 0;
}

export function clearNewsSources() {
  return db.prepare("DELETE FROM news_sources").run().changes;
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
  if (kind === "news") {
    const syncedAt = nowIso();
    const stmt = db.prepare(`
      UPDATE news_items
      SET synced_at = ?, feishu_record_id = ?, updated_at = ?
      WHERE id = ?
    `);
    const tx = db.transaction((rows) => {
      for (const record of rows) {
        stmt.run(syncedAt, record.record_id || null, syncedAt, record.local_id);
      }
    });
    tx(records);
    return { synced_at: syncedAt, count: records.length };
  }
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
