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
const { useEffect, useState } = React;

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
    setData(bootstrap);
  };

  useEffect(() => {
    loadBootstrap().catch((err) => setError(err.message));
  }, []);

  const refreshData = async () => {
    const next = await api("/api/bootstrap");
    setData(next);
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

  const screenProps = { data, api, refreshData };
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
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 8px", color: "var(--text-3)", fontSize: 11.5 }}>
              <Icon name="search" size={13} />
              <span>搜索</span>
              <span className="kbd">⌘K</span>
            </div>
            <Btn variant="ghost" icon="bell" size="sm" />
            <Btn variant="ghost" icon="panel-open" size="sm" />
          </div>
        </div>
        {screen}
      </main>
      <PMCTweaks t={t} setTweak={setTweak} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
