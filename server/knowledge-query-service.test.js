import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const knowledge = await import("./knowledge-repository.js");
const indexer = await import("./knowledge-indexer.js");
const packService = await import("./knowledge-pack-service.js");
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
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("knowledge query service", () => {
  it("refuses imported documents until RAG is explicitly enabled", async () => {
    const document = knowledge.createDocument({
      id: "doc-private",
      workspace_id: "ws-company",
      project_id: "proj-1",
      title: "Private PRD",
      doc_type: "prd",
      content: {
        normalized_sections: [
          { key: "functional_attributes", title: "功能属性", content: "支持磁吸快拆 quick release。" },
        ],
      },
    });
    indexer.indexDocument(document);

    const result = await query.queryKnowledge({
      workspace_id: "ws-company",
      project_id: "proj-1",
      question: "quick release 是什么？",
      user_id: "user-1",
    });

    expect(result.mode).toBe("refused");
    expect(result.citations).toEqual([]);
    expect(result.gaps).toHaveLength(1);
  });

  it("answers with citations after a document is enabled for RAG", async () => {
    const document = knowledge.createDocument({
      id: "doc-public",
      workspace_id: "ws-company",
      project_id: "proj-1",
      title: "Public PRD",
      doc_type: "prd",
      content: {
        normalized_sections: [
          { key: "functional_attributes", title: "功能属性", content: "支持磁吸快拆 quick release。" },
        ],
      },
      access_policy: {
        visibility: "project_team",
        rag_enabled: true,
        bot_enabled: true,
      },
    });
    indexer.indexDocument(document);
    const pack = packService.generateProjectKnowledgePack({
      workspace_id: "ws-company",
      project_id: "proj-1",
    });

    const result = await query.queryKnowledge({
      workspace_id: "ws-company",
      project_id: "proj-1",
      pack_id: pack.id,
      question: "quick release 是什么？",
      user_id: "user-1",
      roles: ["member"],
    });

    expect(result.mode).toBe("answered");
    expect(result.answer).toContain("quick release");
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({ origin_source_id: "doc-public", title: "功能属性" });
    expect(query.listKnowledgeQueryLogs("ws-company")).toHaveLength(1);
  });

  it("uses CJK fallback terms when FTS tokenization misses Chinese wording", async () => {
    const document = knowledge.createDocument({
      id: "doc-cjk",
      workspace_id: "ws-company",
      project_id: "proj-cjk",
      title: "中文 PRD",
      doc_type: "prd",
      content: {
        normalized_sections: [
          { key: "functional_attributes", title: "功能属性", content: "产品必须支持磁吸快拆结构，并兼容单手操作。" },
        ],
      },
      access_policy: {
        visibility: "project_team",
        rag_enabled: true,
      },
    });
    indexer.indexDocument(document);

    const result = await query.queryKnowledge({
      workspace_id: "ws-company",
      project_id: "proj-cjk",
      question: "快拆方案",
      user_id: "user-cjk",
      roles: ["member"],
    });

    expect(result.mode).toBe("answered");
    expect(result.citations[0]).toMatchObject({ origin_source_id: "doc-cjk" });
  });

  it("enforces allowed_users and allowed_roles before retrieval", async () => {
    const source = knowledge.upsertKnowledgeSource({
      workspace_id: "ws-company",
      source_type: "document",
      source_id: "doc-role-limited",
      project_id: "proj-1",
      title: "Role Limited PRD",
      content_hash: "h-role",
      access_policy: {
        visibility: "role_limited",
        rag_enabled: true,
        allowed_users: ["allowed-user"],
        allowed_roles: ["pm"],
      },
    });
    knowledge.replaceKnowledgeChunks(source.id, [{
      id: "chunk-role-limited",
      title: "功能属性",
      text: "只有授权用户可读的 quick lock 方案。",
      content_hash: "c-role",
      access_policy: {
        visibility: "role_limited",
        rag_enabled: true,
        allowed_users: ["allowed-user"],
        allowed_roles: ["pm"],
      },
    }]);

    const blocked = await query.queryKnowledge({
      workspace_id: "ws-company",
      project_id: "proj-1",
      question: "quick lock",
      user_id: "other-user",
      roles: ["member"],
    });
    const byUser = await query.queryKnowledge({
      workspace_id: "ws-company",
      project_id: "proj-1",
      question: "quick lock",
      user_id: "allowed-user",
      roles: ["member"],
    });
    const byRole = await query.queryKnowledge({
      workspace_id: "ws-company",
      project_id: "proj-1",
      question: "quick lock",
      user_id: "pm-user",
      roles: ["pm"],
    });

    expect(blocked.mode).toBe("refused");
    expect(byUser.citations[0].chunk_id).toBe("chunk-role-limited");
    expect(byRole.citations[0].chunk_id).toBe("chunk-role-limited");
  });

  it("filters supplier audience before retrieval", async () => {
    const internal = knowledge.upsertKnowledgeSource({
      workspace_id: "ws-company",
      source_type: "document",
      source_id: "doc-internal",
      project_id: "proj-1",
      title: "Internal PRD",
      content_hash: "h1",
      access_policy: { rag_enabled: true, bot_enabled: true, supplier_visible: false },
    });
    knowledge.replaceKnowledgeChunks(internal.id, [{
      id: "chunk-internal",
      title: "内部成本",
      text: "供应商不能查看的 cost secret。",
      content_hash: "c1",
      access_policy: { rag_enabled: true, bot_enabled: true, supplier_visible: false },
    }]);

    const result = await query.queryKnowledge({
      workspace_id: "ws-company",
      project_id: "proj-1",
      question: "cost secret",
      user_id: "user-1",
      audience: "supplier",
    });

    expect(result.mode).toBe("refused");
    expect(result.citations).toHaveLength(0);
  });

  it("marks high-risk questions as needs_review when LLM is unavailable", async () => {
    const source = knowledge.upsertKnowledgeSource({
      workspace_id: "ws-company",
      source_type: "document",
      source_id: "doc-supplier",
      project_id: "proj-1",
      title: "Supplier PRD",
      content_hash: "h2",
      access_policy: { visibility: "project_team", rag_enabled: true, bot_enabled: true, supplier_visible: true },
    });
    knowledge.replaceKnowledgeChunks(source.id, [{
      id: "chunk-supplier",
      title: "认证要求",
      text: "供应商需要按认证要求打样 certification。",
      content_hash: "c2",
      access_policy: { rag_enabled: true, bot_enabled: true, supplier_visible: true },
    }]);

    const result = await query.queryKnowledge({
      workspace_id: "ws-company",
      project_id: "proj-1",
      question: "供应商认证要求是什么 certification？",
      user_id: "supplier-user",
      roles: ["member"],
      audience: "supplier",
    });

    expect(result.mode).toBe("answered");
    expect(result.needs_review).toBe(true);
    expect(result.model_status).toBe("strong_model_not_configured");
    expect(result.citations[0].chunk_id).toBe("chunk-supplier");
  });

  it("routes ordinary and high-risk answers to fast and strong models", async () => {
    dbModule.ensureSeed({
      user: { name: "Graham", role: "管理员", initials: "GR" },
      settings: {
        llm_api_url: "https://llm.example/v1",
        llm_model: "fallback-model",
        llm_fast_model: "fast-model",
        llm_strong_model: "strong-model",
        llm_api_key: "secret",
      },
    });
    const userId = dbModule.getLegacyUserId();
    const source = knowledge.upsertKnowledgeSource({
      workspace_id: "ws-company",
      source_type: "document",
      source_id: "doc-routing",
      project_id: "proj-1",
      title: "Routing PRD",
      content_hash: "h3",
      access_policy: { visibility: "project_team", rag_enabled: true, bot_enabled: true, supplier_visible: true },
    });
    knowledge.replaceKnowledgeChunks(source.id, [{
      id: "chunk-routing",
      title: "功能属性",
      text: "支持 quick control 和供应商认证。",
      content_hash: "c3",
      access_policy: { rag_enabled: true, bot_enabled: true, supplier_visible: true },
    }]);
    const models = [];
    vi.stubGlobal("fetch", async (_url, options) => {
      const body = JSON.parse(options.body);
      models.push(body.model);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: "ok", confidence: 0.8, used_chunk_ids: ["chunk-routing"] }) } }] }),
      };
    });

    await query.queryKnowledge({
      workspace_id: "ws-company",
      project_id: "proj-1",
      question: "quick control 是什么？",
      user_id: userId,
      roles: ["member"],
    });
    await query.queryKnowledge({
      workspace_id: "ws-company",
      project_id: "proj-1",
      question: "quick 供应商认证要求是什么？",
      audience: "supplier",
      user_id: userId,
      roles: ["member"],
    });

    expect(models).toEqual(["fast-model", "strong-model"]);
  });

  it("evaluates a small RAG regression set", async () => {
    const source = knowledge.upsertKnowledgeSource({
      workspace_id: "ws-company",
      source_type: "document",
      source_id: "doc-regression",
      project_id: "proj-regression",
      title: "Regression PRD",
      content_hash: "h-regression",
      access_policy: { visibility: "project_team", rag_enabled: true },
    });
    knowledge.replaceKnowledgeChunks(source.id, [{
      id: "chunk-regression",
      title: "功能属性",
      text: "支持 quick release 和磁吸快拆。",
      content_hash: "c-regression",
    }]);

    const report = await query.evaluateKnowledgeRegression({
      workspace_id: "ws-company",
      project_id: "proj-regression",
      user_id: "user-regression",
      roles: ["member"],
      cases: [
        { id: "en", question: "quick release", expected_chunk_ids: ["chunk-regression"], expected_terms: ["quick release"] },
        { id: "zh", question: "快拆方案", expected_chunk_ids: ["chunk-regression"] },
      ],
    });

    expect(report.total).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.pass_rate).toBe(1);
  });

  it("does not let regression cases override trusted user or role context", async () => {
    const source = knowledge.upsertKnowledgeSource({
      workspace_id: "ws-company",
      source_type: "document",
      source_id: "doc-regression-secret",
      project_id: "proj-regression",
      title: "Secret Regression PRD",
      content_hash: "h-regression-secret",
      access_policy: {
        visibility: "role_limited",
        rag_enabled: true,
        allowed_roles: ["pm"],
      },
    });
    knowledge.replaceKnowledgeChunks(source.id, [{
      id: "chunk-regression-secret",
      title: "内部判断",
      text: "只有 PM 可以看的 quick secret。",
      content_hash: "c-regression-secret",
    }]);

    const report = await query.evaluateKnowledgeRegression({
      workspace_id: "ws-company",
      project_id: "proj-regression",
      user_id: "member-user",
      roles: ["member"],
      cases: [
        {
          id: "cannot-escalate",
          question: "quick secret",
          expected_chunk_ids: ["chunk-regression-secret"],
          user_id: "pm-user",
          roles: ["pm"],
        },
      ],
    });

    expect(report.total).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.results[0].mode).toBe("refused");
    expect(report.results[0].missing_chunk_ids).toEqual(["chunk-regression-secret"]);
  });
});
