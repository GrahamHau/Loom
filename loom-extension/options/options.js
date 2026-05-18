const DEFAULT_API_BASE = "https://loom.palecedar.site";
const LOGIN_WEB_BASE = DEFAULT_API_BASE;
const LEGACY_API_BASE_HOSTS = new Set([
  "ulanzi-copilot.my1panelsite.xyz",
  "loom.43.156.166.134.sslip.io",
  "loom.my1panelsite.xyz",
]);
const LOOM_WEB_HOSTS = new Set([
  "loom.palecedar.site",
  "loom.my1panelsite.xyz",
]);

const DEFAULTS = {
  loom_api_base: DEFAULT_API_BASE,
  loom_default_mode: "auto",
  llm_api_type: "openai",
  llm_api_url: "",
  llm_model: "",
  llm_api_key: "",
  llm_vision_api_type: "openai",
  llm_vision_api_url: "",
  llm_vision_model: "",
  llm_vision_api_key: "",
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
  "llm_api_type",
  "llm_api_url",
  "llm_model",
  "llm_api_key",
  "llm_vision_api_type",
  "llm_vision_api_url",
  "llm_vision_model",
  "llm_vision_api_key",
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
  pmcopilot_llm_api_type: "llm_api_type",
  pmcopilot_llm_api_url: "llm_api_url",
  pmcopilot_llm_model: "llm_model",
  pmcopilot_llm_api_key: "llm_api_key",
  pmcopilot_llm_vision_api_type: "llm_vision_api_type",
  pmcopilot_llm_vision_api_url: "llm_vision_api_url",
  pmcopilot_llm_vision_model: "llm_vision_model",
  pmcopilot_llm_vision_api_key: "llm_vision_api_key",
};

let currentLlmSettings = null;
let currentVisionLlmSettings = null;
let llmLoading = false;
let visionLlmLoading = false;
let llmSaving = false;
let visionLlmSaving = false;
let llmTesting = false;
let visionLlmTesting = false;

document.addEventListener("DOMContentLoaded", load);

function currentApiBaseFromForm(fallback = DEFAULTS.loom_api_base) {
  return normalizeApiBase(document.getElementById("api-base")?.value.trim() || fallback);
}

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

function loginWebUrl(path = "/app") {
  return `${LOGIN_WEB_BASE}${path}`;
}

function isLoomWebUrl(url) {
  try {
    const parsed = new URL(url);
    const configured = new URL(currentApiBaseFromForm(DEFAULTS.loom_api_base));
    if (parsed.hostname === configured.hostname) return true;
    return LOOM_WEB_HOSTS.has(parsed.hostname) && /^\/app(?:\/|$)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function loomWebOriginFromUrl(url) {
  try {
    const parsed = new URL(url);
    return isLoomWebUrl(url) ? parsed.origin : "";
  } catch {
    return "";
  }
}

function isVisitorUser(user) {
  const id = String(user?.id || "").toLowerCase();
  const name = String(user?.name || "").trim().toLowerCase();
  return Boolean(user?.is_visitor || id === "visitor" || name === "visitor");
}

async function load() {
  const data = await getSettings();
  const accountSettings = await refreshAccountExtensionSettings(data);
  document.getElementById("api-base").value = data.loom_api_base || DEFAULTS.loom_api_base;
  syncWebLinks(data.loom_api_base || DEFAULTS.loom_api_base);
  document.getElementById("default-mode").value = data.loom_default_mode || "auto";
  document.getElementById("ai-before-save").value = accountSettings.extension_ai_before_save === false ? "false" : "true";
  document.querySelectorAll("[data-platform]").forEach((input) => {
    input.checked = data.loom_platforms?.[input.dataset.platform] !== false;
  });
  const mapping = data.loom_field_mapping || DEFAULTS.loom_field_mapping;
  document.getElementById("map-product-name").value = mapping.productName || "name";
  document.getElementById("map-product-brand").value = mapping.productBrand || "brand";
  document.getElementById("map-product-category").value = mapping.productCategory || "category";
  document.getElementById("map-demand-title").value = mapping.demandTitle || "title";
  document.getElementById("map-demand-summary").value = mapping.demandSummary || "summary";
  await refreshConnectionState(data);
  bind();
  await refreshLlmSettings({ silent: true });
  await refreshVisionLlmSettings({ silent: true });
}

async function refreshAccountExtensionSettings(localSettings = null) {
  try {
    const settings = await authedFetch("/api/settings");
    if (settings?.extension_ai_before_save !== undefined) {
      await chrome.storage.local.set({ loom_ai_before_save: settings.extension_ai_before_save !== false });
    }
    return settings || {};
  } catch {
    return {
      extension_ai_before_save: localSettings?.loom_ai_before_save,
    };
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get(KEYS);
  const migrated = {};
  if (stored.loom_api_base !== undefined) {
    const normalized = normalizeApiBase(stored.loom_api_base);
    if (normalized !== stored.loom_api_base) migrated.loom_api_base = normalized;
  }
  for (const [legacyKey, loomKey] of Object.entries(LEGACY_KEY_MAP)) {
    if (stored[loomKey] === undefined && stored[legacyKey] !== undefined) {
      migrated[loomKey] = loomKey === "loom_api_base"
        ? normalizeApiBase(stored[legacyKey])
        : stored[legacyKey];
    }
  }
  if (Object.keys(migrated).length) await chrome.storage.local.set(migrated);
  return { ...DEFAULTS, ...stored, ...migrated };
}

function bind() {
  const apiBaseInput = document.getElementById("api-base");
  apiBaseInput.addEventListener("input", () => syncWebLinks());
  document.getElementById("open-web-login").onclick = openWebLogin;
  document.getElementById("test-connection").onclick = testConnection;
  document.getElementById("logout").onclick = logout;
  document.getElementById("save-settings").onclick = saveSettings;
  document.getElementById("reset-settings").onclick = async () => {
    await chrome.storage.local.set(DEFAULTS);
    await load();
  };
  document.getElementById("refresh-llm").onclick = () => refreshLlmSettings();
  document.getElementById("refresh-vision-llm").onclick = () => refreshVisionLlmSettings();
  document.getElementById("save-llm").onclick = saveLlmSettings;
  document.getElementById("save-vision-llm").onclick = saveVisionLlmSettings;
  document.getElementById("test-llm").onclick = testLlmSettings;
  document.getElementById("test-vision-llm").onclick = testVisionLlmSettings;
}

function syncWebLinks(fallback = DEFAULTS.loom_api_base) {
  const apiBase = currentApiBaseFromForm(fallback);
  const openWeb = document.getElementById("open-web");
  if (openWeb) openWeb.href = `${apiBase}/app`;
  const fieldSettingsLink = document.getElementById("open-web-field-settings");
  if (fieldSettingsLink) fieldSettingsLink.href = `${apiBase}/app?screen=settings&tab=tags`;
}

function openWebLogin() {
  window.open(loginWebUrl(), "_blank", "noopener");
}

async function testConnection() {
  const stored = await getSettings();
  await refreshConnectionState(stored);
}

async function logout() {
  const stored = await getSettings();
  const apiBase = normalizeApiBase(document.getElementById("api-base").value.trim() || stored.loom_api_base || DEFAULTS.loom_api_base);
  try {
    await fetch(`${apiBase}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: stored.loom_token ? { Authorization: `Bearer ${stored.loom_token}` } : {},
    });
  } catch {
    // Logout is best effort; local extension auth state is still cleared.
  }
  try {
    await chrome.cookies.remove({ url: apiBase, name: "connect.sid" });
  } catch {
    // Cookie removal can fail when the browser owns the session.
  }
  await chrome.storage.local.remove(["loom_token", "loom_user", "pmcopilot_token", "pmcopilot_user"]);
  currentLlmSettings = null;
  currentVisionLlmSettings = null;
  fillLlmForm(null);
  fillVisionLlmForm(null);
  setConnection("已退出登录，请在 Web 端重新登录");
  setLlmState("等待 Web 端登录");
  setVisionLlmState("等待 Web 端登录");
}

async function saveSettings() {
  const platforms = {};
  document.querySelectorAll("[data-platform]").forEach((input) => {
    platforms[input.dataset.platform] = input.checked;
  });
  const aiBeforeSave = document.getElementById("ai-before-save").value === "true";
  await chrome.storage.local.set({
    loom_api_base: normalizeApiBase(document.getElementById("api-base").value.trim()),
    loom_default_mode: document.getElementById("default-mode").value,
    loom_ai_before_save: aiBeforeSave,
    loom_platforms: platforms,
    loom_field_mapping: {
      productName: document.getElementById("map-product-name").value.trim() || "name",
      productBrand: document.getElementById("map-product-brand").value.trim() || "brand",
      productCategory: document.getElementById("map-product-category").value.trim() || "category",
      demandTitle: document.getElementById("map-demand-title").value.trim() || "title",
      demandSummary: document.getElementById("map-demand-summary").value.trim() || "summary",
    },
  });
  try {
    await authedFetch("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ extension_ai_before_save: aiBeforeSave }),
    });
    setConnection("设置已保存到账户");
  } catch (error) {
    setConnection(`已保存到本地，账户同步失败：${error.message}`);
  }
}

function setConnection(message) {
  document.getElementById("connection-state").textContent = message;
}

function setLlmState(message) {
  document.getElementById("llm-state").textContent = message;
}

function setVisionLlmState(message) {
  document.getElementById("vision-llm-state").textContent = message;
}

function updateLlmActionState() {
  const disabled = llmLoading || llmSaving || llmTesting;
  document.getElementById("refresh-llm").disabled = disabled;
  document.getElementById("save-llm").disabled = disabled;
  document.getElementById("test-llm").disabled = disabled;
}

function updateVisionLlmActionState() {
  const disabled = visionLlmLoading || visionLlmSaving || visionLlmTesting;
  document.getElementById("refresh-vision-llm").disabled = disabled;
  document.getElementById("save-vision-llm").disabled = disabled;
  document.getElementById("test-vision-llm").disabled = disabled;
}

function fillLlmForm(settings) {
  document.getElementById("llm-api-type").value = settings?.llm_api_type || "openai";
  document.getElementById("llm-model").value = settings?.llm_model || "";
  document.getElementById("llm-api-url").value = settings?.llm_api_url || "";
  document.getElementById("llm-api-key").value = settings?.llm_api_key || "";
}

function fillVisionLlmForm(settings) {
  document.getElementById("llm-vision-api-type").value = settings?.llm_vision_api_type || "openai";
  document.getElementById("llm-vision-model").value = settings?.llm_vision_model || "";
  document.getElementById("llm-vision-api-url").value = settings?.llm_vision_api_url || "";
  document.getElementById("llm-vision-api-key").value = settings?.llm_vision_api_key || "";
}

async function refreshConnectionState(stored = null) {
  const data = stored || await getSettings();
  let apiBase = normalizeApiBase(document.getElementById("api-base")?.value.trim() || data.loom_api_base || DEFAULTS.loom_api_base);
  let token = data.loom_token || "";
  if (!token) {
    setConnection("正在同步 Web 登录态…");
    const synced = await syncAuthFromOpenWebTab();
    if (synced?.token) {
      token = synced.token;
      apiBase = synced.apiBase || apiBase;
    }
  }
  if (!data.loom_token) {
    const latest = await getSettings();
    token = token || latest.loom_token || "";
    if (!token) {
      setConnection("等待 Web 端登录");
      return;
    }
  }
  try {
    const res = await fetch(`${apiBase}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
    setConnection(`已登录 · ${payload.user?.name || payload.user?.email || "当前账号"}`);
  } catch (error) {
    setConnection(`登录态已失效：${error.message}`);
  }
}

async function syncAuthFromOpenWebTab() {
  if (!chrome.tabs?.query || !chrome.scripting?.executeScript) return null;
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return null;
  }
  const candidates = tabs
    .map((tab) => ({ tab, origin: loomWebOriginFromUrl(tab?.url || "") }))
    .filter((item) => item.tab?.id && item.origin)
    .sort((a, b) => Number(Boolean(b.tab.active)) - Number(Boolean(a.tab.active)));
  for (const { tab, origin } of candidates) {
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: async (apiBase) => {
          try {
            const res = await fetch(`${apiBase}/api/auth/extension/session-token`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            const data = await res.json().catch(() => ({}));
            return { ok: res.ok, status: res.status, data };
          } catch (error) {
            return { ok: false, status: 0, error: error?.message || "loom_tab_sync_failed" };
          }
        },
        args: [origin],
      });
      const result = injection?.result || null;
      if (!result?.ok || !result.data?.token) continue;
      if (isVisitorUser(result.data.user)) {
        await chrome.storage.local.remove(["loom_token", "loom_user", "pmcopilot_token", "pmcopilot_user"]);
        setConnection("检测到 Web 端是访客账号，请先登录正式账号");
        return null;
      }
      const normalizedOrigin = normalizeApiBase(origin);
      await chrome.storage.local.set({
        loom_api_base: normalizedOrigin,
        loom_token: result.data.token,
        loom_user: result.data.user || null,
      });
      const apiBaseInput = document.getElementById("api-base");
      if (apiBaseInput) apiBaseInput.value = normalizedOrigin;
      syncWebLinks(normalizedOrigin);
      return { ...result.data, apiBase: normalizedOrigin };
    } catch {
      // Try the next open LOOM tab.
    }
  }
  return null;
}

async function authedFetch(path, options = {}) {
  const stored = await getSettings();
  const apiBase = normalizeApiBase(document.getElementById("api-base")?.value.trim() || stored.loom_api_base || DEFAULTS.loom_api_base);
  if (!stored.loom_token) {
    throw new Error("请先在 Web 端登录");
  }
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${stored.loom_token}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function refreshLlmSettings({ silent = false } = {}) {
  llmLoading = true;
  updateLlmActionState();
  if (!silent) setLlmState("正在同步…");
  try {
    const settings = await authedFetch("/api/settings");
    currentLlmSettings = settings || {};
    fillLlmForm(currentLlmSettings);
    const configured = Boolean(settings?.llm_api_url && settings?.llm_model && settings?.llm_api_key);
    setLlmState(configured ? "已同步 · 已配置" : "已同步 · 尚未配置完整");
  } catch (error) {
    currentLlmSettings = null;
    fillLlmForm(null);
    setLlmState(error.message || "同步失败");
  } finally {
    llmLoading = false;
    updateLlmActionState();
  }
}

async function refreshVisionLlmSettings({ silent = false } = {}) {
  visionLlmLoading = true;
  updateVisionLlmActionState();
  if (!silent) setVisionLlmState("正在同步…");
  try {
    const settings = await authedFetch("/api/settings");
    currentVisionLlmSettings = settings || {};
    fillVisionLlmForm(currentVisionLlmSettings);
    const configured = Boolean(settings?.llm_vision_api_url && settings?.llm_vision_model && settings?.llm_vision_api_key);
    setVisionLlmState(configured ? "已同步 · 已配置" : "已同步 · 尚未配置完整");
  } catch (error) {
    currentVisionLlmSettings = null;
    fillVisionLlmForm(null);
    setVisionLlmState(error.message || "同步失败");
  } finally {
    visionLlmLoading = false;
    updateVisionLlmActionState();
  }
}

function collectLlmPayload() {
  return {
    llm_api_type: document.getElementById("llm-api-type").value || "openai",
    llm_model: document.getElementById("llm-model").value.trim(),
    llm_api_url: document.getElementById("llm-api-url").value.trim(),
    llm_api_key: document.getElementById("llm-api-key").value.trim() || (currentLlmSettings?.llm_api_key || ""),
  };
}

function collectVisionLlmPayload() {
  return {
    llm_vision_api_type: document.getElementById("llm-vision-api-type").value || "openai",
    llm_vision_model: document.getElementById("llm-vision-model").value.trim(),
    llm_vision_api_url: document.getElementById("llm-vision-api-url").value.trim(),
    llm_vision_api_key: document.getElementById("llm-vision-api-key").value.trim() || (currentVisionLlmSettings?.llm_vision_api_key || ""),
  };
}

async function saveLlmSettings() {
  llmSaving = true;
  updateLlmActionState();
  setLlmState("正在保存…");
  try {
    const payload = collectLlmPayload();
    const saved = await authedFetch("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    currentLlmSettings = saved || {};
    fillLlmForm(currentLlmSettings);
    const configured = Boolean(saved?.llm_api_url && saved?.llm_model && saved?.llm_api_key);
    setLlmState(configured ? "已保存 · 已配置" : "已保存 · 尚未配置完整");
  } catch (error) {
    setLlmState(error.message || "保存失败");
  } finally {
    llmSaving = false;
    updateLlmActionState();
  }
}

async function saveVisionLlmSettings() {
  visionLlmSaving = true;
  updateVisionLlmActionState();
  setVisionLlmState("正在保存…");
  try {
    const payload = collectVisionLlmPayload();
    const saved = await authedFetch("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    currentVisionLlmSettings = saved || {};
    fillVisionLlmForm(currentVisionLlmSettings);
    const configured = Boolean(saved?.llm_vision_api_url && saved?.llm_vision_model && saved?.llm_vision_api_key);
    setVisionLlmState(configured ? "已保存 · 已配置" : "已保存 · 尚未配置完整");
  } catch (error) {
    setVisionLlmState(error.message || "保存失败");
  } finally {
    visionLlmSaving = false;
    updateVisionLlmActionState();
  }
}

async function testLlmSettings() {
  llmTesting = true;
  updateLlmActionState();
  setLlmState("正在测试连接…");
  try {
    await authedFetch("/api/settings/test-llm", {
      method: "POST",
      body: JSON.stringify({}),
    });
    setLlmState("测试通过");
  } catch (error) {
    setLlmState(error.message || "测试失败");
  } finally {
    llmTesting = false;
    updateLlmActionState();
  }
}

async function testVisionLlmSettings() {
  visionLlmTesting = true;
  updateVisionLlmActionState();
  setVisionLlmState("正在测试连接…");
  try {
    await authedFetch("/api/settings/test-vision-llm", {
      method: "POST",
      body: JSON.stringify({}),
    });
    setVisionLlmState("测试通过");
  } catch (error) {
    setVisionLlmState(error.message || "测试失败");
  } finally {
    visionLlmTesting = false;
    updateVisionLlmActionState();
  }
}
