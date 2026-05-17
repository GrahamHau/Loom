// Module names + sublabels mirror src/App.jsx:20-29 in the main LOOM app.
// Keep these in sync if NAV ever changes.

const MODULES = [
  {
    key: "stream",
    name: "Stream",
    sub: "资讯流",
    icon: NewspaperIcon,
    lede: "治 FOMO 靠的是及时性，不是搜索。",
    body: "RSS + 公众号 + 摄影行业定向源（DPReview、PetaPixel、SmallRig blog、Peak Design 更新、小红书摄影博主 RSS 等），AI 翻译筛选后推到你眼前。",
    annotation: (
      <>
        <strong>你的判断在这里：</strong>
        你顺手标的「相关 / 值得追 / 拿去看竞品」——
        每一次都是在教 AI 你的口味。
      </>
    ),
  },
  {
    key: "lens",
    name: "Lens",
    sub: "竞品库",
    icon: BoxesIcon,
    lede: "边看竞品，边完成信息整理 —— 不用事后再翻收藏夹。",
    body: "浏览亚马逊 / 淘宝看 SmallRig、Ulanzi、Peak Design 时，用 LOOM 浏览器插件一键采集图片、卖点、价格、规格、标签 —— 落到统一的结构化卡片。",
    annotation: (
      <>
        <strong>你的判断在这里：</strong>
        你写的「这个卡口为什么好」「这个材质手感不行」——
        通用语料里没有这种隐性知识，正是 AI 缺的 skill。
      </>
    ),
  },
  {
    key: "spark",
    name: "Spark",
    sub: "灵感库",
    icon: LightbulbIcon,
    lede: "跨平台需求 + 你的判断 = 补齐 AI 的 skill 层。",
    body: "小红书摄影博主吐槽 / B 站测评 / Reddit r/photography / Kickstarter 摄影配件众筹的线索，沉淀成可追溯的需求脉络。",
    annotation: (
      <>
        <strong>你的判断在这里：</strong>
        你对每条需求打的标 ——「真痛点 / 伪需求」「值得做 / 不值得做」「优先级」——
        训练数据里没有这一层，AI 也就学不会判断。
      </>
    ),
  },
  {
    key: "weave",
    name: "Weave",
    sub: "调研工坊",
    icon: CompassIcon,
    lede: "把采集和判断关联起来，变成可执行的洞察。",
    body: "设定调研目标（如「背包场景的相机快拆方案」），关联 Lens 的竞品 + Spark 的需求，AI 输出结构化的产品分析，并基于已有元素做交叉组合给你意想不到的方向。",
    annotation: (
      <>
        <strong>判断在这里汇合：</strong>
        前三个模块沉下来的判断，到 Weave 被一起调用 ——
        AI 在你的行业语料里做推理，而不是在全网平均水平上瞎猜。
      </>
    ),
  },
];

export default function Modules() {
  return (
    <section id="modules" className="section">
      <div className="container reveal">
        <div className="kicker">四个模块</div>
        <h2 className="section-title">把世界的信息，接进你的工作台</h2>
        <p className="section-lead">
          三个模块负责采集，第四个模块把它们和你的判断一起调用。
          悬停每张卡，看你的判断进到哪里。
        </p>

        <div className="modules-grid">
          {MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <article
                className="module-card"
                key={m.key}
                tabIndex={0}
                aria-label={`${m.name} · ${m.sub}`}
              >
                <header className="module-card-head">
                  <div className="module-card-name">{m.name}</div>
                  <div className="module-card-sub">{m.sub}</div>
                </header>
                <Icon className="module-card-icon" />
                <p className="module-card-lede">{m.lede}</p>
                <p className="module-card-body">{m.body}</p>
                <div className="module-card-annotation">{m.annotation}</div>
              </article>
            );
          })}
        </div>

        <blockquote className="modules-closing-quote">
          你每天本来就在看这些东西，LOOM 只是让你看过的不白看、想过的不白想。
        </blockquote>
      </div>
    </section>
  );
}

/* ============================================================
 * Lucide-style inline SVG icons (no dependency).
 * Mirrors the iconography used in main LOOM nav (newspaper /
 * boxes / lightbulb / compass).
 * ============================================================ */

function NewspaperIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z" />
    </svg>
  );
}

function BoxesIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5l-5-3-4.03 1.92Z" />
      <path d="m7 16.5-4.74-2.85M7 16.5l5-3M7 16.5v5.17" />
      <path d="M12 13.99V19l4.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 11l-5 2.99Z" />
      <path d="m17 16.5-5-3M17 16.5l4.74-2.85M17 16.5v5.17M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" />
      <path d="M12 8 7.26 5.15M12 8l4.74-2.85M12 13.5V8" />
    </svg>
  );
}

function LightbulbIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6M10 22h4" />
    </svg>
  );
}

function CompassIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}
