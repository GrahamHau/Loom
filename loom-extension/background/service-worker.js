const DEFAULT_API_BASE = "https://loom.my1panelsite.xyz";
const LEGACY_API_BASE_HOSTS = new Set([
  "ulanzi-copilot.my1panelsite.xyz",
  "loom.43.156.166.134.sslip.io",
]);
const DEFAULTS = {
  loom_api_base: DEFAULT_API_BASE,
  loom_default_mode: "auto",
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
const DEBUG_EVENT_LIMIT = 300;

const LEGACY_KEY_MAP = {
  pmcopilot_api_base: "loom_api_base",
  pmcopilot_token: "loom_token",
  pmcopilot_user: "loom_user",
  pmcopilot_default_mode: "loom_default_mode",
  pmcopilot_ai_before_save: "loom_ai_before_save",
  pmcopilot_platforms: "loom_platforms",
  pmcopilot_field_mapping: "loom_field_mapping",
};

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

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get([...Object.keys(DEFAULTS), ...Object.keys(LEGACY_KEY_MAP)]);
  const next = {};
  if (current.loom_api_base !== undefined) {
    const normalized = normalizeApiBase(current.loom_api_base);
    if (normalized !== current.loom_api_base) next.loom_api_base = normalized;
  }
  for (const [legacyKey, loomKey] of Object.entries(LEGACY_KEY_MAP)) {
    if (current[loomKey] === undefined && current[legacyKey] !== undefined) {
      next[loomKey] = loomKey === "loom_api_base"
        ? normalizeApiBase(current[legacyKey])
        : current[legacyKey];
    }
  }
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (current[key] === undefined && next[key] === undefined) next[key] = value;
  }
  if (Object.keys(next).length) await chrome.storage.local.set(next);
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !chrome.sidePanel?.open) return;
  await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
});

function sanitizeDebugPayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  const next = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/token|cookie|password|secret|authorization/i.test(key)) {
      next[key] = "[redacted]";
    } else if (typeof value === "string") {
      next[key] = value.length > 500 ? `${value.slice(0, 500)}...` : value;
    } else {
      next[key] = value;
    }
  }
  return next;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "LOOM_DEBUG_EVENT") {
    const event = {
      ts: new Date().toISOString(),
      source: message.source || "extension",
      name: message.name || "event",
      tabId: sender.tab?.id || message.tabId || null,
      url: sender.tab?.url || message.url || "",
      payload: sanitizeDebugPayload(message.payload),
    };
    chrome.storage.local.get({ loom_debug_events: [] }, ({ loom_debug_events: events }) => {
      const next = Array.isArray(events) ? events.slice(-DEBUG_EVENT_LIMIT + 1) : [];
      next.push(event);
      chrome.storage.local.set({ loom_debug_events: next });
      console.log(`[loom:debug] ${event.source}:${event.name}`, event.payload);
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "LOOM_DEBUG_EVENTS_GET") {
    chrome.storage.local.get({ loom_debug_events: [] }, ({ loom_debug_events: events }) => {
      sendResponse({ ok: true, events: Array.isArray(events) ? events : [] });
    });
    return true;
  }

  if (message?.type === "LOOM_DEBUG_EVENTS_CLEAR") {
    chrome.storage.local.set({ loom_debug_events: [] }, () => sendResponse({ ok: true }));
    return true;
  }

  return undefined;
});
