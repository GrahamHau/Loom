(function registerTaobaoExtractor() {
  window.__pmcopilot_extractors = window.__pmcopilot_extractors || {};
  window.__pmcopilot_extractors.taobao = function extractTaobao() {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
    const name = text(".mainTitle") || text(".tb-seller-title") || text("h1") || document.title;
    const priceText = text(".tb-rmb-num") || text(".J_price .price") || text("[data-price]");
    const itemId = window.location.search.match(/id=(\d+)/)?.[1]
      || window.location.pathname.match(/\/item\/(\d+)/)?.[1]
      || "";
    const reviewText = text(".J_ratingCount") || text("[class*='reviewCount']");
    const salesText = text("[class*='sellCount']") || text("[class*='sale']");
    const salesMatch = salesText.match(/[\d,，]+/);
    const image = document.querySelector("#J_ImgBooth img, .tb-booth img, img[class*='mainPic']")?.src || "";

    return {
      name,
      price: priceText ? `¥${priceText.replace(/^¥/, "")}` : "",
      sku_id: itemId,
      brand: text(".shop-name-link") || text("[class*='brand']"),
      rating: Number.parseFloat(text(".J_ratingNum")) || null,
      review_count: Number.parseInt(reviewText.replace(/[^0-9]/g, ""), 10) || 0,
      monthly_sales: salesMatch ? `${salesMatch[0].replace(/[，,]/g, "")}+` : "",
      thumbnail_url: image,
    };
  };
})();
