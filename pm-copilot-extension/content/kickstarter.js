(function registerKickstarterExtractor() {
  window.__pmcopilot_extractors = window.__pmcopilot_extractors || {};
  window.__pmcopilot_extractors.kickstarter = function extractKickstarter() {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
    const meta = (name) => document.querySelector(`meta[property='${name}'], meta[name='${name}']`)?.content || "";
    const title = text("h1") || meta("og:title") || document.title;
    const description = (meta("og:description") || text("[class*='blurb']") || text("[class*='description']")).slice(0, 800);
    const image = meta("og:image") || document.querySelector("img")?.src || "";
    const moneyTexts = Array.from(document.querySelectorAll("span, div"))
      .map((el) => el.textContent.trim())
      .filter((value) => /[$¥€£]\s?[\d,.]+/.test(value))
      .slice(0, 8);
    const backerText = Array.from(document.querySelectorAll("span, div"))
      .map((el) => el.textContent.trim())
      .find((value) => /backers|支持者/i.test(value)) || "";

    return {
      name: title,
      title,
      description,
      price: "",
      sku_id: "",
      brand: text("[class*='creator'] a") || text("[class*='creator']") || "",
      goal_amount: moneyTexts[1] || "",
      pledged_amount: moneyTexts[0] || "",
      backers: Number.parseInt(backerText.replace(/[^0-9]/g, ""), 10) || null,
      thumbnail_url: image,
      raw_bullets: [description].filter(Boolean),
    };
  };
})();
