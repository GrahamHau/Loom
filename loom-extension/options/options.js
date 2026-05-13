const DEFAULTS = {
  loom_api_base: "https://ulanzi-copilot.my1panelsite.xyz",
  loom_default_mode: "auto",
  loom_ai_before_save: false,
  loom_platforms: {
    amazon: true,
    taobao: true,
    xiaohongshu: true,
    kickstarter: true,
  },
  loom_field_mapping: {
    productName: "name",
    productBrand: "brand",
    productCategory: "category",
    demandTitle: "title",
    demandSummary: "summary",
  },
};

const KEYS = [
  "loom_api_base",
  "loom_token",
  "loom_user",
  "loom_default_mode",
  "loom_ai_before_save",
  "loom_platforms",
  "loom_field_mapping",
  "pmcopilot_api_base",
  "pmcopilot_token",
  "pmcopilot_user",
  "pmcopilot_default_mode",
  "pmcopilot_ai_before_save",
  "pmcopilot_platforms",
  "pmcopilot_field_mapping",
];

const LEGACY_KEY_MAP = {
  pmcopilot_api_base: "loom_api_base",
  pmcopilot_token: "loom_token",
  pmcopilot_user: "loom_user",
  pmcopilot_default_mode: "loom_default_mode",
  pmcopilot_ai_before_save: "loom_ai_before_save",
  pmcopilot_platforms: "loom_platforms",
  pmcopilot_field_mapping: "loom_field_mapping",
};

document.addEventListener("DOMContentLoaded", load);

async function load() {
  const data = await getSettings();
  document.getElementById("api-base").value = data.loom_api_base || DEFAULTS.loom_api_base;
  document.getElementById("default-mode").value = data.loom_default_mode || "auto";
  document.getElementById("ai-before-save").value = data.loom_ai_before_save === false ? "false" : "true";
  document.querySelectorAll("[data-platform]").forEach((input) => {
    input.checked = data.loom_platforms?.[input.dataset.platform] !== false;
  });
  const mapping = data.loom_field_mapping || DEFAULTS.loom_field_mapping;
  document.getElementById("map-product-name").value = mapping.productName || "name";
  document.getElementById("map-product-brand").value = mapping.productBrand || "brand";
  document.getElementById("map-product-category").value = mapping.productCategory || "category";
  document.getElementById("map-demand-title").value = mapping.demandTitle || "title";
  document.getElementById("map-demand-summary").value = mapping.demandSummary || "summary";
  setConnection(data.loom_token ? "已保存登录 Token" : "未登录");
  bind();
}

async function getSettings() {
  const stored = await chrome.storage.local.get(KEYS);
  const migrated = {};
  for (const [legacyKey, loomKey] of Object.entries(LEGACY_KEY_MAP)) {
    if (stored[loomKey] === undefined && stored[legacyKey] !== undefined) migrated[loomKey] = stored[legacyKey];
  }
  if (Object.keys(migrated).length) await chrome.storage.local.set(migrated);
  return { ...DEFAULTS, ...stored, ...migrated };
}

function bind() {
  document.getElementById("open-web").onclick = async () => {
    const apiBase = document.getElementById("api-base").value.trim() || DEFAULTS.loom_api_base;
    chrome.tabs.create({ url: apiBase });
  };
  document.getElementById("save-login").onclick = login;
  document.getElementById("test-connection").onclick = testConnection;
  document.getElementById("logout").onclick = logout;
  document.getElementById("save-settings").onclick = saveSettings;
  document.getElementById("reset-settings").onclick = async () => {
    await chrome.storage.local.set(DEFAULTS);
    await load();
  };
}

async function login() {
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
      loom_api_base: apiBase,
      loom_token: data.token,
      loom_user: { username, ...(data.user || {}) },
    });
    setConnection("登录成功");
  } catch (error) {
    setConnection(`登录失败：${error.message}`);
  }
}

async function testConnection() {
  const stored = await getSettings();
  const apiBase = document.getElementById("api-base").value.trim().replace(/\/$/, "");
  try {
    const res = await fetch(`${apiBase}/api/me`, {
      headers: { Authorization: `Bearer ${stored.loom_token || ""}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setConnection("连接正常");
  } catch (error) {
    setConnection(`连接失败：${error.message}`);
  }
}

async function logout() {
  await chrome.storage.local.remove(["loom_token", "loom_user", "pmcopilot_token", "pmcopilot_user"]);
  setConnection("已退出登录");
}

async function saveSettings() {
  const platforms = {};
  document.querySelectorAll("[data-platform]").forEach((input) => {
    platforms[input.dataset.platform] = input.checked;
  });
  await chrome.storage.local.set({
    loom_api_base: document.getElementById("api-base").value.trim().replace(/\/$/, ""),
    loom_default_mode: document.getElementById("default-mode").value,
    loom_ai_before_save: document.getElementById("ai-before-save").value === "true",
    loom_platforms: platforms,
    loom_field_mapping: {
      productName: document.getElementById("map-product-name").value.trim() || "name",
      productBrand: document.getElementById("map-product-brand").value.trim() || "brand",
      productCategory: document.getElementById("map-product-category").value.trim() || "category",
      demandTitle: document.getElementById("map-demand-title").value.trim() || "title",
      demandSummary: document.getElementById("map-demand-summary").value.trim() || "summary",
    },
  });
  setConnection("设置已保存");
}

function setConnection(message) {
  document.getElementById("connection-state").textContent = message;
}
