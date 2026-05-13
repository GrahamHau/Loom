const API_BASE_KEY = "pmcopilot_api_base";
const TOKEN_KEY = "pmcopilot_token";
const USER_KEY = "pmcopilot_user";
const DEFAULT_MODE_KEY = "pmcopilot_default_mode";
const AI_BEFORE_SAVE_KEY = "pmcopilot_ai_before_save";

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

const state = {
  apiBase: "",
  token: "",
  user: null,
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
};

let autoSyncTimer = null;
let autoSyncPoller = null;
let pendingUrlSync = false;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text || text === "null" || text === "undefined") return fallback;
  return text;
}

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("click", handleGlobalClick);

async function init() {
  const stored = await chrome.storage.local.get([API_BASE_KEY, TOKEN_KEY, USER_KEY, DEFAULT_MODE_KEY, AI_BEFORE_SAVE_KEY]);
  state.apiBase = (stored[API_BASE_KEY] || "https://ulanzi-copilot.my1panelsite.xyz").replace(/\/$/, "");
  state.token = stored[TOKEN_KEY] || "";
  state.user = stored[USER_KEY] || null;
  if (!state.token) {
    renderLogin();
    return;
  }
  if (stored[AI_BEFORE_SAVE_KEY] === undefined) {
    await chrome.storage.local.set({ [AI_BEFORE_SAVE_KEY]: false });
  }
  renderLoading("正在读取当前页面");
  bindAutoSync();
  await loadCurrentPage(stored[DEFAULT_MODE_KEY] || "auto");
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
  try {
    if (platform) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/detector.js", EXTRACTOR_FILES[platform]],
      });
    }
    return await chrome.tabs.sendMessage(tab.id, { type: "PM_COPILOT_GET_PAGE_DATA" });
  } catch (error) {
    if (!String(error.message || "").includes("Receiving end does not exist")) throw error;
    if (!platform) throw new Error("当前页面不在插件支持范围内");
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/detector.js", EXTRACTOR_FILES[platform]],
    });
    return chrome.tabs.sendMessage(tab.id, { type: "PM_COPILOT_GET_PAGE_DATA" });
  }
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
    return /^\/explore\/[a-z0-9]+$/i.test(parsed.pathname);
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

function renderLogin() {
  document.getElementById("app").innerHTML = `
    <div class="shell">
      <div class="header">
        <div class="brand">
          <div class="logo">L</div>
          <div>
            <div class="title">LOOM</div>
            <div class="sub">连接情报工作台</div>
          </div>
        </div>
        <button class="icon-btn" id="open-options" title="设置">⚙</button>
      </div>
      <div class="cl-body cl-login-body">
        <form class="cl-login" id="login-form">
          <div class="cl-login-head">
            <div class="cl-login-glyph">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div>
              <div class="cl-login-title">登录 LOOM</div>
              <div class="cl-login-sub">连接后端后才能保存采集到的竞品与需求</div>
            </div>
          </div>

          <div class="cl-login-fields">
            <label class="cl-login-field">
              <span>服务器地址</span>
              <input class="login-input mono" id="api-base" type="url" value="${escapeHtml(state.apiBase)}" placeholder="https://ulanzi-copilot.my1panelsite.xyz">
            </label>
            <label class="cl-login-field">
              <span>用户名</span>
              <input class="login-input" id="username" type="text" placeholder="graham">
            </label>
            <label class="cl-login-field">
              <span>密码</span>
              <div class="input-wrap">
                <input class="login-input mono" id="password" type="password" placeholder="••••••••">
                <button class="ico-btn sm" id="toggle-password" type="button" aria-label="显示密码">${eyeIcon()}</button>
              </div>
            </label>
          </div>

          <div class="cl-login-note hint-warn">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            <span>账号信息会保存在 chrome.storage.local，仅本机使用</span>
          </div>

          <div class="cl-login-status mono" id="login-status">等待连接测试</div>
        </form>
      </div>
      <div class="cl-foot">
        <button class="btn ghost grow" id="test-connection" type="button">测试连接</button>
        <button class="btn primary grow" form="login-form" type="submit">登录并保存</button>
      </div>
    </div>`;
  document.getElementById("open-options").onclick = () => chrome.runtime.openOptionsPage();
  document.getElementById("toggle-password").onclick = () => {
    const input = document.getElementById("password");
    const button = document.getElementById("toggle-password");
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    button.innerHTML = visible ? eyeIcon() : eyeOffIcon();
  };
  document.getElementById("test-connection").onclick = async () => {
    const apiBase = document.getElementById("api-base").value.trim().replace(/\/$/, "");
    const status = document.getElementById("login-status");
    if (!apiBase) {
      status.textContent = "请先填写服务器地址";
      return;
    }
    status.textContent = "正在测试连接…";
    try {
      await pingApiBase(apiBase);
      status.textContent = "连接正常";
    } catch (error) {
      status.textContent = `连接失败：${error.message}`;
    }
  };
  document.getElementById("login-form").onsubmit = async (event) => {
    event.preventDefault();
    const apiBase = document.getElementById("api-base").value.trim().replace(/\/$/, "");
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    if (!apiBase || !username || !password) return alert("请填写服务器地址、用户名和密码");
    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登录失败");
      if (!data.token) throw new Error("服务器还未更新插件登录接口：/api/auth/login 没有返回 token。请先部署最新后端。");
      await chrome.storage.local.set({
        [API_BASE_KEY]: apiBase,
        [TOKEN_KEY]: data.token,
        [USER_KEY]: { username, ...(data.user || {}) },
      });
      state.apiBase = apiBase;
      state.token = data.token;
      state.user = { username, ...(data.user || {}) };
      await loadCurrentPage();
    } catch (error) {
      alert(error.message);
    }
  };
}

function renderLoading(text) {
  document.getElementById("app").innerHTML = `
    <div class="shell">
      ${headerHtml()}
      <div class="cl-banner detecting">
        <div class="cl-banner-ico">${spinIcon()}</div>
        <div class="cl-banner-body">
          <div class="cl-banner-title">${escapeHtml(text)}</div>
          <div class="cl-banner-sub mono">${escapeHtml(state.tab?.url || state.page?.data?.url || "")}</div>
        </div>
      </div>
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
      ${headerHtml()}
      <div class="cl-banner banner-warn">
        <div class="cl-banner-ico warn">${warnIcon()}</div>
        <div class="cl-banner-body">
          <div class="cl-banner-title">当前页面无法采集</div>
          <div class="cl-banner-sub mono">${escapeHtml(reason)}</div>
        </div>
      </div>
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
      ${headerHtml()}
      <div class="cl-top-actions">
        <button class="btn top-action" id="save-top" ${state.busy ? "disabled" : ""}>保存</button>
        <button class="btn top-action" id="process-top" ${state.busy ? "disabled" : ""}>${state.busy ? "处理中..." : "AI 整理"}</button>
      </div>
      <div class="cl-banner ${bannerClass(platform)}">
        ${state.reloading ? `<div class="cl-banner-ico">${spinIcon()}</div>` : bannerIcon(platform)}
      <div class="cl-banner-body">
        <div class="cl-banner-title">${escapeHtml(PLATFORM_LABELS[platform] || platform)} · ${state.mode === "product" ? "竞品采集" : "需求采集"}</div>
      </div>
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
        ${state.mode === "product" && isCommercePlatform(platform) ? `<button class="btn primary grow" id="open-relation" type="button">${item.related_product_name ? "重新关联" : "关联"}</button>` : ""}
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
}

async function switchMode(mode, supported, message) {
  if (!supported && !confirm(`${message}，仍然切换吗？`)) return;
  state.mode = mode;
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
    };
  }
  return {
    title: cleanText(item?.title || item?.name, ""),
    summary: cleanText(item?.summary || item?.ai_summary || item?.content || item?.description, ""),
    content: cleanText(item?.content || item?.original_content || item?.description, ""),
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
  return `
    <div class="cl-detail-head-card">
      <div class="cl-preview-cover">
        ${item.thumbnail_url || item.image ? `<img src="${escapeAttr(item.thumbnail_url || item.image)}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<div class="ph">PRODUCT<br>IMG</div>`}
      </div>
      <div class="cl-detail-head-main">
        <input class="ghost-input cl-detail-title-input" data-key="name" value="${escapeAttr(item.name || "")}" placeholder="填入商品名">
        <div class="cl-detail-meta">${escapeHtml(item.category || "未分类")} · 跟踪中</div>
        <div class="cl-preview-platform">
          <span class="platform-pill ${platformClass(state.page.platform)}">${PLATFORM_LABELS[state.page.platform] || state.page.platform}</span>
          ${showMarketplaceRating(state.page.platform) ? `<span class="rating-mini">${item.rating ? `<span class="rating-star">★</span>${escapeHtml(item.rating)}` : ""}${item.review_count ? ` <span class="muted">· ${escapeHtml(item.review_count)}</span>` : ""}</span>` : ""}
        </div>
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
      ${listEditor("selling_points", safeArray(item.selling_points), "输入卖点，回车添加", "success")}
    </div>
    <div class="cl-section">
      <div class="cl-section-label">AI 摘要</div>
      <textarea class="ghost-input ai-summary-input" data-key="ai_summary" placeholder="可补充或修改摘要">${escapeHtml(item.ai_summary || "")}</textarea>
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
  return `
    <div class="cl-hero hero-30">
      ${item.thumbnail_url || item.image ? `<img src="${escapeAttr(item.thumbnail_url || item.image)}" alt="" style="width:100%;height:100%;object-fit:cover">` : ""}
    </div>
    <div class="cl-section">
      <div class="cl-section-label">标题</div>
      <input class="ghost-input full title" data-key="title" value="${escapeAttr(item.title || "")}" placeholder="填入标题">
    </div>
    <div class="cl-section">
      <div class="cl-section-label">AI 摘要 / 原文</div>
      <textarea class="ghost-input full" data-key="summary" placeholder="补充摘要或原文">${escapeHtml(item.summary || "")}</textarea>
    </div>
    <div class="cl-section">
      <div class="cl-section-label">首图 URL</div>
      <input class="ghost-input full mono" data-key="thumbnail_url" value="${escapeAttr(item.thumbnail_url || "")}" placeholder="未采到时可手动粘贴首图链接">
    </div>
    <div class="cl-section">
      <div class="cl-section-label">创新类型 · 多选</div>
      <div class="tag-row">
        <span class="tag accent">${escapeHtml(item.innovation || "待分类")}</span>
        <button class="tag dashed" data-add-key="innovation">+ 添加</button>
      </div>
    </div>
    <div class="cl-section">
      <div class="cl-section-label">使用场景 · 多选</div>
      <div class="tag-row">
        ${safeArray(item.scenarios).map((t) => `<span class="tag removable" data-tag-key="scenarios" data-tag-value="${escapeAttr(t)}">${escapeHtml(t)}<button type="button">×</button></span>`).join("")}
        <button class="tag dashed" data-add-key="scenarios">+ 添加</button>
      </div>
    </div>
    <div class="cl-section">
      <div class="cl-section-label">用户痛点 · 多选</div>
      <div class="tag-row">
        ${safeArray(item.painpoints).map((t) => `<span class="tag danger removable" data-tag-key="painpoints" data-tag-value="${escapeAttr(t)}">${escapeHtml(t)}<button type="button">×</button></span>`).join("")}
        <button class="tag dashed" data-add-key="painpoints">+ 添加</button>
      </div>
    </div>
    <div class="cl-section">
      <div class="cl-section-label">来源链接</div>
      <div class="source-link mono">${escapeHtml(item.url || state.page?.data?.url || "")}</div>
    </div>
    ${item.debug ? `
    <div class="cl-section">
      <div class="cl-section-label">调试信息</div>
      <div class="source-link mono">${escapeHtml(JSON.stringify(item.debug, null, 2))}</div>
    </div>` : ""}
    <div class="cl-section">
      <div class="cl-section-label">备注</div>
      <textarea class="ghost-input full" data-key="note" placeholder="可选备注">${escapeHtml(item.note || "")}</textarea>
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
}

function handleGlobalClick(event) {
  const tab = event.target.closest(".cl-tab");
  if (tab) {
    tab.parentElement.querySelectorAll(".cl-tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    return;
  }

  const addTag = event.target.closest("[data-add-key]");
  if (addTag) {
    const key = addTag.getAttribute("data-add-key");
    const row = addTag.closest(".tag-row");
    const input = row?.querySelector("input");
    const value = String(input?.value || "").trim();
    if (!value) return;
    if (key === "innovation") {
      state.form = { ...(state.form || {}), innovation: value };
    } else {
      const next = safeArray(state.form?.[key]);
      if (!next.includes(value)) next.push(value);
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
    state.form = { ...(state.form || {}), [key]: safeArray(state.form?.[key]).filter((item) => item !== value) };
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
    summary: item.summary || "",
    original_content: item.content || item.original_content || item.description || state.page?.data?.content || "",
    scenarios: safeArray(item.scenarios),
    painpoints: safeArray(item.painpoints),
    innovation: item.innovation || "待分类",
    thumbnail_url: item.thumbnail_url || item.image || "",
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

function headerHtml() {
  const name = state.user?.username || state.user?.name || "Graham";
  return `
    <div class="cl-top">
      <div class="cl-brand">
        <div>
          <div class="cl-name">LOOM</div>
          <div class="cl-conn"><span class="dot dot-ok"></span>已连接 · ${escapeHtml(name)}</div>
        </div>
      </div>
      ${state.page ? `<button class="ico-btn" id="header-reload" aria-label="刷新">${refreshIcon()}</button>` : ""}
      <button class="ico-btn" id="open-options" aria-label="设置">${settingsIcon()}</button>
    </div>`;
}

function settingsIcon() {
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
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
