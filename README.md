# Loom

Loom 是一个面向个人和小团队的情报工作台。

它用来把日常看到的产品、用户需求、行业资讯和调研线索收进一个地方，再通过标签、字段、AI 整理和简单的研究视图，把零散信息变成可以继续分析和复用的素材。

你可以把它理解成一个更偏「产品研究 / 竞品分析 / 需求洞察」的个人知识系统：不是只收藏链接，而是把链接背后的结构化信息留下来。

## Loom 适合做什么

- 看到一个竞品商品，保存它的名称、品牌、价格、图片、卖点、平台链接和相关标签。
- 在小红书等内容平台看到用户需求或灵感，保存原文、作者、互动数据、场景、痛点和创新类型。
- 订阅或采集行业资讯，在 Stream 里浏览、收藏、去重和整理。
- 围绕一个方向建立轻量调研项目，把相关竞品、需求和笔记串起来。
- 用 Chrome 插件从网页侧边栏快速采集，不必每次手动复制粘贴。
- 用可配置字段维护自己的标签体系，而不是被固定模板限制。

## 主要模块

### Stream：资讯流

用于汇总 RSS、官方源和其他后端采集来的行业资讯。适合追踪新品发布、竞品动态、渠道消息和行业趋势。

### Lens：竞品库

用于保存产品和竞品信息。每个产品可以带平台链接、价格、图片、卖点、AI 摘要、品牌、品类、主机设备和自定义字段。

### Spark：灵感 / 需求库

用于保存来自社交平台、评论区、社区或内容平台的需求线索。重点不是「文章收藏」，而是把用户语言里的场景、痛点和机会点沉淀下来。

### Weave：调研工坊

用于把多个产品、需求和线索组织成一个调研项目。适合做新品方向、竞品主题、用户场景或市场机会的小型研究。

### Chrome 插件

插件会识别支持的平台详情页，读取页面信息，生成可编辑表单，然后保存到 Loom。当前主要覆盖商品详情页和小红书笔记等采集场景。

## 技术栈

- 前端：React 18 + Vite
- 后端：Express
- 数据库：SQLite
- 桌面采集：Chrome Extension Manifest V3
- 部署：Docker Compose
- 可选能力：OpenAI 兼容 LLM、飞书 OAuth、飞书同步

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

## 公开仓库说明

这个仓库是公开的，所以以下内容默认不会提交：

- `.env`
- `data/`
- `uploads/`
- `.claude/`
- `claude-design-pack/`
- `.codex-artifacts/`
- `.codex-tmp/`
- `README_LOCAL.md`

如果你使用 Claude、Codex 或其他 AI 设计工具生成中间文件，请先确认内容已经清理，再决定是否提交。

## 命名说明

当前项目名是 **Loom**。

如果在旧文件、数据库字段、浏览器存储键或历史文档里看到 `PM Copilot` / `pm-copilot`，通常只是历史兼容命名，不代表当前产品名。

## License

目前还没有声明开源许可证。在添加 License 之前，默认保留所有权利。
