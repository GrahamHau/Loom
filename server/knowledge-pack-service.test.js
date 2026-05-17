import { beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const knowledge = await import("./knowledge-repository.js");
const indexer = await import("./knowledge-indexer.js");
const packService = await import("./knowledge-pack-service.js");

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

describe("knowledge pack service", () => {
  it("generates a project pack from indexed project sources and chunks", () => {
    indexer.indexProduct({
      id: "prod-1",
      workspace_id: "ws-company",
      project_id: "proj-1",
      name: "Mini Console",
      ai_summary: "桌搭控制器竞品。",
    });
    indexer.indexDemand({
      id: "demand-1",
      workspace_id: "ws-company",
      project_id: "proj-1",
      title: "直播控制",
      summary: "用户需要一键切场景。",
    });

    const pack = packService.generateProjectKnowledgePack({
      workspace_id: "ws-company",
      project_id: "proj-1",
      title: "Deck Control Pack",
      created_by: "tester",
    });

    expect(pack.pack_type).toBe("project");
    expect(pack.sources.map((source) => source.source_type).sort()).toEqual(["demand", "product"]);
    expect(pack.chunks).toHaveLength(2);
    expect(pack.coverage_score).toBeGreaterThan(0);
    expect(pack.open_questions).toEqual([]);
  });

  it("generates a research pack from the matching research source only", () => {
    indexer.indexResearch({
      id: "research-1",
      workspace_id: "ws-company",
      project_id: "proj-1",
      title: "控制器机会调研",
      desc: "面向 MRD 的机会判断。",
    });
    indexer.indexResearch({
      id: "research-2",
      workspace_id: "ws-company",
      project_id: "proj-1",
      title: "另一个调研",
      desc: "不应该进入 research-1 pack。",
    });

    const pack = packService.generateResearchKnowledgePack({
      workspace_id: "ws-company",
      project_id: "proj-1",
      research_id: "research-1",
    });

    expect(pack.pack_type).toBe("research");
    expect(pack.sources).toHaveLength(1);
    expect(pack.sources[0]).toMatchObject({ source_type: "research", source_id: "research-1", pack_role: "primary" });
    expect(pack.chunks).toHaveLength(1);
  });

  it("creates gaps when a project pack has no indexed sources", () => {
    const pack = packService.generateProjectKnowledgePack({
      workspace_id: "ws-company",
      project_id: "empty-project",
    });
    const gaps = knowledge.listKnowledgeGaps("ws-company", "open");

    expect(pack.sources).toHaveLength(0);
    expect(pack.open_questions[0]).toMatchObject({ reason: "missing_source" });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].pack_id).toBe(pack.id);
  });

  it("includes indexed ontology facts in project packs", () => {
    const feature = knowledge.createKnowledgeEntity({
      workspace_id: "ws-company",
      project_id: "proj-1",
      entity_type: "feature",
      canonical_name: "低重心锁紧结构",
      summary: "用于提升三脚架稳定性。",
    });
    indexer.indexKnowledgeEntity(feature);

    const pack = packService.generateProjectKnowledgePack({
      workspace_id: "ws-company",
      project_id: "proj-1",
    });

    expect(pack.sources.map((source) => source.source_type)).toContain("knowledge_entity");
    expect(pack.chunks.some((chunk) => chunk.text.includes("低重心锁紧结构"))).toBe(true);
  });
});
