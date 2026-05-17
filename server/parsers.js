import { nanoid } from "nanoid";
import { callLLM, callRoutedLLM } from "./ai-service.js";
import { fetchPageContent } from "./content-fetcher.js";
import { buildSearchContext } from "./search-service.js";
import { rawState } from "./repository.js";
import { fieldOptionsText, normalizeFields } from "./field-config.js";
import { normalizeTagValues } from "./field-matcher.js";

function compactArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String).slice(0, 8);
  if (typeof value === "string") return value.split(/[,，、]/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
  return [];
}

function compactUrlArray(value, limit = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, limit);
}

function safeNumber(value) {
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeMonthlySales(value) {
  return String(value || "")
    .replace(/\s*\/\s*(month|mo|mth|月)\s*$/i, "")
    .replace(/\s*(每月|月销)\s*$/i, "")
    .trim();
}

function fields(userId) {
  return rawState(userId)?.settings?.fields || [];
}

function fieldSchema(userId, entity, options = {}) {
  const includeDefaults = options.includeDefaults !== false;
  const settings = rawState(userId)?.settings || {};
  return normalizeFields(settings.fields, settings.tag_groups, { includeDefaults })
    .filter((field) => field.entities.includes(entity));
}

function fieldListText(userId, key) {
  return fieldOptionsText(fields(userId), key);
}

function accountFields(userId, entity) {
  return fieldSchema(userId, entity, { includeDefaults: false });
}

function fieldLibraryPrompt(userId, entity, options = {}) {
  const list = fieldSchema(userId, entity, { includeDefaults: options.includeDefaults !== false });
  if (!list.length) {
    return "字段库为空。不要自动创建字段；tag_values 必须返回 {}。";
  }
  const schema = list.map((field) => ({
    key: field.key,
    name: field.name,
    official: Boolean(field.official),
    multi: field.multi !== false,
    options: field.options || [],
  }));
  return `只允许写入以下字段库字段，禁止返回未列出的字段 key。字段有 options 时优先使用 options 中的值；没有匹配选项时可返回原始短标签。
${JSON.stringify(schema)}`;
}

function legacyTagCandidates(entity, result = {}) {
  if (entity === "competitor") {
    return {
      brand: result.brand,
      host: result.host,
      category: result.category,
      custom_tags: result.tags || result.tags_custom,
      标签: result.tags || result.tags_custom,
    };
  }
  return {
    scenarios: result.tags_scenario || result.scenarios,
    使用场景: result.tags_scenario || result.scenarios,
    painpoints: result.tags_painpoint || result.painpoints,
    用户痛点: result.tags_painpoint || result.painpoints,
    innovation: result.tags_innovation || result.innovation,
    创新类型: result.tags_innovation || result.innovation,
    custom_tags: result.tags_custom || result.tags,
    标签: result.tags_custom || result.tags,
  };
}

function fieldSuggestions(entity, result = {}, tagValues = {}) {
  if (Object.keys(tagValues || {}).length) return [];
  const suggestions = entity === "competitor"
    ? [
        [result.brand, "品牌"],
        [result.host, "主机"],
        [result.category, "品类"],
        [result.tags || result.tags_custom, "标签"],
      ]
    : [
        [result.tags_scenario || result.scenarios, "使用场景"],
        [result.tags_painpoint || result.painpoints, "用户痛点"],
        [result.tags_innovation || result.innovation, "创新类型"],
        [result.tags_custom || result.tags, "标签"],
      ];
  return suggestions
    .filter(([value]) => compactArray(value).length || (typeof value === "string" && value.trim()))
    .map(([, label]) => label)
    .slice(0, 3);
}

function accountTagValues(userId, entity, result) {
  const list = fieldSchema(userId, entity, { includeDefaults: true });
  if (!list.length) return {};
  const normalized = normalizeTagValues({
    ...legacyTagCandidates(entity, result),
    ...(result?.tag_values || {}),
  }, list, { includeDefaults: false });
  return Object.fromEntries(Object.entries(normalized).filter(([, values]) => compactArray(values).length > 0));
}

export async function parseProductUrl(userId, { url, platform }) {
  const page = await fetchPageContent(url);
  const detectedPlatform = platform || page.platform;
  const searchContext = await buildSearchContext(userId, `${page.title} ${detectedPlatform} product review specs`, { limit: 4 });
  const result = await callLLM({
    userId,
    purpose: "products:parse_url",
    system: "你是产品经理的竞品信息结构化助手。只返回 JSON，不要解释。",
    user: `从以下网页内容中提取商品信息。允许字段为 null。返回 JSON：
{
  "name": "商品全称",
  "brand": "品牌名",
  "host": "适配主机/设备型号",
  "category": "产品品类",
  "tags": ["标签"],
  "price": "售价（含币种符号）",
  "creator": "Kickstarter 发起人或空字符串",
  "pledged_amount": "Kickstarter 认缴金额或空字符串",
  "goal_amount": "Kickstarter 目标金额或空字符串",
  "backers": "Kickstarter 支持者数量或空字符串",
  "rating": 评分数字,
  "review_count": 评论数,
  "monthly_sales": "月销估算",
  "image_url": "首图URL",
  "selling_points": ["卖点"],
  "negative_keywords": ["差评关键词"],
  "ai_summary": "80字以内中文摘要"
}

竞品品牌：${fieldListText(userId, "brand")}
适配主机/设备型号：${fieldListText(userId, "host")}
产品品类：${fieldListText(userId, "category")}
字段语义：brand 只填竞品/厂商品牌；host 只填适配主机或设备型号；category 只填产品品类，三者不要互相混填。

平台：${detectedPlatform}
URL：${page.url}
标题：${page.title}
描述：${page.description}
正文：${page.content}

外部搜索上下文：
${searchContext}`,
    maxTokens: 300,
  });

  const name = result.name || page.title || "未命名竞品";
  return {
    source_url: page.url,
    platform: detectedPlatform,
    emoji: "📦",
    name,
    brand: result.brand || "",
    host: result.host || "",
    category: result.category || "未分类",
    tags: compactArray(result.tags),
    status: "新录入",
    image: result.image_url || page.image || "",
    thumbnail_url: result.image_url || page.image || "",
    ai_summary: result.ai_summary || page.description || "",
    selling_points: compactArray(result.selling_points),
    negative_keywords: compactArray(result.negative_keywords),
    platforms: [{
      id: nanoid(8),
      platform: detectedPlatform,
      url: page.url,
      price: result.price || "",
      cost: "",
      creator: result.creator || "",
      pledged_amount: result.pledged_amount || "",
      goal_amount: result.goal_amount || "",
      backers: result.backers || "",
      rating: safeNumber(result.rating),
      reviews: safeNumber(result.review_count),
      sales: normalizeMonthlySales(result.monthly_sales),
      fetched_at: new Date().toISOString(),
    }],
    raw: { page_title: page.title, page_description: page.description },
    tag_values: accountTagValues(userId, "competitor", result),
  };
}

export async function parseProductRaw(userId, { platform, data }) {
  const source = data || {};
  const rawBullets = compactArray(source.raw_bullets);
  if (platform === "taobao") {
    return parseTaobaoProductRaw(userId, { platform, source, rawBullets });
  }
  const result = await callLLM({
    userId,
    purpose: "products:parse_raw",
    system: "你是竞品分析助手，服务于摄影配件品牌产品经理。只返回 JSON，不要解释。",
    user: `从插件采集的商品信息中提取结构化数据。字段缺失可返回 null。

规则：
- selling_points 只能来自“原始卖点/规格”或商品名/描述中明确出现的信息，不要把“新品、旗舰店、品牌不在白名单、品类不匹配”当卖点。
- negative_keywords 只有输入里出现明确差评、缺陷、限制时才返回；没有就返回 []，不要编造。
- 如果商品不属于摄影/影像器材，也照样提取真实商品信息，但 category 用最接近的真实品类或“其他”。
- 如果是 Kickstarter 项目，优先保留发起人、认缴金额、目标金额、支持者数；品牌和品类仍只在信息明确时返回。

返回 JSON：
{
  "name": "标准化商品名",
  "brand": "品牌名",
  "host": "适配主机/设备型号",
  "category": "品类",
  "price": "带符号的价格",
  "creator": "Kickstarter 发起人或空字符串",
  "pledged_amount": "Kickstarter 认缴金额或空字符串",
  "goal_amount": "Kickstarter 目标金额或空字符串",
  "backers": "Kickstarter 支持者数量或空字符串",
  "sku_id": "SKU ID",
  "rating": 数字,
  "review_count": 数字,
  "monthly_sales": "月销估算",
  "selling_points": ["卖点"],
  "negative_keywords": ["差评词"],
  "ai_summary": "50字以内中文竞品摘要",
  "tag_values": { "字段key": ["字段值"] }
}

竞品品牌：${fieldListText(userId, "brand")}
适配主机/设备型号：${fieldListText(userId, "host")}
产品品类：${fieldListText(userId, "category")}
字段语义：brand 只填竞品/厂商品牌；host 只填适配主机或设备型号；category 只填产品品类，三者不要互相混填。
字段库：
${fieldLibraryPrompt(userId, "competitor")}

平台：${platform}
URL：${source.url || ""}
商品名：${source.name || source.title || ""}
价格：${source.price || ""}
品牌：${source.brand || ""}
评分：${source.rating || ""} (${source.review_count || 0} 评)
月销：${source.monthly_sales || ""}
描述：${source.description || source.content || ""}
原始卖点/规格：${rawBullets.join("；")}`,
    maxTokens: 260,
  });
  const tagValues = accountTagValues(userId, "competitor", result);

  return {
    ...source,
    ...result,
    platform,
    name: result.name || source.name || source.title || "未命名竞品",
    brand: result.brand || source.brand || "",
    host: result.host || source.host || "",
    category: result.category || source.category || "未分类",
    price: result.price || source.price || "",
    creator: result.creator || source.creator || "",
    pledged_amount: result.pledged_amount || source.pledged_amount || "",
    goal_amount: result.goal_amount || source.goal_amount || "",
    backers: result.backers || source.backers || "",
    sku_id: result.sku_id || source.sku_id || "",
    rating: safeNumber(result.rating ?? source.rating),
    review_count: safeNumber(result.review_count ?? source.review_count),
    monthly_sales: normalizeMonthlySales(result.monthly_sales || source.monthly_sales),
    thumbnail_url: source.thumbnail_url || result.image_url || "",
    tag_values: tagValues,
    field_suggestions: fieldSuggestions("competitor", result, tagValues),
    selling_points: compactArray(result.selling_points).length ? compactArray(result.selling_points) : rawBullets,
    negative_keywords: compactArray(result.negative_keywords),
    ai_summary: result.ai_summary || source.description || "",
  };
}

async function parseTaobaoProductRaw(userId, { platform, source, rawBullets }) {
  const detailImages = compactUrlArray(source.detail_images);
  const result = await callRoutedLLM({
    userId,
    purpose: "products:parse_taobao_raw",
    system: "你是淘宝/天猫商品详情页的竞品识别助手，服务于摄影配件品牌产品经理。只返回 JSON，不要解释。",
    visionSystem: "你是淘宝/天猫商品详情页的视觉信息提取助手。只根据图片提取可见信息，严格返回 JSON，不要解释。",
    visionUser: `请从淘宝/天猫商品详情图中提取可见信息，优先识别价格、品牌、规格、卖点、限制和月销相关线索。字段缺失就返回空字符串或空数组。

返回 JSON：
{
  "price": "带符号价格或空字符串",
  "brand": "品牌或空字符串",
  "host": "适配主机/设备型号或空字符串",
  "category": "品类或空字符串",
  "monthly_sales": "月销估算或空字符串",
  "selling_points": ["图片中明确出现的卖点"],
  "negative_keywords": ["图片中明确出现的限制或缺点"],
  "summary": "50字以内中文摘要"
}

竞品品牌：${fieldListText(userId, "brand")}
适配主机/设备型号：${fieldListText(userId, "host")}
产品品类：${fieldListText(userId, "category")}`,
    user: `从淘宝/天猫详情页中提取商品信息。详情页的卖点主要来自后续长图、规格图、场景图；首图只作为封面参考。

规则：
- selling_points 必须来自详情长图、规格图、商品名、描述或原始规格中明确出现的信息；不确定就返回 []。
- 不要把“旗舰店、包邮、优惠、券后、销量、售后承诺”当作核心卖点。
- brand 只能从“竞品品牌”列表中选择完全匹配或高度明确的品牌；匹配不到返回 ""。
- host 只能填明确出现的适配主机/设备型号，不要把厂商品牌填到 host。
- category 只能从“产品品类”列表中选择最贴近的一个；匹配不到返回 ""。
- negative_keywords 只有详情图或文本里明确出现缺陷、限制、差评时才返回；没有就返回 []。
- ai_summary 用中文，50 字以内，概括这个商品对竞品库有价值的信息。

返回 JSON：
{
  "name": "标准化商品名",
  "brand": "品牌名或空字符串",
  "host": "适配主机/设备型号或空字符串",
  "category": "品类或空字符串",
  "price": "带符号的价格",
  "sku_id": "SKU ID",
  "monthly_sales": "月销估算或空字符串",
  "selling_points": ["来自详情图或规格的核心卖点"],
  "negative_keywords": ["明确出现的差评词或限制"],
  "ai_summary": "50字以内中文竞品摘要",
  "tag_values": { "字段key": ["字段值"] }
}

竞品品牌：${fieldListText(userId, "brand")}
适配主机/设备型号：${fieldListText(userId, "host")}
产品品类：${fieldListText(userId, "category")}
字段语义：brand 只填竞品/厂商品牌；host 只填适配主机或设备型号；category 只填产品品类，三者不要互相混填。
字段库：
${fieldLibraryPrompt(userId, "competitor")}

平台：${platform}
URL：${source.url || ""}
商品名：${source.name || source.title || ""}
价格：${source.price || ""}
SKU：${source.sku_id || ""}
月销：${source.monthly_sales || ""}
描述：${source.description || source.content || ""}
原始规格文本：${rawBullets.join("；")}
详情图数量：${detailImages.length}
详情图URL：
${detailImages.map((url, index) => `${index + 1}. ${url}`).join("\n")}`,
    imageUrls: detailImages,
    maxTokens: 320,
  });
  const tagValues = accountTagValues(userId, "competitor", result);

  return {
    ...source,
    ...result,
    platform,
    name: result.name || source.name || source.title || "未命名竞品",
    brand: result.brand || "",
    host: result.host || source.host || "",
    category: result.category || "",
    price: result.price || source.price || "",
    sku_id: result.sku_id || source.sku_id || "",
    rating: safeNumber(source.rating),
    review_count: safeNumber(source.review_count),
    monthly_sales: normalizeMonthlySales(result.monthly_sales || source.monthly_sales),
    thumbnail_url: source.thumbnail_url || result.image_url || "",
    detail_images: detailImages,
    tag_values: tagValues,
    field_suggestions: fieldSuggestions("competitor", result, tagValues),
    selling_points: compactArray(result.selling_points),
    negative_keywords: compactArray(result.negative_keywords),
    ai_summary: result.ai_summary || source.description || "",
  };
}

export async function parseDemandUrl(userId, { url }) {
  const page = await fetchPageContent(url);
  const searchContext = await buildSearchContext(userId, `${page.title} creator problem use case trend`, { limit: 4 });
  const result = await callLLM({
    userId,
    purpose: "demands:parse_url",
    system: "你是产品信息分类助手。只返回 JSON，不要解释。",
    user: `请对以下内容进行结构化打标。

使用场景：${fieldListText(userId, "scenarios")}
用户痛点：${fieldListText(userId, "painpoints")}
创新类型：${fieldListText(userId, "innovation")}
自定义标签：${fieldListText(userId, "custom_tags")}
字段库：
${fieldLibraryPrompt(userId, "inspiration")}

返回 JSON：
{
  "title": "一句话标题",
  "summary": "80字以内中文摘要",
  "tags_scenario": [],
  "tags_painpoint": [],
  "tags_innovation": "单选值",
  "tags_category": [],
  "tags_custom": [],
  "tag_values": { "字段key": ["字段值"] }
}

平台：${page.platform}
URL：${page.url}
标题：${page.title}
描述：${page.description}
正文：${page.content}

外部搜索上下文：
${searchContext}`,
    maxTokens: 260,
  });
  const tagValues = accountTagValues(userId, "inspiration", result);
  return {
    source_url: page.url,
    url: page.url,
    source: page.platform,
    source_platform: page.platform,
    thumbnail_url: page.image || "",
    title: result.title || page.title || "未命名需求",
    summary: page.content || page.description || result.summary || "",
    original_content: page.content.slice(0, 2000),
    innovation: result.tags_innovation || "待分类",
    scenarios: compactArray(result.tags_scenario),
    painpoints: compactArray(result.tags_painpoint),
    tags_category: compactArray(result.tags_category),
    tags_custom: compactArray(result.tags_custom),
    tags: compactArray(result.tags_custom),
    tag_values: tagValues,
    field_suggestions: fieldSuggestions("inspiration", result, tagValues),
    import_method: "manual",
    is_confirmed: false,
    date: new Date().toISOString().slice(0, 10),
    thumbHue: 180,
    raw: { page_title: page.title, page_description: page.description },
  };
}

export async function parseDemandRaw(userId, { platform, data }) {
  const source = data || {};
  const result = await callLLM({
    userId,
    purpose: "demands:parse_raw",
    system: "你是产品信息分类助手。只返回 JSON，不要解释。",
    user: `请对插件采集的内容进行需求结构化打标。

规则：
- title 必须基于原始标题压缩或清洗，不要改成另一个事件，也不要凭空重写。
- 如果原始标题已经清晰，直接沿用原始标题。

使用场景：${fieldListText(userId, "scenarios")}
用户痛点：${fieldListText(userId, "painpoints")}
创新类型：${fieldListText(userId, "innovation")}
自定义标签：${fieldListText(userId, "custom_tags")}

返回 JSON：
{
  "title": "一句话标题",
  "summary": "80字以内中文摘要",
  "tags_scenario": [],
  "tags_painpoint": [],
  "tags_innovation": "单选值",
  "tags_category": [],
  "tags_custom": [],
  "tag_values": { "字段key": ["字段值"] }
}

账号字段库：
${fieldLibraryPrompt(userId, "inspiration")}

平台：${platform}
URL：${source.url || ""}
标题：${source.title || source.name || ""}
作者：${source.author || source.brand || ""}
互动：点赞 ${source.likes || 0}，收藏 ${source.collects || 0}，评论 ${source.comments || 0}
内容：${source.content || source.description || ""}`,
    maxTokens: 240,
  });
  const tagValues = accountTagValues(userId, "inspiration", result);

  return {
    ...source,
    platform,
    title: source.title || source.name || result.title || "未命名需求",
    summary: source.content || source.description || result.summary || "",
    original_content: source.content || source.description || source.summary || "",
    tags_scenario: compactArray(result.tags_scenario),
    tags_painpoint: compactArray(result.tags_painpoint),
    tags_innovation: result.tags_innovation || "待分类",
    tags_category: compactArray(result.tags_category),
    tags_custom: compactArray(result.tags_custom),
    tag_values: tagValues,
    field_suggestions: fieldSuggestions("inspiration", result, tagValues),
    thumbnail_url: source.thumbnail_url || "",
    source: source.source || platform,
    source_platform: source.source_platform || platform,
    author: source.author || "",
    likes: safeNumber(source.likes) || 0,
    collects: safeNumber(source.collects) || 0,
    comments: safeNumber(source.comments) || 0,
    date: source.date || new Date().toISOString().slice(0, 10),
    thumbHue: source.thumbHue ?? 180,
  };
}
