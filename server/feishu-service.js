import { AppError } from "./ai-service.js";
import { listNews, markSynced, rawState, updateSettings } from "./repository.js";

const FEISHU_BASE = "https://open.feishu.cn/open-apis";
const FETCH_TIMEOUT_MS = 30000;
const LEGACY_USER_ID = "legacy-default";
const DEFAULT_FEEDBACK_BASE_TOKEN = "OeS5bT8kjalJnEs85Qgcs5jQnIg";
const DEFAULT_FEEDBACK_TABLE_ID = "tblfN7MErcVmepYF";
const FEEDBACK_TYPES = new Set(["Bug", "功能建议", "数据问题", "体验问题", "其他"]);

async function fetchWithTimeout(path, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${FEISHU_BASE}${path}`, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function settings(userId) {
  return rawState(userId)?.settings || {};
}

function mergedSettings(userId) {
  return {
    ...settings(LEGACY_USER_ID),
    ...settings(userId),
  };
}

function requireFeishuSettings(userId) {
  const s = settings(userId);
  const baseToken = s.feishu_base_token || s.feishu_table_token;
  if (!s.feishu_app_id || !s.feishu_app_secret || !baseToken) {
    throw new AppError(400, "feishu_not_configured", "飞书未配置完整，请填写 App ID、App Secret 和 Base Token。");
  }
  return { ...s, feishu_base_token: baseToken };
}

function requireFeedbackSettings(userId) {
  const userSettings = settings(userId);
  const ownerSettings = settings(LEGACY_USER_ID);
  const s = mergedSettings(userId);
  const appId = process.env.FEISHU_FEEDBACK_APP_ID ||
    userSettings.feishu_feedback_app_id ||
    ownerSettings.feishu_feedback_app_id ||
    userSettings.feishu_app_id ||
    ownerSettings.feishu_app_id ||
    process.env.FEISHU_APP_ID ||
    process.env.FEISHU_OAUTH_APP_ID;
  const appSecret = process.env.FEISHU_FEEDBACK_APP_SECRET ||
    userSettings.feishu_feedback_app_secret ||
    ownerSettings.feishu_feedback_app_secret ||
    userSettings.feishu_app_secret ||
    ownerSettings.feishu_app_secret ||
    process.env.FEISHU_APP_SECRET ||
    process.env.FEISHU_OAUTH_APP_SECRET;
  const baseToken = userSettings.feishu_feedback_base_token ||
    ownerSettings.feishu_feedback_base_token ||
    process.env.FEISHU_FEEDBACK_BASE_TOKEN ||
    DEFAULT_FEEDBACK_BASE_TOKEN ||
    userSettings.feishu_base_token ||
    ownerSettings.feishu_base_token ||
    userSettings.feishu_table_token ||
    ownerSettings.feishu_table_token;
  const tableId = userSettings.feishu_feedback_table_id ||
    ownerSettings.feishu_feedback_table_id ||
    process.env.FEISHU_FEEDBACK_TABLE_ID ||
    DEFAULT_FEEDBACK_TABLE_ID;
  if (!appId || !appSecret || !baseToken || !tableId) {
    throw new AppError(400, "feedback_not_configured", "反馈收件箱未配置完整，请检查飞书 App 和反馈表配置。");
  }
  return { ...s, feishu_app_id: appId, feishu_app_secret: appSecret, feishu_feedback_base_token: baseToken, feishu_feedback_table_id: tableId };
}

async function feishuFetch(path, options = {}) {
  const response = await fetchWithTimeout(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.code) {
    throw new AppError(response.status || 502, "feishu_request_failed", body.msg || "飞书请求失败。", body);
  }
  return body;
}

export async function getTenantAccessTokenForUser(userId) {
  const s = requireFeishuSettings(userId);
  return getTenantAccessTokenForSettings(s);
}

async function getTenantAccessTokenForSettings(s) {
  const body = await feishuFetch("/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: s.feishu_app_id,
      app_secret: s.feishu_app_secret,
    }),
  });
  return body.tenant_access_token;
}

export async function testFeishuForUser(userId) {
  const s = requireFeishuSettings(userId);
  const token = await getTenantAccessTokenForUser(userId);
  const body = await feishuFetch(`/bitable/v1/apps/${s.feishu_base_token}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  updateSettings(userId, { last_feishu_test_at: new Date().toISOString() });
  return { ok: true, tables: body.data?.items || [] };
}

export function syncableRecordsFor(kind, state, userId) {
  return (kind === "news" ? listNews(userId).filter((item) => item.type) : (state[kind] || []))
    .filter((item) => !item.sample);
}

function fieldValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

const syncConfig = {
  products: {
    tableSetting: "feishu_products_table_id",
    fields(item) {
      const p = item.platforms?.[0] || {};
      return {
        "商品名称": item.name,
        "品类": item.category,
        "状态": item.status,
        "标签": fieldValue(item.tags),
        "平台1": p.platform || "",
        "平台1链接": p.url || "",
        "平台1售价": p.price || "",
        "平台1成本": p.cost || "",
        "平台1评分": p.rating ?? "",
        "平台1评论数": p.reviews ?? "",
        "平台1月销": p.sales || "",
        "核心卖点": fieldValue(item.selling_points),
        "差评关键词": fieldValue(item.negative_keywords),
        "AI摘要": item.ai_summary || "",
        "本地ID": item.id,
      };
    },
  },
  demands: {
    tableSetting: "feishu_demands_table_id",
    fields(item) {
      return {
        "标题": item.title,
        "来源": item.source || item.source_platform || "",
        "来源链接": item.url || item.source_url || "",
        "摘要": item.summary || "",
        "创新类型": item.innovation || "",
        "使用场景": fieldValue(item.scenarios),
        "用户痛点": fieldValue(item.painpoints),
        "日期": item.date || "",
        "本地ID": item.id,
      };
    },
  },
  news: {
    tableSetting: "feishu_news_table_id",
    fields(item) {
      return {
        "标题": item.titleZh || item.original_title || "",
        "类型": item.type || "",
        "来源": item.source || "",
        "原文链接": item.original_url || "",
        "摘要": item.summary || "",
        "发布时间": item.published_at || item.date || "",
        "收藏": item.starred ? "是" : "否",
        "本地ID": item.id,
      };
    },
  },
};

async function createRecord({ token, baseToken, tableId, fields }) {
  const body = await feishuFetch(`/bitable/v1/apps/${baseToken}/tables/${tableId}/records`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  return body.data?.record?.record_id;
}

function cleanFeedbackText(value, limit) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function feedbackTitle(content) {
  const title = cleanFeedbackText(content, 36);
  return title || "用户反馈";
}

function loginMethodLabel(provider) {
  if (provider === "feishu") return "飞书 OAuth";
  if (provider === "visitor") return "访客/体验";
  return "账号密码";
}

function feedbackLinkValue(value) {
  const text = cleanFeedbackText(value, 1000);
  if (!text) return "";
  const link = /^https?:\/\//i.test(text) ? text : `https://loom.my1panelsite.xyz${text.startsWith("/") ? text : `/${text}`}`;
  return { link, text };
}

export function feedbackRecordFieldsFor(feedback = {}, user = {}, now = new Date()) {
  const type = FEEDBACK_TYPES.has(String(feedback.type || "")) ? String(feedback.type) : "其他";
  const content = cleanFeedbackText(feedback.content || feedback.description, 2000);
  const contact = cleanFeedbackText(feedback.contact, 200);
  const page = cleanFeedbackText(feedback.page || feedback.path || feedback.url, 1000);
  const authProvider = user.id === LEGACY_USER_ID ? "visitor" : String(user.auth_provider || "");
  return {
    "标题": feedbackTitle(content),
    "类型": type,
    "严重程度": type === "Bug" ? "影响使用" : "一般",
    "描述": content,
    "页面路径": feedbackLinkValue(page),
    "用户名称": cleanFeedbackText(user.name, 120),
    "用户ID": cleanFeedbackText(user.id, 120),
    "用户邮箱（如有）": cleanFeedbackText(user.email, 200),
    "联系方式": contact,
    "飞书 Open ID": cleanFeedbackText(user.feishu_open_id, 200),
    "飞书 Union ID": cleanFeedbackText(user.feishu_union_id, 200),
    "登录方式": loginMethodLabel(authProvider),
    "状态": "新反馈",
    "来源": "Web App",
    "提交时间": now.getTime(),
  };
}

export async function submitFeedbackToFeishu(userId, feedback = {}, user = {}) {
  const content = cleanFeedbackText(feedback.content || feedback.description, 2000);
  if (!content) {
    throw new AppError(400, "feedback_content_required", "请填写反馈内容。");
  }
  const s = requireFeedbackSettings(userId);
  const token = await getTenantAccessTokenForSettings(s);
  const fields = feedbackRecordFieldsFor({ ...feedback, content }, user);
  const recordId = await createRecord({
    token,
    baseToken: s.feishu_feedback_base_token,
    tableId: s.feishu_feedback_table_id,
    fields,
  });
  return { ok: true, record_id: recordId };
}

async function updateRecord({ token, baseToken, tableId, recordId, fields }) {
  await feishuFetch(`/bitable/v1/apps/${baseToken}/tables/${tableId}/records/${recordId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  return recordId;
}

export async function syncFeishuForUser(userId, { kinds = ["products", "demands", "news"] } = {}) {
  const s = requireFeishuSettings(userId);
  const token = await getTenantAccessTokenForUser(userId);
  const state = rawState(userId);
  const summary = {};

  for (const kind of kinds) {
    const config = syncConfig[kind];
    if (!config) continue;
    const tableId = s[config.tableSetting];
    if (!tableId) {
      summary[kind] = { created: 0, updated: 0, failed: 0, error: `${config.tableSetting} 未配置` };
      continue;
    }

    const synced = [];
    const result = { created: 0, updated: 0, failed: 0, errors: [] };
    const records = syncableRecordsFor(kind, state, userId);
    for (const item of records) {
      try {
        const fields = config.fields(item);
        const recordId = item.feishu_record_id
          ? await updateRecord({ token, baseToken: s.feishu_base_token, tableId, recordId: item.feishu_record_id, fields })
          : await createRecord({ token, baseToken: s.feishu_base_token, tableId, fields });
        result[item.feishu_record_id ? "updated" : "created"] += 1;
        synced.push({ local_id: item.id, record_id: recordId });
      } catch (error) {
        result.failed += 1;
        result.errors.push({ id: item.id, message: error.message });
      }
    }
    if (synced.length) markSynced(userId, kind, synced);
    summary[kind] = result;
  }

  return { ok: true, summary };
}
