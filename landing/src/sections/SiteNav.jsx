import { smoothScrollTo } from "../App.jsx";

export default function SiteNav() {
  const onAnchor = (e, id) => {
    e.preventDefault();
    smoothScrollTo(id);
  };

  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <a href="#top" className="site-nav-brand" onClick={(e) => onAnchor(e, "top")}>
          LOOM
        </a>
        <nav className="site-nav-links" aria-label="Main navigation">
          <a href="#modules" onClick={(e) => onAnchor(e, "modules")}>
            L·O·O·M
          </a>
          <a href="#pipeline" onClick={(e) => onAnchor(e, "pipeline")}>
            怎么运作
          </a>
          <a href="#vision" onClick={(e) => onAnchor(e, "vision")}>
            愿景
          </a>
        </nav>
        <a href="#login" className="site-nav-cta" onClick={(e) => onAnchor(e, "login")}>
          开始使用
        </a>
      </div>
    </header>
  );
}
