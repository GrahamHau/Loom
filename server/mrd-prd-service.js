import { nanoid } from "nanoid";
import {
  createDocument,
  getDocument,
  listDocumentSections,
  syncDocumentSectionsFromDocument,
  updateDocument,
} from "./knowledge-repository.js";
import { indexDocument } from "./knowledge-indexer.js";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function jsonEvidenceIds(section = {}) {
  if (Array.isArray(section.evidence_ids)) return section.evidence_ids.map(cleanText).filter(Boolean);
  if (Array.isArray(section.source_refs)) {
    return section.source_refs.flatMap((ref) => Array.isArray(ref.evidence_ids) ? ref.evidence_ids : []).map(cleanText).filter(Boolean);
  }
  return [];
}

const MRD_TEMPLATE = [
  ["sku_spu", "SKU / SPU 信息"],
  ["market_background", "市场背景"],
  ["target_users_scenarios", "目标用户与场景"],
  ["demands_painpoints", "用户需求"],
  ["competitor_landscape", "竞品格局"],
  ["cost_estimation", "成本估算"],
  ["opportunity_judgement", "机会判断"],
  ["risks_uncertainties", "风险与不确定性"],
  ["recommended_direction", "建议方向"],
  ["open_questions", "待确认问题"],
];

const PRD_TEMPLATE = [
  ["product_definition", "产品定义"],
  ["functional_attributes", "功能属性"],
  ["structure", "结构要求"],
  ["materials_process", "材料工艺"],
  ["id_cmf", "ID / CMF"],
  ["electronics_firmware_certification", "电子 / 固件 / 认证"],
  ["testing", "测试要求"],
  ["packaging", "包装需求"],
  ["supplier_delivery", "供应商交付"],
  ["quality_acceptance", "质量验收"],
  ["open_questions", "待确认问题"],
];

function sectionsFor(type) {
  return (type === "mrd" ? MRD_TEMPLATE : PRD_TEMPLATE).map(([key, title]) => ({
    key,
    title,
    content: "",
    evidence_ids: [],
    source_refs: [],
    status: "draft",
  }));
}

export function createStructuredDocument(type, input = {}) {
  const docType = type === "mrd" ? "mrd" : "prd";
  const document = createDocument({
    id: input.id || `${docType}_${nanoid(12)}`,
    workspace_id: cleanText(input.workspace_id),
    project_id: cleanText(input.project_id),
    title: cleanText(input.title, docType.toUpperCase()),
    doc_type: docType,
    owner_user_id: cleanText(input.author_user_id || input.created_by),
    status: "draft",
    content: {
      normalized_sections: sectionsFor(docType),
      parent_mrd_id: cleanText(input.parent_mrd_id),
    },
    access_policy: {
      visibility: "private",
      rag_enabled: false,
      bot_enabled: false,
      supplier_visible: false,
      sales_visible: false,
    },
    metadata: {
      category_id: cleanText(input.category_id),
      parent_mrd_id: cleanText(input.parent_mrd_id),
      m7_structured: true,
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
    },
  });
  syncDocumentSectionsFromDocument(document.id);
  return getStructuredDocument(document.id);
}

export function getStructuredDocument(id) {
  const document = getDocument(id);
  if (!document) return null;
  return {
    ...document,
    sections: Array.isArray(document.content?.normalized_sections)
      ? document.content.normalized_sections.map((section, index) => ({
        id: `${document.id}:${section.key}`,
        document_id: document.id,
        position: index,
        heading: section.title || section.heading || section.key,
        body_markdown: section.content || section.body_markdown || "",
        evidence_ids: jsonEvidenceIds(section),
        needs_review: Boolean(section.needs_review || lintSection(section).length),
        workspace_id: document.workspace_id,
      }))
      : listDocumentSections(id),
  };
}

export function getStructuredSectionDocument(sectionId, patch = {}) {
  const [documentId] = String(sectionId || "").includes(":")
    ? String(sectionId).split(":")
    : [cleanText(patch.document_id)];
  return documentId ? getDocument(documentId) : null;
}

function hasEvidenceToken(text) {
  return /\[ev:ev_[A-Za-z0-9_-]+]/.test(text);
}

export function lintSection(section = {}) {
  const body = cleanText(section.body_markdown || section.content);
  const evidenceIds = jsonEvidenceIds(section);
  const hasEvidence = evidenceIds.length > 0 || hasEvidenceToken(body);
  if (!body || hasEvidence) return [];
  const errors = [];
  const push = (rule, match) => errors.push({
    section_id: cleanText(section.id || section.key),
    span: { start: match.index || 0, end: (match.index || 0) + match[0].length },
    claim_text: match[0],
    rule,
    suggested_fix: "为该判断添加 [ev:ev_xxx] 或 section.evidence_ids。",
  });
  for (const match of body.matchAll(/[A-Za-z0-9\u4e00-\u9fff]*(?:\d+(?:\.\d+)?%|百分之\d+)[A-Za-z0-9\u4e00-\u9fff]*/g)) push("percentage_without_evidence", match);
  for (const match of body.matchAll(/(?:比|优于|强于|领先|更高|更低|better|leading)[^。.\n]{0,40}/gi)) push("comparator_without_evidence", match);
  for (const match of body.matchAll(/(?:DJI|Aputure|Godox|SmallRig|Manfrotto)[^。.\n]{0,30}/g)) push("named_competitor_without_evidence", match);
  if (!errors.length) {
    for (const match of body.matchAll(/\d+(?:\.\d+)?\s*(?:W|K|元|美金|美元|分钟|小时|个|%|pcs|mm|cm)?/gi)) push("numeric_without_evidence", match);
  }
  return errors;
}

export function lintStructuredDocument(id) {
  const doc = getStructuredDocument(id);
  if (!doc) return null;
  const errors = doc.sections.flatMap((section) => lintSection(section));
  return { document: doc, errors };
}

export function patchStructuredSection(sectionId, patch = {}) {
  const [documentId, sectionKey] = String(sectionId || "").includes(":")
    ? String(sectionId).split(":")
    : [cleanText(patch.document_id), cleanText(patch.section_key || patch.key || sectionId)];
  const document = getDocument(documentId);
  if (!document) return null;
  const sections = Array.isArray(document.content?.normalized_sections) ? document.content.normalized_sections : [];
  const nextSections = sections.map((section) => {
    if (section.key !== sectionKey) return section;
    const evidenceIds = Array.isArray(patch.evidence_ids) ? patch.evidence_ids.map(cleanText).filter(Boolean) : jsonEvidenceIds(section);
    const next = {
      ...section,
      ...(patch.heading !== undefined ? { title: cleanText(patch.heading) } : {}),
      ...(patch.body_markdown !== undefined ? { content: cleanText(patch.body_markdown) } : {}),
      evidence_ids: evidenceIds,
      ...(Array.isArray(patch.source_refs) ? { source_refs: patch.source_refs } : {}),
      ...(Array.isArray(patch.open_questions) ? { open_questions: patch.open_questions.map(cleanText).filter(Boolean) } : {}),
    };
    if (!Array.isArray(patch.source_refs)) {
      next.source_refs = evidenceIds.length ? [{ evidence_ids: evidenceIds }] : section.source_refs || [];
    }
    return { ...next, needs_review: lintSection(next).length > 0 };
  });
  const updated = updateDocument(document.id, { content: { ...(document.content || {}), normalized_sections: nextSections } });
  syncDocumentSectionsFromDocument(updated.id);
  const section = getStructuredDocument(updated.id).sections.find((item) => item.id === `${updated.id}:${sectionKey}`);
  return { ...section, lint_errors: lintSection(section) };
}

export function publishStructuredDocument(id) {
  const lint = lintStructuredDocument(id);
  if (!lint) return null;
  if (lint.errors.length) {
    const error = new Error("lint_failed");
    error.status = 409;
    error.errors = lint.errors;
    throw error;
  }
  const current = lint.document;
  const published = updateDocument(current.id, {
    status: "published",
    access_policy: {
      visibility: "project_team",
      rag_enabled: true,
      bot_enabled: true,
      external_safe: false,
      supplier_visible: false,
      sales_visible: false,
    },
    metadata: {
      ...(current.metadata || {}),
      published_at: new Date().toISOString(),
      version: Number(current.metadata?.version || 1),
    },
  });
  const indexed = indexDocument(published);
  return { document: getStructuredDocument(published.id), indexed_section_count: indexed.chunks.length };
}
