const STEPS = [
  {
    num: "01",
    title: "模型不再是瓶颈，知识结构才是",
    body: (
      <>
        通用 LLM 已经读过全网。但全网没有
        <em>「Peak Design 的快装板为什么比阿卡标准手感好」</em>，
        也没有<em>「博主嘴里的『云台不跟手』到底是什么意思」</em>。
        参数再大也补不上这些洞 —— 它们从来没被结构化地写下来过。
      </>
    ),
  },
  {
    num: "02",
    title: "AI 缺的不是数据，是 skill",
    body: (
      <>
        哪个卡口好用、哪个痛点是真痛点、哪个价格带打得动 ——
        这些判断是工位上<em>一年年攒出来</em>的隐性知识，从没被结构化过，AI 也就调用不到。
        当前 LLM 的状态是：「读了所有资料，但从没和高手共事过。」
      </>
    ),
  },
  {
    num: "03",
    title: "让判断变成 AI 能调用的 skill",
    body: (
      <>
        LOOM 做的就是这件事：你看资讯、翻竞品、记需求时
        <em>顺手留下的每条判断</em>，都会变成 AI 在 Weave 里能直接调用的行业 skill。
        采集只是一半，另一半是你的判断 ——
        两半一起沉下来，AI 最终调用的，不是全网平均水平，而是你这一行的真实直觉。
      </>
    ),
  },
];

export default function WhyNow() {
  return (
    <section id="whynow" className="section">
      <div className="container reveal">
        <div className="kicker">为什么现在</div>
        <h2 className="section-title">这件事，现在必须做</h2>
        <p className="section-lead">
          AI 已经够强 —— 卡住它的是摆在它面前的知识结构。
          摄影配件这一行最稀缺的资产，是从业者多年攒下的判断。
          LOOM 就是把这种判断结构化的工具。
        </p>

        <ol className="whynow-steps" aria-label="Why Now 三段论">
          {STEPS.map((s) => (
            <li className="whynow-step" key={s.num}>
              <div className="whynow-step-num">{s.num}</div>
              <div>
                <h3 className="whynow-step-title">{s.title}</h3>
                <p className="whynow-step-body">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
