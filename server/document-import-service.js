import { nanoid } from "nanoid";
import {
  createDocument,
  createDocumentImport,
  createKnowledgeEntity,
  createKnowledgeFusionCandidate,
  createKnowledgeRelation,
  ensureDefaultKnowledgeTemplates,
  getDocument,
  getDocumentImport,
  listKnowledgeEntities,
  updateDocumentImport,
} from "./knowledge-repository.js";
import { normalizeBlocksWithTemplate, resolveDocumentTemplate } from "./document-template-service.js";
import { readFeishuDocument } from "./feishu-doc-reader-service.js";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").replace(/\r\n/g, "\n").trim();
  return text ? text : fallback;
}

function isImageMarker(line) {
  return /!\[[^\]]*]\([^)]+\)|\[图片]|【图片】|\[image]|\(image\)/i.test(line);
}

function headingLevel(line) {
  const markdown = line.match(/^(#{1,6})\s+(.+)$/);
  if (markdown) return { level: markdown[1].length, text: markdown[2].trim() };
  const numbered = line.match(/^(\d+(?:\.\d+)*|[一二三四五六七八九十]+)[、.]\s*(.+)$/);
  if (numbered && numbered[2].length <= 40) return { level: numbered[1].includes(".") ? 3 : 2, text: numbered[2].trim() };
  if (/^[^\s]{2,24}[：:]$/.test(line)) return { level: 2, text: line.replace(/[：:]$/, "").trim() };
  if (line.length <= 24 && /(需求|要求|定义|背景|结构|包装|测试|风险|问题|竞品|用户|场景|机会|建议|工艺|供应商|说明|交付|沟通|CMF|ID)/i.test(line)) {
    return { level: 2, text: line };
  }
  return null;
}

function parseTableLine(line) {
  if (!line.includes("|")) return null;
  const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
  if (cells.length < 2) return null;
  if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) return [];
  return cells;
}

export function parsePasteToRawBlocks(text, options = {}) {
  const lines = cleanText(text).split("\n");
  const blocks = [];
  let paragraph = [];
  let tableRows = [];

  const flushParagraph = () => {
    const body = paragraph.join("\n").trim();
    if (body) {
      blocks.push({ block_id: `paragraph_${blocks.length + 1}`, type: "paragraph", text: body });
    }
    paragraph = [];
  };
  const flushTable = () => {
    if (tableRows.length) {
      blocks.push({ block_id: `table_${blocks.length + 1}`, type: "table", rows: tableRows });
    }
    tableRows = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushTable();
      continue;
    }
    if (isImageMarker(line)) {
      flushParagraph();
      flushTable();
      blocks.push({
        block_id: `image_${blocks.length + 1}`,
        type: "image_placeholder",
        text: "[图片已跳过，请在原飞书文档查看]",
        metadata: { reason: "p0_skip_binary", original: line.slice(0, 200) },
      });
      continue;
    }
    const tableLine = parseTableLine(line);
    if (tableLine) {
      flushParagraph();
      tableRows.push(tableLine);
      continue;
    }
    flushTable();
    const heading = headingLevel(line);
    if (heading) {
      flushParagraph();
      blocks.push({ block_id: `heading_${blocks.length + 1}`, type: "heading", level: heading.level, text: heading.text });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  flushTable();

  if (!blocks.length && options.allowEmpty !== true) {
    throw new Error("document_import_empty_text");
  }
  return blocks;
}

function documentTitleFrom(input, rawBlocks) {
  if (cleanText(input.title)) return cleanText(input.title);
  const firstHeading = rawBlocks.find((block) => block.type === "heading");
  if (firstHeading?.text) return firstHeading.text;
  const firstParagraph = rawBlocks.find((block) => block.type === "paragraph");
  return cleanText(firstParagraph?.text, "未命名文档").slice(0, 80);
}

const SECTION_ENTITY_MAP = {
  functional_attributes: "feature",
  structure: "feature",
  materials_process: "feature",
  electronics_firmware_certification: "certification_requirement",
  packaging: "packaging_requirement",
  testing: "test_requirement",
  supplier_delivery: "supplier_capability",
  demands_painpoints: "need",
  target_users_scenarios: "need",
  competitor_landscape: "competitor",
  risks_uncertainties: "evidence",
  internal_risks: "evidence",
  open_questions: "evidence",
};

function firstContentLine(value) {
  return cleanText(value).split("\n").map((line) => line.trim()).find(Boolean) || "";
}

function sectionEntityType(section) {
  return SECTION_ENTITY_MAP[section?.key] || "doc_section";
}

function confidenceForSection(section) {
  const value = Number(section?.confidence || 0);
  return value > 0 ? value : 0.6;
}

function createSectionKnowledge({ document, normalized }) {
  const sections = Array.isArray(normalized.normalized_sections) ? normalized.normalized_sections : [];
  if (!document?.id || !sections.length) return { entities: [], relations: [], candidates: [] };

  const docEntity = createKnowledgeEntity({
    workspace_id: document.workspace_id,
    project_id: document.project_id,
    entity_type: "document",
    canonical_name: document.title,
    properties: {
      document_id: document.id,
      doc_type: document.doc_type,
      status: document.status,
    },
    source_refs: [{ document_id: document.id }],
    confidence: 1,
  });

  const entities = [docEntity];
  const relations = [];
  const candidates = [];

  for (const section of sections) {
    const content = cleanText(section.content || section.text);
    const sectionName = cleanText(firstContentLine(content), section.title || section.key || "文档章节").slice(0, 80);
    const sourceRef = {
      document_id: document.id,
      section_key: section.key,
      source_block_refs: section.source_block_refs || [],
    };
    const sectionEntity = createKnowledgeEntity({
      workspace_id: document.workspace_id,
      project_id: document.project_id,
      entity_type: "doc_section",
      canonical_name: cleanText(section.title || section.key, "文档章节"),
      summary: content.slice(0, 500),
      properties: {
        document_id: document.id,
        section_key: section.key,
        title: section.title,
      },
      source_refs: [sourceRef],
      confidence: confidenceForSection(section),
    });
    const extractedEntity = createKnowledgeEntity({
      workspace_id: document.workspace_id,
      project_id: document.project_id,
      entity_type: sectionEntityType(section),
      canonical_name: sectionName,
      summary: content.slice(0, 500),
      properties: {
        section_key: section.key,
        title: section.title,
        tables: section.tables || [],
      },
      source_refs: [sourceRef],
      confidence: confidenceForSection(section),
      review_required: confidenceForSection(section) < 0.75 || section.key === "open_questions",
    });
    entities.push(sectionEntity, extractedEntity);
    relations.push(createKnowledgeRelation({
      workspace_id: document.workspace_id,
      project_id: document.project_id,
      from_entity_id: docEntity.id,
      relation_type: "contains",
      to_entity_id: sectionEntity.id,
      source_refs: [sourceRef],
      confidence: 0.95,
    }));
    relations.push(createKnowledgeRelation({
      workspace_id: document.workspace_id,
      project_id: document.project_id,
      from_entity_id: extractedEntity.id,
      relation_type: "appears_in",
      to_entity_id: sectionEntity.id,
      source_refs: [sourceRef],
      confidence: confidenceForSection(section),
      review_required: extractedEntity.review_required,
    }));

    const duplicates = listKnowledgeEntities(document.workspace_id, {
      project_id: document.project_id,
      entity_type: extractedEntity.entity_type,
      status: "active",
    }).filter((item) => item.id !== extractedEntity.id && item.canonical_name === extractedEntity.canonical_name);
    if (duplicates.length) {
      candidates.push(createKnowledgeFusionCandidate({
        workspace_id: document.workspace_id,
        project_id: document.project_id,
        candidate_type: "entity",
        action: "merge",
        source_entity_ids: [duplicates[0].id, extractedEntity.id],
        target_entity_id: duplicates[0].id,
        proposed_entity: {
          canonical_name: extractedEntity.canonical_name,
          entity_type: extractedEntity.entity_type,
        },
        reason: "同项目下出现相同实体名称，等待确认是否合并。",
        confidence: 0.7,
      }));
    }

    if (extractedEntity.review_required) {
      candidates.push(createKnowledgeFusionCandidate({
        workspace_id: document.workspace_id,
        project_id: document.project_id,
        candidate_type: "relation",
        action: "review",
        source_entity_ids: [extractedEntity.id, sectionEntity.id],
        proposed_relation: {
          from_entity_id: extractedEntity.id,
          relation_type: "appears_in",
          to_entity_id: sectionEntity.id,
        },
        reason: "章节内容置信度不足或包含待确认问题，需要 PM review。",
        confidence: extractedEntity.confidence,
      }));
    }
  }

  return { entities, relations, candidates };
}

function sourceImportMethod(value) {
  return value === "feishu_doc" ? "feishu_doc" : "paste";
}

export async function importPastedDocument(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  if (!workspaceId) throw new Error("workspace_id_required");
  ensureDefaultKnowledgeTemplates(workspaceId);
  const importMethod = sourceImportMethod(input.import_method);
  const docType = cleanText(input.doc_type, "other");
  const rawBlocks = Array.isArray(input.raw_blocks) && input.raw_blocks.length
    ? input.raw_blocks
    : parsePasteToRawBlocks(input.text || input.content || "");
  const template = resolveDocumentTemplate({ workspaceId, docType, templateId: input.template_id });
  const normalized = normalizeBlocksWithTemplate(rawBlocks, template);
  const title = documentTitleFrom(input, rawBlocks);
  const importJob = input.existing_import_id
    ? updateDocumentImport(input.existing_import_id, { status: "normalizing", raw_blocks: rawBlocks, error: "" })
    : createDocumentImport({
      id: input.id || nanoid(12),
      workspace_id: workspaceId,
      project_id: input.project_id,
      import_method: importMethod,
      doc_type: docType,
      template_id: template?.id || input.template_id,
      title,
      source_uri: input.source_uri,
      raw_blocks: rawBlocks,
      status: "normalizing",
      created_by: input.created_by,
    });
  const document = createDocument({
    workspace_id: workspaceId,
    project_id: input.project_id,
    title,
    doc_type: docType,
    template_id: template?.id || input.template_id,
    source_uri: input.source_uri,
    author: input.author,
    owner_user_id: input.created_by,
    content_text: rawBlocks.map((block) => block.text || "").filter(Boolean).join("\n\n"),
    content: normalized,
    assets: normalized.image_placeholders.map((item) => ({
      type: "image_placeholder",
      block_id: item.block_id,
      note: item.note,
      metadata: item.metadata || { reason: "p0_skip_binary" },
    })),
    access_policy: {
      visibility: "private",
      rag_enabled: false,
      bot_enabled: false,
      supplier_visible: false,
      sales_visible: false,
    },
    metadata: { import_id: importJob.id, import_method: importMethod },
  });
  const knowledge = createSectionKnowledge({ document, normalized });
  const updatedImport = updateDocumentImport(importJob.id, {
    status: "indexed",
    raw_blocks: rawBlocks,
    document_id: document.id,
  });
  return { import: updatedImport, document, knowledge };
}

export async function importFeishuDocument(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  if (!workspaceId) throw new Error("workspace_id_required");
  const importJob = createDocumentImport({
    workspace_id: workspaceId,
    project_id: input.project_id,
    import_method: "feishu_doc",
    doc_type: cleanText(input.doc_type, "other"),
    template_id: input.template_id,
    title: input.title,
    source_uri: input.source_uri || input.url,
    status: "reading",
    created_by: input.created_by,
  });
  try {
    const reader = typeof input.reader === "function" ? input.reader : readFeishuDocument;
    const readResult = await reader(input);
    return importPastedDocument({
      ...input,
      existing_import_id: importJob.id,
      import_method: "feishu_doc",
      title: input.title || readResult.title,
      text: readResult.text,
      raw_blocks: readResult.raw_blocks,
      source_uri: input.source_uri || input.url,
    });
  } catch (error) {
    const failed = updateDocumentImport(importJob.id, {
      status: "failed",
      error: error.message || "feishu_document_read_unavailable",
    });
    return { import: failed, document: null, error: failed.error };
  }
}

export function getDocumentImportResult(id) {
  const item = getDocumentImport(id);
  if (!item) return null;
  return {
    import: item,
    document: item.document_id ? getDocument(item.document_id) : null,
  };
}

export async function retryDocumentImport(id) {
  const item = getDocumentImport(id);
  if (!item) return null;
  if (item.import_method === "paste") {
    return importPastedDocument({
      existing_import_id: item.id,
      import_method: item.import_method,
      workspace_id: item.workspace_id,
      project_id: item.project_id,
      doc_type: item.doc_type,
      template_id: item.template_id,
      title: item.title,
      raw_blocks: item.raw_blocks,
      created_by: item.created_by,
    });
  }
  return importFeishuDocument({
    workspace_id: item.workspace_id,
    project_id: item.project_id,
    doc_type: item.doc_type,
    template_id: item.template_id,
    title: item.title,
    source_uri: item.source_uri,
    created_by: item.created_by,
  });
}
