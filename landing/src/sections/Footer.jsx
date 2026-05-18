import { smoothScrollTo } from "../App.jsx";

export default function Footer() {
  const onAnchor = (e, id) => {
    e.preventDefault();
    smoothScrollTo(id);
  };

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <span className="footer-brand-name">LOOM</span>
          <span className="footer-brand-expand">Link · Observe · Organize · Make</span>
        </div>
        <div className="footer-links">
          <a href="#top" onClick={(e) => onAnchor(e, "top")}>回到顶部</a>
          <a href="#modules" onClick={(e) => onAnchor(e, "modules")}>L·O·O·M</a>
          <a href="#vision" onClick={(e) => onAnchor(e, "vision")}>愿景</a>
          <a href="#login" onClick={(e) => onAnchor(e, "login")}>登录</a>
        </div>
      </div>
    </footer>
  );
}
