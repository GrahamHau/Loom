import { AppError } from "./ai-service.js";
import { markSynced, rawState, updateSettings } from "./repository.js";

const FEISHU_BASE = "https://open.feishu.cn/open-apis";

function settings() {
  return rawState().settings || {};
}

function requireFeishuSettings() {
  const s = settings();
  const baseToken = s.feishu_base_token || s.feishu_table_token;
  if (!s.feishu_app_id || !s.feishu_app_secret || !baseToken) {
    throw new AppError(400, "feishu_not_configured", "飞书未配置完整，请填写 App ID、App Secret 和 Base Token。");
  }
  return { ...s, feishu_base_token: baseToken };
}

async function feishuFetch(path, options = {}) {
  const response = await fetch(`${FEISHU_BASE}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.code) {
    throw new AppError(response.status || 502, "feishu_request_failed", body.msg || "飞书请求失败。", body);
  }
  return body;
}

export async function getTenantAccessToken() {
  const s = requireFeishuSettings();
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

export async function testFeishu() {
  const s = requireFeishuSettings();
  const token = await getTenantAccessToken();
  const body = await feishuFetch(`/bitable/v1/apps/${s.feishu_base_token}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  updateSettings({ last_feishu_test_at: new Date().toISOString() });
  return { ok: true, tables: body.data?.items || [] };
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

async function updateRecord({ token, baseToken, tableId, recordId, fields }) {
  await feishuFetch(`/bitable/v1/apps/${baseToken}/tables/${tableId}/records/${recordId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  return recordId;
}

export async function syncFeishu({ kinds = ["products", "demands", "news"] } = {}) {
  const s = requireFeishuSettings();
  const token = await getTenantAccessToken();
  const state = rawState();
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
    for (const item of state[kind] || []) {
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
    if (synced.length) markSynced(kind, synced);
    summary[kind] = result;
  }

  return { ok: true, summary };
}
