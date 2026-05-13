import { randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "./ai-service.js";

const FEISHU_BASE = "https://open.feishu.cn/open-apis";

function splitEnvList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getPasswordAuthConfig() {
  return {
    username: process.env.APP_USERNAME || "visitor",
    password: process.env.APP_PASSWORD || "password",
  };
}

export function validateAuthConfig() {
  if (process.env.NODE_ENV !== "production") return;
  const missing = [];
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "pm-copilot-dev-secret-change-me") {
    missing.push("SESSION_SECRET");
  }
  if (!process.env.APP_USERNAME || process.env.APP_USERNAME === "visitor") {
    missing.push("APP_USERNAME");
  }
  if (!process.env.APP_PASSWORD || process.env.APP_PASSWORD === "password") {
    missing.push("APP_PASSWORD");
  }
  if (missing.length) {
    throw new Error(`Production auth config is unsafe. Set non-default values for: ${missing.join(", ")}`);
  }
}

export function apiToken() {
  return randomBytes(24).toString("hex");
}

export function isValidApiToken(token, expectedToken) {
  const a = Buffer.from(String(token || ""));
  const b = Buffer.from(String(expectedToken || ""));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function getFeishuOauthConfig() {
  const appId = String(process.env.FEISHU_OAUTH_APP_ID || "").trim();
  const appSecret = String(process.env.FEISHU_OAUTH_APP_SECRET || "").trim();
  const redirectUri = String(process.env.FEISHU_OAUTH_REDIRECT_URI || "").trim();
  const allowedEmailDomains = splitEnvList(process.env.FEISHU_OAUTH_ALLOWED_EMAIL_DOMAINS)
    .map((item) => item.toLowerCase().replace(/^@/, ""));
  return {
    appId,
    appSecret,
    redirectUri,
    enabled: Boolean(appId && appSecret && redirectUri),
    autoProvision: process.env.FEISHU_OAUTH_AUTO_PROVISION !== "false",
    allowedOpenIds: splitEnvList(process.env.FEISHU_OAUTH_ALLOWED_OPEN_IDS),
    allowedUnionIds: splitEnvList(process.env.FEISHU_OAUTH_ALLOWED_UNION_IDS),
    allowedEmails: splitEnvList(process.env.FEISHU_OAUTH_ALLOWED_EMAILS).map((item) => item.toLowerCase()),
    allowedEmailDomains,
    allowedTenantKeys: splitEnvList(process.env.FEISHU_OAUTH_ALLOWED_TENANT_KEYS),
  };
}

export function requireFeishuOauthConfig() {
  const config = getFeishuOauthConfig();
  if (!config.enabled) {
    throw new AppError(400, "feishu_oauth_not_configured", "飞书登录尚未配置，请先补充 App ID、App Secret 和回调地址。");
  }
  return config;
}

export function createOauthState() {
  return randomBytes(16).toString("hex");
}

export function buildFeishuAuthUrl(state) {
  const config = requireFeishuOauthConfig();
  const params = new URLSearchParams({
    app_id: config.appId,
    redirect_uri: config.redirectUri,
    state,
  });
  return `https://open.feishu.cn/open-apis/authen/v1/index?${params.toString()}`;
}

async function feishuOauthFetch(path, options = {}) {
  const response = await fetch(`${FEISHU_BASE}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.code) {
    throw new AppError(response.status || 502, "feishu_oauth_failed", body.msg || body.message || "飞书登录请求失败。", body);
  }
  return body;
}

export async function getFeishuAppAccessToken() {
  const config = requireFeishuOauthConfig();
  const body = await feishuOauthFetch("/auth/v3/app_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
  });
  return body.app_access_token || body.data?.app_access_token || "";
}

export async function exchangeFeishuCode(code) {
  const config = requireFeishuOauthConfig();
  const appAccessToken = await getFeishuAppAccessToken();
  if (!appAccessToken) {
    throw new AppError(502, "feishu_app_access_token_missing", "飞书应用凭证换取失败，请检查 App ID 和 App Secret。");
  }
  let body;
  try {
    body = await feishuOauthFetch("/authen/v1/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appAccessToken}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
      }),
    });
  } catch (error) {
    if (error instanceof AppError && error.status < 500) {
      body = await feishuOauthFetch("/authen/v1/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          app_id: config.appId,
          app_secret: config.appSecret,
        }),
      });
    } else {
      throw error;
    }
  }
  return body.data || body;
}

export async function fetchFeishuUserInfo(userAccessToken) {
  const body = await feishuOauthFetch("/authen/v1/user_info", {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
  return body.data || body;
}

function hasConfiguredAllowList(config) {
  return config.allowedOpenIds.length > 0 ||
    config.allowedUnionIds.length > 0 ||
    config.allowedEmails.length > 0 ||
    config.allowedEmailDomains.length > 0 ||
    config.allowedTenantKeys.length > 0;
}

export function isFeishuUserAllowed(profile) {
  const config = requireFeishuOauthConfig();
  if (!hasConfiguredAllowList(config)) return true;
  if (config.allowedOpenIds.length > 0 && !config.allowedOpenIds.includes(String(profile.open_id || ""))) return false;
  if (config.allowedUnionIds.length > 0 && !config.allowedUnionIds.includes(String(profile.union_id || ""))) return false;
  if (config.allowedEmails.length > 0) {
    const emails = [profile.email, profile.enterprise_email].map((item) => String(item || "").toLowerCase()).filter(Boolean);
    if (!emails.some((item) => config.allowedEmails.includes(item))) return false;
  }
  if (config.allowedEmailDomains.length > 0) {
    const emails = [profile.email, profile.enterprise_email].map((item) => String(item || "").toLowerCase()).filter(Boolean);
    if (!emails.some((item) => {
      const domain = item.split("@")[1] || "";
      return config.allowedEmailDomains.includes(domain);
    })) return false;
  }
  if (config.allowedTenantKeys.length > 0 && !config.allowedTenantKeys.includes(String(profile.tenant_key || ""))) return false;
  return true;
}

function initialsFromName(name, fallback = "L") {
  const trimmed = String(name || "").trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/\s+/g, "").slice(0, 2).toUpperCase() || fallback;
}

export function buildSessionUser(baseUser, feishuProfile) {
  const name = String(feishuProfile.name || feishuProfile.en_name || baseUser?.name || "LOOM").trim();
  return {
    ...baseUser,
    name,
    email: feishuProfile.enterprise_email || feishuProfile.email || baseUser?.email || "",
    avatar_url: feishuProfile.avatar_url || baseUser?.avatar_url || "",
    initials: initialsFromName(name, baseUser?.initials || "L"),
    auth_provider: "feishu",
    feishu_open_id: feishuProfile.open_id || "",
    feishu_union_id: feishuProfile.union_id || "",
    feishu_tenant_key: feishuProfile.tenant_key || "",
  };
}
