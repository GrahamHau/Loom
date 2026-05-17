import { getDocument } from "./knowledge-repository.js";
import { sectionsForExport } from "./document-access-service.js";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function markdownFor(document, sections, profile) {
  return [
    `# ${document.title}`,
    `> Export profile: ${profile}`,
    ...sections.flatMap((section) => [`## ${section.title}`, cleanText(section.content, "待补充。")]),
  ].join("\n\n");
}

export function buildDocumentExportPayload(documentId, profile = "feishu") {
  const document = getDocument(documentId);
  if (!document) return null;
  const sections = sectionsForExport(document, profile);
  return {
    document_id: document.id,
    title: document.title,
    doc_type: document.doc_type,
    profile,
    section_count: sections.length,
    sections,
    markdown: markdownFor(document, sections, profile),
    mocked: true,
    status: "prepared",
    real_export: false,
  };
}

export function exportDocumentToFeishu(documentId) {
  const payload = buildDocumentExportPayload(documentId, "feishu");
  if (!payload) return null;
  return {
    ...payload,
    feishu_doc_url: "",
    message: "P0 已生成飞书文档 payload，真实写入待接入 Feishu Docs OpenAPI。",
  };
}

export function exportSupplierDocument(documentId) {
  return buildDocumentExportPayload(documentId, "supplier");
}

export function exportSalesDocument(documentId) {
  return buildDocumentExportPayload(documentId, "sales");
}
