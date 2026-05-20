const REQUIRED_FIELDS = [
  { key: "name", label: "名称", type: "field", reason: "missing_name" },
  { key: "想法提出人", label: "想法提出人", type: "role", reason: "missing_meego_user_key" },
  { key: "field_363968", label: "想法概述", type: "field", reason: "missing_summary" },
  { key: "field_c7883e", label: "想法来源", type: "field", reason: "missing_source" },
  { key: "field_b651c4", label: "想法描述", type: "field", reason: "missing_description" },
  { key: "field_96241e", label: "示意图", type: "field", reason: "missing_illustration" },
  { key: "field_f4db36", label: "产品组别", type: "field", reason: "missing_product_group" },
];

function cleanText(value) {
  return String(value ?? "").trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstText(...values) {
  return values.map(cleanText).find(Boolean) || "";
}

function pickSettingsValue(settings = {}, keys = []) {
  for (const key of keys) {
    const value = cleanText(settings[key]);
    if (value) return value;
  }
  return "";
}

function evidenceUrl(evidence = {}) {
  return firstText(
    evidence.url,
    evidence.source_url,
    evidence.original_url,
    evidence.href,
    evidence.link
  );
}

function imageFromEvidence(evidence = {}) {
  return firstText(
    evidence.image,
    evidence.image_url,
    evidence.thumbnail_url,
    evidence.cover_url,
    evidence.original_image_url,
    evidence.metadata?.image,
    evidence.metadata?.image_url,
    evidence.metadata?.thumbnail_url,
    evidence.metadata?.cover_url,
    evidence.metadata?.original_image_url
  );
}

function collectEvidenceItems(research = {}) {
  return [
    ...safeArray(research.evidences),
    ...safeArray(research.evidence),
    ...safeArray(research.evidence_links),
    ...safeArray(research.links),
  ].filter(Boolean);
}

function collectEvidenceLines(research = {}) {
  return collectEvidenceItems(research)
    .map((evidence) => {
      const title = firstText(evidence.title, evidence.name, evidence.label, evidence.source);
      const url = evidenceUrl(evidence);
      if (title && url) return `- ${title}: ${url}`;
      if (url) return `- ${url}`;
      if (title) return `- ${title}`;
      return "";
    })
    .filter(Boolean);
}

function buildDescription(research = {}) {
  const desc = firstText(research.desc, research.description, research.summary, research.title, research.topic);
  const evidenceLines = collectEvidenceLines(research);
  return [
    desc,
    evidenceLines.length ? ["", "证据链接：", ...evidenceLines].join("\n") : "",
  ].filter(Boolean).join("\n");
}

function findIllustration(research = {}) {
  return firstText(
    research.image,
    research.thumbnail_url,
    research.thumbnail,
    research.cover_url,
    research.original_image_url,
    ...collectEvidenceItems(research).map(imageFromEvidence)
  );
}

function missingItem(key) {
  const item = REQUIRED_FIELDS.find((field) => field.key === key);
  return item ? { ...item } : null;
}

export function buildFeishuProjectIdeaDraft({
  research = {},
  currentUserMapping = {},
  settings = {},
  defaults = {},
} = {}) {
  const mergedDefaults = { ...settings, ...defaults };
  const fields = {};
  const roles = {};
  const missing_required = [];
  const warnings = [];

  const name = firstText(research.title, research.topic, research.name);
  const summary = firstText(research.summary, research.ai_summary, research.title, research.topic);
  const source = firstText(
    research.source,
    research.source_platform,
    research.source_type,
    pickSettingsValue(mergedDefaults, [
      "feishu_project_default_idea_source",
      "default_idea_source",
      "idea_source",
    ])
  );
  const description = buildDescription(research);
  const illustration = findIllustration(research);
  const productGroup = firstText(
    research.product_group,
    research.product_group_key,
    research.category_group,
    pickSettingsValue(mergedDefaults, [
      "feishu_project_default_product_group",
      "feishu_project_idea_product_group",
      "default_product_group",
      "product_group",
    ])
  );
  const meegoUserKey = firstText(currentUserMapping.meego_user_key, currentUserMapping.user_key);

  if (name) fields.name = name;
  if (summary) fields.field_363968 = summary;
  if (source) fields.field_c7883e = source;
  if (description) fields.field_b651c4 = description;
  if (illustration) fields.field_96241e = illustration;
  if (productGroup) fields.field_f4db36 = productGroup;
  if (meegoUserKey) roles["想法提出人"] = [meegoUserKey];

  for (const required of REQUIRED_FIELDS) {
    if (required.type === "role") {
      if (!roles[required.key]?.length) missing_required.push({ ...required });
    } else if (!fields[required.key]) {
      missing_required.push({ ...required });
    }
  }

  if (!illustration) {
    warnings.push({
      key: "field_96241e",
      message: "没有找到已采集图片或示意图，提交前需要用户上传或补充真实图片。",
    });
  }
  if (!source) {
    warnings.push({
      key: "field_c7883e",
      message: "无法可靠推断想法来源，提交前需要用户选择。",
    });
  }

  return {
    type: "feishu_project_idea",
    mode: "preview",
    fields,
    roles,
    missing_required,
    warnings,
    ready: missing_required.length === 0,
  };
}
