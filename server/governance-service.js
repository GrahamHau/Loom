import { nanoid } from "nanoid";
import { db } from "./db.js";
import { migrateKnowledgeSchema } from "./knowledge-schema.js";
import { isLLMConfigured, isVisionLLMConfigured } from "./ai-service.js";
import { createOrBumpKnowledgeGap } from "./knowledge-gap-service.js";

migrateKnowledgeSchema();

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function jsonText(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function boolInt(value) {
  return value ? 1 : 0;
}

function mapSourcePolicy(row) {
  if (!row) return null;
  return {
    ...row,
    rag_enabled: Boolean(row.rag_enabled),
    bot_enabled: Boolean(row.bot_enabled),
    sales_visible: Boolean(row.sales_visible),
    supplier_visible: Boolean(row.supplier_visible),
    public_visible: Boolean(row.public_visible),
  };
}

function mapPolicy(row) {
  if (!row) return null;
  return {
    ...row,
    require_evidence: Boolean(row.require_evidence),
    require_pm_confirmed_answer: Boolean(row.require_pm_confirmed_answer),
    allow_default_model_fallback: Boolean(row.allow_default_model_fallback),
  };
}

function mapDecision(row) {
  if (!row) return null;
  return {
    ...row,
    authorized_chunk_ids: parseJson(row.authorized_chunk_ids, []),
    filtered_chunk_ids: parseJson(row.filtered_chunk_ids, []),
  };
}

export function upsertKnowledgePolicy(input = {}) {
  const row = {
    workspace_id: cleanText(input.workspace_id),
    audience: cleanText(input.audience, "internal"),
    min_confidence: Number(input.min_confidence ?? 0.3),
    min_source_confidence: Number(input.min_source_confidence ?? 0.7),
    require_evidence: boolInt(input.require_evidence !== false),
    require_pm_confirmed_answer: boolInt(input.require_pm_confirmed_answer),
    top_k: Math.max(1, Math.min(50, Number(input.top_k || 8))),
    allow_default_model_fallback: boolInt(input.allow_default_model_fallback !== false),
  };
  db.prepare(`
    INSERT INTO knowledge_policies (
      workspace_id, audience, min_confidence, min_source_confidence, require_evidence,
      require_pm_confirmed_answer, top_k, allow_default_model_fallback, updated_at
    ) VALUES (
      @workspace_id, @audience, @min_confidence, @min_source_confidence, @require_evidence,
      @require_pm_confirmed_answer, @top_k, @allow_default_model_fallback, CURRENT_TIMESTAMP
    )
    ON CONFLICT(workspace_id, audience) DO UPDATE SET
      min_confidence = excluded.min_confidence,
      min_source_confidence = excluded.min_source_confidence,
      require_evidence = excluded.require_evidence,
      require_pm_confirmed_answer = excluded.require_pm_confirmed_answer,
      top_k = excluded.top_k,
      allow_default_model_fallback = excluded.allow_default_model_fallback,
      updated_at = CURRENT_TIMESTAMP
  `).run(row);
  return getKnowledgePolicy(row.workspace_id, row.audience);
}

export function getKnowledgePolicy(workspaceId, audience = "internal") {
  return mapPolicy(db.prepare("SELECT * FROM knowledge_policies WHERE workspace_id = ? AND audience = ?")
    .get(cleanText(workspaceId), cleanText(audience, "internal"))) || {
    workspace_id: cleanText(workspaceId),
    audience: cleanText(audience, "internal"),
    min_confidence: audience === "internal" ? 0.25 : 0.5,
    min_source_confidence: audience === "internal" ? 0.5 : 0.8,
    require_evidence: audience !== "internal",
    require_pm_confirmed_answer: ["supplier", "public"].includes(audience),
    top_k: 8,
    allow_default_model_fallback: audience === "internal",
  };
}

export function upsertKnowledgeSourcePolicy(input = {}) {
  const row = {
    id: cleanText(input.id) || `ksp_${nanoid(12)}`,
    workspace_id: cleanText(input.workspace_id),
    source_type: cleanText(input.source_type),
    source_id: cleanText(input.source_id),
    rag_enabled: boolInt(input.rag_enabled),
    bot_enabled: boolInt(input.bot_enabled),
    sales_visible: boolInt(input.sales_visible),
    supplier_visible: boolInt(input.supplier_visible),
    public_visible: boolInt(input.public_visible),
    default_audience: cleanText(input.default_audience, "internal"),
    review_status: cleanText(input.review_status, "draft"),
  };
  db.prepare(`
    INSERT INTO knowledge_source_policies (
      id, workspace_id, source_type, source_id, rag_enabled, bot_enabled,
      sales_visible, supplier_visible, public_visible, default_audience, review_status, updated_at
    ) VALUES (
      @id, @workspace_id, @source_type, @source_id, @rag_enabled, @bot_enabled,
      @sales_visible, @supplier_visible, @public_visible, @default_audience, @review_status, CURRENT_TIMESTAMP
    )
    ON CONFLICT(workspace_id, source_type, source_id) DO UPDATE SET
      rag_enabled = excluded.rag_enabled,
      bot_enabled = excluded.bot_enabled,
      sales_visible = excluded.sales_visible,
      supplier_visible = excluded.supplier_visible,
      public_visible = excluded.public_visible,
      default_audience = excluded.default_audience,
      review_status = excluded.review_status,
      updated_at = CURRENT_TIMESTAMP
  `).run(row);
  return getKnowledgeSourcePolicy(row.workspace_id, row.source_type, row.source_id);
}

export function getKnowledgeSourcePolicy(workspaceId, sourceType, sourceId) {
  return mapSourcePolicy(db.prepare(`
    SELECT * FROM knowledge_source_policies
    WHERE workspace_id = ? AND source_type = ? AND source_id = ?
  `).get(cleanText(workspaceId), cleanText(sourceType), cleanText(sourceId)));
}

export function getKnowledgeSourcePolicyById(id) {
  return mapSourcePolicy(db.prepare("SELECT * FROM knowledge_source_policies WHERE id = ?").get(cleanText(id)));
}

export function listKnowledgeSourcePolicies(workspaceId, filters = {}) {
  const clauses = ["workspace_id = ?"];
  const params = [cleanText(workspaceId)];
  if (filters.source_type) {
    clauses.push("source_type = ?");
    params.push(cleanText(filters.source_type));
  }
  return db.prepare(`SELECT * FROM knowledge_source_policies WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC`)
    .all(...params).map(mapSourcePolicy);
}

export function patchKnowledgeSourcePolicy(id, patch = {}) {
  const current = db.prepare("SELECT * FROM knowledge_source_policies WHERE id = ?").get(cleanText(id));
  if (!current) return null;
  return upsertKnowledgeSourcePolicy({ ...current, ...patch, id: current.id });
}

export function upsertModelRoute(input = {}) {
  const row = {
    id: cleanText(input.id) || `mr_${nanoid(12)}`,
    workspace_id: cleanText(input.workspace_id),
    route: cleanText(input.route, "default_text"),
    api_type: cleanText(input.api_type, "openai"),
    api_url: cleanText(input.api_url),
    model: cleanText(input.model),
    key_ref: cleanText(input.key_ref),
    fallback_route: cleanText(input.fallback_route),
    last_test_status: cleanText(input.last_test_status, "untested"),
  };
  db.prepare(`
    INSERT INTO model_routes (
      id, workspace_id, route, api_type, api_url, model, key_ref, fallback_route, last_test_status, updated_at
    ) VALUES (
      @id, @workspace_id, @route, @api_type, @api_url, @model, @key_ref, @fallback_route, @last_test_status, CURRENT_TIMESTAMP
    )
    ON CONFLICT(workspace_id, route) DO UPDATE SET
      api_type = excluded.api_type,
      api_url = excluded.api_url,
      model = excluded.model,
      key_ref = excluded.key_ref,
      fallback_route = excluded.fallback_route,
      last_test_status = excluded.last_test_status,
      updated_at = CURRENT_TIMESTAMP
  `).run(row);
  return db.prepare("SELECT * FROM model_routes WHERE workspace_id = ? AND route = ?").get(row.workspace_id, row.route);
}

export function testModelRoute({ workspace_id, route, user_id } = {}) {
  const workspaceId = cleanText(workspace_id);
  const routeName = cleanText(route, "default_text");
  const configured = routeName === "vision" ? isVisionLLMConfigured(user_id) : isLLMConfigured(user_id);
  const existing = db.prepare("SELECT * FROM model_routes WHERE workspace_id = ? AND route = ?").get(workspaceId, routeName);
  const result = upsertModelRoute({
    ...(existing || {}),
    workspace_id: workspaceId,
    route: routeName,
    last_test_status: configured || existing?.model ? "ok" : "error",
  });
  db.prepare("UPDATE model_routes SET last_test_at = CURRENT_TIMESTAMP WHERE id = ?").run(result.id);
  return { ok: result.last_test_status === "ok", route: routeName, model: result.model || "", status: result.last_test_status };
}

export function recordGovernanceDecision(input = {}) {
  const row = {
    id: input.id || `gd_${nanoid(12)}`,
    workspace_id: cleanText(input.workspace_id),
    trace_id: cleanText(input.trace_id),
    query_text: cleanText(input.query_text),
    audience: cleanText(input.audience, "internal"),
    risk: cleanText(input.risk, "low"),
    decision: cleanText(input.decision, "answered"),
    refusal_reason: cleanText(input.refusal_reason),
    model_route_used: cleanText(input.model_route_used),
    authorized_chunk_ids: jsonText(input.authorized_chunk_ids, []),
    filtered_chunk_ids: jsonText(input.filtered_chunk_ids, []),
    gap_id: cleanText(input.gap_id),
  };
  db.prepare(`
    INSERT INTO governance_decisions (
      id, workspace_id, trace_id, query_text, audience, risk, decision,
      refusal_reason, model_route_used, authorized_chunk_ids, filtered_chunk_ids,
      gap_id, created_at
    ) VALUES (
      @id, @workspace_id, @trace_id, @query_text, @audience, @risk, @decision,
      @refusal_reason, @model_route_used, @authorized_chunk_ids, @filtered_chunk_ids,
      @gap_id, CURRENT_TIMESTAMP
    )
  `).run(row);
  return mapDecision(db.prepare("SELECT * FROM governance_decisions WHERE id = ?").get(row.id));
}

export function explainQueryPolicy(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const audience = cleanText(input.audience || (input.chat_type === "group" ? "sales" : "internal"), "internal");
  const policy = getKnowledgePolicy(workspaceId, audience);
  const risk = audience !== "internal" || /供应商|认证|成本|报价|风险|public|公开/i.test(cleanText(input.q)) ? "high" : "low";
  const modelRoute = risk === "high" ? "strong_text" : "fast_text";
  const decision = recordGovernanceDecision({
    workspace_id: workspaceId,
    trace_id: cleanText(input.trace_id) || `trace_${nanoid(10)}`,
    query_text: cleanText(input.q || input.question),
    audience,
    risk,
    decision: "needs_review",
    refusal_reason: "",
    model_route_used: modelRoute,
    authorized_chunk_ids: [],
    filtered_chunk_ids: [],
  });
  return { ...decision, policy };
}

export function createGovernedGap(input = {}) {
  return createOrBumpKnowledgeGap({
    ...input,
    reason: cleanText(input.reason, "low_confidence"),
  });
}
