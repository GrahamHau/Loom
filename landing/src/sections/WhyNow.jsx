const STEPS = [
  {
    num: "01",
    title: "模型不再是瓶颈，知识结构才是",
    body: (
      <>
        通用 LLM 已经读过全网，但通用语料里没有
        <em>「Peak Design 的快装板为什么比阿卡标准手感好」</em>、
        <em>「Peak Design 的快装板为什么手感比阿卡标准好」</em>、
        <em>「小红书摄影博主抱怨的『云台不跟手』到底是什么意思」</em>。
        参数再大也补不上这些洞 —— 因为它们从未被结构化地写下来过。
      </>
    ),
  },
  {
    num: "02",
    title: "AI 缺的不是数据，是 skill",
    body: (
      <>
        摄影行业的判断 —— 哪个卡口好、哪个用户痛点真、哪种价格带能打 ——
        是在工位上 <em>一年一年攒出来</em> 的隐性知识。
        它从来没被结构化过，所以 AI 也从来调用不到。
        当前 LLM 的处境是「读过资料，但没和高手共事过」。
      </>
    ),
  },
  {
    num: "03",
    title: "把判断织进信息，才有 AI 能用的行业布",
    body: (
      <>
        这就是 LOOM 在做的事：让你每天处理资讯、看竞品、记需求时
        <em>顺手留下的判断和点评</em>，都变成 AI 在 Weave 里能调用的「行业纬线」。
        采集是经，判断是纬，越织越密 ——
        最终 AI 调用的不是全网平均水平，而是你这一行的真实直觉。
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
          AI 已经够强，限制它的是放在它面前的知识结构。
          摄影配件这一行最稀缺的资产，是从业者多年沉淀的判断 ——
          而 LOOM 是把这种判断结构化的工具。
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

        <blockquote className="whynow-quote">
          <p className="whynow-quote-en">
            "Specific knowledge is knowledge you cannot be trained for.
            If society can train you, it can train someone else, and replace you."
          </p>
          <p className="whynow-quote-zh">
            「Specific knowledge（专属知识）是无法被培训出来的。
            如果社会能培训你，就能培训别人来替代你。」
          </p>
          <cite className="whynow-quote-cite">— Naval Ravikant（纳瓦尔·拉维坎特）</cite>
          <p className="whynow-quote-gloss">
            你对这个行业的判断就是这种 specific knowledge。AI
            读过全网，但它从没跟高手共事过。LOOM 让你把这种知识织进去。
          </p>
        </blockquote>
      </div>
    </section>
  );
}
