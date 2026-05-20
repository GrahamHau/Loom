import { rawState } from "./repository.js";

function cleanText(value) {
  return String(value ?? "").trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) || (typeof value === "object")
    ? JSON.stringify(value)
    : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function csvLine(values) {
  return values.map(csvCell).join(",");
}

function tagSummary(item = {}) {
  return Object.entries(item.tag_values || {})
    .map(([key, values]) => `${key}:${safeArray(values).join("|")}`)
    .join("; ");
}

function platformSummary(product = {}) {
  return safeArray(product.platforms)
    .map((platform) => [
      platform.platform,
      platform.price,
      platform.rating,
      platform.reviews,
      platform.sales,
      platform.url,
    ].filter((part) => part !== undefined && part !== null && String(part).trim()).join(" / "))
    .join("\n");
}

function commentsSummary(demand = {}) {
  return safeArray(demand.visible_comments)
    .map((comment) => `${cleanText(comment.user_name || comment.username || comment.author)}: ${cleanText(comment.content)}`)
    .filter((line) => line.replace(/^:\s*/, "").trim())
    .join("\n");
}

function baseRow(research, entityType, item = {}) {
  return {
    research_id: research.id,
    research_title: research.title,
    research_desc: research.desc || research.description || "",
    research_status: research.status || "",
    research_date: research.date || "",
    entity_type: entityType,
    entity_id: item.id || "",
    entity_title: item.name || item.title || "",
    source_platform: item.platform || item.source_platform || item.source || "",
    source_url: item.source_url || item.url || "",
    thumbnail_url: item.thumbnail_url || item.image || "",
    evidence_status: item.evidence_status || "",
    created_at: item.created_at || "",
    updated_at: item.updated_at || "",
  };
}

function productRow(research, product = {}) {
  return {
    ...baseRow(research, "product", product),
    summary: product.ai_summary || product.note || "",
    brand: product.brand || "",
    host: product.host || "",
    category: product.category || "",
    tags: safeArray(product.tags).join("|"),
    tag_values: tagSummary(product),
    price: product.price || safeArray(product.platforms)[0]?.price || "",
    rating: product.rating ?? safeArray(product.platforms)[0]?.rating ?? "",
    review_count: product.review_count ?? safeArray(product.platforms)[0]?.reviews ?? "",
    monthly_sales: product.monthly_sales || safeArray(product.platforms)[0]?.sales || "",
    selling_points: safeArray(product.selling_points).join("\n"),
    negative_keywords: safeArray(product.negative_keywords).join("|"),
    comments: "",
    platforms: platformSummary(product),
    raw_metadata: JSON.stringify({
      related_product_id: product.related_product_id || "",
      related_product_name: product.related_product_name || "",
      original_image_url: product.original_image_url || "",
    }),
  };
}

function demandRow(research, demand = {}) {
  return {
    ...baseRow(research, "demand", demand),
    summary: demand.ai_summary || demand.summary || "",
    brand: "",
    host: demand.host || safeArray(demand.tag_values?.host)[0] || "",
    category: safeArray(demand.tags_category).join("|"),
    tags: safeArray(demand.tags).join("|"),
    tag_values: tagSummary(demand),
    price: "",
    rating: "",
    review_count: demand.comments ?? "",
    monthly_sales: "",
    selling_points: "",
    negative_keywords: safeArray(demand.painpoints).join("|"),
    comments: commentsSummary(demand),
    platforms: "",
    raw_metadata: JSON.stringify({
      author: demand.author || "",
      likes: demand.likes || 0,
      collects: demand.collects || 0,
      shares: demand.shares || 0,
      scenarios: safeArray(demand.scenarios),
      painpoints: safeArray(demand.painpoints),
      innovation: demand.innovation || "",
      import_method: demand.import_method || "",
      original_content: demand.original_content || "",
      original_image_url: demand.original_image_url || "",
    }),
  };
}

function researchRow(research) {
  return {
    ...baseRow(research, "research", research),
    summary: research.desc || research.description || "",
    brand: "",
    host: "",
    category: "",
    tags: "",
    tag_values: "",
    price: "",
    rating: "",
    review_count: "",
    monthly_sales: "",
    selling_points: "",
    negative_keywords: "",
    comments: "",
    platforms: "",
    raw_metadata: JSON.stringify({
      products: safeArray(research.products),
      demands: safeArray(research.demands),
      analysis_count: safeArray(research.analysis).length,
    }),
  };
}

function missingReferenceRow(research, entityType, id) {
  return {
    ...baseRow(research, `missing_${entityType}`, { id, title: id, evidence_status: "missing" }),
    summary: "关联资产在当前镜像中不存在，保留为断链引用。",
    brand: "",
    host: "",
    category: "",
    tags: "",
    tag_values: "",
    price: "",
    rating: "",
    review_count: "",
    monthly_sales: "",
    selling_points: "",
    negative_keywords: "",
    comments: "",
    platforms: "",
    raw_metadata: JSON.stringify({ missing_reference_id: id }),
  };
}

export function buildResearchExportCsv(userId, researchId) {
  const state = rawState(userId);
  const research = safeArray(state?.research).find((item) => item.id === researchId);
  if (!research) return null;
  const productRows = safeArray(research.products).map((id) => {
    const product = safeArray(state.products).find((item) => item.id === id);
    return product ? productRow(research, product) : missingReferenceRow(research, "product", id);
  });
  const demandRows = safeArray(research.demands).map((id) => {
    const demand = safeArray(state.demands).find((item) => item.id === id);
    return demand ? demandRow(research, demand) : missingReferenceRow(research, "demand", id);
  });
  const columns = [
    "research_id",
    "research_title",
    "research_desc",
    "research_status",
    "research_date",
    "entity_type",
    "entity_id",
    "entity_title",
    "summary",
    "brand",
    "host",
    "category",
    "source_platform",
    "source_url",
    "thumbnail_url",
    "tags",
    "tag_values",
    "price",
    "rating",
    "review_count",
    "monthly_sales",
    "selling_points",
    "negative_keywords",
    "comments",
    "platforms",
    "evidence_status",
    "created_at",
    "updated_at",
    "raw_metadata",
  ];
  const rows = [
    researchRow(research),
    ...productRows,
    ...demandRows,
  ];
  const csv = [
    csvLine(columns),
    ...rows.map((row) => csvLine(columns.map((column) => row[column] ?? ""))),
  ].join("\n");
  return {
    filename: `${cleanText(research.title, "research").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 80) || "research"}-${research.id}.csv`,
    csv,
    row_count: rows.length,
    product_count: productRows.length,
    demand_count: demandRows.length,
  };
}
