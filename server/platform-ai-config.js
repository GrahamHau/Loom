import { db, readJson, writeJson, LEGACY_USER_ID } from "./db.js";

const CONFIG_KEY = "platform_ai_organize_config";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function uniqueList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => cleanText(item)).filter(Boolean)));
}

function activeUserIds() {
  return new Set(db.prepare(`
    SELECT id
    FROM users
    WHERE id <> ? AND status = 'active'
  `).all(LEGACY_USER_ID).map((row) => row.id));
}

function storedConfig() {
  const config = readJson(CONFIG_KEY, null) || {};
  return {
    enabled: Boolean(config.enabled),
    api_type: cleanText(config.api_type, "openai"),
    api_url: cleanText(config.api_url),
    model: cleanText(config.model),
    api_key: cleanText(config.api_key),
    allow_all_users: Boolean(config.allow_all_users),
    allowed_user_ids: uniqueList(config.allowed_user_ids),
    updated_at: cleanText(config.updated_at),
    updated_by: cleanText(config.updated_by),
  };
}

export function maskPlatformAiConfig(config = storedConfig()) {
  return {
    ...config,
    api_key: config.api_key ? "********" : "",
    configured: Boolean(config.api_url && config.model && config.api_key),
  };
}

export function getPlatformAiConfig({ includeSecret = false } = {}) {
  const config = storedConfig();
  return includeSecret ? config : maskPlatformAiConfig(config);
}

export function updatePlatformAiConfig(actorUser, input = {}) {
  const previous = storedConfig();
  const validUsers = activeUserIds();
  const apiKeyInput = input.api_key !== undefined ? cleanText(input.api_key) : previous.api_key;
  const allowedUserIds = input.allowed_user_ids === undefined
    ? previous.allowed_user_ids
    : uniqueList(input.allowed_user_ids).filter((id) => validUsers.has(id));
  const next = {
    enabled: input.enabled === undefined ? previous.enabled : Boolean(input.enabled),
    api_type: cleanText(input.api_type, previous.api_type || "openai"),
    api_url: cleanText(input.api_url, previous.api_url),
    model: cleanText(input.model, previous.model),
    api_key: apiKeyInput === "********" ? previous.api_key : apiKeyInput,
    allow_all_users: input.allow_all_users === undefined ? previous.allow_all_users : Boolean(input.allow_all_users),
    allowed_user_ids: allowedUserIds,
    updated_at: new Date().toISOString(),
    updated_by: actorUser?.id || "",
  };
  writeJson(CONFIG_KEY, next);
  return maskPlatformAiConfig(next);
}

export function isPlatformAiAllowedForUser(userId) {
  const config = storedConfig();
  if (!config.enabled || !config.api_url || !config.model || !config.api_key) return false;
  if (!userId || userId === LEGACY_USER_ID) return false;
  if (config.allow_all_users) return true;
  return config.allowed_user_ids.includes(userId);
}

export function platformAiSettingsForUser(userId) {
  if (!isPlatformAiAllowedForUser(userId)) return null;
  const config = storedConfig();
  return {
    llm_api_type: config.api_type || "openai",
    llm_api_url: config.api_url,
    llm_model: config.model,
    llm_api_key: config.api_key,
    __platform_ai_organize: true,
  };
}
