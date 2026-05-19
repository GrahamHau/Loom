#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = cleanText(args["base-url"] || process.env.LOOM_BASE_URL || "http://127.0.0.1:3000");
const workspaceId = cleanText(args["workspace-id"] || process.env.LOOM_BOT_WORKSPACE_ID || "ws_demo");
const ingressKey = cleanText(args["ingress-key"] || process.env.LOOM_BOT_INGRESS_KEY);
const sendReplies = String(args["send-replies"] || process.env.LOOM_BOT_SEND_REPLIES || "false") === "true";
const eventKey = cleanText(args.event || "im.message.receive_v1");

if (!ingressKey) {
  console.error("[feishu-bot-listener] missing LOOM_BOT_INGRESS_KEY");
  process.exit(1);
}

const stdin = process.stdin;
stdin.setEncoding("utf8");
let buffer = "";

stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || "";
  for (const line of lines) {
    const raw = line.trim();
    if (!raw) continue;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      console.error(`[feishu-bot-listener] bad json: ${error.message}`);
      continue;
    }
    await handleEvent(payload);
  }
});

stdin.on("end", async () => {
  const tail = buffer.trim();
  if (tail) {
    try {
      await handleEvent(JSON.parse(tail));
    } catch (error) {
      console.error(`[feishu-bot-listener] bad json: ${error.message}`);
    }
  }
});

async function handleEvent(payload) {
  const eventType = cleanText(payload?.type || payload?.header?.event_type || payload?.event_type);
  if (eventKey && eventType && eventType !== eventKey) return;
  const normalized = normalizePayload(payload);
  const response = await fetch(`${baseUrl}/api/bot/feishu/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Loom-Bot-Ingress-Key": ingressKey,
    },
    body: JSON.stringify({
      ...normalized,
      workspace_id: workspaceId,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`[feishu-bot-listener] ingress_failed status=${response.status} error=${body.error || "unknown"}`);
    return;
  }
  if (!sendReplies) {
    console.log(JSON.stringify({ ok: true, message_id: body?.event?.message_id || normalized.message_id, trace_id: body?.result?.trace_id || "" }));
    return;
  }
  console.log(JSON.stringify({
    ok: true,
    message_id: body?.event?.message_id || normalized.message_id,
    reply: body?.card || null,
    conversation_id: body?.conversation?.id || "",
  }));
}

function normalizePayload(payload = {}) {
  const event = payload.event && typeof payload.event === "object" ? payload.event : payload;
  const message = event.message && typeof event.message === "object" ? event.message : event;
  const senderId = event.sender?.sender_id?.open_id || event.sender_id || message.sender_id || "";
  return {
    event_id: payload.header?.event_id || event.event_id || message.event_id || "",
    message_id: message.message_id || payload.message_id || event.message_id || "",
    chat_id: message.chat_id || event.chat_id || "",
    chat_type: message.chat_type || event.chat_type || "group",
    sender_id: senderId,
    message_type: message.message_type || event.message_type || "text",
    content: message.content || event.content || "",
    create_time: message.create_time || payload.header?.create_time || event.create_time || "",
  };
}

process.on("SIGINT", () => process.exit(0));
process.stdin.resume();
