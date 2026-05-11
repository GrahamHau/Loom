(function initPmCopilotDetector() {
  if (window.__pmcopilot_detector_loaded) return;
  window.__pmcopilot_detector_loaded = true;

  function detectPlatform(url) {
    const host = new URL(url).hostname;
    const href = url.toLowerCase();
    if (host.includes("amazon.")) return "amazon";
    if (host.includes("taobao.com") || host.includes("tmall.com")) return "taobao";
    if (host.includes("xiaohongshu.com")) return "xiaohongshu";
    if (host.includes("kickstarter.com") && href.includes("/projects/")) return "kickstarter";
    return null;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "PM_COPILOT_GET_PAGE_DATA") return undefined;

    const platform = detectPlatform(window.location.href);
    if (!platform) {
      sendResponse({ ok: false, platform: null, data: null, error: "unsupported_page" });
      return true;
    }

    const extractor = window.__pmcopilot_extractors?.[platform];
    if (typeof extractor !== "function") {
      sendResponse({ ok: false, platform, data: null, error: "extractor_missing" });
      return true;
    }

    try {
      const data = extractor();
      sendResponse({ ok: true, platform, data: { url: window.location.href, platform, ...data } });
    } catch (error) {
      sendResponse({ ok: false, platform, data: null, error: error.message || "extract_failed" });
    }
    return true;
  });
})();
