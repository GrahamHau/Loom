(function registerTaobaoExtractor() {
  window.__loom_extractors = window.__loom_extractors || {};

  function text(selector, root = document) {
    return root.querySelector(selector)?.textContent?.trim() || "";
  }

  function attr(selector, name, root = document) {
    return root.querySelector(selector)?.getAttribute(name)?.trim() || "";
  }

  function normalizeUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    if (url.startsWith("//")) return `https:${url}`;
    return url;
  }

  function normalizeImageUrl(value) {
    const url = normalizeUrl(String(value || "").replace(/&amp;/g, "&").trim());
    if (!url || url.startsWith("data:")) return "";
    return url;
  }

  function cleanTitle(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/[-_]\s*tmall\.com.*$/i, "")
      .replace(/[-_]\s*淘宝网.*$/i, "")
      .trim();
  }

  function cleanPrice(value) {
    const raw = String(value || "").replace(/[^\d.]/g, "");
    if (!raw) return "";
    return `¥${raw}`;
  }

  function visibleText(selector, root = document) {
    const nodes = root.querySelectorAll(selector);
    for (const node of nodes) {
      if (!(node instanceof Element)) continue;
      const rect = node.getBoundingClientRect();
      const value = node.textContent?.replace(/\s+/g, " ").trim() || "";
      if (!value || rect.width <= 0 || rect.height <= 0) continue;
      return value;
    }
    return "";
  }

  function parsePrimaryPrice(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    const couponMatch = text.match(/券后\s*[¥￥]?\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (couponMatch?.[1]) return couponMatch[1];
    const arriveMatch = text.match(/到手(?:价)?\s*[¥￥]?\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (arriveMatch?.[1]) return arriveMatch[1];
    const activityMatch = text.match(/活动价\s*[¥￥]?\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (activityMatch?.[1]) return activityMatch[1];
    const plainMatch = text.match(/[¥￥]\s*([0-9]+(?:\.[0-9]+)?)/);
    if (plainMatch?.[1]) return plainMatch[1];
    return "";
  }

  function findPrimaryTitle() {
    const selectors = [
      "[class*='mainTitle']",
      ".mainTitle",
      "h1",
      "[data-title]",
    ];
    for (const selector of selectors) {
      const value = visibleText(selector);
      if (cleanTitle(value).length >= 8) return cleanTitle(value);
    }
    return "";
  }

  function findPrimaryPrice() {
    const selectors = [
      "[class*='priceWrap']",
      "[class*='Price--priceText']",
      "[class*='priceText']",
      "[class*='price--']",
      ".tb-rmb-num",
      ".J_price .price",
    ];
    for (const selector of selectors) {
      const value = visibleText(selector);
      const parsed = parsePrimaryPrice(value);
      if (parsed) return parsed;
    }
    return "";
  }

  function findPriceFromText() {
    const bodyText = document.body?.innerText || "";
    const patterns = [
      /券后价\s*[¥￥]?\s*([0-9]+(?:\.[0-9]+)?)/i,
      /活动价\s*[¥￥]?\s*([0-9]+(?:\.[0-9]+)?)/i,
      /到手价\s*[¥￥]?\s*([0-9]+(?:\.[0-9]+)?)/i,
      /售价\s*[¥￥]?\s*([0-9]+(?:\.[0-9]+)?)/i,
      /¥\s*([0-9]+(?:\.[0-9]+)?)/,
    ];
    for (const pattern of patterns) {
      const match = bodyText.match(pattern);
      if (match?.[1]) return match[1];
    }
    return "";
  }

  function cleanSales(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const normalized = raw
      .replace(/已售|月销|近\s*\d+\s*天已售|人付款|件|台|个/gi, "")
      .replace(/\s+/g, "");
    if (!normalized) return "";
    if (!/[0-9万千百十]/.test(normalized)) return "";
    if (/^[^\w\u4e00-\u9fa5]+$/.test(normalized)) return "";
    return `${normalized}+`;
  }

  function isUsefulSpec(value) {
    const line = String(value || "").replace(/\s+/g, " ").trim();
    if (line.length < 2 || line.length > 48) return false;
    if (!/[A-Za-z0-9\u4e00-\u9fa5]/.test(line)) return false;
    if (/^(购买|客服|进店|参数|图集|用户评价|图文详情|本店推荐|看了又看|搜索|搜本店|桌面版|联系客户|商品码)$/.test(line)) return false;
    if (/^(已售|官方立减|优惠|券后|预计|退货宝|信用卡支付|快递|免运费|假一赔四|极速退款|7天无理由)/.test(line)) return false;
    if (/新品|重磅|旗舰店|好评率|满意度|发货|扫码|二维码|手机淘宝/.test(line)) return false;
    return true;
  }

  function extractSpecsFromText() {
    const bodyText = document.body?.innerText?.replace(/\s+/g, " ").trim() || "";
    const specs = [];
    const pairs = [
      ["品牌", /(?:电风扇品牌|品牌)\s*([^\s]{2,24})/],
      ["型号", /型号\s*([^\s]{2,32})/],
      ["保修期", /保修期\s*([^\s]{2,16})/],
      ["电池容量", /电池容量\s*([0-9.]+\s*mAh)/i],
      ["电机类型", /电机类型\s*([^\s]{2,24})/],
      ["安装方式", /安装方式\s*([^\s]{2,24})/],
      ["类别", /电风扇类别\s*([^\s]{2,32})/],
      ["控制方式", /控制方式\s*([^\s]{2,24})/],
      ["产品尺寸", /产品尺寸\s*([0-9xX*×.\s]+mm)/i],
      ["供电", /电源方式\s*([^\s]{2,24})/],
      ["颜色", /颜色分类\s*([^\s]{2,24})/],
    ];

    for (const [label, pattern] of pairs) {
      const match = bodyText.match(pattern);
      if (match?.[1]) specs.push(`${label}: ${match[1].trim()}`);
    }
    return specs;
  }

  function uniq(items) {
    return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
  }

  function imageUrlFromNode(node) {
    if (!(node instanceof Element)) return "";
    const attrs = ["src", "data-src", "data-ks-lazyload", "data-lazyload", "data-original", "data-img", "data-url"];
    for (const name of attrs) {
      const value = normalizeImageUrl(node.getAttribute(name));
      if (value) return value;
    }
    const srcset = node.getAttribute("srcset") || node.getAttribute("data-srcset") || "";
    if (srcset) {
      const candidates = srcset
        .split(",")
        .map((item) => normalizeImageUrl(item.trim().split(/\s+/)[0]))
        .filter(Boolean);
      if (candidates.length) return candidates[candidates.length - 1];
    }
    return "";
  }

  function isUsefulDetailImage(url, thumbnail = "") {
    const value = normalizeImageUrl(url);
    if (!value) return false;
    const lower = value.toLowerCase();
    if (thumbnail && value === thumbnail) return false;
    if (/(\.gif|\.svg)(?:[?#]|$)/.test(lower)) return false;
    if (/avatar|icon|logo|sprite|blank|loading|placeholder|qrcode|qr-code|wangwang|shop/i.test(lower)) return false;
    return /alicdn|taobaocdn|tbcdn|tmall|taobao|imgextra|bao\/uploaded/i.test(value) || /\.(jpg|jpeg|png|webp)(?:[?#]|$)/i.test(value);
  }

  function visibleElement(node) {
    if (!(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function looksLikeDetailRoot(node) {
    if (!(node instanceof Element)) return false;
    const marker = [
      node.id,
      node.className,
      node.getAttribute("data-spm"),
      node.getAttribute("aria-label"),
    ].join(" ").toLowerCase();
    const label = node.textContent?.slice(0, 120).replace(/\s+/g, " ") || "";
    return /description|desc|detail|itemdesc|item-desc|商品详情|图文详情|宝贝详情|详情描述|产品参数|规格参数/i.test(`${marker} ${label}`);
  }

  function collectDetailImages(thumbnail = "") {
    const explicitRoots = [
      "#description",
      "#J_DivItemDesc",
      "#J_Desc",
      "#J_DetailMeta",
      "#attributes",
      "#J_AttrUL",
      ".tb-detail-bd",
      ".attributes-list",
      "[class*='item-desc']",
      "[class*='ItemDesc']",
      "[class*='description']",
      "[class*='Description']",
      "[class*='desc-root']",
      "[class*='DescRoot']",
      "[class*='detail-content']",
      "[class*='DetailContent']",
      "[class*='main-detail']",
      "[class*='MainDetail']",
    ]
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter((node) => visibleElement(node) && looksLikeDetailRoot(node));
    const candidateRoots = explicitRoots.length
      ? explicitRoots
      : [...document.querySelectorAll("section, article, div")]
          .filter((node) => visibleElement(node) && looksLikeDetailRoot(node))
          .slice(0, 3);
    if (!candidateRoots.length) return [];
    const images = [];
    for (const root of candidateRoots) {
      root.querySelectorAll("img, source").forEach((node) => {
        const url = imageUrlFromNode(node);
        if (isUsefulDetailImage(url, thumbnail)) images.push(url);
      });
    }
    return uniq(images).slice(0, 12);
  }

  function parseJsonLoose(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function getByPath(source, paths) {
    for (const path of paths) {
      let current = source;
      let ok = true;
      for (const key of path) {
        if (current && typeof current === "object" && key in current) {
          current = current[key];
        } else {
          ok = false;
          break;
        }
      }
      if (ok && current != null && current !== "") return current;
    }
    return "";
  }

  function findJsonLdProduct() {
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const script of scripts) {
      const data = parseJsonLoose(script.textContent);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (!item || typeof item !== "object") continue;
        if (item["@type"] === "Product") return item;
        if (Array.isArray(item["@graph"])) {
          const product = item["@graph"].find((entry) => entry?.["@type"] === "Product");
          if (product) return product;
        }
      }
    }
    return null;
  }

  function collectScriptObjects() {
    const sources = [];
    for (const script of document.scripts) {
      const content = script.textContent || "";
      if (!content) continue;

      if (content.includes("__INIT_DATA__")) {
        const match = content.match(/__INIT_DATA__\s*=\s*({[\s\S]*?})\s*;?\s*(?:window\.|var|let|const|$)/);
        const parsed = parseJsonLoose(match?.[1]);
        if (parsed) sources.push(parsed);
      }

      if (content.includes("__DEFAULT_DATA__")) {
        const match = content.match(/__DEFAULT_DATA__\s*=\s*({[\s\S]*?})\s*;?\s*(?:window\.|var|let|const|$)/);
        const parsed = parseJsonLoose(match?.[1]);
        if (parsed) sources.push(parsed);
      }

      if (content.includes('"itemDO"') || content.includes('"item"') || content.includes('"skuCore"')) {
        const matches = content.match(/{[\s\S]*}/g) || [];
        for (const candidate of matches) {
          const parsed = parseJsonLoose(candidate);
          if (parsed && typeof parsed === "object") sources.push(parsed);
        }
      }
    }
    return sources;
  }

  function pickFirstValue(sources, paths) {
    for (const source of sources) {
      const value = getByPath(source, paths);
      if (value) return value;
    }
    return "";
  }

  function extractBulletsAndSpecs() {
    const values = extractSpecsFromText();

    document.querySelectorAll("[class*='skuItem'], [class*='sku-item'], [class*='Property'], [class*='propItem'], [class*='descItem']").forEach((node) => {
      const line = node.textContent?.replace(/\s+/g, " ").trim();
      if (isUsefulSpec(line)) values.push(line);
    });

    document.querySelectorAll("[class*='parameter'], [class*='param'], [class*='sku'], [class*='prop']").forEach((node) => {
      const line = node.textContent?.replace(/\s+/g, " ").trim();
      if (isUsefulSpec(line)) values.push(line);
    });

    return uniq(values).slice(0, 10);
  }

  window.__loom_extractors.taobao = function extractTaobao() {
    const itemId = window.location.search.match(/id=(\d+)/)?.[1]
      || window.location.pathname.match(/\/item\/(\d+)/)?.[1]
      || "";

    const jsonLd = findJsonLdProduct();
    const scriptObjects = collectScriptObjects();

    const titleFromScripts = pickFirstValue(scriptObjects, [
      ["item", "title"],
      ["itemDO", "title"],
      ["itemInfoModel", "title"],
      ["root", "fields", "title"],
      ["data", "item", "title"],
    ]);

    const priceFromScripts = pickFirstValue(scriptObjects, [
      ["price", "priceText"],
      ["price", "price"],
      ["price", "transmitPrice"],
      ["skuCore", "sku2info", "0", "price", "priceText"],
      ["skuCore", "sku2info", "0", "price", "price"],
      ["skuCore", "sku2info", "0", "price", "promotionList", 0, "price"],
      ["item", "price"],
      ["itemDO", "reservePrice"],
      ["itemDO", "price"],
      ["data", "price"],
    ]);

    const salesFromScripts = pickFirstValue(scriptObjects, [
      ["item", "sellCount"],
      ["itemDO", "sellCount"],
      ["sell", "sellCount"],
      ["data", "sellCount"],
    ]);

    const imageFromScripts = pickFirstValue(scriptObjects, [
      ["item", "mainPic"],
      ["itemDO", "mainPic"],
      ["item", "images", 0],
      ["itemDO", "images", 0],
      ["gallery", "images", 0],
    ]);

    const descFromScripts = pickFirstValue(scriptObjects, [
      ["item", "subtitle"],
      ["itemDO", "subtitle"],
      ["item", "description"],
      ["data", "subtitle"],
    ]);

    const ratingText = text(".J_ratingNum") || text("[class*='ratingNum']");
    const reviewText = text(".J_ratingCount") || text("[class*='reviewCount']") || text("[class*='commentCount']");
    const salesText = text("[class*='sellCount']") || text("[class*='saleCount']") || text("[class*='payCnt']") || text("[class*='dealCnt']");

    const name = cleanTitle(
      findPrimaryTitle()
      || jsonLd?.name
      || titleFromScripts
      || text("[class*='mainTitle']")
      || text(".mainTitle")
      || text("h1")
      || document.title
    );

    const price = cleanPrice(
      findPrimaryPrice()
      || parsePrimaryPrice(getByPath(jsonLd, [["offers", "price"]]))
      || parsePrimaryPrice(priceFromScripts)
      || parsePrimaryPrice(text(".tb-rmb-num"))
      || parsePrimaryPrice(text(".J_price .price"))
      || parsePrimaryPrice(findPriceFromText())
      || attr("[data-price]", "data-price")
    );

    const monthlySales = cleanSales(
      salesFromScripts
      || salesText
      || ""
    );

    const thumbnail = normalizeUrl(
      getByPath(jsonLd, [["image", 0], ["image"]])
      || imageFromScripts
      || attr('meta[property="og:image"]', "content")
      || attr("#J_ImgBooth img", "src")
      || attr(".tb-booth img", "src")
      || attr("img[class*='mainPic']", "src")
      || attr("img[alt*='商品']", "src")
    );

    const description = cleanTitle(
      getByPath(jsonLd, [["description"]])
      || descFromScripts
      || text("[class*='subTitle']")
      || text("[class*='subtitle']")
      || text("[class*='desc']")
    );

    const rawBullets = extractBulletsAndSpecs();
    const detailImages = collectDetailImages(thumbnail);

    return {
      name,
      price,
      sku_id: itemId,
      brand: "",
      rating: Number.parseFloat(String(ratingText).replace(/[^\d.]/g, "")) || null,
      review_count: Number.parseInt(String(reviewText).replace(/[^\d]/g, ""), 10) || 0,
      monthly_sales: monthlySales,
      thumbnail_url: thumbnail,
      description,
      raw_bullets: rawBullets,
      detail_images: detailImages,
    };
  };
})();
