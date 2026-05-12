const DEFAULTS = {
  pmcopilot_api_base: "https://ulanzi-copilot.my1panelsite.xyz",
  pmcopilot_default_mode: "auto",
  pmcopilot_ai_before_save: false,
  pmcopilot_platforms: {
    amazon: true,
    taobao: true,
    xiaohongshu: true,
    kickstarter: true,
  },
  pmcopilot_field_mapping: {
    productName: "name",
    productBrand: "brand",
    productCategory: "category",
    demandTitle: "title",
    demandSummary: "summary",
  },
};

const KEYS = [
  "pmcopilot_api_base",
  "pmcopilot_token",
  "pmcopilot_user",
  "pmcopilot_default_mode",
  "pmcopilot_ai_before_save",
  "pmcopilot_platforms",
  "pmcopilot_field_mapping",
];

document.addEventListener("DOMContentLoaded", load);

async function load() {
  const data = { ...DEFAULTS, ...(await chrome.storage.local.get(KEYS)) };
  document.getElementById("api-base").value = data.pmcopilot_api_base || DEFAULTS.pmcopilot_api_base;
  document.getElementById("default-mode").value = data.pmcopilot_default_mode || "auto";
  document.getElementById("ai-before-save").value = data.pmcopilot_ai_before_save === false ? "false" : "true";
  document.querySelectorAll("[data-platform]").forEach((input) => {
    input.checked = data.pmcopilot_platforms?.[input.dataset.platform] !== false;
  });
  const mapping = data.pmcopilot_field_mapping || DEFAULTS.pmcopilot_field_mapping;
  document.getElementById("map-product-name").value = mapping.productName || "name";
  document.getElementById("map-product-brand").value = mapping.productBrand || "brand";
  document.getElementById("map-product-category").value = mapping.productCategory || "category";
  document.getElementById("map-demand-title").value = mapping.demandTitle || "title";
  document.getElementById("map-demand-summary").value = mapping.demandSummary || "summary";
  setConnection(data.pmcopilot_token ? "已保存登录 Token" : "未登录");
  bind();
}

function bind() {
  document.getElementById("open-web").onclick = async () => {
    const apiBase = document.getElementById("api-base").value.trim() || DEFAULTS.pmcopilot_api_base;
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
      pmcopilot_api_base: apiBase,
      pmcopilot_token: data.token,
      pmcopilot_user: { username, ...(data.user || {}) },
    });
    setConnection("登录成功");
  } catch (error) {
    setConnection(`登录失败：${error.message}`);
  }
}

async function testConnection() {
  const stored = await chrome.storage.local.get(["pmcopilot_token"]);
  const apiBase = document.getElementById("api-base").value.trim().replace(/\/$/, "");
  try {
    const res = await fetch(`${apiBase}/api/me`, {
      headers: { Authorization: `Bearer ${stored.pmcopilot_token || ""}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setConnection("连接正常");
  } catch (error) {
    setConnection(`连接失败：${error.message}`);
  }
}

async function logout() {
  await chrome.storage.local.remove(["pmcopilot_token", "pmcopilot_user"]);
  setConnection("已退出登录");
}

async function saveSettings() {
  const platforms = {};
  document.querySelectorAll("[data-platform]").forEach((input) => {
    platforms[input.dataset.platform] = input.checked;
  });
  await chrome.storage.local.set({
    pmcopilot_api_base: document.getElementById("api-base").value.trim().replace(/\/$/, ""),
    pmcopilot_default_mode: document.getElementById("default-mode").value,
    pmcopilot_ai_before_save: document.getElementById("ai-before-save").value === "true",
    pmcopilot_platforms: platforms,
    pmcopilot_field_mapping: {
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
