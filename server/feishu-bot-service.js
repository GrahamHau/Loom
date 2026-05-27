import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { db } from "./db.js";
import { askLoom } from "./ask-loom-router-service.js";

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

function normalizeRoles(input = []) {
  return [...new Set((Array.isArray(input) ? input : [input]).map((value) => cleanText(value)).filter(Boolean))];
}

function nowIso() {
  return new Date().toISOString();
}

function stableJson(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashId(prefix, value, length = 16) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, length)}`;
}

export function parseFeishuMessageText(content) {
  const raw = cleanText(content);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.text === "string") return cleanText(parsed.text);
    if (typeof parsed?.content === "string") return cleanText(parsed.content);
  } catch {
    // ignore
  }
  return raw;
}

function visibilityRank(value) {
  return { public: 0, external_safe: 1, internal_only: 2 }[value] ?? 0;
}

export function normalizeBotEvent(input = {}) {
  const event = input.event && typeof input.event === "object" ? input.event : input;
  const message = event.message && typeof event.message === "object" ? event.message : event;
  const sender = event.sender && typeof event.sender === "object" ? event.sender : {};
  const senderId = cleanText(input.sender_id || message.sender_id || sender?.sender_id?.open_id || sender?.sender_id || event.sender_id);
  const chatId = cleanText(input.chat_id || message.chat_id || event.chat_id);
  const chatType = oneOf(input.chat_type || message.chat_type || event.chat_type, ["p2p", "group"], "group");
  const messageId = cleanText(input.message_id || message.message_id || event.message_id || event.id || event.event_id);
  const text = parseFeishuMessageText(input.content || message.content || event.content);
  return {
    workspace_id: cleanText(input.workspace_id),
    event_id: cleanText(input.event_id || input.header?.event_id || event.event_id || message.event_id),
    message_id: messageId,
    chat_id: chatId,
    chat_type: chatType,
    sender_id: senderId,
    message_type: cleanText(input.message_type || message.message_type || event.message_type, "text"),
    content: text,
    raw_content: cleanText(input.content || message.content || event.content),
    create_time: cleanText(input.create_time || message.create_time || input.header?.create_time || event.timestamp),
  };
}

function resolveChat(workspaceId, chatId, fallbackType) {
  const row = db.prepare(`
    SELECT *
    FROM feishu_chats
    WHERE workspace_id = ? AND chat_id = ?
  `).get(workspaceId, chatId);
  if (!row) {
    return {
      chat_id: chatId,
      workspace_id: workspaceId,
      chat_type: fallbackType,
      name: "",
      visibility_default_override: "",
    };
  }
  return {
    chat_id: row.chat_id,
    workspace_id: row.workspace_id,
    chat_type: row.chat_type,
    name: row.name,
    visibility_default_override: row.visibility_default_override || "",
  };
}

function resolveUser(workspaceId, openId) {
  const row = db.prepare(`
    SELECT *
    FROM feishu_users
    WHERE workspace_id = ? AND open_id = ?
  `).get(workspaceId, openId);
  if (!row) return null;
  return {
    open_id: row.open_id,
    workspace_id: row.workspace_id,
    loom_user_id: row.loom_user_id,
    role: row.role || "guest",
    display_name: row.display_name || "",
  };
}

export function registerFeishuUser(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const openId = cleanText(input.open_id);
  const loomUserId = cleanText(input.loom_user_id);
  if (!workspaceId) throw new Error("workspace_id_required");
  if (!openId) throw new Error("open_id_required");
  if (!loomUserId) throw new Error("loom_user_id_required");
  const row = {
    open_id: openId,
    workspace_id: workspaceId,
    loom_user_id: loomUserId,
    role: oneOf(input.role, ["pm", "sales", "ops", "exec", "guest"], "guest"),
    display_name: cleanText(input.display_name, openId),
  };
  db.prepare(`
    INSERT INTO feishu_users (
      open_id, workspace_id, loom_user_id, role, display_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(workspace_id, open_id) DO UPDATE SET
      loom_user_id = excluded.loom_user_id,
      role = excluded.role,
      display_name = excluded.display_name,
      updated_at = CURRENT_TIMESTAMP
  `).run(row.open_id, row.workspace_id, row.loom_user_id, row.role, row.display_name);
  return resolveUser(workspaceId, openId);
}

export function upsertFeishuChat(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const chatId = cleanText(input.chat_id);
  if (!workspaceId) throw new Error("workspace_id_required");
  if (!chatId) throw new Error("chat_id_required");
  const row = {
    chat_id: chatId,
    workspace_id: workspaceId,
    chat_type: oneOf(input.chat_type, ["p2p", "group", "topic"], "group"),
    name: cleanText(input.name),
    visibility_default_override: oneOf(input.visibility_default_override, ["", "public", "external_safe", "internal_only"], ""),
  };
  db.prepare(`
    INSERT INTO feishu_chats (
      chat_id, workspace_id, chat_type, name, visibility_default_override, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(workspace_id, chat_id) DO UPDATE SET
      chat_type = excluded.chat_type,
      name = excluded.name,
      visibility_default_override = excluded.visibility_default_override,
      updated_at = CURRENT_TIMESTAMP
  `).run(row.chat_id, row.workspace_id, row.chat_type, row.name, row.visibility_default_override);
  return resolveChat(workspaceId, chatId, row.chat_type);
}

function visibilityFor({ chat, user }) {
  const override = oneOf(chat?.visibility_default_override, ["public", "external_safe", "internal_only"], "");
  if (override) return override;
  if (!user) return "public";
  if (chat?.chat_type === "group") return "external_safe";
  if (user.role === "pm") return "internal_only";
  if (user.role === "sales") return "external_safe";
  return "public";
}

function resultAudience(visibility) {
  if (visibility === "public") return "supplier";
  if (visibility === "external_safe") return "sales_external";
  return "internal";
}

function buildCitationSummary(citations = []) {
  return (Array.isArray(citations) ? citations : []).slice(0, 3).map((citation) => ({
    id: citation.id,
    source_id: citation.source_id,
    source_title: citation.source_title,
    source_type: citation.source_type,
    source_url: citation.source_url || "",
    snippet: citation.snippet || "",
    evidence_id: citation.evidence_id || "",
    score: citation.score || 0,
  }));
}

export function buildFeishuAnswerCard(result = {}, meta = {}) {
  const citations = buildCitationSummary(result.citations || []);
  const answer = cleanText(result.answer, "暂无可靠来源可以回答这个问题。");
  return {
    type: "interactive",
    data: {
      title: result.mode === "refused" ? "LOOM 暂无可回答资料" : "LOOM 知识库回答",
      answer,
      confidence: Number(result.confidence || 0),
      citations,
      citation_count: Array.isArray(result.citations) ? result.citations.length : 0,
      citations_count: Array.isArray(result.citations) ? result.citations.length : 0,
      visibility_applied: result.visibility_applied || meta.visibility_applied || "internal_only",
      trace_id: result.trace_id || meta.trace_id || "",
      actions: [
        { action_id: "show_sources", text: "来源" },
        { action_id: "report_incorrect", text: "不准确？" },
        { action_id: "fill_gap", text: "我来补" },
      ],
      gaps: Array.isArray(result.gaps) ? result.gaps : [],
      adapter: result.adapter || "local",
    },
  };
}

function botConversationRow(input = {}) {
  return {
    id: input.id || hashId("botc", `${input.workspace_id}|${input.message_id}|${input.trace_id}`),
    workspace_id: cleanText(input.workspace_id),
    event_id: cleanText(input.event_id),
    feishu_message_id: cleanText(input.message_id),
    feishu_chat_id: cleanText(input.chat_id),
    feishu_open_id: cleanText(input.open_id),
    chat_type: oneOf(input.chat_type, ["p2p", "group", "topic"], "group"),
    query_text: cleanText(input.query_text),
    trace_id: cleanText(input.trace_id),
    visibility_ceiling_used: oneOf(input.visibility_ceiling_used, ["public", "external_safe", "internal_only"], "public"),
    reply_message_id: cleanText(input.reply_message_id),
    reply_payload_json: JSON.stringify(input.reply_payload || {}),
    duration_ms: Math.max(0, Number(input.duration_ms || 0)),
    fallback_interim_sent: input.fallback_interim_sent ? 1 : 0,
  };
}

function upsertBotConversation(input) {
  const row = botConversationRow(input);
  db.prepare(`
    INSERT INTO bot_conversations (
      id, workspace_id, event_id, feishu_message_id, feishu_chat_id, feishu_open_id, chat_type,
      query_text, trace_id, visibility_ceiling_used, reply_message_id, reply_payload_json,
      duration_ms, fallback_interim_sent, created_at
    ) VALUES (
      @id, @workspace_id, @event_id, @feishu_message_id, @feishu_chat_id, @feishu_open_id, @chat_type,
      @query_text, @trace_id, @visibility_ceiling_used, @reply_message_id, @reply_payload_json,
      @duration_ms, @fallback_interim_sent, CURRENT_TIMESTAMP
    )
    ON CONFLICT(workspace_id, feishu_message_id) DO UPDATE SET
      event_id = excluded.event_id,
      feishu_chat_id = excluded.feishu_chat_id,
      feishu_open_id = excluded.feishu_open_id,
      chat_type = excluded.chat_type,
      query_text = excluded.query_text,
      trace_id = excluded.trace_id,
      visibility_ceiling_used = excluded.visibility_ceiling_used,
      reply_message_id = excluded.reply_message_id,
      reply_payload_json = excluded.reply_payload_json,
      duration_ms = excluded.duration_ms,
      fallback_interim_sent = excluded.fallback_interim_sent
  `).run(row);
  return db.prepare(`
    SELECT *
    FROM bot_conversations
    WHERE workspace_id = ? AND feishu_message_id = ?
  `).get(row.workspace_id, row.feishu_message_id);
}

export function recordQueryFeedback(input = {}) {
  const row = {
    id: input.id || hashId("qfb", `${input.workspace_id}|${input.trace_id}|${input.message_id}|${input.feedback}`),
    workspace_id: cleanText(input.workspace_id),
    trace_id: cleanText(input.trace_id),
    feishu_message_id: cleanText(input.message_id),
    user_open_id: cleanText(input.user_open_id),
    feedback: oneOf(input.feedback, ["incorrect", "helpful", "needs_review"], "incorrect"),
    payload_json: JSON.stringify(input.payload || {}),
  };
  db.prepare(`
    INSERT INTO query_audit_feedback (
      id, workspace_id, trace_id, feishu_message_id, user_open_id, feedback, payload_json, created_at
    ) VALUES (
      @id, @workspace_id, @trace_id, @feishu_message_id, @user_open_id, @feedback, @payload_json, CURRENT_TIMESTAMP
    )
    ON CONFLICT(id) DO UPDATE SET
      trace_id = excluded.trace_id,
      feishu_message_id = excluded.feishu_message_id,
      user_open_id = excluded.user_open_id,
      feedback = excluded.feedback,
      payload_json = excluded.payload_json
  `).run(row);
  return db.prepare("SELECT * FROM query_audit_feedback WHERE id = ?").get(row.id);
}

export function getFeishuConversation(workspaceId, messageId) {
  return db.prepare("SELECT * FROM bot_conversations WHERE workspace_id = ? AND feishu_message_id = ?").get(cleanText(workspaceId), cleanText(messageId));
}

export function getFeishuUser(workspaceId, openId) {
  return resolveUser(cleanText(workspaceId), cleanText(openId));
}

export async function handleFeishuBotEvent(input = {}) {
  const normalized = normalizeBotEvent(input);
  if (!normalized.workspace_id) throw new Error("workspace_id_required");
  if (!normalized.message_id) throw new Error("message_id_required");
  if (!normalized.chat_id) throw new Error("chat_id_required");
  if (!normalized.sender_id) throw new Error("sender_id_required");
  if (!normalized.content) throw new Error("question_required");

  const chat = resolveChat(normalized.workspace_id, normalized.chat_id, normalized.chat_type);
  const user = resolveUser(normalized.workspace_id, normalized.sender_id);
  const visibilityCeiling = visibilityFor({ chat, user });
  const queryResult = await askLoom({
    workspace_id: normalized.workspace_id,
    user_id: user?.loom_user_id || "",
    user: user ? { id: user.loom_user_id } : undefined,
    roles: normalizeRoles(user?.role),
    channel: normalized.chat_type === "group" ? "feishu_group" : "feishu_private",
    audience: resultAudience(visibilityCeiling),
    chat_type: normalized.chat_type,
    visibility_ceiling: visibilityCeiling,
    q: normalized.content,
    chat_id: normalized.chat_id,
  });
  const card = buildFeishuAnswerCard(queryResult, {
    visibility_applied: visibilityCeiling,
    trace_id: queryResult.trace_id,
  });
  const conversation = upsertBotConversation({
    workspace_id: normalized.workspace_id,
    event_id: normalized.event_id,
    message_id: normalized.message_id,
    chat_id: normalized.chat_id,
    open_id: normalized.sender_id,
    chat_type: normalized.chat_type,
    query_text: normalized.content,
    trace_id: queryResult.trace_id,
    visibility_ceiling_used: visibilityCeiling,
    reply_payload: card,
    reply_message_id: `reply_${nanoid(10)}`,
    duration_ms: 0,
    fallback_interim_sent: false,
  });
  return {
    ok: true,
    event: normalized,
    user,
    chat,
    visibility_ceiling_used: visibilityCeiling,
    result: queryResult,
    card,
    conversation,
  };
}

export function handleFeishuCardAction(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const action = oneOf(input.action, ["show_sources", "report_incorrect", "fill_gap"], "report_incorrect");
  const messageId = cleanText(input.message_id);
  const conversation = workspaceId && messageId ? getFeishuConversation(workspaceId, messageId) : null;
  if (action === "report_incorrect") {
    const feedback = recordQueryFeedback({
      workspace_id: workspaceId,
      trace_id: conversation?.trace_id || cleanText(input.trace_id),
      message_id: messageId,
      user_open_id: cleanText(input.user_open_id),
      feedback: "incorrect",
      payload: input.payload || {},
    });
    return {
      ok: true,
      feedback: "incorrect",
      conversation,
      feedback_row: feedback,
    };
  }
  if (action === "fill_gap") {
    return {
      ok: true,
      feedback: "gap",
      conversation,
      next_step: conversation
        ? `/api/knowledge/gaps?trace_id=${encodeURIComponent(conversation.trace_id)}`
        : "/api/knowledge/gaps",
    };
  }
  return {
    ok: true,
    feedback: "sources",
    conversation,
    sources: parseJson(conversation?.reply_payload_json || "{}", {}).data?.citations || [],
  };
}

export async function handleFeishuBotQuestion(input = {}) {
  if (!input.chat_id && !input.sender_id && !input.open_id && !input.user_open_id) {
    const result = await askLoom({
      ...input,
      channel: input.channel || "feishu_group",
      q: input.q || input.question,
    });
    return {
      result,
      card: buildFeishuAnswerCard(result, {
        visibility_applied: result.visibility_applied,
        trace_id: result.trace_id,
      }),
    };
  }
  const result = await handleFeishuBotEvent({
    ...input,
    workspace_id: input.workspace_id,
    sender_id: input.sender_id || input.open_id || input.user_open_id,
    chat_id: input.chat_id || input.chat,
    chat_type: input.chat_type || input.chat_mode || "group",
    content: input.content || input.question,
    event_id: input.event_id || input.trace_id || "",
    message_id: input.message_id || input.event_id || input.trace_id || `om_${nanoid(10)}`,
  });
  return {
    result: result.result,
    card: result.card,
    conversation: result.conversation,
    visibility_ceiling_used: result.visibility_ceiling_used,
  };
}
