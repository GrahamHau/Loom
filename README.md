# Loom

Loom is a personal intelligence workspace for collecting product signals, customer needs, market news, and lightweight research into one local-first app.

It combines a Vite + React web app, an Express API, SQLite persistence, RSS/News collection, optional LLM enrichment, Feishu OAuth support, and a Chrome extension for clipping product and social-content pages.

## What It Does

- **Stream**: collect and review news from RSS and supported backend-managed sources.
- **Lens**: save competitor products with platform links, prices, images, selling points, and custom fields.
- **Spark**: capture demand and inspiration notes from social/product pages.
- **Weave**: organize lightweight research projects around products and demands.
- **Fields and tags**: manage schema-driven fields such as brand, host device, category, scenarios, pain points, innovation type, and custom tags.
- **Chrome extension**: detect supported detail pages, extract page data, optionally run AI cleanup, and save into Loom.
- **Optional LLM processing**: use OpenAI-compatible providers for classification, summaries, translation, dedupe, and structured parsing.

## Tech Stack

- React 18 + Vite
- Express 5
- SQLite via `better-sqlite3`
- Docker Compose
- Chrome Extension Manifest V3
- Optional Feishu OAuth and Feishu sync integrations

## Repository Layout

```text
src/                    Web app source
src/legacy/             Main app screens and shared UI
server/                 Express API, persistence, auth, collectors
scripts/                Seed, sync, maintenance, and listener scripts
loom-extension/         Chrome extension source
landing/                Public landing page source
demos/                  Demo/reference assets
docs/                   Product notes and architecture docs
```

## Requirements

Use Node.js 22. The project depends on `better-sqlite3`, so running under a newer ABI-incompatible Node version can cause native-module failures.

```bash
node --version
```

If you use Homebrew Node 22 on macOS:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run check:node
```

## Quick Start

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

Open the Vite URL shown in the terminal, usually:

```text
http://127.0.0.1:5173
```

## Environment

Start from `.env.example`.

Important variables:

```text
APP_USERNAME=
APP_PASSWORD=
SESSION_SECRET=
DATABASE_PATH=
```

Optional LLM variables:

```text
LLM_API_URL=
LLM_API_KEY=
LLM_MODEL=
LLM_VISION_API_URL=
LLM_VISION_API_KEY=
LLM_VISION_MODEL=
```

Optional Feishu OAuth variables:

```text
FEISHU_OAUTH_APP_ID=
FEISHU_OAUTH_APP_SECRET=
FEISHU_OAUTH_REDIRECT_URI=
FEISHU_OAUTH_AUTO_PROVISION=true
FEISHU_OAUTH_ALLOWED_TENANT_KEYS=
FEISHU_OAUTH_ALLOWED_EMAIL_DOMAINS=
```

Do not commit real `.env` files, SQLite databases, uploaded files, API keys, cookies, session secrets, or design handoff packs.

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

SQLite data and sessions are stored under `./data`, which is ignored by Git.

## Chrome Extension

The extension lives in `loom-extension/`.

To load it locally:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select the `loom-extension` folder.
5. Open the extension options and set the Loom API base URL.

Supported collection surfaces include Amazon, Taobao/Tmall, Kickstarter, Xiaohongshu, and similar detail-page adapters.

## Public Repo Notes

This repository is public, so local-only materials are intentionally ignored:

- `.env`
- `data/`
- `uploads/`
- `.claude/`
- `claude-design-pack/`
- `.codex-artifacts/`
- `.codex-tmp/`
- `README_LOCAL.md`

If you use AI design tools or local agent workflows, keep those instructions and generated packs outside Git unless they are intentionally sanitized.

## Project Naming

The current product name is **Loom**. Some older internal references may still mention `PM Copilot` or `pm-copilot` for compatibility with historical storage keys, migrations, or archived notes.

## License

No license has been declared yet. Until a license is added, all rights are reserved by the repository owner.
