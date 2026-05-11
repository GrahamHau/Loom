import "dotenv/config";
import express from "express";
import session from "express-session";
import SQLiteStoreFactory from "connect-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSeed } from "./db.js";
import { AppError, testLLM } from "./ai-service.js";
import { parseDemandUrl, parseProductUrl } from "./parsers.js";
import { collectDueSources, collectSources } from "./rss-service.js";
import { analyzeResearch } from "./research-service.js";
import { syncFeishu, testFeishu } from "./feishu-service.js";
import { loadInitialData } from "./seed.js";
import {
  bootstrap,
  createNewsSource,
  createDemand,
  createProduct,
  createResearch,
  deleteDemand,
  deleteNews,
  deleteNewsSource,
  deleteProduct,
  deleteResearch,
  listNews,
  listNewsSources,
  rawState,
  updateDemand,
  updateNews,
  updateNewsSource,
  updateProduct,
  updateResearch,
  updateSettings,
} from "./repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 3000);
const SQLiteStore = SQLiteStoreFactory(session);

ensureSeed(loadInitialData());

app.use(express.json({ limit: "2mb" }));
app.use(session({
  store: new SQLiteStore({ dir: process.env.DATA_DIR || path.join(projectRoot, "data"), db: "sessions.sqlite" }),
  secret: process.env.SESSION_SECRET || "pm-copilot-dev-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 14,
  },
}));

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: "unauthorized" });
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function handleError(error, _req, res, _next) {
  if (error instanceof AppError) {
    return res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
  }
  console.error(error);
  res.status(500).json({ error: "internal_error", message: error.message || "服务器错误" });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "pm-copilot", time: new Date().toISOString() });
});

app.post("/api/auth/login", (req, res) => {
  const username = process.env.APP_USERNAME || "graham";
  const password = process.env.APP_PASSWORD || "pm-copilot";
  if (req.body?.username !== username || req.body?.password !== password) {
    return res.status(401).json({ error: "用户名或密码不正确" });
  }
  const state = rawState();
  req.session.user = state.user;
  res.json({ user: state.user });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "unauthorized" });
  res.json({ user: req.session.user });
});

app.get("/api/bootstrap", (_req, res) => {
  res.json(bootstrap());
});

app.get("/api/products", requireAuth, (_req, res) => res.json(rawState().products));
app.post("/api/products", requireAuth, (req, res) => res.status(201).json(createProduct(req.body || {})));
app.patch("/api/products/:id", requireAuth, (req, res) => {
  const item = updateProduct(req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: "product_not_found" });
  res.json(item);
});
app.delete("/api/products/:id", requireAuth, (req, res) => {
  if (!deleteProduct(req.params.id)) return res.status(404).json({ error: "product_not_found" });
  res.json({ ok: true });
});

app.post("/api/products/parse-url", requireAuth, asyncHandler(async (req, res) => {
  res.json(await parseProductUrl(req.body || {}));
}));

app.get("/api/demands", requireAuth, (_req, res) => res.json(rawState().demands));
app.post("/api/demands", requireAuth, (req, res) => res.status(201).json(createDemand(req.body || {})));
app.patch("/api/demands/:id", requireAuth, (req, res) => {
  const item = updateDemand(req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: "demand_not_found" });
  res.json(item);
});
app.delete("/api/demands/:id", requireAuth, (req, res) => {
  if (!deleteDemand(req.params.id)) return res.status(404).json({ error: "demand_not_found" });
  res.json({ ok: true });
});
app.post("/api/demands/parse-url", requireAuth, asyncHandler(async (req, res) => {
  res.json(await parseDemandUrl(req.body || {}));
}));

app.get("/api/news", requireAuth, (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const offset = (page - 1) * limit;
  const typeMap = { new_product: "新品发布", trend: "行业趋势" };
  const allItems = listNews().filter((item) => item.type);
  let items = allItems;
  if (req.query.type) items = items.filter((item) => item.type === (typeMap[req.query.type] || req.query.type));
  if (req.query.starred === "1" || req.query.starred === "true") items = items.filter((item) => item.starred);
  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    items = items.filter((item) =>
      [item.titleZh, item.original_title, item.summary, item.contentZh].filter(Boolean).some((value) => String(value).toLowerCase().includes(q))
    );
  }
  const counts = {
    all: allItems.length,
    new_product: allItems.filter((item) => item.type === "新品发布").length,
    trend: allItems.filter((item) => item.type === "行业趋势").length,
    starred: allItems.filter((item) => item.starred).length,
  };
  const paged = items.slice(offset, offset + limit);
  res.json({ items: paged, counts, page, limit });
});

app.get("/api/news/:id", requireAuth, (req, res) => {
  const item = listNews().find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ error: "news_not_found" });
  res.json(item);
});

app.patch("/api/news/:id", requireAuth, (req, res) => {
  const patch = { ...(req.body || {}) };
  if (patch.is_read !== undefined && patch.unread === undefined) patch.unread = !patch.is_read;
  if (patch.is_starred !== undefined && patch.starred === undefined) patch.starred = Boolean(patch.is_starred);
  const item = updateNews(req.params.id, patch);
  if (!item) return res.status(404).json({ error: "news_not_found" });
  res.json(item);
});
app.delete("/api/news/:id", requireAuth, (req, res) => {
  if (!deleteNews(req.params.id)) return res.status(404).json({ error: "news_not_found" });
  res.json({ ok: true });
});
app.post("/api/news/collect", requireAuth, asyncHandler(async (_req, res) => {
  res.json(await collectSources(listNewsSources()));
}));
app.post("/api/news/refresh", requireAuth, asyncHandler(async (_req, res) => {
  res.json({ message: "采集已触发，后台处理中" });
  setImmediate(async () => {
    try {
      await collectSources(listNewsSources());
    } catch (error) {
      console.error("Manual news refresh failed", error);
    }
  });
}));

app.get("/api/news/sources/status", requireAuth, (_req, res) => {
  res.json(listNewsSources().map((source) => ({
    id: source.id,
    name: source.name,
    last_fetched_at: source.last_fetched_at,
    last_item_count: source.last_item_count,
    last_error: source.last_error,
  })));
});

app.get("/api/news-sources", requireAuth, (_req, res) => res.json(listNewsSources()));
app.post("/api/news-sources", requireAuth, (req, res) => res.status(201).json(createNewsSource(req.body || {})));
app.patch("/api/news-sources/:id", requireAuth, (req, res) => {
  const item = updateNewsSource(req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: "news_source_not_found" });
  res.json(item);
});
app.delete("/api/news-sources/:id", requireAuth, (req, res) => {
  if (!deleteNewsSource(req.params.id)) return res.status(404).json({ error: "news_source_not_found" });
  res.json({ ok: true });
});

app.get("/api/research", requireAuth, (_req, res) => res.json(rawState().research || []));
app.post("/api/research", requireAuth, (req, res) => res.status(201).json(createResearch(req.body || {})));
app.patch("/api/research/:id", requireAuth, (req, res) => {
  const item = updateResearch(req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: "research_not_found" });
  res.json(item);
});
app.delete("/api/research/:id", requireAuth, (req, res) => {
  if (!deleteResearch(req.params.id)) return res.status(404).json({ error: "research_not_found" });
  res.json({ ok: true });
});
app.post("/api/research/:id/analyze", requireAuth, asyncHandler(async (req, res) => {
  const item = await analyzeResearch(req.params.id);
  if (!item) return res.status(404).json({ error: "research_not_found" });
  res.json(item);
}));

app.get("/api/settings", requireAuth, (_req, res) => res.json(bootstrap().settings));
app.patch("/api/settings", requireAuth, (req, res) => res.json(updateSettings(req.body || {})));
app.post("/api/settings/test-llm", requireAuth, asyncHandler(async (_req, res) => res.json(await testLLM())));
app.post("/api/settings/test-feishu", requireAuth, asyncHandler(async (_req, res) => res.json(await testFeishu())));
app.post("/api/sync/feishu", requireAuth, asyncHandler(async (req, res) => res.json(await syncFeishu(req.body || {}))));

let rssCollecting = false;
function startRssScheduler() {
  const settings = rawState().settings || {};
  if (settings.rss_collect_enabled === false || process.env.RSS_COLLECT_ENABLED === "false") return;
  const interval = Number(process.env.RSS_SCHEDULER_CHECK_INTERVAL_MS || process.env.RSS_COLLECT_INTERVAL_MS || settings.rss_collect_interval_ms || 15 * 60 * 1000);
  setInterval(async () => {
    if (rssCollecting) return;
    rssCollecting = true;
    try {
      await collectDueSources(listNewsSources());
    } catch (error) {
      console.error("RSS collect failed", error);
    } finally {
      rssCollecting = false;
    }
  }, interval).unref();
}

if (process.env.NODE_ENV === "production") {
  const distDir = path.join(projectRoot, "dist");
  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`PM Copilot listening on http://0.0.0.0:${port}`);
  });
  if (process.env.NODE_ENV === "production") startRssScheduler();
}

app.use(handleError);

export default app;
