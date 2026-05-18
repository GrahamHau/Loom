const STEPS = [
  {
    num: "01",
    title: "信号进入",
    body: "RSS、插件、飞书 — 商品、评论、需求结构化采集。",
  },
  {
    num: "02",
    title: "结构化 + 判断",
    body: "AI 自动拆解为字段；你的每一条标注都被记录，成为行业语境。",
  },
  {
    num: "03",
    title: "关联沉淀",
    body: "竞品、需求、判断关联成证据链。MRD 中每个结论都有来源。",
  },
  {
    num: "04",
    title: "知识输出",
    body: "MRD、问答、决策 — 答不上来的问题自动回流，下次能答。",
  },
];

export default function Pipeline() {
  return (
    <section id="pipeline" className="section pipeline">
      <div className="container reveal">
        <div className="kicker">数据流转</div>
        <h2 className="headline-lg">从碎片到可追溯的判断。</h2>
        <p className="lead">
          信息不是采集后就结束 — 它经历结构化、标注、关联、沉淀，最终成为可调用的知识。
        </p>

        <ol className="pipeline-steps">
          {STEPS.map((step) => (
            <li className="pipeline-step" key={step.num}>
              <div className="pipeline-step-num">{step.num}</div>
              <div className="pipeline-step-body">
                <h3 className="pipeline-step-title">{step.title}</h3>
                <p className="pipeline-step-desc">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
