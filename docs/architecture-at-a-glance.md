# Loom 架构总览（一眼看懂版）

> 给人看的版本。1 分钟读完即知系统全貌。
> 想看实施细节，去 [competition-roadmap.md](./competition-roadmap.md) / [ui-architecture.md](./ui-architecture.md) / [decision-chain.md](./decision-chain.md)。
>
> **2026-05-20 Round 7 更新**：当前 Ulanzi 产研流程优先接入 **飞书项目 MCP**，而不是先做多维表格 schema 适配。飞书项目已经提供标准工作项类型、节点流、字段配置、评论和操作记录；多维表格保留为补充源/兼容源。

---

## 一句话定义

**Loom 是把"外部用户声音"和"内部团队记忆"焊在一起的私有上下文层。**

外部用户在抱怨什么 + 我们公司内部讨论过怎么办——AI 第一次能同时看到两边。

---

## 🗺️ 系统全景图

```mermaid
flowchart TB
    %% ===== 输入层 =====
    subgraph EXT [🌍 外部信号]
        direction LR
        E1[小红书帖子]
        E2[电商竞品]
        E3[用户评论]
    end

    subgraph INT [🏢 内部上下文 - 你们既有的飞书]
        direction LR
        I1[飞书项目 MCP<br/>项目/立项/预研/上市流程]
        I2[工作项节点+操作记录<br/>状态流转·字段 old/new]
        I3[项目周进展描述<br/>进度·阻塞·原因·下一步]
        I4[飞书评论/附件/关联项<br/>补充语境]
    end

    %% ===== 核心 =====
    subgraph LOOM [🧠 Loom 融合层 - 私有上下文]
        direction LR
        DB[(SQLite + 向量库)]
        AI[AI Parser + Agent<br/>Deepseek]
        DB <-.-> AI
    end

    %% ===== 输出层 =====
    subgraph OUT [📤 给团队的产出]
        direction TB
        O1[📊 周一汇报 summary<br/>30 秒拿去汇报]
        O2[⚠️ 异常监测<br/>卡 3 周/没更新 自动提示]
        O3[💬 销售反向追问<br/>内外综合答]
        O4[📦 一键研究档案<br/>导出给飞书/Claude/Cursor]
        O5[🔌 MCP Server<br/>对外 AI 工具调用]
        O6[🖥️ Loom 网页<br/>调研工坊/竞品库/需求库]
    end

    EXT ==> LOOM
    INT ==> LOOM
    LOOM ==> OUT

    style EXT fill:#fff4e6,stroke:#f59e0b,stroke-width:2px
    style INT fill:#e6f4ff,stroke:#3b82f6,stroke-width:2px
    style LOOM fill:#fef3c7,stroke:#d97706,stroke-width:3px
    style OUT fill:#d4f4dd,stroke:#10b981,stroke-width:2px
```

**读图方法（3 个色块的含义）：**

| 🟧 橙色 | 🟦 蓝色 | 🟨 黄色 | 🟩 绿色 |
|---|---|---|---|
| 外部世界给你的信号 | 你们公司内部已有的工作流 | Loom 做的事（独有价值） | 团队真正消费的产物 |

**关键观察**：橙 + 蓝 是输入，黄是 Loom 自己的位置（融合层），绿是输出。**Loom 不替代任何左边的东西，只把左边焊在一起再衍生右边**。

---

## 💎 两个最关键的"价值时刻"

讲故事比讲架构有说服力。Loom 的价值集中在这两个时刻：

### 时刻 1：每周五写 → 周一拿现成汇报

```mermaid
sequenceDiagram
    actor PM
    participant Project as 飞书项目
    participant Loom
    participant Workplace as Loom 工作台

    Note over PM,Project: 🗓️ 周五 (PM 既有动作)
    PM->>Project: 在工作项「项目周进展描述」里写:<br/>"本周延期, PVT 不合格,<br/>问题是外观瑕疵,<br/>下周跟进二次验货"

    Project->>Loom: MCP 读取工作项字段 + op record
    Loom->>Loom: 结构化事件 + AI 摘要<br/>抽取: 节点进展 / 阻塞 / 责任人 / 下步动作

    Note over PM,Workplace: 🗓️ 周一 (省时间的瞬间)
    PM->>Workplace: 早上打开 Loom
    Workplace-->>PM: 已经生成好的周报草稿:<br/>暂缓 1 / 新立项 2 / 阻塞 3<br/>每条都有 PM 原话引用

    Note over PM: ⚡ 30 秒拿去开会<br/>原来手工整理要 30 分钟
```

**核心：PM 工作流零改动**——他周五本来就在写那段话，Loom 顺便读了。

---

### 时刻 2：销售反问 → 内外综合答

```mermaid
flowchart LR
    Sales[👤 销售]
    Sales -->|"@Loom 为什么<br/>我们没做金属壳脚架"| Bot[💬 飞书内部 Bot]
    Bot --> Loom[Loom 检索]

    Loom --> External["🌍 拉外部证据<br/>评论里 87 条<br/>'卡扣松'原话"]
    Loom --> Internal["🏢 拉内部上下文<br/>PM 张三 9/13 写:<br/>'暂缓,模具超 30%,<br/>等降到 18 万'"]

    External --> Answer["🤝 综合回答<br/>用户痛点真实存在 +<br/>我们当时算过成本"]
    Internal --> Answer
    Answer --> Sales

    style External fill:#fff4e6,stroke:#f59e0b
    style Internal fill:#e6f4ff,stroke:#3b82f6
    style Answer fill:#fef3c7,stroke:#d97706,stroke-width:3px
```

**核心：这是任何外部 SaaS 永远做不到的回答**——因为他们不知道你们公司内部说过什么。

---

## 🖥️ Loom 网页模块速览

```
┌─ Loom 网页 (左侧导航) ───────────────────────┐
│                                                │
│  🏠 工作台         ← 周一首屏看到现成汇报      │
│  🔍 调研工坊       ← PM 80% 时间在这           │
│  📊 需求库         ← 飞书项目镜像 + 品类分析   │
│  🏪 竞品库         ← 外部信号主仓库            │
│  📚 知识库         ← 历史 PRD/MRD              │
│  ⚙️  设置          ← 飞书集成 / 数据源         │
│                                                │
│  (没有"AI 聊天"模块——AI 对话全部去飞书)      │
└───────────────────────────────────────────────┘
```

每个详情页右上角有 **「💬 在飞书继续讨论」** 按钮——一键把当前页上下文送到飞书 bot 里继续聊。

---

## 🧭 全局原则（地基）

| 原则 | 意思 |
|---|---|
| 飞书项目是主源头 | 产研流程增删改永远在飞书项目做；Loom 只读 + 衍生 |
| 多维表格是补充源 | 只有飞书项目未覆盖的团队/流程才走多维表格适配 |
| AI 对话在飞书 | Loom web 不做聊天 UI；只做一次性 AI 操作按钮 + 飞书 handoff |
| PM 工作流零改动 | 不要求 PM 学新工具、填新字段、改新格式 |
| 关联即洞察 | 每个对象都显示关联——这是"内外打通"的可视化 |
| 导出优于内编 | PM 想带走的东西一键打包 |

---

## 💡 为什么这个架构有护城河

- **数据**：外部抓取 + 飞书项目流程记录 + 周进展 + PM 标注，越积越值钱
- **结构**：飞书项目标准字段/节点/操作记录先行；多维表格 AI schema 适配只做补充
- **网络效应**：团队越大，库越值钱，AI 越能站在前人肩膀上
- **AI 时代反而占优**：模型越强、越商品化，**私有上下文越值钱**——因为强模型 + 弱上下文还是写不出能用的 PRD

外部 SaaS 卖给所有人的数据是商品；团队累积的内部上下文才是只属于你们的资产。

---

*文档版本：v1 (2026-05-19)*
*这一份是给人看的总览；技术实施请看 [competition-roadmap.md](./competition-roadmap.md)*
