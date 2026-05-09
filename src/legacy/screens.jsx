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
const { useState, useEffect, useMemo } = React;

// ============ LOGIN ============
function LoginScreen({ onLogin, error }) {
  const [user, setUser] = useState("graham");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await onLogin?.({ username: user, password: pw });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-stage">
      <div className="login-card">
        <div className="login-brand">
          <div className="mark">P</div>
          <div>
            <div className="name">PM Copilot</div>
            <div className="sub">产品经理的个人情报中台</div>
          </div>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <div>
            <label className="field-label">用户名</label>
            <input className="input lg" style={{ width: "100%" }} value={user} onChange={(e) => setUser(e.target.value)} />
          </div>
          <div>
            <label className="field-label">密码</label>
            <input className="input lg" style={{ width: "100%" }} type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          {error && <div style={{ fontSize: 12, color: "var(--danger)" }}>{error}</div>}
          <button className="btn primary" style={{ height: 38, marginTop: 6, justifyContent: "center" }} onClick={submit} disabled={busy || !user || !pw}>
            {busy ? "登录中..." : "登录 PM Copilot"}
          </button>
        </div>
        <div style={{ borderTop: "1px solid var(--border)", marginTop: 22, paddingTop: 14, fontSize: 11, color: "var(--text-3)", textAlign: "center" }}>
          PM Copilot v1.0 · 单用户版本
        </div>
      </div>
    </div>);

}
window.LoginScreen = LoginScreen;

// ============ NEWS ============
function NewsScreen({ data, api, refreshData }) {
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState(data.news);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => setItems(data.news), [data.news]);

  const filtered = items.filter((n) => {
    if (tab === "all") return true;
    if (tab === "starred") return n.starred;
    return n.type === tab;
  });
  const grouped = filtered.reduce((acc, n) => {
    (acc[n.date] = acc[n.date] || []).push(n);return acc;
  }, {});
  const dates = Object.keys(grouped);

  const toggleStar = async (id) => {
    const item = items.find((n) => n.id === id);
    const next = items.map((n) => n.id === id ? { ...n, starred: !n.starred } : n);
    setItems(next);
    if (api && item) {
      await api(`/api/news/${id}`, { method: "PATCH", body: JSON.stringify({ starred: !item.starred }) });
      await refreshData?.();
    }
  };

  const collect = async () => {
    setBusy(true);setNotice("");
    try {
      const result = await api("/api/news/collect", { method: "POST" });
      setNotice(`采集完成：新增 ${result.inserted || 0} 条，更新 ${result.updated || 0} 条${result.errors?.length ? `，失败 ${result.errors.length} 个源` : ""}`);
      await refreshData?.();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="news-tabs">
        {[
        ["all", "全部", items.length],
        ["新品发布", "新品发布", items.filter((i) => i.type === "新品发布").length],
        ["行业趋势", "行业趋势", items.filter((i) => i.type === "行业趋势").length],
        ["starred", "已收藏", items.filter((i) => i.starred).length]].
        map(([k, label, count]) =>
        <div key={k} className={`news-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {label} <span style={{ color: "var(--text-4)", marginLeft: 4 }}>{count}</span>
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "6px 0" }}>
          <Btn size="sm" variant="ghost" icon="filter">筛选</Btn>
          <Btn size="sm" variant="ghost" icon="sync" onClick={collect} disabled={busy}>{busy ? "采集中..." : "立即采集"}</Btn>
        </div>
      </div>

      <div className="viewport">
        <div className="page" style={{ paddingTop: 8 }}>
          {notice && <div className="ai-block" style={{ marginBottom: 12 }}>{notice}</div>}
          {dates.map((d) =>
          <div key={d}>
              <div className="news-day">{formatDate(d)}</div>
              {grouped[d].map((n) =>
            <div className={`news-card ${n.unread ? "unread" : ""}`} key={n.id}>
                  <div className="news-thumb">
                    <DemandThumb hue={n.thumbHue} label={n.type === "新品发布" ? "PRODUCT IMG" : "TREND IMG"} />
                  </div>
                  <div className="news-body">
                    <div className="news-title">{n.titleZh}</div>
                    <div className="news-summary">{n.summary}</div>
                    <div className="news-meta">
                      <Tag tone={n.type === "新品发布" ? "accent" : "warn"}>{n.type}</Tag>
                      <span>{n.source}</span>
                      <span className="dot">·</span>
                      <span>{n.time}</span>
                    </div>
                  </div>
                  <div className="news-actions">
                    <Btn size="sm" variant="ghost" onClick={() => toggleStar(n.id)}
                icon={n.starred ? "star-fill" : "star"}
                style={{ color: n.starred ? "var(--warn)" : undefined }} />
                    <Btn size="sm" variant="ghost" icon="external" />
                    <Btn size="sm" variant="ghost" icon="more" />
                  </div>
                </div>
            )}
            </div>
          )}
        </div>
      </div>
    </>);

}
window.NewsScreen = NewsScreen;

function formatDate(d) {
  const today = "2026-05-10";
  const yesterday = "2026-05-09";
  if (d === today) return "今天 · " + d.replace(/-/g, "/");
  if (d === yesterday) return "昨天 · " + d.replace(/-/g, "/");
  return d.replace(/-/g, " 年 ").replace(/\//g, "月") + "日";
}

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
function PlatformInput({ label, value, onChange, prefix }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-input-wrap">
        {prefix && <span className="metric-prefix">{prefix}</span>}
        <input
          className="metric-input"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="—" />
        
      </div>
    </div>);

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

function ProductsScreen({ data, api, refreshData }) {
  const [products, setProducts] = useState(data.products);
  const [notice, setNotice] = useState("");
  useEffect(() => setProducts(data.products), [data.products]);
  const updateSelected = async (patch) => {
    setProducts((ps) => ps.map((p) => p.id === selectedId ? { ...p, ...patch } : p));
    if (api && selectedId) {
      await api(`/api/products/${selectedId}`, { method: "PATCH", body: JSON.stringify(patch) });
      await refreshData?.();
    }
  };
  const [selectedId, setSelectedId] = useState(products[0].id);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [showAdd, setShowAdd] = useState(false);
  const [priceCcy, setPriceCcy] = useState("native"); // unused (toggle removed)

  const categories = ["全部", ...Array.from(new Set(products.map((p) => p.category)))];
  const filtered = products.filter((p) =>
  (categoryFilter === "全部" || p.category === categoryFilter) && (
  !query || p.name.toLowerCase().includes(query.toLowerCase()))
  );
  const selected = products.find((p) => p.id === selectedId);
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

  return (
    <div className="products-layout" style={{ height: "100%" }}>
      <div className="products-main">
        <div className="products-toolbar">
          <div style={{ position: "relative", flex: "0 1 280px" }}>
            <Icon name="search" size={14} style={{ position: "absolute", left: 9, top: 8, color: "var(--text-3)" }} />
            <input className="input" placeholder="搜索竞品..." value={query} onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 30, width: "100%" }} />
          </div>
          <select className="input sm" style={{ height: 30, paddingRight: 24, minWidth: 120 }}
          value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            {categories.map((c) =>
            <option key={c} value={c}>{c === "全部" ? "全部品类" : c}</option>
            )}
          </select>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <Tag tone="outline">{filtered.length} 条</Tag>
            <Btn size="sm" variant="ghost" icon="sync" onClick={syncProducts}>同步飞书</Btn>
            <Btn size="sm" variant="primary" icon="plus" onClick={() => setShowAdd(true)}>添加竞品</Btn>
          </div>
        </div>
        {notice && <div className="ai-block" style={{ margin: "0 12px 10px" }}>{notice}</div>}

        <div className="products-table-wrap">
          <table className="products-table">
            <thead>
              <tr>
                <th>商品名称</th><th>品类</th><th>平台</th><th>售价</th><th>参考成本</th><th>评分</th><th>月销估算</th><th>状态</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const main = p.platforms[0];
                return (
                  <tr key={p.id} className={selectedId === p.id ? "selected" : ""} onClick={() => setSelectedId(p.id)}>
                    <td>
                      <div className="product-name">
                        <div className="products-thumb">{p.emoji}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                            {p.tags.slice(0, 3).join(" · ")}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><Tag>{p.category}</Tag></td>
                    <td>
                      <div className="product-platforms">
                        {p.platforms.map((pl, i) =>
                        <span key={i} className={`platform-pill ${PLATFORM_KEY[pl.platform]}`}>{PLATFORM_ICON[pl.platform]}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{main.price}</td>
                    <td style={{ color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{main.cost}</td>
                    <td>
                      <span className="rating-cell"><span className="rating-star">★</span>{main.rating}</span>
                      <span style={{ color: "var(--text-3)", marginLeft: 6, fontSize: 11 }}>{main.reviews.toLocaleString()}</span>
                    </td>
                    <td style={{ color: "var(--text-2)" }}>{main.sales}</td>
                    <td>
                      <Tag tone={p.status === "跟踪中" ? "success" : p.status === "已归档" ? "default" : "accent"}>{p.status}</Tag>
                    </td>
                  </tr>);

              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected &&
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
            <Btn variant="ghost" icon="external" />
            <Btn variant="ghost" icon="more" />
          </div>

          <div className="detail-body">
            <div className="detail-section">
              <div className="detail-section-label">品牌</div>
              <input
                className="ghost-input"
                value={selected.brand ?? selected.name.split(/[\s·]/)[0]}
                onChange={(e) => updateSelected({ brand: e.target.value })}
                placeholder="填入品牌名"
                style={{ width: "100%", fontSize: 13, fontWeight: 600 }}
              />
            </div>
            <div className="detail-section">
              <div className="detail-section-label">
                <Icon name="boxes" size={11} /> 平台信息 · {selected.platforms.length} 个
              </div>
              {selected.platforms.map((pl, i) =>
            <div className="platform-card" key={i}>
                  <div className="platform-card-head">
                    <span className={`platform-pill ${PLATFORM_KEY[pl.platform]}`}>{PLATFORM_LABEL[pl.platform]}</span>
                    <span className="platform-card-link">{pl.url}</span>
                    <Icon name="external" size={12} style={{ color: "var(--text-3)" }} />
                  </div>
                  <div className="platform-card-grid">
                    <PlatformInput label="售价" value={pl.price} onChange={(v) => {
                  const next = selected.platforms.map((p, idx) => idx === i ? { ...p, price: v } : p);
                  updateSelected({ platforms: next });
                }} />
                    <PlatformInput label="评分" value={pl.rating} onChange={(v) => {
                  const next = selected.platforms.map((p, idx) => idx === i ? { ...p, rating: v } : p);
                  updateSelected({ platforms: next });
                }} prefix={<span className="rating-star" style={{ fontSize: 11 }}>★</span>} />
                    <PlatformInput label="评论数" value={pl.reviews} onChange={(v) => {
                  const next = selected.platforms.map((p, idx) => idx === i ? { ...p, reviews: v } : p);
                  updateSelected({ platforms: next });
                }} />
                    <PlatformInput label="月销估算" value={pl.sales} onChange={(v) => {
                  const next = selected.platforms.map((p, idx) => idx === i ? { ...p, sales: v } : p);
                  updateSelected({ platforms: next });
                }} />
                  </div>
                </div>
            )}
              <button className="btn sm ghost" style={{ width: "100%", justifyContent: "center", border: "1px dashed var(--border)" }}>
                <Icon name="plus" size={12} /> 添加平台
              </button>
            </div>

            <div className="detail-section">
              <div className="detail-section-label">参考成本 · 适用于所有平台</div>
              <div className="metric-input-wrap" style={{ width: "100%" }}>
                <span className="metric-prefix">¥</span>
                <input
                className="metric-input"
                value={String(selected.cost_estimate || selected.platforms[0]?.cost || "").replace(/^[¥$￥]\s?/, "")}
                onChange={(e) => {
                  const raw = e.target.value;
                  updateSelected({ cost_estimate: raw ? "¥" + raw : "" });
                }}
                placeholder="填入参考成本金额" />
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section-label">品类 / 标签</div>
              <div className="tag-row">
                <Tag tone="accent">{selected.category}</Tag>
                {selected.tags.map((t) => <Tag key={t}>{t}</Tag>)}
                <button className="tag" style={{ background: "transparent", border: "1px dashed var(--border)", color: "var(--text-3)" }}>
                  + 添加
                </button>
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section-label"><Icon name="sparkles" size={11} /> 核心卖点 · AI 总结 + 用户补充</div>
              <BulletListEditor
              items={selected.selling_points}
              onChange={(next) => updateSelected({ selling_points: next })}
              tone="success"
              placeholder="输入卖点，回车添加" />
            
            </div>

            <div className="detail-section">
              <div className="detail-section-label">差评关键词</div>
              <BulletListEditor
              items={selected.negative_keywords}
              onChange={(next) => updateSelected({ negative_keywords: next })}
              tone="danger"
              placeholder="输入差评关键词，回车添加" />
            
            </div>

            <div className="detail-section">
              <div className="detail-section-label"><Icon name="sparkles" size={11} /> AI 摘要</div>
              <div className="ai-block">{selected.ai_summary}</div>
            </div>

            <div className="detail-section">
              <Btn variant="default" icon="sync" onClick={syncProducts} style={{ width: "100%", justifyContent: "center" }}>同步至飞书多维表格</Btn>
            </div>
          </div>
        </div>
      }

      {showAdd && <AddProductModal api={api} refreshData={refreshData} onClose={() => setShowAdd(false)} />}
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

  const platforms = ["amazon", "taobao", "jd", "xiaohongshu", "kickstarter"];
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
              placeholder="粘贴 Amazon / 淘宝 / 京东 商品链接..."
              value={url} onChange={(e) => setUrl(e.target.value)} />
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
                  AI 会自动提取商品名、售价、评分、首图与卖点。
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
function DemandsScreen({ data, api, refreshData }) {
  const [demands, setDemands] = useState(data.demands);
  useEffect(() => setDemands(data.demands), [data.demands]);
  const [filterScenario, setFilterScenario] = useState("");
  const [filterInnov, setFilterInnov] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState("");
  const selected = demands.find((d) => d.id === selectedId);

  const filtered = demands.filter((d) =>
  (!filterScenario || d.scenarios.includes(filterScenario)) && (
  !filterInnov || d.innovation === filterInnov)
  );
  const allScenarios = ["", ...Array.from(new Set(demands.flatMap((d) => d.scenarios)))];
  const allInnov = ["", ...Array.from(new Set(demands.map((d) => d.innovation)))];
  const syncDemands = async () => {
    setNotice("飞书同步中...");
    try {
      await api("/api/sync/feishu", { method: "POST", body: JSON.stringify({ kinds: ["demands"] }) });
      await refreshData?.();
      setNotice("需求管理已同步到飞书。");
    } catch (error) {
      setNotice(error.message);
    }
  };

  return (
    <div className="viewport">
      <div className="page">
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h1 className="h1">需求管理</h1>
            <div className="muted text-sm">{demands.length} 条已录入 · 上次同步 2026-05-09 23:08</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <Btn size="sm" icon="sync" onClick={syncDemands}>同步飞书</Btn>
            <Btn size="sm" variant="primary" icon="plus" onClick={() => setShowAdd(true)}>录入需求</Btn>
          </div>
        </div>
        {notice && <div className="ai-block" style={{ marginBottom: 12 }}>{notice}</div>}

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
          <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-3)" }}>
            匹配 {filtered.length} 条
          </span>
        </div>

        <div className="demands-grid">
          {filtered.map((d) =>
          <div className="demand-card" key={d.id} onClick={() => setSelectedId(d.id)} style={{ cursor: "pointer" }}>
              <div className="demand-thumb">
                <DemandThumb hue={d.thumbHue} label={d.source.toUpperCase() + " · INSPIRATION"} />
                <div className="platform-badge">
                  <Icon name="link" size={10} /> {PLATFORM_LABEL[d.source] || d.source}
                </div>
              </div>
              <div className="demand-body">
                <div className="demand-title">{d.title}</div>
                <div className="demand-summary">{d.summary}</div>
                <div className="demand-tags">
                  <Tag tone="accent">{d.innovation}</Tag>
                  {d.scenarios.slice(0, 2).map((s) => <Tag key={s}>#{s.split("/")[0]}</Tag>)}
                  {d.painpoints.slice(0, 1).map((p) => <Tag tone="danger" key={p}>{p.split("/")[0]}</Tag>)}
                </div>
                <div className="demand-foot">
                  <span><Icon name="calendar" size={10} /> {d.date}</span>
                  <span><Icon name="sparkles" size={10} /> AI 打标</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAdd && <AddDemandModal api={api} refreshData={refreshData} onClose={() => setShowAdd(false)} />}
      {selected && <DemandDetailDrawer demand={selected} api={api} refreshData={refreshData} onClose={() => setSelectedId(null)} />}
    </div>);

}
window.DemandsScreen = DemandsScreen;

function DemandDetailDrawer({ demand, onClose, api, refreshData }) {
  const save = async (patch) => {
    if (api) {
      await api(`/api/demands/${demand.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await refreshData?.();
    }
  };
  return (
    <div className="drawer-root" onClick={onClose}>
      <div className="drawer-overlay" />
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            <span className={`platform-pill ${PLATFORM_KEY[demand.source] || ""}`}>{PLATFORM_LABEL[demand.source] || demand.source}</span>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}><Icon name="calendar" size={10} /> {demand.date}</span>
          </div>
          <Btn variant="ghost" icon="external" />
          <Btn variant="ghost" icon="more" />
          <Btn variant="ghost" icon="x" onClick={onClose} />
        </div>
        <div className="drawer-body">
          <div className="drawer-hero">
            <DemandThumb hue={demand.thumbHue} label={(demand.source || "").toUpperCase() + " · INSPIRATION"} />
          </div>

          <div className="detail-section">
            <div className="detail-section-label">标题</div>
            <input className="ghost-input" defaultValue={demand.title} onBlur={(e) => save({ title: e.target.value })} style={{ width: "100%", fontSize: 14, fontWeight: 600 }} />
          </div>

          <div className="detail-section">
            <div className="detail-section-label"><Icon name="sparkles" size={11} /> AI 摘要 / 原文</div>
            <textarea className="ghost-input" defaultValue={demand.summary}
            onBlur={(e) => save({ summary: e.target.value })}
            style={{ width: "100%", minHeight: 70, lineHeight: 1.6, resize: "vertical", fontSize: 12.5 }} />
          </div>

          <div className="detail-section">
            <div className="detail-section-label">创新类型 · 多选</div>
            <div className="tag-row">
              <Tag tone="accent">{demand.innovation}</Tag>
              <button className="tag" style={{ background: "transparent", border: "1px dashed var(--border)", color: "var(--text-3)" }}>+ 添加</button>
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-label">使用场景 · 多选</div>
            <div className="tag-row">
              {demand.scenarios.map((s) => <Tag key={s}>{s}</Tag>)}
              <button className="tag" style={{ background: "transparent", border: "1px dashed var(--border)", color: "var(--text-3)" }}>+ 添加</button>
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-label">用户痛点 · 多选</div>
            <div className="tag-row">
              {demand.painpoints.map((p) => <Tag key={p} tone="danger">{p}</Tag>)}
              <button className="tag" style={{ background: "transparent", border: "1px dashed var(--border)", color: "var(--text-3)" }}>+ 添加</button>
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-label">来源链接</div>
            <div style={{ fontSize: 12, color: "var(--accent)", wordBreak: "break-all" }}>{demand.url || `${demand.source}.com/...`}</div>
          </div>

          <div className="detail-section">
            <div className="detail-section-label">备注</div>
            <textarea className="ghost-input" placeholder="补充想法、相关资料链接..."
            style={{ width: "100%", minHeight: 60, resize: "vertical", fontSize: 12.5 }} />
          </div>

          <div className="detail-section" style={{ display: "flex", gap: 6 }}>
            <Btn variant="default" icon="sync" style={{ flex: 1, justifyContent: "center" }}>同步飞书</Btn>
            <Btn variant="ghost" icon="trash">删除</Btn>
          </div>
        </div>
      </div>
    </div>);

}
window.DemandDetailDrawer = DemandDetailDrawer;

function AddDemandModal({ onClose, api, refreshData }) {
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
              placeholder="粘贴小红书 / Kickstarter / YouTube / Instagram 链接..."
              value={url} onChange={(e) => setUrl(e.target.value)} />
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
                  AI 自动识别平台,提取首图与原文,匹配到场景/痛点/创新类型标签体系。
                </div>
                {error && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{error}</div>}
              </div>
              <div style={{ background: "var(--surface-2)", padding: 12, borderRadius: 6, fontSize: 11.5, color: "var(--text-3)" }}>
                <div style={{ fontWeight: 500, color: "var(--text-2)", marginBottom: 6 }}>支持的平台</div>
                <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
                  {["xiaohongshu", "kickstarter", "youtube", "instagram"].map((p) =>
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

              <div className="drawer-hero" style={{ aspectRatio: "16/9", margin: 0 }}>
                <DemandThumb hue={170} label="KICKSTARTER · INSPIRATION" />
              </div>

              <div className="detail-section">
                <div className="detail-section-label">标题</div>
                <input className="ghost-input" defaultValue={preview?.title || "未命名需求"}
                  style={{ width: "100%", fontSize: 14, fontWeight: 600 }} />
              </div>

              <div className="detail-section">
                <div className="detail-section-label"><Icon name="sparkles" size={11} /> AI 摘要 / 原文</div>
                <textarea className="ghost-input"
                  defaultValue={preview?.summary || ""}
                  style={{ width: "100%", minHeight: 70, lineHeight: 1.6, fontSize: 12.5, resize: "vertical" }} />
              </div>

              <div className="detail-section">
                <div className="detail-section-label">创新类型 · 多选</div>
                <div className="tag-row">
                  <Tag tone="accent">{preview?.innovation || "待分类"}</Tag>
                  <button className="tag" style={{ background: "transparent", border: "1px dashed var(--border)", color: "var(--text-3)" }}>+ 添加</button>
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-label">使用场景 · 多选</div>
                <div className="tag-row">
                  {(preview?.scenarios || []).map((tag) => <Tag key={tag}>{tag}</Tag>)}
                  <button className="tag" style={{ background: "transparent", border: "1px dashed var(--border)", color: "var(--text-3)" }}>+ 添加</button>
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-label">用户痛点 · 多选</div>
                <div className="tag-row">
                  {(preview?.painpoints || []).map((tag) => <Tag key={tag} tone="danger">{tag}</Tag>)}
                  <button className="tag" style={{ background: "transparent", border: "1px dashed var(--border)", color: "var(--text-3)" }}>+ 添加</button>
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-label">备注</div>
                <textarea className="ghost-input" placeholder="补充想法、相关资料链接..."
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
  const items = data.research;

  if (activeId) {
    const r = items.find((i) => i.id === activeId);
    return <ResearchDetail data={data} api={api} refreshData={refreshData} research={r} onBack={() => setActiveId(null)} />;
  }

  return (
    <div className="viewport">
      <div className="page">
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h1 className="h1">市场调研</h1>
            <div className="muted text-sm">从竞品库与需求管理中匹配数据,AI 生成结构化分析报告</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <Btn variant="primary" icon="plus" onClick={() => setShowCreate(true)}>新建调研项目</Btn>
          </div>
        </div>

        <div className="research-list">
          {items.map((r) =>
          <div className="research-row" key={r.id} onClick={() => setActiveId(r.id)}>
              <div className="icon"><Icon name="compass" size={18} /></div>
              <div className="research-info">
                <h4>{r.title}</h4>
                <div className="meta">
                  关联 {r.products.length} 个竞品 · {r.demands.length} 条需求 · 创建于 {r.date}
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
        </div>
        {showCreate && <CreateResearchModal api={api} refreshData={refreshData} onClose={() => setShowCreate(false)} />}
      </div>
    </div>);

}
window.ResearchScreen = ResearchScreen;

function ResearchDetail({ data, api, refreshData, research, onBack }) {
  const [productIds, setProductIds] = useState(research.products);
  const [demandIds, setDemandIds] = useState(research.demands);
  const [picker, setPicker] = useState(null); // 'product' | 'demand' | null
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const products = productIds.map((id) => data.products.find((p) => p.id === id)).filter(Boolean);
  const demands = demandIds.map((id) => data.demands.find((d) => d.id === id)).filter(Boolean);
  const saveLinks = async (nextProducts = productIds, nextDemands = demandIds) => {
    await api?.(`/api/research/${research.id}`, {
      method: "PATCH",
      body: JSON.stringify({ products: nextProducts, demands: nextDemands }),
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
        <div className="row" style={{ marginBottom: 18 }}>
          <Btn variant="ghost" icon="arrow-left" onClick={onBack}>返回</Btn>
          <div className="grow" />
          <Btn icon="sync" onClick={analyze} disabled={busy}>{busy ? "分析中..." : "重新分析"}</Btn>
          <Btn variant="primary" icon="external">导出报告</Btn>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
          <h1 className="h1" style={{ flex: 1, fontSize: 24 }}>{research.title}</h1>
          <Tag tone={research.status === "已完成" ? "success" : "warn"} style={{ marginTop: 6 }}>{research.status}</Tag>
        </div>
        <div className="muted text-sm" style={{ marginBottom: 22 }}>创建于 {research.date} · 调研项目 #{research.id.toUpperCase()}</div>
        {notice && <div className="ai-block" style={{ marginBottom: 16 }}>{notice}</div>}

        <Section icon="edit" label="产品描述">
          <div className="card" style={{ padding: 14, fontSize: 13, lineHeight: 1.7, color: "var(--text-2)" }}>
            {research.desc}
          </div>
        </Section>

        <Section icon="boxes" label={`关联竞品 · ${products.length}`}
        action={<button className="btn sm ghost" onClick={() => setPicker("product")}><Icon name="plus" size={12} /> 添加竞品</button>}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {products.map((p) =>
            <div className="card" key={p.id} style={{ padding: 12, display: "flex", gap: 10, position: "relative" }}>
                <div className="products-thumb" style={{ width: 36, height: 36, fontSize: 18 }}>{p.emoji}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div className="row" style={{ marginTop: 3, fontSize: 11.5 }}>
                    <span className="mono" style={{ fontWeight: 600 }}>{p.platforms[0].price}</span>
                    <span style={{ color: "var(--text-3)" }}>· {p.platforms[0].rating}★</span>
                  </div>
                </div>
                <Icon name="x" size={12} style={{ cursor: "pointer", color: "var(--text-4)", position: "absolute", top: 8, right: 8 }}
              onClick={() => {
                const next = productIds.filter((id) => id !== p.id);
                setProductIds(next);saveLinks(next, demandIds);
              }} />
              </div>
            )}
            {products.length === 0 &&
            <button className="card" style={{ padding: 18, border: "1px dashed var(--border)", color: "var(--text-3)", cursor: "pointer", background: "transparent", gridColumn: "1 / -1", textAlign: "center" }}
            onClick={() => setPicker("product")}>
                <Icon name="plus" size={12} /> 从竞品库添加
              </button>
            }
          </div>
        </Section>

        <Section icon="lightbulb" label={`关联需求 · ${demands.length}`}
        action={<button className="btn sm ghost" onClick={() => setPicker("demand")}><Icon name="plus" size={12} /> 添加需求</button>}>
          <div className="card">
            {demands.map((d, i) =>
            <div key={d.id} style={{ display: "flex", gap: 12, padding: "12px 14px", borderTop: i ? "1px solid var(--border)" : "none", alignItems: "center" }}>
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
              onClick={() => {
                const next = demandIds.filter((id) => id !== d.id);
                setDemandIds(next);saveLinks(productIds, next);
              }} />
              </div>
            )}
            {demands.length === 0 &&
            <button style={{ display: "block", width: "100%", padding: "18px", border: "none", color: "var(--text-3)", cursor: "pointer", background: "transparent", textAlign: "center" }}
            onClick={() => setPicker("demand")}>
                <Icon name="plus" size={12} /> 从需求管理添加
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
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{p.category} · {p.platforms[0].price} · {p.platforms[0].rating}★</div>
                </div>
              </>
        }
        searchKey={(p) => p.name + " " + p.category + " " + p.tags.join(" ")} />
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
        searchKey={(d) => d.title + " " + d.innovation + " " + d.scenarios.join(" ") + " " + d.painpoints.join(" ")} />
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
              <label className="field-label">产品想法描述</label>
              <textarea className="input" style={{ width: "100%", minHeight: 120, resize: "vertical" }} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="描述目标用户、场景、价格段、差异化设想..." />
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
  const [settings, setSettings] = useState(data.settings || {});
  const [notice, setNotice] = useState("");
  const [newSource, setNewSource] = useState({ name: "", url: "", interval: 60 });
  useEffect(() => setSources(data.rssSources), [data.rssSources]);
  useEffect(() => setSettings(data.settings || {}), [data.settings]);
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

  return (
    <div className="viewport">
      <div className="page" style={{ maxWidth: 760 }}>
        <h1 className="h1">系统设置</h1>
        <div className="muted text-sm" style={{ marginBottom: 24 }}>配置 AI 模型、飞书同步与数据源</div>
        {notice && <div className="ai-block" style={{ marginBottom: 16 }}>{notice}</div>}

        <div className="settings-section">
          <div className="settings-section-head">
            <Icon name="sparkles" size={14} style={{ color: "var(--accent)" }} />
            <div><h3>AI 模型配置</h3><div className="desc">所有筛选/翻译/打标/分析任务调用的 LLM</div></div>
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
                <Btn icon="save" onClick={() => saveSettings()}>保存配置</Btn>
                <Btn icon="check" onClick={() => test("/api/settings/test-llm", "LLM")}>测试连接</Btn>
                {settings.last_llm_test_at && <Tag tone="success">✓ {settings.last_llm_test_at}</Tag>}
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
            <div><h3>News 数据源</h3><div className="desc">RSS 与定向网页源,定时拉取后经 AI 中间层筛选</div></div>
          </div>
          <div className="settings-section-body">
            {sources.map((s) =>
            <div className="source-row" key={s.id}>
                <div>
                  <div style={{ fontWeight: 500 }}>{s.name}</div>
                  <div className="url">{s.url}</div>
                </div>
                <div><Tag tone="outline">RSS</Tag></div>
                <div className="muted text-sm">{s.interval} min</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, alignItems: "center" }}>
                  <Switch on={s.active} onChange={() => toggle(s.id)} />
                  <Btn size="sm" variant="ghost" icon="more" />
                </div>
              </div>
            )}
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
            <Icon name="tag" size={14} style={{ color: "var(--accent)" }} />
            <div><h3>标签体系</h3><div className="desc">AI 打标使用的预设标签库</div></div>
          </div>
          <div className="settings-section-body">
            <TagSystemEditor />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-head">
            <Icon name="key" size={14} style={{ color: "var(--accent)" }} />
            <div><h3>账号信息</h3><div className="desc">当前为单用户模式,架构已预留多用户字段</div></div>
          </div>
          <div className="settings-section-body">
            <div className="settings-row"><div className="label">用户名</div><div>{data.user.name}</div></div>
            <div className="settings-row"><div className="label">角色</div><div>{data.user.role}</div></div>
            <div className="settings-row"><div className="label">&nbsp;</div><div><Btn>修改密码</Btn></div></div>
          </div>
        </div>
      </div>
    </div>);

}
window.SettingsScreen = SettingsScreen;

function TagSystemEditor() {
  const [groups, setGroups] = useState([
  { name: "产品品类", tone: "default", tags: ["灯光", "稳定器", "三脚架", "镜头", "麦克风", "相机配件", "运动相机", "无人机"] },
  { name: "使用场景", tone: "accent", tags: ["Vlog/自拍", "直播/带货", "短视频创作", "户外旅拍", "室内棚拍", "桌面俯拍", "运动/极限拍摄", "会议/活动记录", "产品摄影", "延时/慢动作", "街拍/纪实", "教育/网课"] },
  { name: "用户痛点", tone: "danger", tags: ["携带不便/太重", "续航不足", "操作复杂/学习成本高", "画质不够", "防抖不足", "散热过热", "噪音大", "兼容性差", "配件缺失/需另购", "安装固定麻烦", "调光/调色不精准", "无线连接不稳定", "收纳困难", "价格过高/性价比低", "做工质感差"] },
  { name: "创新类型", tone: "success", tags: ["技术创新", "使用方式创新", "形态创新", "场景拓展", "生态整合", "性价比创新"] }]
  );
  const [drafts, setDrafts] = useState({});
  const [editing, setEditing] = useState(null); // index of group with input open

  const addTag = (i) => {
    const v = (drafts[i] || "").trim();
    if (!v) return;
    if (groups[i].tags.includes(v)) {setDrafts({ ...drafts, [i]: "" });return;}
    setGroups(groups.map((g, j) => j === i ? { ...g, tags: [...g.tags, v] } : g));
    setDrafts({ ...drafts, [i]: "" });
  };
  const removeTag = (i, t) =>
  setGroups(groups.map((g, j) => j === i ? { ...g, tags: g.tags.filter((x) => x !== t) } : g));

  return (
    <>
      {groups.map((g, i) =>
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
      )}
    </>);

}
