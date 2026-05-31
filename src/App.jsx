/* global LoginScreen, NewsScreen, ProductsScreen, DemandsScreen, ResearchScreen, KnowledgeScreen, SettingsScreen, DocumentStudio, StandardsScreen, Icon, Btn, Tag, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle */
const React = globalThis.React;
const ReactDOM = globalThis.ReactDOM;
const LoginScreen = globalThis.LoginScreen;
const NewsScreen = globalThis.NewsScreen;
const ProductsScreen = globalThis.ProductsScreen;
const DemandsScreen = globalThis.DemandsScreen;
const ResearchScreen = globalThis.ResearchScreen;
const KnowledgeScreen = globalThis.KnowledgeScreen;
const SettingsScreen = globalThis.SettingsScreen;
const DocumentStudio = globalThis.DocumentStudio;
const StandardsScreen = globalThis.StandardsScreen;
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
  { key: "home", label: "工作台", icon: "home" },
  { key: "news", label: "资讯流", icon: "newspaper" },
  { key: "demands", label: "需求库", icon: "bar-chart" },
  { key: "products", label: "竞品库", icon: "boxes" },
  { key: "research", label: "调研工坊", icon: "compass" },
  { key: "library", label: "知识库", icon: "file-text" },
];

const TITLES = {
  home: { label: "工作台", subLabel: "团队研究枢纽" },
  news: { label: "资讯流", subLabel: "行业资讯 · RSS 订阅" },
  products: { label: "竞品库", subLabel: "快照 · 评论 · 标注" },
  demands: { label: "需求库", subLabel: "飞书镜像 + 用户声音" },
  library: { label: "知识库", subLabel: "PRD / MRD · 向量检索" },
  "library-import": { label: "知识库", subLabel: "导入资料" },
  mrd: { label: "市场分析", subLabel: "MRD · 市场需求文档" },
  prd: { label: "产品定义", subLabel: "PRD · 产品需求文档" },
  knowledge: { label: "知识库", subLabel: "历史入口" },
  ask: { label: "知识库", subLabel: "历史入口" },
  standards: { label: "知识库", subLabel: "历史入口" },
  research: { label: "调研工坊", subLabel: "发起 · 沉淀 · 导出" },
  settings: { label: "设置", subLabel: "集成 · 数据源 · 团队" },
  feishu_space: { label: "工作台", subLabel: "历史入口" },
};

const SEARCH_ICON = {
  news: "newspaper",
  products: "boxes",
  demands: "bar-chart",
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
            placeholder="搜索需求库、竞品库、资讯流、调研工坊..."
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
            这里展示的是一套可直接体验的示例工作区，用来让你快速感受资讯流、竞品库、需求库和调研工坊的完整效果。
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
    newsCounts: input.newsCounts || { all: Array.isArray(input.news) ? input.news.length : 0, official: Array.isArray(input.news) ? input.news.length : 0, wechat: 0, trend: 0, starred: 0 },
    research: Array.isArray(input.research) ? input.research : [],
    rssSources: Array.isArray(input.rssSources) ? input.rssSources : [],
    officialRssSources: Array.isArray(input.officialRssSources) ? input.officialRssSources : [],
    settings: input.settings || {},
    workspace: input.workspace || null,
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
const DOCUMENT_VIEW_TEMPLATES = {
  mrd: {
    icon: "bar-chart",
    title: "MRD Studio",
    desc: "结构化市场分析文档，每个判断都可追溯到证据",
    sectionCount: 10,
    newMode: "structured-mrd",
    newLabel: "新建 MRD",
  },
  prd: {
    icon: "clipboard",
    title: "PRD Builder",
    desc: "硬件产品定义文档，从 MRD 和需求直接生成",
    sectionCount: 11,
    newMode: "structured-prd",
    newLabel: "新建 PRD",
  },
};
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
  { key: "demand", label: "需求热力", desc: "汇总资讯流、需求库和社媒信号，判断哪些需求在近期升温。", tags: ["需求库", "热力", "信号"] },
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
  const isImport = mode === "paste" || mode === "feishu" || mode === "csv";
  const isStructured = mode === "structured-mrd" || mode === "structured-prd";
  const [docType, setDocType] = useState(defaultDocType);
  const [title, setTitle] = useState("");
  const [sourceUri, setSourceUri] = useState("");
  const [text, setText] = useState("");
  const [csvName, setCsvName] = useState("外部数据集");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const canSubmit = status !== "submitting" && (
    mode === "chrome"
      ? false
      : mode === "create" || isStructured
        ? title.trim().length > 0
        : mode === "feishu"
          ? sourceUri.trim().length > 0
          : text.trim().length > 0
  );
  const modeMeta = {
    create: { icon: "plus", title: "新建资料", desc: "先建立一个草稿文档，后续再补章节、权限和索引。" },
    "structured-mrd": { icon: "bar-chart", title: "新建 MRD", desc: "创建一份可编辑的市场分析文档。" },
    "structured-prd": { icon: "clipboard", title: "新建 PRD", desc: "创建一份可编辑的产品定义文档。" },
    paste: { icon: "clipboard", title: "粘贴文本导入", desc: "适合从飞书、PRD、MRD 或报告中复制文本后导入。" },
    feishu: { icon: "link", title: "飞书文档导入", desc: "粘贴飞书文档链接，LOOM 读取并标准化结构。" },
    csv: { icon: "database", title: "CSV / 表格导入", desc: "导入月销、价格、评分等外部数据集到产品级字段。" },
    chrome: { icon: "chrome", title: "Chrome 插件采集", desc: "插件采集需要在浏览器扩展侧栏里触发，Web 端会接收保存后的资料。" },
  }[mode] || {};

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setMessage("");
    try {
      const payload = { title: title.trim(), doc_type: docType };
      const result = isStructured
        ? await api(mode === "structured-mrd" ? "/api/mrd-documents" : "/api/prd-documents", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        : mode === "create"
          ? await api("/api/documents", {
            method: "POST",
            body: JSON.stringify(payload),
          })
          : mode === "csv"
            ? await api("/api/document-imports/csv", {
              method: "POST",
              body: JSON.stringify({ name: csvName.trim() || "外部数据集", csv_text: text }),
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
      setMessage(mode === "create" ? "资料已创建。" : mode === "csv" ? "数据集已导入。" : "资料已导入并标准化。");
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
                  placeholder={isStructured ? (mode === "structured-mrd" ? "例如：Pocket 3 市场分析" : "例如：Pocket 3 产品定义") : isImport ? "可选，不填会自动取首个标题" : "例如：桌面支架 PRD"}
                />
              </label>
              {!isStructured && (
                <label>
                  <span className="field-label">资料类型</span>
                  <select className="input lg" value={docType} onChange={(event) => setDocType(event.target.value)}>
                    {DOCUMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
              )}
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
          {mode === "csv" && (
            <>
              <label>
                <span className="field-label">数据集名称</span>
                <input className="input lg" value={csvName} onChange={(e) => setCsvName(e.target.value)} placeholder="例如：Pocket 3 月销" />
              </label>
              <label>
                <span className="field-label">CSV 内容</span>
                <textarea
                  className="input library-doc-textarea"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={"category,monthly_sales,price,rating\nlighting,1200,199,4.6\ntripod,860,89,4.4"}
                />
              </label>
            </>
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
      <div className="page page-fluid page-narrow">
        <header className="page-head">
          <div className="page-head-left">
            <div className="screen-icon-box"><Icon name="file-text" size={20} /></div>
            <div>
              <h1 className="h1" style={{ marginBottom: 2 }}>资料库</h1>
              <div className="muted text-sm">导入飞书文档、PRD / MRD 文本，自动标准化入库。</div>
            </div>
          </div>
          <div className="page-head-actions">
            <Btn size="sm" variant="ghost" icon="sync" onClick={loadDocuments} disabled={status === "loading"}>刷新</Btn>
            <Btn size="sm" variant="ghost" icon="upload" onClick={() => onNavigate("library-import")}>导入文档</Btn>
            <Btn size="sm" variant="primary" icon="plus" onClick={() => onOpenDocumentModal("create")}>新建资料</Btn>
          </div>
        </header>
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
      <div className="page page-fluid page-narrow">
        <header className="page-head">
          <div className="page-head-left">
            <div className="screen-icon-box"><Icon name="upload" size={20} /></div>
            <div>
              <h1 className="h1" style={{ marginBottom: 2 }}>导入资料</h1>
              <div className="muted text-sm">把飞书文档、PRD / MRD 文本和网页证据沉淀进资料库。</div>
            </div>
          </div>
          <div className="page-head-actions">
            <Btn size="sm" variant="primary" icon="plus" onClick={() => onOpenDocumentModal("create")}>新建资料</Btn>
          </div>
        </header>
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

function FeishuProjectsScreen({ sampleWorkspace = false }) {
  // 真实数据接入飞书 MCP 后从后端拉取；当前没接入时给 visitor 看几个 mock 项目
  const SAMPLE_PROJECTS = sampleWorkspace ? [
    {
      id: "fp-1",
      name: "Pocket 3 量产爬坡",
      status: "active",
      owner: "张三",
      progress: 62,
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      tags: ["量产", "Pocket 3"],
      linkedPrd: "Pocket 3 产品定义示例",
      url: "https://example.feishu.cn/project/sample-1",
    },
    {
      id: "fp-2",
      name: "下一代云台 PRD 立项",
      status: "planning",
      owner: "李四",
      progress: 18,
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
      tags: ["立项", "云台"],
      linkedPrd: null,
      url: "https://example.feishu.cn/project/sample-2",
    },
    {
      id: "fp-3",
      name: "Insta360 GO 系列竞品研究",
      status: "active",
      owner: "王五",
      progress: 45,
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
      tags: ["竞品", "调研"],
      linkedPrd: null,
      url: "https://example.feishu.cn/project/sample-3",
    },
  ] : [];

  const [statusFilter, setStatusFilter] = useState("all");
  const projects = SAMPLE_PROJECTS.filter((p) => statusFilter === "all" || p.status === statusFilter);

  const statusMeta = {
    planning: { label: "立项", tone: "outline" },
    active: { label: "进行中", tone: "accent" },
    done: { label: "已完成", tone: "success" },
    paused: { label: "暂停", tone: "outline" },
  };

  const fmtAgo = (iso) => {
    if (!iso) return "";
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return `${s} 秒前`;
    if (s < 3600) return `${Math.round(s / 60)} 分钟前`;
    if (s < 86400) return `${Math.round(s / 3600)} 小时前`;
    return `${Math.round(s / 86400)} 天前`;
  };

  return (
    <div className="viewport">
      <div className="page page-fluid page-narrow">
        <header className="page-head">
          <div className="page-head-left">
            <div className="screen-icon-box"><Icon name="folder-open" size={20} /></div>
            <div>
              <h1 className="h1" style={{ marginBottom: 2 }}>飞书项目</h1>
              <div className="muted text-sm">
                自动同步飞书项目的开发任务、需求池与文档；与 PRD / MRD / 需求库双向关联。
                <span style={{ marginLeft: 6 }}>
                  接入方式见 <a href="?screen=settings" style={{ color: 'var(--accent)' }}>设置 → 飞书项目 MCP</a>。
                </span>
              </div>
            </div>
          </div>
          <div className="page-head-actions">
            <Tag tone="outline">{SAMPLE_PROJECTS.length} 个项目</Tag>
            <Btn size="sm" variant="ghost" icon="sync">手动同步</Btn>
          </div>
        </header>

        {SAMPLE_PROJECTS.length > 0 ? (
          <div className="filter-bar">
            <div className="filter-bar-cluster">
              <div className="demand-filter-group">
                <div className="demand-filter-label"><Icon name="filter" size={13} /><span>筛选</span></div>
                <select className="demand-filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">全部状态</option>
                  <option value="planning">立项</option>
                  <option value="active">进行中</option>
                  <option value="done">已完成</option>
                  <option value="paused">暂停</option>
                </select>
              </div>
            </div>
            <div className="filter-bar-meta">
              <span className="demand-match-count">匹配 {projects.length} / {SAMPLE_PROJECTS.length}</span>
            </div>
          </div>
        ) : null}

        {SAMPLE_PROJECTS.length === 0 ? (
          <div className="empty-hero">
            <Icon name="folder-open" size={48} />
            <h2>还没有飞书项目</h2>
            <p className="muted">
              在「设置 → 飞书项目 MCP」配置 token 后，会自动拉取项目列表、任务、需求池。
              <br />接入前可继续在竞品库 / 需求库 / PRD 里手动录入。
            </p>
            <Btn variant="primary" icon="settings" onClick={() => { window.location.search = "?screen=settings"; }}>
              去配置 MCP
            </Btn>
          </div>
        ) : (
          <section className="card-section">
            <div className="card-section-head">
              <h2>项目</h2>
              <Tag tone="outline">{projects.length}</Tag>
            </div>
            <div className="card-grid">
              {projects.map((p) => {
                const status = statusMeta[p.status] || statusMeta.planning;
                return (
                  <div key={p.id} className="doc-card">
                    <a className="doc-card-main" href={p.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      <div className="doc-card-head">
                        <Icon name="folder-open" size={15} />
                        <span className="doc-card-meta-top">
                          <Tag tone={status.tone}>{status.label}</Tag>
                        </span>
                      </div>
                      <h3 className="doc-card-title">{p.name}</h3>
                      <div className="doc-card-badges">
                        {p.tags.map((t) => <Tag key={t} tone="outline">{t}</Tag>)}
                      </div>
                      <div className="doc-card-meta-bottom">
                        <div className="doc-card-progress">
                          <div className="doc-card-progress-bar"><span style={{ width: `${p.progress}%` }} /></div>
                          <span className="muted text-sm">{p.progress}%</span>
                        </div>
                      </div>
                      <div className="doc-card-footer">
                        <span className="muted text-sm">{p.owner} · 更新 {fmtAgo(p.updatedAt)}</span>
                        {p.linkedPrd ? <div className="muted text-sm" style={{ marginTop: 4 }}>关联 PRD：{p.linkedPrd}</div> : null}
                      </div>
                    </a>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function formatAgo(value) {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} 小时前`;
  return `${Math.round(seconds / 86400)} 天前`;
}

function HomeScreen({ data, onNavigate }) {
  const dashboard = data.dashboard || {};
  const research = data.research || [];
  const demands = data.demands || [];
  const products = data.products || [];
  const news = data.news || [];
  const activeResearch = dashboard.active_research || research.filter((item) => item.status !== "done" && item.status !== "archived").slice(0, 5);
  const myDemandsCount = dashboard.my_demands_count ?? demands.length;
  const decisionEvents = dashboard.recent_decisions || [];
  const abnormalItems = dashboard.abnormal_items || [];
  const hotKeywords = dashboard.hot_keywords || [];
  const recentNews = news.filter((item) => item.titleZh || item.original_title).slice(0, 5);
  const feishuStatus = dashboard.feishu_status || {};
  const feishuProjectStatus = dashboard.feishu_project_status || {};
  const feishuProjectConfigured = Boolean(
    feishuProjectStatus.configured ||
    data.settings?.feishu_project_default_project_key ||
    data.settings?.feishu_mcp_project_key ||
    data.settings?.feishu_project_default_project_name ||
    data.settings?.feishu_mcp_project_name
  );
  const feishuProjectSynced = feishuProjectConfigured && Number(feishuProjectStatus.items_count || 0) > 0;
  const feishuConnected = feishuProjectConfigured || Boolean(feishuStatus.connected);
  const feishuProjectName =
    feishuProjectStatus.project_name ||
    data.settings?.feishu_project_default_project_name ||
    data.settings?.feishu_mcp_project_name ||
    "飞书项目空间";
  const currentUser = data.user?.name || "";
  const hour = new Date().getHours();
  const greet = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
  const actionItems = [];
  if (dashboard.action_summary) actionItems.push(dashboard.action_summary);
  if (activeResearch.length) actionItems.push(`${activeResearch.length} 个调研进行中`);

  return (
    <div className="viewport">
      <div className="page page-home">
        <div className="home-hello">
          <div className="home-hello-title">{greet}，{currentUser || "visitor"}</div>
          <div className="home-hello-sub">
            {actionItems.length ? actionItems.join(" · ") : feishuProjectConfigured ? `已固定 ${feishuProjectName}，可以查看项目工作项和本周行业资讯。` : "先由管理员固定飞书项目空间，工作台才能告诉你今天该做什么。"}
          </div>
        </div>

        <div className="home-kpi-strip">
          <button className="home-kpi-card" onClick={() => onNavigate("research")}>
            <div className="home-kpi-num">{activeResearch.length}</div>
            <div className="home-kpi-label">我的进行中调研</div>
          </button>
          <button className="home-kpi-card" onClick={() => onNavigate("demands")}>
            <div className="home-kpi-num">{myDemandsCount}</div>
            <div className="home-kpi-label">{dashboard.demands_scope_label || "需求库 · 共追踪"}</div>
          </button>
          <button className="home-kpi-card" onClick={() => onNavigate("products")}>
            <div className="home-kpi-num">{products.length}</div>
            <div className="home-kpi-label">竞品快照</div>
          </button>
          <button className={`home-kpi-card ${feishuProjectConfigured ? "" : "home-kpi-card-pending"}`} onClick={() => feishuProjectConfigured ? onNavigate("demands") : onNavigate("settings")}>
            <div className="home-kpi-num">{feishuProjectConfigured ? (feishuProjectStatus.items_count || decisionEvents.length || "") : ""}</div>
            <div className="home-kpi-label">{feishuProjectConfigured ? "飞书项目工作项" : "飞书项目 · 待固定空间"}</div>
          </button>
        </div>

        {!feishuProjectConfigured && (
          <div className="home-connect-banner">
            <div className="home-connect-banner-icon">
              <Icon name="feishu" size={16} />
            </div>
            <div className="home-connect-banner-body">
              <div className="home-connect-banner-title">接入飞书项目空间，工作台才能告诉你今天该做什么</div>
              <div className="home-connect-banner-desc">
                管理员固定项目空间后，Loom 会从产品想法登记和项目工作项里读取状态、负责人和更新时间；普通用户不需要填写空间号。
              </div>
            </div>
            <button className="home-connect-banner-cta" onClick={() => onNavigate("settings")}>去配置</button>
          </div>
        )}

        <div className="home-grid">
          <div className="home-main-stack">
            <section className="home-section home-section-main">
              <div className="home-section-head">
                <h2 className="home-section-title">我的近期动态</h2>
                {feishuConnected && feishuStatus.last_sync_at ? (
                  <span className="home-sync-badge home-sync-ok">
                    <Icon name="check" size={10} />
                    飞书项目 · {formatAgo(feishuStatus.last_sync_at)}同步
                  </span>
                ) : (
                  <span className="home-sync-badge home-sync-pending">
                    {feishuProjectConfigured ? "等待首次同步" : "待固定飞书项目空间"}
                  </span>
                )}
              </div>
              {decisionEvents.length ? (
                <div className="home-decision-list">
                  {decisionEvents.slice(0, 6).map((item) => (
                    <button key={item.id} className="home-decision-row" onClick={() => onNavigate("demands")}>
                      <span className={`home-pending-status home-status-${item.status_key || "review"}`}>{item.status || "更新"}</span>
                      <span className="home-pending-name">{item.title || "未命名需求"}</span>
                      <span className="home-pending-meta">{item.owner || "PM"} · {formatAgo(item.updated_at) || "最近"}</span>
                    </button>
                  ))}
                </div>
              ) : feishuProjectConfigured ? (
                <div className="home-empty-state">
                  <Icon name={feishuProjectSynced ? "check" : "sync"} size={18} style={{ color: feishuProjectSynced ? "var(--success)" : "var(--text-3)" }} />
                  <div>{feishuProjectSynced ? "近 7 天暂无你的决策或状态变更" : `已固定 ${feishuProjectName}，等待首次同步工作项`}</div>
                </div>
              ) : (
                <div className="home-pending-card">
                  <div className="home-pending-explain">固定飞书项目空间后，这里会自动出现项目工作项里的关键状态：</div>
                  <ul className="home-pending-bullets">
                    <li><span className="home-pending-bullet-dot" />产品想法登记和项目工作项</li>
                    <li><span className="home-pending-bullet-dot" />当前节点、状态、负责人和更新时间</li>
                    <li><span className="home-pending-bullet-dot" />后续用于 Ask Loom 回答“为什么延期 / 卡在哪里”</li>
                  </ul>
                  <div className="home-pending-note-2">
                    团队全部动态见 <button className="home-link-btn home-link-inline" onClick={() => onNavigate("demands")}>需求库 · 飞书项目镜像</button>
                  </div>
                </div>
              )}
            </section>

            {hotKeywords.length > 0 && (
              <section className="home-section">
                <div className="home-section-head">
                  <h2 className="home-section-title">本周用户声音热词</h2>
                  <span className="home-section-meta">来自 {demands.length} 条用户反馈聚合</span>
                </div>
                <div className="home-keywords">
                  {hotKeywords.map((item) => (
                    <button key={item.word} type="button" className="home-keyword-pill" onClick={() => onNavigate("demands")}>
                      <span className="home-keyword-word">{item.word}</span>
                      <span className="home-keyword-count">{item.count}</span>
                    </button>
                  ))}
                </div>
                <div className="home-keywords-foot">
                  <button className="home-link-btn home-link-inline" onClick={() => onNavigate("demands")}>去需求库逐条查看</button>
                </div>
              </section>
            )}
          </div>

          <div className="home-side-stack">
            <section className="home-section home-section-side">
              <div className="home-section-head">
                <h2 className="home-section-title">我的进行中调研</h2>
                <button className="home-section-link" onClick={() => onNavigate("research")}>全部 <Icon name="chevron-right" size={11} /></button>
              </div>
              {activeResearch.length ? (
                <div className="home-research-list">
                  {activeResearch.slice(0, 5).map((item) => (
                    <button key={item.id} className="home-research-row" onClick={() => onNavigate("research")}>
                      <Icon name="compass" size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
                      <span className="home-research-title">{item.title || "未命名调研"}</span>
                      <Tag tone="outline">{item.status || "进行中"}</Tag>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="home-empty-state small">
                  <Icon name="compass" size={16} style={{ color: "var(--text-4)" }} />
                  <div style={{ color: "var(--text-3)", fontSize: 13 }}>还没有进行中的调研</div>
                  <button className="home-link-btn" onClick={() => onNavigate("research")}>新建调研任务</button>
                </div>
              )}
            </section>

            <section className="home-section home-section-side">
              <div className="home-section-head">
                <h2 className="home-section-title">本周行业资讯</h2>
                <button className="home-section-link" onClick={() => onNavigate("news")}>全部 {news.length ? `(${news.length})` : ""} <Icon name="chevron-right" size={11} /></button>
              </div>
              {recentNews.length ? (
                <div className="home-news-list">
                  {recentNews.map((item) => (
                    <button key={item.id} className="home-news-row" onClick={() => onNavigate("news")}>
                      <Icon name="newspaper" size={12} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 3 }} />
                      <div className="home-news-body">
                        <div className="home-news-title">{item.titleZh || item.original_title}</div>
                        <div className="home-news-meta">
                          {item.source ? <span>{item.source}</span> : null}
                          {item.published_at ? <span>{formatAgo(item.published_at)}</span> : null}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="home-empty-state small">
                  <Icon name="newspaper" size={16} style={{ color: "var(--text-4)" }} />
                  <div style={{ color: "var(--text-3)", fontSize: 13 }}>暂无资讯</div>
                  <button className="home-link-btn" onClick={() => onNavigate("settings")}>配置 RSS 源</button>
                </div>
              )}
            </section>

            {feishuConnected && (
              <section className="home-section home-section-side">
                <div className="home-section-head">
                  <h2 className="home-section-title">异常监测</h2>
                  <span className="home-section-meta">卡 3 周 / 暂停 4 周以上</span>
                </div>
                {abnormalItems.length ? (
                  <div className="home-research-list">
                    {abnormalItems.slice(0, 5).map((item) => (
                      <button key={item.id} className="home-research-row" onClick={() => onNavigate("demands")}>
                        <Icon name="calendar" size={13} style={{ color: "var(--warn)", flexShrink: 0 }} />
                        <span className="home-research-title">{item.title}</span>
                        <Tag tone="outline">{item.reason}</Tag>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="home-empty-state small">
                    <Icon name="check" size={16} style={{ color: "var(--success)" }} />
                    <div style={{ color: "var(--text-3)", fontSize: 13 }}>暂无需关注的卡顿项</div>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ active, onNav, data, onLogout, onFeedback, isAdmin, collapsed, onToggleCollapsed }) {
  const [accountOpen, setAccountOpen] = useState(false);
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

      <div className="sb-nav">
        {NAV.map((item) => (
          <div key={item.key} className={`sb-item ${activeNavKey === item.key ? "active" : ""}`} onClick={() => onNav(item.key)}>
            <Icon name={item.icon} size={15} className="ico" />
            <span className="sb-item-label">
              <span className="sb-item-main">{item.label}</span>
            </span>
            {counts[item.key] != null && counts[item.key] > 0 && <span className="badge">{counts[item.key]}</span>}
          </div>
        ))}
      </div>

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
      "knowledge-import": "library",
      "knowledge-query": "library",
      "knowledge-draft": "library",
      "knowledge": "library",
      "ask": "library",
      "standards": "library",
      "feishu_space": "home",
    };
    const screen = legacyScreens[params.get("screen")] || params.get("screen");
    return ["home", "news", "products", "demands", "research", "library", "library-import", "mrd", "prd", "settings"].includes(screen) ? screen : "home";
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

  const navigateScreen = (screen, options = {}) => {
    if (!screen) return;
    setActive(screen);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("screen", screen);
    if (options.docId) params.set("docId", options.docId);
    else if (options.clearDocId) params.delete("docId");
    const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  };

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
    navigateScreen("news", { clearDocId: true });
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

  const screenProps = { data, api, refreshData, navTarget, onNavigate: navigateScreen, onOpenDocumentModal: setDocumentModalMode };
  const isAdmin = Boolean(me?.is_admin || data?.user?.is_admin || data?.user?.is_owner);
  const sampleWorkspace = Boolean(data.onboarding?.sampleWorkspace);
  const canExitSample = Boolean(data.onboarding?.canExitSample);
  const liveNewsReady = Boolean(data.onboarding?.liveNewsReady);
  const latestNewsAt = data.onboarding?.latestNewsAt || data.onboarding?.latestFetchedAt || "";
    const screen = {
      home: <HomeScreen data={data} onNavigate={(screen) => navigateScreen(screen, { clearDocId: true })} />,
      news: <NewsScreen {...screenProps} />,
      products: <ProductsScreen {...screenProps} detailCollapsed={detailCollapsed} setDetailCollapsed={setDetailCollapsed} />,
      demands: <DemandsScreen {...screenProps} />,
      research: <ResearchScreen {...screenProps} />,
      library: <LibraryScreen {...screenProps} reloadKey={libraryReloadKey} onNavigate={navigateScreen} onOpenDocumentModal={setDocumentModalMode} />,
      "library-import": <LibraryImportScreen onOpenDocumentModal={setDocumentModalMode} />,
    mrd: <DocumentStudio screenType="mrd" data={data} api={api} onOpenDocumentModal={setDocumentModalMode} onNavigate={navigateScreen} />,
    prd: <DocumentStudio screenType="prd" data={data} api={api} onOpenDocumentModal={setDocumentModalMode} onNavigate={navigateScreen} />,
    settings: <SettingsScreen {...screenProps} />,
  }[active] ?? <HomeScreen data={data} onNavigate={(screen) => navigateScreen(screen, { clearDocId: true })} />;
  const notifications = [
    { id: "n1", label: "系统", text: "全局搜索已经接通，可用 ⌘K 快速打开。", tone: "outline" },
    { id: "n2", label: "News", text: `${data.newsCounts?.all || data.news.length} 条资讯已载入。`, tone: "outline" },
  ];

  return (
    <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        active={active}
        onNav={(screen) => navigateScreen(screen, { clearDocId: true })}
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
            {TITLES[active]?.subLabel && <span className="topbar-title-sub"> · {TITLES[active].subLabel}</span>}
          </div>
          {active === "products" && <span className="topbar-crumb">· {data.products.length} 条</span>}
          {active === "news" && <span className="topbar-crumb">· {data.newsCounts?.all || data.news.length} 条</span>}
          {active === "demands" && <span className="topbar-crumb">· {data.demands.length} 条</span>}
          {active === "research" && <span className="topbar-crumb">· {data.research.length} 个</span>}
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
          </div>
        </div>
        {screen}
      </main>
      {searchOpen && data && (
        <GlobalSearchModal
          data={data}
          onClose={() => setSearchOpen(false)}
          onPick={(item) => {
            navigateScreen(item.screen, { clearDocId: true });
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
          onDone={async (result) => {
            await loadBootstrap({ background: true });
            setLibraryReloadKey((value) => value + 1);
            const createdDocument = result?.document || result;
            const nextType = createdDocument?.doc_type === "mrd" ? "mrd" : createdDocument?.doc_type === "prd" ? "prd" : "library";
            if (createdDocument?.id && (nextType === "mrd" || nextType === "prd")) {
              const params = new URLSearchParams(window.location.search);
              params.set("screen", nextType);
              params.set("docId", createdDocument.id);
              window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
            }
            navigateScreen(nextType, createdDocument?.id ? { docId: createdDocument.id } : { clearDocId: true });
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
