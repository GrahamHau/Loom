import { Router } from "express";
import { AppError } from "./ai-service.js";
import { requireAdmin } from "./access-control.js";
import {
  adminForceSignout,
  adminGetUser,
  adminListUsers,
  adminUpdateUser,
} from "./admin-service.js";

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const router = Router();

router.use(requireAdmin);

router.get("/users", asyncHandler(async (req, res) => {
  const { q, status, role, auth_provider } = req.query;
  const items = adminListUsers({ q, status, role, auth_provider });
  res.json({ items, total: items.length });
}));

router.get("/users/:id", asyncHandler(async (req, res) => {
  const user = adminGetUser(req.params.id);
  if (!user) throw new AppError(404, "user_not_found", "用户不存在。");
  res.json(user);
}));

router.patch("/users/:id", asyncHandler(async (req, res) => {
  res.json(adminUpdateUser(req.adminUser, req.params.id, req.body || {}));
}));

router.post("/users/:id/force-signout", asyncHandler(async (req, res) => {
  res.json(adminForceSignout(req.adminUser, req.params.id));
}));

export default router;
