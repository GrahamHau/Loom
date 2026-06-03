import { nanoid } from "nanoid";
import {
  acquireLock,
  db,
  ensureSampleUserState,
  ensureUserState,
  getLegacyUserId,
  getUserState,
  getUserIdByApiToken,
  releaseLock,
  revokeApiToken,
  revokeUserApiTokens,
  upsertApiToken,
  saveUserState,
  ensureCompanyAdminWorkspaceForUser,
  ensureFeishuWorkspaceForUser,
  companyWorkspaceDefaults,
  ensureWorkspace,
  addWorkspaceMember,
} from "./db.js";
import { ensureWorkspaceSampleDocuments } from "./sample-document-seed.js";
import { normalizeFields, normalizeSettingsFields } from "./field-config.js";
import { normalizeDemandInputTags, normalizeProductInputTags } from "./field-matcher.js";
import { isCrossSourceNewsStoryKey, isSpecificNewsStoryKey, withNewsDedupeKeys } from "./news-dedupe.js";
import { isOffDomainNoise } from "./news-domain-filter.js";
import { buildEmptyState } from "./seed.js";
import { DEFAULT_NEWS_SOURCES, isRecentSampleNews, isSampleWorkspace, sampleSourceId, SAMPLE_NEWS_MAX_AGE_HOURS, SAMPLE_NEWS_SOURCES } from "./sample-workspace.js";

const STREAM_NEWS_MAX_AGE_DAYS = Math.max(1, Number(process.env.STREAM_NEWS_MAX_AGE_DAYS || 10));
// 默认开启 visitor 示例数据；要在生产环境关掉，设 LOOM_ENABLE_PUBLIC_SAMPLE_DATA=false
const ENABLE_PUBLIC_SAMPLE_DATA = process.env.LOOM_ENABLE_PUBLIC_SAMPLE_DATA !== "false";
export const MOCK_SAMPLE_USERNAME = cleanText(process.env.LOOM_MOCK_SAMPLE_USERNAME || "mock", "mock");
export const MOCK_SAMPLE_PASSWORD = cleanText(process.env.LOOM_MOCK_SAMPLE_PASSWORD || "mock", "mock");
export const MOCK_SAMPLE_USER_ID = cleanText(process.env.LOOM_MOCK_SAMPLE_USER_ID || "password-mock", "password-mock");
const SAMPLE_SOURCE_USER_ID = cleanText(process.env.LOOM_SAMPLE_SOURCE_USER_ID || MOCK_SAMPLE_USER_ID);
const SAMPLE_SYNC_LIMITS = {
  products: Math.max(0, Number(process.env.LOOM_SAMPLE_PRODUCTS_LIMIT || 12)),
  demands: Math.max(0, Number(process.env.LOOM_SAMPLE_DEMANDS_LIMIT || 36)),
  research: Math.max(0, Number(process.env.LOOM_SAMPLE_RESEARCH_LIMIT || 6)),
  news: Math.max(0, Number(process.env.LOOM_SAMPLE_NEWS_LIMIT || 80)),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function cleanProductImage(value, fallback = "") {
  return cleanText(value, fallback);
}

function sampleSyncLimits(input = {}) {
  return Object.fromEntries(Object.entries({
    ...SAMPLE_SYNC_LIMITS,
    ...(input || {}),
  }).map(([key, value]) => [
    key,
    value === undefined || value === null || Number.isNaN(Number(value))
      ? SAMPLE_SYNC_LIMITS[key]
      : Math.max(0, Number(value)),
  ]));
}

function sampleCloneId(kind, id) {
  const safe = cleanText(id || nanoid(8), "item")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `sample-${kind}-${safe || nanoid(8)}`;
}

function toSampleEntity(kind, item, sourceUserId) {
  const copied = clone(item || {});
  delete copied.feishu_record_id;
  delete copied.synced_at;
  copied.id = sampleCloneId(kind, item?.id);
  copied.sample = true;
  copied.sample_source_user_id = sourceUserId;
  copied.sample_source_id = item?.id || "";
  copied.created_at = item?.created_at || nowIso();
  copied.updated_at = nowIso();
  return copied;
}

function toMockSeedEntity(item, sourceUserId) {
  const copied = clone(item || {});
  copied.sample = false;
  copied.mock_seed_source_user_id = sourceUserId;
  copied.mock_seed_source_id = item?.id || "";
  copied.updated_at = nowIso();
  return copied;
}

function sampleNewsInput(item, sourceUserId) {
  return {
    source_id: sampleSourceId("visitor", item.source_id || "sample-news"),
    source: item.source,
    source_authority: item.source_authority,
    original_title: item.original_title,
    original_url: item.original_url,
    original_content: item.original_content,
    titleZh: item.titleZh,
    summary: item.summary,
    contentZh: item.contentZh,
    type: item.type,
    thumbnail_url: item.thumbnail_url,
    thumbHue: item.thumbHue,
    published_at: item.published_at,
    llmProcessed: !item.needsTranslation,
    needsTranslation: false,
    classification: {
      ...(item.classification || {}),
      source_group: "sample-live",
      sample_source_user_id: sourceUserId,
      sample_source_news_id: item.id || "",
    },
  };
}

function mockSeedNewsInput(item, sourceUserId) {
  return {
    source_id: item.source_id,
    source: item.source,
    source_authority: item.source_authority,
    original_title: item.original_title,
    original_url: item.original_url,
    original_content: item.original_content,
    titleZh: item.titleZh,
    summary: item.summary,
    contentZh: item.contentZh,
    type: item.type,
    thumbnail_url: item.thumbnail_url,
    thumbHue: item.thumbHue,
    published_at: item.published_at,
    llmProcessed: !item.needsTranslation,
    needsTranslation: false,
    classification: {
      ...(item.classification || {}),
      mock_seed_source_user_id: sourceUserId,
      mock_seed_source_news_id: item.id || "",
    },
  };
}

function resolveProductImagePatch(item, patch) {
  const hasIncomingImage = patch.image !== undefined || patch.thumbnail_url !== undefined;
  if (!hasIncomingImage) return {};
  const manualOverride = patch.image_override === "manual";
  const incomingImage = cleanProductImage(
    patch.image !== undefined ? patch.image : patch.thumbnail_url,
    item.image || item.thumbnail_url || ""
  );
  const incomingThumbnail = cleanProductImage(
    patch.thumbnail_url !== undefined ? patch.thumbnail_url : patch.image,
    item.thumbnail_url || item.image || ""
  );
  const currentImage = cleanProductImage(item.image, "");
  const currentThumbnail = cleanProductImage(item.thumbnail_url, "");
  const hasExistingCover = Boolean(currentImage || currentThumbnail);
  if (manualOverride || !hasExistingCover) {
    return {
      image: incomingImage,
      thumbnail_url: incomingThumbnail,
    };
  }
  return {};
}

function hasIncomingImagePatch(patch = {}) {
  return patch.image !== undefined || patch.thumbnail_url !== undefined;
}

function imagePatchWithExistingFallback(item = {}, patch = {}) {
  if (!hasIncomingImagePatch(patch)) return {};
  const incomingImage = cleanText(
    patch.image !== undefined ? patch.image : patch.thumbnail_url,
    item.image || item.thumbnail_url || ""
  );
  const incomingThumbnail = cleanText(
    patch.thumbnail_url !== undefined ? patch.thumbnail_url : patch.image,
    item.thumbnail_url || item.image || ""
  );
  const currentImage = cleanText(item.image, "");
  const currentThumbnail = cleanText(item.thumbnail_url, "");
  const currentOriginal = cleanText(item.original_image_url, "");
  const incomingOriginal = cleanText(patch.original_image_url, "");
  const hasLocalCachedCover = /^\/uploads\/remote-media\//.test(currentImage) || /^\/uploads\/remote-media\//.test(currentThumbnail);
  const incomingIsRemote = /^https?:\/\//i.test(incomingImage) || /^https?:\/\//i.test(incomingThumbnail);
  if (hasLocalCachedCover && incomingIsRemote) {
    return {
      image: currentImage || currentThumbnail,
      thumbnail_url: currentThumbnail || currentImage,
      original_image_url: currentOriginal || incomingOriginal || incomingImage || incomingThumbnail,
    };
  }
  return {
    image: incomingImage,
    thumbnail_url: incomingThumbnail,
    original_image_url: incomingOriginal || currentOriginal,
  };
}

function userSummaryFromState(state, fallback = {}) {
  const source = state?.user || {};
  return {
    id: fallback.id || source.id || "",
    name: fallback.name || source.name || "LOOM",
    role: fallback.role || source.role || "成员",
    role_code: fallback.role_code || source.role_code || "member",
    initials: fallback.initials || source.initials || "L",
    email: fallback.email || source.email || "",
    auth_provider: fallback.auth_provider || source.auth_provider || "password",
  };
}

function newsCountsFrom(items) {
  const typed = items.filter((item) => item.type);
  return {
    all: typed.length,
    official: typed.filter((item) => isOfficialNewsItem(item)).length,
    new_product: typed.filter((item) => item.type === "新品发布").length,
    trend: typed.filter((item) => item.type === "行业趋势").length,
    starred: typed.filter((item) => item.starred).length,
  };
}

function onboardingMeta(state, news = []) {
  if (!isSampleWorkspace(state)) return state.onboarding || {};
  const userId = state?.user?.id || "";
  const sampleNews = news.filter((item) => isRecentSampleNews(item));
  const latestFetchedAt = (state.rssSources || [])
    .map((source) => source.last_fetched_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const latestNewsAt = sampleNews
    .map((item) => item.published_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  return {
    ...(state.onboarding || {}),
    sampleWorkspace: true,
    liveNews: true,
    visitorOnly: userId === getLegacyUserId(),
    canExitSample: userId !== getLegacyUserId(),
    newsMaxAgeHours: SAMPLE_NEWS_MAX_AGE_HOURS,
    latestFetchedAt,
    latestNewsAt,
    liveNewsReady: sampleNews.length > 0,
  };
}

function dateValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function configuredFeishuTables(settings = {}) {
  return [
    settings.feishu_products_table_id ? "products" : "",
    settings.feishu_demands_table_id ? "demands" : "",
    settings.feishu_news_table_id ? "news" : "",
  ].filter(Boolean);
}

function feishuProjectStatus(settings = {}, workspaceId = "") {
  const projectKey = cleanText(settings.feishu_project_default_project_key || settings.feishu_mcp_project_key);
  const projectName = cleanText(settings.feishu_project_default_project_name || settings.feishu_mcp_project_name);
  const tokenConfigured = Boolean(cleanText(settings.feishu_mcp_token));
  const endpointConfigured = Boolean(cleanText(settings.feishu_mcp_url) || tokenConfigured);
  const ideaTypeKey = cleanText(settings.feishu_project_idea_type_key);
  let itemsCount = 0;
  let lastSyncAt = cleanText(settings.last_feishu_project_mcp_sync_at || settings.last_feishu_project_mcp_test_at) || null;
  if (workspaceId && tableExists("feishu_project_items")) {
    const columns = tableColumns("feishu_project_items");
    const clauses = ["workspace_id = ?"];
    const params = [workspaceId];
    if (projectKey && columns.has("project_key")) {
      clauses.push("project_key = ?");
      params.push(projectKey);
    }
    const row = db.prepare(`
      SELECT COUNT(*) AS count, MAX(updated_at) AS last_sync_at
      FROM feishu_project_items
      WHERE ${clauses.join(" AND ")}
    `).get(...params);
    itemsCount = Number(row?.count || 0);
    lastSyncAt = row?.last_sync_at || lastSyncAt;
  }
  const configured = Boolean(tokenConfigured && projectKey);
  return {
    configured,
    connected: configured,
    source: "feishu_project",
    project_key: projectKey,
    project_name: projectName,
    token_configured: tokenConfigured,
    endpoint_configured: endpointConfigured,
    idea_type_configured: Boolean(ideaTypeKey),
    idea_type_key: ideaTypeKey,
    last_sync_at: lastSyncAt,
    items_count: itemsCount,
    needs_admin_config: !configured,
  };
}

function buildHotKeywords(demands = []) {
  const counts = new Map();
  for (const demand of demands) {
    const words = [
      ...cleanArray(demand.tags),
      ...cleanArray(demand.scenarios),
      ...cleanArray(demand.painpoints),
      demand.innovation,
    ];
    for (const raw of words) {
      const word = cleanText(String(raw || "").split(/[／/]/)[0]).trim();
      if (!word || word === "待分类") continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"))
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));
}

function demandStatusKey(status = "") {
  const value = String(status || "").toLowerCase();
  if (/暂停|暂缓|放弃|弃单|paused|drop|stop/.test(value)) return "paused";
  if (/立项|推进|进行|active|doing|progress/.test(value)) return "active";
  return "review";
}

function buildDashboard(state, news = []) {
  const settings = state.settings || {};
  const demands = state.demands || [];
  const research = state.research || [];
  const workspaceId = state.workspace?.workspace_id || state.workspace?.id || "";
  const tables = configuredFeishuTables(settings);
  const projectStatus = feishuProjectStatus(settings, workspaceId);
  const feishuConnected = Boolean(
    settings.feishu_app_id &&
    settings.feishu_base_token &&
    (settings.feishu_app_secret || settings.feishu_mcp_token) &&
    tables.length > 0
  );
  const lastSyncAt = [
    settings.last_feishu_test_at,
    ...demands.map((item) => item.synced_at),
    ...(state.products || []).map((item) => item.synced_at),
    ...news.map((item) => item.synced_at),
    projectStatus.last_sync_at,
  ].filter(Boolean).sort((a, b) => dateValue(b) - dateValue(a))[0] || null;
  const activeResearch = research
    .filter((item) => !["done", "archived", "已归档", "完成"].includes(String(item.status || "").toLowerCase()))
    .sort((a, b) => dateValue(b.updated_at || b.created_at) - dateValue(a.updated_at || a.created_at))
    .slice(0, 5);
  const recentDemands = demands
    .filter((item) => item.synced_at || item.updated_at || item.created_at || item.date)
    .sort((a, b) => dateValue(b.synced_at || b.updated_at || b.created_at || b.date) - dateValue(a.synced_at || a.updated_at || a.created_at || a.date))
    .slice(0, 6);
  const recentProjectItems = projectStatus.connected
    ? listFeishuProjectItems({
      workspace_id: workspaceId,
      project_key: projectStatus.project_key,
      limit: 6,
    })
    : [];
  const recentDecisions = projectStatus.connected ? recentProjectItems.map((item) => ({
    id: item.id,
    title: item.name,
    owner: (item.current_owners || []).map((owner) => owner.name || owner.user_name || owner.user_key).filter(Boolean).join("、") || state.user?.name || "PM",
    status: item.current_node_name || item.status_name || item.work_item_type_name || "更新",
    status_key: demandStatusKey(item.status_name || item.current_node_name),
    updated_at: item.updated_at || item.created_at,
  })) : feishuConnected ? recentDemands.map((item) => ({
    id: item.id,
    title: item.title,
    owner: item.owner || item.pm || state.user?.name || "PM",
    status: item.decision_status || item.status || item.innovation || "更新",
    status_key: demandStatusKey(item.decision_status || item.status || item.innovation),
    updated_at: item.synced_at || item.updated_at || item.created_at || item.date,
  })) : [];
  const abnormalItems = feishuConnected ? demands
    .filter((item) => /暂停|暂缓|卡|阻塞|blocked|paused/i.test([item.status, item.note, item.summary].filter(Boolean).join(" ")))
    .slice(0, 5)
    .map((item) => ({ id: item.id, title: item.title, reason: item.status || "需关注" }))
    : [];
  return {
    feishu_status: {
      connected: projectStatus.connected || feishuConnected,
      last_sync_at: lastSyncAt,
      configured_tables: tables,
      primary_source: projectStatus.connected ? "feishu_project" : (feishuConnected ? "bitable" : ""),
    },
    feishu_project_status: projectStatus,
    active_research: activeResearch,
    my_demands_count: demands.length,
    demands_scope_label: projectStatus.connected ? "飞书项目 · 工作项" : (feishuConnected ? "我的需求库" : "需求库 · 共追踪"),
    recent_decisions: recentDecisions,
    abnormal_items: abnormalItems,
    hot_keywords: buildHotKeywords(demands),
    action_summary: activeResearch.length ? `${activeResearch.length} 个调研进行中` : "",
  };
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email || "",
    name: row.name,
    initials: row.initials || "L",
    role: row.role || "成员",
    role_code: row.role_code || "member",
    status: row.status || "active",
    auth_provider: row.auth_provider || "password",
    feishu_open_id: row.feishu_open_id || null,
    feishu_union_id: row.feishu_union_id || null,
    feishu_tenant_key: row.feishu_tenant_key || null,
    avatar_url: row.avatar_url || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at || null,
  };
}

function listUserWorkspaces(userId) {
  if (!userId || userId === getLegacyUserId()) return [];
  return db.prepare(`
    SELECT
      w.id,
      w.slug,
      w.name,
      w.type,
      w.status,
      w.default_ai_policy,
      wm.role AS current_user_role,
      wm.status AS member_status,
      wm.is_default
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ? AND wm.status = 'active' AND w.status = 'active'
    ORDER BY wm.is_default DESC, w.name ASC
  `).all(userId).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type,
    status: row.status,
    default_ai_policy: row.default_ai_policy,
    current_user_role: row.current_user_role || "member",
    member_status: row.member_status || "active",
    is_default: Boolean(row.is_default),
  }));
}

function requireState(userId) {
  const state = getUserState(userId);
  if (state) return normalizeWorkspaceState(clone(state));
  const user = findUserById(userId);
  if (!user) return null;
  return normalizeWorkspaceState(clone(ensureUserState(user)));
}

function saveStateForUser(userId, state) {
  normalizeWorkspaceState(state);
  saveUserState(userId, state);
}

function mutateUserState(userId, mutator) {
  const current = requireState(userId) || buildEmptyState({ id: userId });
  const result = mutator(current);
  saveStateForUser(userId, current);
  return result;
}

function mapNewsRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    source_id: row.source_id,
    source: row.source_name,
    source_authority: row.source_authority,
    original_title: row.original_title,
    original_url: row.original_url,
    original_content: row.original_content || row.original_summary || "",
    published_at: row.published_at,
    date: String(row.published_at || "").slice(0, 10),
    time: "",
    thumbnail_url: row.thumbnail_url || "",
    thumbHue: row.thumb_hue ?? 40,
    type: row.type,
    titleZh: row.title_zh || row.original_title,
    summary: row.summary_zh || row.original_summary || "",
    contentZh: row.content_zh || "",
    needsTranslation: Boolean(row.needs_translation),
    classification: row.classification_json ? JSON.parse(row.classification_json) : null,
    starred: Boolean(row.is_starred),
    unread: !row.is_read,
    synced_at: row.synced_at,
    feishu_record_id: row.feishu_record_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapNewsSourceRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    url: row.url,
    type: row.type,
    adapter_type: row.adapter_type || row.type || "rss",
    adapter_config: row.adapter_config_json ? JSON.parse(row.adapter_config_json) : {},
    language: row.language || "",
    authority: row.authority || "watchlist",
    group: row.group_name || "custom",
    source_group: row.source_group || row.group_name || "custom",
    brand: row.brand || "",
    interval: row.fetch_interval,
    fetch_interval: row.fetch_interval,
    active: Boolean(row.is_active),
    is_active: Boolean(row.is_active),
    last_fetched_at: row.last_fetched_at,
    last_item_count: Number(row.last_item_count || 0),
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapFeedGroupRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    workspace_id: row.workspace_id || null,
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    color: row.color || "",
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapFeedDestinationRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    workspace_id: row.workspace_id || null,
    name: row.name,
    type: row.type,
    target: row.target || "",
    group_id: row.group_id || "",
    config: row.config_json ? JSON.parse(row.config_json) : {},
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapFeedExportRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    workspace_id: row.workspace_id || null,
    name: row.name,
    format: row.format,
    scope_type: row.scope_type,
    scope_id: row.scope_id,
    item_count: Number(row.item_count || 0),
    payload: row.payload_json ? JSON.parse(row.payload_json) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function ensureFeishuProjectUsersSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feishu_project_users (
      workspace_id TEXT NOT NULL,
      loom_user_id TEXT NOT NULL,
      project_key TEXT NOT NULL,
      meego_user_key TEXT NOT NULL,
      feishu_union_id TEXT,
      feishu_open_id TEXT,
      lark_user_id TEXT,
      name TEXT,
      email TEXT,
      avatar_url TEXT,
      source TEXT NOT NULL,
      last_verified_at TEXT,
      PRIMARY KEY (workspace_id, loom_user_id, project_key)
    );
  `);

  const columns = new Set(db.prepare("PRAGMA table_info(feishu_project_users)").all().map((column) => column.name));
  const optionalColumns = {
    feishu_union_id: "TEXT",
    feishu_open_id: "TEXT",
    lark_user_id: "TEXT",
    name: "TEXT",
    email: "TEXT",
    avatar_url: "TEXT",
    source: "TEXT NOT NULL DEFAULT 'manual'",
    last_verified_at: "TEXT",
  };
  for (const [name, definition] of Object.entries(optionalColumns)) {
    if (!columns.has(name)) {
      db.exec(`ALTER TABLE feishu_project_users ADD COLUMN ${name} ${definition};`);
    }
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_feishu_project_users_workspace_project ON feishu_project_users(workspace_id, project_key);");
}

function ensureFeishuProjectMirrorSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feishu_project_items (
      workspace_id TEXT NOT NULL,
      project_key TEXT NOT NULL,
      work_item_id TEXT NOT NULL,
      work_item_type_key TEXT NOT NULL,
      work_item_type_name TEXT,
      name TEXT,
      status_key TEXT,
      status_name TEXT,
      current_node_key TEXT,
      current_node_name TEXT,
      current_owners_json TEXT,
      role_members_json TEXT,
      created_by_json TEXT,
      updated_by_json TEXT,
      created_at TEXT,
      updated_at TEXT,
      source_url TEXT,
      raw_json TEXT,
      PRIMARY KEY (workspace_id, project_key, work_item_id)
    );

    CREATE TABLE IF NOT EXISTS feishu_project_fields (
      workspace_id TEXT NOT NULL,
      project_key TEXT NOT NULL,
      work_item_type_key TEXT NOT NULL,
      field_key TEXT NOT NULL,
      field_name TEXT,
      field_type TEXT,
      options_json TEXT,
      field_desc TEXT,
      updated_at TEXT,
      PRIMARY KEY (workspace_id, project_key, work_item_type_key, field_key)
    );

    CREATE TABLE IF NOT EXISTS feishu_project_item_fields (
      workspace_id TEXT NOT NULL,
      project_key TEXT NOT NULL,
      work_item_id TEXT NOT NULL,
      field_key TEXT NOT NULL,
      field_name TEXT,
      field_type TEXT,
      value_json TEXT,
      value_text TEXT,
      updated_at TEXT,
      PRIMARY KEY (workspace_id, project_key, work_item_id, field_key)
    );

    CREATE TABLE IF NOT EXISTS feishu_project_nodes (
      workspace_id TEXT NOT NULL,
      project_key TEXT NOT NULL,
      work_item_id TEXT NOT NULL,
      node_key TEXT NOT NULL,
      node_name TEXT,
      status TEXT,
      owners_json TEXT,
      role_assignees_json TEXT,
      participants_json TEXT,
      schedule_json TEXT,
      sub_tasks_json TEXT,
      form_items_json TEXT,
      raw_json TEXT,
      updated_at TEXT,
      PRIMARY KEY (workspace_id, project_key, work_item_id, node_key)
    );

    CREATE TABLE IF NOT EXISTS feishu_project_op_records (
      workspace_id TEXT NOT NULL,
      project_key TEXT NOT NULL,
      work_item_id TEXT NOT NULL,
      operation_time INTEGER NOT NULL,
      operation_type TEXT,
      operator_type TEXT,
      operator_key TEXT,
      module TEXT,
      contents_json TEXT,
      raw_json TEXT,
      PRIMARY KEY (workspace_id, project_key, work_item_id, operation_time, operation_type, module)
    );

    CREATE TABLE IF NOT EXISTS feishu_project_idea_links (
      workspace_id TEXT NOT NULL,
      project_key TEXT NOT NULL,
      work_item_id TEXT NOT NULL,
      research_id TEXT,
      link_status TEXT NOT NULL,
      imported_at TEXT,
      last_synced_at TEXT,
      PRIMARY KEY (workspace_id, project_key, work_item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_feishu_project_items_workspace_type
      ON feishu_project_items(workspace_id, work_item_type_key);
    CREATE INDEX IF NOT EXISTS idx_feishu_project_item_fields_item
      ON feishu_project_item_fields(workspace_id, project_key, work_item_id);
    CREATE INDEX IF NOT EXISTS idx_feishu_project_idea_links_research
      ON feishu_project_idea_links(workspace_id, research_id);
  `);
}

function cleanFeishuProjectUserMapping(input = {}) {
  const mapping = {
    workspace_id: cleanText(input.workspace_id || input.workspaceId).slice(0, 120),
    loom_user_id: cleanText(input.loom_user_id || input.loomUserId || input.user_id || input.userId).slice(0, 120),
    project_key: cleanText(input.project_key || input.projectKey).slice(0, 160),
    meego_user_key: cleanText(input.meego_user_key || input.meegoUserKey || input.user_key || input.userKey).slice(0, 160),
    feishu_union_id: cleanText(input.feishu_union_id || input.feishuUnionId || input.union_id).slice(0, 160),
    feishu_open_id: cleanText(input.feishu_open_id || input.feishuOpenId || input.open_id).slice(0, 160),
    lark_user_id: cleanText(input.lark_user_id || input.larkUserId).slice(0, 160),
    name: cleanText(input.name).slice(0, 160),
    email: cleanText(input.email).toLowerCase().slice(0, 254),
    avatar_url: cleanText(input.avatar_url || input.avatarUrl).slice(0, 1000),
    source: cleanText(input.source, "manual").slice(0, 80),
    last_verified_at: cleanText(input.last_verified_at || input.lastVerifiedAt, nowIso()).slice(0, 80),
  };
  if (!["manual", "mcp_current_user"].includes(mapping.source)) {
    mapping.source = "manual";
  }
  const missing = ["workspace_id", "loom_user_id", "project_key", "meego_user_key"].filter((key) => !mapping[key]);
  if (missing.length) {
    throw new Error(`feishu_project_user_mapping_missing_required:${missing.join(",")}`);
  }
  return mapping;
}

ensureFeishuProjectUsersSchema();
ensureFeishuProjectMirrorSchema();

function mapFeishuProjectUserRow(row) {
  if (!row) return null;
  return {
    workspace_id: row.workspace_id,
    loom_user_id: row.loom_user_id,
    project_key: row.project_key,
    meego_user_key: row.meego_user_key,
    feishu_union_id: row.feishu_union_id || "",
    feishu_open_id: row.feishu_open_id || "",
    lark_user_id: row.lark_user_id || "",
    name: row.name || "",
    email: row.email || "",
    avatar_url: row.avatar_url || "",
    source: row.source || "manual",
    last_verified_at: row.last_verified_at || null,
  };
}

function clampFetchInterval(value) {
  const interval = Number(value || 60);
  return Math.min(1440, Math.max(30, Number.isFinite(interval) ? interval : 60));
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text || text === "null" || text === "undefined") return fallback;
  return text;
}

function cleanJsonObject(value, fallback = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return JSON.parse(JSON.stringify(value));
}

function safeJsonStringify(value, fallback = {}) {
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(fallback);
    }
  }
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanFeishuProjectScope(input = {}) {
  const scope = {
    workspace_id: cleanText(input.workspace_id || input.workspaceId).slice(0, 120),
    project_key: cleanText(input.project_key || input.projectKey).slice(0, 160),
  };
  const missing = ["workspace_id", "project_key"].filter((key) => !scope[key]);
  if (missing.length) throw new Error(`feishu_project_scope_missing_required:${missing.join(",")}`);
  return scope;
}

function mapFeishuProjectItemRow(row, fields = []) {
  if (!row) return null;
  const fieldMap = {};
  for (const field of fields) {
    fieldMap[field.field_key] = mapFeishuProjectItemFieldRow(field);
  }
  return {
    workspace_id: row.workspace_id,
    project_key: row.project_key,
    work_item_id: row.work_item_id,
    work_item_type_key: row.work_item_type_key,
    work_item_type_name: row.work_item_type_name || "",
    name: row.name || "",
    status_key: row.status_key || "",
    status_name: row.status_name || "",
    current_node_key: row.current_node_key || "",
    current_node_name: row.current_node_name || "",
    current_owners: safeJsonParse(row.current_owners_json, []),
    role_members: safeJsonParse(row.role_members_json, []),
    created_by: safeJsonParse(row.created_by_json, {}),
    updated_by: safeJsonParse(row.updated_by_json, {}),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    source_url: row.source_url || "",
    raw: safeJsonParse(row.raw_json, {}),
    fields: fieldMap,
  };
}

function mapFeishuProjectFieldRow(row) {
  if (!row) return null;
  return {
    workspace_id: row.workspace_id,
    project_key: row.project_key,
    work_item_type_key: row.work_item_type_key,
    field_key: row.field_key,
    field_name: row.field_name || "",
    field_type: row.field_type || "",
    options: safeJsonParse(row.options_json, []),
    field_desc: row.field_desc || "",
    updated_at: row.updated_at || null,
  };
}

function mapFeishuProjectItemFieldRow(row) {
  if (!row) return null;
  return {
    workspace_id: row.workspace_id,
    project_key: row.project_key,
    work_item_id: row.work_item_id,
    field_key: row.field_key,
    field_name: row.field_name || "",
    field_type: row.field_type || "",
    value: safeJsonParse(row.value_json, {}),
    value_text: row.value_text || "",
    updated_at: row.updated_at || null,
  };
}

function mapFeishuProjectIdeaLinkRow(row) {
  if (!row) return null;
  return {
    workspace_id: row.workspace_id,
    project_key: row.project_key,
    work_item_id: row.work_item_id,
    research_id: row.research_id || "",
    link_status: row.link_status || "imported",
    imported_at: row.imported_at || null,
    last_synced_at: row.last_synced_at || null,
  };
}

function slugifyFeedName(value, fallback = "group") {
  const slug = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function cleanTitle(value, fallback) {
  return cleanText(value, fallback).slice(0, 120);
}

function cleanSummary(value, fallback = "") {
  return cleanText(value, fallback).slice(0, 800);
}

function cleanArray(value, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item)).filter(Boolean).slice(0, limit);
}

function cleanEvidenceStatus(value, fallback = "legacy") {
  const status = cleanText(value, fallback);
  return ["legacy", "current", "needs_review"].includes(status) ? status : fallback;
}

function splitTokenText(value) {
  return cleanText(value)
    .split(/\s*(?:\/|,|，|、|\|)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanTagValues(value, limit = 50) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, list] of Object.entries(value)) {
    const cleanKey = cleanText(key).replace(/[^a-zA-Z0-9_:-]+/g, "_").slice(0, 80);
    if (!cleanKey) continue;
    out[cleanKey] = cleanArray(Array.isArray(list) ? list : [list], limit);
  }
  return out;
}

function productTagValues(input = {}) {
  const tagValues = cleanTagValues(input.tag_values);
  if (input.brand !== undefined && !tagValues.brand) tagValues.brand = splitTokenText(input.brand);
  if (input.host !== undefined && !tagValues.host) tagValues.host = splitTokenText(input.host);
  if (input.category !== undefined && !tagValues.category) tagValues.category = splitTokenText(input.category);
  if (input.tags !== undefined && !tagValues.custom_tags) tagValues.custom_tags = cleanArray(input.tags);
  return tagValues;
}

function demandTagValues(input = {}) {
  const tagValues = cleanTagValues(input.tag_values);
  if (input.innovation !== undefined && !tagValues.innovation) tagValues.innovation = [cleanTitle(input.innovation, "")].filter(Boolean);
  if (input.scenarios !== undefined && !tagValues.scenarios) tagValues.scenarios = cleanArray(input.scenarios);
  if (input.painpoints !== undefined && !tagValues.painpoints) tagValues.painpoints = cleanArray(input.painpoints);
  if (input.tags !== undefined && !tagValues.custom_tags) tagValues.custom_tags = cleanArray(input.tags);
  return tagValues;
}

function fieldSchemaForState(state) {
  return normalizeFields(state?.settings?.fields, state?.settings?.tag_groups, { includeDefaults: true });
}

function productTagValuesForState(state, input = {}) {
  return cleanTagValues(normalizeProductInputTags(input, fieldSchemaForState(state)));
}

function demandTagValuesForState(state, input = {}) {
  return cleanTagValues(normalizeDemandInputTags(input, fieldSchemaForState(state)));
}

function syncLegacyProductFields(item) {
  const values = cleanTagValues(item.tag_values);
  item.tag_values = values;
  item.evidence_status = cleanEvidenceStatus(item.evidence_status);
  item.brand = (values.brand || splitTokenText(item.brand)).join(" / ");
  item.host = (values.host || splitTokenText(item.host)).join(" / ");
  item.category = (values.category || splitTokenText(item.category)).join(" / ") || item.category || "未分类";
  item.tags = values.custom_tags || cleanArray(item.tags);
  item.comments = Number(item.comments || 0);
  item.visible_comments = cleanVisibleComments(item.visible_comments);
  return item;
}

function syncLegacyDemandFields(item) {
  const values = cleanTagValues(item.tag_values);
  item.tag_values = values;
  item.evidence_status = cleanEvidenceStatus(item.evidence_status);
  item.innovation = (values.innovation || [item.innovation].filter(Boolean))[0] || "待分类";
  item.scenarios = values.scenarios || cleanArray(item.scenarios);
  item.painpoints = values.painpoints || cleanArray(item.painpoints);
  item.tags = values.custom_tags || cleanArray(item.tags);
  return item;
}

function normalizeWorkspaceState(state) {
  if (!state) return state;
  state.settings = normalizeSettingsFields(state.settings || {});
  state.products = (state.products || []).map(syncLegacyProductFields);
  state.demands = (state.demands || []).map(syncLegacyDemandFields);
  return state;
}

function cleanVisibleComments(value, limit = 80) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object") return null;
    const content = cleanText(item.content).slice(0, 600);
    if (!content) return null;
    return {
      id: cleanText(item.id).slice(0, 120),
      user_id: cleanText(item.user_id).slice(0, 120),
      user_name: cleanText(item.user_name || item.username || item.author).slice(0, 120),
      content,
      like_count: Number(item.like_count || item.likes || 0),
      posted_at_text: cleanText(item.posted_at_text || item.time || item.date).slice(0, 120),
      location: cleanText(item.location).slice(0, 60),
      is_reply: Boolean(item.is_reply),
      ...(item.ai_processed || item.__loom_ai_processed ? { ai_processed: true } : {}),
    };
  }).filter(Boolean).slice(0, limit);
}

function cleanPlatformArray(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).map((platform, index) => ({
    id: cleanText(platform?.id, nanoid(8)),
    platform: cleanText(platform?.platform, "unknown"),
    url: cleanText(platform?.url || platform?.source_url),
    price: cleanText(platform?.price),
    original_price: cleanText(platform?.original_price),
    discount_price: cleanText(platform?.discount_price),
    cost: cleanText(platform?.cost),
    creator: cleanText(platform?.creator),
    pledged_amount: cleanText(platform?.pledged_amount),
    goal_amount: cleanText(platform?.goal_amount),
    backers: cleanText(platform?.backers),
    rating: platform?.rating ?? null,
    reviews: platform?.reviews ?? 0,
    sales: cleanText(platform?.sales),
    fetched_at: cleanText(platform?.fetched_at, nowIso()),
    order: index,
  }));
}

function cleanRecordList(value) {
  return cleanArray(value, 20);
}

function parseIsoTime(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function parseJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function appendUniqueText(list, value, limit = 5) {
  const next = cleanText(value);
  const current = Array.isArray(list) ? list.map((item) => cleanText(item)).filter(Boolean) : [];
  return Array.from(new Set([...current, next].filter(Boolean))).slice(-limit);
}

function streamWindowStartIso() {
  const date = new Date(Date.now() - STREAM_NEWS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function isWechatNewsRecord(record = {}, classification = undefined) {
  const meta = classification || record.classification || parseJsonObject(record.classification_json);
  return String(meta.source_type || "").toLowerCase().includes("wechat") ||
    String(meta.source_group || "").toLowerCase() === "wechat-exporter" ||
    String(record.original_url || "").includes("mp.weixin.qq.com") ||
    String(record.source || record.source_name || "").includes("公众号");
}

function isOfficialSourceGroup(value) {
  const group = String(value || "").toLowerCase();
  return group === "official-default" || group === "sample-live" || group === "wechat-exporter" || group === "official-google-news";
}

function isOfficialSourceLike(source = {}) {
  return isOfficialSourceGroup(source.source_group || source.group);
}

export function isOfficialNewsItem(item = {}) {
  return isOfficialSourceGroup(item?.classification?.source_group) ||
    String(item?.source_id || "").startsWith("default-news-") ||
    String(item?.source_id || "").startsWith("sample-news-");
}

export function maskSettings(settings) {
  const masked = { ...settings };
  if (masked.llm_api_key) masked.llm_api_key = "********";
  if (masked.llm_vision_api_key) masked.llm_vision_api_key = "********";
  if (masked.search_api_key) masked.search_api_key = "********";
  if (masked.search_tavily_api_key) masked.search_tavily_api_key = "********";
  if (masked.search_serpapi_api_key) masked.search_serpapi_api_key = "********";
  if (masked.feishu_app_secret) masked.feishu_app_secret = "********";
  if (masked.feishu_mcp_token) masked.feishu_mcp_token = "********";
  return masked;
}

export function ensureLocalUser(input = {}) {
  const user = {
    id: input.id || nanoid(12),
    email: cleanText(input.email),
    name: cleanTitle(input.name, "LOOM"),
    initials: cleanText(input.initials || String(input.name || "L").trim().replace(/\s+/g, "").slice(0, 2).toUpperCase(), "L").slice(0, 2).toUpperCase(),
    role: cleanTitle(input.role, "成员"),
    role_code: ["owner", "admin", "member"].includes(input.role_code) ? input.role_code : "member",
    status: cleanText(input.status, "active"),
    auth_provider: cleanText(input.auth_provider, "password"),
    feishu_open_id: input.feishu_open_id || null,
    feishu_union_id: input.feishu_union_id || null,
    feishu_tenant_key: input.feishu_tenant_key || null,
    avatar_url: cleanText(input.avatar_url),
    created_at: input.created_at || nowIso(),
    updated_at: nowIso(),
    last_login_at: input.last_login_at || null,
  };
  db.prepare(`
    INSERT INTO users (
      id, email, name, initials, role, role_code, status, auth_provider,
      feishu_open_id, feishu_union_id, feishu_tenant_key, avatar_url,
      created_at, updated_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      initials = excluded.initials,
      role = excluded.role,
      role_code = excluded.role_code,
      status = excluded.status,
      auth_provider = excluded.auth_provider,
      feishu_open_id = COALESCE(excluded.feishu_open_id, users.feishu_open_id),
      feishu_union_id = COALESCE(excluded.feishu_union_id, users.feishu_union_id),
      feishu_tenant_key = COALESCE(excluded.feishu_tenant_key, users.feishu_tenant_key),
      avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
      updated_at = excluded.updated_at,
      last_login_at = COALESCE(excluded.last_login_at, users.last_login_at)
  `).run(
    user.id, user.email, user.name, user.initials, user.role, user.role_code, user.status, user.auth_provider,
    user.feishu_open_id, user.feishu_union_id, user.feishu_tenant_key, user.avatar_url,
    user.created_at, user.updated_at, user.last_login_at
  );
  const saved = findUserById(user.id);
  if (["owner", "admin"].includes(saved.role_code)) {
    ensureCompanyAdminWorkspaceForUser(saved);
  }
  if (saved.auth_provider === "feishu") {
    ensureFeishuWorkspaceForUser(saved);
  }
  if (input.withDefaultWorkspace) {
    ensureDefaultWorkspaceForUser(saved, { autoAssign: true });
  }
  if (input.withSampleWorkspace) {
    ensureSampleUserState(saved);
  } else {
    ensureUserState(saved);
  }
  return saved;
}

export function ensureDefaultWorkspaceForUser(user, options = {}) {
  if (!user || user.id === getLegacyUserId()) return null;
  const current = db.prepare(`
    SELECT wm.*, w.slug, w.name
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ? AND wm.status = 'active' AND w.status = 'active'
    ORDER BY wm.is_default DESC, w.name ASC
    LIMIT 1
  `).get(user.id);
  if (current) return current;
  if (options.autoAssign !== true && user.auth_provider !== "feishu" && !["owner", "admin"].includes(user.role_code)) return null;
  const workspace = ensureWorkspace(companyWorkspaceDefaults());
  return addWorkspaceMember(workspace.id, user.id, {
    role: ["owner", "admin"].includes(user.role_code) ? "admin" : "member",
    status: "active",
    isDefault: true,
  });
}

export function findUserById(userId) {
  return mapUserRow(db.prepare("SELECT * FROM users WHERE id = ?").get(userId));
}

export function findUserByEmail(email) {
  const normalized = cleanText(email).toLowerCase();
  if (!normalized) return null;
  return mapUserRow(db.prepare("SELECT * FROM users WHERE lower(email) = ? LIMIT 1").get(normalized));
}

export function findUserByFeishuProfile(profile) {
  return mapUserRow(db.prepare(`
    SELECT *
    FROM users
    WHERE (feishu_open_id = ? AND ? <> '')
       OR (feishu_union_id = ? AND ? <> '')
    LIMIT 1
  `).get(
    String(profile.open_id || ""),
    String(profile.open_id || ""),
    String(profile.union_id || ""),
    String(profile.union_id || "")
  ));
}

export function touchUserLogin(userId) {
  const current = findUserById(userId);
  if (!current) return null;
  db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), userId);
  return findUserById(userId);
}

export function listAllUsers() {
  return db.prepare("SELECT * FROM users ORDER BY created_at ASC").all().map(mapUserRow);
}

function isVisibleNewsItem(item) {
  if (!item) return false;
  const publishedAt = parseIsoTime(item.published_at || item.date);
  if (publishedAt && Date.now() - publishedAt > STREAM_NEWS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return false;
  if (isOffDomainNoise(
    item.titleZh || item.original_title || "",
    `${item.summary || ""} ${item.contentZh || item.original_content || ""}`,
  )) return false;
  const sourceId = String(item.source_id || "");
  if (item.is_kept === 0) return false;
  if (sourceId.startsWith("sample-news-")) return Boolean(item.type);
  if (!item.type) return false;
  if (/filtered|scrubbed|off_domain|promotional/.test(item.classification?.reason || "")) return false;
  if (item.needsTranslation) return false;
  if (item.contentZh === "" && item.summary === "" && item.titleZh === item.original_title) return false;
  return true;
}

export function visibleNewsItems(userId) {
  const state = requireState(userId);
  if (!state) return [];
  const officialEnabled = state?.settings?.official_news_enabled !== false;
  const visible = listNews(userId).filter((item) => {
    if (!isVisibleNewsItem(item)) return false;
    if (!officialEnabled && isOfficialNewsItem(item)) return false;
    return true;
  });
  return isSampleWorkspace(state) ? visible.filter((item) => isRecentSampleNews(item)) : visible;
}

export function bootstrap(userId) {
  const state = requireState(userId);
  if (!state) return null;
  const workspaces = listUserWorkspaces(userId);
  const workspaceId = workspaces[0]?.workspace_id || "";
  if (workspaceId && !isSampleWorkspace(state)) {
    ensureWorkspaceSampleDocuments(workspaceId);
  }
  const news = visibleNewsItems(userId);
  state.news = news.slice(0, 30);
  state.newsCounts = newsCountsFrom(news);
  state.rssSources = listNewsSources(userId).filter((source) => !isOfficialSourceLike(source));
  state.officialRssSources = listNewsSources(getLegacyUserId()).filter((source) => isOfficialSourceLike(source));
  state.onboarding = onboardingMeta(state, news);
  state.user = userSummaryFromState(state, findUserById(userId) || { id: userId });
  state.workspaces = workspaces;
  state.workspace = workspaces[0] || null;
  state.dashboard = buildDashboard(state, news);
  if (state.settings) {
    const llmConfigured = Boolean(state.settings.llm_api_url && state.settings.llm_model && state.settings.llm_api_key);
    const llmVisionConfigured = Boolean(state.settings.llm_vision_api_url && state.settings.llm_vision_model && state.settings.llm_vision_api_key);
    state.settings = normalizeSettingsFields(state.settings);
    state.settings = maskSettings(state.settings);
    state.settings.llm_configured = llmConfigured;
    state.settings.llm_vision_configured = llmVisionConfigured;
  }
  return state;
}

export function getFeishuProjectStatus(userId, workspaceId = "") {
  const state = requireState(userId);
  if (!state) return null;
  const workspaces = listUserWorkspaces(userId);
  const resolvedWorkspaceId = cleanText(workspaceId) || workspaces[0]?.workspace_id || "";
  return feishuProjectStatus(state.settings || {}, resolvedWorkspaceId);
}

export function rawState(userId) {
  const state = requireState(userId);
  if (!state) return null;
  state.user = userSummaryFromState(state, findUserById(userId) || { id: userId });
  if (state.settings) {
    state.settings = normalizeSettingsFields(state.settings);
  }
  return state;
}

export function resetRegularUsersToSampleWorkspace() {
  const legacyUserId = getLegacyUserId();
  const sampleNewsSeed = visibleNewsItems(legacyUserId).map((item) => ({
    source_id: item.source_id,
    source: item.source,
    source_authority: item.source_authority,
    original_title: item.original_title,
    original_url: item.original_url,
    original_content: item.original_content,
    titleZh: item.titleZh,
    summary: item.summary,
    contentZh: item.contentZh,
    type: item.type,
    thumbnail_url: item.thumbnail_url,
    thumbHue: item.thumbHue,
    published_at: item.published_at,
    llmProcessed: true,
    needsTranslation: false,
    classification: item.classification,
  }));
  const users = listAllUsers().filter((user) => user.id !== legacyUserId);
  const reset = [];
  for (const user of users) {
    ensureSampleUserState(user, { force: true });
    db.prepare("DELETE FROM news_items WHERE user_id = ?").run(user.id);
    db.prepare("DELETE FROM news_sources WHERE user_id = ? AND COALESCE(source_group, group_name, '') NOT IN ('official-default', 'sample-live', 'wechat-exporter')").run(user.id);
    if (sampleNewsSeed.length) upsertNews(user.id, sampleNewsSeed);
    reset.push(user.id);
  }
  return { reset };
}

export function syncSampleWorkspaceFromUser({
  sourceUserId = SAMPLE_SOURCE_USER_ID,
  targetUserId = getLegacyUserId(),
  limits = {},
  replace = true,
} = {}) {
  const normalizedSourceUserId = cleanText(sourceUserId);
  const normalizedTargetUserId = cleanText(targetUserId, getLegacyUserId());
  if (!normalizedSourceUserId) {
    return { skipped: true, reason: "sample_source_user_id_missing" };
  }
  if (normalizedSourceUserId === normalizedTargetUserId) {
    return { skipped: true, reason: "sample_source_is_target" };
  }
  const sourceState = requireState(normalizedSourceUserId);
  const targetState = requireState(normalizedTargetUserId);
  if (!sourceState) return { skipped: true, reason: "sample_source_user_not_found", sourceUserId: normalizedSourceUserId };
  if (!targetState) return { skipped: true, reason: "sample_target_user_not_found", targetUserId: normalizedTargetUserId };

  const finalLimits = sampleSyncLimits(limits);
  const sourceProducts = (sourceState.products || []).filter((item) => !item.sample).slice(0, finalLimits.products);
  const sourceDemands = (sourceState.demands || []).filter((item) => !item.sample).slice(0, finalLimits.demands);
  const sourceResearch = (sourceState.research || []).filter((item) => !item.sample).slice(0, finalLimits.research);
  const sourceNews = visibleNewsItems(normalizedSourceUserId).slice(0, finalLimits.news);
  if (!sourceProducts.length && !sourceDemands.length && !sourceResearch.length && !sourceNews.length) {
    return {
      skipped: true,
      reason: "sample_source_has_no_data",
      sourceUserId: normalizedSourceUserId,
      targetUserId: normalizedTargetUserId,
    };
  }

  mutateUserState(normalizedTargetUserId, (state) => {
    state.onboarding = {
      ...(state.onboarding || {}),
      sampleWorkspace: true,
      sampleVersion: `source-user-${normalizedSourceUserId}`,
      label: "体验工作区",
      liveNews: sourceNews.length > 0,
      sampleSourceUserId: normalizedSourceUserId,
      sampleSourceUserName: sourceState.user?.name || "",
      synced_at: nowIso(),
    };
    if (replace) {
      state.products = (state.products || []).filter((item) => !item.sample);
      state.demands = (state.demands || []).filter((item) => !item.sample);
      state.research = (state.research || []).filter((item) => !item.sample);
    }
    const existingProductIds = new Set((state.products || []).map((item) => item.id));
    const existingDemandIds = new Set((state.demands || []).map((item) => item.id));
    const existingResearchIds = new Set((state.research || []).map((item) => item.id));
    state.products = [
      ...sourceProducts.map((item) => toSampleEntity("product", item, normalizedSourceUserId)).filter((item) => !existingProductIds.has(item.id)),
      ...(state.products || []),
    ];
    state.demands = [
      ...sourceDemands.map((item) => toSampleEntity("demand", item, normalizedSourceUserId)).filter((item) => !existingDemandIds.has(item.id)),
      ...(state.demands || []),
    ];
    state.research = [
      ...sourceResearch.map((item) => toSampleEntity("research", item, normalizedSourceUserId)).filter((item) => !existingResearchIds.has(item.id)),
      ...(state.research || []),
    ];
    return state;
  });

  if (replace) {
    db.prepare(`
      DELETE FROM news_items
      WHERE user_id = ?
        AND COALESCE(json_extract(classification_json, '$.source_group'), '') = 'sample-live'
    `).run(normalizedTargetUserId);
  }
  const newsResult = sourceNews.length
    ? upsertNews(normalizedTargetUserId, sourceNews.map((item) => sampleNewsInput(item, normalizedSourceUserId)))
    : { inserted: [], updated: [] };

  return {
    skipped: false,
    sourceUserId: normalizedSourceUserId,
    targetUserId: normalizedTargetUserId,
    products: sourceProducts.length,
    demands: sourceDemands.length,
    research: sourceResearch.length,
    news: sourceNews.length,
    insertedNews: newsResult.inserted.length,
    updatedNews: newsResult.updated.length,
  };
}

export function ensureMockSampleUser() {
  const user = ensureLocalUser({
    id: MOCK_SAMPLE_USER_ID,
    name: MOCK_SAMPLE_USERNAME,
    initials: "MO",
    role: "成员",
    role_code: "member",
    status: "active",
    auth_provider: "password",
    withDefaultWorkspace: true,
  });
  ensureDefaultWorkspaceForUser(user, { autoAssign: true });
  return user;
}

export function isSampleSourceUser(userId) {
  return cleanText(userId) === cleanText(SAMPLE_SOURCE_USER_ID);
}

export function syncVisitorSampleWorkspaceFromSource() {
  return syncSampleWorkspaceFromUser({ sourceUserId: SAMPLE_SOURCE_USER_ID, targetUserId: getLegacyUserId() });
}

export function seedMockSampleUserFromUser({
  sourceUserId,
  targetUserId = MOCK_SAMPLE_USER_ID,
  limits = {},
  replace = true,
  syncVisitor = true,
} = {}) {
  const normalizedSourceUserId = cleanText(sourceUserId);
  const normalizedTargetUserId = cleanText(targetUserId, MOCK_SAMPLE_USER_ID);
  if (!normalizedSourceUserId) return { skipped: true, reason: "mock_seed_source_user_id_missing" };
  if (normalizedSourceUserId === normalizedTargetUserId) return { skipped: true, reason: "mock_seed_source_is_target" };
  const sourceState = requireState(normalizedSourceUserId);
  if (!sourceState) return { skipped: true, reason: "mock_seed_source_user_not_found", sourceUserId: normalizedSourceUserId };

  const targetUser = normalizedTargetUserId === MOCK_SAMPLE_USER_ID
    ? ensureMockSampleUser()
    : findUserById(normalizedTargetUserId);
  if (!targetUser) return { skipped: true, reason: "mock_seed_target_user_not_found", targetUserId: normalizedTargetUserId };

  const finalLimits = sampleSyncLimits(limits);
  const sourceProducts = (sourceState.products || []).filter((item) => !item.sample).slice(0, finalLimits.products);
  const sourceDemands = (sourceState.demands || []).filter((item) => !item.sample).slice(0, finalLimits.demands);
  const sourceResearch = (sourceState.research || []).filter((item) => !item.sample).slice(0, finalLimits.research);
  const sourceNews = visibleNewsItems(normalizedSourceUserId).slice(0, finalLimits.news);

  mutateUserState(normalizedTargetUserId, (state) => {
    state.onboarding = {
      ...(state.onboarding || {}),
      mockSeedSourceUserId: normalizedSourceUserId,
      mockSeedSourceUserName: sourceState.user?.name || "",
      mockSeedSyncedAt: nowIso(),
    };
    if (replace) {
      state.products = [];
      state.demands = [];
      state.research = [];
    }
    state.products = [
      ...sourceProducts.map((item) => toMockSeedEntity(item, normalizedSourceUserId)),
      ...(replace ? [] : (state.products || [])),
    ];
    state.demands = [
      ...sourceDemands.map((item) => toMockSeedEntity(item, normalizedSourceUserId)),
      ...(replace ? [] : (state.demands || [])),
    ];
    state.research = [
      ...sourceResearch.map((item) => toMockSeedEntity(item, normalizedSourceUserId)),
      ...(replace ? [] : (state.research || [])),
    ];
    return state;
  });

  if (replace) db.prepare("DELETE FROM news_items WHERE user_id = ?").run(normalizedTargetUserId);
  const newsResult = sourceNews.length
    ? upsertNews(normalizedTargetUserId, sourceNews.map((item) => mockSeedNewsInput(item, normalizedSourceUserId)))
    : { inserted: [], updated: [] };
  const visitorResult = syncVisitor ? syncVisitorSampleWorkspaceFromSource() : null;

  return {
    skipped: false,
    sourceUserId: normalizedSourceUserId,
    targetUserId: normalizedTargetUserId,
    products: sourceProducts.length,
    demands: sourceDemands.length,
    research: sourceResearch.length,
    news: sourceNews.length,
    insertedNews: newsResult.inserted.length,
    updatedNews: newsResult.updated.length,
    visitor: visitorResult,
  };
}

export function createProduct(userId, input) {
  return mutateUserState(userId, (state) => {
    const initialImage = cleanProductImage(input.image || input.thumbnail_url, "");
    const initialThumbnail = cleanProductImage(input.thumbnail_url || input.image, "");
    const product = {
      id: input.id || nanoid(10),
      emoji: cleanText(input.emoji, "📦"),
      name: cleanTitle(input.name, "未命名竞品"),
      brand: cleanTitle(input.brand, ""),
      host: cleanTitle(input.host, ""),
      category: cleanTitle(input.category, "未分类"),
      tags: cleanArray(input.tags),
      tag_values: productTagValuesForState(state, input),
      status: cleanTitle(input.status, "新录入"),
      ai_summary: cleanSummary(input.ai_summary),
      selling_points: cleanArray(input.selling_points),
      negative_keywords: cleanArray(input.negative_keywords),
      cost_estimate: cleanText(input.cost_estimate, ""),
      comments: Number(input.comments || 0),
      visible_comments: cleanVisibleComments(input.visible_comments),
      image: initialImage,
      thumbnail_url: initialThumbnail,
      original_image_url: cleanText(input.original_image_url, ""),
      note: cleanSummary(input.note),
      related_product_id: cleanText(input.related_product_id, ""),
      related_product_name: cleanText(input.related_product_name, ""),
      evidence_status: cleanEvidenceStatus(input.evidence_status),
      sample: Boolean(input.sample),
      synced_at: null,
      feishu_record_id: null,
      created_at: input.created_at || nowIso(),
      updated_at: input.updated_at || nowIso(),
      platforms: cleanPlatformArray(input.platforms),
    };
    syncLegacyProductFields(product);
    state.products ||= [];
    state.products.unshift(product);
    return product;
  });
}

export function updateProduct(userId, id, patch) {
  return mutateUserState(userId, (state) => {
    const item = (state.products || []).find((product) => product.id === id);
    if (!item) return null;
    const imagePatch = resolveProductImagePatch(item, patch);
    const next = {
      ...(patch.name !== undefined ? { name: cleanTitle(patch.name, item.name) } : {}),
      ...(patch.brand !== undefined ? { brand: cleanTitle(patch.brand, item.brand || "") } : {}),
      ...(patch.host !== undefined ? { host: cleanTitle(patch.host, item.host || "") } : {}),
      ...(patch.category !== undefined ? { category: cleanTitle(patch.category, item.category) } : {}),
      ...(patch.tag_values !== undefined ? { tag_values: { ...cleanTagValues(item.tag_values), ...productTagValuesForState(state, { tag_values: patch.tag_values }) } } : {}),
      ...(patch.status !== undefined ? { status: cleanTitle(patch.status, item.status) } : {}),
      ...(patch.emoji !== undefined ? { emoji: cleanText(patch.emoji, item.emoji) } : {}),
      ...(patch.ai_summary !== undefined ? { ai_summary: cleanSummary(patch.ai_summary, item.ai_summary) } : {}),
      ...(patch.tags !== undefined ? { tags: cleanArray(patch.tags) } : {}),
      ...(patch.selling_points !== undefined ? { selling_points: cleanArray(patch.selling_points) } : {}),
      ...(patch.negative_keywords !== undefined ? { negative_keywords: cleanArray(patch.negative_keywords) } : {}),
      ...(patch.cost_estimate !== undefined ? { cost_estimate: cleanText(patch.cost_estimate, item.cost_estimate || "") } : {}),
      ...(patch.comments !== undefined ? { comments: Number(patch.comments || 0) } : {}),
      ...(patch.visible_comments !== undefined ? { visible_comments: cleanVisibleComments(patch.visible_comments) } : {}),
      ...imagePatch,
      ...(patch.note !== undefined ? { note: cleanSummary(patch.note, item.note || "") } : {}),
      ...(patch.related_product_id !== undefined ? { related_product_id: cleanText(patch.related_product_id, item.related_product_id || "") } : {}),
      ...(patch.related_product_name !== undefined ? { related_product_name: cleanText(patch.related_product_name, item.related_product_name || "") } : {}),
      ...(patch.evidence_status !== undefined ? { evidence_status: cleanEvidenceStatus(patch.evidence_status, item.evidence_status || "legacy") } : {}),
      ...(patch.platforms !== undefined ? { platforms: cleanPlatformArray(patch.platforms) } : {}),
      updated_at: nowIso(),
    };
    Object.assign(item, next);
    const tagValues = cleanTagValues(item.tag_values);
    const normalizedPatchTags = productTagValuesForState(state, patch);
    if (patch.brand !== undefined) tagValues.brand = normalizedPatchTags.brand || splitTokenText(patch.brand);
    if (patch.host !== undefined) tagValues.host = normalizedPatchTags.host || splitTokenText(patch.host);
    if (patch.category !== undefined) tagValues.category = normalizedPatchTags.category || splitTokenText(patch.category);
    if (patch.tags !== undefined) tagValues.custom_tags = normalizedPatchTags.custom_tags || cleanArray(patch.tags);
    if (patch.brand !== undefined || patch.host !== undefined || patch.category !== undefined || patch.tags !== undefined || patch.tag_values !== undefined) {
      item.tag_values = tagValues;
    }
    syncLegacyProductFields(item);
    return item;
  });
}

export function deleteProduct(userId, id) {
  return mutateUserState(userId, (state) => {
    const before = (state.products || []).length;
    state.products = (state.products || []).filter((product) => product.id !== id);
    return before !== state.products.length;
  });
}

export function createDemand(userId, input) {
  return mutateUserState(userId, (state) => {
    const demand = {
      id: input.id || nanoid(10),
      title: cleanTitle(input.title, "未命名需求"),
      thumbHue: input.thumbHue ?? 200,
      summary: cleanSummary(input.summary),
      original_content: cleanSummary(input.original_content || input.content),
      source: cleanText(input.source, "manual"),
      source_url: cleanText(input.source_url || input.url),
      url: cleanText(input.url || input.source_url),
      author: cleanText(input.author || input.username),
      likes: Number(input.likes || 0),
      collects: Number(input.collects || 0),
      shares: Number(input.shares || 0),
      comments: Number(input.comments || 0),
      thumbnail_url: cleanText(input.thumbnail_url || input.image),
      image: cleanText(input.image || input.thumbnail_url),
      original_image_url: cleanText(input.original_image_url, ""),
      visible_comments: cleanVisibleComments(input.visible_comments),
      date: input.date || new Date().toISOString().slice(0, 10),
      innovation: cleanTitle(input.innovation, "待分类"),
      scenarios: cleanArray(input.scenarios),
      painpoints: cleanArray(input.painpoints),
      tags: cleanArray(input.tags),
      tag_values: demandTagValuesForState(state, input),
      note: cleanSummary(input.note),
      evidence_status: cleanEvidenceStatus(input.evidence_status),
      sample: Boolean(input.sample),
      synced_at: null,
      feishu_record_id: null,
      created_at: input.created_at || nowIso(),
      updated_at: input.updated_at || nowIso(),
    };
    syncLegacyDemandFields(demand);
    state.demands ||= [];
    state.demands.unshift(demand);
    return demand;
  });
}

export function updateDemand(userId, id, patch) {
  return mutateUserState(userId, (state) => {
    const item = (state.demands || []).find((demand) => demand.id === id);
    if (!item) return null;
    const imagePatch = imagePatchWithExistingFallback(item, patch);
    const next = {
      ...patch,
      ...(patch.title !== undefined ? { title: cleanTitle(patch.title, item.title) } : {}),
      ...(patch.summary !== undefined ? { summary: cleanSummary(patch.summary, item.summary) } : {}),
      ...(patch.original_content !== undefined ? { original_content: cleanSummary(patch.original_content, item.original_content || "") } : {}),
      ...(patch.source !== undefined ? { source: cleanText(patch.source, item.source) } : {}),
      ...(patch.source_url !== undefined ? { source_url: cleanText(patch.source_url, item.source_url || "") } : {}),
      ...(patch.url !== undefined ? { url: cleanText(patch.url, item.url || "") } : {}),
      ...(patch.author !== undefined ? { author: cleanText(patch.author, item.author || "") } : {}),
      ...(patch.likes !== undefined ? { likes: Number(patch.likes || 0) } : {}),
      ...(patch.collects !== undefined ? { collects: Number(patch.collects || 0) } : {}),
      ...(patch.shares !== undefined ? { shares: Number(patch.shares || 0) } : {}),
      ...(patch.comments !== undefined ? { comments: Number(patch.comments || 0) } : {}),
      ...(patch.visible_comments !== undefined ? { visible_comments: cleanVisibleComments(patch.visible_comments) } : {}),
      ...imagePatch,
      ...(patch.innovation !== undefined ? { innovation: cleanTitle(patch.innovation, item.innovation) } : {}),
      ...(patch.tag_values !== undefined ? { tag_values: { ...cleanTagValues(item.tag_values), ...demandTagValuesForState(state, { tag_values: patch.tag_values }) } } : {}),
      ...(patch.scenarios !== undefined ? { scenarios: cleanArray(patch.scenarios) } : {}),
      ...(patch.painpoints !== undefined ? { painpoints: cleanArray(patch.painpoints) } : {}),
      ...(patch.tags !== undefined ? { tags: cleanArray(patch.tags) } : {}),
      ...(patch.note !== undefined ? { note: cleanSummary(patch.note, item.note || "") } : {}),
      ...(patch.evidence_status !== undefined ? { evidence_status: cleanEvidenceStatus(patch.evidence_status, item.evidence_status || "legacy") } : {}),
      updated_at: nowIso(),
    };
    Object.assign(item, next);
    const tagValues = cleanTagValues(item.tag_values);
    const normalizedPatchTags = demandTagValuesForState(state, patch);
    if (patch.innovation !== undefined) tagValues.innovation = normalizedPatchTags.innovation || [cleanTitle(patch.innovation, "")].filter(Boolean);
    if (patch.scenarios !== undefined) tagValues.scenarios = normalizedPatchTags.scenarios || cleanArray(patch.scenarios);
    if (patch.painpoints !== undefined) tagValues.painpoints = normalizedPatchTags.painpoints || cleanArray(patch.painpoints);
    if (patch.tags !== undefined) tagValues.custom_tags = normalizedPatchTags.custom_tags || cleanArray(patch.tags);
    if (patch.innovation !== undefined || patch.scenarios !== undefined || patch.painpoints !== undefined || patch.tags !== undefined || patch.tag_values !== undefined) {
      item.tag_values = tagValues;
    }
    syncLegacyDemandFields(item);
    return item;
  });
}

export function deleteDemand(userId, id) {
  return mutateUserState(userId, (state) => {
    const before = (state.demands || []).length;
    state.demands = (state.demands || []).filter((demand) => demand.id !== id);
    return before !== state.demands.length;
  });
}

export function markEntityEvidenceStatus(userId, entityType, entityId, status = "current") {
  return mutateUserState(userId, (state) => {
    const collection = entityType === "product"
      ? state.products
      : entityType === "demand"
        ? state.demands
        : entityType === "research"
          ? state.research
          : null;
    const item = (collection || []).find((entry) => entry.id === entityId);
    if (!item) return null;
    item.evidence_status = cleanEvidenceStatus(status, "current");
    item.updated_at = nowIso();
    if (entityType === "product") syncLegacyProductFields(item);
    if (entityType === "demand") syncLegacyDemandFields(item);
    return item;
  });
}

export function createResearch(userId, input) {
  return mutateUserState(userId, (state) => {
    state.research ||= [];
    const research = {
      id: input.id || nanoid(10),
      title: cleanTitle(input.title, "未命名调研项目"),
      desc: cleanSummary(input.desc || input.description || ""),
      status: cleanTitle(input.status, "草稿"),
      evidence_status: cleanEvidenceStatus(input.evidence_status),
      date: input.date || new Date().toISOString().slice(0, 10),
      products: cleanRecordList(input.products || input.matched_products || []),
      demands: cleanRecordList(input.demands || input.matched_demands || []),
      analysis: Array.isArray(input.analysis) ? input.analysis.slice(0, 20) : input.analysis || null,
      ...(input.feishu_project_idea ? { feishu_project_idea: cleanFeishuProjectIdea(input.feishu_project_idea) } : {}),
      ...(input.source_type ? { source_type: cleanText(input.source_type) } : {}),
      ...(input.source_project_key ? { source_project_key: cleanText(input.source_project_key) } : {}),
      ...(input.source_work_item_id ? { source_work_item_id: cleanText(input.source_work_item_id) } : {}),
      ...(input.source_type_key ? { source_type_key: cleanText(input.source_type_key) } : {}),
      sample: Boolean(input.sample),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    state.research.unshift(research);
    return research;
  });
}

export function updateResearch(userId, id, patch) {
  return mutateUserState(userId, (state) => {
    const item = (state.research || []).find((research) => research.id === id);
    if (!item) return null;
    const next = {
      ...(patch.title !== undefined ? { title: cleanTitle(patch.title, item.title) } : {}),
      ...(patch.desc !== undefined ? { desc: cleanSummary(patch.desc, item.desc) } : {}),
      ...(patch.description !== undefined && patch.desc === undefined ? { desc: cleanSummary(patch.description, item.desc) } : {}),
      ...(patch.status !== undefined ? { status: cleanTitle(patch.status, item.status) } : {}),
      ...(patch.evidence_status !== undefined ? { evidence_status: cleanEvidenceStatus(patch.evidence_status, item.evidence_status || "legacy") } : {}),
      ...(patch.products !== undefined ? { products: cleanRecordList(patch.products) } : {}),
      ...(patch.demands !== undefined ? { demands: cleanRecordList(patch.demands) } : {}),
      ...(patch.matched_products !== undefined && patch.products === undefined ? { products: cleanRecordList(patch.matched_products) } : {}),
      ...(patch.matched_demands !== undefined && patch.demands === undefined ? { demands: cleanRecordList(patch.matched_demands) } : {}),
      ...(patch.analysis !== undefined ? { analysis: Array.isArray(patch.analysis) ? patch.analysis.slice(0, 20) : patch.analysis } : {}),
      ...(patch.dossier_ai !== undefined ? { dossier_ai: patch.dossier_ai } : {}),
      ...(patch.feishu_project_idea !== undefined ? researchFeishuProjectIdeaPatch(patch.feishu_project_idea) : {}),
      updated_at: nowIso(),
    };
    Object.assign(item, next);
    return item;
  });
}

const FEISHU_PROJECT_IDEA_TYPE_KEY = "689428570bcc00818880dff1";

function tableExists(tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function tableColumns(tableName) {
  if (!tableExists(tableName)) return new Set();
  return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name));
}

function parseJsonValue(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanFeishuProjectIdea(input = {}) {
  const projectKey = cleanText(input.project_key || input.projectKey);
  const workItemId = cleanText(input.work_item_id || input.workItemId);
  if (!projectKey || !workItemId) return null;
  return {
    project_key: projectKey,
    work_item_id: workItemId,
    work_item_type_key: cleanText(input.work_item_type_key || input.type_key || input.workItemTypeKey || FEISHU_PROJECT_IDEA_TYPE_KEY),
    work_item_type_name: cleanText(input.work_item_type_name || input.type_name || input.workItemTypeName || "产品想法登记"),
    name: cleanTitle(input.name || input.title, "未命名飞书产品想法"),
    status_name: cleanText(input.status_name || input.status || ""),
    current_node_name: cleanText(input.current_node_name || input.node_name || ""),
    source_url: cleanText(input.source_url || input.url || ""),
    linked_at: cleanText(input.linked_at) || nowIso(),
  };
}

function researchFeishuProjectIdeaPatch(input) {
  if (input === null) {
    return {
      feishu_project_idea: null,
      source_type: "",
      source_project_key: "",
      source_work_item_id: "",
      source_type_key: "",
    };
  }
  const idea = cleanFeishuProjectIdea(input);
  if (!idea) return {};
  return {
    feishu_project_idea: idea,
    source_type: "feishu_project_idea",
    source_project_key: idea.project_key,
    source_work_item_id: idea.work_item_id,
    source_type_key: idea.work_item_type_key,
  };
}

function mapFeishuProjectItem(row, fieldRows = []) {
  const raw = parseJsonValue(row.raw_json, {});
  const fields = {};
  fieldRows.forEach((field) => {
    fields[field.field_key] = {
      key: field.field_key,
      name: field.field_name || field.field_key,
      type: field.field_type || "",
      value: parseJsonValue(field.value_json, field.value_text || ""),
      text: field.value_text || "",
    };
  });
  return {
    id: `${row.project_key}:${row.work_item_id}`,
    workspace_id: row.workspace_id,
    project_key: row.project_key,
    work_item_id: row.work_item_id,
    work_item_type_key: row.work_item_type_key || raw.work_item_type_key || "",
    work_item_type_name: row.work_item_type_name || raw.work_item_type_name || "",
    name: row.name || raw.name || "未命名飞书工作项",
    status_key: row.status_key || "",
    status_name: row.status_name || raw.status_name || "",
    current_node_key: row.current_node_key || "",
    current_node_name: row.current_node_name || raw.current_node_name || "",
    current_owners: parseJsonValue(row.current_owners_json, []),
    role_members: parseJsonValue(row.role_members_json, []),
    created_by: parseJsonValue(row.created_by_json, null),
    updated_by: parseJsonValue(row.updated_by_json, null),
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    source_url: row.source_url || "",
    fields,
    raw,
  };
}

export function listFeishuProjectItems(input = {}, filters = {}) {
  const options = typeof input === "string"
    ? { workspace_id: input, ...filters }
    : { ...(input || {}) };
  const {
    workspace_id = "",
    project_key = "",
    projectKey = "",
    work_item_type_key = "",
    workItemTypeKey = "",
    type = "",
    q = "",
    limit = 50,
  } = options;
  if (!tableExists("feishu_project_items")) return [];
  const columns = tableColumns("feishu_project_items");
  const clauses = [];
  const params = [];
  if (workspace_id && columns.has("workspace_id")) {
    clauses.push("workspace_id = ?");
    params.push(cleanText(workspace_id));
  }
  if (type === "idea") {
    clauses.push("(work_item_type_key = ? OR work_item_type_name LIKE ?)");
    params.push(FEISHU_PROJECT_IDEA_TYPE_KEY, "%产品想法%");
  }
  const projectFilter = cleanText(project_key || projectKey);
  if (projectFilter && columns.has("project_key")) {
    clauses.push("project_key = ?");
    params.push(projectFilter);
  }
  const typeFilter = cleanText(work_item_type_key || workItemTypeKey);
  if (typeFilter && columns.has("work_item_type_key")) {
    clauses.push("work_item_type_key = ?");
    params.push(typeFilter);
  }
  const keyword = cleanText(q).toLowerCase();
  if (keyword) {
    clauses.push("(lower(name) LIKE ? OR lower(work_item_id) LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  const sql = `
    SELECT * FROM feishu_project_items
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY COALESCE(updated_at, created_at, '') DESC
    LIMIT ?
  `;
  const rows = db.prepare(sql).all(...params, Math.min(Math.max(Number(limit) || 50, 1), 100));
  if (!tableExists("feishu_project_item_fields")) return rows.map((row) => mapFeishuProjectItem(row));
  const fieldStmt = db.prepare(`
    SELECT * FROM feishu_project_item_fields
    WHERE workspace_id = ? AND project_key = ? AND work_item_id = ?
    ORDER BY field_name, field_key
  `);
  return rows.map((row) => mapFeishuProjectItem(row, fieldStmt.all(row.workspace_id, row.project_key, row.work_item_id)));
}

export function bindResearchFeishuProjectIdea(userId, researchId, input, { workspace_id = "" } = {}) {
  const item = updateResearch(userId, researchId, { feishu_project_idea: input });
  if (!item) return null;
  const idea = item.feishu_project_idea;
  if (idea && workspace_id && tableExists("feishu_project_idea_links")) {
    db.prepare(`
      INSERT INTO feishu_project_idea_links (
        workspace_id, project_key, work_item_id, research_id, link_status, imported_at, last_synced_at
      ) VALUES (?, ?, ?, ?, 'linked', ?, ?)
      ON CONFLICT(workspace_id, project_key, work_item_id) DO UPDATE SET
        research_id = excluded.research_id,
        link_status = 'linked',
        last_synced_at = excluded.last_synced_at
    `).run(workspace_id, idea.project_key, idea.work_item_id, researchId, idea.linked_at, nowIso());
  }
  return item;
}

export function deleteResearch(userId, id) {
  return mutateUserState(userId, (state) => {
    const before = (state.research || []).length;
    state.research = (state.research || []).filter((research) => research.id !== id);
    return before !== state.research.length;
  });
}

export function updateSettings(userId, patch) {
  return mutateUserState(userId, (state) => {
    const previousFields = normalizeFields(state.settings?.fields, state.settings?.tag_groups, { includeDefaults: false });
    const allowed = [
      "llm_api_type",
      "llm_api_url",
      "llm_model",
      "llm_api_key",
      "llm_fast_model",
      "llm_strong_model",
      "llm_routing_policy_json",
      "llm_max_concurrency",
      "llm_min_interval_ms",
      "llm_retry_max_attempts",
      "llm_retry_base_ms",
      "llm_vision_api_type",
      "llm_vision_api_url",
      "llm_vision_model",
      "llm_vision_api_key",
      "llm_timeout_ms",
      "last_llm_test_at",
      "last_llm_vision_test_at",
      "search_provider",
      "search_enabled",
      "search_api_url",
      "search_api_key",
      "search_model",
      "search_tavily_enabled",
      "search_tavily_api_key",
      "search_tavily_api_url",
      "search_tavily_mode",
      "search_serpapi_enabled",
      "search_serpapi_api_key",
      "search_serpapi_api_url",
      "search_serpapi_engine",
      "fields",
      "tag_groups",
      "feishu_app_id",
      "feishu_app_secret",
      "feishu_base_token",
      "feishu_products_table_id",
      "feishu_demands_table_id",
      "feishu_news_table_id",
      "feishu_table_token",
      "feishu_mcp_url",
      "feishu_mcp_token",
      "feishu_mcp_project_key",
      "feishu_mcp_project_name",
      "feishu_project_default_project_key",
      "feishu_project_default_project_name",
      "feishu_project_idea_type_key",
      "feishu_mcp_interval",
      "last_feishu_project_mcp_test_at",
      "last_feishu_project_mcp_sync_at",
      "official_news_enabled",
      "rss_collect_enabled",
      "rss_collect_interval_ms",
      "extension_ai_before_save",
    ];
    const next = {};
    for (const key of allowed) {
      if (patch[key] !== undefined) next[key] = patch[key];
    }
    for (const key of ["llm_api_key", "llm_vision_api_key", "search_api_key", "search_tavily_api_key", "search_serpapi_api_key", "feishu_app_secret", "feishu_mcp_token"]) {
      if (next[key] === "********" || next[key] === "") delete next[key];
    }
    state.settings = { ...(state.settings || {}), ...next };
    state.settings = normalizeSettingsFields(state.settings);
    if (patch.fields !== undefined) {
      const nextKeys = new Set(normalizeFields(state.settings.fields, [], { includeDefaults: false }).map((field) => field.key));
      const removedCustomKeys = previousFields
        .filter((field) => !field.official && !nextKeys.has(field.key))
        .map((field) => field.key);
      if (removedCustomKeys.length) {
        for (const product of state.products || []) {
          for (const key of removedCustomKeys) {
            if (product.tag_values) delete product.tag_values[key];
            delete product[key];
          }
        }
        for (const demand of state.demands || []) {
          for (const key of removedCustomKeys) {
            if (demand.tag_values) delete demand.tag_values[key];
            delete demand[key];
          }
        }
      }
    }
    return maskSettings(state.settings);
  });
}

export function listFields(userId, entity = "") {
  const state = rawState(userId);
  const normalized = normalizeFields(state?.settings?.fields, state?.settings?.tag_groups, { includeDefaults: false });
  return entity ? normalized.filter((field) => field.entities.includes(entity)) : normalized;
}

export function createField(userId, input = {}) {
  return mutateUserState(userId, (state) => {
    const fields = normalizeFields(state.settings?.fields, state.settings?.tag_groups, { includeDefaults: false });
    const name = cleanTitle(input.name, "自定义字段");
    const keyBase = cleanText(input.key || name)
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    const generatedKey = () => `u_${nanoid(8).replace(/-/g, "_").replace(/^_+|_+$/g, "")}`;
    let key = input.key ? `u_${keyBase.replace(/^u_/, "")}` : generatedKey();
    if (fields.some((field) => field.key === key)) key = generatedKey();
    const field = {
      key,
      legacyKey: key,
      name,
      tone: ["default", "outline", "accent", "success", "warn", "danger"].includes(input.tone) ? input.tone : "outline",
      multi: input.multi !== false,
      official: false,
      entities: cleanArray(input.entities).filter((item) => item === "competitor" || item === "inspiration"),
      options: cleanArray(input.options, 200),
    };
    if (!field.entities.length) field.entities = ["competitor"];
    state.settings = normalizeSettingsFields({ ...(state.settings || {}), fields: [...fields, field] });
    return field;
  });
}

export function updateField(userId, key, patch = {}) {
  return mutateUserState(userId, (state) => {
    const fields = normalizeFields(state.settings?.fields, state.settings?.tag_groups, { includeDefaults: false });
    const index = fields.findIndex((field) => field.key === key || field.legacyKey === key);
    if (index === -1) return null;
    const current = fields[index];
    const next = {
      ...current,
      ...(patch.name !== undefined ? { name: cleanTitle(patch.name, current.name) } : {}),
      ...(patch.tone !== undefined && ["default", "outline", "accent", "success", "warn", "danger"].includes(patch.tone) ? { tone: patch.tone } : {}),
      ...(patch.multi !== undefined && !current.official ? { multi: patch.multi !== false } : {}),
      ...(patch.entities !== undefined ? { entities: cleanArray(patch.entities).filter((item) => item === "competitor" || item === "inspiration") } : {}),
      ...(patch.options !== undefined ? { options: cleanArray(patch.options, 200) } : {}),
    };
    if (!next.entities.length) next.entities = current.entities.length ? current.entities : ["competitor"];
    fields[index] = next;
    state.settings = normalizeSettingsFields({ ...(state.settings || {}), fields });
    for (const product of state.products || []) syncLegacyProductFields(product);
    for (const demand of state.demands || []) syncLegacyDemandFields(demand);
    return next;
  });
}

export function deleteField(userId, key) {
  return mutateUserState(userId, (state) => {
    const fields = normalizeFields(state.settings?.fields, state.settings?.tag_groups, { includeDefaults: false });
    const target = fields.find((field) => field.key === key || field.legacyKey === key);
    if (!target || target.official) return false;
    state.settings = normalizeSettingsFields({
      ...(state.settings || {}),
      fields: fields.filter((field) => field.key !== target.key),
    });
    for (const product of state.products || []) {
      if (product.tag_values) delete product.tag_values[target.key];
      delete product[target.key];
    }
    for (const demand of state.demands || []) {
      if (demand.tag_values) delete demand.tag_values[target.key];
      delete demand[target.key];
    }
    return true;
  });
}

export function addFieldOption(userId, key, value) {
  const cleanValue = cleanText(value).slice(0, 120);
  if (!cleanValue) return null;
  const field = listFields(userId).find((item) => item.key === key || item.legacyKey === key);
  if (!field) return null;
  const options = Array.from(new Set([...(field.options || []), cleanValue]));
  return updateField(userId, field.key, { options });
}

export function removeFieldOption(userId, key, value) {
  const cleanValue = cleanText(value);
  const field = listFields(userId).find((item) => item.key === key || item.legacyKey === key);
  if (!field) return null;
  return updateField(userId, field.key, { options: (field.options || []).filter((item) => item !== cleanValue) });
}

export function finishSampleWorkspace(userId) {
  if (userId === getLegacyUserId()) {
    const state = requireState(userId);
    if (!state) return null;
    state.onboarding = onboardingMeta(state, listNews(userId));
    return state;
  }
  return mutateUserState(userId, (state) => {
    state.onboarding = {
      ...(state.onboarding || {}),
      sampleWorkspace: false,
      sampleDismissed: true,
      dismissed_at: nowIso(),
    };
    state.products = (state.products || []).filter((item) => !item.sample);
    state.demands = (state.demands || []).filter((item) => !item.sample);
    state.research = (state.research || []).filter((item) => !item.sample);
    return state;
  });
}

export function listNews(userId) {
  return db.prepare(`
    SELECT *
    FROM news_items
    WHERE user_id = ?
    ORDER BY published_at DESC, created_at DESC
  `).all(userId).map(mapNewsRow);
}

export function findReusableNewsThumbnail({ originalUrl = "", mergeKey = "", titleZh = "", excludeId = "", userId = "" } = {}) {
  const normalizedOriginalUrl = cleanText(originalUrl);
  const normalizedMergeKey = cleanText(mergeKey);
  const normalizedTitleZh = cleanText(titleZh);
  const normalizedExcludeId = cleanText(excludeId);
  const normalizedUserId = cleanText(userId);

  const rows = db.prepare(`
    SELECT id, user_id, original_url, title_zh, thumbnail_url, updated_at,
           COALESCE(json_extract(classification_json, '$.merge_key'), '') AS merge_key
    FROM news_items
    WHERE COALESCE(thumbnail_url, '') <> ''
      AND lower(COALESCE(thumbnail_url, '')) NOT LIKE '%googleusercontent.com%'
      AND lower(COALESCE(thumbnail_url, '')) NOT LIKE '%share_save%'
      AND lower(COALESCE(thumbnail_url, '')) NOT LIKE '%addtoany%'
      AND (? = '' OR id <> ?)
      AND (
        (? <> '' AND original_url = ?)
        OR (? <> '' AND COALESCE(json_extract(classification_json, '$.merge_key'), '') = ?)
        OR (? <> '' AND title_zh = ?)
      )
    ORDER BY
      CASE WHEN ? <> '' AND user_id = ? THEN 0 ELSE 1 END,
      CASE WHEN ? <> '' AND original_url = ? THEN 0 ELSE 1 END,
      CASE WHEN ? <> '' AND COALESCE(json_extract(classification_json, '$.merge_key'), '') = ? THEN 0 ELSE 1 END,
      CASE WHEN ? <> '' AND title_zh = ? THEN 0 ELSE 1 END,
      updated_at DESC
    LIMIT 1
  `).all(
    normalizedExcludeId, normalizedExcludeId,
    normalizedOriginalUrl, normalizedOriginalUrl,
    normalizedMergeKey, normalizedMergeKey,
    normalizedTitleZh, normalizedTitleZh,
    normalizedUserId, normalizedUserId,
    normalizedOriginalUrl, normalizedOriginalUrl,
    normalizedMergeKey, normalizedMergeKey,
    normalizedTitleZh, normalizedTitleZh
  );

  const match = rows[0];
  return match ? String(match.thumbnail_url || "").trim() : "";
}

export function officialNewsItems() {
  return listNews(getLegacyUserId()).filter((item) => isOfficialNewsItem(item) && isVisibleNewsItem(item));
}

export function officialNewsCacheStatus(userId) {
  const items = listNews(userId).filter((item) => isOfficialNewsItem(item));
  const visible = items.filter((item) => isVisibleNewsItem(item));
  const latestPublishedAt = visible
    .map((item) => item.published_at || item.date || "")
    .filter(Boolean)
    .sort()
    .at(-1) || "";
  return {
    total: items.length,
    visible: visible.length,
    latestPublishedAt,
  };
}

export function ensureOfficialNewsCache(userId) {
  if (!userId || userId === getLegacyUserId()) {
    return { inserted: [], updated: [], status: officialNewsCacheStatus(userId || getLegacyUserId()) };
  }
  const result = syncOfficialNewsToUser(userId);
  return {
    ...result,
    status: officialNewsCacheStatus(userId),
  };
}

export function syncOfficialNewsToUser(userId) {
  if (!userId || userId === getLegacyUserId()) return { inserted: [], updated: [] };
  pruneNewsOlderThan(userId, { sourceGroups: ["official-default", "sample-live", "wechat-exporter", "official-google-news"], olderThanDays: STREAM_NEWS_MAX_AGE_DAYS });
  const items = officialNewsItems().map((item) => ({
    source_id: item.source_id,
    source: item.source,
    source_authority: item.source_authority,
    original_title: item.original_title,
    original_url: item.original_url,
    original_content: item.original_content,
    titleZh: item.titleZh,
    summary: item.summary,
    contentZh: item.contentZh,
    type: item.type,
    thumbnail_url: item.thumbnail_url,
    thumbHue: item.thumbHue,
    published_at: item.published_at,
    llmProcessed: !item.needsTranslation,
    needsTranslation: item.needsTranslation,
    classification: item.classification,
  }));
  const result = upsertNews(userId, items);
  pruneNewsOlderThan(userId, { sourceGroups: ["official-default", "sample-live", "wechat-exporter", "official-google-news"], olderThanDays: STREAM_NEWS_MAX_AGE_DAYS });
  return result;
}

export function syncOfficialNewsToAllUsers() {
  return listAllUsers()
    .filter((user) => user.id !== getLegacyUserId())
    .map((user) => {
      const synced = syncOfficialNewsToUser(user.id);
      return {
        userId: user.id,
        inserted: synced.inserted.length,
        updated: synced.updated.length,
      };
    });
}

export function listPendingNewsForLlm(userId, limit = 20) {
  return db.prepare(`
    SELECT *
    FROM news_items
    WHERE user_id = ? AND (llm_processed = 0 OR needs_translation = 1)
    ORDER BY published_at DESC, created_at DESC
    LIMIT ?
  `).all(userId, limit).map(mapNewsRow);
}

export function updateNews(userId, id, patch) {
  const current = db.prepare("SELECT * FROM news_items WHERE id = ? AND user_id = ?").get(id, userId);
  if (!current) return null;
  const currentClassification = current.classification_json ? JSON.parse(current.classification_json) : {};
  const mergedClassification = patch.classification
    ? {
        ...currentClassification,
        ...patch.classification,
      }
    : currentClassification;
  db.prepare(`
    UPDATE news_items
    SET is_read = ?,
        is_starred = ?,
        type = COALESCE(?, type),
        title_zh = COALESCE(?, title_zh),
        summary_zh = COALESCE(?, summary_zh),
        content_zh = COALESCE(?, content_zh),
        is_kept = COALESCE(?, is_kept),
        llm_processed = COALESCE(?, llm_processed),
        needs_translation = COALESCE(?, needs_translation),
        classification_json = COALESCE(?, classification_json),
        updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    patch.unread !== undefined ? (patch.unread ? 0 : 1) : (patch.is_read !== undefined ? (patch.is_read ? 1 : 0) : current.is_read),
    patch.starred !== undefined ? (patch.starred ? 1 : 0) : (patch.is_starred !== undefined ? (patch.is_starred ? 1 : 0) : current.is_starred),
    patch.type ?? null,
    patch.titleZh ?? null,
    patch.summary ?? null,
    patch.contentZh ?? null,
    patch.is_kept ?? null,
    patch.llm_processed ?? null,
    patch.needsTranslation !== undefined ? (patch.needsTranslation ? 1 : 0) : null,
    Object.keys(mergedClassification).length ? JSON.stringify(mergedClassification) : null,
    nowIso(),
    id,
    userId
  );
  return listNews(userId).find((item) => item.id === id) || null;
}

export function deleteNews(userId, id) {
  return db.prepare("DELETE FROM news_items WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

export function pruneNewsOlderThan(userId, { sourceGroups = [], olderThanDays = 5 } = {}) {
  const groups = cleanArray(sourceGroups);
  if (!groups.length) return 0;
  const cutoff = new Date(Date.now() - Math.max(1, Number(olderThanDays || 5)) * 24 * 60 * 60 * 1000).toISOString();
  const placeholders = groups.map(() => "?").join(", ");
  return db.prepare(`
    DELETE FROM news_items
    WHERE user_id = ?
      AND COALESCE(published_at, created_at) < ?
      AND COALESCE(json_extract(classification_json, '$.source_group'), '') IN (${placeholders})
  `).run(userId, cutoff, ...groups).changes;
}

export function upsertNews(userId, items) {
  const inserted = [];
  const updated = [];
  const selectStmt = db.prepare("SELECT * FROM news_items WHERE user_id = ? AND original_url = ?");
  const selectNearDuplicateStmt = db.prepare(`
    SELECT *
    FROM news_items
    WHERE user_id = ?
      AND datetime(COALESCE(published_at, created_at)) >= datetime(?)
      AND (
        (
          ? <> ''
          AND COALESCE(json_extract(classification_json, '$.near_merge_key'), '') = ?
          AND COALESCE(json_extract(classification_json, '$.host_key'), '') <> ''
        )
        OR (
          ? <> ''
          AND title_zh = ?
          AND source_name = ?
        )
        OR (
          ? <> ''
          AND source_name = ?
          AND COALESCE(json_extract(classification_json, '$.story_key'), '') = ?
        )
        OR (
          ? <> ''
          AND COALESCE(json_extract(classification_json, '$.story_key'), '') = ?
        )
      )
    ORDER BY published_at DESC, updated_at DESC
    LIMIT 1
  `);
  const updateExistingStmt = db.prepare(`
    UPDATE news_items
    SET source_id = ?,
        source_name = ?,
        source_authority = ?,
        original_title = ?,
        original_url = ?,
        original_summary = ?,
        original_content = ?,
        title_zh = ?,
        summary_zh = ?,
        content_zh = ?,
        type = ?,
        thumbnail_url = ?,
        thumb_hue = ?,
        is_kept = ?,
        published_at = ?,
        llm_processed = ?,
        needs_translation = ?,
        classification_json = ?,
        updated_at = ?
    WHERE id = ? AND user_id = ?
  `);
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO news_items (
      id, user_id, source_id, source_name, source_authority, original_title, original_url,
      original_summary, original_content, title_zh, summary_zh, content_zh, type, thumbnail_url,
      thumb_hue, is_kept, is_read, is_starred, published_at, llm_processed, needs_translation,
      classification_json, synced_at, feishu_record_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction((records) => {
    for (const rawInput of records) {
      const input = withNewsDedupeKeys(rawInput);
      if (!input.original_url) continue;
      const inputClassification = input.classification || {};
      const inputNearMergeKey = cleanText(inputClassification.near_merge_key);
      const inputTitle = cleanText(input.titleZh || input.original_title);
      const inputSource = cleanText(input.source);
      const inputStoryKey = isSpecificNewsStoryKey(inputClassification.story_key)
        ? cleanText(inputClassification.story_key)
        : "";
      const inputCrossSourceStoryKey = isCrossSourceNewsStoryKey(inputStoryKey) ? inputStoryKey : "";
      const inputNearMergeKeyForLookup = inputStoryKey && inputStoryKey !== "generic" ? inputNearMergeKey : "";
      const currentByUrl = selectStmt.get(userId, input.original_url);
      const current = currentByUrl || selectNearDuplicateStmt.get(
        userId,
        streamWindowStartIso(),
        inputNearMergeKeyForLookup, inputNearMergeKeyForLookup,
        inputTitle, inputTitle, inputSource,
        inputStoryKey, inputSource, inputStoryKey,
        inputCrossSourceStoryKey, inputCrossSourceStoryKey
      );
      if (current) {
        const currentPublishedAt = parseIsoTime(current.published_at);
        const nextPublishedAt = parseIsoTime(input.published_at || input.date);
        const mergedPublishedAt = nextPublishedAt >= currentPublishedAt
          ? (input.published_at || input.date || current.published_at || nowIso())
          : (current.published_at || input.published_at || input.date || nowIso());
        const currentClassification = parseJsonObject(current.classification_json);
        const inputIsWechat = isWechatNewsRecord(input, inputClassification);
        const currentIsWechat = isWechatNewsRecord(current, currentClassification);
        const preferInputPrimary = inputIsWechat && !currentIsWechat;
        const keepCurrentPrimary = currentIsWechat && !inputIsWechat;
        const canUseInputPrimaryFields = !keepCurrentPrimary && (currentByUrl || preferInputPrimary);
        const duplicateUrl = preferInputPrimary ? current.original_url : input.original_url;
        const duplicateUrls = current.original_url !== input.original_url
          ? appendUniqueText(currentClassification.duplicate_urls, duplicateUrl)
          : currentClassification.duplicate_urls;
        const mergedClassification = {
          ...currentClassification,
          ...(input.classification || {}),
          ...(duplicateUrls?.length ? { duplicate_urls: duplicateUrls } : {}),
        };
        const nextType = input.type ?? current.type;
        const nextThumbnail = input.thumbnail_url || current.thumbnail_url || "";
        const nextNeedsTranslation = input.needsTranslation !== undefined ? (input.needsTranslation ? 1 : 0) : current.needs_translation;
        const nextLlmProcessed = input.llmProcessed !== undefined
          ? (input.llmProcessed ? 1 : 0)
          : (nextType ? 1 : current.llm_processed);
        const nextPayload = {
          source_id: canUseInputPrimaryFields ? (input.source_id || current.source_id) : current.source_id,
          source_name: canUseInputPrimaryFields ? (input.source || current.source_name) : current.source_name,
          source_authority: input.source_authority || input.classification?.authority || current.source_authority || "watchlist",
          original_title: canUseInputPrimaryFields ? (input.original_title || current.original_title) : current.original_title,
          original_url: preferInputPrimary ? input.original_url : current.original_url,
          original_summary: canUseInputPrimaryFields ? (input.summary || current.original_summary || "") : (current.original_summary || input.summary || ""),
          original_content: canUseInputPrimaryFields ? (input.original_content || current.original_content || "") : (current.original_content || input.original_content || ""),
          title_zh: canUseInputPrimaryFields ? (input.titleZh || current.title_zh || input.original_title || current.original_title) : (current.title_zh || input.titleZh || current.original_title),
          summary_zh: canUseInputPrimaryFields ? (input.summary || current.summary_zh || current.original_summary || "") : (current.summary_zh || input.summary || current.original_summary || ""),
          content_zh: canUseInputPrimaryFields ? (input.contentZh || current.content_zh || "") : (current.content_zh || input.contentZh || ""),
          type: nextType,
          thumbnail_url: nextThumbnail,
          thumb_hue: Number(input.thumbHue ?? current.thumb_hue ?? 40),
          is_kept: nextType ? 1 : current.is_kept,
          published_at: mergedPublishedAt,
          llm_processed: nextLlmProcessed,
          needs_translation: nextNeedsTranslation,
          classification_json: Object.keys(mergedClassification).length ? JSON.stringify(mergedClassification) : null,
        };
        const hasChanges = (
          nextPayload.source_id !== current.source_id ||
          nextPayload.source_name !== current.source_name ||
          nextPayload.source_authority !== current.source_authority ||
          nextPayload.original_title !== current.original_title ||
          nextPayload.original_url !== current.original_url ||
          nextPayload.original_summary !== (current.original_summary || "") ||
          nextPayload.original_content !== (current.original_content || "") ||
          nextPayload.title_zh !== (current.title_zh || "") ||
          nextPayload.summary_zh !== (current.summary_zh || "") ||
          nextPayload.content_zh !== (current.content_zh || "") ||
          nextPayload.type !== current.type ||
          nextPayload.thumbnail_url !== (current.thumbnail_url || "") ||
          nextPayload.thumb_hue !== (current.thumb_hue ?? 40) ||
          nextPayload.is_kept !== current.is_kept ||
          nextPayload.published_at !== current.published_at ||
          nextPayload.llm_processed !== current.llm_processed ||
          nextPayload.needs_translation !== current.needs_translation ||
          nextPayload.classification_json !== (current.classification_json || null)
        );
        if (hasChanges) {
          updateExistingStmt.run(
            nextPayload.source_id,
            nextPayload.source_name,
            nextPayload.source_authority,
            nextPayload.original_title,
            nextPayload.original_url,
            nextPayload.original_summary,
            nextPayload.original_content,
            nextPayload.title_zh,
            nextPayload.summary_zh,
            nextPayload.content_zh,
            nextPayload.type,
            nextPayload.thumbnail_url,
            nextPayload.thumb_hue,
            nextPayload.is_kept,
            nextPayload.published_at,
            nextPayload.llm_processed,
            nextPayload.needs_translation,
            nextPayload.classification_json,
            nowIso(),
            current.id,
            userId
          );
          updated.push(mapNewsRow({ ...current, ...nextPayload, updated_at: nowIso() }));
        }
        continue;
      }
      const payload = {
        id: input.id || nanoid(10),
        user_id: userId,
        source_id: input.source_id || "unknown",
        source_name: input.source || "",
        source_authority: input.source_authority || input.classification?.authority || "watchlist",
        original_title: input.original_title || input.titleZh || "",
        original_url: input.original_url || `${input.source_id || "unknown"}::${input.id || nanoid(6)}`,
        original_summary: input.summary || "",
        original_content: input.original_content || "",
        title_zh: input.titleZh || input.original_title || "",
        summary_zh: input.summary || "",
        content_zh: input.contentZh || "",
        type: input.type || null,
        thumbnail_url: input.thumbnail_url || "",
        thumb_hue: Number(input.thumbHue ?? 40),
        is_kept: input.type ? 1 : 0,
        is_read: 0,
        is_starred: 0,
        published_at: input.published_at || input.date || nowIso(),
        llm_processed: input.llmProcessed !== undefined ? (input.llmProcessed ? 1 : 0) : (input.type ? 1 : 0),
        needs_translation: input.needsTranslation ? 1 : 0,
        classification_json: input.classification ? JSON.stringify(input.classification) : null,
        synced_at: null,
        feishu_record_id: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      const result = insertStmt.run(
        payload.id, payload.user_id, payload.source_id, payload.source_name, payload.source_authority, payload.original_title, payload.original_url,
        payload.original_summary, payload.original_content, payload.title_zh, payload.summary_zh, payload.content_zh, payload.type, payload.thumbnail_url,
        payload.thumb_hue, payload.is_kept, payload.is_read, payload.is_starred, payload.published_at, payload.llm_processed, payload.needs_translation,
        payload.classification_json, payload.synced_at, payload.feishu_record_id, payload.created_at, payload.updated_at
      );
      if (result.changes > 0) inserted.push(payload);
    }
  })(items);
  return { inserted, updated };
}

export function listNewsSources(userId) {
  return db.prepare(`
    SELECT *
    FROM news_sources
    WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(userId).map(mapNewsSourceRow);
}

export function createNewsSource(userId, input) {
  const normalizedUrl = cleanText(input.url);
  const existingByUrl = normalizedUrl
    ? db.prepare("SELECT * FROM news_sources WHERE user_id = ? AND url = ?").get(userId, normalizedUrl)
    : null;
  if (existingByUrl) {
    return updateNewsSource(userId, existingByUrl.id, {
      ...input,
      url: normalizedUrl,
    });
  }
    const source = {
      id: input.id || nanoid(10),
      user_id: userId,
      name: cleanTitle(input.name, "未命名数据源"),
      url: normalizedUrl,
      type: cleanText(input.type, "rss"),
      adapter_type: cleanText(input.adapter_type || input.type, "rss"),
      adapter_config_json: input.adapter_config ? JSON.stringify(cleanJsonObject(input.adapter_config)) : null,
      language: cleanText(input.language),
      authority: cleanText(input.authority, "watchlist"),
      group_name: cleanText(input.group, "custom"),
      source_group: cleanText(input.source_group || input.group, "custom"),
      brand: cleanTitle(input.brand, ""),
      fetch_interval: clampFetchInterval(input.interval || input.fetch_interval || 60),
      is_active: input.active ?? input.is_active ?? true ? 1 : 0,
      last_fetched_at: input.last_fetched_at || null,
      last_item_count: Number(input.last_item_count || 0),
      last_error: cleanText(input.last_error),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  db.prepare(`
    INSERT INTO news_sources (
      id, user_id, name, url, type, adapter_type, adapter_config_json, language, authority, group_name, source_group, brand,
      fetch_interval, is_active, last_fetched_at, last_item_count, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    source.id, source.user_id, source.name, source.url, source.type, source.adapter_type, source.adapter_config_json, source.language, source.authority, source.group_name, source.source_group, source.brand,
    source.fetch_interval, source.is_active, source.last_fetched_at, source.last_item_count, source.last_error, source.created_at, source.updated_at
  );
  return listNewsSources(userId).find((item) => item.id === source.id) || null;
}

export function importWechatExporterAccounts(userId, manifest = {}, options = {}) {
  const accounts = Array.isArray(manifest?.accounts) ? manifest.accounts : [];
  const interval = clampFetchInterval(options.interval || manifest?.interval || 1440);
  const rsshubBaseUrl = cleanText(options.rsshubBaseUrl || manifest?.rsshub_base_url);
  const maxPerSource = Math.min(50, Math.max(1, Number(options.maxPerSource || manifest?.max_per_source || 20)));
  const type = cleanText(options.type, rsshubBaseUrl ? "rss" : "wechat_exporter");
  const adapterType = cleanText(options.adapter_type || options.adapterType, rsshubBaseUrl ? "rsshub_wechat" : type);
  const created = [];
  const updated = [];
  const skipped = [];

  for (const account of accounts) {
    const fakeid = cleanText(account?.fakeid);
    const nickname = cleanTitle(account?.nickname || account?.name, "");
    if (!fakeid || !nickname) {
      skipped.push({
        fakeid,
        name: nickname || cleanText(account?.nickname || account?.name, "未命名公众号"),
        reason: "missing_fakeid_or_name",
      });
      continue;
    }

    const encodedFakeid = encodeURIComponent(fakeid);
    const existing = listNewsSources(userId).find((source) => {
      const sourceType = cleanText(source?.type).toLowerCase();
      const adapter = cleanText(source?.adapter_type).toLowerCase();
      const url = String(source?.url || "");
      return (
        (sourceType === "wechat_exporter" || adapter === "rsshub_wechat" || cleanText(source?.source_group).toLowerCase() === "wechat-exporter") &&
        (
          source?.adapter_config?.fakeid === fakeid ||
          (/[?&](fakeid|id)=/.test(url) && url.includes(encodedFakeid)) ||
          url.includes(`/loom/wechat/${encodedFakeid}`)
        )
      );
    });

    const url = rsshubBaseUrl
      ? `${rsshubBaseUrl.replace(/\/+$/g, "")}/loom/wechat/${encodedFakeid}?limit=${maxPerSource}`
      : `?fakeid=${encodedFakeid}`;

    const payload = {
      name: nickname,
      url,
      type,
      adapter_type: adapterType,
      adapter_config: { fakeid, source: "wechat-article-exporter" },
      interval,
      authority: "watchlist",
      group: "wechat-exporter",
      source_group: "wechat-exporter",
      brand: nickname,
      active: true,
    };

    if (existing) {
      const next = updateNewsSource(userId, existing.id, payload);
      if (next) updated.push(next);
      continue;
    }

    const next = createNewsSource(userId, payload);
    if (next) created.push(next);
  }

  return {
    created,
    updated,
    skipped,
    total: accounts.length,
  };
}

export function ensureSampleNewsSources(userId) {
  const existing = new Set(listNewsSources(userId).map((source) => source.id));
  const created = [];
  for (const source of SAMPLE_NEWS_SOURCES) {
    const id = userId === getLegacyUserId() ? source.id : sampleSourceId(userId, source.id);
    if (existing.has(id)) continue;
    created.push(createNewsSource(userId, {
      ...source,
      id,
      type: "rss",
      active: true,
      is_active: true,
    }));
  }
  return created;
}

export function ensureDefaultNewsSources(userId) {
  const existing = new Set(listNewsSources(userId).map((source) => source.id));
  const created = [];
  for (const source of DEFAULT_NEWS_SOURCES) {
    const id = userId === getLegacyUserId() ? source.id : sampleSourceId(userId, source.id);
    if (existing.has(id)) continue;
    created.push(createNewsSource(userId, {
      ...source,
      id,
      type: "rss",
      active: true,
      is_active: true,
    }));
  }
  return created;
}

export function updateNewsSource(userId, id, patch) {
  const current = db.prepare("SELECT * FROM news_sources WHERE id = ? AND user_id = ?").get(id, userId);
  if (!current) return null;
  db.prepare(`
    UPDATE news_sources
    SET name = ?, url = ?, type = ?, adapter_type = ?, adapter_config_json = ?, language = ?, authority = ?, group_name = ?, source_group = ?, brand = ?,
        fetch_interval = ?, is_active = ?, last_fetched_at = ?, last_item_count = ?, last_error = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    patch.name !== undefined ? cleanTitle(patch.name, current.name) : current.name,
    patch.url !== undefined ? cleanText(patch.url, current.url) : current.url,
    patch.type !== undefined ? cleanText(patch.type, current.type) : current.type,
    patch.adapter_type !== undefined ? cleanText(patch.adapter_type, current.adapter_type || current.type) : (current.adapter_type || current.type),
    patch.adapter_config !== undefined ? JSON.stringify(cleanJsonObject(patch.adapter_config)) : current.adapter_config_json,
    patch.language !== undefined ? cleanText(patch.language, current.language) : current.language,
    patch.authority !== undefined ? cleanText(patch.authority, current.authority) : current.authority,
    patch.group !== undefined ? cleanText(patch.group, current.group_name) : current.group_name,
    patch.source_group !== undefined ? cleanText(patch.source_group, patch.group ?? current.source_group ?? current.group_name) : (patch.group !== undefined ? cleanText(patch.group, current.source_group || current.group_name) : current.source_group || current.group_name),
    patch.brand !== undefined ? cleanTitle(patch.brand, current.brand) : current.brand,
    patch.fetch_interval !== undefined || patch.interval !== undefined ? clampFetchInterval(patch.fetch_interval ?? patch.interval) : current.fetch_interval,
    patch.is_active !== undefined ? (patch.is_active ? 1 : 0) : (patch.active !== undefined ? (patch.active ? 1 : 0) : current.is_active),
    patch.last_fetched_at !== undefined ? patch.last_fetched_at : current.last_fetched_at,
    patch.last_item_count !== undefined ? Number(patch.last_item_count || 0) : Number(current.last_item_count || 0),
    patch.last_error !== undefined ? (patch.last_error == null ? null : cleanText(patch.last_error, current.last_error)) : current.last_error,
    nowIso(),
    id,
    userId
  );
  return listNewsSources(userId).find((item) => item.id === id) || null;
}

export function deleteNewsSource(userId, id) {
  return db.prepare("DELETE FROM news_sources WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

export function clearNewsSources(userId) {
  return db.prepare("DELETE FROM news_sources WHERE user_id = ?").run(userId).changes;
}

export function listFeedGroups(userId) {
  return db.prepare(`
    SELECT *
    FROM feed_groups
    WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(userId).map(mapFeedGroupRow);
}

export function createFeedGroup(userId, input = {}) {
  const baseSlug = slugifyFeedName(input.slug || input.name, "group");
  let slug = baseSlug;
  let counter = 2;
  while (db.prepare("SELECT 1 FROM feed_groups WHERE user_id = ? AND slug = ?").get(userId, slug)) {
    slug = `${baseSlug}-${counter++}`;
  }
  const group = {
    id: input.id || nanoid(10),
    user_id: userId,
    workspace_id: cleanText(input.workspace_id),
    name: cleanTitle(input.name, "未命名分组"),
    slug,
    description: cleanSummary(input.description, ""),
    color: cleanText(input.color, "").slice(0, 40),
    is_active: input.is_active ?? input.active ?? true ? 1 : 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  db.prepare(`
    INSERT INTO feed_groups (
      id, user_id, workspace_id, name, slug, description, color, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    group.id, group.user_id, group.workspace_id || null, group.name, group.slug, group.description, group.color, group.is_active, group.created_at, group.updated_at
  );
  return listFeedGroups(userId).find((item) => item.id === group.id) || null;
}

export function updateFeedGroup(userId, id, patch = {}) {
  const current = db.prepare("SELECT * FROM feed_groups WHERE id = ? AND user_id = ?").get(id, userId);
  if (!current) return null;
  let slug = current.slug;
  if (patch.slug !== undefined || patch.name !== undefined) {
    const baseSlug = slugifyFeedName(patch.slug !== undefined ? patch.slug : patch.name, current.slug || "group");
    slug = baseSlug;
    let counter = 2;
    while (db.prepare("SELECT 1 FROM feed_groups WHERE user_id = ? AND slug = ? AND id <> ?").get(userId, slug, id)) {
      slug = `${baseSlug}-${counter++}`;
    }
  }
  db.prepare(`
    UPDATE feed_groups
    SET name = ?, slug = ?, description = ?, color = ?, is_active = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    patch.name !== undefined ? cleanTitle(patch.name, current.name) : current.name,
    slug,
    patch.description !== undefined ? cleanSummary(patch.description, current.description || "") : (current.description || ""),
    patch.color !== undefined ? cleanText(patch.color, current.color || "").slice(0, 40) : (current.color || ""),
    patch.is_active !== undefined ? (patch.is_active ? 1 : 0) : (patch.active !== undefined ? (patch.active ? 1 : 0) : current.is_active),
    nowIso(),
    id,
    userId
  );
  return listFeedGroups(userId).find((item) => item.id === id) || null;
}

export function deleteFeedGroup(userId, id) {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM feed_group_sources WHERE user_id = ? AND group_id = ?").run(userId, id);
    db.prepare("DELETE FROM feed_destinations WHERE user_id = ? AND group_id = ?").run(userId, id);
    return db.prepare("DELETE FROM feed_groups WHERE user_id = ? AND id = ?").run(userId, id).changes > 0;
  });
  return tx();
}

export function listFeedGroupSources(userId, groupId = "") {
  return db.prepare(`
    SELECT s.*
    FROM feed_group_sources gs
    JOIN news_sources s ON s.id = gs.source_id
    WHERE gs.user_id = ?
      AND (? = '' OR gs.group_id = ?)
    ORDER BY s.created_at ASC
  `).all(userId, groupId, groupId).map(mapNewsSourceRow);
}

export function assignSourceToFeedGroup(userId, groupId, sourceId) {
  const group = db.prepare("SELECT id FROM feed_groups WHERE id = ? AND user_id = ?").get(groupId, userId);
  const source = db.prepare("SELECT id FROM news_sources WHERE id = ? AND user_id = ?").get(sourceId, userId);
  if (!group || !source) return null;
  db.prepare(`
    INSERT OR IGNORE INTO feed_group_sources (id, user_id, group_id, source_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(nanoid(12), userId, groupId, sourceId, nowIso());
  return {
    group_id: groupId,
    source_id: sourceId,
  };
}

export function removeSourceFromFeedGroup(userId, groupId, sourceId) {
  return db.prepare(`
    DELETE FROM feed_group_sources
    WHERE user_id = ? AND group_id = ? AND source_id = ?
  `).run(userId, groupId, sourceId).changes > 0;
}

export function listFeedDestinations(userId) {
  return db.prepare(`
    SELECT *
    FROM feed_destinations
    WHERE user_id = ?
    ORDER BY created_at ASC
  `).all(userId).map(mapFeedDestinationRow);
}

export function createFeedDestination(userId, input = {}) {
  const destination = {
    id: input.id || nanoid(10),
    user_id: userId,
    workspace_id: cleanText(input.workspace_id),
    name: cleanTitle(input.name, "未命名投递"),
    type: cleanText(input.type, "freshrss"),
    target: cleanText(input.target, ""),
    group_id: cleanText(input.group_id, ""),
    config_json: JSON.stringify(cleanJsonObject(input.config)),
    is_active: input.is_active ?? input.active ?? true ? 1 : 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  db.prepare(`
    INSERT INTO feed_destinations (
      id, user_id, workspace_id, name, type, target, group_id, config_json, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    destination.id, destination.user_id, destination.workspace_id || null, destination.name, destination.type, destination.target, destination.group_id || null,
    destination.config_json, destination.is_active, destination.created_at, destination.updated_at
  );
  return listFeedDestinations(userId).find((item) => item.id === destination.id) || null;
}

export function updateFeedDestination(userId, id, patch = {}) {
  const current = db.prepare("SELECT * FROM feed_destinations WHERE id = ? AND user_id = ?").get(id, userId);
  if (!current) return null;
  db.prepare(`
    UPDATE feed_destinations
    SET name = ?, type = ?, target = ?, group_id = ?, config_json = ?, is_active = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    patch.name !== undefined ? cleanTitle(patch.name, current.name) : current.name,
    patch.type !== undefined ? cleanText(patch.type, current.type) : current.type,
    patch.target !== undefined ? cleanText(patch.target, current.target || "") : (current.target || ""),
    patch.group_id !== undefined ? cleanText(patch.group_id, current.group_id || "") || null : current.group_id,
    patch.config !== undefined ? JSON.stringify(cleanJsonObject(patch.config)) : current.config_json,
    patch.is_active !== undefined ? (patch.is_active ? 1 : 0) : (patch.active !== undefined ? (patch.active ? 1 : 0) : current.is_active),
    nowIso(),
    id,
    userId
  );
  return listFeedDestinations(userId).find((item) => item.id === id) || null;
}

export function deleteFeedDestination(userId, id) {
  return db.prepare("DELETE FROM feed_destinations WHERE user_id = ? AND id = ?").run(userId, id).changes > 0;
}

export function ensureFeedAccessToken(userId, purpose = "feed") {
  const current = db.prepare("SELECT * FROM feed_access_tokens WHERE user_id = ? AND purpose = ?").get(userId, purpose);
  if (current?.token) return current.token;
  const token = nanoid(32);
  db.prepare(`
    INSERT INTO feed_access_tokens (token, user_id, purpose, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, userId, purpose, nowIso(), nowIso());
  return token;
}

export function findUserIdByFeedAccessToken(token, purpose = "feed") {
  const row = db.prepare("SELECT * FROM feed_access_tokens WHERE token = ? AND purpose = ?").get(cleanText(token), purpose);
  if (!row?.user_id) return "";
  db.prepare("UPDATE feed_access_tokens SET last_used_at = ?, updated_at = ? WHERE token = ?").run(nowIso(), nowIso(), cleanText(token));
  return row.user_id;
}

export function upsertFeishuProjectUserMapping(input = {}) {
  ensureFeishuProjectUsersSchema();
  const mapping = cleanFeishuProjectUserMapping(input);
  db.prepare(`
    INSERT INTO feishu_project_users (
      workspace_id,
      loom_user_id,
      project_key,
      meego_user_key,
      feishu_union_id,
      feishu_open_id,
      lark_user_id,
      name,
      email,
      avatar_url,
      source,
      last_verified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, loom_user_id, project_key) DO UPDATE SET
      meego_user_key = excluded.meego_user_key,
      feishu_union_id = excluded.feishu_union_id,
      feishu_open_id = excluded.feishu_open_id,
      lark_user_id = excluded.lark_user_id,
      name = excluded.name,
      email = excluded.email,
      avatar_url = excluded.avatar_url,
      source = excluded.source,
      last_verified_at = excluded.last_verified_at
  `).run(
    mapping.workspace_id,
    mapping.loom_user_id,
    mapping.project_key,
    mapping.meego_user_key,
    mapping.feishu_union_id || null,
    mapping.feishu_open_id || null,
    mapping.lark_user_id || null,
    mapping.name || null,
    mapping.email || null,
    mapping.avatar_url || null,
    mapping.source,
    mapping.last_verified_at || null
  );
  return getFeishuProjectUserMapping(mapping.workspace_id, mapping.loom_user_id, mapping.project_key);
}

export function getFeishuProjectUserMapping(workspaceId, loomUserId, projectKey) {
  ensureFeishuProjectUsersSchema();
  const row = db.prepare(`
    SELECT *
    FROM feishu_project_users
    WHERE workspace_id = ? AND loom_user_id = ? AND project_key = ?
  `).get(
    cleanText(workspaceId).slice(0, 120),
    cleanText(loomUserId).slice(0, 120),
    cleanText(projectKey).slice(0, 160)
  );
  return mapFeishuProjectUserRow(row);
}

export function listFeishuProjectUserMappings(workspaceId, projectKey = "") {
  ensureFeishuProjectUsersSchema();
  const cleanWorkspaceId = cleanText(workspaceId).slice(0, 120);
  const cleanProjectKey = cleanText(projectKey).slice(0, 160);
  if (!cleanWorkspaceId) return [];
  const rows = cleanProjectKey
    ? db.prepare(`
        SELECT *
        FROM feishu_project_users
        WHERE workspace_id = ? AND project_key = ?
        ORDER BY name COLLATE NOCASE ASC, loom_user_id ASC
      `).all(cleanWorkspaceId, cleanProjectKey)
    : db.prepare(`
        SELECT *
        FROM feishu_project_users
        WHERE workspace_id = ?
        ORDER BY project_key ASC, name COLLATE NOCASE ASC, loom_user_id ASC
      `).all(cleanWorkspaceId);
  return rows.map(mapFeishuProjectUserRow);
}

export function listFeedExports(userId) {
  return db.prepare(`
    SELECT *
    FROM feed_exports
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId).map(mapFeedExportRow);
}

export function createFeedExport(userId, input = {}) {
  const record = {
    id: input.id || nanoid(10),
    user_id: userId,
    workspace_id: cleanText(input.workspace_id),
    name: cleanTitle(input.name, "未命名导出"),
    format: cleanText(input.format, "json"),
    scope_type: cleanText(input.scope_type, "group"),
    scope_id: cleanText(input.scope_id),
    item_count: Number(input.item_count || 0),
    payload_json: JSON.stringify(input.payload ?? null),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  db.prepare(`
    INSERT INTO feed_exports (
      id, user_id, workspace_id, name, format, scope_type, scope_id, item_count, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id, record.user_id, record.workspace_id || null, record.name, record.format, record.scope_type, record.scope_id,
    record.item_count, record.payload_json, record.created_at, record.updated_at
  );
  return listFeedExports(userId).find((item) => item.id === record.id) || null;
}

export function upsertFeishuProjectItem(input = {}) {
  const scope = cleanFeishuProjectScope(input);
  const workItemId = cleanText(input.work_item_id || input.workItemId).slice(0, 160);
  const workItemTypeKey = cleanText(input.work_item_type_key || input.workItemTypeKey).slice(0, 160);
  if (!workItemId || !workItemTypeKey) {
    throw new Error("feishu_project_item_missing_required:work_item_id,work_item_type_key");
  }
  const updatedAt = cleanText(input.updated_at || input.updatedAt, nowIso());
  db.prepare(`
    INSERT INTO feishu_project_items (
      workspace_id, project_key, work_item_id, work_item_type_key, work_item_type_name,
      name, status_key, status_name, current_node_key, current_node_name,
      current_owners_json, role_members_json, created_by_json, updated_by_json,
      created_at, updated_at, source_url, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, project_key, work_item_id) DO UPDATE SET
      work_item_type_key = excluded.work_item_type_key,
      work_item_type_name = excluded.work_item_type_name,
      name = excluded.name,
      status_key = excluded.status_key,
      status_name = excluded.status_name,
      current_node_key = excluded.current_node_key,
      current_node_name = excluded.current_node_name,
      current_owners_json = excluded.current_owners_json,
      role_members_json = excluded.role_members_json,
      created_by_json = excluded.created_by_json,
      updated_by_json = excluded.updated_by_json,
      created_at = COALESCE(excluded.created_at, feishu_project_items.created_at),
      updated_at = excluded.updated_at,
      source_url = excluded.source_url,
      raw_json = excluded.raw_json
  `).run(
    scope.workspace_id,
    scope.project_key,
    workItemId,
    workItemTypeKey,
    cleanText(input.work_item_type_name || input.workItemTypeName).slice(0, 160),
    cleanText(input.name || input.title).slice(0, 500),
    cleanText(input.status_key || input.statusKey).slice(0, 120),
    cleanText(input.status_name || input.statusName).slice(0, 160),
    cleanText(input.current_node_key || input.currentNodeKey).slice(0, 160),
    cleanText(input.current_node_name || input.currentNodeName).slice(0, 160),
    safeJsonStringify(input.current_owners ?? input.currentOwners ?? input.current_owners_json, []),
    safeJsonStringify(input.role_members ?? input.roleMembers ?? input.role_members_json, []),
    safeJsonStringify(input.created_by ?? input.createdBy ?? input.created_by_json, {}),
    safeJsonStringify(input.updated_by ?? input.updatedBy ?? input.updated_by_json, {}),
    cleanText(input.created_at || input.createdAt) || null,
    updatedAt,
    cleanText(input.source_url || input.sourceUrl).slice(0, 1000),
    safeJsonStringify(input.raw ?? input.raw_json, {})
  );
  return getFeishuProjectItem(scope.workspace_id, scope.project_key, workItemId);
}

export function getFeishuProjectItem(workspaceId, projectKey, workItemId) {
  const row = db.prepare(`
    SELECT *
    FROM feishu_project_items
    WHERE workspace_id = ? AND project_key = ? AND work_item_id = ?
  `).get(cleanText(workspaceId), cleanText(projectKey), cleanText(workItemId));
  if (!row) return null;
  const fields = db.prepare(`
    SELECT *
    FROM feishu_project_item_fields
    WHERE workspace_id = ? AND project_key = ? AND work_item_id = ?
    ORDER BY field_name ASC, field_key ASC
  `).all(row.workspace_id, row.project_key, row.work_item_id);
  return mapFeishuProjectItemRow(row, fields);
}

export function upsertFeishuProjectFieldConfig(input = {}) {
  const scope = cleanFeishuProjectScope(input);
  const workItemTypeKey = cleanText(input.work_item_type_key || input.workItemTypeKey).slice(0, 160);
  const fieldKey = cleanText(input.field_key || input.fieldKey).slice(0, 160);
  if (!workItemTypeKey || !fieldKey) {
    throw new Error("feishu_project_field_missing_required:work_item_type_key,field_key");
  }
  db.prepare(`
    INSERT INTO feishu_project_fields (
      workspace_id, project_key, work_item_type_key, field_key, field_name,
      field_type, options_json, field_desc, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, project_key, work_item_type_key, field_key) DO UPDATE SET
      field_name = excluded.field_name,
      field_type = excluded.field_type,
      options_json = excluded.options_json,
      field_desc = excluded.field_desc,
      updated_at = excluded.updated_at
  `).run(
    scope.workspace_id,
    scope.project_key,
    workItemTypeKey,
    fieldKey,
    cleanText(input.field_name || input.fieldName).slice(0, 160),
    cleanText(input.field_type || input.fieldType).slice(0, 80),
    safeJsonStringify(input.options ?? input.options_json, []),
    cleanText(input.field_desc || input.fieldDesc).slice(0, 1000),
    cleanText(input.updated_at || input.updatedAt, nowIso())
  );
  return listFeishuProjectFields(scope.workspace_id, scope.project_key, workItemTypeKey).find((field) => field.field_key === fieldKey) || null;
}

export function listFeishuProjectFields(workspaceId, projectKey, workItemTypeKey = "") {
  return db.prepare(`
    SELECT *
    FROM feishu_project_fields
    WHERE workspace_id = ?
      AND project_key = ?
      AND (? = '' OR work_item_type_key = ?)
    ORDER BY field_name ASC, field_key ASC
  `).all(cleanText(workspaceId), cleanText(projectKey), cleanText(workItemTypeKey), cleanText(workItemTypeKey)).map(mapFeishuProjectFieldRow);
}

export function upsertFeishuProjectItemField(input = {}) {
  const scope = cleanFeishuProjectScope(input);
  const workItemId = cleanText(input.work_item_id || input.workItemId).slice(0, 160);
  const fieldKey = cleanText(input.field_key || input.fieldKey).slice(0, 160);
  if (!workItemId || !fieldKey) {
    throw new Error("feishu_project_item_field_missing_required:work_item_id,field_key");
  }
  db.prepare(`
    INSERT INTO feishu_project_item_fields (
      workspace_id, project_key, work_item_id, field_key, field_name,
      field_type, value_json, value_text, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, project_key, work_item_id, field_key) DO UPDATE SET
      field_name = excluded.field_name,
      field_type = excluded.field_type,
      value_json = excluded.value_json,
      value_text = excluded.value_text,
      updated_at = excluded.updated_at
  `).run(
    scope.workspace_id,
    scope.project_key,
    workItemId,
    fieldKey,
    cleanText(input.field_name || input.fieldName).slice(0, 160),
    cleanText(input.field_type || input.fieldType).slice(0, 80),
    safeJsonStringify(input.value ?? input.value_json, {}),
    cleanText(input.value_text || input.valueText).slice(0, 2000),
    cleanText(input.updated_at || input.updatedAt, nowIso())
  );
  return mapFeishuProjectItemFieldRow(db.prepare(`
    SELECT *
    FROM feishu_project_item_fields
    WHERE workspace_id = ? AND project_key = ? AND work_item_id = ? AND field_key = ?
  `).get(scope.workspace_id, scope.project_key, workItemId, fieldKey));
}

export function upsertFeishuProjectIdeaLink(input = {}) {
  const scope = cleanFeishuProjectScope(input);
  const workItemId = cleanText(input.work_item_id || input.workItemId).slice(0, 160);
  if (!workItemId) throw new Error("feishu_project_idea_link_missing_required:work_item_id");
  const now = nowIso();
  db.prepare(`
    INSERT INTO feishu_project_idea_links (
      workspace_id, project_key, work_item_id, research_id, link_status, imported_at, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, project_key, work_item_id) DO UPDATE SET
      research_id = excluded.research_id,
      link_status = excluded.link_status,
      imported_at = COALESCE(feishu_project_idea_links.imported_at, excluded.imported_at),
      last_synced_at = excluded.last_synced_at
  `).run(
    scope.workspace_id,
    scope.project_key,
    workItemId,
    cleanText(input.research_id || input.researchId).slice(0, 160),
    cleanText(input.link_status || input.linkStatus, "imported").slice(0, 80),
    cleanText(input.imported_at || input.importedAt, now),
    cleanText(input.last_synced_at || input.lastSyncedAt, now)
  );
  return getFeishuProjectIdeaLink(scope.workspace_id, scope.project_key, workItemId);
}

export function getFeishuProjectIdeaLink(workspaceId, projectKey, workItemId) {
  return mapFeishuProjectIdeaLinkRow(db.prepare(`
    SELECT *
    FROM feishu_project_idea_links
    WHERE workspace_id = ? AND project_key = ? AND work_item_id = ?
  `).get(cleanText(workspaceId), cleanText(projectKey), cleanText(workItemId)));
}

export function listFeishuProjectIdeaLinks(workspaceId, filters = {}) {
  const projectKey = cleanText(filters.project_key || filters.projectKey).slice(0, 160);
  return db.prepare(`
    SELECT *
    FROM feishu_project_idea_links
    WHERE workspace_id = ?
      AND (? = '' OR project_key = ?)
    ORDER BY last_synced_at DESC, imported_at DESC
  `).all(cleanText(workspaceId), projectKey, projectKey).map(mapFeishuProjectIdeaLinkRow);
}

export function markSynced(userId, kind, records) {
  if (kind === "news") {
    const syncedAt = nowIso();
    const stmt = db.prepare(`
      UPDATE news_items
      SET synced_at = ?, feishu_record_id = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `);
    const tx = db.transaction((rows) => {
      for (const record of rows) {
        stmt.run(syncedAt, record.record_id || null, syncedAt, record.local_id, userId);
      }
    });
    tx(records);
    return { synced_at: syncedAt, count: records.length };
  }
  return mutateUserState(userId, (state) => {
    const list = state[kind] || [];
    const syncedAt = nowIso();
    for (const record of records) {
      const item = list.find((entry) => entry.id === record.local_id);
      if (item) {
        item.synced_at = syncedAt;
        if (record.record_id) item.feishu_record_id = record.record_id;
      }
    }
    return { synced_at: syncedAt, count: records.length };
  });
}

export function ensureLegacyWorkspace() {
  const existing = findUserById(getLegacyUserId());
  const user = existing || ensureLocalUser({
    id: getLegacyUserId(),
    name: "visitor",
    initials: "VI",
    role: "产品经理",
    auth_provider: "password",
  });
  ensureMockSampleUser();
  ensureUserState(user);
  if (ENABLE_PUBLIC_SAMPLE_DATA) {
    ensureSampleUserState(user, { force: true });
    syncVisitorSampleWorkspaceFromSource();
    ensureSampleNewsSources(user.id);
    ensureDefaultNewsSources(user.id);
  }
  return user;
}

export {
  acquireLock,
  getUserIdByApiToken,
  releaseLock,
  revokeApiToken,
  revokeUserApiTokens,
  upsertApiToken,
};
