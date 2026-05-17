import { db } from "./db.js";

export function migrateKnowledgeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT DEFAULT '',
      category TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      description TEXT DEFAULT '',
      owner_user_id TEXT,
      access_policy_json TEXT DEFAULT '{}',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_projects_workspace_status ON projects(workspace_id, status);
    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_user_id);

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      title TEXT NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'other',
      status TEXT NOT NULL DEFAULT 'draft',
      template_id TEXT,
      source_uri TEXT DEFAULT '',
      storage_key TEXT DEFAULT '',
      mime_type TEXT DEFAULT '',
      version TEXT DEFAULT '',
      author TEXT DEFAULT '',
      owner_user_id TEXT,
      content_text TEXT DEFAULT '',
      content_json TEXT DEFAULT '{}',
      assets_json TEXT DEFAULT '[]',
      access_policy_json TEXT DEFAULT '{}',
      visibility TEXT NOT NULL DEFAULT 'private',
      rag_enabled INTEGER NOT NULL DEFAULT 0,
      bot_enabled INTEGER NOT NULL DEFAULT 0,
      external_safe INTEGER NOT NULL DEFAULT 0,
      supplier_visible INTEGER NOT NULL DEFAULT 0,
      sales_visible INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_documents_workspace_type ON documents(workspace_id, doc_type);
    CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(workspace_id, status);

    CREATE TABLE IF NOT EXISTS document_sections (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      project_id TEXT,
      section_key TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      source_refs_json TEXT DEFAULT '[]',
      open_questions_json TEXT DEFAULT '[]',
      access_policy_json TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      sort_order INTEGER DEFAULT 0,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_id, section_key)
    );
    CREATE INDEX IF NOT EXISTS idx_document_sections_workspace ON document_sections(workspace_id, document_id);
    CREATE INDEX IF NOT EXISTS idx_document_sections_project ON document_sections(workspace_id, project_id);

    CREATE TABLE IF NOT EXISTS document_templates (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      name TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT 'v1',
      sections_json TEXT NOT NULL DEFAULT '[]',
      extraction_rules_json TEXT DEFAULT '{}',
      chunk_rules_json TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, doc_type, version)
    );
    CREATE INDEX IF NOT EXISTS idx_document_templates_workspace_type ON document_templates(workspace_id, doc_type, status);

    CREATE TABLE IF NOT EXISTS product_type_templates (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      description TEXT DEFAULT '',
      attributes_schema_json TEXT DEFAULT '[]',
      enabled_modules_json TEXT DEFAULT '[]',
      required_roles_json TEXT DEFAULT '[]',
      supplier_visible_modules_json TEXT DEFAULT '[]',
      sales_visible_modules_json TEXT DEFAULT '[]',
      required_fields_json TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_product_type_templates_workspace ON product_type_templates(workspace_id, status);

    CREATE TABLE IF NOT EXISTS document_imports (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      import_method TEXT NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'other',
      template_id TEXT,
      title TEXT DEFAULT '',
      source_uri TEXT DEFAULT '',
      document_id TEXT DEFAULT '',
      raw_blocks_json TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT DEFAULT '',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_document_imports_workspace_status ON document_imports(workspace_id, status);
    CREATE INDEX IF NOT EXISTS idx_document_imports_project ON document_imports(project_id);

    CREATE TABLE IF NOT EXISTS knowledge_entities (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      entity_type TEXT NOT NULL,
      canonical_name TEXT NOT NULL,
      aliases_json TEXT DEFAULT '[]',
      summary TEXT DEFAULT '',
      properties_json TEXT DEFAULT '{}',
      source_refs_json TEXT DEFAULT '[]',
      confidence REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      review_required INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_entities_workspace ON knowledge_entities(workspace_id, entity_type, status);
    CREATE INDEX IF NOT EXISTS idx_knowledge_entities_project ON knowledge_entities(workspace_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_entities_name ON knowledge_entities(workspace_id, canonical_name);

    CREATE TABLE IF NOT EXISTS knowledge_relations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      from_entity_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      to_entity_id TEXT NOT NULL,
      source_refs_json TEXT DEFAULT '[]',
      confidence REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      review_required INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_relations_workspace ON knowledge_relations(workspace_id, relation_type, status);
    CREATE INDEX IF NOT EXISTS idx_knowledge_relations_from ON knowledge_relations(workspace_id, from_entity_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_relations_to ON knowledge_relations(workspace_id, to_entity_id);

    CREATE TABLE IF NOT EXISTS knowledge_fusion_candidates (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      candidate_type TEXT NOT NULL,
      action TEXT NOT NULL,
      source_entity_ids_json TEXT DEFAULT '[]',
      target_entity_id TEXT DEFAULT '',
      proposed_entity_json TEXT DEFAULT '{}',
      proposed_relation_json TEXT DEFAULT '{}',
      reason TEXT DEFAULT '',
      confidence REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_fusion_workspace ON knowledge_fusion_candidates(workspace_id, status);
    CREATE INDEX IF NOT EXISTS idx_knowledge_fusion_project ON knowledge_fusion_candidates(workspace_id, project_id);

    CREATE TABLE IF NOT EXISTS feishu_base_mappings (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      base_app_token TEXT NOT NULL,
      base_table_id TEXT NOT NULL,
      base_record_id TEXT DEFAULT '',
      sync_direction TEXT NOT NULL DEFAULT 'loom_to_feishu',
      field_map_json TEXT DEFAULT '{}',
      last_synced_at TEXT,
      last_error TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, object_type, object_id, base_app_token, base_table_id)
    );
    CREATE INDEX IF NOT EXISTS idx_feishu_base_mappings_object ON feishu_base_mappings(workspace_id, object_type, object_id);
    CREATE INDEX IF NOT EXISTS idx_feishu_base_mappings_record ON feishu_base_mappings(base_app_token, base_table_id, base_record_id);

    CREATE TABLE IF NOT EXISTS knowledge_sources (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      project_id TEXT,
      title TEXT NOT NULL,
      url TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      raw_text TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      access_policy_json TEXT DEFAULT '{}',
      visibility TEXT NOT NULL DEFAULT 'private',
      rag_enabled INTEGER NOT NULL DEFAULT 0,
      bot_enabled INTEGER NOT NULL DEFAULT 0,
      external_safe INTEGER NOT NULL DEFAULT 0,
      supplier_visible INTEGER NOT NULL DEFAULT 0,
      sales_visible INTEGER NOT NULL DEFAULT 0,
      confidence TEXT NOT NULL DEFAULT 'raw',
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, source_type, source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_sources_workspace ON knowledge_sources(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_sources_project ON knowledge_sources(project_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_sources_origin ON knowledge_sources(workspace_id, source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_sources_rag ON knowledge_sources(workspace_id, rag_enabled, bot_enabled);

    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      project_id TEXT,
      chunk_type TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      source_refs_json TEXT DEFAULT '[]',
      tags_json TEXT DEFAULT '[]',
      metadata_json TEXT DEFAULT '{}',
      access_policy_json TEXT DEFAULT '{}',
      visibility TEXT NOT NULL DEFAULT 'private',
      rag_enabled INTEGER NOT NULL DEFAULT 0,
      bot_enabled INTEGER NOT NULL DEFAULT 0,
      external_safe INTEGER NOT NULL DEFAULT 0,
      supplier_visible INTEGER NOT NULL DEFAULT 0,
      sales_visible INTEGER NOT NULL DEFAULT 0,
      confidence TEXT NOT NULL DEFAULT 'raw',
      content_hash TEXT NOT NULL,
      indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(source_id) REFERENCES knowledge_sources(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_workspace ON knowledge_chunks(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source ON knowledge_chunks(source_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_project ON knowledge_chunks(project_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_rag ON knowledge_chunks(workspace_id, rag_enabled, bot_enabled);
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_supplier ON knowledge_chunks(workspace_id, supplier_visible);
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_sales ON knowledge_chunks(workspace_id, sales_visible);

    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      workspace_id UNINDEXED,
      title,
      text,
      tags
    );

    CREATE TABLE IF NOT EXISTS knowledge_packs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      title TEXT NOT NULL,
      pack_type TEXT NOT NULL,
      input_json TEXT DEFAULT '{}',
      coverage_score REAL DEFAULT 0,
      open_questions_json TEXT DEFAULT '[]',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_packs_workspace ON knowledge_packs(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_knowledge_packs_project ON knowledge_packs(project_id);

    CREATE TABLE IF NOT EXISTS knowledge_pack_sources (
      pack_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      role TEXT DEFAULT 'supporting',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(pack_id, source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_pack_sources_source ON knowledge_pack_sources(source_id);

    CREATE TABLE IF NOT EXISTS knowledge_pack_chunks (
      pack_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      rank INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(pack_id, chunk_id)
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_pack_chunks_chunk ON knowledge_pack_chunks(chunk_id);

    CREATE TABLE IF NOT EXISTS knowledge_gaps (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      pack_id TEXT,
      question TEXT NOT NULL,
      reason TEXT NOT NULL,
      related_source_ids_json TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'open',
      owner_user_id TEXT,
      answer_document_id TEXT,
      answer_chunk_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_workspace_status ON knowledge_gaps(workspace_id, status);
    CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_project ON knowledge_gaps(project_id);

    CREATE TABLE IF NOT EXISTS knowledge_query_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT,
      project_id TEXT,
      pack_id TEXT,
      channel TEXT NOT NULL,
      audience TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT DEFAULT '',
      mode TEXT NOT NULL,
      confidence REAL DEFAULT 0,
      citations_json TEXT DEFAULT '[]',
      matched_chunk_ids_json TEXT DEFAULT '[]',
      gap_ids_json TEXT DEFAULT '[]',
      latency_ms INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_query_logs_workspace ON knowledge_query_logs(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_knowledge_query_logs_pack ON knowledge_query_logs(pack_id);

    CREATE TABLE IF NOT EXISTS knowledge_answers (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      pack_id TEXT,
      scope_hash TEXT NOT NULL DEFAULT 'global',
      question_hash TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT DEFAULT '',
      citations_json TEXT DEFAULT '[]',
      gap_ids_json TEXT DEFAULT '[]',
      mode TEXT NOT NULL DEFAULT 'answered',
      confidence REAL DEFAULT 0,
      audience TEXT NOT NULL DEFAULT 'internal',
      channel TEXT NOT NULL DEFAULT 'web',
      created_by TEXT,
      source_query_log_id TEXT DEFAULT '',
      expires_at TEXT,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, question_hash, scope_hash, audience, channel)
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_answers_workspace ON knowledge_answers(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_knowledge_answers_pack ON knowledge_answers(pack_id);

    CREATE TABLE IF NOT EXISTS knowledge_vector_jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT,
      chunk_id TEXT,
      adapter TEXT NOT NULL DEFAULT 'sqlite_fts',
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_vector_jobs_workspace ON knowledge_vector_jobs(workspace_id, status);

    CREATE TABLE IF NOT EXISTS document_file_jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      document_id TEXT,
      source_uri TEXT DEFAULT '',
      file_name TEXT DEFAULT '',
      mime_type TEXT DEFAULT '',
      storage_key TEXT DEFAULT '',
      job_type TEXT NOT NULL DEFAULT 'import',
      status TEXT NOT NULL DEFAULT 'prepared',
      error TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_document_file_jobs_workspace ON document_file_jobs(workspace_id, status);

    CREATE TABLE IF NOT EXISTS feishu_sync_jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'export',
      target_type TEXT NOT NULL DEFAULT 'doc',
      target_id TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'prepared',
      error TEXT DEFAULT '',
      payload_json TEXT DEFAULT '{}',
      metadata_json TEXT DEFAULT '{}',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_feishu_sync_jobs_workspace ON feishu_sync_jobs(workspace_id, object_type, object_id);
  `);

  const importColumns = new Set(db.prepare("PRAGMA table_info(document_imports)").all().map((column) => column.name));
  if (!importColumns.has("document_id")) {
    db.exec("ALTER TABLE document_imports ADD COLUMN document_id TEXT DEFAULT '';");
  }

  const answerColumns = new Set(db.prepare("PRAGMA table_info(knowledge_answers)").all().map((column) => column.name));
  if (!answerColumns.has("scope_hash")) {
    db.exec(`
      ALTER TABLE knowledge_answers RENAME TO knowledge_answers_legacy_scope;
      CREATE TABLE knowledge_answers (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        project_id TEXT,
        pack_id TEXT,
        scope_hash TEXT NOT NULL DEFAULT 'global',
        question_hash TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT DEFAULT '',
        citations_json TEXT DEFAULT '[]',
        gap_ids_json TEXT DEFAULT '[]',
        mode TEXT NOT NULL DEFAULT 'answered',
        confidence REAL DEFAULT 0,
        audience TEXT NOT NULL DEFAULT 'internal',
        channel TEXT NOT NULL DEFAULT 'web',
        created_by TEXT,
        source_query_log_id TEXT DEFAULT '',
        expires_at TEXT,
        metadata_json TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workspace_id, question_hash, scope_hash, audience, channel)
      );
      INSERT OR REPLACE INTO knowledge_answers (
        id, workspace_id, project_id, pack_id, scope_hash, question_hash, question, answer,
        citations_json, gap_ids_json, mode, confidence, audience, channel, created_by,
        source_query_log_id, expires_at, metadata_json, created_at, updated_at
      )
      SELECT
        id, workspace_id, project_id, pack_id,
        COALESCE(NULLIF('project:' || COALESCE(project_id, '') || '|pack:' || COALESCE(pack_id, ''), 'project:|pack:'), 'global'),
        question_hash, question, answer, citations_json, gap_ids_json, mode, confidence,
        audience, channel, created_by, source_query_log_id, expires_at, metadata_json,
        created_at, updated_at
      FROM knowledge_answers_legacy_scope;
      DROP TABLE knowledge_answers_legacy_scope;
    `);
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_knowledge_answers_workspace ON knowledge_answers(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_knowledge_answers_pack ON knowledge_answers(pack_id);
  `);
}
