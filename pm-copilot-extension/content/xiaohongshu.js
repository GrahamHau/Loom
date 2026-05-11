(function registerXhsExtractor() {
  window.__pmcopilot_extractors = window.__pmcopilot_extractors || {};
  window.__pmcopilot_extractors.xiaohongshu = function extractXhs() {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
    const parseCount = (value) => {
      const cleaned = String(value || "").trim();
      if (cleaned.includes("万")) return Math.round((Number.parseFloat(cleaned) || 0) * 10000);
      return Number.parseInt(cleaned.replace(/[^0-9]/g, ""), 10) || 0;
    };
    const title = text("#detail-title") || text(".title") || text("h1") || document.title;
    const content = (text("#detail-desc") || text(".desc") || text("[class*='content']")).slice(0, 1000);
    const thumbnail = document.querySelector("meta[property='og:image']")?.content
      || document.querySelector(".note-slider-img img, .media-container img, img")?.src
      || "";

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
