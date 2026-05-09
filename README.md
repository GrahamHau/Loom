# PM Copilot

PM Copilot is a single-user product intelligence workspace. This repository turns the existing frontend prototype into a Vite + React app with an Express API, SQLite persistence, session login, Docker deployment, and VPS-ready configuration.

## Local Development

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

- Existing frontend prototype moved into Vite without redesigning the UI.
- Single-user login with server-side session cookie.
- SQLite-backed persistence for products, demands, news flags, RSS sources, research seed data, and settings.
- Basic product creation/editing, demand creation/editing, and news star persistence.
- Docker Compose deployment.
- OpenAI-compatible LLM calls, lightweight URL parsing, RSS collection, research analysis, and one-way Feishu sync endpoints.

Current real-integration boundary:

- URL parsing uses lightweight HTML/meta/body extraction first, not deep anti-bot browser scraping.
- RSS collection runs manually from the News page and periodically inside the production container.
- Feishu sync is one-way from SQLite to Bitable for products, demands, and News.
- Feishu table schema must already contain the mapped fields shown in the product spec.
