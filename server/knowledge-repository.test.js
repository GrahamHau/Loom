import { beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const knowledge = await import("./knowledge-repository.js");
const adapters = await import("./knowledge-extension-adapters.js");

beforeEach(() => {
  dbModule.migrate();
  for (const table of [
    "feishu_sync_jobs",
    "document_file_jobs",
    "knowledge_vector_jobs",
    "knowledge_answers",
    "document_sections",
    "knowledge_query_logs",
    "knowledge_gaps",
    "knowledge_pack_chunks",
    "knowledge_pack_sources",
    "knowledge_packs",
    "knowledge_chunks_fts",
    "knowledge_chunks",
    "knowledge_sources",
    "feishu_base_mappings",
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
});

describe("knowledge repository", () => {
  it("seeds default document and product type templates without hard-coding company product types", () => {
    const seeded = knowledge.ensureDefaultKnowledgeTemplates("ws-company");

    expect(seeded.document_templates.map((item) => item.doc_type).sort()).toEqual(["mrd", "prd"]);
    expect(seeded.document_templates.find((item) => item.doc_type === "prd").sections.map((item) => item.key)).toContain("packaging");
    expect(seeded.document_templates.find((item) => item.doc_type === "prd").sections.map((item) => item.key)).toContain("sku_spu");
    expect(seeded.document_templates.find((item) => item.doc_type === "mrd").sections.map((item) => item.key)).toContain("cost_estimation");
    expect(seeded.product_type_templates).toHaveLength(1);
    expect(seeded.product_type_templates[0]).toMatchObject({
      code: "generic_hardware",
      name: "通用硬件产品",
    });

    const again = knowledge.ensureDefaultKnowledgeTemplates("ws-company");
    expect(again.document_templates).toHaveLength(2);
    expect(knowledge.listDocumentTemplates("ws-company")).toHaveLength(2);
    expect(knowledge.listProductTypeTemplates("ws-company")).toHaveLength(1);
  });

  it("creates projects and documents with conservative RAG defaults", () => {
    const project = knowledge.createProject({
      id: "proj-1",
      workspace_id: "ws-company",
      name: "Deck Control",
      status: "active",
    });

    const document = knowledge.createDocument({
      id: "doc-1",
      workspace_id: "ws-company",
      project_id: project.id,
      title: "Deck PRD",
      doc_type: "prd",
      content: {
        normalized_sections: [
          { key: "functional_attributes", content: "支持快捷按键控制。" },
        ],
      },
    });

    expect(project.name).toBe("Deck Control");
    expect(document.doc_type).toBe("prd");
    expect(document.rag_enabled).toBe(false);
    expect(document.bot_enabled).toBe(false);
    expect(document.supplier_visible).toBe(false);
    expect(document.content.normalized_sections[0].key).toBe("functional_attributes");
  });

  it("stores imports as raw blocks and keeps image placeholders as metadata only", () => {
    const item = knowledge.createDocumentImport({
      workspace_id: "ws-company",
      project_id: "proj-1",
      import_method: "paste",
      doc_type: "prd",
      title: "Pasted PRD",
      raw_blocks: [
        { block_id: "h1", type: "heading", level: 1, text: "功能需求" },
        { block_id: "img1", type: "image_placeholder", text: "[图片已跳过，请在原飞书文档查看]" },
      ],
    });

    expect(item.raw_blocks).toHaveLength(2);
    expect(item.raw_blocks[1]).toMatchObject({ type: "image_placeholder" });
    expect(item.status).toBe("pending");
  });

  it("lists document imports for a workspace", () => {
    const created = knowledge.createDocumentImport({
      workspace_id: "ws-company",
      doc_type: "mrd",
      title: "Import One",
      import_method: "paste",
      status: "indexed",
    });

    const items = knowledge.listDocumentImports("ws-company");
    expect(items.map((item) => item.id)).toContain(created.id);
  });

  it("stores ontology entities, relations, fusion candidates, graph views, and Feishu Base mappings", () => {
    const feature = knowledge.createKnowledgeEntity({
      workspace_id: "ws-company",
      project_id: "proj-ontology",
      entity_type: "feature",
      canonical_name: "单手快拆",
      aliases: ["一键快拆"],
      properties: { priority: "must" },
      source_refs: [{ document_id: "doc-prd", section_key: "functional_attributes" }],
      confidence: 0.86,
    });
    const need = knowledge.createKnowledgeEntity({
      workspace_id: "ws-company",
      project_id: "proj-ontology",
      entity_type: "need",
      canonical_name: "快速切换拍摄设备",
      source_refs: [{ source_id: "demand-1" }],
      review_required: true,
      confidence: 0.72,
    });
    const relation = knowledge.createKnowledgeRelation({
      workspace_id: "ws-company",
      project_id: "proj-ontology",
      from_entity_id: feature.id,
      relation_type: "derived_from",
      to_entity_id: need.id,
      source_refs: [{ document_id: "doc-prd" }],
      confidence: 0.7,
      review_required: true,
    });
    const candidate = knowledge.createKnowledgeFusionCandidate({
      workspace_id: "ws-company",
      project_id: "proj-ontology",
      candidate_type: "relation",
      action: "review",
      source_entity_ids: [feature.id, need.id],
      proposed_relation: {
        from_entity_id: feature.id,
        relation_type: "derived_from",
        to_entity_id: need.id,
      },
      reason: "AI 置信度不足，需 PM 确认。",
      confidence: 0.62,
    });
    const mapping = knowledge.upsertFeishuBaseMapping({
      workspace_id: "ws-company",
      object_type: "knowledge_gap",
      object_id: "gap-1",
      base_app_token: "app-token",
      base_table_id: "tbl-token",
      base_record_id: "rec-1",
      field_map: { title: "问题" },
    });

    expect(feature.aliases).toEqual(["一键快拆"]);
    expect(need.review_required).toBe(true);
    expect(relation.source_refs).toEqual([{ document_id: "doc-prd" }]);
    expect(candidate.proposed_relation.relation_type).toBe("derived_from");
    expect(knowledge.updateKnowledgeFusionCandidate(candidate.id, { status: "approved" }).status).toBe("approved");
    expect(() => knowledge.updateKnowledgeFusionCandidate(candidate.id, { status: "pending" })).toThrow("invalid_fusion_status_transition");
    expect(() => knowledge.updateKnowledgeFusionCandidate(candidate.id, { status: "" })).toThrow("invalid_fusion_status");
    expect(() => knowledge.createKnowledgeFusionCandidate({
      workspace_id: "ws-company",
      project_id: "proj-ontology",
      candidate_type: "entity",
      action: "review",
      source_entity_ids: [knowledge.createKnowledgeEntity({
        workspace_id: "ws-company",
        entity_type: "feature",
        canonical_name: "未归属项目实体",
      }).id],
      confidence: 0.4,
    })).toThrow("project_mismatch");

    const graph = knowledge.getKnowledgeEntityGraph("ws-company", feature.id);
    expect(graph.nodes.map((node) => node.id).sort()).toEqual([feature.id, need.id].sort());
    expect(graph.edges.map((edge) => edge.id)).toContain(relation.id);

    expect(mapping.field_map).toEqual({ title: "问题" });
    expect(knowledge.listFeishuBaseMappings("ws-company", { object_type: "knowledge_gap" })).toHaveLength(1);
  });

  it("upserts knowledge sources and replaces chunks with FTS rows", () => {
    const source = knowledge.upsertKnowledgeSource({
      workspace_id: "ws-company",
      source_type: "document",
      source_id: "doc-1",
      project_id: "proj-1",
      title: "Deck PRD",
      content_hash: "hash-1",
      access_policy: {
        visibility: "project_team",
        rag_enabled: true,
        bot_enabled: true,
      },
    });

    const chunks = knowledge.replaceKnowledgeChunks(source.id, [
      {
        id: "chunk-1",
        chunk_type: "requirement",
        title: "功能属性",
        text: "支持快捷按键控制和多场景切换 quick control。",
        tags: ["功能属性"],
        content_hash: "chunk-hash-1",
      },
      {
        id: "chunk-2",
        chunk_type: "table",
        title: "规格表",
        text: "按键数量 8 个。",
        tags: ["规格"],
        content_hash: "chunk-hash-2",
      },
    ]);

    const ftsRows = dbModule.db.prepare("SELECT chunk_id FROM knowledge_chunks_fts WHERE knowledge_chunks_fts MATCH ?").all("quick");

    expect(source.rag_enabled).toBe(true);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].rag_enabled).toBe(true);
    expect(ftsRows.map((row) => row.chunk_id)).toContain("chunk-1");

    const replaced = knowledge.replaceKnowledgeChunks(source.id, [
      {
        id: "chunk-3",
        chunk_type: "section",
        title: "新版功能",
        text: "支持旋钮控制。",
        content_hash: "chunk-hash-3",
      },
    ]);

    expect(replaced).toHaveLength(1);
    expect(knowledge.listKnowledgeChunks("ws-company", { source_id: source.id }).map((item) => item.id)).toEqual(["chunk-3"]);
  });

  it("creates knowledge packs, gaps, and query logs", () => {
    const source = knowledge.upsertKnowledgeSource({
      workspace_id: "ws-company",
      source_type: "document",
      source_id: "doc-1",
      title: "PRD",
      content_hash: "hash",
    });
    const [chunk] = knowledge.replaceKnowledgeChunks(source.id, [{
      chunk_type: "section",
      title: "功能",
      text: "支持快速拆装。",
      content_hash: "chunk",
    }]);
    const pack = knowledge.createKnowledgePack({
      workspace_id: "ws-company",
      project_id: "proj-1",
      title: "资料包",
      pack_type: "project",
    });

    knowledge.addSourceToPack(pack.id, source.id, "primary");
    const hydrated = knowledge.addChunkToPack(pack.id, chunk.id, 1);
    const gap = knowledge.createKnowledgeGap({
      workspace_id: "ws-company",
      project_id: "proj-1",
      pack_id: pack.id,
      question: "是否需要认证？",
      reason: "missing_certification_source",
      related_source_ids: [source.id],
    });
    const log = knowledge.createKnowledgeQueryLog({
      workspace_id: "ws-company",
      project_id: "proj-1",
      pack_id: pack.id,
      question: "功能是什么？",
      answer: "支持快速拆装。",
      mode: "answered",
      citations: [{ chunk_id: chunk.id }],
      matched_chunk_ids: [chunk.id],
      gap_ids: [gap.id],
    });

    expect(hydrated.sources).toHaveLength(1);
    expect(hydrated.chunks).toHaveLength(1);
    expect(gap.related_source_ids).toEqual([source.id]);
    expect(log.mode).toBe("answered");
  });

  it("rejects cross-workspace sources and chunks when attaching pack evidence", () => {
    const sourceA = knowledge.upsertKnowledgeSource({
      workspace_id: "ws-company",
      source_type: "document",
      source_id: "doc-a",
      title: "Company PRD",
      content_hash: "hash-a",
    });
    const sourceB = knowledge.upsertKnowledgeSource({
      workspace_id: "ws-other",
      source_type: "document",
      source_id: "doc-b",
      title: "Other PRD",
      content_hash: "hash-b",
    });
    const [chunkB] = knowledge.replaceKnowledgeChunks(sourceB.id, [{
      chunk_type: "section",
      title: "Other Feature",
      text: "其他工作区的内容。",
      content_hash: "chunk-b",
    }]);
    const packA = knowledge.createKnowledgePack({
      workspace_id: "ws-company",
      title: "Company Pack",
      pack_type: "project",
    });

    expect(() => knowledge.addSourceToPack(packA.id, sourceB.id)).toThrow("workspace_mismatch");
    expect(() => knowledge.addChunkToPack(packA.id, chunkB.id)).toThrow("workspace_mismatch");

    knowledge.addSourceToPack(packA.id, sourceA.id);
    const hydrated = knowledge.getKnowledgePack(packA.id);
    expect(hydrated.sources).toHaveLength(1);
    expect(hydrated.chunks).toHaveLength(0);
  });

  it("syncs normalized document sections into the future section table", () => {
    const document = knowledge.createDocument({
      id: "doc-section-future",
      workspace_id: "ws-company",
      project_id: "proj-section",
      title: "Future PRD",
      doc_type: "prd",
      content: {
        normalized_sections: [
          {
            key: "functional_attributes",
            title: "功能属性",
            content: "支持快拆。",
            source_refs: [{ chunk_id: "chunk-a" }],
          },
          {
            key: "open_questions",
            title: "待确认问题",
            content: "是否需要认证？",
            open_questions: ["认证范围待确认"],
          },
        ],
      },
      access_policy: { visibility: "private" },
    });

    const sections = knowledge.syncDocumentSectionsFromDocument(document.id);
    const listed = knowledge.listDocumentSections(document.id);

    expect(sections).toHaveLength(2);
    expect(listed.map((section) => section.section_key)).toEqual(["functional_attributes", "open_questions"]);
    expect(listed[0].source_refs).toEqual([{ chunk_id: "chunk-a" }]);
    expect(listed[1].open_questions).toEqual(["认证范围待确认"]);
  });

  it("stores reusable knowledge answers by question hash and project/pack scope", () => {
    const answer = knowledge.upsertKnowledgeAnswer({
      workspace_id: "ws-company",
      project_id: "proj-1",
      pack_id: "pack-1",
      question_hash: "hash-question",
      question: "快拆方案是什么？",
      answer: "支持磁吸快拆。",
      citations: [{ chunk_id: "chunk-1" }],
      confidence: 0.8,
      created_by: "user-1",
    });
    const updated = knowledge.upsertKnowledgeAnswer({
      workspace_id: "ws-company",
      project_id: "proj-1",
      pack_id: "pack-1",
      question_hash: "hash-question",
      question: "快拆方案是什么？",
      answer: "更新后的答案。",
      citations: [{ chunk_id: "chunk-2" }],
    });
    const scoped = knowledge.upsertKnowledgeAnswer({
      workspace_id: "ws-company",
      project_id: "proj-2",
      pack_id: "pack-2",
      question_hash: "hash-question",
      question: "快拆方案是什么？",
      answer: "另一个资料包的答案。",
      citations: [{ chunk_id: "chunk-other" }],
    });

    expect(answer.answer).toBe("支持磁吸快拆。");
    expect(updated.answer).toBe("更新后的答案。");
    expect(scoped.answer).toBe("另一个资料包的答案。");
    expect(knowledge.listKnowledgeAnswers("ws-company")).toHaveLength(2);
    expect(knowledge.getKnowledgeAnswer("ws-company", "hash-question", {
      project_id: "proj-1",
      pack_id: "pack-1",
    }).citations).toEqual([{ chunk_id: "chunk-2" }]);
    expect(knowledge.getKnowledgeAnswer("ws-company", "hash-question", {
      project_id: "proj-2",
      pack_id: "pack-2",
    }).citations).toEqual([{ chunk_id: "chunk-other" }]);
  });

  it("prepares extension adapter jobs without pretending real OCR/vector/sync is enabled", () => {
    const vector = adapters.queueVectorIndexJob({
      workspace_id: "ws-company",
      source_id: "source-1",
      chunk_id: "chunk-1",
    });
    const file = adapters.prepareDocumentFileJob({
      workspace_id: "ws-company",
      project_id: "proj-1",
      source_uri: "https://example.com/prd",
      file_name: "PRD.docx",
      job_type: "ocr",
    });
    const sync = adapters.prepareFeishuSyncJob({
      workspace_id: "ws-company",
      object_type: "document",
      object_id: "doc-1",
      direction: "bidirectional",
      target_type: "doc",
    });

    expect(vector.status).toBe("skipped");
    expect(vector.metadata.vector_adapter_configured).toBe(false);
    expect(vector.metadata.vector_indexed).toBe(false);
    expect(file.status).toBe("prepared");
    expect(file.metadata.ocr_enabled).toBe(false);
    expect(sync.status).toBe("prepared");
    expect(sync.metadata.real_sync_enabled).toBe(false);
  });
});
