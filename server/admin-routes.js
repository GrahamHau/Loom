import { Router } from "express";
import { AppError } from "./ai-service.js";
import { requireAdmin } from "./access-control.js";
import {
  adminAssignUserToWorkspace,
  adminCreateWorkspace,
  adminDashboard,
  adminForceSignout,
  adminGetPlatformAiConfig,
  adminGetUser,
  adminListUsers,
  adminListWorkspaces,
  adminUpdatePlatformAiConfig,
  adminUpdateUser,
} from "./admin-service.js";
import { listLLMLogs, summarizeLLMLogs } from "./llm-log-service.js";

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const router = Router();

router.use(requireAdmin);

router.get("/dashboard", asyncHandler(async (_req, res) => {
  res.json(adminDashboard());
}));

router.get("/workspaces", asyncHandler(async (_req, res) => {
  const items = adminListWorkspaces();
  res.json({ items, total: items.length });
}));

router.get("/observability/llm/summary", asyncHandler(async (req, res) => {
  res.json(summarizeLLMLogs({ days: req.query.days }));
}));

router.get("/observability/llm/logs", asyncHandler(async (req, res) => {
  const { user_id, workspace_id, kind, purpose, status, limit } = req.query;
  const items = listLLMLogs({ userId: user_id, workspaceId: workspace_id, kind, purpose, status, limit });
  res.json({ items, total: items.length });
}));

router.get("/platform-ai", asyncHandler(async (_req, res) => {
  res.json(adminGetPlatformAiConfig());
}));

router.patch("/platform-ai", asyncHandler(async (req, res) => {
  res.json(adminUpdatePlatformAiConfig(req.adminUser, req.body || {}));
}));

router.post("/workspaces", asyncHandler(async (req, res) => {
  res.status(201).json(adminCreateWorkspace(req.body || {}));
}));

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

router.post("/users/:id/workspaces/:workspaceId", asyncHandler(async (req, res) => {
  res.json(adminAssignUserToWorkspace(req.params.id, req.params.workspaceId, req.body || {}));
}));

export default router;
