/* global LoginScreen, NewsScreen, ProductsScreen, DemandsScreen, ResearchScreen, SettingsScreen, Icon, Btn, Tag, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle */
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
const Tag = globalThis.Tag;
const useTweaks = globalThis.useTweaks;
const TweaksPanel = globalThis.TweaksPanel;
const TweakSection = globalThis.TweakSection;
const TweakRadio = globalThis.TweakRadio;
const TweakToggle = globalThis.TweakToggle;
const { useEffect, useMemo, useRef, useState } = React;

const NAV = [
  { group: "采集沉淀", items: [
    { key: "news", label: "Stream", subLabel: "资讯流", icon: "newspaper" },
    { key: "products", label: "Lens", subLabel: "竞品库", icon: "boxes" },
  ] },
  { group: "分析生成", items: [
    { key: "demands", label: "Spark", subLabel: "灵感库", icon: "lightbulb" },
    { key: "research", label: "Weave", subLabel: "调研工坊", icon: "compass" },
  ] },
];

const TITLES = {
  news: { label: "Stream", subLabel: "资讯流" },
  products: { label: "Lens", subLabel: "竞品库" },
  demands: { label: "Spark", subLabel: "灵感库" },
  research: { label: "Weave", subLabel: "调研工坊" },
  settings: { label: "Settings", subLabel: "系统设置" },
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
            placeholder="搜索 Spark、Lens、Stream、Weave..."
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
      name: "visitor",
      role: "产品经理",
      initials: "VI",
      ...(input.user || {}),
    },
    products: Array.isArray(input.products) ? input.products : [],
    demands: Array.isArray(input.demands) ? input.demands : [],
    news: Array.isArray(input.news) ? input.news : [],
    newsCounts: input.newsCounts || { all: Array.isArray(input.news) ? input.news.length : 0, new_product: 0, trend: 0, starred: 0 },
    research: Array.isArray(input.research) ? input.research : [],
    rssSources: Array.isArray(input.rssSources) ? input.rssSources : [],
    settings: input.settings || {},
  };
}

function Sidebar({ active, onNav, data, onLogout }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const counts = {
    news: data.newsCounts?.all || data.news.length,
    products: data.products.length,
    demands: data.demands.length,
    research: data.research.length,
  };
  const user = data.user;

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
      <div className="sb-brand">
        <div>
          <div className="sb-brand-name">LOOM</div>
          <div className="sb-brand-tagline">Link · Observe · Organize · Make</div>
        </div>
      </div>

      {NAV.map((group) => (
        <div key={group.group}>
          <div className="sb-group-label">{group.group}</div>
          {group.items.map((item) => (
            <div key={item.key} className={`sb-item ${active === item.key ? "active" : ""}`} onClick={() => onNav(item.key)}>
              <Icon name={item.icon} size={15} className="ico" />
              <span className="sb-item-label">
                <span className="sb-item-main">{item.label}</span>
                {item.subLabel && <span className="sb-item-sub">{item.subLabel}</span>}
              </span>
              <span className="badge">{counts[item.key]}</span>
            </div>
          ))}
        </div>
      ))}

      <div className="sb-spacer" />
      <div className={`sb-item ${active === "settings" ? "active" : ""}`} onClick={() => onNav("settings")}>
        <Icon name="settings" size={15} className="ico" />
        <span className="sb-item-label">
          <span className="sb-item-main">Settings</span>
          <span className="sb-item-sub">系统设置</span>
        </span>
      </div>

      <div className="sb-footer" ref={accountRef}>
        {accountOpen && (
          <div className="sb-account-menu">
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
          <div className="sb-avatar">{user.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{user.name}</div>
            <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{user.role}</div>
          </div>
          <Icon name="chevron-down" size={12} style={{ color: "var(--text-3)" }} />
        </button>
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
  const [providers, setProviders] = useState({ password: true, feishu: false });
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [navTarget, setNavTarget] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [t, setTweak] = useTweaks({ theme: "feishu", mode: "light", showLogin: false });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme);
    document.documentElement.setAttribute("data-mode", t.mode);
  }, [t.theme, t.mode]);

  const loadBootstrap = async () => {
    const [meResponse, bootstrap, providerResponse] = await Promise.all([
      api("/api/me").catch(() => null),
      api("/api/bootstrap").catch(() => null),
      api("/api/auth/providers").catch(() => ({ password: true, feishu: false })),
    ]);
    setMe(meResponse?.user || null);
    setData(normalizeData(bootstrap));
    setProviders({
      password: providerResponse?.password !== false,
      feishu: Boolean(providerResponse?.feishu),
    });
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

  const loginWithFeishu = () => {
    setError("");
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.href = `/api/auth/feishu/start?return_to=${encodeURIComponent(returnTo || "/")}`;
  };

  const logout = async () => {
    setError("");
    await api("/api/auth/logout", { method: "POST" });
    setMe(null);
    setSearchOpen(false);
    setNotificationsOpen(false);
  };

  if (!data) {
    return (
      <div className="login-stage">
        <div className="login-card">
          <div className="login-brand"><div className="mark">L</div><div><div className="name">LOOM</div><div className="sub">正在加载本地数据</div></div></div>
          {error && <div className="ai-block" style={{ color: "var(--danger)" }}>{error}</div>}
        </div>
      </div>
    );
  }

  if (!me || t.showLogin) {
    return (
      <>
        <LoginScreen onLogin={login} onFeishuLogin={loginWithFeishu} error={error} providers={providers} />
      </>
    );
  }

  const screenProps = { data, api, refreshData, navTarget };
  const screen = {
    news: <NewsScreen {...screenProps} />,
    products: <ProductsScreen {...screenProps} detailCollapsed={detailCollapsed} setDetailCollapsed={setDetailCollapsed} />,
    demands: <DemandsScreen {...screenProps} />,
    research: <ResearchScreen {...screenProps} />,
    settings: <SettingsScreen {...screenProps} />,
  }[active];
  const notifications = [
    { id: "n1", label: "系统", text: "全局搜索已经接通，可用 ⌘K 快速打开。", tone: "outline" },
    { id: "n2", label: "News", text: `${data.newsCounts?.all || data.news.length} 条资讯已载入，当前数据源 ${data.rssSources.length} 个。`, tone: "outline" },
  ];

  return (
    <div className="app">
      <Sidebar active={active} onNav={setActive} data={data} onLogout={logout} />
      <main className="main" data-screen-label={TITLES[active]?.label || active}>
        <div className="topbar">
          <div className="topbar-title">
            {TITLES[active]?.label || active}
            {TITLES[active]?.subLabel && <span className="topbar-title-sub"> {TITLES[active].subLabel}</span>}
          </div>
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
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
