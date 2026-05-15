import { DEFAULT_FIELDS, normalizeFields } from "./field-config.js";
import { matchFieldOptionInText } from "./field-matcher.js";

const NEWS_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "to", "for", "of", "with", "in", "on", "at", "from", "by",
  "launch", "launches", "launched", "launching",
  "announce", "announces", "announced", "announcing",
  "release", "releases", "released", "releasing",
  "introduce", "introduces", "introduced", "introducing",
  "unveil", "unveils", "unveiled", "unveiling",
  "debut", "debuts", "debuted", "debuting",
  "official", "preview", "hands", "hand", "first", "look",
  "camera", "drone", "gimbal",
  "发布", "推出", "上市", "首发", "亮相", "登场", "发售", "开售", "正式发布", "正式推出",
  "新机", "新品", "相机", "镜头", "套装", "复古", "版", "版本", "组合", "套件",
]);

const DISTINCT_EVENT_WORDS = /\b(firmware|software|update|recall|delay|price|sale|discount|leak|rumou?r|teaser|review|retro|vintage|bundle|kit)\b|固件|软件|更新|召回|延期|价格|降价|促销|爆料|传闻|预告|评测|复古|套装|套件/i;
const GENERIC_STORY_KEY = "generic";

const fields = normalizeFields(DEFAULT_FIELDS);
const brandField = fields.find((field) => field.key === "brand");
const hostField = fields.find((field) => field.key === "host");

function cleanText(value) {
  return String(value ?? "").trim();
}

function stripPublisherSuffix(value) {
  return cleanText(value)
    .replace(/\s+-\s+(?:the\s+)?(?:photo\s+review|digital\s+camera\s+world|petapixel|techradar|pcmag(?:\s+australia)?|fstoppers|the\s+verge|hot\s*hardware|imaging\s+resource|the\s+shortcut|matt\s+swider|newsshooter)\b.*$/i, "")
    .replace(/\s+\|\s+.*$/i, "");
}

function titleSlug(value) {
  return cleanText(value)
    .normalize("NFKC")
    .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, "$1 $2")
    .replace(/\s+-\s+[^-]+$/g, "")
    .toLowerCase()
    .replace(/['"“”‘’]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function compactKey(value) {
  return titleSlug(value).replace(/-/g, "");
}

function keyFor(value) {
  return compactKey(value).slice(0, 80);
}

export function normalizeLlmStoryKey(value) {
  const key = titleSlug(value).slice(0, 80);
  if (!key || key === GENERIC_STORY_KEY) return "";
  if (key.length < 6) return "";
  return key;
}

function removeMatchedTerms(text, values = []) {
  let out = cleanText(text);
  for (const value of values) {
    const tokens = titleSlug(value).split("-").filter(Boolean);
    for (const token of tokens) {
      if (!token) continue;
      out = out.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
    }
    if (value) out = out.replace(new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
  }
  return out;
}

function canonicalEventKey(text) {
  const value = stripPublisherSuffix(text).toLowerCase();
  if (/c2pa/i.test(value) && /图像|影像|照片|图片|\bimage\b|\bphoto\b|\bpicture\b/i.test(value) && /认证|验证|\bverification\b|\bverify\b|\bauthentication\b/i.test(value)) {
    return "canon-c2pa-image-verify";
  }
  const isSonyA7rVi = /(sony|索尼)/i.test(value) &&
    !/\ba7r\s*vii\b|\ba7rvii\b|alpha\s*7r\s*vii/i.test(value) &&
    /\ba7r\s*vi\b|\ba7rvi\b|alpha\s*7r\s*vi|alpha\s*a7r\s*vi/i.test(value);
  if (isSonyA7rVi) {
    if (/poll|投票/i.test(value)) return "sony-a7r-vi-poll";
    if (/preorder|pre-order|预售|预订/i.test(value)) return "sony-a7r-vi-preorder";
    if (/battery|电池/i.test(value)) return "sony-a7r-vi-battery";
    if (/\bevf\b|取景器/i.test(value)) return "sony-a7r-vi-evf";
    if (/leak(?:ed|s)?|rumou?r|传闻|爆料/i.test(value)) return "sony-a7r-vi-leak";
    if (/评测|review|tested|testing|test\b|高速版/i.test(value)) {
      return "sony-a7r-vi-review";
    }
    return "sony-a7r-vi-launch";
  }
  return "";
}

function storyKeyFor(text, { brand = "", host = "" } = {}) {
  const canonical = canonicalEventKey(text);
  if (canonical) return canonical;
  const withoutTaxonomy = removeMatchedTerms(text, [brand, host]);
  const normalizedText = cleanText(withoutTaxonomy)
    .replace(/图像|影像|照片|图片/g, " image ")
    .replace(/认证|验证/g, " verify ")
    .replace(/\bphoto\b|\bpicture\b|\bimage\b/gi, " image ")
    .replace(/\bverification\b|\bverify\b|\bauthentication\b/gi, " verify ")
    .replace(/\bcanon\b/gi, " 佳能 ")
    .replace(/推出|发布|宣布|推/g, " ")
    .replace(/正式发布|正式推出|发布|推出|上市|首发|亮相|登场|发售|开售/g, " ")
    .replace(/新品|新机|相机|镜头/g, " ");
  const tokens = titleSlug(normalizedText)
    .split("-")
    .filter(Boolean)
    .filter((token) => !NEWS_STOPWORDS.has(token));
  if (host && /复古|\bretro\b|\bvintage\b/i.test(normalizedText) && /套装|套件|\bbundle\b|\bkit\b|\bspecial\s+edition\b/i.test(normalizedText)) {
    return "retro-bundle";
  }
  if (host && !DISTINCT_EVENT_WORDS.test(normalizedText)) return GENERIC_STORY_KEY;
  if (tokens.length >= 2) return tokens.slice(0, 8).join("-");
  return tokens[0] || "";
}

export function isSpecificNewsStoryKey(value) {
  const key = cleanText(value);
  return Boolean(key && key !== GENERIC_STORY_KEY && key.length >= 6);
}

export function isCrossSourceNewsStoryKey(value) {
  const key = cleanText(value);
  return key === "canon-c2pa-image-verify" ||
    key === "sony-a7r-vi-launch" ||
    key === "sony-a7r-vi-review";
}

export function deriveNewsDedupeKeys(item = {}, options = {}) {
  const existing = item.classification || {};
  const text = [
    item.titleZh,
    item.original_title,
    item.summary,
    item.original_content,
    existing.merge_title,
  ].filter(Boolean).join("\n");
  const force = Boolean(options.force);
  const brandMatch = (!force && existing.brand_key) || matchFieldOptionInText(text, brandField, { minCandidateLength: 2 })?.value || "";
  const hostMatch = (!force && existing.host_key) || matchFieldOptionInText(text, hostField, { minCandidateLength: 4 })?.value || "";
  const storyKeyHint = normalizeLlmStoryKey(options.storyKeyHint || "");
  const storyKey = storyKeyHint || (!force && existing.story_key) || storyKeyFor([
    item.titleZh,
    item.original_title,
    existing.merge_title,
  ].filter(Boolean).join(" "), { brand: brandMatch, host: hostMatch });
  const brandKey = keyFor(brandMatch);
  const hostKey = keyFor(hostMatch);
  const nearMergeKey = (!force && existing.near_merge_key) || [
    brandKey || "unknown",
    hostKey || "generic",
    storyKey,
  ].filter(Boolean).join("::");

  return {
    ...(brandMatch ? { brand: brandMatch, brand_key: brandKey } : {}),
    ...(hostMatch ? { host: hostMatch, host_key: hostKey } : {}),
    ...(storyKey ? { story_key: storyKey } : {}),
    ...(nearMergeKey ? { near_merge_key: nearMergeKey } : {}),
  };
}

export function withNewsDedupeKeys(item = {}, options = {}) {
  const keys = deriveNewsDedupeKeys(item, options);
  return {
    ...item,
    classification: {
      ...(item.classification || {}),
      ...keys,
    },
  };
}
