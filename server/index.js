import "dotenv/config";
import express from "express";
import session from "express-session";
import SQLiteStoreFactory from "connect-sqlite3";
import fs from "node:fs";
import signature from "cookie-signature";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSeed } from "./db.js";
import { isAdmin, isOwner } from "./access-control.js";
import adminRouter from "./admin-routes.js";
import { AppError, isLLMConfigured, isVisionLLMConfigured, testLLM, testVisionLLM } from "./ai-service.js";
import {
  apiToken,
  buildFeishuAuthUrl,
  buildSessionUser,
  createOauthState,
  exchangeFeishuCode,
  fetchFeishuUserInfo,
  findPasswordAuthAccount,
  getFeishuOauthConfig,
  getPasswordAuthConfig,
  isFeishuUserAllowed,
  validateAuthConfig,
} from "./auth-service.js";
import { parseDemandRaw, parseDemandUrl, parseProductRaw, parseProductUrl } from "./parsers.js";
import { matchFieldKey, matchFieldOption, normalizeTagValues } from "./field-matcher.js";
import { collectDueSources, collectSources, processNewsWithLlm } from "./rss-service.js";
import { analyzeResearch } from "./research-service.js";
import { submitFeedbackToFeishu, syncFeishuForUser, testFeishuForUser } from "./feishu-service.js";
import {
  getDocumentImportResult,
  importFeishuDocument,
  importPastedDocument,
  retryDocumentImport,
} from "./document-import-service.js";
import { generateMrdDraft, generatePrdDraft } from "./document-generation-service.js";
import { patchDocumentSection, publishDocument } from "./document-access-service.js";
import {
  exportDocumentToFeishu,
  exportSalesDocument,
  exportSupplierDocument,
} from "./feishu-doc-export-service.js";
import { syncDocumentReviewToFeishuBase, syncKnowledgeGapToFeishu } from "./feishu-base-sync-service.js";
import { handleFeishuBotQuestion } from "./feishu-bot-service.js";
import { withCachedImageFields } from "./media-cache-service.js";
import { indexKnowledgeRecord } from "./knowledge-indexer.js";
import { generateProjectKnowledgePack, generateResearchKnowledgePack } from "./knowledge-pack-service.js";
import { evaluateKnowledgeRegression, listKnowledgeQueryLogs, queryKnowledge } from "./knowledge-query-service.js";
import {
  assertSameWorkspace,
  authorizedChunkPredicate,
  canAccessDocument,
  resolveUserWorkspace,
  roleCodesForUser,
} from "./knowledge-access-service.js";
import {
  createDocument,
  createProject,
  getDocument,
  getProject,
  listDocumentImports,
  getKnowledgeGap,
  getKnowledgeEntity,
  getKnowledgeEntityGraph,
  getKnowledgeFusionCandidate,
  getKnowledgePack,
  listKnowledgeEntities,
  listKnowledgeFusionCandidates,
  listDocumentTemplates,
  listDocuments,
  listProductTypeTemplates,
  listProjects,
  updateKnowledgeFusionCandidate,
  updateDocument,
  updateProject,
  upsertDocumentTemplate,
  upsertProductTypeTemplate,
} from "./knowledge-repository.js";
import { loadInitialData } from "./seed.js";
import { applySealConfig } from "./seal-config.js";
import { isRecentSampleNews, isSampleWorkspace } from "./sample-workspace.js";
import {
  buildFeedHubBootstrap,
  buildGroupFeed,
  buildHubOpml,
  buildSourceFeed,
  exportGroupArchive,
  renderFreshRssReadingList,
} from "./feed-hub-service.js";
import {
  assignSourceToFeedGroup,
  bootstrap,
  acquireLock,
  createNewsSource,
  createFeedDestination,
  createFeedGroup,
  createDemand,
  createField,
  createProduct,
  createResearch,
  deleteDemand,
  deleteFeedDestination,
  deleteFeedGroup,
  deleteField,
  deleteNews,
  deleteNewsSource,
  deleteProduct,
  deleteResearch,
  addFieldOption,
  ensureLegacyWorkspace,
  ensureLocalUser,
  ensureDefaultWorkspaceForUser,
  getUserIdByApiToken,
  findUserByEmail,
  findUserByFeishuProfile,
  findUserById,
  finishSampleWorkspace,
  importWechatExporterAccounts,
  listFields,
  listAllUsers,
  listNews,
  listNewsSources,
  pruneNewsOlderThan,
  rawState,
  revokeApiToken,
  revokeUserApiTokens,
  upsertApiToken,
  releaseLock,
  resetRegularUsersToSampleWorkspace,
  syncOfficialNewsToAllUsers,
  syncOfficialNewsToUser,
  ensureOfficialNewsCache,
  ensureFeedAccessToken,
  findUserIdByFeedAccessToken,
  touchUserLogin,
  listFeedDestinations,
  listFeedGroups,
  updateDemand,
  updateFeedDestination,
  updateFeedGroup,
  updateField,
  updateNews,
  updateNewsSource,
  updateProduct,
  updateResearch,
  updateSettings,
  removeFieldOption,
  visibleNewsItems,
} from "./repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const uploadsDir = process.env.UPLOADS_DIR || path.join(projectRoot, "uploads");
const app = express();
const port = Number(process.env.PORT || 3000);
const SQLiteStore = SQLiteStoreFactory(session);
const wechatExporterAccountsPath = process.env.WECHAT_EXPORTER_ACCOUNTS_PATH || path.join(projectRoot, "data", "wechat-exporter-accounts.json");
const wechatExporterSourceIntervalMinutes = Number(process.env.WECHAT_EXPORTER_SOURCE_INTERVAL_MINUTES || 1440);
const rsshubBaseUrl = String(process.env.RSSHUB_BASE_URL || "").trim();
const wechatCollectHours = String(process.env.WECHAT_COLLECT_HOURS || "9,21")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 0 && value <= 23);
const wechatCacheDays = Math.max(1, Number(process.env.WECHAT_CACHE_DAYS || 10));
const wechatCollectTimezone = process.env.WECHAT_COLLECT_TIMEZONE || "Asia/Shanghai";
const sessionCookieSecure = process.env.SESSION_COOKIE_SECURE === "true"
  ? true
  : process.env.SESSION_COOKIE_SECURE === "false"
    ? false
    : "auto";

validateAuthConfig();
ensureSeed(loadInitialData());
const legacyUser = ensureLegacyWorkspace();
const sealConfigResult = applySealConfig();
if (sealConfigResult.configured) {
  console.log(`LOOM seal config applied: workspaces=${sealConfigResult.workspaces} sources=${sealConfigResult.newsSources}`);
}
const sampleRefreshInFlight = new Set();
const requestLogEnabled = ["1", "true", "yes"].includes(String(process.env.LOOM_REQUEST_LOG || "").toLowerCase());

app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
const sessionStore = new SQLiteStore({ dir: process.env.DATA_DIR || path.join(projectRoot, "data"), db: "sessions.sqlite" });
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || "loom-dev-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: sessionCookieSecure,
    maxAge: 1000 * 60 * 60 * 24 * 14,
  },
}));

app.use((req, res, next) => {
  if (!requestLogEnabled || !req.path.startsWith("/api/")) {
    next();
    return;
  }
  const startedAt = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const userId = String(res.locals.loomUserId || req.session?.userId || "");
    const fields = [
      "loom:api",
      req.method,
      req.path,
      `status=${res.statusCode}`,
      `duration=${durationMs}ms`,
      userId ? `userId=${userId}` : "userId=-",
    ];
    console.log(fields.join(" "));
  });
  next();
});

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function handleError(error, _req, res, _next) {
  if (error instanceof AppError) {
    return res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
  }
  console.error(error);
  res.status(500).json({ error: "internal_error", message: error.message || "服务器错误" });
}

function safeReturnTo(value) {
  try {
    const base = "https://loom.local";
    const parsed = new URL(String(value || "/"), base);
    if (parsed.origin !== base) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
  } catch {
    return "/";
  }
}

function currentUserId(req) {
  if (req.session.userId) return String(req.session.userId);
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const tokenUserId = token ? getUserIdByApiToken(token) : "";
  if (token && tokenUserId) return tokenUserId;
  return "";
}

function currentUser(req) {
  const userId = currentUserId(req);
  const user = userId ? findUserById(userId) : null;
  return user?.status === "active" ? user : null;
}

function feedBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  ensureDefaultWorkspaceForUser(user);
  res.locals.loomUserId = user.id;
  req.session.userId = user.id;
  req.session.user = sessionUserResponse(user);
  next();
}

function requestWorkspaceId(req, source = "body") {
  const user = currentUser(req);
  const container = source === "query" ? req.query : req.body;
  return resolveUserWorkspace(user, container?.workspace_id);
}

function resourceInRequestWorkspace(req, resource, label = "resource") {
  return assertSameWorkspace(resource, requestWorkspaceId(req), label);
}

function currentWorkspaceRoles(req, workspaceId) {
  return roleCodesForUser(currentUser(req), workspaceId);
}

function canManageWorkspaceResource(req, resource) {
  const user = currentUser(req);
  const roles = currentWorkspaceRoles(req, resource?.workspace_id);
  return Boolean(
    resource?.owner_user_id === user?.id ||
    roles.includes("owner") ||
    roles.includes("admin") ||
    user?.role_code === "owner" ||
    user?.role_code === "admin"
  );
}

function assertCanManageResource(req, resource, label = "resource") {
  if (!resource) return null;
  resourceInRequestWorkspace(req, resource, label);
  if (!canManageWorkspaceResource(req, resource)) {
    throw new AppError(403, "resource_forbidden", "无权修改该资源。");
  }
  return resource;
}

function assertCanReadDocument(req, document) {
  if (!document) return null;
  resourceInRequestWorkspace(req, document, "document");
  if (!canAccessDocument(document, {
    user: currentUser(req),
    roles: currentWorkspaceRoles(req, document.workspace_id),
  })) {
    throw new AppError(404, "document_not_found", "文档不存在或无权访问。");
  }
  return document;
}

function sourceDocumentIds(resource) {
  const refs = Array.isArray(resource?.source_refs) ? resource.source_refs : [];
  return [...new Set(refs.map((ref) => String(ref?.document_id || "").trim()).filter(Boolean))];
}

function canAccessKnowledgeResource(req, resource) {
  resourceInRequestWorkspace(req, resource, "knowledge_resource");
  const documentIds = sourceDocumentIds(resource);
  if (!documentIds.length) return true;
  return documentIds.every((documentId) => {
    const document = getDocument(documentId);
    return document && document.workspace_id === resource.workspace_id && canAccessDocument(document, {
      user: currentUser(req),
      roles: currentWorkspaceRoles(req, resource.workspace_id),
    });
  });
}

function filterReadableKnowledgeEntities(req, entities) {
  return entities.filter((entity) => canAccessKnowledgeResource(req, entity));
}

function packForGeneration(req, pack) {
  if (!pack) return null;
  const accessContext = {
    user: currentUser(req),
    user_id: currentUserId(req),
    roles: currentWorkspaceRoles(req, pack.workspace_id),
  };
  return {
    ...pack,
    chunks: (pack.chunks || []).filter(authorizedChunkPredicate(accessContext)),
    sources: pack.sources || [],
  };
}

function draftGenerationInput(req, workspaceId, pack) {
  return {
    workspace_id: workspaceId,
    owner_user_id: currentUserId(req),
    project_id: req.body?.project_id,
    pack_id: req.body?.pack_id,
    title: req.body?.title,
    product_type_code: req.body?.product_type_code,
    product_type_template: req.body?.product_type_template,
    enabled_modules: req.body?.enabled_modules,
    strong_model: req.body?.strong_model,
    llm: req.body?.llm,
    ...(pack ? { pack: packForGeneration(req, pack) } : {}),
  };
}

function sessionUserResponse(user) {
  return {
    id: user.id,
    name: user.name,
    initials: user.initials,
    role: user.role,
    role_code: user.role_code || "member",
    email: user.email || "",
    auth_provider: user.auth_provider,
    is_admin: isAdmin(user),
    is_owner: isOwner(user),
    is_visitor: user.id === legacyUser.id,
  };
}

function accountDisabledResponse(user, res) {
  if (user?.status === "active") return false;
  res.status(403).json({ error: "account_disabled", message: "当前账号已停用。" });
  return true;
}

function getSessionIdFromCookieValue(cookieValue) {
  const raw = String(cookieValue || "").trim();
  if (!raw) return "";
  let normalized = raw;
  if (!normalized.startsWith("s:")) {
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      normalized = raw;
    }
  }
  if (!normalized.startsWith("s:")) return "";
  const unsigned = signature.unsign(normalized.slice(2), process.env.SESSION_SECRET || "loom-dev-secret-change-me");
  return unsigned || "";
}

function loadUserFromSessionCookie(cookieValue) {
  const sessionId = getSessionIdFromCookieValue(cookieValue);
  if (!sessionId) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    sessionStore.get(sessionId, (error, sessionData) => {
      if (error) return reject(error);
      const userId = String(sessionData?.userId || "").trim();
      if (!userId) return resolve(null);
      resolve(findUserById(userId) || null);
    });
  });
}

function sampleNewsReady(userId) {
  const state = rawState(userId);
  if (!isSampleWorkspace(state)) return true;
  return listNews(userId).some((item) => isRecentSampleNews(item));
}

function refreshSampleWorkspaceNews(userId, { force = false } = {}) {
  const state = rawState(userId);
  if (!isSampleWorkspace(state)) return;
  if (!force && sampleNewsReady(userId)) return;
  if (sampleRefreshInFlight.has(userId)) return;
  sampleRefreshInFlight.add(userId);
  setImmediate(async () => {
    try {
      const collected = await collectSources(legacyUser.id, listNewsSources(legacyUser.id));
      await processCollectedNewsWithLlm(legacyUser.id, collected);
      syncOfficialNewsToUser(userId);
    } catch (error) {
      console.error("Sample workspace news refresh failed", error);
    } finally {
      sampleRefreshInFlight.delete(userId);
    }
  });
}

function signInLegacyUser(req, res) {
  refreshSampleWorkspaceNews(legacyUser.id);
  const state = bootstrap(legacyUser.id);
  const token = apiToken();
  revokeUserApiTokens(legacyUser.id);
  upsertApiToken(token, legacyUser.id);
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: "session_regenerate_failed" });
    touchUserLogin(legacyUser.id);
    res.locals.loomUserId = legacyUser.id;
    req.session.userId = legacyUser.id;
    req.session.user = sessionUserResponse(legacyUser);
    res.json({ user: state.user, token });
  });
}

function passwordUserId(username) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!normalized) return "password-user";
  const safe = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return safe ? `password-${safe}` : `password-user`;
}

function ensurePasswordUser(account = getPasswordAuthConfig()) {
  const { username } = account;
  const normalizedEmail = String(username || "").trim().toLowerCase();
  const ownerEmail = String(process.env.LOOM_OWNER_EMAIL || "").trim().toLowerCase();
  const existing = normalizedEmail ? findUserByEmail(normalizedEmail) : null;
  const isConfiguredOwner = ownerEmail && normalizedEmail === ownerEmail;
  return ensureLocalUser({
    ...(existing || {}),
    id: existing?.id || passwordUserId(username),
    email: username.includes("@") ? username : existing?.email || "",
    name: existing?.name || username,
    initials: String(username || "L").trim().replace(/\s+/g, "").slice(0, 2).toUpperCase() || "L",
    role: isConfiguredOwner ? "主理人" : existing?.role || "成员",
    role_code: isConfiguredOwner ? "owner" : existing?.role_code || "member",
    auth_provider: "password",
    withDefaultWorkspace: isConfiguredOwner || normalizedEmail === String(process.env.APP_USERNAME || "").trim().toLowerCase(),
  });
}

function signInPasswordUser(req, res, account) {
  const user = ensurePasswordUser(account);
  if (accountDisabledResponse(user, res)) return;
  const token = apiToken();
  revokeUserApiTokens(user.id);
  upsertApiToken(token, user.id);
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: "session_regenerate_failed" });
    touchUserLogin(user.id);
    res.locals.loomUserId = user.id;
    req.session.userId = user.id;
    req.session.user = sessionUserResponse(user);
    res.json({ user: sessionUserResponse(user), token });
  });
}

async function processCollectedNewsWithLlm(userId, collected) {
  const changed = Number(collected?.inserted || 0) + Number(collected?.updated || 0);
  if (!isLLMConfigured(userId)) {
    return {
      processed: 0,
      kept: 0,
      filtered: 0,
      failed: 0,
      skipped: true,
      reason: "llm_not_configured",
      remaining: 0,
    };
  }
  try {
    return await processNewsWithLlm(userId, Math.min(100, Math.max(20, changed)));
  } catch (error) {
    console.error("News LLM translation failed", error);
    return {
      processed: 0,
      kept: 0,
      filtered: 0,
      failed: 1,
      errors: [{ message: error.message || "LLM 处理失败" }],
    };
  }
}

function loadWechatExporterManifest() {
  if (!wechatExporterAccountsPath || !fs.existsSync(wechatExporterAccountsPath)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(wechatExporterAccountsPath, "utf8"));
    if (payload?.usefor !== "wechat-article-exporter" || !Array.isArray(payload?.accounts)) return null;
    return payload;
  } catch (error) {
    console.error("Failed to read wechat exporter accounts manifest", error);
    return null;
  }
}

function syncWechatExporterSourcesForUser(userId) {
  const manifest = loadWechatExporterManifest();
  if (!manifest) return null;
  return importWechatExporterAccounts(userId, manifest, {
    interval: wechatExporterSourceIntervalMinutes,
    type: rsshubBaseUrl ? "rss" : "wechat_exporter",
    adapter_type: rsshubBaseUrl ? "rsshub_wechat" : "wechat_exporter",
    rsshubBaseUrl,
    maxPerSource: Number(process.env.WECHAT_EXPORTER_MAX_PER_SOURCE || 20),
  });
}

function officialRssSources() {
  return listNewsSources(legacyUser.id).filter((source) => String(source.source_group || source.group || "").toLowerCase() !== "wechat-exporter");
}

function officialWechatSources() {
  return listNewsSources(legacyUser.id).filter((source) => String(source.source_group || source.group || "").toLowerCase() === "wechat-exporter");
}

async function collectOfficialRssSources() {
  const collected = await collectDueSources(legacyUser.id, officialRssSources());
  await processCollectedNewsWithLlm(legacyUser.id, collected);
  pruneNewsOlderThan(legacyUser.id, { sourceGroups: ["official-default", "sample-live"], olderThanDays: wechatCacheDays });
  syncOfficialNewsToAllUsers();
  return collected;
}

async function collectOfficialWechatSources({ force = false } = {}) {
  syncWechatExporterSourcesForUser(legacyUser.id);
  const sources = force ? officialWechatSources() : officialWechatSources().filter((source) => {
    if (!source.last_fetched_at) return true;
    const next = new Date(source.last_fetched_at).getTime() + Math.max(1, Number(source.fetch_interval || wechatExporterSourceIntervalMinutes)) * 60 * 1000;
    return Date.now() >= next;
  });
  const collected = await collectSources(legacyUser.id, sources);
  pruneNewsOlderThan(legacyUser.id, { sourceGroups: ["wechat-exporter"], olderThanDays: wechatCacheDays });
  syncOfficialNewsToAllUsers();
  return collected;
}

app.use((req, _res, next) => {
  req.currentUser = () => currentUser(req);
  next();
});

app.use("/api/admin", adminRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "loom", time: new Date().toISOString() });
});

app.get("/api/auth/providers", (_req, res) => {
  res.json({
    password: true,
    feishu: getFeishuOauthConfig().enabled,
  });
});

app.post("/api/auth/login", (req, res) => {
  const account = findPasswordAuthAccount(req.body?.username, req.body?.password);
  if (!account) {
    return res.status(401).json({ error: "用户名或密码不正确" });
  }
  signInPasswordUser(req, res, account);
});

app.post("/api/auth/visitor", (req, res) => {
  signInLegacyUser(req, res);
});

app.get("/api/auth/feishu/start", (req, res) => {
  const state = createOauthState();
  req.session.oauthState = state;
  req.session.oauthReturnTo = safeReturnTo(req.query.return_to);
  res.redirect(buildFeishuAuthUrl(state));
});

app.get("/api/auth/feishu/callback", asyncHandler(async (req, res) => {
  const code = String(req.query.code || "").trim();
  const state = String(req.query.state || "").trim();
  const expectedState = String(req.session.oauthState || "").trim();
  const returnTo = String(req.session.oauthReturnTo || "/");
  const oauthConfig = getFeishuOauthConfig();

  delete req.session.oauthState;
  delete req.session.oauthReturnTo;

  if (!code) throw new AppError(400, "missing_feishu_code", "飞书登录失败：缺少授权码。");
  if (!state || !expectedState || state !== expectedState) {
    throw new AppError(400, "invalid_oauth_state", "飞书登录失败：请求状态校验未通过。");
  }

  const tokenResult = await exchangeFeishuCode(code);
  const profile = await fetchFeishuUserInfo(tokenResult.access_token || tokenResult.user_access_token || "");
  if (!isFeishuUserAllowed(profile)) {
    throw new AppError(403, "feishu_user_not_allowed", "当前飞书账号不在允许名单内。");
  }

  let localUser = findUserByFeishuProfile(profile);
  if (!localUser) {
    if (!oauthConfig.autoProvision) {
      throw new AppError(403, "feishu_user_not_registered", "当前飞书账号尚未开通 LOOM 账号。");
    }
    localUser = ensureLocalUser({
      name: profile.name || profile.en_name || "LOOM",
      email: profile.enterprise_email || profile.email || "",
      role: "成员",
      auth_provider: "feishu",
      feishu_open_id: profile.open_id || null,
      feishu_union_id: profile.union_id || null,
      feishu_tenant_key: profile.tenant_key || null,
      avatar_url: profile.avatar_url || "",
      last_login_at: new Date().toISOString(),
      withSampleWorkspace: true,
    });
  } else {
    localUser = ensureLocalUser({
      ...localUser,
      name: profile.name || profile.en_name || localUser.name,
      email: profile.enterprise_email || profile.email || localUser.email,
      auth_provider: "feishu",
      feishu_open_id: profile.open_id || localUser.feishu_open_id,
      feishu_union_id: profile.union_id || localUser.feishu_union_id,
      feishu_tenant_key: profile.tenant_key || localUser.feishu_tenant_key,
      avatar_url: profile.avatar_url || localUser.avatar_url,
      last_login_at: new Date().toISOString(),
    });
  }

  if (localUser.status !== "active") {
    throw new AppError(403, "account_disabled", "当前账号已停用。");
  }

  req.session.regenerate((error) => {
    if (error) {
      console.error("feishu session regenerate failed", error);
      return res.redirect("/app/?login_error=session_regenerate_failed");
    }
    req.session.userId = localUser.id;
    req.session.user = buildSessionUser(sessionUserResponse(localUser), profile);
    res.locals.loomUserId = localUser.id;
    touchUserLogin(localUser.id);
    refreshSampleWorkspaceNews(localUser.id);
    res.redirect(safeReturnTo(returnTo));
  });
}));

app.post("/api/auth/logout", (req, res) => {
  const user = currentUser(req);
  if (user?.id) res.locals.loomUserId = user.id;
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token) revokeApiToken(token);
  if (user?.id) revokeUserApiTokens(user.id);
  req.session.destroy(() => {
    res.clearCookie("connect.sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: sessionCookieSecure,
      path: "/",
    });
    res.json({ ok: true });
  });
});

app.get("/api/me", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  res.json({ user: sessionUserResponse(user) });
});

app.post("/api/auth/extension/session-token", asyncHandler(async (req, res) => {
  const cookieValue = String(req.body?.session_cookie || "").trim();
  const sessionUser = currentUser(req);
  const user = sessionUser || (cookieValue ? await loadUserFromSessionCookie(cookieValue) : null);
  if (!user) {
    throw new AppError(401, cookieValue ? "invalid_session_cookie" : "missing_session_cookie", "当前 Web 登录已失效，请重新登录。");
  }
  if (user.status !== "active") {
    throw new AppError(403, "account_disabled", "当前账号已停用。");
  }

  const token = apiToken();
  revokeUserApiTokens(user.id);
  upsertApiToken(token, user.id);
  res.locals.loomUserId = user.id;
  touchUserLogin(user.id);
  refreshSampleWorkspaceNews(user.id);
  res.json({ token, user: sessionUserResponse(user) });
}));

app.get("/api/bootstrap", requireAuth, (req, res) => {
  const userId = currentUserId(req);
  refreshSampleWorkspaceNews(userId);
  ensureOfficialNewsCache(userId);
  res.json(bootstrap(userId));
});

app.get("/api/projects", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req, "query");
  res.json(listProjects(workspaceId));
});

app.post("/api/projects", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req);
  res.status(201).json(createProject({ ...(req.body || {}), workspace_id: workspaceId, owner_user_id: currentUserId(req) }));
});

app.patch("/api/projects/:id", requireAuth, (req, res) => {
  const current = getProject(req.params.id);
  if (!current) return res.status(404).json({ error: "project_not_found" });
  assertCanManageResource(req, current, "project");
  res.json(updateProject(req.params.id, req.body || {}));
});

app.get("/api/documents", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req, "query");
  const roles = currentWorkspaceRoles(req, workspaceId);
  const user = currentUser(req);
  const documents = listDocuments(workspaceId, {
    project_id: req.query?.project_id,
    doc_type: req.query?.doc_type,
  }).filter((document) => canAccessDocument(document, { user, roles }));
  res.json(documents);
});

app.get("/api/document-imports", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req, "query");
  res.json(listDocumentImports(workspaceId, {
    project_id: req.query?.project_id,
    doc_type: req.query?.doc_type,
    status: req.query?.status,
    limit: req.query?.limit,
  }));
});

app.post("/api/documents", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req);
  res.status(201).json(createDocument({ ...(req.body || {}), workspace_id: workspaceId, owner_user_id: currentUserId(req) }));
});

app.get("/api/documents/:id", requireAuth, (req, res) => {
  const document = getDocument(req.params.id);
  if (!document) return res.status(404).json({ error: "document_not_found" });
  res.json(assertCanReadDocument(req, document));
});

app.patch("/api/documents/:id", requireAuth, (req, res) => {
  const current = getDocument(req.params.id);
  if (!current) return res.status(404).json({ error: "document_not_found" });
  assertCanManageResource(req, current, "document");
  res.json(updateDocument(req.params.id, req.body || {}));
});

app.get("/api/document-templates", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req, "query");
  res.json(listDocumentTemplates(workspaceId, req.query?.doc_type || ""));
});

app.post("/api/document-templates", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req);
  res.status(201).json(upsertDocumentTemplate({ ...(req.body || {}), workspace_id: workspaceId }));
});

app.get("/api/product-type-templates", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req, "query");
  res.json(listProductTypeTemplates(workspaceId));
});

app.post("/api/product-type-templates", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req);
  res.status(201).json(upsertProductTypeTemplate({ ...(req.body || {}), workspace_id: workspaceId }));
});

app.post("/api/document-imports/paste", requireAuth, asyncHandler(async (req, res) => {
  const workspaceId = requestWorkspaceId(req);
  const result = await importPastedDocument({
    ...(req.body || {}),
    workspace_id: workspaceId,
    created_by: currentUserId(req),
  });
  res.status(201).json(result);
}));

app.post("/api/document-imports/feishu", requireAuth, asyncHandler(async (req, res) => {
  const workspaceId = requestWorkspaceId(req);
  const result = await importFeishuDocument({
    ...(req.body || {}),
    workspace_id: workspaceId,
    created_by: currentUserId(req),
  });
  res.status(result.document ? 201 : 422).json(result);
}));

app.get("/api/document-imports/:id", requireAuth, (req, res) => {
  const result = getDocumentImportResult(req.params.id);
  if (!result) return res.status(404).json({ error: "document_import_not_found" });
  resourceInRequestWorkspace(req, result.import, "document_import");
  res.json(result);
});

app.post("/api/document-imports/:id/retry", requireAuth, asyncHandler(async (req, res) => {
  const current = getDocumentImportResult(req.params.id);
  if (!current) return res.status(404).json({ error: "document_import_not_found" });
  resourceInRequestWorkspace(req, current.import, "document_import");
  const result = await retryDocumentImport(req.params.id);
  res.json(result);
}));

app.get("/api/knowledge/entities", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req, "query");
  const entities = listKnowledgeEntities(workspaceId, {
    project_id: req.query?.project_id,
    entity_type: req.query?.entity_type,
    status: req.query?.status || "active",
  });
  res.json(filterReadableKnowledgeEntities(req, entities));
});

app.get("/api/knowledge/entities/:id/graph", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req, "query");
  const entity = getKnowledgeEntity(req.params.id);
  if (!entity || entity.workspace_id !== workspaceId) return res.status(404).json({ error: "knowledge_entity_not_found" });
  if (!canAccessKnowledgeResource(req, entity)) return res.status(404).json({ error: "knowledge_entity_not_found" });
  const graph = getKnowledgeEntityGraph(workspaceId, req.params.id, { depth: req.query?.depth });
  const readableNodes = filterReadableKnowledgeEntities(req, graph.nodes);
  const readableIds = new Set(readableNodes.map((node) => node.id));
  res.json({
    nodes: readableNodes,
    edges: graph.edges.filter((edge) => readableIds.has(edge.from_entity_id) && readableIds.has(edge.to_entity_id)),
  });
});

app.get("/api/knowledge/fusion-candidates", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req, "query");
  res.json(listKnowledgeFusionCandidates(workspaceId, {
    project_id: req.query?.project_id,
    status: req.query?.status || "pending",
  }));
});

app.patch("/api/knowledge/fusion-candidates/:id", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req);
  const current = getKnowledgeFusionCandidate(req.params.id);
  if (!current || current.workspace_id !== workspaceId) return res.status(404).json({ error: "knowledge_fusion_candidate_not_found" });
  assertCanManageResource(req, { ...current, owner_user_id: current.created_by }, "knowledge_fusion_candidate");
  let updated;
  try {
    updated = updateKnowledgeFusionCandidate(req.params.id, {
      status: req.body?.status,
      reason: req.body?.reason,
      confidence: req.body?.confidence,
    });
  } catch (error) {
    if (String(error.message || "").startsWith("invalid_fusion_status")) {
      throw new AppError(400, error.message, "无效的知识合并状态流转。");
    }
    throw error;
  }
  res.json(updated);
});

app.post("/api/knowledge/index", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req);
  const result = indexKnowledgeRecord({
    ...(req.body?.record || req.body || {}),
    workspace_id: workspaceId,
  }, req.body?.source_type);
  res.json(result);
});

app.post("/api/knowledge/packs/build", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req);
  const payload = {
    ...(req.body || {}),
    workspace_id: workspaceId,
    created_by: currentUserId(req),
  };
  const result = payload.pack_type === "research" || payload.research_id
    ? generateResearchKnowledgePack(payload)
    : generateProjectKnowledgePack(payload);
  res.status(201).json(result);
});

app.get("/api/knowledge/packs/:id", requireAuth, (req, res) => {
  const pack = getKnowledgePack(req.params.id);
  if (!pack) return res.status(404).json({ error: "knowledge_pack_not_found" });
  resourceInRequestWorkspace(req, pack, "knowledge_pack");
  res.json(pack);
});

app.post("/api/knowledge/query", requireAuth, asyncHandler(async (req, res) => {
  const workspaceId = requestWorkspaceId(req);
  res.json(await queryKnowledge({
    ...(req.body || {}),
    workspace_id: workspaceId,
    user_id: currentUserId(req),
    user: currentUser(req),
    roles: currentWorkspaceRoles(req, workspaceId),
  }));
}));

app.get("/api/knowledge/query-logs", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req, "query");
  res.json(listKnowledgeQueryLogs(workspaceId, req.query?.limit));
});

app.post("/api/knowledge/evaluate", requireAuth, asyncHandler(async (req, res) => {
  const workspaceId = requestWorkspaceId(req);
  if (Array.isArray(req.body?.cases)) {
    return res.json(await evaluateKnowledgeRegression({
      ...(req.body || {}),
      workspace_id: workspaceId,
      user_id: currentUserId(req),
      user: currentUser(req),
      roles: currentWorkspaceRoles(req, workspaceId),
    }));
  }
  const result = await queryKnowledge({
    ...(req.body || {}),
    workspace_id: workspaceId,
    user_id: currentUserId(req),
    user: currentUser(req),
    roles: currentWorkspaceRoles(req, workspaceId),
  });
  res.json({
    ok: result.mode !== "refused",
    mode: result.mode,
    confidence: result.confidence,
    citation_count: result.citations.length,
    needs_review: result.needs_review,
    gaps: result.gaps,
  });
}));

app.post("/api/documents/mrd/draft", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req);
  const pack = req.body?.pack_id ? getKnowledgePack(req.body.pack_id) : null;
  if (req.body?.pack_id && !pack) return res.status(404).json({ error: "knowledge_pack_not_found" });
  if (pack) resourceInRequestWorkspace(req, pack, "knowledge_pack");
  res.status(201).json(generateMrdDraft(draftGenerationInput(req, workspaceId, pack)));
});

app.post("/api/documents/prd/draft", requireAuth, (req, res) => {
  const workspaceId = requestWorkspaceId(req);
  const pack = req.body?.pack_id ? getKnowledgePack(req.body.pack_id) : null;
  if (req.body?.pack_id && !pack) return res.status(404).json({ error: "knowledge_pack_not_found" });
  if (pack) resourceInRequestWorkspace(req, pack, "knowledge_pack");
  res.status(201).json(generatePrdDraft(draftGenerationInput(req, workspaceId, pack)));
});

app.patch("/api/documents/:id/sections/:key", requireAuth, (req, res) => {
  const current = getDocument(req.params.id);
  if (!current) return res.status(404).json({ error: "document_not_found" });
  assertCanManageResource(req, current, "document");
  const document = patchDocumentSection(req.params.id, req.params.key, req.body || {});
  res.json(document);
});

app.post("/api/documents/:id/sections/:key/regenerate", requireAuth, (req, res) => {
  const current = getDocument(req.params.id);
  if (!current) return res.status(404).json({ error: "document_not_found" });
  assertCanManageResource(req, current, "document");
  const document = patchDocumentSection(req.params.id, req.params.key, {
    content: req.body?.content || "待重新生成。P0 暂未接入章节级 LLM 重新生成。",
    status: "needs_review",
  });
  res.json({ document, mocked: true });
});

app.post("/api/documents/:id/publish", requireAuth, (req, res) => {
  const current = getDocument(req.params.id);
  if (!current) return res.status(404).json({ error: "document_not_found" });
  assertCanManageResource(req, current, "document");
  const result = publishDocument(req.params.id, req.body?.access_policy || req.body || {});
  res.json(result);
});

app.post("/api/documents/:id/export/feishu", requireAuth, (req, res) => {
  const current = getDocument(req.params.id);
  if (!current) return res.status(404).json({ error: "document_not_found" });
  assertCanManageResource(req, current, "document");
  const result = exportDocumentToFeishu(req.params.id);
  if (!result) return res.status(404).json({ error: "document_not_found" });
  res.json(result);
});

app.post("/api/documents/:id/export/supplier", requireAuth, (req, res) => {
  const current = getDocument(req.params.id);
  if (!current) return res.status(404).json({ error: "document_not_found" });
  assertCanManageResource(req, current, "document");
  const result = exportSupplierDocument(req.params.id);
  if (!result) return res.status(404).json({ error: "document_not_found" });
  res.json(result);
});

app.post("/api/documents/:id/export/sales", requireAuth, (req, res) => {
  const current = getDocument(req.params.id);
  if (!current) return res.status(404).json({ error: "document_not_found" });
  assertCanManageResource(req, current, "document");
  const result = exportSalesDocument(req.params.id);
  if (!result) return res.status(404).json({ error: "document_not_found" });
  res.json(result);
});

app.post("/api/knowledge/gaps/:id/sync-feishu", requireAuth, (req, res) => {
  const gap = getKnowledgeGap(req.params.id);
  if (!gap) return res.status(404).json({ error: "knowledge_gap_not_found" });
  resourceInRequestWorkspace(req, gap, "knowledge_gap");
  const result = syncKnowledgeGapToFeishu(req.params.id);
  res.json(result);
});

app.post("/api/documents/:id/sync-review-base", requireAuth, (req, res) => {
  const current = getDocument(req.params.id);
  if (!current) return res.status(404).json({ error: "document_not_found" });
  assertCanManageResource(req, current, "document");
  res.json(syncDocumentReviewToFeishuBase(req.params.id, req.body || {}));
});

app.post("/api/bot/feishu/events", requireAuth, asyncHandler(async (req, res) => {
  const workspaceId = requestWorkspaceId(req);
  res.json(await handleFeishuBotQuestion({
    ...(req.body || {}),
    workspace_id: workspaceId,
    user_id: currentUserId(req),
    user: currentUser(req),
    roles: currentWorkspaceRoles(req, workspaceId),
  }));
}));

app.get("/api/products", requireAuth, (req, res) => res.json(rawState(currentUserId(req)).products));
app.post("/api/products", requireAuth, asyncHandler(async (req, res) => {
  const payload = await withCachedImageFields(req.body || {});
  res.status(201).json(createProduct(currentUserId(req), payload));
}));
app.get("/api/products/find-similar", requireAuth, (req, res) => {
  const name = String(req.query.name || "").trim().toLowerCase();
  const brand = String(req.query.brand || "").trim().toLowerCase();
  if (!name && !brand) return res.json({ product: null });
  const product = rawState(currentUserId(req)).products.find((item) => {
    const itemName = String(item.name || "").toLowerCase();
    const itemBrand = String(item.brand || item.platforms?.[0]?.brand || "").toLowerCase();
    return (name && (itemName.includes(name.slice(0, 20)) || name.includes(itemName.slice(0, 20)))) ||
      (brand && itemBrand && itemBrand === brand);
  });
  res.json({ product: product ? { id: product.id, name: product.name } : null });
});
app.patch("/api/products/:id", requireAuth, asyncHandler(async (req, res) => {
  const payload = await withCachedImageFields(req.body || {});
  const item = updateProduct(currentUserId(req), req.params.id, payload);
  if (!item) return res.status(404).json({ error: "product_not_found" });
  res.json(item);
}));
app.post("/api/products/:id/platforms", requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const current = rawState(userId).products.find((product) => product.id === req.params.id);
  if (!current) return res.status(404).json({ error: "product_not_found" });
  const platform = {
    id: req.body?.id || `${req.body?.platform || "platform"}-${Date.now()}`,
    platform: req.body?.platform || "unknown",
    url: req.body?.url || req.body?.source_url || "",
    price: req.body?.price || "",
    rating: req.body?.rating ?? null,
    reviews: req.body?.reviews ?? req.body?.review_count ?? 0,
    sales: req.body?.sales || req.body?.monthly_sales || "",
    fetched_at: new Date().toISOString(),
  };
  const item = updateProduct(userId, req.params.id, { platforms: [...(current.platforms || []), platform] });
  res.status(201).json(item);
});
app.delete("/api/products/:id", requireAuth, (req, res) => {
  if (!deleteProduct(currentUserId(req), req.params.id)) return res.status(404).json({ error: "product_not_found" });
  res.json({ ok: true });
});

app.post("/api/products/parse-url", requireAuth, asyncHandler(async (req, res) => {
  res.json(await parseProductUrl(currentUserId(req), req.body || {}));
}));
app.post("/api/products/parse-raw", requireAuth, asyncHandler(async (req, res) => {
  res.json(await parseProductRaw(currentUserId(req), req.body || {}));
}));

app.get("/api/demands", requireAuth, (req, res) => res.json(rawState(currentUserId(req)).demands));
app.post("/api/demands", requireAuth, asyncHandler(async (req, res) => {
  const payload = await withCachedImageFields(req.body || {});
  res.status(201).json(createDemand(currentUserId(req), payload));
}));
app.patch("/api/demands/:id", requireAuth, asyncHandler(async (req, res) => {
  const payload = await withCachedImageFields(req.body || {});
  const item = updateDemand(currentUserId(req), req.params.id, payload);
  if (!item) return res.status(404).json({ error: "demand_not_found" });
  res.json(item);
}));
app.delete("/api/demands/:id", requireAuth, (req, res) => {
  if (!deleteDemand(currentUserId(req), req.params.id)) return res.status(404).json({ error: "demand_not_found" });
  res.json({ ok: true });
});
app.post("/api/demands/parse-url", requireAuth, asyncHandler(async (req, res) => {
  res.json(await parseDemandUrl(currentUserId(req), req.body || {}));
}));
app.post("/api/demands/parse-raw", requireAuth, asyncHandler(async (req, res) => {
  res.json(await parseDemandRaw(currentUserId(req), req.body || {}));
}));

app.get("/api/stats/today", requireAuth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const state = rawState(currentUserId(req));
  const products = state.products.filter((item) => String(item.created_at || item.date || "").slice(0, 10) === today).length;
  const demands = state.demands.filter((item) => String(item.created_at || item.date || "").slice(0, 10) === today).length;
  res.json({ products, demands });
});

app.get("/api/news", requireAuth, (req, res) => {
  const userId = currentUserId(req);
  ensureOfficialNewsCache(userId);
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const offset = (page - 1) * limit;
  const isGoogleNewsItem = (item) => {
    const source = String(item?.source || "").toLowerCase();
    const sourceLabel = String(item?.classification?.source_label || "").toLowerCase();
    const sourceHomepage = String(item?.classification?.source_homepage || "").toLowerCase();
    return source.includes("google news") || sourceLabel.includes("google news") || sourceHomepage.includes("news.google.com");
  };
  const isWechatNewsItem = (item) =>
    String(item?.classification?.source_type || "").toLowerCase() === "wechat_exporter" ||
    String(item?.classification?.source_group || "").toLowerCase() === "wechat-exporter" ||
    String(item?.original_url || item?.url || "").includes("mp.weixin.qq.com") ||
    String(item?.source || "").includes("公众号");
  const typeMap = { new_product: "新品发布", trend: "行业趋势" };
  const allItems = visibleNewsItems(userId).filter((item) => item.type);
  let items = allItems;
  if (req.query.type) items = items.filter((item) => item.type === (typeMap[req.query.type] || req.query.type));
  if (req.query.source_group) {
    const sourceGroup = String(req.query.source_group || "").toLowerCase();
    items = items.filter((item) => sourceGroup === "wechat-exporter" ? isWechatNewsItem(item) : String(item?.classification?.source_group || "").toLowerCase() === sourceGroup);
  }
  if (req.query.starred === "1" || req.query.starred === "true") items = items.filter((item) => item.starred);
  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    items = items.filter((item) =>
      [item.titleZh, item.original_title, item.summary, item.contentZh].filter(Boolean).some((value) => String(value).toLowerCase().includes(q))
    );
  }
  const counts = {
    all: allItems.length,
    wechat: allItems.filter((item) => isWechatNewsItem(item)).length,
    trend: allItems.filter((item) => isGoogleNewsItem(item)).length,
    starred: allItems.filter((item) => item.starred).length,
  };
  res.json({ items: items.slice(offset, offset + limit), counts, page, limit });
});

app.get("/api/news/:id", requireAuth, (req, res) => {
  const item = visibleNewsItems(currentUserId(req)).find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ error: "news_not_found" });
  res.json(item);
});

app.patch("/api/news/:id", requireAuth, (req, res) => {
  const patch = { ...(req.body || {}) };
  if (patch.is_read !== undefined && patch.unread === undefined) patch.unread = !patch.is_read;
  if (patch.is_starred !== undefined && patch.starred === undefined) patch.starred = Boolean(patch.is_starred);
  const item = updateNews(currentUserId(req), req.params.id, patch);
  if (!item) return res.status(404).json({ error: "news_not_found" });
  res.json(item);
});
app.delete("/api/news/:id", requireAuth, (req, res) => {
  if (!deleteNews(currentUserId(req), req.params.id)) return res.status(404).json({ error: "news_not_found" });
  res.json({ ok: true });
});
app.post("/api/news/collect", requireAuth, asyncHandler(async (req, res) => {
  const userId = currentUserId(req);
  const officialCollected = await collectOfficialRssSources();
  const wechatCollected = await collectOfficialWechatSources({ force: true });
  const translated = await processCollectedNewsWithLlm(legacyUser.id, officialCollected);
  const distributed = syncOfficialNewsToAllUsers();
  syncOfficialNewsToUser(userId);
  res.json({ ...officialCollected, wechat: wechatCollected, translated, distributed });
}));

app.post("/api/onboarding/finish-sample", requireAuth, (req, res) => {
  const userId = currentUserId(req);
  finishSampleWorkspace(userId);
  res.json(bootstrap(userId));
});
app.post("/api/news/refresh", requireAuth, asyncHandler(async (req, res) => {
  const userId = currentUserId(req);
  res.json({ message: "采集已触发，后台处理中" });
  setImmediate(async () => {
    try {
      await collectOfficialRssSources();
      await collectOfficialWechatSources({ force: true });
      syncOfficialNewsToAllUsers();
      syncOfficialNewsToUser(userId);
    } catch (error) {
      console.error("Manual news refresh failed", error);
    }
  });
}));
app.post("/api/news/process-llm", requireAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.body?.limit || 20)));
  res.json(await processNewsWithLlm(currentUserId(req), limit));
}));
app.get("/api/news/sources/status", requireAuth, (req, res) => {
  res.json(listNewsSources(legacyUser.id).map((source) => ({
    id: source.id,
    name: source.name,
    last_fetched_at: source.last_fetched_at,
    last_item_count: source.last_item_count,
    last_error: source.last_error,
  })));
});
app.get("/api/news-sources", requireAuth, (req, res) => res.json(listNewsSources(currentUserId(req)).filter((source) => String(source.source_group || source.group || "").toLowerCase() === "custom")));
app.post("/api/news-sources", requireAuth, (req, res) => res.status(201).json(createNewsSource(currentUserId(req), req.body || {})));
app.patch("/api/news-sources/:id", requireAuth, (req, res) => {
  const item = updateNewsSource(currentUserId(req), req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: "news_source_not_found" });
  res.json(item);
});
app.delete("/api/news-sources/:id", requireAuth, (req, res) => {
  if (!deleteNewsSource(currentUserId(req), req.params.id)) return res.status(404).json({ error: "news_source_not_found" });
  res.json({ ok: true });
});

app.get("/api/feed-hub/bootstrap", requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const token = ensureFeedAccessToken(userId);
  const baseUrl = feedBaseUrl(req);
  res.json({
    ...buildFeedHubBootstrap(userId),
    feed_token: token,
    public_urls: {
      opml: `${baseUrl}/api/feed-hub/public/opml.xml?token=${encodeURIComponent(token)}`,
      freshrss: `${baseUrl}/api/feed-hub/public/freshrss-reading-list.opml?token=${encodeURIComponent(token)}`,
    },
  });
});

app.get("/api/feed-hub/groups", requireAuth, (req, res) => {
  res.json(listFeedGroups(currentUserId(req)));
});
app.post("/api/feed-hub/groups", requireAuth, (req, res) => {
  res.status(201).json(createFeedGroup(currentUserId(req), req.body || {}));
});
app.patch("/api/feed-hub/groups/:id", requireAuth, (req, res) => {
  const item = updateFeedGroup(currentUserId(req), req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: "feed_group_not_found" });
  res.json(item);
});
app.delete("/api/feed-hub/groups/:id", requireAuth, (req, res) => {
  if (!deleteFeedGroup(currentUserId(req), req.params.id)) return res.status(404).json({ error: "feed_group_not_found" });
  res.json({ ok: true });
});
app.post("/api/feed-hub/groups/:id/sources/:sourceId", requireAuth, (req, res) => {
  const result = assignSourceToFeedGroup(currentUserId(req), req.params.id, req.params.sourceId);
  if (!result) return res.status(404).json({ error: "feed_group_or_source_not_found" });
  res.status(201).json(result);
});
app.delete("/api/feed-hub/groups/:id/sources/:sourceId", requireAuth, (req, res) => {
  if (!removeSourceFromFeedGroup(currentUserId(req), req.params.id, req.params.sourceId)) {
    return res.status(404).json({ error: "feed_group_source_not_found" });
  }
  res.json({ ok: true });
});

app.get("/api/feed-hub/destinations", requireAuth, (req, res) => {
  res.json(listFeedDestinations(currentUserId(req)));
});
app.post("/api/feed-hub/destinations", requireAuth, (req, res) => {
  res.status(201).json(createFeedDestination(currentUserId(req), req.body || {}));
});
app.patch("/api/feed-hub/destinations/:id", requireAuth, (req, res) => {
  const item = updateFeedDestination(currentUserId(req), req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: "feed_destination_not_found" });
  res.json(item);
});
app.delete("/api/feed-hub/destinations/:id", requireAuth, (req, res) => {
  if (!deleteFeedDestination(currentUserId(req), req.params.id)) return res.status(404).json({ error: "feed_destination_not_found" });
  res.json({ ok: true });
});

app.get("/api/feed-hub/groups/:id/feed.xml", requireAuth, (req, res) => {
  const payload = buildGroupFeed(currentUserId(req), req.params.id);
  if (!payload) return res.status(404).type("text/plain").send("feed group not found\n");
  res.type("application/rss+xml; charset=utf-8").send(payload.xml);
});

app.get("/api/feed-hub/sources/:id/feed.xml", requireAuth, (req, res) => {
  const payload = buildSourceFeed(currentUserId(req), req.params.id);
  if (!payload) return res.status(404).type("text/plain").send("feed source not found\n");
  res.type("application/rss+xml; charset=utf-8").send(payload.xml);
});

app.get("/api/feed-hub/groups/:id/export", requireAuth, (req, res) => {
  const exported = exportGroupArchive(currentUserId(req), req.params.id, {
    format: String(req.query.format || "json"),
  });
  if (!exported) return res.status(404).json({ error: "feed_group_not_found" });
  res.type(exported.contentType).send(exported.body);
});

app.get("/api/feed-hub/public/opml.xml", (req, res) => {
  const token = String(req.query.token || "").trim();
  const userId = findUserIdByFeedAccessToken(token);
  if (!userId) return res.status(401).type("text/plain").send("unauthorized\n");
  const xml = buildHubOpml(userId, { baseUrl: feedBaseUrl(req), token });
  res.type("text/x-opml; charset=utf-8").send(xml);
});

app.get("/api/feed-hub/public/freshrss-reading-list.opml", (req, res) => {
  const token = String(req.query.token || "").trim();
  const userId = findUserIdByFeedAccessToken(token);
  if (!userId) return res.status(401).type("text/plain").send("unauthorized\n");
  const xml = renderFreshRssReadingList({
    title: "LOOM Feed Hub",
    opmlUrl: `${feedBaseUrl(req)}/api/feed-hub/public/opml.xml?token=${encodeURIComponent(token)}`,
  });
  res.type("text/x-opml; charset=utf-8").send(xml);
});

app.get("/api/feed-hub/public/groups/:slug.xml", (req, res) => {
  const token = String(req.query.token || "").trim();
  const userId = findUserIdByFeedAccessToken(token);
  if (!userId) return res.status(401).type("text/plain").send("unauthorized\n");
  const payload = buildGroupFeed(userId, req.params.slug);
  if (!payload) return res.status(404).type("text/plain").send("feed group not found\n");
  res.type("application/rss+xml; charset=utf-8").send(payload.xml);
});

app.get("/api/research", requireAuth, (req, res) => res.json(rawState(currentUserId(req)).research || []));
app.post("/api/research", requireAuth, (req, res) => res.status(201).json(createResearch(currentUserId(req), req.body || {})));
app.patch("/api/research/:id", requireAuth, (req, res) => {
  const item = updateResearch(currentUserId(req), req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: "research_not_found" });
  res.json(item);
});
app.delete("/api/research/:id", requireAuth, (req, res) => {
  if (!deleteResearch(currentUserId(req), req.params.id)) return res.status(404).json({ error: "research_not_found" });
  res.json({ ok: true });
});
app.post("/api/research/:id/analyze", requireAuth, asyncHandler(async (req, res) => {
  const item = await analyzeResearch(currentUserId(req), req.params.id);
  if (!item) return res.status(404).json({ error: "research_not_found" });
  res.json(item);
}));

app.get("/api/settings", requireAuth, (req, res) => res.json(bootstrap(currentUserId(req)).settings));
app.patch("/api/settings", requireAuth, (req, res) => res.json(updateSettings(currentUserId(req), req.body || {})));
app.get("/api/fields", requireAuth, (req, res) => res.json(listFields(currentUserId(req), String(req.query.entity || ""))));
app.get("/api/fields/catalog", requireAuth, (req, res) => res.json(listFields(currentUserId(req))));
app.post("/api/fields/match", requireAuth, (req, res) => {
  const userId = currentUserId(req);
  const fields = listFields(userId);
  const body = req.body || {};
  const fieldKey = String(body.fieldKey || body.key || "").trim();
  if (body.tag_values && typeof body.tag_values === "object") {
    return res.json({ tag_values: normalizeTagValues(body.tag_values, fields) });
  }
  const fieldMatch = fieldKey ? matchFieldKey(fieldKey, fields) : null;
  const field = fieldMatch?.field || fields.find((item) => item.key === fieldKey || item.legacyKey === fieldKey);
  if (!field) return res.status(404).json({ error: "field_not_found" });
  const values = Array.isArray(body.values) ? body.values : [body.value ?? body.raw ?? ""];
  res.json({
    field,
    values: values.map((value) => matchFieldOption(value, field)).filter(Boolean),
  });
});
app.post("/api/fields", requireAuth, (req, res) => res.status(201).json(createField(currentUserId(req), req.body || {})));
app.patch("/api/fields/:key", requireAuth, (req, res) => {
  const field = updateField(currentUserId(req), req.params.key, req.body || {});
  if (!field) return res.status(404).json({ error: "field_not_found" });
  res.json(field);
});
app.delete("/api/fields/:key", requireAuth, (req, res) => {
  if (!deleteField(currentUserId(req), req.params.key)) return res.status(404).json({ error: "field_not_found_or_official" });
  res.json({ ok: true });
});
app.post("/api/fields/:key/options", requireAuth, (req, res) => {
  const field = addFieldOption(currentUserId(req), req.params.key, req.body?.value || req.body?.option);
  if (!field) return res.status(404).json({ error: "field_not_found" });
  res.json(field);
});
app.delete("/api/fields/:key/options/:value", requireAuth, (req, res) => {
  const field = removeFieldOption(currentUserId(req), req.params.key, req.params.value);
  if (!field) return res.status(404).json({ error: "field_not_found" });
  res.json(field);
});
app.post("/api/settings/test-llm", requireAuth, asyncHandler(async (req, res) => res.json(await testLLM(currentUserId(req)))));
app.post("/api/settings/test-vision-llm", requireAuth, asyncHandler(async (req, res) => res.json(await testVisionLLM(currentUserId(req)))));
app.post("/api/settings/test-feishu", requireAuth, asyncHandler(async (req, res) => res.json(await testFeishuForUser(currentUserId(req)))));
app.post("/api/sync/feishu", requireAuth, asyncHandler(async (req, res) => res.json(await syncFeishuForUser(currentUserId(req), req.body || {}))));
app.post("/api/feedback", requireAuth, asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const page = req.body?.page || req.get("referer") || "";
  const result = await submitFeedbackToFeishu(currentUserId(req), { ...(req.body || {}), page }, user || {});
  res.status(201).json(result);
}));
app.post("/api/admin/reset-regular-users-to-sample", requireAuth, (req, res) => {
  res.json(resetRegularUsersToSampleWorkspace());
});

let rssCollecting = false;
function startRssScheduler() {
  const interval = Number(process.env.RSS_SCHEDULER_CHECK_INTERVAL_MS || process.env.RSS_COLLECT_INTERVAL_MS || 15 * 60 * 1000);
  setInterval(async () => {
    if (rssCollecting) return;
    if (!acquireLock("rss-scheduler", Math.max(interval - 1000, 30000))) return;
    rssCollecting = true;
    try {
      for (const user of listAllUsers()) {
        const state = rawState(user.id);
        const settings = state?.settings || {};
        if (settings.rss_collect_enabled === false || process.env.RSS_COLLECT_ENABLED === "false") continue;
        await collectOfficialRssSources();
        break;
      }
    } catch (error) {
      console.error("RSS collect failed", error);
    } finally {
      rssCollecting = false;
      releaseLock("rss-scheduler");
    }
  }, interval).unref();
}

let wechatCollecting = false;
let lastWechatCollectDateHour = "";

export function zonedDateHour(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    hour: Number(value.hour),
  };
}

function startWechatScheduler() {
  const interval = Number(process.env.WECHAT_SCHEDULER_CHECK_INTERVAL_MS || 5 * 60 * 1000);
  setInterval(async () => {
    const current = zonedDateHour(wechatCollectTimezone);
    const marker = `${current.date}-${current.hour}`;
    if (!wechatCollectHours.includes(current.hour) || marker === lastWechatCollectDateHour) return;
    if (wechatCollecting) return;
    if (!acquireLock("wechat-scheduler", 60 * 60 * 1000)) return;
    wechatCollecting = true;
    try {
      await collectOfficialWechatSources({ force: true });
      lastWechatCollectDateHour = marker;
    } catch (error) {
      console.error("WeChat collect failed", error);
    } finally {
      wechatCollecting = false;
      releaseLock("wechat-scheduler");
    }
  }, interval).unref();
}

if (process.env.NODE_ENV === "production") {
  const appDistDir = path.join(projectRoot, "dist");
  const landingDistDir = path.join(projectRoot, "landing", "dist");
  const htmlShellHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
  const immutableStaticOptions = {
    index: false,
    etag: true,
    lastModified: true,
    maxAge: "1y",
    immutable: true,
  };
  const noCacheHtmlOptions = {
    index: false,
    etag: false,
    lastModified: false,
    redirect: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) {
        Object.entries(htmlShellHeaders).forEach(([key, value]) => res.setHeader(key, value));
      }
    },
  };
  const sendFreshHtml = (res, filePath) => res.sendFile(filePath, {
    etag: false,
    lastModified: false,
    cacheControl: false,
    headers: htmlShellHeaders,
  });

  app.use("/app/assets", express.static(path.join(appDistDir, "assets"), immutableStaticOptions));
  app.use("/uploads", express.static(uploadsDir, immutableStaticOptions));
  app.get("/app", (_req, res) => sendFreshHtml(res, path.join(appDistDir, "index.html")));
  app.get("/app/", (_req, res) => sendFreshHtml(res, path.join(appDistDir, "index.html")));
  app.use("/app", express.static(appDistDir, noCacheHtmlOptions));
  app.get(/^\/app(?:\/.*)?$/, (_req, res) => sendFreshHtml(res, path.join(appDistDir, "index.html")));
  app.get("/admin", (_req, res) => sendFreshHtml(res, path.join(appDistDir, "index.html")));
  app.get("/admin/", (_req, res) => sendFreshHtml(res, path.join(appDistDir, "index.html")));
  app.get(/^\/admin(?:\/.*)?$/, (_req, res) => sendFreshHtml(res, path.join(appDistDir, "index.html")));

  app.use("/assets", express.static(path.join(landingDistDir, "assets"), immutableStaticOptions));
  app.use(express.static(landingDistDir, noCacheHtmlOptions));
  app.get(/^\/(?:extension)?$/, (_req, res) => sendFreshHtml(res, path.join(landingDistDir, "index.html")));
}

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.use(handleError);

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`LOOM listening on http://0.0.0.0:${port}`);
  });
  if (process.env.NODE_ENV === "production") {
    startRssScheduler();
    startWechatScheduler();
  }
}

export default app;
