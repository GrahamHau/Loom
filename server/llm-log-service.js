import { nanoid } from "nanoid";
import { db } from "./db.js";

function defaultWorkspaceId(userId) {
  if (!userId) return null;
  try {
    return db.prepare(`
      SELECT workspace_id
      FROM workspace_members
      WHERE user_id = ? AND status = 'active'
      ORDER BY is_default DESC, joined_at ASC
      LIMIT 1
    `).get(userId)?.workspace_id || null;
  } catch {
    return null;
  }
}

export function recordLLMCall({
  userId,
  workspaceId,
  kind = "text",
  purpose = "unknown",
  model,
  apiUrl,
  status = "ok",
  httpStatus,
  durationMs,
  promptTokens,
  completionTokens,
  totalTokens,
  errorCode,
  errorMessage,
} = {}) {
  try {
    db.prepare(`
      INSERT INTO llm_call_logs (
        id, user_id, workspace_id, kind, purpose, model, api_url, status,
        http_status, duration_ms, prompt_tokens, completion_tokens, total_tokens,
        error_code, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      nanoid(12),
      String(userId || ""),
      workspaceId || defaultWorkspaceId(userId),
      String(kind || "text"),
      String(purpose || "unknown"),
      model || null,
      apiUrl || null,
      String(status || "ok"),
      httpStatus ?? null,
      durationMs ?? null,
      promptTokens ?? null,
      completionTokens ?? null,
      totalTokens ?? null,
      errorCode || null,
      errorMessage ? String(errorMessage).slice(0, 500) : null
    );
  } catch (error) {
    console.error("[loom] record LLM call failed", error);
  }
}

export function listLLMLogs({ userId = "", workspaceId = "", kind = "", purpose = "", status = "", limit = 100 } = {}) {
  let sql = `
    SELECT l.*, u.name AS user_name, w.name AS workspace_name, w.slug AS workspace_slug
    FROM llm_call_logs l
    LEFT JOIN users u ON u.id = l.user_id
    LEFT JOIN workspaces w ON w.id = l.workspace_id
    WHERE 1 = 1
  `;
  const params = [];
  if (userId) {
    sql += " AND l.user_id = ?";
    params.push(userId);
  }
  if (workspaceId) {
    sql += " AND l.workspace_id = ?";
    params.push(workspaceId);
  }
  if (kind) {
    sql += " AND l.kind = ?";
    params.push(kind);
  }
  if (purpose) {
    sql += " AND l.purpose = ?";
    params.push(purpose);
  }
  if (status) {
    sql += " AND l.status = ?";
    params.push(status);
  }
  sql += " ORDER BY l.created_at DESC, l.rowid DESC LIMIT ?";
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 500));
  return db.prepare(sql).all(...params);
}

export function summarizeLLMLogs({ days = 7 } = {}) {
  const since = new Date(Date.now() - Math.max(1, Number(days) || 7) * 86400_000).toISOString();
  const rows = db.prepare(`
    SELECT *
    FROM llm_call_logs
    WHERE created_at >= ?
  `).all(since);
  const errors = rows.filter((row) => row.status !== "ok").length;
  const totalDuration = rows.reduce((sum, row) => sum + Number(row.duration_ms || 0), 0);
  const totalTokens = rows.reduce((sum, row) => sum + Number(row.total_tokens || 0), 0);
  const byKind = new Map();
  const byPurpose = new Map();
  const byWorkspace = new Map();

  for (const row of rows) {
    const kindKey = row.kind || "unknown";
    byKind.set(kindKey, (byKind.get(kindKey) || 0) + 1);
    const purposeKey = row.purpose || "unknown";
    const purposeEntry = byPurpose.get(purposeKey) || { purpose: purposeKey, calls: 0, errors: 0, tokens: 0 };
    purposeEntry.calls += 1;
    purposeEntry.tokens += Number(row.total_tokens || 0);
    if (row.status !== "ok") purposeEntry.errors += 1;
    byPurpose.set(purposeKey, purposeEntry);
    const workspaceKey = row.workspace_id || "unassigned";
    const workspaceEntry = byWorkspace.get(workspaceKey) || { workspace_id: row.workspace_id, calls: 0, errors: 0, tokens: 0 };
    workspaceEntry.calls += 1;
    workspaceEntry.tokens += Number(row.total_tokens || 0);
    if (row.status !== "ok") workspaceEntry.errors += 1;
    byWorkspace.set(workspaceKey, workspaceEntry);
  }

  const workspaceIds = [...byWorkspace.values()].map((entry) => entry.workspace_id).filter(Boolean);
  const workspaceRows = workspaceIds.length
    ? db.prepare(`SELECT id, name, slug FROM workspaces WHERE id IN (${workspaceIds.map(() => "?").join(",")})`).all(...workspaceIds)
    : [];
  const workspaceById = new Map(workspaceRows.map((row) => [row.id, row]));

  return {
    since,
    total: {
      calls: rows.length,
      errors,
      error_rate: rows.length ? errors / rows.length : 0,
      tokens: totalTokens,
      avg_duration_ms: rows.length ? Math.round(totalDuration / rows.length) : 0,
    },
    by_kind: Object.fromEntries(byKind),
    by_purpose: [...byPurpose.values()].sort((a, b) => b.calls - a.calls).slice(0, 10),
    by_workspace: [...byWorkspace.values()]
      .map((entry) => ({
        ...entry,
        workspace_name: entry.workspace_id ? workspaceById.get(entry.workspace_id)?.name || entry.workspace_id : "未分配",
        workspace_slug: entry.workspace_id ? workspaceById.get(entry.workspace_id)?.slug || "" : "",
      }))
      .sort((a, b) => b.calls - a.calls),
  };
}
