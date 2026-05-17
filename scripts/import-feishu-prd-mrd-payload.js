#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
import { GRAHAM_FEISHU_USER_ID, GRAHAM_WORKSPACE_ID } from "./feishu-prd-mrd-candidates.js";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const commit = Boolean(args.commit);
  const file = String(args.file || "").trim();
  const userId = String(args.user || "").trim();
  const workspaceId = String(args.workspace || "").trim();

  if (!file) throw new Error("--file is required");
  if (userId !== GRAHAM_FEISHU_USER_ID) throw new Error(`Refusing to import: --user must be ${GRAHAM_FEISHU_USER_ID}`);
  if (workspaceId !== GRAHAM_WORKSPACE_ID) throw new Error(`Refusing to import: --workspace must be ${GRAHAM_WORKSPACE_ID}`);
  if (!commit) throw new Error("Refusing to write without --commit. This importer is production-only.");

  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  assertPayloadTarget(payload, { userId, workspaceId });

  const [{ db, migrate }, { importPastedDocument }] = await Promise.all([
    import("../server/db.js"),
    import("../server/document-import-service.js"),
  ]);
  migrate();
  assertTargetExists(db, { userId, workspaceId });
  const summary = [];

  for (const item of Array.isArray(payload.items) ? payload.items : []) {
    if (item.read_status !== "ok") {
      summary.push({ title: item.title, status: "skipped_unreadable", error: item.error || "" });
      continue;
    }
    const existing = item.source_uri
      ? db.prepare("SELECT id, title FROM documents WHERE workspace_id = ? AND source_uri = ?").get(workspaceId, item.source_uri)
      : null;
    if (existing) {
      summary.push({ title: item.title, status: "skipped_existing", document_id: existing.id });
      continue;
    }
    const result = await importPastedDocument({
      workspace_id: workspaceId,
      doc_type: item.doc_type,
      import_method: "feishu_doc",
      title: item.title,
      source_uri: item.source_uri,
      raw_blocks: item.raw_blocks,
      text: item.text,
      created_by: userId,
    });
    summary.push({
      title: item.title,
      doc_type: item.doc_type,
      status: result.import?.status || "unknown",
      document_id: result.document?.id || "",
      owner_user_id: result.document?.owner_user_id || "",
      workspace_id: result.document?.workspace_id || workspaceId,
      section_keys: result.document?.content?.normalized_sections?.map((section) => section.key) || [],
      entity_count: result.knowledge?.entities?.length || 0,
      error: result.error || "",
    });
  }

  console.log(JSON.stringify({
    commit,
    workspace_id: workspaceId,
    user_id: userId,
    summary,
  }, null, 2));
}

function assertTargetExists(db, { userId, workspaceId }) {
  const user = db.prepare("SELECT id, name, auth_provider FROM users WHERE id = ?").get(userId);
  if (!user) throw new Error(`Refusing to import: user not found in this database: ${userId}`);
  const member = db.prepare("SELECT workspace_id, user_id, status FROM workspace_members WHERE workspace_id = ? AND user_id = ?").get(workspaceId, userId);
  if (!member || member.status !== "active") {
    throw new Error(`Refusing to import: user ${userId} is not an active member of ${workspaceId}`);
  }
}

function assertPayloadTarget(payload, target) {
  if (payload?.target?.user_id !== target.userId) {
    throw new Error(`Payload target user mismatch: expected ${target.userId}`);
  }
  if (payload?.target?.workspace_id !== target.workspaceId) {
    throw new Error(`Payload target workspace mismatch: expected ${target.workspaceId}`);
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
