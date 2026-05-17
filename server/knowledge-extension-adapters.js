import {
  createDocumentFileJob,
  createFeishuSyncJob,
  createKnowledgeVectorJob,
} from "./knowledge-repository.js";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

export function queueVectorIndexJob(input = {}) {
  const adapter = cleanText(input.adapter || process.env.KNOWLEDGE_VECTOR_ADAPTER, "sqlite_fts");
  return createKnowledgeVectorJob({
    ...input,
    adapter,
    status: adapter === "sqlite_fts" ? "skipped" : "prepared",
    metadata: {
      ...(input.metadata || {}),
      vector_adapter_configured: adapter !== "sqlite_fts",
      vector_indexed: false,
      reason: adapter === "sqlite_fts" ? "P0 uses SQLite FTS; vector adapter not configured." : "Vector adapter job prepared.",
    },
  });
}

export function prepareDocumentFileJob(input = {}) {
  return createDocumentFileJob({
    ...input,
    status: "prepared",
    metadata: {
      ...(input.metadata || {}),
      binary_import_enabled: false,
      ocr_enabled: false,
      reason: "File/OCR pipeline is prepared for a future adapter; P0 does not download or OCR binary assets.",
    },
  });
}

export function prepareFeishuSyncJob(input = {}) {
  return createFeishuSyncJob({
    ...input,
    status: "prepared",
    metadata: {
      ...(input.metadata || {}),
      real_sync_enabled: false,
      reason: "Feishu bidirectional sync adapter is prepared; real OpenAPI writeback is not enabled in P0.",
    },
  });
}
