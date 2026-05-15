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
  getFeishuOauthConfig,
  getPasswordAuthConfig,
  isFeishuUserAllowed,
  validateAuthConfig,
} from "./auth-service.js";
import { parseDemandRaw, parseDemandUrl, parseProductRaw, parseProductUrl } from "./parsers.js";
import { collectDueSources, collectSources, processNewsWithLlm } from "./rss-service.js";
import { analyzeResearch } from "./research-service.js";
import { syncFeishuForUser, testFeishuForUser } from "./feishu-service.js";
import { loadInitialData } from "./seed.js";
import { isRecentSampleNews, isSampleWorkspace } from "./sample-workspace.js";
import {
  bootstrap,
  acquireLock,
  createNewsSource,
  createDemand,
  createProduct,
  createResearch,
  deleteDemand,
  deleteNews,
  deleteNewsSource,
  deleteProduct,
  deleteResearch,
  ensureLegacyWorkspace,
  ensureLocalUser,
  getUserIdByApiToken,
  findUserByEmail,
  findUserByFeishuProfile,
  findUserById,
  finishSampleWorkspace,
  importWechatExporterAccounts,
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
  touchUserLogin,
  updateDemand,
  updateNews,
  updateNewsSource,
  updateProduct,
  updateResearch,
  updateSettings,
  visibleNewsItems,
} from "./repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 3000);
const SQLiteStore = SQLiteStoreFactory(session);
const wechatExporterAccountsPath = process.env.WECHAT_EXPORTER_ACCOUNTS_PATH || path.join(projectRoot, "data", "wechat-exporter-accounts.json");
const wechatExporterSourceIntervalMinutes = Number(process.env.WECHAT_EXPORTER_SOURCE_INTERVAL_MINUTES || 1440);
const wechatCollectHours = String(process.env.WECHAT_COLLECT_HOURS || "9,21")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 0 && value <= 23);
const wechatCacheDays = Math.max(1, Number(process.env.WECHAT_CACHE_DAYS || 5));
const wechatCollectTimezone = process.env.WECHAT_COLLECT_TIMEZONE || "Asia/Shanghai";
const sessionCookieSecure = process.env.SESSION_COOKIE_SECURE === "true"
  ? true
  : process.env.SESSION_COOKIE_SECURE === "false"
    ? false
    : "auto";

validateAuthConfig();
ensureSeed(loadInitialData());
const legacyUser = ensureLegacyWorkspace();
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

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  res.locals.loomUserId = user.id;
  req.session.userId = user.id;
  req.session.user = sessionUserResponse(user);
  next();
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

function ensurePasswordUser() {
  const { username } = getPasswordAuthConfig();
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
  });
}

function signInPasswordUser(req, res) {
  const user = ensurePasswordUser();
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
    type: "wechat_exporter",
  });
}

function officialRssSources() {
  return listNewsSources(legacyUser.id).filter((source) => String(source.type || "").toLowerCase() !== "wechat_exporter");
}

function officialWechatSources() {
  return listNewsSources(legacyUser.id).filter((source) => String(source.type || "").toLowerCase() === "wechat_exporter");
}

async function collectOfficialRssSources() {
  const collected = await collectDueSources(legacyUser.id, officialRssSources());
  await processCollectedNewsWithLlm(legacyUser.id, collected);
  pruneNewsOlderThan(legacyUser.id, { sourceGroups: ["official-default", "sample-live"], olderThanDays: 5 });
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
  const { username, password } = getPasswordAuthConfig();
  if (req.body?.username !== username || req.body?.password !== password) {
    return res.status(401).json({ error: "用户名或密码不正确" });
  }
  signInPasswordUser(req, res);
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
  syncOfficialNewsToUser(userId);
  res.json(bootstrap(userId));
});

app.get("/api/products", requireAuth, (req, res) => res.json(rawState(currentUserId(req)).products));
app.post("/api/products", requireAuth, (req, res) => res.status(201).json(createProduct(currentUserId(req), req.body || {})));
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
app.patch("/api/products/:id", requireAuth, (req, res) => {
  const item = updateProduct(currentUserId(req), req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: "product_not_found" });
  res.json(item);
});
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
app.post("/api/demands", requireAuth, (req, res) => res.status(201).json(createDemand(currentUserId(req), req.body || {})));
app.patch("/api/demands/:id", requireAuth, (req, res) => {
  const item = updateDemand(currentUserId(req), req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: "demand_not_found" });
  res.json(item);
});
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
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const offset = (page - 1) * limit;
  const isGoogleNewsItem = (item) => {
    const source = String(item?.source || "").toLowerCase();
    const sourceLabel = String(item?.classification?.source_label || "").toLowerCase();
    const sourceHomepage = String(item?.classification?.source_homepage || "").toLowerCase();
    return source.includes("google news") || sourceLabel.includes("google news") || sourceHomepage.includes("news.google.com");
  };
  const typeMap = { new_product: "新品发布", trend: "行业趋势" };
  const allItems = visibleNewsItems(userId).filter((item) => item.type);
  let items = allItems;
  if (req.query.type) items = items.filter((item) => item.type === (typeMap[req.query.type] || req.query.type));
  if (req.query.source_group) {
    const sourceGroup = String(req.query.source_group || "").toLowerCase();
    items = items.filter((item) => String(item?.classification?.source_group || "").toLowerCase() === sourceGroup);
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
    wechat: allItems.filter((item) => String(item?.classification?.source_type || "").toLowerCase() === "wechat_exporter" || String(item?.source || "").includes("公众号")).length,
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
app.post("/api/settings/test-llm", requireAuth, asyncHandler(async (req, res) => res.json(await testLLM(currentUserId(req)))));
app.post("/api/settings/test-vision-llm", requireAuth, asyncHandler(async (req, res) => res.json(await testVisionLLM(currentUserId(req)))));
app.post("/api/settings/test-feishu", requireAuth, asyncHandler(async (req, res) => res.json(await testFeishuForUser(currentUserId(req)))));
app.post("/api/sync/feishu", requireAuth, asyncHandler(async (req, res) => res.json(await syncFeishuForUser(currentUserId(req), req.body || {}))));
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
    etag: true,
    lastModified: true,
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
  app.use("/app", express.static(appDistDir, noCacheHtmlOptions));
  app.get(/^\/app(?:\/.*)?$/, (_req, res) => sendFreshHtml(res, path.join(appDistDir, "index.html")));
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
    console.log(`Loom listening on http://0.0.0.0:${port}`);
  });
  if (process.env.NODE_ENV === "production") {
    startRssScheduler();
    startWechatScheduler();
  }
}

export default app;
