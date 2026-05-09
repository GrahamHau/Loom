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
  `);
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
}
