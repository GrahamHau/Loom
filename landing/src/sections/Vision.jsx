const SCENES = [
  {
    num: "01",
    title: "证据链",
    body: "每一个 MRD 判断，都能点开看来源：3 条竞品数据 + 2 条用户需求 + 1 条行业报告。没有来源的部分，标为「待确认」。",
  },
  {
    num: "02",
    title: "飞书问答",
    body: "飞书群里 @LOOM：「客户问续航怎么回答？」3 秒返回：可对外口径 + 测试数据来源。答不上来的问题自动回流，补完后下次能答。",
  },
  {
    num: "03",
    title: "知识继承",
    body: "新同事搜「三脚架品类竞争格局」。得到的不是一篇过期文档，而是基于团队过去一年判断的结构化知识，每条都有来源和时间。",
  },
];

export default function Vision() {
  return (
    <section id="vision" className="section vision tile-dark">
      <div className="container reveal">
        <div className="kicker">愿景</div>
        <h2 className="headline-lg">不只是工具 —<br />是可继承的知识网络。</h2>
        <p className="lead">
          当 LOOM 的飞轮转起来，每一条判断都在编织一个越来越密的网。
        </p>

        <div className="vision-scenes">
          {SCENES.map((s) => (
            <div className="vision-scene" key={s.num}>
              <div className="vision-scene-num">{s.num}</div>
              <h3 className="vision-scene-title">{s.title}</h3>
              <p className="vision-scene-body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
