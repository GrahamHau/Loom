(function initLoomDetector() {
  if (window.__loom_detector_loaded) return;
  window.__loom_detector_loaded = true;

  function debugEvent(name, payload = {}) {
    try {
      chrome.runtime.sendMessage({
        type: "LOOM_DEBUG_EVENT",
        source: "content",
        name,
        payload: {
          url: window.location.href,
          ...payload,
        },
      });
    } catch {
      // Debug reporting must never affect page extraction.
    }
  }

  let lastUrl = window.location.href;
  let urlChangeTimer = null;
  let pageStateTimer = null;
  let lastPageStateSignalAt = 0;

  function notifyUrlChanged(reason) {
    if (urlChangeTimer) clearTimeout(urlChangeTimer);
    urlChangeTimer = setTimeout(() => {
      urlChangeTimer = null;
      const nextUrl = window.location.href;
      if (nextUrl === lastUrl) return;
      lastUrl = nextUrl;
      try {
        chrome.runtime.sendMessage({
          type: "LOOM_PAGE_URL_CHANGED",
          url: nextUrl,
          platform: detectPlatform(nextUrl),
          reason,
        });
      } catch {
        // The side panel may be closed; URL signals are best effort.
      }
    }, 80);
  }

  function isDetailPage(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      const href = parsed.href.toLowerCase();
      if (host.includes("amazon.")) {
        return /^\/(?:[^/]+\/)?dp\/[a-z0-9]{10}(?:[/?]|$)/i.test(parsed.pathname) || /\/gp\/product\/[a-z0-9]{10}/i.test(parsed.pathname);
      }
      if (host.includes("taobao.com")) return parsed.hostname.includes("item.taobao.com") && /(?:^|[?&])id=\d+/.test(parsed.search);
      if (host.includes("tmall.com")) return parsed.hostname.includes("detail.tmall.com") && /(?:^|[?&])id=\d+/.test(parsed.search);
      if (host.includes("xiaohongshu.com")) return /^\/explore\/[a-z0-9]+$/i.test(parsed.pathname);
      if (host.includes("kickstarter.com")) return href.includes("/projects/");
    } catch {
      return false;
    }
    return false;
  }

  function notifyPageStateChanged(reason) {
    if (!isDetailPage(window.location.href)) return;
    if (pageStateTimer) clearTimeout(pageStateTimer);
    pageStateTimer = setTimeout(() => {
      pageStateTimer = null;
      const now = Date.now();
      if (now - lastPageStateSignalAt < 1600) return;
      lastPageStateSignalAt = now;
      try {
        chrome.runtime.sendMessage({
          type: "LOOM_PAGE_STATE_CHANGED",
          url: window.location.href,
          platform: detectPlatform(window.location.href),
          reason,
        });
      } catch {
        // The side panel may be closed; state signals are best effort.
      }
    }, 900);
  }

  function patchHistoryMethod(name) {
    const original = window.history?.[name];
    if (typeof original !== "function") return;
    window.history[name] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      notifyUrlChanged(name);
      return result;
    };
  }

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
    if (msg?.type !== "LOOM_GET_PAGE_DATA") return undefined;

    const platform = detectPlatform(window.location.href);
    if (!platform) {
      debugEvent("collect:unsupported", { reason: "unsupported_page" });
      sendResponse({ ok: false, platform: null, data: null, error: "unsupported_page" });
      return true;
    }

    const extractor = window.__loom_extractors?.[platform];
    if (typeof extractor !== "function") {
      debugEvent("collect:extractor-missing", { platform });
      sendResponse({ ok: false, platform, data: null, error: "extractor_missing" });
      return true;
    }

    try {
      const data = extractor();
      debugEvent("collect:extract", {
        platform,
        title: data?.title || data?.name || "",
        hasImage: Boolean(data?.image || data?.thumbnail_url),
      });
      sendResponse({ ok: true, platform, data: { url: window.location.href, platform, ...data } });
    } catch (error) {
      debugEvent("collect:error", { platform, error: error.message || "extract_failed" });
      sendResponse({ ok: false, platform, data: null, error: error.message || "extract_failed" });
    }
    return true;
  });

  patchHistoryMethod("pushState");
  patchHistoryMethod("replaceState");
  window.addEventListener("popstate", () => notifyUrlChanged("popstate"));
  window.addEventListener("hashchange", () => notifyUrlChanged("hashchange"));

  const observeTarget = document.body || document.documentElement;
  if (observeTarget && typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(() => notifyPageStateChanged("dom-mutated"));
    observer.observe(observeTarget, { childList: true, subtree: true, characterData: true });
  }
})();
