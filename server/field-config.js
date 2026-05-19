import { nanoid } from "nanoid";
import { DEFAULT_TAG_GROUPS, normalizeTagGroups } from "./tag-config.js";

const HOST_OPTIONS = [
  "Osmo Pocket 3",
  "Osmo Action 5 Pro",
  "Osmo Action 4",
  "Osmo Mobile 7P",
  "Osmo Mobile 7",
  "DJI Mini 4 Pro",
  "DJI Air 3S",
  "DJI Flip",
  "DJI Neo",
  "Insta360 Ace Pro 2",
  "Insta360 Ace Pro",
  "Insta360 X5",
  "Insta360 GO 3",
  "Insta360 GO 3S",
  "Insta360 X4",
  "Insta360 Flow 2 Pro",
  "Insta360 Flow 2",
  "Insta360 Flow Pro",
];

function tagsFor(key) {
  const group = DEFAULT_TAG_GROUPS.find((item) => item.key === key);
  return group?.tags || [];
}

export const DEFAULT_FIELDS = [
  {
    key: "brand",
    legacyKey: "competitor_brands",
    name: "品牌",
    tone: "outline",
    multi: true,
    official: true,
    entities: ["competitor"],
    entity_level: "competitor",
    options: tagsFor("competitor_brands"),
  },
  {
    key: "host",
    legacyKey: "camera_brands",
    name: "主机",
    tone: "outline",
    multi: false,
    official: true,
    entities: ["competitor"],
    entity_level: "competitor",
    options: HOST_OPTIONS,
  },
  {
    key: "category",
    legacyKey: "product_categories",
    name: "品类",
    tone: "default",
    multi: true,
    official: true,
    entities: ["competitor"],
    entity_level: "competitor",
    options: tagsFor("product_categories"),
  },
  {
    key: "scenarios",
    legacyKey: "scenarios",
    name: "使用场景",
    tone: "accent",
    multi: true,
    official: true,
    entities: ["competitor", "inspiration"],
    entity_level: "competitor",
    options: tagsFor("scenarios"),
  },
  {
    key: "painpoints",
    legacyKey: "painpoints",
    name: "用户痛点",
    tone: "danger",
    multi: true,
    official: true,
    entities: ["competitor", "inspiration"],
    entity_level: "competitor",
    options: tagsFor("painpoints"),
  },
  {
    key: "innovation",
    legacyKey: "innovation_types",
    name: "创新类型",
    tone: "success",
    multi: false,
    official: true,
    entities: ["inspiration"],
    entity_level: "inspiration",
    options: tagsFor("innovation_types"),
  },
  {
    key: "custom_tags",
    legacyKey: "custom_tags",
    name: "自定义标签",
    tone: "outline",
    multi: true,
    official: true,
    entities: ["competitor", "inspiration"],
    entity_level: "competitor",
    options: tagsFor("custom_tags"),
  },
  {
    key: "price",
    legacyKey: "price",
    name: "价格",
    tone: "default",
    multi: false,
    official: true,
    entities: ["product"],
    entity_level: "product",
    options: [],
  },
  {
    key: "monthly_sales",
    legacyKey: "monthly_sales",
    name: "月销",
    tone: "accent",
    multi: false,
    official: true,
    entities: ["product"],
    entity_level: "product",
    options: [],
  },
  {
    key: "rating",
    legacyKey: "rating",
    name: "评分",
    tone: "success",
    multi: false,
    official: true,
    entities: ["product"],
    entity_level: "product",
    options: [],
  },
];

export function cloneFields(fields = DEFAULT_FIELDS) {
  return JSON.parse(JSON.stringify(fields));
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function cleanOptions(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => cleanText(item)).filter(Boolean))).slice(0, 200);
}

function mergedOfficialOptions(currentOptions, fallbackOptions) {
  return cleanOptions([
    ...(Array.isArray(fallbackOptions) ? fallbackOptions : []),
    ...(Array.isArray(currentOptions) ? currentOptions : []),
  ]);
}

function cleanEntities(value, fallback = ["competitor"]) {
  const entities = Array.isArray(value)
    ? value.filter((item) => ["competitor", "inspiration", "product", "sku", "category", "demand"].includes(item))
    : [];
  return entities.length ? Array.from(new Set(entities)) : fallback;
}

function normalizeTone(value, fallback = "outline") {
  return ["default", "outline", "accent", "success", "warn", "danger"].includes(value) ? value : fallback;
}

function normalizeFieldKey(value, fallback = "") {
  return cleanText(value, fallback)
    .replace(/[^a-zA-Z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function legacyKeyForField(key) {
  return DEFAULT_FIELDS.find((field) => field.key === key)?.legacyKey || key;
}

export function fieldsToTagGroups(fields = []) {
  const normalized = normalizeFields(fields, [], { includeDefaults: false });
  return normalized.map((field) => ({
    key: field.legacyKey || legacyKeyForField(field.key),
    name: field.name,
    tone: field.tone,
    tags: cleanOptions(field.options),
    multi: field.multi !== false,
    entities: cleanEntities(field.entities, ["competitor"]),
    entity_level: field.entity_level || "competitor",
    field_key: field.key,
    official: Boolean(field.official),
  }));
}

export function fieldsFromTagGroups(tagGroups = []) {
  const groups = normalizeTagGroups(tagGroups);
  const byKey = new Map(groups.map((group) => [group.key, group]));
  const officialLegacyKeys = new Set(DEFAULT_FIELDS.map((field) => field.legacyKey));
  return Array.isArray(tagGroups)
    ? tagGroups
      .filter((group) => group && !officialLegacyKeys.has(group.key))
      .map((group) => ({
        key: normalizeFieldKey(group.field_key || group.key, `u_${nanoid(8)}`),
        legacyKey: normalizeFieldKey(group.key, `u_${nanoid(8)}`),
        name: cleanText(group.name, group.key || "自定义字段"),
        tone: normalizeTone(group.tone),
        multi: group.multi !== false,
        official: false,
        entities: cleanEntities(group.entities, ["competitor", "inspiration"]),
        entity_level: cleanText(group.entity_level, "competitor"),
        options: cleanOptions(group.tags),
      }))
    : [];
}

export function normalizeFields(fields = [], tagGroups = [], options = {}) {
  const includeDefaults = options.includeDefaults === true;
  const source = Array.isArray(fields) && fields.length ? fields : fieldsFromTagGroups(tagGroups);
  const defaultsByKey = new Map(DEFAULT_FIELDS.map((field) => [field.key, field]));
  const seen = new Set();
  const normalized = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const fallback = defaultsByKey.get(item.key);
    const key = normalizeFieldKey(item.key, fallback?.key || `u_${nanoid(8)}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const sourceOptions = item.options || item.tags;
    normalized.push({
      key,
      legacyKey: normalizeFieldKey(item.legacyKey || fallback?.legacyKey || key, key),
      name: cleanText(item.name, fallback?.name || key),
      tone: normalizeTone(item.tone, fallback?.tone || "outline"),
      multi: item.multi !== false,
      official: fallback ? true : Boolean(item.official),
      entities: cleanEntities(item.entities, fallback?.entities || ["competitor"]),
      entity_level: cleanText(item.entity_level, fallback?.entity_level || "competitor"),
      options: fallback
        ? mergedOfficialOptions(sourceOptions, fallback?.options)
        : cleanOptions(sourceOptions),
    });
  }
  if (includeDefaults) {
    for (const field of DEFAULT_FIELDS) {
      if (!seen.has(field.key)) normalized.push({ ...field, options: cleanOptions(field.options) });
    }
  }
  return normalized;
}

export function normalizeSettingsFields(settings = {}) {
  const fields = normalizeFields(Array.isArray(settings.fields) ? settings.fields : [], [], { includeDefaults: false })
    .filter((field) => !field.official);
  return {
    ...settings,
    fields,
    tag_groups: fieldsToTagGroups(fields),
  };
}

export function fieldOptionsText(fields, key) {
  const normalized = normalizeFields(fields, [], { includeDefaults: true });
  const field = normalized.find((item) => item.key === key || item.legacyKey === key);
  return JSON.stringify(field?.options || []);
}
