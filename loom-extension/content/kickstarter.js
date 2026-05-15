(function registerKickstarterExtractor() {
  window.__loom_extractors = window.__loom_extractors || {};
  window.__loom_extractors.kickstarter = function extractKickstarter() {
    const text = (selector, root = document) => root.querySelector(selector)?.textContent?.trim() || "";
    const meta = (name) => document.querySelector(`meta[property='${name}'], meta[name='${name}']`)?.content?.trim() || "";
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const bodyText = clean(document.body?.innerText || "");
    const title = text("h1") || meta("og:title") || document.title;
    const description = clean(meta("og:description") || text("[class*='blurb']") || text("[class*='description']")).slice(0, 800);
    const image = meta("og:image") || document.querySelector("img")?.src || "";

    const rewardTexts = Array.from(document.querySelectorAll("button, div, section, article"))
      .map((el) => clean(el.textContent))
      .filter((value) =>
        /(?:Backers|支持者)/i.test(value) &&
        /(?:預估交貨|Estimated delivery|運送至|Ships to)/i.test(value) &&
        /[$¥€£]\s?[\d,.]+/.test(value)
      );
    const firstRewardText = rewardTexts[0] || "";
    const rewardPriceMatch = firstRewardText.match(/([$¥€£]\s?[\d,.]+)(?![\s\S]*[$¥€£]\s?[\d,.]+\s*(?:已認繳|pledged))/);

    const pledgedMatch = bodyText.match(/([$¥€£]\s?[\d,.]+)\s*(?:已認繳|pledged)/i);
    const goalMatch = bodyText.match(/(?:總目標|goal)\s*([$¥€£]\s?[\d,.]+)/i)
      || bodyText.match(/pledged\s+of\s+([$¥€£]\s?[\d,.]+)\s+goal/i);
    const backersMatch = bodyText.match(/([\d,.]+)\s*(?:名支持者|backers)/i);

    const creatorCandidate = Array.from(document.querySelectorAll("a[href*='/profile/'], button"))
      .map((el) => clean(el.textContent))
      .find((value) => /(?:首次發起|已支持|backed|created|creator|發起人)/i.test(value))
      || meta("author");
    const creator = clean(
      creatorCandidate
        .replace(/\s+正在 Kickstarter[\s\S]*$/i, "")
        .replace(/(?:首次發起|已支持|backed|Backed|First created|created|creator|發起人)[\s\S]*$/i, "")
        .replace(/\s*•\s*[\d,.]+\s*(?:已支持|backed)?[\s\S]*$/i, "")
    );

    const contentRoot = document.querySelector("main") || document.body;
    const content = clean(contentRoot?.innerText || "").slice(0, 8000);

    return {
      name: title,
      title,
      description,
      price: rewardPriceMatch?.[1] || "",
      sku_id: "",
      brand: "",
      creator,
      goal_amount: goalMatch?.[1] || "",
      pledged_amount: pledgedMatch?.[1] || "",
      backers: backersMatch?.[1] || "",
      content,
      thumbnail_url: image,
      raw_bullets: [],
    };
  };
})();
