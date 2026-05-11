(function registerAmazonExtractor() {
  window.__pmcopilot_extractors = window.__pmcopilot_extractors || {};
  window.__pmcopilot_extractors.amazon = function extractAmazon() {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
    const attr = (selector, name) => document.querySelector(selector)?.getAttribute(name) || "";
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
      raw_bullets: rawBullets,
    };
  };
})();
