/* global React, Icon, Tag, Btn, Switch, Placeholder, DemandThumb, PLATFORM_LABEL, PLATFORM_ICON, PLATFORM_KEY */
const React = globalThis.React;
const Icon = globalThis.Icon;
const Tag = globalThis.Tag;
const Btn = globalThis.Btn;
const Switch = globalThis.Switch;
const Placeholder = globalThis.Placeholder;
const DemandThumb = globalThis.DemandThumb;
const PLATFORM_LABEL = globalThis.PLATFORM_LABEL;
const PLATFORM_ICON = globalThis.PLATFORM_ICON;
const PLATFORM_KEY = globalThis.PLATFORM_KEY;
const { useState, useEffect, useMemo, useRef } = React;

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

const SUPPORTED_PRODUCT_PLATFORMS = ["amazon", "taobao", "kickstarter"];
const SUPPORTED_INSPIRATION_PLATFORMS = ["xiaohongshu", "kickstarter"];

function platformClass(platform) {
  return PLATFORM_KEY[platform] || "";
}

function platformLabel(platform) {
  return PLATFORM_LABEL[platform] || platform || "未知平台";
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
  if (platform === "kickstarter") {
    return [
      { key: "price", label: "档位金额", prefix: "$" },
      { key: "cost", label: "参考成本", prefix: "¥" },
      { key: "creator", label: "发起人" },
      { key: "pledged_amount", label: "认缴金额" },
      { key: "goal_amount", label: "目标金额" },
      { key: "backers", label: "支持者", inputMode: "numeric" },
    ];
  }
  if (platform === "taobao") {
    return [
      { key: "price", label: "售价", prefix: "¥" },
      { key: "cost", label: "参考成本", prefix: "¥" },
      { key: "sales", label: "月销估算", suffix: "/ 月", inputMode: "numeric" },
    ];
  }
  if (platform === "xiaohongshu") {
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
    { key: "sales", label: "月销估算", suffix: "/ 月", inputMode: "numeric" },
  ];
}

function createEmptyPlatform(platform = "amazon") {
  return {
    id: `${platform}-${Date.now()}`,
    platform,
    url: "",
    price: "",
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
  const wechat = list.filter((n) => isWechatNewsItem(n));
  const googleNews = list.filter((n) => isGoogleNewsItem(n));
  return {
    all: list.length,
    wechat: wechat.length,
    trend: googleNews.length,
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
  if (tab === "微信公众号") {
    return {
      title: sampleWorkspace ? "正在等待公众号内容" : "还没有公众号资讯",
      body: "公众号文章同步进来后，这里会展示对应内容。",
    };
  }
  if (tab === "Google News") {
    return {
      title: sampleWorkspace ? "正在等待 Google News 内容" : "还没有 Google News 资讯",
      body: "Google News 聚合内容同步进来后，这里会展示对应内容。",
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
const OFFICIAL_FIELD_DEFS = [
  { key: "brand",       name: "品牌",    tagGroupKey: "competitor_brands",  official: true,  multi: true,  entities: ["competitor"],               tone: "outline" },
  { key: "host",        name: "主机",    tagGroupKey: "camera_brands",      official: true,  multi: false, entities: ["competitor"],               tone: "outline" },
  { key: "category",    name: "品类",    tagGroupKey: "product_categories", official: true,  multi: true,  entities: ["competitor"],               tone: "default" },
  { key: "scenarios",   name: "使用场景", tagGroupKey: "scenarios",          official: true,  multi: true,  entities: ["competitor", "inspiration"], tone: "accent"  },
  { key: "painpoints",  name: "用户痛点", tagGroupKey: "painpoints",         official: true,  multi: true,  entities: ["competitor", "inspiration"], tone: "danger"  },
  { key: "innovation",  name: "创新类型", tagGroupKey: "innovation_types",   official: true,  multi: false, entities: ["inspiration"],              tone: "success" },
  { key: "custom_tags", name: "自定义标签", tagGroupKey: "custom_tags",      official: true,  multi: true,  entities: ["competitor", "inspiration"], tone: "outline" },
];

function normalizeFields(fieldsOrGroups, fallbackGroups = [], options = {}) {
  const includeDefaults = options.includeDefaults === true;
  const source = Array.isArray(fieldsOrGroups) ? fieldsOrGroups : [];
  const byKey = new Map();
  const addField = (field) => {
    if (!field?.key || byKey.has(field.key)) return;
    byKey.set(field.key, field);
  };
  if (source.some((item) => item?.options || item?.official !== undefined || item?.legacyKey)) {
    source.map((field) => ({
      key: field.key,
      name: field.name || field.key,
      tagGroupKey: field.legacyKey || field.key,
      legacyKey: field.legacyKey || field.key,
      official: field.official !== false,
      multi: field.multi !== false,
      entities: Array.isArray(field.entities) ? field.entities : ["competitor"],
      tone: field.tone || "outline",
      options: Array.isArray(field.options) ? field.options : [],
    })).forEach(addField);
  } else {
    const groups = source.length ? source : safeArray(fallbackGroups);
    const officialGroupKeys = new Set(OFFICIAL_FIELD_DEFS.map((d) => d.tagGroupKey));
    groups
      .filter((g) => !officialGroupKeys.has(g.key))
      .map((g) => ({
        key: g.key,
        name: g.name || g.key,
        tagGroupKey: g.key,
        legacyKey: g.key,
        official: false,
        multi: g.multi !== false,
        entities: Array.isArray(g.entities) ? g.entities : ["competitor", "inspiration"],
        tone: g.tone || "outline",
        options: Array.isArray(g.tags) ? g.tags : [],
      }))
      .forEach(addField);
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
          options: Array.isArray(group?.tags) ? group.tags : [],
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
            onClick={() => onFeishuLogin?.()} disabled={busy}>
            <img src="/feishu.png" alt="" />
            使用飞书登录
          </button>

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
const DIGEST_MOCK = [
  { id: "d1", kind: "launch", headline: "友商新品首次切入低价带，产品线明显下探", connection: "可对照你竞品库中追踪的同类竞品", sourceCount: 2 },
  { id: "d2", kind: "trend", headline: "本周 AI 搜索相关报道密集，多家媒体集中发声", connection: "与需求雷达中 2 条关注的用户痛点关键词重叠", sourceCount: 5 },
  { id: "d3", kind: "unknown_signal", headline: "新兴品牌获融资，专注你尚未追踪的细分赛道", connection: null, sourceCount: 1 },
];

function DailyDigestCard({ data }) {
  const today = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
  const hasLlm = Boolean(data.settings?.llm_configured);
  if (!hasLlm) {
    return (
      <div className="briefing-card briefing-card-collapsed">
        <Icon name="sparkles" size={12} style={{ color: "var(--text-4)" }} />
        <span className="briefing-collapsed-text">配置 LLM 后，每天自动生成行业摘要</span>
      </div>
    );
  }
  return (
    <div className="briefing-card">
      <div className="briefing-card-head">
        <Icon name="sparkles" size={13} style={{ color: "var(--accent)" }} />
        <span className="briefing-card-title">今日总结</span>
        <span className="briefing-card-date">{today}</span>
        <Btn size="sm" variant="ghost" icon="sync" />
      </div>
      <div className="briefing-card-body">
        {DIGEST_MOCK.map((item) => <InsightItem key={item.id} item={item} />)}
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
  const [tab, setTab] = useState("微信公众号");
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState(data.newsCounts || { all: 0, wechat: 0, trend: 0, starred: 0 });
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
    setCounts(data.newsCounts || { all: 0, wechat: 0, trend: 0, starred: 0 });
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
    if (nextTab === "微信公众号") params.set("source_group", "wechat-exporter");
    const result = await api(`/api/news?${params.toString()}`);
    let groups = buildNewsGroups(result.items || result, data.settings?.tag_groups);
    if (nextTab === "Google News") groups = groups.filter((item) => isGoogleNewsItem(item));
    setItems(groups);
    if (nextTab === "all") setCounts(newsGroupCounts(groups));
    if (result.counts) setCounts((current) => ({ ...current, ...result.counts, all: result.counts.all ?? current.all }));
  };

  useEffect(() => {
    loadNews(tab).catch(() => {});
    setVisibleCount(initialBatchSize);
  }, [tab]);

  useEffect(() => {
    if (!navTarget || navTarget.screen !== "news") return;
    setTab("微信公众号");
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
          <DailyDigestCard data={data} />
        </div>

        <div className="news-sidebar-resizer" onMouseDown={onResizerMouseDown}>
          <div className="news-sidebar-resizer-dots" />
        </div>

        <div className="news-feed-col">
          <div className="news-tabs">
            {[
            ["微信公众号", "微信公众号", counts.wechat],
            ["Google News", "Google News", counts.trend],
            ["starred", "已收藏", counts.starred],
            ["all", "全部", counts.all]].
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
            <div className="page page-fluid news-feed-page" style={{ paddingTop: 8 }}>
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
  const inputRef = React.useRef(null);
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
      
      {product.image ?
      <img src={product.image} alt="" /> :

      <span style={{ fontSize: 16 }}>{product.emoji}</span>
      }
      <span className="product-image-slot-overlay"><Icon name="plus" size={11} /></span>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPick} />
    </div>);

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
  const fields = platformMetricConfig(platform.platform);
  const url = platform.url || platform.source_url || "";
  return (
    <div className="platform-card">
      <div className="platform-card-head">
        <span className={`platform-pill ${platformClass(platform.platform)}`}>{platformLabel(platform.platform)}</span>
        {url ?
          <a className="platform-card-link" href={externalHref(url)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title={url}>
            打开链接
            <Icon name="external" size={12} />
          </a> :
          <span className="platform-card-link">{platformLabel(platform.platform)}</span>
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
          onChange={(event) => onUpdate(index, { url: event.target.value })}
          placeholder={`${platformLabel(platform.platform)} 链接`}
        />
      </div>
      <div className={`platform-card-grid ${platform.platform === "taobao" ? "compact" : ""}`}>
        {fields.map((field) =>
          <PlatformInput
            key={field.key}
            label={field.label}
            value={field.key === "sales" ? normalizeMonthlySales(platform[field.key]) : platform[field.key]}
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
  const available = SUPPORTED_PRODUCT_PLATFORMS.filter((platform) => !safeArray(existingPlatforms).some((item) => item.platform === platform));
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
  const [selectedId, setSelectedId] = useState(products[0]?.id || null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [priceCcy, setPriceCcy] = useState("native"); // unused (toggle removed)
  const [addFieldOpen, setAddFieldOpen] = useState(false);

  useEffect(() => {
    if (!products.some((p) => p.id === selectedId)) {
      setSelectedId(products[0]?.id || null);
    }
  }, [products, selectedId]);
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
    const next = safeArray(selected?.platforms).map((platform, idx) => idx === index ? { ...platform, ...patch } : platform);
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
    <div className={`products-layout ${selected && !detailCollapsed ? "" : "no-detail"}`}>
      <div className="products-main">
        <div className={`products-toolbar ${selected && !detailCollapsed ? "with-detail" : ""}`}>
          <div className="products-toolbar-search">
            <Icon name="search" size={14} style={{ position: "absolute", left: 9, top: 8, color: "var(--text-3)" }} />
            <input className="input" placeholder="搜索竞品..." value={query} onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 30, width: "100%" }} />
          </div>
          <select className="input sm products-toolbar-filter" style={{ height: 30, paddingRight: 24 }}
          value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            {categories.map((c) =>
            <option key={c} value={c}>{c === "全部" ? "全部品类" : c}</option>
            )}
          </select>
          <div className="products-toolbar-actions page-actions">
            <Tag tone="outline" className="products-toolbar-count">{filtered.length} 条</Tag>
            {filtered.length > 0 && !selectMode && (
              <Btn size="sm" variant="ghost" className="select-trigger" onClick={() => setSelectMode(true)}>选择</Btn>
            )}
            <Btn size="sm" variant="ghost" icon="sync" onClick={syncProducts}>同步飞书</Btn>
          </div>
        </div>
        {notice && <div className="ai-block" style={{ margin: "0 12px 10px" }}>{notice}</div>}
        {filtered.length > 0 &&
          <div className={`bulk-toolbar products-selection-bar ${selectMode ? "" : "idle"}`} style={{ margin: "0 12px 10px" }}>
            {selectMode ?
            <>
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
              </> :
            null
            }
          </div>
        }

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
                const reviews = Number(main.reviews);
                return (
                  <tr key={p.id} className={selectedId === p.id ? "selected" : ""} onClick={() => { setSelectedId(p.id); setDetailCollapsed?.(false); }}>
                    {selectMode && <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} />
                    </td>}
                    <td>
                      <div className="product-name">
                        <div className="products-thumb">{p.emoji || "📦"}</div>
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
                        {platforms.map((pl, i) =>
                        <span key={i} className={`platform-pill ${PLATFORM_KEY[pl.platform]}`}>{PLATFORM_ICON[pl.platform]}</span>
                        )}
                        {platforms.length === 0 && <span style={{ color: "var(--text-3)" }}>—</span>}
                      </div>
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{main.price || "—"}</td>
                    <td style={{ color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{main.cost || p.cost_estimate || "—"}</td>
                    <td>
                      <span className="rating-cell"><span className="rating-star">★</span>{main.rating ?? "—"}</span>
                      {Number.isFinite(reviews) && <span style={{ color: "var(--text-3)", marginLeft: 6, fontSize: 11 }}>{reviews.toLocaleString()}</span>}
                    </td>
                    <td style={{ color: "var(--text-2)" }}>{main.sales || "—"}</td>
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
          {paged.total > pageSize && (
            <div className="products-pagination-shell">
              <PaginationBar page={paged.currentPage} total={paged.total} pageSize={pageSize} onPageChange={setPage} label="条竞品" />
            </div>
          )}
        </div>
      </div>

      {selected && !detailCollapsed &&
      <div className="detail">
          <div className="detail-head">
            <ProductImageSlot product={selected} onChange={(img) => updateSelected({ image: img })} />
            <h3>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{selected.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 400, marginTop: 1 }}>
                  录入 {selected.synced_at ? "· 已同步 " + selected.synced_at : "· 未同步"}
                </div>
              </div>
            </h3>
            <Btn variant="ghost" icon="trash" onClick={() => setDeleteTarget(selected)} title="删除竞品" />
            <Btn
              variant="ghost"
              icon="external"
              title="打开主平台链接"
              disabled={!safeArray(selected.platforms)[0]?.url}
              onClick={() => {
                const url = safeArray(selected.platforms)[0]?.url;
                if (url) window.open(externalHref(url), "_blank", "noopener,noreferrer");
              }}
            />
          </div>

          <div className="detail-body">
            <div className="detail-section">
              <div className="detail-section-label">
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
              const fields = normalizeFields(data.settings?.fields, data.settings?.tag_groups, { includeDefaults: true });
              const competitorFields = fields.filter((f) => f.entities.includes("competitor") && entityUsesField(selected, f));
              const attachField = async (field) => {
                await updateSelected(buildFieldPatch(field.key, []));
              };
              return (
                <>
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
                  <div className="detail-section detail-add-field-wrap">
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
                </>
              );
            })()}

            <div className="detail-section">
              <div className="detail-section-label"><Icon name="sparkles" size={11} /> 核心卖点 · AI 总结 + 用户补充</div>
              <DetailFieldCard>
                <BulletListEditor
                items={safeArray(selected.selling_points)}
                onChange={(next) => updateSelected({ selling_points: next })}
                tone="success"
                placeholder="输入卖点，回车添加" />
              </DetailFieldCard>
            </div>

            <div className="detail-section">
              <div className="detail-section-label"><Icon name="tag" size={11} /> 差评关键词</div>
              <DetailFieldCard>
                <BulletListEditor
                items={safeArray(selected.negative_keywords)}
                onChange={(next) => updateSelected({ negative_keywords: next })}
                tone="danger"
                placeholder="输入差评关键词，回车添加" />
              </DetailFieldCard>
            </div>

            <div className="detail-section">
              <div className="detail-section-label"><Icon name="sparkles" size={11} /> AI 摘要</div>
              <div className="ai-block">{selected.ai_summary || "暂无 AI 摘要，添加真实链接解析后会自动生成。"}</div>
            </div>

            <div className="detail-section">
              <Btn variant="default" icon="sync" onClick={syncProducts} style={{ width: "100%", justifyContent: "center" }}>同步至飞书多维表格</Btn>
            </div>
          </div>
        </div>
      }

      {deleteTarget && <DeleteItemsConfirmModal entityLabel="竞品" items={[deleteTarget]} busy={deleteBusy} onClose={() => !deleteBusy && setDeleteTarget(null)} onConfirm={deleteOne} />}
      {showBulkDeleteConfirm && <DeleteItemsConfirmModal entityLabel="竞品" items={selectedProducts} busy={deleteBusy} onClose={() => !deleteBusy && setShowBulkDeleteConfirm(false)} onConfirm={deleteBulk} />}
    </div>);

}
window.ProductsScreen = ProductsScreen;

// AddProduct modal with AI parse animation
function AddProductModal({ onClose, api, refreshData }) {
  const [step, setStep] = useState("input"); // input | parsing | preview
  const [progress, setProgress] = useState(0);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  const platforms = SUPPORTED_PRODUCT_PLATFORMS;
  const [platform, setPlatform] = useState("amazon");

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
      setPreview(result);
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
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 96, height: 96 }}>
                  <Placeholder label={"product\nimage"} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>{preview?.name || "未命名竞品"}</div>
                  <div className="tag-row">
                    <Tag tone="accent">{preview?.category || "未分类"}</Tag>
                    {(preview?.tags || []).slice(0, 3).map((tag) => <Tag key={tag}>{tag}</Tag>)}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-3)" }}>
                    <Icon name="sparkles" size={11} /> AI 已填充 7 个字段,可逐项修改
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
              ["售价", preview?.platforms?.[0]?.price || ""], ["参考成本", preview?.platforms?.[0]?.cost || ""], ["评分", preview?.platforms?.[0]?.rating || ""],
              ["评论数", preview?.platforms?.[0]?.reviews || ""], ["月销估算", preview?.platforms?.[0]?.sales || ""], ["平台", PLATFORM_LABEL[preview?.platform] || preview?.platform || platform]].
              map(([k, v]) =>
              <div key={k}>
                    <label className="field-label">{k}</label>
                    <input className="input" style={{ width: "100%" }} defaultValue={v} />
                  </div>
              )}
              </div>
              <div>
                <label className="field-label">核心卖点 (回车添加)</label>
                <div className="tag-row" style={{ padding: 6, border: "1px solid var(--border)", borderRadius: 6, minHeight: 36 }}>
                  {(preview?.selling_points || []).map((point) => <Tag key={point} tone="success">{point}</Tag>)}
                </div>
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
                  platform,
                  source_url: url,
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
function DemandsScreen({ data, api, refreshData, navTarget }) {
  const [demands, setDemands] = useState(safeArray(data.demands));
  useEffect(() => setDemands(safeArray(data.demands)), [data.demands]);
  const [filterScenario, setFilterScenario] = useState("");
  const [filterInnov, setFilterInnov] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [viewMode, setViewMode] = useState("card");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = demands.find((d) => d.id === selectedId);

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
      setNotice("需求雷达已同步到飞书。");
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

  return (
    <div className="viewport">
      <div className="page page-fluid">
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

        <div className="demand-toolbar">
          <div className="demand-toolbar-cluster">
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="demand-match-count">匹配 {filtered.length} 条</span>
            {filtered.length > 0 && !selectMode && (
              <Btn size="sm" variant="ghost" className="select-trigger" onClick={() => setSelectMode(true)}>选择</Btn>
            )}
          </div>
        </div>

        {filtered.length > 0 && selectMode &&
          <div className="bulk-toolbar" style={{
            marginBottom: 12,
            borderRadius: 14,
            background: "color-mix(in srgb, var(--surface) 86%, transparent)",
            boxShadow: "0 10px 30px rgba(0,0,0,.06)",
          }}>
            <div className="bulk-left">
              <Btn size="sm" variant="ghost" onClick={() => setSelectMode(false)}>取消选择</Btn>
              <Btn size="sm" variant="ghost" icon="trash" disabled={!selectedIds.length} onClick={() => setShowBulkDeleteConfirm(true)}>批量删除</Btn>
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

        {viewMode === "card" ?
        <div className="demands-grid">
          {paged.items.map((d) =>
          <div className="demand-card" key={d.id} onClick={() => setSelectedId(d.id)} style={{ cursor: "pointer" }}>
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
                {demandSourceUrl(d) ?
                <a
                  className="demand-title demand-title-link"
                  href={externalHref(demandSourceUrl(d))}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                    <span>{d.title}</span>
                    <Icon name="external" size={12} />
                  </a> :
                <div className="demand-title">{d.title}</div>
                }
                <div className="demand-summary">{d.summary}</div>
                <div className="demand-tags">
                  <Tag tone="accent">{d.innovation}</Tag>
                  {safeArray(d.scenarios).slice(0, 2).map((s) => <Tag key={s}>#{s.split("/")[0]}</Tag>)}
                  {safeArray(d.painpoints).slice(0, 1).map((p) => <Tag tone="danger" key={p}>{p.split("/")[0]}</Tag>)}
                </div>
                <div className="demand-foot">
                  <span><Icon name="calendar" size={10} /> {d.date}</span>
                  <span><Icon name="sparkles" size={10} /> AI 打标</span>
                </div>
              </div>
            </div>
          )}
          {filtered.length === 0 &&
            <div style={{ gridColumn: "1 / -1" }}>
              <EmptyState
                icon="lightbulb"
                title={demands.length ? "没有匹配的需求" : "还没有真实需求"}>
                请使用 Chrome 插件采集。
              </EmptyState>
            </div>
          }
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
              <tr key={d.id} className={selectedId === d.id ? "selected" : ""} onClick={() => setSelectedId(d.id)}>
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
        }
        <PaginationBar page={paged.currentPage} total={paged.total} pageSize={pageSize} onPageChange={setPage} label="条灵感" />
      </div>

      {selected && <DemandDetailDrawer demand={selected} api={api} refreshData={refreshData} fields={data.settings?.fields} tagGroups={data.settings?.tag_groups} onCreateTagOption={createTagOption} onClose={() => setSelectedId(null)} onRequestDelete={openDeleteConfirm} />}
      {deleteTarget && <DeleteDemandConfirmModal demand={deleteTarget} busy={deleteBusy} onClose={() => !deleteBusy && setDeleteTarget(null)} onConfirm={confirmDelete} />}
      {showBulkDeleteConfirm && <DeleteItemsConfirmModal entityLabel="需求" items={selectedItems} busy={deleteBusy} onClose={() => !deleteBusy && setShowBulkDeleteConfirm(false)} onConfirm={async () => { await deleteSelected(); setShowBulkDeleteConfirm(false); }} />}
    </div>);

}
window.DemandsScreen = DemandsScreen;

function DemandDetailDrawer({ demand, onClose, api, refreshData, onRequestDelete, fields = [], tagGroups = [], onCreateTagOption, onNavigateSettings }) {
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const save = async (patch) => {
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
  const sourceUrl = demandSourceUrl(demand);
  return (
    <div className="drawer-root" onClick={onClose}>
      <div className="drawer-overlay" />
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="drawer-head-main">
            <span className={`platform-pill ${PLATFORM_KEY[demand.source] || ""}`}>{PLATFORM_LABEL[demand.source] || demand.source}</span>
            <span className="drawer-head-meta"><Icon name="calendar" size={10} /> {demand.date}</span>
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
          <DemandSourceCard demand={demand} />

          <div className="detail-section">
            <div className="detail-section-label">原文正文</div>
            <textarea className="ghost-input drawer-textarea" defaultValue={demand.original_content || demand.summary}
            onBlur={(e) => save({ original_content: e.target.value, summary: e.target.value })}
            style={{ width: "100%", minHeight: 70, lineHeight: 1.6, resize: "vertical", fontSize: 12.5 }} />
          </div>

          {(() => {
            const normalizedFields = normalizeFields(fields, tagGroups, { includeDefaults: true });
            const inspirationFields = normalizedFields.filter((f) => f.entities.includes("inspiration") && entityUsesField(demand, f));
            const attachField = async (field) => {
              await save(buildFieldPatch(field.key, []));
            };
            return (
              <>
                {inspirationFields.map((field) => (
                  <FieldRow
                    key={field.key}
                    field={field}
                    entity={demand}
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
                        entity={demand}
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
            defaultValue={demand.note || ""}
            onBlur={(e) => save({ note: e.target.value })}
            style={{ width: "100%", minHeight: 60, resize: "vertical", fontSize: 12.5 }} />
          </div>

          <div className="detail-section" style={{ display: "flex", gap: 6 }}>
            <Btn variant="default" icon="sync" onClick={syncDemand} style={{ flex: 1, justifyContent: "center" }}>同步飞书</Btn>
            <Btn variant="ghost" icon="trash" onClick={() => onRequestDelete?.(demand)}>删除</Btn>
          </div>
        </div>
      </div>
    </div>);

}
window.DemandDetailDrawer = DemandDetailDrawer;

function ProductDetailDrawer({ product, onClose, api, refreshData }) {
  const [draft, setDraft] = useState(product);
  useEffect(() => setDraft(product), [product]);
  const save = async (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (api) {
      const nextPatch = patch.image !== undefined ? { ...patch, image_override: "manual" } : patch;
      await api(`/api/products/${product.id}`, { method: "PATCH", body: JSON.stringify(nextPatch) });
      await refreshData?.();
    }
  };
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
            <div className="detail-section-label">品牌</div>
            <input
              className="ghost-input"
              defaultValue={draft.brand || draft.name?.split(/[\s·]/)[0] || ""}
              onBlur={(e) => save({ brand: e.target.value })}
              style={{ width: "100%", fontSize: 13, fontWeight: 600 }}
            />
          </div>
          <div className="detail-section">
            <div className="detail-section-label"><Icon name="boxes" size={11} /> 平台信息 · {safeArray(draft.platforms).length} 个</div>
            {safeArray(draft.platforms).map((pl, i) =>
              <div className="platform-card" key={i}>
                <div className="platform-card-head">
                  <span className={`platform-pill ${PLATFORM_KEY[pl.platform]}`}>{PLATFORM_LABEL[pl.platform] || pl.platform}</span>
                  {pl.url ?
                    <a className="platform-card-link" href={externalHref(pl.url)} target="_blank" rel="noreferrer">
                      {pl.url}
                      <Icon name="external" size={12} />
                    </a> :
                    <span className="platform-card-link">{pl.platform || "未知平台"}</span>
                  }
                </div>
                <div className={`platform-card-grid ${pl.platform === "taobao" ? "compact" : ""}`}>
                  <div><div className="metric-label">售价</div><div className="metric-value">{pl.price || "—"}</div></div>
                  {pl.platform !== "taobao" && <>
                  <div><div className="metric-label">评分</div><div className="metric-value">{pl.rating ?? "—"}</div></div>
                  <div><div className="metric-label">评论数</div><div className="metric-value">{pl.reviews ?? "—"}</div></div>
                  </>}
                  <div><div className="metric-label">月销估算</div><div className="metric-value">{pl.sales || "—"}</div></div>
                </div>
              </div>
            )}
          </div>
          <div className="detail-section">
            <div className="detail-section-label">品类 / 标签</div>
            <DemandTagList items={safeArray(draft.tags)} />
          </div>
          <div className="detail-section">
            <div className="detail-section-label"><Icon name="sparkles" size={11} /> 核心卖点</div>
            <DemandTagList items={safeArray(draft.selling_points)} tone="accent" />
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

function AddDemandModal({ onClose, api, refreshData, tagGroups = [], onCreateTagOption }) {
  const [step, setStep] = useState("input");
  const [progress, setProgress] = useState(0);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

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
      setPreview(result);
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
                  defaultValue={preview?.original_content || preview?.summary || ""}
                  style={{ width: "100%", minHeight: 70, lineHeight: 1.6, fontSize: 12.5, resize: "vertical" }} />
              </div>

              <div className="detail-section">
                <MultiSelectField
                  label="创新类型"
                  fieldKey="innovation"
                  values={[preview?.innovation || "待分类"]}
                  tagGroups={tagGroups}
                  tone="success"
                  single
                  onChange={(values) => setPreview({ ...(preview || {}), innovation: values[0] || "待分类" })}
                  onCreateOption={onCreateTagOption}
                />
              </div>

              <div className="detail-section">
                <MultiSelectField
                  label="使用场景"
                  fieldKey="scenarios"
                  values={preview?.scenarios}
                  tagGroups={tagGroups}
                  tone="accent"
                  onChange={(values) => setPreview({ ...(preview || {}), scenarios: values })}
                  onCreateOption={onCreateTagOption}
                />
              </div>

              <div className="detail-section">
                <MultiSelectField
                  label="用户痛点"
                  fieldKey="painpoints"
                  values={preview?.painpoints}
                  tagGroups={tagGroups}
                  tone="danger"
                  onChange={(values) => setPreview({ ...(preview || {}), painpoints: values })}
                  onCreateOption={onCreateTagOption}
                />
              </div>

              <div className="detail-section">
                <div className="detail-section-label">备注</div>
                <textarea className="ghost-input drawer-textarea compact" placeholder="补充备注、相关资料链接..."
                  style={{ width: "100%", minHeight: 50, fontSize: 12.5, resize: "vertical" }} />
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
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const items = safeArray(data.research);
  const pageSize = 8;
  const paged = paginate(items, page, pageSize);

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
      <div className="page page-fluid">
        <div className="screen-header screen-header-compact" style={{ marginBottom: 18 }}>
          <div className="screen-header-left">
            <div className="screen-icon-box"><Icon name="compass" size={18} /></div>
            <div className="muted text-sm">从竞品库与需求雷达中匹配数据，AI 生成结构化分析报告</div>
          </div>
          <div className="page-actions">
            {items.length > 0 && !selectMode && <Btn size="sm" variant="ghost" className="select-trigger" onClick={() => setSelectMode(true)}>选择</Btn>}
            <Btn className="weave-create-btn" variant="primary" icon="plus" onClick={() => setShowCreate(true)}>新建调研项目</Btn>
          </div>
        </div>

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
              <Tag tone={r.status === "已完成" ? "success" : r.status === "分析中" ? "warn" : "default"}>
                {r.status === "已完成" && "✓ "}
                {r.status === "分析中" && "⏳ "}
                {r.status === "草稿" && "📝 "}
                {r.status}
              </Tag>
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
        {showCreate && <CreateResearchModal api={api} refreshData={refreshData} onClose={() => setShowCreate(false)} />}
        {deleteTarget && <DeleteItemsConfirmModal entityLabel="调研" items={[deleteTarget]} busy={deleteBusy} onClose={() => !deleteBusy && setDeleteTarget(null)} onConfirm={deleteOne} />}
        {showBulkDeleteConfirm && <DeleteItemsConfirmModal entityLabel="调研" items={selectedItems} busy={deleteBusy} onClose={() => !deleteBusy && setShowBulkDeleteConfirm(false)} onConfirm={deleteBulk} />}
      </div>
    </div>);

}
window.ResearchScreen = ResearchScreen;

// ============ KNOWLEDGE ============
function KnowledgeScreen({ data, api, initialPane = "import" }) {
  const workspaceId = data.workspace?.id || "";
  const [projectId, setProjectId] = useState("demo-project");
  const [docType, setDocType] = useState("prd");
  const [pasteText, setPasteText] = useState("功能需求\n产品需支持单手快拆。\n\n包装需求\n需要包含说明书与保护内托。\n\n待确认问题\n认证范围是否覆盖海外销售？");
  const [lastImport, setLastImport] = useState(null);
  const [lastPack, setLastPack] = useState(null);
  const [question, setQuestion] = useState("这份 PRD 定义了哪些功能？");
  const [answer, setAnswer] = useState(null);
  const [draft, setDraft] = useState(null);
  const [graph, setGraph] = useState(null);
  const [fusionCandidates, setFusionCandidates] = useState([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [activeDocSection, setActiveDocSection] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [activePane, setActivePane] = useState(initialPane);
  const [audience, setAudience] = useState("internal");
  const [publishPolicy, setPublishPolicy] = useState({
    rag_enabled: true,
    bot_enabled: true,
    supplier_visible: false,
    sales_visible: false,
  });
  const projectOptions = useMemo(() => {
    const fromProducts = safeArray(data.products).map((item) => item.project_id).filter(Boolean);
    const fromResearch = safeArray(data.research).map((item) => item.project_id || item.id).filter(Boolean);
    return Array.from(new Set(["demo-project", ...fromProducts, ...fromResearch])).slice(0, 8);
  }, [data.products, data.research]);
  const importedSections = safeArray(lastImport?.document?.content?.normalized_sections);
  const draftSections = safeArray(draft?.sections);
  const selectedDraftSection = draftSections.find((section) => section.key === activeDocSection) || draftSections[0] || null;
  const workspaceReady = Boolean(workspaceId);
  const workflow = [
    { key: "import", title: "导入", desc: lastImport ? `${importedSections.length} 个标准章节` : "粘贴飞书/PRD/MRD 文本", done: Boolean(lastImport), icon: "file-text" },
    { key: "publish", title: "发布", desc: lastImport?.document?.status === "published" ? "已进入 RAG 索引" : "权限过滤后再入库", done: lastImport?.document?.status === "published", icon: "shield" },
    { key: "graph", title: "图谱", desc: graph ? `${safeArray(graph.nodes).length} nodes / ${safeArray(graph.edges).length} edges` : "只读查看关联", done: Boolean(graph), icon: "network" },
    { key: "pack", title: "资料包", desc: lastPack ? `${lastPack.sources?.length || 0} sources / ${lastPack.chunks?.length || 0} chunks` : "汇总项目证据", done: Boolean(lastPack), icon: "layers" },
    { key: "answer", title: "问答", desc: answer ? `${safeArray(answer.citations).length} 条引用` : "只回答授权资料", done: Boolean(answer), icon: "bot" },
    { key: "draft", title: "草稿", desc: draft ? `${draft.document?.doc_type?.toUpperCase()} · ${draftSections.length} 节` : "生成 MRD / PRD", done: Boolean(draft), icon: "edit" },
  ];
  const panes = [
    {
      key: "import",
      icon: "file-text",
      title: "导入资料",
      desc: lastImport ? `${importedSections.length} 个章节已标准化` : "先把飞书/PRD/MRD 文本放进来",
    },
    {
      key: "query",
      icon: "bot",
      title: "知识问答",
      desc: lastPack ? `${lastPack.chunks?.length || 0} 个片段可检索` : "发布资料后再构建资料包",
    },
    {
      key: "graph",
      icon: "network",
      title: "图谱治理",
      desc: graph ? `${safeArray(graph.nodes).length} 个节点` : "查看实体、关系和待确认合并",
    },
    {
      key: "draft",
      icon: "edit",
      title: "文档生成",
      desc: draft ? `${draft.document?.doc_type?.toUpperCase()} 草稿已生成` : "从资料包生成 MRD / PRD",
    },
  ];
  const activePaneMeta = panes.find((pane) => pane.key === activePane) || panes[0];
  useEffect(() => {
    setActivePane(initialPane);
  }, [initialPane]);
  const coverage = lastPack ? Math.round((lastPack.coverage_score || 0) * 100) : 0;
  const modelLabel = answer?.model_status || draft?.model_status?.reason || "deterministic / ready";

  const run = async (label, task) => {
    setBusy(label);
    setNotice("");
    try {
      const result = await task();
      setNotice(`${label}完成`);
      return result;
    } catch (error) {
      setNotice(error.message || `${label}失败`);
      return null;
    } finally {
      setBusy("");
    }
  };

  const importDocument = async () => run("导入", async () => {
    if (!workspaceId) throw new Error("当前账号还没有分配工作区");
    const result = await api("/api/document-imports/paste", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, doc_type: docType, text: pasteText }),
    });
    setLastImport(result);
    setGraph(null);
    setFusionCandidates([]);
    setSelectedEntityId(result.knowledge?.entities?.[0]?.id || "");
    setActiveDocSection(result.document?.content?.normalized_sections?.[0]?.key || "");
    setActivePane("import");
    return result;
  });
  const publishImported = async () => {
    const documentId = lastImport?.document?.id;
    if (!documentId) return setNotice("请先导入文档");
    return run("发布索引", async () => {
      const result = await api(`/api/documents/${documentId}/publish`, {
        method: "POST",
        body: JSON.stringify(publishPolicy),
      });
      setLastImport({ ...lastImport, document: result.document, indexed: result.indexed });
      setActivePane("graph");
      return result;
    });
  };
  const loadGraph = async () => {
    if (!lastImport?.document?.id) return setNotice("请先导入并发布文档");
    return run("加载图谱", async () => {
      const entities = await api(`/api/knowledge/entities?project_id=${encodeURIComponent(projectId)}`);
      const documentEntities = safeArray(entities).filter((entity) => safeArray(entity.source_refs).some((ref) => ref.document_id === lastImport.document.id));
      const root = documentEntities.find((entity) => entity.id === selectedEntityId) || documentEntities[0];
      const graphResult = root ? await api(`/api/knowledge/entities/${root.id}/graph?depth=2`) : { nodes: [], edges: [] };
      const candidates = await api(`/api/knowledge/fusion-candidates?project_id=${encodeURIComponent(projectId)}`);
      setSelectedEntityId(root?.id || "");
      setGraph(graphResult);
      setFusionCandidates(candidates);
      setActivePane("graph");
      return graphResult;
    });
  };
  const patchFusion = async (candidateId, status) => run(status === "approved" ? "确认合并" : "拒绝合并", async () => {
    const result = await api(`/api/knowledge/fusion-candidates/${candidateId}`, {
      method: "PATCH",
      body: JSON.stringify({ project_id: projectId, status }),
    });
    setFusionCandidates((items) => safeArray(items).map((item) => item.id === candidateId ? result : item));
    return result;
  });
  const buildPack = async () => run("构建资料包", async () => {
    if (!workspaceId) throw new Error("当前账号还没有分配工作区");
    const result = await api("/api/knowledge/packs/build", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, title: "Demo Knowledge Pack" }),
    });
    setLastPack(result);
    setActivePane("query");
    return result;
  });
  const askQuestion = async () => {
    if (!lastPack?.id) return setNotice("请先构建 Knowledge Pack");
    return run("问答", async () => {
      const result = await api("/api/knowledge/query", {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, pack_id: lastPack.id, question, audience }),
      });
      setAnswer(result);
      setActivePane("query");
      return result;
    });
  };
  const generateDraft = async (type) => {
    if (!lastPack?.id) return setNotice("请先构建 Knowledge Pack");
    return run(type === "mrd" ? "生成 MRD" : "生成 PRD", async () => {
      const result = await api(`/api/documents/${type}/draft`, {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, pack_id: lastPack.id }),
      });
      setDraft(result);
      setActiveDocSection(result.sections?.[0]?.key || "");
      setActivePane("draft");
      return result;
    });
  };
  const exportSupplier = async () => {
    const documentId = draft?.document?.id;
    if (!documentId) return setNotice("请先生成 PRD/MRD 草稿");
    return run("供应商版导出", async () => api(`/api/documents/${documentId}/export/supplier`, { method: "POST" }));
  };

  return (
    <div className="viewport">
      <div className="page page-fluid">
        <div className="knowledge-studio">
          <div className="knowledge-hero compact">
            <div className="knowledge-hero-copy">
              <div className="knowledge-eyebrow">RAG · MRD · PRD 工作台</div>
              <h1 className="h1">{activePaneMeta.title}</h1>
              <div className="muted text-sm">{activePaneMeta.desc}</div>
            </div>
            <div className="knowledge-hero-actions">
              <Tag tone={busy ? "accent" : "outline"}>{busy || "Ready"}</Tag>
              {notice && <Tag tone={notice.includes("失败") ? "danger" : "success"}>{notice}</Tag>}
            </div>
          </div>

          <div className="knowledge-command">
            <div className="knowledge-command-main">
              <span>当前项目</span>
              <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projectOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <span>文档类型</span>
              <select className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="prd">PRD</option>
                <option value="mrd">MRD</option>
                <option value="report">Report</option>
              </select>
            </div>
            <div className="knowledge-command-meta">
              <Tag tone={workspaceReady ? "outline" : "danger"}>{data.workspace?.name || data.workspace?.slug || "未分配工作区"}</Tag>
              <Tag tone="outline">{modelLabel}</Tag>
            </div>
          </div>

          {!workspaceReady && (
            <div className="knowledge-workspace-warning">
              <Icon name="lock" size={14} />
              <span>当前演示 visitor 没有绑定真实工作区，所以只能预览界面；登录正式账号后可以导入、索引、问答和生成文档。</span>
            </div>
          )}

          <div className="knowledge-overview">
            <div className="knowledge-section-intro">
              {panes.filter((pane) => pane.key === activePane).map((pane) => (
                <div key={pane.key}>
                  <Icon name={pane.icon} size={16} />
                  <span>
                    <strong>{pane.title}</strong>
                    <small>{pane.desc}</small>
                  </span>
                </div>
              ))}
            </div>
            <div className="knowledge-workflow compact">
              {workflow.map((step, index) => (
                <div key={step.key} className={`knowledge-step ${step.done ? "done" : ""}`}>
                  <div className="knowledge-step-index">{step.done ? <Icon name="check" size={13} /> : index + 1}</div>
                  <div className="knowledge-step-body">
                    <div><Icon name={step.icon} size={13} />{step.title}</div>
                    <span>{step.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`knowledge-pane-layout ${activePane}`}>
            {activePane === "import" && <section className="knowledge-panel knowledge-panel-flow">
              <div className="knowledge-panel-head">
                <Icon name="file-text" size={15} />
                <div><h3>资料入口</h3><p>复制飞书文档文本即可导入；图片暂不落盘，只保留结构和占位信息。</p></div>
              </div>
              <textarea className="input knowledge-textarea" value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
              <div className="knowledge-actions">
                <Btn variant="primary" icon="plus" onClick={importDocument} disabled={!workspaceReady || Boolean(busy)}>导入并标准化</Btn>
                <Btn icon="check" onClick={publishImported} disabled={!workspaceReady || !lastImport || Boolean(busy)}>发布到 RAG</Btn>
                <Btn icon="network" onClick={loadGraph} disabled={!workspaceReady || !lastImport || Boolean(busy)}>查看图谱</Btn>
              </div>
              <div className="knowledge-policy-strip">
                {[
                  ["rag_enabled", "RAG 可引用"],
                  ["bot_enabled", "飞书 Bot"],
                  ["supplier_visible", "供应商版"],
                  ["sales_visible", "销售版"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={`knowledge-toggle ${publishPolicy[key] ? "on" : ""}`}
                    onClick={() => setPublishPolicy((current) => ({ ...current, [key]: !current[key] }))}
                    type="button"
                  >
                    <span>{label}</span>
                    <i>{publishPolicy[key] ? "开" : "关"}</i>
                  </button>
                ))}
              </div>
              {lastImport && <div className="knowledge-result">
                <div>
                  <strong>{lastImport.document?.title}</strong>
                  <span>{lastImport.import?.status} · {importedSections.length} sections · {lastImport.document?.status || "draft"}</span>
                </div>
                <Tag tone="outline">{lastImport.indexed?.chunks?.length || 0} chunks</Tag>
              </div>}
            </section>}

            {activePane === "graph" && <section className="knowledge-panel knowledge-panel-main">
              <div className="knowledge-panel-head">
                <Icon name="network" size={15} />
                <div><h3>图谱治理</h3><p>只读查看实体与关系；候选合并必须由有权限的人确认。</p></div>
              </div>
              <div className="knowledge-pack-bar">
                <Btn variant="primary" icon="sync" onClick={loadGraph} disabled={!workspaceReady || !lastImport || Boolean(busy)}>刷新图谱</Btn>
                <div className="knowledge-metrics">
                  <div><strong>{safeArray(graph?.nodes).length}</strong><span>nodes</span></div>
                  <div><strong>{safeArray(graph?.edges).length}</strong><span>edges</span></div>
                  <div><strong>{safeArray(fusionCandidates).length}</strong><span>fusion</span></div>
                </div>
              </div>
              {graph ? (
                <div className="knowledge-graph-grid">
                  <div className="knowledge-graph-card">
                    <div className="knowledge-evidence-title">实体节点</div>
                    <div className="knowledge-section-list">
                      {safeArray(graph.nodes).map((node) => (
                        <button
                          key={node.id}
                          type="button"
                          className={`knowledge-section-row ${selectedEntityId === node.id ? "active" : ""}`}
                          onClick={() => setSelectedEntityId(node.id)}
                        >
                          <span>{node.canonical_name}</span>
                          <Tag tone="outline">{node.entity_type}</Tag>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="knowledge-graph-card">
                    <div className="knowledge-evidence-title">关系边</div>
                    <div className="knowledge-citations graph-list">
                      {safeArray(graph.edges).map((edge) => <Tag key={edge.id} tone="outline">{edge.relation_type}</Tag>)}
                      {!safeArray(graph.edges).length ? <Tag tone="outline">暂无关系</Tag> : null}
                    </div>
                  </div>
                  <div className="knowledge-graph-card">
                    <div className="knowledge-evidence-title">待确认 Fusion</div>
                    <div className="knowledge-fusion-list">
                      {safeArray(fusionCandidates).map((candidate) => (
                        <div key={candidate.id} className="knowledge-fusion-row">
                          <div>
                            <strong>{candidate.action}</strong>
                            <span>{candidate.reason || candidate.candidate_type}</span>
                          </div>
                          <Tag tone={candidate.status === "pending" ? "accent" : "outline"}>{candidate.status}</Tag>
                          {candidate.status === "pending" ? (
                            <div className="knowledge-fusion-actions">
                              <Btn size="sm" icon="check" onClick={() => patchFusion(candidate.id, "approved")} disabled={Boolean(busy)}>通过</Btn>
                              <Btn size="sm" variant="ghost" icon="x" onClick={() => patchFusion(candidate.id, "rejected")} disabled={Boolean(busy)}>拒绝</Btn>
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {!safeArray(fusionCandidates).length ? <div className="knowledge-empty-note">暂无待确认候选。</div> : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="knowledge-empty-note">导入并发布文档后，可以在这里查看 Product Ontology 的节点、关系和待确认合并。</div>
              )}
            </section>}

            {activePane === "query" && <section className="knowledge-panel knowledge-panel-main">
              <div className="knowledge-panel-head">
                <Icon name="database" size={15} />
                <div><h3>资料包与问答</h3><p>把已发布文档、竞品、需求、资讯流汇入同一个项目资料包。</p></div>
              </div>
              <div className="knowledge-pack-bar">
                <Btn variant="primary" icon="sync" onClick={buildPack} disabled={!workspaceReady || Boolean(busy)}>构建资料包</Btn>
                {lastPack && <div className="knowledge-metrics">
                  <div><strong>{lastPack.sources?.length || 0}</strong><span>sources</span></div>
                  <div><strong>{lastPack.chunks?.length || 0}</strong><span>chunks</span></div>
                  <div><strong>{coverage}%</strong><span>coverage</span></div>
                </div>}
              </div>
              <div className="knowledge-question">
                <div className="knowledge-question-head">
                  <span>知识库问题</span>
                  <select className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>
                    <option value="internal">内部</option>
                    <option value="supplier">供应商</option>
                    <option value="sales_external">销售外部</option>
                  </select>
                </div>
                <textarea className="input" value={question} onChange={(e) => setQuestion(e.target.value)} />
                <Btn icon="sparkles" onClick={askQuestion} disabled={!workspaceReady || !lastPack || Boolean(busy)}>问知识库</Btn>
              </div>
              {answer ? (
                <div className={`knowledge-answer ${answer.mode === "refused" ? "is-refused" : ""}`}>
                  <div className="knowledge-answer-top">
                    <Tag tone={answer.mode === "refused" ? "danger" : "success"}>{answer.mode}</Tag>
                    <span>{Math.round((answer.confidence || 0) * 100)}% confidence</span>
                    {answer.needs_review ? <Tag tone="accent">needs review</Tag> : null}
                  </div>
                  <div className="knowledge-answer-text">{answer.answer}</div>
                  <div className="knowledge-citations">
                    {safeArray(answer.citations).map((item) => <Tag key={item.chunk_id || item.title} tone="outline">{item.title || item.chunk_id}</Tag>)}
                    {!safeArray(answer.citations).length && <Tag tone="danger">无可引用资料</Tag>}
                  </div>
                </div>
              ) : (
                <div className="knowledge-empty-note">构建资料包后，问答会显示答案、可信度和引用来源。</div>
              )}
            </section>}

            {activePane === "draft" && <aside className="knowledge-side">
              <section className="knowledge-panel">
                <div className="knowledge-panel-head">
                  <Icon name="edit" size={15} />
                  <div><h3>MRD / PRD 草稿</h3><p>生成后在这里快速审阅章节、引用和开放问题。</p></div>
                </div>
                <div className="knowledge-actions">
                  <Btn icon="sparkles" onClick={() => generateDraft("mrd")} disabled={!workspaceReady || !lastPack || Boolean(busy)}>生成 MRD</Btn>
                  <Btn icon="sparkles" onClick={() => generateDraft("prd")} disabled={!workspaceReady || !lastPack || Boolean(busy)}>生成 PRD</Btn>
                </div>
                {draft ? (
                  <div className="knowledge-draft">
                    <div className="knowledge-draft-title">{draft.document?.title}</div>
                    <div className="muted text-sm">{draft.document?.doc_type?.toUpperCase()} · {draftSections.length} sections · {draft.needs_review ? "needs review" : "reviewed"}</div>
                    <div className="knowledge-section-list">
                      {draftSections.map((section) => (
                        <button
                          key={section.key}
                          type="button"
                          className={`knowledge-section-row ${selectedDraftSection?.key === section.key ? "active" : ""}`}
                          onClick={() => setActiveDocSection(section.key)}
                        >
                          <span>{section.title}</span>
                          <Tag tone="outline">{section.source_chunk_ids?.length || 0} refs</Tag>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="knowledge-empty-note">PRD 会突出功能属性、结构、工艺、认证、测试、供应链和包装需求，不使用 MVP 语言。</div>
                )}
              </section>

              <section className="knowledge-panel">
                <div className="knowledge-panel-head">
                  <Icon name="shield" size={15} />
                  <div><h3>证据与权限</h3><p>文档导出前确认对外可见范围。</p></div>
                </div>
                {selectedDraftSection ? (
                  <div className="knowledge-evidence">
                    <div className="knowledge-evidence-title">{selectedDraftSection.title}</div>
                    <p>{selectedDraftSection.content || "暂无内容。"}</p>
                    <div className="knowledge-citations">
                      {safeArray(selectedDraftSection.source_refs).map((item) => <Tag key={item.chunk_id || item.title} tone="outline">{item.title || item.chunk_id}</Tag>)}
                      {safeArray(selectedDraftSection.open_questions).map((item) => <Tag key={item} tone="accent">{item}</Tag>)}
                      {!safeArray(selectedDraftSection.source_refs).length && !safeArray(selectedDraftSection.open_questions).length ? <Tag tone="outline">待补证据</Tag> : null}
                    </div>
                  </div>
                ) : (
                  <div className="knowledge-empty-note">选择一个草稿章节后，会显示对应内容、引用和待确认问题。</div>
                )}
                <div className="knowledge-actions knowledge-export-actions">
                  <Btn icon="external" onClick={exportSupplier} disabled={!workspaceReady || !draft || Boolean(busy)}>供应商版导出</Btn>
                  <Btn icon="lock" disabled={!workspaceReady || !draft || Boolean(busy)}>销售版待接入</Btn>
                </div>
              </section>
            </aside>}
          </div>
        </div>
      </div>
    </div>
  );
}

window.KnowledgeScreen = KnowledgeScreen;

function ResearchDetail({ data, api, refreshData, research, onBack }) {
  const [productIds, setProductIds] = useState(safeArray(research.products));
  const [demandIds, setDemandIds] = useState(safeArray(research.demands));
  const [picker, setPicker] = useState(null); // 'product' | 'demand' | null
  const [detailTarget, setDetailTarget] = useState(null); // { type, id } | null
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState(research.status || "草稿");
  const products = productIds.map((id) => safeArray(data.products).find((p) => p.id === id)).filter(Boolean);
  const demands = demandIds.map((id) => safeArray(data.demands).find((d) => d.id === id)).filter(Boolean);
  const detailProduct = detailTarget?.type === "product" ? safeArray(data.products).find((p) => p.id === detailTarget.id) : null;
  const detailDemand = detailTarget?.type === "demand" ? safeArray(data.demands).find((d) => d.id === detailTarget.id) : null;
  useEffect(() => setStatus(research.status || "草稿"), [research.status]);
  const saveLinks = async (nextProducts = productIds, nextDemands = demandIds) => {
    await api?.(`/api/research/${research.id}`, {
      method: "PATCH",
      body: JSON.stringify({ products: nextProducts, demands: nextDemands }),
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

  return (
    <div className="viewport">
      <div className="page page-fluid research-detail-page">
        <div className="row page-actions-row" style={{ marginBottom: 18 }}>
          <Btn variant="ghost" icon="arrow-left" onClick={onBack}>返回</Btn>
          <div className="grow" />
          <div className="page-actions">
            <Btn icon="sync" onClick={analyze} disabled={busy}>{busy ? "分析中..." : "重新分析"}</Btn>
            <Btn variant="primary" icon="external">导出报告</Btn>
          </div>
        </div>

        <div className="research-detail-layout">
          <div className="research-detail-main">
            <div className="research-detail-hero">
              <h1 className="h1">{research.title}</h1>
              <div className="muted text-sm">创建于 {research.date} · 调研项目 #{research.id.toUpperCase()}</div>
            </div>
            {notice && <div className="ai-block" style={{ marginBottom: 16 }}>{notice}</div>}

            <Section icon="edit" label="产品描述">
              <div className="research-detail-box research-desc-box">
                {research.desc}
              </div>
            </Section>

            <Section icon="boxes" label={`关联竞品 · ${products.length}`}
            action={<button className="btn sm ghost" onClick={() => setPicker("product")}><Icon name="plus" size={12} /> 添加竞品</button>}>
              <div className={`research-detail-box research-products-box ${products.length === 0 ? "is-empty" : ""}`}>
                {products.map((p) =>
                <div className="card research-linked-card research-product-card" key={p.id} onClick={() => setDetailTarget({ type: "product", id: p.id })} style={{ padding: 12, display: "flex", gap: 10, position: "relative" }}>
                    <div className="products-thumb" style={{ width: 36, height: 36, fontSize: 18 }}>{p.emoji}</div>
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
                    <Icon name="plus" size={12} /> 从需求雷达添加
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
                <div className="products-thumb" style={{ width: 32, height: 32, fontSize: 16 }}>{p.emoji}</div>
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
        {detailProduct &&
        <ProductDetailDrawer product={detailProduct} api={api} refreshData={refreshData} onClose={() => setDetailTarget(null)} />
        }
        {detailDemand &&
        <DemandDetailDrawer demand={detailDemand} api={api} refreshData={refreshData} onClose={() => setDetailTarget(null)} />
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
              <label className="field-label">备注</label>
              <textarea className="input" style={{ width: "100%", minHeight: 120, resize: "vertical" }} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="补充想法、相关资料链接..." />
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
    return params.get("tab") === "tags" ? "tags" : "general";
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
  useEffect(() => setSources(data.rssSources), [data.rssSources]);
  useEffect(() => setOfficialSources(data.officialRssSources || []), [data.officialRssSources]);
  useEffect(() => setSettings(data.settings || {}), [data.settings]);
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
      await api(path, { method: "POST" });
      setNotice(`${label}测试成功。`);
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
      <div className="page" style={{ maxWidth: 760 }}>
        <h1 className="h1">系统设置</h1>
        <div className="muted text-sm" style={{ marginBottom: 24 }}>配置 AI 模型、飞书同步与数据源</div>
        <div className="news-tabs" style={{ marginBottom: 16 }}>
          <div className={`news-tab ${settingsTab === "general" ? "active" : ""}`} onClick={() => setSettingsTab("general")}>通用设置</div>
          <div className={`news-tab ${settingsTab === "tags" ? "active" : ""}`} onClick={() => setSettingsTab("tags")}>标签与字段</div>
        </div>
        {notice && <div className="ai-block" style={{ marginBottom: 16 }}>{notice}</div>}

        {settingsTab === "general" && (
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
              <div><h3>标签与字段</h3><div className="desc">账号字段库默认为空。需要使用字段时，先在这里新建，再到竞品或灵感详情里按需添加。</div></div>
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
    common: ["competitor_brands", "camera_brands", "custom_tags"],
    news: ["competitor_brands", "camera_brands"],
    products: ["competitor_brands", "camera_brands", "product_categories"],
    demands: ["scenarios", "painpoints", "innovation_types", "custom_tags"],
    research: ["competitor_brands", "camera_brands", "product_categories", "scenarios", "painpoints", "innovation_types", "custom_tags"],
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

function FieldCard({ field, onOptionsChange, onEntitiesChange, onDelete, onRename }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(field.name);

  const addOption = () => {
    const v = draft.trim();
    if (!v) { setEditing(false); return; }
    if (!field.options.includes(v)) onOptionsChange?.([...field.options, v]);
    setDraft("");
    setEditing(false);
  };

  const removeOption = (opt) => onOptionsChange?.(field.options.filter((o) => o !== opt));

  const toggleEntity = (entity) => {
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
          <span className="tag outline" style={{ fontSize: 10.5, padding: "0 6px", height: 18, lineHeight: "18px" }}>{field.multi ? "多选" : "单选"}</span>
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
            <Icon name="x" size={11} style={{ cursor: "pointer", opacity: 0.6 }} onClick={() => removeOption(opt)} />
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
        ) : (
          <button
            className="tag"
            style={{ background: "transparent", border: "1px dashed var(--border)", color: "var(--text-3)", cursor: "pointer", gap: 3 }}
            onClick={() => setEditing(true)}
          >
            <Icon name="plus" size={10} /> 添加
          </button>
        )}
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="sparkles" size={16} style={{ color: "var(--accent)" }} />
          <h3>新建字段</h3>
          <Btn variant="ghost" icon="x" onClick={onClose} />
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="settings-row">
            <div className="label">字段名</div>
            <input
              className="input"
              style={{ width: "100%" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：目标人群"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && valid) onCreate({ name: name.trim(), multi, tone, entities }); }}
            />
          </div>
          <div className="settings-row">
            <div className="label">类型</div>
            <div style={{ display: "flex", gap: 16 }}>
              {[{ v: true, label: "多选" }, { v: false, label: "单选" }].map(({ v, label }) => (
                <label key={label} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12.5 }}>
                  <input type="radio" checked={multi === v} onChange={() => setMulti(v)} /> {label}
                </label>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <div className="label">颜色</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["outline", "default", "accent", "success", "warn", "danger"].map((t) => (
                <button
                  key={t}
                  className={`tag ${t} ${tone === t ? "ring" : ""}`}
                  style={{ cursor: "pointer", outline: tone === t ? "2px solid var(--accent)" : "none", outlineOffset: 2 }}
                  onClick={() => setTone(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <div className="label">归属</div>
            <div style={{ display: "flex", gap: 16 }}>
              {[{ key: "competitor", label: "竞品库" }, { key: "inspiration", label: "灵感库" }].map((e) => (
                <label key={e.key} className="field-entity-checkbox" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={entities.includes(e.key)} onChange={() => toggleEntity(e.key)} />
                  {e.label}
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
  const [fieldsState, setFieldsState] = useState(normalizeFields(settings.fields, settings.tag_groups));
  const [fieldTab, setFieldTab] = useState("competitor");
  const [showNewField, setShowNewField] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => setFieldsState(normalizeFields(settings.fields, settings.tag_groups)), [settings.fields, settings.tag_groups]);

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
      <div className="news-tabs" style={{ marginBottom: 16 }}>
        <div className={`news-tab ${fieldTab === "competitor" ? "active" : ""}`} onClick={() => setFieldTab("competitor")}>竞品库</div>
        <div className={`news-tab ${fieldTab === "inspiration" ? "active" : ""}`} onClick={() => setFieldTab("inspiration")}>灵感库</div>
        <div className={`news-tab ${fieldTab === "all" ? "active" : ""}`} onClick={() => setFieldTab("all")}>所有字段</div>
      </div>
      {notice && <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>{notice}</div>}
      <div className="field-card-list">
        {visibleFields.map((field) => (
          <FieldCard
            key={field.key}
            field={field}
            onOptionsChange={(options) => updateField(field.key, { options })}
            onEntitiesChange={(entities) => updateField(field.key, { entities })}
            onRename={!field.official ? (name) => updateField(field.key, { name }) : undefined}
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
