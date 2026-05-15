import fs from "node:fs";
import path from "node:path";
import {
  addWorkspaceMember,
  db,
  ensureWorkspace,
} from "./db.js";
import {
  createNewsSource,
  findUserByEmail,
  findUserById,
  updateNewsSource,
} from "./repository.js";

function readJsonFile(filePath, fallback) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sealConfigDir(inputDir = "") {
  const configured = inputDir || process.env.LOOM_SEAL_CONFIG_DIR || "";
  return configured ? path.resolve(configured) : "";
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function findUser(ref = {}) {
  if (ref.user_id) return findUserById(ref.user_id);
  if (ref.email) return findUserByEmail(ref.email);
  return null;
}

function findWorkspace(ref = {}) {
  const key = cleanText(ref.workspace_id || ref.workspace_slug || ref.slug);
  if (!key) return null;
  return db.prepare("SELECT * FROM workspaces WHERE id = ? OR slug = ?").get(key, key) || null;
}

function applyWorkspaces(entries = []) {
  const applied = [];
  for (const entry of entries) {
    const workspace = ensureWorkspace(entry);
    if (workspace) applied.push(workspace);
  }
  return applied;
}

function applyWorkspaceMembers(entries = []) {
  const applied = [];
  const skipped = [];
  for (const entry of entries) {
    const user = findUser(entry);
    const workspace = findWorkspace(entry);
    if (!user || !workspace) {
      skipped.push({
        user_id: entry.user_id || "",
        email: entry.email || "",
        workspace: entry.workspace_id || entry.workspace_slug || entry.slug || "",
        reason: !user ? "user_not_found" : "workspace_not_found",
      });
      continue;
    }
    const member = addWorkspaceMember(workspace.id, user.id, {
      role: entry.role || "member",
      status: entry.status || "active",
      isDefault: entry.is_default !== false,
    });
    if (member) applied.push(member);
  }
  return { applied, skipped };
}

function applyNewsSources(entries = []) {
  const applied = [];
  const skipped = [];
  for (const entry of entries) {
    const userId = cleanText(entry.user_id || "legacy-default");
    const sourceId = cleanText(entry.id);
    const workspace = findWorkspace(entry);
    if (entry.workspace_slug && !workspace) {
      skipped.push({ id: sourceId, reason: "workspace_not_found" });
      continue;
    }
    const current = sourceId
      ? db.prepare("SELECT * FROM news_sources WHERE user_id = ? AND id = ?").get(userId, sourceId)
      : null;
    const payload = {
      ...entry,
      workspace_id: workspace?.id || entry.workspace_id || null,
    };
    const source = current
      ? updateNewsSource(userId, current.id, payload)
      : createNewsSource(userId, payload);
    if (source) {
      if (payload.workspace_id) {
        db.prepare("UPDATE news_sources SET workspace_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
          .run(payload.workspace_id, source.id, userId);
      }
      applied.push(source);
    }
  }
  return { applied, skipped };
}

export function loadSealConfig(inputDir = "") {
  const dir = sealConfigDir(inputDir);
  if (!dir) return null;
  return {
    dir,
    workspaces: readJsonFile(path.join(dir, "workspaces.json"), []),
    workspaceMembers: readJsonFile(path.join(dir, "workspace-members.json"), []),
    newsSources: readJsonFile(path.join(dir, "news-sources.json"), []),
  };
}

export function applySealConfig(inputDir = "") {
  const config = loadSealConfig(inputDir);
  if (!config) {
    return {
      configured: false,
      workspaces: 0,
      workspaceMembers: 0,
      skippedMembers: [],
      newsSources: 0,
      skippedNewsSources: [],
    };
  }
  const workspaces = applyWorkspaces(config.workspaces);
  const members = applyWorkspaceMembers(config.workspaceMembers);
  const newsSources = applyNewsSources(config.newsSources);
  return {
    configured: true,
    dir: config.dir,
    workspaces: workspaces.length,
    workspaceMembers: members.applied.length,
    skippedMembers: members.skipped,
    newsSources: newsSources.applied.length,
    skippedNewsSources: newsSources.skipped,
  };
}
