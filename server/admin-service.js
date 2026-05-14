import { AppError } from "./ai-service.js";
import { ROLE_LABEL, VALID_ROLE_CODES, VALID_USER_STATUSES, isOwner } from "./access-control.js";
import { db, LEGACY_USER_ID, purgeUserSessions, revokeUserApiTokens } from "./db.js";

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
    workspace: readWorkspaceCounts(row.id),
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
