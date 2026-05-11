(function registerXhsExtractor() {
  window.__pmcopilot_extractors = window.__pmcopilot_extractors || {};
  window.__pmcopilot_extractors.xiaohongshu = function extractXhs() {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
    const normalizeImageUrl = (url) => {
      if (!url) return "";
      const value = String(url).trim();
      if (!value || value.startsWith("data:")) return "";
      try {
        return new URL(value, window.location.href).toString();
      } catch {
        return value;
      }
    };
    const isBadImage = (url) => {
      const value = String(url || "").toLowerCase();
      return !value ||
        value.includes("logo") ||
        value.includes("favicon") ||
        value.includes("avatar") ||
        value.includes("default") ||
        value.includes("placeholder") ||
        value.includes("sns-webpic-qc.xhscdn.com") && value.includes("logo");
    };
    const visibleScore = (img) => {
      const rect = img.getBoundingClientRect();
      const width = img.naturalWidth || rect.width || 0;
      const height = img.naturalHeight || rect.height || 0;
      if (width < 160 || height < 120) return 0;
      const area = width * height;
      const inViewportBonus = rect.top < window.innerHeight && rect.bottom > 0 ? 500000 : 0;
      return area + inViewportBonus;
    };
    const pickThumbnail = () => {
      const selectors = [
        "#noteContainer img",
        ".note-container img",
        ".media-container img",
        ".swiper-slide img",
        ".note-slider-img",
        "[class*='note-slider'] img",
        "[class*='media'] img",
      ];
      const candidates = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .concat(Array.from(document.images));
      const ranked = candidates
        .map((img) => {
          const url = normalizeImageUrl(img.currentSrc || img.src || img.getAttribute("src") || img.getAttribute("data-src"));
          return { url, score: visibleScore(img) };
        })
        .filter((item) => item.score > 0 && !isBadImage(item.url))
        .sort((a, b) => b.score - a.score);
      if (ranked[0]?.url) return ranked[0].url;
      const og = normalizeImageUrl(document.querySelector("meta[property='og:image']")?.content);
      return isBadImage(og) ? "" : og;
    };
    const parseCount = (value) => {
      const cleaned = String(value || "").trim();
      if (cleaned.includes("万")) return Math.round((Number.parseFloat(cleaned) || 0) * 10000);
      return Number.parseInt(cleaned.replace(/[^0-9]/g, ""), 10) || 0;
    };
    const title = text("#detail-title") || text(".title") || text("h1") || document.title;
    const content = (text("#detail-desc") || text(".desc") || text("[class*='content']")).slice(0, 1000);
    const thumbnail = pickThumbnail();

    return {
      title,
      content,
      likes: parseCount(text("[class*='like-wrapper'] [class*='count']") || text(".like-count")),
      collects: parseCount(text("[class*='collect-wrapper'] [class*='count']") || text(".collect-count")),
      comments: parseCount(text("[class*='chat-wrapper'] [class*='count']") || text(".comment-count")),
      thumbnail_url: thumbnail,
      author: text("[class*='username']") || text(".author-name"),
    };
  };
})();
