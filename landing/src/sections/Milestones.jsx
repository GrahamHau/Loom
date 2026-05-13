const MODULES = [
  {
    name: "Stream · 资讯流",
    items: [
      "已接入 DPReview、PetaPixel、SmallRig 等摄影行业源，AI 自动翻译筛选",
      "支持自定义添加 RSS 源",
    ],
  },
  {
    name: "Lens · 竞品库",
    items: [
      "浏览器插件一键采集亚马逊、淘宝等平台的竞品信息",
      "结构化字段：创新类型、用户场景、用户痛点、卖点",
    ],
  },
  {
    name: "Spark · 灵感库",
    items: [
      "支持小红书、B 站、Reddit、Kickstarter 等跨平台需求采集",
    ],
  },
];

const EXPORT = [
  { label: "即将推出", items: ["CSV 导出", "飞书表格导出"] },
  { label: "敬请期待", items: ["Billfish 导入", "Eagle 导入"] },
];

export default function Milestones() {
  return (
    <section id="milestones" className="section">
      <div className="container reveal">
        <div className="kicker">当前进展</div>
        <h2 className="section-title">已经能用，持续在建</h2>

        <div className="milestones-grid">
          {MODULES.map((m) => (
            <div className="milestone-card" key={m.name}>
              <h3 className="milestone-card-name">{m.name}</h3>
              <ul className="milestone-card-list">
                {m.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="milestones-export">
          <h3 className="milestones-export-title">数据导出</h3>
          <div className="milestones-export-row">
            {EXPORT.map((e) => (
              <div className="milestones-export-group" key={e.label}>
                <span className="milestones-export-label">{e.label}</span>
                <span className="milestones-export-items">
                  {e.items.join("、")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
