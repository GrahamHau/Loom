const PROBLEMS = [
  {
    num: "01",
    title: "FOMO 不是因为找不到信息",
    body: "你已经被信息淹没，缺的是一个为你筛过的、及时的推送 —— 不是再多一个搜索框。",
  },
  {
    num: "02",
    title: "竞品散落在到处都是",
    body: "飞书发给自己、淘宝收藏、链接保存、截图存相册…后期想批量调用、结构化分析 = 不可能。",
  },
  {
    num: "03",
    title: "AI 有资料，但没 skill",
    body: "它读过整个小红书，但没读过你对「这个云台为什么跟手」的判断。它缺的是经验，不是数据。",
  },
];

export default function Problem() {
  return (
    <section id="problem" className="section">
      <div className="container reveal">
        <div className="kicker">问题</div>
        <h2 className="section-title">为什么现在的 AI 不懂你的业务</h2>
        <p className="section-lead">
          不是因为模型不够大，是因为它从没读过你在这个行业里沉淀下来的那些
          —— 关于摄影配件的判断、直觉和评价。
        </p>

        <div className="problem-grid">
          {PROBLEMS.map((p) => (
            <div className="problem-card" key={p.num}>
              <div className="problem-card-num">{p.num}</div>
              <h3 className="problem-card-title">{p.title}</h3>
              <p className="problem-card-body">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
