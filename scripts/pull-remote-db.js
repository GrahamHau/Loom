#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";

const DEFAULT_REMOTE = process.env.LOOM_DB_REMOTE || "tencent-sg-2222";
const DEFAULT_REMOTE_DB = process.env.LOOM_DB_REMOTE_PATH || "/home/ubuntu/apps/loom/data/pm-copilot.sqlite";
const DEFAULT_REMOTE_APP = process.env.LOOM_DB_REMOTE_APP || "/home/ubuntu/apps/loom";
const DEFAULT_REMOTE_CONTAINER = process.env.LOOM_DB_REMOTE_CONTAINER || "loom";
const DEFAULT_LOCAL_DB = process.env.LOOM_LOCAL_DB_PATH || path.resolve("data/loom.remote.snapshot.sqlite");
const DEFAULT_LOCAL_UPLOADS = process.env.UPLOADS_DIR || path.resolve("uploads");
const DEFAULT_TIMEOUT_MS = Math.max(5000, Number(process.env.LOOM_DB_PULL_TIMEOUT_MS || 30000));

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  const remote = args.remote || DEFAULT_REMOTE;
  const remoteDbPath = args.db || DEFAULT_REMOTE_DB;
  const remoteAppPath = args.app || DEFAULT_REMOTE_APP;
  const remoteContainer = args.container || DEFAULT_REMOTE_CONTAINER;
  const localDbPath = path.resolve(String(args.out || DEFAULT_LOCAL_DB));
  const backup = args.backup !== "false";
  const syncMedia = args.media !== "false" && args["sync-media"] !== "false";
  const localUploadsPath = path.resolve(String(args.uploads || DEFAULT_LOCAL_UPLOADS));
  const allowOpenTarget = args.allowOpenTarget === true || args["allow-open-target"] === true;
  const timeoutMs = Math.max(5000, Number(args.timeoutMs || args.timeout || DEFAULT_TIMEOUT_MS));
  fs.mkdirSync(path.dirname(localDbPath), { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loom-db-pull-"));
  const tmpDbPath = path.join(tmpDir, "remote.sqlite");
  const remoteSnapshotPath = `${remoteAppPath.replace(/\/$/, "")}/data/loom-local-snapshot-${Date.now()}.sqlite`;

  try {
    console.log(`[db:pull-remote] remote=${remote}`);
    console.log(`[db:pull-remote] remote_db=${remoteDbPath}`);
    console.log(`[db:pull-remote] container=${remoteContainer}`);
    console.log(`[db:pull-remote] out=${localDbPath}`);
    assertTargetCanBeReplaced(localDbPath, { allowOpenTarget });
    createRemoteSnapshot({ remote, remoteContainer, remoteDbPath, remoteSnapshotPath, timeoutMs });
    execFileSync("scp", [`${remote}:${remoteSnapshotPath}`, tmpDbPath], { stdio: "inherit", timeout: timeoutMs });
    verifySqliteSnapshot(tmpDbPath);
    if (backup && fs.existsSync(localDbPath)) {
      const backupPath = `${localDbPath}.bak`;
      fs.copyFileSync(localDbPath, backupPath);
      console.log(`[db:pull-remote] backup=${backupPath}`);
    }
    const stagedPath = `${localDbPath}.next`;
    fs.copyFileSync(tmpDbPath, stagedPath);
    verifySqliteSnapshot(stagedPath);
    removeSqliteSidecars(stagedPath);
    removeSqliteSidecars(localDbPath);
    fs.renameSync(stagedPath, localDbPath);
    console.log(`[db:pull-remote] copied snapshot to ${localDbPath}`);
    if (syncMedia) {
      syncRemoteMedia({ remote, remoteAppPath, localUploadsPath, timeoutMs });
    }
  } finally {
    try {
      execFileSync("ssh", [remote, `rm -f '${shellEscape(remoteSnapshotPath)}'`], { stdio: "ignore", timeout: 5000 });
    } catch {
      // Remote snapshot cleanup is best effort.
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup.
    }
  }
}

function syncRemoteMedia({ remote, remoteAppPath, localUploadsPath, timeoutMs }) {
  const remoteMediaPath = `${remoteAppPath.replace(/\/$/, "")}/uploads/remote-media/`;
  const localMediaPath = path.join(localUploadsPath, "remote-media");
  fs.mkdirSync(localMediaPath, { recursive: true });
  try {
    execFileSync("rsync", [
      "-az",
      `${remote}:${remoteMediaPath}`,
      `${localMediaPath}/`,
    ], { stdio: "inherit", timeout: timeoutMs });
    console.log(`[db:pull-remote] synced remote media to ${localMediaPath}`);
  } catch (error) {
    throw new Error(`Failed to sync remote media from ${remote}:${remoteMediaPath}: ${error.message}`);
  }
}

function assertTargetCanBeReplaced(filePath, { allowOpenTarget = false } = {}) {
  if (allowOpenTarget) return;
  const sidecars = [`${filePath}-wal`, `${filePath}-shm`].filter((item) => fs.existsSync(item));
  if (!sidecars.length) return;
  throw new Error([
    `Refusing to replace ${filePath} while SQLite sidecar files exist.`,
    "Stop the local backend first, or pull into a pending snapshot path and let the local dev launcher install it.",
    `Sidecars: ${sidecars.join(", ")}`,
  ].join(" "));
}

function createRemoteSnapshot({ remote, remoteContainer, remoteDbPath, remoteSnapshotPath, timeoutMs }) {
  const containerSnapshotPath = `/app/data/${path.basename(remoteSnapshotPath)}`;
  const code = [
    "set -e",
    `docker exec ${shellQuote(remoteContainer)} node --input-type=module -e ${shellQuote(`
      import Database from "better-sqlite3";
      import fs from "node:fs";
      import path from "node:path";
      const requested = ${JSON.stringify(containerDbPathFor(remoteDbPath))};
      const candidates = [
        requested,
        "/app/data/loom.sqlite",
        "/app/data/pm-copilot.sqlite"
      ].filter(Boolean);
      const dbPath = candidates.find((item, index) => {
        if (candidates.indexOf(item) !== index) return false;
        try {
          return fs.statSync(item).size > 0;
        } catch {
          return false;
        }
      });
      if (!dbPath) {
        throw new Error("No readable Loom SQLite database found in container");
      }
      const snapshotPath = ${JSON.stringify(containerSnapshotPath)};
      try { fs.unlinkSync(snapshotPath); } catch {}
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });
      const check = db.pragma("quick_check", { simple: true });
      if (check !== "ok") {
        throw new Error("Remote database quick_check failed: " + check);
      }
      await db.backup(snapshotPath);
      db.close();
      const snapshot = new Database(snapshotPath, { readonly: true, fileMustExist: true });
      const snapshotCheck = snapshot.pragma("quick_check", { simple: true });
      const userCount = snapshot.prepare("SELECT COUNT(*) AS n FROM users").get().n;
      snapshot.close();
      if (snapshotCheck !== "ok") {
        throw new Error("Remote snapshot quick_check failed: " + snapshotCheck);
      }
      console.log(JSON.stringify({ dbPath, snapshotPath, userCount }));
    `)}`,
  ].join(" && ");
  execFileSync("ssh", [remote, code], { stdio: "inherit", timeout: timeoutMs });
}

function containerDbPathFor(remoteDbPath) {
  if (remoteDbPath.startsWith("/home/ubuntu/apps/loom/data/")) {
    return `/app/data/${path.basename(remoteDbPath)}`;
  }
  return remoteDbPath;
}

function verifySqliteSnapshot(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size <= 0) throw new Error(`Snapshot is empty: ${filePath}`);
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const check = db.pragma("quick_check", { simple: true });
    if (check !== "ok") throw new Error(`quick_check failed: ${check}`);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
    for (const table of ["users", "app_data"]) {
      if (!tables.includes(table)) throw new Error(`Snapshot missing required table: ${table}`);
    }
    const users = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
    console.log(`[db:pull-remote] verified snapshot=${filePath} users=${users}`);
  } finally {
    db.close();
  }
}

function removeSqliteSidecars(filePath) {
  for (const suffix of ["-wal", "-shm"]) {
    try {
      fs.rmSync(`${filePath}${suffix}`, { force: true });
    } catch {
      // Best effort cleanup.
    }
  }
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

function shellEscape(value) {
  return String(value).replace(/'/g, `'\\''`);
}

function shellQuote(value) {
  return `'${shellEscape(value)}'`;
}
