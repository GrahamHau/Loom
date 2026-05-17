#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_REMOTE = "tencent-sg-2222";
const DEFAULT_REMOTE_PATH = "/home/ubuntu/apps/loom";
const DEFAULT_CONTAINER = "loom";
const DEFAULT_CDP_URL = "http://127.0.0.1:9222";

const args = parseArgs(process.argv.slice(2));
const remote = args.remote || process.env.LOOM_LISTENER_REMOTE || DEFAULT_REMOTE;
const remotePath = args.path || process.env.LOOM_LISTENER_REMOTE_PATH || DEFAULT_REMOTE_PATH;
const container = args.container || process.env.LOOM_LISTENER_CONTAINER || DEFAULT_CONTAINER;
const cdpUrl = args.cdp || process.env.LOOM_LISTENER_CDP || DEFAULT_CDP_URL;
const intervalMs = Number(args.interval || process.env.LOOM_LISTENER_INTERVAL_MS || 5000);
const noRemote = Boolean(args["no-remote"]);
const noChrome = Boolean(args["no-chrome"]);

let lastDebugKey = "";
let chromeWarned = false;
let snapshotTimer = null;
let chromeTimer = null;

main();

function main() {
  console.log(`[loom-listener] remote=${remote} path=${remotePath} container=${container}`);
  console.log(`[loom-listener] cdp=${cdpUrl}`);
  console.log("[loom-listener] Ctrl+C 退出。不会打印 token/cookie/body。");

  if (!noRemote) {
    tailRemoteLogs();
    snapshotTimer = setInterval(() => snapshotRemoteDb(), intervalMs);
    void snapshotRemoteDb();
  }

  if (!noChrome) {
    chromeTimer = setInterval(() => pollChromeDebugEvents(), Math.max(1500, Math.min(intervalMs, 3000)));
    void pollChromeDebugEvents();
  }

  process.on("SIGINT", () => {
    if (snapshotTimer) clearInterval(snapshotTimer);
    if (chromeTimer) clearInterval(chromeTimer);
    process.exit(0);
  });
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function tailRemoteLogs() {
  const command = [
    `cd ${shellQuote(remotePath)}`,
    `docker logs -f --tail 80 ${shellQuote(container)} 2>&1`,
  ].join(" && ");
  const child = spawn("ssh", [remote, command], { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => printLogChunk("docker", chunk));
  child.stderr.on("data", (chunk) => printLogChunk("ssh", chunk));
  child.on("exit", (code) => {
    console.log(`[loom-listener] docker log tail stopped code=${code ?? "-"}`);
  });
}

function printLogChunk(source, chunk) {
  for (const line of String(chunk).split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean) continue;
    if (clean.includes("loom:api") || /error|failed|unauthorized|invalid|500|401|403/i.test(clean)) {
      console.log(`[${source}] ${redact(clean)}`);
    }
  }
}

async function snapshotRemoteDb() {
  const code = `
import Database from "better-sqlite3";
import fs from "node:fs";
const dbPath = fs.existsSync("/app/data/loom.sqlite") ? "/app/data/loom.sqlite" : "/app/data/pm-copilot.sqlite";
const db = new Database(dbPath, { readonly: true });
const users = db.prepare("select id,email,name,auth_provider,last_login_at from users order by updated_at desc limit 3").all();
const tokens = db.prepare("select user_id,created_at,last_used_at,revoked_at from api_tokens order by created_at desc limit 3").all();
const states = db.prepare("select key,value,updated_at from app_data where key like 'state:user:%' order by updated_at desc limit 3").all().map((row) => {
  const state = JSON.parse(row.value);
  return {
    key: row.key,
    updated_at: row.updated_at,
    user: state.user?.name || "",
    products: state.products?.length || 0,
    demands: state.demands?.length || 0,
    lastProduct: state.products?.[0]?.name || "",
    lastDemand: state.demands?.[0]?.title || ""
  };
});
const news = db.prepare("select user_id,source_name,coalesce(title_zh, original_title) as title,published_at,thumbnail_url from news_items order by coalesce(published_at, created_at) desc limit 3").all();
console.log(JSON.stringify({ users, tokens, states, news }));
`;
  const command = [
    `cd ${shellQuote(remotePath)}`,
    `docker exec ${shellQuote(container)} node --input-type=module -e ${shellQuote(code)}`,
  ].join(" && ");
  const child = spawn("ssh", [remote, command], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("exit", (code) => {
    if (code !== 0) {
      console.log(`[db] snapshot failed code=${code ?? "-"} ${redact(stderr.trim()).slice(0, 300)}`);
      return;
    }
    try {
      const data = JSON.parse(stdout.trim());
      printSnapshot(data);
    } catch (error) {
      console.log(`[db] snapshot parse failed ${error.message}`);
    }
  });
}

function printSnapshot(data) {
  const latestState = data.states?.[0];
  const latestUser = data.users?.[0];
  const latestToken = data.tokens?.[0];
  const latestNews = data.news?.[0];
  console.log([
    "[db]",
    latestUser ? `user=${latestUser.name || latestUser.id}(${latestUser.auth_provider || "-"})` : "user=-",
    latestToken ? `tokenUser=${latestToken.user_id} revoked=${latestToken.revoked_at ? "yes" : "no"}` : "token=-",
    latestState ? `products=${latestState.products} demands=${latestState.demands}` : "state=-",
    latestState?.lastProduct ? `lastProduct=${latestState.lastProduct}` : "",
    latestState?.lastDemand ? `lastDemand=${latestState.lastDemand}` : "",
    latestNews?.title ? `latestNews=${latestNews.title}` : "",
  ].filter(Boolean).join(" "));
}

async function pollChromeDebugEvents() {
  try {
    const target = await findChromeExtensionTarget();
    if (!target?.webSocketDebuggerUrl && !target?.targetId) {
      if (!chromeWarned) {
        console.log("[chrome] 未找到 LOOM 插件调试目标。请打开插件 sidepanel，或用 --remote-debugging-port=9222 启动 Chrome。");
        chromeWarned = true;
      }
      return;
    }
    const events = target.webSocketDebuggerUrl
      ? await readExtensionEvents(target.webSocketDebuggerUrl)
      : await readExtensionEventsViaBrowserTarget(target);
    chromeWarned = false;
    printNewDebugEvents(events);
  } catch (error) {
    if (!chromeWarned) {
      console.log(`[chrome] CDP 不可用：${error.message}`);
      console.log(`         启动方式：open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/loom-e2e-chrome`);
      chromeWarned = true;
    }
  }
}

async function findChromeExtensionTarget() {
  try {
    const targets = await fetchJson(`${cdpUrl.replace(/\/$/, "")}/json/list`);
    return findExtensionTarget(targets);
  } catch (error) {
    if (!/HTTP 404|fetch failed|ECONNREFUSED/i.test(error.message || "")) throw error;
    const browser = await connectChromeBrowserTarget();
    try {
      const response = await browser.client.send("Target.getTargets");
      const target = findExtensionTarget(response.targetInfos || []);
      return target ? { ...target, browserClient: browser.client } : null;
    } catch (innerError) {
      browser.client.close();
      throw innerError;
    }
  }
}

async function connectChromeBrowserTarget() {
  const configured = cdpUrl.replace(/\/$/, "");
  try {
    const version = await fetchJson(`${configured}/json/version`);
    if (version.webSocketDebuggerUrl) {
      return { client: await CdpClient.connect(version.webSocketDebuggerUrl) };
    }
  } catch {
    // Chrome 144+ may expose only DevToolsActivePort for the selected profile.
  }
  const wsUrl = readDevToolsActivePortWsUrl();
  if (!wsUrl) throw new Error("DevToolsActivePort not found");
  return { client: await CdpClient.connect(wsUrl) };
}

function readDevToolsActivePortWsUrl() {
  const candidates = [
    path.join(os.homedir(), "Library/Application Support/Google/Chrome/DevToolsActivePort"),
    path.join(os.homedir(), "Library/Application Support/Google/Chrome/Profile 1/DevToolsActivePort"),
    path.join(os.homedir(), "Library/Application Support/Google/Chrome/Default/DevToolsActivePort"),
  ];
  for (const file of candidates) {
    try {
      const [port, browserPath] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
      if (port && browserPath) return `ws://127.0.0.1:${port}${browserPath}`;
    } catch {
      // Try the next profile.
    }
  }
  return "";
}

function findExtensionTarget(targets) {
  const extensionId = args.extensionId || process.env.LOOM_EXTENSION_ID || "";
  const extensionTargets = targets.filter((target) => String(target.url || "").startsWith("chrome-extension://"));
  if (extensionId) {
    return extensionTargets.find((target) => String(target.url || "").includes(`chrome-extension://${extensionId}/`));
  }
  return extensionTargets.find((target) => String(target.url || "").includes("/sidepanel/sidepanel.html")) ||
    extensionTargets.find((target) => String(target.url || "").includes("/background/service-worker.js")) ||
    extensionTargets[0];
}

async function readExtensionEvents(webSocketDebuggerUrl) {
  const client = await CdpClient.connect(webSocketDebuggerUrl);
  try {
    const expression = `new Promise((resolve) => chrome.storage.local.get({ loom_debug_events: [] }, (result) => resolve(result.loom_debug_events || [])))`;
    const response = await client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    return response.result?.value || [];
  } finally {
    client.close();
  }
}

async function readExtensionEventsViaBrowserTarget(target) {
  const client = target.browserClient;
  if (!client) return [];
  let sessionId = "";
  try {
    const attached = await client.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    sessionId = attached.sessionId || "";
    const expression = `new Promise((resolve) => chrome.storage.local.get({ loom_debug_events: [] }, (result) => resolve(result.loom_debug_events || [])))`;
    const response = await client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);
    return response.result?.value || [];
  } finally {
    if (sessionId) {
      await client.send("Target.detachFromTarget", { sessionId }).catch(() => {});
    }
    client.close();
  }
}

function printNewDebugEvents(events) {
  if (!Array.isArray(events) || !events.length) return;
  const nextEvents = [];
  for (const event of events) {
    const key = `${event.ts}|${event.source}|${event.name}`;
    if (lastDebugKey && key <= lastDebugKey) continue;
    nextEvents.push(event);
  }
  for (const event of nextEvents.slice(-30)) {
    const bits = [
      `[ext] ${event.ts}`,
      `${event.source}:${event.name}`,
      event.payload?.platform ? `platform=${event.payload.platform}` : "",
      event.payload?.mode ? `mode=${event.payload.mode}` : "",
      event.payload?.status ? `status=${event.payload.status}` : "",
      event.payload?.reason ? `reason=${event.payload.reason}` : "",
      event.payload?.title ? `title=${event.payload.title}` : "",
      event.payload?.error ? `error=${event.payload.error}` : "",
    ].filter(Boolean);
    console.log(redact(bits.join(" ")));
  }
  const last = events[events.length - 1];
  if (last) lastDebugKey = `${last.ts}|${last.source}|${last.name}`;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function redact(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/connect\.sid=[^;\s]+/gi, "connect.sid=[redacted]")
    .replace(/("?(?:token|session_cookie|cookie|authorization|password|secret)"?\s*[:=]\s*)"[^"]+"/gi, "$1\"[redacted]\"");
}

class CdpClient {
  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const client = new CdpClient(ws);
      ws.addEventListener("open", () => resolve(client), { once: true });
      ws.addEventListener("error", () => reject(new Error("WebSocket connect failed")), { once: true });
    });
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener("message", (event) => this.handleMessage(event));
  }

  send(method, params = {}, sessionId = "") {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 3000);
    });
  }

  handleMessage(event) {
    const data = JSON.parse(event.data);
    if (!data.id || !this.pending.has(data.id)) return;
    const pending = this.pending.get(data.id);
    this.pending.delete(data.id);
    if (data.error) {
      pending.reject(new Error(data.error.message || "CDP error"));
    } else {
      pending.resolve(data.result || {});
    }
  }

  close() {
    this.ws.close();
  }
}
