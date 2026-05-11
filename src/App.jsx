/* global LoginScreen, NewsScreen, ProductsScreen, DemandsScreen, ResearchScreen, SettingsScreen, Icon, Btn, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle */
const React = globalThis.React;
const ReactDOM = globalThis.ReactDOM;
const LoginScreen = globalThis.LoginScreen;
const NewsScreen = globalThis.NewsScreen;
const ProductsScreen = globalThis.ProductsScreen;
const DemandsScreen = globalThis.DemandsScreen;
const ResearchScreen = globalThis.ResearchScreen;
const SettingsScreen = globalThis.SettingsScreen;
const Icon = globalThis.Icon;
const Btn = globalThis.Btn;
const useTweaks = globalThis.useTweaks;
const TweaksPanel = globalThis.TweaksPanel;
const TweakSection = globalThis.TweakSection;
const TweakRadio = globalThis.TweakRadio;
const TweakToggle = globalThis.TweakToggle;
const { useEffect, useMemo, useState } = React;

const NAV = [
  { group: "采集服务", items: [
    { key: "news", label: "News", icon: "newspaper" },
    { key: "products", label: "竞品库", icon: "boxes" },
  ] },
  { group: "分析决策", items: [
    { key: "demands", label: "需求管理", icon: "lightbulb" },
    { key: "research", label: "市场调研", icon: "compass" },
  ] },
];

const TITLES = {
  news: "News",
  products: "竞品库",
  demands: "需求管理",
  research: "市场调研",
  settings: "系统设置",
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
            placeholder="搜索需求、竞品、News、调研项目..."
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
                      <span>{TITLES[item.screen]}</span>
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

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

function normalizeData(input = {}) {
  input ||= {};
  return {
    user: {
      name: "Graham",
      role: "产品经理",
      initials: "G",
      ...(input.user || {}),
    },
    products: Array.isArray(input.products) ? input.products : [],
    demands: Array.isArray(input.demands) ? input.demands : [],
    news: Array.isArray(input.news) ? input.news : [],
    research: Array.isArray(input.research) ? input.research : [],
    rssSources: Array.isArray(input.rssSources) ? input.rssSources : [],
    settings: input.settings || {},
  };
}

function Sidebar({ active, onNav, data }) {
  const counts = {
    news: data.news.length,
    products: data.products.length,
    demands: data.demands.length,
    research: data.research.length,
  };
  const user = data.user;

  return (
    <aside className="sidebar" data-screen-label="sidebar">
      <div className="sb-brand">
        <div className="sb-brand-mark">P</div>
        <div>
          <div className="sb-brand-name">PM Copilot</div>
          <div className="sb-brand-sub">个人情报中台</div>
        </div>
      </div>

      {NAV.map((group) => (
        <div key={group.group}>
          <div className="sb-group-label">{group.group}</div>
          {group.items.map((item) => (
            <div key={item.key} className={`sb-item ${active === item.key ? "active" : ""}`} onClick={() => onNav(item.key)}>
              <Icon name={item.icon} size={15} className="ico" />
              <span>{item.label}</span>
              <span className="badge">{counts[item.key]}</span>
            </div>
          ))}
        </div>
      ))}

      <div className="sb-spacer" />
      <div className={`sb-item ${active === "settings" ? "active" : ""}`} onClick={() => onNav("settings")}>
        <Icon name="settings" size={15} className="ico" />
        <span>系统设置</span>
      </div>

      <div className="sb-footer">
        <div className="sb-user">
          <div className="sb-avatar">{user.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{user.name}</div>
            <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{user.role}</div>
          </div>
          <Icon name="chevron-down" size={12} style={{ color: "var(--text-3)" }} />
        </div>
      </div>
    </aside>
  );
}

function PMCTweaks({ t, setTweak }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="主题">
        <TweakRadio label="风格" value={t.theme} onChange={(v) => setTweak("theme", v)}
          options={[
            { value: "default", label: "靛蓝" },
            { value: "feishu", label: "飞书蓝" },
            { value: "sage", label: "鼠尾草" },
            { value: "mono", label: "单色" },
          ]} />
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
  const [active, setActive] = useState("products");
  const [me, setMe] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [navTarget, setNavTarget] = useState(null);
  const [t, setTweak] = useTweaks({ theme: "feishu", mode: "light", showLogin: false });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme);
    document.documentElement.setAttribute("data-mode", t.mode);
  }, [t.theme, t.mode]);

  const loadBootstrap = async () => {
    const [meResponse, bootstrap] = await Promise.all([
      api("/api/me").catch(() => null),
      api("/api/bootstrap").catch(() => null),
    ]);
    setMe(meResponse?.user || null);
    setData(normalizeData(bootstrap));
  };

  useEffect(() => {
    loadBootstrap().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const refreshData = async () => {
    const next = await api("/api/bootstrap");
    setData(normalizeData(next));
  };

  const login = async ({ username, password }) => {
    setError("");
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setMe(result.user);
    await refreshData();
  };

  if (!data) {
    return (
      <div className="login-stage">
        <div className="login-card">
          <div className="login-brand"><div className="mark">P</div><div><div className="name">PM Copilot</div><div className="sub">正在加载本地数据</div></div></div>
          {error && <div className="ai-block" style={{ color: "var(--danger)" }}>{error}</div>}
        </div>
      </div>
    );
  }

  if (!me || t.showLogin) {
    return (
      <>
        <LoginScreen onLogin={login} error={error} />
        <PMCTweaks t={t} setTweak={setTweak} />
      </>
    );
  }

  const screenProps = { data, api, refreshData, navTarget };
  const screen = {
    news: <NewsScreen {...screenProps} />,
    products: <ProductsScreen {...screenProps} />,
    demands: <DemandsScreen {...screenProps} />,
    research: <ResearchScreen {...screenProps} />,
    settings: <SettingsScreen {...screenProps} />,
  }[active];

  return (
    <div className="app">
      <Sidebar active={active} onNav={setActive} data={data} />
      <main className="main" data-screen-label={TITLES[active]}>
        <div className="topbar">
          <div className="topbar-title">{TITLES[active]}</div>
          {active === "products" && <span className="topbar-crumb">· {data.products.length} 条记录</span>}
          {active === "news" && <span className="topbar-crumb">· 实时采集 · {data.rssSources.length} 个数据源</span>}
          {active === "demands" && <span className="topbar-crumb">· {data.demands.length} 条灵感</span>}
          {active === "research" && <span className="topbar-crumb">· {data.research.length} 个项目</span>}
          <div className="topbar-actions">
            <button
              type="button"
              className="topbar-search-trigger"
              onClick={() => setSearchOpen(true)}
            >
              <Icon name="search" size={13} />
              <span>搜索</span>
              <span className="kbd">⌘K</span>
            </button>
            <Btn variant="ghost" icon="bell" size="sm" />
            <Btn variant="ghost" icon="panel-open" size="sm" />
          </div>
        </div>
        {screen}
      </main>
      <PMCTweaks t={t} setTweak={setTweak} />
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
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
