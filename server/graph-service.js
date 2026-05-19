import { nanoid } from "nanoid";
import { db } from "./db.js";
import { getKnowledgeEntity, getKnowledgeRelation, listKnowledgeRelations } from "./knowledge-repository.js";
import { migrateKnowledgeSchema } from "./knowledge-schema.js";

migrateKnowledgeSchema();

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

function jsonText(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function nodeOpenUrl(entity = {}) {
  const refs = Array.isArray(entity.source_refs) ? entity.source_refs : [];
  const ref = refs[0] || {};
  if (ref.source_type === "competitor" || ref.product_id) return `/products/${ref.source_id || ref.product_id}`;
  if (ref.document_id) return `/documents/${ref.document_id}`;
  if (ref.source_type === "demand_cluster") return `/demands?cluster=${ref.source_id}`;
  return null;
}

function mapNode(entity, distance) {
  return {
    id: entity.id,
    type: entity.entity_type || entity.type,
    label: entity.canonical_name,
    summary: entity.summary || "",
    distance,
    review_status: entity.review_required ? "needs_review" : "approved",
    status: entity.status,
    source_refs: entity.source_refs || [],
    open_url: nodeOpenUrl(entity),
  };
}

function mapEdge(relation) {
  const sourceRefs = relation.source_refs || [];
  return {
    id: relation.id,
    from: relation.from_entity_id,
    to: relation.to_entity_id,
    type: relation.relation_type || relation.type,
    label: relation.relation_type || relation.type,
    confidence: Number(relation.confidence || 0),
    evidence_ids: sourceRefs.flatMap((ref) => Array.isArray(ref.evidence_ids) ? ref.evidence_ids : []),
    source_refs: sourceRefs,
    review_status: relation.review_required ? "needs_review" : "approved",
  };
}

function relationAllowed(edge, relationTypes, direction, currentId) {
  if (relationTypes.length && !relationTypes.includes(edge.relation_type)) return false;
  if (direction === "outgoing" && edge.from_entity_id !== currentId) return false;
  if (direction === "incoming" && edge.to_entity_id !== currentId) return false;
  return true;
}

export function getGraph(entityId, input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const relationTypes = cleanText(input.relation_types).split(",").map(cleanText).filter(Boolean);
  const direction = cleanText(input.direction, "both");
  let root = getKnowledgeEntity(entityId);
  if (root?.status === "merged") {
    const mergedInto = root.metadata?.merged_into_id || parseJson(root.metadata_json, {})?.merged_into_id;
    if (mergedInto) root = getKnowledgeEntity(mergedInto) || root;
  }
  if (!root || root.workspace_id !== workspaceId) return null;
  const radius = Math.max(1, Math.min(3, Number(input.radius || 1)));
  const distances = new Map([[root.id, 0]]);
  const nodes = new Map([[root.id, root]]);
  const edges = new Map();
  let frontier = [root.id];
  for (let depth = 0; depth < radius; depth += 1) {
    const next = [];
    for (const id of frontier) {
      const relations = listKnowledgeRelations(workspaceId, { entity_id: id });
      for (const relation of relations) {
        if (!relationAllowed(relation, relationTypes, direction, id)) continue;
        edges.set(relation.id, relation);
        for (const peerId of [relation.from_entity_id, relation.to_entity_id]) {
          if (distances.has(peerId)) continue;
          const entity = getKnowledgeEntity(peerId);
          if (!entity || entity.workspace_id !== workspaceId) continue;
          if (entity.status === "merged" && input.include_merged !== "true") continue;
          distances.set(peerId, depth + 1);
          nodes.set(peerId, entity);
          next.push(peerId);
        }
      }
    }
    frontier = next;
  }
  const nodeList = [...nodes.values()].map((node) => mapNode(node, distances.get(node.id) || 0))
    .sort((a, b) => a.distance - b.distance || a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
  const edgeList = [...edges.values()].map(mapEdge).filter((edge) => nodes.has(edge.from) && nodes.has(edge.to));
  const truncated = nodeList.length > 120 || edgeList.length > 220;
  if (input.user_id) {
    db.prepare(`
      INSERT INTO graph_view_events (id, root_entity_id, event_type, user_id, workspace_id, created_at)
      VALUES (?, ?, 'open', ?, ?, CURRENT_TIMESTAMP)
    `).run(`gve_${nanoid(12)}`, root.id, cleanText(input.user_id), workspaceId);
  }
  return {
    root_entity_id: root.id,
    radius,
    nodes: nodeList.slice(0, 120),
    edges: edgeList.slice(0, 220),
    truncated,
    next_focus_suggestions: truncated ? nodeList.slice(120, 130).map((node) => node.id) : [],
  };
}

function mapGraphView(row) {
  if (!row) return null;
  return { ...row, filters_json: parseJson(row.filters_json, {}) };
}

export function createGraphView(input = {}) {
  const row = {
    id: input.id || `gv_${nanoid(12)}`,
    name: cleanText(input.name, "未命名图谱视图"),
    root_entity_id: cleanText(input.root_entity_id),
    radius: Math.max(1, Math.min(3, Number(input.radius || 2))),
    filters_json: jsonText(input.filters_json || input.filters, {}),
    owner_user_id: cleanText(input.owner_user_id || input.user_id),
    workspace_id: cleanText(input.workspace_id),
  };
  db.prepare(`
    INSERT INTO graph_views (
      id, name, root_entity_id, radius, filters_json, owner_user_id, workspace_id, created_at, updated_at
    ) VALUES (
      @id, @name, @root_entity_id, @radius, @filters_json, @owner_user_id, @workspace_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(row);
  return mapGraphView(db.prepare("SELECT * FROM graph_views WHERE id = ?").get(row.id));
}

export function listGraphViews(workspaceId) {
  return db.prepare("SELECT * FROM graph_views WHERE workspace_id = ? ORDER BY updated_at DESC").all(cleanText(workspaceId)).map(mapGraphView);
}

export function getGraphView(id) {
  return mapGraphView(db.prepare("SELECT * FROM graph_views WHERE id = ?").get(cleanText(id)));
}

export function updateGraphView(id, patch = {}) {
  const current = db.prepare("SELECT * FROM graph_views WHERE id = ?").get(cleanText(id));
  if (!current) return null;
  const row = {
    id: current.id,
    name: patch.name !== undefined ? cleanText(patch.name, current.name) : current.name,
    radius: patch.radius !== undefined ? Math.max(1, Math.min(3, Number(patch.radius || current.radius))) : current.radius,
    filters_json: patch.filters_json !== undefined || patch.filters !== undefined ? jsonText(patch.filters_json || patch.filters, {}) : current.filters_json,
  };
  db.prepare("UPDATE graph_views SET name = @name, radius = @radius, filters_json = @filters_json, updated_at = CURRENT_TIMESTAMP WHERE id = @id").run(row);
  return mapGraphView(db.prepare("SELECT * FROM graph_views WHERE id = ?").get(current.id));
}
