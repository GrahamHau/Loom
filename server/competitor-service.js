import { nanoid } from "nanoid";
import { db } from "./db.js";
import { migrateKnowledgeSchema } from "./knowledge-schema.js";

migrateKnowledgeSchema();

const DEFAULT_LIGHTING_TEMPLATE = {
  id: "cat_lighting_continuous",
  version: 1,
  name: "Continuous Lighting",
  required_fields: [
    { key: "wattage", label: "功率", type: "number", unit: "W", enum_values: null },
    { key: "cri", label: "CRI", type: "number", unit: null, enum_values: null },
    { key: "color_temp", label: "色温", type: "string", unit: "K", enum_values: null },
  ],
  optional_fields: [
    { key: "weight", label: "重量", type: "number", unit: "g", enum_values: null },
    { key: "battery", label: "电池", type: "boolean", unit: null, enum_values: null },
  ],
};

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function jsonText(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function normalizeModel(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\bii\b/g, "2")
    .replace(/\biii\b/g, "3")
    .replace(/\biv\b/g, "4")
    .replace(/[\s_-]+/g, "")
    .replace(/version|mark|mk/g, "");
}

export function competitorMatchKey(brand, model) {
  return `${cleanText(brand).toLowerCase()}|${normalizeModel(model)}`;
}

function ensureDefaultCategoryTemplates(workspaceId) {
  const existing = db.prepare(`
    SELECT id FROM category_templates WHERE workspace_id = ? AND id = ? AND version = ?
  `).get(workspaceId, DEFAULT_LIGHTING_TEMPLATE.id, DEFAULT_LIGHTING_TEMPLATE.version);
  if (existing) return;
  db.prepare(`
    INSERT INTO category_templates (
      id, version, name, required_fields_json, optional_fields_json, workspace_id
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    DEFAULT_LIGHTING_TEMPLATE.id,
    DEFAULT_LIGHTING_TEMPLATE.version,
    DEFAULT_LIGHTING_TEMPLATE.name,
    jsonText(DEFAULT_LIGHTING_TEMPLATE.required_fields, []),
    jsonText(DEFAULT_LIGHTING_TEMPLATE.optional_fields, []),
    workspaceId
  );
}

function mapTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    version: Number(row.version || 1),
    name: row.name,
    required_fields: parseJson(row.required_fields_json, []),
    optional_fields: parseJson(row.optional_fields_json, []),
    workspace_id: row.workspace_id,
    created_at: row.created_at,
  };
}

function latestTemplate(workspaceId, categoryId) {
  ensureDefaultCategoryTemplates(workspaceId);
  return mapTemplate(db.prepare(`
    SELECT * FROM category_templates
    WHERE workspace_id = ? AND id = ?
    ORDER BY version DESC
    LIMIT 1
  `).get(workspaceId, categoryId)) || {
    id: categoryId,
    version: 1,
    name: categoryId,
    required_fields: [],
    optional_fields: [],
    workspace_id: workspaceId,
  };
}

function mapCompetitor(row) {
  if (!row) return null;
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    canonical_name: row.canonical_name,
    category_id: row.category_id,
    category_template_version: Number(row.category_template_version || 1),
    cover_image_url: row.cover_image_url || null,
    status: row.status,
    match_key: row.match_key,
    workspace_id: row.workspace_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapPlatform(row) {
  if (!row) return null;
  return {
    id: row.id,
    competitor_id: row.competitor_id,
    platform: row.platform,
    url: row.url,
    price_value: row.price_value === null ? null : Number(row.price_value),
    price_currency: row.price_currency || null,
    rating: row.rating === null ? null : Number(row.rating),
    review_count: row.review_count === null ? null : Number(row.review_count),
    monthly_sales_estimate: row.monthly_sales_estimate === null ? null : Number(row.monthly_sales_estimate),
    status: row.status,
    raw_image_url: row.raw_image_url || null,
    workspace_id: row.workspace_id,
    first_seen_at: row.first_seen_at,
    last_synced_at: row.last_synced_at,
  };
}

function specValueFields(value) {
  if (typeof value === "number") return { value_number: value, value_string: null, value_boolean: null };
  if (typeof value === "boolean") return { value_number: null, value_string: null, value_boolean: value ? 1 : 0 };
  return { value_number: null, value_string: cleanText(value), value_boolean: null };
}

function upsertSpecs(workspaceId, competitorId, specs = {}) {
  if (!specs || typeof specs !== "object" || Array.isArray(specs)) return;
  for (const [key, value] of Object.entries(specs)) {
    if (value === undefined || value === null || value === "") continue;
    const fields = specValueFields(value);
    db.prepare(`
      INSERT INTO competitor_specs (
        id, competitor_id, key, value_number, value_string, value_boolean, source_evidence_id, workspace_id
      ) VALUES (?, ?, ?, ?, ?, ?, '', ?)
      ON CONFLICT(competitor_id, key) DO UPDATE SET
        value_number = excluded.value_number,
        value_string = excluded.value_string,
        value_boolean = excluded.value_boolean
    `).run(`cs_${nanoid(12)}`, competitorId, key, fields.value_number, fields.value_string, fields.value_boolean, workspaceId);
  }
}

function specsFor(competitorId) {
  return db.prepare("SELECT * FROM competitor_specs WHERE competitor_id = ? ORDER BY key").all(competitorId).map((row) => ({
    id: row.id,
    competitor_id: row.competitor_id,
    key: row.key,
    value_number: row.value_number === null ? null : Number(row.value_number),
    value_string: row.value_string,
    value_boolean: row.value_boolean === null ? null : Boolean(row.value_boolean),
    source_evidence_id: row.source_evidence_id || null,
    workspace_id: row.workspace_id,
  }));
}

function updateAutoCover(competitorId) {
  const competitor = db.prepare("SELECT * FROM competitors WHERE id = ?").get(competitorId);
  if (!competitor || competitor.cover_image_mode === "manual") return;
  const image = db.prepare(`
    SELECT raw_image_url FROM competitor_platforms
    WHERE competitor_id = ? AND COALESCE(raw_image_url, '') != ''
    ORDER BY rating DESC NULLS LAST, review_count DESC NULLS LAST, first_seen_at ASC
    LIMIT 1
  `).get(competitorId)?.raw_image_url || "";
  if (image) {
    db.prepare("UPDATE competitors SET cover_image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(image, competitorId);
  }
}

export function createCompetitor(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const brand = cleanText(input.brand);
  const model = cleanText(input.model);
  const categoryId = cleanText(input.category_id, "uncategorized");
  if (!workspaceId || !brand || !model) throw new Error("brand, model and workspace_id required");
  const template = latestTemplate(workspaceId, categoryId);
  const matchKey = competitorMatchKey(brand, model);
  const existing = db.prepare("SELECT * FROM competitors WHERE workspace_id = ? AND match_key = ?").get(workspaceId, matchKey);
  if (existing) {
    upsertSpecs(workspaceId, existing.id, input.specs);
    return { competitor: withDetails(existing.id), matched_existing: true };
  }
  const id = input.id || `cmp_${nanoid(12)}`;
  db.prepare(`
    INSERT INTO competitors (
      id, brand, model, canonical_name, category_id, category_template_version,
      cover_image_url, cover_image_mode, status, match_key, workspace_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    brand,
    model,
    cleanText(input.canonical_name, `${brand} ${model}`),
    categoryId,
    template.version,
    cleanText(input.cover_image_url),
    input.cover_image_url ? "manual" : "auto",
    cleanText(input.status, "tracking"),
    matchKey,
    workspaceId
  );
  upsertSpecs(workspaceId, id, input.specs);
  return { competitor: withDetails(id), matched_existing: false };
}

export function addCompetitorPlatform(competitorId, input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const url = cleanText(input.url);
  if (!workspaceId || !url) throw new Error("workspace_id and url required");
  const competitor = db.prepare("SELECT * FROM competitors WHERE id = ? AND workspace_id = ?").get(competitorId, workspaceId);
  if (!competitor) {
    const error = new Error("competitor_not_found");
    error.status = 404;
    throw error;
  }
  const existingUrl = db.prepare("SELECT * FROM competitor_platforms WHERE workspace_id = ? AND url = ?").get(workspaceId, url);
  if (existingUrl && existingUrl.competitor_id !== competitorId) {
    const error = new Error("url already attached");
    error.status = 409;
    throw error;
  }
  if (existingUrl) return mapPlatform(existingUrl);
  const id = input.id || `cpl_${nanoid(12)}`;
  db.prepare(`
    INSERT INTO competitor_platforms (
      id, competitor_id, platform, url, price_value, price_currency, rating,
      review_count, monthly_sales_estimate, status, raw_image_url, workspace_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    competitorId,
    cleanText(input.platform, "other"),
    url,
    input.price_value ?? null,
    cleanText(input.price_currency),
    input.rating ?? null,
    input.review_count ?? null,
    input.monthly_sales_estimate ?? null,
    cleanText(input.status, "live"),
    cleanText(input.raw_image_url),
    workspaceId
  );
  updateAutoCover(competitorId);
  return mapPlatform(db.prepare("SELECT * FROM competitor_platforms WHERE id = ?").get(id));
}

function withDetails(competitorId) {
  const competitor = mapCompetitor(db.prepare("SELECT * FROM competitors WHERE id = ?").get(competitorId));
  if (!competitor) return null;
  const template = latestTemplate(competitor.workspace_id, competitor.category_id);
  const specs = specsFor(competitor.id);
  const specKeys = new Set(specs.map((spec) => spec.key));
  return {
    ...competitor,
    platforms: db.prepare("SELECT * FROM competitor_platforms WHERE competitor_id = ? ORDER BY first_seen_at").all(competitor.id).map(mapPlatform),
    specs,
    missing_required_specs: template.required_fields.map((field) => field.key).filter((key) => !specKeys.has(key)),
  };
}

function passesFilter(competitor, filters = []) {
  if (!filters.length) return true;
  const specs = Object.fromEntries((competitor.specs || []).map((spec) => [spec.key, spec]));
  return filters.every((filter) => {
    const spec = specs[filter.key];
    if (!spec) return false;
    const value = spec.value_number ?? spec.value_string ?? spec.value_boolean;
    if (filter.op === ">=") return Number(value) >= Number(filter.value);
    if (filter.op === "<=") return Number(value) <= Number(filter.value);
    if (filter.op === ">") return Number(value) > Number(filter.value);
    if (filter.op === "<") return Number(value) < Number(filter.value);
    return String(value) === String(filter.value);
  });
}

export function listCompetitors(workspaceId, filters = {}) {
  ensureDefaultCategoryTemplates(workspaceId);
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];
  if (filters.category) {
    clauses.push("category_id = ?");
    params.push(filters.category);
  }
  let specFilters = [];
  if (filters.filter) {
    specFilters = typeof filters.filter === "string" ? parseJson(filters.filter, []) : filters.filter;
    if (!Array.isArray(specFilters)) specFilters = [];
  }
  return db.prepare(`SELECT id FROM competitors WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC`)
    .all(...params)
    .map((row) => withDetails(row.id))
    .filter((item) => passesFilter(item, specFilters))
    .slice(0, Math.min(500, Math.max(1, Number(filters.limit || 50))));
}

export function listCategoryTemplates(workspaceId) {
  ensureDefaultCategoryTemplates(workspaceId);
  return db.prepare(`
    SELECT t.*
    FROM category_templates t
    JOIN (
      SELECT workspace_id, id, MAX(version) AS version
      FROM category_templates
      WHERE workspace_id = ?
      GROUP BY workspace_id, id
    ) latest ON latest.workspace_id = t.workspace_id AND latest.id = t.id AND latest.version = t.version
    ORDER BY t.id
  `).all(workspaceId).map(mapTemplate);
}

export function mergeCompetitors(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const keepId = cleanText(input.keep_id);
  const mergeId = cleanText(input.merge_id);
  if (!workspaceId || !keepId || !mergeId || keepId === mergeId) throw new Error("invalid_merge");
  const moved = db.prepare("SELECT COUNT(*) AS count FROM competitor_platforms WHERE competitor_id = ?").get(mergeId).count;
  db.prepare("UPDATE competitor_platforms SET competitor_id = ? WHERE competitor_id = ?").run(keepId, mergeId);
  db.prepare("DELETE FROM competitors WHERE id = ? AND workspace_id = ?").run(mergeId, workspaceId);
  updateAutoCover(keepId);
  return { kept: withDetails(keepId), platforms_moved: moved };
}
