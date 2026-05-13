# LOOM

LOOM is a single-user personal intelligence workspace. It turns signals from everyday browsing into structured, reusable decision assets through a pipeline:

```text
采集 → 结构化 → 沉淀 → 分析 / 生成
```

The product module names are bilingual in the UI:

| Product name | 中文说明 | Current implementation |
|---|---|---|
| Stream | 资讯流 | RSS / webpage collection, AI filtering, Chinese summary, starred items |
| Lens | 竞品库 | Product records, multi-platform product data, AI extraction, Feishu sync |
| Spark | 灵感库 | Inspiration / demand samples, source links, scenario / painpoint / innovation tags |
| Weave | 调研工坊 | Research projects and AI analysis based on accumulated local data |
| Settings | 系统设置 | AI, Stream sources, Feishu sync, tag system, account settings |

For the product source of truth, see `docs/LOOM_Product_Definition_v2.md`.

## Local Development

Use Node.js 22.x for local development. The current project dependency tree
includes `better-sqlite3`, which is not compatible with Node 26 in this repo.

```bash
npm install
cp .env.example .env
npm run db:seed
npm run server:dev
```

In a second terminal:

```bash
npm run dev
```

Default development login:

```text
username: graham
password: pm-copilot
```

Set `APP_PASSWORD` in `.env` before using the app outside local development.

Optional Feishu OAuth login:

```text
FEISHU_OAUTH_APP_ID=cli_xxx
FEISHU_OAUTH_APP_SECRET=xxx
FEISHU_OAUTH_REDIRECT_URI=https://your-domain.com/api/auth/feishu/callback
FEISHU_OAUTH_ALLOWED_TENANT_KEYS=tenant_xxx
FEISHU_OAUTH_AUTO_PROVISION=true
```

When these values are configured, the login page will show both password login and `使用飞书登录`. In production, use the HTTPS callback URL of your deployed domain and whitelist your company tenant.

## Checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Docker

```bash
cp .env.example .env.production
docker compose up -d --build
curl http://127.0.0.1:3000/api/health
```

The SQLite database and sessions are stored under `./data`, which is ignored by Git and mounted into the container.

## VPS Deployment

Target server:

```bash
ssh tencent-sg-2222
```

Recommended remote path:

```bash
/home/ubuntu/apps/pm-copilot
```

If no Git remote exists yet, deploy by rsync:

```bash
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude data --exclude uploads --exclude .env --exclude .env.production \
  ./ tencent-sg-2222:/home/ubuntu/apps/pm-copilot/
```

Then on the VPS:

```bash
cd /home/ubuntu/apps/pm-copilot
cp .env.example .env.production
# edit APP_PASSWORD and SESSION_SECRET
docker compose up -d --build
curl http://127.0.0.1:3000/api/health
```

## Current MVP Boundary

Implemented:

- Single-user login with server-side session cookie.
- Optional Feishu OAuth login that reuses the same server-side session.
- SQLite-backed persistence for Lens products, Spark inspirations, Stream items, Stream sources, Weave research projects, and Settings.
- Basic Lens / Spark create, edit, delete, and batch delete flows.
- Stream collection, AI filtering, Chinese summary, read/star state, and source management.
- OpenAI-compatible LLM calls, lightweight URL parsing, research analysis, and one-way Feishu sync endpoints.
- `LOOM Web Clipper` browser extension for collecting Lens products and Spark inspirations from supported platforms.

Current real-integration boundary:

- URL parsing uses lightweight HTML/meta/body extraction first, not deep anti-bot browser scraping.
- Stream collection runs manually from Stream and periodically inside the production container.
- Feishu sync is one-way from SQLite to Bitable for Lens, Spark, and Stream.
- API route names still use historical internal names such as `/api/news`, `/api/products`, `/api/demands`, and `/api/research`; these are implementation details, not product-facing names.
