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
  page: null,
  mode: "product",
  processed: null,
  form: null,
  busy: false,
  reloading: false,
  message: "",
};

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
  state.reloading = false;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tab = tab;
    const result = await readPageData(tab);
    if (!result?.ok) {
      state.page = null;
      renderUnsupported(result?.error || "unsupported_page");
      return;
    }
    state.page = result;
    state.mode = defaultMode === "demand"
      ? "demand"
      : defaultMode === "product"
        ? "product"
        : DEMAND_PLATFORMS.has(result.platform) ? "demand" : "product";
    state.processed = result.data;
    state.form = buildDraft(state.mode, state.processed);
    await maybeProcess();
    renderMain();
  } catch (error) {
    state.page = null;
    renderUnsupported(error.message || "无法读取页面");
  }
}

async function readPageData(tab) {
  if (!tab?.id) throw new Error("没有可读取的当前页面");
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "PM_COPILOT_GET_PAGE_DATA" });
  } catch (error) {
    if (!String(error.message || "").includes("Receiving end does not exist")) throw error;
    const platform = detectPlatformFromUrl(tab.url || "");
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
        <div class="brand">
          <div class="logo">P</div>
          <div>
            <div class="title">PM Copilot</div>
            <div class="sub">连接情报中台</div>
          </div>
        </div>
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
      <div class="cl-body">
        <div class="cl-banner detecting">
          <div class="cl-banner-ico">${spinIcon()}</div>
          <div class="cl-banner-body">
            <div class="cl-banner-title">${escapeHtml(text)}</div>
            <div class="cl-banner-sub mono">${escapeHtml(state.tab?.url || state.page?.data?.url || "")}</div>
          </div>
        </div>
        <div class="cl-empty">
          <div class="cl-skel cl-skel-img"></div>
          <div class="cl-skel cl-skel-h"></div>
          <div class="cl-skel cl-skel-line"></div>
          <div class="cl-skel cl-skel-line w70"></div>
          <div class="cl-empty-hint">AI 正在读取页面 DOM，预计 8-12 秒</div>
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
      <div class="body">
        <div class="banner">${escapeHtml(reason)}</div>
        <div class="card status">支持 Amazon、淘宝/天猫、小红书、Kickstarter。请打开商品页或笔记页后刷新右侧栏。</div>
        <button class="btn primary" id="refresh">重新检测</button>
      </div>
    </div>`;
  bindHeader();
  document.getElementById("refresh").onclick = () => loadCurrentPage();
}

function renderMain() {
  const item = state.form || buildDraft(state.mode, state.processed || state.page?.data || {});
  const platform = state.page.platform;
  const canProduct = PRODUCT_PLATFORMS.has(platform);
  const canDemand = DEMAND_PLATFORMS.has(platform) || platform === "kickstarter";
  document.getElementById("app").innerHTML = `
    <div class="shell">
      ${headerHtml()}
      <div class="cl-banner ${bannerClass(platform)}">
        ${state.reloading ? `<div class="cl-banner-ico">${spinIcon()}</div>` : bannerIcon(platform)}
        <div class="cl-banner-body">
          <div class="cl-banner-title">${escapeHtml(PLATFORM_LABELS[platform] || platform)} · ${state.mode === "product" ? "竞品采集" : "需求采集"}</div>
          <div class="cl-banner-sub mono">${escapeHtml(state.page?.data?.url || "")}</div>
        </div>
        <button class="ico-btn sm" id="reload-page" title="刷新">${refreshIcon()}</button>
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

      <div class="cl-foot">
        <button class="btn ghost grow" id="process" ${state.busy ? "disabled" : ""}>${state.busy ? "处理中..." : "AI 处理"}</button>
        <button class="btn primary grow" id="save" ${state.busy ? "disabled" : ""}>保存到 ${state.mode === "product" ? "竞品库" : "需求管理"}</button>
      </div>
    </div>`;
  bindHeader();
  document.getElementById("mode-product").onclick = () => switchMode("product", canProduct, "此页面建议使用需求模式");
  document.getElementById("mode-demand").onclick = () => switchMode("demand", canDemand, "此页面建议使用竞品模式");
  document.getElementById("reload-page").onclick = async () => {
    state.reloading = true;
    renderLoading("正在重新抓取当前页面");
    try {
      const result = await readPageData(state.tab);
      if (!result?.ok) throw new Error(result?.error || "重新抓取失败");
      state.page = result;
      state.processed = result.data;
      state.form = buildDraft(state.mode, state.processed);
      state.message = "页面已重新抓取";
      await maybeProcess();
      renderMain();
    } catch (error) {
      state.reloading = false;
      state.message = `刷新失败：${error.message}`;
      renderMain();
    }
  };
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
  state.form = buildDraft(state.mode, state.processed);
  state.message = "";
  renderLoading("正在切换模式");
  await maybeProcess();
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
      negative_keywords: safeArray(item?.negative_keywords),
      ai_summary: cleanText(item?.ai_summary, ""),
      platform: state.page?.platform || "",
      url: cleanText(item?.url || state.page?.data?.url, ""),
      sku_id: cleanText(item?.sku_id, ""),
      platforms: safeArray(item?.platforms),
    };
  }
  return {
    title: cleanText(item?.title || item?.name, ""),
    summary: cleanText(item?.summary || item?.ai_summary || item?.content || item?.description, ""),
    innovation: cleanText(item?.innovation || item?.tags_innovation, "待分类"),
    scenarios: safeArray(item?.scenarios),
    painpoints: safeArray(item?.painpoints),
    thumbnail_url: cleanText(item?.thumbnail_url || item?.image, ""),
    url: cleanText(item?.url || state.page?.data?.url, ""),
    source: state.page?.platform || "",
    note: cleanText(item?.note, ""),
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

function productView(item) {
  return `
    <div class="cl-preview">
      <div class="cl-preview-cover">
        ${item.thumbnail_url || item.image ? `<img src="${escapeAttr(item.thumbnail_url || item.image)}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<div class="ph">PRODUCT<br>IMG</div>`}
      </div>
      <div class="cl-preview-meta">
        <div class="cl-preview-platform">
          <span class="platform-pill ${platformClass(state.page.platform)}">${PLATFORM_LABELS[state.page.platform] || state.page.platform}</span>
          <span class="rating-mini">${item.rating ? `<span class="rating-star">★</span>${escapeHtml(item.rating)}` : ""}${item.review_count ? ` <span class="muted">· ${escapeHtml(item.review_count)}</span>` : ""}</span>
        </div>
        <div class="cl-preview-price">${escapeHtml(item.price || "—")} <span class="muted">/ 月销 ${escapeHtml(item.monthly_sales || "—")}</span></div>
      </div>
    </div>
    <div class="cl-section">
      <div class="cl-section-label">名称</div>
      <input class="ghost-input full" data-key="name" value="${escapeAttr(item.name || "")}" placeholder="填入商品名">
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
      <div class="cl-section-label">品类标签</div>
      <div class="tag-row">
        ${safeArray(item.tags).map((t) => `<span class="tag accent removable" data-tag-key="tags" data-tag-value="${escapeAttr(t)}">${escapeHtml(t)}<button type="button">×</button></span>`).join("")}
        <button class="tag dashed" data-add-key="tags">+ 添加</button>
      </div>
    </div>
    <div class="cl-section">
      <div class="cl-section-label">平台信息</div>
      ${platformCardsHtml(item)}
    </div>
    <div class="cl-section">
      <div class="cl-section-label">核心卖点 · AI 总结</div>
      ${listEditor("selling_points", safeArray(item.selling_points), "输入卖点，回车添加", "success")}
    </div>
    <div class="cl-section">
      <div class="cl-section-label">差评关键词</div>
      ${listEditor("negative_keywords", safeArray(item.negative_keywords), "输入差评关键词", "danger")}
    </div>
    <div class="cl-section">
      <div class="cl-section-label">AI 摘要</div>
      <textarea class="ghost-input full" data-key="ai_summary" placeholder="可补充或修改摘要">${escapeHtml(item.ai_summary || "")}</textarea>
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
    <div class="platform-card">
      <div class="platform-card-head">
        <span class="platform-pill ${platformClass(pl.platform)}">${PLATFORM_LABELS[pl.platform] || pl.platform || "平台"}</span>
        <span class="platform-card-link mono">${escapeHtml(pl.url || "")}</span>
      </div>
      <div class="platform-card-grid">
        ${metric("售价", `platforms.${index}.price`, pl.price || "", "$")}
        ${metric("参考成本", `platforms.${index}.cost`, pl.cost || item.cost_estimate || "", "¥")}
        ${metric("评分", `platforms.${index}.rating`, pl.rating ?? "", "★")}
        ${metric("评论数", `platforms.${index}.reviews`, pl.reviews ?? "", "")}
        ${metric("月销估算", `platforms.${index}.sales`, pl.sales || "", "/月")}
      </div>
    </div>
  `).join("");
}

function metric(label, key, value, prefix) {
  return `
    <label class="metric${label === "月销估算" ? " span-2" : ""}">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-input-wrap">
        ${prefix ? `<span class="metric-prefix ${prefix === "★" ? "rating-star" : ""}">${escapeHtml(prefix)}</span>` : ""}
        <input class="metric-input" data-key="${escapeAttr(key)}" value="${escapeAttr(value || "")}">
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
    return;
  }
  if (key === "tags" || key === "scenarios" || key === "painpoints") return;
  if (key === "selling_points" || key === "negative_keywords") {
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
    negative_keywords: safeArray(item.negative_keywords),
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
    original_content: item.content || item.description || "",
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
        <div class="cl-mark">P</div>
        <div>
          <div class="cl-name">PM Copilot</div>
          <div class="cl-conn"><span class="dot dot-ok"></span>已连接 · ${escapeHtml(name)}</div>
        </div>
      </div>
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
