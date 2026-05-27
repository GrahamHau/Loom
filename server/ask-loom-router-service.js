import { nanoid } from "nanoid";
import { callLLM, isTextModelTierConfigured, routedTextModel } from "./ai-service.js";
import { createOrBumpKnowledgeGap } from "./knowledge-gap-service.js";
import { retrieveKnowledgeChunks } from "./knowledge-retriever.js";
import { createKnowledgeQueryLog } from "./knowledge-repository.js";
import { citationFromChunk as storedCitationFromChunk } from "./query-api-service.js";
import { listEvidencesForEntity } from "./signal-evidence-service.js";
import { listFeishuProjectItems, rawState } from "./repository.js";
import { searchOntologyEntities } from "./ontology-service.js";

const MAX_PACKETS = 10;

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function oneOf(value, allowed, fallback) {
  const text = cleanText(value);
  return allowed.includes(text) ? text : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stablePacketId(packet) {
  return `ep_${Buffer.from(`${packet.source_type}|${packet.source_id}|${packet.title}|${packet.snippet}`)
    .toString("base64url")
    .slice(0, 24)}`;
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

function queryTerms(question) {
  const source = cleanText(question);
  const latin = source
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length >= 2);
  return [...new Set([...latin, ...cjkTerms(source).map((term) => term.toLowerCase())])].slice(0, 18);
}

function scoreText(question, text, base = 0) {
  const haystack = cleanText(text).toLowerCase();
  if (!haystack) return 0;
  const terms = queryTerms(question);
  if (!terms.length) return 0;
  const hits = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
  return hits ? base + hits / Math.max(terms.length, 4) : 0;
}

function packet(input = {}) {
  const item = {
    id: cleanText(input.id),
    source_type: cleanText(input.source_type, "manual"),
    source_id: cleanText(input.source_id),
    title: cleanText(input.title, "未命名来源"),
    snippet: cleanText(input.snippet),
    confidence: Math.max(0, Math.min(1, Number(input.confidence ?? 0.55))),
    visibility: cleanText(input.visibility, "internal_only"),
    audience: cleanText(input.audience, "internal"),
    citation_url: cleanText(input.citation_url || input.source_url || input.url),
    updated_at: cleanText(input.updated_at),
    tool: cleanText(input.tool),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    chunk_id: cleanText(input.chunk_id),
    source_title: cleanText(input.source_title || input.title, "未命名来源"),
  };
  item.id ||= stablePacketId(item);
  return item;
}

function itemText(item = {}, keys = []) {
  return keys.map((key) => {
    const value = item[key];
    if (Array.isArray(value)) return value.join("、");
    if (value && typeof value === "object") return JSON.stringify(value);
    return cleanText(value);
  }).filter(Boolean).join("\n");
}

function productPackets({ question, userId }) {
  if (!userId) return [];
  const products = safeArray(rawState(userId)?.products);
  return products
    .map((product) => {
      const body = itemText(product, [
        "name",
        "brand",
        "host",
        "category",
        "ai_summary",
        "selling_points",
        "negative_keywords",
        "cost_estimate",
        "visible_comments",
        "note",
        "tags",
      ]);
      const score = scoreText(question, body, 0.35);
      if (!score) return null;
      return packet({
        source_type: "product",
        source_id: product.id,
        title: product.name || "未命名竞品",
        snippet: body.slice(0, 520),
        confidence: Math.min(0.9, score),
        visibility: "internal_only",
        audience: "internal",
        citation_url: product.url || product.source_url || product.platforms?.[0]?.url,
        updated_at: product.updated_at,
        tool: "products",
        metadata: {
          brand: product.brand,
          host: product.host,
          category: product.category,
          source: "竞品库",
        },
      });
    })
    .filter(Boolean);
}

function demandPackets({ question, userId }) {
  if (!userId) return [];
  const demands = safeArray(rawState(userId)?.demands);
  return demands
    .map((demand) => {
      const body = itemText(demand, [
        "title",
        "summary",
        "original_content",
        "scenarios",
        "painpoints",
        "innovation",
        "visible_comments",
        "note",
        "tags",
      ]);
      const score = scoreText(question, body, 0.35);
      if (!score) return null;
      return packet({
        source_type: "demand",
        source_id: demand.id,
        title: demand.title || "未命名需求",
        snippet: body.slice(0, 520),
        confidence: Math.min(0.88, score),
        visibility: "internal_only",
        audience: "internal",
        citation_url: demand.url || demand.source_url,
        updated_at: demand.updated_at,
        tool: "demands",
        metadata: {
          source: demand.source || "需求库",
          scenarios: demand.scenarios || [],
          painpoints: demand.painpoints || [],
        },
      });
    })
    .filter(Boolean);
}

function evidencePackets({ question, workspaceId, userId }) {
  if (!userId) return [];
  const state = rawState(userId);
  const entities = [
    ...safeArray(state?.products).map((item) => ["product", item.id, item.name]),
    ...safeArray(state?.demands).map((item) => ["demand", item.id, item.title]),
    ...safeArray(state?.research).map((item) => ["research", item.id, item.title]),
  ];
  return entities.flatMap(([entityType, entityId, title]) => {
    const evidences = listEvidencesForEntity({ workspace_id: workspaceId, entity_type: entityType, entity_id: entityId });
    return evidences.map((evidence) => {
      const score = scoreText(question, `${title}\n${evidence.claim_text}`, 0.45);
      if (!score) return null;
      return packet({
        source_type: "evidence",
        source_id: evidence.id,
        title: `${title || entityType} 的证据`,
        snippet: evidence.claim_text,
        confidence: Math.min(0.95, Math.max(score, evidence.confidence || 0.7)),
        visibility: "internal_only",
        audience: "internal",
        updated_at: evidence.updated_at || evidence.created_at,
        tool: "evidence",
        metadata: {
          entity_type: entityType,
          entity_id: entityId,
          signal_ids: evidence.signal_ids || [],
        },
      });
    }).filter(Boolean);
  });
}

function feishuProjectPackets({ question, workspaceId }) {
  const items = listFeishuProjectItems({ workspace_id: workspaceId, q: "", limit: 100 });
  return items
    .map((item) => {
      const fieldText = Object.values(item.fields || {}).map((field) => `${field.name}: ${field.text || JSON.stringify(field.value)}`).join("\n");
      const body = [
        item.name,
        item.work_item_type_name,
        item.status_name,
        item.current_node_name,
        fieldText,
      ].filter(Boolean).join("\n");
      const score = scoreText(question, body, 0.38);
      if (!score) return null;
      return packet({
        source_type: "feishu_project_item",
        source_id: item.work_item_id,
        title: item.name || "飞书项目工作项",
        snippet: body.slice(0, 520),
        confidence: Math.min(0.86, score),
        visibility: "internal_only",
        audience: "internal",
        citation_url: item.source_url,
        updated_at: item.updated_at,
        tool: "feishu_project",
        metadata: {
          project_key: item.project_key,
          work_item_type_name: item.work_item_type_name,
          status_name: item.status_name,
          current_node_name: item.current_node_name,
        },
      });
    })
    .filter(Boolean);
}

function ontologyPackets({ question, workspaceId }) {
  const entities = searchOntologyEntities(workspaceId, { q: question, status: "active" }).slice(0, 12);
  return entities.map((entity) => packet({
    source_type: "ontology_entity",
    source_id: entity.id,
    title: entity.canonical_name,
    snippet: [
      `实体类型: ${entity.entity_type}`,
      entity.summary,
      safeArray(entity.aliases).length ? `别名: ${entity.aliases.join("、")}` : "",
    ].filter(Boolean).join("\n"),
    confidence: Number(entity.confidence || 0.72),
    visibility: "internal_only",
    audience: "internal",
    updated_at: entity.updated_at,
    tool: "ontology",
    metadata: {
      entity_type: entity.entity_type,
      source_refs: entity.source_refs || [],
    },
  }));
}

function ragPackets(input) {
  const chunks = retrieveKnowledgeChunks({
    workspace_id: input.workspaceId,
    question: input.question,
    project_id: input.projectId,
    pack_id: input.packId,
    channel: input.channel,
    audience: input.audience,
    user_id: input.userId,
    user: input.user,
    roles: input.roles,
    limit: input.limit || 8,
  });
  return chunks.map((chunk, index) => {
    const stored = storedCitationFromChunk(input.workspaceId, chunk, Math.max(0.1, 1 - index * 0.08));
    return packet({
      source_type: chunk.source_type || chunk.metadata?.source_type || "document",
      source_id: chunk.origin_source_id || chunk.source_id,
      title: chunk.title || chunk.source_title || "知识片段",
      snippet: cleanText(chunk.text).replace(/\s+/g, " ").slice(0, 520),
      confidence: Math.max(0.45, 0.88 - index * 0.06),
      visibility: chunk.visibility || "internal_only",
      audience: input.audience,
      citation_url: chunk.source_url || chunk.source_refs?.[0]?.url,
      updated_at: chunk.indexed_at,
      tool: "rag",
      chunk_id: chunk.id,
      source_title: chunk.source_title || chunk.title,
      metadata: {
        citation_id: stored.id,
        chunk_type: chunk.chunk_type,
        tags: chunk.tags || [],
        source_refs: chunk.source_refs || [],
      },
    });
  });
}

function normalizeAudience(input = {}) {
  const chatType = oneOf(input.chat_type, ["web", "private", "group", "p2p"], input.channel === "feishu_group" ? "group" : "web");
  if (input.audience) return oneOf(input.audience, ["internal", "supplier", "sales_external"], "internal");
  if (chatType === "group") return "sales_external";
  return "internal";
}

function normalizeChannel(input = {}) {
  if (input.channel) return oneOf(input.channel, ["web", "feishu_private", "feishu_group"], "web");
  if (input.chat_type === "group") return "feishu_group";
  if (input.chat_type === "private" || input.chat_type === "p2p") return "feishu_private";
  return "web";
}

function filterForAudience(packets, audience, channel) {
  if (audience === "internal" && channel !== "feishu_group") return packets;
  return packets.filter((item) => {
    if (item.source_type === "knowledge_answer") return true;
    return item.visibility !== "internal_only" || item.metadata?.external_safe === true;
  });
}

function buildExtractiveAnswer(question, packets) {
  if (!packets.length) return "暂无可靠来源可以回答这个问题。";
  const lines = packets.slice(0, 5).map((item, index) => `${index + 1}. ${item.title}: ${item.snippet.slice(0, 180)}`);
  return `基于当前可追溯资料，和「${question}」最相关的信息是：\n${lines.join("\n")}`;
}

async function buildAnswer({ userId, question, packets, audience }) {
  const tier = audience === "internal" ? "fast" : "strong";
  if (!userId || !isTextModelTierConfigured(userId, tier)) {
    return { answer: buildExtractiveAnswer(question, packets), model_status: `${tier}_model_not_configured` };
  }
  const context = packets.slice(0, 8).map((item, index) => (
    `[${index + 1}] ${item.title}\nsource_type=${item.source_type}\nsource_id=${item.source_id}\nconfidence=${item.confidence}\n${item.snippet}`
  )).join("\n\n");
  const result = await callLLM({
    userId,
    purpose: "ask_loom:router_answer",
    model: routedTextModel(userId, tier),
    system: "你是 LOOM 企业知识问答助手。只能依据给定证据回答；不能编造；必须返回 JSON。",
    user: `问题：${question}\n\n证据：\n${context}\n\n返回 JSON：{"answer":"...","confidence":0.0到1.0}`,
    responseFormat: "json",
    temperature: 0.1,
    maxTokens: 900,
  });
  return {
    answer: cleanText(result.answer, buildExtractiveAnswer(question, packets)),
    llm_confidence: Number(result.confidence || 0),
    model_status: `${tier}_requested`,
  };
}

export async function askLoom(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const question = cleanText(input.q || input.question);
  const userId = cleanText(input.user_id);
  if (!workspaceId) throw new Error("workspace_id_required");
  if (!question) throw new Error("question_required");

  const startedAt = Date.now();
  const channel = normalizeChannel(input);
  const audience = normalizeAudience(input);
  const traceId = input.trace_id || `trace_${nanoid(12)}`;
  const toolInputs = {
    workspaceId,
    question,
    userId,
    user: input.user,
    roles: input.roles || [],
    projectId: cleanText(input.project_id || input.filters?.project_id),
    packId: cleanText(input.pack_id),
    channel,
    audience,
    limit: input.top_k || input.limit || 8,
  };
  const allPackets = [
    ...productPackets({ question, userId }),
    ...demandPackets({ question, userId }),
    ...evidencePackets({ question, workspaceId, userId }),
    ...feishuProjectPackets({ question, workspaceId }),
    ...ontologyPackets({ question, workspaceId }),
    ...ragPackets(toolInputs),
  ];
  const filteredPackets = filterForAudience(allPackets, audience, channel)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_PACKETS);
  const toolsUsed = [...new Set(filteredPackets.map((item) => item.tool).filter(Boolean))];
  const confidence = filteredPackets.length
    ? Math.min(0.92, 0.32 + filteredPackets.slice(0, 5).reduce((sum, item) => sum + item.confidence, 0) / 8)
    : 0.08;
  const enoughEvidence = filteredPackets.length > 0 && confidence >= (audience === "internal" ? 0.28 : 0.38);

  if (!enoughEvidence) {
    const gapResult = createOrBumpKnowledgeGap({
      workspace_id: workspaceId,
      project_id: toolInputs.projectId,
      pack_id: toolInputs.packId,
      question_text: question,
      reason: filteredPackets.length ? "weak_evidence" : "missing_source",
      asker_loom_user_id: userId,
      origin_chat_id: cleanText(input.chat_id),
      origin_trace_id: traceId,
      related_source_ids: filteredPackets.map((item) => item.source_id),
      created_by: userId,
    });
    const answer = filteredPackets.length
      ? "当前资料相关性较弱，暂不生成确定答案，已记录为待补问题。"
      : "暂无可靠来源可以回答这个问题，已记录为待补问题。";
    createKnowledgeQueryLog({
      workspace_id: workspaceId,
      user_id: userId,
      project_id: toolInputs.projectId,
      pack_id: toolInputs.packId,
      channel,
      audience,
      question,
      answer,
      mode: "refused",
      confidence,
      citations: [],
      matched_chunk_ids: filteredPackets.map((item) => item.chunk_id).filter(Boolean),
      gap_ids: [gapResult.gap.id],
      latency_ms: Date.now() - startedAt,
    });
    return {
      answer,
      confidence,
      citations: [],
      evidence_packets: filteredPackets,
      gaps: [gapResult.gap],
      mode: "refused",
      needs_review: true,
      trace_id: traceId,
      tools_used: toolsUsed,
      router: "ask_loom",
      adapter: "multi_tool",
      visibility_applied: audience === "internal" ? "internal_only" : "external_safe",
    };
  }

  const answer = await buildAnswer({ userId, question, packets: filteredPackets, audience });
  const finalConfidence = answer.llm_confidence ? Math.min(confidence, answer.llm_confidence) : confidence;
  const citations = filteredPackets.map((item) => ({
    id: item.metadata?.citation_id || item.id,
    source_id: item.source_id,
    source_type: item.source_type,
    source_title: item.source_title || item.title,
    title: item.title,
    snippet: item.snippet,
    source_url: item.citation_url,
    citation_url: item.citation_url,
    confidence: item.confidence,
    score: item.confidence,
    chunk_id: item.chunk_id,
    evidence_id: item.source_type === "evidence" ? item.source_id : "",
    tool: item.tool,
    metadata: item.metadata,
  }));
  const log = createKnowledgeQueryLog({
    workspace_id: workspaceId,
    user_id: userId,
    project_id: toolInputs.projectId,
    pack_id: toolInputs.packId,
    channel,
    audience,
    question,
    answer: answer.answer,
    mode: "answered",
    confidence: finalConfidence,
    citations,
    matched_chunk_ids: filteredPackets.map((item) => item.chunk_id).filter(Boolean),
    gap_ids: [],
    latency_ms: Date.now() - startedAt,
  });
  return {
    answer: answer.answer,
    confidence: finalConfidence,
    citations,
    evidence_packets: filteredPackets,
    gaps: [],
    mode: "answered",
    needs_review: false,
    trace_id: traceId,
    tools_used: toolsUsed,
    router: "ask_loom",
    adapter: "multi_tool",
    model_status: answer.model_status,
    query_log_id: log.id,
    visibility_applied: audience === "internal" ? "internal_only" : "external_safe",
  };
}
