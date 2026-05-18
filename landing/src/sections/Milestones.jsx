const GROUPS = [
  {
    status: "已上线",
    accent: "live",
    items: ["资讯流", "竞品库", "需求雷达", "调研工坊", "浏览器插件"],
  },
  {
    status: "建设中",
    accent: "build",
    items: ["资料库", "智能问答", "MRD Studio", "PRD Builder"],
  },
  {
    status: "计划中",
    accent: "plan",
    items: ["飞书 Bot 问答", "知识图谱", "飞书多维表格镜像"],
  },
];

export default function Milestones() {
  return (
    <section id="milestones" className="section milestones">
      <div className="container reveal">
        <div className="kicker">进度</div>
        <h2 className="headline-lg">已经可用，持续迭代。</h2>

        <div className="status-grid">
          {GROUPS.map((g) => (
            <div className={`status-group status-${g.accent}`} key={g.status}>
              <div className="status-group-header">
                <span className="status-group-dot" aria-hidden="true" />
                <span className="status-group-label">{g.status}</span>
              </div>
              <ul className="status-list">
                {g.items.map((item) => (
                  <li key={item} className="status-item">{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
