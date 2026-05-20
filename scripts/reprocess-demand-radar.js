#!/usr/bin/env node
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { db, getLegacyUserId, getUserState, migrate, saveUserState } from "../server/db.js";
import { parseDemandRaw } from "../server/parsers.js";

dotenv.config({ path: [".env.local", ".env"] });

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  migrate();
  const args = parseArgs(process.argv.slice(2));
  const userId = cleanText(args["user-id"] || process.env.LOOM_PASSWORD_USER_ID || getLegacyUserId(), getLegacyUserId());
  const sourceFilter = cleanText(args.source || "xiaohongshu", "xiaohongshu");
  const dryRun = Boolean(args["dry-run"]);
  const limit = Number(args.limit || 0);
  const state = clone(getUserState(userId));
  if (!state) throw new Error(`user_state_not_found:${userId}`);
  if (!Array.isArray(state.demands) || !state.demands.length) {
    console.log(JSON.stringify({ userId, sourceFilter, processed: 0, changed: 0, skipped: 0, message: "no demands" }, null, 2));
    return;
  }

  const dbPath = path.resolve(process.env.DATABASE_PATH || path.join(process.cwd(), "data", "loom.remote.snapshot.sqlite"));
  const backupPath = `${dbPath}.demand-reclean-${Date.now()}.bak`;
  if (!dryRun) {
    await db.backup(backupPath);
  }

  const summary = {
    userId,
    sourceFilter,
    dryRun,
    backupPath: dryRun ? "" : backupPath,
    total: state.demands.length,
    considered: 0,
    processed: 0,
    changed: 0,
    skipped: 0,
    errors: 0,
    sampleChanges: [],
  };

  for (const [index, demand] of state.demands.entries()) {
    if (limit > 0 && summary.considered >= limit) break;
    if (sourceFilter && sourceFilter !== "all") {
      const demandSource = cleanText(demand.source_platform || demand.source || "", "");
      if (demandSource !== sourceFilter) {
        summary.skipped += 1;
        continue;
      }
    }
    summary.considered += 1;
    try {
      const platform = cleanText(demand.source_platform || demand.source || sourceFilter, sourceFilter);
      const parsed = await parseDemandRaw(userId, {
        platform,
        data: {
          ...demand,
          platform,
          image_urls: Array.isArray(demand.image_urls) ? demand.image_urls : [],
        },
      });
      const next = {
        ...demand,
        ...parsed,
        title: cleanText(parsed.title || demand.title, demand.title),
        summary: cleanText(parsed.summary || demand.summary || "", demand.summary || ""),
        original_content: cleanText(demand.original_content || parsed.original_content || demand.summary || "", ""),
        host: cleanText(parsed.host || "", ""),
        host_match: parsed.host_match || null,
        scenarios: Array.isArray(parsed.tags_scenario) ? parsed.tags_scenario : [],
        painpoints: Array.isArray(parsed.tags_painpoint) ? parsed.tags_painpoint : [],
        innovation: cleanText(parsed.tags_innovation || "待分类", "待分类"),
        tags_category: Array.isArray(parsed.tags_category) ? parsed.tags_category : [],
        tag_values: parsed.tag_values || {},
        tags: [],
        tags_custom: [],
        __loom_ai_processed: true,
        __loom_ai_job_id: "",
        updated_at: new Date().toISOString(),
      };
      if (JSON.stringify(next) !== JSON.stringify(demand)) {
        summary.changed += 1;
        if (summary.sampleChanges.length < 10) {
          summary.sampleChanges.push({
            id: demand.id,
            title: next.title,
            host: next.host || "",
            scenarios: next.scenarios,
            painpoints: next.painpoints,
            innovation: next.innovation,
          });
        }
      }
      state.demands[index] = next;
      summary.processed += 1;
    } catch (error) {
      summary.errors += 1;
      if (summary.sampleChanges.length < 10) {
        summary.sampleChanges.push({
          id: demand.id,
          title: demand.title,
          error: error?.message || "reprocess_failed",
        });
      }
    }
  }

  if (!dryRun && summary.changed) {
    saveUserState(userId, state);
  }

  console.log(JSON.stringify(summary, null, 2));
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
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
