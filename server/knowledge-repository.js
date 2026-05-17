import { nanoid } from "nanoid";
import { db } from "./db.js";
import { migrateKnowledgeSchema } from "./knowledge-schema.js";

migrateKnowledgeSchema();

const DEFAULT_ACCESS_POLICY = {
  visibility: "private",
  allowed_roles: [],
  allowed_users: [],
  allowed_teams: [],
  rag_enabled: false,
  bot_enabled: false,
  export_profiles: [],
  external_safe: false,
  supplier_visible: false,
  sales_visible: false,
  requires_owner_approval: true,
};

const DEFAULT_PRD_SECTIONS = [
  { key: "sku_spu", title: "SKU / SPU 信息", aliases: ["SKU", "SPU", "SKU信息", "SPU信息", "产品编码", "型号", "SKU/SPU"], required: false },
  { key: "product_definition", title: "产品定义", aliases: ["项目背景", "产品概述"], required: true },
  { key: "functional_attributes", title: "功能属性", aliases: ["功能需求", "功能定义"], required: true },
  { key: "structure", title: "结构要求", aliases: ["结构设计", "机构要求"], required: false },
  { key: "materials_process", title: "材料工艺", aliases: ["材料", "工艺", "表面处理"], required: false },
  { key: "id_cmf", title: "ID / CMF", aliases: ["工业设计", "外观", "CMF"], required: false },
  { key: "packaging", title: "包装需求", aliases: ["包装", "包装设计"], required: false },
  { key: "testing", title: "测试要求", aliases: ["测试", "验收标准"], required: false },
  { key: "supplier_delivery", title: "供应商交付", aliases: ["交付要求", "打样要求"], required: false },
  { key: "internal_risks", title: "内部风险", aliases: ["风险", "内部判断"], required: false },
  { key: "open_questions", title: "待确认问题", aliases: ["问题", "待确认"], required: true },
];

const DEFAULT_MRD_SECTIONS = [
  { key: "sku_spu", title: "SKU / SPU 信息", aliases: ["SKU", "SPU", "SKU信息", "SPU信息", "产品编码", "型号", "SKU/SPU"], required: false },
  { key: "market_background", title: "市场背景", aliases: ["背景", "行业背景"], required: true },
  { key: "target_users_scenarios", title: "目标用户与场景", aliases: ["目标用户", "用户场景"], required: true },
  { key: "demands_painpoints", title: "需求与痛点", aliases: ["需求", "痛点"], required: true },
  { key: "competitor_landscape", title: "竞品格局", aliases: ["竞品", "竞品分析"], required: true },
  { key: "cost_estimation", title: "成本估算", aliases: ["成本", "成本估算", "目标成本", "成本测算", "报价", "毛利"], required: false },
  { key: "opportunity_judgement", title: "机会判断", aliases: ["机会", "机会点"], required: true },
  { key: "risks_uncertainties", title: "风险与不确定性", aliases: ["风险", "不确定性"], required: true },
  { key: "recommended_direction", title: "建议方向", aliases: ["建议", "方向"], required: true },
  { key: "open_questions", title: "待确认问题", aliases: ["问题", "待确认"], required: true },
];

const DEFAULT_HARDWARE_MODULES = [
  "sku_spu",
  "product_definition",
  "functional_attributes",
  "structure",
  "materials_process",
  "id_cmf",
  "electronics_firmware_certification",
  "packaging",
  "testing",
  "supplier_delivery",
  "quality_acceptance",
  "internal_risks",
  "open_questions",
];

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function oneOf(value, allowed, fallback) {
  const text = cleanText(value);
  return allowed.includes(text) ? text : fallback;
}

function boolInt(value) {
  return value ? 1 : 0;
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

function answerScopeHash(projectId, packId) {
  const project = cleanText(projectId);
  const pack = cleanText(packId);
  return project || pack ? `project:${project}|pack:${pack}` : "global";
}

function cleanAccessPolicy(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    ...DEFAULT_ACCESS_POLICY,
    ...source,
    visibility: oneOf(source.visibility, ["private", "project_team", "workspace", "role_limited", "company"], DEFAULT_ACCESS_POLICY.visibility),
    allowed_roles: Array.isArray(source.allowed_roles) ? source.allowed_roles.map((item) => cleanText(item)).filter(Boolean) : [],
    allowed_users: Array.isArray(source.allowed_users) ? source.allowed_users.map((item) => cleanText(item)).filter(Boolean) : [],
    allowed_teams: Array.isArray(source.allowed_teams) ? source.allowed_teams.map((item) => cleanText(item)).filter(Boolean) : [],
    export_profiles: Array.isArray(source.export_profiles) ? source.export_profiles.map((item) => cleanText(item)).filter(Boolean) : [],
    rag_enabled: Boolean(source.rag_enabled),
    bot_enabled: Boolean(source.bot_enabled),
    external_safe: Boolean(source.external_safe),
    supplier_visible: Boolean(source.supplier_visible),
    sales_visible: Boolean(source.sales_visible),
    requires_owner_approval: source.requires_owner_approval !== false,
  };
}

function policyFields(policy) {
  return {
    access_policy_json: jsonText(policy, DEFAULT_ACCESS_POLICY),
    visibility: policy.visibility,
    rag_enabled: boolInt(policy.rag_enabled),
    bot_enabled: boolInt(policy.bot_enabled),
    external_safe: boolInt(policy.external_safe),
    supplier_visible: boolInt(policy.supplier_visible),
    sales_visible: boolInt(policy.sales_visible),
  };
}

function mapProject(row) {
  if (!row) return null;
  return {
    ...row,
    access_policy: parseJson(row.access_policy_json, DEFAULT_ACCESS_POLICY),
    metadata: parseJson(row.metadata_json, {}),
  };
}

function mapDocument(row) {
  if (!row) return null;
  return {
    ...row,
    content: parseJson(row.content_json, {}),
    assets: parseJson(row.assets_json, []),
    access_policy: parseJson(row.access_policy_json, DEFAULT_ACCESS_POLICY),
    metadata: parseJson(row.metadata_json, {}),
    rag_enabled: Boolean(row.rag_enabled),
    bot_enabled: Boolean(row.bot_enabled),
    external_safe: Boolean(row.external_safe),
    supplier_visible: Boolean(row.supplier_visible),
    sales_visible: Boolean(row.sales_visible),
  };
}

function mapDocumentTemplate(row) {
  if (!row) return null;
  return {
    ...row,
    sections: parseJson(row.sections_json, []),
    extraction_rules: parseJson(row.extraction_rules_json, {}),
    chunk_rules: parseJson(row.chunk_rules_json, {}),
  };
}

function mapProductTypeTemplate(row) {
  if (!row) return null;
  return {
    ...row,
    attributes_schema: parseJson(row.attributes_schema_json, []),
    enabled_modules: parseJson(row.enabled_modules_json, []),
    required_roles: parseJson(row.required_roles_json, []),
    supplier_visible_modules: parseJson(row.supplier_visible_modules_json, []),
    sales_visible_modules: parseJson(row.sales_visible_modules_json, []),
    required_fields: parseJson(row.required_fields_json, []),
  };
}

function mapImport(row) {
  if (!row) return null;
  return {
    ...row,
    raw_blocks: parseJson(row.raw_blocks_json, []),
  };
}

function mapKnowledgeSource(row) {
  if (!row) return null;
  return {
    ...row,
    metadata: parseJson(row.metadata_json, {}),
    access_policy: parseJson(row.access_policy_json, DEFAULT_ACCESS_POLICY),
    rag_enabled: Boolean(row.rag_enabled),
    bot_enabled: Boolean(row.bot_enabled),
    external_safe: Boolean(row.external_safe),
    supplier_visible: Boolean(row.supplier_visible),
    sales_visible: Boolean(row.sales_visible),
  };
}

function mapKnowledgeChunk(row) {
  if (!row) return null;
  return {
    ...row,
    source_refs: parseJson(row.source_refs_json, []),
    tags: parseJson(row.tags_json, []),
    metadata: parseJson(row.metadata_json, {}),
    access_policy: parseJson(row.access_policy_json, DEFAULT_ACCESS_POLICY),
    rag_enabled: Boolean(row.rag_enabled),
    bot_enabled: Boolean(row.bot_enabled),
    external_safe: Boolean(row.external_safe),
    supplier_visible: Boolean(row.supplier_visible),
    sales_visible: Boolean(row.sales_visible),
  };
}

function mapPack(row) {
  if (!row) return null;
  return {
    ...row,
    input: parseJson(row.input_json, {}),
    open_questions: parseJson(row.open_questions_json, []),
  };
}

function mapGap(row) {
  if (!row) return null;
  return {
    ...row,
    related_source_ids: parseJson(row.related_source_ids_json, []),
  };
}

function mapDocumentSection(row) {
  if (!row) return null;
  return {
    ...row,
    source_refs: parseJson(row.source_refs_json, []),
    open_questions: parseJson(row.open_questions_json, []),
    access_policy: parseJson(row.access_policy_json, DEFAULT_ACCESS_POLICY),
    metadata: parseJson(row.metadata_json, {}),
  };
}

function mapKnowledgeEntity(row) {
  if (!row) return null;
  return {
    ...row,
    aliases: parseJson(row.aliases_json, []),
    properties: parseJson(row.properties_json, {}),
    source_refs: parseJson(row.source_refs_json, []),
    review_required: Boolean(row.review_required),
  };
}

function mapKnowledgeRelation(row) {
  if (!row) return null;
  return {
    ...row,
    source_refs: parseJson(row.source_refs_json, []),
    review_required: Boolean(row.review_required),
  };
}

function mapKnowledgeFusionCandidate(row) {
  if (!row) return null;
  return {
    ...row,
    source_entity_ids: parseJson(row.source_entity_ids_json, []),
    proposed_entity: parseJson(row.proposed_entity_json, {}),
    proposed_relation: parseJson(row.proposed_relation_json, {}),
  };
}

function mapFeishuBaseMapping(row) {
  if (!row) return null;
  return {
    ...row,
    field_map: parseJson(row.field_map_json, {}),
  };
}

function entityIdsFromFusionCandidate(candidate) {
  const ids = new Set(Array.isArray(candidate.source_entity_ids) ? candidate.source_entity_ids.map(cleanText).filter(Boolean) : []);
  if (candidate.target_entity_id) ids.add(cleanText(candidate.target_entity_id));
  for (const relationKey of ["proposed_relation"]) {
    const relation = candidate[relationKey];
    if (!relation || typeof relation !== "object" || Array.isArray(relation)) continue;
    if (relation.from_entity_id) ids.add(cleanText(relation.from_entity_id));
    if (relation.to_entity_id) ids.add(cleanText(relation.to_entity_id));
  }
  return [...ids];
}

function assertFusionCandidateEntities(candidate) {
  const ids = entityIdsFromFusionCandidate(candidate);
  for (const id of ids) {
    const entity = getKnowledgeEntity(id);
    if (!entity) throw new Error("fusion_entity_not_found");
    if (entity.workspace_id !== candidate.workspace_id) throw new Error("workspace_mismatch");
    if (candidate.project_id && entity.project_id !== candidate.project_id) throw new Error("project_mismatch");
  }
}

function nextFusionStatus(current, requested) {
  const value = cleanText(requested);
  const allowed = {
    pending: ["approved", "rejected"],
    approved: ["applied", "rejected"],
    rejected: [],
    applied: [],
  };
  if (!["pending", "approved", "rejected", "applied"].includes(value)) {
    throw new Error("invalid_fusion_status");
  }
  if (value === current) return current;
  if (!(allowed[current] || []).includes(value)) {
    throw new Error("invalid_fusion_status_transition");
  }
  return value;
}

function mapKnowledgeAnswer(row) {
  if (!row) return null;
  return {
    ...row,
    citations: parseJson(row.citations_json, []),
    gap_ids: parseJson(row.gap_ids_json, []),
    metadata: parseJson(row.metadata_json, {}),
  };
}

function mapJob(row) {
  if (!row) return null;
  return {
    ...row,
    payload: parseJson(row.payload_json, {}),
    metadata: parseJson(row.metadata_json, {}),
  };
}

export function defaultDocumentTemplates(workspaceId) {
  return [
    {
      id: `tpl-${workspaceId}-prd-v1`,
      workspace_id: workspaceId,
      doc_type: "prd",
      name: "硬件 PRD 模板",
      version: "v1",
      sections: DEFAULT_PRD_SECTIONS,
    },
    {
      id: `tpl-${workspaceId}-mrd-v1`,
      workspace_id: workspaceId,
      doc_type: "mrd",
      name: "MRD 调研模板",
      version: "v1",
      sections: DEFAULT_MRD_SECTIONS,
    },
  ];
}

export function defaultProductTypeTemplates(workspaceId) {
  return [
    {
      id: `pt-${workspaceId}-generic-hardware`,
      workspace_id: workspaceId,
      name: "通用硬件产品",
      code: "generic_hardware",
      description: "默认兜底模板。公司具体产品类型后续由管理员配置。",
      attributes_schema: [],
      enabled_modules: DEFAULT_HARDWARE_MODULES,
      required_roles: ["pm", "id", "structure", "supplier"],
      supplier_visible_modules: ["functional_attributes", "structure", "materials_process", "packaging", "testing", "supplier_delivery"],
      sales_visible_modules: ["product_definition", "functional_attributes", "quality_acceptance"],
      required_fields: ["product_definition", "functional_attributes"],
    },
  ];
}

export function ensureDefaultKnowledgeTemplates(workspaceId) {
  if (!workspaceId) return { document_templates: [], product_type_templates: [] };
  const documentTemplates = defaultDocumentTemplates(workspaceId).map(upsertDocumentTemplate);
  const productTypeTemplates = defaultProductTypeTemplates(workspaceId).map(upsertProductTypeTemplate);
  return { document_templates: documentTemplates, product_type_templates: productTypeTemplates };
}

export function createProject(input = {}) {
  const id = input.id || nanoid(12);
  const policy = cleanAccessPolicy(input.access_policy);
  const project = {
    id,
    workspace_id: cleanText(input.workspace_id),
    name: cleanText(input.name, "未命名项目"),
    code: cleanText(input.code),
    category: cleanText(input.category),
    status: oneOf(input.status, ["planned", "active", "paused", "archived"], "active"),
    description: cleanText(input.description),
    owner_user_id: cleanText(input.owner_user_id),
    metadata_json: jsonText(input.metadata, {}),
    ...policyFields(policy),
  };
  if (!project.workspace_id) throw new Error("workspace_id_required");
  db.prepare(`
    INSERT INTO projects (
      id, workspace_id, name, code, category, status, description, owner_user_id,
      access_policy_json, metadata_json, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @name, @code, @category, @status, @description, @owner_user_id,
      @access_policy_json, @metadata_json, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(project);
  return getProject(id);
}

export function getProject(id) {
  return mapProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id));
}

export function listProjects(workspaceId) {
  return db.prepare("SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC, created_at DESC")
    .all(workspaceId)
    .map(mapProject);
}

export function updateProject(id, patch = {}) {
  const current = getProject(id);
  if (!current) return null;
  const policy = cleanAccessPolicy(patch.access_policy || current.access_policy);
  const next = {
    id,
    name: patch.name !== undefined ? cleanText(patch.name, current.name) : current.name,
    code: patch.code !== undefined ? cleanText(patch.code) : current.code,
    category: patch.category !== undefined ? cleanText(patch.category) : current.category,
    status: patch.status !== undefined ? oneOf(patch.status, ["planned", "active", "paused", "archived"], current.status) : current.status,
    description: patch.description !== undefined ? cleanText(patch.description) : current.description,
    owner_user_id: patch.owner_user_id !== undefined ? cleanText(patch.owner_user_id) : current.owner_user_id,
    metadata_json: patch.metadata !== undefined ? jsonText(patch.metadata, {}) : current.metadata_json,
    ...policyFields(policy),
  };
  db.prepare(`
    UPDATE projects
    SET name = @name, code = @code, category = @category, status = @status,
        description = @description, owner_user_id = @owner_user_id,
        access_policy_json = @access_policy_json, metadata_json = @metadata_json,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run(next);
  return getProject(id);
}

export function createDocument(input = {}) {
  const policy = cleanAccessPolicy(input.access_policy);
  const document = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    project_id: cleanText(input.project_id),
    title: cleanText(input.title, "未命名文档"),
    doc_type: oneOf(input.doc_type, ["prd", "mrd", "report", "spec", "meeting_note", "faq", "sales_doc", "other"], "other"),
    status: oneOf(input.status, ["draft", "reviewing", "published", "archived"], "draft"),
    template_id: cleanText(input.template_id),
    source_uri: cleanText(input.source_uri),
    storage_key: cleanText(input.storage_key),
    mime_type: cleanText(input.mime_type),
    version: cleanText(input.version),
    author: cleanText(input.author),
    owner_user_id: cleanText(input.owner_user_id),
    content_text: cleanText(input.content_text),
    content_json: jsonText(input.content, {}),
    assets_json: jsonText(input.assets, []),
    metadata_json: jsonText(input.metadata, {}),
    ...policyFields(policy),
  };
  if (!document.workspace_id) throw new Error("workspace_id_required");
  db.prepare(`
    INSERT INTO documents (
      id, workspace_id, project_id, title, doc_type, status, template_id, source_uri,
      storage_key, mime_type, version, author, owner_user_id, content_text, content_json,
      assets_json, access_policy_json, visibility, rag_enabled, bot_enabled, external_safe,
      supplier_visible, sales_visible, metadata_json, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @project_id, @title, @doc_type, @status, @template_id, @source_uri,
      @storage_key, @mime_type, @version, @author, @owner_user_id, @content_text, @content_json,
      @assets_json, @access_policy_json, @visibility, @rag_enabled, @bot_enabled, @external_safe,
      @supplier_visible, @sales_visible, @metadata_json, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(document);
  return getDocument(document.id);
}

export function getDocument(id) {
  return mapDocument(db.prepare("SELECT * FROM documents WHERE id = ?").get(id));
}

export function listDocuments(workspaceId, filters = {}) {
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];
  if (filters.project_id) {
    clauses.push("project_id = ?");
    params.push(filters.project_id);
  }
  if (filters.doc_type) {
    clauses.push("doc_type = ?");
    params.push(filters.doc_type);
  }
  return db.prepare(`SELECT * FROM documents WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC, created_at DESC`)
    .all(...params)
    .map(mapDocument);
}

export function updateDocument(id, patch = {}) {
  const current = getDocument(id);
  if (!current) return null;
  const policy = cleanAccessPolicy(patch.access_policy || current.access_policy);
  const next = {
    id,
    title: patch.title !== undefined ? cleanText(patch.title, current.title) : current.title,
    doc_type: patch.doc_type !== undefined ? oneOf(patch.doc_type, ["prd", "mrd", "report", "spec", "meeting_note", "faq", "sales_doc", "other"], current.doc_type) : current.doc_type,
    status: patch.status !== undefined ? oneOf(patch.status, ["draft", "reviewing", "published", "archived"], current.status) : current.status,
    template_id: patch.template_id !== undefined ? cleanText(patch.template_id) : current.template_id,
    source_uri: patch.source_uri !== undefined ? cleanText(patch.source_uri) : current.source_uri,
    content_text: patch.content_text !== undefined ? cleanText(patch.content_text) : current.content_text,
    content_json: patch.content !== undefined ? jsonText(patch.content, {}) : current.content_json,
    assets_json: patch.assets !== undefined ? jsonText(patch.assets, []) : current.assets_json,
    metadata_json: patch.metadata !== undefined ? jsonText(patch.metadata, {}) : current.metadata_json,
    ...policyFields(policy),
  };
  db.prepare(`
    UPDATE documents
    SET title = @title, doc_type = @doc_type, status = @status, template_id = @template_id,
        source_uri = @source_uri, content_text = @content_text, content_json = @content_json,
        assets_json = @assets_json, access_policy_json = @access_policy_json,
        visibility = @visibility, rag_enabled = @rag_enabled, bot_enabled = @bot_enabled,
        external_safe = @external_safe, supplier_visible = @supplier_visible,
        sales_visible = @sales_visible, metadata_json = @metadata_json,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run(next);
  return getDocument(id);
}

export function upsertDocumentSection(input = {}) {
  const policy = cleanAccessPolicy(input.access_policy);
  const section = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    document_id: cleanText(input.document_id),
    project_id: cleanText(input.project_id),
    section_key: cleanText(input.section_key || input.key),
    title: cleanText(input.title, input.section_key || input.key || "Section"),
    content: cleanText(input.content),
    source_refs_json: jsonText(input.source_refs, []),
    open_questions_json: jsonText(input.open_questions, []),
    access_policy_json: jsonText(policy, DEFAULT_ACCESS_POLICY),
    status: oneOf(input.status, ["draft", "reviewing", "published", "archived"], "draft"),
    sort_order: Number(input.sort_order || 0),
    metadata_json: jsonText(input.metadata, {}),
  };
  if (!section.workspace_id) throw new Error("workspace_id_required");
  if (!section.document_id) throw new Error("document_id_required");
  if (!section.section_key) throw new Error("section_key_required");
  db.prepare(`
    INSERT INTO document_sections (
      id, workspace_id, document_id, project_id, section_key, title, content,
      source_refs_json, open_questions_json, access_policy_json, status, sort_order,
      metadata_json, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @document_id, @project_id, @section_key, @title, @content,
      @source_refs_json, @open_questions_json, @access_policy_json, @status, @sort_order,
      @metadata_json, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT(document_id, section_key) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      source_refs_json = excluded.source_refs_json,
      open_questions_json = excluded.open_questions_json,
      access_policy_json = excluded.access_policy_json,
      status = excluded.status,
      sort_order = excluded.sort_order,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `).run(section);
  return getDocumentSection(section.document_id, section.section_key);
}

export function getDocumentSection(documentId, sectionKey) {
  return mapDocumentSection(db.prepare(`
    SELECT * FROM document_sections WHERE document_id = ? AND section_key = ?
  `).get(documentId, sectionKey));
}

export function listDocumentSections(documentId) {
  return db.prepare("SELECT * FROM document_sections WHERE document_id = ? ORDER BY sort_order ASC, created_at ASC")
    .all(documentId)
    .map(mapDocumentSection);
}

export function syncDocumentSectionsFromDocument(documentId) {
  const document = getDocument(documentId);
  if (!document) return [];
  const sections = Array.isArray(document.content?.normalized_sections) ? document.content.normalized_sections : [];
  return sections.map((section, index) => upsertDocumentSection({
    workspace_id: document.workspace_id,
    document_id: document.id,
    project_id: document.project_id,
    section_key: section.key || `section_${index + 1}`,
    title: section.title || section.key || `Section ${index + 1}`,
    content: section.content || section.text || "",
    source_refs: section.source_refs || [],
    open_questions: section.open_questions || [],
    access_policy: section.access_policy || document.access_policy,
    status: section.status || document.status || "draft",
    sort_order: index,
    metadata: {
      source: "document_content_json",
      source_chunk_ids: section.source_chunk_ids || [],
    },
  }));
}

export function upsertDocumentTemplate(input = {}) {
  const template = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    doc_type: oneOf(input.doc_type, ["prd", "mrd", "report", "spec", "meeting_note", "faq", "sales_doc", "other"], "other"),
    name: cleanText(input.name, "未命名模板"),
    version: cleanText(input.version, "v1"),
    sections_json: jsonText(input.sections, []),
    extraction_rules_json: jsonText(input.extraction_rules, {}),
    chunk_rules_json: jsonText(input.chunk_rules, {}),
    status: oneOf(input.status, ["active", "archived"], "active"),
  };
  if (!template.workspace_id) throw new Error("workspace_id_required");
  db.prepare(`
    INSERT INTO document_templates (
      id, workspace_id, doc_type, name, version, sections_json, extraction_rules_json,
      chunk_rules_json, status, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @doc_type, @name, @version, @sections_json, @extraction_rules_json,
      @chunk_rules_json, @status, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT(workspace_id, doc_type, version) DO UPDATE SET
      name = excluded.name,
      sections_json = excluded.sections_json,
      extraction_rules_json = excluded.extraction_rules_json,
      chunk_rules_json = excluded.chunk_rules_json,
      status = excluded.status,
      updated_at = CURRENT_TIMESTAMP
  `).run(template);
  return getDocumentTemplate(template.workspace_id, template.doc_type, template.version);
}

export function getDocumentTemplate(workspaceId, docType, version = "v1") {
  return mapDocumentTemplate(db.prepare(`
    SELECT * FROM document_templates
    WHERE workspace_id = ? AND doc_type = ? AND version = ?
  `).get(workspaceId, docType, version));
}

export function listDocumentTemplates(workspaceId, docType = "") {
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];
  if (docType) {
    clauses.push("doc_type = ?");
    params.push(docType);
  }
  return db.prepare(`SELECT * FROM document_templates WHERE ${clauses.join(" AND ")} ORDER BY doc_type, version`)
    .all(...params)
    .map(mapDocumentTemplate);
}

export function upsertProductTypeTemplate(input = {}) {
  const template = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    name: cleanText(input.name, "未命名产品类型"),
    code: cleanText(input.code, "generic").toLowerCase().replace(/[^a-z0-9_:-]+/g, "_"),
    description: cleanText(input.description),
    attributes_schema_json: jsonText(input.attributes_schema, []),
    enabled_modules_json: jsonText(input.enabled_modules, []),
    required_roles_json: jsonText(input.required_roles, []),
    supplier_visible_modules_json: jsonText(input.supplier_visible_modules, []),
    sales_visible_modules_json: jsonText(input.sales_visible_modules, []),
    required_fields_json: jsonText(input.required_fields, []),
    status: oneOf(input.status, ["active", "archived"], "active"),
  };
  if (!template.workspace_id) throw new Error("workspace_id_required");
  db.prepare(`
    INSERT INTO product_type_templates (
      id, workspace_id, name, code, description, attributes_schema_json, enabled_modules_json,
      required_roles_json, supplier_visible_modules_json, sales_visible_modules_json,
      required_fields_json, status, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @name, @code, @description, @attributes_schema_json, @enabled_modules_json,
      @required_roles_json, @supplier_visible_modules_json, @sales_visible_modules_json,
      @required_fields_json, @status, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT(workspace_id, code) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      attributes_schema_json = excluded.attributes_schema_json,
      enabled_modules_json = excluded.enabled_modules_json,
      required_roles_json = excluded.required_roles_json,
      supplier_visible_modules_json = excluded.supplier_visible_modules_json,
      sales_visible_modules_json = excluded.sales_visible_modules_json,
      required_fields_json = excluded.required_fields_json,
      status = excluded.status,
      updated_at = CURRENT_TIMESTAMP
  `).run(template);
  return getProductTypeTemplate(template.workspace_id, template.code);
}

export function getProductTypeTemplate(workspaceId, code) {
  return mapProductTypeTemplate(db.prepare(`
    SELECT * FROM product_type_templates WHERE workspace_id = ? AND code = ?
  `).get(workspaceId, code));
}

export function listProductTypeTemplates(workspaceId) {
  return db.prepare("SELECT * FROM product_type_templates WHERE workspace_id = ? ORDER BY name")
    .all(workspaceId)
    .map(mapProductTypeTemplate);
}

export function createDocumentImport(input = {}) {
  const item = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    project_id: cleanText(input.project_id),
    import_method: oneOf(input.import_method, ["feishu_doc", "paste"], "paste"),
    doc_type: oneOf(input.doc_type, ["prd", "mrd", "report", "spec", "meeting_note", "faq", "sales_doc", "other"], "other"),
    template_id: cleanText(input.template_id),
    title: cleanText(input.title),
    source_uri: cleanText(input.source_uri),
    document_id: cleanText(input.document_id),
    raw_blocks_json: jsonText(input.raw_blocks, []),
    status: oneOf(input.status, ["pending", "reading", "normalizing", "indexed", "failed"], "pending"),
    error: cleanText(input.error),
    created_by: cleanText(input.created_by),
  };
  if (!item.workspace_id) throw new Error("workspace_id_required");
  db.prepare(`
    INSERT INTO document_imports (
      id, workspace_id, project_id, import_method, doc_type, template_id, title, source_uri,
      document_id, raw_blocks_json, status, error, created_by, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @project_id, @import_method, @doc_type, @template_id, @title, @source_uri,
      @document_id, @raw_blocks_json, @status, @error, @created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(item);
  return getDocumentImport(item.id);
}

export function getDocumentImport(id) {
  return mapImport(db.prepare("SELECT * FROM document_imports WHERE id = ?").get(id));
}

export function updateDocumentImport(id, patch = {}) {
  const current = getDocumentImport(id);
  if (!current) return null;
  const next = {
    id,
    status: patch.status !== undefined ? oneOf(patch.status, ["pending", "reading", "normalizing", "indexed", "failed"], current.status) : current.status,
    raw_blocks_json: patch.raw_blocks !== undefined ? jsonText(patch.raw_blocks, []) : current.raw_blocks_json,
    document_id: patch.document_id !== undefined ? cleanText(patch.document_id) : current.document_id,
    error: patch.error !== undefined ? cleanText(patch.error) : current.error,
  };
  db.prepare(`
    UPDATE document_imports
    SET status = @status, raw_blocks_json = @raw_blocks_json, document_id = @document_id,
        error = @error, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run(next);
  return getDocumentImport(id);
}

export function createKnowledgeEntity(input = {}) {
  const entity = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    project_id: cleanText(input.project_id),
    entity_type: oneOf(input.entity_type, [
      "project",
      "product",
      "competitor",
      "need",
      "feature",
      "evidence",
      "document",
      "doc_section",
      "sku_spu",
      "cost_estimation",
      "test_requirement",
      "certification_requirement",
      "packaging_requirement",
      "supplier_capability",
    ], "evidence"),
    canonical_name: cleanText(input.canonical_name || input.name, "未命名知识对象"),
    aliases_json: jsonText(input.aliases, []),
    summary: cleanText(input.summary),
    properties_json: jsonText(input.properties, {}),
    source_refs_json: jsonText(input.source_refs, []),
    confidence: Number(input.confidence || 0),
    status: oneOf(input.status, ["active", "merged", "archived"], "active"),
    review_required: boolInt(input.review_required),
  };
  if (!entity.workspace_id) throw new Error("workspace_id_required");
  db.prepare(`
    INSERT INTO knowledge_entities (
      id, workspace_id, project_id, entity_type, canonical_name, aliases_json,
      summary, properties_json, source_refs_json, confidence, status, review_required,
      created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @project_id, @entity_type, @canonical_name, @aliases_json,
      @summary, @properties_json, @source_refs_json, @confidence, @status, @review_required,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(entity);
  return getKnowledgeEntity(entity.id);
}

export function getKnowledgeEntity(id) {
  return mapKnowledgeEntity(db.prepare("SELECT * FROM knowledge_entities WHERE id = ?").get(id));
}

export function listKnowledgeEntities(workspaceId, filters = {}) {
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];
  if (filters.project_id) {
    clauses.push("project_id = ?");
    params.push(filters.project_id);
  }
  if (filters.entity_type) {
    clauses.push("entity_type = ?");
    params.push(filters.entity_type);
  }
  if (filters.status) {
    clauses.push("status = ?");
    params.push(filters.status);
  }
  return db.prepare(`SELECT * FROM knowledge_entities WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC, created_at DESC`)
    .all(...params)
    .map(mapKnowledgeEntity);
}

export function createKnowledgeRelation(input = {}) {
  const relation = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    project_id: cleanText(input.project_id),
    from_entity_id: cleanText(input.from_entity_id),
    relation_type: oneOf(input.relation_type, [
      "supported_by",
      "has_feature",
      "derived_from",
      "appears_in",
      "contains",
      "supports",
      "requires",
      "depends_on",
      "mentions",
      "related_to",
    ], "related_to"),
    to_entity_id: cleanText(input.to_entity_id),
    source_refs_json: jsonText(input.source_refs, []),
    confidence: Number(input.confidence || 0),
    status: oneOf(input.status, ["active", "rejected", "archived"], "active"),
    review_required: boolInt(input.review_required),
  };
  if (!relation.workspace_id) throw new Error("workspace_id_required");
  if (!relation.from_entity_id || !relation.to_entity_id) throw new Error("entity_edge_required");
  const from = getKnowledgeEntity(relation.from_entity_id);
  const to = getKnowledgeEntity(relation.to_entity_id);
  if (!from || !to) throw new Error("entity_not_found");
  if (from.workspace_id !== relation.workspace_id || to.workspace_id !== relation.workspace_id) throw new Error("workspace_mismatch");
  db.prepare(`
    INSERT INTO knowledge_relations (
      id, workspace_id, project_id, from_entity_id, relation_type, to_entity_id,
      source_refs_json, confidence, status, review_required, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @project_id, @from_entity_id, @relation_type, @to_entity_id,
      @source_refs_json, @confidence, @status, @review_required, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(relation);
  return getKnowledgeRelation(relation.id);
}

export function getKnowledgeRelation(id) {
  return mapKnowledgeRelation(db.prepare("SELECT * FROM knowledge_relations WHERE id = ?").get(id));
}

export function listKnowledgeRelations(workspaceId, filters = {}) {
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];
  if (filters.project_id) {
    clauses.push("project_id = ?");
    params.push(filters.project_id);
  }
  if (filters.entity_id) {
    clauses.push("(from_entity_id = ? OR to_entity_id = ?)");
    params.push(filters.entity_id, filters.entity_id);
  }
  if (filters.relation_type) {
    clauses.push("relation_type = ?");
    params.push(filters.relation_type);
  }
  return db.prepare(`SELECT * FROM knowledge_relations WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC, created_at DESC`)
    .all(...params)
    .map(mapKnowledgeRelation);
}

export function createKnowledgeFusionCandidate(input = {}) {
  const candidate = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    project_id: cleanText(input.project_id),
    candidate_type: oneOf(input.candidate_type, ["entity", "relation"], "entity"),
    action: oneOf(input.action, ["merge", "link", "new", "conflict", "review"], "review"),
    source_entity_ids_json: jsonText(input.source_entity_ids, []),
    target_entity_id: cleanText(input.target_entity_id),
    proposed_entity_json: jsonText(input.proposed_entity, {}),
    proposed_relation_json: jsonText(input.proposed_relation, {}),
    reason: cleanText(input.reason),
    confidence: Number(input.confidence || 0),
    status: oneOf(input.status, ["pending", "approved", "rejected", "applied"], "pending"),
  };
  if (!candidate.workspace_id) throw new Error("workspace_id_required");
  assertFusionCandidateEntities({
    ...candidate,
    source_entity_ids: parseJson(candidate.source_entity_ids_json, []),
    proposed_relation: parseJson(candidate.proposed_relation_json, {}),
  });
  db.prepare(`
    INSERT INTO knowledge_fusion_candidates (
      id, workspace_id, project_id, candidate_type, action, source_entity_ids_json,
      target_entity_id, proposed_entity_json, proposed_relation_json, reason,
      confidence, status, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @project_id, @candidate_type, @action, @source_entity_ids_json,
      @target_entity_id, @proposed_entity_json, @proposed_relation_json, @reason,
      @confidence, @status, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(candidate);
  return getKnowledgeFusionCandidate(candidate.id);
}

export function getKnowledgeFusionCandidate(id) {
  return mapKnowledgeFusionCandidate(db.prepare("SELECT * FROM knowledge_fusion_candidates WHERE id = ?").get(id));
}

export function updateKnowledgeFusionCandidate(id, patch = {}) {
  const current = getKnowledgeFusionCandidate(id);
  if (!current) return null;
  const next = {
    id,
    status: patch.status !== undefined ? nextFusionStatus(current.status, patch.status) : current.status,
    reason: patch.reason !== undefined ? cleanText(patch.reason) : current.reason,
    confidence: patch.confidence !== undefined ? Number(patch.confidence || 0) : current.confidence,
  };
  db.prepare(`
    UPDATE knowledge_fusion_candidates
    SET status = @status, reason = @reason, confidence = @confidence, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run(next);
  return getKnowledgeFusionCandidate(id);
}

export function listKnowledgeFusionCandidates(workspaceId, filters = {}) {
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];
  if (filters.project_id) {
    clauses.push("project_id = ?");
    params.push(filters.project_id);
  }
  if (filters.status) {
    clauses.push("status = ?");
    params.push(filters.status);
  }
  return db.prepare(`SELECT * FROM knowledge_fusion_candidates WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC, created_at DESC`)
    .all(...params)
    .map(mapKnowledgeFusionCandidate);
}

export function getKnowledgeEntityGraph(workspaceId, entityId, { depth = 1 } = {}) {
  const root = getKnowledgeEntity(entityId);
  if (!root || root.workspace_id !== workspaceId) return { nodes: [], edges: [] };
  const maxDepth = Math.max(1, Math.min(Number(depth || 1), 2));
  const nodes = new Map([[root.id, root]]);
  const edges = [];
  let frontier = [root.id];
  for (let level = 0; level < maxDepth; level += 1) {
    const next = [];
    for (const currentId of frontier) {
      const relations = listKnowledgeRelations(workspaceId, { entity_id: currentId });
      for (const relation of relations) {
        if (!edges.some((edge) => edge.id === relation.id)) edges.push(relation);
        for (const nodeId of [relation.from_entity_id, relation.to_entity_id]) {
          if (!nodes.has(nodeId)) {
            const node = getKnowledgeEntity(nodeId);
            if (node && node.workspace_id === workspaceId) {
              nodes.set(nodeId, node);
              next.push(nodeId);
            }
          }
        }
      }
    }
    frontier = next;
  }
  return { nodes: Array.from(nodes.values()), edges };
}

export function upsertFeishuBaseMapping(input = {}) {
  const mapping = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    object_type: oneOf(input.object_type, ["knowledge_gap", "review", "document", "project", "answer"], "review"),
    object_id: cleanText(input.object_id),
    base_app_token: cleanText(input.base_app_token || input.base_token),
    base_table_id: cleanText(input.base_table_id || input.table_id),
    base_record_id: cleanText(input.base_record_id || input.record_id),
    sync_direction: oneOf(input.sync_direction, ["loom_to_feishu", "feishu_to_loom", "bidirectional"], "loom_to_feishu"),
    field_map_json: jsonText(input.field_map, {}),
    last_synced_at: cleanText(input.last_synced_at),
    last_error: cleanText(input.last_error),
  };
  if (!mapping.workspace_id) throw new Error("workspace_id_required");
  if (!mapping.object_id) throw new Error("object_id_required");
  if (!mapping.base_app_token || !mapping.base_table_id) throw new Error("base_target_required");
  db.prepare(`
    INSERT INTO feishu_base_mappings (
      id, workspace_id, object_type, object_id, base_app_token, base_table_id,
      base_record_id, sync_direction, field_map_json, last_synced_at, last_error,
      created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @object_type, @object_id, @base_app_token, @base_table_id,
      @base_record_id, @sync_direction, @field_map_json, @last_synced_at, @last_error,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT(workspace_id, object_type, object_id, base_app_token, base_table_id) DO UPDATE SET
      base_record_id = excluded.base_record_id,
      sync_direction = excluded.sync_direction,
      field_map_json = excluded.field_map_json,
      last_synced_at = excluded.last_synced_at,
      last_error = excluded.last_error,
      updated_at = CURRENT_TIMESTAMP
  `).run(mapping);
  return getFeishuBaseMapping(mapping.workspace_id, mapping.object_type, mapping.object_id, mapping.base_app_token, mapping.base_table_id);
}

export function getFeishuBaseMapping(workspaceId, objectType, objectId, baseAppToken, baseTableId) {
  return mapFeishuBaseMapping(db.prepare(`
    SELECT * FROM feishu_base_mappings
    WHERE workspace_id = ? AND object_type = ? AND object_id = ? AND base_app_token = ? AND base_table_id = ?
  `).get(workspaceId, objectType, objectId, baseAppToken, baseTableId));
}

export function listFeishuBaseMappings(workspaceId, filters = {}) {
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];
  if (filters.object_type) {
    clauses.push("object_type = ?");
    params.push(filters.object_type);
  }
  if (filters.object_id) {
    clauses.push("object_id = ?");
    params.push(filters.object_id);
  }
  return db.prepare(`SELECT * FROM feishu_base_mappings WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC, created_at DESC`)
    .all(...params)
    .map(mapFeishuBaseMapping);
}

export function upsertKnowledgeSource(input = {}) {
  const policy = cleanAccessPolicy(input.access_policy);
  const source = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    source_type: oneOf(input.source_type, [
      "document",
      "project",
      "product",
      "demand",
      "news",
      "research",
      "knowledge_entity",
      "knowledge_relation",
      "manual",
      "external_report",
    ], "manual"),
    source_id: cleanText(input.source_id),
    project_id: cleanText(input.project_id),
    title: cleanText(input.title, "未命名来源"),
    url: cleanText(input.url),
    summary: cleanText(input.summary),
    raw_text: cleanText(input.raw_text),
    metadata_json: jsonText(input.metadata, {}),
    confidence: oneOf(input.confidence, ["raw", "ai_extracted", "user_submitted", "pm_confirmed", "published"], "raw"),
    content_hash: cleanText(input.content_hash, "no-hash"),
    ...policyFields(policy),
  };
  if (!source.workspace_id) throw new Error("workspace_id_required");
  if (!source.source_id) throw new Error("source_id_required");
  db.prepare(`
    INSERT INTO knowledge_sources (
      id, workspace_id, source_type, source_id, project_id, title, url, summary, raw_text,
      metadata_json, access_policy_json, visibility, rag_enabled, bot_enabled, external_safe,
      supplier_visible, sales_visible, confidence, content_hash, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @source_type, @source_id, @project_id, @title, @url, @summary, @raw_text,
      @metadata_json, @access_policy_json, @visibility, @rag_enabled, @bot_enabled, @external_safe,
      @supplier_visible, @sales_visible, @confidence, @content_hash, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT(workspace_id, source_type, source_id) DO UPDATE SET
      project_id = excluded.project_id,
      title = excluded.title,
      url = excluded.url,
      summary = excluded.summary,
      raw_text = excluded.raw_text,
      metadata_json = excluded.metadata_json,
      access_policy_json = excluded.access_policy_json,
      visibility = excluded.visibility,
      rag_enabled = excluded.rag_enabled,
      bot_enabled = excluded.bot_enabled,
      external_safe = excluded.external_safe,
      supplier_visible = excluded.supplier_visible,
      sales_visible = excluded.sales_visible,
      confidence = excluded.confidence,
      content_hash = excluded.content_hash,
      updated_at = CURRENT_TIMESTAMP
  `).run(source);
  return getKnowledgeSourceByOrigin(source.workspace_id, source.source_type, source.source_id);
}

export function getKnowledgeSource(id) {
  return mapKnowledgeSource(db.prepare("SELECT * FROM knowledge_sources WHERE id = ?").get(id));
}

export function getKnowledgeSourceByOrigin(workspaceId, sourceType, sourceId) {
  return mapKnowledgeSource(db.prepare(`
    SELECT * FROM knowledge_sources WHERE workspace_id = ? AND source_type = ? AND source_id = ?
  `).get(workspaceId, sourceType, sourceId));
}

export function listKnowledgeSources(workspaceId, filters = {}) {
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];
  if (filters.project_id) {
    clauses.push("project_id = ?");
    params.push(filters.project_id);
  }
  return db.prepare(`SELECT * FROM knowledge_sources WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC`)
    .all(...params)
    .map(mapKnowledgeSource);
}

export function replaceKnowledgeChunks(sourceId, chunks = []) {
  const source = getKnowledgeSource(sourceId);
  if (!source) return [];
  db.prepare("DELETE FROM knowledge_chunks_fts WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE source_id = ?)").run(sourceId);
  db.prepare("DELETE FROM knowledge_chunks WHERE source_id = ?").run(sourceId);
  const insert = db.prepare(`
    INSERT INTO knowledge_chunks (
      id, workspace_id, source_id, project_id, chunk_type, title, text, source_refs_json,
      tags_json, metadata_json, access_policy_json, visibility, rag_enabled, bot_enabled,
      external_safe, supplier_visible, sales_visible, confidence, content_hash, indexed_at
    ) VALUES (
      @id, @workspace_id, @source_id, @project_id, @chunk_type, @title, @text, @source_refs_json,
      @tags_json, @metadata_json, @access_policy_json, @visibility, @rag_enabled, @bot_enabled,
      @external_safe, @supplier_visible, @sales_visible, @confidence, @content_hash, CURRENT_TIMESTAMP
    )
  `);
  const insertFts = db.prepare("INSERT INTO knowledge_chunks_fts (chunk_id, workspace_id, title, text, tags) VALUES (?, ?, ?, ?, ?)");
  const created = [];
  const tx = db.transaction(() => {
    for (const chunk of chunks) {
      const policy = cleanAccessPolicy({ ...(source.access_policy || {}), ...(chunk.access_policy || {}) });
      const row = {
        id: chunk.id || nanoid(12),
        workspace_id: source.workspace_id,
        source_id: source.id,
        project_id: cleanText(chunk.project_id || source.project_id),
        chunk_type: oneOf(chunk.chunk_type, ["section", "fact", "quote", "spec", "requirement", "decision", "risk", "faq", "insight", "table"], "section"),
        title: cleanText(chunk.title, source.title),
        text: cleanText(chunk.text),
        source_refs_json: jsonText(chunk.source_refs, []),
        tags_json: jsonText(chunk.tags, []),
        metadata_json: jsonText(chunk.metadata, {}),
        confidence: oneOf(chunk.confidence || source.confidence, ["raw", "ai_extracted", "user_submitted", "pm_confirmed", "published"], source.confidence),
        content_hash: cleanText(chunk.content_hash, "no-hash"),
        ...policyFields(policy),
      };
      if (!row.text) continue;
      insert.run(row);
      insertFts.run(row.id, row.workspace_id, row.title, row.text, (chunk.tags || []).join(" "));
      created.push(getKnowledgeChunk(row.id));
    }
  });
  tx();
  return created;
}

export function getKnowledgeChunk(id) {
  return mapKnowledgeChunk(db.prepare("SELECT * FROM knowledge_chunks WHERE id = ?").get(id));
}

export function listKnowledgeChunks(workspaceId, filters = {}) {
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];
  if (filters.source_id) {
    clauses.push("source_id = ?");
    params.push(filters.source_id);
  }
  if (filters.project_id) {
    clauses.push("project_id = ?");
    params.push(filters.project_id);
  }
  return db.prepare(`SELECT * FROM knowledge_chunks WHERE ${clauses.join(" AND ")} ORDER BY indexed_at DESC`)
    .all(...params)
    .map(mapKnowledgeChunk);
}

export function createKnowledgePack(input = {}) {
  const pack = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    project_id: cleanText(input.project_id),
    title: cleanText(input.title, "未命名资料包"),
    pack_type: oneOf(input.pack_type, ["project", "research", "category", "product_line", "manual"], "manual"),
    input_json: jsonText(input.input, {}),
    coverage_score: Number(input.coverage_score || 0),
    open_questions_json: jsonText(input.open_questions, []),
    created_by: cleanText(input.created_by),
  };
  if (!pack.workspace_id) throw new Error("workspace_id_required");
  db.prepare(`
    INSERT INTO knowledge_packs (
      id, workspace_id, project_id, title, pack_type, input_json, coverage_score,
      open_questions_json, created_by, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @project_id, @title, @pack_type, @input_json, @coverage_score,
      @open_questions_json, @created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(pack);
  return getKnowledgePack(pack.id);
}

export function getKnowledgePack(id) {
  const pack = mapPack(db.prepare("SELECT * FROM knowledge_packs WHERE id = ?").get(id));
  if (!pack) return null;
  pack.sources = db.prepare(`
    SELECT s.*, ps.role AS pack_role
    FROM knowledge_pack_sources ps
    JOIN knowledge_sources s ON s.id = ps.source_id
    WHERE ps.pack_id = ? AND s.workspace_id = ?
    ORDER BY ps.created_at ASC
  `).all(id, pack.workspace_id).map(mapKnowledgeSource);
  pack.chunks = db.prepare(`
    SELECT c.*, pc.rank AS pack_rank
    FROM knowledge_pack_chunks pc
    JOIN knowledge_chunks c ON c.id = pc.chunk_id
    WHERE pc.pack_id = ? AND c.workspace_id = ?
    ORDER BY pc.rank ASC, pc.created_at ASC
  `).all(id, pack.workspace_id).map(mapKnowledgeChunk);
  return pack;
}

export function addSourceToPack(packId, sourceId, role = "supporting") {
  const pack = getKnowledgePack(packId);
  const source = getKnowledgeSource(sourceId);
  if (!pack) throw new Error("pack_not_found");
  if (!source) throw new Error("source_not_found");
  if (pack.workspace_id !== source.workspace_id) throw new Error("workspace_mismatch");
  db.prepare(`
    INSERT INTO knowledge_pack_sources (pack_id, source_id, role, created_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(pack_id, source_id) DO UPDATE SET role = excluded.role
  `).run(packId, sourceId, cleanText(role, "supporting"));
  return getKnowledgePack(packId);
}

export function addChunkToPack(packId, chunkId, rank = 0) {
  const pack = getKnowledgePack(packId);
  const chunk = getKnowledgeChunk(chunkId);
  if (!pack) throw new Error("pack_not_found");
  if (!chunk) throw new Error("chunk_not_found");
  if (pack.workspace_id !== chunk.workspace_id) throw new Error("workspace_mismatch");
  db.prepare(`
    INSERT INTO knowledge_pack_chunks (pack_id, chunk_id, rank, created_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(pack_id, chunk_id) DO UPDATE SET rank = excluded.rank
  `).run(packId, chunkId, Number(rank || 0));
  return getKnowledgePack(packId);
}

export function createKnowledgeGap(input = {}) {
  const gap = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    project_id: cleanText(input.project_id),
    pack_id: cleanText(input.pack_id),
    question: cleanText(input.question),
    reason: cleanText(input.reason, "missing_source"),
    related_source_ids_json: jsonText(input.related_source_ids, []),
    status: oneOf(input.status, ["open", "in_progress", "answered", "ignored"], "open"),
    owner_user_id: cleanText(input.owner_user_id),
    answer_document_id: cleanText(input.answer_document_id),
    answer_chunk_id: cleanText(input.answer_chunk_id),
    created_by: cleanText(input.created_by),
  };
  if (!gap.workspace_id) throw new Error("workspace_id_required");
  if (!gap.question) throw new Error("question_required");
  db.prepare(`
    INSERT INTO knowledge_gaps (
      id, workspace_id, project_id, pack_id, question, reason, related_source_ids_json,
      status, owner_user_id, answer_document_id, answer_chunk_id, created_by,
      created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @project_id, @pack_id, @question, @reason, @related_source_ids_json,
      @status, @owner_user_id, @answer_document_id, @answer_chunk_id, @created_by,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(gap);
  return getKnowledgeGap(gap.id);
}

export function getKnowledgeGap(id) {
  return mapGap(db.prepare("SELECT * FROM knowledge_gaps WHERE id = ?").get(id));
}

export function listKnowledgeGaps(workspaceId, status = "") {
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  return db.prepare(`SELECT * FROM knowledge_gaps WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`)
    .all(...params)
    .map(mapGap);
}

export function createKnowledgeQueryLog(input = {}) {
  const log = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    user_id: cleanText(input.user_id),
    project_id: cleanText(input.project_id),
    pack_id: cleanText(input.pack_id),
    channel: oneOf(input.channel, ["web", "feishu_private", "feishu_group"], "web"),
    audience: oneOf(input.audience, ["internal", "supplier", "sales_external"], "internal"),
    question: cleanText(input.question),
    answer: cleanText(input.answer),
    mode: oneOf(input.mode, ["answered", "partial", "refused"], "refused"),
    confidence: Number(input.confidence || 0),
    citations_json: jsonText(input.citations, []),
    matched_chunk_ids_json: jsonText(input.matched_chunk_ids, []),
    gap_ids_json: jsonText(input.gap_ids, []),
    latency_ms: Number(input.latency_ms || 0),
  };
  if (!log.workspace_id) throw new Error("workspace_id_required");
  db.prepare(`
    INSERT INTO knowledge_query_logs (
      id, workspace_id, user_id, project_id, pack_id, channel, audience, question,
      answer, mode, confidence, citations_json, matched_chunk_ids_json, gap_ids_json,
      latency_ms, created_at
    ) VALUES (
      @id, @workspace_id, @user_id, @project_id, @pack_id, @channel, @audience, @question,
      @answer, @mode, @confidence, @citations_json, @matched_chunk_ids_json, @gap_ids_json,
      @latency_ms, CURRENT_TIMESTAMP
    )
  `).run(log);
  return db.prepare("SELECT * FROM knowledge_query_logs WHERE id = ?").get(log.id);
}

export function upsertKnowledgeAnswer(input = {}) {
  const answer = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    project_id: cleanText(input.project_id),
    pack_id: cleanText(input.pack_id),
    scope_hash: answerScopeHash(input.project_id, input.pack_id),
    question_hash: cleanText(input.question_hash),
    question: cleanText(input.question),
    answer: cleanText(input.answer),
    citations_json: jsonText(input.citations, []),
    gap_ids_json: jsonText(input.gap_ids, []),
    mode: oneOf(input.mode, ["answered", "partial", "refused"], "answered"),
    confidence: Number(input.confidence || 0),
    audience: oneOf(input.audience, ["internal", "supplier", "sales_external"], "internal"),
    channel: oneOf(input.channel, ["web", "feishu_private", "feishu_group"], "web"),
    created_by: cleanText(input.created_by),
    source_query_log_id: cleanText(input.source_query_log_id),
    expires_at: cleanText(input.expires_at),
    metadata_json: jsonText(input.metadata, {}),
  };
  if (!answer.workspace_id) throw new Error("workspace_id_required");
  if (!answer.question_hash) throw new Error("question_hash_required");
  if (!answer.question) throw new Error("question_required");
  db.prepare(`
    INSERT INTO knowledge_answers (
      id, workspace_id, project_id, pack_id, scope_hash, question_hash, question, answer,
      citations_json, gap_ids_json, mode, confidence, audience, channel, created_by,
      source_query_log_id, expires_at, metadata_json, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @project_id, @pack_id, @scope_hash, @question_hash, @question, @answer,
      @citations_json, @gap_ids_json, @mode, @confidence, @audience, @channel, @created_by,
      @source_query_log_id, @expires_at, @metadata_json, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT(workspace_id, question_hash, scope_hash, audience, channel) DO UPDATE SET
      project_id = excluded.project_id,
      pack_id = excluded.pack_id,
      question = excluded.question,
      answer = excluded.answer,
      citations_json = excluded.citations_json,
      gap_ids_json = excluded.gap_ids_json,
      mode = excluded.mode,
      confidence = excluded.confidence,
      created_by = excluded.created_by,
      source_query_log_id = excluded.source_query_log_id,
      expires_at = excluded.expires_at,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `).run(answer);
  return getKnowledgeAnswer(answer.workspace_id, answer.question_hash, {
    project_id: answer.project_id,
    pack_id: answer.pack_id,
    audience: answer.audience,
    channel: answer.channel,
  });
}

export function getKnowledgeAnswer(workspaceId, questionHash, optionsOrAudience = "internal", channel = "web") {
  const options = typeof optionsOrAudience === "object" && optionsOrAudience !== null
    ? optionsOrAudience
    : { audience: optionsOrAudience, channel };
  const audience = oneOf(options.audience, ["internal", "supplier", "sales_external"], "internal");
  const answerChannel = oneOf(options.channel, ["web", "feishu_private", "feishu_group"], "web");
  const scopeHash = answerScopeHash(options.project_id, options.pack_id);
  return mapKnowledgeAnswer(db.prepare(`
    SELECT * FROM knowledge_answers
    WHERE workspace_id = ? AND question_hash = ? AND scope_hash = ? AND audience = ? AND channel = ?
  `).get(workspaceId, questionHash, scopeHash, audience, answerChannel));
}

export function listKnowledgeAnswers(workspaceId, filters = {}) {
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];
  if (filters.pack_id) {
    clauses.push("pack_id = ?");
    params.push(filters.pack_id);
  }
  if (filters.project_id) {
    clauses.push("project_id = ?");
    params.push(filters.project_id);
  }
  return db.prepare(`SELECT * FROM knowledge_answers WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC`)
    .all(...params)
    .map(mapKnowledgeAnswer);
}

export function createKnowledgeVectorJob(input = {}) {
  const job = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    source_id: cleanText(input.source_id),
    chunk_id: cleanText(input.chunk_id),
    adapter: cleanText(input.adapter, "sqlite_fts"),
    status: oneOf(input.status, ["pending", "prepared", "running", "done", "failed", "skipped"], "pending"),
    error: cleanText(input.error),
    metadata_json: jsonText(input.metadata, {}),
  };
  if (!job.workspace_id) throw new Error("workspace_id_required");
  db.prepare(`
    INSERT INTO knowledge_vector_jobs (
      id, workspace_id, source_id, chunk_id, adapter, status, error, metadata_json, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @source_id, @chunk_id, @adapter, @status, @error, @metadata_json,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(job);
  return mapJob(db.prepare("SELECT * FROM knowledge_vector_jobs WHERE id = ?").get(job.id));
}

export function createDocumentFileJob(input = {}) {
  const job = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    project_id: cleanText(input.project_id),
    document_id: cleanText(input.document_id),
    source_uri: cleanText(input.source_uri),
    file_name: cleanText(input.file_name),
    mime_type: cleanText(input.mime_type),
    storage_key: cleanText(input.storage_key),
    job_type: oneOf(input.job_type, ["import", "ocr", "vision_structure", "feishu_fetch"], "import"),
    status: oneOf(input.status, ["prepared", "pending", "running", "done", "failed", "skipped"], "prepared"),
    error: cleanText(input.error),
    metadata_json: jsonText(input.metadata, {}),
    created_by: cleanText(input.created_by),
  };
  if (!job.workspace_id) throw new Error("workspace_id_required");
  db.prepare(`
    INSERT INTO document_file_jobs (
      id, workspace_id, project_id, document_id, source_uri, file_name, mime_type,
      storage_key, job_type, status, error, metadata_json, created_by, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @project_id, @document_id, @source_uri, @file_name, @mime_type,
      @storage_key, @job_type, @status, @error, @metadata_json, @created_by,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(job);
  return mapJob(db.prepare("SELECT * FROM document_file_jobs WHERE id = ?").get(job.id));
}

export function createFeishuSyncJob(input = {}) {
  const job = {
    id: input.id || nanoid(12),
    workspace_id: cleanText(input.workspace_id),
    object_type: oneOf(input.object_type, ["document", "knowledge_gap", "review", "project"], "document"),
    object_id: cleanText(input.object_id),
    direction: oneOf(input.direction, ["import", "export", "bidirectional"], "export"),
    target_type: oneOf(input.target_type, ["doc", "base", "wiki", "bot"], "doc"),
    target_id: cleanText(input.target_id),
    status: oneOf(input.status, ["prepared", "pending", "running", "done", "failed", "skipped"], "prepared"),
    error: cleanText(input.error),
    payload_json: jsonText(input.payload, {}),
    metadata_json: jsonText(input.metadata, {}),
    created_by: cleanText(input.created_by),
  };
  if (!job.workspace_id) throw new Error("workspace_id_required");
  if (!job.object_id) throw new Error("object_id_required");
  db.prepare(`
    INSERT INTO feishu_sync_jobs (
      id, workspace_id, object_type, object_id, direction, target_type, target_id,
      status, error, payload_json, metadata_json, created_by, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @object_type, @object_id, @direction, @target_type, @target_id,
      @status, @error, @payload_json, @metadata_json, @created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(job);
  return mapJob(db.prepare("SELECT * FROM feishu_sync_jobs WHERE id = ?").get(job.id));
}
