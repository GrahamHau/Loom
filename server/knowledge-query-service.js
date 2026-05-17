import { callLLM, isTextModelTierConfigured, routedTextModel } from "./ai-service.js";
import { db } from "./db.js";
import { createKnowledgeGap, createKnowledgeQueryLog } from "./knowledge-repository.js";
import { citationFromChunk, retrieveKnowledgeChunks } from "./knowledge-retriever.js";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function queryNeedsStrongModel(question, audience) {
  const text = cleanText(question).toLowerCase();
  return audience !== "internal" || /(supplier|供应商|报价|成本|认证|风险|legal|合同|sales|销售)/i.test(text);
}

function extractiveAnswer(question, chunks) {
  const lines = chunks.slice(0, 3).map((chunk, index) => {
    const text = cleanText(chunk.text).replace(/\s+/g, " ").slice(0, 180);
    return `${index + 1}. ${chunk.title}: ${text}`;
  });
  return `基于当前可访问资料，和「${question}」最相关的信息是：\n${lines.join("\n")}`;
}

async function answerWithLlm({ userId, question, chunks, needsStrongModel }) {
  const tier = needsStrongModel ? "strong" : "fast";
  const context = chunks.map((chunk, index) => (
    `[${index + 1}] ${chunk.title}\nsource_id=${chunk.source_id}\nchunk_id=${chunk.id}\n${chunk.text}`
  )).join("\n\n");
  const result = await callLLM({
    userId,
    purpose: `knowledge:query:${tier}`,
    model: routedTextModel(userId, tier),
    system: "你是 LOOM 企业知识库问答助手。只能依据给定资料回答；不能编造；必须返回 JSON。",
    user: `问题：${question}\n\n资料：\n${context}\n\n返回 JSON：{"answer":"...","confidence":0.0到1.0,"used_chunk_ids":["..."]}`,
    responseFormat: "json",
    temperature: 0.1,
    maxTokens: 900,
  });
  return {
    answer: cleanText(result.answer, extractiveAnswer(question, chunks)),
    confidence: Number(result.confidence ?? 0.72),
    used_chunk_ids: Array.isArray(result.used_chunk_ids) ? result.used_chunk_ids : chunks.map((chunk) => chunk.id),
  };
}

export async function queryKnowledge(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const question = cleanText(input.question);
  const userId = cleanText(input.user_id);
  const projectId = cleanText(input.project_id);
  const packId = cleanText(input.pack_id);
  const channel = cleanText(input.channel, "web");
  const audience = cleanText(input.audience, "internal");
  const user = input.user && typeof input.user === "object" ? input.user : {};
  const roles = Array.isArray(input.roles) ? input.roles : [];
  if (!workspaceId) throw new Error("workspace_id_required");
  if (!question) throw new Error("question_required");

  const startedAt = Date.now();
  const chunks = retrieveKnowledgeChunks({
    workspace_id: workspaceId,
    question,
    project_id: projectId,
    pack_id: packId,
    channel,
    audience,
    user_id: userId,
    user,
    roles,
  });
  const needsStrongModel = queryNeedsStrongModel(question, audience);

  if (!chunks.length) {
    const gap = createKnowledgeGap({
      workspace_id: workspaceId,
      project_id: projectId,
      pack_id: packId,
      question,
      reason: "no_authorized_chunks",
      created_by: userId,
    });
    const log = createKnowledgeQueryLog({
      workspace_id: workspaceId,
      user_id: userId,
      project_id: projectId,
      pack_id: packId,
      channel,
      audience,
      question,
      answer: "当前没有可访问的资料可以回答这个问题。",
      mode: "refused",
      confidence: 0,
      citations: [],
      matched_chunk_ids: [],
      gap_ids: [gap.id],
      latency_ms: Date.now() - startedAt,
    });
    return {
      answer: log.answer,
      confidence: 0,
      citations: [],
      gaps: [gap],
      mode: "refused",
      needs_review: needsStrongModel,
    };
  }

  const requestedTier = needsStrongModel ? "strong" : "fast";
  const llmReady = userId && isTextModelTierConfigured(userId, requestedTier);
  const modelStatus = llmReady ? `${requestedTier}_requested` : `${requestedTier}_model_not_configured`;
  const llmAnswer = llmReady
    ? await answerWithLlm({ userId, question, chunks, needsStrongModel })
    : {
        answer: extractiveAnswer(question, chunks),
        confidence: needsStrongModel ? 0.45 : 0.62,
        used_chunk_ids: chunks.map((chunk) => chunk.id),
      };
  const usedIds = new Set(llmAnswer.used_chunk_ids);
  const usedChunks = chunks.filter((chunk) => !usedIds.size || usedIds.has(chunk.id));
  const citations = usedChunks.length ? usedChunks.map(citationFromChunk) : chunks.map(citationFromChunk);
  const needsReview = needsStrongModel && !llmReady;
  const mode = citations.length ? "answered" : "partial";
  const log = createKnowledgeQueryLog({
    workspace_id: workspaceId,
    user_id: userId,
    project_id: projectId,
    pack_id: packId,
    channel,
    audience,
    question,
    answer: llmAnswer.answer,
    mode,
    confidence: llmAnswer.confidence,
    citations,
    matched_chunk_ids: chunks.map((chunk) => chunk.id),
    gap_ids: [],
    latency_ms: Date.now() - startedAt,
  });

  return {
    answer: llmAnswer.answer,
    confidence: llmAnswer.confidence,
    citations,
    gaps: [],
    mode,
    needs_review: needsReview,
    model_status: modelStatus,
    query_log_id: log.id,
  };
}

export function listKnowledgeQueryLogs(workspaceId, limit = 50) {
  return db.prepare(`
    SELECT *
    FROM knowledge_query_logs
    WHERE workspace_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(workspaceId, Math.min(200, Math.max(1, Number(limit || 50)))).map((row) => ({
    ...row,
    citations: JSON.parse(row.citations_json || "[]"),
    matched_chunk_ids: JSON.parse(row.matched_chunk_ids_json || "[]"),
    gap_ids: JSON.parse(row.gap_ids_json || "[]"),
  }));
}

export async function evaluateKnowledgeRegression(input = {}) {
  const cases = Array.isArray(input.cases) ? input.cases : [];
  const results = [];
  for (const item of cases.slice(0, 50)) {
    const question = cleanText(item.question);
    if (!question) continue;
    const result = await queryKnowledge({
      workspace_id: input.workspace_id,
      user_id: input.user_id,
      user: input.user,
      roles: input.roles,
      teams: input.teams,
      channel: input.channel,
      audience: input.audience,
      project_id: input.project_id,
      pack_id: input.pack_id,
      question,
      limit: item.limit || input.limit || 8,
    });
    const expectedChunkIds = Array.isArray(item.expected_chunk_ids) ? item.expected_chunk_ids.map(cleanText).filter(Boolean) : [];
    const expectedTerms = Array.isArray(item.expected_terms) ? item.expected_terms.map(cleanText).filter(Boolean) : [];
    const citationIds = new Set((result.citations || []).map((citation) => citation.chunk_id));
    const answerText = cleanText(result.answer).toLowerCase();
    const matchedChunks = expectedChunkIds.filter((id) => citationIds.has(id));
    const matchedTerms = expectedTerms.filter((term) => answerText.includes(term.toLowerCase()));
    const passed = result.mode !== "refused" &&
      (!expectedChunkIds.length || matchedChunks.length > 0) &&
      (!expectedTerms.length || matchedTerms.length === expectedTerms.length);
    results.push({
      id: cleanText(item.id, question.slice(0, 30)),
      question,
      passed,
      mode: result.mode,
      confidence: result.confidence,
      citation_count: result.citations?.length || 0,
      matched_chunk_ids: matchedChunks,
      missing_chunk_ids: expectedChunkIds.filter((id) => !citationIds.has(id)),
      matched_terms: matchedTerms,
      missing_terms: expectedTerms.filter((term) => !matchedTerms.includes(term)),
      needs_review: result.needs_review,
    });
  }
  const passed = results.filter((item) => item.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    pass_rate: results.length ? Number((passed / results.length).toFixed(2)) : 0,
    results,
  };
}
