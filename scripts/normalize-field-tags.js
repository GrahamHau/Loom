#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import { DEFAULT_TAG_GROUPS } from "../server/tag-config.js";
import { normalizeSettingsFields } from "../server/field-config.js";

const DEFAULT_LOCAL_DB = path.resolve("data/loom.remote.snapshot.sqlite");
const OFFICIAL_CATEGORY_OPTIONS = DEFAULT_TAG_GROUPS.find((group) => group.key === "product_categories")?.tags || [];

const CATEGORY_RULES = [
  ["A音视频类", /音频|视频|影像|相机|云台|运动相机|麦克风|收音|监视器|图传|采集卡|audio|video|camera/i],
  ["B箱包带类", /箱|包|背包|收纳|肩带|腕带|挂绳|strap|bag|case/i],
  ["C配件类", /配件|保护|外壳|壳|贴膜|转接|快装|冷靴|热靴|夹|夹具|adapter|mount|plate|case/i],
  ["E供电类", /供电|电池|充电|电源|移动电源|充电器|battery|power|charger/i],
  ["L灯光类", /灯|补光|柔光|照明|led|light/i],
  ["T脚架类", /脚架|三脚架|独脚架|云台架|tripod|monopod/i],
  ["S支架类", /支架|支撑|支臂|支杆|支撑架|stand|bracket|arm/i],
  ["I智能工作室", /智能工作室|工作室|直播间|studio/i],
];

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = path.resolve(String(args.db || process.env.DATABASE_PATH || DEFAULT_LOCAL_DB));
  const dryRun = Boolean(args["dry-run"]);
  const clearEmergentValues = Boolean(args["clear-emergent-values"]);
  if (!fs.existsSync(dbPath)) {
    console.log(`[fields:normalize-tags] database not found: ${dbPath}`);
    process.exit(0);
  }
  const db = new Database(dbPath);
  try {
    const check = db.pragma("quick_check", { simple: true });
    if (check !== "ok") throw new Error(`SQLite quick_check failed: ${check}`);
    const rows = db.prepare("SELECT key, value FROM app_data WHERE key = 'state' OR key LIKE 'state:user:%'").all();
    const summary = {
      db: dbPath,
      dryRun,
      clearEmergentValues,
      statesScanned: rows.length,
      statesChanged: 0,
      productsChanged: 0,
      demandsChanged: 0,
      settingsChanged: 0,
      customTagValuesRemoved: 0,
      categoriesNormalized: 0,
      emergentValuesCleared: 0,
    };
    const update = db.prepare("UPDATE app_data SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?");
    const tx = db.transaction((changes) => {
      for (const item of changes) update.run(JSON.stringify(item.state, null, 2), item.key);
    });
    const changes = [];
    for (const row of rows) {
      const state = JSON.parse(row.value);
      const before = JSON.stringify(state);
      normalizeState(state, summary, { clearEmergentValues });
      if (JSON.stringify(state) !== before) {
        summary.statesChanged += 1;
        changes.push({ key: row.key, state });
      }
    }
    if (!dryRun && changes.length) tx(changes);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    db.close();
  }
}

function normalizeState(state, summary, options) {
  if (!state || typeof state !== "object") return;
  if (state.settings) {
    const before = JSON.stringify(state.settings);
    state.settings = normalizeSettingsFields(state.settings);
    if (JSON.stringify(state.settings) !== before) summary.settingsChanged += 1;
  }
  for (const product of Array.isArray(state.products) ? state.products : []) {
    const before = JSON.stringify(product);
    normalizeProduct(product, summary);
    if (JSON.stringify(product) !== before) summary.productsChanged += 1;
  }
  for (const demand of Array.isArray(state.demands) ? state.demands : []) {
    const before = JSON.stringify(demand);
    normalizeDemand(demand, summary, options);
    if (JSON.stringify(demand) !== before) summary.demandsChanged += 1;
  }
}

function normalizeProduct(product, summary) {
  const values = normalizeTagValues(product.tag_values);
  if (values.custom_tags) {
    delete values.custom_tags;
    summary.customTagValuesRemoved += 1;
  }
  const normalizedCategories = normalizeCategoryValues([
    ...arrayValues(values.category),
    ...splitTokenText(product.category),
  ]);
  if (normalizedCategories.length) {
    if (JSON.stringify(arrayValues(values.category)) !== JSON.stringify(normalizedCategories)) summary.categoriesNormalized += 1;
    values.category = normalizedCategories;
    product.category = normalizedCategories.join(" / ");
  } else {
    delete values.category;
    product.category = "";
  }
  if (arrayValues(values.brand).length) product.brand = arrayValues(values.brand).join(" / ");
  if (arrayValues(values.host).length) product.host = arrayValues(values.host).join(" / ");
  product.tags = [];
  product.tag_values = values;
}

function normalizeDemand(demand, summary, { clearEmergentValues }) {
  const values = normalizeTagValues(demand.tag_values);
  if (values.custom_tags) {
    delete values.custom_tags;
    summary.customTagValuesRemoved += 1;
  }
  demand.tags = [];
  demand.tags_custom = [];
  if (clearEmergentValues) {
    for (const key of ["scenarios", "painpoints", "innovation"]) {
      if (values[key]?.length) {
        delete values[key];
        summary.emergentValuesCleared += 1;
      }
    }
    demand.scenarios = [];
    demand.painpoints = [];
    demand.innovation = "待分类";
  } else {
    if (arrayValues(values.scenarios).length) demand.scenarios = arrayValues(values.scenarios);
    if (arrayValues(values.painpoints).length) demand.painpoints = arrayValues(values.painpoints);
    if (arrayValues(values.innovation).length) demand.innovation = arrayValues(values.innovation)[0];
  }
  demand.tag_values = values;
}

function normalizeTagValues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const cleanKey = String(key || "").trim().replace(/[^a-zA-Z0-9_:-]+/g, "_").slice(0, 80);
    const values = arrayValues(raw);
    if (cleanKey && values.length) out[cleanKey] = values;
  }
  return out;
}

function normalizeCategoryValues(values) {
  const normalized = [];
  for (const value of arrayValues(values)) {
    const match = normalizeCategoryValue(value);
    if (match && !normalized.includes(match)) normalized.push(match);
  }
  return normalized;
}

function normalizeCategoryValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (OFFICIAL_CATEGORY_OPTIONS.includes(text)) return text;
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  return "X其他类";
}

function arrayValues(value) {
  const input = Array.isArray(value) ? value : [value];
  return Array.from(new Set(input.map((item) => String(item ?? "").trim()).filter(Boolean))).slice(0, 50);
}

function splitTokenText(value) {
  return String(value || "")
    .split(/\s*(?:\/|,|，|、|\|)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
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
