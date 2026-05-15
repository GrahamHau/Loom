#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import { migrate, getLegacyUserId } from "../server/db.js";
import { createNewsSource, listNewsSources, pruneNewsOlderThan, upsertNews } from "../server/repository.js";

const DEFAULT_REMOTE = process.env.LOOM_STREAM_REMOTE || "tencent-sg-2222";
const DEFAULT_REMOTE_DB = process.env.LOOM_STREAM_REMOTE_DB || "/home/ubuntu/apps/loom/data/pm-copilot.sqlite";
const OFFICIAL_GROUPS = new Set(["official-default", "sample-live", "wechat-exporter"]);
const KEEP_DAYS = Math.max(1, Number(process.env.LOOM_STREAM_SYNC_DAYS || 10));

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  const remote = args.remote || DEFAULT_REMOTE;
  const remoteDbPath = args.db || DEFAULT_REMOTE_DB;
  const keepDays = Math.max(1, Number(args.days || KEEP_DAYS));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loom-official-stream-"));
  const localSnapshot = path.join(tmpDir, "pm-copilot.remote.sqlite");

  try {
    console.log(`[sync-official-stream] remote=${remote}`);
    console.log(`[sync-official-stream] remote_db=${remoteDbPath}`);
    console.log(`[sync-official-stream] keep_days=${keepDays}`);

    copyRemoteDb(remote, remoteDbPath, localSnapshot);
    const remoteDb = new Database(localSnapshot, { readonly: true });
    migrate();

    const legacyUserId = getLegacyUserId();
    const sourceRows = loadOfficialSources(remoteDb, legacyUserId);
    const itemRows = loadOfficialNewsItems(remoteDb, legacyUserId, keepDays);

    const syncedSources = syncOfficialSources(legacyUserId, sourceRows);
    const syncedItems = syncOfficialItems(legacyUserId, itemRows, keepDays);

    console.log(JSON.stringify({
      remote,
      remoteDbPath,
      keepDays,
      syncedSources,
      syncedItems,
    }, null, 2));
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Temporary cleanup is best effort.
    }
  }
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function copyRemoteDb(remote, remoteDbPath, localSnapshot) {
  execFileSync("ssh", [remote, `test -f '${shellEscape(remoteDbPath)}'`], { stdio: "inherit" });
  execFileSync("scp", [`${remote}:${remoteDbPath}`, localSnapshot], { stdio: "inherit" });
}

function loadOfficialSources(remoteDb, legacyUserId) {
  const rows = remoteDb.prepare(`
    SELECT *
    FROM news_sources
    WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(legacyUserId);
  return rows.filter((row) => OFFICIAL_GROUPS.has(String(row.source_group || row.group_name || "").toLowerCase()));
}

function loadOfficialNewsItems(remoteDb, legacyUserId, keepDays) {
  return remoteDb.prepare(`
    SELECT *
    FROM news_items
    WHERE user_id = ?
      AND datetime(COALESCE(published_at, created_at)) >= datetime('now', ?)
    ORDER BY datetime(COALESCE(published_at, created_at)) DESC, created_at DESC
  `).all(legacyUserId, `-${keepDays} day`).filter((row) => {
    const classification = parseJson(row.classification_json);
    const sourceGroup = String(classification?.source_group || "").toLowerCase();
    return OFFICIAL_GROUPS.has(sourceGroup);
  });
}

function syncOfficialSources(legacyUserId, sourceRows) {
  const existing = listNewsSources(legacyUserId);
  const byUrl = new Map(existing.map((source) => [String(source.url || ""), source]));
  let created = 0;
  let updated = 0;

  for (const row of sourceRows) {
    const sourceGroup = String(row.source_group || row.group_name || "custom");
    const payload = {
      name: row.name,
      url: row.url,
      type: row.type,
      language: row.language || "",
      authority: row.authority || "watchlist",
      group: row.group_name || sourceGroup,
      source_group: sourceGroup,
      brand: row.brand || "",
      interval: row.fetch_interval || 60,
      active: Number(row.is_active || 0) === 1,
      last_fetched_at: row.last_fetched_at || null,
      last_item_count: Number(row.last_item_count || 0),
      last_error: row.last_error || "",
    };
    const before = byUrl.get(String(row.url || ""));
    const next = createNewsSource(legacyUserId, payload);
    if (!next) continue;
    if (before) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return {
    totalRemote: sourceRows.length,
    created,
    updated,
  };
}

function syncOfficialItems(legacyUserId, itemRows, keepDays) {
  const items = itemRows.map((row) => {
    const classification = parseJson(row.classification_json);
    return {
      source_id: row.source_id,
      source: row.source_name,
      source_authority: row.source_authority || classification?.authority || "watchlist",
      original_title: row.original_title,
      original_url: row.original_url,
      original_content: row.original_content || row.original_summary || "",
      titleZh: row.title_zh || row.original_title,
      summary: row.summary_zh || row.original_summary || "",
      contentZh: row.content_zh || "",
      type: row.type,
      thumbnail_url: row.thumbnail_url || "",
      thumbHue: Number(row.thumb_hue ?? 40),
      published_at: row.published_at || row.created_at,
      llmProcessed: Number(row.llm_processed || 0) === 1,
      needsTranslation: Number(row.needs_translation || 0) === 1,
      classification,
    };
  });

  const result = upsertNews(legacyUserId, items);
  const pruned = pruneNewsOlderThan(legacyUserId, {
    sourceGroups: Array.from(OFFICIAL_GROUPS),
    olderThanDays: keepDays,
  });

  return {
    totalRemote: itemRows.length,
    inserted: result.inserted.length,
    updated: result.updated.length,
    pruned,
  };
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function shellEscape(value) {
  return String(value).replace(/'/g, `'\\''`);
}
