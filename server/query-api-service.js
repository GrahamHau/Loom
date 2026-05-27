import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { db } from "./db.js";
import { knowledgeContentHash } from "./knowledge-indexer.js";
import { getKnowledgeChunk, replaceKnowledgeChunks, upsertKnowledgeSource } from "./knowledge-repository.js";
import { retrieveKnowledgeChunks } from "./knowledge-retriever.js";
import { migrateKnowledgeSchema } from "./knowledge-schema.js";
import { createOrBumpKnowledgeGap } from "./knowledge-gap-service.js";

migrateKnowledgeSchema();

const VISIBILITY_ORDER = {
  public: 0,
  external_safe: 1,
  internal_only: 2,
};

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function oneOf(value, allowed, fallback) {
  const text = cleanText(value);
  return allowed.includes(text) ? text : fallback;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stableJson(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashId(prefix, value, length = 20) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, length)}`;
}

function sourceAccessPolicy(visibility) {
  const applied = oneOf(visibility, ["public", "external_safe", "internal_only"], "internal_only");
  return {
    visibility: applied === "internal_only" ? "project_team" : "company",
    rag_enabled: true,
    bot_enabled: true,
    external_safe: VISIBILITY_ORDER[applied] <= VISIBILITY_ORDER.external_safe,
    sales_visible: VISIBILITY_ORDER[applied] <= VISIBILITY_ORDER.external_safe,
    supplier_visible: applied === "public",
  };
}

function normalizeQuerySource(source = {}, workspaceId = "") {
  const sourceType = cleanText(source.type || source.source_type, "external_doc");
  const sourceId = cleanText(source.id || source.source_id);
  const body = cleanText(source.body || source.raw_text || source.text);
  const title = cleanText(source.title, "未命名知识来源");
  const evidenceIds = Array.isArray(source.evidence_ids) ? source.evidence_ids.map(cleanText).filter(Boolean) : [];
  const visibility = oneOf(source.visibility, ["public", "external_safe", "internal_only"], "internal_only");
  if (!sourceId) throw new Error("source_id_required");
  if (!body) throw new Error("source_body_required");
  const contentHash = knowledgeContentHash({
    workspace_id: workspaceId,
    source_type: sourceType,
    source_id: sourceId,
    title,
    body,
    meta: source.meta || source.metadata || {},
    visibility,
    evidence_ids: evidenceIds,
  });
  return {
    id: sourceId,
    source_type: sourceType,
    workspace_id: workspaceId,
    source_id: sourceId,
    title,
    url: cleanText(source.source_url || source.url),
    raw_text: body,
    summary: cleanText(source.summary),
    metadata: {
      ...(source.meta || source.metadata || {}),
      m4_visibility: visibility,
      evidence_ids: evidenceIds,
    },
    access_policy: sourceAccessPolicy(visibility),
    confidence: Number(source.confidence || 1) >= 0.8 ? "pm_confirmed" : "ai_extracted",
    content_hash: contentHash,
    chunks: [{
      id: hashId("chunk", `${workspaceId}|${sourceType}|${sourceId}`),
      title,
      text: body,
      chunk_type: "section",
      tags: [sourceType, visibility],
      metadata: {
        source_type: sourceType,
        origin_id: sourceId,
        m4_visibility: visibility,
        evidence_ids: evidenceIds,
      },
      source_refs: [{
        source_type: sourceType,
        source_id: sourceId,
        title,
        url: cleanText(source.source_url || source.url),
        evidence_ids: evidenceIds,
      }],
      content_hash: contentHash,
    }],
  };
}

function upsertQueryIndex({ workspaceId, adapter, sourceType, sourceId, knowledgeSourceId, contentHash }) {
  db.prepare(`
    INSERT INTO query_indexes (
      id, workspace_id, adapter, source_type, source_id, knowledge_source_id,
      status, content_hash, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'indexed', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(workspace_id, adapter, source_type, source_id) DO UPDATE SET
      knowledge_source_id = excluded.knowledge_source_id,
      status = excluded.status,
      content_hash = excluded.content_hash,
      indexed_at = CURRENT_TIMESTAMP
  `).run(
    hashId("qidx", `${workspaceId}|${adapter}|${sourceType}|${sourceId}`),
    workspaceId,
    adapter,
    sourceType,
    sourceId,
    knowledgeSourceId,
    contentHash
  );
}

export function upsertQuerySources(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  if (!workspaceId) throw new Error("workspace_id_required");
  const adapter = queryAdapterName();
  const sources = Array.isArray(input.sources) ? input.sources : [];
  let upserted = 0;
  const indexed = [];
  for (const source of sources) {
    const normalized = normalizeQuerySource(source, workspaceId);
    const knowledgeSource = upsertKnowledgeSource({
      workspace_id: normalized.workspace_id,
      source_type: normalized.source_type,
      source_id: normalized.source_id,
      title: normalized.title,
      url: normalized.url,
      summary: normalized.summary,
      raw_text: normalized.raw_text,
      metadata: normalized.metadata,
      access_policy: normalized.access_policy,
      confidence: normalized.confidence,
      content_hash: normalized.content_hash,
    });
    const chunks = replaceKnowledgeChunks(knowledgeSource.id, normalized.chunks);
    upsertQueryIndex({
      workspaceId,
      adapter,
      sourceType: normalized.source_type,
      sourceId: normalized.source_id,
      knowledgeSourceId: knowledgeSource.id,
      contentHash: normalized.content_hash,
    });
    upserted += 1;
    indexed.push({ source_id: normalized.source_id, source_type: normalized.source_type, chunk_count: chunks.length });
  }
  return { upserted_count: upserted, indexed };
}

export function queryAdapterName() {
  return oneOf(process.env.QUERY_BACKEND, ["local", "ragflow"], "local");
}

function chatToRetrieval(input = {}) {
  const chatType = oneOf(input.chat_type, ["private", "group", "web"], "web");
  const requested = oneOf(input.visibility_ceiling, ["public", "external_safe", "internal_only"], chatType === "group" ? "external_safe" : "internal_only");
  const visibility = chatType === "group" && VISIBILITY_ORDER[requested] > VISIBILITY_ORDER.external_safe
    ? "external_safe"
    : requested;
  return {
    chatType,
    visibility,
    channel: chatType === "group" ? "feishu_group" : chatType === "private" ? "feishu_private" : "web",
    audience: visibility === "public" ? "supplier" : visibility === "external_safe" ? "sales_external" : "internal",
  };
}

function citationIdForChunk(workspaceId, chunk) {
  const sourceId = cleanText(chunk.origin_source_id || chunk.source_id);
  return hashId("cit", `${workspaceId}|${chunk.id}|${chunk.source_type}|${sourceId}`);
}

function mapStoredCitation(row) {
  if (!row) return null;
  return {
    id: row.id,
    source_id: row.source_id,
    source_type: row.source_type,
    source_title: row.source_title,
    source_url: row.source_url || null,
    evidence_id: row.evidence_id || null,
    snippet: row.snippet,
    score: Number(row.score || 0),
    chunk_id: row.chunk_id,
    source_body_full: row.source_body_full || "",
    indexed_at: row.updated_at || row.created_at,
  };
}

export function citationFromChunk(workspaceId, chunk, score) {
  const sourceRefs = Array.isArray(chunk.source_refs) ? chunk.source_refs : [];
  const evidenceIds = Array.isArray(chunk.metadata?.evidence_ids)
    ? chunk.metadata.evidence_ids
    : Array.isArray(sourceRefs[0]?.evidence_ids)
      ? sourceRefs[0].evidence_ids
      : [];
  const sourceId = cleanText(chunk.origin_source_id || sourceRefs[0]?.source_id || chunk.source_id);
  const sourceType = cleanText(chunk.source_type || chunk.metadata?.source_type, "external_doc");
  const snippet = cleanText(chunk.text).replace(/\s+/g, " ").slice(0, 260);
  const row = {
    id: citationIdForChunk(workspaceId, chunk),
    workspace_id: workspaceId,
    chunk_id: chunk.id,
    source_id: sourceId,
    source_type: sourceType,
    source_title: cleanText(chunk.source_title || chunk.title),
    source_url: cleanText(chunk.source_url || sourceRefs[0]?.url),
    evidence_id: cleanText(evidenceIds[0]),
    snippet,
    source_body_full: cleanText(chunk.text),
    score: Number(score || 0),
  };
  db.prepare(`
    INSERT INTO citations (
      id, workspace_id, chunk_id, source_id, source_type, source_title, source_url,
      evidence_id, snippet, source_body_full, score, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @chunk_id, @source_id, @source_type, @source_title, @source_url,
      @evidence_id, @snippet, @source_body_full, @score, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT(workspace_id, chunk_id) DO UPDATE SET
      source_id = excluded.source_id,
      source_type = excluded.source_type,
      source_title = excluded.source_title,
      source_url = excluded.source_url,
      evidence_id = excluded.evidence_id,
      snippet = excluded.snippet,
      source_body_full = excluded.source_body_full,
      score = excluded.score,
      updated_at = CURRENT_TIMESTAMP
  `).run(row);
  return mapStoredCitation(db.prepare("SELECT * FROM citations WHERE id = ?").get(row.id));
}

function answerFromCitations(question, citations) {
  if (!citations.length) return "暂无可靠来源可以回答这个问题。";
  const lines = citations.slice(0, 3).map((citation, index) => `${index + 1}. ${citation.source_title}: ${citation.snippet}`);
  return `基于当前可追溯资料，和「${question}」最相关的信息是：\n${lines.join("\n")}`;
}

function confidenceFor(citations) {
  if (!citations.length) return 0.12;
  return Math.min(0.86, 0.42 + citations.length * 0.14);
}

function writeQueryAudit({ traceId, workspaceId, userId, chatType, visibility, question, adapter, citations, confidence }) {
  db.prepare(`
    INSERT INTO query_audit (
      id, trace_id, workspace_id, user_id, chat_type, visibility_ceiling,
      query_text, adapter, citation_ids_json, confidence, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    `qa_${nanoid(12)}`,
    traceId,
    workspaceId,
    userId,
    chatType,
    visibility,
    question,
    adapter,
    JSON.stringify(citations.map((citation) => citation.id)),
    confidence
  );
}

export async function queryApi(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const question = cleanText(input.q || input.question);
  if (!workspaceId) throw new Error("workspace_id_required");
  if (!question) throw new Error("question_required");
  const adapter = queryAdapterName();
  const traceId = `trace_${nanoid(12)}`;
  const routing = chatToRetrieval(input);
  const chunks = retrieveKnowledgeChunks({
    workspace_id: workspaceId,
    question,
    project_id: input.project_id || input.filters?.project_id,
    channel: routing.channel,
    audience: routing.audience,
    user_id: input.user_id,
    user: input.user,
    roles: input.roles,
    limit: input.top_k || input.limit || 8,
  });
  const citations = chunks.map((chunk, index) => citationFromChunk(workspaceId, chunk, Math.max(0.1, 1 - index * 0.08)));
  const confidence = confidenceFor(citations);
  const response = {
    answer: answerFromCitations(question, citations),
    citations: confidence >= 0.3 ? citations.map(({ source_body_full, indexed_at, chunk_id, ...citation }) => citation) : [],
    confidence,
    visibility_applied: routing.visibility,
    adapter,
    trace_id: traceId,
  };
  const shouldCreateGap = response.confidence < 0.3 || response.citations.length === 0;
  if (shouldCreateGap) {
    const reason = chunks.length && response.citations.length === 0 ? "visibility_blocked" : "low_confidence";
    const gapResult = createOrBumpKnowledgeGap({
      workspace_id: workspaceId,
      question_text: question,
      reason,
      asker_loom_user_id: cleanText(input.user_id),
      origin_chat_id: cleanText(input.chat_id),
      origin_trace_id: traceId,
      project_id: cleanText(input.project_id || input.filters?.project_id),
    });
    response.gaps = [gapResult.gap];
  } else {
    response.gaps = [];
  }
  writeQueryAudit({
    traceId,
    workspaceId,
    userId: cleanText(input.user_id),
    chatType: routing.chatType,
    visibility: routing.visibility,
    question,
    adapter,
    citations: response.citations,
    confidence: response.confidence,
  });
  return response;
}

export function getCitation(id, workspaceId = "") {
  const row = workspaceId
    ? db.prepare("SELECT * FROM citations WHERE id = ? AND workspace_id = ?").get(cleanText(id), cleanText(workspaceId))
    : db.prepare("SELECT * FROM citations WHERE id = ?").get(cleanText(id));
  const citation = mapStoredCitation(row);
  if (citation?.source_body_full) return citation;
  if (!citation?.chunk_id) return citation;
  const chunk = getKnowledgeChunk(citation.chunk_id);
  return { ...citation, source_body_full: chunk?.text || "" };
}

export function queryHealth() {
  const adapter = queryAdapterName();
  const details = adapter === "ragflow"
    ? "ragflow adapter contract is available; local fallback data plane is used in this build"
    : "SQLite FTS local adapter ready";
  return { adapter, ok: true, details };
}

export function queryAuditCount(workspaceId) {
  return db.prepare("SELECT COUNT(*) AS count FROM query_audit WHERE workspace_id = ?").get(workspaceId).count;
}
