/* global React */
const React = globalThis.React;
const { useState, useEffect, useRef, createContext, useContext } = React;

// =========== Icons (single-stroke line icons, lucide-style) ===========
const Icon = ({ name, size = 16, ...rest }) => {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", ...rest };
  switch (name) {
    case "newspaper": return <svg {...props}><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>;
    case "boxes": return <svg {...props}><path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/></svg>;
    case "lightbulb": return <svg {...props}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>;
    case "compass": return <svg {...props}><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>;
    case "settings": return <svg {...props}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "search": return <svg {...props}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
    case "plus": return <svg {...props}><path d="M5 12h14"/><path d="M12 5v14"/></svg>;
    case "x": return <svg {...props}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>;
    case "more": return <svg {...props}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>;
    case "star": return <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case "star-fill": return <svg {...props} fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case "filter": return <svg {...props}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;
    case "external": return <svg {...props}><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>;
    case "sync": return <svg {...props}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>;
    case "sparkles": return <svg {...props}><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>;
    case "tag": return <svg {...props}><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>;
    case "rss": return <svg {...props}><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>;
    case "check": return <svg {...props}><path d="M20 6 9 17l-5-5"/></svg>;
    case "chevron-right": return <svg {...props}><path d="m9 18 6-6-6-6"/></svg>;
    case "chevron-down": return <svg {...props}><path d="m6 9 6 6 6-6"/></svg>;
    case "chevron-up": return <svg {...props}><path d="m18 15-6-6-6 6"/></svg>;
    case "arrow-left": return <svg {...props}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>;
    case "edit": return <svg {...props}><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>;
    case "trash": return <svg {...props}><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
    case "link": return <svg {...props}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
    case "bell": return <svg {...props}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>;
    case "sun": return <svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>;
    case "moon": return <svg {...props}><path d="M12 3a6 6 0 1 0 9 9 8.5 8.5 0 1 1-9-9Z"/></svg>;
    case "panel-open": return <svg {...props}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>;
    case "calendar": return <svg {...props}><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>;
    case "image": return <svg {...props}><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>;
    case "key": return <svg {...props}><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>;
    case "file-text": return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>;
    case "shield": return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>;
    case "database": return <svg {...props}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg>;
    case "bot": return <svg {...props}><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="3"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M9 13v2"/><path d="M15 13v2"/></svg>;
    case "bar-chart": return <svg {...props}><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>;
    case "clipboard": return <svg {...props}><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>;
    case "folder-open": return <svg {...props}><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>;
    case "chrome": return <svg {...props}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" x2="12" y1="8" y2="8"/><line x1="3.95" x2="8.54" y1="6.06" y2="14"/><line x1="10.88" x2="15.46" y1="21.94" y2="14"/></svg>;
    case "upload": return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>;
    case "message-circle": return <svg {...props}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>;
    case "palette": return <svg {...props}><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>;
    case "lock": return <svg {...props}><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
    case "layers": return <svg {...props}><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>;
    case "network": return <svg {...props}><circle cx="6" cy="6" r="3"/><circle cx="18" cy="7" r="3"/><circle cx="8" cy="18" r="3"/><circle cx="19" cy="18" r="2"/><path d="m8.7 7.1 6.6-.7"/><path d="m7 9 1 6"/><path d="m10.8 17.9 6.2.1"/><path d="m16.4 9.5-6.1 6.2"/></svg>;
    case "home": return <svg {...props}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
    case "feishu": return <svg {...props}><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><path d="M13 17h8M17 13v8"/></svg>;
    case "alert-triangle": return <svg {...props}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>;
    case "trending-up": return <svg {...props}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>;
    case "download": return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>;
    default: return null;
  }
};
window.Icon = Icon;

// =========== Theme Context ===========
const ThemeCtx = createContext({});
window.ThemeCtx = ThemeCtx;

const PLATFORM_LABEL = {
  amazon: "Amazon", taobao: "淘宝", jd: "京东", xiaohongshu: "小红书", kickstarter: "Kickstarter", instagram: "Instagram", youtube: "YouTube",
};
const PLATFORM_ICON = { amazon: "AMZ", taobao: "TB", jd: "JD", xiaohongshu: "XHS", kickstarter: "KS" };
const PLATFORM_KEY = { amazon: "amz", taobao: "tb", jd: "jd", xiaohongshu: "xhs", kickstarter: "ks" };
window.PLATFORM_LABEL = PLATFORM_LABEL;
window.PLATFORM_ICON = PLATFORM_ICON;
window.PLATFORM_KEY = PLATFORM_KEY;

// Common atoms
const Tag = ({ tone = "default", children, ...rest }) => (
  <span className={`tag ${tone === "default" ? "" : tone}`} {...rest}>{children}</span>
);
const Btn = ({ variant = "default", size, icon, children, className = "", ...rest }) => (
  <button className={`btn ${variant === "primary" ? "primary" : variant === "ghost" ? "ghost" : variant === "danger" ? "danger" : ""} ${size === "sm" ? "sm" : ""} ${!children ? "icon" : ""} ${className}`} {...rest}>
    {icon && <Icon name={icon} size={size === "sm" ? 13 : 14} />}
    {children}
  </button>
);
const Switch = ({ on, onChange }) => (
  <span className={`switch ${on ? "on" : ""}`} onClick={() => onChange?.(!on)} role="switch" aria-checked={on}/>
);

// Placeholder image with stripes
const Placeholder = ({ label = "image", style }) => (
  <div className="ph" style={{ width: "100%", height: "100%", ...style }}>{label}</div>
);

// Stylized abstract demand thumbnail (no realistic SVG drawing)
const DemandThumb = ({ hue, label }) => (
  <div style={{
    height: "100%", width: "100%",
    background: `
      radial-gradient(120% 90% at 20% 0%, oklch(0.85 0.08 ${hue}) 0%, transparent 60%),
      radial-gradient(120% 90% at 100% 100%, oklch(0.7 0.12 ${(hue + 60) % 360}) 0%, transparent 55%),
      linear-gradient(135deg, oklch(0.92 0.04 ${hue}), oklch(0.84 0.06 ${(hue + 30) % 360}))`,
    display: "grid", placeItems: "center",
    fontFamily: "var(--font-mono)", fontSize: 10.5, color: "rgba(255,255,255,0.85)",
    letterSpacing: "0.04em", textShadow: "0 1px 2px rgba(0,0,0,0.2)"
  }}>{label}</div>
);
window.DemandThumb = DemandThumb;

Object.assign(window, { Tag, Btn, Switch, Placeholder });

// =========== Navigation helper ===========
// 统一 URL 更新 + 触发 popstate + loom:navigate，调用方式：
//   navigateTo("prd", { docId: "abc", section: "open_questions" })
//   navigateTo("knowledge")  // 清空除 screen 之外的参数
const navigateTo = (screen, params = {}, { keep = false } = {}) => {
  if (typeof window === "undefined") return;
  const search = new URLSearchParams(keep ? window.location.search : "");
  if (screen) search.set("screen", screen);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === "") search.delete(key);
    else search.set(key, String(value));
  }
  const nextUrl = `${window.location.pathname}?${search.toString()}`;
  if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState({}, "", nextUrl);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new Event("loom:navigate"));
};
window.navigateTo = navigateTo;

// =========== SaveIndicator: Notion-style "Saved" badge ===========
const SaveIndicator = ({ state = "idle", updatedAt }) => {
  const [ago, setAgo] = useState("");
  useEffect(() => {
    if (!updatedAt) { setAgo(""); return; }
    const fmt = () => {
      const seconds = Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000));
      if (seconds < 5) return "刚刚";
      if (seconds < 60) return `${seconds} 秒前`;
      if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟前`;
      return `${Math.round(seconds / 3600)} 小时前`;
    };
    setAgo(fmt());
    const id = window.setInterval(() => setAgo(fmt()), 15000);
    return () => window.clearInterval(id);
  }, [updatedAt]);
  if (state === "saving") return <span className="save-indicator saving"><span className="save-dot" />正在保存…</span>;
  if (state === "error") return <span className="save-indicator error"><span className="save-dot" />保存失败</span>;
  if (state === "saved" || updatedAt) return <span className="save-indicator saved"><span className="save-dot" />已保存{ago ? ` · ${ago}` : ""}</span>;
  return <span className="save-indicator idle"><span className="save-dot" />未编辑</span>;
};
window.SaveIndicator = SaveIndicator;

// =========== ConfirmModal: 简洁的确认弹窗 ===========
const ConfirmModal = ({ open, title, description, confirmText = "确认", cancelText = "取消", tone = "primary", onConfirm, onClose, busy = false }) => {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head"><h3>{title}</h3><Btn variant="ghost" icon="x" onClick={onClose} /></div>
        <div className="modal-body">{description}</div>
        <div className="modal-foot">
          <Btn variant="ghost" onClick={onClose} disabled={busy}>{cancelText}</Btn>
          <Btn variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>{busy ? "处理中…" : confirmText}</Btn>
        </div>
      </div>
    </div>
  );
};
window.ConfirmModal = ConfirmModal;

// =========== Drawer: 右侧滑入式抽屉 (与 Modal 区分语义) ===========
const Drawer = ({ open, title, icon, onClose, children, footer, width = 440 }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ width: `min(${width}px, 92vw)` }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="drawer-head">
          {icon ? <Icon name={icon} size={15} /> : null}
          <h3>{title}</h3>
          <Btn variant="ghost" icon="x" onClick={onClose} />
        </header>
        <div className="drawer-scroll">{children}</div>
        {footer ? <footer className="drawer-foot">{footer}</footer> : null}
      </aside>
    </div>
  );
};
window.Drawer = Drawer;

// =========== OverflowMenu: ⋯ 操作菜单 ===========
const OverflowMenu = ({ items = [], align = "right" }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [open]);
  return (
    <span className="overflow-menu" ref={ref}>
      <button type="button" className="overflow-trigger" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} aria-label="更多操作">
        <Icon name="more" size={14} />
      </button>
      {open ? (
        <div className={`overflow-menu-popover ${align === "right" ? "right" : "left"}`}>
          {items.filter(Boolean).map((item, idx) => (
            <button
              key={item.key || idx}
              type="button"
              className={`overflow-menu-item ${item.tone === "danger" ? "danger" : ""}`}
              onClick={(e) => { e.stopPropagation(); setOpen(false); item.onClick?.(); }}
              disabled={item.disabled}
            >
              {item.icon ? <Icon name={item.icon} size={13} /> : null}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
};
window.OverflowMenu = OverflowMenu;

// =========== SectionDot: 章节状态点 (替代 Tag) ===========
const SectionDot = ({ status = "empty", title }) => (
  <span className={`section-dot ${status}`} title={title} aria-label={title} />
);
window.SectionDot = SectionDot;

// =========== CitationChip: 可点击引用 ===========
const CitationChip = ({ label, onClick, tone = "outline" }) => (
  <button type="button" className={`citation-chip ${tone}`} onClick={onClick}>
    <Icon name="link" size={11} />
    <span>{label}</span>
  </button>
);
window.CitationChip = CitationChip;

// =========== Breadcrumb: 返回 + 当前层级 ===========
const Breadcrumb = ({ trail = [], onBack, backLabel = "返回" }) => (
  <nav className="breadcrumb" aria-label="导航位置">
    {onBack ? (
      <button type="button" className="breadcrumb-back" onClick={onBack}>
        <Icon name="arrow-left" size={14} />
        <span>{backLabel}</span>
      </button>
    ) : null}
    {trail.length ? (
      <ol className="breadcrumb-trail">
        {trail.map((item, idx) => (
          <li key={idx}>
            {item.onClick && idx < trail.length - 1 ? (
              <button type="button" className="breadcrumb-link" onClick={item.onClick}>{item.label}</button>
            ) : (
              <span className={idx === trail.length - 1 ? "breadcrumb-current" : "breadcrumb-label"}>{item.label}</span>
            )}
            {idx < trail.length - 1 ? <Icon name="chevron-right" size={11} /> : null}
          </li>
        ))}
      </ol>
    ) : null}
  </nav>
);
window.Breadcrumb = Breadcrumb;

// =========== DocCard: 文档卡片（索引页用） ===========
// 行业实践：卡片明确触发区是整张卡，overflow menu 单独占位，避免误触
const DocCard = ({ title, icon, badges = [], metaTop, metaBottom, footer, onClick, overflowItems, isActive = false, isSample = false }) => (
  <div className={`doc-card ${isActive ? "active" : ""} ${isSample ? "is-sample" : ""}`}>
    <button type="button" className="doc-card-main" onClick={onClick}>
      <div className="doc-card-head">
        {icon ? <Icon name={icon} size={15} /> : null}
        {metaTop ? <span className="doc-card-meta-top">{metaTop}</span> : null}
      </div>
      <h3 className="doc-card-title">{title}</h3>
      {badges?.length ? (
        <div className="doc-card-badges">{badges.map((b, i) => <Tag key={i} tone={b.tone || "outline"}>{b.label}</Tag>)}</div>
      ) : null}
      {metaBottom ? <div className="doc-card-meta-bottom">{metaBottom}</div> : null}
      {footer ? <div className="doc-card-footer">{footer}</div> : null}
    </button>
    {overflowItems?.length ? (
      <div className="doc-card-actions">
        <OverflowMenu items={overflowItems} />
      </div>
    ) : null}
  </div>
);
window.DocCard = DocCard;
