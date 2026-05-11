import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataDir = process.env.DATA_DIR || path.join(projectRoot, "data");
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, "pm-copilot.sqlite");

fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_data (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS news_sources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
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
      user_id TEXT NOT NULL DEFAULT 'default',
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_authority TEXT DEFAULT 'watchlist',
      original_title TEXT NOT NULL,
      original_url TEXT NOT NULL UNIQUE,
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
  `);

  const newsSourceColumns = new Set(db.prepare("PRAGMA table_info(news_sources)").all().map((column) => column.name));
  if (!newsSourceColumns.has("source_group")) {
    db.exec("ALTER TABLE news_sources ADD COLUMN source_group TEXT DEFAULT 'custom';");
  }
  if (!newsSourceColumns.has("brand")) {
    db.exec("ALTER TABLE news_sources ADD COLUMN brand TEXT DEFAULT '';");
  }
  if (!newsSourceColumns.has("last_item_count")) {
    db.exec("ALTER TABLE news_sources ADD COLUMN last_item_count INTEGER DEFAULT 0;");
  }
}

function syncLegacyNewsTables() {
  const state = getState();
  if (!state) return;

  const sourceCount = db.prepare("SELECT COUNT(*) AS count FROM news_sources").get().count;
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
          user_id: source.user_id || "default",
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

  const itemCount = db.prepare("SELECT COUNT(*) AS count FROM news_items").get().count;
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
          user_id: item.user_id || "default",
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
  return readJson("state", null);
}

export function saveState(state) {
  writeJson("state", state);
}

export function ensureSeed(seed) {
  migrate();
  if (!getState()) {
    saveState(seed);
  }
  syncLegacyNewsTables();
}
