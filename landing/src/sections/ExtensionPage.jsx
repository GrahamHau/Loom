const WEB_APP_URL = "https://loom.my1panelsite.xyz/app";
const TUTORIAL_URL =
  "https://ulanzichina.feishu.cn/wiki/Xv2DwmqmfibDe2kubvfcXXoAn5g?from=from_copylink";

const STEPS = [
  {
    num: "01",
    title: "先看教程",
    body: "先按飞书教程完整走一遍，你会更快理解插件怎么和 LOOM 工作台配合。",
    ctaLabel: "打开飞书教程",
    href: TUTORIAL_URL,
  },
  {
    num: "02",
    title: "打开 Chrome 扩展管理页",
    body: "在 Chrome 地址栏输入 chrome://extensions/，并打开右上角“开发者模式”。",
    ctaLabel: "查看安装步骤",
    href: TUTORIAL_URL,
  },
  {
    num: "03",
    title: "加载本地插件目录",
    body: "点击“加载已解压的扩展程序”，选择 LOOM 插件目录，让插件出现在浏览器侧边栏。",
    ctaLabel: "回看教程说明",
    href: TUTORIAL_URL,
  },
  {
    num: "04",
    title: "登录 Web 工作台",
    body: "安装完成后，先登录 LOOM Web 端；插件会跟随当前 Web 登录态自动同步账号。",
    ctaLabel: "打开 Web 工作台",
    href: WEB_APP_URL,
  },
];

export default function ExtensionPage() {
  return (
    <main className="extension-page">
      <section className="extension-hero">
        <div className="container extension-hero-inner">
          <a className="extension-backlink" href="/">
            返回首页
          </a>
          <div className="kicker">LOOM Extension</div>
          <h1 className="extension-title">安装 LOOM 浏览器插件</h1>
          <p className="extension-body">
            目前插件还没有上 Chrome 商店，所以先通过本地加载方式安装。
            整个流程不复杂，按下面几步走就可以。
          </p>
          <div className="extension-hero-actions">
            <a className="btn btn-primary" href={TUTORIAL_URL} target="_blank" rel="noopener noreferrer">
              打开飞书教程 <span aria-hidden="true">→</span>
            </a>
            <a className="btn btn-secondary" href={WEB_APP_URL} target="_blank" rel="noopener noreferrer">
              打开 Web 工作台 <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>

      <section className="extension-section">
        <div className="container reveal">
          <div className="extension-steps">
            {STEPS.map((step) => (
              <article className="extension-step" key={step.num}>
                <div className="extension-step-num">{step.num}</div>
                <div className="extension-step-content">
                  <h2 className="extension-step-title">{step.title}</h2>
                  <p className="extension-step-body">{step.body}</p>
                  <a
                    className="btn btn-primary"
                    href={step.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {step.ctaLabel} <span aria-hidden="true">→</span>
                  </a>
                </div>
              </article>
            ))}
          </div>

          <div className="extension-note">
            <strong>当前状态</strong>
            <p>
              插件默认连接到 <code>https://loom.my1panelsite.xyz</code>。
              登录时会跳转到 <code>/app</code>，插件再自动同步 Web 登录态。
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
