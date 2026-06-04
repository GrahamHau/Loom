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

    // loadDetail：AI 整理前由插件控制自动下滑（限位），把懒加载的详情图加载出来再抽取。
    const loadDetail = Boolean(msg?.options?.loadDetail);
    const detailLoader = window.__loom_detail_loaders?.[platform];

    (async () => {
      try {
        if (loadDetail && typeof detailLoader === "function") {
          try {
            await detailLoader();
            debugEvent("collect:detail-loaded", { platform });
          } catch (loaderError) {
            // 下滑失败不阻断抽取，退化为只抓当前已加载的图
            debugEvent("collect:detail-load-error", { platform, error: loaderError?.message || "detail_load_failed" });
          }
        }
        const data = await extractor();
        debugEvent("collect:extract", {
          platform,
          title: data?.title || data?.name || "",
          hasImage: Boolean(data?.image || data?.thumbnail_url),
          detailImages: Array.isArray(data?.detail_images) ? data.detail_images.length : 0,
        });
        sendResponse({ ok: true, platform, data: { url: window.location.href, platform, ...data } });
      } catch (error) {
        debugEvent("collect:error", { platform, error: error.message || "extract_failed" });
        sendResponse({ ok: false, platform, data: null, error: error.message || "extract_failed" });
      }
    })();
    return true;
  });

  patchHistoryMethod("pushState");
  patchHistoryMethod("replaceState");
  window.addEventListener("popstate", () => notifyUrlChanged("popstate"));
  window.addEventListener("hashchange", () => notifyUrlChanged("hashchange"));

  // Keep auto capture URL-driven. DOM mutation signals from SPA pages such as
  // Xiaohongshu fire during comments/images loading and can yank the sidepanel
  // scroll position while the user is editing.
})();
