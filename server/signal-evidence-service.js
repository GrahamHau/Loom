import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { db } from "./db.js";
import { migrateKnowledgeSchema } from "./knowledge-schema.js";

migrateKnowledgeSchema();

function nowIso() {
  return new Date().toISOString();
}

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

function stableJson(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function normalizedUrl(value) {
  const text = cleanText(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    url.hash = "";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return text;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function signalHash(input) {
  const provided = cleanText(input.hash);
  if (/^[a-f0-9]{64}$/i.test(provided)) return provided.toLowerCase();
  return sha256(stableJson({
    origin: cleanText(input.origin, "manual"),
    type: cleanText(input.type, "raw"),
    source_url: normalizedUrl(input.source_url),
    raw_payload: input.raw_payload ?? {},
  }));
}

function jsonText(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function mapSignal(row) {
  if (!row) return null;
  return {
    id: row.id,
    signal_id: row.id,
    workspace_id: row.workspace_id,
    origin: row.origin,
    type: row.type,
    source_url: row.source_url || "",
    source_title: row.source_title || "",
    raw_payload: parseJson(row.raw_payload_json, {}),
    hash: row.hash,
    seen_count: Number(row.seen_count || 0),
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    created_by: row.created_by || "",
    metadata: parseJson(row.metadata_json, {}),
  };
}

function mapEvidence(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    kind: row.kind,
    claim_text: row.claim_text,
    confidence: Number(row.confidence || 0),
    extracted_by: row.extracted_by,
    signal_ids: parseJson(row.signal_ids_json, []),
    metadata: parseJson(row.metadata_json, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function upsertSignal(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  if (!workspaceId) {
    const error = new Error("workspace_id required");
    error.status = 400;
    throw error;
  }
  const hash = signalHash(input);
  const existing = db.prepare("SELECT * FROM signals WHERE workspace_id = ? AND hash = ?").get(workspaceId, hash);
  if (existing) {
    const lastSeenAt = nowIso();
    db.prepare(`
      UPDATE signals
      SET seen_count = seen_count + 1,
          last_seen_at = ?,
          source_title = COALESCE(NULLIF(?, ''), source_title),
          metadata_json = ?
      WHERE id = ?
    `).run(
      lastSeenAt,
      cleanText(input.source_title),
      jsonText(input.metadata, {}),
      existing.id
    );
    const signal = mapSignal(db.prepare("SELECT * FROM signals WHERE id = ?").get(existing.id));
    return { ...signal, deduplicated: true };
  }

  const id = input.id || `sig_${nanoid(12)}`;
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO signals (
      id, workspace_id, origin, type, source_url, source_title, raw_payload_json,
      hash, seen_count, first_seen_at, last_seen_at, created_by, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(
    id,
    workspaceId,
    cleanText(input.origin, "manual"),
    cleanText(input.type, "raw"),
    normalizedUrl(input.source_url),
    cleanText(input.source_title),
    jsonText(input.raw_payload, {}),
    hash,
    timestamp,
    timestamp,
    cleanText(input.created_by),
    jsonText(input.metadata, {})
  );
  return { ...mapSignal(db.prepare("SELECT * FROM signals WHERE id = ?").get(id)), deduplicated: false };
}

export function getSignal(id, workspaceId) {
  return mapSignal(db.prepare("SELECT * FROM signals WHERE id = ? AND workspace_id = ?").get(cleanText(id), cleanText(workspaceId)));
}

export function createEvidence(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const signalIds = Array.isArray(input.signal_ids) ? input.signal_ids.map((id) => cleanText(id)).filter(Boolean) : [];
  if (!signalIds.length) {
    const error = new Error("signal_ids required");
    error.status = 400;
    throw error;
  }
  const existingSignals = db.prepare(`
    SELECT id FROM signals
    WHERE workspace_id = ?
      AND id IN (${signalIds.map(() => "?").join(",")})
  `).all(workspaceId, ...signalIds).map((row) => row.id);
  const missing = signalIds.filter((id) => !existingSignals.includes(id));
  if (missing.length) {
    const error = new Error(`signal not found: ${missing.join(", ")}`);
    error.status = 400;
    throw error;
  }

  const id = input.id || `ev_${nanoid(12)}`;
  const timestamp = nowIso();
  const links = Array.isArray(input.links) ? input.links : [];
  const insert = db.transaction(() => {
    db.prepare(`
      INSERT INTO evidences (
        id, workspace_id, kind, claim_text, confidence, extracted_by,
        signal_ids_json, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      workspaceId,
      cleanText(input.kind, "claim"),
      cleanText(input.claim_text),
      Number(input.confidence ?? 1),
      cleanText(input.extracted_by, "human"),
      jsonText(signalIds, []),
      jsonText(input.metadata, {}),
      timestamp,
      timestamp
    );

    for (const link of links) {
      const entityType = cleanText(link?.entity_type);
      const entityId = cleanText(link?.entity_id);
      if (!entityType || !entityId) continue;
      db.prepare(`
        INSERT OR IGNORE INTO evidence_links (
          id, workspace_id, evidence_id, entity_type, entity_id, field_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `evl_${nanoid(12)}`,
        workspaceId,
        id,
        entityType,
        entityId,
        cleanText(link?.field_path),
        timestamp
      );
    }
  });
  insert();
  return mapEvidence(db.prepare("SELECT * FROM evidences WHERE id = ?").get(id));
}

export function listEvidencesForEntity({ workspace_id, entity_type, entity_id } = {}) {
  return db.prepare(`
    SELECT e.*
    FROM evidence_links l
    JOIN evidences e ON e.id = l.evidence_id
    WHERE l.workspace_id = ?
      AND l.entity_type = ?
      AND l.entity_id = ?
    ORDER BY e.created_at DESC, e.id DESC
  `).all(cleanText(workspace_id), cleanText(entity_type), cleanText(entity_id)).map(mapEvidence);
}

export function listEvidenceLinksForInput(input = {}) {
  return Array.isArray(input.links)
    ? input.links
        .map((link) => ({
          entity_type: cleanText(link?.entity_type),
          entity_id: cleanText(link?.entity_id),
        }))
        .filter((link) => link.entity_type && link.entity_id)
    : [];
}
