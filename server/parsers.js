import { nanoid } from "nanoid";
import { callLLM } from "./ai-service.js";
import { fetchPageContent } from "./content-fetcher.js";
import { buildSearchContext } from "./search-service.js";
import { rawState } from "./repository.js";
import { tagListText } from "./tag-config.js";

function compactArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String).slice(0, 8);
  if (typeof value === "string") return value.split(/[,，、]/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
  return [];
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

function tagGroups(userId) {
  return rawState(userId)?.settings?.tag_groups || [];
}

export async function parseProductUrl(userId, { url, platform }) {
  const page = await fetchPageContent(url);
  const detectedPlatform = platform || page.platform;
  const searchContext = await buildSearchContext(userId, `${page.title} ${detectedPlatform} product review specs`, { limit: 4 });
  const groups = tagGroups(userId);
  const result = await callLLM({
    userId,
    system: "你是产品经理的竞品信息结构化助手。只返回 JSON，不要解释。",
    user: `从以下网页内容中提取商品信息。允许字段为 null。返回 JSON：
{
  "name": "商品全称",
  "category": "产品品类",
  "tags": ["标签"],
  "price": "售价（含币种符号）",
  "rating": 评分数字,
  "review_count": 评论数,
  "monthly_sales": "月销估算",
  "image_url": "首图URL",
  "selling_points": ["卖点"],
  "negative_keywords": ["差评关键词"],
  "ai_summary": "80字以内中文摘要"
}

竞品品牌：${tagListText(groups, "competitor_brands")}
主机品牌：${tagListText(groups, "camera_brands")}
产品品类：${tagListText(groups, "product_categories")}

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
      rating: safeNumber(result.rating),
      reviews: safeNumber(result.review_count),
      sales: normalizeMonthlySales(result.monthly_sales),
      fetched_at: new Date().toISOString(),
    }],
    raw: { page_title: page.title, page_description: page.description },
  };
}

export async function parseProductRaw(userId, { platform, data }) {
  const groups = tagGroups(userId);
  const source = data || {};
  const rawBullets = compactArray(source.raw_bullets);
  const result = await callLLM({
    userId,
    system: "你是竞品分析助手，服务于摄影配件品牌产品经理。只返回 JSON，不要解释。",
    user: `从插件采集的商品信息中提取结构化数据。字段缺失可返回 null。

规则：
- selling_points 只能来自“原始卖点/规格”或商品名/描述中明确出现的信息，不要把“新品、旗舰店、品牌不在白名单、品类不匹配”当卖点。
- negative_keywords 只有输入里出现明确差评、缺陷、限制时才返回；没有就返回 []，不要编造。
- 如果商品不属于摄影/影像器材，也照样提取真实商品信息，但 category 用最接近的真实品类或“其他”。

返回 JSON：
{
  "name": "标准化商品名",
  "brand": "品牌名",
  "category": "品类",
  "price": "带符号的价格",
  "sku_id": "SKU ID",
  "rating": 数字,
  "review_count": 数字,
  "monthly_sales": "月销估算",
  "selling_points": ["卖点"],
  "negative_keywords": ["差评词"],
  "ai_summary": "50字以内中文竞品摘要"
}

竞品品牌：${tagListText(groups, "competitor_brands")}
主机品牌：${tagListText(groups, "camera_brands")}
产品品类：${tagListText(groups, "product_categories")}

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

  return {
    ...source,
    ...result,
    platform,
    name: result.name || source.name || source.title || "未命名竞品",
    brand: result.brand || source.brand || "",
    category: result.category || source.category || "未分类",
    price: result.price || source.price || "",
    sku_id: result.sku_id || source.sku_id || "",
    rating: safeNumber(result.rating ?? source.rating),
    review_count: safeNumber(result.review_count ?? source.review_count),
    monthly_sales: normalizeMonthlySales(result.monthly_sales || source.monthly_sales),
    thumbnail_url: source.thumbnail_url || result.image_url || "",
    selling_points: compactArray(result.selling_points).length ? compactArray(result.selling_points) : rawBullets,
    negative_keywords: compactArray(result.negative_keywords),
    ai_summary: result.ai_summary || source.description || "",
  };
}

export async function parseDemandUrl(userId, { url }) {
  const page = await fetchPageContent(url);
  const searchContext = await buildSearchContext(userId, `${page.title} creator problem use case trend`, { limit: 4 });
  const groups = tagGroups(userId);
  const result = await callLLM({
    userId,
    system: "你是产品信息分类助手。只返回 JSON，不要解释。",
    user: `请对以下内容进行结构化打标。

使用场景：${tagListText(groups, "scenarios")}
用户痛点：${tagListText(groups, "painpoints")}
创新类型：${tagListText(groups, "innovation_types")}
自定义标签：${tagListText(groups, "custom_tags")}

返回 JSON：
{
  "title": "一句话标题",
  "summary": "80字以内中文摘要",
  "tags_scenario": [],
  "tags_painpoint": [],
  "tags_innovation": "单选值",
  "tags_category": [],
  "tags_custom": []
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
    import_method: "manual",
    is_confirmed: false,
    date: new Date().toISOString().slice(0, 10),
    thumbHue: 180,
    raw: { page_title: page.title, page_description: page.description },
  };
}

export async function parseDemandRaw(userId, { platform, data }) {
  const source = data || {};
  const groups = tagGroups(userId);
  const result = await callLLM({
    userId,
    system: "你是产品信息分类助手。只返回 JSON，不要解释。",
    user: `请对插件采集的内容进行需求结构化打标。

规则：
- title 必须基于原始标题压缩或清洗，不要改成另一个事件，也不要凭空重写。
- 如果原始标题已经清晰，直接沿用原始标题。

使用场景：${tagListText(groups, "scenarios")}
用户痛点：${tagListText(groups, "painpoints")}
创新类型：${tagListText(groups, "innovation_types")}
自定义标签：${tagListText(groups, "custom_tags")}

返回 JSON：
{
  "title": "一句话标题",
  "summary": "80字以内中文摘要",
  "tags_scenario": [],
  "tags_painpoint": [],
  "tags_innovation": "单选值",
  "tags_category": [],
  "tags_custom": []
}

平台：${platform}
URL：${source.url || ""}
标题：${source.title || source.name || ""}
作者：${source.author || source.brand || ""}
互动：点赞 ${source.likes || 0}，收藏 ${source.collects || 0}，评论 ${source.comments || 0}
内容：${source.content || source.description || ""}`,
    maxTokens: 240,
  });

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
