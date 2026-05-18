const PIPELINE = [
  {
    label: "步骤 01 · 课题",
    title: "设定研究方向",
    body: "例如「适合背包的相机快装方案」— 一句话锁定问题空间。",
  },
  {
    label: "步骤 02 · 关联",
    title: "拉入竞品 + 需求数据",
    body: "竞品库的产品 × 需求雷达的真实用户痛点和需求信号。",
  },
  {
    label: "步骤 03 · 融合",
    title: "AI 融合结构化数据 + 你的标注",
    body: "采集模块中你的每一条判断和标注在这里被调用。",
  },
];

const CHIPS = [
  "快装板",
  "腰夹",
  "肩带",
  "单手操作",
  "Arca-Swiss",
  "徒步",
  "竖拍",
];

export default function Weave() {
  return (
    <section id="weave" className="section weave">
      <div className="container reveal">
        <div className="kicker">调研工坊</div>
        <h2 className="headline-lg">不是采集 — 是融合</h2>
        <p className="lead">
          调研工坊是飞轮的核心。来自其他模块的信息和判断
          在这里交叉、关联、重新组合。
        </p>

        <div className="weave-pipeline">
          {PIPELINE.map((step) => (
            <div className="pipeline-step" key={step.label}>
              <div className="pipeline-step-label">{step.label}</div>
              <h3 className="pipeline-step-title">{step.title}</h3>
              <p className="pipeline-step-body">{step.body}</p>
            </div>
          ))}

          <div className="pipeline-fork">
            <div className="pipeline-step">
              <div className="pipeline-step-label">产出 A · 洞察</div>
              <h3 className="pipeline-step-title">结构化产品分析</h3>
              <p className="pipeline-step-body">
                定位、卖点、价格带、差异化 — 每个结论都可追溯到你的采集判断。
              </p>
            </div>
            <div className="pipeline-step">
              <div className="pipeline-step-label">产出 B · 方向</div>
              <h3 className="pipeline-step-title">跨维度重组</h3>
              <p className="pipeline-step-body">
                AI 穷举现有元素的交叉组合，突破经验偏见，发现意料之外的新方向。
              </p>
            </div>
          </div>
        </div>

        <div className="brainstorm">
          <div className="brainstorm-label">元素重组演示</div>
          <div className="brainstorm-chips">
            {CHIPS.map((c, i) => (
              <span key={c} className="brainstorm-chip">
                {c}
                {i < CHIPS.length - 1 && (
                  <span className="brainstorm-op"> ×</span>
                )}
              </span>
            ))}
            <span className="brainstorm-op"> =</span>
            <span className="brainstorm-chip" style={{ borderStyle: "dashed" }}>
              ?
            </span>
          </div>
          <div className="brainstorm-result">
            Peak Design 的 Capture Clip 就是从这种重组中诞生的 —
            快装 × 腰夹 × 肩带 × 单手操作。
            AI 可以每天为你运行这些排列组合。
          </div>
        </div>

        <blockquote className="weave-quote">
          AI 和人类的关键区别：它没有经验偏见。
          你会被困在「快装板是给三脚架用的」这个思维里。它不会。
        </blockquote>
      </div>
    </section>
  );
}
