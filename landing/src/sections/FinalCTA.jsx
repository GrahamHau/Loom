import LoginPanel from "../auth/LoginPanel.jsx";

export default function FinalCTA() {
  return (
    <section id="login" className="section finalcta">
      <div className="container finalcta-grid reveal">
        <div className="finalcta-copy">
          <div className="kicker">开始织造</div>
          <h2 className="finalcta-title">
            先让 AI 变成你的同事，
            <br />
            再让它变成公司的资产。
          </h2>
          <p className="finalcta-body">
            Loom 当前是单用户个人工作台。先用一个月 ——
            等四个模块都积累了你真实的判断和点评，你会发现 Weave
            给出的洞察越来越像一个跟你一起做了一年摄影配件的同事，而不是一个只读过全网文章的通用
            AI。这些认知沉淀下来，也是公司可继承的行业资产。
          </p>
        </div>
        <LoginPanel />
      </div>
    </section>
  );
}
