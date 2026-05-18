import { smoothScrollTo } from "../App.jsx";

export default function Hero() {
  return (
    <section id="top" className="section hero">
      <div className="container reveal">
        <div className="hero-wordmark">LOOM</div>

        <div className="hero-acronym">
          <span className="hero-acronym-letter">Link</span>
          <span className="hero-acronym-dot">·</span>
          <span className="hero-acronym-letter">Observe</span>
          <span className="hero-acronym-dot">·</span>
          <span className="hero-acronym-letter">Organize</span>
          <span className="hero-acronym-dot">·</span>
          <span className="hero-acronym-letter">Make</span>
        </div>

        <h1 className="headline-hero">
          把散落的产品知识
          <br />
          织成可追溯、可问答的决策网络。
        </h1>

        <div className="hero-cta-row">
          <a className="btn btn-link" href="#modules" onClick={(e) => { e.preventDefault(); smoothScrollTo("modules"); }}>
            看看怎么运作
          </a>
          <a className="btn btn-link" href="#login" onClick={(e) => { e.preventDefault(); smoothScrollTo("login"); }}>
            直接登录
          </a>
        </div>
      </div>
    </section>
  );
}
