import "dotenv/config";
import express from "express";
import session from "express-session";
import SQLiteStoreFactory from "connect-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSeed } from "./db.js";
import { loadSeedData } from "./seed.js";
import {
  bootstrap,
  createDemand,
  createProduct,
  deleteProduct,
  rawState,
  updateDemand,
  updateNews,
  updateProduct,
  updateSettings,
} from "./repository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 3000);
const SQLiteStore = SQLiteStoreFactory(session);

ensureSeed(loadSeedData());

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

app.post("/api/products/parse-url", requireAuth, (_req, res) => {
  res.status(501).json({ error: "not_configured", message: "Playwright 链接解析将在下一阶段接入。" });
});

app.get("/api/demands", requireAuth, (_req, res) => res.json(rawState().demands));
app.post("/api/demands", requireAuth, (req, res) => res.status(201).json(createDemand(req.body || {})));
app.patch("/api/demands/:id", requireAuth, (req, res) => {
  const item = updateDemand(req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: "demand_not_found" });
  res.json(item);
});

app.patch("/api/news/:id", requireAuth, (req, res) => {
  const item = updateNews(req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: "news_not_found" });
  res.json(item);
});

app.get("/api/settings", requireAuth, (_req, res) => res.json(bootstrap().settings));
app.patch("/api/settings", requireAuth, (req, res) => res.json(updateSettings(req.body || {})));
app.post("/api/settings/test-llm", requireAuth, (_req, res) => {
  res.status(501).json({ error: "not_configured", message: "LLM 连接测试接口已预留，填写真实配置后接入。" });
});
app.post("/api/settings/test-feishu", requireAuth, (_req, res) => {
  res.status(501).json({ error: "not_configured", message: "飞书连接测试接口已预留，下一阶段接入真实 API。" });
});

if (process.env.NODE_ENV === "production") {
  const distDir = path.join(projectRoot, "dist");
  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`PM Copilot listening on http://0.0.0.0:${port}`);
  });
}

export default app;
