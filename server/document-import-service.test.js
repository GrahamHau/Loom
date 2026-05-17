import { beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const imports = await import("./document-import-service.js");
const feishuReader = await import("./feishu-doc-reader-service.js");
const knowledge = await import("./knowledge-repository.js");

function clearKnowledgeTables() {
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

beforeEach(() => {
  dbModule.migrate();
  clearKnowledgeTables();
});

describe("document import service", () => {
  it("parses pasted PRD text into raw blocks", () => {
    const blocks = imports.parsePasteToRawBlocks(`
# Deck PRD

功能需求
支持单手快拆。

| 功能 | 要求 |
| --- | --- |
| 快拆 | 单手操作 |

![结构图](https://example.test/image.png)
`);

    expect(blocks.map((block) => block.type)).toContain("heading");
    expect(blocks.map((block) => block.type)).toContain("table");
    expect(blocks.map((block) => block.type)).toContain("image_placeholder");
    expect(blocks.find((block) => block.type === "image_placeholder")?.metadata.reason).toBe("p0_skip_binary");
  });

  it("imports pasted PRD into a conservative non-RAG document", async () => {
    const project = knowledge.createProject({
      id: "proj-prd",
      workspace_id: "ws-company",
      name: "Quick Release",
    });

    const result = await imports.importPastedDocument({
      workspace_id: "ws-company",
      project_id: project.id,
      doc_type: "prd",
      text: `
# Quick Release PRD

功能需求
产品需支持单手快拆。

结构要求
[图片]

供应商特别沟通
这段模板里没有。
`,
      created_by: "user-1",
    });

    const sectionKeys = result.document.content.normalized_sections.map((section) => section.key);

    expect(result.import.status).toBe("indexed");
    expect(result.import.document_id).toBe(result.document.id);
    expect(result.document.rag_enabled).toBe(false);
    expect(result.document.bot_enabled).toBe(false);
    expect(result.document.supplier_visible).toBe(false);
    expect(sectionKeys).toContain("functional_attributes");
    expect(sectionKeys).toContain("structure");
    expect(result.document.content.image_placeholders).toHaveLength(1);
    expect(result.document.assets[0]).toMatchObject({ type: "image_placeholder" });
    expect(result.document.content.unmatched_sections.some((item) => item.title.includes("供应商特别沟通"))).toBe(true);
    expect(result.knowledge.entities.map((entity) => entity.entity_type)).toEqual(expect.arrayContaining(["document", "doc_section", "feature"]));
    expect(result.knowledge.relations.map((relation) => relation.relation_type)).toEqual(expect.arrayContaining(["contains", "appears_in"]));
    expect(result.knowledge.entities.every((entity) => entity.source_refs.length > 0)).toBe(true);
  });

  it("keeps Feishu import as a clear failed job when reader is unavailable", async () => {
    const result = await imports.importFeishuDocument({
      workspace_id: "ws-company",
      doc_type: "mrd",
      source_uri: "https://example.feishu.cn/docx/abc",
      reader: async () => {
        throw new feishuReader.FeishuDocumentReadError();
      },
    });

    expect(result.document).toBeNull();
    expect(result.import.status).toBe("failed");
    expect(result.error).toContain("无法读取飞书文档");
  });

  it("reuses the original Feishu import job when reader succeeds", async () => {
    const result = await imports.importFeishuDocument({
      workspace_id: "ws-company",
      doc_type: "prd",
      source_uri: "https://example.feishu.cn/docx/ok",
      reader: async () => ({
        title: "Feishu PRD",
        raw_blocks: imports.parsePasteToRawBlocks("功能需求\n支持 feishu quick release。"),
      }),
    });

    expect(result.import.status).toBe("indexed");
    expect(result.import.import_method).toBe("feishu_doc");
    expect(result.import.document_id).toBe(result.document.id);
    expect(result.document.metadata.import_id).toBe(result.import.id);
    expect(result.document.metadata.import_method).toBe("feishu_doc");
  });

  it("maps SKU/SPU and MRD cost estimation sections into structured knowledge", async () => {
    const result = await imports.importPastedDocument({
      workspace_id: "ws-company",
      doc_type: "mrd",
      import_method: "feishu_doc",
      source_uri: "https://example.feishu.cn/docx/mrd",
      text: `
# SKU / SPU 信息
SPU：Tripod Wallet
SKU：TW-001 / TW-002

成本估算
目标成本控制在 8 美金以内，重点关注材料、包装和打样报价。
`,
    });

    const sectionKeys = result.document.content.normalized_sections.map((section) => section.key);
    const entityTypes = result.knowledge.entities.map((entity) => entity.entity_type);

    expect(result.import.status).toBe("indexed");
    expect(sectionKeys).toEqual(expect.arrayContaining(["sku_spu", "cost_estimation"]));
    expect(entityTypes).toEqual(expect.arrayContaining(["sku_spu", "cost_estimation"]));
  });

  it("retries paste imports without inserting a duplicate import row", async () => {
    const first = await imports.importPastedDocument({
      workspace_id: "ws-company",
      doc_type: "prd",
      text: "功能需求\n支持 retry quick release。",
    });
    const retried = await imports.retryDocumentImport(first.import.id);
    const rows = dbModule.db.prepare("SELECT id FROM document_imports WHERE id = ?").all(first.import.id);

    expect(retried.import.id).toBe(first.import.id);
    expect(retried.import.status).toBe("indexed");
    expect(rows).toHaveLength(1);
  });

  it("reads Feishu docs through lark-cli output and converts media to placeholders", async () => {
    const result = feishuReader.__feishuDocReaderTestUtils.parseCliOutput(JSON.stringify({
      ok: true,
      data: {
        document: {
          document_id: "doc_test",
          revision_id: 8,
          content: "<title>Feishu PRD</title>\n\n# Feishu PRD\n\n功能需求\n支持快拆。\n<img token=\"img_1\"></img>",
        },
      },
    }), "https://example.feishu.cn/docx/ok");

    expect(result.title).toBe("Feishu PRD");
    expect(result.text).toContain("# Feishu PRD");
    expect(result.text).toContain("功能需求");
    expect(result.text).toContain("[图片]");
    expect(result.metadata.document_id).toBe("doc_test");
  });
});
