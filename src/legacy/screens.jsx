/* global React, Icon, Tag, Btn, Switch, Placeholder, DemandThumb, PLATFORM_LABEL, PLATFORM_ICON, PLATFORM_KEY */
const React = globalThis.React;
const Icon = globalThis.Icon;
const Tag = globalThis.Tag;
const Btn = globalThis.Btn;
const Switch = globalThis.Switch;
const Placeholder = globalThis.Placeholder;
const DemandThumb = globalThis.DemandThumb;
const SaveIndicator = globalThis.SaveIndicator;
const ConfirmModal = globalThis.ConfirmModal;
const Drawer = globalThis.Drawer;
const OverflowMenu = globalThis.OverflowMenu;
const SectionDot = globalThis.SectionDot;
const CitationChip = globalThis.CitationChip;
const Breadcrumb = globalThis.Breadcrumb;
const DocCard = globalThis.DocCard;
const navigateTo = globalThis.navigateTo;
const PLATFORM_LABEL = globalThis.PLATFORM_LABEL;
const PLATFORM_ICON = globalThis.PLATFORM_ICON;
const PLATFORM_KEY = globalThis.PLATFORM_KEY;
const { useState, useEffect, useMemo, useRef } = React;
const fieldEntityGroups = {
  competitor: "竞品",
  inspiration: "灵感",
  product: "产品",
  sku: "SKU",
  demand: "需求",
  category: "品类",
};

const NEWS_SOURCE_TYPE_LABEL = {
  rss: "RSS",
  atom: "Atom",
  wechat_exporter: "公众号",
};

function EmptyState({ icon = "sparkles", title, children, action }) {
  return (
    <div className="empty">
      <Icon name={icon} size={22} style={{ color: "var(--accent)", marginBottom: 8 }} />
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6 }}>{children}</div>
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function splitTokenText(value) {
  return String(value || "")
    .split(/\s*[/·,，;；]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeNewsSourceType(value) {
  const normalized = String(value || "rss").trim().toLowerCase();
  if (normalized === "wechat-exporter" || normalized === "wechat") return "wechat_exporter";
  if (normalized === "atom") return "atom";
  return normalized || "rss";
}

function clampPage(page, totalPages) {
  return Math.min(Math.max(1, Number(page) || 1), Math.max(1, totalPages || 1));
}

function paginate(items, page, pageSize) {
  const list = safeArray(items);
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const currentPage = clampPage(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    items: list.slice(start, start + pageSize),
    totalPages,
    currentPage,
    start,
    end: Math.min(start + pageSize, list.length),
    total: list.length,
  };
}

function PaginationBar({ page, total, pageSize, onPageChange, label = "条" }) {
  if (total <= pageSize) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = clampPage(page, totalPages);
  const start = (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);
  return (
    <div className="pagination-bar">
      <div className="pagination-summary">
        显示 {start}-{end} / {total} {label}
      </div>
      <div className="pagination-controls">
        <Btn size="sm" variant="ghost" icon="chevron-left" disabled={current <= 1} onClick={() => onPageChange(current - 1)}>上一页</Btn>
        <span className="pagination-page">{current} / {totalPages}</span>
        <Btn size="sm" variant="ghost" icon="chevron-right" disabled={current >= totalPages} onClick={() => onPageChange(current + 1)}>下一页</Btn>
      </div>
    </div>
  );
}

function normalizeMonthlySales(value) {
  return String(value || "")
    .replace(/\s*\/\s*(month|mo|mth|月)\s*$/i, "")
    .replace(/\s*(每月|月销)\s*$/i, "")
    .trim();
}

function normalizeMetricValue(value, prefix) {
  const raw = String(value ?? "").trim();
  if (!raw || !prefix || typeof prefix !== "string") return raw;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw.replace(new RegExp(`^\\s*${escaped}\\s*`), "").trim();
}

function externalHref(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function demandSourceUrl(demand) {
  return demand?.url || demand?.source_url || "";
}

function inferPlatformFromUrl(url) {
  const value = String(url || "").toLowerCase();
  if (value.includes("taobao.") || value.includes("tmall.")) return "taobao";
  if (value.includes("amazon.")) return "amazon";
  if (value.includes("kickstarter.")) return "kickstarter";
  if (value.includes("xiaohongshu.") || value.includes("xhslink.")) return "xiaohongshu";
  if (value.includes("youtube.") || value.includes("youtu.be")) return "youtube";
  if (value.includes("instagram.")) return "instagram";
  return "";
}

function normalizePlatformKey(platform, url = "") {
  const inferred = inferPlatformFromUrl(url);
  const raw = String(platform || "").trim().toLowerCase();
  const compact = raw.replace(/[\s_\-/.]+/g, "");
  if (
    inferred === "taobao" ||
    ["taobao", "tb", "tmall", "淘宝", "天猫", "淘宝天猫", "taobao天猫"].includes(compact)
  ) return "taobao";
  if (
    inferred === "amazon" ||
    ["amazon", "amz", "亚马逊"].includes(compact)
  ) return "amazon";
  if (
    inferred === "kickstarter" ||
    ["kickstarter", "ks", "众筹"].includes(compact)
  ) return "kickstarter";
  if (
    inferred === "xiaohongshu" ||
    ["xiaohongshu", "xhs", "red", "小红书"].includes(compact)
  ) return "xiaohongshu";
  if (inferred) return inferred;
  return raw || "";
}

const SUPPORTED_PRODUCT_PLATFORMS = ["amazon", "taobao", "kickstarter"];
const SUPPORTED_INSPIRATION_PLATFORMS = ["xiaohongshu", "kickstarter"];

function platformClass(platform, url = "") {
  return PLATFORM_KEY[normalizePlatformKey(platform, url)] || "";
}

function platformLabel(platform, url = "") {
  const key = normalizePlatformKey(platform, url);
  return PLATFORM_LABEL[key] || platform || "未知平台";
}

function platformUrlLabel(url, fallback = "未填写链接") {
  const value = String(url || "").trim();
  if (!value) return fallback;
  try {
    const parsed = new URL(externalHref(value));
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return value;
  }
}

function platformMetricConfig(platform) {
  const platformKey = normalizePlatformKey(platform);
  if (platformKey === "kickstarter") {
    return [
      { key: "price", label: "档位金额", prefix: "$" },
      { key: "cost", label: "参考成本", prefix: "¥" },
      { key: "creator", label: "发起人" },
      { key: "pledged_amount", label: "认缴金额" },
      { key: "goal_amount", label: "目标金额" },
      { key: "backers", label: "支持者", inputMode: "numeric" },
    ];
  }
  if (platformKey === "taobao") {
    return [
      { key: "original_price", label: "原价", prefix: "¥" },
      { key: "discount_price", label: "折扣价", prefix: "¥" },
      { key: "cost", label: "参考成本", prefix: "¥" },
      { key: "sales", label: "已售", inputMode: "numeric" },
    ];
  }
  if (platformKey === "xiaohongshu") {
    return [
      { key: "likes", label: "点赞", inputMode: "numeric" },
      { key: "collects", label: "收藏", inputMode: "numeric" },
      { key: "comments", label: "评论", inputMode: "numeric" },
      { key: "author", label: "作者" },
    ];
  }
  return [
    { key: "price", label: "售价", prefix: "$" },
    { key: "cost", label: "参考成本", prefix: "¥" },
    { key: "rating", label: "评分", prefix: "★" },
    { key: "reviews", label: "评论数", inputMode: "numeric" },
    { key: "sales", label: "月销估算", suffix: "/月", inputMode: "numeric" },
  ];
}

function createEmptyPlatform(platform = "amazon") {
  const platformKey = normalizePlatformKey(platform) || "amazon";
  return {
    id: `${platformKey}-${Date.now()}`,
    platform: platformKey,
    url: "",
    price: "",
    original_price: "",
    discount_price: "",
    cost: "",
    rating: "",
    reviews: "",
    sales: "",
    creator: "",
    pledged_amount: "",
    goal_amount: "",
    backers: "",
    fetched_at: new Date().toISOString(),
  };
}

function DemandImage({ demand, label, className = "", style }) {
  const [failed, setFailed] = useState(false);
  const image = demand?.thumbnail_url || demand?.image || "";
  if (image && !failed) {
    return (
      <img
        className={className}
        style={style}
        src={image}
        alt={demand?.title || "demand"}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <DemandThumb hue={demand?.thumbHue} label={label} />;
}

function demandMetricValue(value) {
  if (value === 0 || value) return value;
  return "—";
}

const NEWS_MERGE_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "to", "for", "of", "with", "in", "on", "at",
  "launch", "launches", "launched", "launching",
  "announce", "announces", "announced", "announcing",
  "introduce", "introduces", "introduced", "introducing",
  "release", "releases", "released", "releasing",
  "debut", "debuts", "debuted", "debuting",
  "official", "presented", "preview", "first", "look", "review", "hands", "hand", "rumor", "rumour", "teaser",
  "发布", "推出", "上市", "首发", "亮相", "登场", "发售", "开售", "正式发布", "正式推出",
  "新机", "新品", "相机", "镜头", "套装",
]);

function normalizeNewsMergeTitle(value = "") {
  return String(value || "")
    .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, "$1 $2")
    .toLowerCase()
    .replace(/\s+-\s+[^-]+$/g, "")
    .replace(/['"“”‘’]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/-(发布|推出|上市|首发|亮相|登场|发售|开售|正式发布|正式推出)(?=-|$)/g, "-")
    .replace(/^(发布|推出|上市|首发|亮相|登场|发售|开售|正式发布|正式推出)-/g, "")
    .replace(/(新品|新机|复古套装|套装)(发布|推出|上市|首发|亮相|登场|发售|开售|正式发布|正式推出)$/g, "$1")
    .replace(/(go-\d+s?)(发布|推出|上市|首发|亮相|登场|发售|开售)$/g, "$1")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

function newsMergeTitleTokens(value = "") {
  return normalizeNewsMergeTitle(value)
    .split("-")
    .filter(Boolean)
    .filter((token) => !NEWS_MERGE_STOPWORDS.has(token));
}

function newsTaxonomyTokens(tagGroups = [], keys = ["competitor_brands", "camera_brands"]) {
  return Array.from(new Set(
    safeArray(tagGroups)
      .filter((group) => safeArray(keys).includes(group?.key))
      .flatMap((group) => safeArray(group?.tags))
      .map((tag) => normalizeNewsMergeTitle(tag))
      .filter(Boolean)
  )).sort((a, b) => b.length - a.length);
}

function detectNewsTaxonomyToken(normalizedTitle = "", tagGroups = [], keys = ["competitor_brands", "camera_brands"]) {
  const wrapped = `-${normalizedTitle}-`;
  return newsTaxonomyTokens(tagGroups, keys).find((token) => wrapped.includes(`-${token}-`)) || "";
}

function detectNewsBrandToken(normalizedTitle = "", tagGroups = []) {
  return detectNewsTaxonomyToken(normalizedTitle, tagGroups, ["competitor_brands"]);
}

function detectNewsHostToken(normalizedTitle = "", tagGroups = []) {
  return detectNewsTaxonomyToken(normalizedTitle, tagGroups, ["camera_brands"]);
}

function trimBrandPrefix(value = "", brand = "") {
  if (!value || !brand) return value;
  return value.startsWith(`${brand}-`) ? value.slice(brand.length + 1) : value;
}

function newsMergeKey(item = {}, tagGroups = []) {
  const nearMergeKey = String(item?.classification?.near_merge_key || "").trim();
  if (nearMergeKey && !nearMergeKey.endsWith("::generic")) return `near::${nearMergeKey}`;
  const storyKey = String(item?.classification?.story_key || "").trim();
  if (storyKey && storyKey !== "generic") {
    const sourceKey = String(item?.source || "").trim().toLowerCase() || newsSourceHost(item) || "unknown";
    const crossSourceStoryKeys = new Set([
      "canon-c2pa-image-verify",
      "sony-a7r-vi-launch",
      "sony-a7r-vi-review",
    ]);
    return crossSourceStoryKeys.has(storyKey) ? `story::${storyKey}` : `story::${sourceKey}::${storyKey}`;
  }
  const normalizedTitle = normalizeNewsMergeTitle(item?.titleZh || item?.original_title || "");
  const titleTokens = newsMergeTitleTokens(item?.titleZh || item?.original_title || "");
  const detectedBrandToken = detectNewsBrandToken(normalizedTitle, tagGroups);
  const detectedHostToken = detectNewsHostToken(normalizedTitle, tagGroups);
  const brandTokens = detectedBrandToken ? detectedBrandToken.split("-").filter(Boolean) : [];
  const hostTokens = detectedHostToken ? detectedHostToken.split("-").filter(Boolean) : [];
  const coreTokens = titleTokens.filter((token) => !brandTokens.includes(token) && !hostTokens.includes(token));
  const hostKey = trimBrandPrefix(detectedHostToken, detectedBrandToken);
  const taxonomyKey = [detectedBrandToken, hostKey].filter(Boolean).join("::");
  const normalizedKey = taxonomyKey
    ? [taxonomyKey, coreTokens.slice(0, 6).join("-")].filter(Boolean).join("::")
    : (coreTokens.slice(0, 6).join("-") || normalizedTitle);
  const classifiedKey = String(item?.classification?.merge_key || "").trim();
  if (classifiedKey && !taxonomyKey) {
    const classifiedTokens = classifiedKey
      .split("-")
      .filter(Boolean)
      .filter((token) => normalizedKey.includes(token) || token.includes(normalizedKey));
    if (classifiedTokens.length >= 2 || !normalizedKey) return classifiedKey;
  }
  return normalizedKey || classifiedKey || String(item?.id || "");
}

function newsSourceHost(item = {}) {
  try {
    const url = new URL(item.original_url || item.url || "");
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isWechatNewsItem(item = {}) {
  return String(item?.classification?.source_type || "").toLowerCase() === "wechat_exporter" ||
    String(item?.classification?.source_group || "").toLowerCase() === "wechat-exporter" ||
    String(item?.original_url || item?.url || "").includes("mp.weixin.qq.com") ||
    String(item?.source || "").includes("公众号");
}

function compareNewsPrimary(a = {}, b = {}) {
  const aWechat = isWechatNewsItem(a);
  const bWechat = isWechatNewsItem(b);
  if (aWechat !== bWechat) return aWechat ? -1 : 1;
  const aImage = Boolean(a.thumbnail_url || a.image);
  const bImage = Boolean(b.thumbnail_url || b.image);
  if (aImage !== bImage) return aImage ? -1 : 1;
  return new Date(b.published_at || b.date || 0).getTime() - new Date(a.published_at || a.date || 0).getTime();
}

function buildNewsGroups(items = [], tagGroups = []) {
  const map = new Map();
  for (const item of safeArray(items)) {
    const key = newsMergeKey(item, tagGroups);
    const groupId = `news-group:${key}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        ...item,
        id: item.id,
        primaryId: item.id,
        isNewsGroup: false,
        sourceItems: [item],
        sourceCount: 1,
        original_url: item.original_url,
        unread: item.unread,
        starred: item.starred,
        thumbnail_url: item.thumbnail_url,
      });
      continue;
    }
    current.sourceItems.push(item);
    current.sourceItems.sort((a, b) => new Date(b.published_at || b.date || 0).getTime() - new Date(a.published_at || a.date || 0).getTime());
    const primary = [...current.sourceItems].sort(compareNewsPrimary)[0] || current.sourceItems[0];
    current.id = groupId;
    current.primaryId = primary.id;
    current.isNewsGroup = true;
    current.titleZh = primary.titleZh || current.titleZh;
    current.original_title = primary.original_title || current.original_title;
    current.summary = primary.summary || current.summary;
    current.contentZh = primary.contentZh || current.contentZh;
    current.original_url = primary.original_url || current.original_url;
    current.thumbnail_url = primary.thumbnail_url || current.thumbnail_url;
    current.image = primary.image || current.image;
    current.published_at = current.sourceItems[0]?.published_at || current.published_at;
    current.date = String(current.published_at || current.date || "").slice(0, 10);
    current.unread = current.sourceItems.some((entry) => entry.unread);
    current.starred = current.sourceItems.some((entry) => entry.starred);
    current.sourceCount = current.sourceItems.length;
    current.source = current.sourceItems[0]?.source || current.source;
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.published_at || b.date || 0).getTime() - new Date(a.published_at || a.date || 0).getTime());
}

function newsGroupCounts(groups = []) {
  const list = safeArray(groups);
  return {
    all: list.length,
    official: list.length,
    wechat: list.filter((n) => isWechatNewsItem(n)).length,
    trend: list.filter((n) => isGoogleNewsItem(n)).length,
    starred: list.filter((n) => n.starred).length,
  };
}

function isGoogleNewsItem(item = {}) {
  const source = String(item?.source || "").toLowerCase();
  const sourceLabel = String(item?.classification?.source_label || "").toLowerCase();
  const sourceHomepage = String(item?.classification?.source_homepage || "").toLowerCase();
  return source.includes("google news") || sourceLabel.includes("google news") || sourceHomepage.includes("news.google.com");
}

function googleNewsPublisher(item = {}) {
  const candidates = [
    item?.titleZh,
    item?.original_title,
    ...safeArray(item?.sourceItems).flatMap((entry) => [entry?.titleZh, entry?.original_title]),
  ].filter(Boolean);
  for (const text of candidates) {
    const match = String(text).match(/\s[-|｜]\s([^-|｜]+)$/);
    const publisher = match?.[1]?.trim();
    if (publisher && !/google news/i.test(publisher)) return publisher;
  }
  const source = String(item?.source || "").replace(/\s*-\s*Google News$/i, "").trim();
  if (source && !/google news/i.test(source)) return source;
  const host = newsSourceHost(item);
  return host || "Google News";
}

function newsPrimaryTag(item = {}) {
  if (isWechatNewsItem(item)) {
    return String(item?.source || "微信公众号").trim() || "微信公众号";
  }
  if (isGoogleNewsItem(item)) return googleNewsPublisher(item);
  const source = String(item?.source || "").trim();
  return source || String(item?.type || "").trim() || "资讯";
}

function newsEmptyState(tab, sampleWorkspace) {
  if (tab === "starred") {
    return {
      title: "还没有收藏的资讯",
      body: "在资讯流里点右侧星标后，这里会自动汇总你收藏过的内容。",
    };
  }
  if (tab === "official") {
    return {
      title: sampleWorkspace ? "正在等待官方 RSS 内容" : "还没有官方 RSS 资讯",
      body: "官方 RSS 内容同步进来后，这里会展示对应内容。",
    };
  }
  return {
    title: sampleWorkspace ? "正在等待信息流" : "还没有真实 News",
    body: "请使用 Chrome 插件采集。",
  };
}

function tagGroupByKey(tagGroups, key) {
  const normalizedKey = key === "innovation" ? "innovation_types" : key;
  return safeArray(tagGroups).find((group) => group.key === key || group.key === normalizedKey) || { key, name: key, tone: "outline", tags: [] };
}

// ===== Field System =====
const OFFICIAL_PRODUCT_CATEGORY_OPTIONS = [
  "A音视频类",
  "B箱包带类",
  "C配件类",
  "E供电类",
  "L灯光类",
  "T脚架类",
  "S支架类",
  "I智能工作室",
  "X其他类",
];

const OFFICIAL_BRAND_OPTIONS = [
  "Ulanzi",
  "DJI",
  "Insta360",
  "SmallRig",
  "NEEWER",
  "Tilta",
  "K&F CONCEPT",
  "Godox",
  "Nanlite",
  "Zhiyun",
  "智云",
  "Aputure",
  "Rode",
  "RODE",
];

const OFFICIAL_HOST_OPTIONS = [
  "Osmo Pocket 3",
  "Osmo Pocket 4",
  "Osmo Pocket 4P",
  "Osmo Action 5 Pro",
  "Osmo Action 4",
  "Osmo Mobile 7P",
  "Osmo Mobile 7",
  "DJI Mini 4 Pro",
  "DJI Air 3S",
  "DJI Flip",
  "DJI Neo",
  "Insta360 Ace Pro 2",
  "Insta360 Ace Pro",
  "Insta360 X5",
  "Insta360 GO 3",
  "Insta360 GO 3S",
  "Insta360 X4",
  "Insta360 Flow 2 Pro",
  "Insta360 Flow 2",
  "Insta360 Flow Pro",
  "Insta360 Luna",
];

const OFFICIAL_FIELD_OPTIONS = {
  brand: OFFICIAL_BRAND_OPTIONS,
  host: OFFICIAL_HOST_OPTIONS,
  category: OFFICIAL_PRODUCT_CATEGORY_OPTIONS,
};

const OFFICIAL_FIELD_DEFS = [
  { key: "brand",       name: "品牌",    tagGroupKey: "competitor_brands",  official: true,  multi: true,  entities: ["competitor"],               tone: "outline" },
  { key: "host",        name: "主机",    tagGroupKey: "camera_brands",      official: true,  multi: true,  entities: ["competitor"],               tone: "outline" },
  { key: "category",    name: "品类",    tagGroupKey: "product_categories", official: true,  multi: true,  entities: ["competitor"],               tone: "default" },
  { key: "scenarios",   name: "使用场景", tagGroupKey: "scenarios",          official: true,  multi: true,  entities: ["competitor", "inspiration"], tone: "accent"  },
  { key: "painpoints",  name: "用户痛点", tagGroupKey: "painpoints",         official: true,  multi: true,  entities: ["competitor", "inspiration"], tone: "danger"  },
  { key: "innovation",  name: "创新类型", tagGroupKey: "innovation_types",   official: true,  multi: false, entities: ["inspiration"],              tone: "success" },
];

function normalizeFields(fieldsOrGroups, fallbackGroups = [], options = {}) {
  const includeDefaults = options.includeDefaults === true;
  const source = Array.isArray(fieldsOrGroups) ? fieldsOrGroups : [];
  const byKey = new Map();
  const addField = (field) => {
    if (!field?.key || byKey.has(field.key)) return;
    byKey.set(field.key, field);
  };
  const upsertField = (field) => {
    if (!field?.key) return;
    byKey.set(field.key, field);
  };
  const fieldLikeItems = source.filter((item) => item?.options || item?.official !== undefined || item?.legacyKey);
  if (fieldLikeItems.length) {
    fieldLikeItems.map((field) => ({
      key: field.key,
      name: field.name || field.key,
      tagGroupKey: field.legacyKey || field.key,
      legacyKey: field.legacyKey || field.key,
      official: field.official !== false,
      multi: field.multi !== false,
      entities: Array.isArray(field.entities) ? field.entities : ["competitor"],
      tone: field.tone || "outline",
      options: Array.isArray(field.options) ? field.options : [],
    }))
      .filter((field) => field.key !== "custom_tags" && field.legacyKey !== "custom_tags")
      .map((field) => field.official && OFFICIAL_FIELD_OPTIONS[field.key]
        ? { ...field, options: Array.from(new Set([...OFFICIAL_FIELD_OPTIONS[field.key], ...safeArray(field.options)])) }
        : field)
      .forEach(addField);
  }
  const groups = source.filter((item) => item?.tags || item?.field_key || item?.key);
  const groupSource = groups.length ? groups : safeArray(fallbackGroups);
  if (groupSource.length) {
    const officialGroupKeys = new Set(OFFICIAL_FIELD_DEFS.map((d) => d.tagGroupKey));
    groupSource
      .filter((g) => g.key !== "custom_tags")
      .map((g) => ({
        key: g.field_key || OFFICIAL_FIELD_DEFS.find((field) => field.tagGroupKey === g.key)?.key || g.key,
        name: g.name || g.key,
        tagGroupKey: g.key,
        legacyKey: g.key,
        official: Boolean(g.official || officialGroupKeys.has(g.key)),
        multi: g.multi !== false,
        entities: Array.isArray(g.entities) ? g.entities : (OFFICIAL_FIELD_DEFS.find((field) => field.tagGroupKey === g.key)?.entities || ["competitor", "inspiration"]),
        tone: g.tone || "outline",
        options: Array.isArray(g.tags) ? g.tags : [],
      }))
      .forEach((field) => {
        const existing = byKey.get(field.key);
        upsertField(existing ? { ...existing, ...field, options: Array.from(new Set([...safeArray(existing.options), ...safeArray(field.options)])) } : field);
      });
  }
  if (includeDefaults) {
    const groups = safeArray(fallbackGroups);
    OFFICIAL_FIELD_DEFS
      .map((field) => {
        const group = groups.find((item) => item.key === field.tagGroupKey || item.field_key === field.key);
        return {
          ...field,
          legacyKey: field.tagGroupKey,
          name: group?.name || field.name,
          tone: group?.tone || field.tone,
          multi: group?.multi !== undefined ? group.multi !== false : field.multi,
          options: Array.isArray(group?.tags) && group.tags.length
            ? Array.from(new Set([...safeArray(OFFICIAL_FIELD_OPTIONS[field.key]), ...group.tags]))
            : safeArray(OFFICIAL_FIELD_OPTIONS[field.key]),
        };
      })
      .forEach(addField);
  }
  return Array.from(byKey.values());
}

function entityUsesField(entity, field) {
  if (entity?.tag_values && Object.prototype.hasOwnProperty.call(entity.tag_values, field.key)) return true;
  return getFieldValue(entity, field.key).length > 0;
}

function getFieldValue(entity, fieldKey) {
  if (entity?.tag_values && Array.isArray(entity.tag_values[fieldKey])) return entity.tag_values[fieldKey];
  switch (fieldKey) {
    case "brand":      return splitTokenText(entity?.brand);
    case "host":       return splitTokenText(entity?.host);
    case "category":   return splitTokenText(entity?.category);
    case "scenarios":  return safeArray(entity?.scenarios);
    case "painpoints": return safeArray(entity?.painpoints);
    case "innovation":   return [entity?.innovation].filter(Boolean);
    case "custom_tags":  return safeArray(entity?.tags);
    default:             return safeArray(entity?.[fieldKey]);
  }
}

function buildFieldPatch(fieldKey, values) {
  switch (fieldKey) {
    case "brand":      return { brand: values.join(" / "), tag_values: { brand: values } };
    case "host":       return { host: values.join(" / "), tag_values: { host: values } };
    case "category":   return { category: values.join(" / "), tag_values: { category: values } };
    case "innovation":   return { innovation: values[0] || "", tag_values: { innovation: values } };
    case "scenarios":    return { scenarios: values, tag_values: { scenarios: values } };
    case "painpoints":   return { painpoints: values, tag_values: { painpoints: values } };
    case "custom_tags":  return { tags: values, tag_values: { custom_tags: values } };
    default:             return { tag_values: { [fieldKey]: values } };
  }
}

function mergeEntityPatch(entity, patch) {
  if (!patch || typeof patch !== "object") return entity;
  return {
    ...(entity || {}),
    ...patch,
    tag_values: {
      ...((entity || {}).tag_values || {}),
      ...(patch.tag_values || {}),
    },
  };
}

function MultiSelectField({ label, fieldKey, values, tagGroups, tone = "accent", single = false, compact = false, onChange, onCreateOption }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const selected = safeArray(values).filter(Boolean);
  const group = tagGroupByKey(tagGroups, fieldKey);
  const options = Array.from(new Set([...safeArray(group.tags), ...selected])).filter(Boolean);
  const filtered = query ? options.filter((item) => item.toLowerCase().includes(query.toLowerCase())) : options;
  const hasExact = query && options.some((item) => item.toLowerCase() === query.toLowerCase());
  const commitQuery = () => {
    const value = query.trim();
    if (!value) return;
    toggle(value);
  };
  const toggle = (value) => {
    if (!value) return;
    if (!options.includes(value)) onCreateOption?.(group.key, value);
    if (single) {
      onChange?.([value]);
      setOpen(false);
      setQuery("");
      return;
    }
    onChange?.(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
    setQuery("");
  };
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [open]);
  return (
    <div className={`multi-field ${open ? "open" : ""}${compact ? " compact" : ""}`} ref={rootRef}>
      <div
        className="multi-field-shell"
        onClick={() => {
          setOpen(true);
          queueMicrotask(() => inputRef.current?.focus());
        }}
      >
        <div className="multi-field-values">
          {selected.length ? selected.map((item) =>
          <span className={`tag removable selected-token ${tone}`} key={item}>
            <span>{item}</span>
            <button
              type="button"
              className="selected-token-remove"
              onClick={(event) => {
                event.stopPropagation();
                toggle(item);
              }}
            >
              <Icon name="x" size={11} />
            </button>
          </span>
        ) : null}
          <input
            ref={inputRef}
            className={`multi-field-input${selected.length ? " has-selection" : ""}`}
            value={query}
            placeholder={selected.length ? "" : (single ? `输入${label}` : `输入${label}后回车`)}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!open) setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitQuery();
              }
              if (e.key === "Backspace" && !query && selected.length) {
                const last = selected[selected.length - 1];
                if (last) toggle(last);
              }
              if (e.key === "Escape") {
                setOpen(false);
                setQuery("");
              }
            }}
          />
        </div>
      </div>
      {open &&
        <div className="multi-picker">
          <div className="multi-picker-list">
            {filtered.map((item) => {
              const checked = selected.includes(item);
              return (
                <button className={`multi-option ${checked ? "selected" : ""}`} type="button" key={item} onClick={() => toggle(item)}>
                  <span className="multi-check">{checked ? "✓" : ""}</span>
                  <Tag tone={tone}>{item}</Tag>
                  {checked && <span className="multi-option-x">×</span>}
                </button>
              );
            })}
            {query && !hasExact &&
              <button className="multi-option create" type="button" onClick={() => commitQuery()}>
                <span className="multi-check">+</span>
                <span>新建 “{query.trim()}”</span>
              </button>
            }
          </div>
        </div>
      }
    </div>
  );
}

function DemandSourceCard({ demand }) {
  const title = demand?.title || "未命名需求";
  const author = demand?.author || demand?.username || "未知用户";
  const stats = [
    ["点赞", demand?.likes],
    ["收藏", demand?.collects],
    ["评论", demand?.comments],
  ];
  return (
    <div className="demand-source-card">
      <div className="demand-source-media">
        <DemandImage demand={demand} label={`${(demand?.source || "XHS").toUpperCase()} · SOURCE`} className="demand-thumb-media" />
      </div>
      <div className="demand-source-main">
        <div className="demand-source-state">{PLATFORM_LABEL[demand?.source] || demand?.source || "来源"} · 原文采集</div>
        <div className="demand-source-title">{title}</div>
        <div className="demand-source-author">{author}</div>
      </div>
      <div className="demand-source-stats">
        {stats.map(([label, value]) =>
          <div className="demand-source-stat" key={label}>
            <span>{label}</span>
            <strong>{demandMetricValue(value)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

function DemandCommentsSection({ demand }) {
  const comments = safeArray(demand?.visible_comments);
  if (!comments.length) return null;
  return (
    <div className="detail-section demand-comments-section">
      <div className="detail-section-label">采集评论 · {comments.length}</div>
      <div className="demand-comments-list">
        {comments.slice(0, 20).map((comment, index) => {
          const meta = [
            comment.posted_at_text,
            comment.location && !String(comment.posted_at_text || "").includes(comment.location) ? comment.location : "",
            Number(comment.like_count || 0) ? `${Number(comment.like_count || 0)} 赞` : "",
            comment.is_reply ? "回复" : "",
          ].filter(Boolean).join(" · ");
          return (
            <div className="demand-comment-row" key={comment.id || `${comment.user_name}-${index}`}>
              <div className="demand-comment-head">
                <span>{comment.user_name || "未知用户"}</span>
                {meta && <em>{meta}</em>}
              </div>
              <div className="demand-comment-content">{comment.content}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeleteDemandConfirmModal({ demand, busy, onClose, onConfirm }) {
  if (!demand) return null;
  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal destructive-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head destructive-modal-head">
          <div className="destructive-icon"><Icon name="trash" size={17} /></div>
          <div className="destructive-title">
            <h3>删除这条需求？</h3>
            <p>删除后将无法在当前需求库中恢复。</p>
          </div>
        </div>
        <div className="modal-body">
          <div className="confirm-delete-summary">
            <div className="confirm-delete-row">
              <div className="confirm-delete-label">标题</div>
              <div className="confirm-delete-value">{demand.title || "未命名需求"}</div>
            </div>
            <div className="confirm-delete-row">
              <div className="confirm-delete-label">平台</div>
              <div className="confirm-delete-value">{PLATFORM_LABEL[demand.source] || demand.source || "未知"}</div>
            </div>
            <div className="confirm-delete-row">
              <div className="confirm-delete-label">日期</div>
              <div className="confirm-delete-value">{demand.date || "-"}</div>
            </div>
            <div className="confirm-delete-row">
              <div className="confirm-delete-label">创新类型</div>
              <div className="confirm-delete-value">{demand.innovation || "待分类"}</div>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <Btn variant="ghost" onClick={onClose} disabled={busy}>取消</Btn>
          <Btn variant="danger" icon="trash" onClick={onConfirm} disabled={busy}>{busy ? "删除中..." : "删除"}</Btn>
        </div>
      </div>
    </div>
  );
}

function DeleteSourceConfirmModal({ source, busy, onClose, onConfirm }) {
  if (!source) return null;
  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal destructive-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head destructive-modal-head">
          <div className="destructive-icon"><Icon name="trash" size={17} /></div>
          <div className="destructive-title">
            <h3>删除这个数据源？</h3>
            <p>删除后，这个数据源将不再继续采集。</p>
          </div>
        </div>
        <div className="modal-body">
          <div className="confirm-delete-summary">
            <div className="confirm-delete-row">
              <div className="confirm-delete-label">名称</div>
              <div className="confirm-delete-value">{source.name}</div>
            </div>
            <div className="confirm-delete-row">
              <div className="confirm-delete-label">地址</div>
              <div className="confirm-delete-value">{source.url}</div>
            </div>
            <div className="confirm-delete-row">
              <div className="confirm-delete-label">采集条数</div>
              <div className="confirm-delete-value">{source.last_item_count || 0}</div>
            </div>
            <div className="confirm-delete-row">
              <div className="confirm-delete-label">频率</div>
              <div className="confirm-delete-value">{source.interval} min</div>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <Btn variant="ghost" onClick={onClose} disabled={busy}>取消</Btn>
          <Btn variant="danger" icon="trash" onClick={onConfirm} disabled={busy}>{busy ? "删除中..." : "删除"}</Btn>
        </div>
      </div>
    </div>
  );
}

function itemDisplayName(item) {
  return item?.title || item?.name || item?.titleZh || item?.original_title || item?.id || "未命名条目";
}

function DeleteItemsConfirmModal({ entityLabel, items, busy, onClose, onConfirm }) {
  if (!items?.length) return null;
  const preview = items.slice(0, 5);
  const extra = items.length - preview.length;
  const isBulk = items.length > 1;
  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal destructive-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head destructive-modal-head">
          <div className="destructive-icon"><Icon name="trash" size={17} /></div>
          <div className="destructive-title">
            <h3>{isBulk ? `删除 ${items.length} 条${entityLabel}？` : `删除这条${entityLabel}？`}</h3>
            <p>{isBulk ? "这些内容会从当前工作区移除。" : "删除后将无法在当前列表中恢复。"}</p>
          </div>
        </div>
        <div className="modal-body">
          <div className="confirm-delete-summary">
            {preview.map((item) => (
              <div className="confirm-delete-row" key={item.id || itemDisplayName(item)}>
                <div className="confirm-delete-label">{entityLabel}</div>
                <div className="confirm-delete-value">{itemDisplayName(item)}</div>
              </div>
            ))}
            {extra > 0 && (
              <div className="confirm-delete-row">
                <div className="confirm-delete-label">其他</div>
                <div className="confirm-delete-value">还有 {extra} 条未展开</div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <Btn variant="ghost" onClick={onClose} disabled={busy}>取消</Btn>
          <Btn variant="danger" icon="trash" onClick={onConfirm} disabled={busy}>{busy ? "删除中..." : isBulk ? `删除 ${items.length} 条` : "删除"}</Btn>
        </div>
      </div>
    </div>
  );
}

function guessBrand(news) {
  const explicit = String(news.brand || "").trim();
  if (explicit) return explicit;
  const source = String(news.source || "").trim();
  if (source) {
    const cleaned = source
      .replace(/\s*(news|blog|official|官网|官方|中国|global|camera rumors|rumors)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned) return cleaned;
  }
  const title = String(news.titleZh || news.original_title || "").trim();
  const brandMatch = title.match(/^([A-Za-z0-9]+(?:\s?[A-Za-z0-9]+){0,2})\s*(发布|推出|带来|上线|更新|宣布|发布了|推出了|发布新|推出新)/);
  return brandMatch?.[1]?.trim() || "";
}

function sameMetaLabel(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function EditableTagList({ items, tone = "default", onChange, onRemove, addLabel = "+ 添加", placeholder = "输入标签" }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const values = safeArray(items);
  const remove = (item) => {
    onRemove?.(item);
    onChange?.(values.filter((value) => value !== item));
  };
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onChange?.(Array.from(new Set([...values, value])));
    setDraft("");
    setAdding(false);
  };
  return (
    <div className="tag-row">
      {values.map((item) => (
        <button
          key={item}
          type="button"
          className={`tag removable ${tone === "default" ? "" : tone}`}
          onClick={() => remove(item)}
          title={`删除 ${item}`}
        >
          <span>{item}</span>
          <Icon name="x" size={11} />
        </button>
      ))}
      {adding ?
        <span className="tag tag-input-shell">
          <input
            autoFocus
            value={draft}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={add}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
              if (event.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
          />
        </span> :
        <button className="tag tag-add" type="button" onClick={() => setAdding(true)}>{addLabel}</button>
      }
    </div>
  );
}

function DemandTagList(props) {
  return <EditableTagList {...props} />;
}

function RemovableTagList({ items, tone = "default", onChange, onRemove, addLabel = "+ 添加" }) {
  return <EditableTagList items={items} tone={tone} onChange={onChange} onRemove={onRemove} addLabel={addLabel} />;
}

function DetailFieldCard({ children, className = "" }) {
  return <div className={`detail-field-card${className ? ` ${className}` : ""}`}>{children}</div>;
}

function MultiTagField({ label, fieldKey, values, tagGroups, tone = "outline", onChange, onCreateOption }) {
  return (
    <MultiSelectField
      label={label}
      fieldKey={fieldKey}
      values={values}
      tagGroups={tagGroups}
      tone={tone}
      compact
      onChange={onChange}
      onCreateOption={onCreateOption}
    />
  );
}

function FieldRow({ field, entity, onSave, onCreateOption }) {
  const values = getFieldValue(entity, field.key);
  const syntheticTagGroups = [{ key: field.key, name: field.name, tone: field.tone, tags: field.options }];
  return (
    <div className="detail-section detail-section-tight">
      <div className="detail-section-label">
        <Icon name={field.official ? "tag" : "sparkles"} size={11} style={field.official ? {} : { color: "var(--accent)" }} />
        {field.name}
        {!field.official && <span className="field-custom-chip">自定义</span>}
      </div>
      <MultiSelectField
        label={field.name}
        fieldKey={field.key}
        values={values}
        tagGroups={syntheticTagGroups}
        tone={field.tone}
        single={!field.multi}
        compact
        onChange={(vals) => onSave?.(buildFieldPatch(field.key, vals))}
        onCreateOption={onCreateOption}
      />
    </div>
  );
}

function AddFieldPopover({ fields, entityType, entity, onAttach, onGoSettings, onClose }) {
  const rootRef = useRef(null);
  const unattached = fields.filter((f) => f.entities.includes(entityType) && !entityUsesField(entity, f));
  useEffect(() => {
    const handler = (e) => { if (!rootRef.current?.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div className="add-field-popover" ref={rootRef}>
      <div className="add-field-popover-head">添加字段</div>
      {unattached.length === 0 ? (
        <div className="add-field-empty">暂无可添加字段<br /><span>可在设置里新建字段</span></div>
      ) : (
        <div className="add-field-list">
          {unattached.map((f) => (
            <button key={f.key} className="add-field-item" onClick={() => { onAttach(f); onClose(); }}>
              <Icon name={f.official ? "tag" : "sparkles"} size={12} style={{ color: f.official ? "var(--text-3)" : "var(--accent)", flexShrink: 0 }} />
              <span className="add-field-item-name">{f.name}</span>
              <span className="add-field-item-meta">{f.multi ? "多选" : "单选"}</span>
            </button>
          ))}
        </div>
      )}
      <button className="add-field-goto" onClick={onGoSettings}>
        <Icon name="settings" size={12} /> 去设置里新建字段
      </button>
    </div>
  );
}

// ============ LOGIN ============
function LoginScreen({ onLogin, onDemoLogin, onFeishuLogin, error, providers = {} }) {
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const passwordEnabled = providers.password !== false;
  const feishuEnabled = Boolean(providers.feishu);

  const submit = async () => {
    setBusy(true);
    try { await onLogin?.({ username: user, password: pw }); }
    finally { setBusy(false); }
  };
  const enterDemoMode = async () => {
    setBusy(true);
    try { await onDemoLogin?.(); }
    finally { setBusy(false); }
  };

  return (
    <div className="login-stage">
      <div className="login-card">
        <div className="login-brand">
          <div>
            <div className="name">LOOM</div>
            <div className="sub">Link · Observe · Organize · Make</div>
          </div>
        </div>

        <div className="login-actions">

          {/* ① 飞书登录 — 主要入口，始终常驻 */}
          <button className="login-feishu-btn" type="button"
            onClick={() => feishuEnabled && onFeishuLogin?.()} disabled={busy || !feishuEnabled}
            title={feishuEnabled ? "使用飞书登录" : "本地飞书登录未配置公网 HTTPS 回调，请使用账号密码登录本地镜像"}>
            <img src="/feishu.png" alt="" />
            {feishuEnabled ? "使用飞书登录" : "本地飞书登录未配置"}
          </button>
          {!feishuEnabled && (
            <div className="login-provider-hint">本地调试请使用账号密码登录；Chrome 插件继续写入线上账号，本地数据库通过镜像同步查看。</div>
          )}

          {/* ② 演示模式 — 次要入口 */}
          <button className="login-demo-btn" type="button"
            onClick={enterDemoMode} disabled={busy}>
            进入演示模式
          </button>

          {error && <div className="login-error-inline">{error}</div>}

          {/* ③ 账号密码 — 折叠式隐性入口 */}
          {passwordEnabled && !showPw && (
            <button className="login-pw-toggle" type="button"
              onClick={() => setShowPw(true)}>
              使用账号密码登录
            </button>
          )}
          {passwordEnabled && showPw && (
            <div className="login-pw-form">
              <div>
                <label className="field-label">账号</label>
                <input className="input" style={{ width: "100%" }} value={user}
                  placeholder="请输入你的账号" autoComplete="username"
                  onChange={(e) => setUser(e.target.value)} />
              </div>
              <div>
                <label className="field-label">密码</label>
                <input className="input" style={{ width: "100%" }} type="password" value={pw}
                  placeholder="请输入你的密码" autoComplete="current-password"
                  onChange={(e) => setPw(e.target.value)} />
              </div>
              <button className="btn primary" style={{ height: 36, justifyContent: "center" }}
                onClick={submit} disabled={busy || !user || !pw}>
                {busy ? "登录中..." : "登录"}
              </button>
            </div>
          )}
        </div>

        <div className="login-card-foot">
          LOOM v2.0 · 支持演示、账号密码与飞书登录
        </div>
      </div>
    </div>
  );
}
window.LoginScreen = LoginScreen;

// ============ NEWS ============
function DailyDigestCard({ data, api }) {
  const today = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
  const hasLlm = Boolean(data.settings?.llm_configured);
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDigest = async ({ force = false } = {}) => {
    if (!api || !hasLlm) return;
    setLoading(true);
    setError("");
    try {
      const result = await api("/api/news/daily-digest", {
        method: "POST",
        body: JSON.stringify({ limit: 24, force }),
      });
      setDigest(result);
    } catch (err) {
      setError(err.message || "今日总结生成失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDigest().catch(() => {});
  }, [api, hasLlm, data.newsCounts?.all]);

  if (!hasLlm) {
    return (
      <div className="briefing-card briefing-card-collapsed">
        <Icon name="sparkles" size={12} style={{ color: "var(--text-4)" }} />
        <span className="briefing-collapsed-text">配置 LLM 后，基于真实信息流生成今日总结</span>
      </div>
    );
  }
  const insights = safeArray(digest?.insights);
  return (
    <div className="briefing-card">
      <div className="briefing-card-head">
        <Icon name="sparkles" size={13} style={{ color: "var(--accent)" }} />
        <span className="briefing-card-title">今日总结</span>
        <span className="briefing-card-date">{today}</span>
        <Btn size="sm" variant="ghost" icon="sync" disabled={loading} onClick={() => loadDigest({ force: true })} />
      </div>
      <div className="briefing-card-body">
        {loading && !digest ? (
          <div className="briefing-empty">
            <Icon name="sparkles" size={16} style={{ color: "var(--accent)" }} />
            <div className="briefing-empty-text">正在分析真实信息流...</div>
          </div>
        ) : error ? (
          <div className="briefing-empty">
            <div className="briefing-empty-text">{error}</div>
            <Btn size="sm" variant="ghost" icon="sync" onClick={() => loadDigest({ force: true })}>重试</Btn>
          </div>
        ) : insights.length ? (
          <>
            {digest?.summary && <div className="briefing-summary">{digest.summary}</div>}
            {insights.map((item, index) => <InsightItem key={item.id || index} item={item} />)}
            <div className="briefing-footnote">
              {digest?.cached ? "今日缓存" : "AI 分析"} · 基于最近 {digest?.item_count || 0} 条真实信息流
            </div>
          </>
        ) : (
          <div className="briefing-empty">
            <div className="briefing-empty-text">{digest?.summary || "今天还没有可用于总结的信息流。"}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function InsightItem({ item }) {
  const meta = {
    launch: { label: "新品动态" },
    trend: { label: "趋势" },
    funding: { label: "融资" },
    policy: { label: "政策" },
    unknown_signal: { label: "陌生信号" },
  }[item.kind] || { label: "陌生信号" };
  return (
    <div className={`insight-item${item.kind === "unknown_signal" ? " insight-item--unknown" : ""}`}>
      <div className="insight-item-head">
        <span className={`insight-kind insight-kind--${item.kind}`}>{meta.label}</span>
        {item.sourceCount > 0 && <span className="insight-source-count">{item.sourceCount} 条来源</span>}
      </div>
      <div className="insight-headline">{item.headline}</div>
      {item.connection && (
        <div className="insight-connection">
          <Icon name="link" size={11} />
          <span>{item.connection}</span>
        </div>
      )}
      <div className="insight-actions">
        <Btn size="sm" variant="ghost" icon="plus">加入调研工坊</Btn>
        <Btn size="sm" variant="ghost" icon="x">忽略</Btn>
      </div>
    </div>
  );
}

function NewsScreen({ data, api, refreshData, navTarget }) {
  const [tab, setTab] = useState("official");
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState(data.newsCounts || { all: 0, official: 0, wechat: 0, trend: 0, starred: 0 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [sourceModalTarget, setSourceModalTarget] = useState(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const loadMoreRef = useRef(null);
  const initialBatchSize = 18;
  const [visibleCount, setVisibleCount] = useState(initialBatchSize);
  const hasLlm = Boolean(data.settings?.llm_configured);
  const [sidebarWidth, setSidebarWidth] = useState(hasLlm ? 300 : 260);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  const onResizerMouseDown = (e) => {
    e.preventDefault();
    draggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent) => {
      if (!draggingRef.current) return;
      const delta = moveEvent.clientX - dragStartXRef.current;
      const next = Math.min(480, Math.max(220, dragStartWidthRef.current + delta));
      setSidebarWidth(next);
    };
    const onMouseUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  useEffect(() => {
    setCounts(data.newsCounts || { all: 0, official: data.newsCounts?.all || 0, wechat: 0, trend: 0, starred: 0 });
    if (!api) {
      const groups = buildNewsGroups(data.news, data.settings?.tag_groups);
      setItems(groups);
      setCounts(newsGroupCounts(groups));
    }
  }, [api, data.news, data.newsCounts, data.settings?.tag_groups]);

  const visibleItems = items.slice(0, visibleCount);
  const grouped = visibleItems.reduce((acc, n) => {
    (acc[n.date] = acc[n.date] || []).push(n);return acc;
  }, {});
  const dates = Object.keys(grouped);
  const hasMore = visibleCount < items.length;

  const toggleStar = async (id) => {
    const item = items.find((n) => n.id === id);
    const targetId = item?.primaryId || item?.id || id;
    const next = items.map((n) => n.id === id ? { ...n, starred: !n.starred, sourceItems: safeArray(n.sourceItems).map((sourceItem, index) => index === 0 ? { ...sourceItem, starred: !n.starred } : sourceItem) } : n);
    setItems(next);
    if (api && item) {
      await api(`/api/news/${targetId}`, { method: "PATCH", body: JSON.stringify({ starred: !item.starred }) });
      await refreshData?.();
    }
  };

  const openOriginal = (item) => {
    const url = item?.original_url || item?.url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const openNews = async (item) => {
    if (item?.isNewsGroup && item.sourceCount > 1) {
      setSourceModalTarget(item);
      return;
    }
    if (api && item.unread) {
      setItems((current) => current.map((n) => n.id === item.id ? { ...n, unread: false } : n));
      await api(`/api/news/${item.id}`, { method: "PATCH", body: JSON.stringify({ unread: false }) });
      await refreshData?.();
    }
    openOriginal(item);
  };

  const collect = async () => {
    setBusy(true);setNotice("");
    try {
      const result = await api("/api/news/collect", { method: "POST" });
      setNotice(`采集完成：新增 ${result.inserted || 0} 条，更新 ${result.updated || 0} 条${result.errors?.length ? `，失败 ${result.errors.length} 个源` : ""}`);
      await refreshData?.();
      await loadNews(tab);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };

  const processLlm = async () => {
    setBusy(true);setNotice("");
    try {
      const result = await api("/api/news/process-llm", { method: "POST", body: JSON.stringify({ limit: 20 }) });
      const errorText = result.errors?.length ? `；失败 ${result.failed || 0} 条：${result.errors.map((item) => item.message).join(" / ")}` : "";
      setNotice(`LLM 处理完成：处理 ${result.processed || 0} 条，保留 ${result.kept || 0} 条，过滤 ${result.filtered || 0} 条，剩余 ${result.remaining || 0} 条${errorText}`);
      await refreshData?.();
      await loadNews(tab);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };

  const loadNews = async (nextTab = tab) => {
    if (!api) return;
    const params = new URLSearchParams({ page: "1", limit: "100" });
    if (nextTab === "starred") params.set("starred", "1");
    if (nextTab === "official") params.set("source_group", "official");
    const result = await api(`/api/news?${params.toString()}`);
    let groups = buildNewsGroups(result.items || result, data.settings?.tag_groups);
    setItems(groups);
    if (nextTab === "official") setCounts((current) => ({ ...current, ...newsGroupCounts(groups), official: groups.length }));
    if (result.counts) setCounts((current) => ({ ...current, ...result.counts, all: result.counts.all ?? current.all }));
  };

  useEffect(() => {
    loadNews(tab).catch(() => {});
    setVisibleCount(initialBatchSize);
  }, [tab]);

  useEffect(() => {
    if (!navTarget || navTarget.screen !== "news") return;
    setTab("official");
  }, [navTarget]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => items.some((item) => item.id === id)));
  }, [items]);
  useEffect(() => {
    if (!selectMode) setSelectedIds([]);
  }, [selectMode]);

  useEffect(() => {
    if (!hasMore || !loadMoreRef.current) return undefined;
    const root = loadMoreRef.current.closest(".viewport");
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisibleCount((current) => Math.min(current + initialBatchSize, items.length));
    }, {
      root,
      rootMargin: "0px 0px 320px 0px",
      threshold: 0.01,
    });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, items.length]);

  const selectedItems = items.filter((item) => selectedIds.includes(item.id));
  const sampleWorkspace = Boolean(data.onboarding?.sampleWorkspace);
  const liveNewsReady = Boolean(data.onboarding?.liveNewsReady);
  const newsMaxAgeHours = data.onboarding?.newsMaxAgeHours || 72;
  const emptyState = newsEmptyState(tab, sampleWorkspace);
  const toggleSelect = (id) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const deleteOne = async () => {
    if (!api || !deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api(`/api/news/${deleteTarget.id}`, { method: "DELETE" });
      setSelectedIds((current) => current.filter((id) => id !== deleteTarget.id));
      setDeleteTarget(null);
      await refreshData?.();
      await loadNews(tab);
    } finally {
      setDeleteBusy(false);
    }
  };
  const deleteBulk = async () => {
    if (!api || !selectedItems.length) return;
    setDeleteBusy(true);
    try {
      const targetIds = Array.from(new Set(selectedItems.flatMap((item) => safeArray(item.sourceItems).length ? safeArray(item.sourceItems).map((sourceItem) => sourceItem.id) : [item.id])));
      await Promise.all(targetIds.map((id) => api(`/api/news/${id}`, { method: "DELETE" })));
      setSelectedIds([]);
      setShowBulkDeleteConfirm(false);
      await refreshData?.();
      await loadNews(tab);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <div className="news-layout">
        <div className="news-sidebar" style={{ width: sidebarWidth }}>
          <DailyDigestCard data={data} api={api} />
        </div>

        <div className="news-sidebar-resizer" onMouseDown={onResizerMouseDown}>
          <div className="news-sidebar-resizer-dots" />
        </div>

        <div className="news-feed-col">
          <div className="news-tabs">
            {[
            ["official", "官方 RSS", counts.official ?? counts.all],
            ["starred", "已收藏", counts.starred]].
            map(([k, label, count]) =>
            <div key={k} className={`news-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
                {label} <span style={{ color: "var(--text-4)", marginLeft: 4 }}>{count}</span>
              </div>
            )}
            <div className="page-actions news-page-actions">
              {selectMode ?
              <>
                  <Btn size="sm" variant="ghost" icon="trash" disabled={!selectedIds.length} onClick={() => setShowBulkDeleteConfirm(true)}>批量删除</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setSelectMode(false)}>取消选择</Btn>
                  <span className="muted text-sm">{selectedIds.length} 条已选择</span>
                </> :
              <Btn size="sm" variant="ghost" className="select-trigger" onClick={() => setSelectMode(true)}>选择</Btn>
              }
              <Btn size="sm" variant="ghost" icon="filter">筛选</Btn>
              <Btn size="sm" variant="ghost" icon="sparkles" onClick={processLlm} disabled={busy}>{busy ? "处理中..." : "LLM处理"}</Btn>
            </div>
          </div>

          <div className="viewport">
            <div className="page page-fluid page-narrow news-feed-page" style={{ paddingTop: 8 }}>
              {notice && <div className="ai-block" style={{ marginBottom: 12 }}>{notice}</div>}
              {sampleWorkspace && tab !== "starred" && (
                <div className="live-sample-note">
                  <div className="live-sample-note-main">
                    <Icon name="rss" size={15} />
                    <span>
                      {liveNewsReady
                        ? `News 只展示最近 ${Math.round(newsMaxAgeHours / 24)} 天内保存的内容。`
                        : "等待 Chrome 插件保存内容。"}
                    </span>
                  </div>
                </div>
              )}
              {dates.length === 0 &&
                <EmptyState
                  icon="newspaper"
                  title={emptyState.title}>
                  {emptyState.body}
                </EmptyState>
              }
              {dates.map((d) =>
                <div key={d}>
                  <div className="news-day">{formatDate(d)}</div>
                  {grouped[d].map((n) => {
                    const isWechat = isWechatNewsItem(n);
                    const primaryTag = newsPrimaryTag(n);
                    const brand = !isWechat && !isGoogleNewsItem(n) ? guessBrand(n) : "";
                    const secondaryTag = sameMetaLabel(primaryTag, brand) ? "" : brand;
                    const sourceTone = isWechat ? "outline" : (isGoogleNewsItem(n) ? "accent" : "outline");
                    return (
                <div
                  className={`news-card ${n.sourceCount > 1 ? "grouped" : ""} ${n.unread ? "unread" : ""}`}
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  style={{ "--source-count": Math.min(Number(n.sourceCount || 1), 8) }}
                  onClick={() => openNews(n)}
                  onKeyDown={(e) => { if (e.key === "Enter") openNews(n); }}>
                      <NewsThumb item={n} />
                      {selectMode && <label className="news-card-select" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.includes(n.id)} onChange={() => toggleSelect(n.id)} />
                      </label>}
                      <div className="news-body">
                        <a
                          className="news-title"
                          href={n.original_url || n.url || "#"}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {n.titleZh}
                        </a>
                        <div className="news-summary">{n.summary}</div>
                        <div className="news-meta">
                          <Tag tone={sourceTone}>{primaryTag}</Tag>
                          {secondaryTag ? <Tag tone="outline">{secondaryTag}</Tag> : null}
                          {n.sourceCount > 1 ? <span className="news-source-pill">{n.sourceCount} 个来源</span> : null}
                          <span>{formatRelativeTime(n.published_at)}</span>
                        </div>
                      </div>
                      <div className="news-actions">
                        <Btn size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); toggleStar(n.id); }}
                    icon={n.starred ? "star-fill" : "star"}
                    style={{ color: n.starred ? "var(--warn)" : undefined }} />
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
              {hasMore ? (
                <div ref={loadMoreRef} className="news-load-more">
                  向下滚动，继续加载更多资讯
                </div>
              ) : items.length > initialBatchSize ? (
                <div className="news-load-more done">
                  已展示全部 {items.length} 条资讯
                </div>
              ) : null}
            </div>
          </div>
        </div>

      </div>
      {deleteTarget && <DeleteItemsConfirmModal entityLabel="资讯" items={[deleteTarget]} busy={deleteBusy} onClose={() => !deleteBusy && setDeleteTarget(null)} onConfirm={deleteOne} />}
      {sourceModalTarget && <NewsSourceModal group={sourceModalTarget} onClose={() => setSourceModalTarget(null)} onOpen={openOriginal} />}
      {showBulkDeleteConfirm && <DeleteItemsConfirmModal entityLabel="资讯" items={selectedItems} busy={deleteBusy} onClose={() => !deleteBusy && setShowBulkDeleteConfirm(false)} onConfirm={deleteBulk} />}
    </>);

}
window.NewsScreen = NewsScreen;

function NewsSourceModal({ group, onClose, onOpen }) {
  const sources = safeArray(group?.sourceItems).length ? safeArray(group.sourceItems) : [group].filter(Boolean);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal news-source-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="newspaper" size={16} style={{ color: "var(--accent)" }} />
          <h3>{group?.titleZh || group?.original_title || "同一事件来源"}</h3>
          <Btn variant="ghost" icon="x" onClick={onClose} />
        </div>
        <div className="modal-body">
          <div className="news-source-modal-summary">
            <NewsThumb item={group} />
            <div>
              <div className="news-source-modal-kicker">已合并 {sources.length} 条相近资讯</div>
              <div className="news-source-modal-text">{group?.summary || group?.contentZh || "这些来源被折叠为同一事件，展开后可逐条查看原文。"}</div>
            </div>
          </div>
          <div className="news-source-list">
            {sources.map((item, index) =>
              <button className="news-source-row" type="button" key={item.id || `${item.original_url}-${index}`} onClick={() => onOpen?.(item)}>
                <div className="news-source-row-index">{index + 1}</div>
                <div className="news-source-row-main">
                  <div className="news-source-row-title">{item.titleZh || item.original_title}</div>
                  <div className="news-source-row-meta">
                    <span>{item.source || newsSourceHost(item) || "未知来源"}</span>
                    {newsSourceHost(item) ? <span>{newsSourceHost(item)}</span> : null}
                    <span>{formatRelativeTime(item.published_at)}</span>
                  </div>
                </div>
                <Icon name="external" size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewsThumb({ item }) {
  const [failed, setFailed] = useState(false);
  const image = item.thumbnail_url || item.image || "";
  // Derive a deterministic hue from item id/title so the placeholder is stable
  const fallbackHue = typeof item.thumbHue === "number"
    ? item.thumbHue
    : Math.abs((item.id || item.title || "x").split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % 360;
  const label = item.type === "新品发布" ? "PRODUCT IMG" : "TREND IMG";
  return (
    <div className="news-thumb">
      {image && !failed ?
        <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> :
        <DemandThumb hue={fallbackHue} label={label} />
      }
    </div>
  );
}

function formatDate(d) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);
  if (d === today) return "今天 · " + d.replace(/-/g, "/");
  if (d === yesterday) return "昨天 · " + d.replace(/-/g, "/");
  return String(d || "").replace(/-/g, "/");
}

function formatRelativeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${Math.max(1, diffMinutes)}分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}天前`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}个月前`;
  return `${Math.floor(diffMonths / 12)}年前`;
}

const SERP_ENGINE_OPTIONS = [
  ["google", "Google Web"],
  ["google_news", "Google News"],
  ["google_scholar", "Google Scholar"],
  ["google_patents", "Google Patents"],
  ["bing", "Bing"],
  ["duckduckgo", "DuckDuckGo"],
  ["google_images", "Google Images"],
  ["google_videos", "Google Videos"],
  ["youtube", "YouTube"],
];

// ============ PRODUCTS ============
// Image upload slot for product (compact)
function ProductImageSlot({ product, onChange }) {
  const [failed, setFailed] = useState(false);
  const inputRef = React.useRef(null);
  const image = product?.image || product?.thumbnail_url || "";
  const onPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  };
  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="product-image-slot"
      title="点击上传产品图">
      
      {image && !failed ?
      <img src={image} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> :

      <span style={{ fontSize: 16 }}>{product?.emoji || "📦"}</span>
      }
      <span className="product-image-slot-overlay"><Icon name="plus" size={11} /></span>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPick} />
    </div>);

}

function ProductThumb({ product, size = 36, fontSize = 18 }) {
  const [failed, setFailed] = useState(false);
  const image = product?.thumbnail_url || product?.image || product?.cover_image_url || "";
  return (
    <div className="products-thumb" style={{ width: size, height: size, fontSize }}>
      {image && !failed ?
        <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> :
        <span>{product?.emoji || "📦"}</span>
      }
    </div>
  );
}

// Compact text-input metric for platform card
function PlatformInput({ label, value, onChange, prefix, suffix, inputMode = "text" }) {
  const displayValue = normalizeMetricValue(value, prefix);
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-input-wrap">
        {prefix && <span className="metric-prefix">{prefix}</span>}
        <input
          className="metric-input"
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder="—"
          inputMode={inputMode} />
        {suffix && <span className="metric-suffix">{suffix}</span>}
      </div>
    </div>);

}

function ProductPlatformCard({ platform, index, onUpdate, onRemove }) {
  const url = platform.url || platform.source_url || "";
  const platformKey = normalizePlatformKey(platform.platform, url) || platform.platform || "unknown";
  const fields = platformMetricConfig(platformKey);
  const platformValue = (field) => {
    if (platformKey === "taobao" && field.key === "discount_price") {
      return platform.discount_price || platform.price || "";
    }
    if (platformKey === "taobao" && field.key === "sales") {
      return normalizeMonthlySales(platform.sales || platform.monthly_sales);
    }
    return field.key === "sales" ? normalizeMonthlySales(platform[field.key]) : platform[field.key];
  };
  return (
    <div className="platform-card">
      <div className="platform-card-head">
        <span className={`platform-pill ${platformClass(platformKey)}`}>{platformLabel(platformKey)}</span>
        {url ?
          <a className="platform-card-link" href={externalHref(url)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title={url}>
            打开链接
            <Icon name="external" size={12} />
          </a> :
          <span className="platform-card-link">{platformLabel(platformKey)}</span>
        }
        <button className="icon-btn" type="button" title="删除平台" onClick={() => onRemove?.(index)}>
          <Icon name="x" size={11} />
        </button>
      </div>
      <div className="platform-url-row">
        <Icon name="link" size={11} />
        <input
          className="ghost-input mono"
          value={url}
          onChange={(event) => {
            const nextUrl = event.target.value;
            const nextPlatform = normalizePlatformKey(platform.platform, nextUrl) || platformKey;
            onUpdate(index, { url: nextUrl, platform: nextPlatform });
          }}
          placeholder={`${platformLabel(platformKey)} 链接`}
        />
      </div>
      <div className={`platform-card-grid ${platformKey === "taobao" ? "compact" : ""}`}>
        {fields.map((field) =>
          <PlatformInput
            key={field.key}
            label={field.label}
            value={platformValue(field)}
            prefix={field.prefix === "★" ? <span className="rating-star" style={{ fontSize: 11 }}>★</span> : field.prefix}
            suffix={field.suffix}
            inputMode={field.inputMode}
            onChange={(value) => onUpdate(index, { [field.key]: value })}
          />
        )}
      </div>
    </div>
  );
}

function AddPlatformControl({ existingPlatforms, onAdd }) {
  const existingKeys = safeArray(existingPlatforms).map((item) => normalizePlatformKey(item.platform, item.url || item.source_url || ""));
  const available = SUPPORTED_PRODUCT_PLATFORMS.filter((platform) => !existingKeys.includes(platform));
  const [platform, setPlatform] = useState(available[0] || SUPPORTED_PRODUCT_PLATFORMS[0]);
  useEffect(() => {
    if (!available.length) return;
    if (!available.includes(platform)) setPlatform(available[0]);
  }, [available.join("|"), platform]);
  if (!available.length) return null;
  return (
    <div className="add-platform-control">
      <select className="input sm" value={platform} onChange={(event) => setPlatform(event.target.value)}>
        {available.map((item) => <option key={item} value={item}>{platformLabel(item)}</option>)}
      </select>
      <Btn size="sm" variant="ghost" icon="plus" onClick={() => onAdd?.(platform)}>添加平台</Btn>
    </div>
  );
}

// Bullet-point list editor (multi-dim-table style, top-down rows)
function BulletListEditor({ items, onChange, tone = "default", placeholder = "添加一项" }) {
  const [draft, setDraft] = useState("");
  const dotColor = tone === "danger" ? "var(--danger)" : tone === "success" ? "var(--success)" : "var(--accent)";
  const update = (i, v) => onChange(items.map((t, idx) => idx === i ? v : t));
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div style={{ borderRadius: 8, overflow: "hidden", background: "var(--surface-2)" }}>
      {items.map((t, i) =>
      <div key={i} className="bullet-row" style={{ display: "grid", gridTemplateColumns: "12px minmax(0, 1fr) auto", alignItems: "center", columnGap: 4, padding: "6px 8px 6px 8px", borderBottom: "1px solid var(--border-soft)", fontSize: 12.5 }}>
          <span style={{ color: "var(--text-3)", fontSize: 11, fontVariantNumeric: "tabular-nums", width: 12, textAlign: "left", flexShrink: 0 }}>{i + 1}</span>
          <input
          value={t}
          onChange={(e) => update(i, e.target.value)}
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--text-1)", fontSize: 12.5, padding: "2px 0", fontFamily: "inherit" }} />
        
          <div className="bullet-actions" style={{ display: "flex", gap: 2, opacity: 0, transition: "opacity .12s" }}>
            <button className="icon-btn" onClick={() => move(i, -1)} title="上移" style={{ width: 20, height: 20 }}><Icon name="chevron-up" size={11} /></button>
            <button className="icon-btn" onClick={() => move(i, 1)} title="下移" style={{ width: 20, height: 20 }}><Icon name="chevron-down" size={11} /></button>
            <button className="icon-btn" onClick={() => remove(i)} title="删除" style={{ width: 20, height: 20 }}><Icon name="x" size={11} /></button>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "12px minmax(0, 1fr) auto", alignItems: "center", columnGap: 4, padding: "6px 8px 6px 8px" }}>
        <span style={{ color: "var(--text-4)", fontSize: 11, width: 12, textAlign: "left", flexShrink: 0 }}>{items.length + 1}</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {if (e.key === "Enter") {e.preventDefault();add();}}}
          placeholder={placeholder}
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--text-1)", fontSize: 12.5, padding: "2px 0", fontFamily: "inherit" }} />
        
        {draft &&
        <button className="btn xs ghost" onClick={add} style={{ height: 20, padding: "0 6px", fontSize: 11 }}>添加</button>
        }
      </div>
    </div>);

}

function ProductsScreen({ data, api, refreshData, detailCollapsed, setDetailCollapsed }) {
  const [products, setProducts] = useState(safeArray(data.products));
  const [notice, setNotice] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  useEffect(() => setProducts(safeArray(data.products)), [data.products]);
  const updateSelected = async (patch) => {
    setProducts((ps) => ps.map((p) => p.id === selectedId ? { ...p, ...patch, tag_values: { ...(p.tag_values || {}), ...(patch.tag_values || {}) } } : p));
    if (api && selectedId) {
      const nextPatch = patch.image !== undefined ? { ...patch, image_override: "manual" } : patch;
      await api(`/api/products/${selectedId}`, { method: "PATCH", body: JSON.stringify(nextPatch) });
      await refreshData?.();
    }
  };
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [viewMode, setViewMode] = useState("card");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [priceCcy, setPriceCcy] = useState("native"); // unused (toggle removed)
  const [addFieldOpen, setAddFieldOpen] = useState(false);

  useEffect(() => {
    if (selectMode) return;
    if (!products.some((p) => p.id === selectedId)) {
      setSelectedId(null);
    }
  }, [products, selectedId, selectMode]);
  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => products.some((item) => item.id === id)));
  }, [products]);
  useEffect(() => {
    if (!selectMode) setSelectedIds([]);
  }, [selectMode]);

  const categories = ["全部", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];
  const filtered = products.filter((p) =>
  (categoryFilter === "全部" || p.category === categoryFilter) && (
  !query || String(p.name || "").toLowerCase().includes(query.toLowerCase()))
  );
  const pageSize = 12;
  const paged = paginate(filtered, page, pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const selected = products.find((p) => p.id === selectedId);
  const selectedProducts = products.filter((item) => selectedIds.includes(item.id));
  const updateSelectedPlatforms = (nextPlatforms) => updateSelected({ platforms: nextPlatforms });
  const updateSelectedPlatform = (index, patch) => {
    const normalizedPatch = patch.discount_price !== undefined ? { ...patch, price: patch.discount_price } : patch;
    const next = safeArray(selected?.platforms).map((platform, idx) => idx === index ? { ...platform, ...normalizedPatch } : platform);
    updateSelectedPlatforms(next);
  };
  const removeSelectedPlatform = (index) => {
    updateSelectedPlatforms(safeArray(selected?.platforms).filter((_, idx) => idx !== index));
  };
  const addSelectedPlatform = (platform) => {
    updateSelectedPlatforms([...safeArray(selected?.platforms), createEmptyPlatform(platform)]);
  };

  useEffect(() => {
    setPage(1);
  }, [query, categoryFilter]);

  useEffect(() => {
    setPage((current) => clampPage(current, Math.ceil(filtered.length / pageSize)));
  }, [filtered.length]);

  const syncProducts = async () => {
    setNotice("飞书同步中...");
    try {
      await api("/api/sync/feishu", { method: "POST", body: JSON.stringify({ kinds: ["products"] }) });
      await refreshData?.();
      setNotice("竞品库已同步到飞书。");
    } catch (error) {
      setNotice(error.message);
    }
  };
  const createTagOption = async (groupKey, value) => {
    const cleanValue = String(value || "").trim();
    if (!api || !cleanValue) return;
    await api(`/api/fields/${encodeURIComponent(groupKey)}/options`, { method: "POST", body: JSON.stringify({ value: cleanValue }) });
    await refreshData?.();
  };
  const productFields = normalizeFields(data.settings?.fields, data.settings?.tag_groups, { includeDefaults: true });
  const toggleSelect = (id) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const deleteOne = async () => {
    if (!api || !deleteTarget) return;
    setDeleteBusy(true);
    setNotice("");
    try {
      await api(`/api/products/${deleteTarget.id}`, { method: "DELETE" });
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setSelectedIds((current) => current.filter((id) => id !== deleteTarget.id));
      setDeleteTarget(null);
      await refreshData?.();
      setNotice(`已删除竞品：${deleteTarget.name || "未命名竞品"}`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setDeleteBusy(false);
    }
  };
  const deleteBulk = async () => {
    if (!api || !selectedProducts.length) return;
    setDeleteBusy(true);
    setNotice("");
    try {
      await Promise.all(selectedProducts.map((item) => api(`/api/products/${item.id}`, { method: "DELETE" })));
      if (selectedProducts.some((item) => item.id === selectedId)) setSelectedId(null);
      setSelectedIds([]);
      setShowBulkDeleteConfirm(false);
      await refreshData?.();
      setNotice(`已删除 ${selectedProducts.length} 条竞品`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="viewport">
      <div className="page page-fluid page-wide">
        <header className="page-head">
          <div className="page-head-left">
            <div className="screen-icon-box"><Icon name="boxes" size={20} /></div>
            <div>
              <h1 className="h1" style={{ marginBottom: 2 }}>竞品库</h1>
              <div className="muted text-sm">汇总主流品类竞品 SKU + 价格/月销/评分指标，AI 自动归类、关联到需求和 PRD。</div>
            </div>
          </div>
          <div className="page-head-actions">
            <Tag tone="outline">{products.length} 条</Tag>
            <Btn size="sm" variant="ghost" icon="sync" onClick={syncProducts}>同步飞书</Btn>
            <Btn size="sm" variant="primary" icon="plus" onClick={() => setShowAdd(true)}>新建竞品</Btn>
          </div>
        </header>

        <div className="products-layout no-detail">
          <div className="products-main">
            <div className="filter-bar">
              <div className="filter-bar-cluster">
                <div className="demand-filter-group" role="group" aria-label="竞品筛选">
                  <div className="demand-filter-label">
                    <Icon name="search" size={13} />
                  </div>
                  <input
                    className="demand-filter-search"
                    placeholder="搜索竞品..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <select className="demand-filter-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                    {categories.map((c) =>
                    <option key={c} value={c}>{c === "全部" ? "全部品类" : c}</option>
                    )}
                  </select>
                </div>
                <div className="demand-view-switch" role="tablist" aria-label="竞品视图">
                  <button type="button" className={viewMode === "card" ? "active" : ""} onClick={() => setViewMode("card")}>卡片</button>
                  <button type="button" className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>列表</button>
                </div>
              </div>
              <div className="filter-bar-meta">
                <span className="demand-match-count">匹配 {filtered.length} / {products.length}</span>
                {filtered.length > 0 && !selectMode && (
                  <Btn size="sm" variant="ghost" className="select-trigger" onClick={() => {
                    setSelectMode(true);
                    setSelectedId(null);
                    setSelectedIds([]);
                    setDetailCollapsed?.(true);
                  }}>批量选择</Btn>
                )}
              </div>
            </div>
        {notice && <div className="ai-block" style={{ margin: "0 12px 10px" }}>{notice}</div>}
        {filtered.length > 0 && selectMode &&
          <div className="bulk-toolbar products-selection-bar" style={{ margin: "0 12px 10px" }}>
                <div className="bulk-left">
                  <Btn size="sm" variant="ghost" onClick={() => { setSelectMode(false); setSelectedIds([]); }}>取消</Btn>
                  <Btn size="sm" variant="ghost" icon="trash" disabled={!selectedIds.length} onClick={() => setShowBulkDeleteConfirm(true)}>删除 {selectedIds.length || ""}</Btn>
                  <span className="muted text-sm">已选 {selectedIds.length} / {paged.items.length}</span>
                </div>
                <label className="bulk-check">
                  <input
                    type="checkbox"
                    checked={paged.items.length > 0 && paged.items.every((item) => selectedIds.includes(item.id))}
                    onChange={(event) => {
                      const visibleIds = paged.items.map((item) => item.id);
                      setSelectedIds(event.target.checked ? Array.from(new Set([...selectedIds, ...visibleIds])) : selectedIds.filter((id) => !visibleIds.includes(id)));
                    }}
                  />
                  <span>全选本页</span>
                </label>
          </div>
        }

        {viewMode === "card" ? (
        <div className="demands-grid" style={{ padding: "0 12px" }}>
          {paged.items.map((p) => {
            const platforms = safeArray(p.platforms);
            const main = platforms[0] || {};
            const platformKey = normalizePlatformKey(main.platform || p.platform || p.source, main.url || p.source_url || "") || "unknown";
            const mainPrice = platformKey === "taobao" ? (main.discount_price || main.price) : main.price;
            const mainSales = normalizeMonthlySales(main.sales || main.monthly_sales);
            return (
              <div
                className={`demand-card ${selectMode && selectedIds.includes(p.id) ? "is-selected" : ""}`}
                key={p.id}
                onClick={() => {
                  if (selectMode) toggleSelect(p.id);
                  else { setSelectedId(p.id); setDetailCollapsed?.(false); }
                }}
                style={{ cursor: "pointer" }}
              >
                <div className="demand-thumb">
                  {selectMode && <label className="demand-card-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelect(p.id)}
                    />
                  </label>}
                  <ProductThumb product={p} size="100%" fontSize={28} />
                  <div className="platform-badge">
                    <Icon name="boxes" size={10} /> {p.category || "未分类"}
                  </div>
                </div>
                <div className="demand-body">
                  <div className="demand-title">{p.name || "未命名竞品"}</div>
                  <div className="demand-summary">
                    {p.ai_summary || safeArray(p.tags).slice(0, 4).join(" · ") || "暂无摘要"}
                  </div>
                  <div className="demand-tags">
                    {platforms.slice(0, 3).map((pl, i) => {
                      const key = normalizePlatformKey(pl.platform, pl.url || pl.source_url || "");
                      return (
                      <span key={i} className={`platform-pill ${PLATFORM_KEY[key] || ""}`}>
                        {PLATFORM_ICON[key] || PLATFORM_LABEL[key] || pl.platform}
                      </span>
                      );
                    })}
                    {platforms.length === 0 && <Tag tone="outline">{platformLabel(platformKey)}</Tag>}
                    {p.status && <Tag tone={p.status === "跟踪中" ? "success" : p.status === "已归档" ? "outline" : "accent"}>{p.status}</Tag>}
                  </div>
                  <div className="demand-foot">
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{platformKey === "taobao" ? "折扣价" : "价格"} {mainPrice || "—"}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>评分 {main.rating ?? "—"}</span>
                    <span>{platformKey === "taobao" ? "已售" : "月销"} {mainSales || "—"}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 &&
            <div style={{ gridColumn: "1 / -1" }}>
              <EmptyState
                icon="boxes"
                title={products.length ? "没有匹配的竞品" : "还没有真实竞品"}>
                请使用 Chrome 插件采集。
              </EmptyState>
            </div>
          }
        </div>
        ) : (
        <div className="products-table-wrap">
          <table className="products-table">
            <thead>
              <tr>
                {selectMode && <th style={{ width: 34 }} />}
                <th>商品名称</th><th>品类</th><th>平台</th><th>售价</th><th>参考成本</th><th>评分</th><th>月销估算</th><th>状态</th><th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {paged.items.map((p) => {
                const platforms = safeArray(p.platforms);
                const main = platforms[0] || {};
                const platformKey = normalizePlatformKey(main.platform || p.platform || p.source, main.url || p.source_url || "") || "unknown";
                const mainPrice = platformKey === "taobao" ? (main.discount_price || main.price) : main.price;
                const mainSales = normalizeMonthlySales(main.sales || main.monthly_sales);
                const reviews = Number(main.reviews);
                return (
                  <tr
                    key={p.id}
                    className={`${selectedId === p.id ? "selected" : ""} ${selectMode && selectedIds.includes(p.id) ? "is-selected" : ""}`}
                    onClick={() => {
                      if (selectMode) toggleSelect(p.id);
                      else { setSelectedId(p.id); setDetailCollapsed?.(false); }
                    }}
                  >
                    {selectMode && <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} />
                    </td>}
                    <td>
                      <div className="product-name">
                        <ProductThumb product={p} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{p.name || "未命名竞品"}</div>
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                            {safeArray(p.tags).slice(0, 3).join(" · ")}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><Tag>{p.category || "未分类"}</Tag></td>
                    <td>
                      <div className="product-platforms">
                        {platforms.map((pl, i) => {
                          const key = normalizePlatformKey(pl.platform, pl.url || pl.source_url || "");
                          return <span key={i} className={`platform-pill ${PLATFORM_KEY[key] || ""}`}>{PLATFORM_ICON[key] || platformLabel(key)}</span>;
                        })}
                        {platforms.length === 0 && <span style={{ color: "var(--text-3)" }}>—</span>}
                      </div>
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{mainPrice || "—"}</td>
                    <td style={{ color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{main.cost || p.cost_estimate || "—"}</td>
                    <td>
                      <span className="rating-cell"><span className="rating-star">★</span>{main.rating ?? "—"}</span>
                      {Number.isFinite(reviews) && <span style={{ color: "var(--text-3)", marginLeft: 6, fontSize: 11 }}>{reviews.toLocaleString()}</span>}
                    </td>
                    <td style={{ color: "var(--text-2)" }}>{mainSales || "—"}</td>
                    <td>
                      <Tag tone={p.status === "跟踪中" ? "success" : p.status === "已归档" ? "default" : "accent"}>{p.status}</Tag>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="row-delete-btn apple-delete-btn" title="删除竞品" onClick={() => setDeleteTarget(p)}>
                        <Icon name="trash" size={13} />
                      </button>
                    </td>
                  </tr>);

              })}
              {filtered.length === 0 &&
                <tr>
                  <td colSpan={selectMode ? 10 : 9}>
                    <EmptyState
                      icon="boxes"
                      title={products.length ? "没有匹配的竞品" : "还没有真实竞品"}>
                      请使用 Chrome 插件采集。
                    </EmptyState>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        )}
        {paged.total > pageSize && (
          <div className={viewMode === "table" ? "products-pagination-shell" : ""}>
            <PaginationBar page={paged.currentPage} total={paged.total} pageSize={pageSize} onPageChange={setPage} label="条竞品" />
          </div>
        )}
      </div>

        </div>

        <Drawer
          open={Boolean(selected) && !detailCollapsed}
          title={selected?.name || "竞品详情"}
          icon="boxes"
          onClose={() => { setDetailCollapsed?.(true); setSelectedId(null); }}
          width={560}
          footer={
            <>
              <Btn
                variant="ghost"
                icon="external"
                disabled={!safeArray(selected?.platforms)[0]?.url}
                onClick={() => {
                  const url = safeArray(selected?.platforms)[0]?.url;
                  if (url) window.open(externalHref(url), "_blank", "noopener,noreferrer");
                }}
              >打开主平台</Btn>
              <Btn variant="primary" icon="sync" onClick={syncProducts}>同步至飞书</Btn>
            </>
          }
        >
          {selected ? (
            <>
              <div className="drawer-product-head">
                <ProductImageSlot product={selected} onChange={(img) => updateSelected({ image: img })} />
                <div className="drawer-product-meta">
                  <div className="drawer-product-status">
                    <span className={`status-dot ${selected.synced_at ? 'published' : 'draft'}`} />
                    {selected.synced_at ? `已同步 ${selected.synced_at}` : "未同步"}
                  </div>
                  <Tag tone="outline">{selected.category || "未分类"}</Tag>
                </div>
                <Btn variant="ghost" icon="trash" onClick={() => setDeleteTarget(selected)} title="删除竞品" />
              </div>

              <div className="drawer-section">
                <div className="drawer-section-label">
                  <Icon name="boxes" size={11} /> 平台信息 · {safeArray(selected.platforms).length} 个
                </div>
                {safeArray(selected.platforms).map((pl, i) =>
                  <ProductPlatformCard
                    key={pl.id || `${pl.platform}-${i}`}
                    platform={pl}
                    index={i}
                    onUpdate={updateSelectedPlatform}
                    onRemove={removeSelectedPlatform}
                  />
                )}
                <AddPlatformControl existingPlatforms={selected.platforms} onAdd={addSelectedPlatform} />
              </div>

              {(() => {
                const fields = productFields;
                const competitorFields = fields.filter((f) => f.entities.includes("competitor") && entityUsesField(selected, f));
                const attachField = async (field) => {
                  await updateSelected(buildFieldPatch(field.key, []));
                };
                return (
                  <div className="drawer-section">
                    <div className="drawer-section-label"><Icon name="tag" size={11} /> 标签字段</div>
                    <div className="detail-inline-grid">
                      {competitorFields.map((field) => (
                        <FieldRow
                          key={field.key}
                          field={field}
                          entity={selected}
                          onSave={updateSelected}
                          onCreateOption={createTagOption}
                        />
                      ))}
                    </div>
                    <div className="detail-add-field-wrap">
                      <button className="add-field-trigger" onClick={() => setAddFieldOpen((v) => !v)}>
                        <Icon name="plus" size={12} /> 添加字段
                      </button>
                      {addFieldOpen && (
                        <AddFieldPopover
                          fields={fields}
                          entityType="competitor"
                          entity={selected}
                          onAttach={attachField}
                          onGoSettings={() => { setAddFieldOpen(false); setNotice("请前往「设置 → 标签与字段」新建字段。"); }}
                          onClose={() => setAddFieldOpen(false)}
                        />
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="drawer-section">
                <div className="drawer-section-label"><Icon name="sparkles" size={11} /> 核心卖点 · AI 总结 + 用户补充</div>
                <DetailFieldCard>
                  <BulletListEditor
                    items={safeArray(selected.selling_points)}
                    onChange={(next) => updateSelected({ selling_points: next })}
                    tone="success"
                    placeholder="输入卖点，回车添加"
                  />
                </DetailFieldCard>
              </div>

              <div className="drawer-section">
                <div className="drawer-section-label"><Icon name="tag" size={11} /> 差评关键词</div>
                <DetailFieldCard>
                  <BulletListEditor
                    items={safeArray(selected.negative_keywords)}
                    onChange={(next) => updateSelected({ negative_keywords: next })}
                    tone="danger"
                    placeholder="输入差评关键词，回车添加"
                  />
                </DetailFieldCard>
              </div>

              <div className="drawer-section">
                <div className="drawer-section-label"><Icon name="sparkles" size={11} /> AI 摘要</div>
                <div className="ai-block">{selected.ai_summary || "暂无 AI 摘要，添加真实链接解析后会自动生成。"}</div>
              </div>
            </>
          ) : null}
        </Drawer>

        {showAdd && <AddProductModal onClose={() => setShowAdd(false)} api={api} refreshData={refreshData} fields={productFields} tagGroups={data.settings?.tag_groups} onCreateTagOption={createTagOption} />}
        {deleteTarget && <DeleteItemsConfirmModal entityLabel="竞品" items={[deleteTarget]} busy={deleteBusy} onClose={() => !deleteBusy && setDeleteTarget(null)} onConfirm={deleteOne} />}
        {showBulkDeleteConfirm && <DeleteItemsConfirmModal entityLabel="竞品" items={selectedProducts} busy={deleteBusy} onClose={() => !deleteBusy && setShowBulkDeleteConfirm(false)} onConfirm={deleteBulk} />}
      </div>
    </div>);

}
window.ProductsScreen = ProductsScreen;

// AddProduct modal with AI parse animation
function AddProductModal({ onClose, api, refreshData, fields = [], tagGroups = [], onCreateTagOption }) {
  const [step, setStep] = useState("input"); // input | parsing | preview
  const [progress, setProgress] = useState(0);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [addFieldOpen, setAddFieldOpen] = useState(false);

  const platforms = SUPPORTED_PRODUCT_PLATFORMS;
  const [platform, setPlatform] = useState("amazon");
  const normalizedFields = normalizeFields(fields, tagGroups, { includeDefaults: true });
  const previewPlatforms = safeArray(preview?.platforms).length
    ? safeArray(preview.platforms)
    : [{ ...createEmptyPlatform(preview?.platform || platform), url }];
  const updatePreview = (patch) => setPreview((current) => mergeEntityPatch(current || {}, patch));
  const updatePreviewPlatform = (index, patch) => {
    setPreview((current) => {
      const currentPlatforms = safeArray(current?.platforms).length
        ? safeArray(current.platforms)
        : [{ ...createEmptyPlatform(current?.platform || platform), url }];
      const normalizedPatch = patch.discount_price !== undefined ? { ...patch, price: patch.discount_price } : patch;
      return {
        ...(current || {}),
        platforms: currentPlatforms.map((item, idx) => idx === index ? { ...item, ...normalizedPatch } : item),
      };
    });
  };
  const removePreviewPlatform = (index) => {
    setPreview((current) => ({
      ...(current || {}),
      platforms: safeArray(current?.platforms).filter((_, idx) => idx !== index),
    }));
  };
  const addPreviewPlatform = (nextPlatform) => {
    setPreview((current) => ({
      ...(current || {}),
      platforms: [...safeArray(current?.platforms), createEmptyPlatform(nextPlatform)],
    }));
  };

  const startParse = async () => {
    setStep("parsing");setProgress(0);setError("");
    const tick = () => {
      setProgress((p) => {
        if (p >= 2) return p;
        setTimeout(tick, 700);
        return p + 1;
      });
    };
    setTimeout(tick, 500);
    try {
      const result = await api("/api/products/parse-url", {
        method: "POST",
        body: JSON.stringify({ url, platform }),
      });
      const resultPlatforms = safeArray(result?.platforms);
      const parsedPlatform = normalizePlatformKey(result?.platform || platform, url) || platform;
      setPreview({
        ...result,
        platform: parsedPlatform,
        source_url: url,
        platforms: resultPlatforms.length
          ? resultPlatforms.map((item, index) => ({
            ...createEmptyPlatform(normalizePlatformKey(item.platform || parsedPlatform, item.url || url) || parsedPlatform),
            ...item,
            platform: normalizePlatformKey(item.platform || parsedPlatform, item.url || url) || parsedPlatform,
            url: item.url || url,
            id: item.id || `${normalizePlatformKey(item.platform || parsedPlatform, item.url || url) || parsedPlatform}-${index}`,
          }))
          : [{ ...createEmptyPlatform(parsedPlatform), url }],
      });
      setProgress(3);
      setStep("preview");
    } catch (err) {
      setError(err.message);
      setStep("input");
    }
  };

  const steps = [
  { label: "Playwright 打开页面", detail: "headless Chromium · 30s 超时" },
  { label: "提取页面 HTML", detail: "去除导航与广告" },
  { label: "AI 结构化解析", detail: "MiniMax-Text-01 · response_format: json" },
  { label: "构建预览", detail: "" }];


  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="plus" size={16} />
          <h3>添加竞品</h3>
          <Btn variant="ghost" icon="x" onClick={onClose} />
        </div>

        <div className="modal-body">
          {step === "input" &&
          <div className="col" style={{ gap: 14 }}>
              <div>
                <label className="field-label">选择平台</label>
                <div style={{ display: "flex", gap: 4 }}>
                  {platforms.map((p) =>
                <button key={p} onClick={() => setPlatform(p)}
                className={`btn sm ${platform === p ? "primary" : ""}`}>
                      {PLATFORM_LABEL[p]}
                    </button>
                )}
                </div>
              </div>
              <div>
                <label className="field-label">商品链接</label>
                <input className="input lg" style={{ width: "100%" }}
              placeholder="粘贴 Amazon / 淘宝 / Kickstarter 商品链接..."
              value={url} onChange={(e) => setUrl(e.target.value)} />
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
                  AI 会自动提取商品名、价格、首图与卖点。品牌和品类由 AI 整理后填充。
                </div>
                {error && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{error}</div>}
              </div>
            </div>
          }

          {step === "parsing" &&
          <div className="ai-parse">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12.5 }}>
                <Icon name="sparkles" size={14} style={{ color: "var(--accent)" }} />
                <span style={{ fontWeight: 600 }}>AI 正在解析商品信息</span>
                <span style={{ marginLeft: "auto", color: "var(--text-3)" }}>~12s</span>
              </div>
              {steps.map((s, i) =>
            <div key={i} className={`ai-step ${i < progress ? "done" : i === progress ? "active" : ""}`}>
                  <span className="dot">{i < progress && <Icon name="check" size={11} />}</span>
                  <div>
                    <div>{s.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-4)" }}>{s.detail}</div>
                  </div>
                </div>
            )}
            </div>
          }

          {step === "preview" &&
          <div className="col" style={{ gap: 14 }}>
              <div className="source-capture-card product-capture-card">
                <div style={{ width: 96, height: 96 }}>
                  <ProductThumb product={preview} size={96} fontSize={28} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label className="field-label">商品名称</label>
                  <input
                    className="ghost-input cl-detail-title-input"
                    value={preview?.name || ""}
                    placeholder="填入商品名"
                    onChange={(event) => updatePreview({ name: event.target.value })}
                    style={{ width: "100%", fontSize: 14, fontWeight: 650 }}
                  />
                  <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-3)" }}>
                    <Icon name="sparkles" size={11} /> AI 建议已填入，可在保存前逐项修改
                  </div>
                </div>
              </div>

              <div className="drawer-section">
                <div className="drawer-section-label"><Icon name="boxes" size={11} /> 平台信息 · {previewPlatforms.length} 个</div>
                {previewPlatforms.map((pl, i) =>
                  <ProductPlatformCard
                    key={pl.id || `${pl.platform}-${i}`}
                    platform={pl}
                    index={i}
                    onUpdate={updatePreviewPlatform}
                    onRemove={removePreviewPlatform}
                  />
                )}
                <AddPlatformControl existingPlatforms={previewPlatforms} onAdd={addPreviewPlatform} />
              </div>

              <div className="drawer-section">
                <div className="drawer-section-label"><Icon name="tag" size={11} /> 标签字段</div>
                <div className="detail-inline-grid">
                  {normalizedFields.filter((field) => field.entities.includes("competitor") && entityUsesField(preview, field)).map((field) => (
                    <FieldRow
                      key={field.key}
                      field={field}
                      entity={preview}
                      onSave={updatePreview}
                      onCreateOption={onCreateTagOption}
                    />
                  ))}
                </div>
                <div className="detail-add-field-wrap">
                  <button className="add-field-trigger" onClick={() => setAddFieldOpen((v) => !v)}>
                    <Icon name="plus" size={12} /> 添加字段
                  </button>
                  {addFieldOpen && (
                    <AddFieldPopover
                      fields={normalizedFields}
                      entityType="competitor"
                      entity={preview}
                      onAttach={(field) => updatePreview(buildFieldPatch(field.key, []))}
                      onGoSettings={() => setAddFieldOpen(false)}
                      onClose={() => setAddFieldOpen(false)}
                    />
                  )}
                </div>
              </div>

              <div className="drawer-section">
                <div className="drawer-section-label"><Icon name="sparkles" size={11} /> 核心卖点 · AI 总结</div>
                <DetailFieldCard>
                  <BulletListEditor
                    items={safeArray(preview?.selling_points)}
                    onChange={(next) => updatePreview({ selling_points: next })}
                    tone="success"
                    placeholder="输入卖点，回车添加"
                  />
                </DetailFieldCard>
              </div>

              <div className="drawer-section">
                <div className="drawer-section-label"><Icon name="sparkles" size={11} /> AI 摘要</div>
                <textarea
                  className="ghost-input drawer-textarea compact"
                  value={preview?.ai_summary || ""}
                  onChange={(event) => updatePreview({ ai_summary: event.target.value })}
                  placeholder="可补充或修改摘要"
                  style={{ width: "100%", minHeight: 64, fontSize: 12.5, resize: "vertical" }}
                />
              </div>
            </div>
          }
        </div>

        <div className="modal-foot">
          <Btn variant="ghost" onClick={onClose}>取消</Btn>
          {step === "input" && <Btn variant="primary" icon="sparkles" onClick={startParse} disabled={!url}>解析链接</Btn>}
          {step === "preview" && <Btn variant="primary" icon="check" onClick={async () => {
            if (api) {
              await api("/api/products", {
                method: "POST",
                body: JSON.stringify({
                  ...(preview || {}),
                  platform: normalizePlatformKey(preview?.platform || platform, url) || platform,
                  source_url: url,
                  platforms: previewPlatforms.map((item) => ({
                    ...item,
                    platform: normalizePlatformKey(item.platform, item.url || url) || item.platform,
                  })),
                }),
              });
              await refreshData?.();
            }
            onClose();
          }}>确认录入</Btn>}
        </div>
      </div>
    </div>);

}

// ============ DEMANDS ============
function DemandsScreen({ data, api, refreshData, navTarget, onNavigate }) {
  const [demands, setDemands] = useState(safeArray(data.demands));
  useEffect(() => setDemands(safeArray(data.demands)), [data.demands]);
  const [filterScenario, setFilterScenario] = useState("");
  const [filterInnov, setFilterInnov] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [viewMode, setViewMode] = useState("card");
  const [tab, setTab] = useState("voices");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = demands.find((d) => d.id === selectedId);
  const feishuStatus = data.dashboard?.feishu_status || {};
  const feishuConnected = Boolean(feishuStatus.connected || data.settings?.feishu_app_token || data.settings?.feishu_connected || data.workspace?.feishu_app_token);

  const filtered = demands.filter((d) =>
  (!filterScenario || safeArray(d.scenarios).includes(filterScenario)) && (
  !filterInnov || d.innovation === filterInnov)
  );
  const pageSize = 12;
  const paged = paginate(filtered, page, pageSize);
  const allScenarios = ["", ...Array.from(new Set(demands.flatMap((d) => safeArray(d.scenarios))))];
  const allInnov = ["", ...Array.from(new Set(demands.map((d) => d.innovation).filter(Boolean)))];
  const syncDemands = async () => {
    setNotice("飞书同步中...");
    try {
      await api("/api/sync/feishu", { method: "POST", body: JSON.stringify({ kinds: ["demands"] }) });
      await refreshData?.();
      setNotice("需求库已同步到飞书。");
    } catch (error) {
      setNotice(error.message);
    }
  };
  const createTagOption = async (groupKey, value) => {
    const cleanValue = String(value || "").trim();
    if (!api || !cleanValue) return;
    await api(`/api/fields/${encodeURIComponent(groupKey)}/options`, { method: "POST", body: JSON.stringify({ value: cleanValue }) });
    await refreshData?.();
  };
  const demandFields = normalizeFields(data.settings?.fields, data.settings?.tag_groups, { includeDefaults: true });

  const openDeleteConfirm = (demand) => {
    setDeleteTarget(demand);
  };

  useEffect(() => {
    if (!navTarget || navTarget.screen !== "demands") return;
    setSelectedId(navTarget.id || null);
  }, [navTarget]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => demands.some((item) => item.id === id)));
  }, [demands]);
  useEffect(() => {
    setPage(1);
  }, [filterScenario, filterInnov, viewMode]);
  useEffect(() => {
    setPage((current) => clampPage(current, Math.ceil(filtered.length / pageSize)));
  }, [filtered.length]);

  const confirmDelete = async () => {
    if (!api || !deleteTarget) return;
    setDeleteBusy(true);
    setNotice("");
    try {
      await api(`/api/demands/${deleteTarget.id}`, { method: "DELETE" });
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
      await refreshData?.();
      setNotice(`已删除需求：${deleteTarget.title || "未命名需求"}`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const selectedItems = demands.filter((item) => selectedIds.includes(item.id));
  const toggleSelect = (id) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const deleteSelected = async () => {
    if (!api || !selectedItems.length) return;
    setDeleteBusy(true);
    setNotice("");
    try {
      await Promise.all(selectedItems.map((item) => api(`/api/demands/${item.id}`, { method: "DELETE" })));
      if (selectedIds.includes(selectedId)) setSelectedId(null);
      setSelectedIds([]);
      setDeleteTarget(null);
      await refreshData?.();
      setNotice(`已删除 ${selectedItems.length} 条需求`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const hasAnyDemands = demands.length > 0;

  return (
    <div className="viewport">
      <div className="page page-fluid page-wide">
        <header className="page-head">
          <div className="page-head-left">
            <div className="screen-icon-box"><Icon name="bar-chart" size={20} /></div>
            <div>
              <h1 className="h1" style={{ marginBottom: 2 }}>需求库</h1>
              <div className="muted text-sm">
                飞书多维表格镜像 · AI 语义搜索 · 品类分析视图。
              </div>
            </div>
          </div>
          <div className="page-head-actions">
            <Tag tone="outline">{demands.length} 条</Tag>
            <Btn size="sm" variant="ghost" icon="sync" onClick={syncDemands}>同步飞书</Btn>
            <Btn size="sm" variant="primary" icon="plus" onClick={() => setShowAdd(true)}>新建需求</Btn>
          </div>
        </header>

        {notice && (
          <div className="ai-block" style={{
            position: "fixed",
            top: 18,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1100,
            margin: 0,
            minWidth: 220,
            maxWidth: "min(520px, calc(100vw - 32px))",
            boxShadow: "var(--shadow-lg)",
          }}>{notice}</div>
        )}

        <div className="demands-source-banner">
          <Icon name="link" size={12} style={{ color: "var(--text-3)", flexShrink: 0 }} />
          <span className="demands-source-text">
            数据来源：<strong>飞书多维表格</strong>
          </span>
          {feishuConnected ? (
            <Tag tone="success">
              已接入{feishuStatus.last_sync_at ? ` · ${formatRelativeTime(feishuStatus.last_sync_at)}同步` : ""}
            </Tag>
          ) : (
            <Tag tone="outline">未接入</Tag>
          )}
          {!feishuConnected && (
            <button type="button" className="demands-source-cta" onClick={() => onNavigate?.("settings")}>
              配置
            </button>
          )}
        </div>

        <div className="demands-tabs" role="tablist" aria-label="需求库视图">
          {[
            ["voices", "message-circle", "用户声音", demands.length],
            ["requirements", "clipboard", "需求列表"],
            ["analysis", "bar-chart", "品类分析"],
            ["timeline", "calendar", "决策时间线"],
          ].map(([key, icon, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`demands-tab ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              <Icon name={icon} size={12} />
              <span>{label}</span>
              {count != null && <span className="demands-tab-count">{count}</span>}
            </button>
          ))}
        </div>

        {tab === "requirements" && (
          <div className="demands-tab-empty">
            <Icon name="clipboard" size={28} style={{ color: "var(--text-4)" }} />
            <div className="demands-tab-empty-title">需求列表（飞书镜像表）</div>
            <div className="demands-tab-empty-desc">
              接入飞书 Loom 标准模板后，这里会镜像团队需求表，并展示需求名称、品类、负责 PM、当前状态、优先级、周更新、决策状态、决策理由和关联竞品。
            </div>
            <div className="demands-tab-empty-fields">
              <span>需求名称</span>
              <span>品类</span>
              <span>负责 PM</span>
              <span>当前状态</span>
              <span>优先级</span>
              <span>周更新</span>
              <span>决策状态</span>
              <span>决策理由</span>
              <span>关联竞品</span>
            </div>
            {!feishuConnected && (
              <button type="button" className="btn primary" style={{ marginTop: 18 }} onClick={() => onNavigate?.("settings")}>
                去配置飞书
              </button>
            )}
          </div>
        )}

        {tab === "analysis" && (
          <div className="demands-tab-empty">
            <Icon name="bar-chart" size={28} style={{ color: "var(--text-4)" }} />
            <div className="demands-tab-empty-title">品类分析视图</div>
            <div className="demands-tab-empty-desc">
              选定品类后，Loom 会汇总价格带、销量分布、重点需求和用户声音热词。完整分析需要飞书需求和竞品快照同时具备。
            </div>
            <div className="demands-tab-empty-bullets">
              <div>价格带分布（基于竞品快照数据）</div>
              <div>销量分布（电商抓取）</div>
              <div>重点需求 TOP 5（按关联评论数排序）</div>
              <div>用户呼声热词（评论 AI 聚类）</div>
            </div>
          </div>
        )}

        {tab === "timeline" && (
          <div className="demands-tab-empty">
            <Icon name="calendar" size={28} style={{ color: "var(--text-4)" }} />
            <div className="demands-tab-empty-title">决策时间线</div>
            <div className="demands-tab-empty-desc">
              按时间顺序展示每条需求的状态变更与决策事件。AI 会从每周更新文本中抽取立项、暂缓、弃单、重启信号和原因。
            </div>
            <div className="demands-tab-empty-note">
              团队全部动态在这里查看，工作台只显示和当前用户有关的部分。
            </div>
          </div>
        )}

        {tab === "voices" && hasAnyDemands ? (
          <div className="filter-bar">
            <div className="filter-bar-cluster">
              <div className="demand-filter-group" role="group" aria-label="需求筛选">
                <div className="demand-filter-label">
                  <Icon name="filter" size={13} />
                  <span>筛选</span>
                </div>
                <select className="demand-filter-select" value={filterScenario} onChange={(e) => setFilterScenario(e.target.value)}>
                  <option value="">全部场景</option>
                  {allScenarios.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="demand-filter-select" value={filterInnov} onChange={(e) => setFilterInnov(e.target.value)}>
                  <option value="">全部创新类型</option>
                  {allInnov.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="demand-view-switch" role="tablist" aria-label="需求视图">
                <button type="button" className={viewMode === "card" ? "active" : ""} onClick={() => setViewMode("card")}>卡片</button>
                <button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>列表</button>
              </div>
            </div>
            <div className="filter-bar-meta">
              <span className="demand-match-count">匹配 {filtered.length} / {demands.length}</span>
              {filtered.length > 0 && !selectMode && (
                <Btn size="sm" variant="ghost" className="select-trigger" onClick={() => { setSelectMode(true); setSelectedId(null); setSelectedIds([]); }}>批量选择</Btn>
              )}
            </div>
          </div>
        ) : null}

        {tab === "voices" && filtered.length > 0 && selectMode &&
          <div className="bulk-toolbar" style={{
            marginBottom: 12,
            borderRadius: 14,
            background: "color-mix(in srgb, var(--surface) 86%, transparent)",
            boxShadow: "0 10px 30px rgba(0,0,0,.06)",
          }}>
            <div className="bulk-left">
              <Btn size="sm" variant="ghost" onClick={() => { setSelectMode(false); setSelectedIds([]); }}>取消</Btn>
              <Btn size="sm" variant="ghost" icon="trash" disabled={!selectedIds.length} onClick={() => setShowBulkDeleteConfirm(true)}>删除 {selectedIds.length || ""}</Btn>
              <span className="muted text-sm">已选 {selectedIds.length} / {paged.items.length}</span>
            </div>
            <label className="bulk-check">
              <input
                type="checkbox"
                checked={paged.items.length > 0 && paged.items.every((item) => selectedIds.includes(item.id))}
                onChange={(event) => {
                  const visibleIds = paged.items.map((item) => item.id);
                  setSelectedIds(event.target.checked ? Array.from(new Set([...selectedIds, ...visibleIds])) : selectedIds.filter((id) => !visibleIds.includes(id)));
                }}
              />
              <span>全选本页</span>
            </label>
          </div>
        }

        {tab === "voices" && (viewMode === "card" ?
        <div className="demands-grid">
          {paged.items.map((d) =>
          <div
            className={`demand-card ${selectMode && selectedIds.includes(d.id) ? "is-selected" : ""}`}
            key={d.id}
            onClick={() => {
              if (selectMode) toggleSelect(d.id);
              else setSelectedId(d.id);
            }}
            style={{ cursor: "pointer" }}
          >
              <div className="demand-thumb">
                {selectMode && <label className="demand-card-check">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(d.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(d.id)}
                  />
                </label>}
                <DemandImage demand={d} label={d.source.toUpperCase() + " · INSPIRATION"} className="demand-thumb-media" />
                <div className="platform-badge">
                  <Icon name="link" size={10} /> {PLATFORM_LABEL[d.source] || d.source}
                </div>
              </div>
              <div className="demand-body">
                <div className="demand-title">{d.title}</div>
                <div className="demand-summary">{d.summary}</div>
                <div className="demand-tags">
                  <Tag tone="accent">{d.innovation}</Tag>
                  {safeArray(d.scenarios).slice(0, 2).map((s) => <Tag key={s}>#{s.split("/")[0]}</Tag>)}
                  {safeArray(d.painpoints).slice(0, 1).map((p) => <Tag tone="danger" key={p}>{p.split("/")[0]}</Tag>)}
                </div>
                <div className="demand-foot">
                  <span><Icon name="calendar" size={10} /> {d.date}</span>
                  <span className="demand-foot-actions">
                    {demandSourceUrl(d) &&
                      <a
                        className="demand-open-link"
                        href={externalHref(demandSourceUrl(d))}
                        target="_blank"
                        rel="noreferrer"
                        title="打开原始链接"
                        aria-label="打开原始链接"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Icon name="external" size={12} />
                      </a>
                    }
                    <span><Icon name="sparkles" size={10} /> AI 打标</span>
                  </span>
                </div>
              </div>
            </div>
          )}
          {filtered.length === 0 && demands.length === 0 ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <div className="empty-hero">
                <Icon name="bar-chart" size={48} />
                <h2>需求库还没有数据</h2>
                <p className="muted">
                  配置飞书多维表格后自动同步需求，也可以手动新建。采集自小红书 / Amazon 等平台的用户声音会自动关联需求。
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="primary" icon="plus" onClick={() => setShowAdd(true)}>手动新建</Btn>
                  <Btn variant="ghost" icon="chrome" onClick={() => window.open('/?screen=settings', '_self')}>安装 Chrome 插件</Btn>
                </div>
              </div>
            </div>
          ) : null}
          {filtered.length === 0 && demands.length > 0 ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <EmptyState icon="lightbulb" title="没有匹配的需求">
                尝试清除筛选条件，或换一组场景/创新类型组合。
              </EmptyState>
            </div>
          ) : null}
        </div> :
        <div className="products-table-wrap demand-list-wrap">
          <table className="products-table demand-list-table">
            <thead>
              <tr>
                {selectMode && <th style={{ width: 34 }} />}
                <th>标题</th>
                <th>来源</th>
                <th>创新类型</th>
                <th>场景</th>
                <th>日期</th>
                <th style={{ width: 52 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {paged.items.map((d) =>
              <tr
                key={d.id}
                className={`${selectedId === d.id ? "selected" : ""} ${selectMode && selectedIds.includes(d.id) ? "is-selected" : ""}`}
                onClick={() => {
                  if (selectMode) toggleSelect(d.id);
                  else setSelectedId(d.id);
                }}
              >
                  {selectMode &&
                  <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.includes(d.id)} onChange={() => toggleSelect(d.id)} />
                    </td>
                  }
                  <td>
                    <div style={{ fontWeight: 500 }}>{d.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{d.summary}</div>
                  </td>
                  <td><Tag tone="outline">{PLATFORM_LABEL[d.source] || d.source}</Tag></td>
                  <td><Tag tone="accent">{d.innovation}</Tag></td>
                  <td style={{ color: "var(--text-2)" }}>{safeArray(d.scenarios).slice(0, 2).join(" · ") || "—"}</td>
                  <td style={{ color: "var(--text-3)" }}>{d.date || "—"}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Btn size="sm" variant="ghost" icon="external" onClick={() => demandSourceUrl(d) && window.open(externalHref(demandSourceUrl(d)), "_blank", "noopener,noreferrer")} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
        {tab === "voices" && <PaginationBar page={paged.currentPage} total={paged.total} pageSize={pageSize} onPageChange={setPage} label="条需求" />}
      </div>

      {selected && <DemandDetailDrawer demand={selected} api={api} refreshData={refreshData} fields={demandFields} tagGroups={data.settings?.tag_groups} onCreateTagOption={createTagOption} onClose={() => setSelectedId(null)} onRequestDelete={openDeleteConfirm} />}
      {showAdd && <AddDemandModal onClose={() => setShowAdd(false)} api={api} refreshData={refreshData} fields={demandFields} tagGroups={data.settings?.tag_groups} onCreateTagOption={createTagOption} />}
      {deleteTarget && <DeleteDemandConfirmModal demand={deleteTarget} busy={deleteBusy} onClose={() => !deleteBusy && setDeleteTarget(null)} onConfirm={confirmDelete} />}
      {showBulkDeleteConfirm && <DeleteItemsConfirmModal entityLabel="需求" items={selectedItems} busy={deleteBusy} onClose={() => !deleteBusy && setShowBulkDeleteConfirm(false)} onConfirm={async () => { await deleteSelected(); setShowBulkDeleteConfirm(false); }} />}
    </div>);

}
window.DemandsScreen = DemandsScreen;

function DemandDetailDrawer({ demand, onClose, api, refreshData, onRequestDelete, fields = [], tagGroups = [], onCreateTagOption, onNavigateSettings }) {
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [draft, setDraft] = useState(demand);
  useEffect(() => setDraft(demand), [demand]);
  const save = async (patch) => {
    setDraft((current) => mergeEntityPatch(current, patch));
    if (api) {
      await api(`/api/demands/${demand.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await refreshData?.();
    }
  };
  const syncDemand = async () => {
    if (!api) return;
    await api("/api/sync/feishu", { method: "POST", body: JSON.stringify({ kinds: ["demands"] }) });
    await refreshData?.();
  };
  const sourceUrl = demandSourceUrl(draft);
  return (
    <div className="drawer-root" onClick={onClose}>
      <div className="drawer-overlay" />
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="drawer-head-main">
            <span className={`platform-pill ${PLATFORM_KEY[draft.source] || ""}`}>{PLATFORM_LABEL[draft.source] || draft.source}</span>
            <span className="drawer-head-meta"><Icon name="calendar" size={10} /> {draft.date}</span>
          </div>
          <div className="drawer-head-actions">
            <Btn
              variant="ghost"
              icon="external"
              title="打开来源"
              disabled={!sourceUrl}
              onClick={() => sourceUrl && window.open(externalHref(sourceUrl), "_blank", "noopener,noreferrer")}
            />
            <Btn variant="ghost" icon="x" onClick={onClose} />
          </div>
        </div>
        <div className="drawer-body">
          <DemandSourceCard demand={draft} />

          <div className="detail-section">
            <div className="detail-section-label">原文正文</div>
            <textarea className="ghost-input drawer-textarea" defaultValue={draft.original_content || draft.summary}
            onBlur={(e) => save({ original_content: e.target.value, summary: e.target.value })}
            style={{ width: "100%", minHeight: 70, lineHeight: 1.6, resize: "vertical", fontSize: 12.5 }} />
          </div>

          <DemandCommentsSection demand={draft} />

          {(() => {
            const normalizedFields = normalizeFields(fields, tagGroups, { includeDefaults: true });
            const inspirationFields = normalizedFields.filter((f) => f.entities.includes("inspiration") && entityUsesField(draft, f));
            const attachField = async (field) => {
              await save(buildFieldPatch(field.key, []));
            };
            return (
              <>
                {inspirationFields.map((field) => (
                  <FieldRow
                    key={field.key}
                    field={field}
                    entity={draft}
                    onSave={save}
                    onCreateOption={onCreateTagOption}
                  />
                ))}
                <div className="detail-section detail-add-field-wrap">
                  <button className="add-field-trigger" onClick={() => setAddFieldOpen((v) => !v)}>
                    <Icon name="plus" size={12} /> 添加字段
                  </button>
                  {addFieldOpen && (
                      <AddFieldPopover
                        fields={normalizedFields}
                        entityType="inspiration"
                        entity={draft}
                        onAttach={attachField}
                      onGoSettings={() => { setAddFieldOpen(false); onNavigateSettings?.(); }}
                      onClose={() => setAddFieldOpen(false)}
                    />
                  )}
                </div>
              </>
            );
          })()}

          <div className="detail-section">
            <div className="detail-section-label">来源链接</div>
            <a
              className="drawer-link-card"
              href={externalHref(sourceUrl) || "#"}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="link" size={12} />
              {sourceUrl || `${demand.source}.com/...`}
              {sourceUrl && <Icon name="external" size={12} />}
            </a>
          </div>

          <div className="detail-section">
            <div className="detail-section-label">备注</div>
            <textarea className="ghost-input drawer-textarea compact" placeholder="补充备注、相关资料链接..."
            defaultValue={draft.note || ""}
            onBlur={(e) => save({ note: e.target.value })}
            style={{ width: "100%", minHeight: 60, resize: "vertical", fontSize: 12.5 }} />
          </div>

          <div className="detail-section" style={{ display: "flex", gap: 6 }}>
            <Btn variant="default" icon="sync" onClick={syncDemand} style={{ flex: 1, justifyContent: "center" }}>同步飞书</Btn>
            <Btn variant="ghost" icon="trash" onClick={() => onRequestDelete?.(draft)}>删除</Btn>
          </div>
        </div>
      </div>
    </div>);

}
window.DemandDetailDrawer = DemandDetailDrawer;

function ProductDetailDrawer({ product, onClose, api, refreshData, fields = [], tagGroups = [], onCreateTagOption, onNavigateSettings }) {
  const [draft, setDraft] = useState(product);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  useEffect(() => setDraft(product), [product]);
  const save = async (patch) => {
    const next = mergeEntityPatch(draft, patch);
    setDraft(next);
    if (api) {
      const nextPatch = patch.image !== undefined ? { ...patch, image_override: "manual" } : patch;
      await api(`/api/products/${product.id}`, { method: "PATCH", body: JSON.stringify(nextPatch) });
      await refreshData?.();
    }
  };
  const updatePlatform = (index, patch) => {
    const normalizedPatch = patch.discount_price !== undefined ? { ...patch, price: patch.discount_price } : patch;
    save({
      platforms: safeArray(draft?.platforms).map((platform, idx) => idx === index ? { ...platform, ...normalizedPatch } : platform),
    });
  };
  const removePlatform = (index) => save({ platforms: safeArray(draft?.platforms).filter((_, idx) => idx !== index) });
  const addPlatform = (platform) => save({ platforms: [...safeArray(draft?.platforms), createEmptyPlatform(platform)] });
  const normalizedFields = normalizeFields(fields, tagGroups, { includeDefaults: true });
  const competitorFields = normalizedFields.filter((field) => field.entities.includes("competitor") && entityUsesField(draft, field));
  return (
    <div className="drawer-root" onClick={onClose}>
      <div className="drawer-overlay" />
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <ProductImageSlot product={draft} onChange={(image) => save({ image })} />
          <div className="drawer-head-main vertical">
            <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{draft.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{draft.category || "未分类"} · {draft.status || "跟踪中"}</div>
          </div>
          <div className="drawer-head-actions">
            <Btn variant="ghost" icon="x" onClick={onClose} />
          </div>
        </div>
        <div className="drawer-body">
          <div className="detail-section">
            <div className="detail-section-label"><Icon name="boxes" size={11} /> 平台信息 · {safeArray(draft.platforms).length} 个</div>
            {safeArray(draft.platforms).map((pl, i) =>
              <ProductPlatformCard
                key={pl.id || `${pl.platform}-${i}`}
                platform={pl}
                index={i}
                onUpdate={updatePlatform}
                onRemove={removePlatform}
              />
            )}
            <AddPlatformControl existingPlatforms={draft.platforms} onAdd={addPlatform} />
          </div>
          <div className="detail-section">
            <div className="detail-section-label"><Icon name="tag" size={11} /> 标签字段</div>
            <div className="detail-inline-grid">
              {competitorFields.map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  entity={draft}
                  onSave={save}
                  onCreateOption={onCreateTagOption}
                />
              ))}
            </div>
            <div className="detail-add-field-wrap">
              <button className="add-field-trigger" onClick={() => setAddFieldOpen((v) => !v)}>
                <Icon name="plus" size={12} /> 添加字段
              </button>
              {addFieldOpen && (
                <AddFieldPopover
                  fields={normalizedFields}
                  entityType="competitor"
                  entity={draft}
                  onAttach={(field) => save(buildFieldPatch(field.key, []))}
                  onGoSettings={() => { setAddFieldOpen(false); onNavigateSettings?.(); }}
                  onClose={() => setAddFieldOpen(false)}
                />
              )}
            </div>
          </div>
          <div className="detail-section">
            <div className="detail-section-label"><Icon name="sparkles" size={11} /> 核心卖点 · AI 总结 + 用户补充</div>
            <DetailFieldCard>
              <BulletListEditor
                items={safeArray(draft.selling_points)}
                onChange={(next) => save({ selling_points: next })}
                tone="success"
                placeholder="输入卖点，回车添加"
              />
            </DetailFieldCard>
          </div>
          <div className="detail-section">
            <div className="detail-section-label"><Icon name="tag" size={11} /> 差评关键词</div>
            <DetailFieldCard>
              <BulletListEditor
                items={safeArray(draft.negative_keywords)}
                onChange={(next) => save({ negative_keywords: next })}
                tone="danger"
                placeholder="输入差评关键词，回车添加"
              />
            </DetailFieldCard>
          </div>
          <div className="detail-section">
            <div className="detail-section-label"><Icon name="sparkles" size={11} /> AI 摘要</div>
            <div className="ai-block">{draft.ai_summary || "暂无 AI 摘要。"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
window.ProductDetailDrawer = ProductDetailDrawer;

function AddDemandModal({ onClose, api, refreshData, fields = [], tagGroups = [], onCreateTagOption }) {
  const [step, setStep] = useState("input");
  const [progress, setProgress] = useState(0);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const normalizedFields = normalizeFields(fields, tagGroups, { includeDefaults: true });
  const updatePreview = (patch) => setPreview((current) => mergeEntityPatch(current || {}, patch));

  const startParse = async () => {
    setStep("parsing");setProgress(0);setError("");
    const tick = () => {
      setProgress((p) => {
        if (p >= 2) return p;
        setTimeout(tick, 650);
        return p + 1;
      });
    };
    setTimeout(tick, 400);
    try {
      const result = await api("/api/demands/parse-url", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      setPreview({
        ...result,
        source: result?.source || inferPlatformFromUrl(url) || "xiaohongshu",
        url: result?.url || url,
      });
      setProgress(3);
      setStep("preview");
    } catch (err) {
      setError(err.message);
      setStep("input");
    }
  };
  const steps = [
  { label: "采集链接内容 + 首图", detail: "Playwright headless" },
  { label: "提取标题与原文", detail: "去除评论与广告" },
  { label: "AI 多维度打标", detail: "场景 / 痛点 / 创新类型" },
  { label: "完成", detail: "" }];


  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="lightbulb" size={16} />
          <h3>录入需求 / 灵感</h3>
          <Btn variant="ghost" icon="x" onClick={onClose} />
        </div>
        <div className="modal-body">
          {step === "input" &&
          <div className="col" style={{ gap: 14 }}>
              <div>
                <label className="field-label">来源链接</label>
                <input className="input lg" style={{ width: "100%" }}
              placeholder="粘贴小红书 / Kickstarter 链接..."
              value={url} onChange={(e) => setUrl(e.target.value)} />
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
                  AI 自动识别平台,提取首图与原文,匹配到场景/痛点/创新类型标签体系。
                </div>
                {error && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{error}</div>}
              </div>
              <div style={{ background: "var(--surface-2)", padding: 12, borderRadius: 6, fontSize: 11.5, color: "var(--text-3)" }}>
                <div style={{ fontWeight: 500, color: "var(--text-2)", marginBottom: 6 }}>支持的平台</div>
                <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
                  {SUPPORTED_INSPIRATION_PLATFORMS.map((p) =>
                <Tag key={p} tone="outline">{PLATFORM_LABEL[p]}</Tag>
                )}
                </div>
              </div>
            </div>
          }
          {step === "parsing" &&
          <div className="ai-parse">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12.5 }}>
                <Icon name="sparkles" size={14} style={{ color: "var(--accent)" }} />
                <span style={{ fontWeight: 600 }}>AI 正在打标</span>
                <span style={{ marginLeft: "auto", color: "var(--text-3)" }}>~8s</span>
              </div>
              {steps.map((s, i) =>
            <div key={i} className={`ai-step ${i < progress ? "done" : i === progress ? "active" : ""}`}>
                  <span className="dot">{i < progress && <Icon name="check" size={11} />}</span>
                  <div>
                    <div>{s.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-4)" }}>{s.detail}</div>
                  </div>
                </div>
            )}
            </div>
          }
          {step === "preview" &&
          <div className="col" style={{ gap: 16 }}>
              <div className="add-demand-source">
                <Icon name="link" size={11} style={{ color: "var(--text-3)" }} />
                <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>来源：</span>
                <span style={{ fontSize: 12, color: "var(--accent)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url || "kickstarter.com/projects/..."}</span>
                <Tag tone="outline">已采集 · {PLATFORM_LABEL[preview?.source] || preview?.source || "网页"}</Tag>
              </div>

              <DemandSourceCard demand={preview} />

              <div className="detail-section">
                <div className="detail-section-label">原文正文</div>
                <textarea className="ghost-input drawer-textarea"
                  value={preview?.original_content || preview?.summary || ""}
                  onChange={(event) => updatePreview({ original_content: event.target.value, summary: event.target.value, content: event.target.value })}
                  style={{ width: "100%", minHeight: 70, lineHeight: 1.6, fontSize: 12.5, resize: "vertical" }} />
              </div>

              <div className="detail-section">
                <div className="detail-section-label"><Icon name="tag" size={11} /> 标签字段</div>
                <div className="detail-inline-grid">
                  {normalizedFields.filter((field) => field.entities.includes("inspiration") && entityUsesField(preview, field)).map((field) => (
                    <FieldRow
                      key={field.key}
                      field={field}
                      entity={preview}
                      onSave={updatePreview}
                      onCreateOption={onCreateTagOption}
                    />
                  ))}
                </div>
                <div className="detail-add-field-wrap">
                  <button className="add-field-trigger" onClick={() => setAddFieldOpen((value) => !value)}>
                    <Icon name="plus" size={12} /> 添加字段
                  </button>
                  {addFieldOpen && (
                    <AddFieldPopover
                      fields={normalizedFields}
                      entityType="inspiration"
                      entity={preview}
                      onAttach={(field) => updatePreview(buildFieldPatch(field.key, []))}
                      onGoSettings={() => setAddFieldOpen(false)}
                      onClose={() => setAddFieldOpen(false)}
                    />
                  )}
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-label">备注</div>
                <textarea
                  className="ghost-input drawer-textarea compact"
                  value={preview?.note || ""}
                  onChange={(event) => updatePreview({ note: event.target.value })}
                  placeholder="补充备注、相关资料链接..."
                  style={{ width: "100%", minHeight: 50, fontSize: 12.5, resize: "vertical" }}
                />
              </div>
            </div>
          }
        </div>
        <div className="modal-foot">
          <Btn variant="ghost" onClick={onClose}>取消</Btn>
          {step === "input" && <Btn variant="primary" icon="sparkles" onClick={startParse} disabled={!url}>采集 + AI 打标</Btn>}
          {step === "preview" && <Btn variant="primary" icon="check" onClick={async () => {
            if (api) {
              await api("/api/demands", {
                method: "POST",
                body: JSON.stringify({
                  ...(preview || {}),
                  url,
                }),
              });
              await refreshData?.();
            }
            onClose();
          }}>确认录入</Btn>}
        </div>
      </div>
    </div>);

}

// ============ RESEARCH ============
function ResearchScreen({ data, api, refreshData }) {
  const [activeId, setActiveId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [dossierTargetId, setDossierTargetId] = useState(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const items = safeArray(data.research);
  const pageSize = 8;
  const paged = paginate(items, page, pageSize);
  const ResearchDossier = globalThis.ResearchDossier;
  const dossierTarget = items.find((item) => item.id === dossierTargetId) || null;
  const dossierProducts = safeArray(dossierTarget?.products).map((id) => safeArray(data.products).find((p) => p.id === id)).filter(Boolean);
  const dossierDemands = safeArray(dossierTarget?.demands).map((id) => safeArray(data.demands).find((d) => d.id === id)).filter(Boolean);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => items.some((item) => item.id === id)));
    setPage((current) => clampPage(current, Math.ceil(items.length / pageSize)));
  }, [items]);
  useEffect(() => {
    if (!selectMode) setSelectedIds([]);
  }, [selectMode]);

  const selectedItems = items.filter((item) => selectedIds.includes(item.id));
  const toggleSelect = (id) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const deleteOne = async () => {
    if (!api || !deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api(`/api/research/${deleteTarget.id}`, { method: "DELETE" });
      setSelectedIds((current) => current.filter((id) => id !== deleteTarget.id));
      setDeleteTarget(null);
      await refreshData?.();
    } finally {
      setDeleteBusy(false);
    }
  };
  const deleteBulk = async () => {
    if (!api || !selectedItems.length) return;
    setDeleteBusy(true);
    try {
      await Promise.all(selectedItems.map((item) => api(`/api/research/${item.id}`, { method: "DELETE" })));
      setSelectedIds([]);
      setShowBulkDeleteConfirm(false);
      await refreshData?.();
    } finally {
      setDeleteBusy(false);
    }
  };

  if (activeId) {
    const r = items.find((i) => i.id === activeId);
    if (!r) {
      return <ResearchScreen data={data} api={api} refreshData={refreshData} />;
    }
    return <ResearchDetail data={data} api={api} refreshData={refreshData} research={r} onBack={() => setActiveId(null)} />;
  }

  return (
    <div className="viewport">
      <div className="page page-fluid page-narrow">
        <header className="page-head">
          <div className="page-head-left">
            <div className="screen-icon-box"><Icon name="compass" size={20} /></div>
            <div>
              <h1 className="h1" style={{ marginBottom: 2 }}>调研工坊</h1>
              <div className="muted text-sm">从竞品库与需求库中匹配数据，AI 生成结构化分析报告。</div>
            </div>
          </div>
          <div className="page-head-actions">
            {items.length > 0 && !selectMode && <Btn size="sm" variant="ghost" className="select-trigger" onClick={() => setSelectMode(true)}>选择</Btn>}
            <Btn className="weave-create-btn" variant="primary" icon="plus" onClick={() => setShowCreate(true)}>新建调研项目</Btn>
          </div>
        </header>

        {selectMode && items.length > 0 &&
          <div className="bulk-toolbar research-selection-bar">
            <div className="bulk-left">
              <Btn size="sm" variant="ghost" onClick={() => setSelectMode(false)}>取消选择</Btn>
              <Btn size="sm" variant="ghost" icon="trash" disabled={!selectedIds.length} onClick={() => setShowBulkDeleteConfirm(true)}>删除</Btn>
              <span className="muted text-sm">{selectedIds.length} 条已选择</span>
            </div>
            <label className="bulk-check">
              <input
                type="checkbox"
                checked={paged.items.length > 0 && paged.items.every((item) => selectedIds.includes(item.id))}
                onChange={(event) => {
                  const visibleIds = paged.items.map((item) => item.id);
                  setSelectedIds(event.target.checked ? Array.from(new Set([...selectedIds, ...visibleIds])) : selectedIds.filter((id) => !visibleIds.includes(id)));
                }}
              />
              <span>全选本页</span>
            </label>
          </div>
        }

        <div className="research-list">
          {paged.items.map((r) =>
          <div className="research-row" key={r.id} onClick={() => setActiveId(r.id)}>
              <div className="icon"><Icon name="compass" size={18} /></div>
              {selectMode && <input type="checkbox" checked={selectedIds.includes(r.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSelect(r.id)} />}
              <div className="research-info">
                <h4>{r.title}</h4>
                <div className="meta">
                  关联 {safeArray(r.products).length} 个竞品 · {safeArray(r.demands).length} 条需求 · 创建于 {r.date}
                </div>
              </div>
              {r.feishu_project_idea &&
                <Tag tone="accent">飞书想法</Tag>
              }
              <Tag tone={r.status === "已完成" ? "success" : r.status === "分析中" ? "warn" : "default"}>
                {r.status === "已完成" && "✓ "}
                {r.status === "分析中" && "⏳ "}
                {r.status === "草稿" && "📝 "}
                {r.status}
              </Tag>
              {!selectMode && ResearchDossier &&
                <Btn
                  size="sm"
                  variant="ghost"
                  icon="sparkles"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDossierTargetId(r.id);
                  }}
                >
                  生成调研档案
                </Btn>
              }
              <button className="row-delete-btn apple-delete-btn" title="删除调研" onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}>
                <Icon name="trash" size={13} />
              </button>
              <Icon name="chevron-right" size={16} style={{ color: "var(--text-3)" }} />
            </div>
          )}
          {items.length === 0 &&
            <EmptyState
              icon="compass"
              title="还没有真实调研项目"
              action={<Btn size="sm" variant="primary" icon="plus" onClick={() => setShowCreate(true)}>新建调研项目</Btn>}>
              先录入竞品和需求，再创建调研项目生成结构化分析报告。
            </EmptyState>
          }
        </div>
        <PaginationBar page={paged.currentPage} total={paged.total} pageSize={pageSize} onPageChange={setPage} label="个调研" />
        {dossierTarget && ResearchDossier &&
          <ResearchDossier
            research={dossierTarget}
            products={dossierProducts}
            demands={dossierDemands}
            onClose={() => setDossierTargetId(null)}
          />
        }
        {showCreate && <CreateResearchModal api={api} refreshData={refreshData} onClose={() => setShowCreate(false)} />}
        {deleteTarget && <DeleteItemsConfirmModal entityLabel="调研" items={[deleteTarget]} busy={deleteBusy} onClose={() => !deleteBusy && setDeleteTarget(null)} onConfirm={deleteOne} />}
        {showBulkDeleteConfirm && <DeleteItemsConfirmModal entityLabel="调研" items={selectedItems} busy={deleteBusy} onClose={() => !deleteBusy && setShowBulkDeleteConfirm(false)} onConfirm={deleteBulk} />}
      </div>
    </div>);

}
window.ResearchScreen = ResearchScreen;

// ============ KNOWLEDGE ============
function parseSearchState() {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
}

function useRouteTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const sync = () => setTick((value) => value + 1);
    window.addEventListener("popstate", sync);
    window.addEventListener("loom:navigate", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("loom:navigate", sync);
    };
  }, []);
  return tick;
}

function sectionStatus(section) {
  const content = String(section?.body_markdown || section?.content || '').trim();
  const refs = safeArray(section?.source_refs);
  const evidenceCount = safeArray(section?.evidence_ids).length + refs.reduce((sum, ref) => sum + safeArray(ref?.evidence_ids).length, 0);
  if (section?.status === 'published') return 'published';
  if (!content) return 'empty';
  if (evidenceCount === 0) return 'missing-evidence';
  return 'has-content';
}

function sectionStatusLabel(status) {
  switch (status) {
    case 'published': return '已发布';
    case 'missing-evidence': return '缺证据';
    case 'has-content': return '有内容';
    default: return '空';
  }
}

function sectionStatusTone(status) {
  switch (status) {
    case 'published': return 'success';
    case 'missing-evidence': return 'warn';
    case 'has-content': return 'accent';
    default: return 'outline';
  }
}

// 章节级 placeholder 指南，提示 PM 该写什么
const SECTION_PLACEHOLDERS = {
  // PRD
  product_definition: "用一段话回答：这是什么产品、给谁用、解决什么核心问题。例如：Pocket 3 风格的随身相机，给 vlogger / 旅行用户，解决手机拍 vlog 不稳不专业的问题。",
  functional_attributes: "罗列核心功能列表，每条 1 行。建议覆盖：开机/拍摄/收音/防抖/导出 等关键链路。",
  structure: "描述机身结构、按键布局、连接方式、抗摔/防水等结构要求。",
  materials_process: "外壳材料、表面处理、关键部件工艺要求。涉及供应商时点名记录。",
  id_cmf: "外观设计语言、颜色、材质、纹理 (Color/Material/Finish)。",
  electronics_firmware_certification: "电池容量、芯片选型、固件能力、必要认证 (FCC/CE/3C 等)。",
  testing: "重点测试项：高低温、跌落、按键寿命、续航、信号、画质等。给出验收阈值。",
  packaging: "包装清单 + 包装结构 + 物流抗压要求。",
  supplier_delivery: "供应商分工、打样节奏、量产排期、BOM 备料。",
  quality_acceptance: "量产验收标准：外观一致性、功能完整性、稳定性。",
  // MRD
  market_background: "目标市场规模、增长趋势、关键驱动因素。引用数据时记得加 [ev:ev_xxx] 或证据。",
  target_users_scenarios: "目标用户画像 + 典型使用场景 (3-5 个)。",
  demands_painpoints: "用户主要需求 + 当前未满足的痛点。",
  competitor_landscape: "主要竞品列表 + 各自定位 + 我们的差异化点。",
  cost_estimation: "目标成本带 + 关键 BOM + 期望毛利。",
  opportunity_judgement: "我们认为这个机会值得做的理由，最好量化。",
  risks_uncertainties: "市场、技术、供应链、政策风险。每条标注影响等级。",
  recommended_direction: "建议的产品方向、节奏和资源投入。",
  open_questions: "暂时无法回答、需要他人输入的问题。每条一行。",
};

function StructuredDocumentEditor({ api, documentId, docType, sectionKey, onNavigate }) {
  const [document, setDocument] = useState(null);
  const [sections, setSections] = useState([]);
  const [activeKey, setActiveKey] = useState(sectionKey || '');
  const [body, setBody] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [notice, setNotice] = useState(null); // { tone, text }
  const [busy, setBusy] = useState('');
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [savedAt, setSavedAt] = useState(null);
  const [drawerSection, setDrawerSection] = useState(null);
  const [highlightKey, setHighlightKey] = useState('');
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [lintErrors, setLintErrors] = useState([]);
  const [aiDegraded, setAiDegraded] = useState(false);
  const textareaRef = useRef(null);
  const editorRef = useRef(null);
  const routeTick = useRouteTick();
  const search = useMemo(() => parseSearchState(), [routeTick]);
  const urlSectionKey = search.get("section") || "";

  const load = async () => {
    if (!api || !documentId) return;
    const result = await api(`/api/${docType}-documents/${documentId}`);
    const sectionList = await api(`/api/documents/${documentId}/sections`);
    setDocument(result);
    setSections(safeArray(sectionList));
    setDocTitle(result.title || '');
    const targetKey = sectionKey || activeKey;
    const selected = safeArray(sectionList).find((item) => item.id.split(':').pop() === targetKey) || safeArray(sectionList)[0] || null;
    if (selected) {
      setActiveKey(selected.id.split(':').pop());
      setBody(selected.body_markdown || '');
    } else {
      setActiveKey('');
      setBody('');
    }
  };

  useEffect(() => {
    load().catch((error) => setNotice({ tone: 'error', text: error.message || '加载失败' }));
  }, [api, documentId, docType]);

  // URL ?section= 跳转 + 高亮
  useEffect(() => {
    if (!sections.length || !urlSectionKey) return;
    const found = sections.find((item) => item.id.split(':').pop() === urlSectionKey);
    if (!found) return;
    setActiveKey(urlSectionKey);
    requestAnimationFrame(() => {
      const target = editorRef.current?.querySelector?.(`[data-section-key="${urlSectionKey}"]`);
      target?.scrollIntoView?.({ block: 'nearest' });
      setHighlightKey(urlSectionKey);
      window.setTimeout(() => setHighlightKey(''), 1500);
    });
  }, [sections, urlSectionKey]);

  // 切换章节时载入对应正文
  useEffect(() => {
    if (!activeKey || !sections.length) return;
    const section = sections.find((item) => item.id.split(':').pop() === activeKey);
    if (section) {
      setBody(section.body_markdown || '');
      setSaveState('idle');
    }
  }, [activeKey]);

  // textarea 自动高度
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = '0px';
    textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 320)}px`;
  }, [body, activeKey]);

  const activeSection = sections.find((item) => item.id.split(':').pop() === activeKey) || sections[0] || null;
  const activeKeyFinal = activeSection?.id.split(':').pop() || '';
  const patchSection = async (patch) => {
    if (!activeSection) return;
    const endpoint = docType === 'mrd' ? `/api/mrd-sections/${activeSection.id}` : `/api/prd-sections/${activeSection.id}`;
    const result = await api(endpoint, { method: 'PATCH', body: JSON.stringify(patch) });
    setSections((current) => current.map((item) => item.id === activeSection.id ? { ...item, ...result } : item));
    return result;
  };

  const saveContent = async (nextBody) => {
    if (!activeSection) return;
    setSaveState('saving');
    try {
      await patchSection({
        document_id: documentId,
        section_key: activeKeyFinal,
        body_markdown: nextBody,
        content: nextBody,
        evidence_ids: activeSection.evidence_ids || [],
        source_refs: activeSection.source_refs || [],
      });
      setSavedAt(new Date().toISOString());
      setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      setNotice({ tone: 'error', text: error.message || '保存失败' });
    }
  };

  // 500ms debounced autosave，对比当前 body 与 section 已存内容
  useEffect(() => {
    if (!activeSection) return;
    if ((activeSection.body_markdown || '') === body) return;
    const handle = window.setTimeout(() => saveContent(body), 500);
    return () => window.clearTimeout(handle);
  }, [body, activeSection?.id]);

  const activeStatus = sectionStatus(activeSection);
  const sourceRefs = safeArray(activeSection?.source_refs);
  const openQuestions = safeArray(activeSection?.open_questions);
  const citations = sourceRefs.length
    ? sourceRefs
    : safeArray(activeSection?.evidence_ids).map((id) => ({ chunk_id: id, title: id }));
  const placeholder = SECTION_PLACEHOLDERS[activeKeyFinal] || '在这里编辑章节内容。可使用 Markdown。';
  const isPublished = document?.status === 'published';

  const askRegenerate = async () => {
    if (!activeSection || aiDegraded) return;
    setBusy('regenerating');
    try {
      const result = await api(`/api/documents/${documentId}/sections/${activeKeyFinal}/regenerate`, {
        method: 'POST',
        body: JSON.stringify({ document_id: documentId, section_key: activeKeyFinal }),
      });
      const isPlaceholder = result?.status === 'no_llm' || result?.status === 'placeholder' || /待重新生成|P0\s*暂未/.test(result?.section?.content || result?.section?.body_markdown || '');
      if (isPlaceholder) {
        setAiDegraded(true);
        setNotice({ tone: 'warn', text: 'AI 起草未接入。先手动写一版，或在设置里配置 AI 服务。' });
      } else if (result?.section) {
        setBody(result.section.body_markdown || result.section.content || '');
        setNotice({ tone: 'success', text: 'AI 已起草本节，请确认/微调后保存。' });
        await load();
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error.message || 'AI 起草失败' });
    } finally {
      setBusy('');
    }
  };

  const saveTitle = async () => {
    if (!document || docTitle === document.title) return;
    setBusy('title');
    try {
      const result = await api(`/api/documents/${documentId}`, { method: 'PATCH', body: JSON.stringify({ title: docTitle }) });
      setDocument(result);
    } catch (error) {
      setNotice({ tone: 'error', text: error.message || '标题保存失败' });
    } finally {
      setBusy('');
    }
  };

  const confirmAndPublish = async () => {
    if (!document) return;
    setBusy('publish');
    try {
      const result = await api(`/api/${docType}-documents/${documentId}/publish`, { method: 'POST' });
      setDocument(result.document || document);
      setNotice({ tone: 'success', text: '已发布并加入 RAG 索引。' });
      setConfirmPublish(false);
      await load();
    } catch (error) {
      if (error?.status === 409 || /lint/.test(error?.message || '')) {
        setNotice({ tone: 'error', text: '存在 lint 错误，请先修复再发布。' });
        runLint();
      } else {
        setNotice({ tone: 'error', text: error.message || '发布失败' });
      }
    } finally {
      setBusy('');
    }
  };

  const runLint = async () => {
    if (!document) return;
    setBusy('lint');
    try {
      const result = await api(`/api/${docType}-documents/${documentId}/lint`);
      const errs = safeArray(result?.errors);
      setLintErrors(errs);
      setNotice({
        tone: errs.length ? 'warn' : 'success',
        text: errs.length ? `Lint 找到 ${errs.length} 处需要证据的判断。` : 'Lint 通过 · 可以发布。',
      });
    } catch (error) {
      setNotice({ tone: 'error', text: error.message || 'Lint 失败' });
    } finally {
      setBusy('');
    }
  };

  const jumpToSource = async (citation) => {
    if (!citation?.chunk_id) return;
    try {
      const source = await api(`/api/knowledge/chunks/${citation.chunk_id}/source`);
      if (!source?.document_id) return;
      const targetType = source.doc_type || docType;
      navigateTo(targetType, {
        docId: source.document_id,
        section: source.section_key || '',
      });
      if (targetType !== docType) onNavigate?.(targetType);
    } catch (error) {
      setNotice({ tone: 'error', text: error.message || '跳转失败' });
    }
  };

  if (!documentId) {
    return (
      <div className="doc-studio-empty">
        <EmptyState icon="file-text" title="请选择一个文档">从左侧列表打开一份 MRD / PRD，或新建一个开始。</EmptyState>
      </div>
    );
  }

  const sectionsForLint = (sectionKeyFilter) => lintErrors.filter((err) => err.section_id === sectionKeyFilter);

  return (
    <div className="doc-studio-shell" ref={editorRef}>
      <header className="doc-studio-head">
        <div className="doc-studio-title-row">
          <input
            className="doc-studio-title-input"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            onBlur={saveTitle}
            placeholder={docType === 'mrd' ? 'MRD 标题' : 'PRD 标题'}
          />
          <Tag tone={isPublished ? 'success' : 'outline'}>{isPublished ? '已发布' : '草稿'}</Tag>
          <SaveIndicator state={saveState} updatedAt={savedAt} />
        </div>
        <div className="doc-studio-toolbar">
          <Btn size="sm" variant="ghost" icon="shield" onClick={runLint} disabled={busy === 'lint'}>Lint</Btn>
          <Btn
            size="sm"
            variant={isPublished ? 'ghost' : 'primary'}
            icon="check"
            onClick={() => setConfirmPublish(true)}
            disabled={busy === 'publish' || isPublished}
          >
            {isPublished ? '已发布' : '发布'}
          </Btn>
        </div>
      </header>

      {notice ? (
        <div className={`doc-studio-banner tone-${notice.tone || 'info'}`}>
          <span>{notice.text}</span>
          <button type="button" className="doc-studio-banner-close" onClick={() => setNotice(null)} aria-label="关闭">
            <Icon name="x" size={12} />
          </button>
        </div>
      ) : null}

      <div className="doc-studio-layout">
        <aside className="doc-studio-sidebar">
          <div className="doc-studio-sidebar-head">章节</div>
          {sections.map((item) => {
            const key = item.id.split(':').pop();
            const status = sectionStatus(item);
            const refCount = safeArray(item.source_refs).length || safeArray(item.evidence_ids).length || 0;
            const hasLintErrors = sectionsForLint(key).length;
            return (
              <button
                key={item.id}
                type="button"
                className={`doc-studio-section-row ${activeKey === key ? 'active' : ''} ${highlightKey === key ? 'is-highlighted' : ''}`}
                onClick={() => setActiveKey(key)}
                data-section-key={key}
              >
                <SectionDot status={status} title={sectionStatusLabel(status)} />
                <span className="doc-studio-section-name">{item.heading}</span>
                <span className="doc-studio-section-meta">
                  {hasLintErrors ? <Tag tone="danger">⚠ {hasLintErrors}</Tag> : null}
                  {refCount ? <span className="muted">{refCount} ref</span> : null}
                </span>
              </button>
            );
          })}
        </aside>

        <section className="doc-studio-main">
          {activeSection ? (
            <article className="doc-studio-article">
              <div className="doc-studio-section-head">
                <div>
                  <h2 className="doc-studio-section-title">{activeSection.heading}</h2>
                  <div className="muted text-sm">{sectionStatusLabel(activeStatus)} · {safeArray(activeSection.source_refs).length || 0} 条来源</div>
                </div>
                <div className="doc-studio-section-actions">
                  <Btn
                    size="sm"
                    variant="ghost"
                    icon="sparkles"
                    onClick={askRegenerate}
                    disabled={busy === 'regenerating' || aiDegraded}
                    title={aiDegraded ? 'AI 服务未接入' : 'AI 起草本节'}
                  >
                    AI 起草 <Tag tone={aiDegraded ? 'outline' : 'accent'}>{aiDegraded ? '未接入' : 'Beta'}</Tag>
                  </Btn>
                  <Btn size="sm" variant="ghost" icon="link" onClick={() => setDrawerSection(activeSection)}>看证据</Btn>
                </div>
              </div>

              <textarea
                ref={textareaRef}
                className="doc-studio-textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={placeholder}
                spellCheck={false}
              />

              {sectionsForLint(activeKeyFinal).length ? (
                <div className="doc-studio-lint">
                  <div className="doc-studio-lint-title">Lint 待修复</div>
                  {sectionsForLint(activeKeyFinal).map((err, idx) => (
                    <div key={`${err.rule}-${idx}`} className="doc-studio-lint-row">
                      <Tag tone="danger">{err.rule}</Tag>
                      <code>{err.claim_text}</code>
                      <span className="muted text-sm">{err.suggested_fix}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {openQuestions.length ? (
                <div className="doc-studio-aside-block">
                  <div className="doc-studio-aside-title">开放问题</div>
                  <ul className="doc-studio-question-list">
                    {openQuestions.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ) : null}

              {citations.length ? (
                <div className="doc-studio-aside-block">
                  <div className="doc-studio-aside-title">来源引用 · 点击跳到原文</div>
                  <div className="doc-studio-chip-row">
                    {citations.map((item) => (
                      <CitationChip
                        key={item.chunk_id || item.title}
                        label={item.title || item.chunk_id}
                        onClick={() => jumpToSource(item)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          ) : (
            <EmptyState icon="file-text" title="没有章节可编辑">该文档暂时没有章节。</EmptyState>
          )}
        </section>
      </div>

      <Drawer
        open={Boolean(drawerSection)}
        title="证据原文"
        icon="link"
        onClose={() => setDrawerSection(null)}
      >
        {safeArray(drawerSection?.source_refs).length ? drawerSection.source_refs.map((ref, index) => (
          <div key={ref.chunk_id || index} className="drawer-evidence-block">
            <div className="drawer-evidence-title">{ref.title || ref.chunk_id || `引用 ${index + 1}`}</div>
            <div className="drawer-evidence-body">{ref.text || ref.snippet || ref.chunk_id || '暂无原文预览。'}</div>
          </div>
        )) : <div className="knowledge-empty-note">该章节暂无来源引用。可在 Q&A 命中相关内容后回填。</div>}
      </Drawer>

      <ConfirmModal
        open={confirmPublish}
        title={`确认发布 ${docType.toUpperCase()}？`}
        description={
          <div>
            <p>发布后会：</p>
            <ul style={{ margin: '8px 0 0 18px', lineHeight: 1.8 }}>
              <li>把当前内容快照写入 RAG / Bot 知识索引</li>
              <li>状态从 <strong>草稿</strong> 改为 <strong>已发布</strong></li>
              <li>授权范围扩到 <code>project_team</code></li>
            </ul>
            <p style={{ marginTop: 10 }}>发布后再编辑会生成新版本，旧版本保留 90 天可查。</p>
          </div>
        }
        confirmText="确认发布"
        onConfirm={confirmAndPublish}
        onClose={() => setConfirmPublish(false)}
        busy={busy === 'publish'}
      />
    </div>
  );
}

// 相对时间格式
function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} 小时前`;
  const days = Math.round(seconds / 86400);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString();
}

function DocumentStudio({ screenType, data, api, onOpenDocumentModal, onNavigate }) {
  const routeTick = useRouteTick();
  const search = useMemo(() => parseSearchState(), [routeTick]);
  const docIdFromUrl = search.get('docId') || '';
  const sectionFromUrl = search.get('section') || '';
  const [documents, setDocuments] = useState([]);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState('');
  const workspaceId = data.workspace?.id || '';
  const isDetail = Boolean(docIdFromUrl);
  const newMode = screenType === 'mrd' ? 'structured-mrd' : 'structured-prd';
  const screenLabel = screenType === 'mrd' ? 'MRD' : 'PRD';
  const screenTitle = screenType === 'mrd' ? 'MRD Studio' : 'PRD Builder';

  const loadDocuments = async () => {
    if (!api || !workspaceId) return;
    const query = new URLSearchParams({ workspace_id: workspaceId, doc_type: screenType });
    try {
      const result = await api(`/api/documents?${query.toString()}`);
      setDocuments(safeArray(result));
      setMessage('');
    } catch (error) {
      setMessage(error.message || '文档列表加载失败');
    }
  };

  useEffect(() => { loadDocuments(); }, [api, workspaceId, screenType]);

  const selected = documents.find((item) => item.id === docIdFromUrl) || null;

  const goToList = () => navigateTo(screenType, { docId: '', section: '' });
  const openDoc = (doc) => navigateTo(screenType, { docId: doc.id });

  const handleDelete = async (doc) => {
    if (!doc) return;
    setBusy('delete');
    try {
      await api(`/api/documents/${doc.id}`, { method: 'DELETE' });
      setDocuments((list) => list.filter((item) => item.id !== doc.id));
      setConfirmDelete(null);
      if (docIdFromUrl === doc.id) goToList();
    } catch (error) {
      setMessage(error.message || '删除失败');
    } finally {
      setBusy('');
    }
  };

  const handleCopyLink = async (doc) => {
    try {
      const url = `${window.location.origin}${window.location.pathname}?screen=${screenType}&docId=${doc.id}`;
      await navigator.clipboard?.writeText(url);
      setMessage('链接已复制');
      window.setTimeout(() => setMessage(''), 1500);
    } catch {
      setMessage('复制失败，请手动选中地址栏。');
    }
  };

  // 详情视图: 全宽编辑器 + 顶部 breadcrumb
  if (isDetail) {
    return (
      <div className="viewport">
        <div className="page page-fluid page-narrow">
          <Breadcrumb
            onBack={goToList}
            backLabel={`返回 ${screenLabel} 列表`}
            trail={[
              { label: screenTitle, onClick: goToList },
              { label: selected?.title || '加载中…' },
            ]}
          />
          {message ? <div className="doc-studio-banner tone-info">{message}</div> : null}
          <div className="doc-studio-detail-shell">
            <StructuredDocumentEditor
              api={api}
              documentId={docIdFromUrl}
              docType={screenType}
              sectionKey={sectionFromUrl}
              onNavigate={onNavigate}
            />
          </div>
          <ConfirmModal
            open={Boolean(confirmDelete)}
            title="删除这份文档？"
            description={<div>将删除 <strong>{confirmDelete?.title}</strong>。该操作不可撤销。</div>}
            confirmText="删除"
            tone="danger"
            onConfirm={() => handleDelete(confirmDelete)}
            onClose={() => setConfirmDelete(null)}
            busy={busy === 'delete'}
          />
        </div>
      </div>
    );
  }

  // 索引视图: 卡片网格
  const samples = documents.filter((d) => d.metadata?.is_sample);
  const userDocs = documents.filter((d) => !d.metadata?.is_sample);

  const renderCard = (doc) => {
    const sectionCount = safeArray(doc.content?.normalized_sections).length || 0;
    const filledCount = safeArray(doc.content?.normalized_sections).filter((s) => String(s.content || '').trim()).length;
    const progress = sectionCount ? Math.round((filledCount / sectionCount) * 100) : 0;
    const isPublished = doc.status === 'published';
    return (
      <DocCard
        key={doc.id}
        title={doc.title}
        icon={screenType === 'mrd' ? 'bar-chart' : 'clipboard'}
        metaTop={<><span className={`status-dot ${isPublished ? 'published' : 'draft'}`} />{isPublished ? '已发布' : '草稿'}</>}
        badges={doc.metadata?.is_sample ? [{ label: '示例', tone: 'outline' }] : []}
        metaBottom={
          <div className="doc-card-progress">
            <div className="doc-card-progress-bar">
              <span style={{ width: `${progress}%` }} />
            </div>
            <span className="muted text-sm">{filledCount} / {sectionCount} 节 · {progress}%</span>
          </div>
        }
        footer={<span className="muted text-sm">更新于 {timeAgo(doc.updated_at || doc.created_at)}</span>}
        onClick={() => openDoc(doc)}
        isSample={Boolean(doc.metadata?.is_sample)}
        overflowItems={[
          { key: 'open', label: '打开', icon: 'external', onClick: () => openDoc(doc) },
          { key: 'copy', label: '复制链接', icon: 'link', onClick: () => handleCopyLink(doc) },
          { key: 'delete', label: '删除', icon: 'trash', tone: 'danger', onClick: () => setConfirmDelete(doc) },
        ]}
      />
    );
  };

  return (
    <div className="viewport">
      <div className="page page-fluid page-narrow">
        <header className="page-head">
          <div className="page-head-left">
            <div className="screen-icon-box"><Icon name={screenType === 'mrd' ? 'bar-chart' : 'clipboard'} size={20} /></div>
            <div>
              <h1 className="h1" style={{ marginBottom: 2 }}>{screenTitle}</h1>
              <div className="muted text-sm">
                {screenType === 'mrd'
                  ? '结构化市场分析。每个判断绑证据，发布后进入 RAG / Bot 索引。'
                  : '硬件产品定义。11 节标准 + 章节级 lint + 一键发布到 RAG。'}
              </div>
            </div>
          </div>
          <div className="page-head-actions">
            <Btn size="sm" variant="ghost" icon="sync" onClick={loadDocuments}>刷新</Btn>
            <Btn size="sm" variant="primary" icon="plus" onClick={() => onOpenDocumentModal(newMode)}>新建 {screenLabel}</Btn>
          </div>
        </header>

        {message ? <div className="doc-studio-banner tone-info">{message}</div> : null}

        {!documents.length ? (
          <div className="empty-hero">
            <Icon name="file-text" size={48} />
            <h2>还没有 {screenLabel} 文档</h2>
            <p className="muted">新建一份开始，或 sample 文档会在 workspace 初始化后自动出现。</p>
            <Btn variant="primary" icon="plus" onClick={() => onOpenDocumentModal(newMode)}>新建 {screenLabel}</Btn>
          </div>
        ) : (
          <>
            {userDocs.length ? (
              <section className="card-section">
                <div className="card-section-head">
                  <h2>我的 {screenLabel}</h2>
                  <Tag tone="outline">{userDocs.length}</Tag>
                </div>
                <div className="card-grid">{userDocs.map(renderCard)}</div>
              </section>
            ) : null}
            {samples.length ? (
              <section className="card-section">
                <div className="card-section-head">
                  <h2>示例</h2>
                  <span className="muted text-sm">可参考也可改也可删</span>
                </div>
                <div className="card-grid">{samples.map(renderCard)}</div>
              </section>
            ) : null}
          </>
        )}

        <ConfirmModal
          open={Boolean(confirmDelete)}
          title="删除这份文档？"
          description={<div>将删除 <strong>{confirmDelete?.title}</strong>。该操作不可撤销。</div>}
          confirmText="删除"
          tone="danger"
          onConfirm={() => handleDelete(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
          busy={busy === 'delete'}
        />
      </div>
    </div>
  );
}

const ENTITY_LEVEL_LABEL = {
  competitor: '竞品 / 品牌',
  product: '产品 / SKU',
  inspiration: '灵感',
  demand: '需求',
  category: '品类',
};

function StandardsScreen({ api, data }) {
  const workspaceId = data.workspace?.id || '';
  const routeTick = useRouteTick();
  const search = useMemo(() => parseSearchState(), [routeTick]);
  const kind = search.get('kind') || ''; // '' | 'prd' | 'mrd' | 'fields'
  const [templates, setTemplates] = useState({ prd: null, mrd: null });
  const [fields, setFields] = useState([]);
  const [busy, setBusy] = useState('');

  const load = async () => {
    if (!api || !workspaceId) return;
    setBusy('load');
    try {
      const [prdList, mrdList, fieldConfig] = await Promise.all([
        api(`/api/document-templates?workspace_id=${encodeURIComponent(workspaceId)}&doc_type=prd`),
        api(`/api/document-templates?workspace_id=${encodeURIComponent(workspaceId)}&doc_type=mrd`),
        api(`/api/field-config?workspace_id=${encodeURIComponent(workspaceId)}`),
      ]);
      setTemplates({ prd: safeArray(prdList)[0] || null, mrd: safeArray(mrdList)[0] || null });
      setFields(safeArray(fieldConfig?.fields || fieldConfig));
    } finally {
      setBusy('');
    }
  };

  useEffect(() => { load().catch(() => {}); }, [api, workspaceId]);

  const groupedFields = fields.reduce((acc, field) => {
    const level = field.entity_level || 'competitor';
    (acc[level] = acc[level] || []).push(field);
    return acc;
  }, {});

  const goOverview = () => navigateTo('standards', { kind: '' });
  const goDetail = (k) => navigateTo('standards', { kind: k });

  // —— 详情视图 ——
  if (kind === 'prd' || kind === 'mrd') {
    const template = templates[kind];
    const sections = safeArray(template?.sections);
    return (
      <div className="viewport">
        <div className="page page-fluid page-narrow">
          <Breadcrumb
            onBack={goOverview}
            backLabel="返回标准库"
            trail={[
              { label: '标准库', onClick: goOverview },
              { label: kind === 'prd' ? 'PRD 标准章节' : 'MRD 标准章节' },
            ]}
          />
          <header className="page-head">
            <div className="page-head-left">
              <div className="screen-icon-box"><Icon name={kind === 'prd' ? 'clipboard' : 'bar-chart'} size={20} /></div>
              <div>
                <h1 className="h1" style={{ marginBottom: 2 }}>{kind === 'prd' ? 'PRD 标准' : 'MRD 标准'}</h1>
                <div className="muted text-sm">
                  共 {sections.length} 节。导入文档时按章节标题/别名自动匹配；填章节时左侧也按这个顺序展示。
                </div>
              </div>
            </div>
            <div className="page-head-actions">
              <Btn size="sm" variant="ghost" icon="sync" onClick={load} disabled={Boolean(busy)}>刷新</Btn>
            </div>
          </header>
          <div className="standards-detail-shell">
            <ol className="standards-detail-list">
              {sections.map((item, idx) => (
                <li key={item.key} className="standards-detail-item">
                  <div className="standards-index">{idx + 1}</div>
                  <div className="standards-detail-body">
                    <div className="standards-detail-title">
                      <h3>{item.title}</h3>
                      {item.required ? <Tag tone="accent">必填</Tag> : <Tag tone="outline">可选</Tag>}
                    </div>
                    <div className="standards-detail-meta">
                      <code>{item.key}</code>
                      {safeArray(item.aliases).length ? (
                        <span className="muted">别名 · {item.aliases.join(' / ')}</span>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'fields') {
    return (
      <div className="viewport">
        <div className="page page-fluid page-narrow">
          <Breadcrumb
            onBack={goOverview}
            backLabel="返回标准库"
            trail={[{ label: '标准库', onClick: goOverview }, { label: '字段词典' }]}
          />
          <header className="page-head">
            <div className="page-head-left">
              <div className="screen-icon-box"><Icon name="tag" size={20} /></div>
              <div>
                <h1 className="h1" style={{ marginBottom: 2 }}>字段词典</h1>
                <div className="muted text-sm">
                  按实体层级分组 · 共 {fields.length} 个字段。CSV 导入和实体属性编辑都用这套 schema。
                </div>
              </div>
            </div>
            <div className="page-head-actions">
              <Btn size="sm" variant="ghost" icon="sync" onClick={load} disabled={Boolean(busy)}>刷新</Btn>
              <Btn size="sm" variant="ghost" icon="plus" disabled title="P2 即将开放">+ 自定义字段</Btn>
            </div>
          </header>
          <div className="standards-detail-shell">
            {Object.entries(groupedFields).map(([level, items]) => (
              <section key={level} className="standards-level-group">
                <header className="standards-level-head">
                  <h3>{ENTITY_LEVEL_LABEL[level] || level}</h3>
                  <Tag tone="outline">{items.length}</Tag>
                </header>
                <div className="standards-field-grid">
                  {items.map((item) => (
                    <div key={item.key} className="standards-field-card">
                      <div className="standards-field-card-head">
                        <strong>{item.name}</strong>
                        <Tag tone={item.official ? 'outline' : 'accent'}>{item.official ? '内置' : '自定义'}</Tag>
                      </div>
                      <div className="standards-item-meta">
                        <code>{item.key}</code>
                        <span className="muted">{item.multi ? '多选' : '单值'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // —— 概览视图：3 张大卡片 ——
  const summaryCards = [
    {
      key: 'prd',
      title: 'PRD 标准',
      icon: 'clipboard',
      count: safeArray(templates.prd?.sections).length,
      countUnit: '节',
      preview: safeArray(templates.prd?.sections).slice(0, 4).map((s) => s.title),
      desc: '硬件产品定义文档的标准章节结构。',
    },
    {
      key: 'mrd',
      title: 'MRD 标准',
      icon: 'bar-chart',
      count: safeArray(templates.mrd?.sections).length,
      countUnit: '节',
      preview: safeArray(templates.mrd?.sections).slice(0, 4).map((s) => s.title),
      desc: '市场分析文档的标准章节结构。',
    },
    {
      key: 'fields',
      title: '字段词典',
      icon: 'tag',
      count: fields.length,
      countUnit: '字段',
      preview: fields.slice(0, 4).map((f) => f.name),
      desc: '所有实体（产品/竞品/需求/灵感）共用的字段定义。',
    },
  ];

  return (
    <div className="viewport">
      <div className="page page-fluid page-narrow">
        <header className="page-head">
          <div className="page-head-left">
            <div className="screen-icon-box"><Icon name="shield" size={20} /></div>
            <div>
              <h1 className="h1" style={{ marginBottom: 2 }}>标准库</h1>
              <div className="muted text-sm">
                这是 LOOM 的"合同"——导入资料、生成文档、字段抽取都按这里的 schema 对齐。
              </div>
            </div>
          </div>
          <div className="page-head-actions">
            <Btn size="sm" variant="ghost" icon="sync" onClick={load} disabled={Boolean(busy)}>刷新</Btn>
          </div>
        </header>

        <div className="card-grid card-grid-3">
          {summaryCards.map((card) => (
            <DocCard
              key={card.key}
              title={card.title}
              icon={card.icon}
              metaTop={<span className="muted text-sm">{card.desc}</span>}
              metaBottom={
                <div className="standards-card-preview">
                  {card.preview.map((label) => <Tag key={label} tone="outline">{label}</Tag>)}
                  {card.count > card.preview.length ? <Tag tone="outline">+{card.count - card.preview.length}</Tag> : null}
                </div>
              }
              footer={<><strong className="standards-card-count">{card.count}</strong> <span className="muted text-sm">{card.countUnit}</span> · 点击查看完整列表 →</>}
              onClick={() => goDetail(card.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function KnowledgeScreen({ data, api, onNavigate, onOpenDocumentModal, initialPane = 'ask', initialDocType = 'prd' }) {
  const workspaceId = data.workspace?.id || '';
  const defaultProjectId = data.products?.[0]?.project_id || data.demands?.[0]?.project_id || data.research?.[0]?.id || '';

  // 问答
  const [question, setQuestion] = useState('这份 PRD 定义了哪些功能？');
  const [answer, setAnswer] = useState(null);
  const [audience, setAudience] = useState('internal');
  const [packId, setPackId] = useState('');

  // 起草
  const [draftTitle, setDraftTitle] = useState('');
  const [draftType, setDraftType] = useState(initialDocType);

  // 最近文档（MRD + PRD 合并）
  const [recentDocs, setRecentDocs] = useState([]);

  // 抽屉
  const [importOpen, setImportOpen] = useState(false);
  const [mgmtOpen, setMgmtOpen] = useState(false);
  const [mgmtTab, setMgmtTab] = useState('graph'); // graph | policy | gaps
  const [graph, setGraph] = useState(null);
  const [fusionCandidates, setFusionCandidates] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [gaps, setGaps] = useState([]);

  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState('');

  const setNote = (tone, text) => setNotice(text ? { tone, text } : null);

  const loadRecent = async () => {
    if (!api || !workspaceId) return;
    try {
      const [prdDocs, mrdDocs] = await Promise.all([
        api(`/api/documents?workspace_id=${encodeURIComponent(workspaceId)}&doc_type=prd`),
        api(`/api/documents?workspace_id=${encodeURIComponent(workspaceId)}&doc_type=mrd`),
      ]);
      const merged = [...safeArray(prdDocs), ...safeArray(mrdDocs)]
        .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
        .slice(0, 8);
      setRecentDocs(merged);
    } catch {
      setRecentDocs([]);
    }
  };

  useEffect(() => { loadRecent(); }, [api, workspaceId]);

  const ensurePack = async () => {
    if (packId) return packId;
    const pack = await api('/api/knowledge/packs/build', {
      method: 'POST',
      body: JSON.stringify({
        workspace_id: workspaceId,
        project_id: defaultProjectId,
        title: 'Auto Pack',
      }),
    });
    if (pack?.id) setPackId(pack.id);
    return pack?.id;
  };

  const ask = async (e) => {
    e?.preventDefault();
    if (!question.trim()) return;
    setBusy('ask');
    setAnswer(null);
    try {
      const nextPackId = await ensurePack();
      if (!nextPackId) {
        setNote('error', '资料包构建失败，请检查 workspace / project。');
        return;
      }
      const result = await api('/api/knowledge/query', {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: workspaceId,
          project_id: defaultProjectId,
          pack_id: nextPackId,
          question,
          audience,
        }),
      });
      setAnswer(result);
      setNote(safeArray(result?.citations).length ? 'success' : 'warn',
        safeArray(result?.citations).length ? '答案已生成，下面附引用。' : '已回答，但没有引用 — 试试加资料或换问法。');
    } catch (error) {
      setNote('error', error.message || '问答失败');
    } finally {
      setBusy('');
    }
  };

  const draftDocument = async (e) => {
    e?.preventDefault();
    setBusy('draft');
    try {
      const result = await api(`/api/${draftType}-documents`, {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: workspaceId,
          project_id: defaultProjectId,
          title: draftTitle.trim() || `${draftType.toUpperCase()} 草稿 ${new Date().toLocaleDateString()}`,
        }),
      });
      const newId = result?.id || result?.document?.id;
      if (!newId) throw new Error('创建后未返回 ID');
      navigateTo(draftType, { docId: newId });
      onNavigate?.(draftType);
    } catch (error) {
      setNote('error', error.message || '创建失败');
    } finally {
      setBusy('');
    }
  };

  const jumpToCitation = async (citation) => {
    if (!citation?.chunk_id) return;
    try {
      const source = await api(`/api/knowledge/chunks/${citation.chunk_id}/source`);
      if (!source?.document_id) {
        setNote('warn', '该引用未能定位到原文档。');
        return;
      }
      navigateTo(source.doc_type || 'prd', {
        docId: source.document_id,
        section: source.section_key || '',
      });
      onNavigate?.(source.doc_type || 'prd');
    } catch (error) {
      setNote('error', error.message || '跳转失败');
    }
  };

  const openImport = () => setImportOpen(true);
  const triggerImportMode = (mode) => {
    setImportOpen(false);
    onOpenDocumentModal?.(mode);
  };

  // 管理抽屉数据加载
  const loadManagement = async (tab = mgmtTab) => {
    setBusy('mgmt');
    try {
      if (tab === 'graph') {
        const [entities, candidates] = await Promise.all([
          api(`/api/knowledge/entities?workspace_id=${encodeURIComponent(workspaceId)}${defaultProjectId ? `&project_id=${encodeURIComponent(defaultProjectId)}` : ''}`).catch(() => []),
          api(`/api/knowledge/fusion-candidates?workspace_id=${encodeURIComponent(workspaceId)}${defaultProjectId ? `&project_id=${encodeURIComponent(defaultProjectId)}` : ''}`).catch(() => []),
        ]);
        const root = safeArray(entities)[0];
        if (root) {
          const g = await api(`/api/knowledge/entities/${root.id}/graph?depth=2&workspace_id=${encodeURIComponent(workspaceId)}`).catch(() => ({ nodes: [], edges: [] }));
          setGraph(g);
        } else {
          setGraph({ nodes: [], edges: [] });
        }
        setFusionCandidates(safeArray(candidates));
      } else if (tab === 'policy') {
        const list = await api(`/api/knowledge/source-policies?workspace_id=${encodeURIComponent(workspaceId)}`).catch(() => []);
        setPolicies(safeArray(list));
      } else if (tab === 'gaps') {
        const list = await api(`/api/knowledge-gaps?workspace_id=${encodeURIComponent(workspaceId)}&status=open`).catch(() => []);
        setGaps(safeArray(list));
      }
    } catch (error) {
      setNote('error', error.message || '加载失败');
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    if (!mgmtOpen) return;
    loadManagement(mgmtTab);
  }, [mgmtOpen, mgmtTab]);

  const patchFusion = async (id, status) => {
    try {
      const updated = await api(`/api/knowledge/fusion-candidates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ workspace_id: workspaceId, status }),
      });
      setFusionCandidates((items) => items.map((item) => item.id === id ? updated : item));
    } catch (error) {
      setNote('error', error.message || '操作失败');
    }
  };

  const togglePolicy = async (policy, key) => {
    try {
      const updated = await api(`/api/knowledge/source-policies/${policy.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ workspace_id: workspaceId, [key]: !policy[key] }),
      });
      setPolicies((items) => items.map((item) => item.id === policy.id ? updated : item));
    } catch (error) {
      setNote('error', error.message || '更新策略失败');
    }
  };

  const dismissGap = async (gap) => {
    try {
      await api(`/api/knowledge-gaps/${gap.id}/dismiss`, {
        method: 'POST',
        body: JSON.stringify({ workspace_id: workspaceId, reason: 'dismissed_from_drawer' }),
      });
      setGaps((items) => items.filter((item) => item.id !== gap.id));
    } catch (error) {
      setNote('error', error.message || '忽略失败');
    }
  };

  const sampleQuestions = [
    'Pocket 3 的核心痛点是什么？',
    '功能属性都定义了哪些？',
    '包装结构有什么要求？',
  ];

  return (
    <div className="viewport">
      <div className="page page-fluid page-narrow">
        <header className="page-head">
          <div className="page-head-left">
            <div className="screen-icon-box"><Icon name="bot" size={20} /></div>
            <div>
              <h1 className="h1" style={{ marginBottom: 2 }}>知识工作台</h1>
              <div className="muted text-sm">
                两件事：<strong style={{ color: 'var(--text)' }}>问知识库</strong> 或 <strong style={{ color: 'var(--text)' }}>起草文档</strong>。
                导入资料与治理在右侧抽屉。
              </div>
            </div>
          </div>
          <div className="page-head-actions">
            <Btn size="sm" variant="ghost" icon="plus" onClick={openImport}>加资料</Btn>
            <Btn size="sm" variant="ghost" icon="settings" onClick={() => { setMgmtTab('graph'); setMgmtOpen(true); }}>管理</Btn>
          </div>
        </header>

        {notice ? (
          <div className={`doc-studio-banner tone-${notice.tone}`}>
            <span>{notice.text}</span>
            <button type="button" className="doc-studio-banner-close" onClick={() => setNotice(null)} aria-label="关闭"><Icon name="x" size={12} /></button>
          </div>
        ) : null}

        <div className="knowledge-lite-grid">
          {/* 问 */}
          <section className="knowledge-lite-panel ask-panel">
            <header className="knowledge-panel-head">
              <Icon name="bot" size={16} />
              <div>
                <h3>问问知识库</h3>
                <p>提交后系统会自动构建/复用资料包，答案附引用。</p>
              </div>
            </header>
            <form onSubmit={ask}>
              <textarea
                className="knowledge-ask-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="例如：Pocket 3 的核心痛点 / 包装结构怎么定的？"
                rows={3}
              />
              <div className="knowledge-ask-row">
                <select className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>
                  <option value="internal">内部视角</option>
                  <option value="supplier">供应商视角</option>
                  <option value="sales_external">销售/对外</option>
                </select>
                <Btn variant="primary" icon="sparkles" type="submit" disabled={busy === 'ask' || !question.trim()}>
                  {busy === 'ask' ? '问中…' : '问'}
                </Btn>
              </div>
            </form>

            {answer ? (
              <div className={`knowledge-answer ${answer.mode === 'refused' ? 'is-refused' : ''}`}>
                <div className="knowledge-answer-top">
                  <Tag tone={answer.mode === 'refused' ? 'danger' : 'success'}>{answer.mode || 'answered'}</Tag>
                  <span className="muted text-sm">{Math.round((answer.confidence || 0) * 100)}% confidence</span>
                  {answer.needs_review ? <Tag tone="accent">待复核</Tag> : null}
                </div>
                <div className="knowledge-answer-text">{answer.answer}</div>
                {safeArray(answer.citations).length ? (
                  <div className="doc-studio-chip-row">
                    {answer.citations.map((item) => (
                      <CitationChip
                        key={item.chunk_id || item.title}
                        label={item.title || item.chunk_id}
                        onClick={() => jumpToCitation(item)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="muted text-sm">没有引用 — 可能是空 pack 或问题与已有资料无关。</div>
                )}
              </div>
            ) : (
              <div className="ask-suggestions">
                <div className="muted text-sm" style={{ marginBottom: 8 }}>试试这些问题：</div>
                <div className="ask-suggestions-list">
                  {sampleQuestions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="ask-suggestion-chip"
                      onClick={() => setQuestion(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 写 */}
          <section className="knowledge-lite-panel write-panel">
            <header className="knowledge-panel-head">
              <Icon name="clipboard" size={16} />
              <div>
                <h3>起草文档</h3>
                <p>先建一个空白 PRD / MRD，再进编辑器细改。</p>
              </div>
            </header>
            <form onSubmit={draftDocument} className="knowledge-write-form">
              <div className="knowledge-write-row">
                <select className="input" value={draftType} onChange={(e) => setDraftType(e.target.value)}>
                  <option value="prd">PRD · 产品定义</option>
                  <option value="mrd">MRD · 市场分析</option>
                </select>
                <input
                  className="input"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="文档标题（可留空）"
                />
              </div>
              <Btn variant="primary" icon="plus" type="submit" disabled={busy === 'draft'}>
                {busy === 'draft' ? '创建中…' : '新建并进入编辑器'}
              </Btn>
            </form>
          </section>
        </div>

        {/* 最近草稿 — 独立一行，full width */}
        {recentDocs.length ? (
          <section className="card-section" style={{ marginTop: 24 }}>
            <div className="card-section-head">
              <h2>最近草稿</h2>
              <Tag tone="outline">{recentDocs.length}</Tag>
              {recentDocs.length > 4 ? (
                <button
                  type="button"
                  className="link-btn"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => { navigateTo(draftType); onNavigate?.(draftType); }}
                >
                  查看全部 →
                </button>
              ) : null}
            </div>
            <div className="card-grid">
              {recentDocs.slice(0, 4).map((item) => {
                const sectionCount = safeArray(item.content?.normalized_sections).length || 0;
                const filledCount = safeArray(item.content?.normalized_sections).filter((s) => String(s.content || '').trim()).length;
                const progress = sectionCount ? Math.round((filledCount / sectionCount) * 100) : 0;
                const isPublished = item.status === 'published';
                return (
                  <DocCard
                    key={item.id}
                    title={item.title}
                    icon={item.doc_type === 'mrd' ? 'bar-chart' : 'clipboard'}
                    metaTop={
                      <>
                        <Tag tone={item.doc_type === 'mrd' ? 'accent' : 'outline'}>{item.doc_type?.toUpperCase()}</Tag>
                        <span className={`status-dot ${isPublished ? 'published' : 'draft'}`} />
                        <span>{isPublished ? '已发布' : '草稿'}</span>
                      </>
                    }
                    metaBottom={
                      <div className="doc-card-progress">
                        <div className="doc-card-progress-bar"><span style={{ width: `${progress}%` }} /></div>
                        <span className="muted text-sm">{filledCount}/{sectionCount}</span>
                      </div>
                    }
                    footer={<span className="muted text-sm">更新于 {timeAgo(item.updated_at || item.created_at)}</span>}
                    onClick={() => {
                      navigateTo(item.doc_type, { docId: item.id });
                      onNavigate?.(item.doc_type);
                    }}
                    isSample={Boolean(item.metadata?.is_sample)}
                  />
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      {/* 加资料抽屉 */}
      <Drawer open={importOpen} title="加资料" icon="plus" onClose={() => setImportOpen(false)} width={420}>
        <div className="knowledge-empty-note" style={{ marginBottom: 4 }}>
          选择来源。资料会先标准化、再走权限和索引；默认不进 RAG，PM 复核后再开。
        </div>
        <button type="button" className="knowledge-import-card" onClick={() => triggerImportMode('paste')}>
          <Icon name="clipboard" size={18} />
          <div>
            <strong>粘贴文本</strong>
            <span>从飞书、会议纪要、PRD 片段复制后粘贴。</span>
          </div>
          <Icon name="chevron-right" size={14} />
        </button>
        <button type="button" className="knowledge-import-card" onClick={() => triggerImportMode('feishu')}>
          <Icon name="link" size={18} />
          <div>
            <strong>飞书文档链接</strong>
            <span>粘贴飞书云文档链接，自动读取并按标准结构拆节。</span>
          </div>
          <Icon name="chevron-right" size={14} />
        </button>
        <button type="button" className="knowledge-import-card" onClick={() => triggerImportMode('csv')}>
          <Icon name="database" size={18} />
          <div>
            <strong>CSV 数据集</strong>
            <span>价格、月销、评分等数值字段；进入产品/SKU 层。</span>
          </div>
          <Icon name="chevron-right" size={14} />
        </button>
        <div className="knowledge-empty-note" style={{ marginTop: 10 }}>
          需要 Chrome 插件采集？切到 Library → 导入文档。
        </div>
      </Drawer>

      {/* 管理抽屉 */}
      <Drawer open={mgmtOpen} title="知识管理" icon="settings" onClose={() => setMgmtOpen(false)} width={520}>
        <div className="mgmt-tabs">
          {[
            { key: 'graph', label: '图谱' },
            { key: 'policy', label: '权限策略' },
            { key: 'gaps', label: 'Gap Inbox' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`mgmt-tab ${mgmtTab === tab.key ? 'active' : ''}`}
              onClick={() => setMgmtTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mgmtTab === 'graph' ? (
          <div>
            <div className="mgmt-metrics">
              <div><strong>{safeArray(graph?.nodes).length}</strong><span>节点</span></div>
              <div><strong>{safeArray(graph?.edges).length}</strong><span>关系</span></div>
              <div><strong>{safeArray(fusionCandidates).length}</strong><span>待合并</span></div>
            </div>
            <div className="mgmt-section-title">待确认合并候选</div>
            {safeArray(fusionCandidates).length ? fusionCandidates.map((c) => (
              <div key={c.id} className="mgmt-row">
                <div>
                  <strong>{c.action || c.candidate_type}</strong>
                  <div className="muted text-sm">{c.reason || ''}</div>
                </div>
                {c.status === 'pending' ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn size="sm" icon="check" onClick={() => patchFusion(c.id, 'approved')}>通过</Btn>
                    <Btn size="sm" variant="ghost" icon="x" onClick={() => patchFusion(c.id, 'rejected')}>拒绝</Btn>
                  </div>
                ) : <Tag tone="outline">{c.status}</Tag>}
              </div>
            )) : <div className="knowledge-empty-note">暂无待合并候选。</div>}
          </div>
        ) : null}

        {mgmtTab === 'policy' ? (
          <div>
            <div className="mgmt-section-title">资料 → RAG / Bot 开关</div>
            {safeArray(policies).length ? policies.map((p) => (
              <div key={p.id} className="mgmt-row">
                <div>
                  <strong>{p.source_type}:{p.source_id}</strong>
                  <div className="muted text-sm">{p.default_audience} · {p.review_status}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['rag_enabled', 'RAG'], ['bot_enabled', 'Bot']].map(([k, label]) => (
                    <button key={k} type="button" className={`knowledge-toggle ${p[k] ? 'on' : ''}`} onClick={() => togglePolicy(p, k)}>
                      <span>{label}</span>
                      <span className="knowledge-toggle-state">{p[k] ? '开' : '关'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )) : <div className="knowledge-empty-note">还没有策略记录。导入资料后会自动出现。</div>}
          </div>
        ) : null}

        {mgmtTab === 'gaps' ? (
          <div>
            <div className="mgmt-section-title">未回答 / 低置信问题</div>
            {safeArray(gaps).length ? gaps.map((gap) => (
              <div key={gap.id} className="mgmt-row gap-row">
                <div>
                  <strong>{gap.question_text || gap.question}</strong>
                  <div className="muted text-sm">{gap.reason} · 出现 {gap.seen_count || 1} 次</div>
                </div>
                <Btn size="sm" variant="ghost" icon="x" onClick={() => dismissGap(gap)}>忽略</Btn>
              </div>
            )) : <div className="knowledge-empty-note">暂无待补问题。低置信问答会自动汇集到这里。</div>}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

window.DocumentStudio = DocumentStudio;
window.StandardsScreen = StandardsScreen;
window.KnowledgeScreen = KnowledgeScreen;
function ResearchDetail({ data, api, refreshData, research, onBack }) {
  const [productIds, setProductIds] = useState(safeArray(research.products));
  const [demandIds, setDemandIds] = useState(safeArray(research.demands));
  const [picker, setPicker] = useState(null); // 'product' | 'demand' | null
  const [showFeishuIdeaPicker, setShowFeishuIdeaPicker] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null); // { type, id } | null
  const [busy, setBusy] = useState(false);
  const [feishuPreviewBusy, setFeishuPreviewBusy] = useState(false);
  const [feishuPreview, setFeishuPreview] = useState(null);
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState(research.status || "草稿");
  const [ideaText, setIdeaText] = useState(research.desc || "");
  const [dossierOpen, setDossierOpen] = useState(false);
  const linkedFeishuIdea = research.feishu_project_idea || null;
  const products = productIds.map((id) => safeArray(data.products).find((p) => p.id === id)).filter(Boolean);
  const demands = demandIds.map((id) => safeArray(data.demands).find((d) => d.id === id)).filter(Boolean);
  const detailProduct = detailTarget?.type === "product" ? safeArray(data.products).find((p) => p.id === detailTarget.id) : null;
  const detailDemand = detailTarget?.type === "demand" ? safeArray(data.demands).find((d) => d.id === detailTarget.id) : null;
  const normalizedFields = normalizeFields(data.settings?.fields, data.settings?.tag_groups, { includeDefaults: true });
  const createTagOption = async (groupKey, value) => {
    const cleanValue = String(value || "").trim();
    if (!api || !cleanValue) return;
    await api(`/api/fields/${encodeURIComponent(groupKey)}/options`, { method: "POST", body: JSON.stringify({ value: cleanValue }) });
    await refreshData?.();
  };
  useEffect(() => setStatus(research.status || "草稿"), [research.status]);
  useEffect(() => setIdeaText(research.desc || ""), [research.desc, research.id]);
  const saveLinks = async (nextProducts = productIds, nextDemands = demandIds) => {
    await api?.(`/api/research/${research.id}`, {
      method: "PATCH",
      body: JSON.stringify({ products: nextProducts, demands: nextDemands }),
    });
    await refreshData?.();
  };
  const saveIdeaText = async (nextValue) => {
    const normalized = String(nextValue || "");
    setIdeaText(normalized);
    await api?.(`/api/research/${research.id}`, {
      method: "PATCH",
      body: JSON.stringify({ desc: normalized }),
    });
    await refreshData?.();
  };
  const saveStatus = async (nextStatus) => {
    setStatus(nextStatus);
    await api?.(`/api/research/${research.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    });
    await refreshData?.();
  };
  const analyze = async () => {
    setBusy(true);setNotice("");
    try {
      await saveLinks();
      await api(`/api/research/${research.id}/analyze`, { method: "POST" });
      await refreshData?.();
      setNotice("分析已完成。");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };
  const exportCsv = () => {
    const url = `/api/research/${encodeURIComponent(research.id)}/export.csv`;
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const previewFeishuProjectIdea = async () => {
    setFeishuPreviewBusy(true);setNotice("");
    try {
      const draft = await api(`/api/research/${research.id}/feishu-project-idea/preview`, { method: "POST", body: JSON.stringify({}) });
      setFeishuPreview(draft);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setFeishuPreviewBusy(false);
    }
  };
  const ResearchDossier = globalThis.ResearchDossier;

  return (
    <div className="viewport">
      <div className="page page-fluid research-detail-page">
        <div className="row page-actions-row" style={{ marginBottom: 18 }}>
          <Btn variant="ghost" icon="arrow-left" onClick={onBack}>返回</Btn>
          <div className="grow" />
          <div className="page-actions">
            <Btn icon="sync" onClick={analyze} disabled={busy}>{busy ? "分析中..." : "重新分析"}</Btn>
            <Btn
              icon="sparkles"
              onClick={() => setDossierOpen(true)}
              disabled={!ResearchDossier}
            >
              生成调研档案
            </Btn>
            <Btn icon="external" onClick={previewFeishuProjectIdea} disabled={feishuPreviewBusy}>{feishuPreviewBusy ? "检查中..." : "提交到产品想法登记"}</Btn>
            <Btn variant="primary" icon="external" onClick={exportCsv}>导出整理数据</Btn>
          </div>
        </div>

        {dossierOpen && ResearchDossier &&
          <ResearchDossier
            research={research}
            products={products}
            demands={demands}
            onClose={() => setDossierOpen(false)}
          />
        }

        <div className="research-detail-layout">
          <div className="research-detail-main">
            <div className="research-detail-hero">
              <h1 className="h1">{research.title}</h1>
              <div className="muted text-sm">创建于 {research.date} · 调研项目 #{research.id.toUpperCase()}</div>
            </div>
            {notice && <div className="ai-block" style={{ marginBottom: 16 }}>{notice}</div>}

            <Section icon="edit" label="产品想法">
              <div className="research-detail-box research-desc-box">
                <textarea
                  className="research-idea-input"
                  value={ideaText}
                  onChange={(event) => setIdeaText(event.target.value)}
                  onBlur={(event) => {
                    if ((research.desc || "") === event.target.value) return;
                    saveIdeaText(event.target.value);
                  }}
                  placeholder="补充产品想法、目标用户、关键洞察或资料链接..."
                  style={{ width: "100%", minHeight: 140, resize: "vertical", fontSize: 13, lineHeight: 1.65 }}
                />
              </div>
            </Section>

            <Section
              icon="link"
              label="飞书产品想法"
              action={<button className="btn sm ghost" onClick={() => setShowFeishuIdeaPicker(true)}><Icon name="link" size={12} /> {linkedFeishuIdea ? "更换绑定" : "绑定飞书想法"}</button>}
            >
              <div className={`research-detail-box research-feishu-idea-box ${linkedFeishuIdea ? "" : "is-empty"}`}>
                {linkedFeishuIdea ?
                  <div className="research-feishu-idea-card">
                    <div className="research-feishu-idea-main">
                      <div className="research-feishu-idea-title">{linkedFeishuIdea.name}</div>
                      <div className="research-feishu-idea-meta">
                        {linkedFeishuIdea.work_item_type_name || "产品想法登记"} · {linkedFeishuIdea.current_node_name || linkedFeishuIdea.status_name || "未同步状态"} · #{linkedFeishuIdea.work_item_id}
                      </div>
                    </div>
                    {linkedFeishuIdea.source_url &&
                      <a className="research-feishu-idea-open" href={linkedFeishuIdea.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                        <Icon name="external" size={13} />
                      </a>
                    }
                  </div> :
                  <button className="research-empty-add" onClick={() => setShowFeishuIdeaPicker(true)}>
                    <Icon name="link" size={12} /> 从镜像想法列表选择
                  </button>
                }
              </div>
            </Section>

            <Section icon="boxes" label={`关联竞品 · ${products.length}`}
            action={<button className="btn sm ghost" onClick={() => setPicker("product")}><Icon name="plus" size={12} /> 添加竞品</button>}>
              <div className={`research-detail-box research-products-box ${products.length === 0 ? "is-empty" : ""}`}>
                {products.map((p) =>
                <div className="card research-linked-card research-product-card" key={p.id} onClick={() => setDetailTarget({ type: "product", id: p.id })} style={{ padding: 12, display: "flex", gap: 10, position: "relative" }}>
                    <ProductThumb product={p} />
                    <div className="research-product-card-body" style={{ minWidth: 0, flex: 1 }}>
                      <div className="research-product-card-title" style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      <div className="row" style={{ marginTop: 3, fontSize: 11.5 }}>
                        <span className="mono" style={{ fontWeight: 600 }}>{safeArray(p.platforms)[0]?.price || "—"}</span>
                        <span style={{ color: "var(--text-3)" }}>· {safeArray(p.platforms)[0]?.rating ?? "—"}★</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="research-product-card-remove"
                      aria-label={`移除 ${p.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = productIds.filter((id) => id !== p.id);
                        setProductIds(next);saveLinks(next, demandIds);
                      }}
                    >
                      <Icon name="x" size={12} style={{ color: "var(--text-4)" }} />
                    </button>
                  </div>
                )}
                {products.length === 0 &&
                <button className="research-empty-add"
                onClick={() => setPicker("product")}>
                    <Icon name="plus" size={12} /> 从竞品库添加
                  </button>
                }
              </div>
            </Section>

            <Section icon="lightbulb" label={`关联需求 · ${demands.length}`}
            action={<button className="btn sm ghost" onClick={() => setPicker("demand")}><Icon name="plus" size={12} /> 添加需求</button>}>
              <div className={`research-detail-box research-demands-box ${demands.length === 0 ? "is-empty" : ""}`}>
                {demands.map((d, i) =>
                <div className="research-linked-row" key={d.id} onClick={() => setDetailTarget({ type: "demand", id: d.id })} style={{ display: "flex", gap: 12, padding: "12px 14px", borderTop: i ? "1px solid var(--border)" : "none", alignItems: "center" }}>
                    <div style={{ width: 44, height: 44, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                      <DemandThumb hue={d.thumbHue} label="" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d.title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 1 }}>
                        {PLATFORM_LABEL[d.source]} · {d.date} · {d.innovation}
                      </div>
                    </div>
                    <Icon name="x" size={12} style={{ cursor: "pointer", color: "var(--text-4)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = demandIds.filter((id) => id !== d.id);
                    setDemandIds(next);saveLinks(productIds, next);
                  }} />
                  </div>
                )}
                {demands.length === 0 &&
                <button className="research-empty-add"
                onClick={() => setPicker("demand")}>
                    <Icon name="plus" size={12} /> 从需求库添加
                  </button>
                }
              </div>
            </Section>
          </div>
          <aside className="research-detail-side">
            <div className="research-side-card research-side-card-merged">
              <div className="research-side-row">
                <div className="research-side-label">状态</div>
                <select
                  className="input sm"
                  value={status}
                  onChange={(e) => saveStatus(e.target.value)}
                >
                  <option value="草稿">草稿</option>
                  <option value="分析中">分析中</option>
                  <option value="已完成">已完成</option>
                </select>
              </div>
              <div className="research-side-divider" />
              <div className="research-side-row">
                <div className="research-side-label">关联资产</div>
                <div className="research-side-metrics">
                  <div><strong>{products.length}</strong><span>竞品</span></div>
                  <div><strong>{demands.length}</strong><span>需求</span></div>
                  <div><strong>{research.analysis?.length || 0}</strong><span>分析</span></div>
                </div>
              </div>
              <div className="research-side-divider" />
              <div className="research-side-row">
                <div className="research-side-label">下一步</div>
                <p className="research-side-next">{research.analysis ? "可以导出报告，或继续补充竞品与需求证据。" : "补充关联竞品和需求后，点击重新分析生成报告。"}</p>
              </div>
            </div>
          </aside>
        </div>

        {picker === "product" &&
        <PickerModal title="添加关联竞品" items={data.products} excludeIds={productIds}
        onClose={() => setPicker(null)}
        onPick={(id) => {const next = [...productIds, id];setProductIds(next);setPicker(null);saveLinks(next, demandIds);}}
        renderItem={(p) =>
        <>
                <ProductThumb product={p} size={32} fontSize={16} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{p.category || "未分类"} · {safeArray(p.platforms)[0]?.price || "—"} · {safeArray(p.platforms)[0]?.rating ?? "—"}★</div>
                </div>
              </>
        }
        searchKey={(p) => p.name + " " + p.category + " " + safeArray(p.tags).join(" ")} />
        }
        {picker === "demand" &&
        <PickerModal title="添加关联需求" items={data.demands} excludeIds={demandIds}
        onClose={() => setPicker(null)}
        onPick={(id) => {const next = [...demandIds, id];setDemandIds(next);setPicker(null);saveLinks(productIds, next);}}
        renderItem={(d) =>
        <>
                <div style={{ width: 32, height: 32, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                  <DemandThumb hue={d.thumbHue} label="" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{PLATFORM_LABEL[d.source]} · {d.innovation}</div>
                </div>
              </>
        }
        searchKey={(d) => d.title + " " + d.innovation + " " + safeArray(d.scenarios).join(" ") + " " + safeArray(d.painpoints).join(" ")} />
        }
        {showFeishuIdeaPicker &&
          <FeishuProjectIdeaPickerModal
            api={api}
            linkedIdea={linkedFeishuIdea}
            onClose={() => setShowFeishuIdeaPicker(false)}
            onPick={async (idea) => {
              await api(`/api/research/${research.id}/feishu-project-idea`, {
                method: "POST",
                body: JSON.stringify({
                  project_key: idea.project_key,
                  work_item_id: idea.work_item_id,
                  work_item_type_key: idea.work_item_type_key,
                  work_item_type_name: idea.work_item_type_name,
                  name: idea.name,
                  status_name: idea.status_name,
                  current_node_name: idea.current_node_name,
                  source_url: idea.source_url,
                }),
              });
              await refreshData?.();
              setShowFeishuIdeaPicker(false);
            }}
          />
        }
        {detailProduct &&
        <ProductDetailDrawer product={detailProduct} api={api} refreshData={refreshData} fields={normalizedFields} tagGroups={data.settings?.tag_groups} onCreateTagOption={createTagOption} onClose={() => setDetailTarget(null)} />
        }
        {detailDemand &&
        <DemandDetailDrawer demand={detailDemand} api={api} refreshData={refreshData} fields={normalizedFields} tagGroups={data.settings?.tag_groups} onCreateTagOption={createTagOption} onClose={() => setDetailTarget(null)} />
        }
        {feishuPreview &&
        <div className="modal-backdrop" onClick={() => setFeishuPreview(null)}>
          <div className="modal" style={{ width: 720, maxWidth: "calc(100vw - 28px)" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <Icon name="external" size={15} />
              <h3>飞书产品想法登记预览</h3>
              <Tag tone={feishuPreview.ready ? "success" : "warn"}>{feishuPreview.ready ? "可提交" : "需补齐"}</Tag>
              <Btn variant="ghost" icon="x" onClick={() => setFeishuPreview(null)} />
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 14 }}>
              {safeArray(feishuPreview.missing_required).length > 0 &&
              <div className="ai-block">
                <strong>提交前缺口</strong>
                <div className="col" style={{ gap: 6, marginTop: 8 }}>
                  {safeArray(feishuPreview.missing_required).map((item) =>
                  <div key={`${item.type}:${item.key}`} className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                    <span>{item.label}</span>
                    <span className="muted text-sm">{item.type === "role" ? "角色" : "字段"}</span>
                  </div>
                  )}
                </div>
              </div>
              }
              {safeArray(feishuPreview.warnings).length > 0 &&
              <div className="ai-block">
                <strong>注意事项</strong>
                <div className="col" style={{ gap: 6, marginTop: 8 }}>
                  {safeArray(feishuPreview.warnings).map((item) =>
                  <div key={item.key} className="muted text-sm">{item.message}</div>
                  )}
                </div>
              </div>
              }
              <div className="settings-grid" style={{ gridTemplateColumns: "1fr", gap: 10 }}>
                {Object.entries(feishuPreview.fields || {}).map(([key, value]) =>
                <div className="settings-card" key={key}>
                  <div className="settings-card-title">{key}</div>
                  <div className="desc" style={{ whiteSpace: "pre-wrap" }}>{String(value || "")}</div>
                </div>
                )}
                <div className="settings-card">
                  <div className="settings-card-title">roles</div>
                  <div className="desc" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(feishuPreview.roles || {}, null, 2)}</div>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <Btn variant="ghost" onClick={() => setFeishuPreview(null)}>关闭</Btn>
            </div>
          </div>
        </div>
        }

        <div className="research-analysis-block">
          <Section icon="sparkles" label="AI 分析报告">
            {research.analysis ?
            <div className="col" style={{ gap: 10 }}>
                {research.analysis.map((a, i) =>
              <div className="card" key={i} style={{ padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 16 }}>{a.icon}</span>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{a.title}</h4>
                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>置信度</span>
                        <div className="confidence-bar"><span style={{ width: `${a.confidence * 100}%` }} /></div>
                        <span style={{ fontSize: 11.5, fontWeight: 600 }}>{Math.round(a.confidence * 100)}%</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-2)" }}>{a.text}</div>
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border)", fontSize: 11, color: "var(--text-3)" }}>
                      <Icon name="link" size={10} /> 数据来源:{a.source}
                    </div>
                  </div>
              )}
              </div> :

            <div className="card" style={{ padding: 30, textAlign: "center", color: "var(--text-3)" }}>
                <Icon name="sparkles" size={20} style={{ color: "var(--accent)", marginBottom: 8 }} />
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>AI 正在生成分析报告...</div>
                <div style={{ fontSize: 11.5 }}>预计 30 秒</div>
              </div>
            }
          </Section>
        </div>
      </div>
    </div>);

}

function FeishuProjectIdeaPickerModal({ api, linkedIdea, onClose, onPick }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ type: "idea", limit: "80" });
        if (q.trim()) params.set("q", q.trim());
        const result = await api(`/api/feishu-project/items?${params.toString()}`);
        if (!cancelled) setItems(safeArray(result));
      } catch (err) {
        if (!cancelled) setError(err.message || "读取飞书项目镜像失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const timer = setTimeout(load, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, q]);

  const select = async (item) => {
    setBusyId(item.id);
    try {
      await onPick(item);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal research-feishu-picker-modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="link" size={14} />
          <h3>绑定飞书产品想法</h3>
          <Btn variant="ghost" icon="x" onClick={onClose} />
        </div>
        <div style={{ padding: "12px 16px 0" }}>
          <input
            className="input lg"
            autoFocus
            style={{ width: "100%" }}
            placeholder="搜索镜像想法标题或 work item id"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="modal-body research-feishu-picker-body">
          {error && <div className="ai-block">{error}</div>}
          {loading && <div className="empty">正在读取飞书项目镜像...</div>}
          {!loading && !error && items.length === 0 &&
            <EmptyState icon="link" title="还没有镜像想法">
              先同步/测试飞书项目 MCP。
            </EmptyState>
          }
          {!loading && !error && items.length > 0 &&
            <div className="research-feishu-picker-list">
              {items.map((item) => {
                const active = linkedIdea?.project_key === item.project_key && linkedIdea?.work_item_id === item.work_item_id;
                return (
                  <button
                    key={item.id}
                    className={`research-feishu-picker-item ${active ? "is-active" : ""}`}
                    disabled={Boolean(busyId)}
                    onClick={() => select(item)}
                  >
                    <div className="research-feishu-picker-title">{item.name}</div>
                    <div className="research-feishu-picker-meta">
                      {item.work_item_type_name || "产品想法登记"} · {item.current_node_name || item.status_name || "未同步状态"} · #{item.work_item_id}
                    </div>
                    <Icon name={active ? "check" : "plus"} size={14} />
                  </button>
                );
              })}
            </div>
          }
        </div>
      </div>
    </div>
  );
}

function Section({ icon, label, children, action }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)" }}>
        <Icon name={icon} size={11} /> {label}
        <div style={{ flex: 1 }} />
        {action}
      </div>
      {children}
    </div>);

}

function CreateResearchModal({ api, refreshData, onClose }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = title.trim().length > 0;
  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);setError("");
    try {
      await api("/api/research", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), desc, status: "草稿" }),
      });
      await refreshData?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="compass" size={16} />
          <h3>新建调研项目</h3>
          <Btn variant="ghost" icon="x" onClick={onClose} />
        </div>
        <div className="modal-body">
          <div className="col" style={{ gap: 14 }}>
            <div>
              <label className="field-label">项目名称</label>
              <input className="input lg" style={{ width: "100%" }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：便携双色温补光灯 Pro" />
            </div>
            <div>
              <label className="field-label">产品想法</label>
              <textarea className="input" style={{ width: "100%", minHeight: 120, resize: "vertical" }} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="补充产品想法、目标用户、关键洞察或资料链接..." />
            </div>
            {error && <div style={{ fontSize: 12, color: "var(--danger)" }}>{error}</div>}
          </div>
        </div>
        <div className="modal-foot">
          <Btn variant="ghost" onClick={onClose}>取消</Btn>
          <Btn variant="primary" icon="check" onClick={submit} disabled={busy || !canSubmit}>{busy ? "创建中..." : "创建项目"}</Btn>
        </div>
      </div>
    </div>);
}

function PickerModal({ title, items, excludeIds = [], onClose, onPick, renderItem, searchKey }) {
  const [q, setQ] = useState("");
  const available = items.filter((it) => !excludeIds.includes(it.id));
  const filtered = q ? available.filter((it) => searchKey(it).toLowerCase().includes(q.toLowerCase())) : available;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="search" size={14} />
          <h3>{title}</h3>
          <Btn variant="ghost" icon="x" onClick={onClose} />
        </div>
        <div style={{ padding: "12px 16px 0" }}>
          <input className="input lg" autoFocus style={{ width: "100%" }}
          placeholder={`搜索 ${available.length} 条...`}
          value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="modal-body" style={{ paddingTop: 8, maxHeight: 360 }}>
          {filtered.length === 0 ?
          <div className="empty">没有匹配的结果</div> :

          <div className="col" style={{ gap: 4 }}>
              {filtered.map((it) =>
            <button key={it.id} onClick={() => onPick(it.id)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 6,
              background: "transparent", border: "1px solid transparent", cursor: "pointer",
              width: "100%", textAlign: "left", color: "inherit" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  {renderItem(it)}
                  <Icon name="plus" size={14} style={{ color: "var(--text-3)" }} />
                </button>
            )}
            </div>
          }
        </div>
      </div>
    </div>);

}

// ============ SETTINGS ============
function SettingsScreen({ data, api, refreshData }) {
  const initialSettingsTab = (() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    const valid = ["ai", "feishu", "sources", "tags", "account"];
    if (valid.includes(t)) return t;
    if (t === "general") return "ai"; // legacy redirect
    return "ai";
  })();
  const [sources, setSources] = useState(data.rssSources);
  const [officialSources, setOfficialSources] = useState(data.officialRssSources || []);
  const [settings, setSettings] = useState(data.settings || {});
  const [notice, setNotice] = useState("");
  const [settingsTab, setSettingsTab] = useState(initialSettingsTab);
  const [newSource, setNewSource] = useState({ name: "", url: "", interval: 60 });
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [deleteSourceTarget, setDeleteSourceTarget] = useState(null);
  const [deleteSourceBusy, setDeleteSourceBusy] = useState(false);
  const editingSettingsRef = useRef(false);
  useEffect(() => setSources(data.rssSources), [data.rssSources]);
  useEffect(() => setOfficialSources(data.officialRssSources || []), [data.officialRssSources]);
  useEffect(() => {
    if (!editingSettingsRef.current) setSettings(data.settings || {});
  }, [data.settings]);
  const updateSetting = (key, value) => {
    editingSettingsRef.current = true;
    setSettings((current) => ({ ...current, [key]: value }));
  };
  useEffect(() => {
    if (!api) return;
    api("/api/news/sources/status").then((statusList) => {
      const statusMap = new Map((statusList || []).map((item) => [item.id, item]));
      setSources((current) => current.map((source) => ({ ...source, ...(statusMap.get(source.id) || {}) })));
      setOfficialSources((current) => current.map((source) => ({ ...source, ...(statusMap.get(source.id) || {}) })));
    }).catch(() => {});
  }, [api, data.rssSources, data.officialRssSources]);
  const saveSettings = async (patch = settings) => {
    setNotice("");
    try {
      const saved = await api("/api/settings", { method: "PATCH", body: JSON.stringify(patch) });
      editingSettingsRef.current = false;
      setSettings(saved);
      await refreshData?.();
      setNotice("设置已保存。");
    } catch (error) {
      setNotice(error.message);
    }
  };
  const test = async (path, label) => {
    setNotice(`${label}测试中...`);
    try {
      await saveSettings(settings);
      const result = await api(path, { method: "POST" });
      if (path.includes("test-feishu-project-mcp")) {
        const projectName = result?.project?.name || result?.project?.key || "项目空间";
        const typeText = result?.workItemTypeCount ? `，识别 ${result.workItemTypeCount} 个工作项类型` : "";
        setNotice(`${label}测试成功：${projectName}${typeText}。`);
      } else {
        setNotice(`${label}测试成功。`);
      }
      await refreshData?.();
    } catch (error) {
      setNotice(error.message);
    }
  };
  const toggle = async (id) => {
    const item = sources.find((s) => s.id === id);
    setSources(sources.map((s) => s.id === id ? { ...s, active: !s.active } : s));
    await api(`/api/news-sources/${id}`, { method: "PATCH", body: JSON.stringify({ active: !item.active }) });
    await refreshData?.();
  };
  const addSource = async () => {
    if (!newSource.name || !newSource.url) return;
    await api("/api/news-sources", { method: "POST", body: JSON.stringify(newSource) });
    setNewSource({ name: "", url: "", interval: 60 });
    await refreshData?.();
  };
  const openSource = (source) => {
    if (source?.url) window.open(source.url, "_blank", "noopener,noreferrer");
  };
  const confirmDeleteSource = async () => {
    if (!api || !deleteSourceTarget) return;
    setDeleteSourceBusy(true);
    setNotice("");
    try {
      await api(`/api/news-sources/${deleteSourceTarget.id}`, { method: "DELETE" });
      setDeleteSourceTarget(null);
      await refreshData?.();
      setNotice(`已删除数据源：${deleteSourceTarget.name}`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setDeleteSourceBusy(false);
    }
  };
  const syncFeishuNow = async () => {
    setNotice("飞书同步中...");
    try {
      await saveSettings(settings);
      const result = await api("/api/sync/feishu", { method: "POST", body: JSON.stringify({ kinds: ["products", "demands", "news"] }) });
      setNotice(`同步完成：${JSON.stringify(result.summary)}`);
      await refreshData?.();
    } catch (error) {
      setNotice(error.message);
    }
  };
  const sortedSources = [...sources].sort((a, b) => {
    const countDiff = Number(b.last_item_count || 0) - Number(a.last_item_count || 0);
    if (countDiff !== 0) return countDiff;
    const fetchedA = new Date(a.last_fetched_at || 0).getTime();
    const fetchedB = new Date(b.last_fetched_at || 0).getTime();
    if (fetchedB !== fetchedA) return fetchedB - fetchedA;
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN");
  });
  const customSources = sortedSources.filter((source) => String(source.source_group || source.group || "").toLowerCase() === "custom");
  const sortedOfficialSources = [...officialSources].sort((a, b) => {
    const countDiff = Number(b.last_item_count || 0) - Number(a.last_item_count || 0);
    if (countDiff !== 0) return countDiff;
    const fetchedA = new Date(a.last_fetched_at || 0).getTime();
    const fetchedB = new Date(b.last_fetched_at || 0).getTime();
    if (fetchedB !== fetchedA) return fetchedB - fetchedA;
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN");
  });
  const visibleSources = sourcesExpanded ? customSources : customSources.slice(0, 4);

  return (
    <div className="viewport">
      <div className="page page-form">
        <header className="page-head">
          <div className="page-head-left">
            <div className="screen-icon-box"><Icon name="settings" size={20} /></div>
            <div>
              <h1 className="h1" style={{ marginBottom: 2 }}>系统设置</h1>
              <div className="muted text-sm">配置 AI 模型、飞书同步、数据源和字段词典。</div>
            </div>
          </div>
        </header>
        <div className="screen-tabs" role="tablist" aria-label="设置分类">
          {[
            { key: "ai", label: "AI 模型" },
            { key: "feishu", label: "飞书集成" },
            { key: "sources", label: "数据源" },
            { key: "tags", label: "标签与字段" },
            { key: "account", label: "账号" },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              className={`screen-tab ${settingsTab === t.key ? "active" : ""}`}
              onClick={() => setSettingsTab(t.key)}
              role="tab"
              aria-selected={settingsTab === t.key}
            >{t.label}</button>
          ))}
        </div>
        {notice && <div className="ai-block" style={{ marginBottom: 16 }}>{notice}</div>}

        {settingsTab === "ai" && (
          <>
        <div className="settings-section">
          <div className="settings-section-head">
            <Icon name="sparkles" size={14} style={{ color: "var(--accent)" }} />
            <div><h3>文本模型</h3><div className="desc">负责分类、翻译、整理和最终结构化输出。</div></div>
          </div>
          <div className="settings-section-body">
            <div className="settings-row">
              <div className="label">API 类型</div>
              <select className="input" style={{ width: 240 }} value={settings.llm_api_type || "openai"} onChange={(e) => setSettings({ ...settings, llm_api_type: e.target.value })}>
                <option value="openai">OpenAI 兼容</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div className="settings-row">
              <div className="label">API URL</div>
              <input className="input" style={{ width: "100%" }} value={settings.llm_api_url || ""} onChange={(e) => setSettings({ ...settings, llm_api_url: e.target.value })} />
            </div>
            <div className="settings-row">
              <div className="label">API Key</div>
              <input className="input" style={{ width: "100%" }} value={settings.llm_api_key || ""} onChange={(e) => setSettings({ ...settings, llm_api_key: e.target.value })} type="password" placeholder="sk-..." />
            </div>
            <div className="settings-row">
              <div className="label">模型名称</div>
              <input className="input" style={{ width: 280 }} value={settings.llm_model || ""} onChange={(e) => setSettings({ ...settings, llm_model: e.target.value })} />
            </div>
            <div className="settings-row">
              <div className="label">&nbsp;</div>
              <div className="row">
                <Btn icon="save" onClick={() => saveSettings()}>保存文本模型</Btn>
                <Btn icon="check" onClick={() => test("/api/settings/test-llm", "文本模型")}>测试连接</Btn>
                {settings.last_llm_test_at && <Tag tone="success">✓ {settings.last_llm_test_at}</Tag>}
              </div>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-head">
            <Icon name="image" size={14} style={{ color: "var(--accent)" }} />
            <div><h3>视觉模型</h3><div className="desc">只负责看图提取信息，文本整理会再交给文本模型。</div></div>
          </div>
          <div className="settings-section-body">
            <div className="settings-row">
              <div className="label">API 类型</div>
              <select className="input" style={{ width: 240 }} value={settings.llm_vision_api_type || "openai"} onChange={(e) => setSettings({ ...settings, llm_vision_api_type: e.target.value })}>
                <option value="openai">OpenAI 兼容</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div className="settings-row">
              <div className="label">API URL</div>
              <input className="input" style={{ width: "100%" }} value={settings.llm_vision_api_url || ""} onChange={(e) => setSettings({ ...settings, llm_vision_api_url: e.target.value })} />
            </div>
            <div className="settings-row">
              <div className="label">API Key</div>
              <input className="input" style={{ width: "100%" }} value={settings.llm_vision_api_key || ""} onChange={(e) => setSettings({ ...settings, llm_vision_api_key: e.target.value })} type="password" placeholder="sk-..." />
            </div>
            <div className="settings-row">
              <div className="label">模型名称</div>
              <input className="input" style={{ width: 280 }} value={settings.llm_vision_model || ""} onChange={(e) => setSettings({ ...settings, llm_vision_model: e.target.value })} />
            </div>
            <div className="settings-row">
              <div className="label">&nbsp;</div>
              <div className="row">
                <Btn icon="save" onClick={() => saveSettings()}>保存视觉模型</Btn>
                <Btn icon="check" onClick={() => test("/api/settings/test-vision-llm", "视觉模型")}>测试连接</Btn>
                {settings.last_llm_vision_test_at && <Tag tone="success">✓ {settings.last_llm_vision_test_at}</Tag>}
              </div>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-head">
            <Icon name="search" size={14} style={{ color: "var(--accent)" }} />
            <div><h3>网页搜索 (Deep Research)</h3><div className="desc">Deep Research 会用它拉取最新的外部上下文</div></div>
          </div>
          <div className="settings-section-body">
            <div className="search-provider-card">
              <div className="search-provider-head">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Icon name="chevron-down" size={16} style={{ color: "var(--text-3)" }} />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>Tavily</div>
                      {settings.search_tavily_enabled && <Tag tone="success">Active</Tag>}
                    </div>
                    <div className="muted text-sm">General web search for Deep Research</div>
                  </div>
                </div>
                <Switch on={Boolean(settings.search_tavily_enabled)} onChange={(on) => setSettings({
                  ...settings,
                  search_tavily_enabled: on,
                  search_enabled: on ? true : settings.search_serpapi_enabled,
                  search_provider: on ? "tavily" : (settings.search_serpapi_enabled ? "serpapi" : settings.search_provider),
                })} />
              </div>
              <div className="search-provider-body">
                <div className="settings-row">
                  <div className="label">API Key</div>
                  <input className="input" style={{ width: "100%" }} value={settings.search_tavily_api_key || ""} onChange={(e) => setSettings({ ...settings, search_tavily_api_key: e.target.value })} type="password" placeholder="Enter your Tavily API key" />
                </div>
              </div>
            </div>

            <div className="search-provider-card">
              <div className="search-provider-head">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Icon name="chevron-down" size={16} style={{ color: "var(--text-3)" }} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>SerpApi</div>
                    <div className="muted text-sm">Google, Bing, DuckDuckGo, Scholar, News, Images, Videos, YouTube</div>
                  </div>
                </div>
                <Switch on={Boolean(settings.search_serpapi_enabled)} onChange={(on) => setSettings({
                  ...settings,
                  search_serpapi_enabled: on,
                  search_enabled: settings.search_tavily_enabled || on,
                  search_provider: on ? "serpapi" : (settings.search_tavily_enabled ? "tavily" : settings.search_provider),
                })} />
              </div>
              <div className="search-provider-body">
                <div className="settings-row">
                  <div className="label">API Key</div>
                  <input className="input" style={{ width: "100%" }} value={settings.search_serpapi_api_key || ""} onChange={(e) => setSettings({ ...settings, search_serpapi_api_key: e.target.value })} type="password" placeholder="Enter your SerpApi API key (serpapi.com)" />
                </div>
                <div className="settings-row" style={{ alignItems: "start" }}>
                  <div className="label">Search engine / category</div>
                  <div className="col" style={{ gap: 10 }}>
                    <div className="search-engine-grid">
                      {SERP_ENGINE_OPTIONS.map(([value, label]) =>
                      <button
                        key={value}
                        type="button"
                        className={`search-engine-pill ${String(settings.search_serpapi_engine || "google") === value ? "active" : ""}`}
                        onClick={() => setSettings({ ...settings, search_serpapi_engine: value })}
                      >
                          {label}
                        </button>
                      )}
                    </div>
                    <input className="input" style={{ width: "100%" }} value={settings.search_serpapi_engine || "google"} onChange={(e) => setSettings({ ...settings, search_serpapi_engine: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-row">
              <div className="label">&nbsp;</div>
              <div className="row">
                <Btn icon="save" onClick={() => saveSettings()}>保存搜索配置</Btn>
              </div>
            </div>
          </div>
        </div>
          </>
        )}

        {settingsTab === "feishu" && (
          <>
        <div className="settings-section">
          <div className="settings-section-head">
            <Icon name="sync" size={14} style={{ color: "var(--accent)" }} />
            <div><h3>飞书多维表格同步</h3><div className="desc">单向同步 — 数据流向飞书,不反向覆盖本地</div></div>
          </div>
          <div className="settings-section-body">
            <div className="settings-row">
              <div className="label">App ID</div>
              <input className="input" style={{ width: "100%" }} value={settings.feishu_app_id || ""} onChange={(e) => setSettings({ ...settings, feishu_app_id: e.target.value })} />
            </div>
            <div className="settings-row">
              <div className="label">App Secret</div>
              <input className="input" style={{ width: "100%" }} value={settings.feishu_app_secret || ""} onChange={(e) => setSettings({ ...settings, feishu_app_secret: e.target.value })} type="password" />
            </div>
            <div className="settings-row">
              <div className="label">Base Token</div>
              <input className="input" style={{ width: "100%" }} value={settings.feishu_base_token || settings.feishu_table_token || ""} onChange={(e) => setSettings({ ...settings, feishu_base_token: e.target.value })} placeholder="appToken / base token" />
            </div>
            <div className="settings-row">
              <div className="label">表 ID</div>
              <div className="col" style={{ gap: 8, width: "100%" }}>
                <input className="input" style={{ width: "100%" }} value={settings.feishu_products_table_id || ""} onChange={(e) => setSettings({ ...settings, feishu_products_table_id: e.target.value })} placeholder="竞品表 table_id" />
                <input className="input" style={{ width: "100%" }} value={settings.feishu_demands_table_id || ""} onChange={(e) => setSettings({ ...settings, feishu_demands_table_id: e.target.value })} placeholder="需求表 table_id" />
                <input className="input" style={{ width: "100%" }} value={settings.feishu_news_table_id || ""} onChange={(e) => setSettings({ ...settings, feishu_news_table_id: e.target.value })} placeholder="News 表 table_id" />
              </div>
            </div>
            <div className="settings-row">
              <div className="label">&nbsp;</div>
              <div className="row">
                <Btn icon="check" onClick={() => test("/api/settings/test-feishu", "飞书")}>测试连接</Btn>
                <Btn variant="primary" icon="sync" onClick={syncFeishuNow}>立即同步</Btn>
                {settings.last_feishu_test_at && <span className="muted text-sm" style={{ marginLeft: 4 }}>上次:{settings.last_feishu_test_at}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-head">
            <Icon name="folder-open" size={14} style={{ color: "var(--accent)" }} />
            <div>
              <h3>飞书项目 MCP <Tag tone="accent">Beta</Tag></h3>
              <div className="desc">通过飞书项目 MCP 读取产品想法、立项和项目集。Token 只保存在服务端设置里。</div>
            </div>
          </div>
          <div className="settings-section-body">
            <div className="settings-row">
              <div className="label">MCP Endpoint</div>
              <input className="input" style={{ width: "100%" }} value={settings.feishu_mcp_url || ""} onChange={(e) => updateSetting("feishu_mcp_url", e.target.value)} placeholder="可不填，默认 https://project.feishu.cn/mcp_server/v1" />
            </div>
            <div className="settings-row">
              <div className="label">X-Mcp-Token</div>
              <input className="input" style={{ width: "100%" }} type="password" value={settings.feishu_mcp_token || ""} onChange={(e) => updateSetting("feishu_mcp_token", e.target.value)} placeholder="只填写 token 值，不需要填写 X-Mcp-Token 这个 header 名" />
            </div>
            <div className="settings-row">
              <div className="label">项目空间 ID</div>
              <input className="input" style={{ width: "100%" }} value={settings.feishu_mcp_project_key || ""} onChange={(e) => updateSetting("feishu_mcp_project_key", e.target.value)} placeholder="项目空间 project_key" />
            </div>
            <div className="settings-row">
              <div className="label">同步频率</div>
              <select className="input" style={{ maxWidth: 200 }} value={settings.feishu_mcp_interval || "manual"} onChange={(e) => updateSetting("feishu_mcp_interval", e.target.value)}>
                <option value="manual">仅手动</option>
                <option value="15m">每 15 分钟</option>
                <option value="1h">每小时</option>
                <option value="4h">每 4 小时</option>
                <option value="1d">每天一次</option>
              </select>
            </div>
            <div className="settings-row">
              <div className="label">&nbsp;</div>
              <div className="row">
                <Btn icon="check" onClick={() => test("/api/settings/test-feishu-project-mcp", "飞书项目 MCP")}>测试连接</Btn>
                <Btn variant="primary" icon="sync" onClick={() => setNotice("飞书 MCP 接入即将上线，已保存配置。")}>立即同步</Btn>
                {settings.last_feishu_project_mcp_test_at && <span className="muted text-sm" style={{ marginLeft: 4 }}>上次:{settings.last_feishu_project_mcp_test_at}</span>}
              </div>
            </div>
          </div>
        </div>

          </>
        )}

        {settingsTab === "sources" && (
          <>
        <div className="settings-section">
          <div className="settings-section-head">
            <Icon name="rss" size={14} style={{ color: "var(--accent)" }} />
            <div><h3>官方 RSS 源</h3><div className="desc">系统统一在后端采集并分发到资讯流。你只需要决定是否接收。</div></div>
          </div>
          <div className="settings-section-body">
            <div className="settings-row">
              <div className="label">
                接收官方信息流
                <div className="hint">关闭后，资讯流将隐藏系统统一分发的官方 RSS 与公众号内容。</div>
              </div>
              <Switch on={settings.official_news_enabled !== false} onChange={async (on) => {
                const next = { ...settings, official_news_enabled: on };
                setSettings(next);
                await saveSettings(next);
              }} />
            </div>
            <div className="official-source-grid">
              {sortedOfficialSources.map((s) =>
                <button
                  type="button"
                  className="official-source-card"
                  key={s.id}
                  onClick={() => openSource(s)}
                  title={s.name}
                >
                  <span className="official-source-name">{s.name}</span>
                  <span className="official-source-type">{NEWS_SOURCE_TYPE_LABEL[normalizeNewsSourceType(s.type)] || "RSS"}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-head">
            <Icon name="rss" size={14} style={{ color: "var(--accent)" }} />
            <div><h3>添加自定义数据源</h3><div className="desc">默认留空。只在你想补充额外 RSS / 公众号源时手动添加。</div></div>
          </div>
          <div className="settings-section-body">
            {customSources.length === 0 && (
              <div className="settings-empty-note">
                还没有自定义数据源。下面可以自己添加。
              </div>
            )}
            {visibleSources.map((s) =>
            <div className="source-row" key={s.id}>
                <div>
                  <div style={{ fontWeight: 500 }}>{s.name}</div>
                  <div className="url">{s.url}</div>
                  <div className="muted text-sm">
                    {s.last_fetched_at ? `上次采集 ${formatRelativeTime(s.last_fetched_at)}` : "未采集"}
                    {` · 条数 ${s.last_item_count || 0}`}
                    {s.last_error ? ` · 错误 ${s.last_error}` : ""}
                  </div>
                </div>
                <div><Tag tone="outline">{NEWS_SOURCE_TYPE_LABEL[normalizeNewsSourceType(s.type)] || "RSS"}</Tag></div>
                <div className="muted text-sm">{s.interval} min</div>
                <div className="source-row-actions">
                  <Switch on={s.active} onChange={() => toggle(s.id)} />
                  <Btn size="sm" variant="ghost" icon="external" onClick={() => openSource(s)} />
                  <Btn size="sm" variant="ghost" icon="trash" onClick={() => setDeleteSourceTarget(s)} />
                </div>
              </div>
            )}
            {customSources.length > 4 &&
              <button
                type="button"
                className="sources-expand-btn"
                onClick={() => setSourcesExpanded((v) => !v)}
              >
                <span>{sourcesExpanded ? "收起数据源" : `展开全部 ${customSources.length} 个自定义源`}</span>
                <Icon name={sourcesExpanded ? "chevron-up" : "chevron-down"} size={14} />
              </button>
            }
            <div className="source-add-row">
              <div className="source-add-fields">
                <input className="input sm" style={{ width: "100%", marginBottom: 6 }} placeholder="源名称" value={newSource.name} onChange={(e) => setNewSource({ ...newSource, name: e.target.value })} />
                <input className="input sm" style={{ width: "100%" }} placeholder="RSS URL" value={newSource.url} onChange={(e) => setNewSource({ ...newSource, url: e.target.value })} />
                <div className="source-add-interval">
                  <div className="source-add-interval-label">采集频率</div>
                  <div className="source-add-interval-box">
                    <input className="input sm source-add-interval-input" type="number" value={newSource.interval} onChange={(e) => setNewSource({ ...newSource, interval: Number(e.target.value) })} />
                    <span className="source-add-interval-inline">每分钟</span>
                  </div>
                </div>
              </div>
              <div className="source-add-actions">
                <Btn size="sm" variant="primary" icon="plus" onClick={addSource}>添加</Btn>
              </div>
            </div>
          </div>
        </div>

          </>
        )}

        {settingsTab === "account" && (
          <>
        <div className="settings-section">
          <div className="settings-section-head">
            <Icon name="key" size={14} style={{ color: "var(--accent)" }} />
            <div><h3>账号信息</h3><div className="desc">当前账号仅可访问自己的工作区数据，支持密码登录与飞书登录接入。</div></div>
          </div>
          <div className="settings-section-body">
            <div className="settings-row"><div className="label">用户名</div><div>{data.user.name}</div></div>
            <div className="settings-row"><div className="label">角色</div><div>{data.user.role}</div></div>
            {data.user.email ? <div className="settings-row"><div className="label">邮箱</div><div>{data.user.email}</div></div> : null}
            <div className="settings-row"><div className="label">登录方式</div><div>{data.user.auth_provider === "feishu" ? "飞书 OAuth" : "账号密码"}</div></div>
            <div className="settings-row"><div className="label">&nbsp;</div><div><Btn>修改密码</Btn></div></div>
          </div>
        </div>
          </>
        )}
        {settingsTab === "tags" && (
          <div className="settings-section">
            <div className="settings-section-head">
              <Icon name="tag" size={14} style={{ color: "var(--accent)" }} />
              <div><h3>标签与字段</h3><div className="desc">系统字段提供基础结构；品牌、主机和品类使用标准词表，场景与痛点从采集内容中逐步推荐。</div></div>
            </div>
            <div className="settings-section-body">
              <FieldSystemEditor settings={settings} setSettings={setSettings} saveSettings={saveSettings} />
            </div>
          </div>
        )}
      </div>
      {deleteSourceTarget && (
        <DeleteSourceConfirmModal
          source={deleteSourceTarget}
          busy={deleteSourceBusy}
          onClose={() => !deleteSourceBusy && setDeleteSourceTarget(null)}
          onConfirm={confirmDeleteSource}
        />
      )}
    </div>);

}
window.SettingsScreen = SettingsScreen;

function TagSystemEditor({ settings, setSettings, saveSettings }) {
  const [groups, setGroups] = useState(safeArray(settings.tag_groups));
  const [drafts, setDrafts] = useState({});
  const [editing, setEditing] = useState(null); // index of group with input open
  const [tagTab, setTagTab] = useState("common");

  useEffect(() => {
    setGroups(safeArray(settings.tag_groups));
  }, [settings.tag_groups]);

  const addTag = (i) => {
    const v = (drafts[i] || "").trim();
    if (!v) return;
    if (groups[i].tags.includes(v)) {setDrafts({ ...drafts, [i]: "" });return;}
    setGroups(groups.map((g, j) => j === i ? { ...g, tags: [...g.tags, v] } : g));
    setDrafts({ ...drafts, [i]: "" });
  };
  const removeTag = (i, t) =>
  setGroups(groups.map((g, j) => j === i ? { ...g, tags: g.tags.filter((x) => x !== t) } : g));

  const persist = async () => {
    const next = { ...settings, tag_groups: groups };
    setSettings(next);
    await saveSettings(next);
  };

  const TAB_GROUPS = {
    common: ["competitor_brands", "camera_brands"],
    news: ["competitor_brands", "camera_brands"],
    products: ["competitor_brands", "camera_brands", "product_categories"],
    demands: ["scenarios", "painpoints", "innovation_types"],
    research: ["competitor_brands", "camera_brands", "product_categories", "scenarios", "painpoints", "innovation_types"],
  };

  // TagSystemEditor kept for reference but replaced by FieldSystemEditor above
  const visibleGroups = groups.filter((group) => TAB_GROUPS[tagTab]?.includes(group.key));

  return (
    <>
      <div className="news-tabs" style={{ marginBottom: 16 }}>
        <div className={`news-tab ${tagTab === "common" ? "active" : ""}`} onClick={() => setTagTab("common")}>通用</div>
        <div className={`news-tab ${tagTab === "news" ? "active" : ""}`} onClick={() => setTagTab("news")}>资讯流</div>
        <div className={`news-tab ${tagTab === "products" ? "active" : ""}`} onClick={() => setTagTab("products")}>竞品库</div>
        <div className={`news-tab ${tagTab === "demands" ? "active" : ""}`} onClick={() => setTagTab("demands")}>灵感库</div>
        <div className={`news-tab ${tagTab === "research" ? "active" : ""}`} onClick={() => setTagTab("research")}>调研工坊</div>
      </div>
      {visibleGroups.map((g) => {
        const i = groups.findIndex((item) => item.key === g.key);
        return (
      <div className="settings-row" key={g.name} style={{ alignItems: "flex-start" }}>
          <div className="label">
            {g.name}
            <div className="hint">{g.tags.length} 项</div>
          </div>
          <div className="tag-row" style={{ alignItems: "center" }}>
            {g.tags.map((t) =>
          <span key={t} className={`tag ${g.tone}`} style={{ paddingRight: 4, gap: 3 }}>
                {t}
                <Icon name="x" size={11} style={{ cursor: "pointer", opacity: 0.6 }}
            onClick={() => removeTag(i, t)} />
              </span>
          )}
            {editing === i ?
          <input
            autoFocus
            className="input"
            style={{ height: 22, padding: "0 8px", fontSize: 11.5, width: 120 }}
            placeholder="输入后回车"
            value={drafts[i] || ""}
            onChange={(e) => setDrafts({ ...drafts, [i]: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTag(i);else
              if (e.key === "Escape") {setEditing(null);setDrafts({ ...drafts, [i]: "" });}
            }}
            onBlur={() => {addTag(i);setEditing(null);}} /> :


          <button className="tag" style={{ background: "transparent", border: "1px dashed var(--border)", color: "var(--text-3)", cursor: "pointer", gap: 3 }}
          onClick={() => setEditing(i)}>
                <Icon name="plus" size={10} /> 添加
              </button>
          }
          </div>
        </div>
      );})}
      <div className="settings-row">
        <div className="label">&nbsp;</div>
        <div className="row">
          <Btn icon="save" onClick={persist}>保存 Tag 配置</Btn>
        </div>
      </div>
    </>);

}

// ===== New Field System Components =====

function FieldCard({ field, onOptionsChange, onEntitiesChange, onDelete, onRename, onMultiChange }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(field.name);

  const addOption = () => {
    if (!onOptionsChange) { setEditing(false); setDraft(""); return; }
    const v = draft.trim();
    if (!v) { setEditing(false); return; }
    if (!field.options.includes(v)) onOptionsChange?.([...field.options, v]);
    setDraft("");
    setEditing(false);
  };

  const removeOption = (opt) => onOptionsChange?.(field.options.filter((o) => o !== opt));

  const toggleEntity = (entity) => {
    if (!onEntitiesChange) return;
    const curr = field.entities;
    if (curr.includes(entity)) {
      if (curr.length <= 1) return;
      onEntitiesChange?.(curr.filter((e) => e !== entity));
    } else {
      onEntitiesChange?.([...curr, entity]);
    }
  };

  const commitRename = () => {
    const name = nameInput.trim();
    if (name && name !== field.name) onRename?.(name);
    setRenaming(false);
  };

  return (
    <div className="field-card">
      <div className="field-card-header">
        <div className="field-card-title">
          <Icon name={field.official ? "tag" : "sparkles"} size={13} style={{ color: field.official ? "var(--text-3)" : "var(--accent)", flexShrink: 0 }} />
          {renaming ? (
            <input
              autoFocus
              className="input"
              style={{ height: 24, padding: "0 8px", fontSize: 12.5, width: 140 }}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setRenaming(false); setNameInput(field.name); } }}
              onBlur={commitRename}
            />
          ) : (
            <span className="field-card-name">{field.name}</span>
          )}
          {onMultiChange ? (
            <span className="segment-control compact" style={{ height: 22 }}>
              {[{ v: true, label: "多选" }, { v: false, label: "单选" }].map(({ v, label }) => (
                <button
                  key={label}
                  type="button"
                  className={`segment-item ${field.multi === v ? "active" : ""}`}
                  style={{ height: 20, padding: "0 8px", fontSize: 11 }}
                  onClick={() => onMultiChange(v)}
                >
                  {label}
                </button>
              ))}
            </span>
          ) : (
            <span className="tag outline" style={{ fontSize: 10.5, padding: "0 6px", height: 18, lineHeight: "18px" }}>{field.multi ? "多选" : "单选"}</span>
          )}
          {!field.official && <span className="field-custom-chip">自定义</span>}
        </div>
        <div className="field-card-actions">
          {!field.official && <Btn variant="ghost" size="sm" icon="edit" title="改名" onClick={() => { setRenaming(true); setNameInput(field.name); }} />}
          {onDelete && <Btn variant="ghost" size="sm" icon="trash" title="删除字段" onClick={onDelete} />}
        </div>
      </div>
      <div className="field-card-entities">
        <span className="field-card-entity-label">归属：</span>
        {[{ key: "competitor", label: "竞品库" }, { key: "inspiration", label: "灵感库" }].map((e) => (
          <label key={e.key} className="field-entity-checkbox">
            <input
              type="checkbox"
              checked={field.entities.includes(e.key)}
              disabled={!onEntitiesChange}
              onChange={() => toggleEntity(e.key)}
            />
            {e.label}
          </label>
        ))}
      </div>
      <div className="field-card-options">
        {field.options.map((opt) => (
          <span key={opt} className={`tag ${field.tone}`} style={{ paddingRight: 4, gap: 3, cursor: "default" }}>
            {opt}
            {onOptionsChange && <Icon name="x" size={11} style={{ cursor: "pointer", opacity: 0.6 }} onClick={() => removeOption(opt)} />}
          </span>
        ))}
        {editing ? (
          <input
            autoFocus
            className="input"
            style={{ height: 24, padding: "0 8px", fontSize: 11.5, width: 120 }}
            placeholder="输入后回车"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addOption(); if (e.key === "Escape") { setEditing(false); setDraft(""); } }}
            onBlur={addOption}
          />
        ) : onOptionsChange ? (
          <button
            className="tag"
            style={{ background: "transparent", border: "1px dashed var(--border)", color: "var(--text-3)", cursor: "pointer", gap: 3 }}
            onClick={() => setEditing(true)}
          >
            <Icon name="plus" size={10} /> 添加
          </button>
        ) : field.options.length === 0 ? (
          <span className="muted text-sm">采集时由 AI 推荐，确认后进入标签库</span>
        ) : null}
      </div>
    </div>
  );
}

function NewFieldModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [multi, setMulti] = useState(true);
  const [tone, setTone] = useState("outline");
  const [entities, setEntities] = useState(["competitor"]);

  const toggleEntity = (e) => setEntities((curr) => curr.includes(e) ? curr.filter((x) => x !== e) : [...curr, e]);
  const valid = name.trim().length > 0 && entities.length > 0;

  const TONE_LABEL = { outline: "Outline", default: "默认", accent: "强调", success: "成功", warn: "警告", danger: "危险" };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-form" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="sparkles" size={15} style={{ color: "var(--accent)" }} />
          <h3>新建字段</h3>
          <Btn variant="ghost" icon="x" onClick={onClose} />
        </div>
        <div className="modal-body form-stack">
          <div className="form-field">
            <label className="form-label">字段名</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：目标人群"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && valid) onCreate({ name: name.trim(), multi, tone, entities }); }}
            />
          </div>

          <div className="form-field">
            <label className="form-label">类型</label>
            <div className="segment-control">
              {[{ v: true, label: "多选" }, { v: false, label: "单选" }].map(({ v, label }) => (
                <button
                  key={label}
                  type="button"
                  className={`segment-item ${multi === v ? "active" : ""}`}
                  onClick={() => setMulti(v)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-field">
            <label className="form-label">颜色</label>
            <div className="color-swatch-grid">
              {["outline", "default", "accent", "success", "warn", "danger"].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`color-swatch ${tone === t ? "selected" : ""}`}
                  onClick={() => setTone(t)}
                  title={TONE_LABEL[t]}
                >
                  <span className={`tag ${t}`}>{TONE_LABEL[t]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-field">
            <label className="form-label">归属</label>
            <div className="checkbox-group">
              {[{ key: "competitor", label: "竞品库" }, { key: "inspiration", label: "灵感库" }].map((e) => (
                <label key={e.key} className="checkbox-chip">
                  <input type="checkbox" checked={entities.includes(e.key)} onChange={() => toggleEntity(e.key)} />
                  <span>{e.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <Btn variant="ghost" onClick={onClose}>取消</Btn>
          <Btn variant="primary" disabled={!valid} onClick={() => onCreate({ name: name.trim(), multi, tone, entities })}>创建</Btn>
        </div>
      </div>
    </div>
  );
}

function FieldSystemEditor({ settings, setSettings, saveSettings }) {
  const [fieldsState, setFieldsState] = useState(normalizeFields(settings.fields, settings.tag_groups, { includeDefaults: true }));
  const [fieldTab, setFieldTab] = useState("competitor");
  const [showNewField, setShowNewField] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => setFieldsState(normalizeFields(settings.fields, settings.tag_groups, { includeDefaults: true })), [settings.fields, settings.tag_groups]);

  const visibleFields = fieldTab === "all" ? fieldsState : fieldsState.filter((f) => f.entities.includes(fieldTab));

  const persist = async (nextFields) => {
    const next = { ...settings, fields: nextFields };
    setSettings(next);
    try {
      await saveSettings(next);
      setNotice("已保存");
      setTimeout(() => setNotice(""), 2000);
    } catch {
      setNotice("保存失败");
    }
  };

  const updateField = async (fieldKey, patch) => {
    const next = fieldsState.map((field) => field.key === fieldKey ? { ...field, ...patch } : field);
    setFieldsState(next);
    await persist(next);
  };

  const addCustomField = async (fd) => {
    const key = `u_${Date.now()}`;
    const newField = { key, name: fd.name, tone: fd.tone, multi: fd.multi, official: false, entities: fd.entities, options: [] };
    const next = [...fieldsState, newField];
    setFieldsState(next);
    await persist(next);
  };

  const deleteCustomField = async (fieldKey) => {
    const next = fieldsState.filter((field) => field.key !== fieldKey);
    setFieldsState(next);
    await persist(next);
  };

  return (
    <>
      <div className="screen-tabs" role="tablist" aria-label="字段实体">
        <button type="button" className={`screen-tab ${fieldTab === "competitor" ? "active" : ""}`} onClick={() => setFieldTab("competitor")} role="tab" aria-selected={fieldTab === "competitor"}>竞品库</button>
        <button type="button" className={`screen-tab ${fieldTab === "inspiration" ? "active" : ""}`} onClick={() => setFieldTab("inspiration")} role="tab" aria-selected={fieldTab === "inspiration"}>灵感库</button>
        <button type="button" className={`screen-tab ${fieldTab === "all" ? "active" : ""}`} onClick={() => setFieldTab("all")} role="tab" aria-selected={fieldTab === "all"}>所有字段</button>
      </div>
      {notice && <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>{notice}</div>}
      <div className="field-card-list">
        {visibleFields.map((field) => (
          <FieldCard
            key={field.key}
            field={field}
            onOptionsChange={!field.official ? (options) => updateField(field.key, { options }) : undefined}
            onEntitiesChange={!field.official ? (entities) => updateField(field.key, { entities }) : undefined}
            onRename={!field.official ? (name) => updateField(field.key, { name }) : undefined}
            onMultiChange={(multi) => updateField(field.key, { multi })}
            onDelete={!field.official ? () => deleteCustomField(field.key) : undefined}
          />
        ))}
        {visibleFields.length === 0 && (
          <div style={{ padding: "20px 0", color: "var(--text-3)", fontSize: 12.5, textAlign: "center" }}>
            暂无字段，点击下方「新建字段」添加
          </div>
        )}
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
        <Btn icon="plus" variant="ghost" onClick={() => setShowNewField(true)}>新建字段</Btn>
      </div>
      {showNewField && (
        <NewFieldModal
          onClose={() => setShowNewField(false)}
          onCreate={async (fd) => { await addCustomField(fd); setShowNewField(false); }}
        />
      )}
    </>
  );
}
