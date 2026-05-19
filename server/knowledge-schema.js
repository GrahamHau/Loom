import crypto from "node:crypto";
import { db } from "./db.js";

function normalizeQuestion(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function questionHash(value) {
  return crypto.createHash("sha256").update(normalizeQuestion(value)).digest("hex");
}

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

    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      origin TEXT NOT NULL,
      type TEXT NOT NULL,
      source_url TEXT DEFAULT '',
      source_title TEXT DEFAULT '',
      raw_payload_json TEXT NOT NULL DEFAULT '{}',
      hash TEXT NOT NULL,
      seen_count INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      UNIQUE(workspace_id, hash)
    );
    CREATE INDEX IF NOT EXISTS idx_signals_workspace_origin ON signals(workspace_id, origin, type);
    CREATE INDEX IF NOT EXISTS idx_signals_last_seen ON signals(workspace_id, last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS evidences (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      claim_text TEXT NOT NULL,
      confidence REAL DEFAULT 0,
      extracted_by TEXT NOT NULL DEFAULT 'human',
      signal_ids_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_evidences_workspace_kind ON evidences(workspace_id, kind);

    CREATE TABLE IF NOT EXISTS evidence_links (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      evidence_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      field_path TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, evidence_id, entity_type, entity_id, field_path),
      FOREIGN KEY(evidence_id) REFERENCES evidences(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_evidence_links_entity ON evidence_links(workspace_id, entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_links_evidence ON evidence_links(evidence_id);

    CREATE TABLE IF NOT EXISTS competitors (
      id TEXT PRIMARY KEY,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      canonical_name TEXT NOT NULL,
      category_id TEXT NOT NULL,
      category_template_version INTEGER NOT NULL DEFAULT 1,
      cover_image_url TEXT DEFAULT '',
      cover_image_mode TEXT NOT NULL DEFAULT 'auto',
      status TEXT NOT NULL DEFAULT 'tracking',
      match_key TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (status IN ('tracking','archived','experimenting'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_competitors_match_key ON competitors(workspace_id, match_key);
    CREATE INDEX IF NOT EXISTS idx_competitors_category ON competitors(workspace_id, category_id);

    CREATE TABLE IF NOT EXISTS competitor_platforms (
      id TEXT PRIMARY KEY,
      competitor_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      url TEXT NOT NULL,
      price_value REAL,
      price_currency TEXT DEFAULT '',
      rating REAL,
      review_count INTEGER,
      monthly_sales_estimate INTEGER,
      status TEXT NOT NULL DEFAULT 'live',
      raw_image_url TEXT DEFAULT '',
      workspace_id TEXT NOT NULL,
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (status IN ('live','out_of_stock','delisted','unknown')),
      FOREIGN KEY(competitor_id) REFERENCES competitors(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_platforms_url ON competitor_platforms(workspace_id, url);
    CREATE INDEX IF NOT EXISTS idx_competitor_platforms_competitor ON competitor_platforms(competitor_id);

    CREATE TABLE IF NOT EXISTS category_templates (
      id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      required_fields_json TEXT NOT NULL DEFAULT '[]',
      optional_fields_json TEXT NOT NULL DEFAULT '[]',
      workspace_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, id, version)
    );

    CREATE TABLE IF NOT EXISTS competitor_specs (
      id TEXT PRIMARY KEY,
      competitor_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value_number REAL,
      value_string TEXT,
      value_boolean INTEGER,
      source_evidence_id TEXT DEFAULT '',
      workspace_id TEXT NOT NULL,
      UNIQUE(competitor_id, key),
      FOREIGN KEY(competitor_id) REFERENCES competitors(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_competitor_specs_number ON competitor_specs(workspace_id, key, value_number);

    CREATE TABLE IF NOT EXISTS demand_clusters (
      id TEXT PRIMARY KEY,
      canonical_text TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'zh',
      member_count INTEGER NOT NULL DEFAULT 0,
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'active',
      merged_into TEXT DEFAULT '',
      workspace_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (status IN ('active','resolved','merged')),
      CHECK (language IN ('zh','en','mixed'))
    );
    CREATE INDEX IF NOT EXISTS idx_demand_clusters_workspace_status ON demand_clusters(workspace_id, status);

    CREATE TABLE IF NOT EXISTS demand_cluster_members (
      id TEXT PRIMARY KEY,
      cluster_id TEXT NOT NULL,
      demand_id TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      added_by TEXT NOT NULL DEFAULT 'auto',
      workspace_id TEXT NOT NULL,
      UNIQUE(cluster_id, demand_id),
      CHECK (added_by IN ('auto','human','llm')),
      FOREIGN KEY(cluster_id) REFERENCES demand_clusters(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_demand_cluster_members_demand ON demand_cluster_members(workspace_id, demand_id);
    CREATE INDEX IF NOT EXISTS idx_demand_cluster_members_added ON demand_cluster_members(workspace_id, added_at);

    CREATE TABLE IF NOT EXISTS demand_cluster_question_hits (
      id TEXT PRIMARY KEY,
      cluster_id TEXT NOT NULL,
      asked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      asker_id TEXT DEFAULT '',
      query_text TEXT DEFAULT '',
      workspace_id TEXT NOT NULL,
      FOREIGN KEY(cluster_id) REFERENCES demand_clusters(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_demand_cluster_question_hits_time ON demand_cluster_question_hits(workspace_id, cluster_id, asked_at);

    CREATE TABLE IF NOT EXISTS heat_weight_settings (
      workspace_id TEXT PRIMARY KEY,
      weight_mentions_7d REAL NOT NULL DEFAULT 3,
      weight_mentions_30d REAL NOT NULL DEFAULT 1,
      weight_internal_questions_30d REAL NOT NULL DEFAULT 5
    );

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
      question_text TEXT DEFAULT '',
      question_hash TEXT DEFAULT '',
      asker_open_id TEXT DEFAULT '',
      asker_loom_user_id TEXT DEFAULT '',
      origin_chat_id TEXT DEFAULT '',
      origin_trace_id TEXT DEFAULT '',
      reason TEXT NOT NULL,
      related_source_ids_json TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'open',
      seen_count INTEGER NOT NULL DEFAULT 1,
      resolved_by_answer_id TEXT DEFAULT '',
      resolved_by_user_id TEXT DEFAULT '',
      resolved_at TEXT,
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

    CREATE TABLE IF NOT EXISTS query_indexes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      adapter TEXT NOT NULL DEFAULT 'local',
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      knowledge_source_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'indexed',
      content_hash TEXT NOT NULL DEFAULT '',
      indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, adapter, source_type, source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_query_indexes_workspace ON query_indexes(workspace_id, adapter, status);

    CREATE TABLE IF NOT EXISTS citations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_title TEXT NOT NULL,
      source_url TEXT DEFAULT '',
      evidence_id TEXT DEFAULT '',
      snippet TEXT NOT NULL,
      source_body_full TEXT DEFAULT '',
      score REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, chunk_id)
    );
    CREATE INDEX IF NOT EXISTS idx_citations_workspace ON citations(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_citations_source ON citations(workspace_id, source_type, source_id);

    CREATE TABLE IF NOT EXISTS query_audit (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      user_id TEXT DEFAULT '',
      chat_type TEXT NOT NULL DEFAULT 'web',
      visibility_ceiling TEXT NOT NULL DEFAULT 'internal_only',
      query_text TEXT NOT NULL,
      adapter TEXT NOT NULL DEFAULT 'local',
      citation_ids_json TEXT NOT NULL DEFAULT '[]',
      confidence REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_query_audit_workspace ON query_audit(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_query_audit_trace ON query_audit(trace_id);

    CREATE TABLE IF NOT EXISTS feishu_users (
      open_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      loom_user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'guest',
      display_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, open_id),
      CHECK (role IN ('pm','sales','ops','exec','guest'))
    );
    CREATE INDEX IF NOT EXISTS idx_feishu_users_loom_user ON feishu_users(workspace_id, loom_user_id);

    CREATE TABLE IF NOT EXISTS feishu_chats (
      chat_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      chat_type TEXT NOT NULL DEFAULT 'group',
      name TEXT NOT NULL DEFAULT '',
      visibility_default_override TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, chat_id),
      CHECK (chat_type IN ('p2p','group','topic')),
      CHECK (visibility_default_override IN ('','public','external_safe','internal_only'))
    );

    CREATE TABLE IF NOT EXISTS bot_conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      event_id TEXT DEFAULT '',
      feishu_message_id TEXT NOT NULL,
      feishu_chat_id TEXT NOT NULL,
      feishu_open_id TEXT NOT NULL,
      chat_type TEXT NOT NULL,
      query_text TEXT NOT NULL,
      trace_id TEXT NOT NULL,
      visibility_ceiling_used TEXT NOT NULL,
      reply_message_id TEXT DEFAULT '',
      reply_payload_json TEXT NOT NULL DEFAULT '{}',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      fallback_interim_sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, feishu_message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_bot_conversations_workspace ON bot_conversations(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bot_conversations_chat ON bot_conversations(workspace_id, feishu_chat_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS query_audit_feedback (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      trace_id TEXT DEFAULT '',
      feishu_message_id TEXT DEFAULT '',
      user_open_id TEXT DEFAULT '',
      feedback TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_query_audit_feedback_trace ON query_audit_feedback(workspace_id, trace_id);

    CREATE TABLE IF NOT EXISTS knowledge_policies (
      workspace_id TEXT NOT NULL,
      audience TEXT NOT NULL,
      min_confidence REAL NOT NULL DEFAULT 0.3,
      min_source_confidence REAL NOT NULL DEFAULT 0.7,
      require_evidence INTEGER NOT NULL DEFAULT 1,
      require_pm_confirmed_answer INTEGER NOT NULL DEFAULT 0,
      top_k INTEGER NOT NULL DEFAULT 8,
      allow_default_model_fallback INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, audience)
    );

    CREATE TABLE IF NOT EXISTS knowledge_source_policies (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      rag_enabled INTEGER NOT NULL DEFAULT 0,
      bot_enabled INTEGER NOT NULL DEFAULT 0,
      sales_visible INTEGER NOT NULL DEFAULT 0,
      supplier_visible INTEGER NOT NULL DEFAULT 0,
      public_visible INTEGER NOT NULL DEFAULT 0,
      default_audience TEXT NOT NULL DEFAULT 'internal',
      review_status TEXT NOT NULL DEFAULT 'draft',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, source_type, source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ksp_source ON knowledge_source_policies(workspace_id, source_type, source_id);

    CREATE TABLE IF NOT EXISTS model_routes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      route TEXT NOT NULL,
      api_type TEXT NOT NULL DEFAULT 'openai',
      api_url TEXT DEFAULT '',
      model TEXT DEFAULT '',
      key_ref TEXT DEFAULT '',
      fallback_route TEXT DEFAULT '',
      last_test_status TEXT NOT NULL DEFAULT 'untested',
      last_test_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, route)
    );

    CREATE TABLE IF NOT EXISTS governance_decisions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      trace_id TEXT NOT NULL,
      query_text TEXT NOT NULL,
      audience TEXT NOT NULL,
      risk TEXT NOT NULL DEFAULT 'low',
      decision TEXT NOT NULL,
      refusal_reason TEXT,
      model_route_used TEXT,
      authorized_chunk_ids TEXT NOT NULL DEFAULT '[]',
      filtered_chunk_ids TEXT NOT NULL DEFAULT '[]',
      gap_id TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_governance_trace ON governance_decisions(workspace_id, trace_id);

    CREATE TABLE IF NOT EXISTS graph_views (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_entity_id TEXT NOT NULL,
      radius INTEGER NOT NULL DEFAULT 2,
      filters_json TEXT NOT NULL DEFAULT '{}',
      owner_user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_graph_views_workspace ON graph_views(workspace_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS graph_view_events (
      id TEXT PRIMARY KEY,
      graph_view_id TEXT DEFAULT '',
      root_entity_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      user_id TEXT DEFAULT '',
      workspace_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_graph_view_events_workspace ON graph_view_events(workspace_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ontology_projection_jobs (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      projected_at TEXT,
      error_message TEXT DEFAULT '',
      workspace_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_type, source_id, workspace_id)
    );

    CREATE TABLE IF NOT EXISTS document_import_blocks (
      id TEXT PRIMARY KEY,
      import_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      block_type TEXT NOT NULL,
      text_markdown TEXT NOT NULL DEFAULT '',
      raw_json TEXT NOT NULL DEFAULT '{}',
      source_locator TEXT DEFAULT '',
      workspace_id TEXT NOT NULL,
      UNIQUE(import_id, position)
    );

    CREATE TABLE IF NOT EXISTS external_datasets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_import_id TEXT NOT NULL,
      mapping_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'review',
      workspace_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS external_dataset_rows (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      row_index INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      signal_id TEXT DEFAULT '',
      evidence_ids TEXT NOT NULL DEFAULT '[]',
      match_status TEXT NOT NULL DEFAULT 'unmatched',
      matched_entity_id TEXT DEFAULT '',
      workspace_id TEXT NOT NULL,
      UNIQUE(dataset_id, row_index)
    );

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

  const gapColumns = new Set(db.prepare("PRAGMA table_info(knowledge_gaps)").all().map((column) => column.name));
  for (const [name, definition] of [
    ["question_text", "TEXT DEFAULT ''"],
    ["question_hash", "TEXT DEFAULT ''"],
    ["asker_open_id", "TEXT DEFAULT ''"],
    ["asker_loom_user_id", "TEXT DEFAULT ''"],
    ["origin_chat_id", "TEXT DEFAULT ''"],
    ["origin_trace_id", "TEXT DEFAULT ''"],
    ["seen_count", "INTEGER NOT NULL DEFAULT 1"],
    ["resolved_by_answer_id", "TEXT DEFAULT ''"],
    ["resolved_by_user_id", "TEXT DEFAULT ''"],
    ["resolved_at", "TEXT"],
  ]) {
    if (!gapColumns.has(name)) db.exec(`ALTER TABLE knowledge_gaps ADD COLUMN ${name} ${definition};`);
  }
  db.exec(`
    UPDATE knowledge_gaps
    SET question_text = COALESCE(NULLIF(question_text, ''), question)
    WHERE COALESCE(question_text, '') = '';
  `);
  const gapsMissingHash = db.prepare(`
    SELECT id, COALESCE(NULLIF(question_text, ''), question) AS question
    FROM knowledge_gaps
    WHERE COALESCE(question_hash, '') = ''
  `).all();
  const backfillGapHash = db.prepare("UPDATE knowledge_gaps SET question_hash = ? WHERE id = ?");
  for (const gap of gapsMissingHash) {
    backfillGapHash.run(questionHash(gap.question), gap.id);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_hash ON knowledge_gaps(workspace_id, question_hash, created_at);");

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
