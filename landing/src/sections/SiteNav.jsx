import { useEffect, useState } from "react";
import { smoothScrollTo } from "../App.jsx";

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onAnchor = (e, id) => {
    e.preventDefault();
    smoothScrollTo(id);
  };

  const onLoginAnchor = (e) => {
    e.preventDefault();
    smoothScrollTo("login");
    // give the scroll a tick, then focus the username field
    window.setTimeout(() => {
      const el = document.getElementById("login-username");
      if (el) el.focus({ preventScroll: true });
    }, 600);
  };

  return (
    <header className="site-nav" data-scrolled={scrolled ? "true" : "false"}>
      <a href="#top" className="site-nav-brand" onClick={(e) => onAnchor(e, "top")}>
        LOOM
      </a>
      <nav className="site-nav-links" aria-label="主导航">
        <a href="#modules" onClick={(e) => onAnchor(e, "modules")}>
          四根经线
        </a>
        <a href="#whynow" onClick={(e) => onAnchor(e, "whynow")}>
          为什么现在
        </a>
        <a href="#weave" onClick={(e) => onAnchor(e, "weave")}>
          调研工坊
        </a>
        <a href="#vision" onClick={(e) => onAnchor(e, "vision")}>
          愿景
        </a>
      </nav>
      <a href="#login" className="site-nav-cta" onClick={onLoginAnchor}>
        进入 LOOM
      </a>
    </header>
  );
}
