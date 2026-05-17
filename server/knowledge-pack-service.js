import {
  addChunkToPack,
  addSourceToPack,
  createKnowledgeGap,
  createKnowledgePack,
  listKnowledgeChunks,
  listKnowledgeSources,
} from "./knowledge-repository.js";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function uniqueById(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function coverageFor({ sources, chunks }) {
  if (!sources.length) return 0;
  const sourceCoverage = Math.min(1, sources.length / 3);
  const chunkCoverage = Math.min(1, chunks.length / 6);
  return Number(((sourceCoverage + chunkCoverage) / 2).toFixed(2));
}

function openQuestionsFor({ sources, chunks, packType }) {
  const questions = [];
  if (!sources.length) {
    questions.push({
      question: packType === "research" ? "这份调研还缺少可用于 RAG 的调研来源。" : "这个项目还缺少可用于 RAG 的知识来源。",
      reason: "missing_source",
    });
  }
  if (sources.length && !chunks.length) {
    questions.push({ question: "已有来源但还没有可检索分块，请先重建索引。", reason: "missing_chunks" });
  }
  return questions;
}

function matchingSources({ workspaceId, projectId = "", researchId = "", packType = "project" }) {
  const sources = listKnowledgeSources(workspaceId, projectId ? { project_id: projectId } : {});
  if (packType === "research" && researchId) {
    return sources.filter((source) => (
      source.source_type === "research" && source.source_id === researchId
    ) || source.metadata?.research_id === researchId);
  }
  return sources;
}

export function generateKnowledgePack(input = {}) {
  const workspaceId = cleanText(input.workspace_id);
  const packType = cleanText(input.pack_type, input.research_id ? "research" : "project");
  const projectId = cleanText(input.project_id);
  const researchId = cleanText(input.research_id);
  if (!workspaceId) throw new Error("workspace_id_required");
  if (packType === "project" && !projectId) throw new Error("project_id_required");
  if (packType === "research" && !researchId) throw new Error("research_id_required");

  const sources = uniqueById(matchingSources({ workspaceId, projectId, researchId, packType }));
  const chunks = uniqueById(sources.flatMap((source) => listKnowledgeChunks(workspaceId, { source_id: source.id })));
  const openQuestions = openQuestionsFor({ sources, chunks, packType });
  const pack = createKnowledgePack({
    workspace_id: workspaceId,
    project_id: projectId,
    title: cleanText(input.title, packType === "research" ? "调研知识包" : "项目知识包"),
    pack_type: packType,
    input: {
      project_id: projectId,
      research_id: researchId,
      source_count: sources.length,
      chunk_count: chunks.length,
      generated_by: "knowledge-pack-service",
    },
    coverage_score: input.coverage_score ?? coverageFor({ sources, chunks }),
    open_questions: openQuestions,
    created_by: input.created_by,
  });

  let hydrated = pack;
  sources.forEach((source) => {
    hydrated = addSourceToPack(hydrated.id, source.id, source.source_type === packType ? "primary" : "supporting");
  });
  chunks.forEach((chunk, index) => {
    hydrated = addChunkToPack(hydrated.id, chunk.id, index + 1);
  });
  for (const question of openQuestions) {
    createKnowledgeGap({
      workspace_id: workspaceId,
      project_id: projectId,
      pack_id: hydrated.id,
      question: question.question,
      reason: question.reason,
      related_source_ids: sources.map((source) => source.id),
      created_by: input.created_by,
    });
  }
  return hydrated;
}

export function generateProjectKnowledgePack(input = {}) {
  return generateKnowledgePack({ ...input, pack_type: "project" });
}

export function generateResearchKnowledgePack(input = {}) {
  return generateKnowledgePack({ ...input, pack_type: "research" });
}
