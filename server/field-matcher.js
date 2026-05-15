import { normalizeFields } from "./field-config.js";

const FIELD_ALIASES = {
  brand: ["brand", "品牌", "品牌名", "厂商", "厂牌", "manufacturer", "maker"],
  host: ["host", "主机", "适配主机", "设备型号", "相机型号", "机型", "model", "device"],
  category: ["category", "品类", "产品品类", "类目", "分类"],
  scenarios: ["scenarios", "使用场景", "场景", "应用场景", "use case", "usecase"],
  painpoints: ["painpoints", "用户痛点", "痛点", "问题", "problem"],
  innovation: ["innovation", "创新类型", "创新", "innovation type"],
  custom_tags: ["custom_tags", "自定义标签", "标签", "tag", "tags"],
};

const OPTION_ALIASES = {
  "Osmo Pocket 3": ["DJI Osmo Pocket 3", "DJI Pocket 3", "Pocket 3", "pocket3", "大疆 Pocket 3"],
  "Osmo Action 5 Pro": ["DJI Osmo Action 5 Pro", "Action 5 Pro", "action5pro", "大疆 Action 5 Pro"],
  "Osmo Action 4": ["DJI Osmo Action 4", "Action 4", "action4", "大疆 Action 4"],
  "Osmo Mobile 7P": ["DJI Osmo Mobile 7P", "OM 7P", "OM7P", "Mobile 7P"],
  "Osmo Mobile 7": ["DJI Osmo Mobile 7", "OM 7", "OM7", "Mobile 7"],
  "Insta360 Ace Pro 2": ["Ace Pro 2", "影石 Ace Pro 2", "Insta Ace Pro 2"],
  "Insta360 Ace Pro": ["Ace Pro", "影石 Ace Pro", "Insta Ace Pro"],
  "Insta360 GO 3S": ["GO 3S", "Go3S", "影石 GO 3S"],
  "Insta360 GO 3": ["GO 3", "Go3", "影石 GO 3"],
  "Insta360 X5": ["X5", "影石 X5"],
  "Insta360 X4": ["X4", "影石 X4"],
  "Vlog/自拍": ["vlog", "自拍", "自拍拍摄", "Vlog 自拍", "vlog自拍"],
  "直播/带货": ["直播", "带货", "直播带货"],
  "短视频创作": ["短视频", "内容创作", "创作"],
  "户外旅拍": ["旅拍", "户外", "旅行拍摄"],
  "桌面俯拍": ["俯拍", "桌面拍摄", "桌拍"],
  "携带不便/太重": ["太重", "重", "携带不便", "不便携"],
  "价格过高/性价比低": ["太贵", "贵", "价格高", "性价比低", "有点小贵"],
  "操作复杂/学习成本高": ["操作复杂", "学习成本", "难上手"],
};

function cleanText(value) {
  return String(value ?? "").trim();
}

function compact(value) {
  return cleanText(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_\-—–/|｜·.,，。:：;；()[\]{}"'“”‘’+]+/g, "");
}

function uniqueList(value) {
  const list = Array.isArray(value) ? value : [value];
  return Array.from(new Set(list.map((item) => cleanText(item)).filter(Boolean)));
}

function splitExplicitValues(value) {
  if (Array.isArray(value)) return value;
  return cleanText(value)
    .split(/\s*(?:\/|,|，|、|\|)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitFieldValues(value) {
  const list = Array.isArray(value) ? value : [value];
  return uniqueList(list.flatMap((item) => cleanText(item).split(/\s*(?:\/|,|，|、|;|；|\n)\s*/)));
}

function levenshtein(a, b) {
  const left = compact(a);
  const right = compact(b);
  if (!left || !right) return Math.max(left.length, right.length);
  const prev = Array.from({ length: right.length + 1 }, (_, index) => index);
  const curr = Array(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[right.length];
}

function similarity(a, b) {
  const left = compact(a);
  const right = compact(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length) >= 0.45 ? 0.88 : 0.74;
  }
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function candidatesFor(option) {
  return [option, ...(OPTION_ALIASES[option] || [])];
}

export function matchFieldKey(rawKey, fields = []) {
  const normalized = normalizeFields(fields);
  const query = compact(rawKey);
  if (!query) return null;
  let best = null;
  for (const field of normalized) {
    const aliases = [field.key, field.legacyKey, field.name, ...(FIELD_ALIASES[field.key] || [])];
    for (const alias of aliases) {
      const score = similarity(query, alias);
      if (!best || score > best.confidence) {
        best = { field, confidence: score, matched: alias };
      }
    }
  }
  return best && best.confidence >= 0.72 ? best : null;
}

export function matchFieldOption(rawValue, field = {}, options = {}) {
  const value = cleanText(rawValue);
  if (!value) return null;
  const choices = uniqueList(field.options);
  let best = null;
  for (const option of choices) {
    for (const candidate of candidatesFor(option)) {
      const score = similarity(value, candidate);
      if (!best || score > best.confidence) {
        best = { value: option, raw: value, confidence: score, matched: candidate };
      }
    }
  }
  const threshold = options.threshold ?? (field.multi === false ? 0.86 : 0.82);
  if (best && best.confidence >= threshold) return { ...best, method: "fuzzy" };
  return options.keepUnmatched === false ? null : { value, raw: value, confidence: 0, method: "raw" };
}

export function normalizeTagValues(tagValues = {}, fields = [], options = {}) {
  const normalizedFields = normalizeFields(fields);
  const byKey = new Map(normalizedFields.map((field) => [field.key, field]));
  const out = {};
  for (const [rawKey, rawList] of Object.entries(tagValues || {})) {
    const fieldMatch = byKey.get(rawKey) ? { field: byKey.get(rawKey), confidence: 1 } : matchFieldKey(rawKey, normalizedFields);
    if (!fieldMatch) continue;
    const field = fieldMatch.field;
    const values = splitFieldValues(rawList)
      .map((value) => matchFieldOption(value, field, options))
      .filter(Boolean)
      .map((match) => match.value);
    out[field.key] = uniqueList(field.multi === false ? values.slice(0, 1) : values);
  }
  return out;
}

export function normalizeProductInputTags(input = {}, fields = [], options = {}) {
  return normalizeTagValues({
    ...(input.tag_values || {}),
    ...(input.brand !== undefined ? { brand: splitExplicitValues(input.brand) } : {}),
    ...(input.host !== undefined ? { host: splitExplicitValues(input.host) } : {}),
    ...(input.category !== undefined ? { category: splitExplicitValues(input.category) } : {}),
    ...(input.tags !== undefined ? { custom_tags: input.tags } : {}),
  }, fields, options);
}

export function normalizeDemandInputTags(input = {}, fields = [], options = {}) {
  return normalizeTagValues({
    ...(input.tag_values || {}),
    ...(input.innovation !== undefined ? { innovation: input.innovation } : {}),
    ...(input.scenarios !== undefined ? { scenarios: input.scenarios } : {}),
    ...(input.painpoints !== undefined ? { painpoints: input.painpoints } : {}),
    ...(input.tags !== undefined ? { custom_tags: input.tags } : {}),
  }, fields, options);
}
