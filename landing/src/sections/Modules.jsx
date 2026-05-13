// Module names + sublabels mirror src/App.jsx:20-29 in the main Loom app.
// Keep these in sync if NAV ever changes.

const MODULES = [
  {
    key: "stream",
    name: "Stream",
    sub: "资讯流",
    icon: NewspaperIcon,
    lede: "治 FOMO 靠的是及时性，不是搜索。",
    body: "RSS + 摄影行业定向源（DPReview、PetaPixel、SmallRig blog、Peak Design 更新、小红书摄影博主 RSS 等），AI 翻译筛选后推到你眼前。",
    annotation: (
      <>
        <strong>纬线在哪里：</strong>
        你顺手标记的「相关 / 不相关」、「值得追」、「拿去看竞品」，
        每一次判断都在帮 AI 学你的口味。
      </>
    ),
  },
  {
    key: "lens",
    name: "Lens",
    sub: "竞品库",
    icon: BoxesIcon,
    lede: "把隐性知识，从浏览器一键织进 AI 语料。",
    body: "浏览亚马逊 / 淘宝看 SmallRig、Ulanzi、Peak Design 时，用 Loom 浏览器插件一键采集图片、卖点、价格、规格、标签 —— 落到统一的结构化卡片。",
    annotation: (
      <>
        <strong>纬线在哪里：</strong>
        你写下的「这个卡口为什么好」「这个材质手感不行」—— 这些注解才是 AI 缺的
        skill，是通用语料里找不到的隐性知识。
      </>
    ),
  },
  {
    key: "spark",
    name: "Spark",
    sub: "灵感库",
    icon: LightbulbIcon,
    lede: "跨平台需求 + PM 判断 = 补齐 AI 的 skill 层。",
    body: "小红书摄影博主吐槽 / B 站测评 / Reddit r/photography / Kickstarter 摄影配件众筹的线索，沉淀成可追溯的需求脉络。",
    annotation: (
      <>
        <strong>纬线在哪里：</strong>
        你对每条需求的判断 ——「真痛点 / 伪需求」「值得做 / 不值得做」「优先级」——
        是 AI 学会判断的关键，不是它的训练数据里能有的。
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
        <strong>布在这里成型：</strong>
        前三个模块织进去的所有判断，到了 Weave 这里被一起调用 ——
        AI 在你的行业语料里做推理，而不是在「全网平均水平」上瞎猜。
      </>
    ),
  },
];

export default function Modules() {
  return (
    <section id="modules" className="section">
      <div className="container reveal">
        <div className="kicker">四根经线</div>
        <h2 className="section-title">把世界的信息，织进你的工作台</h2>
        <p className="section-lead">
          三个模块负责采集（经线），第四个模块负责把它们和你的判断（纬线）一起调用。
          鼠标悬停每张卡，看「纬线在哪里」。
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
          你每天本来就在看这些东西，Loom 只是让你看过的不白看、想过的不白想。
        </blockquote>
      </div>
    </section>
  );
}

/* ============================================================
 * Lucide-style inline SVG icons (no dependency).
 * Mirrors the iconography used in main Loom nav (newspaper /
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
