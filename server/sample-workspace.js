import { buildEmptyState } from "./seed.js";

export const SAMPLE_WORKSPACE_VERSION = "live-sample-2026-05";
export const SAMPLE_NEWS_MAX_AGE_HOURS = Number(process.env.SAMPLE_NEWS_MAX_AGE_HOURS || 72);

export const SAMPLE_NEWS_SOURCES = [
  {
    id: "sample-news-google-accessory-launches",
    name: "配件竞品新品 - Google News",
    url: "https://news.google.com/rss/search?q=(SmallRig%20OR%20NEEWER%20OR%20Tilta%20OR%20%22K%26F%20CONCEPT%22%20OR%20Godox%20OR%20Nanlite%20OR%20Zhiyun)%20(new%20OR%20launch%20OR%20announces%20OR%20unveils%20OR%20release)&hl=en-US&gl=US&ceid=US:en",
    fetch_interval: 60,
    group: "sample-live",
    source_group: "sample-live",
    brand: "",
    authority: "aggregator",
  },
  {
    id: "sample-news-google-camera-launches",
    name: "主机品牌新品 - Google News",
    url: "https://news.google.com/rss/search?q=(DJI%20OR%20Insta360%20OR%20GoPro%20OR%20Sony%20OR%20Canon%20OR%20Nikon%20OR%20Fujifilm%20OR%20Panasonic)%20(camera%20OR%20drone%20OR%20gimbal)%20(new%20OR%20launch%20OR%20announces%20OR%20unveils%20OR%20release)&hl=en-US&gl=US&ceid=US:en",
    fetch_interval: 60,
    group: "sample-live",
    source_group: "sample-live",
    brand: "",
    authority: "aggregator",
  },
  {
    id: "sample-news-petapixel",
    name: "PetaPixel",
    url: "https://petapixel.com/feed/",
    fetch_interval: 60,
    group: "sample-live",
    source_group: "sample-live",
    brand: "",
    authority: "watchlist",
  },
  {
    id: "sample-news-dpreview",
    name: "DPReview",
    url: "https://www.dpreview.com/feeds/news",
    fetch_interval: 60,
    group: "sample-live",
    source_group: "sample-live",
    brand: "",
    authority: "watchlist",
  },
  {
    id: "sample-news-newsshooter",
    name: "Newsshooter",
    url: "https://www.newsshooter.com/feed/",
    fetch_interval: 120,
    group: "sample-live",
    source_group: "sample-live",
    brand: "",
    authority: "watchlist",
  },
  {
    id: "sample-news-kickstarter-tech",
    name: "Kickstarter · Technology",
    url: "https://www.kickstarter.com/projects/feed.atom?category=technology&sort=newest",
    fetch_interval: 120,
    group: "sample-live",
    source_group: "sample-live",
    brand: "",
    authority: "crowdfunding",
  },
];

export function sampleSourceId(userId, sourceId) {
  return `${sourceId}-${String(userId || "user").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return nowIso().slice(0, 10);
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

export function sampleWorkspaceState(user = {}) {
  const state = buildEmptyState(user);
  state.onboarding = {
    sampleWorkspace: true,
    sampleVersion: SAMPLE_WORKSPACE_VERSION,
    label: "示例工作区",
    liveNews: true,
    newsMaxAgeHours: SAMPLE_NEWS_MAX_AGE_HOURS,
    created_at: nowIso(),
  };
  state.rssSources = SAMPLE_NEWS_SOURCES.map((source) => ({
    ...source,
    id: sampleSourceId(user.id, source.id),
    type: "rss",
    language: "",
    interval: source.fetch_interval,
    active: true,
    is_active: true,
  }));
  state.products = [
    {
      id: "sample-product-creator-light",
      sample: true,
      emoji: "💡",
      name: "便携双色温创作者补光灯",
      category: "灯光",
      tags: ["portable", "bi-color", "creator"],
      status: "体验样例",
      ai_summary: "从近期创作者设备讨论中抽出的示例竞品。重点观察便携、无线供电和快速布光三个卖点。",
      selling_points: ["小型化机身", "双色温调节", "USB-C 供电", "磁吸快装"],
      negative_keywords: ["续航焦虑", "亮度不足", "支架另购"],
      created_at: nowIso(),
      updated_at: nowIso(),
      platforms: [
        { id: "sample-platform-creator-light", platform: "amazon", url: "https://www.amazon.com/", price: "$89-$129", rating: 4.5, reviews: 820, sales: "示例" },
      ],
    },
    {
      id: "sample-product-pocket-tripod",
      sample: true,
      emoji: "📷",
      name: "口袋三脚架与手机夹套装",
      category: "三脚架",
      tags: ["tripod", "mobile", "desk"],
      status: "体验样例",
      ai_summary: "用于演示竞品库如何沉淀价格段、平台链接和用户差评关键词。",
      selling_points: ["桌面俯拍", "折叠收纳", "竖拍兼容"],
      negative_keywords: ["稳定性一般", "夹具松动"],
      created_at: nowIso(),
      updated_at: nowIso(),
      platforms: [
        { id: "sample-platform-pocket-tripod", platform: "taobao", url: "https://www.taobao.com/", price: "¥99-199", rating: 4.6, reviews: 1360, sales: "示例" },
      ],
    },
  ];
  state.demands = [
    {
      id: "sample-demand-magnetic-mount",
      sample: true,
      title: "磁吸快拆补光方案",
      thumbHue: 34,
      summary: "示例灵感：创作者希望补光灯能在相机、手机夹和桌面支架之间快速切换。",
      source: "creator_signal",
      date: today(),
      innovation: "使用方式创新",
      scenarios: ["Vlog/自拍", "桌面俯拍"],
      painpoints: ["安装固定麻烦", "携带不便/太重"],
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "sample-demand-live-kit",
      sample: true,
      title: "直播灯 + 桌面臂一体套装",
      thumbHue: 210,
      summary: "示例灵感：新手直播用户不想分别购买灯、支架、夹具，希望有一次性套装。",
      source: "creator_signal",
      date: today(),
      innovation: "场景整合",
      scenarios: ["直播/带货", "教育/网课"],
      painpoints: ["配件缺失/需另购", "操作复杂/学习成本高"],
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];
  state.research = [
    {
      id: "sample-research-creator-light-kit",
      sample: true,
      title: "便携创作者灯具机会判断",
      desc: "示例调研：把实时 News、竞品库和灵感库串起来，判断便携灯具套装是否值得继续立项。",
      status: "体验样例",
      date: today(),
      products: ["sample-product-creator-light", "sample-product-pocket-tripod"],
      demands: ["sample-demand-magnetic-mount", "sample-demand-live-kit"],
      analysis: [
        "需求集中在快速安装、桌面布光和轻量携带。",
        "竞品多强调灯体本身，套装化和快拆生态仍有差异化空间。",
        "下一步应验证目标价格段与磁吸结构的可靠性。",
      ],
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];
  return state;
}
