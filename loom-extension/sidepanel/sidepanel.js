const DEFAULT_API_BASE = "https://loom.my1panelsite.xyz";
const LEGACY_API_BASE_HOSTS = new Set([
  "ulanzi-copilot.my1panelsite.xyz",
  "loom.43.156.166.134.sslip.io",
]);
const API_BASE_KEY = "loom_api_base";
const TOKEN_KEY = "loom_token";
const USER_KEY = "loom_user";
const DEFAULT_MODE_KEY = "loom_default_mode";
const AI_BEFORE_SAVE_KEY = "loom_ai_before_save";
const LEGACY_KEY_MAP = {
  pmcopilot_api_base: API_BASE_KEY,
  pmcopilot_token: TOKEN_KEY,
  pmcopilot_user: USER_KEY,
  pmcopilot_default_mode: DEFAULT_MODE_KEY,
  pmcopilot_ai_before_save: AI_BEFORE_SAVE_KEY,
};

const PRODUCT_PLATFORMS = new Set(["amazon", "taobao", "kickstarter"]);
const DEMAND_PLATFORMS = new Set(["xiaohongshu"]);
const PLATFORM_LABELS = {
  amazon: "Amazon",
  taobao: "淘宝/天猫",
  xiaohongshu: "小红书",
  kickstarter: "Kickstarter",
};
const EXTRACTOR_FILES = {
  amazon: "content/amazon.js",
  taobao: "content/taobao.js",
  xiaohongshu: "content/xiaohongshu.js",
  kickstarter: "content/kickstarter.js",
};
const DEFAULT_TAG_GROUPS = [
  { key: "scenarios", name: "使用场景", tone: "accent", tags: ["Vlog/自拍", "直播/带货", "短视频创作", "户外旅拍", "室内棚拍", "桌面俯拍", "运动/极限拍摄", "会议/活动记录", "产品摄影", "延时/慢动作", "街拍/纪实", "教育/网课"] },
  { key: "painpoints", name: "用户痛点", tone: "danger", tags: ["携带不便/太重", "续航不足", "操作复杂/学习成本高", "画质不够", "防抖不足", "散热过热", "噪音大", "兼容性差", "配件缺失/需另购", "安装固定麻烦", "调光/调色不精准", "无线连接不稳定", "收纳困难", "价格过高/性价比低", "做工质感差"] },
  { key: "innovation_types", name: "创新类型", tone: "success", tags: ["技术创新", "使用方式创新", "形态创新", "场景拓展", "生态整合", "性价比创新"] },
  { key: "custom_tags", name: "自定义标签", tone: "outline", tags: ["便携", "高显色", "模块化", "磁吸", "手机摄影"] },
];

function normalizeApiBase(value) {
  const raw = String(value || "").trim().replace(/\/$/, "");
  if (!raw) return DEFAULT_API_BASE;
  try {
    const parsed = new URL(raw);
    if (LEGACY_API_BASE_HOSTS.has(parsed.hostname)) return DEFAULT_API_BASE;
    return parsed.origin.replace(/\/$/, "");
  } catch {
    return DEFAULT_API_BASE;
  }
}

const state = {
  apiBase: "",
  token: "",
  user: null,
  sessionCookie: "",
  syncedSessionCookie: "",
  tab: null,
  lastSeenUrl: "",
  page: null,
  mode: "product",
  processed: null,
  form: null,
  busy: false,
  reloading: false,
  message: "",
  relationPickerOpen: false,
  relationPickerLoading: false,
  relationPickerItems: [],
  relationPickerQuery: "",
  relationPickerError: "",
  tagGroups: DEFAULT_TAG_GROUPS,
  tagPicker: null,
  commentCollecting: false,
  commentCollectStartedAt: 0,
  commentListExpanded: false,
};

let autoSyncTimer = null;
let autoSyncPoller = null;
let commentCollectorTimer = null;
let pendingUrlSync = false;
let loginStatusTimer = null;
let syncInFlight = null;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text || text === "null" || text === "undefined") return fallback;
  return text;
}

function isVisitorUser(user) {
  const id = String(user?.id || "").toLowerCase();
  const name = String(user?.name || "").trim().toLowerCase();
  return Boolean(user?.is_visitor || id === "visitor" || name === "visitor");
}

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("click", handleGlobalClick);

async function init() {
  const stored = await getStoredSettings();
  state.apiBase = normalizeApiBase(stored[API_BASE_KEY] || DEFAULT_API_BASE);
  state.token = stored[TOKEN_KEY] || "";
  state.user = stored[USER_KEY] || null;
  state.sessionCookie = await getSessionCookieValue();
  state.syncedSessionCookie = state.token ? state.sessionCookie : "";
  bindLoginStateSync();
  if (!state.token) {
    renderLoginWait("请先在 Web 端完成登录");
    void syncAuthFromWebSession();
    return;
  }
  if (stored[AI_BEFORE_SAVE_KEY] === undefined) {
    await chrome.storage.local.set({ [AI_BEFORE_SAVE_KEY]: false });
  }
  renderLoading("正在读取当前页面");
  bindAutoSync();
  await loadTagGroups();
  await loadCurrentPage(stored[DEFAULT_MODE_KEY] || "auto");
}

async function getStoredSettings() {
  const keys = [API_BASE_KEY, TOKEN_KEY, USER_KEY, DEFAULT_MODE_KEY, AI_BEFORE_SAVE_KEY, ...Object.keys(LEGACY_KEY_MAP)];
  const stored = await chrome.storage.local.get(keys);
  const migrated = {};
  if (stored[API_BASE_KEY] !== undefined) {
    const normalized = normalizeApiBase(stored[API_BASE_KEY]);
    if (normalized !== stored[API_BASE_KEY]) migrated[API_BASE_KEY] = normalized;
  }
  for (const [legacyKey, loomKey] of Object.entries(LEGACY_KEY_MAP)) {
    if (stored[loomKey] === undefined && stored[legacyKey] !== undefined) {
      migrated[loomKey] = loomKey === API_BASE_KEY
        ? normalizeApiBase(stored[legacyKey])
        : stored[legacyKey];
    }
  }
  if (Object.keys(migrated).length) await chrome.storage.local.set(migrated);
  return { ...stored, ...migrated };
}

async function loadCurrentPage(defaultMode = "auto") {
  state.reloading = false;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tab = tab;
    state.lastSeenUrl = tab?.url || "";
    const result = await readPageData(tab);
    if (!result?.ok) {
      state.page = null;
      renderUnsupported(result?.error || "unsupported_page");
      return;
    }
    state.page = result;
    state.message = "";
    state.mode = defaultMode === "demand"
      ? "demand"
      : defaultMode === "product"
        ? "product"
        : DEMAND_PLATFORMS.has(result.platform) ? "demand" : "product";
    state.tagPicker = null;
    stopCommentCollector();
    state.processed = result.data;
    state.form = buildDraft(state.mode, state.processed);
    state.message = "已完成基础采集，可直接保存；如需摘要和标签，再点 AI 整理。";
    renderMain();
  } catch (error) {
    state.page = null;
    renderUnsupported(error.message || "无法读取页面");
  }
}

async function readPageData(tab) {
  if (!tab?.id) throw new Error("没有可读取的当前页面");
  const platform = detectPlatformFromUrl(tab.url || "");
  if (platform === "xiaohongshu" && !isXhsNoteUrl(tab.url || "")) {
    throw new Error("请先打开一条小红书笔记详情页，再进行采集");
  }
  try {
    if (platform) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/detector.js", EXTRACTOR_FILES[platform]],
      });
    }
    return await readInjectedPageData(tab.id, platform);
  } catch (error) {
    if (!String(error.message || "").includes("Receiving end does not exist")) throw error;
    if (!platform) throw new Error("当前页面不在插件支持范围内");
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/detector.js", EXTRACTOR_FILES[platform]],
    });
    return readInjectedPageData(tab.id, platform);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readInjectedPageData(tabId, platform) {
  const attempts = platform === "xiaohongshu" ? 4 : 1;
  let lastResult = null;
  for (let index = 0; index < attempts; index += 1) {
    const result = await chrome.tabs.sendMessage(tabId, { type: "LOOM_GET_PAGE_DATA" });
    lastResult = result;
    const content = cleanText(result?.data?.content || result?.data?.original_content || result?.data?.summary, "");
    if (platform !== "xiaohongshu" || content.length >= 2) return result;
    await wait(450);
  }
  return lastResult;
}

function detectPlatformFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const href = parsed.href.toLowerCase();
    if (host.includes("amazon.")) return "amazon";
    if (host.includes("taobao.com") || host.includes("tmall.com")) return "taobao";
    if (host.includes("xiaohongshu.com")) return "xiaohongshu";
    if (host.includes("kickstarter.com") && href.includes("/projects/")) return "kickstarter";
  } catch {
    return null;
  }
  return null;
}

function shouldAutoSyncUrl(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("xiaohongshu.com")) return true;
    return isXhsNoteUrl(url);
  } catch {
    return false;
  }
}

function isXhsNoteUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("xiaohongshu.com") && /^\/explore\/[a-z0-9]+$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function processRaw() {
  if (!state.page?.data) return;
  const endpoint = state.mode === "product" ? "/api/products/parse-raw" : "/api/demands/parse-raw";
  state.busy = true;
  try {
    const data = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({ platform: state.page.platform, data: state.page.data }),
    });
    state.processed = { ...state.page.data, ...data };
    state.form = buildDraft(state.mode, state.processed);
    state.message = "AI 结构化完成";
  } catch (error) {
    state.processed = state.page.data;
    state.form = buildDraft(state.mode, state.processed);
    state.message = `AI 处理失败，已保留原始字段：${error.message}`;
  } finally {
    state.busy = false;
  }
}

async function reloadCurrentPage() {
  state.reloading = true;
  renderLoading("正在重新抓取当前页面");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) state.tab = tab;
    state.lastSeenUrl = state.tab?.url || state.lastSeenUrl;
    const result = await readPageData(state.tab);
    if (!result?.ok) throw new Error(result?.error || "重新抓取失败");
    state.page = result;
    state.processed = result.data;
    stopCommentCollector();
    state.form = buildDraft(state.mode, state.processed);
    state.message = "页面已重新抓取，可直接保存；如需摘要和标签，再点 AI 整理。";
    renderMain();
  } catch (error) {
    state.reloading = false;
    state.message = `刷新失败：${error.message}`;
    renderMain();
  } finally {
    state.reloading = false;
    if (pendingUrlSync) {
      pendingUrlSync = false;
      await scheduleAutoSync();
    }
  }
}

function bindAutoSync() {
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    if (!state.tab?.id || tabId !== state.tab.id) return;
    await scheduleAutoSync();
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (!state.tab?.id || tabId !== state.tab.id) return;
    if (!changeInfo.url && changeInfo.status !== "complete") return;
    await scheduleAutoSync();
  });

  if (!autoSyncPoller) {
    autoSyncPoller = setInterval(() => {
      void scheduleAutoSync();
    }, 800);
  }
}

async function scheduleAutoSync() {
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(async () => {
    autoSyncTimer = null;
    await syncIfUrlChanged();
  }, 250);
}

async function syncIfUrlChanged() {
  if (state.busy || state.reloading) {
    pendingUrlSync = true;
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (state.tab?.id && tab.id !== state.tab.id) return;
  const nextUrl = tab.url || "";
  if (!nextUrl || nextUrl === state.lastSeenUrl) return;
  if (!shouldAutoSyncUrl(nextUrl)) {
    state.tab = tab;
    state.lastSeenUrl = nextUrl;
    return;
  }
  state.tab = tab;
  state.lastSeenUrl = nextUrl;
  await reloadCurrentPage();
}

async function api(path, options = {}) {
  const res = await fetch(`${state.apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `请求失败 ${res.status}`);
  return data;
}

async function pingApiBase(apiBase) {
  const res = await fetch(`${apiBase}/api/health`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

function apiOrigin() {
  try {
    return new URL(state.apiBase).origin;
  } catch {
    return "";
  }
}

async function getSessionCookieValue() {
  const url = apiOrigin();
  if (!url || !chrome.cookies?.get) return "";
  try {
    const cookie = await chrome.cookies.get({ url, name: "connect.sid" });
    return cookie?.value || "";
  } catch {
    return "";
  }
}

async function clearAuthState() {
  state.token = "";
  state.user = null;
  state.syncedSessionCookie = "";
  await chrome.storage.local.remove([TOKEN_KEY, USER_KEY, "pmcopilot_token", "pmcopilot_user"]);
}

async function removeSessionCookie() {
  const url = apiOrigin();
  if (!url || !chrome.cookies?.remove) return;
  try {
    await chrome.cookies.remove({ url, name: "connect.sid" });
  } catch {}
}

async function syncAuthFromWebSession(options = {}) {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    const cookieValue = await getSessionCookieValue();
    state.sessionCookie = cookieValue;

    if (!cookieValue) {
      if (state.token || state.user) await clearAuthState();
      if (!options.silent) renderLoginWait("请先在 Web 端登录 LOOM");
      return false;
    }

    if (!options.force && state.token && state.syncedSessionCookie && state.syncedSessionCookie === cookieValue) {
      return true;
    }

    try {
      if (!options.silent) renderLoginWait("已检测到登录态，正在同步插件权限");
      const res = await fetch(`${state.apiBase}/api/auth/extension/session-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_cookie: cookieValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || `请求失败 ${res.status}`);
      if (!data.token) throw new Error("服务器未返回插件登录凭证");
      if (isVisitorUser(data.user)) {
        await clearAuthState();
        if (!options.silent) {
          renderLoginWait("检测到当前 Web 端是访客账号，请先在 Web 端退出访客状态，再登录正式账号。");
        }
        return false;
      }
      await chrome.storage.local.set({
        [API_BASE_KEY]: state.apiBase,
        [TOKEN_KEY]: data.token,
        [USER_KEY]: data.user || null,
      });
      state.token = data.token;
      state.user = data.user || null;
      state.syncedSessionCookie = cookieValue;
      if (!options.silent) renderLoading("正在读取当前页面");
      await loadTagGroups();
      await loadCurrentPage((await getStoredSettings())[DEFAULT_MODE_KEY] || "auto");
      return true;
    } catch (error) {
      if (state.token || state.user) await clearAuthState();
      if (!options.silent) renderLoginWait(error.message || "登录同步失败，请重新打开 Web 端");
      return false;
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}

function bindLoginStateSync() {
  if (chrome.cookies?.onChanged && !bindLoginStateSync.bound) {
    chrome.cookies.onChanged.addListener((changeInfo) => {
      if (changeInfo.cookie?.name !== "connect.sid") return;
      if (!apiOrigin()) return;
      try {
        const cookieUrl = `${changeInfo.cookie.secure ? "https" : "http"}://${changeInfo.cookie.domain.replace(/^\./, "")}${changeInfo.cookie.path || "/"}`;
        if (new URL(cookieUrl).hostname !== new URL(apiOrigin()).hostname) return;
      } catch {
        return;
      }
      void syncAuthFromWebSession({ silent: false });
    });
    bindLoginStateSync.bound = true;
  }

  if (!loginStatusTimer) {
    loginStatusTimer = setInterval(() => {
      void syncAuthFromWebSession({ silent: true });
    }, 4000);
  }
}

async function loadTagGroups() {
  try {
    const data = await api("/api/bootstrap");
    state.tagGroups = safeArray(data?.settings?.tag_groups).length ? data.settings.tag_groups : DEFAULT_TAG_GROUPS;
  } catch {
    state.tagGroups = DEFAULT_TAG_GROUPS;
  }
}

function renderLoginWait(statusText = "请先在 Web 端登录 LOOM") {
  document.getElementById("app").innerHTML = `
    <div class="shell shell-login-minimal">
      <button class="icon-btn login-minimal-settings" id="open-options" title="设置">⚙</button>
      <div class="login-minimal">
        <div class="login-minimal-spinner" aria-hidden="true">
          ${swirlSpinnerIcon()}
        </div>
        <div class="login-minimal-title">等待登录完成</div>
        <div class="login-minimal-sub">请在 Web 端登录后返回，插件会自动同步当前账号</div>
        <button class="btn primary login-minimal-btn" id="open-web-login" type="button">现在登录</button>
        <div class="login-minimal-status">${escapeHtml(statusText)}</div>
      </div>
    </div>`;
  document.getElementById("open-options").onclick = () => chrome.runtime.openOptionsPage();
  document.getElementById("open-web-login").onclick = () => chrome.tabs.create({ url: `${state.apiBase}/app?login=1` });
}

function renderLoading(text) {
  document.getElementById("app").innerHTML = `
    <div class="shell">
      ${headerHtml({ title: text, loading: true })}
      <div class="cl-body">
        <div class="ai-parse">
          <div class="ai-parse-head">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent)"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>
            <span class="ai-parse-title">AI 正在处理页面</span>
            <span class="muted mono">~8-12s</span>
          </div>
          <div class="ai-step done">
            <span class="ai-dot"><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
            <div><div class="ai-step-label">注入 content/detector.js</div><div class="ai-step-detail mono">platform = ${escapeHtml(state.page?.platform || "unknown")}</div></div>
          </div>
          <div class="ai-step done">
            <span class="ai-dot"><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
            <div><div class="ai-step-label">读取页面原始字段</div><div class="ai-step-detail mono">title · price · rating · features</div></div>
          </div>
          <div class="ai-step active">
            <span class="ai-dot"></span>
            <div><div class="ai-step-label">AI 结构化（aiBeforeSave）</div><div class="ai-step-detail mono">POST /api/products/parse-raw 或 /api/demands/parse-raw</div></div>
          </div>
          <div class="ai-step">
            <span class="ai-dot"></span>
            <div><div class="ai-step-label">构建表单草稿</div><div class="ai-step-detail mono">buildDraft(mode, processed)</div></div>
          </div>
        </div>
        <div class="cl-hint">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          <span>解析在后台完成，关闭面板不会中断。完成后会回到当前标签页。</span>
        </div>
      </div>
      <div class="cl-foot">
        <button class="btn ghost grow" disabled>处理中…</button>
        <button class="btn primary grow" disabled>解析中…</button>
      </div>
    </div>`;
  bindHeader();
}

function renderUnsupported(reason) {
  document.getElementById("app").innerHTML = `
    <div class="shell">
      ${headerHtml({ title: "当前页面无法采集", warning: true })}
      <div class="cl-body cl-unsupported-body">
        <div class="cl-unsupported">
          <div class="cl-unsupported-title">未识别为支持的平台</div>
          <div class="cl-unsupported-text">LOOM 目前只在以下平台自动采集，可以在设置中调整白名单。</div>
          <div class="platform-list">
            <div class="platform-list-row"><span class="platform-pill amz">Amazon</span><span class="platform-list-url mono">amazon.com/dp/*</span><span class="tag outline">竞品</span></div>
            <div class="platform-list-row"><span class="platform-pill tb">淘宝/天猫</span><span class="platform-list-url mono">item.taobao.com · detail.tmall.com</span><span class="tag outline">竞品</span></div>
            <div class="platform-list-row"><span class="platform-pill ks">Kickstarter</span><span class="platform-list-url mono">kickstarter.com/projects/*</span><span class="tag outline">竞品</span></div>
            <div class="platform-list-row"><span class="platform-pill xhs">小红书</span><span class="platform-list-url mono">xiaohongshu.com/explore/*</span><span class="tag outline">需求</span></div>
          </div>
          <div class="cl-hint">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>
            <span>也可以在 LOOM Web 端手动新建竞品 / 需求</span>
          </div>
        </div>
      </div>
      <div class="cl-foot">
        <button class="btn ghost grow" id="refresh" type="button">重新检测</button>
        <button class="btn primary grow" id="open-web" type="button">打开 Web 端</button>
      </div>
    </div>`;
  bindHeader();
  document.getElementById("refresh").onclick = () => loadCurrentPage();
  document.getElementById("open-web").onclick = () => chrome.tabs.create({ url: state.apiBase });
}

function renderMain() {
  const item = state.form || buildDraft(state.mode, state.processed || state.page?.data || {});
  const platform = state.page.platform;
  const canProduct = PRODUCT_PLATFORMS.has(platform);
  const canDemand = DEMAND_PLATFORMS.has(platform) || platform === "kickstarter";
  document.getElementById("app").innerHTML = `
    <div class="shell">
      ${headerHtml({ platform, mode: state.mode, loading: state.reloading })}
      <div class="cl-top-actions">
        <button class="btn top-action" id="save-top" ${state.busy ? "disabled" : ""}>保存</button>
        <button class="btn top-action" id="process-top" ${state.busy ? "disabled" : ""}>${state.busy ? "处理中..." : "AI 整理"}</button>
      </div>

      <nav class="cl-tabs">
        <button class="cl-tab ${state.mode === "product" ? "active" : ""}" id="mode-product">竞品</button>
        <button class="cl-tab ${state.mode === "demand" ? "active" : ""}" id="mode-demand">需求</button>
      </nav>

      <div class="cl-body">
        ${state.mode === "product" ? productView(item) : demandView(item)}
        ${state.message ? `<div class="cl-hint">${escapeHtml(state.message)}</div>` : ""}
        <div class="cl-spacer"></div>
      </div>

      <div class="cl-foot${state.mode === "product" && isCommercePlatform(platform) ? " with-relation" : ""}">
        <button class="btn ghost grow" id="refresh-bottom" type="button">重新抓取</button>
        ${state.mode === "product" && isCommercePlatform(platform) ? `<button class="btn primary grow" id="open-relation" type="button">${item.related_product_name ? "重新关联" : "关联同一产品"}</button>` : ""}
      </div>
      ${state.relationPickerOpen ? `<div class="relation-layer">${relationPickerView()}</div>` : ""}
    </div>`;
  bindHeader();
  document.getElementById("mode-product").onclick = () => switchMode("product", canProduct, "此页面建议使用需求模式");
  document.getElementById("mode-demand").onclick = () => switchMode("demand", canDemand, "此页面建议使用竞品模式");
  const handleProcess = async () => {
    renderLoading("AI 结构化中");
    await processRaw();
    renderMain();
  };
  document.getElementById("process-top").onclick = handleProcess;
  document.getElementById("save-top").onclick = saveCurrent;
  document.getElementById("refresh-bottom").onclick = () => reloadCurrentPage();
  const relationButton = document.getElementById("open-relation");
  if (relationButton) relationButton.onclick = openRelationPicker;
  const relationBackdrop = document.querySelector("[data-relation-backdrop]");
  if (relationBackdrop) {
    relationBackdrop.addEventListener("click", (event) => {
      if (event.target === relationBackdrop) closeRelationPicker();
    });
  }
  document.querySelectorAll("[data-relation-close]").forEach((button) => {
    button.addEventListener("click", closeRelationPicker);
  });
  document.querySelectorAll("[data-relation-pick]").forEach((button) => {
    button.addEventListener("click", () => pickRelation(button.getAttribute("data-relation-pick")));
  });
  const relationQuery = document.querySelector("[data-relation-query]");
  if (relationQuery) {
    relationQuery.addEventListener("input", (event) => {
      state.relationPickerQuery = event.target.value;
      renderMain();
    });
  }
  const collectCommentsButton = document.getElementById("collect-comments-more");
  if (collectCommentsButton) {
    collectCommentsButton.onclick = () => {
      if (state.commentCollecting) {
        stopCommentCollector();
        state.message = "已停止监听评论。";
        renderMain();
        return;
      }
      startCommentCollector();
    };
  }
  const commentsToggleButton = document.getElementById("comments-toggle");
  if (commentsToggleButton) {
    commentsToggleButton.onclick = () => {
      state.commentListExpanded = !state.commentListExpanded;
      renderMain();
    };
  }
}

async function switchMode(mode, supported, message) {
  if (!supported && !confirm(`${message}，仍然切换吗？`)) return;
  state.mode = mode;
  state.tagPicker = null;
  state.processed = state.page.data;
  const previous = state.form || {};
  state.form = {
    ...buildDraft(state.mode, state.processed),
    related_product_id: previous.related_product_id || "",
    related_product_name: previous.related_product_name || "",
  };
  state.message = "模式已切换，可直接保存；如需摘要和标签，再点 AI 整理。";
  renderMain();
}

function bannerClass(platform) {
  return platform === "amazon"
    ? "detect-amazon"
    : platform === "taobao"
      ? "detect-taobao"
      : platform === "xiaohongshu"
        ? "detect-xiaohongshu"
        : platform === "kickstarter"
          ? "detect-kickstarter"
          : "";
}

function bannerIcon(platform) {
  return `<span class="platform-pill ${platform === "amazon" ? "amz" : platform === "taobao" ? "tb" : platform === "xiaohongshu" ? "xhs" : "ks"}">${PLATFORM_LABELS[platform] || platform}</span>`;
}

function spinIcon() {
  return `<svg class="spin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
}

function refreshIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>`;
}

function eyeIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

function eyeOffIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.58 10.58a3 3 0 0 0 4.24 4.24"/><path d="M9.88 5.09A10.74 10.74 0 0 1 12 5c7 0 10 7 10 7a18.73 18.73 0 0 1-4.2 5.38"/><path d="M6.11 6.11C3.46 8.17 2 12 2 12s3 7 10 7a10.93 10.93 0 0 0 5.3-1.39"/></svg>`;
}

function warnIcon() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`;
}

function swirlSpinnerIcon() {
  return `
    <img class="swirl-spin-img" src="../icons/loom-spiral.png" alt="LOOM loading">`;
}

function successMotionIcon() {
  return `
    <div class="success-motion-icon">
      <svg viewBox="0 0 64 64" width="88" height="88" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle class="success-motion-ring" cx="32" cy="32" r="24" pathLength="100"></circle>
        <path class="success-motion-check" d="M21 32.5L28.4 39.6L43 25.8" pathLength="100"></path>
      </svg>
    </div>`;
}

function buildDraft(mode, item) {
  if (mode === "product") {
    return {
      name: cleanText(item?.name || item?.title, ""),
      brand: cleanText(item?.brand, ""),
      category: cleanText(item?.category, "未分类"),
      price: cleanText(item?.price || item?.platforms?.[0]?.price, ""),
      cost_estimate: cleanText(item?.cost_estimate, ""),
      rating: cleanText(item?.rating ?? item?.platforms?.[0]?.rating, ""),
      review_count: cleanText(item?.review_count ?? item?.platforms?.[0]?.reviews, ""),
      monthly_sales: cleanText(item?.monthly_sales || item?.platforms?.[0]?.sales, ""),
      image: cleanText(item?.thumbnail_url || item?.image, ""),
      tags: safeArray(item?.tags),
      selling_points: safeArray(item?.selling_points),
      ai_summary: cleanText(item?.ai_summary, ""),
      platform: state.page?.platform || "",
      url: cleanText(item?.url || state.page?.data?.url, ""),
      sku_id: cleanText(item?.sku_id, ""),
      platforms: safeArray(item?.platforms),
      related_product_id: cleanText(item?.related_product_id, ""),
      related_product_name: cleanText(item?.related_product_name, ""),
      note: cleanText(item?.note, ""),
    };
  }
  const originalText = cleanText(item?.content || item?.original_content || item?.description || item?.summary || item?.ai_summary, "");
  return {
    title: cleanText(item?.title || item?.name, ""),
    summary: originalText,
    content: originalText,
    author: cleanText(item?.author || item?.username || item?.creator, ""),
    likes: Number(item?.likes || 0),
    collects: Number(item?.collects || item?.favorites || 0),
    shares: Number(item?.shares || item?.reposts || item?.forwards || 0),
    comments: Number(item?.comments || 0),
    visible_comments: mergeComments([], item?.visible_comments),
    innovation: cleanText(item?.innovation || item?.tags_innovation, "待分类"),
    scenarios: safeArray(item?.scenarios),
    painpoints: safeArray(item?.painpoints),
    thumbnail_url: cleanText(item?.thumbnail_url || item?.image, ""),
    url: cleanText(item?.url || state.page?.data?.url, ""),
    source: state.page?.platform || "",
    note: cleanText(item?.note, ""),
    debug: item?.debug || state.page?.data?.debug || null,
  };
}

function setField(key, value) {
  state.form = { ...(state.form || {}), [key]: value };
}

function setArrayField(key, value) {
  const list = String(value || "")
    .split(/[\n,，；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  state.form = { ...(state.form || {}), [key]: list };
}

function normalizeComment(item) {
  if (!item || typeof item !== "object") return null;
  const content = cleanText(item.content, "");
  if (!content) return null;
  const userName = cleanText(item.user_name || item.username || item.author, "");
  return {
    id: cleanText(item.id, ""),
    user_id: cleanText(item.user_id, ""),
    user_name: userName === "未知用户" ? "" : userName,
    content,
    like_count: Number(item.like_count || item.likes || 0),
    posted_at_text: cleanText(item.posted_at_text || item.time || item.date, ""),
    location: cleanText(item.location, ""),
    is_reply: Boolean(item.is_reply),
  };
}

function mergeComments(current, incoming) {
  const result = [];
  const seen = new Set();
  const indexByKey = new Map();
  for (const raw of [...safeArray(current), ...safeArray(incoming)]) {
    const item = normalizeComment(raw);
    if (!item) continue;
    const key = item.id || `${item.user_id || item.user_name}:${item.content}`;
    if (seen.has(key)) {
      const existingIndex = indexByKey.get(key);
      const existing = result[existingIndex];
      result[existingIndex] = {
        ...existing,
        ...item,
        user_id: item.user_id || existing.user_id,
        user_name: item.user_name || existing.user_name,
        posted_at_text: item.posted_at_text || existing.posted_at_text,
        location: item.location || existing.location,
      };
      continue;
    }
    seen.add(key);
    indexByKey.set(key, result.length);
    result.push(item);
  }
  return result;
}

async function collectVisibleComments({ silent = false } = {}) {
  if (state.page?.platform !== "xiaohongshu" || !state.tab?.id) return;
  try {
    const result = await readInjectedPageData(state.tab.id, "xiaohongshu");
    if (!result?.ok) throw new Error(result?.error || "评论读取失败");
    const incoming = safeArray(result.data?.visible_comments);
    const next = mergeComments(state.form?.visible_comments, incoming);
    state.page = { ...state.page, data: { ...state.page.data, visible_comments: next } };
    state.processed = { ...(state.processed || {}), visible_comments: next };
    state.form = { ...(state.form || {}), visible_comments: next };
    if (!silent) {
      state.message = next.length
        ? `已采集 ${next.length} 条当前可见评论。`
        : "当前可见评论还没有读到，向下滚动评论区后再试。";
    }
    renderMain();
  } catch (error) {
    if (!silent) {
      state.message = `评论采集失败：${error.message}`;
      renderMain();
    }
  }
}

function stopCommentCollector() {
  if (commentCollectorTimer) {
    clearInterval(commentCollectorTimer);
    commentCollectorTimer = null;
  }
  state.commentCollecting = false;
  state.commentCollectStartedAt = 0;
}

function startCommentCollector() {
  if (state.page?.platform !== "xiaohongshu") return;
  state.commentCollecting = true;
  state.commentCollectStartedAt = Date.now();
  state.message = "已开始监听可见评论。请在左侧小红书评论区慢慢滚动，期间不要关闭面板。";
  void collectVisibleComments({ silent: true });
  if (commentCollectorTimer) clearInterval(commentCollectorTimer);
  commentCollectorTimer = setInterval(() => {
    void collectVisibleComments({ silent: true });
  }, 1200);
  renderMain();
}

async function openRelationPicker() {
  const currentName = String(state.form?.name || "").trim();
  state.relationPickerOpen = true;
  state.relationPickerLoading = true;
  state.relationPickerItems = [];
  state.relationPickerQuery = currentName || "";
  state.relationPickerError = "";
  renderMain();
  try {
    const result = await api("/api/products");
    state.relationPickerItems = Array.isArray(result) ? result : [];
  } catch (error) {
    state.relationPickerError = error.message || "加载失败";
  } finally {
    state.relationPickerLoading = false;
    renderMain();
  }
}

function closeRelationPicker() {
  if (!state.relationPickerOpen) return;
  state.relationPickerOpen = false;
  state.relationPickerLoading = false;
  state.relationPickerItems = [];
  state.relationPickerQuery = "";
  state.relationPickerError = "";
  renderMain();
}

function pickRelation(productId) {
  const product = safeArray(state.relationPickerItems).find((item) => item.id === productId);
  if (!product) return;
  state.form = {
    ...(state.form || {}),
    related_product_id: product.id,
    related_product_name: product.name || "",
  };
  state.message = `已关联同一产品：${product.name || "未命名竞品"}`;
  closeRelationPicker();
}

function productView(item) {
  const listingBullets = safeArray(state.processed?.raw_bullets || state.processed?.listing_bullets || state.page?.data?.raw_bullets || state.page?.data?.listing_bullets);
  const mergedSellingPoints = safeArray(item.selling_points).length ? safeArray(item.selling_points) : listingBullets;
  return `
    <div class="cl-detail-head-card">
      <div class="cl-detail-head-main">
        <input class="ghost-input cl-detail-title-input" data-key="name" value="${escapeAttr(item.name || "")}" placeholder="填入商品名">
        <div class="cl-state"><span class="dot"></span>${escapeHtml(PLATFORM_LABELS[state.page.platform] || state.page.platform)} · ${state.mode === "product" ? "竞品采集" : "需求采集"}</div>
      </div>
      <div class="cl-preview-cover">
        ${item.thumbnail_url || item.image ? `<img src="${escapeAttr(item.thumbnail_url || item.image)}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<div class="ph">PRODUCT<br>IMG</div>`}
      </div>
    </div>
    <div class="cl-section">
      <div class="cl-section-label">平台信息 · 1 个</div>
      ${platformCardsHtml(item)}
    </div>
    <div class="cl-grid-2">
      <div class="cl-section">
        <div class="cl-section-label">品牌</div>
        <input class="ghost-input full" data-key="brand" value="${escapeAttr(item.brand || "")}" placeholder="填入品牌名">
      </div>
      <div class="cl-section">
        <div class="cl-section-label">品类</div>
        <input class="ghost-input full" data-key="category" value="${escapeAttr(item.category || "")}" placeholder="填入品类">
      </div>
    </div>
    <div class="cl-section">
      <div class="cl-section-label">核心卖点 · AI 总结</div>
      ${listEditor("selling_points", mergedSellingPoints, "输入卖点，回车添加", "success")}
    </div>
    <div class="cl-section">
      <div class="cl-section-label">AI 摘要</div>
      <textarea class="ghost-input ai-summary-input" data-key="ai_summary" placeholder="可补充或修改摘要">${escapeHtml(item.ai_summary || "")}</textarea>
    </div>
    <div class="cl-section">
      <div class="cl-section-label">备注</div>
      <textarea class="ghost-input full" data-key="note" placeholder="可选备注">${escapeHtml(item.note || "")}</textarea>
    </div>
  `;
}

function relationPickerView() {
  const query = String(state.relationPickerQuery || "").trim().toLowerCase();
  const items = safeArray(state.relationPickerItems);
  const currentId = String(state.form?.related_product_id || "");
  const filtered = query
    ? items.filter((product) => {
        const haystack = [
          product.name,
          product.brand,
          product.category,
          safeArray(product.tags).join(" "),
          safeArray(product.platforms).map((platform) => `${platform.platform} ${platform.url} ${platform.price}`).join(" "),
        ].join(" ").toLowerCase();
        return haystack.includes(query);
      })
    : items;
  return `
    <div class="modal-backdrop" data-relation-backdrop="1">
      <div class="modal relation-modal">
        <div class="modal-head">
          <div class="modal-title-wrap">
            <div class="modal-title">关联产品</div>
            <div class="modal-sub">搜索并关联同一产品</div>
          </div>
          <button class="icon-btn" data-relation-close="1" type="button" aria-label="关闭">×</button>
        </div>
        <div class="modal-body">
          <input class="ghost-input relation-search" data-relation-query="1" value="${escapeAttr(state.relationPickerQuery || "")}" placeholder="输入商品名、品牌或品类搜索">
          ${state.relationPickerLoading ? `
            <div class="relation-empty">正在加载候选产品…</div>
          ` : state.relationPickerError ? `
            <div class="relation-empty">${escapeHtml(state.relationPickerError)}</div>
          ` : filtered.length === 0 ? `
            <div class="relation-empty">没有匹配的产品</div>
          ` : `
            <div class="relation-list">
              ${filtered.map((product) => `
                <button class="relation-item ${currentId && currentId === product.id ? "is-selected" : ""}" type="button" data-relation-pick="${escapeAttr(product.id)}">
                  <div class="relation-item-main">
                    <div class="relation-item-title">${escapeHtml(product.name || "未命名竞品")}</div>
                    <div class="relation-item-meta">${escapeHtml(product.brand || "无品牌")} · ${escapeHtml(product.category || "未分类")}</div>
                  </div>
                  <div class="relation-item-side">
                    ${safeArray(product.platforms).slice(0, 2).map((platform) => `<span class="relation-chip">${escapeHtml(PLATFORM_LABELS[platform.platform] || platform.platform || "平台")}</span>`).join("")}
                  </div>
                </button>
              `).join("")}
            </div>
          `}
        </div>
        <div class="modal-foot">
          <button class="btn ghost" type="button" data-relation-close="1">取消</button>
        </div>
      </div>
    </div>
  `;
}

function demandView(item) {
  const originalText = item.content || item.original_content || item.summary || "";
  return `
    <div class="source-capture-card">
      <div class="source-card-media">
        ${item.thumbnail_url || item.image ? `<img src="${escapeAttr(item.thumbnail_url || item.image)}" alt="">` : `<div class="ph">XHS<br>IMG</div>`}
      </div>
      <div class="source-capture-main">
        <div class="source-card-state"><span class="dot"></span>小红书 · 原文采集</div>
        <div class="source-title-text">${escapeHtml(item.title || "未命名笔记")}</div>
        <div class="source-author">${escapeHtml(item.author || "未知用户")}</div>
      </div>
      <div class="source-metrics">
        ${sourceMetric("点赞", item.likes)}
        ${sourceMetric("收藏", item.collects)}
        ${sourceMetric("转发", item.shares)}
        ${sourceMetric("评论", item.comments)}
      </div>
    </div>
    <div class="cl-section">
      <div class="cl-section-label">原文正文</div>
      <textarea class="ghost-input full source-content-input" data-key="content" placeholder="采集到的原文正文">${escapeHtml(originalText)}</textarea>
    </div>
    <div class="cl-section">
      ${fieldSelect("innovation", "创新类型", [item.innovation].filter(Boolean), "success", { single: true, groupKey: "innovation_types" })}
    </div>
    <div class="cl-section">
      ${fieldSelect("scenarios", "使用场景", safeArray(item.scenarios), "accent")}
    </div>
    <div class="cl-section">
      ${fieldSelect("painpoints", "用户痛点", safeArray(item.painpoints), "danger")}
    </div>
    ${state.page?.platform === "xiaohongshu" ? commentsCaptureView(item) : ""}
    <div class="cl-section">
      <div class="cl-section-label">备注</div>
      <textarea class="ghost-input full" data-key="note" placeholder="可选备注">${escapeHtml(item.note || "")}</textarea>
    </div>
    <div class="cl-section">
      <div class="cl-section-label">来源链接</div>
      <div class="source-link mono">${escapeHtml(item.url || state.page?.data?.url || "")}</div>
    </div>
  `;
}

function commentsCaptureView(item) {
  const comments = mergeComments([], item.visible_comments);
  const collapsedLimit = 3;
  const isExpanded = state.commentListExpanded;
  const preview = comments.slice(0, isExpanded ? comments.length : collapsedLimit);
  const hiddenCount = Math.max(comments.length - preview.length, 0);
  return `
    <div class="cl-section">
      <div class="comments-card">
        <div class="comments-card-head">
          <div>
            <div class="cl-section-label">可见评论</div>
            <div class="comments-sub">${comments.length ? `已采集 ${comments.length} 条` : "会自动读取当前已加载评论"}</div>
          </div>
          <button class="btn sm comments-more-btn" type="button" id="collect-comments-more">
            ${state.commentCollecting ? "监听中" : "采集更多"}
          </button>
        </div>
        ${state.commentCollecting ? `<div class="comments-tip">请在左侧小红书评论区慢慢滚动，插件会持续收集新出现的评论；不要关闭面板。</div>` : ""}
        <div class="comments-list ${preview.length ? "" : "empty"}">
          ${preview.length ? preview.map(commentItemView).join("") : `<div class="comments-empty">当前页面还没有可见评论，滚到评论区后点“采集更多”。</div>`}
        </div>
        ${comments.length > collapsedLimit ? `
          <button class="comments-toggle" type="button" id="comments-toggle">
            ${isExpanded ? "收起" : `展开全部 ${hiddenCount} 条`}
          </button>
        ` : ""}
      </div>
    </div>
  `;
}

function commentItemView(comment) {
  const meta = [
    comment.posted_at_text,
    comment.location && !String(comment.posted_at_text || "").includes(comment.location) ? comment.location : "",
    `${Number(comment.like_count || 0)} 赞`,
    comment.is_reply ? "回复" : "",
  ].filter(Boolean).join(" · ");
  return `
    <div class="comment-row">
      <div class="comment-row-head">
        <span class="comment-user">${escapeHtml(comment.user_name || "未知用户")}</span>
      </div>
      <div class="comment-content">${escapeHtml(comment.content)}</div>
      <div class="comment-meta">${escapeHtml(meta || "0 赞")}</div>
    </div>
  `;
}

function tagGroupByKey(key) {
  const normalizedKey = key === "innovation" ? "innovation_types" : key;
  return safeArray(state.tagGroups).find((group) => group.key === normalizedKey) ||
    DEFAULT_TAG_GROUPS.find((group) => group.key === normalizedKey) ||
    { key: normalizedKey, name: normalizedKey, tone: "outline", tags: [] };
}

function ensureTagOption(groupKey, value) {
  const normalizedKey = groupKey === "innovation" ? "innovation_types" : groupKey;
  const cleanValue = cleanText(value);
  if (!cleanValue) return;
  const groups = safeArray(state.tagGroups).length ? safeArray(state.tagGroups) : DEFAULT_TAG_GROUPS;
  let changed = false;
  state.tagGroups = groups.map((group) => {
    if (group.key !== normalizedKey) return group;
    if (safeArray(group.tags).includes(cleanValue)) return group;
    changed = true;
    return { ...group, tags: [...safeArray(group.tags), cleanValue] };
  });
  if (!changed) return;
  api("/api/settings", {
    method: "PATCH",
    body: JSON.stringify({ tag_groups: state.tagGroups }),
  }).catch(() => {});
}

function fieldSelect(key, label, selectedValues, tone = "accent", options = {}) {
  const group = tagGroupByKey(options.groupKey || key);
  const selected = safeArray(selectedValues).filter(Boolean);
  const active = state.tagPicker?.key === key;
  return `
    <div class="field-select ${active ? "open" : ""}" data-field-select="${escapeAttr(key)}">
      <div class="field-select-head">
        <div class="cl-section-label">${escapeHtml(label)}${options.single ? "" : " · 多选"}</div>
        <button class="field-select-trigger" type="button" data-open-tag-picker="${escapeAttr(key)}">
          选择
        </button>
      </div>
      <div class="field-selected-row">
        ${selected.length ? selected.map((item) => `
          <span class="tag ${tone} removable" data-tag-key="${escapeAttr(key)}" data-tag-value="${escapeAttr(item)}">
            ${escapeHtml(item)}<button type="button">×</button>
          </span>
        `).join("") : `<span class="field-empty">未选择</span>`}
      </div>
      ${active ? tagPickerPanel(key, group, selected, tone, options) : ""}
    </div>
  `;
}

function tagPickerPanel(key, group, selected, tone, options = {}) {
  const query = String(state.tagPicker?.query || "").trim();
  const allOptions = Array.from(new Set([...safeArray(group.tags), ...selected])).filter(Boolean);
  const filtered = query ? allOptions.filter((item) => item.toLowerCase().includes(query.toLowerCase())) : allOptions;
  const hasExact = query && allOptions.some((item) => item.toLowerCase() === query.toLowerCase());
  return `
    <div class="field-picker">
      <input class="field-picker-search" data-tag-query="${escapeAttr(key)}" value="${escapeAttr(query)}" placeholder="搜索或新建选项" autofocus>
      <div class="field-picker-list">
        ${filtered.map((item) => {
          const checked = selected.includes(item);
          return `
            <button class="field-option ${checked ? "selected" : ""}" type="button" data-toggle-tag="${escapeAttr(key)}" data-value="${escapeAttr(item)}" data-single="${options.single ? "1" : "0"}">
              <span class="field-check">${checked ? "✓" : ""}</span>
              <span class="tag ${tone}">${escapeHtml(item)}</span>
              ${checked ? `<span class="field-option-x">×</span>` : ""}
            </button>
          `;
        }).join("")}
        ${query && !hasExact ? `
          <button class="field-option create" type="button" data-toggle-tag="${escapeAttr(key)}" data-value="${escapeAttr(query)}" data-single="${options.single ? "1" : "0"}">
            <span class="field-check">+</span>
            <span>新建 “${escapeHtml(query)}”</span>
          </button>
        ` : ""}
      </div>
    </div>
  `;
}

function sourceMetric(label, value) {
  const display = value === 0 || value ? value : "—";
  return `
    <div class="source-metric">
      <span class="source-metric-label">${escapeHtml(label)}</span>
      <span class="source-metric-value">${escapeHtml(display)}</span>
    </div>
  `;
}

function platformCardsHtml(item) {
  const platforms = safeArray(item.platforms).length ? safeArray(item.platforms) : [{
    platform: state.page.platform,
    url: state.page.data?.url || "",
    price: item.price || "",
    rating: item.rating || "",
    reviews: item.review_count || "",
    sales: item.monthly_sales || "",
  }];
  return platforms.map((pl, index) => `
    <div class="platform-card compact">
      <div class="platform-card-head">
        <span class="platform-pill ${platformClass(pl.platform)}">${PLATFORM_LABELS[pl.platform] || pl.platform || "平台"}</span>
        <input class="platform-card-link mono" data-key="platforms.${index}.url" value="${escapeAttr(pl.url || "")}" aria-label="平台链接">
      </div>
      <div class="platform-card-grid">
        ${metric("售价", `platforms.${index}.price`, pl.price || "", "$")}
        ${metric("参考成本", `platforms.${index}.cost`, pl.cost || item.cost_estimate || "", "¥")}
        ${showMarketplaceRating(pl.platform) ? metric("评分", `platforms.${index}.rating`, pl.rating ?? "", "★") : ""}
        ${showMarketplaceRating(pl.platform) ? metric("评论数", `platforms.${index}.reviews`, pl.reviews ?? "", "") : ""}
        ${metric("月销估算", `platforms.${index}.sales`, pl.sales || "", "", "/月")}
      </div>
    </div>
  `).join("");
}

function isCommercePlatform(platform) {
  return ["amazon", "taobao", "kickstarter"].includes(platform);
}

function showMarketplaceRating(platform) {
  return platform !== "taobao";
}

function metric(label, key, value, prefix, suffix = "") {
  return `
    <label class="metric${label === "月销估算" ? " span-2" : ""}">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-input-wrap">
        ${prefix ? `<span class="metric-prefix ${prefix === "★" ? "rating-star" : ""}">${escapeHtml(prefix)}</span>` : ""}
        <input class="metric-input" data-key="${escapeAttr(key)}" value="${escapeAttr(value || "")}">
        ${suffix ? `<span class="metric-suffix">${escapeHtml(suffix)}</span>` : ""}
      </div>
    </label>
  `;
}

function listEditor(key, items, placeholder, tone) {
  const rows = safeArray(items).map((item, index) => `
    <div class="list-row ${tone === "danger" ? "danger" : ""}" data-list-key="${escapeAttr(key)}" data-index="${index}">
      <span class="list-idx">${index + 1}</span>
      <input value="${escapeAttr(item)}" placeholder="${escapeAttr(placeholder)}">
      <button type="button" class="list-x">×</button>
    </div>
  `).join("");
  return `
    <div class="list-editor" data-list-editor="${escapeAttr(key)}">
      ${rows}
      <div class="list-row add ${tone === "danger" ? "danger" : ""}" data-add-row="${escapeAttr(key)}">
        <span class="list-idx">${safeArray(items).length + 1}</span>
        <input placeholder="${escapeAttr(placeholder)}">
        <button type="button" class="btn ghost">添加</button>
      </div>
    </div>
  `;
}

function platformClass(platform) {
  return platform === "amazon"
    ? "amz"
    : platform === "taobao"
      ? "tb"
      : platform === "xiaohongshu"
        ? "xhs"
        : platform === "kickstarter"
          ? "ks"
          : "";
}

function bindHeader() {
  document.getElementById("open-options").onclick = () => chrome.runtime.openOptionsPage();
  const reloadButton = document.getElementById("header-reload");
  if (reloadButton) reloadButton.onclick = () => reloadCurrentPage();
  const logoutButton = document.getElementById("header-logout");
  if (logoutButton) {
    logoutButton.onclick = async () => {
      try {
        await fetch(`${state.apiBase}/api/auth/logout`, {
          method: "POST",
          headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
        });
      } catch {}
      await removeSessionCookie();
      await clearAuthState();
      renderLoginWait("你已退出登录");
    };
  }
}

function handleGlobalClick(event) {
  const tab = event.target.closest(".cl-tab");
  if (tab) {
    tab.parentElement.querySelectorAll(".cl-tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    return;
  }

  const pickerTrigger = event.target.closest("[data-open-tag-picker]");
  if (pickerTrigger) {
    const key = pickerTrigger.getAttribute("data-open-tag-picker");
    state.tagPicker = state.tagPicker?.key === key ? null : { key, query: "" };
    renderMain();
    return;
  }

  const toggleTag = event.target.closest("[data-toggle-tag]");
  if (toggleTag) {
    const key = toggleTag.getAttribute("data-toggle-tag");
    const value = toggleTag.getAttribute("data-value");
    const single = toggleTag.getAttribute("data-single") === "1";
    if (!key || !value) return;
    ensureTagOption(key, value);
    if (single || key === "innovation") {
      state.form = { ...(state.form || {}), [key]: value };
      state.tagPicker = null;
    } else {
      const current = safeArray(state.form?.[key]);
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      state.form = { ...(state.form || {}), [key]: next };
    }
    renderMain();
    return;
  }

  const removable = event.target.closest(".tag.removable");
  if (removable) {
    const key = removable.getAttribute("data-tag-key");
    const value = removable.getAttribute("data-tag-value");
    if (!key || !value) return;
    state.form = {
      ...(state.form || {}),
      [key]: key === "innovation" ? "待分类" : safeArray(state.form?.[key]).filter((item) => item !== value),
    };
    renderMain();
    return;
  }

  if (state.tagPicker && !event.target.closest("[data-field-select]")) {
    state.tagPicker = null;
    renderMain();
    return;
  }

  const bulletDelete = event.target.closest(".list-x");
  if (bulletDelete) {
    const row = bulletDelete.closest(".list-row");
    const key = row?.getAttribute("data-list-key");
    const index = Number(row?.getAttribute("data-index"));
    if (!key || Number.isNaN(index)) return;
    state.form = { ...(state.form || {}), [key]: safeArray(state.form?.[key]).filter((_, i) => i !== index) };
    renderMain();
    return;
  }

  const bulletAdd = event.target.closest("[data-add-row]");
  if (bulletAdd) {
    const key = bulletAdd.getAttribute("data-add-row");
    const row = bulletAdd.closest(".list-row");
    const input = row?.querySelector("input");
    const value = String(input?.value || "").trim();
    if (!value || !key) return;
    const next = safeArray(state.form?.[key]);
    next.push(value);
    state.form = { ...(state.form || {}), [key]: next };
    renderMain();
  }
}

document.addEventListener("input", (event) => {
  const el = event.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  const tagQueryKey = el.getAttribute("data-tag-query");
  if (tagQueryKey) {
    state.tagPicker = { key: tagQueryKey, query: el.value };
    renderMain();
    return;
  }
  const key = el.getAttribute("data-key");
  if (!key) return;
  if (key.startsWith("platforms.")) {
    const [, indexStr, field] = key.split(".");
    const index = Number(indexStr);
    const platforms = safeArray(state.form?.platforms).slice();
    const current = { ...(platforms[index] || {}) };
    current[field] = el.value;
    platforms[index] = current;
    state.form = { ...(state.form || {}), platforms };
    if (index === 0 && (field === "price" || field === "sales" || field === "url")) {
      const linkedKey = field === "sales" ? "monthly_sales" : field;
      state.form = { ...state.form, [linkedKey]: el.value };
      const summary = document.querySelector(field === "sales" ? "[data-sales-summary]" : "[data-price-summary]");
      if (summary && field !== "url") summary.textContent = el.value || "—";
    }
    return;
  }
  if (key === "scenarios" || key === "painpoints") return;
  if (key === "selling_points") {
    state.form = { ...(state.form || {}), [key]: String(el.value || "").split(/[\n,，；;]+/).map((item) => item.trim()).filter(Boolean) };
    return;
  }
  setField(key, el.value);
});

function handleSaveMutation() {
  return state.form || buildDraft(state.mode, state.processed || state.page?.data || {});
}

function productPayload(item) {
  return {
    ...item,
    source_url: item.url || state.page.data.url,
    platform: state.page.platform,
    name: item.name,
    brand: item.brand || "",
    category: item.category || "",
    price: item.price || "",
    cost_estimate: item.cost_estimate || "",
    rating: item.rating || null,
    review_count: Number(item.review_count || 0),
    monthly_sales: item.monthly_sales || "",
    image: item.image || item.thumbnail_url || "",
    thumbnail_url: item.thumbnail_url || item.image || "",
    tags: safeArray(item.tags),
    selling_points: safeArray(item.selling_points),
    platforms: safeArray(item.platforms).length ? item.platforms : [{
      id: `${state.page.platform}-${Date.now()}`,
      platform: state.page.platform,
      url: item.url || state.page.data.url,
      price: item.price || "",
      rating: item.rating || null,
      reviews: Number(item.review_count || 0),
      sales: item.monthly_sales || "",
      fetched_at: new Date().toISOString(),
    }],
    related_product_id: item.related_product_id || "",
    related_product_name: item.related_product_name || "",
    note: item.note || "",
  };
}

function demandPayload(item) {
  return {
    ...item,
    title: item.title,
    source_url: item.url || state.page.data.url,
    url: item.url || state.page.data.url,
    source: state.page.platform,
    source_platform: state.page.platform,
    summary: item.summary || item.content || item.original_content || "",
    original_content: item.content || item.original_content || item.summary || item.description || state.page?.data?.content || "",
    author: item.author || "",
    likes: Number(item.likes || 0),
    collects: Number(item.collects || 0),
    shares: Number(item.shares || 0),
    comments: Number(item.comments || 0),
    visible_comments: mergeComments([], item.visible_comments),
    scenarios: safeArray(item.scenarios),
    painpoints: safeArray(item.painpoints),
    innovation: item.innovation || "待分类",
    thumbnail_url: item.thumbnail_url || item.image || "",
    note: item.note || "",
    import_method: "chrome_extension",
  };
}

async function saveCurrent() {
  const item = handleSaveMutation();
  if (!state.page?.data?.url) return alert("缺少页面 URL，不能保存");
  if (state.mode === "product" && !item.name) return alert("缺少商品名称，不能保存");
  if (state.mode === "demand" && !item.title) return alert("缺少需求标题，不能保存");
  renderLoading("正在保存");
  try {
    const payload = state.mode === "product" ? productPayload(item) : demandPayload(item);
    await api(state.mode === "product" ? "/api/products" : "/api/demands", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.message = "保存成功";
    renderSuccess(payload);
  } catch (error) {
    state.message = `保存失败：${error.message}`;
    renderMain();
  }
}

function renderSuccess(payload) {
  document.getElementById("app").innerHTML = `
    <div class="shell">
      ${headerHtml()}
      <div class="cl-body">
        <div class="cl-success-hero" aria-hidden="true">${successMotionIcon()}</div>
        <div class="cl-hint">已保存到 ${state.mode === "product" ? "竞品库" : "需求管理"} · ${escapeHtml(payload.name || payload.title || "")}</div>
        <div class="cl-empty-hint">你可以继续抓取下一条页面，或者打开 Web 端查看结果。</div>
        <div class="cl-spacer"></div>
      </div>
      <div class="cl-foot">
        <button class="btn ghost grow" id="again">继续采集</button>
        <button class="btn primary grow" id="open-web">打开 Web 端</button>
      </div>
    </div>`;
  bindHeader();
  document.getElementById("again").onclick = () => loadCurrentPage();
  document.getElementById("open-web").onclick = () => chrome.tabs.create({ url: state.apiBase });
}

function headerHtml(options = {}) {
  const { platform, mode, title, loading = false, warning = false } = options;
  const statusTitle = title || `${PLATFORM_LABELS[platform] || platform || "LOOM"} · ${mode === "demand" ? "需求采集" : "竞品采集"}`;
  const hasCaptureStatus = Boolean(platform || title || loading || warning);
  return `
    <div class="cl-top">
      ${hasCaptureStatus ? `
        <div class="cl-capture-status">
          ${loading ? `<span class="cl-top-status-ico">${spinIcon()}</span>` : warning ? `<span class="cl-top-status-ico warn">${warnIcon()}</span>` : bannerIcon(platform)}
          <span class="cl-top-status-title">${escapeHtml(statusTitle)}</span>
        </div>
      ` : `
        <div class="cl-brand">
          <img class="cl-mark cl-mark-image" src="../icons/icon48.png" alt="LOOM extension logo">
          <div>
            <div class="cl-name">LOOM</div>
          </div>
        </div>
      `}
      ${state.token ? `<button class="ico-btn" id="header-logout" aria-label="退出登录">${logoutIcon()}</button>` : ""}
      ${state.page ? `<button class="ico-btn" id="header-reload" aria-label="刷新">${refreshIcon()}</button>` : ""}
      <button class="ico-btn" id="open-options" aria-label="设置">${settingsIcon()}</button>
    </div>`;
}

function settingsIcon() {
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
}

function logoutIcon() {
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
