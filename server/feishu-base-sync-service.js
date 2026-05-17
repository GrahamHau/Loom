import { db } from "./db.js";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

export function syncKnowledgeGapToFeishu(gapId) {
  const gap = db.prepare("SELECT * FROM knowledge_gaps WHERE id = ?").get(gapId);
  if (!gap) return null;
  return {
    gap_id: gap.id,
    feishu_record_id: "",
    status: "prepared",
    real_sync: false,
    payload: {
      question: gap.question,
      reason: gap.reason,
      status: gap.status,
      project_id: gap.project_id || "",
      pack_id: gap.pack_id || "",
    },
    message: "P0 仅生成 KnowledgeGap 飞书多维表格 payload，未写入 Base；真实写入待接入 Base OpenAPI。",
  };
}

export function syncDocumentReviewToFeishuBase(documentId, input = {}) {
  return {
    document_id: documentId,
    feishu_record_id: "",
    status: "prepared",
    real_sync: false,
    review_type: cleanText(input.review_type, "document_review"),
    message: "P0 仅生成文档评审多维表格 payload，未写入 Base；真实写入待接入 Base OpenAPI。",
  };
}
