import { beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const knowledge = await import("./knowledge-repository.js");
const access = await import("./document-access-service.js");
const exportService = await import("./feishu-doc-export-service.js");
const baseSync = await import("./feishu-base-sync-service.js");
const botService = await import("./feishu-bot-service.js");
const query = await import("./knowledge-query-service.js");

function resetKnowledgeTables() {
  dbModule.migrate();
  for (const table of [
    "knowledge_query_logs",
    "knowledge_gaps",
    "knowledge_pack_chunks",
    "knowledge_pack_sources",
    "knowledge_packs",
    "knowledge_chunks_fts",
    "knowledge_chunks",
    "knowledge_sources",
    "document_imports",
    "product_type_templates",
    "document_templates",
    "documents",
    "projects",
  ]) {
    dbModule.db.prepare(`DELETE FROM ${table}`).run();
  }
}

beforeEach(resetKnowledgeTables);

describe("document access and export services", () => {
  it("publishes a document, indexes it, and makes RAG citations available", async () => {
    const doc = knowledge.createDocument({
      id: "doc-publish",
      workspace_id: "ws-company",
      project_id: "proj-1",
      title: "Supplier PRD",
      doc_type: "prd",
      content: {
        normalized_sections: [
          { key: "functional_attributes", title: "功能属性", content: "支持快拆 quick release。" },
        ],
      },
    });

    const published = access.publishDocument(doc.id, { bot_enabled: true });
    const result = await query.queryKnowledge({
      workspace_id: "ws-company",
      project_id: "proj-1",
      question: "quick release",
      user_id: "user-1",
    });

    expect(published.document.status).toBe("published");
    expect(published.indexed.chunks).toHaveLength(1);
    expect(result.mode).toBe("answered");
    expect(result.citations[0].origin_source_id).toBe("doc-publish");
  });

  it("exports supplier and sales profiles by code-controlled section policy", () => {
    const doc = knowledge.createDocument({
      id: "doc-export",
      workspace_id: "ws-company",
      title: "Export PRD",
      doc_type: "prd",
      content: {
        normalized_sections: [
          {
            key: "functional_attributes",
            title: "功能属性",
            content: "供应商可见功能。",
            access_policy: { supplier_visible: true, sales_visible: true },
          },
          {
            key: "internal_risks",
            title: "内部风险",
            content: "内部成本策略 cost secret。",
            access_policy: { supplier_visible: false, sales_visible: false },
          },
        ],
      },
    });

    const supplier = exportService.exportSupplierDocument(doc.id);
    const sales = exportService.exportSalesDocument(doc.id);

    expect(supplier.section_count).toBe(1);
    expect(supplier.markdown).toContain("供应商可见功能");
    expect(supplier.markdown).not.toContain("cost secret");
    expect(sales.section_count).toBe(1);
    expect(sales.markdown).not.toContain("内部成本策略");
  });

  it("prepares a Feishu Base payload without pretending a real sync happened", () => {
    const gap = knowledge.createKnowledgeGap({
      workspace_id: "ws-company",
      question: "缺少认证信息？",
      reason: "missing_certification_source",
    });

    const result = baseSync.syncKnowledgeGapToFeishu(gap.id);
    const updated = knowledge.getKnowledgeGap(gap.id);

    expect(result.status).toBe("prepared");
    expect(result.real_sync).toBe(false);
    expect(result.feishu_record_id).toBe("");
    expect(result.payload.question).toBe("缺少认证信息？");
    expect(updated.status).toBe("open");
  });

  it("keeps Feishu Base review sync internal naming and records no fake write", () => {
    const doc = knowledge.createDocument({
      id: "doc-review-base",
      workspace_id: "ws-company",
      title: "Review PRD",
      doc_type: "prd",
    });

    const result = baseSync.syncDocumentReviewToFeishuBase(doc.id, { review_type: "prd_review" });

    expect(result.status).toBe("prepared");
    expect(result.real_sync).toBe(false);
    expect(result.review_type).toBe("prd_review");
    expect(JSON.stringify(result).toLowerCase()).not.toContain("bitable");
  });

  it("Feishu Bot only answers with chunks allowed for group bot channel", async () => {
    const internal = knowledge.upsertKnowledgeSource({
      workspace_id: "ws-company",
      source_type: "document",
      source_id: "doc-bot-internal",
      project_id: "proj-bot",
      title: "Internal Bot PRD",
      content_hash: "bot-internal",
      access_policy: { visibility: "project_team", rag_enabled: true, bot_enabled: true, external_safe: false },
    });
    knowledge.replaceKnowledgeChunks(internal.id, [{
      id: "chunk-bot-internal",
      title: "内部资料",
      text: "不能发到群里的 quick secret。",
      content_hash: "chunk-bot-internal",
      access_policy: { visibility: "project_team", rag_enabled: true, bot_enabled: true, external_safe: false },
    }]);
    const publicSource = knowledge.upsertKnowledgeSource({
      workspace_id: "ws-company",
      source_type: "document",
      source_id: "doc-bot-public",
      project_id: "proj-bot",
      title: "Public Bot PRD",
      content_hash: "bot-public",
      access_policy: { visibility: "workspace", rag_enabled: true, bot_enabled: true, external_safe: true },
    });
    knowledge.replaceKnowledgeChunks(publicSource.id, [{
      id: "chunk-bot-public",
      title: "群可见资料",
      text: "可以回答到群里的 quick public。",
      content_hash: "chunk-bot-public",
      access_policy: { visibility: "workspace", rag_enabled: true, bot_enabled: true, external_safe: true },
    }]);

    const answer = await botService.handleFeishuBotQuestion({
      workspace_id: "ws-company",
      project_id: "proj-bot",
      question: "quick",
      user_id: "bot-user",
      roles: ["member"],
    });

    expect(answer.result.mode).toBe("answered");
    expect(answer.result.citations.map((citation) => citation.chunk_id)).toEqual(["chunk-bot-public"]);
    expect(answer.card.data.title).toBe("LOOM 知识库回答");
  });
});
