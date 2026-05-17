import { AppError } from "./ai-service.js";
import { db } from "./db.js";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function listUserWorkspaceMemberships(user = {}) {
  const userId = cleanText(user.id);
  if (!userId) return [];
  return db.prepare(`
    SELECT wm.workspace_id, wm.role, wm.status, wm.is_default, w.slug, w.name, w.status AS workspace_status
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ?
      AND wm.status = 'active'
      AND w.status = 'active'
    ORDER BY wm.is_default DESC, w.name ASC
  `).all(userId);
}

export function resolveUserWorkspace(user = {}, requestedWorkspaceId = "") {
  const requested = cleanText(requestedWorkspaceId);
  const memberships = listUserWorkspaceMemberships(user);
  if (!memberships.length) {
    throw new AppError(403, "workspace_not_assigned", "当前账号还没有分配工作区。");
  }
  const selected = requested
    ? memberships.find((item) => item.workspace_id === requested || item.slug === requested)
    : memberships[0];
  if (!selected) {
    throw new AppError(403, "workspace_forbidden", "无权访问该工作区。");
  }
  return selected.workspace_id;
}

export function assertSameWorkspace(resource, workspaceId, label = "resource") {
  if (!resource) return null;
  if (cleanText(resource.workspace_id) !== cleanText(workspaceId)) {
    throw new AppError(404, `${label}_not_found`, "资源不存在或无权访问。");
  }
  return resource;
}

export function roleCodesForUser(user = {}, workspaceId = "") {
  const roles = new Set();
  if (user.role_code) roles.add(cleanText(user.role_code));
  const membership = listUserWorkspaceMemberships(user)
    .find((item) => item.workspace_id === workspaceId || item.slug === workspaceId);
  if (membership?.role) roles.add(cleanText(membership.role));
  return [...roles].filter(Boolean);
}

export function canAccessPolicy(policyInput = {}, context = {}) {
  const policy = policyInput && typeof policyInput === "object" && !Array.isArray(policyInput)
    ? policyInput
    : {};
  const userId = cleanText(context.user_id || context.user?.id);
  const ownerUserId = cleanText(context.owner_user_id);
  const visibility = cleanText(policy.visibility, "private");
  const allowedUsers = Array.isArray(policy.allowed_users) ? policy.allowed_users.map(cleanText).filter(Boolean) : [];
  const allowedRoles = Array.isArray(policy.allowed_roles) ? policy.allowed_roles.map(cleanText).filter(Boolean) : [];
  const allowedTeams = Array.isArray(policy.allowed_teams) ? policy.allowed_teams.map(cleanText).filter(Boolean) : [];
  const userRoles = Array.isArray(context.roles) ? context.roles.map(cleanText).filter(Boolean) : [];
  const userTeams = Array.isArray(context.teams) ? context.teams.map(cleanText).filter(Boolean) : [];

  if (!userId) return false;
  if (ownerUserId && ownerUserId === userId) return true;
  if (allowedUsers.includes(userId)) return true;
  if (allowedRoles.length && allowedRoles.some((role) => userRoles.includes(role))) return true;
  if (allowedTeams.length && allowedTeams.some((team) => userTeams.includes(team))) return true;
  if (visibility === "private") return false;
  if (visibility === "role_limited") return false;
  return ["project_team", "workspace", "company"].includes(visibility);
}

export function canAccessDocument(document, context = {}) {
  if (!document) return false;
  return canAccessPolicy(document.access_policy || parseJson(document.access_policy_json, {}), {
    ...context,
    owner_user_id: document.owner_user_id,
  });
}

export function authorizedChunkPredicate(context = {}) {
  return (chunk) => canAccessPolicy(chunk.access_policy || parseJson(chunk.access_policy_json, {}), {
    ...context,
    owner_user_id: chunk.metadata?.owner_user_id || chunk.owner_user_id,
  });
}
