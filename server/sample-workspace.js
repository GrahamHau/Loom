import { buildEmptyState } from "./seed.js";

export const SAMPLE_WORKSPACE_VERSION = "public-pocket3-2026-05";

// Pocket 3 风格示例需求 — 给 visitor 一个可参考的真实形态
const SAMPLE_DEMANDS = [
  {
    id: "demo-d-1",
    title: "Vlog 用户希望相机更轻、单手开拍更快",
    summary: "多个 vlogger 在小红书反馈：随身相机最重要的不是参数，而是从揣兜到开拍的时间。Pocket 3 风格机型最受欢迎。",
    source: "xiaohongshu",
    source_url: "https://www.xiaohongshu.com/explore/sample-pocket3-vlog",
    author: "@旅行手记",
    likes: 1280,
    collects: 320,
    shares: 45,
    comments: 168,
    date: "2026-05-12",
    innovation: "体验创新",
    scenarios: ["户外/旅行", "日常 vlog"],
    painpoints: ["开机太慢", "单手不好操作"],
    tags: ["pocket3", "vlog"],
    thumbHue: 200,
    sample: true,
  },
  {
    id: "demo-d-2",
    title: "用户希望随身相机能直接出片，少做后期",
    summary: "Amazon 评论里 60% 的好评提到自动取景、自动调色、内置滤镜，主打『按下就好看』。",
    source: "amazon",
    source_url: "https://www.amazon.com/sample-pocket-cam-reviews",
    author: "Amazon 用户评论",
    likes: 0,
    collects: 0,
    shares: 0,
    comments: 412,
    date: "2026-05-08",
    innovation: "功能创新",
    scenarios: ["短视频创作", "亲子记录"],
    painpoints: ["后期太麻烦", "颜色不准"],
    tags: ["自动取景", "出片直出"],
    thumbHue: 140,
    sample: true,
  },
  {
    id: "demo-d-3",
    title: "云台收音差是核心差评点",
    summary: "Kickstarter 上同类项目评论 28% 提到收音，希望加内置降噪麦或支持快速接外置麦。",
    source: "kickstarter",
    source_url: "https://www.kickstarter.com/projects/sample-cam-audio",
    author: "众筹支持者",
    likes: 95,
    collects: 22,
    shares: 8,
    comments: 73,
    date: "2026-05-05",
    innovation: "硬件创新",
    scenarios: ["户外/旅行", "采访拍摄"],
    painpoints: ["收音差", "外置配件麻烦"],
    tags: ["麦克风", "音质"],
    thumbHue: 260,
    sample: true,
  },
  {
    id: "demo-d-4",
    title: "包装内托不够稳，运输有刮花",
    summary: "多家代理商反馈：现有 Pocket 包装内托保护不足，长途运输有刮花，需要海绵 + 内托双层。",
    source: "manual",
    source_url: "",
    author: "供应商反馈",
    likes: 0,
    collects: 0,
    shares: 0,
    comments: 0,
    date: "2026-05-03",
    innovation: "结构创新",
    scenarios: ["供应链"],
    painpoints: ["包装保护不足", "刮花投诉"],
    tags: ["包装", "供应商"],
    thumbHue: 30,
    sample: true,
  },
];

// Pocket 3 风格示例产品（竞品库参考）
const SAMPLE_PRODUCTS = [
  {
    id: "demo-p-1",
    title: "DJI Osmo Pocket 3",
    summary: "1 英寸 CMOS 三轴云台口袋相机，主打便携 + 直出 + 强稳定。",
    competitor_brands: ["DJI"],
    camera_brands: ["Osmo Pocket 3"],
    product_categories: ["运动相机", "云台相机"],
    scenarios: ["户外/旅行", "日常 vlog"],
    painpoints: [],
    innovation: "体验创新",
    sample: true,
  },
  {
    id: "demo-p-2",
    title: "Insta360 GO 3S",
    summary: "拇指大小的可拆卸运动相机，主打无感佩戴。",
    competitor_brands: ["Insta360"],
    camera_brands: ["Insta360 GO 3S"],
    product_categories: ["运动相机"],
    scenarios: ["户外/旅行", "亲子记录"],
    painpoints: [],
    innovation: "结构创新",
    sample: true,
  },
];
export const SAMPLE_NEWS_MAX_AGE_HOURS = Number(process.env.SAMPLE_NEWS_MAX_AGE_HOURS || 240);

export const SAMPLE_NEWS_SOURCES = [];
export const DEFAULT_NEWS_SOURCES = [];

export function sampleSourceId(userId, sourceId) {
  return `${sourceId}-${String(userId || "user").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function isStateEmptyForSample(state = {}) {
  return ["products", "demands", "research"].every((key) => !Array.isArray(state[key]) || state[key].length === 0) &&
    (!Array.isArray(state.rssSources) || state.rssSources.length === 0);
}

export function isSampleWorkspace(state = {}) {
  return Boolean(state?.onboarding?.sampleWorkspace);
}

export function isRecentSampleNews(item, now = new Date()) {
  const published = new Date(item?.published_at || item?.date || "");
  if (Number.isNaN(published.getTime())) return false;
  const ageHours = (now.getTime() - published.getTime()) / 36e5;
  return ageHours >= 0 && ageHours <= SAMPLE_NEWS_MAX_AGE_HOURS;
}

function withDefaults(item) {
  return {
    thumbnail_url: "",
    image: "",
    original_image_url: "",
    visible_comments: [],
    tag_values: {},
    note: "",
    evidence_status: "needs_review",
    original_content: item.summary || "",
    url: item.source_url || "",
    synced_at: null,
    feishu_record_id: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    ...item,
  };
}

export function sampleWorkspaceState(user = {}) {
  const state = buildEmptyState(user);
  state.demands = SAMPLE_DEMANDS.map(withDefaults);
  state.products = SAMPLE_PRODUCTS.map(withDefaults);
  state.onboarding = {
    sampleWorkspace: true,
    sampleVersion: SAMPLE_WORKSPACE_VERSION,
    label: "体验工作区",
    liveNews: false,
    newsMaxAgeHours: SAMPLE_NEWS_MAX_AGE_HOURS,
    created_at: nowIso(),
  };
  return state;
}
