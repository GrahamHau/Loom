const DEFAULT_API_BASE = "https://ulanzi-copilot.my1panelsite.xyz";
const DEFAULTS = {
  pmcopilot_api_base: DEFAULT_API_BASE,
  pmcopilot_default_mode: "auto",
  pmcopilot_ai_before_save: true,
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

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const next = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (current[key] === undefined) next[key] = value;
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
