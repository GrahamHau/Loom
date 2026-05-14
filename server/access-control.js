import { LEGACY_USER_ID } from "./db.js";

export const ROLE_OWNER = "owner";
export const ROLE_ADMIN = "admin";
export const ROLE_MEMBER = "member";

export const ROLE_LABEL = {
  owner: "主理人",
  admin: "管理员",
  member: "成员",
};

export const VALID_ROLE_CODES = new Set([ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER]);
export const VALID_USER_STATUSES = new Set(["active", "suspended", "deleted"]);

export function isAdmin(user) {
  if (!user || user.id === LEGACY_USER_ID) return false;
  if (user.status !== "active") return false;
  return user.role_code === ROLE_OWNER || user.role_code === ROLE_ADMIN;
}

export function isOwner(user) {
  if (!user || user.id === LEGACY_USER_ID) return false;
  if (user.status !== "active") return false;
  return user.role_code === ROLE_OWNER;
}

export function requireAdmin(req, res, next) {
  const user = req.currentUser?.() || null;
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (!isAdmin(user)) {
    return res.status(403).json({ error: "forbidden", message: "需要管理员权限" });
  }
  req.adminUser = user;
  next();
}

export function requireOwner(req, res, next) {
  const user = req.currentUser?.() || null;
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (!isOwner(user)) {
    return res.status(403).json({ error: "forbidden", message: "需要主理人权限" });
  }
  req.adminUser = user;
  next();
}
