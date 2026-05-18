import LoginPanel from "../auth/LoginPanel.jsx";

const TUTORIAL_URL =
  "https://ulanzichina.feishu.cn/wiki/Xv2DwmqmfibDe2kubvfcXXoAn5g?from=from_copylink";
const EXTENSION_DOWNLOAD_URL = "/downloads/loom-extension.zip";

export default function FinalCTA() {
  return (
    <section id="login" className="section finalcta tile-dark">
      <div className="container finalcta-stack reveal">
        <div className="finalcta-copy">
          <div className="kicker">开始使用</div>
          <h2 className="finalcta-title">
            让每一条判断
            <br />
            都不白做。
          </h2>
          <p className="finalcta-body">
            持续使用一个月 —
            当四个阶段积累了真实的判断和标注后，
            输出会越来越接近团队的行业直觉，
            而不是互联网平均水平。
          </p>
        </div>

        <div className="finalcta-steps">
          <div className="finalcta-step">
            <div className="finalcta-step-num">1</div>
            <div className="finalcta-step-content">
              <h3 className="finalcta-step-title">阅读教程</h3>
              <p className="finalcta-step-desc">
                第一次使用？先看飞书教程，几分钟就能上手。
              </p>
              <a
                className="btn btn-link"
                href={TUTORIAL_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                打开飞书教程
              </a>
            </div>
          </div>

          <div className="finalcta-step">
            <div className="finalcta-step-num">2</div>
            <div className="finalcta-step-content">
              <h3 className="finalcta-step-title">安装插件</h3>
              <p className="finalcta-step-desc">
                浏览器插件是 LOOM 采集数据的核心工具。
              </p>
              <a
                className="btn btn-link"
                href={EXTENSION_DOWNLOAD_URL}
                download="loom-extension.zip"
              >
                下载 Chrome 插件
              </a>
            </div>
          </div>

          <div className="finalcta-step">
            <div className="finalcta-step-num">3</div>
            <div className="finalcta-step-content">
              <h3 className="finalcta-step-title">登录工作台</h3>
              <p className="finalcta-step-desc">
                插件安装完成？登录 LOOM 工作台。
              </p>
              <LoginPanel />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
