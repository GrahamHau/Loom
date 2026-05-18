const STAGES = [
  {
    letter: "L",
    word: "Link",
    title: "连接信息源",
    lede: "浏览器插件一键采集 — 商品、评论、需求结构化入库。",
    sub: "资讯流 · 竞品库 · 需求雷达",
    detail: "Amazon · 淘宝 · 小红书 · Kickstarter · YouTube · RSS",
  },
  {
    letter: "O",
    word: "Observe",
    title: "标注你的判断",
    lede: "每一条判断都被记录 — 下次调研 AI 在你的语境里推理。",
    sub: "调研工坊",
    detail: "「快装板卡口比 Arca 更紧凑，这个价格带有机会。」",
  },
  {
    letter: "O",
    word: "Organize",
    title: "结构化沉淀",
    lede: "调研成果沉淀为 MRD — 每个结论都可点开看来源。",
    sub: "市场分析 · 产品定义 · 飞书同步",
    detail: "竞品 12 · 需求 28 · 行业 3 — 证据链完整",
  },
  {
    letter: "M",
    word: "Make",
    title: "让知识被调用",
    lede: "搜索、对话、决策 — 3 秒返回带证据的回答。",
    sub: "资料库 · 智能问答",
    detail: "Q. 这款灯和大疆同款有什么差异？",
  },
];

export default function Modules() {
  return (
    <section id="modules" className="section modules">
      <div className="container reveal">
        <div className="kicker">L · O · O · M</div>
        <h2 className="headline-lg">四个字母，一个闭环。</h2>
        <p className="lead">
          从连接散落的信息，到输出可调用的知识。
        </p>

        <div className="stages-grid">
          {STAGES.map((s, i) => (
            <div className="stage-col" key={s.letter + s.word}>
              <div className="stage-col-letter">{s.letter}</div>
              <div className="stage-col-word">{s.word}</div>
              <h3 className="stage-col-title">{s.title}</h3>
              <p className="stage-col-lede">{s.lede}</p>
              <div className="stage-col-sub">{s.sub}</div>
              <div className="stage-col-detail">{s.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
