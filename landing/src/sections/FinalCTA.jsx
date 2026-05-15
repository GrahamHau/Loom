import LoginPanel from "../auth/LoginPanel.jsx";

const TUTORIAL_URL =
  "https://ulanzichina.feishu.cn/wiki/Xv2DwmqmfibDe2kubvfcXXoAn5g?from=from_copylink";
const EXTENSION_DOWNLOAD_URL = "/downloads/loom-extension.zip";

export default function FinalCTA() {
  return (
    <section id="login" className="section finalcta">
      <div className="container finalcta-stack reveal">
        <div className="finalcta-copy">
          <div className="kicker">开始使用</div>
          <h2 className="finalcta-title">
            让 AI 变成一个
            <br />
            真正懂你这一行的同事。
          </h2>
          <p className="finalcta-body">
            LOOM 当前是单用户工作台。先用一个月 ——
            等四个模块攒下你真实的判断和点评，Weave
            给出的洞察会越来越像一个和你共事过一年的同事，而不是一个只读过全网文章的通用
            AI。这些认知沉下来，团队里其他人也能调用。
          </p>
        </div>

        <div className="finalcta-steps">
          <div className="finalcta-step">
            <div className="finalcta-step-num">①</div>
            <div className="finalcta-step-content">
              <h3 className="finalcta-step-title">先看教程</h3>
              <p className="finalcta-step-desc">
                第一次用，建议先按教程走一遍 —— 几分钟就能上手。
              </p>
              <a
                className="btn btn-primary"
                href={TUTORIAL_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                打开飞书教程 <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>

          <div className="finalcta-step">
            <div className="finalcta-step-num">②</div>
            <div className="finalcta-step-content">
              <h3 className="finalcta-step-title">下载浏览器插件</h3>
              <p className="finalcta-step-desc">
                LOOM 靠插件在你浏览竞品、看资讯时一键采集 —— 这是入口。
              </p>
              <a
                className="btn btn-primary"
                href={EXTENSION_DOWNLOAD_URL}
                download="loom-extension.zip"
              >
                下载 Chrome 插件 <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>

          <div className="finalcta-step">
            <div className="finalcta-step-num">③</div>
            <div className="finalcta-step-content">
              <h3 className="finalcta-step-title">登录工作台</h3>
              <p className="finalcta-step-desc">
                插件装好后，登录进入你的 LOOM 工作台。
              </p>
              <LoginPanel />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
