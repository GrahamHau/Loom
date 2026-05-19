import { nanoid } from "nanoid";
import { db } from "./db.js";
import { importFeishuDocument, importPastedDocument, parsePasteToRawBlocks } from "./document-import-service.js";
import { indexDocument } from "./knowledge-indexer.js";
import { getDocument, getDocumentImport, updateDocument, updateDocumentImport } from "./knowledge-repository.js";
import { upsertSignal, createEvidence } from "./signal-evidence-service.js";
import { projectToOntology } from "./ontology-service.js";
import { upsertKnowledgeSourcePolicy } from "./governance-service.js";
import { migrateKnowledgeSchema } from "./knowledge-schema.js";

migrateKnowledgeSchema();

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
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

function mapDataset(row) {
  if (!row) return null;
  return { ...row, mapping: parseJson(row.mapping_json, {}) };
}

function csvRows(csvText) {
  const lines = cleanText(csvText).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((item) => item.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((item) => item.trim());
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function storeBlocks(importId, workspaceId, rawBlocks = []) {
  db.prepare("DELETE FROM document_import_blocks WHERE import_id = ?").run(importId);
  rawBlocks.forEach((block, index) => {
    db.prepare(`
      INSERT INTO document_import_blocks (
        id, import_id, position, block_type, text_markdown, raw_json, source_locator, workspace_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `dib_${nanoid(12)}`,
      importId,
      index,
      block.type || block.block_type || "paragraph",
      block.text || block.text_markdown || "",
      jsonText(block, {}),
      block.source_locator || `block:${index + 1}`,
      workspaceId
    );
  });
}

function createImportSignal({ workspaceId, origin, sourceUrl, title, payload, createdBy }) {
  return upsertSignal({
    workspace_id: workspaceId,
    origin,
    type: "doc",
    source_url: sourceUrl,
    source_title: title,
    raw_payload: payload,
    created_by: createdBy,
  });
}

export async function importFeishuReviewDocument(input = {}) {
  const result = await importFeishuDocument(input);
  const workspaceId = cleanText(input.workspace_id);
  if (result.import?.id) storeBlocks(result.import.id, workspaceId, result.import.raw_blocks || []);
  const signal = createImportSignal({
    workspaceId,
    origin: "feishu_doc",
    sourceUrl: input.source_uri || input.url,
    title: result.document?.title || input.title || result.import?.title,
    payload: { import_id: result.import?.id, document_id: result.document?.id, error: result.error || "" },
    createdBy: input.created_by || input.created_by_user_id,
  });
  if (result.document) {
    upsertKnowledgeSourcePolicy({
      workspace_id: workspaceId,
      source_type: "document",
      source_id: result.document.id,
      rag_enabled: false,
      bot_enabled: false,
      sales_visible: false,
      supplier_visible: false,
      public_visible: false,
      default_audience: "internal",
      review_status: "draft",
    });
    projectToOntology({ workspace_id: workspaceId, sources: [{ source_type: "document", source_id: result.document.id, name: result.document.title }] });
  }
  return { ...result, signal };
}

export async function importPasteReviewDocument(input = {}) {
  const result = await importPastedDocument({
    ...input,
    text: input.markdown || input.text || input.content,
    created_by: input.created_by || input.created_by_user_id,
  });
  storeBlocks(result.import.id, result.import.workspace_id, result.import.raw_blocks || parsePasteToRawBlocks(input.markdown || input.text || input.content || ""));
  const signal = createImportSignal({
    workspaceId: result.import.workspace_id,
    origin: "manual",
    sourceUrl: input.source_uri || "",
    title: result.document?.title || input.title,
    payload: { import_id: result.import.id, document_id: result.document?.id },
    createdBy: input.created_by || input.created_by_user_id,
  });
  if (result.document) {
    upsertKnowledgeSourcePolicy({
      workspace_id: result.import.workspace_id,
      source_type: "document",
      source_id: result.document.id,
      rag_enabled: false,
      bot_enabled: false,
      sales_visible: false,
      supplier_visible: false,
      public_visible: false,
      default_audience: "internal",
      review_status: "draft",
    });
  }
  return { ...result, signal };
}

export function importCsvDataset(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const rows = csvRows(input.csv_text);
  const importId = input.id || `di_${nanoid(12)}`;
  db.prepare(`
    INSERT INTO document_imports (
      id, workspace_id, import_method, doc_type, title, source_uri, raw_blocks_json, status, created_by,
      created_at, updated_at
    ) VALUES (?, ?, 'paste', 'report', ?, '', ?, 'indexed', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(importId, workspaceId, cleanText(input.name, "CSV Import"), jsonText(rows, []), cleanText(input.created_by || input.created_by_user_id));
  const datasetId = `eds_${nanoid(12)}`;
  db.prepare(`
    INSERT INTO external_datasets (
      id, name, source_import_id, mapping_json, status, workspace_id, created_at
    ) VALUES (?, ?, ?, ?, 'review', ?, CURRENT_TIMESTAMP)
  `).run(datasetId, cleanText(input.name, "外部数据集"), importId, jsonText(input.mapping, {}), workspaceId);
  const datasetRows = [];
  rows.forEach((row, index) => {
    const signal = upsertSignal({
      workspace_id: workspaceId,
      origin: "external_saas",
      type: "other",
      source_url: input.source_url || "",
      raw_payload: row,
      created_by: input.created_by || input.created_by_user_id,
    });
    const evidence = createEvidence({
      workspace_id: workspaceId,
      kind: "claim_text",
      claim_text: JSON.stringify(row),
      confidence: 0.6,
      extracted_by: "rule",
      signal_ids: [signal.id],
    });
    const rowId = `edr_${nanoid(12)}`;
    db.prepare(`
      INSERT INTO external_dataset_rows (
        id, dataset_id, row_index, raw_json, signal_id, evidence_ids, match_status, workspace_id
      ) VALUES (?, ?, ?, ?, ?, ?, 'candidate', ?)
    `).run(rowId, datasetId, index, jsonText(row, {}), signal.id, jsonText([evidence.id], []), workspaceId);
    datasetRows.push({ id: rowId, row, signal, evidence });
  });
  return { import: getDocumentImport(importId), dataset: mapDataset(db.prepare("SELECT * FROM external_datasets WHERE id = ?").get(datasetId)), rows: datasetRows };
}

export function getImportWithBlocks(id) {
  const item = getDocumentImport(id);
  if (!item) return null;
  const blocks = db.prepare("SELECT * FROM document_import_blocks WHERE import_id = ? ORDER BY position").all(id)
    .map((row) => ({ ...row, raw_json: parseJson(row.raw_json, {}) }));
  return { import: item, document: item.document_id ? getDocument(item.document_id) : null, blocks };
}

export async function runDocumentImport(id) {
  const item = getDocumentImport(id);
  if (!item) return null;
  if (item.status !== "failed") return getImportWithBlocks(id);
  return importFeishuReviewDocument({
    existing_import_id: id,
    workspace_id: item.workspace_id,
    doc_type: item.doc_type,
    title: item.title,
    source_uri: item.source_uri,
    created_by: item.created_by,
  });
}

export function publishDocumentImport(id, input = {}) {
  const item = getDocumentImport(id);
  if (!item || !item.document_id) return null;
  const document = getDocument(item.document_id);
  if (!document) return null;
  const accessPolicy = {
    ...(document.access_policy || {}),
    visibility: "project_team",
    rag_enabled: Boolean(input.enable_rag),
    bot_enabled: Boolean(input.enable_bot),
  };
  const updated = updateDocument(document.id, { status: "published", access_policy: accessPolicy });
  let indexed = null;
  if (accessPolicy.rag_enabled) indexed = indexDocument(updated);
  upsertKnowledgeSourcePolicy({
    workspace_id: updated.workspace_id,
    source_type: "document",
    source_id: updated.id,
    rag_enabled: accessPolicy.rag_enabled,
    bot_enabled: accessPolicy.bot_enabled,
    sales_visible: false,
    supplier_visible: false,
    public_visible: false,
    default_audience: "internal",
    review_status: "approved",
  });
  updateDocumentImport(id, { status: "indexed", document_id: updated.id });
  return { import: getDocumentImport(id), document: updated, indexed };
}
