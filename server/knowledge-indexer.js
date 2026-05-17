import crypto from "node:crypto";
import {
  getKnowledgeSourceByOrigin,
  listKnowledgeChunks,
  replaceKnowledgeChunks,
  upsertKnowledgeSource,
} from "./knowledge-repository.js";

const MAX_CHUNK_CHARS = 1600;

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function compactObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function knowledgeContentHash(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function jsonLine(label, value) {
  if (value === undefined || value === null || value === "") return "";
  if (Array.isArray(value) && !value.length) return "";
  if (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) return "";
  const rendered = Array.isArray(value) ? value.join("、") : (typeof value === "object" ? stableJson(value) : String(value));
  return rendered.trim() ? `${label}: ${rendered.trim()}` : "";
}

function splitLongText(text, maxChars = MAX_CHUNK_CHARS) {
  const source = cleanText(text);
  if (!source) return [];
  if (source.length <= maxChars) return [source];
  const paragraphs = source.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs.length ? paragraphs : source.match(new RegExp(`.{1,${maxChars}}`, "gs"))) {
    if (!current) {
      current = paragraph;
    } else if ((current.length + paragraph.length + 2) <= maxChars) {
      current = `${current}\n\n${paragraph}`;
    } else {
      chunks.push(current);
      current = paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function normalizedSections(content = {}) {
  const sections = Array.isArray(content.normalized_sections) ? content.normalized_sections : [];
  return sections
    .map((section) => ({
      key: cleanText(section.key || section.title || section.heading, "section"),
      title: cleanText(section.title || section.heading || section.key, "Section"),
      text: cleanText(section.content || section.text || section.body),
      metadata: compactObject({ key: section.key, block_id: section.block_id }),
    }))
    .filter((section) => section.text);
}

function makeChunk({ sourceType, sourceId, projectId, title, text, chunkType = "section", tags = [], metadata = {}, ref = {} }) {
  const cleanTitle = cleanText(title, "Knowledge");
  const cleanBody = cleanText(text);
  return {
    chunk_type: chunkType,
    title: cleanTitle,
    text: cleanBody,
    project_id: projectId,
    tags: tags.map(cleanText).filter(Boolean),
    metadata: compactObject({ source_type: sourceType, origin_id: sourceId, ...metadata }),
    source_refs: [compactObject({ source_type: sourceType, source_id: sourceId, title: cleanTitle, ...ref })],
    content_hash: knowledgeContentHash({ title: cleanTitle, text: cleanBody, sourceType, sourceId, ref }),
  };
}

function chunksFromText({ sourceType, sourceId, projectId, title, text, chunkType, tags, metadata, ref }) {
  return splitLongText(text).map((part, index, all) => makeChunk({
    sourceType,
    sourceId,
    projectId,
    title: all.length > 1 ? `${title} ${index + 1}` : title,
    text: part,
    chunkType,
    tags,
    metadata: { ...metadata, chunk_index: index },
    ref,
  }));
}

function defaultAccessPolicy(input = {}) {
  const ragEnabled = input.access_policy?.rag_enabled ?? input.rag_enabled ?? false;
  const botEnabled = input.access_policy?.bot_enabled ?? input.bot_enabled ?? false;
  return {
    visibility: input.access_policy?.visibility || input.visibility || "project_team",
    allowed_users: Array.isArray(input.access_policy?.allowed_users) ? input.access_policy.allowed_users : [],
    allowed_roles: Array.isArray(input.access_policy?.allowed_roles) ? input.access_policy.allowed_roles : [],
    allowed_teams: Array.isArray(input.access_policy?.allowed_teams) ? input.access_policy.allowed_teams : [],
    export_profiles: Array.isArray(input.access_policy?.export_profiles) ? input.access_policy.export_profiles : [],
    rag_enabled: Boolean(ragEnabled),
    bot_enabled: Boolean(botEnabled),
    external_safe: Boolean(input.access_policy?.external_safe ?? input.external_safe ?? false),
    supplier_visible: Boolean(input.access_policy?.supplier_visible ?? input.supplier_visible ?? false),
    sales_visible: Boolean(input.access_policy?.sales_visible ?? input.sales_visible ?? false),
    requires_owner_approval: input.access_policy?.requires_owner_approval ?? true,
  };
}

function normalizeDocument(document = {}) {
  const content = document.content || {};
  const sections = normalizedSections(content);
  const text = cleanText(document.content_text || content.text || content.markdown || sections.map((item) => `${item.title}\n${item.text}`).join("\n\n"));
  const sourceId = cleanText(document.id || document.source_id);
  const title = cleanText(document.title, "未命名文档");
  const chunks = sections.length
    ? sections.flatMap((section) => chunksFromText({
      sourceType: "document",
      sourceId,
      projectId: document.project_id,
      title: section.title,
      text: section.text,
      chunkType: document.doc_type === "prd" ? "requirement" : "section",
      tags: [document.doc_type, section.key],
      metadata: section.metadata,
      ref: { document_id: sourceId, section_key: section.key },
    }))
    : chunksFromText({
      sourceType: "document",
      sourceId,
      projectId: document.project_id,
      title,
      text,
      chunkType: document.doc_type === "prd" ? "requirement" : "section",
      tags: [document.doc_type],
      ref: { document_id: sourceId },
    });
  return {
    source_type: "document",
    source_id: sourceId,
    workspace_id: document.workspace_id,
    project_id: document.project_id,
    title,
    url: document.source_uri,
    summary: document.summary || document.metadata?.summary,
    raw_text: text,
    metadata: compactObject({ doc_type: document.doc_type, status: document.status, version: document.version, owner_user_id: document.owner_user_id, ...document.metadata }),
    access_policy: defaultAccessPolicy(document),
    confidence: document.status === "published" ? "published" : "raw",
    hash_input: { title, text, content, metadata: document.metadata, assets: document.assets, updated_at: document.updated_at },
    chunks,
  };
}

function normalizeProduct(product = {}) {
  const sourceId = cleanText(product.id || product.source_id);
  const title = cleanText(product.name || product.title, "未命名竞品");
  const text = [
    jsonLine("品牌", product.brand),
    jsonLine("类目", product.category),
    jsonLine("状态", product.status),
    jsonLine("摘要", product.ai_summary || product.summary),
    jsonLine("卖点", product.selling_points),
    jsonLine("负面关键词", product.negative_keywords),
    jsonLine("成本估计", product.cost_estimate),
    jsonLine("备注", product.note),
    jsonLine("平台", product.platforms),
    jsonLine("标签", product.tags),
  ].filter(Boolean).join("\n");
  return {
    source_type: "product",
    source_id: sourceId,
    workspace_id: product.workspace_id,
    project_id: product.project_id,
    title,
    url: product.url || product.source_url,
    summary: product.ai_summary || product.summary || product.note,
    raw_text: text,
    metadata: compactObject({ brand: product.brand, category: product.category, image: product.image || product.thumbnail_url, ...product.metadata }),
    access_policy: defaultAccessPolicy(product),
    confidence: product.confidence || "user_submitted",
    hash_input: { title, text, tag_values: product.tag_values, updated_at: product.updated_at },
    chunks: chunksFromText({
      sourceType: "product",
      sourceId,
      projectId: product.project_id,
      title,
      text,
      chunkType: "fact",
      tags: ["product", product.category, ...(product.tags || [])],
      ref: { product_id: sourceId, url: product.url || product.source_url },
    }),
  };
}

function normalizeDemand(demand = {}) {
  const sourceId = cleanText(demand.id || demand.source_id);
  const title = cleanText(demand.title, "未命名需求");
  const text = [
    jsonLine("摘要", demand.summary),
    jsonLine("原文", demand.original_content || demand.content),
    jsonLine("场景", demand.scenarios),
    jsonLine("痛点", demand.painpoints),
    jsonLine("创新点", demand.innovation),
    jsonLine("可见评论", demand.visible_comments),
    jsonLine("备注", demand.note),
    jsonLine("标签", demand.tags),
  ].filter(Boolean).join("\n");
  return {
    source_type: "demand",
    source_id: sourceId,
    workspace_id: demand.workspace_id,
    project_id: demand.project_id,
    title,
    url: demand.url || demand.source_url,
    summary: demand.summary,
    raw_text: text,
    metadata: compactObject({ source: demand.source, author: demand.author, date: demand.date, ...demand.metadata }),
    access_policy: defaultAccessPolicy(demand),
    confidence: demand.confidence || "user_submitted",
    hash_input: { title, text, tag_values: demand.tag_values, updated_at: demand.updated_at },
    chunks: chunksFromText({
      sourceType: "demand",
      sourceId,
      projectId: demand.project_id,
      title,
      text,
      chunkType: "insight",
      tags: ["demand", demand.innovation, ...(demand.scenarios || []), ...(demand.painpoints || []), ...(demand.tags || [])],
      ref: { demand_id: sourceId, url: demand.url || demand.source_url },
    }),
  };
}

function normalizeNewsItem(item = {}) {
  const sourceId = cleanText(item.id || item.source_id || item.original_url);
  const title = cleanText(item.title_zh || item.titleZh || item.original_title || item.title, "未命名资讯");
  const text = [
    jsonLine("标题", item.original_title && item.original_title !== title ? item.original_title : ""),
    jsonLine("摘要", item.summary_zh || item.summary || item.original_summary),
    jsonLine("正文", item.content_zh || item.contentZh || item.original_content),
    jsonLine("类型", item.type),
  ].filter(Boolean).join("\n");
  return {
    source_type: "news",
    source_id: sourceId,
    workspace_id: item.workspace_id,
    project_id: item.project_id,
    title,
    url: item.original_url || item.url,
    summary: item.summary_zh || item.summary || item.original_summary,
    raw_text: text,
    metadata: compactObject({ source_id: item.source_id, source_name: item.source_name || item.source, published_at: item.published_at, classification: item.classification, ...item.metadata }),
    access_policy: defaultAccessPolicy(item),
    confidence: item.llm_processed || item.llmProcessed ? "ai_extracted" : "raw",
    hash_input: { title, text, original_url: item.original_url, classification: item.classification || item.classification_json, updated_at: item.updated_at },
    chunks: chunksFromText({
      sourceType: "news",
      sourceId,
      projectId: item.project_id,
      title,
      text,
      chunkType: "insight",
      tags: ["news", item.type, item.source_name || item.source],
      ref: { news_id: sourceId, url: item.original_url || item.url },
    }),
  };
}

function normalizeResearch(research = {}) {
  const sourceId = cleanText(research.id || research.source_id);
  const title = cleanText(research.title, "未命名调研项目");
  const text = [
    jsonLine("描述", research.desc || research.description),
    jsonLine("状态", research.status),
    jsonLine("关联产品", research.products || research.matched_products),
    jsonLine("关联需求", research.demands || research.matched_demands),
    jsonLine("分析", research.analysis),
  ].filter(Boolean).join("\n");
  return {
    source_type: "research",
    source_id: sourceId,
    workspace_id: research.workspace_id,
    project_id: research.project_id,
    title,
    url: research.url,
    summary: research.desc || research.description,
    raw_text: text,
    metadata: compactObject({ status: research.status, date: research.date, ...research.metadata }),
    access_policy: defaultAccessPolicy(research),
    confidence: research.confidence || "ai_extracted",
    hash_input: { title, text, updated_at: research.updated_at },
    chunks: chunksFromText({
      sourceType: "research",
      sourceId,
      projectId: research.project_id,
      title,
      text,
      chunkType: "insight",
      tags: ["research", research.status],
      ref: { research_id: sourceId },
    }),
  };
}

function normalizeKnowledgeEntity(entity = {}) {
  const sourceId = cleanText(entity.id || entity.source_id);
  const title = cleanText(entity.canonical_name || entity.name, "未命名知识对象");
  const text = [
    jsonLine("类型", entity.entity_type),
    jsonLine("名称", title),
    jsonLine("别名", entity.aliases),
    jsonLine("摘要", entity.summary),
    jsonLine("属性", entity.properties),
    jsonLine("来源", entity.source_refs),
  ].filter(Boolean).join("\n");
  return {
    source_type: "knowledge_entity",
    source_id: sourceId,
    workspace_id: entity.workspace_id,
    project_id: entity.project_id,
    title,
    summary: entity.summary,
    raw_text: text,
    metadata: compactObject({ entity_type: entity.entity_type, status: entity.status, review_required: entity.review_required }),
    access_policy: defaultAccessPolicy(entity),
    confidence: entity.review_required ? "ai_extracted" : "pm_confirmed",
    hash_input: { title, text, updated_at: entity.updated_at },
    chunks: chunksFromText({
      sourceType: "knowledge_entity",
      sourceId,
      projectId: entity.project_id,
      title,
      text,
      chunkType: "fact",
      tags: ["ontology", entity.entity_type],
      metadata: { entity_type: entity.entity_type },
      ref: { entity_id: sourceId },
    }),
  };
}

function normalizeKnowledgeRelation(relation = {}) {
  const sourceId = cleanText(relation.id || relation.source_id);
  const title = cleanText(relation.title, `${relation.relation_type || "关系"} ${relation.from_entity_id || ""} -> ${relation.to_entity_id || ""}`);
  const text = [
    jsonLine("关系", relation.relation_type),
    jsonLine("起点", relation.from_entity_id),
    jsonLine("终点", relation.to_entity_id),
    jsonLine("来源", relation.source_refs),
  ].filter(Boolean).join("\n");
  return {
    source_type: "knowledge_relation",
    source_id: sourceId,
    workspace_id: relation.workspace_id,
    project_id: relation.project_id,
    title,
    summary: text,
    raw_text: text,
    metadata: compactObject({ relation_type: relation.relation_type, status: relation.status, review_required: relation.review_required }),
    access_policy: defaultAccessPolicy(relation),
    confidence: relation.review_required ? "ai_extracted" : "pm_confirmed",
    hash_input: { title, text, updated_at: relation.updated_at },
    chunks: chunksFromText({
      sourceType: "knowledge_relation",
      sourceId,
      projectId: relation.project_id,
      title,
      text,
      chunkType: "fact",
      tags: ["ontology", relation.relation_type],
      metadata: { relation_type: relation.relation_type },
      ref: { relation_id: sourceId },
    }),
  };
}

function normalizeRecord(record = {}, sourceType = "") {
  const type = cleanText(sourceType || record.source_type || record.type);
  if (type === "document") return normalizeDocument(record);
  if (type === "product") return normalizeProduct(record);
  if (type === "demand") return normalizeDemand(record);
  if (type === "news" || type === "news_item") return normalizeNewsItem(record);
  if (type === "research") return normalizeResearch(record);
  if (type === "knowledge_entity") return normalizeKnowledgeEntity(record);
  if (type === "knowledge_relation") return normalizeKnowledgeRelation(record);
  throw new Error("unsupported_knowledge_source_type");
}

export function indexKnowledgeRecord(record = {}, sourceType = "") {
  const normalized = normalizeRecord(record, sourceType);
  if (!normalized.workspace_id) throw new Error("workspace_id_required");
  if (!normalized.source_id) throw new Error("source_id_required");
  const contentHash = record.content_hash || knowledgeContentHash(normalized.hash_input);
  const existing = getKnowledgeSourceByOrigin(normalized.workspace_id, normalized.source_type, normalized.source_id);
  if (existing?.content_hash === contentHash) {
    return {
      skipped: true,
      source: existing,
      chunks: listKnowledgeChunks(normalized.workspace_id, { source_id: existing.id }),
      content_hash: contentHash,
    };
  }
  const source = upsertKnowledgeSource({
    workspace_id: normalized.workspace_id,
    source_type: normalized.source_type,
    source_id: normalized.source_id,
    project_id: normalized.project_id,
    title: normalized.title,
    url: normalized.url,
    summary: normalized.summary,
    raw_text: normalized.raw_text,
    metadata: normalized.metadata,
    access_policy: normalized.access_policy,
    confidence: normalized.confidence,
    content_hash: contentHash,
  });
  const chunks = replaceKnowledgeChunks(source.id, normalized.chunks);
  return { skipped: false, source, chunks, content_hash: contentHash };
}

export function indexDocument(document) {
  return indexKnowledgeRecord(document, "document");
}

export function indexProduct(product) {
  return indexKnowledgeRecord(product, "product");
}

export function indexDemand(demand) {
  return indexKnowledgeRecord(demand, "demand");
}

export function indexNewsItem(item) {
  return indexKnowledgeRecord(item, "news");
}

export function indexResearch(research) {
  return indexKnowledgeRecord(research, "research");
}

export function indexKnowledgeEntity(entity) {
  return indexKnowledgeRecord(entity, "knowledge_entity");
}

export function indexKnowledgeRelation(relation) {
  return indexKnowledgeRecord(relation, "knowledge_relation");
}
