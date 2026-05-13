import { rawState, updateSettings } from "./repository.js";

const DEFAULT_TIMEOUT_MS = 30000;

export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getSettings(userId) {
  const settings = rawState(userId)?.settings || {};
  return {
    ...settings,
    llm_api_url: settings.llm_api_url || process.env.LLM_API_URL || process.env.OPENAI_BASE_URL || "",
    llm_model: settings.llm_model || process.env.LLM_MODEL || process.env.OPENAI_MODEL || "",
    llm_api_key: settings.llm_api_key || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "",
  };
}

function configuredSettings(userId) {
  const settings = getSettings(userId);
  if (!settings.llm_api_url || !settings.llm_model || !settings.llm_api_key) {
    throw new AppError(400, "llm_not_configured", "LLM 未配置完整，请先在系统设置填写 API URL、模型和 API Key。");
  }
  return settings;
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

export async function callLLM({ userId, system, user, responseFormat = "json", temperature = 0.2, maxTokens }) {
  const settings = configuredSettings(userId);
  const timeoutMs = Number(settings.llm_timeout_ms || process.env.LLM_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(chatCompletionsUrl(settings.llm_api_url), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.llm_api_key}`,
      },
      body: JSON.stringify({
        model: settings.llm_model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
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
  } finally {
    clearTimeout(timeout);
  }
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
