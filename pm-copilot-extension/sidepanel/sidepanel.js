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

const state = {
  apiBase: "",
  token: "",
  user: null,
  tab: null,
  page: null,
  mode: "product",
  processed: null,
  busy: false,
  message: "",
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const stored = await chrome.storage.local.get([API_BASE_KEY, TOKEN_KEY, USER_KEY, DEFAULT_MODE_KEY]);
  state.apiBase = (stored[API_BASE_KEY] || "https://ulanzi-copilot.my1panelsite.xyz").replace(/\/$/, "");
  state.token = stored[TOKEN_KEY] || "";
  state.user = stored[USER_KEY] || null;
  if (!state.token) {
    renderLogin();
    return;
  }
  renderLoading("正在读取当前页面");
  await loadCurrentPage(stored[DEFAULT_MODE_KEY] || "auto");
}

async function loadCurrentPage(defaultMode = "auto") {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tab = tab;
    const result = await chrome.tabs.sendMessage(tab.id, { type: "PM_COPILOT_GET_PAGE_DATA" });
    if (!result?.ok) {
      state.page = null;
      renderUnsupported(result?.error || "unsupported_page");
      return;
    }
    state.page = result;
    state.mode = defaultMode === "demand" ? "demand"
      : defaultMode === "product" ? "product"
      : DEMAND_PLATFORMS.has(result.platform) ? "demand" : "product";
    state.processed = result.data;
    await maybeProcess();
    renderMain();
  } catch (error) {
    state.page = null;
    renderUnsupported(error.message || "无法读取页面");
  }
}

async function maybeProcess() {
  const stored = await chrome.storage.local.get([AI_BEFORE_SAVE_KEY]);
  if (stored[AI_BEFORE_SAVE_KEY] === false) return;
  await processRaw();
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
    state.message = "AI 结构化完成";
  } catch (error) {
    state.processed = state.page.data;
    state.message = `AI 处理失败，已保留原始字段：${error.message}`;
  } finally {
    state.busy = false;
  }
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

function renderLogin() {
  document.getElementById("app").innerHTML = `
    <div class="shell">
      <div class="header">
        <div class="brand"><div class="logo">P</div><div><div class="title">PM Copilot</div><div class="sub">连接情报中台</div></div></div>
        <button class="icon-btn" id="open-options" title="设置">⚙</button>
      </div>
      <div class="body">
        <form class="card form" id="login-form">
          <label>服务器地址<input id="api-base" type="url" value="${escapeHtml(state.apiBase)}" placeholder="https://ulanzi-copilot.my1panelsite.xyz"></label>
          <label>用户名<input id="username" type="text" placeholder="graham"></label>
          <label>密码<input id="password" type="password" placeholder="••••••••"></label>
          <button class="btn primary" type="submit">登录</button>
          <div class="status">Token 保存在 Chrome 本地 storage。</div>
        </form>
      </div>
    </div>`;
  document.getElementById("open-options").onclick = () => chrome.runtime.openOptionsPage();
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
      if (!data.token) {
        throw new Error("服务器还未更新插件登录接口：/api/auth/login 没有返回 token。请先部署最新后端。");
      }
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
  document.getElementById("app").innerHTML = `<div class="loading"><div class="spinner"></div>${escapeHtml(text)}</div>`;
}

function renderUnsupported(reason) {
  document.getElementById("app").innerHTML = `
    <div class="shell">
      ${headerHtml()}
      <div class="body">
        <div class="banner">当前页面无法采集：${escapeHtml(reason)}</div>
        <div class="card status">支持 Amazon、淘宝/天猫、小红书、Kickstarter。请打开商品页或笔记页后刷新右侧栏。</div>
        <button class="btn primary" id="refresh">重新检测</button>
      </div>
    </div>`;
  bindHeader();
  document.getElementById("refresh").onclick = () => loadCurrentPage();
}

function renderMain() {
  const item = state.processed || {};
  const platform = state.page.platform;
  const canProduct = PRODUCT_PLATFORMS.has(platform);
  const canDemand = DEMAND_PLATFORMS.has(platform) || platform === "kickstarter";
  document.getElementById("app").innerHTML = `
    <div class="shell">
      ${headerHtml()}
      <div class="body">
        <div class="banner detect-${platform}">检测到 ${PLATFORM_LABELS[platform] || platform} · ${state.mode === "product" ? "竞品采集" : "需求采集"}</div>
        <div class="tabs">
          <button class="tab ${state.mode === "product" ? "active" : ""}" id="mode-product">竞品</button>
          <button class="tab ${state.mode === "demand" ? "active" : ""}" id="mode-demand">需求</button>
        </div>
        ${previewHtml(item)}
        ${state.message ? `<div class="status ${state.message.includes("失败") ? "error" : "success"}">${escapeHtml(state.message)}</div>` : ""}
        <div class="actions">
          <button class="btn" id="process" ${state.busy ? "disabled" : ""}>AI 处理</button>
          <button class="btn primary" id="save" ${state.busy ? "disabled" : ""}>保存到${state.mode === "product" ? "竞品库" : "需求管理"}</button>
        </div>
      </div>
    </div>`;
  bindHeader();
  document.getElementById("mode-product").onclick = () => switchMode("product", canProduct, "此页面建议使用需求模式");
  document.getElementById("mode-demand").onclick = () => switchMode("demand", canDemand, "此页面建议使用竞品模式");
  document.getElementById("process").onclick = async () => {
    renderLoading("AI 结构化中");
    await processRaw();
    renderMain();
  };
  document.getElementById("save").onclick = saveCurrent;
}

async function switchMode(mode, supported, message) {
  if (!supported && !confirm(`${message}，仍然切换吗？`)) return;
  state.mode = mode;
  state.processed = state.page.data;
  state.message = "";
  renderLoading("正在切换模式");
  await maybeProcess();
  renderMain();
}

function previewHtml(item) {
  const title = state.mode === "product" ? (item.name || item.title || "未命名竞品") : (item.title || item.name || "未命名需求");
  const tags = [
    ...(item.selling_points || item.tags || item.scenarios || []).map((value) => [value, ""]),
    ...(item.negative_keywords || item.painpoints || []).map((value) => [value, "neg"]),
  ].slice(0, 10);
  return `
    <div class="card">
      <div class="preview-top">
        <div class="thumb">${item.thumbnail_url || item.image ? `<img src="${escapeAttr(item.thumbnail_url || item.image)}" alt="">` : "P"}</div>
        <div class="preview-main">
          <div class="preview-title">${escapeHtml(title)}</div>
          ${state.mode === "product" ? `<div class="price">${escapeHtml(item.price || item.platforms?.[0]?.price || "—")}</div>` : ""}
          <div class="meta">
            ${item.rating ? `<span>${escapeHtml(item.rating)} ★</span>` : ""}
            ${item.review_count || item.reviews ? `<span>${escapeHtml(item.review_count || item.reviews)} 评</span>` : ""}
            ${item.monthly_sales || item.sales ? `<span>月销 ${escapeHtml(item.monthly_sales || item.sales)}</span>` : ""}
            ${item.likes ? `<span>${escapeHtml(item.likes)} 赞</span>` : ""}
          </div>
        </div>
      </div>
      <div class="grid">
        <div class="field"><div class="label">${state.mode === "product" ? "品牌" : "作者"}</div><div class="value">${escapeHtml(item.brand || item.author || "—")}</div></div>
        <div class="field"><div class="label">${state.mode === "product" ? "品类" : "创新类型"}</div><div class="value">${escapeHtml(item.category || item.innovation || item.tags_innovation || "—")}</div></div>
        <div class="field"><div class="label">平台</div><div class="value">${escapeHtml(PLATFORM_LABELS[state.page.platform] || state.page.platform)}</div></div>
        <div class="field"><div class="label">ID</div><div class="value">${escapeHtml(item.sku_id || "—")}</div></div>
      </div>
      ${tags.length ? `<div class="tags">${tags.map(([value, cls]) => `<span class="tag ${cls}">${escapeHtml(value)}</span>`).join("")}</div>` : ""}
      ${(item.ai_summary || item.summary || item.content || item.description) ? `<div class="ai">${escapeHtml(item.ai_summary || item.summary || item.content || item.description)}</div>` : ""}
    </div>`;
}

async function saveCurrent() {
  const item = state.processed || {};
  if (!state.page?.data?.url) return alert("缺少页面 URL，不能保存");
  if (state.mode === "product" && !(item.name || item.title)) return alert("缺少商品名称，不能保存");
  if (state.mode === "demand" && !(item.title || item.name)) return alert("缺少需求标题，不能保存");

  renderLoading("正在保存");
  try {
    const payload = state.mode === "product"
      ? productPayload(item)
      : demandPayload(item);
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

function productPayload(item) {
  return {
    ...item,
    source_url: item.url || state.page.data.url,
    platform: state.page.platform,
    name: item.name || item.title,
    image: item.image || item.thumbnail_url || "",
    thumbnail_url: item.thumbnail_url || item.image || "",
    platforms: item.platforms || [{
      id: `${state.page.platform}-${Date.now()}`,
      platform: state.page.platform,
      url: item.url || state.page.data.url,
      price: item.price || "",
      rating: item.rating || null,
      reviews: item.review_count || 0,
      sales: item.monthly_sales || "",
      fetched_at: new Date().toISOString(),
    }],
  };
}

function demandPayload(item) {
  return {
    ...item,
    title: item.title || item.name,
    source_url: item.url || state.page.data.url,
    url: item.url || state.page.data.url,
    source: state.page.platform,
    source_platform: state.page.platform,
    summary: item.summary || item.ai_summary || item.content || item.description || "",
    original_content: item.content || item.description || "",
    scenarios: item.scenarios || item.tags_scenario || [],
    painpoints: item.painpoints || item.tags_painpoint || [],
    innovation: item.innovation || item.tags_innovation || "待分类",
    thumbnail_url: item.thumbnail_url || item.image || "",
    import_method: "chrome_extension",
  };
}

function renderSuccess(payload) {
  document.getElementById("app").innerHTML = `
    <div class="shell">
      ${headerHtml()}
      <div class="body">
        <div class="card">
          <div class="preview-title">已保存到${state.mode === "product" ? "竞品库" : "需求管理"}</div>
          <div class="status" style="margin-top:8px">${escapeHtml(payload.name || payload.title || "")}</div>
          <div class="actions">
            <button class="btn" id="again">继续采集</button>
            <button class="btn primary" id="open-web">打开 Web 端</button>
          </div>
        </div>
      </div>
    </div>`;
  bindHeader();
  document.getElementById("again").onclick = () => loadCurrentPage();
  document.getElementById("open-web").onclick = () => chrome.tabs.create({ url: state.apiBase });
}

function headerHtml() {
  const name = state.user?.username || state.user?.name || "Graham";
  return `
    <div class="header">
      <div class="brand"><div class="logo">P</div><div><div class="title">PM Copilot</div><div class="sub">${escapeHtml(name)} · 已连接</div></div></div>
      <button class="icon-btn" id="open-options" title="设置">⚙</button>
    </div>`;
}

function bindHeader() {
  document.getElementById("open-options").onclick = () => chrome.runtime.openOptionsPage();
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
