import { smoothScrollTo } from "../App.jsx";

const LOOM_URL = import.meta.env.VITE_LOOM_APP_URL || "/";

export default function Hero() {
  const onPrimary = (e) => {
    e.preventDefault();
    // Two-mode CTA: if Loom URL is set to same-origin, scroll to login;
    // otherwise navigate out. Default behavior: scroll to embedded login.
    smoothScrollTo("login");
    window.setTimeout(() => {
      const el = document.getElementById("login-username");
      if (el) el.focus({ preventScroll: true });
    }, 600);
  };

  const onSecondary = (e) => {
    e.preventDefault();
    smoothScrollTo("problem");
  };

  return (
    <section id="top" className="section hero">
      <div className="hero-grid" aria-hidden="true" />
      <div className="container hero-content reveal">
        <div className="brand-wordmark">LOOM</div>
        <div className="hero-tagline">
          <span>Link</span> · <span>Observe</span> · <span>Organize</span> ·{" "}
          <span>Make</span>
        </div>

        <h1 className="hero-headline">
          让 AI 真的懂
          <br />
          你这<span className="accent">一行</span>
        </h1>

        <p className="hero-sub">
          资讯、竞品、用户需求 —— 你每天本来就在判断。
          LOOM 把这些判断结构化、可调用 —— 让 AI 越用越懂你这一行。
        </p>

        <div className="hero-cta-row">
          <a
            className="btn btn-primary"
            href="#problem"
            onClick={onSecondary}
          >
            看看它怎么运作 <span aria-hidden="true">↓</span>
          </a>
        </div>

        <div className="hero-marquee" aria-hidden="true">
          <span>Stream · 资讯流</span>
          <span>Lens · 竞品库</span>
          <span>Spark · 灵感库</span>
          <span>Weave · 调研工坊</span>
        </div>
      </div>
    </section>
  );
}
