import { nanoid } from "nanoid";
import { callLLM } from "./ai-service.js";
import { fetchPageContent } from "./content-fetcher.js";

function compactArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String).slice(0, 8);
  if (typeof value === "string") return value.split(/[,，、]/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
  return [];
}

function safeNumber(value) {
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function parseProductUrl({ url, platform }) {
  const page = await fetchPageContent(url);
  const detectedPlatform = platform || page.platform;
  const result = await callLLM({
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

平台：${detectedPlatform}
URL：${page.url}
标题：${page.title}
描述：${page.description}
正文：${page.content}`,
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
      sales: result.monthly_sales || "",
      fetched_at: new Date().toISOString(),
    }],
    raw: { page_title: page.title, page_description: page.description },
  };
}

export async function parseDemandUrl({ url }) {
  const page = await fetchPageContent(url);
  const result = await callLLM({
    system: "你是产品信息分类助手。只返回 JSON，不要解释。",
    user: `请对以下内容进行结构化打标。

使用场景：["Vlog/自拍","直播/带货","短视频创作","户外旅拍","室内棚拍","桌面俯拍","会议/活动记录","运动/极限拍摄","产品摄影","延时/慢动作","街拍/纪实","教育/网课"]
用户痛点：["携带不便/太重","续航不足","操作复杂/学习成本高","画质不够","防抖不足","散热过热","噪音大","兼容性差","配件缺失/需另购","安装固定麻烦","调光/调色不精准","无线连接不稳定","收纳困难","价格过高/性价比低","做工质感差"]
创新类型：["技术创新","使用方式创新","形态创新","场景拓展","生态整合","性价比创新"]

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
正文：${page.content}`,
  });

  return {
    source_url: page.url,
    url: page.url,
    source: page.platform,
    source_platform: page.platform,
    thumbnail_url: page.image || "",
    title: result.title || page.title || "未命名需求",
    summary: result.summary || page.description || "",
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
