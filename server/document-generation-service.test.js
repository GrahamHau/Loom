import { beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const knowledge = await import("./knowledge-repository.js");
const generation = await import("./document-generation-service.js");

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

function createPackWithChunks() {
  const source = knowledge.upsertKnowledgeSource({
    workspace_id: "ws-company",
    source_type: "manual",
    source_id: "source-1",
    project_id: "proj-1",
    title: "硬件机会资料",
    content_hash: "source-hash",
  });
  const chunks = knowledge.replaceKnowledgeChunks(source.id, [
    {
      id: "chunk-market",
      title: "市场背景",
      text: "桌面效率硬件市场增长，用户希望减少切换成本。",
      tags: ["市场"],
      content_hash: "chunk-market",
    },
    {
      id: "chunk-function",
      title: "功能属性",
      text: "核心功能包括快捷控制、状态显示和多设备连接。",
      tags: ["功能"],
      content_hash: "chunk-function",
    },
    {
      id: "chunk-supplier",
      title: "供应商交付",
      text: "供应商需要提供结构图、BOM、打样计划和测试报告。",
      tags: ["供应商"],
      content_hash: "chunk-supplier",
    },
  ]);
  let pack = knowledge.createKnowledgePack({
    workspace_id: "ws-company",
    project_id: "proj-1",
    title: "Deck Control Pack",
    pack_type: "project",
    open_questions: [{ question: "认证范围是否覆盖海外销售？" }],
  });
  pack = knowledge.addSourceToPack(pack.id, source.id, "primary");
  chunks.forEach((chunk, index) => {
    pack = knowledge.addChunkToPack(pack.id, chunk.id, index + 1);
  });
  return pack;
}

beforeEach(resetKnowledgeTables);

describe("document generation service", () => {
  it("generates an MRD draft with the required 8 sections", () => {
    const pack = createPackWithChunks();
    const result = generation.generateMrdDraft({ pack_id: pack.id });

    expect(result.document.doc_type).toBe("mrd");
    expect(result.sections.map((section) => section.title)).toEqual([
      "SKU / SPU 信息",
      "市场背景",
      "目标用户与场景",
      "需求与痛点",
      "竞品格局",
      "成本估算",
      "机会判断",
      "风险与不确定性",
      "建议方向",
      "待确认问题",
    ]);
    expect(result.document.content.normalized_sections).toHaveLength(10);
    expect(result.document.content_text).toContain("认证范围是否覆盖海外销售");
    expect(result.needs_review).toBe(true);
    expect(result.model_status.strong_model_available).toBe(false);
    expect(result.sections.every((section) => section.source_refs.length || section.open_questions.length)).toBe(true);
  });

  it("generates hardware PRD language without MVP, backlog, or sprint wording", () => {
    const pack = createPackWithChunks();
    const result = generation.generatePrdDraft({ pack_id: pack.id });
    const text = result.document.content_text.toLowerCase();

    expect(result.document.doc_type).toBe("prd");
    expect(result.sections.map((section) => section.key)).toContain("functional_attributes");
    expect(result.document.content_text).toContain("功能属性");
    expect(result.document.content_text).toContain("供应商交付");
    expect(text).not.toMatch(/\bmvp\b/);
    expect(text).not.toMatch(/\bbacklog\b/);
    expect(text).not.toMatch(/\bsprint\b/);
  });

  it("respects enabled_modules from product_type_template", () => {
    const pack = createPackWithChunks();
    knowledge.upsertProductTypeTemplate({
      workspace_id: "ws-company",
      name: "自定义硬件",
      code: "custom_hardware",
      enabled_modules: ["product_definition", "testing", "open_questions"],
    });

    const result = generation.generatePrdDraft({
      pack_id: pack.id,
      product_type_code: "custom_hardware",
    });

    expect(result.sections.map((section) => section.key)).toEqual(["product_definition", "testing", "open_questions"]);
    expect(result.document.metadata.enabled_modules).toEqual(["product_definition", "testing", "open_questions"]);
  });

  it("keeps generated documents out of RAG by default", () => {
    const pack = createPackWithChunks();
    const result = generation.generatePrdDraft({ pack_id: pack.id });

    expect(result.document.rag_enabled).toBe(false);
    expect(result.document.bot_enabled).toBe(false);
    expect(result.document.supplier_visible).toBe(false);
    expect(result.document.sales_visible).toBe(false);
    expect(result.document.access_policy).toMatchObject({
      rag_enabled: false,
      bot_enabled: false,
      supplier_visible: false,
      sales_visible: false,
    });
  });

  it("adds open questions for sections with no available source refs", () => {
    const pack = knowledge.createKnowledgePack({
      workspace_id: "ws-company",
      project_id: "proj-empty",
      title: "Empty Evidence Pack",
      pack_type: "project",
    });

    const result = generation.generatePrdDraft({
      pack_id: pack.id,
      enabled_modules: ["functional_attributes", "open_questions"],
    });
    const functional = result.sections.find((section) => section.key === "functional_attributes");

    expect(functional.source_refs).toEqual([]);
    expect(functional.open_questions[0]).toContain("功能属性");
  });

  it("does not use unrelated chunks as section evidence", () => {
    const pack = createPackWithChunks();
    const result = generation.generateMrdDraft({ pack_id: pack.id });
    const competitor = result.sections.find((section) => section.key === "competitor_landscape");

    expect(competitor.source_refs).toEqual([]);
    expect(competitor.open_questions[0]).toContain("竞品格局");
  });
});
