import { rawState, updateSettings } from "./repository.js";

const DEFAULT_TIMEOUT_MS = 30000;
const FETCH_TIMEOUT_MS = 30000;

export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getSettings(userId, kind = "text") {
  const settings = rawState(userId)?.settings || {};
  const isVision = kind === "vision";
  const prefix = isVision ? "llm_vision_" : "llm_";
  const envPrefix = isVision ? "LLM_VISION_" : "LLM_";
  const openAiPrefix = isVision ? "OPENAI_VISION_" : "OPENAI_";
  return {
    ...settings,
    llm_api_type: settings[`${prefix}api_type`] || settings.llm_api_type || process.env[`${envPrefix}API_TYPE`] || process.env[`${openAiPrefix}API_TYPE`] || "openai",
    llm_api_url: settings[`${prefix}api_url`] || process.env[`${envPrefix}API_URL`] || process.env[`${openAiPrefix}API_URL`] || process.env[`${openAiPrefix}BASE_URL`] || process.env.LLM_API_URL || process.env.OPENAI_BASE_URL || "",
    llm_model: settings[`${prefix}model`] || process.env[`${envPrefix}MODEL`] || process.env[`${openAiPrefix}MODEL`] || "",
    llm_api_key: settings[`${prefix}api_key`] || process.env[`${envPrefix}API_KEY`] || process.env[`${openAiPrefix}API_KEY`] || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "",
  };
}

function configuredSettings(userId, kind = "text") {
  const settings = getSettings(userId, kind);
  if (!settings.llm_api_url || !settings.llm_model || !settings.llm_api_key) {
    const label = kind === "vision" ? "视觉模型" : "LLM";
    throw new AppError(400, "llm_not_configured", `${label} 未配置完整，请先在系统设置填写 API URL、模型和 API Key。`);
  }
  return settings;
}

export function isLLMConfigured(userId) {
  const settings = getSettings(userId, "text");
  return Boolean(settings.llm_api_url && settings.llm_model && settings.llm_api_key);
}

export function isVisionLLMConfigured(userId) {
  const settings = getSettings(userId, "vision");
  return Boolean(settings.llm_api_url && settings.llm_model && settings.llm_api_key);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function chatCompletionsUrl(url) {
  const trimmed = String(url || "").replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return trimmed;
}

function stripJsonFence(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

export function parseJsonObject(text, fallback = {}) {
  const cleaned = stripJsonFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    try {
      return JSON.parse(match[0]);
    } catch {
      return fallback;
    }
  }
}

function compactImageUrls(value, limit = 8) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, limit);
}

async function requestLLM(settings, { system, user, imageUrls = [], responseFormat = "json", temperature = 0.2, maxTokens }) {
  const timeoutMs = Number(settings.llm_timeout_ms || process.env.LLM_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const images = compactImageUrls(imageUrls);
  const model = settings.llm_model;
  const userContent = images.length
    ? [
        { type: "text", text: user },
        ...images.map((url) => ({ type: "image_url", image_url: { url } })),
      ]
    : user;
  try {
    const response = await fetchWithTimeout(chatCompletionsUrl(settings.llm_api_url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.llm_api_key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: responseFormat === "json" ? { type: "json_object" } : undefined,
      }),
    });

    const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
    if (!response.ok) {
      throw new AppError(response.status, "llm_request_failed", "LLM 请求失败。", body);
    }

    const content = body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.text ?? body?.output_text ?? "";
    if (responseFormat === "json") {
      return parseJsonObject(content, { raw: content });
    }
    return { text: content, raw: body };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new AppError(504, "llm_timeout", `LLM 请求超过 ${Math.round(timeoutMs / 1000)} 秒。`);
    }
    if (error instanceof AppError) throw error;
    throw new AppError(502, "llm_unavailable", "LLM 服务不可用。", { message: error.message });
  }
}

export async function callLLM({ userId, system, user, imageUrls = [], responseFormat = "json", temperature = 0.2, maxTokens }) {
  const settings = configuredSettings(userId, "text");
  return requestLLM(settings, { system, user, imageUrls, responseFormat, temperature, maxTokens });
}

export async function callVisionLLM({ userId, system, user, imageUrls = [], responseFormat = "json", temperature = 0.2, maxTokens }) {
  const settings = configuredSettings(userId, "vision");
  return requestLLM(settings, { system, user, imageUrls, responseFormat, temperature, maxTokens });
}

export async function callRoutedLLM({
  userId,
  system,
  user,
  imageUrls = [],
  responseFormat = "json",
  temperature = 0.2,
  maxTokens,
  visionSystem,
  visionUser,
  visionResponseFormat = "json",
}) {
  const images = compactImageUrls(imageUrls);
  if (!images.length) {
    return callLLM({ userId, system, user, responseFormat, temperature, maxTokens });
  }

  if (!isVisionLLMConfigured(userId)) {
    return callLLM({ userId, system, user, imageUrls: images, responseFormat, temperature, maxTokens });
  }

  const visionResult = await callVisionLLM({
    userId,
    system: visionSystem || system,
    user: visionUser || user,
    imageUrls: images,
    responseFormat: visionResponseFormat,
    temperature,
    maxTokens: Math.min(Number(maxTokens || 300), 400),
  });
  const visionText = visionResponseFormat === "json"
    ? JSON.stringify(visionResult, null, 2)
    : String(visionResult?.text || visionResult?.raw || "");
  const routedUser = `${user}\n\n视觉模型提取结果：\n${visionText}`;
  return callLLM({ userId, system, user: routedUser, responseFormat, temperature, maxTokens });
}

export async function testLLM(userId) {
  const result = await callLLM({
    userId,
    system: "你是连接测试助手，只返回 JSON。",
    user: '返回 {"ok":true,"message":"pong"}',
  });
  updateSettings(userId, { last_llm_test_at: new Date().toISOString() });
  return { ok: Boolean(result.ok ?? true), result };
}

export async function testVisionLLM(userId) {
  const result = await callVisionLLM({
    userId,
    system: "你是视觉连接测试助手，只返回 JSON。",
    user: '返回 {"ok":true,"message":"vision pong"}',
  });
  updateSettings(userId, { last_llm_vision_test_at: new Date().toISOString() });
  return { ok: Boolean(result.ok ?? true), result };
}
