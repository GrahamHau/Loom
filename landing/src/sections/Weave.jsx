const PIPELINE = [
  {
    label: "Step 01 · 目标",
    title: "设定调研方向",
    body: "比如：「背包场景的相机快拆方案」—— 一句话锁定问题域。",
  },
  {
    label: "Step 02 · 关联",
    title: "拉入竞品库 + 灵感库数据",
    body: "SmallRig、Ulanzi、Peak Design 的同类品 × 小红书、B 站、Reddit 上的真实抱怨与需求线索。",
  },
  {
    label: "Step 03 · 融合",
    title: "AI 融合结构化数据 + 你的注解",
    body: "前三个模块里你留下的每一条判断、写过的每一行点评，在这一步全部被调用。",
  },
];

const CHIPS = [
  "快装板",
  "腰夹",
  "背包肩带",
  "单手操作",
  "阿卡标准",
  "户外徒步",
  "竖拍需求",
];

export default function Weave() {
  return (
    <section id="weave" className="section">
      <div className="container reveal">
        <div className="kicker">调研工坊</div>
        <h2 className="section-title">不是收集，是组合</h2>
        <p className="section-lead">
          Weave 是飞轮的中心。前三个模块沉下来的信息和判断，
          在这里被关联、交叉、重组 —— 一头是结构化的产品洞察，一头是你想不到的新方向。
        </p>

        <div className="weave-pipeline">
          {PIPELINE.map((step) => (
            <div className="pipeline-step" key={step.label}>
              <div className="pipeline-step-label">{step.label}</div>
              <h3 className="pipeline-step-title">{step.title}</h3>
              <p className="pipeline-step-body">{step.body}</p>
            </div>
          ))}

          <div className="pipeline-fork" aria-label="AI 输出双叉">
            <div className="pipeline-step">
              <div className="pipeline-step-label">输出 A · 洞察</div>
              <h3 className="pipeline-step-title">结构化的产品分析</h3>
              <p className="pipeline-step-body">
                定位、卖点、价格带、差异点 —— 每个论断都能追溯回你在 Lens / Spark
                里留下的判断。边看边整理的内容，到这里直接成型 ——
                省掉了传统 MRD 里最费时间的信息梳理。
              </p>
            </div>
            <div className="pipeline-step">
              <div className="pipeline-step-label">输出 B · 新方向</div>
              <h3 className="pipeline-step-title">跨维度交叉组合</h3>
              <p className="pipeline-step-body">
                AI 把已有元素交叉穷举，抛开经验惯性，给你想不到的新方向。
              </p>
            </div>
          </div>
        </div>

        <div className="brainstorm" aria-label="排列组合演示">
          <div className="brainstorm-label">元素交叉组合演示</div>
          <div className="brainstorm-chips">
            {CHIPS.map((c, i) => (
              <span key={c} className="brainstorm-chip">
                {c}
                {i < CHIPS.length - 1 && (
                  <span className="brainstorm-op" aria-hidden="true">
                    {" "}
                    ×
                  </span>
                )}
              </span>
            ))}
            <span className="brainstorm-op" aria-hidden="true">
              =
            </span>
            <span className="brainstorm-chip" style={{ borderStyle: "dashed" }}>
              ?
            </span>
          </div>
          <div className="brainstorm-result">
            Peak Design 的 Capture Clip 就是这么来的 —— 快装板 × 腰夹 × 背包肩带 ×
            单手操作。AI 可以每天帮你穷举这种组合。
          </div>
        </div>

        <blockquote className="weave-quote">
          AI 跟人不同的一点：它能抛开经验惯性。
          你会被「快装板就是装三脚架的」框死；它不会。
        </blockquote>
      </div>
    </section>
  );
}
