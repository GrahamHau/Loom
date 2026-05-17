# LOOM

LOOM is a personal intelligence workspace for turning web pages, social posts, product research, RSS feeds, and loose notes into structured context you can search, compare, and reuse.

It is built for product research, competitive tracking, market sensing, and long-running creative work. Instead of saving more links, LOOM helps you capture source material into a consistent schema of fields, tags, summaries, entities, and research threads.

This public repository is the application mechanism only. It intentionally ships with no private workspaces, source lists, production data, customer data, or default business-domain seed content. Private workspace configuration should live in a separate seal repository and be applied through `LOOM_SEAL_CONFIG_DIR`.

## What LOOM Does

- Capture product pages and social posts with a Chrome extension side panel.
- Store competitor products with brand, category, platform, price, media, notes, and custom tag fields.
- Store user需求 / inspirations from social content, including original text, metrics, comments, scenarios, pain points, and tags.
- Collect and classify RSS/news sources into a Stream view.
- Organize research projects that connect products, demands, notes, and news.
- Keep fields and tag groups configurable, so the workspace can adapt to different industries.
- Optionally use an OpenAI-compatible LLM for summaries, translation, classification, and extraction.

## Main Modules

| Module | Purpose |
| --- | --- |
| Stream | Industry news and RSS intelligence feed |
| Lens | Competitor/product library |
| Spark | User需求, inspiration, and social research library |
| Weave | Research projects that connect multiple records |
| Chrome extension | Web clipping entry point for supported product/social pages |
| Landing | Public landing page for the product |

## Tech Stack

| Layer | Technology |
| --- | --- |
| Web app | React 18 + Vite |
| API server | Express |
| Database | SQLite + `better-sqlite3` |
| Extension | Chrome Extension Manifest V3 |
| Tests | Vitest |
| Deployment | Docker Compose compatible |

## Repository Layout

```text
src/                    Web app source
src/legacy/             Main app screens and shared UI
server/                 Express API, auth, repository, RSS and fetch services
scripts/                Local setup, maintenance, sync, and debugging scripts
loom-extension/         Chrome extension source
landing/                Public landing page
docs/                   Public product and implementation notes
```

## Requirements

Use Node.js 22.x. The SQLite dependency uses a native module, so mismatched Node versions can cause install/runtime errors.

```bash
node --version
npm install
```

## Local Development

Create local environment config:

```bash
cp .env.example .env
```

Seed the database and start the API server:

```bash
npm run db:seed
npm run server:dev
```

In another terminal, start the web app:

```bash
npm run dev
```

The Vite app usually runs at:

```text
http://127.0.0.1:5173
```

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

If you use Homebrew Node 22 on macOS:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run check:node
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test
```

## Environment Variables

Start from `.env.example` and only fill what you need locally.

Common settings:

```text
APP_USERNAME=
APP_PASSWORD=
SESSION_SECRET=
DATABASE_PATH=
```

Optional LLM settings:

```text
LLM_API_URL=
LLM_API_KEY=
LLM_MODEL=
LLM_VISION_API_URL=
LLM_VISION_API_KEY=
LLM_VISION_MODEL=
```

Optional Feishu OAuth/sync settings:

```text
FEISHU_OAUTH_APP_ID=
FEISHU_OAUTH_APP_SECRET=
FEISHU_OAUTH_REDIRECT_URI=
FEISHU_OAUTH_AUTO_PROVISION=true
FEISHU_OAUTH_ALLOWED_TENANT_KEYS=
FEISHU_OAUTH_ALLOWED_EMAIL_DOMAINS=
```

Optional seal/private overlay:

```text
LOOM_SEAL_CONFIG_DIR=/path/to/loom-seal/config
```

The seal config directory can include `workspaces.json`, `workspace-members.json`, and `news-sources.json`. Apply it with:

```bash
npm run seal:apply
```

## Chrome Extension

The extension source lives in `loom-extension/`.

To load it locally:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `loom-extension` directory.
5. Open the extension options page and configure the LOOM API base URL.

For extension E2E debugging, prefer Codex's native Chrome plugin and backend logs. Use `npm run listen:loom` only as an explicit fallback because raw Chrome remote debugging can trigger Chrome's permission dialog.

The downloadable extension bundle used by the landing page is stored at:

```text
landing/public/downloads/loom-extension.zip
```

## Docker

```bash
cp .env.example .env.production
docker compose up -d --build
curl http://127.0.0.1:3000/api/health
```

SQLite data and sessions are stored under `./data` by default. That directory is intentionally ignored by Git.

## Public / Seal Boundary

Keep this repo safe to publish. Do not add default RSS sources, private workspaces, company-specific docs, deployment overlays, or generated extension bundles here. Put those in the seal repo and apply them through the JSON import mechanism.

## Security Notes

Do not commit real `.env` files, SQLite databases, uploaded files, API keys, cookies, session secrets, production data, private runbooks, or design handoff packages.

Local-only notes can live in `README_LOCAL.md`, which is ignored by Git.

## License

No open-source license has been declared yet. Until a license is added, all rights are reserved.
