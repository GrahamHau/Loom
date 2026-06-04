(function registerAmazonExtractor() {
  window.__loom_extractors = window.__loom_extractors || {};
  window.__loom_detail_loaders = window.__loom_detail_loaders || {};

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // A+ 详情区（懒加载长图所在）。优先按这些容器定位，找不到再兜底温和滚两屏。
  const AMAZON_DETAIL_SELECTOR = "#aplus_feature_div, #aplus, #productDescription, #dpx-aplus-product-description_feature_div";

  function amazonDetailImages() {
    const httpOnly = (url) => typeof url === "string" && /^https?:\/\//i.test(url);
    // 主图集（多角度）藏在 #landingImage 的 data-a-dynamic-image，始终在、不用滚动
    const landing = document.querySelector("#landingImage");
    let gallery = [];
    try {
      const dyn = landing?.getAttribute("data-a-dynamic-image");
      if (dyn) gallery = Object.keys(JSON.parse(dyn));
    } catch {
      /* ignore */
    }
    // A+ 长图（懒加载，靠自动下滑触发后才有真实 src）
    const aplus = Array.from(document.querySelectorAll("#aplus_feature_div img, #aplus img, #productDescription img"))
      .map((img) => img.getAttribute("data-src") || img.src || "")
      .filter(httpOnly);
    return [...gallery, ...aplus].filter((url, index, all) => all.indexOf(url) === index).slice(0, 12);
  }

  // 插件控制的自动下滑（限位）：只滚过 A+ 详情区那一段触发懒加载，
  // 滚到该区末尾即停（不滚到页面底部的评论/推荐/页脚），结束后回到原位。
  window.__loom_detail_loaders.amazon = async function loadAmazonDetail() {
    const startY = window.scrollY;
    const detail = document.querySelector(AMAZON_DETAIL_SELECTOR);
    if (detail) {
      const top = window.scrollY + detail.getBoundingClientRect().top;
      const end = top + detail.offsetHeight;
      for (let y = top - window.innerHeight / 2; y <= end; y += window.innerHeight * 0.9) {
        window.scrollTo(0, Math.max(0, y));
        await sleep(300);
      }
      await sleep(500);
    } else {
      // 没定位到 A+：温和滚两屏兜底，绝不滚到底
      window.scrollTo(0, window.innerHeight * 2);
      await sleep(700);
    }
    window.scrollTo(0, startY);
    await sleep(150);
  };

  window.__loom_extractors.amazon = function extractAmazon() {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
    const attr = (selector, name) => document.querySelector(selector)?.getAttribute(name) || "";
    const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const startsWithReviewDate = (value) => /^Reviewed in\b/i.test(cleanText(value));
    const parseCount = (value) => {
      const raw = String(value || "").trim();
      const match = raw.replace(/[，,]/g, "").match(/\d+/);
      return match ? Number.parseInt(match[0], 10) || 0 : 0;
    };
    const parseHelpfulCount = (value) => {
      const raw = cleanText(value).toLowerCase();
      const numeric = parseCount(raw);
      if (numeric) return numeric;
      if (raw.startsWith("one ")) return 1;
      if (raw.startsWith("two ")) return 2;
      if (raw.startsWith("three ")) return 3;
      if (raw.startsWith("four ")) return 4;
      if (raw.startsWith("five ")) return 5;
      return 0;
    };
    const reviewContentSelector = [
      "[data-hook='review-collapsed'] span",
      "[data-hook='review-body'] span",
      "[data-hook='reviewRichContentContainer']",
      ".review-text-content span",
      ".review-text",
      ".cr-original-review-content",
      ".review-data",
      ".a-cardui-body",
      ".a-cardui-content",
    ].join(", ");
    const cleanReviewContent = (value) => cleanText(value)
      .replace(/Brief content visible, double tap to read full content\./gi, "")
      .replace(/Full content visible, double tap to read brief content\./gi, "")
      .replace(/Read more\s*Read less/gi, "")
      .replace(/Sending feedback\..*$/i, "")
      .trim();
    const visibleComments = (() => {
      const selectorCandidates = [
        "[data-hook='review']",
        "[id^='customer_review-']",
        ".review",
        "[data-hook='review-collapsed']",
        "[data-hook='review-body']",
      ];
      const reviewRoots = Array.from(new Set(
        selectorCandidates.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
          .map((node) => node?.closest?.("[data-hook='review'], [id^='customer_review-'], .review, .a-section"))
          .filter(Boolean),
      )).filter((node) => {
        const body = cleanReviewContent(
          node.querySelector?.(reviewContentSelector)?.textContent,
        );
        const date = cleanText(
          node.querySelector?.("[data-hook='review-date'], .review-date, span.a-size-base.a-color-secondary.review-date")?.textContent,
        );
        return body.length >= 12 || startsWithReviewDate(date);
      }).slice(0, 16);
      const seen = new Set();
      return reviewRoots.map((item, index) => {
        const content = cleanReviewContent(
          item.querySelector(reviewContentSelector)?.textContent,
        );
        if (!content) return null;
        const userName = cleanText(
          item.querySelector(".a-profile-name, [data-hook='genome-widget'] .a-profile-name, .a-profile-content")?.textContent,
        );
        const postedAt = cleanText(
          item.querySelector("[data-hook='review-date'], .review-date, span.a-size-base.a-color-secondary.review-date")?.textContent,
        );
        const likeCount = parseHelpfulCount(
          item.querySelector("[data-hook='helpful-vote-statement'], .cr-vote-text")?.textContent,
        );
        const id = item.getAttribute("id") || `${userName}:${content.slice(0, 40)}:${index}`;
        if (seen.has(id)) return null;
        seen.add(id);
        return {
          id,
          user_name: userName,
          content,
          like_count: likeCount,
          posted_at_text: postedAt,
          is_reply: false,
        };
      }).filter(Boolean);
    })();
    const name = text("#productTitle") || text("h1.a-size-large") || document.title;
    let price = text(".a-price .a-offscreen") || text("#priceblock_ourprice") || text("#price_inside_buybox");
    if (!price && text(".a-price-whole")) price = `$${text(".a-price-whole")}${text(".a-price-fraction")}`;
    const asin = document.querySelector("[data-asin]")?.getAttribute("data-asin")
      || window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/)?.[1]
      || "";
    const ratingText = text("#acrPopover") || text(".a-icon-alt");
    const reviewText = text("#acrCustomerReviewText");
    let monthlySales = "";
    document.querySelectorAll("span").forEach((el) => {
      const value = el.textContent || "";
      if (value.includes("bought in past month") || value.includes("上个月已售")) {
        const match = value.match(/[\d,，]+/);
        if (match) monthlySales = `${match[0].replace(/[，,]/g, "")}+`;
      }
    });
    const brand = text("#bylineInfo")
      .replace(/^Visit the\s+/i, "")
      .replace(/\s+Store$/i, "")
      .replace(/^Brand:\s*/i, "")
      .trim() || text(".po-brand .po-break-word");
    const rawBullets = Array.from(document.querySelectorAll("#feature-bullets li span.a-list-item"))
      .map((el) => el.textContent.trim())
      .filter((value) => value.length > 3)
      .slice(0, 8);

    return {
      name,
      price: price || "",
      sku_id: asin,
      brand,
      rating: Number.parseFloat(ratingText) || null,
      review_count: Number.parseInt(reviewText.replace(/[^0-9]/g, ""), 10) || 0,
      monthly_sales: monthlySales,
      thumbnail_url: attr("#landingImage", "src") || attr("#imgBlkFront", "src"),
      detail_images: amazonDetailImages(),
      raw_bullets: rawBullets,
      comments: visibleComments.length || (Number.parseInt(reviewText.replace(/[^0-9]/g, ""), 10) || 0),
      visible_comments: visibleComments,
    };
  };
})();
