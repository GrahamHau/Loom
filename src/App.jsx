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
            这里展示的是一套可直接体验的示例工作区，用来让你快速感受 Stream、Lens、Spark 和 Weave 的完整效果。
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

function Sidebar({ active, onNav, data, onLogout, onFeedback, isAdmin }) {
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
      <button type="button" className="sb-feedback" onClick={onFeedback}>
        <Icon name="sparkles" size={14} className="ico" />
        <span>用户反馈</span>
      </button>

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
  const initialScreen = (() => {
    const params = new URLSearchParams(window.location.search);
    const screen = params.get("screen");
    return ["news", "products", "demands", "research", "settings"].includes(screen) ? screen : "news";
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
  const [demoIntroOpen, setDemoIntroOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [t, setTweak] = useTweaks({ theme: "feishu", mode: "light", showLogin: false });
  const prevSampleWorkspaceRef = useRef(false);
  const prevUserIdRef = useRef("");
  const meRef = useRef(null);
  const dataRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme);
    document.documentElement.setAttribute("data-mode", t.mode);
  }, [t.theme, t.mode]);

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
    settings: <SettingsScreen {...screenProps} />,
  }[active];
  const notifications = [
    { id: "n1", label: "系统", text: "全局搜索已经接通，可用 ⌘K 快速打开。", tone: "outline" },
    { id: "n2", label: "News", text: `${data.newsCounts?.all || data.news.length} 条资讯已载入。`, tone: "outline" },
  ];

  return (
    <div className="app">
      <Sidebar active={active} onNav={setActive} data={data} onLogout={logout} onFeedback={() => setFeedbackOpen(true)} isAdmin={isAdmin} />
      <main className="main" data-screen-label={TITLES[active]?.label || active}>
        {sampleWorkspace && (
          <div className="sample-workspace-banner">
            <div className="sample-workspace-copy">
              <Tag tone="accent">示例工作区</Tag>
              <span>{latestNewsAt ? `示例数据 · 更新 ${formatSampleDate(latestNewsAt)}` : "示例数据"}</span>
            </div>
          </div>
        )}
        <div className="topbar">
          <div className="topbar-title">
            {TITLES[active]?.label || active}
            {TITLES[active]?.subLabel && <span className="topbar-title-sub"> {TITLES[active].subLabel}</span>}
          </div>
          {active === "products" && <span className="topbar-crumb">· {data.products.length} 条记录</span>}
          {active === "news" && <span className="topbar-crumb">· 插件采集 · {data.newsCounts?.all || data.news.length} 条资讯</span>}
          {active === "demands" && <span className="topbar-crumb">· {data.demands.length} 条灵感</span>}
          {active === "research" && <span className="topbar-crumb">· {data.research.length} 个项目</span>}
          <div className="topbar-actions">
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
