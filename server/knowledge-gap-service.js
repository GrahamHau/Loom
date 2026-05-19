import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { db } from "./db.js";
import { upsertQuerySources } from "./query-api-service.js";
import { migrateKnowledgeSchema } from "./knowledge-schema.js";

migrateKnowledgeSchema();

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function jsonText(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

export function normalizeQuestion(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, " ");
}

export function questionHash(value) {
  return crypto.createHash("sha256").update(normalizeQuestion(value)).digest("hex");
}

function oneOf(value, allowed, fallback) {
  const text = cleanText(value);
  return allowed.includes(text) ? text : fallback;
}

function mapGap(row) {
  if (!row) return null;
  return {
    ...row,
    related_source_ids: parseJson(row.related_source_ids_json, []),
    seen_count: Number(row.seen_count || 1),
  };
}

function mapAnswer(row) {
  if (!row) return null;
  return {
    ...row,
    citations: parseJson(row.citations_json, []),
    gap_ids: parseJson(row.gap_ids_json, []),
    metadata: parseJson(row.metadata_json, {}),
  };
}

function ensureEvidenceIds(workspaceId, evidenceIds) {
  const ids = Array.isArray(evidenceIds) ? evidenceIds.map(cleanText).filter(Boolean) : [];
  if (!ids.length) {
    const error = new Error("evidence_ids_required");
    error.status = 400;
    throw error;
  }
  const existing = db.prepare(`
    SELECT id FROM evidences
    WHERE workspace_id = ?
      AND id IN (${ids.map(() => "?").join(",")})
  `).all(workspaceId, ...ids).map((row) => row.id);
  const missing = ids.filter((id) => !existing.includes(id));
  if (missing.length) {
    const error = new Error(`evidence_not_found:${missing.join(",")}`);
    error.status = 400;
    throw error;
  }
  return ids;
}

export function createOrBumpKnowledgeGap(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const question = cleanText(input.question_text || input.question || input.q);
  if (!workspaceId) throw new Error("workspace_id_required");
  if (!question) throw new Error("question_required");
  const hash = questionHash(question);
  const existing = db.prepare(`
    SELECT *
    FROM knowledge_gaps
    WHERE workspace_id = ?
      AND question_hash = ?
      AND created_at >= datetime('now', '-30 days')
    ORDER BY status = 'open' DESC, created_at DESC
    LIMIT 1
  `).get(workspaceId, hash);
  if (existing) {
    db.prepare(`
      UPDATE knowledge_gaps
      SET seen_count = COALESCE(seen_count, 1) + 1,
          origin_trace_id = COALESCE(NULLIF(?, ''), origin_trace_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(cleanText(input.origin_trace_id || input.trace_id), existing.id);
    return { gap: mapGap(db.prepare("SELECT * FROM knowledge_gaps WHERE id = ?").get(existing.id)), was_duplicate: true };
  }

  const id = input.id || `gap_${nanoid(12)}`;
  db.prepare(`
    INSERT INTO knowledge_gaps (
      id, workspace_id, project_id, pack_id, question, question_text, question_hash,
      reason, status, seen_count, asker_open_id, asker_loom_user_id, origin_chat_id,
      origin_trace_id, related_source_ids_json, created_by, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @project_id, @pack_id, @question, @question_text, @question_hash,
      @reason, 'open', 1, @asker_open_id, @asker_loom_user_id, @origin_chat_id,
      @origin_trace_id, @related_source_ids_json, @created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run({
    id,
    workspace_id: workspaceId,
    project_id: cleanText(input.project_id),
    pack_id: cleanText(input.pack_id),
    question,
    question_text: question,
    question_hash: hash,
    reason: oneOf(input.reason, ["low_confidence", "visibility_blocked", "timeout", "model_not_configured", "no_authorized_source", "weak_evidence", "missing_source", "no_authorized_chunks"], "low_confidence"),
    asker_open_id: cleanText(input.asker_open_id),
    asker_loom_user_id: cleanText(input.asker_loom_user_id || input.user_id),
    origin_chat_id: cleanText(input.origin_chat_id || input.chat_id),
    origin_trace_id: cleanText(input.origin_trace_id || input.trace_id),
    related_source_ids_json: jsonText(input.related_source_ids, []),
    created_by: cleanText(input.created_by || input.user_id),
  });
  return { gap: mapGap(db.prepare("SELECT * FROM knowledge_gaps WHERE id = ?").get(id)), was_duplicate: false };
}

export function listKnowledgeGapInbox(workspaceId, status = "open") {
  const clauses = ["workspace_id = ?"];
  const params = [cleanText(workspaceId)];
  if (status && status !== "all") {
    clauses.push("status = ?");
    params.push(status === "dismissed" ? "ignored" : status);
  }
  return db.prepare(`
    SELECT *
    FROM knowledge_gaps
    WHERE ${clauses.join(" AND ")}
    ORDER BY updated_at DESC, created_at DESC
  `).all(...params).map(mapGap);
}

export function answerKnowledgeGap(id, input = {}) {
  const gap = db.prepare("SELECT * FROM knowledge_gaps WHERE id = ?").get(cleanText(id));
  if (!gap) {
    const error = new Error("knowledge_gap_not_found");
    error.status = 404;
    throw error;
  }
  const evidenceIds = ensureEvidenceIds(gap.workspace_id, input.evidence_ids);
  const answerText = cleanText(input.answer_text || input.answer);
  if (!answerText) {
    const error = new Error("answer_text_required");
    error.status = 400;
    throw error;
  }
  const answerId = input.id || `ka_${nanoid(12)}`;
  const question = cleanText(input.canonical_question, gap.question_text || gap.question);
  const visibility = oneOf(input.visibility, ["internal_only", "external_safe", "public"], "internal_only");
  const audience = visibility === "public" ? "supplier" : visibility === "external_safe" ? "sales_external" : "internal";
  const source = {
    id: answerId,
    type: "knowledge_answer",
    title: question,
    body: answerText,
    visibility,
    evidence_ids: evidenceIds,
    confidence: 1,
    metadata: {
      source_gap_id: gap.id,
      author_user_id: cleanText(input.author_user_id || input.created_by),
      external_safe_variant: cleanText(input.external_safe_variant),
    },
  };
  db.prepare(`
    INSERT INTO knowledge_answers (
      id, workspace_id, project_id, pack_id, scope_hash, question_hash, question, answer,
      citations_json, gap_ids_json, mode, confidence, audience, channel, created_by,
      source_query_log_id, expires_at, metadata_json, created_at, updated_at
    ) VALUES (
      @id, @workspace_id, @project_id, @pack_id, 'global', @question_hash, @question, @answer,
      @citations_json, @gap_ids_json, 'answered', 1, @audience, 'web', @created_by,
      '', NULL, @metadata_json, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT(workspace_id, question_hash, scope_hash, audience, channel) DO UPDATE SET
      question = excluded.question,
      answer = excluded.answer,
      citations_json = excluded.citations_json,
      gap_ids_json = excluded.gap_ids_json,
      confidence = excluded.confidence,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    id: answerId,
    workspace_id: gap.workspace_id,
    project_id: cleanText(input.project_id || gap.project_id),
    pack_id: cleanText(input.pack_id || gap.pack_id),
    question_hash: questionHash(question),
    question,
    answer: answerText,
    citations_json: jsonText([{ source_type: "knowledge_answer", source_id: answerId, evidence_ids: evidenceIds }], []),
    gap_ids_json: jsonText([gap.id], []),
    audience,
    created_by: cleanText(input.author_user_id || input.created_by),
    metadata_json: jsonText(source.metadata, {}),
  });
  const indexed = upsertQuerySources({ workspace_id: gap.workspace_id, sources: [source] });
  db.prepare(`
    UPDATE knowledge_gaps
    SET status = 'answered',
        resolved_by_answer_id = ?,
        resolved_by_user_id = ?,
        answer_chunk_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(answerId, cleanText(input.author_user_id || input.created_by), answerId, gap.id);
  return {
    answer: mapAnswer(db.prepare("SELECT * FROM knowledge_answers WHERE id = ?").get(answerId)),
    indexed: indexed.upserted_count === 1,
    index: indexed,
  };
}

export function dismissKnowledgeGap(id, input = {}) {
  const current = db.prepare("SELECT * FROM knowledge_gaps WHERE id = ?").get(cleanText(id));
  if (!current) {
    const error = new Error("knowledge_gap_not_found");
    error.status = 404;
    throw error;
  }
  db.prepare(`
    UPDATE knowledge_gaps
    SET status = 'ignored',
        reason = COALESCE(NULLIF(?, ''), reason),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(cleanText(input.reason || input.note), current.id);
  return mapGap(db.prepare("SELECT * FROM knowledge_gaps WHERE id = ?").get(current.id));
}
