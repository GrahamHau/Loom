/* global LoginScreen, NewsScreen, ProductsScreen, DemandsScreen, ResearchScreen, KnowledgeScreen, SettingsScreen, Icon, Btn, Tag, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle */
const React = globalThis.React;
const ReactDOM = globalThis.ReactDOM;
const LoginScreen = globalThis.LoginScreen;
const NewsScreen = globalThis.NewsScreen;
const ProductsScreen = globalThis.ProductsScreen;
const DemandsScreen = globalThis.DemandsScreen;
const ResearchScreen = globalThis.ResearchScreen;
const KnowledgeScreen = globalThis.KnowledgeScreen;
const SettingsScreen = globalThis.SettingsScreen;
const Icon = globalThis.Icon;
const Btn = globalThis.Btn;
const Tag = globalThis.Tag;
const useTweaks = globalThis.useTweaks;
const TweaksPanel = globalThis.TweaksPanel;
const TweakSection = globalThis.TweakSection;
const TweakRadio = globalThis.TweakRadio;
const TweakToggle = globalThis.TweakToggle;
const { useEffect, useMemo, useRef, useState } = React;

const NAV = [
  { group: "采集", items: [
    { key: "news", label: "资讯流", icon: "newspaper" },
    { key: "products", label: "竞品库", icon: "boxes" },
    { key: "demands", label: "需求雷达", icon: "lightbulb" },
  ] },
  { group: "调研", items: [
    { key: "research", label: "调研工坊", icon: "compass" },
  ] },
  { group: "文档", items: [
    { key: "mrd", label: "市场分析", icon: "bar-chart" },
    { key: "prd", label: "产品定义", icon: "clipboard" },
    { key: "feishu_space", label: "飞书空间", icon: "folder-open" },
  ] },
  { group: "知识", items: [
    { key: "library", label: "资料库", icon: "file-text" },
    { key: "ask", label: "智能问答", icon: "bot" },
  ] },
];

const TITLES = {
  news: { label: "资讯流", subLabel: "官方源与行业动态" },
  products: { label: "竞品库", subLabel: "产品与平台采集" },
  demands: { label: "需求雷达", subLabel: "用户痛点与机会" },
  library: { label: "资料库", subLabel: "知识中台" },
  "library-import": { label: "资料库", subLabel: "导入资料" },
  ask: { label: "智能问答", subLabel: "基于资料库的 AI 问答" },
  mrd: { label: "市场分析", subLabel: "MRD · 市场需求文档" },
  prd: { label: "产品定义", subLabel: "PRD · 产品需求文档" },
  research: { label: "调研工坊", subLabel: "结构化分析报告" },
  settings: { label: "设置", subLabel: "系统设置" },
  feishu_space: { label: "飞书空间", subLabel: "飞书文档同步" },
};

const SEARCH_ICON = {
  news: "newspaper",
  products: "boxes",
  demands: "lightbulb",
  research: "compass",
};

function buildSearchIndex(data) {
  const news = (data.news || []).map((item) => ({
    id: `news:${item.id}`,
    entityId: item.id,
    screen: "news",
    icon: SEARCH_ICON.news,
    kind: "新闻",
    title: item.titleZh || item.original_title || "未命名资讯",
    summary: item.summary || "",
    meta: item.source || "",
  }));
  const products = (data.products || []).map((item) => ({
    id: `products:${item.id}`,
    entityId: item.id,
    screen: "products",
    icon: SEARCH_ICON.products,
    kind: "竞品",
    title: item.name || "未命名竞品",
    summary: item.ai_summary || "",
    meta: item.category || "",
  }));
  const demands = (data.demands || []).map((item) => ({
    id: `demands:${item.id}`,
    entityId: item.id,
    screen: "demands",
    icon: SEARCH_ICON.demands,
    kind: "需求",
    title: item.title || "未命名需求",
    summary: item.summary || "",
    meta: item.innovation || "",
  }));
  const research = (data.research || []).map((item) => ({
    id: `research:${item.id}`,
    entityId: item.id,
    screen: "research",
    icon: SEARCH_ICON.research,
    kind: "调研",
    title: item.title || "未命名调研",
    summary: item.desc || "",
    meta: item.status || "",
  }));
  return [...demands, ...products, ...news, ...research];
}

function GlobalSearchModal({ data, onClose, onPick }) {
  const [query, setQuery] = useState("");
  const items = useMemo(() => buildSearchIndex(data), [data]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    return items.filter((item) =>
      [item.title, item.summary, item.meta, item.kind].filter(Boolean).some((value) => String(value).toLowerCase().includes(q))
    ).slice(0, 24);
  }, [items, query]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="search" size={15} />
          <h3>全局搜索</h3>
          <span className="kbd">⌘K</span>
          <Btn variant="ghost" icon="x" onClick={onClose} />
        </div>
        <div style={{ padding: "14px 18px 0" }}>
          <input
            autoFocus
            className="input lg"
            style={{ width: "100%" }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索需求雷达、竞品库、资讯流、调研工坊..."
          />
        </div>
        <div className="modal-body" style={{ paddingTop: 10, maxHeight: 420 }}>
          {filtered.length === 0 ? (
            <div className="empty">没有匹配的结果</div>
          ) : (
            <div className="search-result-list">
              {filtered.map((item) => (
                <button key={item.id} className="search-result" onClick={() => onPick(item)}>
                  <div className="search-result-icon">
                    <Icon name={item.icon} size={14} />
                  </div>
                  <div className="search-result-body">
                    <div className="search-result-top">
                      <span className="search-result-title">{item.title}</span>
                      <Tag tone="outline">{item.kind}</Tag>
                    </div>
                    <div className="search-result-meta">
                      <span>{TITLES[item.screen]?.label || item.screen}</span>
                      {item.meta ? <span>· {item.meta}</span> : null}
                    </div>
                    {item.summary ? <div className="search-result-summary">{item.summary}</div> : null}
                  </div>
                  <Icon name="chevron-right" size={14} style={{ color: "var(--text-3)" }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DemoModeIntroModal({ onClose, onExit }) {
  return (
    <div className="modal-backdrop demo-mode-backdrop" onClick={onClose}>
      <div className="modal demo-mode-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head demo-mode-modal-head">
          <div className="demo-mode-modal-title">
            <Tag tone="accent">演示模式</Tag>
            <h3>你当前进入的是演示模式</h3>
          </div>
          <Btn variant="ghost" icon="x" onClick={onClose} />
        </div>
        <div className="modal-body demo-mode-modal-body">
          <p>
            这里展示的是一套可直接体验的示例工作区，用来让你快速感受资讯流、竞品库、需求雷达和调研工坊的完整效果。
          </p>
          <p>
            如果你想回到自己的真实工作区，可以使用右上角的 <strong>退出演示模式</strong> 按钮。
          </p>
        </div>
        <div className="modal-foot demo-mode-modal-foot">
          <Btn variant="ghost" onClick={onClose}>我知道了</Btn>
          <Btn className="demo-mode-exit-btn" icon="check" onClick={onExit}>退出演示模式</Btn>
        </div>
      </div>
    </div>
  );
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message || body.error || `Request failed: ${response.status}`);
    error.status = response.status;
    error.code = body.error || "";
    throw error;
  }
  return response.json();
}

function normalizeData(input = {}) {
  input ||= {};
  return {
    user: {
      name: "visitor",
      role: "产品经理",
      initials: "VI",
      ...(input.user || {}),
    },
    products: Array.isArray(input.products) ? input.products : [],
    demands: Array.isArray(input.demands) ? input.demands : [],
    news: Array.isArray(input.news) ? input.news : [],
    newsCounts: input.newsCounts || { all: Array.isArray(input.news) ? input.news.length : 0, wechat: 0, trend: 0, starred: 0 },
    research: Array.isArray(input.research) ? input.research : [],
    rssSources: Array.isArray(input.rssSources) ? input.rssSources : [],
    officialRssSources: Array.isArray(input.officialRssSources) ? input.officialRssSources : [],
    settings: input.settings || {},
    onboarding: input.onboarding || {},
  };
}

/** 从用户名推导头像字符：中文名取末尾 1-2 个汉字，英文取首字母缩写 */
function userInitials(name) {
  const str = String(name || "").trim();
  if (!str) return "?";
  const cjk = str.match(/[一-鿿㐀-䶿]/g);
  if (cjk?.length) return cjk[cjk.length - 1];
  return str[0].toUpperCase();
}

const FEEDBACK_TYPES = ["功能建议", "Bug", "数据问题", "体验问题", "其他"];
const DOCUMENT_TYPES = [
  { value: "prd", label: "PRD" },
  { value: "mrd", label: "MRD" },
  { value: "report", label: "报告" },
  { value: "spec", label: "规格说明" },
  { value: "meeting_note", label: "会议纪要" },
  { value: "faq", label: "FAQ" },
  { value: "sales_doc", label: "销售资料" },
  { value: "other", label: "其他" },
];
const LIBRARY_TABS = [
  {
    key: "all",
    label: "全部资料",
    title: "资料库为空",
    desc: "导入公司文档后，LOOM 会自动切分章节、标准化字段，形成可检索的知识索引。",
  },
  {
    key: "prd",
    label: "PRD",
    title: "还没有 PRD 文档",
    desc: "导入或新建 PRD 后，功能属性、结构工艺、测试认证和包装需求会被标准化入库。",
  },
  {
    key: "mrd",
    label: "MRD",
    title: "还没有 MRD 文档",
    desc: "导入 MRD 后，市场背景、竞品地图、用户痛点和机会判断会进入知识索引。",
  },
  {
    key: "report",
    label: "报告",
    title: "还没有报告",
    desc: "上传调研报告、行业报告或项目复盘，LOOM 会提取可复用结论和引用证据。",
  },
  {
    key: "evidence",
    label: "证据",
    title: "还没有证据材料",
    desc: "网页、访谈、截图说明和竞品资料会作为证据沉淀，用来支撑 MRD / PRD 生成。",
  },
];

const MRD_SECTIONS = [
  { key: "market", label: "市场背景", desc: "说明市场规模、趋势变化、关键赛道和为什么现在值得做。", tags: ["行业趋势", "市场窗口", "关键证据"] },
  { key: "audience", label: "目标用户", desc: "定义核心用户、使用场景、购买角色和他们最真实的决策动机。", tags: ["用户画像", "场景", "购买动机"] },
  { key: "pain", label: "场景与痛点", desc: "把用户任务拆成具体场景，沉淀高频痛点、未满足需求和现有替代方案。", tags: ["任务链路", "痛点", "替代方案"] },
  { key: "competitors", label: "竞品地图", desc: "对比主要竞品的定位、价格、卖点和口碑短板，形成可复用竞品地图。", tags: ["竞品库", "价格带", "差异点"] },
  { key: "price", label: "价格带分析", desc: "梳理主流价格段、成本约束、溢价理由和用户可接受区间。", tags: ["价格带", "成本", "溢价"] },
  { key: "demand", label: "需求热力", desc: "汇总资讯流、需求雷达和社媒信号，判断哪些需求在近期升温。", tags: ["需求雷达", "热力", "信号"] },
  { key: "opportunity", label: "机会判断", desc: "结合用户痛点与竞品空位，提炼最值得投入的机会方向。", tags: ["机会点", "优先级", "判断"] },
  { key: "risk", label: "风险判断", desc: "列出市场、供应链、认证、成本和需求不确定性，避免只看乐观面。", tags: ["风险", "待验证", "边界"] },
  { key: "questions", label: "待确认问题", desc: "把缺证据、缺数据或需要团队判断的问题集中放在这里。", tags: ["待确认", "下一步", "负责人"], warn: true },
];

const PRD_SECTIONS = [
  { key: "definition", label: "产品定义", desc: "明确产品定位、目标用户、核心场景和必须交付的产品边界。", tags: ["定位", "场景", "边界"] },
  { key: "features", label: "功能属性", desc: "列出供应商需要理解和落地的功能清单、参数目标与体验要求。", tags: ["功能", "参数", "体验"] },
  { key: "structure", label: "结构要求", desc: "描述结构方案、装配关系、强度要求、尺寸边界和关键机构风险。", tags: ["结构", "装配", "尺寸"] },
  { key: "materials", label: "材料工艺", desc: "定义材料、表面处理、制造工艺、良率风险和成本约束。", tags: ["材料", "工艺", "成本"] },
  { key: "cmf", label: "ID / CMF", desc: "说明外观方向、颜色材质、细节语言和品牌一致性要求。", tags: ["ID", "CMF", "品牌"] },
  { key: "electronics", label: "电子 / 固件", desc: "适用于带电产品：定义电子方案、固件逻辑、功耗和异常保护。", tags: ["电子", "固件", "功耗"] },
  { key: "certification", label: "认证测试", desc: "列出认证、可靠性、软硬件测试和验收标准，按产品属性启用。", tags: ["认证", "测试", "验收"] },
  { key: "packaging", label: "包装需求", desc: "定义包装结构、配件清单、说明书、条码标签和运输保护要求。", tags: ["包装", "配件", "运输"] },
  { key: "acceptance", label: "验收标准", desc: "把可交付标准写清楚，方便工程、供应商和产品一起对齐。", tags: ["验收", "标准", "交付"] },
  { key: "questions", label: "待确认问题", desc: "记录还需要 PM、结构、电子、供应链或供应商共同确认的问题。", tags: ["待确认", "协作", "风险"], warn: true },
];

function DocStudioPreview({ type, sections, icon, title, desc, tags }) {
  const [activeSectionKey, setActiveSectionKey] = useState(sections[0]?.key || "");
  const activeSection = sections.find((section) => section.key === activeSectionKey) || sections[0];

  return (
    <div className="doc-studio-empty">
      <div className="doc-studio-preview">
        <div className="doc-studio-sidebar-preview" role="tablist" aria-label={`${type} 章节`}>
          {sections.map((section) => (
            <button
              key={section.key}
              type="button"
              className={`doc-section-item ${activeSection.key === section.key ? "active" : ""}`}
              onClick={() => setActiveSectionKey(section.key)}
              role="tab"
              aria-selected={activeSection.key === section.key}
            >
              <span className={`doc-section-dot ${section.warn ? "warn" : ""}`} />
              <span>{section.label}</span>
            </button>
          ))}
        </div>
        <div className="doc-studio-content-preview" role="tabpanel">
          <Icon name={icon} size={28} style={{ color: "var(--accent)", marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{activeSection.label}</div>
          <div style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.7, maxWidth: 360 }}>
            {activeSection.desc}
          </div>
          <div className="doc-section-hint">
            <div className="doc-section-hint-title">{title}</div>
            <div className="doc-section-hint-desc">{desc}</div>
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {(activeSection.tags || tags).map((tag) => (
              <Tag key={tag} tone={type === "MRD" ? "accent" : "outline"}>{tag}</Tag>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentModal({ mode, defaultDocType = "prd", onClose, onDone }) {
  const isImport = mode === "paste" || mode === "feishu";
  const [docType, setDocType] = useState(defaultDocType);
  const [title, setTitle] = useState("");
  const [sourceUri, setSourceUri] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const canSubmit = status !== "submitting" && (
    mode === "chrome"
      ? false
      : mode === "create"
      ? title.trim().length > 0
      : mode === "feishu"
        ? sourceUri.trim().length > 0
        : text.trim().length > 0
  );
  const modeMeta = {
    create: { icon: "plus", title: "新建资料", desc: "先建立一个草稿文档，后续再补章节、权限和索引。" },
    paste: { icon: "clipboard", title: "粘贴文本导入", desc: "适合从飞书、PRD、MRD 或报告中复制文本后导入。" },
    feishu: { icon: "link", title: "飞书文档导入", desc: "输入飞书文档链接，LOOM 会尝试读取并标准化。" },
    chrome: { icon: "chrome", title: "Chrome 插件采集", desc: "插件采集需要在浏览器扩展侧栏里触发，Web 端会接收保存后的资料。" },
  }[mode] || {};

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setMessage("");
    try {
      const payload = { title: title.trim(), doc_type: docType };
      const result = mode === "create"
        ? await api("/api/documents", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        : await api(mode === "feishu" ? "/api/document-imports/feishu" : "/api/document-imports/paste", {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            source_uri: sourceUri.trim(),
            url: sourceUri.trim(),
            text,
          }),
        });
      setStatus("sent");
      setMessage(mode === "create" ? "资料已创建。" : "资料已导入并标准化。");
      onDone?.(result);
      setTimeout(onClose, 450);
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "操作失败，请稍后再试。");
    }
  };

  return (
    <div className="modal-backdrop library-doc-backdrop" onClick={onClose}>
      <form className="modal library-doc-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <Icon name={modeMeta.icon} size={15} />
          <h3>{modeMeta.title}</h3>
          <Btn variant="ghost" icon="x" onClick={onClose} />
        </div>
        <div className="modal-body library-doc-body">
          <div className="library-doc-help">{modeMeta.desc}</div>
          {mode === "chrome" ? (
            <div className="library-doc-note">
              <div><strong>怎么用：</strong>打开任意资料页面，点 LOOM Chrome 插件侧栏里的采集/保存。</div>
              <div>保存成功后，资料会从后端进入 Library；如果页面没有自动刷新，可以回到 Library 后重新加载。</div>
            </div>
          ) : (
            <>
              <label>
                <span className="field-label">资料标题</span>
                <input
                  autoFocus
                  className="input lg"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={isImport ? "可选，不填会自动取首个标题" : "例如：桌面支架 PRD"}
                />
              </label>
              <label>
                <span className="field-label">资料类型</span>
                <select className="input lg" value={docType} onChange={(event) => setDocType(event.target.value)}>
                  {DOCUMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
            </>
          )}
          {mode === "feishu" && (
            <label>
              <span className="field-label">飞书文档链接</span>
              <input
                className="input lg"
                value={sourceUri}
                onChange={(event) => setSourceUri(event.target.value)}
                placeholder="https://..."
              />
            </label>
          )}
          {mode === "paste" && (
            <label>
              <span className="field-label">正文内容</span>
              <textarea
                className="input library-doc-textarea"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="粘贴 PRD / MRD / 报告文本。图片会先跳过，只保留结构和占位信息。"
              />
            </label>
          )}
          {message && <div className={`library-doc-message ${status === "error" ? "error" : ""}`}>{message}</div>}
        </div>
        <div className="modal-foot">
          <Btn variant="ghost" type="button" onClick={onClose}>取消</Btn>
          {mode === "chrome" ? null : (
            <Btn type="submit" disabled={!canSubmit}>{status === "submitting" ? "处理中..." : "确认"}</Btn>
          )}
        </div>
      </form>
    </div>
  );
}

function LibraryScreen({ data, api, reloadKey = 0, onNavigate, onOpenDocumentModal }) {
  const [activeTab, setActiveTab] = useState("all");
  const [documents, setDocuments] = useState([]);
  const [imports, setImports] = useState([]);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const current = LIBRARY_TABS.find((tab) => tab.key === activeTab) || LIBRARY_TABS[0];
  const workspaceId = data?.workspace?.id || "";
  const visibleDocuments = documents.filter((document) => activeTab === "all" || document.doc_type === activeTab);
  const loadDocuments = async () => {
    if (!api || !workspaceId) return;
    setStatus("loading");
    setMessage("");
    try {
      const query = new URLSearchParams({ workspace_id: workspaceId });
      const result = await api(`/api/documents?${query.toString()}`);
      setDocuments(Array.isArray(result) ? result : []);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "资料加载失败");
    }
  };
  const loadImports = async () => {
    if (!api || !workspaceId) return;
    try {
      const query = new URLSearchParams({ workspace_id: workspaceId, limit: "8" });
      const result = await api(`/api/document-imports?${query.toString()}`);
      setImports(Array.isArray(result) ? result : []);
    } catch {
      setImports([]);
    }
  };
  useEffect(() => {
    loadDocuments();
    loadImports();
  }, [workspaceId, reloadKey]);

  return (
    <div className="viewport">
      <div className="page page-fluid">
        <div className="screen-header screen-header-compact">
          <div className="screen-header-left">
            <div className="screen-icon-box"><Icon name="file-text" size={18} /></div>
            <div className="muted text-sm">导入飞书文档、PRD / MRD 文本，自动标准化入库</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn size="sm" variant="ghost" icon="sync" onClick={loadDocuments} disabled={status === "loading"}>刷新</Btn>
            <Btn size="sm" variant="ghost" icon="upload" onClick={() => onNavigate("library-import")}>导入文档</Btn>
            <Btn size="sm" variant="primary" icon="plus" onClick={() => onOpenDocumentModal("create")}>新建资料</Btn>
          </div>
        </div>
        <div className="screen-tabs" role="tablist" aria-label="资料类型">
          {LIBRARY_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`screen-tab ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              aria-selected={activeTab === tab.key}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {message ? <div className="library-doc-message error" style={{ marginBottom: 12 }}>{message}</div> : null}
        {visibleDocuments.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {visibleDocuments.map((document) => {
              const sections = Array.isArray(document.content?.normalized_sections) ? document.content.normalized_sections : [];
              return (
                <article
                  key={document.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "36px 1fr",
                    gap: 12,
                    alignItems: "center",
                    padding: 12,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    background: "color-mix(in srgb, var(--surface) 88%, transparent)",
                  }}
                >
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--surface-2)",
                    color: "var(--accent)",
                  }}><Icon name={document.doc_type === "mrd" ? "bar-chart" : document.doc_type === "prd" ? "clipboard" : "file-text"} size={16} /></div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 650, color: "var(--text)" }}>{document.title}</div>
                    <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center", fontSize: 11.5, color: "var(--text-3)" }}>
                      <Tag tone="outline">{String(document.doc_type || "other").toUpperCase()}</Tag>
                      <span>{document.status || "draft"}</span>
                      <span>{sections.length} 个章节</span>
                      {document.source_uri ? <span>飞书导入</span> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
        <div className="screen-empty-hero">
          <Icon name="file-text" size={32} style={{ color: "var(--accent)", marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{status === "loading" ? "正在加载资料..." : current.title}</div>
          <div style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.7, maxWidth: 390, margin: "0 auto 20px" }}>
            {current.desc}
          </div>
          <div className="screen-empty-actions">
            <button type="button" className="screen-action-card" onClick={() => onOpenDocumentModal("paste")}>
              <Icon name="clipboard" size={18} />
              <div className="screen-action-card-title">粘贴文本</div>
              <div className="screen-action-card-desc">直接粘贴 PRD / MRD / 报告文本</div>
            </button>
            <button type="button" className="screen-action-card" onClick={() => onOpenDocumentModal("feishu")}>
              <Icon name="link" size={18} />
              <div className="screen-action-card-title">飞书文档</div>
              <div className="screen-action-card-desc">输入飞书文档链接自动拉取</div>
            </button>
            <button type="button" className="screen-action-card" onClick={() => onNavigate("library-import")}>
              <Icon name="chrome" size={18} />
              <div className="screen-action-card-title">Chrome 插件</div>
              <div className="screen-action-card-desc">浏览时一键采集页面内容</div>
            </button>
          </div>
          {imports.length ? (
            <div className="library-import-note">
              <div className="library-import-note-title">最近导入</div>
              <div className="library-import-note-list">
                {imports.map((item) => (
                  <div key={item.id} className="library-import-note-row">
                    <span className={`library-import-status ${item.status || "pending"}`}>{item.status || "pending"}</span>
                    <span className="library-import-title">{item.title || "未命名导入"}</span>
                    <span className="library-import-meta">{item.doc_type?.toUpperCase?.() || "OTHER"}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        )}
      </div>
    </div>
  );
}

function LibraryImportScreen({ onOpenDocumentModal }) {
  return (
    <div className="viewport">
      <div className="page page-fluid">
        <div className="screen-header screen-header-compact">
          <div className="screen-header-left">
            <div className="screen-icon-box"><Icon name="upload" size={18} /></div>
            <div className="muted text-sm">把飞书文档、PRD / MRD 文本和网页证据沉淀进 Library</div>
          </div>
          <Btn size="sm" variant="primary" icon="plus" onClick={() => onOpenDocumentModal("create")}>新建资料</Btn>
        </div>
        <div className="screen-empty-hero screen-import-hero">
          <Icon name="file-text" size={32} style={{ color: "var(--accent)", marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>选择导入方式</div>
          <div style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.7, maxWidth: 430, margin: "0 auto 20px" }}>
            这里先专注完成资料进入知识库的动作；资料类型、权限和项目筛选统一回到 Library 列表里处理。
          </div>
          <div className="screen-empty-actions">
            <button type="button" className="screen-action-card" onClick={() => onOpenDocumentModal("paste")}>
              <Icon name="clipboard" size={18} />
              <div className="screen-action-card-title">粘贴文本</div>
              <div className="screen-action-card-desc">直接粘贴 PRD / MRD / 报告文本</div>
            </button>
            <button type="button" className="screen-action-card" onClick={() => onOpenDocumentModal("feishu")}>
              <Icon name="link" size={18} />
              <div className="screen-action-card-title">飞书文档</div>
              <div className="screen-action-card-desc">输入飞书文档链接自动拉取</div>
            </button>
            <button type="button" className="screen-action-card" onClick={() => onOpenDocumentModal("chrome")}>
              <Icon name="chrome" size={18} />
              <div className="screen-action-card-title">Chrome 插件</div>
              <div className="screen-action-card-desc">浏览时一键采集页面内容</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ active, onNav, data, onLogout, onFeedback, isAdmin, collapsed, onToggleCollapsed }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try {
      if (typeof localStorage === "undefined") return {};
      return JSON.parse(localStorage.getItem("loom.sidebarGroupsCollapsed") || "{}");
    } catch (err) {
      return {};
    }
  });
  const accountRef = useRef(null);
  const counts = {
    news: data.newsCounts?.all || data.news.length,
    products: data.products.length,
    demands: data.demands.length,
    research: data.research.length,
  };
  const user = data.user;
  const activeNavKey = active === "library-import" ? "library" : active;

  useEffect(() => {
    if (!accountOpen) return undefined;
    const closeOnOutside = (event) => {
      if (!accountRef.current?.contains(event.target)) setAccountOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem("loom.sidebarGroupsCollapsed", JSON.stringify(collapsedGroups));
  }, [collapsedGroups]);

  const toggleGroup = (groupName) => {
    setCollapsedGroups((current) => ({ ...current, [groupName]: !current[groupName] }));
  };

  return (
    <aside className="sidebar" data-screen-label="sidebar">
      <button
        type="button"
        className="sb-collapse-btn"
        onClick={onToggleCollapsed}
        title={collapsed ? "展开侧边栏" : "收起侧边栏"}
        aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
      >
        <Icon name="panel-open" size={13} />
      </button>
      <div className="sb-brand">
        <div>
          <div className="sb-brand-name">LOOM</div>
          <div className="sb-brand-tagline">Link · Observe · Organize · Make</div>
        </div>
      </div>

      {NAV.map((group) => {
        const groupActive = group.items.some((item) => item.key === activeNavKey);
        const groupCollapsed = Boolean(collapsedGroups[group.group]) && !groupActive;
        return (
        <div key={group.group} className={`sb-group ${groupCollapsed ? "is-collapsed" : ""} ${groupActive ? "has-active" : ""}`}>
          <button
            type="button"
            className="sb-group-label"
            onClick={() => toggleGroup(group.group)}
            aria-expanded={!groupCollapsed}
          >
            <span>{group.group}</span>
            <Icon name={groupCollapsed ? "chevron-right" : "chevron-down"} size={11} />
          </button>
          <div className="sb-group-items">
          {(collapsed || !groupCollapsed) && group.items.map((item) => (
            <div key={item.key} className={`sb-item ${activeNavKey === item.key ? "active" : ""}`} onClick={() => onNav(item.key)}>
              <Icon name={item.icon} size={15} className="ico" />
              <span className="sb-item-label">
                <span className="sb-item-main">{item.label}</span>
                {item.subLabel && <span className="sb-item-sub">{item.subLabel}</span>}
              </span>
              {counts[item.key] != null && <span className="badge">{counts[item.key]}</span>}
            </div>
          ))}
          </div>
        </div>
        );
      })}

      <div className="sb-spacer" />
      <button type="button" className="sb-item sb-item-button sb-feedback" onClick={onFeedback}>
        <Icon name="message-circle" size={15} className="ico" />
        <span className="sb-item-label">
          <span className="sb-item-main">反馈</span>
        </span>
      </button>
      <div className={`sb-item ${active === "settings" ? "active" : ""}`} onClick={() => onNav("settings")}>
        <Icon name="settings" size={15} className="ico" />
        <span className="sb-item-label">
          <span className="sb-item-main">设置</span>
        </span>
      </div>

      <div className="sb-footer" ref={accountRef}>
        {accountOpen && (
          <div className="sb-account-menu">
            {isAdmin ? (
              <a className="sb-account-menu-item" href="/admin">
                <Icon name="settings" size={14} />
                <span>管理员总控台</span>
              </a>
            ) : null}
            <button type="button" className="sb-account-menu-item danger" onClick={onLogout}>
              <Icon name="x" size={14} />
              <span>退出登录</span>
            </button>
          </div>
        )}
        <button
          type="button"
          className={`sb-user ${accountOpen ? "open" : ""}`}
          onClick={() => setAccountOpen((value) => !value)}
          aria-expanded={accountOpen}
        >
          <div className="sb-avatar" data-len={userInitials(user.name).length}>{userInitials(user.name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sb-user-name">{user.name}</div>
            <div className="sb-user-role">{user.role}</div>
          </div>
          <Icon name="chevron-down" size={12} style={{ color: "var(--text-3)" }} />
        </button>
      </div>
    </aside>
  );
}

function FeedbackModal({ active, onClose }) {
  const [type, setType] = useState("功能建议");
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const canSubmit = content.trim().length > 0 && status !== "submitting";

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setMessage("");
    try {
      await api("/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          type,
          content,
          contact,
          screen: active,
          page: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        }),
      });
      setStatus("sent");
      setMessage("已收到，谢谢你。");
      setContent("");
      setContact("");
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "提交失败，请稍后再试。");
    }
  };

  return (
    <div className="modal-backdrop feedback-backdrop" onClick={onClose}>
      <form className="modal feedback-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <Icon name="sparkles" size={15} />
          <h3>用户反馈</h3>
          <Btn variant="ghost" icon="x" onClick={onClose} />
        </div>
        <div className="modal-body feedback-body">
          <div className="feedback-type-grid" role="radiogroup" aria-label="反馈类型">
            {FEEDBACK_TYPES.map((item) => (
              <button
                key={item}
                type="button"
                className={`feedback-type ${type === item ? "active" : ""}`}
                onClick={() => setType(item)}
                aria-pressed={type === item}
              >
                {item}
              </button>
            ))}
          </div>
          <label>
            <span className="field-label">反馈内容</span>
            <textarea
              autoFocus
              className="input feedback-textarea"
              value={content}
              maxLength={2000}
              onChange={(event) => setContent(event.target.value)}
              placeholder="哪里不顺手、哪里出错，直接写一句也可以。"
            />
          </label>
          <label>
            <span className="field-label">联系方式（可选）</span>
            <input
              className="input"
              value={contact}
              maxLength={200}
              onChange={(event) => setContact(event.target.value)}
              placeholder="飞书、微信、手机号都可以，不填也没关系"
            />
          </label>
          {message ? <div className={`feedback-message ${status === "error" ? "error" : ""}`}>{message}</div> : null}
        </div>
        <div className="modal-foot">
          <Btn variant="ghost" onClick={onClose}>关闭</Btn>
          <Btn type="submit" disabled={!canSubmit}>{status === "submitting" ? "提交中..." : "提交反馈"}</Btn>
        </div>
      </form>
    </div>
  );
}

function PMCTweaks({ t, setTweak }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="主题">
        <TweakRadio label="模式" value={t.mode} onChange={(v) => setTweak("mode", v)}
          options={[
            { value: "light", label: "浅色" },
            { value: "dark", label: "深色" },
          ]} />
      </TweakSection>
      <TweakSection title="演示">
        <TweakToggle label="显示登录页" checked={t.showLogin} onChange={(v) => setTweak("showLogin", v)} />
      </TweakSection>
    </TweaksPanel>
  );
}

function App() {
  const initialScreen = (() => {
    const params = new URLSearchParams(window.location.search);
    const legacyScreens = {
      knowledge: "library",
      "knowledge-import": "library-import",
      "knowledge-query": "ask",
      "knowledge-draft": "mrd",
    };
    const screen = legacyScreens[params.get("screen")] || params.get("screen");
    return ["news", "products", "demands", "research", "library", "library-import", "ask", "mrd", "prd", "feishu_space", "settings"].includes(screen) ? screen : "news";
  })();
  const [active, setActive] = useState(initialScreen);
  const [me, setMe] = useState(null);
  const [data, setData] = useState(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [providers, setProviders] = useState({ password: true, feishu: false });
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [navTarget, setNavTarget] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("loom.sidebarCollapsed") === "1");
  const [demoIntroOpen, setDemoIntroOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [documentModalMode, setDocumentModalMode] = useState("");
  const [libraryReloadKey, setLibraryReloadKey] = useState(0);
  const [t, setTweak] = useTweaks({ theme: "halo", mode: "light", showLogin: false });
  const prevSampleWorkspaceRef = useRef(false);
  const prevUserIdRef = useRef("");
  const meRef = useRef(null);
  const dataRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme);
    document.documentElement.setAttribute("data-mode", t.mode);
  }, [t.theme, t.mode]);

  useEffect(() => {
    localStorage.setItem("loom.sidebarCollapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    meRef.current = me;
    dataRef.current = data;
  }, [me, data]);

  const loadBootstrap = async ({ background = false } = {}) => {
    const providerResponse = await api("/api/auth/providers").catch(() => ({ password: true, feishu: false }));
    setProviders({
      password: providerResponse?.password !== false,
      feishu: Boolean(providerResponse?.feishu),
    });

    let meResponse = null;
    try {
      meResponse = await api("/api/me");
    } catch (err) {
      if (background && meRef.current) {
        setBootstrapped(true);
        return;
      }
      setMe(null);
      setData(null);
      setBootstrapped(true);
      return;
    }

    const user = meResponse?.user || null;
    if (!user) {
      setMe(null);
      setData(null);
      setBootstrapped(true);
      return;
    }

    setMe(user);

    let nextBootstrap = null;
    let bootstrapError = null;
    const retryDelays = [0, 180, 400];
    for (const delayMs of retryDelays) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        nextBootstrap = await api("/api/bootstrap");
        bootstrapError = null;
        break;
      } catch (err) {
        bootstrapError = err;
        if (err?.status && err.status !== 401 && err.status < 500) break;
      }
    }

    if (!nextBootstrap) {
      if (background && dataRef.current) {
        setBootstrapped(true);
        return;
      }
      if (bootstrapError) {
        setError(bootstrapError.message || "工作区加载失败");
      }
      setBootstrapped(true);
      return;
    }

    setError("");
    setData(normalizeData(nextBootstrap));
    setBootstrapped(true);
  };

  useEffect(() => {
    loadBootstrap().catch((err) => {
      setError(err.message);
      setBootstrapped(true);
    });
  }, []);

  useEffect(() => {
    const resyncAuth = () => {
      loadBootstrap({ background: true }).catch((err) => setError(err.message));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") resyncAuth();
    };
    window.addEventListener("focus", resyncAuth);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", resyncAuth);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setDemoIntroOpen(false);
        setFeedbackOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const refreshData = async () => {
    const next = await api("/api/bootstrap");
    setData(normalizeData(next));
  };

  const finishSampleWorkspace = async () => {
    const next = await api("/api/onboarding/finish-sample", { method: "POST" });
    setData(normalizeData(next));
    setActive("news");
  };

  const login = async ({ username, password }) => {
    setError("");
    try {
      const result = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setMe(result.user);
      await refreshData();
    } catch (err) {
      setError(err.message || "登录失败，请稍后重试");
    }
  };

  const loginAsDemo = async () => {
    setError("");
    try {
      const result = await api("/api/auth/visitor", { method: "POST" });
      setMe(result.user);
      await refreshData();
    } catch (err) {
      setError(err.message || "演示模式暂时不可用，请稍后重试");
    }
  };

  const loginWithFeishu = () => {
    setError("");
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.href = `/api/auth/feishu/start?return_to=${encodeURIComponent(returnTo || "/")}`;
  };

  const logout = async () => {
    setError("");
    await api("/api/auth/logout", { method: "POST" });
    setMe(null);
    setData(null);
    setBootstrapped(true);
    setSearchOpen(false);
    setNotificationsOpen(false);
  };

  useEffect(() => {
    if (!me || !data) return;
    const isDemo = Boolean(data.onboarding?.sampleWorkspace);
    if (!isDemo) {
      setDemoIntroOpen(false);
    } else if (!prevSampleWorkspaceRef.current || prevUserIdRef.current !== (data.user?.id || me.id || "visitor")) {
      setDemoIntroOpen(true);
    }
    prevSampleWorkspaceRef.current = isDemo;
    prevUserIdRef.current = data.user?.id || me.id || "visitor";
  }, [me, data]);

  if (!bootstrapped || (me && !data)) {
    return (
      <div className="login-stage">
        <div className="login-card">
          <div className="login-brand"><div><div className="name">LOOM</div><div className="sub">{me ? "正在恢复你的工作区" : "正在加载本地数据"}</div></div></div>
          {error && <div className="ai-block" style={{ color: "var(--danger)" }}>{error}</div>}
        </div>
      </div>
    );
  }

  if (!me || t.showLogin) {
    return (
      <>
        <LoginScreen onLogin={login} onDemoLogin={loginAsDemo} onFeishuLogin={loginWithFeishu} error={error} providers={providers} />
      </>
    );
  }

  const screenProps = { data, api, refreshData, navTarget };
  const isAdmin = Boolean(me?.is_admin || data?.user?.is_admin || data?.user?.is_owner);
  const sampleWorkspace = Boolean(data.onboarding?.sampleWorkspace);
  const canExitSample = Boolean(data.onboarding?.canExitSample);
  const liveNewsReady = Boolean(data.onboarding?.liveNewsReady);
  const latestNewsAt = data.onboarding?.latestNewsAt || data.onboarding?.latestFetchedAt || "";
  const screen = {
    news: <NewsScreen {...screenProps} />,
    products: <ProductsScreen {...screenProps} detailCollapsed={detailCollapsed} setDetailCollapsed={setDetailCollapsed} />,
    demands: <DemandsScreen {...screenProps} />,
    research: <ResearchScreen {...screenProps} />,
    library: <LibraryScreen {...screenProps} reloadKey={libraryReloadKey} onNavigate={setActive} onOpenDocumentModal={setDocumentModalMode} />,
    "library-import": <LibraryImportScreen onOpenDocumentModal={setDocumentModalMode} />,
    ask: (
      <div className="viewport">
        <div className="page page-fluid">
          <div className="screen-header screen-header-compact">
            <div className="screen-header-left">
              <div className="screen-icon-box"><Icon name="bot" size={18} /></div>
              <div className="muted text-sm">基于公司知识库的智能问答，每个回答都带来源引用</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Tag tone="outline">0 个知识片段</Tag>
            </div>
          </div>
          <div className="ask-container">
            <div className="ask-empty">
              <div className="ask-empty-icon"><Icon name="bot" size={36} /></div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Ask LOOM</div>
              <div style={{ fontSize: 13.5, color: "var(--text-3)", lineHeight: 1.7, maxWidth: 400 }}>
                向知识库提问，获得带证据引用的答案。问答会自动识别权限边界——对内答全量，对客户只答可对外口径。
              </div>
              <div className="ask-example-questions">
                <div className="ask-example-q"><Icon name="chevron-right" size={12} />这个产品和大疆某款有什么差异？</div>
                <div className="ask-example-q"><Icon name="chevron-right" size={12} />客户问发热问题怎么回答？</div>
                <div className="ask-example-q"><Icon name="chevron-right" size={12} />这个需求最近热不热？</div>
                <div className="ask-example-q"><Icon name="chevron-right" size={12} />有没有 MRD 支持这个方向？</div>
              </div>
            </div>
            <div className="ask-input-bar">
              <Icon name="bot" size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <input className="ask-input" placeholder="输入问题，按 Enter 发送…" disabled />
            </div>
          </div>
        </div>
      </div>
    ),
    mrd: (
      <div className="viewport">
        <div className="page page-fluid">
          <div className="screen-header screen-header-compact">
            <div className="screen-header-left">
              <div className="screen-icon-box"><Icon name="bar-chart" size={18} /></div>
              <div className="muted text-sm">结构化市场分析文档，每个判断都可追溯到证据</div>
            </div>
            <Btn size="sm" variant="primary" icon="plus">新建 MRD</Btn>
          </div>
          <DocStudioPreview
            type="MRD"
            sections={MRD_SECTIONS}
            icon="bar-chart"
            title="从知识库生成 MRD"
            desc="先在 Library 导入资料并构建知识包，再一键生成结构化 MRD。"
            tags={["竞品库", "需求雷达", "资讯流信号"]}
          />
        </div>
      </div>
    ),
    prd: (
      <div className="viewport">
        <div className="page page-fluid">
          <div className="screen-header screen-header-compact">
            <div className="screen-header-left">
              <div className="screen-icon-box"><Icon name="clipboard" size={18} /></div>
              <div className="muted text-sm">硬件产品定义文档，从 MRD 和需求直接生成</div>
            </div>
            <Btn size="sm" variant="primary" icon="plus">新建 PRD</Btn>
          </div>
          <DocStudioPreview
            type="PRD"
            sections={PRD_SECTIONS}
            icon="clipboard"
            title="从 MRD 生成 PRD"
            desc="选择关联的 MRD 和产品类型模板，AI 会根据知识库生成硬件 PRD 草稿。"
            tags={["功能规格表", "参数表", "供应商版导出", "飞书文档"]}
          />
        </div>
      </div>
    ),
    settings: <SettingsScreen {...screenProps} />,
    feishu_space: (
      <div className="viewport">
        <div className="page" style={{ maxWidth: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={{ width: 40, height: 40, borderRadius: "var(--radius)", background: "var(--accent-soft)", display: "grid", placeItems: "center" }}>
              <Icon name="folder-open" size={20} style={{ color: "var(--accent-text)" }} />
            </div>
            <div>
              <h1 className="h1" style={{ marginBottom: 2 }}>飞书联动</h1>
              <div className="muted text-sm">将飞书空间、文档与项目接入 LOOM 工作流</div>
            </div>
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "32px 28px", textAlign: "center" }}>
            <Icon name="folder-open" size={28} style={{ color: "var(--accent)", marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>飞书集成即将上线</div>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.7, maxWidth: 320, margin: "0 auto" }}>
              接入后可同步飞书多维表格、文档和项目，与竞品库、需求雷达、调研工坊双向联动，告别手动复制粘贴。
            </div>
            <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "center" }}>
              <span style={{ fontSize: 11.5, color: "var(--text-4)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "4px 10px" }}>多维表格</span>
              <span style={{ fontSize: 11.5, color: "var(--text-4)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "4px 10px" }}>飞书文档</span>
              <span style={{ fontSize: 11.5, color: "var(--text-4)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "4px 10px" }}>项目管理</span>
            </div>
          </div>
        </div>
      </div>
    ),
  }[active];
  const notifications = [
    { id: "n1", label: "系统", text: "全局搜索已经接通，可用 ⌘K 快速打开。", tone: "outline" },
    { id: "n2", label: "News", text: `${data.newsCounts?.all || data.news.length} 条资讯已载入。`, tone: "outline" },
  ];

  return (
    <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        active={active}
        onNav={setActive}
        data={data}
        onLogout={logout}
        onFeedback={() => setFeedbackOpen(true)}
        isAdmin={isAdmin}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      />
      <main className="main" data-screen-label={TITLES[active]?.label || active}>
        <div className="topbar">
          <div className="topbar-title">
            {TITLES[active]?.label || active}
            {TITLES[active]?.subLabel && <span className="topbar-title-sub"> {TITLES[active].subLabel}</span>}
          </div>
          {active === "products" && <span className="topbar-crumb">· {data.products.length} 条记录</span>}
          {active === "news" && <span className="topbar-crumb">· 插件采集 · {data.newsCounts?.all || data.news.length} 条资讯</span>}
          {active === "demands" && <span className="topbar-crumb">· {data.demands.length} 条需求</span>}
          {active === "research" && <span className="topbar-crumb">· {data.research.length} 个项目</span>}
          <div className="topbar-actions">
            {sampleWorkspace && (
              <span className="topbar-sample-chip" title={latestNewsAt ? `示例数据 · 更新 ${formatSampleDate(latestNewsAt)}` : "示例数据"}>
                <span className="topbar-sample-dot" aria-hidden="true" />
                示例工作区
              </span>
            )}
            {isAdmin ? (
              <a className="topbar-admin-link" href="/admin">
                <Icon name="settings" size={13} />
                <span>管理员总控台</span>
              </a>
            ) : null}
            {sampleWorkspace && canExitSample ? (
              <Btn
                className="demo-mode-exit-btn"
                size="sm"
                icon="check"
                onClick={finishSampleWorkspace}
              >
                退出演示模式
              </Btn>
            ) : null}
            <button
              type="button"
              className="topbar-search-trigger"
              onClick={() => setSearchOpen(true)}
            >
              <Icon name="search" size={13} />
              <span>搜索</span>
              <span className="kbd">⌘K</span>
            </button>
            <div style={{ position: "relative" }}>
              <Btn variant="ghost" icon="bell" size="sm" onClick={() => setNotificationsOpen((v) => !v)} />
              {notificationsOpen && (
                <div className="topbar-popover">
                  <div className="topbar-popover-head">
                    <span>通知</span>
                    <Tag tone="outline">{notifications.length}</Tag>
                  </div>
                  <div className="topbar-popover-list">
                    {notifications.map((item) => (
                      <div key={item.id} className="topbar-popover-item">
                        <Tag tone={item.tone}>{item.label}</Tag>
                        <div className="topbar-popover-text">{item.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              className={`topbar-mode-toggle ${t.mode === "dark" ? "dark" : ""}`}
              onClick={() => setTweak("mode", t.mode === "dark" ? "light" : "dark")}
              title={t.mode === "dark" ? "切换到白天模式" : "切换到暗夜模式"}
              aria-label={t.mode === "dark" ? "切换到白天模式" : "切换到暗夜模式"}
            >
              <Icon name={t.mode === "dark" ? "sun" : "moon"} size={14} />
            </button>
            <Btn
              variant="ghost"
              icon="panel-open"
              size="sm"
              onClick={() => setDetailCollapsed((value) => !value)}
            />
          </div>
        </div>
        {screen}
      </main>
      {searchOpen && data && (
        <GlobalSearchModal
          data={data}
          onClose={() => setSearchOpen(false)}
          onPick={(item) => {
            setActive(item.screen);
            setNavTarget({ screen: item.screen, id: item.entityId, at: Date.now() });
            setSearchOpen(false);
          }}
        />
      )}
      {demoIntroOpen && sampleWorkspace && canExitSample && (
        <DemoModeIntroModal
          onClose={() => setDemoIntroOpen(false)}
          onExit={async () => {
            setDemoIntroOpen(false);
            await finishSampleWorkspace();
          }}
        />
      )}
      {feedbackOpen && <FeedbackModal active={active} onClose={() => setFeedbackOpen(false)} />}
      {documentModalMode && (
        <DocumentModal
          mode={documentModalMode}
          onClose={() => setDocumentModalMode("")}
          onDone={async () => {
            await loadBootstrap({ background: true });
            setLibraryReloadKey((value) => value + 1);
            setActive("library");
          }}
        />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

function formatSampleDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
