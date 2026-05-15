import { nanoid } from "nanoid";
import { DEFAULT_TAG_GROUPS, normalizeTagGroups } from "./tag-config.js";

const HOST_OPTIONS = [
  "DJI Osmo Pocket 3",
  "DJI Osmo Pocket 4",
  "DJI Osmo Pocket 4 Pro",
  "DJI Osmo Pocket 5",
  "Insta360 Ace Pro",
  "Insta360 GO 3",
  "Insta360 X4",
  "GoPro HERO12",
  "GoPro HERO13",
  "iPhone 15 Pro",
  "iPhone 15 Pro Max",
  "iPhone 16 Pro",
  "Sony A7 IV",
  "Sony ZV-E10",
  "Canon EOS R5",
  "Canon EOS R6 Mark II",
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
    options: tagsFor("custom_tags"),
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

function cleanEntities(value, fallback = ["competitor"]) {
  const entities = Array.isArray(value)
    ? value.filter((item) => item === "competitor" || item === "inspiration")
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
  const normalized = normalizeFields(fields);
  return normalized.map((field) => ({
    key: field.legacyKey || legacyKeyForField(field.key),
    name: field.name,
    tone: field.tone,
    tags: cleanOptions(field.options),
    multi: field.multi !== false,
    entities: cleanEntities(field.entities, ["competitor"]),
    field_key: field.key,
    official: Boolean(field.official),
  }));
}

export function fieldsFromTagGroups(tagGroups = []) {
  const groups = normalizeTagGroups(tagGroups);
  const byKey = new Map(groups.map((group) => [group.key, group]));
  const official = DEFAULT_FIELDS.map((field) => {
    const group = byKey.get(field.legacyKey);
    return {
      ...field,
      name: group?.name || field.name,
      tone: normalizeTone(group?.tone, field.tone),
      multi: group?.multi !== undefined ? group.multi !== false : field.multi,
      entities: cleanEntities(group?.entities, field.entities),
      options: cleanOptions(group?.tags?.length ? group.tags : field.options),
    };
  });
  const officialLegacyKeys = new Set(DEFAULT_FIELDS.map((field) => field.legacyKey));
  const custom = Array.isArray(tagGroups)
    ? tagGroups
      .filter((group) => group && !officialLegacyKeys.has(group.key) && group.key !== "custom_tags")
      .map((group) => ({
        key: normalizeFieldKey(group.field_key || group.key, `u_${nanoid(8)}`),
        legacyKey: normalizeFieldKey(group.key, `u_${nanoid(8)}`),
        name: cleanText(group.name, group.key || "自定义字段"),
        tone: normalizeTone(group.tone),
        multi: group.multi !== false,
        official: false,
        entities: cleanEntities(group.entities, ["competitor", "inspiration"]),
        options: cleanOptions(group.tags),
      }))
    : [];
  return [...official, ...custom];
}

export function normalizeFields(fields = [], tagGroups = []) {
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
    normalized.push({
      key,
      legacyKey: normalizeFieldKey(item.legacyKey || fallback?.legacyKey || key, key),
      name: cleanText(item.name, fallback?.name || key),
      tone: normalizeTone(item.tone, fallback?.tone || "outline"),
      multi: item.multi !== false,
      official: fallback ? true : Boolean(item.official),
      entities: cleanEntities(item.entities, fallback?.entities || ["competitor"]),
      options: cleanOptions(item.options || item.tags || fallback?.options),
    });
  }
  for (const field of DEFAULT_FIELDS) {
    if (!seen.has(field.key)) normalized.push({ ...field, options: cleanOptions(field.options) });
  }
  return normalized;
}

export function normalizeSettingsFields(settings = {}) {
  const fields = normalizeFields(settings.fields, settings.tag_groups);
  return {
    ...settings,
    fields,
    tag_groups: fieldsToTagGroups(fields),
  };
}

export function fieldOptionsText(fields, key) {
  const normalized = normalizeFields(fields);
  if (key === "brands") {
    const brand = normalized.find((field) => field.key === "brand")?.options || [];
    const host = normalized.find((field) => field.key === "host")?.options || [];
    return JSON.stringify([...brand, ...host]);
  }
  const field = normalized.find((item) => item.key === key || item.legacyKey === key);
  return JSON.stringify(field?.options || []);
}
