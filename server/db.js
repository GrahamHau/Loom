import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEmptyState } from "./seed.js";
import { isStateEmptyForSample, sampleWorkspaceState } from "./sample-workspace.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataDir = process.env.DATA_DIR || path.join(projectRoot, "data");
const defaultDbPath = path.join(dataDir, "loom.sqlite");
const legacyDbPath = path.join(dataDir, "pm-copilot.sqlite");
const dbPath = process.env.DATABASE_PATH || (fs.existsSync(legacyDbPath) ? legacyDbPath : defaultDbPath);

export const LEGACY_USER_ID = "legacy-default";

fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function legacyStateKey() {
  return "state";
}

function legacyUserIdKey() {
  return "legacy_user_id";
}

function userStateKey(userId) {
  return `state:user:${userId}`;
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_data (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_locks (
      key TEXT PRIMARY KEY,
      locked_until TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      name TEXT NOT NULL,
      initials TEXT DEFAULT 'L',
      role TEXT DEFAULT '成员',
      role_code TEXT NOT NULL DEFAULT 'member',
      status TEXT DEFAULT 'active',
      auth_provider TEXT DEFAULT 'password',
      feishu_open_id TEXT,
      feishu_union_id TEXT,
      feishu_tenant_key TEXT,
      avatar_url TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_tokens_revoked_at ON api_tokens(revoked_at);

    CREATE TABLE IF NOT EXISTS news_sources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '${LEGACY_USER_ID}',
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT DEFAULT 'rss',
      language TEXT DEFAULT '',
      authority TEXT DEFAULT 'watchlist',
      group_name TEXT DEFAULT 'custom',
      source_group TEXT DEFAULT 'custom',
      brand TEXT DEFAULT '',
      fetch_interval INTEGER DEFAULT 60,
      is_active INTEGER DEFAULT 1,
      last_fetched_at TEXT,
      last_item_count INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS news_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '${LEGACY_USER_ID}',
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_authority TEXT DEFAULT 'watchlist',
      original_title TEXT NOT NULL,
      original_url TEXT NOT NULL,
      original_summary TEXT,
      original_content TEXT,
      title_zh TEXT,
      summary_zh TEXT,
      content_zh TEXT,
      type TEXT,
      thumbnail_url TEXT,
      thumb_hue INTEGER DEFAULT 40,
      is_kept INTEGER DEFAULT 0,
      is_read INTEGER DEFAULT 0,
      is_starred INTEGER DEFAULT 0,
      published_at TEXT,
      llm_processed INTEGER DEFAULT 0,
      needs_translation INTEGER DEFAULT 0,
      classification_json TEXT,
      synced_at TEXT,
      feishu_record_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_news_items_user_date ON news_items(user_id, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_news_items_type ON news_items(type);
    CREATE INDEX IF NOT EXISTS idx_news_items_starred ON news_items(is_starred);
    CREATE INDEX IF NOT EXISTS idx_news_items_url ON news_items(original_url);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_feishu_open_id ON users(feishu_open_id) WHERE feishu_open_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_feishu_union_id ON users(feishu_union_id) WHERE feishu_union_id IS NOT NULL;
  `);

  const newsSourceColumns = new Set(db.prepare("PRAGMA table_info(news_sources)").all().map((column) => column.name));
  if (!newsSourceColumns.has("source_group")) db.exec("ALTER TABLE news_sources ADD COLUMN source_group TEXT DEFAULT 'custom';");
  if (!newsSourceColumns.has("brand")) db.exec("ALTER TABLE news_sources ADD COLUMN brand TEXT DEFAULT '';");
  if (!newsSourceColumns.has("last_item_count")) db.exec("ALTER TABLE news_sources ADD COLUMN last_item_count INTEGER DEFAULT 0;");

  const userColumns = new Set(db.prepare("PRAGMA table_info(users)").all().map((column) => column.name));
  if (!userColumns.has("role_code")) {
    db.exec("ALTER TABLE users ADD COLUMN role_code TEXT NOT NULL DEFAULT 'member';");
  }
  const ownerEmail = String(process.env.LOOM_OWNER_EMAIL || "").trim().toLowerCase();
  const ownerOpenId = String(process.env.LOOM_OWNER_FEISHU_OPEN_ID || "").trim();
  if (ownerEmail) {
    db.prepare("UPDATE users SET role_code = 'owner', role = '主理人' WHERE id <> ? AND lower(email) = ?").run(LEGACY_USER_ID, ownerEmail);
  }
  if (ownerOpenId) {
    db.prepare("UPDATE users SET role_code = 'owner', role = '主理人' WHERE id <> ? AND feishu_open_id = ?").run(LEGACY_USER_ID, ownerOpenId);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_users_role_code ON users(role_code);");

  const newsItemsSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'news_items'").get()?.sql || "";
  if (newsItemsSql.includes("original_url TEXT NOT NULL UNIQUE")) {
    db.exec(`
      ALTER TABLE news_items RENAME TO news_items_legacy_unique;

      CREATE TABLE news_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '${LEGACY_USER_ID}',
        source_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_authority TEXT DEFAULT 'watchlist',
        original_title TEXT NOT NULL,
        original_url TEXT NOT NULL,
        original_summary TEXT,
        original_content TEXT,
        title_zh TEXT,
        summary_zh TEXT,
        content_zh TEXT,
        type TEXT,
        thumbnail_url TEXT,
        thumb_hue INTEGER DEFAULT 40,
        is_kept INTEGER DEFAULT 0,
        is_read INTEGER DEFAULT 0,
        is_starred INTEGER DEFAULT 0,
        published_at TEXT,
        llm_processed INTEGER DEFAULT 0,
        needs_translation INTEGER DEFAULT 0,
        classification_json TEXT,
        synced_at TEXT,
        feishu_record_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO news_items (
        id, user_id, source_id, source_name, source_authority, original_title, original_url,
        original_summary, original_content, title_zh, summary_zh, content_zh, type, thumbnail_url,
        thumb_hue, is_kept, is_read, is_starred, published_at, llm_processed, needs_translation,
        classification_json, synced_at, feishu_record_id, created_at, updated_at
      )
      SELECT
        id, user_id, source_id, source_name, source_authority, original_title, original_url,
        original_summary, original_content, title_zh, summary_zh, content_zh, type, thumbnail_url,
        thumb_hue, is_kept, is_read, is_starred, published_at, llm_processed, needs_translation,
        classification_json, synced_at, feishu_record_id, created_at, updated_at
      FROM news_items_legacy_unique;

      DROP TABLE news_items_legacy_unique;

      CREATE INDEX IF NOT EXISTS idx_news_items_user_date ON news_items(user_id, published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_news_items_type ON news_items(type);
      CREATE INDEX IF NOT EXISTS idx_news_items_starred ON news_items(is_starred);
      CREATE INDEX IF NOT EXISTS idx_news_items_url ON news_items(original_url);
    `);
  }

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_news_items_user_url ON news_items(user_id, original_url);");
}

export function readJson(key, fallback) {
  const row = db.prepare("SELECT value FROM app_data WHERE key = ?").get(key);
  if (!row) return fallback;
  return JSON.parse(row.value);
}

export function writeJson(key, value) {
  db.prepare(`
    INSERT INTO app_data (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, JSON.stringify(value, null, 2));
}

export function getState() {
  return readJson(legacyStateKey(), null);
}

export function saveState(state) {
  writeJson(legacyStateKey(), state);
}

export function getLegacyState() {
  return getState();
}

export function getLegacyUserId() {
  return readJson(legacyUserIdKey(), LEGACY_USER_ID) || LEGACY_USER_ID;
}

export function getUserState(userId) {
  return readJson(userStateKey(userId), null);
}

export function saveUserState(userId, state) {
  writeJson(userStateKey(userId), state);
}

export function upsertApiToken(token, userId) {
  db.prepare(`
    INSERT INTO api_tokens (token, user_id, created_at, last_used_at, revoked_at)
    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
    ON CONFLICT(token) DO UPDATE SET
      user_id = excluded.user_id,
      last_used_at = CURRENT_TIMESTAMP,
      revoked_at = NULL
  `).run(token, userId);
}

export function getUserIdByApiToken(token) {
  const row = db.prepare(`
    SELECT user_id
    FROM api_tokens
    WHERE token = ? AND revoked_at IS NULL
  `).get(token);
  if (!row) return "";
  db.prepare("UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token = ?").run(token);
  return String(row.user_id || "");
}

export function revokeApiToken(token) {
  db.prepare("UPDATE api_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token = ?").run(token);
}

export function revokeUserApiTokens(userId) {
  db.prepare("UPDATE api_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL").run(userId);
}

let sessionsDb = null;

function getSessionsDb() {
  if (sessionsDb) return sessionsDb;
  try {
    sessionsDb = new Database(path.join(dataDir, "sessions.sqlite"));
    return sessionsDb;
  } catch {
    return null;
  }
}

export function purgeUserSessions(userId) {
  const sessionDb = getSessionsDb();
  if (!sessionDb) return 0;
  try {
    const table = sessionDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get();
    if (!table) return 0;
    const rows = sessionDb.prepare("SELECT sid, sess FROM sessions").all();
    const ids = rows
      .filter((row) => {
        try {
          return String(JSON.parse(row.sess)?.userId || "") === String(userId);
        } catch {
          return false;
        }
      })
      .map((row) => row.sid);
    if (ids.length === 0) return 0;
    sessionDb.prepare(`DELETE FROM sessions WHERE sid IN (${ids.map(() => "?").join(",")})`).run(...ids);
    return ids.length;
  } catch (error) {
    console.error("[loom] purge user sessions failed", error);
    return 0;
  }
}

export function acquireLock(key, ttlMs) {
  const now = Date.now();
  const lockedUntil = new Date(now + ttlMs).toISOString();
  const current = db.prepare("SELECT key, locked_until FROM app_locks WHERE key = ?").get(key);
  if (current && new Date(current.locked_until).getTime() > now) {
    return false;
  }
  db.prepare(`
    INSERT INTO app_locks (key, locked_until, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      locked_until = excluded.locked_until,
      updated_at = CURRENT_TIMESTAMP
  `).run(key, lockedUntil);
  return true;
}

export function releaseLock(key) {
  db.prepare("DELETE FROM app_locks WHERE key = ?").run(key);
}

function ensureLegacyUser(seedState) {
  const state = seedState || getLegacyState();
  if (!state?.user) return LEGACY_USER_ID;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO users (
      id, email, name, initials, role, role_code, status, auth_provider, avatar_url, created_at, updated_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      initials = excluded.initials,
      role = excluded.role,
      role_code = excluded.role_code,
      updated_at = excluded.updated_at
  `).run(
    LEGACY_USER_ID,
    "",
    state.user.name || "visitor",
    state.user.initials || "VI",
    state.user.role || "产品经理",
    "member",
    "active",
    state.user.auth_provider || "password",
    "",
    now,
    now,
    null
  );
  writeJson(legacyUserIdKey(), LEGACY_USER_ID);
  return LEGACY_USER_ID;
}

function migrateLegacyState(seedState) {
  const legacy = seedState || getLegacyState();
  if (!legacy) return;
  const legacyUserId = ensureLegacyUser(legacy);
  if (!getUserState(legacyUserId)) {
    saveUserState(legacyUserId, {
      ...legacy,
      user: {
        ...(legacy.user || {}),
        id: legacyUserId,
        auth_provider: (legacy.user || {}).auth_provider || "password",
      },
    });
  }
}

function syncLegacyNewsTables() {
  const state = getUserState(getLegacyUserId()) || getLegacyState();
  if (!state) return;
  const legacyUserId = getLegacyUserId();

  const sourceCount = db.prepare("SELECT COUNT(*) AS count FROM news_sources WHERE user_id = ?").get(legacyUserId).count;
  if (sourceCount === 0 && Array.isArray(state.rssSources) && state.rssSources.length) {
    const insertSource = db.prepare(`
      INSERT OR IGNORE INTO news_sources (
        id, user_id, name, url, type, language, authority, group_name,
        source_group, brand, fetch_interval, is_active, last_fetched_at, last_item_count, last_error, created_at, updated_at
      ) VALUES (
        @id, @user_id, @name, @url, @type, @language, @authority, @group_name,
        @source_group, @brand, @fetch_interval, @is_active, @last_fetched_at, @last_item_count, @last_error, @created_at, @updated_at
      )
    `);
    const insertMany = db.transaction((sources) => {
      for (const source of sources) {
        insertSource.run({
          id: source.id,
          user_id: source.user_id || legacyUserId,
          name: source.name || "未命名数据源",
          url: source.url || "",
          type: source.type || "rss",
          language: source.language || "",
          authority: source.authority || "watchlist",
          group_name: source.group || "custom",
          source_group: source.source_group || source.group || "custom",
          brand: source.brand || "",
          fetch_interval: Number(source.interval || source.fetch_interval || 60),
          is_active: source.active === false ? 0 : 1,
          last_fetched_at: source.last_fetched_at || null,
          last_item_count: Number(source.last_item_count || 0),
          last_error: source.last_error || null,
          created_at: source.created_at || new Date().toISOString(),
          updated_at: source.updated_at || new Date().toISOString(),
        });
      }
    });
    insertMany(state.rssSources);
  }

  const itemCount = db.prepare("SELECT COUNT(*) AS count FROM news_items WHERE user_id = ?").get(legacyUserId).count;
  if (itemCount === 0 && Array.isArray(state.news) && state.news.length) {
    const insertItem = db.prepare(`
      INSERT OR IGNORE INTO news_items (
        id, user_id, source_id, source_name, source_authority, original_title, original_url,
        original_summary, original_content, title_zh, summary_zh, content_zh, type, thumbnail_url,
        thumb_hue, is_kept, is_read, is_starred, published_at, llm_processed, needs_translation,
        classification_json, synced_at, feishu_record_id, created_at, updated_at
      ) VALUES (
        @id, @user_id, @source_id, @source_name, @source_authority, @original_title, @original_url,
        @original_summary, @original_content, @title_zh, @summary_zh, @content_zh, @type, @thumbnail_url,
        @thumb_hue, @is_kept, @is_read, @is_starred, @published_at, @llm_processed, @needs_translation,
        @classification_json, @synced_at, @feishu_record_id, @created_at, @updated_at
      )
    `);
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        insertItem.run({
          id: item.id,
          user_id: item.user_id || legacyUserId,
          source_id: item.source_id || item.source || "unknown",
          source_name: item.source || "",
          source_authority: item.source_authority || item.classification?.authority || "watchlist",
          original_title: item.original_title || item.titleZh || "",
          original_url: item.original_url || `${item.source_id || item.source || "unknown"}::${item.id}`,
          original_summary: item.summary || "",
          original_content: item.original_content || "",
          title_zh: item.titleZh || item.original_title || "",
          summary_zh: item.summary || "",
          content_zh: item.contentZh || "",
          type: item.type || null,
          thumbnail_url: item.thumbnail_url || "",
          thumb_hue: Number(item.thumbHue ?? 40),
          is_kept: item.type ? 1 : 0,
          is_read: item.unread ? 0 : 1,
          is_starred: item.starred ? 1 : 0,
          published_at: item.published_at || item.date || new Date().toISOString(),
          llm_processed: item.type ? 1 : 0,
          needs_translation: item.needsTranslation ? 1 : 0,
          classification_json: item.classification ? JSON.stringify(item.classification) : null,
          synced_at: item.synced_at || null,
          feishu_record_id: item.feishu_record_id || null,
          created_at: item.created_at || new Date().toISOString(),
          updated_at: item.updated_at || new Date().toISOString(),
        });
      }
    });
    insertMany(state.news);
  }
}

export function ensureUserState(user) {
  const current = getUserState(user.id);
  if (current) return current;
  const fallback = user.id === getLegacyUserId() ? getLegacyState() : null;
  const next = fallback
    ? {
        ...fallback,
        user: {
          ...(fallback.user || {}),
          id: user.id,
          name: user.name,
          role: user.role || (fallback.user || {}).role || "成员",
          role_code: user.role_code || (fallback.user || {}).role_code || "member",
          initials: user.initials || (fallback.user || {}).initials || "L",
          auth_provider: user.auth_provider || (fallback.user || {}).auth_provider || "feishu",
        },
      }
    : buildEmptyState(user);
  saveUserState(user.id, next);
  return next;
}

export function ensureSampleUserState(user, { force = false } = {}) {
  const current = getUserState(user.id);
  if (current?.onboarding?.sampleDismissed && !force) return current;
  if (current && !force && !isStateEmptyForSample(current)) return current;
  const next = sampleWorkspaceState(user);
  if (current?.settings) {
    next.settings = { ...next.settings, ...current.settings };
  }
  if (current && force) {
    for (const key of ["products", "demands", "research"]) {
      const preserved = (current[key] || []).map((item) => ({ ...item, sample: true }));
      const preservedIds = new Set(preserved.map((item) => item.id));
      next[key] = [
        ...preserved,
        ...(next[key] || []).filter((item) => !preservedIds.has(item.id)),
      ];
    }
    next.rssSources = [
      ...(current.rssSources || []),
      ...(next.rssSources || []).filter((source) => !(current.rssSources || []).some((entry) => entry.id === source.id)),
    ];
  }
  saveUserState(user.id, next);
  return next;
}

export function ensureSeed(seed) {
  migrate();
  if (!getState()) saveState(seed);
  migrateLegacyState(seed);
  syncLegacyNewsTables();
}
