# Loom

> 把网页、资讯、社交内容和调研线索沉淀成属于你自己行业与认知框架的结构化上下文。

Loom 是一个面向个人创作者、产品团队和增长团队的行业语料沉淀与情报工作台。

它的核心不是「收藏更多链接」，而是把日常看到的产品、用户需求、行业资讯、社交内容和调研线索持续收进同一个工作空间，再通过字段、标签、AI 整理和结构化视图，把零散材料变成可检索、可复用、可分析的数据资产。

当你持续使用 Loom，沉淀下来的不只是资料库，而是一套越来越贴近你所在行业、产品方向和认知框架的上下文：哪些产品在变化，用户反复表达什么痛点，市场叙事如何迁移，哪些线索值得继续追踪。

## 核心价值

| 你看到的原始材料 | Loom 帮你沉淀成 |
| --- | --- |
| 商品页、众筹页、竞品链接 | 结构化竞品档案、价格、卖点、平台信息 |
| 小红书笔记、评论区、社区讨论 | 用户语言、场景、痛点、需求线索 |
| RSS、行业新闻、官方动态 | 可追踪的行业资讯流 |
| 临时想法和调研线索 | 可复用的研究上下文 |
| 分散标签和分类习惯 | 统一的字段体系和标签 schema |

## Loom 适合谁

- **产品经理 / 创始人**：持续追踪竞品、用户反馈和市场机会。
- **增长 / 运营团队**：把内容平台、评论区和社媒讨论沉淀成可分析语料。
- **研究型创作者**：围绕一个领域长期积累素材、案例和判断依据。
- **小型团队**：让多人围绕同一套行业上下文讨论、筛选和行动。

## 典型工作流

```text
看到线索
  ↓
Chrome 插件 / RSS / 手动录入
  ↓
字段化：来源、品牌、品类、场景、痛点、标签
  ↓
AI 辅助整理：摘要、分类、翻译、去重、结构化
  ↓
沉淀为 Stream / Lens / Spark / Weave 中的长期上下文
```

## 主要模块

| 模块 | 用途 | 沉淀的上下文 |
| --- | --- | --- |
| **Stream** | 行业资讯流 | 新品发布、竞品动态、渠道消息、趋势线索 |
| **Lens** | 竞品库 | 产品信息、价格、图片、卖点、平台链接、标签字段 |
| **Spark** | 灵感 / 需求库 | 用户原话、内容笔记、互动数据、场景、痛点 |
| **Weave** | 调研工坊 | 围绕主题串联竞品、需求、资讯和笔记 |
| **Chrome 插件** | 网页采集入口 | 从详情页快速抽取可编辑表单并保存到 Loom |

## 能做什么

- 保存竞品商品的名称、品牌、价格、图片、卖点、平台链接和相关标签。
- 把小红书等内容平台里的用户表达沉淀为可分析语料。
- 订阅或采集行业资讯，形成自己的行业动态上下文。
- 围绕一个方向建立轻量调研项目，把相关竞品、需求、资讯和笔记串起来。
- 用 Chrome 插件从网页侧边栏快速采集，减少复制粘贴。
- 用可配置字段维护自己的标签体系，而不是被固定模板限制。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18 + Vite |
| 后端 | Express |
| 数据库 | SQLite + `better-sqlite3` |
| 浏览器插件 | Chrome Extension Manifest V3 |
| 部署 | Docker Compose |
| 可选集成 | OpenAI 兼容 LLM、飞书 OAuth、飞书同步 |

## 项目结构

```text
src/                    Web 应用源码
src/legacy/             主要页面和通用 UI
server/                 Express API、鉴权、数据库、采集服务
scripts/                初始化、同步、维护和调试脚本
loom-extension/         Chrome 插件源码
landing/                官网 / Landing 页
demos/                  示例和演示素材
docs/                   产品说明和架构文档
```

## 本地运行

这个项目需要 Node.js 22。因为 SQLite 依赖 `better-sqlite3` 原生模块，Node 版本不匹配时可能会出现 native module 相关错误。

```bash
npm install
cp .env.example .env
npm run db:seed
npm run server:dev
```

再开一个终端：

```bash
npm run dev
```

默认前端地址通常是：

```text
http://127.0.0.1:5173
```

如果你在 macOS 上使用 Homebrew 的 Node 22，可以这样运行命令：

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run check:node
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test
```

## 环境变量

先复制示例文件：

```bash
cp .env.example .env
```

常用配置：

```text
APP_USERNAME=
APP_PASSWORD=
SESSION_SECRET=
DATABASE_PATH=
```

可选的 LLM 配置：

```text
LLM_API_URL=
LLM_API_KEY=
LLM_MODEL=
LLM_VISION_API_URL=
LLM_VISION_API_KEY=
LLM_VISION_MODEL=
```

可选的飞书 OAuth 配置：

```text
FEISHU_OAUTH_APP_ID=
FEISHU_OAUTH_APP_SECRET=
FEISHU_OAUTH_REDIRECT_URI=
FEISHU_OAUTH_AUTO_PROVISION=true
FEISHU_OAUTH_ALLOWED_TENANT_KEYS=
FEISHU_OAUTH_ALLOWED_EMAIL_DOMAINS=
```

请不要把真实 `.env`、数据库、上传文件、API Key、Cookie、Session Secret 或设计交接包提交到 Git。

## 常用命令

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Docker 启动：

```bash
cp .env.example .env.production
docker compose up -d --build
curl http://127.0.0.1:3000/api/health
```

SQLite 数据和 Session 默认放在 `./data`，这个目录不会进入 Git。

## 加载 Chrome 插件

插件源码在 `loom-extension/`。

本地加载方式：

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `loom-extension` 目录
5. 打开插件设置页，配置 Loom API 地址

## License

目前还没有声明开源许可证。在添加 License 之前，默认保留所有权利。
