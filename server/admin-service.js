import { AppError } from "./ai-service.js";
import { ROLE_LABEL, VALID_ROLE_CODES, VALID_USER_STATUSES, isOwner } from "./access-control.js";
import { addWorkspaceMember, db, ensureWorkspace, LEGACY_USER_ID, purgeUserSessions, revokeUserApiTokens } from "./db.js";

function nowIso() {
  return new Date().toISOString();
}

function readWorkspaceCounts(userId) {
  if (userId === LEGACY_USER_ID) return { products: 0, demands: 0, research: 0, news: 0 };
  try {
    const row = db.prepare("SELECT value FROM app_data WHERE key = ?").get(`state:user:${userId}`);
    const state = row?.value ? JSON.parse(row.value) : {};
    const news = db.prepare("SELECT COUNT(*) AS count FROM news_items WHERE user_id = ?").get(userId)?.count || 0;
    return {
      products: Array.isArray(state.products) ? state.products.length : 0,
      demands: Array.isArray(state.demands) ? state.demands.length : 0,
      research: Array.isArray(state.research) ? state.research.length : 0,
      news,
    };
  } catch {
    return { products: 0, demands: 0, research: 0, news: 0 };
  }
}

function readStateCountsForUser(userId) {
  if (userId === LEGACY_USER_ID) return { products: 0, demands: 0, research: 0 };
  try {
    const row = db.prepare("SELECT value FROM app_data WHERE key = ?").get(`state:user:${userId}`);
    const state = row?.value ? JSON.parse(row.value) : {};
    return {
      products: Array.isArray(state.products) ? state.products.length : 0,
      demands: Array.isArray(state.demands) ? state.demands.length : 0,
      research: Array.isArray(state.research) ? state.research.length : 0,
    };
  } catch {
    return { products: 0, demands: 0, research: 0 };
  }
}

function readUserWorkspaces(userId) {
  if (!userId || userId === LEGACY_USER_ID) return [];
  return db.prepare(`
    SELECT
      w.id,
      w.slug,
      w.name,
      w.type,
      w.status,
      w.default_ai_policy,
      wm.role,
      wm.status AS member_status,
      wm.is_default,
      wm.joined_at
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ?
    ORDER BY wm.is_default DESC, w.name ASC
  `).all(userId);
}

function enrichUser(row) {
  if (!row) return null;
  const token = db.prepare(`
    SELECT created_at
    FROM api_tokens
    WHERE user_id = ? AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).get(row.id);
  return {
    id: row.id,
    email: row.email || "",
    name: row.name,
    initials: row.initials || "L",
    role: row.role || "成员",
    role_code: row.role_code || "member",
    status: row.status || "active",
    auth_provider: row.auth_provider || "password",
    feishu_open_id: row.feishu_open_id || null,
    feishu_union_id: row.feishu_union_id || null,
    feishu_tenant_key: row.feishu_tenant_key || null,
    avatar_url: row.avatar_url || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at || null,
    last_token_at: token?.created_at || null,
    is_legacy: row.id === LEGACY_USER_ID,
    workspaces: readUserWorkspaces(row.id),
    workspace: readWorkspaceCounts(row.id),
  };
}

function workspaceCounts(workspaceId) {
  const members = db.prepare(`
    SELECT u.id
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ? AND wm.status = 'active'
  `).all(workspaceId);
  const memberIds = members.map((row) => row.id);
  const placeholders = memberIds.map(() => "?").join(",");
  const news = workspaceId
    ? db.prepare(`
      SELECT COUNT(*) AS count
      FROM news_items
      WHERE workspace_id = ?
        OR (${placeholders ? `workspace_id IS NULL AND user_id IN (${placeholders})` : "0"})
    `).get(workspaceId, ...memberIds)?.count || 0
    : 0;
  const totals = memberIds.reduce((acc, userId) => {
    const counts = readStateCountsForUser(userId);
    acc.products += counts.products;
    acc.demands += counts.demands;
    acc.research += counts.research;
    return acc;
  }, { products: 0, demands: 0, research: 0 });
  return { members: memberIds.length, news, ...totals };
}

function enrichWorkspace(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type,
    status: row.status,
    default_ai_policy: row.default_ai_policy,
    created_at: row.created_at,
    updated_at: row.updated_at,
    counts: workspaceCounts(row.id),
  };
}

export function adminListUsers({ q = "", status = "", role = "", auth_provider = "" } = {}) {
  let sql = "SELECT * FROM users WHERE 1 = 1";
  const params = [];
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (role) {
    sql += " AND role_code = ?";
    params.push(role);
  }
  if (auth_provider) {
    sql += " AND auth_provider = ?";
    params.push(auth_provider);
  }
  sql += " ORDER BY created_at ASC";
  let rows = db.prepare(sql).all(...params);
  if (q) {
    const needle = String(q).trim().toLowerCase();
    rows = rows.filter((row) =>
      String(row.name || "").toLowerCase().includes(needle) ||
      String(row.email || "").toLowerCase().includes(needle)
    );
  }
  return rows.map(enrichUser);
}

export function adminGetUser(userId) {
  return enrichUser(db.prepare("SELECT * FROM users WHERE id = ?").get(userId));
}

export function adminDashboard() {
  const users = adminListUsers();
  const workspaces = adminListWorkspaces();
  const activeUsers = users.filter((user) => user.status === "active" && !user.is_legacy);
  const unassignedUsers = users.filter((user) => !user.is_legacy && (user.workspaces || []).length === 0);
  const totals = users.reduce((acc, user) => {
    if (user.is_legacy) return acc;
    acc.products += user.workspace?.products || 0;
    acc.demands += user.workspace?.demands || 0;
    acc.research += user.workspace?.research || 0;
    acc.news += user.workspace?.news || 0;
    return acc;
  }, { products: 0, demands: 0, research: 0, news: 0 });
  return {
    totals: {
      users: users.filter((user) => !user.is_legacy).length,
      active_users: activeUsers.length,
      workspaces: workspaces.length,
      unassigned_users: unassignedUsers.length,
      ...totals,
    },
    workspaces,
    unassigned_users: unassignedUsers,
  };
}

export function adminListWorkspaces() {
  return db.prepare("SELECT * FROM workspaces ORDER BY created_at ASC").all().map(enrichWorkspace);
}

export function adminCreateWorkspace(input = {}) {
  const name = String(input.name || "").trim();
  const slug = String(input.slug || input.name || "").trim();
  if (!name) throw new AppError(400, "workspace_name_required", "工作区名称不能为空。");
  return enrichWorkspace(ensureWorkspace({
    name,
    slug,
    type: input.type || "company",
    status: input.status || "active",
    default_ai_policy: input.default_ai_policy || "platform",
  }));
}

export function adminAssignUserToWorkspace(userId, workspaceId, input = {}) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user || user.id === LEGACY_USER_ID) throw new AppError(404, "user_not_found", "用户不存在。");
  const workspace = db.prepare("SELECT * FROM workspaces WHERE id = ? OR slug = ?").get(workspaceId, workspaceId);
  if (!workspace) throw new AppError(404, "workspace_not_found", "工作区不存在。");
  addWorkspaceMember(workspace.id, user.id, {
    role: input.role || "member",
    status: input.status || "active",
    isDefault: input.is_default !== false,
  });
  return adminGetUser(user.id);
}

export function adminUpdateUser(actorUser, targetId, patch = {}) {
  if (targetId === actorUser.id) {
    throw new AppError(409, "self_protection", "不能修改自己的权限或状态。");
  }
  if (targetId === LEGACY_USER_ID) {
    throw new AppError(403, "legacy_protected", "不能修改访客账号。");
  }

  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(targetId);
  if (!target) throw new AppError(404, "user_not_found", "用户不存在。");

  if (!isOwner(actorUser) && (target.role_code === "owner" || patch.role_code === "owner")) {
    throw new AppError(403, "owner_only", "只有主理人可以修改主理人权限。");
  }

  const updates = {};
  if (patch.role_code !== undefined) {
    if (!VALID_ROLE_CODES.has(patch.role_code)) {
      throw new AppError(400, "invalid_role_code", "role_code 必须是 owner / admin / member。");
    }
    if (target.role_code === "owner" && patch.role_code !== "owner") {
      const otherOwners = db.prepare(`
        SELECT COUNT(*) AS count
        FROM users
        WHERE role_code = 'owner' AND status = 'active' AND id <> ?
      `).get(targetId)?.count || 0;
      if (otherOwners === 0) {
        throw new AppError(409, "last_owner_protected", "不能降级最后一个主理人。");
      }
    }
    updates.role_code = patch.role_code;
    updates.role = ROLE_LABEL[patch.role_code] || target.role;
  }
  if (patch.status !== undefined) {
    if (!VALID_USER_STATUSES.has(patch.status)) {
      throw new AppError(400, "invalid_status", "status 必须是 active / suspended / deleted。");
    }
    if (target.role_code === "owner" && patch.status !== "active") {
      const otherOwners = db.prepare(`
        SELECT COUNT(*) AS count
        FROM users
        WHERE role_code = 'owner' AND status = 'active' AND id <> ?
      `).get(targetId)?.count || 0;
      if (otherOwners === 0) {
        throw new AppError(409, "last_owner_protected", "不能停用最后一个主理人。");
      }
    }
    updates.status = patch.status;
  }

  if (Object.keys(updates).length === 0) return enrichUser(target);

  const keys = Object.keys(updates);
  db.prepare(`
    UPDATE users
    SET ${keys.map((key) => `${key} = ?`).join(", ")}, updated_at = ?
    WHERE id = ?
  `).run(...keys.map((key) => updates[key]), nowIso(), targetId);

  if (updates.status && updates.status !== "active") {
    revokeUserApiTokens(targetId);
    purgeUserSessions(targetId);
  }

  return adminGetUser(targetId);
}

export function adminForceSignout(actorUser, targetId) {
  if (targetId === actorUser.id) {
    throw new AppError(409, "self_protection", "不能强制退出自己。");
  }
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(targetId);
  if (!target) throw new AppError(404, "user_not_found", "用户不存在。");
  const activeTokens = db.prepare(`
    SELECT COUNT(*) AS count
    FROM api_tokens
    WHERE user_id = ? AND revoked_at IS NULL
  `).get(targetId)?.count || 0;
  revokeUserApiTokens(targetId);
  const purgedSessions = purgeUserSessions(targetId);
  return { ok: true, revoked_tokens: activeTokens, purged_sessions: purgedSessions };
}
