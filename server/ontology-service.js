import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { db } from "./db.js";
import {
  createKnowledgeEntity,
  createKnowledgeFusionCandidate,
  createKnowledgeRelation,
  getKnowledgeEntity,
  getKnowledgeFusionCandidate,
  listKnowledgeEntities,
  listKnowledgeFusionCandidates,
  listKnowledgeRelations,
  updateKnowledgeFusionCandidate,
} from "./knowledge-repository.js";
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

function norm(value) {
  return cleanText(value).toLowerCase().replace(/\bii\b/g, "2").replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function stableEntityId(type, sourceType, sourceId, name) {
  const hash = crypto.createHash("sha1").update(`${type}|${sourceType}|${sourceId}|${name}`).digest("hex").slice(0, 10);
  return `ke_${type}_${hash}`.slice(0, 64);
}

function upsertProjectionJob(workspaceId, sourceType, sourceId, status = "succeeded", error = "") {
  db.prepare(`
    INSERT INTO ontology_projection_jobs (
      id, workspace_id, source_type, source_id, status, projected_at, error_message, created_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(source_type, source_id, workspace_id) DO UPDATE SET
      status = excluded.status,
      projected_at = excluded.projected_at,
      error_message = excluded.error_message
  `).run(`opj_${nanoid(12)}`, workspaceId, sourceType, sourceId, status, error);
}

function createEntity(input) {
  const entity = createKnowledgeEntity({
    id: input.id || stableEntityId(input.entity_type, input.source_type, input.source_id, input.canonical_name),
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    entity_type: input.entity_type,
    canonical_name: input.canonical_name,
    summary: input.summary,
    aliases: input.aliases || [],
    source_refs: [{ source_type: input.source_type, source_id: input.source_id, ...(input.source_ref || {}) }],
    confidence: input.confidence ?? 0.72,
    review_required: input.review_required,
  });
  return entity;
}

function maybeFusionCandidate(workspaceId, entity) {
  const currentNorm = norm(entity.canonical_name);
  const peers = listKnowledgeEntities(workspaceId, { entity_type: entity.entity_type, status: "active" })
    .filter((peer) => peer.id !== entity.id);
  const similar = peers.find((peer) => {
    const peerNorm = norm(peer.canonical_name);
    return peerNorm && currentNorm && (peerNorm === currentNorm || peerNorm.includes(currentNorm) || currentNorm.includes(peerNorm));
  });
  if (!similar) return null;
  return createKnowledgeFusionCandidate({
    workspace_id: workspaceId,
    project_id: entity.project_id,
    candidate_type: "entity",
    action: "merge",
    source_entity_ids: [similar.id, entity.id],
    target_entity_id: similar.id,
    proposed_entity: { canonical_name: similar.canonical_name, entity_type: similar.entity_type },
    reason: `可能重复实体：${similar.canonical_name} / ${entity.canonical_name}`,
    confidence: 0.88,
  });
}

export function projectToOntology(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const sources = Array.isArray(input.sources) ? input.sources : [{ source_type: input.source_type, source_id: input.source_id }];
  const createdEntities = [];
  const createdRelations = [];
  const candidates = [];
  for (const source of sources) {
    const sourceType = cleanText(source.source_type);
    const sourceId = cleanText(source.source_id);
    if (!sourceType || !sourceId) continue;
    try {
      if (sourceType === "competitor") {
        const competitor = db.prepare("SELECT * FROM competitors WHERE id = ? AND workspace_id = ?").get(sourceId, workspaceId);
        const name = competitor ? competitor.canonical_name : cleanText(source.name, sourceId);
        const entity = createEntity({ workspace_id: workspaceId, source_type: sourceType, source_id: sourceId, entity_type: "competitor", canonical_name: name, confidence: 0.86 });
        createdEntities.push(entity);
        const platforms = db.prepare("SELECT * FROM competitor_platforms WHERE competitor_id = ?").all(sourceId);
        for (const platform of platforms) {
          const listing = createEntity({
            workspace_id: workspaceId,
            source_type: "competitor_platform",
            source_id: platform.id,
            entity_type: "evidence",
            canonical_name: `${name} ${platform.platform}`,
            confidence: 0.76,
          });
          createdEntities.push(listing);
          createdRelations.push(createKnowledgeRelation({
            workspace_id: workspaceId,
            from_entity_id: entity.id,
            relation_type: "appears_in",
            to_entity_id: listing.id,
            source_refs: [{ source_type: "competitor_platform", source_id: platform.id }],
            confidence: 0.85,
          }));
        }
        const candidate = maybeFusionCandidate(workspaceId, entity);
        if (candidate) candidates.push(candidate);
      } else if (sourceType === "demand_cluster") {
        const cluster = db.prepare("SELECT * FROM demand_clusters WHERE id = ? AND workspace_id = ?").get(sourceId, workspaceId);
        const need = createEntity({
          workspace_id: workspaceId,
          source_type: sourceType,
          source_id: sourceId,
          entity_type: "need",
          canonical_name: cluster?.canonical_text || sourceId,
          confidence: 0.82,
        });
        createdEntities.push(need);
      } else if (sourceType === "prd_section" || sourceType === "mrd_section" || sourceType === "document") {
        const name = cleanText(source.name || source.title, sourceId);
        const type = /risk|风险/i.test(name) ? "evidence" : /test|测试/i.test(name) ? "test_requirement" : "feature";
        const entity = createEntity({ workspace_id: workspaceId, source_type: sourceType, source_id: sourceId, entity_type: type, canonical_name: name, confidence: 0.72, review_required: true });
        createdEntities.push(entity);
        const need = listKnowledgeEntities(workspaceId, { entity_type: "need", status: "active" })[0];
        if (need && type === "feature") {
          const evidenceIds = Array.isArray(source.evidence_ids) ? source.evidence_ids : [];
          createdRelations.push(createOntologyRelation({
            workspace_id: workspaceId,
            from_entity_id: entity.id,
            to_entity_id: need.id,
            relation_type: "satisfies",
            evidence_ids: evidenceIds.length ? evidenceIds : ["ev_placeholder"],
            source_refs: [{ source_type: sourceType, source_id: sourceId }],
          }));
        }
      } else if (sourceType === "external_doc") {
        const entity = createEntity({ workspace_id: workspaceId, source_type: sourceType, source_id: sourceId, entity_type: "competitor", canonical_name: cleanText(source.name, sourceId), confidence: 0.7, review_required: true });
        createdEntities.push(entity);
        const candidate = maybeFusionCandidate(workspaceId, entity);
        if (candidate) candidates.push(candidate);
      }
      upsertProjectionJob(workspaceId, sourceType, sourceId);
    } catch (error) {
      upsertProjectionJob(workspaceId, sourceType, sourceId, "failed", error.message);
      throw error;
    }
  }
  return {
    created_entities: createdEntities.length,
    created_relations: createdRelations.length,
    fusion_candidates: candidates.length,
    entities: createdEntities,
    relations: createdRelations,
    candidates,
  };
}

export function createOntologyRelation(input = {}) {
  const relationType = cleanText(input.relation_type || input.type, "mentions");
  const evidenceIds = Array.isArray(input.evidence_ids) ? input.evidence_ids.map(cleanText).filter(Boolean) : [];
  if (["satisfies", "requires", "conflicts_with", "answers", "evidenced_by"].includes(relationType) && !evidenceIds.length) {
    const error = new Error("evidence_ids_required_for_factual_relation");
    error.status = 400;
    throw error;
  }
  return createKnowledgeRelation({
    ...input,
    relation_type: relationType,
    source_refs: [
      ...(Array.isArray(input.source_refs) ? input.source_refs : []),
      ...(evidenceIds.length ? [{ evidence_ids: evidenceIds }] : []),
    ],
    review_required: relationType === "mentions" && !evidenceIds.length ? true : input.review_required,
  });
}

export function searchOntologyEntities(workspaceId, filters = {}) {
  const q = norm(filters.q);
  return listKnowledgeEntities(workspaceId, {
    entity_type: filters.type || filters.entity_type,
    status: filters.status || "active",
  }).filter((entity) => {
    if (!q) return true;
    const aliases = Array.isArray(entity.aliases) ? entity.aliases : [];
    return [entity.canonical_name, ...aliases].some((item) => norm(item).includes(q) || q.includes(norm(item)));
  });
}

export function getOntologyEntityWithRelations(id) {
  const entity = getKnowledgeEntity(id);
  if (!entity) return null;
  return {
    ...entity,
    relations: listKnowledgeRelations(entity.workspace_id, { entity_id: id }),
  };
}

export function acceptFusionCandidate(id, input = {}) {
  const candidate = getKnowledgeFusionCandidate(id);
  if (!candidate) return null;
  const ids = Array.isArray(candidate.source_entity_ids) ? candidate.source_entity_ids : [];
  const winnerId = candidate.target_entity_id || ids[0];
  const loserIds = ids.filter((item) => item && item !== winnerId);
  for (const loserId of loserIds) {
    db.prepare("UPDATE knowledge_entities SET status = 'merged', metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.merged_into_id', ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(winnerId, loserId);
    db.prepare("UPDATE knowledge_relations SET from_entity_id = ? WHERE from_entity_id = ?").run(winnerId, loserId);
    db.prepare("UPDATE knowledge_relations SET to_entity_id = ? WHERE to_entity_id = ?").run(winnerId, loserId);
  }
  return updateKnowledgeFusionCandidate(id, { status: "approved", reason: cleanText(input.reason, candidate.reason) });
}

export function rejectFusionCandidate(id, input = {}) {
  return updateKnowledgeFusionCandidate(id, { status: "rejected", reason: cleanText(input.reason, "rejected") });
}

export function listOntologyFusionCandidates(workspaceId, filters = {}) {
  const mappedStatus = filters.status === "open" ? "pending" : filters.status === "accepted" ? "approved" : filters.status;
  return listKnowledgeFusionCandidates(workspaceId, { ...filters, status: mappedStatus || "pending" });
}
