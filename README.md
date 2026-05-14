# LOOM

LOOM is a single-user personal intelligence workspace. This repository turns the existing frontend prototype into a Vite + React app with an Express API, SQLite persistence, session login, Docker deployment, and VPS-ready configuration.

## Naming

The current product and project name is **Loom**. Some older files, database names, browser storage keys, and archived design-export artifacts may still contain the legacy name `PM Copilot` or `pm-copilot`; treat those as compatibility/history references unless a dedicated data migration is being done.

## Claude Frontend Handoff

If Claude is taking over frontend improvements, keep the handoff small:

- Goal: improve Loom's frontend visual design, layout, interaction details, and mobile usability.
- Do not rewrite the product architecture, backend, session handling, or data model.
- Do not wholesale replace `src/App.jsx` or `src/legacy/screens.jsx` with files from `claude-design-pack/`.
- `claude-design-pack/` is a legacy visual reference export, not runtime-equivalent source.
- Preserve existing API/session/data flow, including `/api/me`, `/api/bootstrap`, `/api/auth/login`, and the current product, demand, News, and research data paths.
- Start with `README.md`, `package.json`, `src/App.jsx`, `src/legacy/screens.jsx`, `src/legacy/components.jsx`, and `src/legacy/styles.css`.
- Prefer scoped edits in `src/legacy/styles.css`, `src/legacy/components.jsx`, and local JSX layout blocks before touching app-level state in `src/App.jsx`.

## Local Development

```bash
nvm use
npm install
cp .env.example .env
npm run db:seed
npm run server:dev
```

In a second terminal:

```bash
nvm use
npm run dev
```

This repo is pinned to Node 22 because `better-sqlite3` is a native module. If you enter the project on Node 26 or another ABI-incompatible version, reinstalling alone may not help until you switch back to Node 22 and rebuild dependencies.

Common npm scripts now run a Node version guard first, so if the version is wrong you should see a direct message instead of a low-level native-module crash.

If your shell defaults to a newer Node version, run commands through the pinned Node 22 binary:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run check:node
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test
```

Default local development login:

```text
username: graham
password: read from .env APP_PASSWORD
```

Set `APP_PASSWORD` in `.env` before using the app outside local development.

## Feishu OAuth

Production Feishu login relies on these environment variables:

```text
FEISHU_OAUTH_APP_ID=
FEISHU_OAUTH_APP_SECRET=
FEISHU_OAUTH_REDIRECT_URI=https://your-domain.com/api/auth/feishu/callback
FEISHU_OAUTH_AUTO_PROVISION=true
FEISHU_OAUTH_ALLOWED_TENANT_KEYS=cli_xxx
FEISHU_OAUTH_ALLOWED_EMAIL_DOMAINS=your-company.com
```

Notes:

- `FEISHU_OAUTH_ALLOWED_TENANT_KEYS` is the recommended company boundary for online deployment.
- You can also narrow access with `FEISHU_OAUTH_ALLOWED_EMAIL_DOMAINS`, `FEISHU_OAUTH_ALLOWED_EMAILS`, `FEISHU_OAUTH_ALLOWED_OPEN_IDS`, or `FEISHU_OAUTH_ALLOWED_UNION_IDS`.
- For stricter production access control, set at least one company boundary such as `FEISHU_OAUTH_ALLOWED_TENANT_KEYS` or `FEISHU_OAUTH_ALLOWED_EMAIL_DOMAINS`.
- When a company member passes validation for the first time, the server will create their local account and initialize an isolated workspace automatically.

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

## Loom Listener

For Chrome extension end-to-end checks, prefer the listener workflow over manually driving the browser with Computer Use.

The intended workflow is:

1. The user operates Chrome and the Loom extension normally.
2. The listener watches backend API logs, SQLite write state, and extension debug events.
3. Codex confirms which step passed or failed without slowly clicking through the browser.

Start a dedicated Chrome debugging profile:

```bash
open -na "Google Chrome" --args \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/loom-e2e-chrome
```

Run the listener locally:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run listen:loom
```

The listener defaults are:

```text
remote: tencent-sg-2222
remote path: /home/ubuntu/apps/loom
container: loom
Chrome CDP: http://127.0.0.1:9222
```

Useful overrides:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run listen:loom -- --no-chrome
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run listen:loom -- --no-remote
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run listen:loom -- --remote tencent-sg-2222 --path /home/ubuntu/apps/loom
```

On the VPS, enable request logs only when debugging:

```text
LOOM_REQUEST_LOG=1
```

Then rebuild or restart the container. Request logs print only method, API path, status, duration, and user id. They intentionally do not print request bodies, cookies, bearer tokens, Feishu OAuth codes, or secrets.

Five-minute extension check protocol:

- Web login: watch `/api/auth/feishu/start`, `/api/auth/feishu/callback`, `/api/me`.
- Extension auth sync: watch `/api/auth/extension/session-token` plus extension events `auth:start`, `auth:session-token-response`, `auth:token-ok`.
- Platform page detection: watch `collect:detail-wait` on feed/list pages and `collect:detail-detected` after entering a detail page.
- Page extraction: watch `collect:read-ok`; confirm platform, title, and `hasImage`.
- AI parse: watch `/api/products/parse-raw` or `/api/demands/parse-raw`, plus `parse-raw:ok` or `parse-raw:error`.
- Save: watch `/api/products` or `/api/demands`, plus `save:ok`; confirm the DB snapshot count and latest title changed.

If Chrome CDP is unavailable, the listener still tails VPS logs and DB snapshots. If SSH is unavailable, run it with `--no-remote` and use Chrome/extension events only.

## VPS Deployment

Target server:

```bash
ssh tencent-sg-2222
```

Recommended remote path:

```bash
/home/ubuntu/apps/loom
```

If no Git remote exists yet, deploy by rsync:

```bash
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude data --exclude uploads --exclude .env --exclude .env.production --exclude AGENTS.md \
  ./ tencent-sg-2222:/home/ubuntu/apps/loom/
```

Then on the VPS:

```bash
cd /home/ubuntu/apps/loom
cp .env.example .env.production
# edit APP_PASSWORD and SESSION_SECRET
docker compose up -d --build
curl http://127.0.0.1:3000/api/health
```

## Current MVP Boundary

Implemented:

- Existing frontend prototype moved into Vite without redesigning the UI.
- Password login plus Feishu OAuth with server-side session cookie.
- Per-user SQLite-backed persistence for products, demands, news flags, RSS sources, research seed data, and settings.
- Basic product creation/editing, demand creation/editing, and news star persistence.
- Docker Compose deployment.
- OpenAI-compatible LLM calls, lightweight URL parsing, RSS collection, research analysis, and one-way Feishu sync endpoints.

Current real-integration boundary:

- URL parsing uses lightweight HTML/meta/body extraction first, not deep anti-bot browser scraping.
- RSS collection runs manually from the News page and periodically inside the production container.
- Feishu sync is one-way from SQLite to Bitable for products, demands, and News.
- Feishu table schema must already contain the mapped fields shown in the product spec.

WeChat exporter source notes:

- Loom can ingest `wechat-article-exporter` as a backend-only News source type without changing the Loom frontend flow.
- Put the exporter batch-export JSON on the server, for example at `./data/wechat-exporter-accounts.json`, then set `WECHAT_EXPORTER_ACCOUNTS_PATH` if you want a different path.
- In production set `WECHAT_EXPORTER_BASE_URL` and `WECHAT_EXPORTER_AUTH_KEY` in `.env.production`.
- WeChat sources are treated as official backend-managed sources: the server imports the account list, checks for updates at `WECHAT_COLLECT_HOURS` each day, keeps only `WECHAT_CACHE_DAYS` of local cached articles, then syncs that cached official stream to visitor and regular users.
- The default collection hours are `9,21` with `WECHAT_COLLECT_TIMEZONE=Asia/Shanghai`, so the VPS checks WeChat updates at 09:00 and 21:00 Beijing time even if the container timezone changes.
