const PILLARS = [
  {
    num: "01",
    title: "越用，AI 越懂你",
    body: "它不只是在学摄影配件 —— 它在学你怎么看摄影配件。你觉得哪个卡口好、哪种材质不行、哪个价格带能打，这些判断会让 AI 的输出越来越贴合你的直觉，而不是全网平均水平。",
  },
  {
    num: "02",
    title: "你的经验，团队也能调用",
    body: "你日常使用中积累的每一条结构化认知，都可以被团队继承 —— 不是飞书文档里翻不到的会议纪要。新人入职第一天就能调用整个团队的行业直觉。",
  },
  {
    num: "03",
    title: "从单用户走向团队",
    body: "当前是你一个人的工作台 —— 先把你自己的行业直觉织进去。架构预留多用户，长期目标是整个团队共建的行业知识体系。",
  },
];

export default function Vision() {
  return (
    <section id="vision" className="section">
      <div className="container reveal">
        <div className="kicker">愿景</div>
        <h2 className="section-title">越织越密的飞轮</h2>
        <p className="section-lead">
          Loom 不是一次性工具，它是一个会随着你使用而变得更聪明的工作台 ——
          一个长期积累、可被继承的行业资产。
        </p>

        <div className="vision-flywheel" aria-label="Loom 飞轮">
          <span className="flywheel-node">采集</span>
          <span className="flywheel-arrow">→</span>
          <span className="flywheel-node">判断 / 点评</span>
          <span className="flywheel-arrow">→</span>
          <span className="flywheel-node">AI 调用</span>
          <span className="flywheel-arrow">→</span>
          <span className="flywheel-node">洞察 / 新方向</span>
          <span className="flywheel-arrow">↻</span>
          <span className="flywheel-node">反哺认知</span>
        </div>

        <div className="vision-pillars">
          {PILLARS.map((p) => (
            <div className="vision-pillar" key={p.num}>
              <div className="vision-pillar-num">{p.num}</div>
              <h3 className="vision-pillar-title">{p.title}</h3>
              <p className="vision-pillar-body">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
