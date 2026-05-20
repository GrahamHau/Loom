# Loom 参赛阶段工作单

面向 **AI 效率先锋大赛** 的实施计划。本文档定义工作流、验收标准、约束、非目标。**实施方：Codex**。如果对验收标准或约束有疑问，先回到本文档对齐，再开始写代码。

> **2026-05-20 Round 7 覆盖说明**
> 当前 Ulanzi 产研流程改为 **飞书项目 MCP first**。旧版 WS-2/WS-3 里的"飞书多维表格字段扩展、schema 识别、双向同步"不再是主线验收；它只保留给飞书项目未覆盖的补充数据源。主线应读取飞书项目 MCP 的项目空间、工作项类型、字段配置、工作项详情、评论、节点/状态流转和操作记录。
>
> **接入边界更新**：产品想法登记对应 Loom 调研工坊，是 P0/P1 主接对象；产品立项流程和项目集流程只读导入为项目列表和上下文，不做操控。具体见 [feishu-project-mcp-integration.md](./feishu-project-mcp-integration.md)。

---

## 0. 战略定位（不要偏离）

**Loom 是私有上下文层**：把外部用户声音（小红书 / 电商 / 评论）和公司内部决策上下文（需求决策、PM 私注、约束）焊接在一个 AI 可调用的库里。

- **不是**又一个 XHS 数据 SaaS（不要去和千瓜/灰豚/蝉妈妈正面拼数据量）
- **不是** PRD/MRD 写作工具（PMs 在飞书/Claude/Cursor 里写）
- **是**让通用 AI（Deepseek / Claude / 飞书 AI）一接入就变成"懂这家公司"的专属 AI

参赛主轴 pitch：**"团队级研究复利引擎"**——团队用得越多，库越值钱，单次调研边际成本越低。

---

## 1. 架构总纲（所有工作流共用）

```
┌─────────────────────┐         ┌─────────────────────┐
│  飞书项目 MCP       │ ←(写)── │  飞书 Bot/项目界面   │
│  (产研流程权威源)   │         │  (入口/回执)        │
└──────────┬──────────┘         └──────────▲──────────┘
           │ 订阅                          │
           ▼                                │
┌─────────────────────────────────────────────────────┐
│                Loom 数据层 (SQLite)                  │
│  - project_work_items (镜像)                        │
│  - project_op_records (字段/节点操作记录)           │
│  - requirements (兼容/补充镜像)                     │
│  - competitor_snapshots                             │
│  - reviews                                          │
│  - pm_annotations                                   │
│  - decisions (来自项目节点/字段变更/周进展)        │
│  - qa_history (内部问答历史)                       │
└────────────────┬──────────────────┬─────────────────┘
                 │                  │
                 ▼                  ▼
       ┌──────────────┐    ┌──────────────────┐
       │ sqlite-vec   │    │ Agent Loop       │
       │ 向量索引     │    │ (Deepseek + Tools)│
       └──────┬───────┘    └────────┬─────────┘
              │                     │
              └──────────┬──────────┘
                         ▼
            ┌──────────────────────────┐
            │  应用入口                │
            │  - Loom 网页 (调研工坊)  │
            │  - 飞书内部问答 Bot      │
            │  - MCP Server (对外)     │
            └──────────────────────────┘
```

### 全局技术约束（不可违反）

| 约束 | 选择 | 不允许 |
|---|---|---|
| 数据库 | SQLite + sqlite-vec | PostgreSQL / Pinecone / Chroma 独立部署 |
| LLM | Deepseek (V3 / V4) | 本地部署任何 LLM |
| Embedding | 三选一 (BGE-M3 / 阿里 text-embedding-v3 / 火山 doubao-embedding)，跑过测试集后定下来，**不要中途换** | 本地跑 embedding 模型 |
| Agent 框架 | 手写 agent loop（约 100 行） | LangChain / LangGraph / AutoGen / CrewAI |
| 服务器 | 4GB RAM 单机 | 假设有 GPU / 16GB+ 资源 |
| 飞书集成 | 飞书项目 MCP + 飞书开放平台官方 API | 第三方爬虫 / 浏览器自动化 |
| 产研权威源 | 飞书项目 MCP | 在 Loom 网页里复制一份可编辑的项目/需求 UI |
| 多维表格定位 | 补充源 / 兼容源 | 作为当前 Ulanzi 产研主库 |

### 全局非目标（不要做）

- ❌ 时序追踪（差评/销量趋势）——卖家精灵那种工具的活
- ❌ 对外客服 bot——只对内
- ❌ 自训练模型 / 模型微调
- ❌ 自建 web 搜索引擎（用已有的爬虫数据）
- ❌ 钉钉 / 企业微信集成——只做飞书
- ❌ 在 Loom 网页里做 PRD/MRD 写作 UI
- ❌ "决策捕捉"做成 Loom 网页独立 UI——必须借飞书既有工作流

---

## 2. 工作流分解

按依赖顺序排列。**Phase 1 是地基，未完成不要碰 Phase 2。**

### Phase 1 — 地基

#### WS-1：Agent 化基础设施

**目标**：用 Messages API + tool use 替换现有 completion 风格调用，让模型能主动调工具。

**验收标准**（全部满足才算 done）：
- [ ] 实现可复用函数 `agent_loop(system, user_msg, tools, max_iter=5)`，源码 < 150 行
- [ ] 已注册并能调用的工具至少 2 个：`search_knowledge_base(query)`、`get_record(table, record_id)`
- [ ] 端到端测试用例：输入 "找一下脚架类的活跃需求"，agent 调 `search_knowledge_base`，最终回答里引用了真实 record id
- [ ] 单元测试覆盖：tool 调用解析、错误工具名处理、max_iter 兜底、Deepseek API 错误重试
- [ ] 现有 `需求工坊` / `调研工坊` 的所有 LLM 调用点已迁移到新 loop（grep 仓库无残留 completion 调用）

**约束**：
- 不引入任何 agent 框架
- tools 是普通函数；返回 JSON-serializable
- 默认 max_iter = 5，可调；超出后 graceful return，不要抛异常
- API key 走 env var，不硬编码

**完工的样子**：跑测试用例时，控制台日志能看到 `[turn1] LLM → tool call → [turn2] tool result → [turn3] final answer` 的序列。

---

#### WS-2：飞书项目 MCP 读取层

**目标**：用飞书项目 MCP 读取真实产研流程，不要求团队迁移到 Loom 表或新增字段。P0 聚焦产品想法登记和调研工坊的映射；产品立项流程/项目集流程只读导入为项目列表和上下文。

**验收标准**：
- [ ] 实现 MCP client 封装：`initialize`、`tools/list`、`tools/call`，不把 token 写入仓库或前端日志。
- [ ] 设置页能保存 MCP URL / token / project_key，并能测试连接：返回 serverInfo、project list、work item type count。
- [ ] 读取 `search_project_info`，确认项目空间 `产研中心产品开发流程` 可访问。
- [ ] 读取 `list_workitem_types`，至少识别产品想法登记、产品立项流程、项目集流程。
- [ ] 读取产品想法登记列表，落库最少 20 条真实想法摘要，包含 work_item_id、type_key、name、status/node、owner、updated_at。
- [ ] 读取产品立项流程/项目集流程列表作为只读项目目录，不接入写操作。
- [ ] 读取 `list_workitem_field_config`，将 field_key 映射成人类可读字段名，供后续 op record 展示。

**约束**：
- 默认只读；产品立项流程/项目集流程不接写入。后续如要写，只允许从 Loom research 创建/补充产品想法登记。
- token 只存在服务端 settings/seal/env，不传给浏览器可见 bootstrap。
- 不要求 PM 改字段、不要求补录、不要求从飞书项目迁移到多维表格。

**完工的样子**：Loom 调研工坊能看到/绑定真实产品想法登记；正式立项和项目集只作为项目列表、上下文和关联关系出现。

---

#### WS-3：飞书项目镜像与决策事件归一化

**目标**：Loom 从飞书项目 MCP 镜像产品想法登记，并只读导入正式项目列表。写入边界只允许未来围绕产品想法登记设计，产品立项/项目集不操控。

**验收标准**：
- [ ] SQLite 新增或复用镜像表：`feishu_project_items`、`feishu_project_fields`、`feishu_project_nodes`、`feishu_project_idea_links`。
- [ ] 对单个产品想法登记跑通：`get_workitem_brief(fields: _all)` → `get_node_detail` → `get_transition_required`。
- [ ] 产品想法登记可导入/绑定到 Loom research，且不重复导入。
- [ ] 产品立项流程/项目集流程只读保存摘要和关系，不生成可写表单。
- [ ] 从 Loom research 提交产品想法登记时，只出现提交前必填检查：名称、想法提出人、想法概述、想法来源、想法描述、示意图、产品组别；产品leader/想法跟进人不默认要求。
- [ ] 工作台使用真实想法池生成：我的想法、待补证据、已转立项、关联项目。
- [ ] 增量同步有游标或时间窗口；失败有日志，不能静默吞掉。
- [ ] 端到端验证：
  - 选 `智能相机电池仓` 这类产品想法登记
  - Loom 展示其当前状态、角色/负责人、想法概述/描述/来源/品类
  - 调研工坊能绑定该想法并继续补外部证据
- [ ] 写一份 5 行的运维文档：怎么看同步日志、同步坏了去哪查

**约束**：
- 冲突永远以飞书项目为准。
- 不允许 Loom Web 操控产品立项流程或项目集流程。
- 产品想法登记后续写入必须先展示字段映射和创建表单必填缺口；`get_transition_required` 只用于已创建工作项的节点推进缺口，不能替代创建时必填判断。
- 想法提出人默认用当前 Loom 用户映射到的 Meego `user_key`；产品leader/想法跟进人由飞书流程后续分配，除非 create API 明确拒绝缺失。

**完工的样子**：飞书产品想法登记成为 Loom 调研工坊的真实入口；正式项目流程只作为背景上下文被引用。

---

### Phase 2 — 差异化（参赛 demo 主体）

#### WS-4：飞书 Bot + Entity Resolver

**目标**：PM 在飞书群里 @Loom 机器人 "把 X 需求暂缓 理由 Y"，bot 自动定位记录 + 写回多维表格。

**验收标准**：
- [ ] 飞书机器人 (Custom Bot or 自建应用 bot) 配置好，能在群里 / 私聊接收 @
- [ ] 实现 entity resolver：
  - 输入：`(text, sender_id, channel_id, recent_context)`
  - 输出：`{candidates: [{record_id, score}], top1_confidence}`
- [ ] 选定 embedding 模型并跑通：在 20 条人工标注的 (NL → record_id) 配对测试集上达到 **top1 准确率 ≥ 90%**（如不达标，换 embedding 重试，最多换两次，再不行回来对齐）
- [ ] 置信度路由实现：
  - `top1 score > 0.92 且 top2 < 0.65` → 自动写入 + 撤回回执
  - 否则 → 飞书消息卡片展示 top3，让 PM 点选
  - top1 < 0.5 → 提示 "没找到，要不要新建？"
- [ ] 上下文先验：sender 最近 7 天触碰的 record 权重 ×1.5
- [ ] 撤回机制：
  - 窗口 = **5 分钟**
  - 撤回方式：消息卡片"撤回"按钮 + 回复文本"撤回"
  - 撤回后 Loom 调飞书 API 还原原值
- [ ] 私聊里每次 auto-write 给 PM 留一条日志消息（含置信度 + 撤回按钮）
- [ ] 撤回时弹问"撤回原因？{选错了 / 状态错 / 不该自动写}"——存入数据库供未来调参

**约束**：
- 初始阈值就是 0.92 / 0.65，**不要在没有数据的情况下放宽**
- LLM 只在歧义路径（多候选不好选 / 解析理由）调用——简单 entity match 不调 LLM
- 阈值、撤回窗口、上下文权重都做成 config 文件，方便后期调
- 写入飞书前必须验证 sender 有权限（不是任何人 @ 都能改）

**完工的样子**：在测试集 ≥ 90% 命中，PM 实战 @ 一次 → bot 写入并发回执 → PM 验证正确（或撤回）。

---

#### WS-5：内部问答 Bot + 自学习回路

**目标**：销售 / 客服在飞书内部群里问产品问题，bot 综合内外信息回答；答不出转 PM；PM 答完入库；下次直接答。

**验收标准**：
- [ ] Loom 数据库新建 `qa_history` 表：`{question, answer, sources, asker_id, status, assigned_pm, created_at, answered_at, embedding_id}`
- [ ] 飞书内部群部署问答 bot
- [ ] 向量索引覆盖：产品规格 + 现有 PRD/MRD chunk + PM 私注 + 已答历史 Q&A
- [ ] 实现 hybrid retrieval：
  - 先尝试结构化 SQL 查询（按产品 ID / 名称 / 规格字段精确匹配）
  - 失败 / 不精确 → 向量检索 top-k
- [ ] LLM 调用模板要求结构化输出 `{confidence: "high"|"low", answer, sources}`
- [ ] `confidence == low` 路径：
  - 给提问者回复 "暂不知道，已转 PM @某某"
  - 推送一条记录到飞书 "待 PM 解答" 多维表格（含问题、提问人、时间、AI 猜测责任 PM）
  - @ 责任 PM
- [ ] PM 在 "待 PM 解答" 表里填答 → 触发自动化：
  - 新答案 chunk → embed → 入向量库
  - bot 主动找原提问者发 "你之前问的 X，答案有了"
- [ ] 测试场景：10 个真实/拟真销售-客服问题，要求：
  - ≥ 5 个直接答出且引用正确
  - 答不出的全部转 PM 成功
  - PM 答了 1 个之后，重新问同样问题能直接答出

**约束**：
- 不追求 100% 答对，**路由率比答对率重要**——拒答比胡答好
- 答案必须带 source 引用，方便提问者核验
- 不做对外（向消费者）客服
- "待 PM 解答" 表是飞书原生表，不要再造一份 Loom 内部表

**完工的样子**：销售群里能跑通"问 → 答 / 路由 → 学习 → 再问就会"的完整闭环。

---

### Phase 3 — 范围扩展

#### WS-6：一键导出研究档案 + 推荐 Skill 库

**目标**：调研工坊里点一下，PM 拿到完整 zip，在飞书 / Claude / Cursor 里继续写 MRD/PRD。

**验收标准**：
- [ ] 调研工坊每个调研任务卡片有 "导出研究档案" 按钮
- [ ] 导出 zip 内容：
  - `summary.md`（AI 生成，含关键洞察、痛点 top5、竞品对比要点）
  - `competitors.csv`
  - `demands.csv`
  - `reviews.csv`
  - `assets/`（图表 PNG，可选）
  - `README.md`（指引 + 推荐 skill 列表）
- [ ] 推荐 skill 库静态页：选 **3 个**（不是 20 个）已验证可用的外部 skill：
  - 每个含：用途一句话 / 安装命令一行 / 配合 Loom 数据包的使用提示一段
- [ ] 真实验证：PM 实战，用导出包 + 推荐 skill 在 30 分钟内产出可用的 MRD 草稿（不要求完美，要求"省了多少时间"可量化）

**约束**：
- 不在 Loom 网页里做"在线写 MRD/PRD"
- 推荐 skill 必须自己装过试过——不要罗列没用过的

**完工的样子**：导出 zip 拖出去能用；至少 1 名 PM 报告"这比从零写省了 X 小时"。

---

#### WS-7：Loom MCP Server

**目标**：把 Loom 数据暴露成 MCP 工具，PM 在任何 MCP 客户端（Claude Code / Cursor / 未来的飞书 AI）里调用。

**验收标准**：
- [ ] MCP server 实现，至少暴露 6 个工具：
  - `loom.search_research(query)` — 跨调研任务搜索
  - `loom.get_competitor_snapshot(id)` — 单竞品完整快照
  - `loom.list_demands(category, status_filter?)` — 按品类列需求
  - `loom.search_user_voices(query)` — 评论原话检索
  - `loom.get_team_annotations(target_type, target_id)` — PM 私注
  - `loom.find_related_research(topic)` — 同主题历史调研
- [ ] 鉴权：公司账户 token，过期可吊销
- [ ] 安装文档：5 分钟内能在 Claude Code 里配置好（json 模板 + 一段说明）
- [ ] 实战验证：至少 1 名 PM 在自己的 Claude Code / Cursor 里成功跑一次端到端流程，从 @loom 调用到拿到结果 < 1 分钟

**约束**：
- **只读**——MCP 不允许写入。写入仍走飞书 bot / 飞书表
- 鉴权按公司账户隔离，token 不在仓库里
- 不要做"通用 MCP 标准之外"的扩展

**完工的样子**：PM 在 Claude Code 里 @loom，能拿到自己公司的研究数据。

---

## 3. 参赛 demo 的最小可演示集合

**必须完成**（达到这一档才有完整 demo 故事）：WS-1, 2, 3, 4, 5
**强烈建议**：WS-6
**加分项**：WS-7

### Demo 脚本（按这个故事打磨）

1. **场景一：决策的自动捕捉**
   PM 在飞书产品讨论群里说 "@Loom 把'XX款脚架快拆结构升级'暂缓，理由是供应商成本超预算"
   → Bot 自动定位记录 → 写回多维表格 → 私聊回执 → 可一键撤回

2. **场景二：决策的回流复用（"内外打通"的核心场景）**
   两周后，销售在另一个群里问 "我们为什么没做带金属快拆的脚架？"
   → 内部问答 bot 同时拉出 ① 用户在小红书的相关呼声（外部）② PM 当时写的"供应商成本"暂缓理由（内部）
   → 综合回答 + 引用两边

3. **场景三：研究复利**
   新需求来了，PM 一键导出调研档案 + 推荐 skill → 在飞书里 30 分钟产出 MRD 草稿
   → 团队累积的所有竞品、评论、过往决策都在档案里

4. **场景四（如果做了 WS-7）：MCP 接入演示**
   PM 在 Claude Code 里 `@loom 找一下脚架类的活跃需求`
   → 通用 AI 即刻拥有公司专属上下文

### 一句话总结（评委版）

> "我们没有去和数据 SaaS 拼采集量。我们在做的是**一层私有上下文**——把外部用户声音和团队内部决策焊在一起，让任何通用 AI 一接入就立刻变成懂我们公司的专属 AI。SaaS 卖给所有人的是商品，团队累积的内部上下文是只有我们有的资产。"

---

## 4. 进度与同步

- 每个 WS 开工前，Codex 应在本文档的对应章节顶部加 `Status: in_progress (date)` 标记
- 完工后改成 `Status: done (date) — 见 commit XXX`
- 如果在执行中发现验收标准不可达 / 约束需要调整，**先在文档里写一段 "discussion" 提议，等用户确认再改**——不要私自降标准

---

*文档版本：v1 (2026-05-19)*
*下次更新触发：WS 完成 / 验收标准变更 / 战略调整*
