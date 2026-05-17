import { db } from "./db.js";
import { authorizedChunkPredicate } from "./knowledge-access-service.js";

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

function mapChunkRow(row) {
  if (!row) return null;
  return {
    ...row,
    source_refs: parseJson(row.source_refs_json, []),
    tags: parseJson(row.tags_json, []),
    metadata: parseJson(row.metadata_json, {}),
    access_policy: parseJson(row.access_policy_json, {}),
    rag_enabled: Boolean(row.rag_enabled),
    bot_enabled: Boolean(row.bot_enabled),
    external_safe: Boolean(row.external_safe),
    supplier_visible: Boolean(row.supplier_visible),
    sales_visible: Boolean(row.sales_visible),
  };
}

function audienceClauses(audience, channel) {
  const clauses = ["c.rag_enabled = 1"];
  if (channel === "feishu_group") {
    clauses.push("c.bot_enabled = 1");
    clauses.push("(c.external_safe = 1 OR c.visibility IN ('company', 'workspace'))");
  }
  if (audience === "supplier") {
    clauses.push("c.supplier_visible = 1");
  }
  if (audience === "sales_external") {
    clauses.push("(c.sales_visible = 1 OR c.external_safe = 1)");
  }
  return clauses;
}

function safeFtsQuery(question) {
  const words = cleanText(question)
    .replace(/[^\p{L}\p{N}_\s-]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
    .slice(0, 8);
  return words.length ? words.map((word) => `"${word.replace(/"/g, "")}"`).join(" OR ") : "";
}

function uniqueTerms(terms = [], limit = 12) {
  const seen = new Set();
  const result = [];
  for (const term of terms) {
    const cleaned = cleanText(term).toLowerCase();
    if (!cleaned || cleaned.length < 2 || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
    if (result.length >= limit) break;
  }
  return result;
}

function cjkTerms(text) {
  const groups = cleanText(text).match(/[\p{Script=Han}]{2,}/gu) || [];
  const terms = [];
  for (const group of groups) {
    terms.push(group);
    const maxSize = Math.min(4, group.length);
    for (let size = maxSize; size >= 2; size -= 1) {
      for (let index = 0; index <= group.length - size; index += 1) {
        terms.push(group.slice(index, index + size));
      }
    }
  }
  return terms;
}

function fallbackLikeTerms(question) {
  const source = cleanText(question);
  const spaced = source
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
  return uniqueTerms([...spaced, ...cjkTerms(source)]);
}

function scoreChunk(chunk, { packChunkIds = new Set(), question = "" } = {}) {
  const confidenceScore = { published: 5, pm_confirmed: 4, ai_extracted: 3, user_submitted: 2, raw: 1 }[chunk.confidence] || 1;
  const sourceScore = { document: 5, product: 4, demand: 4, research: 3, news: 2, manual: 2 }[chunk.source_type] || 1;
  const packScore = packChunkIds.has(chunk.id) ? 4 : 0;
  const termScore = fallbackLikeTerms(question).reduce((score, term) => {
    const haystack = `${chunk.title}\n${chunk.text}`.toLowerCase();
    return score + (haystack.includes(term.toLowerCase()) ? 1 : 0);
  }, 0);
  return packScore + confidenceScore + sourceScore + termScore;
}

export function retrieveKnowledgeChunks(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const question = cleanText(input.question);
  const audience = cleanText(input.audience, "internal");
  const channel = cleanText(input.channel, "web");
  const projectId = cleanText(input.project_id);
  const packId = cleanText(input.pack_id);
  const limit = Math.min(20, Math.max(1, Number(input.limit || 8)));
  if (!workspaceId) throw new Error("workspace_id_required");
  if (!question) throw new Error("question_required");

  const packChunkIds = new Set(packId
    ? db.prepare("SELECT chunk_id FROM knowledge_pack_chunks WHERE pack_id = ?").all(packId).map((row) => row.chunk_id)
    : []);
  const clauses = ["c.workspace_id = ?", ...audienceClauses(audience, channel)];
  const params = [workspaceId];
  if (projectId) {
    clauses.push("c.project_id = ?");
    params.push(projectId);
  }
  if (packId) {
    clauses.push("c.id IN (SELECT chunk_id FROM knowledge_pack_chunks WHERE pack_id = ?)");
    params.push(packId);
  }

  const fts = safeFtsQuery(question);
  let rows = [];
  if (fts) {
    rows = db.prepare(`
      SELECT c.*, s.source_type, s.source_id AS origin_source_id, s.title AS source_title, s.url AS source_url
      FROM knowledge_chunks_fts f
      JOIN knowledge_chunks c ON c.id = f.chunk_id
      JOIN knowledge_sources s ON s.id = c.source_id
      WHERE knowledge_chunks_fts MATCH ? AND ${clauses.join(" AND ")}
      LIMIT ?
    `).all(fts, ...params, limit * 4);
  }
  if (!rows.length) {
    const terms = fallbackLikeTerms(question);
    const likeClauses = terms.length ? terms.map(() => "(c.title LIKE ? OR c.text LIKE ?)") : ["1 = 1"];
    const likeParams = terms.flatMap((term) => [`%${term}%`, `%${term}%`]);
    rows = db.prepare(`
      SELECT c.*, s.source_type, s.source_id AS origin_source_id, s.title AS source_title, s.url AS source_url
      FROM knowledge_chunks c
      JOIN knowledge_sources s ON s.id = c.source_id
      WHERE ${clauses.join(" AND ")} AND (${likeClauses.join(" OR ")})
      LIMIT ?
    `).all(...params, ...likeParams, limit * 4);
  }

  const accessContext = {
    user: input.user,
    user_id: input.user_id,
    roles: input.roles,
    teams: input.teams,
  };

  return rows
    .map(mapChunkRow)
    .filter(authorizedChunkPredicate(accessContext))
    .sort((a, b) => scoreChunk(b, { packChunkIds, question }) - scoreChunk(a, { packChunkIds, question }))
    .slice(0, limit);
}

export function citationFromChunk(chunk) {
  return {
    source_id: chunk.source_id,
    origin_source_id: chunk.origin_source_id,
    chunk_id: chunk.id,
    title: chunk.title,
    source_title: chunk.source_title,
    source_type: chunk.source_type,
    url: chunk.source_url || chunk.source_refs?.[0]?.url || "",
  };
}
