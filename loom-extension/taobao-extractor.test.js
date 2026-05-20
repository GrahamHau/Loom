import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

class FakeElement {
  constructor(attrs = {}, options = {}) {
    this.attrs = attrs;
    this.textContent = options.textContent || "";
    this.className = options.className || "";
    this.id = options.id || "";
    this.currentSrc = options.currentSrc || "";
    this.naturalWidth = options.naturalWidth || 0;
    this.naturalHeight = options.naturalHeight || 0;
    this.parentElement = options.parentElement || null;
    this.rect = options.rect || { width: this.naturalWidth, height: this.naturalHeight };
  }

  getAttribute(name) {
    return this.attrs[name] || "";
  }

  getBoundingClientRect() {
    return this.rect;
  }

  querySelectorAll() {
    return [];
  }
}

function loadTaobaoExtractor({ selectorMap = {}, firstMap = {}, scripts = [], bodyText = "" } = {}) {
  const source = readFileSync(new URL("./content/taobao.js", import.meta.url), "utf8");
  const document = {
    body: { innerText: bodyText },
    title: "淘宝商品",
    scripts,
    querySelectorAll(selector) {
      return selectorMap[selector] || [];
    },
    querySelector(selector) {
      return firstMap[selector] || selectorMap[selector]?.[0] || null;
    },
  };
  const sandbox = {
    Element: FakeElement,
    document,
    window: {
      __loom_extractors: {},
      location: { search: "?id=123456", pathname: "/item/123456" },
    },
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.__loom_extractors.taobao;
}

describe("taobao content extractor", () => {
  it("prefers the visible product gallery cover over unreliable metadata images", () => {
    const mainImage = new FakeElement(
      { src: "//img.alicdn.com/imgextra/main-product.jpg" },
      { naturalWidth: 900, naturalHeight: 900, rect: { width: 430, height: 430 } }
    );
    const metaImage = new FakeElement({ content: "https://img.alicdn.com/imgextra/shop-logo.jpg" });
    const jsonLd = {
      textContent: JSON.stringify({
        "@type": "Product",
        name: "测试商品",
        image: ["https://img.alicdn.com/imgextra/recommend-wrong.jpg"],
      }),
    };

    const extract = loadTaobaoExtractor({
      selectorMap: {
        'script[type="application/ld+json"]': [jsonLd],
        "#J_ImgBooth img": [mainImage],
      },
      firstMap: {
        'meta[property="og:image"]': metaImage,
      },
    });

    const result = extract();

    expect(result.thumbnail_url).toBe("https://img.alicdn.com/imgextra/main-product.jpg");
  });

  it("ignores detail/recommendation images when picking the primary cover", () => {
    const detailParent = new FakeElement({}, { className: "recommend-detail-list" });
    const detailImage = new FakeElement(
      { src: "https://img.alicdn.com/imgextra/detail-large.jpg" },
      { naturalWidth: 1200, naturalHeight: 1200, rect: { width: 600, height: 600 }, parentElement: detailParent }
    );
    const mainImage = new FakeElement(
      { src: "https://img.alicdn.com/imgextra/real-main.jpg" },
      { naturalWidth: 700, naturalHeight: 700, rect: { width: 360, height: 360 } }
    );

    const extract = loadTaobaoExtractor({
      selectorMap: {
        "[class*='gallery'] img": [detailImage],
        "img[class*='mainPic']": [mainImage],
      },
    });

    const result = extract();

    expect(result.thumbnail_url).toBe("https://img.alicdn.com/imgextra/real-main.jpg");
  });

  it("uses the top product price band instead of lower recommendation prices", () => {
    const recommendationPrice = new FakeElement(
      {},
      { className: "price--Hi3vfC7r", textContent: "¥789.001人付款", rect: { width: 234, height: 25, top: 13326 } }
    );
    const topPriceBand = new FakeElement(
      {},
      { className: "beltPrice--i5j_t2w4", textContent: "券后 ￥ 435 优惠前￥519 距结束 09:36:00", rect: { width: 490, height: 78, top: 271 } }
    );

    const extract = loadTaobaoExtractor({
      selectorMap: {
        "[class*='beltPrice']": [topPriceBand],
        "[class*='price--']": [recommendationPrice],
      },
    });

    const result = extract();

    expect(result.price).toBe("¥435");
    expect(result.discount_price).toBe("¥435");
    expect(result.original_price).toBe("¥519");
  });

  it("leaves original price empty when it only matches the current price", () => {
    const topPriceBand = new FakeElement(
      {},
      { className: "beltPrice--i5j_t2w4", textContent: "券后 ￥ 69.6 优惠前￥69.6", rect: { width: 490, height: 78, top: 271 } }
    );

    const extract = loadTaobaoExtractor({
      selectorMap: {
        "[class*='beltPrice']": [topPriceBand],
      },
    });

    const result = extract();

    expect(result.discount_price).toBe("¥69.6");
    expect(result.original_price).toBe("");
  });
});
