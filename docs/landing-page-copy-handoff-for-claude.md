# LOOM Landing Page Copy Handoff For Claude

## Purpose

This document extracts the current landing page copy and page structure from the live Loom landing implementation.

Goal for Claude:

- polish the language
- improve rhythm, clarity, and persuasion
- keep the product meaning intact
- preserve the current information architecture unless there is a very strong copy reason to merge or trim

This is a copy handoff, not a product rewrite.

## Product framing

LOOM is a single-user product intelligence workspace for the photography accessories industry.

Core idea:

- users already read industry news, browse competitors, and collect user demand signals every day
- the missing layer is not more information, but a way to preserve judgment
- LOOM turns repeated professional judgment into structured context that AI can call later

Working metaphor:

- information gathering is the warp
- human judgment is the weft
- LOOM "weaves" the two together so AI can reason inside industry-specific context instead of generic internet averages

## Audience

Primary audience:

- product people in photography / creator gear / camera accessory contexts
- people who already track competitors, trends, and user signals manually
- people who are curious about AI, but frustrated that generic AI does not actually understand their business

## Tone guidance

Keep:

- sharp, product-literate, not fluffy
- confident, but not startup-bro
- industry-aware
- metaphor-driven, but still readable
- Chinese copy with selective English module naming where already established

Avoid:

- generic AI marketing language
- exaggerated claims
- abstract SaaS copy that could apply to any tool
- overlong sentences that bury the point
- too many repeated uses of "行业直觉" if a tighter phrasing can carry the meaning

## Non-negotiables

- keep the Loom name and the four modules: Stream, Lens, Spark, Weave
- keep Loom positioned as a single-user workbench first, not a team platform today
- keep the central value proposition: AI becomes useful when it can use your real judgment, not just public data
- keep the photography-accessories context visible throughout
- keep the "weaving" metaphor, but Claude can make it less repetitive if needed

## Page structure

The current landing page is organized like this:

1. Hero
2. Problem
3. Modules
4. Why Now
5. Weave
6. Vision
7. Milestones / Current progress
8. Final CTA
9. Embedded login card

Claude should preserve this overall narrative arc unless there is a very compelling copy-only simplification.

## Section-by-section source copy

### 1. Hero

#### Brand line

`LOOM`

`Link · Observe · Organize · Make`

#### Headline

`给 AI 织一份`

`你的行业直觉`

#### Subcopy

`每天看资讯、翻竞品、记需求 —— 你本来就在做这些事。LOOM 让你做的每一个判断都不白做：它们会沉淀下来，让 AI 越来越懂你这一行。`

#### CTA

`看看它怎么工作`

#### Marquee

- `Stream · 资讯流`
- `Lens · 竞品库`
- `Spark · 灵感库`
- `Weave · 调研工坊`

#### What Claude should do here

- tighten the hero so it lands faster
- preserve the "you already do this work" insight
- make the subcopy feel more inevitable and less explanatory
- if the headline can get sharper without losing the weaving metaphor, do it

### 2. Problem

#### Section title

`为什么现在的 AI 不懂你的业务`

#### Lead

`不是因为模型不够大，是因为它从没读过你在这个行业里沉淀下来的那些 —— 关于摄影配件的判断、直觉和评价。`

#### Card 1

Title:

`FOMO 不是因为找不到信息`

Body:

`你已经被信息淹没，缺的是一个为你筛过的、及时的推送 —— 不是再多一个搜索框。`

#### Card 2

Title:

`竞品散落在到处都是`

Body:

`飞书发给自己、淘宝收藏、链接保存、截图存相册…后期想批量调用、结构化分析 = 不可能。`

#### Card 3

Title:

`AI 有资料，但没 skill`

Body:

`它读过整个小红书，但没读过你对「这个云台为什么跟手」的判断。它缺的是经验，不是数据。`

#### What Claude should do here

- make each problem line cleaner and more parallel
- keep it concrete, not conceptual
- "AI 有资料，但没 skill" is a strong line; keep that spirit

### 3. Modules

#### Section title

`把世界的信息，织进你的工作台`

#### Lead

`三个模块负责采集（经线），第四个模块负责把它们和你的判断（纬线）一起调用。鼠标悬停每张卡，看「纬线在哪里」。`

#### Stream

Lede:

`治 FOMO 靠的是及时性，不是搜索。`

Body:

`RSS + 公众号 + 摄影行业定向源（DPReview、PetaPixel、SmallRig blog、Peak Design 更新、小红书摄影博主 RSS 等），AI 翻译筛选后推到你眼前。`

Annotation:

`纬线在哪里：你顺手标记的「相关 / 不相关」、「值得追」、「拿去看竞品」，每一次判断都在帮 AI 学你的口味。`

#### Lens

Lede:

`边看竞品，边完成信息整理 —— 不用事后再翻收藏夹。`

Body:

`浏览亚马逊 / 淘宝看 SmallRig、Ulanzi、Peak Design 时，用 LOOM 浏览器插件一键采集图片、卖点、价格、规格、标签 —— 落到统一的结构化卡片。`

Annotation:

`纬线在哪里：你写下的「这个卡口为什么好」「这个材质手感不行」—— 这些注解才是 AI 缺的 skill，是通用语料里找不到的隐性知识。`

#### Spark

Lede:

`跨平台需求 + 你的判断 = 补齐 AI 的 skill 层。`

Body:

`小红书摄影博主吐槽 / B 站测评 / Reddit r/photography / Kickstarter 摄影配件众筹的线索，沉淀成可追溯的需求脉络。`

Annotation:

`纬线在哪里：你对每条需求的判断 ——「真痛点 / 伪需求」「值得做 / 不值得做」「优先级」—— 是 AI 学会判断的关键，不是它的训练数据里能有的。`

#### Weave

Lede:

`把采集和判断关联起来，变成可执行的洞察。`

Body:

`设定调研目标（如「背包场景的相机快拆方案」），关联 Lens 的竞品 + Spark 的需求，AI 输出结构化的产品分析，并基于已有元素做交叉组合给你意想不到的方向。`

Annotation:

`布在这里成型：前三个模块织进去的所有判断，到了 Weave 这里被一起调用 —— AI 在你的行业语料里做推理，而不是在「全网平均水平」上瞎猜。`

#### Closing quote

`你每天本来就在看这些东西，LOOM 只是让你看过的不白看、想过的不白想。`

#### What Claude should do here

- keep the four-module logic very clear
- reduce repetition across the four annotation blocks if possible
- keep Stream / Lens / Spark / Weave distinct
- keep the photography examples concrete

### 4. Why Now

#### Section title

`这件事，现在必须做`

#### Lead

`AI 已经够强，限制它的是放在它面前的知识结构。摄影配件这一行最稀缺的资产，是从业者多年沉淀的判断 —— 而 LOOM 是把这种判断结构化的工具。`

#### Step 1

Title:

`模型不再是瓶颈，知识结构才是`

Body:

`通用 LLM 已经读过全网，但通用语料里没有「Peak Design 的快装板为什么比阿卡标准手感好」、「小红书摄影博主抱怨的『云台不跟手』到底是什么意思」。参数再大也补不上这些洞 —— 因为它们从未被结构化地写下来过。`

#### Step 2

Title:

`AI 缺的不是数据，是 skill`

Body:

`摄影行业的判断 —— 哪个卡口好、哪个用户痛点真、哪种价格带能打 —— 是在工位上一年一年攒出来的隐性知识。它从来没被结构化过，所以 AI 也从来调用不到。当前 LLM 的处境是「读过资料，但没和高手共事过」。`

#### Step 3

Title:

`把判断织进信息，才有 AI 能用的行业布`

Body:

`这就是 LOOM 在做的事：让你每天处理资讯、看竞品、记需求时顺手留下的判断和点评，都变成 AI 在 Weave 里能调用的「行业纬线」。采集是经，判断是纬，越织越密 —— 最终 AI 调用的不是全网平均水平，而是你这一行的真实直觉。`

#### What Claude should do here

- this section carries the thesis, so sharpen logic first
- make the progression feel like an argument, not three similar blocks
- remove duplicate examples if needed

### 5. Weave section

#### Section title

`不是收集，是织造`

#### Lead

`Weave 是 LOOM 的飞轮中心。前三个模块沉淀的信息和判断，在这里被关联、交叉、重组 —— 变成结构化的产品洞察和意想不到的新方向。`

#### Pipeline

Step 01:

`设定调研方向`

`比如：「背包场景的相机快拆方案」—— 一句话锁定问题域。`

Step 02:

`拉入竞品库 + 灵感库数据`

`SmallRig、Ulanzi、Peak Design 的同类品 × 小红书、B 站、Reddit 上的真实抱怨与需求线索。`

Step 03:

`AI 融合结构化数据 + 你的注解`

`前三个模块里你留下的每一条判断、写过的每一行点评，在这一步全部被调用。`

Output A:

`结构化的产品分析`

`定位、卖点、价格带、差异点 —— 每个论断都能追溯回竞品库 / 灵感库里你留下的判断。你在前面边看边整理的内容，到这里直接变成结构化分析 —— 省掉了传统 MRD 里最费时间的信息梳理环节。`

Output B:

`跨维度交叉组合`

`AI 把已有元素交叉组合，给你抛开经验惯性的新方向。`

#### Combination demo

Tokens:

- `快装板`
- `腰夹`
- `背包肩带`
- `单手操作`
- `阿卡标准`
- `户外徒步`
- `竖拍需求`

Result copy:

`Peak Design 的 Capture Clip 就是这么来的 —— 快装板 × 腰夹 × 背包肩带 × 单手操作 = 一个前所未有的相机携带方式。AI 可以每天帮你做这种穷举。`

#### Quote

`AI 跟人不同的一点是 —— 它能抛开经验惯性。你会被「快装板就是装三脚架的」框死；它不会。`

#### What Claude should do here

- make this section feel more exciting and generative
- preserve the "structured insight + new direction" dual output
- make the examples crisp, not academic

### 6. Vision

#### Section title

`越织越密的飞轮`

#### Lead

`LOOM 不是一次性工具，它是一个会随着你使用而变得更聪明的工作台 —— 一个长期积累、可被继承的行业资产。`

#### Flywheel nodes

- `采集`
- `判断 / 点评`
- `AI 调用`
- `洞察 / 新方向`
- `反哺认知`

#### Pillar 1

`越用，AI 越懂你`

`它不只是在学摄影配件 —— 它在学你怎么看摄影配件。你觉得哪个卡口好、哪种材质不行、哪个价格带能打，这些判断会让 AI 的输出越来越贴合你的直觉，而不是全网平均水平。`

#### Pillar 2

`你的经验，团队也能调用`

`你日常使用中积累的每一条结构化认知，都可以被团队继承 —— 不是飞书文档里翻不到的会议纪要。新人入职第一天就能调用整个团队的行业直觉。`

#### Pillar 3

`从单用户走向团队`

`当前是你一个人的工作台 —— 先把你自己的行业直觉织进去。架构预留多用户，长期目标是整个团队共建的行业知识体系。`

#### What Claude should do here

- keep the current single-user-first reality
- make the long-term vision feel credible, not inflated
- reduce any overexplaining

### 7. Milestones / current progress

#### Section title

`已经能用，持续在建`

#### Stream

- `已接入 DPReview、PetaPixel、SmallRig 等摄影行业源，AI 自动翻译筛选`
- `支持自定义添加 RSS 源`

#### Lens

- `浏览器插件一键采集亚马逊、淘宝等平台的竞品信息`
- `结构化字段：创新类型、用户场景、用户痛点、卖点`

#### Spark

- `支持小红书、B 站、Reddit、Kickstarter 等跨平台需求采集`

#### Export

`即将推出：CSV 导出、飞书表格导出`

`敬请期待：Billfish 导入、Eagle 导入`

#### What Claude should do here

- this section should feel factual and lighter than the argument sections
- keep it grounded in current capability
- Claude can make it more compact if needed

### 8. Final CTA

#### Section title

`让 AI 变成一个`

`真正懂你这一行的同事。`

#### Body

`LOOM 当前是单用户个人工作台。先用一个月 —— 等四个模块都积累了你真实的判断和点评，你会发现 Weave 给出的洞察越来越像一个跟你共事了一年的同事，而不是一个只读过全网文章的通用 AI。这些认知沉淀下来，团队里的其他人也能调用。`

#### Step 1

`先看教程`

`第一次使用的话，先按教程走一遍，会更快理解 LOOM 的使用方式。`

Button:

`打开飞书教程`

#### Step 2

`下载浏览器插件`

`LOOM 通过插件在你浏览竞品、看资讯时一键采集，这是使用的第一步。`

Button:

`下载 Chrome 插件`

#### Step 3

`登录工作台`

`插件装好后，登录进入你的 LOOM 工作台。`

#### What Claude should do here

- keep the CTA practical, not lyrical
- this is where users decide whether to act, so reduce density
- make the "single-user first" framing cleaner

### 9. Embedded login card

#### Brand

`LOOM`

`Link · Observe · Organize · Make`

#### Title

`登录工作台`

#### Subtitle

`用你已经沉淀下来的判断，继续训练一个更懂业务的 LOOM。`

#### Fields / controls

- `账号`
- `密码`
- `登录 LOOM`
- `其他方式`
- `进入演示模式`

#### Helper text

`演示模式可体验示例工作区。`

#### Footer note

`LOOM v2.0 · 支持演示、账号密码与飞书登录`

#### What Claude should do here

- keep this very short
- clarity beats personality here
- make sure the login card copy still feels consistent with the rest of the page

## Suggested rewrite tasks for Claude

Claude should treat this as a copy-polish task with restraint.

Recommended tasks:

1. rewrite every section for tighter rhythm and less repetition
2. preserve the photography-industry specificity
3. make the page feel more "product sharp" and less "explaining the metaphor repeatedly"
4. keep all module names and functional meaning intact
5. keep CTA text practical and action-oriented

## What should not change

- do not rename the four modules
- do not turn Loom into a generic AI workspace
- do not remove the photography accessories context
- do not rewrite the product into a team-collaboration tool today
- do not introduce broad claims about autonomy, agents, or automation that the current product positioning does not support
- do not flatten the page into generic B2B SaaS copy

## If Claude wants to deliver output

Best output format:

1. section-by-section revised copy
2. short note on what was tightened and why
3. optional alternate hero headline options

Avoid:

- long brand essays
- marketing strategy writeups
- full PRD reframing
- layout advice unless directly tied to copy length or information hierarchy
