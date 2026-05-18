const SCENES = [
  {
    num: "01",
    label: "周一早上",
    body: "亚马逊上出了一款竞品云台，想做对比分析。价格在淘宝收藏夹里，评测在 YouTube 书签里，上次的判断在飞书群消息里。花了半天找齐，又花半天整理成表格。",
  },
  {
    num: "02",
    label: "季度评审",
    body: "「这个品类最近用户在抱怨什么？」答案你知道 — 但证据散落在小红书截图、客服反馈和上个月的会议纪要里。无法在 10 分钟内给出有出处的回答。",
  },
  {
    num: "03",
    label: "新人入职",
    body: "新同事问：「我们为什么选了这个方案？」决策依据在某个人的脑子里，那个飞书文档早就沉底了。隐性知识，从来没被结构化地留下来过。",
  },
];

export default function Problem() {
  return (
    <section id="problem" className="section problem">
      <div className="container reveal">
        <div className="kicker">为什么需要 LOOM</div>
        <h2 className="headline-lg">这些场景，你一定不陌生。</h2>
        <p className="lead">
          知识不是没有 — 是散在各处，每次都要重新找。
        </p>

        <div className="problem-grid">
          {SCENES.map((s) => (
            <div className="problem-card" key={s.num}>
              <div className="problem-card-num">{s.num}</div>
              <div className="problem-card-label">{s.label}</div>
              <p className="problem-card-body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
