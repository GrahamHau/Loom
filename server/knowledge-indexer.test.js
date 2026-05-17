import { beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const knowledge = await import("./knowledge-repository.js");
const indexer = await import("./knowledge-indexer.js");

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
    "knowledge_fusion_candidates",
    "knowledge_relations",
    "knowledge_entities",
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

describe("knowledge indexer", () => {
  it("indexes document sections into knowledge source, chunks, refs, and FTS", () => {
    const document = knowledge.createDocument({
      id: "doc-prd-1",
      workspace_id: "ws-company",
      project_id: "proj-1",
      title: "Deck PRD",
      doc_type: "prd",
      status: "published",
      content: {
        normalized_sections: [
          { key: "functional_attributes", title: "功能属性", content: "支持快捷按键控制 quick control。" },
          { key: "testing", title: "测试要求", content: "需要完成跌落测试。" },
        ],
      },
      access_policy: {
        rag_enabled: true,
        bot_enabled: true,
      },
    });

    const result = indexer.indexDocument(document);
    const ftsRows = dbModule.db.prepare("SELECT chunk_id FROM knowledge_chunks_fts WHERE knowledge_chunks_fts MATCH ?").all("quick");

    expect(result.skipped).toBe(false);
    expect(result.source).toMatchObject({ source_type: "document", source_id: "doc-prd-1", content_hash: result.content_hash });
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].source_refs[0]).toMatchObject({ source_type: "document", source_id: "doc-prd-1" });
    expect(result.chunks.every((chunk) => chunk.rag_enabled)).toBe(true);
    expect(ftsRows.map((row) => row.chunk_id)).toContain(result.chunks[0].id);
  });

  it("keeps imported documents private until explicitly enabled for RAG", () => {
    const document = knowledge.createDocument({
      id: "doc-private",
      workspace_id: "ws-company",
      project_id: "proj-1",
      title: "Private PRD",
      doc_type: "prd",
      content: {
        normalized_sections: [
          { key: "functional_attributes", title: "功能属性", content: "供应商不可见。" },
        ],
      },
    });

    const result = indexer.indexDocument(document);

    expect(result.source.rag_enabled).toBe(false);
    expect(result.source.bot_enabled).toBe(false);
    expect(result.chunks.every((chunk) => chunk.rag_enabled === false)).toBe(true);
  });

  it("skips chunk rebuild when source content hash is unchanged", () => {
    const product = {
      id: "prod-1",
      workspace_id: "ws-company",
      project_id: "proj-1",
      name: "Mini Console",
      brand: "Loom",
      category: "控制台",
      ai_summary: "适合桌搭控制。",
      selling_points: ["旋钮", "快捷键"],
    };

    const first = indexer.indexProduct(product);
    const second = indexer.indexProduct({ ...product });
    const chunks = knowledge.listKnowledgeChunks("ws-company", { source_id: first.source.id });

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
    expect(second.source.id).toBe(first.source.id);
    expect(chunks).toHaveLength(first.chunks.length);
  });

  it("rebuilds chunks when demand content changes", () => {
    const first = indexer.indexDemand({
      id: "demand-1",
      workspace_id: "ws-company",
      project_id: "proj-1",
      title: "户外直播",
      summary: "用户需要稳定支架。",
      painpoints: ["手持不稳"],
    });
    const second = indexer.indexDemand({
      id: "demand-1",
      workspace_id: "ws-company",
      project_id: "proj-1",
      title: "户外直播",
      summary: "用户需要稳定支架和补光。",
      painpoints: ["手持不稳", "夜间光线不足"],
    });

    expect(first.source.id).toBe(second.source.id);
    expect(second.skipped).toBe(false);
    expect(second.content_hash).not.toBe(first.content_hash);
    expect(knowledge.listKnowledgeChunks("ws-company", { source_id: second.source.id })[0].text).toContain("补光");
  });

  it("indexes news and research sources", () => {
    const news = indexer.indexNewsItem({
      id: "news-1",
      workspace_id: "ws-company",
      project_id: "proj-1",
      source_name: "Official RSS",
      original_title: "New controller trend",
      title_zh: "控制器趋势",
      summary_zh: "桌面控制器正在增长。",
      original_url: "https://example.test/news-1",
      type: "行业趋势",
      llm_processed: 1,
    });
    const research = indexer.indexResearch({
      id: "research-1",
      workspace_id: "ws-company",
      project_id: "proj-1",
      title: "控制器机会调研",
      desc: "分析桌搭控制器机会。",
      analysis: ["用户需要低学习成本", "竞品强调旋钮"],
    });

    expect(news.source.source_type).toBe("news");
    expect(news.chunks[0].source_refs[0]).toMatchObject({ url: "https://example.test/news-1" });
    expect(research.source.source_type).toBe("research");
    expect(research.chunks[0].text).toContain("低学习成本");
  });

  it("indexes ontology entities and relations as searchable knowledge facts", () => {
    const feature = knowledge.createKnowledgeEntity({
      id: "entity-feature-1",
      workspace_id: "ws-company",
      project_id: "proj-1",
      entity_type: "feature",
      canonical_name: "Quick release latch",
      summary: "支持单手快速拆装 quick release。",
      source_refs: [{ document_id: "doc-1", section_key: "functional_attributes" }],
    });
    const section = knowledge.createKnowledgeEntity({
      id: "entity-section-1",
      workspace_id: "ws-company",
      project_id: "proj-1",
      entity_type: "doc_section",
      canonical_name: "功能属性",
    });
    const relation = knowledge.createKnowledgeRelation({
      id: "relation-1",
      workspace_id: "ws-company",
      project_id: "proj-1",
      from_entity_id: feature.id,
      relation_type: "appears_in",
      to_entity_id: section.id,
      source_refs: [{ document_id: "doc-1" }],
    });

    const entityResult = indexer.indexKnowledgeEntity(feature);
    const relationResult = indexer.indexKnowledgeRelation(relation);
    const ftsRows = dbModule.db.prepare("SELECT chunk_id FROM knowledge_chunks_fts WHERE knowledge_chunks_fts MATCH ?").all("quick");

    expect(entityResult.source.source_type).toBe("knowledge_entity");
    expect(entityResult.chunks[0].source_refs[0]).toMatchObject({ entity_id: feature.id });
    expect(relationResult.source.source_type).toBe("knowledge_relation");
    expect(relationResult.chunks[0].source_refs[0]).toMatchObject({ relation_id: relation.id });
    expect(ftsRows.map((row) => row.chunk_id)).toContain(entityResult.chunks[0].id);
  });
});
