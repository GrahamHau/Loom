import { nanoid } from "nanoid";
import { db } from "./db.js";
import { migrateKnowledgeSchema } from "./knowledge-schema.js";

migrateKnowledgeSchema();

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function parseTime(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : Date.now();
}

function languageFor(text) {
  const source = cleanText(text);
  const hasZh = /[\u4e00-\u9fff]/.test(source);
  const hasEn = /[a-z]/i.test(source);
  return hasZh && hasEn ? "mixed" : hasEn ? "en" : "zh";
}

function clusterKeyForDemand(demand = {}) {
  const text = `${demand.title || ""} ${demand.summary || ""} ${demand.original_content || ""}`.toLowerCase();
  if (/快装|arca|quick\s*release|quick\s*mount/.test(text)) return "quick_release";
  if (/续航|电池|battery|runtime|run\s*time/.test(text)) return "battery_runtime";
  if (/色温|color\s*temp|2700|6500/.test(text)) return "color_temperature";
  return cleanText(demand.title || demand.summary || demand.id, "需求").slice(0, 24).toLowerCase();
}

function canonicalFor(key, demand = {}) {
  if (key === "quick_release") return "快装板 / Arca 兼容性";
  if (key === "battery_runtime") return "续航更久";
  if (key === "color_temperature") return "色温范围";
  return cleanText(demand.title || demand.summary, "未命名需求");
}

function ensureWeights(workspaceId) {
  db.prepare(`
    INSERT OR IGNORE INTO heat_weight_settings (
      workspace_id, weight_mentions_7d, weight_mentions_30d, weight_internal_questions_30d
    ) VALUES (?, 3, 1, 5)
  `).run(workspaceId);
  return db.prepare("SELECT * FROM heat_weight_settings WHERE workspace_id = ?").get(workspaceId);
}

function mapCluster(row) {
  if (!row) return null;
  return {
    id: row.id,
    canonical_text: row.canonical_text,
    language: row.language,
    member_count: Number(row.member_count || 0),
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    status: row.status,
    merged_into: row.merged_into || null,
    workspace_id: row.workspace_id,
  };
}

function countSince(clusterId, days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return Number(db.prepare(`
    SELECT COUNT(*) AS count FROM demand_cluster_members
    WHERE cluster_id = ? AND added_at >= ?
  `).get(clusterId, cutoff).count || 0);
}

function questionHitsSince(clusterId, days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return Number(db.prepare(`
    SELECT COUNT(*) AS count FROM demand_cluster_question_hits
    WHERE cluster_id = ? AND asked_at >= ?
  `).get(clusterId, cutoff).count || 0);
}

function clusterWithHeat(row) {
  const cluster = typeof row === "string"
    ? mapCluster(db.prepare("SELECT * FROM demand_clusters WHERE id = ?").get(row))
    : mapCluster(row);
  if (!cluster) return null;
  const weights = ensureWeights(cluster.workspace_id);
  const mentions7d = countSince(cluster.id, 7);
  const mentions30d = countSince(cluster.id, 30);
  const mentions90d = countSince(cluster.id, 90);
  const internalQuestions30d = questionHitsSince(cluster.id, 30);
  return {
    ...cluster,
    mentions_7d: mentions7d,
    mentions_30d: mentions30d,
    mentions_90d: mentions90d,
    internal_questions_30d: internalQuestions30d,
    heat: (Number(weights.weight_mentions_7d) * mentions7d) +
      (Number(weights.weight_mentions_30d) * mentions30d) +
      (Number(weights.weight_internal_questions_30d) * internalQuestions30d),
  };
}

function refreshClusterStats(clusterId) {
  const rows = db.prepare("SELECT added_at FROM demand_cluster_members WHERE cluster_id = ? ORDER BY added_at").all(clusterId);
  const first = rows[0]?.added_at || nowIso();
  const last = rows.at(-1)?.added_at || first;
  db.prepare(`
    UPDATE demand_clusters
    SET member_count = ?, first_seen_at = ?, last_seen_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(rows.length, first, last, clusterId);
}

function createCluster({ workspaceId, canonicalText, language }) {
  const id = `dc_${nanoid(12)}`;
  db.prepare(`
    INSERT INTO demand_clusters (id, canonical_text, language, workspace_id)
    VALUES (?, ?, ?, ?)
  `).run(id, canonicalText, language, workspaceId);
  return id;
}

function addMember({ clusterId, workspaceId, demandId, addedAt, addedBy = "auto" }) {
  db.prepare(`
    INSERT OR IGNORE INTO demand_cluster_members (
      id, cluster_id, demand_id, added_at, added_by, workspace_id
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(`dcm_${nanoid(12)}`, clusterId, demandId, addedAt || nowIso(), addedBy, workspaceId);
  refreshClusterStats(clusterId);
}

export function recomputeDemandClusters({ workspace_id, demands = [], only_unclustered = true } = {}) {
  const workspaceId = cleanText(workspace_id);
  if (!workspaceId) throw new Error("workspace_id_required");
  ensureWeights(workspaceId);
  const unclustered = only_unclustered
    ? demands.filter((demand) => !db.prepare("SELECT id FROM demand_cluster_members WHERE workspace_id = ? AND demand_id = ?").get(workspaceId, demand.id))
    : demands;
  const byKey = new Map();
  for (const demand of unclustered) {
    const key = clusterKeyForDemand(demand);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(demand);
  }
  let clustersCreated = 0;
  for (const [key, members] of byKey) {
    if (!members.length) continue;
    const canonicalText = canonicalFor(key, members[0]);
    let clusterId = db.prepare(`
      SELECT id FROM demand_clusters
      WHERE workspace_id = ? AND canonical_text = ? AND status = 'active'
    `).get(workspaceId, canonicalText)?.id;
    if (!clusterId) {
      clusterId = createCluster({ workspaceId, canonicalText, language: languageFor(canonicalText) });
      clustersCreated += 1;
    }
    for (const demand of members) {
      addMember({
        clusterId,
        workspaceId,
        demandId: demand.id,
        addedAt: demand.created_at || demand.updated_at || demand.date || nowIso(),
      });
    }
  }
  return {
    job_id: `dcj_${nanoid(12)}`,
    estimated_demands: unclustered.length,
    clusters_created: clustersCreated,
  };
}

export function listDemandClusters(workspaceId, filters = {}) {
  const status = cleanText(filters.status, "active");
  const clauses = ["workspace_id = ?"];
  const params = [workspaceId];
  if (status !== "all") {
    clauses.push("status = ?");
    params.push(status);
  }
  const clusters = db.prepare(`SELECT * FROM demand_clusters WHERE ${clauses.join(" AND ")}`)
    .all(...params)
    .map(clusterWithHeat)
    .filter(Boolean);
  if (filters.order === "recent") {
    return clusters.sort((a, b) => parseTime(b.last_seen_at) - parseTime(a.last_seen_at));
  }
  return clusters.sort((a, b) => b.heat - a.heat);
}

export function getDemandCluster(id, workspaceId) {
  const row = db.prepare("SELECT * FROM demand_clusters WHERE id = ? AND workspace_id = ?").get(id, workspaceId);
  const cluster = clusterWithHeat(row);
  if (!cluster) return null;
  return {
    ...cluster,
    members: db.prepare("SELECT demand_id, added_at, added_by FROM demand_cluster_members WHERE cluster_id = ? ORDER BY added_at").all(id),
  };
}

export function recordDemandClusterQuestionHit(id, input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const cluster = db.prepare("SELECT id FROM demand_clusters WHERE id = ? AND workspace_id = ?").get(id, workspaceId);
  if (!cluster) {
    const error = new Error("demand_cluster_not_found");
    error.status = 404;
    throw error;
  }
  db.prepare(`
    INSERT INTO demand_cluster_question_hits (
      id, cluster_id, asked_at, asker_id, query_text, workspace_id
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(`dcqh_${nanoid(12)}`, id, nowIso(), cleanText(input.asker_id), cleanText(input.query_text), workspaceId);
  return clusterWithHeat(id);
}

export function mergeDemandCluster(id, input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const targetId = cleanText(input.target_id);
  if (!workspaceId || !targetId || id === targetId) throw new Error("invalid_merge");
  const moved = Number(db.prepare("SELECT COUNT(*) AS count FROM demand_cluster_members WHERE cluster_id = ?").get(id).count || 0);
  db.prepare("UPDATE OR IGNORE demand_cluster_members SET cluster_id = ? WHERE cluster_id = ?").run(targetId, id);
  db.prepare("UPDATE demand_clusters SET status = 'merged', merged_into = ?, member_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?").run(targetId, id, workspaceId);
  refreshClusterStats(targetId);
  return { target: clusterWithHeat(targetId), moved_members: moved };
}

export function splitDemandCluster(id, input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const demandIds = Array.isArray(input.split_demand_ids) ? input.split_demand_ids.map(cleanText).filter(Boolean) : [];
  const canonicalText = cleanText(input.new_canonical_text, "拆分需求");
  if (!workspaceId || !demandIds.length) throw new Error("invalid_split");
  const newClusterId = createCluster({ workspaceId, canonicalText, language: languageFor(canonicalText) });
  let moved = 0;
  for (const demandId of demandIds) {
    const row = db.prepare("SELECT * FROM demand_cluster_members WHERE cluster_id = ? AND demand_id = ?").get(id, demandId);
    if (!row) continue;
    db.prepare("UPDATE demand_cluster_members SET cluster_id = ? WHERE id = ?").run(newClusterId, row.id);
    moved += 1;
  }
  refreshClusterStats(id);
  refreshClusterStats(newClusterId);
  return { new_cluster_id: newClusterId, moved_members: moved, cluster: clusterWithHeat(newClusterId) };
}
