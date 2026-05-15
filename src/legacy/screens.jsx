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

function newsMergeKey(item = {}) {
  const classifiedKey = String(item?.classification?.merge_key || "").trim();
  if (classifiedKey) return classifiedKey;
  return String(item?.titleZh || item?.original_title || "")
    .toLowerCase()
    .replace(/\s+-\s+[^-]+$/g, "")
    .replace(/['"“”‘’]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140) || String(item?.id || "");
}

function newsSourceHost(item = {}) {
  try {
    const url = new URL(item.original_url || item.url || "");
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function buildNewsGroups(items = []) {
  const map = new Map();
  for (const item of safeArray(items)) {
    const key = newsMergeKey(item);
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
    const primary = current.sourceItems.find((entry) => entry.thumbnail_url || entry.image) || current.sourceItems[0];
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
  const wechat = list.filter((n) => String(n?.classification?.source_type || "").toLowerCase() === "wechat_exporter" || String(n?.source || "").includes("公众号"));
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
  if (String(item?.classification?.source_type || "").toLowerCase() === "wechat_exporter") {
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
      body: "在 Stream 里点右侧星标后，这里会自动汇总你收藏过的内容。",
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
  return safeArray(tagGroups).find((group) => group.key === normalizedKey) || { key: normalizedKey, name: normalizedKey, tone: "outline", tags: [] };
}

function MultiSelectField({ label, fieldKey, values, tagGroups, tone = "accent", single = false, onChange, onCreateOption }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const selected = safeArray(values).filter(Boolean);
  const group = tagGroupByKey(tagGroups, fieldKey);
  const options = Array.from(new Set([...safeArray(group.tags), ...selected])).filter(Boolean);
  const filtered = query ? options.filter((item) => item.toLowerCase().includes(query.toLowerCase())) : options;
  const hasExact = query && options.some((item) => item.toLowerCase() === query.toLowerCase());
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
    <div className={`multi-field ${open ? "open" : ""}`} ref={rootRef}>
      <div className="multi-field-head">
        <div className="detail-section-label">{label}{single ? "" : " · 多选"}</div>
        <button className="multi-field-trigger" type="button" onClick={() => setOpen(!open)}>
          选择
        </button>
      </div>
      <div className="multi-field-values">
        {selected.length ? selected.map((item) =>
          <button className={`tag removable ${tone}`} type="button" key={item} onClick={() => toggle(item)}>
            <span>{item}</span>
            <Icon name="x" size={11} />
          </button>
        ) : <span className="multi-field-empty">未选择</span>}
      </div>
      {open &&
        <div className="multi-picker">
          <input className="multi-picker-search" autoFocus value={query} placeholder="搜索或新建选项" onChange={(e) => setQuery(e.target.value)} />
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
              <button className="multi-option create" type="button" onClick={() => toggle(query.trim())}>
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
      <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="trash" size={16} style={{ color: "var(--danger)" }} />
          <h3>确认删除需求</h3>
          <Btn variant="ghost" icon="x" onClick={onClose} disabled={busy} />
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 14 }}>
            删除后将从当前需求库中移除，这个操作不可撤销。
          </div>
          <div className="confirm-delete-summary">
            <div className="confirm-delete-row">
              <div className="confirm-delete-label">标题</div>
              <div className="confirm-delete-value" style={{ fontWeight: 600 }}>{demand.title || "未命名需求"}</div>
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
          <Btn variant="danger" icon="trash" onClick={onConfirm} disabled={busy}>{busy ? "删除中..." : "确认删除"}</Btn>
        </div>
      </div>
    </div>
  );
}

function DeleteSourceConfirmModal({ source, busy, onClose, onConfirm }) {
  if (!source) return null;
  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="trash" size={16} style={{ color: "var(--danger)" }} />
          <h3>确认删除数据源</h3>
          <Btn variant="ghost" icon="x" onClick={onClose} disabled={busy} />
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 14 }}>
            删除后这个 News 数据源将不会再继续采集。
          </div>
          <div className="confirm-delete-summary">
            <div className="confirm-delete-row">
              <div className="confirm-delete-label">名称</div>
              <div className="confirm-delete-value" style={{ fontWeight: 600 }}>{source.name}</div>
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
          <Btn variant="danger" icon="trash" onClick={onConfirm} disabled={busy}>{busy ? "删除中..." : "确认删除"}</Btn>
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
  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{ width: 500 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="trash" size={16} style={{ color: "var(--danger)" }} />
          <h3>{items.length > 1 ? `确认批量删除${entityLabel}` : `确认删除${entityLabel}`}</h3>
          <Btn variant="ghost" icon="x" onClick={onClose} disabled={busy} />
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 14 }}>
            {items.length > 1 ? `将删除 ${items.length} 条${entityLabel}，这个操作不可撤销。` : `删除后这条${entityLabel}将无法恢复。`}
          </div>
          <div className="confirm-delete-summary">
            {preview.map((item) => (
              <div className="confirm-delete-row" key={item.id || itemDisplayName(item)}>
                <div className="confirm-delete-label">{entityLabel}</div>
                <div className="confirm-delete-value" style={{ fontWeight: 600 }}>{itemDisplayName(item)}</div>
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
          <Btn variant="danger" icon="trash" onClick={onConfirm} disabled={busy}>{busy ? "删除中..." : "确认删除"}</Btn>
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

// ============ LOGIN ============
function LoginScreen({ onLogin, onDemoLogin, onFeishuLogin, error, providers = {} }) {
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordEnabled = providers.password !== false;
  const feishuEnabled = Boolean(providers.feishu);
  const submit = async () => {
    setBusy(true);
    try {
      await onLogin?.({ username: user, password: pw });
    } finally {
      setBusy(false);
    }
  };
  const enterDemoMode = async () => {
    setBusy(true);
    try {
      await onDemoLogin?.();
    } finally {
      setBusy(false);
    }
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
        <div className="col" style={{ gap: 14 }}>
          {passwordEnabled && (
            <>
              <div>
                <label className="field-label">账号</label>
                <input
                  className="input lg"
                  style={{ width: "100%" }}
                  value={user}
                  placeholder="请输入你的账号"
                  autoComplete="username"
                  onChange={(e) => setUser(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">密码</label>
                <input
                  className="input lg"
                  style={{ width: "100%" }}
                  type="password"
                  value={pw}
                  placeholder="请输入你的密码"
                  autoComplete="current-password"
                  onChange={(e) => setPw(e.target.value)}
                />
              </div>
            </>
          )}
          {error && <div style={{ fontSize: 12, color: "var(--danger)" }}>{error}</div>}
          {passwordEnabled && (
            <button className="btn primary" style={{ height: 38, justifyContent: "center" }} onClick={submit} disabled={busy || !user || !pw}>
              {busy ? "登录中..." : "登录 LOOM"}
            </button>
          )}
          <div className="login-oauth">
            <div className="login-oauth-divider"><span>其他方式</span></div>
            <div className="login-oauth-actions">
              <button
                className="login-oauth-btn"
                type="button"
                title="使用飞书登录"
                aria-label="使用飞书登录"
                onClick={() => onFeishuLogin?.()}
                disabled={busy || !feishuEnabled}
              >
                <img src="/feishu.png" alt="飞书" />
              </button>
            </div>
          </div>
          <button
            className="login-demo-link"
            type="button"
            onClick={enterDemoMode}
            disabled={busy}
          >
            进入演示模式
          </button>
          <div className="login-inline-tip">
            {feishuEnabled ? "演示模式可直接体验示例工作区；公司成员可使用飞书登录个人账号。" : "演示模式可直接体验示例工作区；飞书登录完成 OAuth 配置后即可启用。"}
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--border)", marginTop: 22, paddingTop: 14, fontSize: 11, color: "var(--text-3)", textAlign: "center" }}>
          LOOM v2.0 · 支持演示、账号密码与飞书登录
        </div>
      </div>
    </div>);

}
window.LoginScreen = LoginScreen;

// ============ NEWS ============
function NewsScreen({ data, api, refreshData, navTarget }) {
  const [tab, setTab] = useState("all");
  const initialNewsGroups = buildNewsGroups(data.news);
  const [items, setItems] = useState(initialNewsGroups);
  const [counts, setCounts] = useState(newsGroupCounts(initialNewsGroups));
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
  useEffect(() => {
    const groups = buildNewsGroups(data.news);
    setItems(groups);
    setCounts(newsGroupCounts(groups));
  }, [data.news]);

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
    let groups = buildNewsGroups(result.items || result);
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
    setTab("all");
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
      <div className="news-tabs">
        {[
        ["all", "全部", counts.all],
        ["微信公众号", "微信公众号", counts.wechat],
        ["Google News", "Google News", counts.trend],
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
        <div className="page" style={{ paddingTop: 8 }}>
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
                const isWechat = String(n?.classification?.source_type || "").toLowerCase() === "wechat_exporter" || String(n?.source || "").includes("公众号");
                const primaryTag = newsPrimaryTag(n);
                const brand = !isWechat && !isGoogleNewsItem(n) ? guessBrand(n) : "";
                const secondaryTag = sameMetaLabel(primaryTag, brand) ? "" : brand;
                const sourceTone = isWechat ? "outline" : (isGoogleNewsItem(n) ? "accent" : "outline");
                return (
            <div className={`news-card ${n.sourceCount > 1 ? "grouped" : ""} ${n.unread ? "unread" : ""}`} key={n.id} role="button" tabIndex={0}
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
  const label = item.type === "新品发布" ? "PRODUCT IMG" : "TREND IMG";
  return (
    <div className="news-thumb">
      {image && !failed ?
        <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> :
        <DemandThumb hue={item.thumbHue} label={label} />
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
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-input-wrap">
        {prefix && <span className="metric-prefix">{prefix}</span>}
        <input
          className="metric-input"
          value={value ?? ""}
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
            {platformUrlLabel(url)}
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
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", background: "var(--surface)" }}>
      {items.map((t, i) =>
      <div key={i} className="bullet-row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 10px", borderBottom: "1px solid var(--border-soft)", fontSize: 12.5 }}>
          <span style={{ color: "var(--text-3)", fontSize: 11, fontVariantNumeric: "tabular-nums", width: 18, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 10px" }}>
        <span style={{ color: "var(--text-4)", fontSize: 11, width: 18, textAlign: "right", flexShrink: 0 }}>{items.length + 1}</span>
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
    setProducts((ps) => ps.map((p) => p.id === selectedId ? { ...p, ...patch } : p));
    if (api && selectedId) {
      await api(`/api/products/${selectedId}`, { method: "PATCH", body: JSON.stringify(patch) });
      await refreshData?.();
    }
  };
  const [selectedId, setSelectedId] = useState(products[0]?.id || null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [priceCcy, setPriceCcy] = useState("native"); // unused (toggle removed)

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
    const groups = safeArray(data.settings?.tag_groups);
    const nextGroups = groups.map((group) => {
      if (group.key !== groupKey || safeArray(group.tags).includes(cleanValue)) return group;
      return { ...group, tags: [...safeArray(group.tags), cleanValue] };
    });
    await api("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ tag_groups: nextGroups }),
    });
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
    <div className={`products-layout ${selected && !detailCollapsed ? "" : "no-detail"}`} style={{ height: "100%" }}>
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
            <Btn size="sm" variant="ghost" className="select-trigger" onClick={() => setSelectMode(true)}>选择</Btn>
            }
          </div>
        }

        <div className="products-table-wrap">
          <table className="products-table">
            <thead>
              <tr>
                {selectMode && <th style={{ width: 34 }} />}
                <th>商品名称</th><th>品类</th><th>平台</th><th>售价</th><th>参考成本</th><th>评分</th><th>月销估算</th><th>状态</th>
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
                  </tr>);

              })}
              {filtered.length === 0 &&
                <tr>
                  <td colSpan={selectMode ? 9 : 8}>
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
        {paged.total > pageSize && (
          <div className="products-pagination-shell">
            <PaginationBar page={paged.currentPage} total={paged.total} pageSize={pageSize} onPageChange={setPage} label="条竞品" />
          </div>
        )}
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
            <Btn variant="ghost" icon="panel-open" title="收起详情栏" onClick={() => setDetailCollapsed?.(true)} />
          </div>

          <div className="detail-body">
            <div className="detail-section">
              <div className="detail-section-label">品牌</div>
              <MultiSelectField
                label="品牌"
                fieldKey="competitor_brands"
                values={[selected.brand].filter(Boolean)}
                tagGroups={data.settings?.tag_groups}
                tone="outline"
                single
                onChange={(values) => updateSelected({ brand: values[0] || "" })}
                onCreateOption={createTagOption}
              />
            </div>
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

            <div className="detail-section">
              <div className="detail-section-label">参考成本 · 适用于所有平台</div>
              <div className="metric-input-wrap" style={{ width: "100%" }}>
                <span className="metric-prefix">¥</span>
                <input
                className="metric-input"
                value={String(selected.cost_estimate || safeArray(selected.platforms)[0]?.cost || "").replace(/^[¥$￥]\s?/, "")}
                onChange={(e) => {
                  const raw = e.target.value;
                  updateSelected({ cost_estimate: raw ? "¥" + raw : "" });
                }}
                placeholder="填入参考成本金额" />
              </div>
            </div>

            <div className="detail-section">
              <MultiSelectField
                label="品类"
                fieldKey="product_categories"
                values={[selected.category].filter(Boolean)}
                tagGroups={data.settings?.tag_groups}
                tone="default"
                single
                onChange={(values) => updateSelected({ category: values[0] || "" })}
                onCreateOption={createTagOption}
              />
            </div>

            <div className="detail-section">
              <div className="detail-section-label">标签</div>
              <RemovableTagList
                items={selected.tags}
                onChange={(next) => updateSelected({ tags: next })}
                onRemove={(value) => updateSelected({ tags: safeArray(selected.tags).filter((item) => item !== value) })}
              />
            </div>

            <div className="detail-section">
              <div className="detail-section-label"><Icon name="sparkles" size={11} /> 核心卖点 · AI 总结 + 用户补充</div>
              <BulletListEditor
              items={safeArray(selected.selling_points)}
              onChange={(next) => updateSelected({ selling_points: next })}
              tone="success"
              placeholder="输入卖点，回车添加" />
            
            </div>

            <div className="detail-section">
              <div className="detail-section-label">差评关键词</div>
              <BulletListEditor
              items={safeArray(selected.negative_keywords)}
              onChange={(next) => updateSelected({ negative_keywords: next })}
              tone="danger"
              placeholder="输入差评关键词，回车添加" />
            
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
      setNotice("Spark 灵感库已同步到飞书。");
    } catch (error) {
      setNotice(error.message);
    }
  };
  const createTagOption = async (groupKey, value) => {
    const cleanValue = String(value || "").trim();
    if (!api || !cleanValue) return;
    const groups = safeArray(data.settings?.tag_groups);
    const nextGroups = groups.map((group) => {
      if (group.key !== groupKey || safeArray(group.tags).includes(cleanValue)) return group;
      return { ...group, tags: [...safeArray(group.tags), cleanValue] };
    });
    await api("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ tag_groups: nextGroups }),
    });
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
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h1 className="h1">Spark 灵感库</h1>
            <div className="muted text-sm">{demands.length} 条已录入</div>
          </div>
          <div className="page-actions">
            <Btn size="sm" icon="sync" onClick={syncDemands}>同步飞书</Btn>
          </div>
        </div>
        {notice && <div className="ai-block" style={{ marginBottom: 12 }}>{notice}</div>}
        {filtered.length > 0 &&
          <div className={`bulk-toolbar ${selectMode ? "" : "idle"}`} style={{ marginBottom: 12 }}>
            {selectMode ?
            <>
                <Btn size="sm" variant="ghost" onClick={() => setSelectMode(false)}>取消选择</Btn>
                <Btn size="sm" variant="ghost" icon="trash" disabled={!selectedIds.length} onClick={() => setShowBulkDeleteConfirm(true)}>批量删除</Btn>
                <span className="muted text-sm">{selectedIds.length} 条已选择</span>
              </> :
            <Btn size="sm" variant="ghost" className="select-trigger" onClick={() => setSelectMode(true)}>选择</Btn>
            }
          </div>
        }

        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <Icon name="filter" size={13} style={{ color: "var(--text-3)" }} />
          <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>筛选:</span>
          <select className="input sm" style={{ height: 28 }} value={filterScenario} onChange={(e) => setFilterScenario(e.target.value)}>
            <option value="">全部场景</option>
            {allScenarios.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input sm" style={{ height: 28 }} value={filterInnov} onChange={(e) => setFilterInnov(e.target.value)}>
            <option value="">全部创新类型</option>
            {allInnov.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="news-tabs" style={{ padding: 0, borderBottom: "none", background: "transparent", marginLeft: 4 }}>
            <div className={`news-tab ${viewMode === "card" ? "active" : ""}`} onClick={() => setViewMode("card")}>卡片</div>
            <div className={`news-tab ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")}>列表</div>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-3)" }}>
            匹配 {filtered.length} 条
          </span>
        </div>

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

      {selected && <DemandDetailDrawer demand={selected} api={api} refreshData={refreshData} tagGroups={data.settings?.tag_groups} onCreateTagOption={createTagOption} onClose={() => setSelectedId(null)} onRequestDelete={openDeleteConfirm} />}
      {deleteTarget && <DeleteDemandConfirmModal demand={deleteTarget} busy={deleteBusy} onClose={() => !deleteBusy && setDeleteTarget(null)} onConfirm={confirmDelete} />}
      {showBulkDeleteConfirm && <DeleteItemsConfirmModal entityLabel="需求" items={selectedItems} busy={deleteBusy} onClose={() => !deleteBusy && setShowBulkDeleteConfirm(false)} onConfirm={async () => { await deleteSelected(); setShowBulkDeleteConfirm(false); }} />}
    </div>);

}
window.DemandsScreen = DemandsScreen;

function DemandDetailDrawer({ demand, onClose, api, refreshData, onRequestDelete, tagGroups = [], onCreateTagOption }) {
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

          <div className="detail-section">
            <MultiSelectField
              label="创新类型"
              fieldKey="innovation"
              values={[demand.innovation].filter(Boolean)}
              tagGroups={tagGroups}
              tone="success"
              single
              onChange={(values) => save({ innovation: values[0] || "待分类" })}
              onCreateOption={onCreateTagOption}
            />
          </div>

          <div className="detail-section">
            <MultiSelectField
              label="使用场景"
              fieldKey="scenarios"
              values={demand.scenarios}
              tagGroups={tagGroups}
              tone="accent"
              onChange={(values) => save({ scenarios: values })}
              onCreateOption={onCreateTagOption}
            />
          </div>

          <div className="detail-section">
            <MultiSelectField
              label="用户痛点"
              fieldKey="painpoints"
              values={demand.painpoints}
              tagGroups={tagGroups}
              tone="danger"
              onChange={(values) => save({ painpoints: values })}
              onCreateOption={onCreateTagOption}
            />
          </div>

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
            <div className="detail-section-label">自定义标签</div>
            <DemandTagList
              items={safeArray(demand.tags)}
              onChange={(values) => save({ tags: values })}
              addLabel="+ 添加标签"
            />
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
      await api(`/api/products/${product.id}`, { method: "PATCH", body: JSON.stringify(patch) });
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
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h1 className="h1">Weave 调研工坊</h1>
            <div className="muted text-sm">从 Lens 与 Spark 中匹配数据，AI 生成结构化分析报告</div>
          </div>
          <div className="page-actions">
            {selectMode ?
            <>
                <Btn size="sm" variant="ghost" icon="trash" disabled={!selectedIds.length} onClick={() => setShowBulkDeleteConfirm(true)}>批量删除</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setSelectMode(false)}>取消选择</Btn>
              </> :
            <Btn size="sm" variant="ghost" className="select-trigger" onClick={() => setSelectMode(true)}>选择</Btn>
            }
            <Btn variant="primary" icon="plus" onClick={() => setShowCreate(true)}>新建调研项目</Btn>
          </div>
        </div>

        {selectMode && items.length > 0 && <div className="muted text-sm" style={{ marginBottom: 12 }}>{selectedIds.length} 条已选择</div>}

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
      <div className="page" style={{ maxWidth: 920 }}>
        <div className="row page-actions-row" style={{ marginBottom: 18 }}>
          <Btn variant="ghost" icon="arrow-left" onClick={onBack}>返回</Btn>
          <div className="grow" />
          <div className="page-actions">
            <Btn icon="sync" onClick={analyze} disabled={busy}>{busy ? "分析中..." : "重新分析"}</Btn>
            <Btn variant="primary" icon="external">导出报告</Btn>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
          <h1 className="h1" style={{ flex: 1, fontSize: 24 }}>{research.title}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>状态</span>
            <select
              className="input sm"
              style={{ height: 28, minWidth: 108 }}
              value={status}
              onChange={(e) => saveStatus(e.target.value)}
            >
              <option value="草稿">草稿</option>
              <option value="分析中">分析中</option>
              <option value="已完成">已完成</option>
            </select>
          </div>
        </div>
        <div className="muted text-sm" style={{ marginBottom: 22 }}>创建于 {research.date} · 调研项目 #{research.id.toUpperCase()}</div>
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
            <div className="card research-linked-card" key={p.id} onClick={() => setDetailTarget({ type: "product", id: p.id })} style={{ padding: 12, display: "flex", gap: 10, position: "relative" }}>
                <div className="products-thumb" style={{ width: 36, height: 36, fontSize: 18 }}>{p.emoji}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div className="row" style={{ marginTop: 3, fontSize: 11.5 }}>
                    <span className="mono" style={{ fontWeight: 600 }}>{safeArray(p.platforms)[0]?.price || "—"}</span>
                    <span style={{ color: "var(--text-3)" }}>· {safeArray(p.platforms)[0]?.rating ?? "—"}★</span>
                  </div>
                </div>
                <Icon name="x" size={12} style={{ cursor: "pointer", color: "var(--text-4)", position: "absolute", top: 8, right: 8 }}
              onClick={(e) => {
                e.stopPropagation();
                const next = productIds.filter((id) => id !== p.id);
                setProductIds(next);saveLinks(next, demandIds);
              }} />
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
                <Icon name="plus" size={12} /> 从 Spark 添加
              </button>
            }
          </div>
        </Section>

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
  const submit = async () => {
    setBusy(true);setError("");
    try {
      await api("/api/research", {
        method: "POST",
        body: JSON.stringify({ title, desc, status: "草稿" }),
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
          <Btn variant="primary" icon="check" onClick={submit} disabled={busy || !title || !desc}>{busy ? "创建中..." : "创建项目"}</Btn>
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
  const [sources, setSources] = useState(data.rssSources);
  const [officialSources, setOfficialSources] = useState(data.officialRssSources || []);
  const [settings, setSettings] = useState(data.settings || {});
  const [notice, setNotice] = useState("");
  const [settingsTab, setSettingsTab] = useState("general");
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
          <div className={`news-tab ${settingsTab === "tags" ? "active" : ""}`} onClick={() => setSettingsTab("tags")}>Tag设置</div>
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
            <div><h3>官方 RSS 源</h3><div className="desc">系统统一在后端采集并分发到 Stream。你只需要决定是否接收。</div></div>
          </div>
          <div className="settings-section-body">
            <div className="settings-row">
              <div className="label">
                接收官方信息流
                <div className="hint">关闭后，Stream 将隐藏系统统一分发的官方 RSS 与公众号内容。</div>
              </div>
              <Switch on={settings.official_news_enabled !== false} onChange={async (on) => {
                const next = { ...settings, official_news_enabled: on };
                setSettings(next);
                await saveSettings(next);
              }} />
            </div>
            {sortedOfficialSources.map((s) =>
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
                  <Btn size="sm" variant="ghost" icon="external" onClick={() => openSource(s)} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-head">
            <Icon name="rss" size={14} style={{ color: "var(--accent)" }} />
            <div><h3>自定义 News 数据源</h3><div className="desc">默认留空。只在你想补充额外 RSS / 公众号源时手动添加。</div></div>
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
            <div className="source-row" style={{ marginTop: 10 }}>
              <div>
                <input className="input sm" style={{ width: "100%", marginBottom: 6 }} placeholder="源名称" value={newSource.name} onChange={(e) => setNewSource({ ...newSource, name: e.target.value })} />
                <input className="input sm" style={{ width: "100%" }} placeholder="RSS URL" value={newSource.url} onChange={(e) => setNewSource({ ...newSource, url: e.target.value })} />
              </div>
              <div><Tag tone="outline">RSS</Tag></div>
              <input className="input sm" style={{ width: 82 }} type="number" value={newSource.interval} onChange={(e) => setNewSource({ ...newSource, interval: Number(e.target.value) })} />
              <Btn size="sm" variant="primary" icon="plus" onClick={addSource}>添加</Btn>
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
              <div><h3>Tag设置</h3><div className="desc">统一配置品牌、品类、场景、痛点、创新类型与自定义标签</div></div>
            </div>
            <div className="settings-section-body">
              <TagSystemEditor settings={settings} setSettings={setSettings} saveSettings={saveSettings} />
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
