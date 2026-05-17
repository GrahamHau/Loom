import { createDocument, getKnowledgePack } from "./knowledge-repository.js";
import { resolvePrdTemplate } from "./prd-template-service.js";

export const MRD_SECTIONS = [
  { key: "market_background", title: "市场背景", keywords: ["市场", "行业", "趋势", "规模", "背景"] },
  { key: "target_users_scenarios", title: "目标用户与场景", keywords: ["用户", "人群", "场景", "使用", "画像"] },
  { key: "demands_painpoints", title: "需求与痛点", keywords: ["需求", "痛点", "问题", "不便", "期待"] },
  { key: "competitor_landscape", title: "竞品格局", keywords: ["竞品", "对手", "替代", "品牌", "方案"] },
  { key: "opportunity_judgement", title: "机会判断", keywords: ["机会", "差异", "优势", "空间", "判断"] },
  { key: "risks_uncertainties", title: "风险与不确定性", keywords: ["风险", "不确定", "依赖", "限制", "挑战"] },
  { key: "recommended_direction", title: "建议方向", keywords: ["建议", "方向", "策略", "优先", "推荐"] },
  { key: "open_questions", title: "待确认问题", keywords: [] },
];

const PRD_KEYWORDS = {
  product_definition: ["定义", "定位", "目标", "范围", "产品"],
  functional_attributes: ["功能", "属性", "能力", "参数", "规格"],
  structure: ["结构", "机构", "装配", "尺寸", "固定"],
  materials_process: ["材料", "工艺", "表面", "处理", "制造"],
  id_cmf: ["外观", "ID", "CMF", "颜色", "质感", "工业设计"],
  electronics_firmware_certification: ["电子", "固件", "认证", "电路", "蓝牙", "Wi-Fi", "CE", "FCC"],
  testing: ["测试", "验证", "可靠性", "跌落", "老化"],
  packaging: ["包装", "包材", "说明书", "运输", "开箱"],
  supplier_delivery: ["供应商", "交付", "打样", "BOM", "报价", "排期"],
  quality_acceptance: ["质量", "验收", "AQL", "抽检", "缺陷"],
  internal_risks: ["风险", "依赖", "不确定", "内部", "成本"],
};

const FORBIDDEN_PRD_TERMS = /\b(mvp|backlog|sprint)\b/gi;

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function resolvePack(input = {}) {
  if (input.pack?.id || Array.isArray(input.pack?.chunks)) return input.pack;
  if (input.pack_id) return getKnowledgePack(input.pack_id);
  return {
    id: "",
    title: cleanText(input.title, "资料包"),
    workspace_id: cleanText(input.workspace_id),
    project_id: cleanText(input.project_id),
    chunks: Array.isArray(input.chunks) ? input.chunks : [],
    open_questions: Array.isArray(input.open_questions) ? input.open_questions : [],
  };
}

function chunkText(chunk) {
  return cleanText(chunk?.text || chunk?.content || chunk?.summary);
}

function chunkTitle(chunk) {
  return cleanText(chunk?.title, "资料片段");
}

function chunkMatches(chunk, keywords = []) {
  if (!keywords.length) return false;
  const text = `${chunkTitle(chunk)} ${chunkText(chunk)} ${(chunk?.tags || []).join(" ")}`.toLowerCase();
  return keywords.some((keyword) => text.includes(String(keyword).toLowerCase()));
}

function chooseChunks(chunks, keywords, fallbackCount = 2, options = {}) {
  const matched = chunks.filter((chunk) => chunkMatches(chunk, keywords));
  if (matched.length) return matched.slice(0, fallbackCount);
  return options.allowFallback === true ? chunks.slice(0, fallbackCount) : [];
}

function openQuestionForSection(title) {
  return `缺少可直接支撑「${title}」的资料，请补充竞品证据、用户反馈或内部判断。`;
}

function questionText(item) {
  return cleanText(item?.question || item?.text || item);
}

function sectionContent({ chunks, fallback, openQuestions = [] }) {
  if (openQuestions.length) {
    return openQuestions.map((item) => `- ${questionText(item)}`).filter((line) => line !== "-").join("\n") || fallback;
  }
  if (!chunks.length) return fallback;
  return chunks
    .map((chunk) => `- ${chunkText(chunk)}（来源：${chunkTitle(chunk)}）`)
    .filter((line) => line !== "- （来源：资料片段）")
    .join("\n");
}

function modelStatus(input = {}) {
  const available = Boolean(input.strong_model || input.llm || process.env.STRONG_MODEL || process.env.LOOM_STRONG_MODEL);
  return {
    strong_model_available: available,
    review_status: available ? "not_requested" : "not_run",
    reason: available ? "deterministic_draft_generated" : "strong_model_not_configured",
  };
}

function markdownFor(title, sections) {
  return [`# ${title}`, ...sections.flatMap((section) => [`## ${section.title}`, section.content || "待补充。"])].join("\n\n");
}

function conservativeAccessPolicy() {
  return {
    visibility: "private",
    rag_enabled: false,
    bot_enabled: false,
    supplier_visible: false,
    sales_visible: false,
  };
}

export function buildMrdDraftContent(input = {}) {
  const pack = resolvePack(input);
  const chunks = Array.isArray(pack?.chunks) ? pack.chunks : [];
  const openQuestions = Array.isArray(pack?.open_questions) ? pack.open_questions : [];
  const sections = MRD_SECTIONS.map((section) => {
    const isQuestions = section.key === "open_questions";
    const selected = isQuestions ? [] : chooseChunks(chunks, section.keywords);
    const sectionOpenQuestions = !isQuestions && !selected.length ? [openQuestionForSection(section.title)] : [];
    return {
      key: section.key,
      title: section.title,
      content: sectionContent({
        chunks: selected,
        openQuestions: isQuestions ? openQuestions : [],
        fallback: isQuestions ? "暂无明确待确认问题。" : "资料包内暂未检索到足够证据，需人工补充判断。",
      }),
      source_chunk_ids: selected.map((chunk) => chunk.id).filter(Boolean),
      source_refs: selected.map((chunk) => ({
        chunk_id: chunk.id,
        title: chunkTitle(chunk),
        source_id: chunk.source_id || "",
      })).filter((item) => item.chunk_id || item.source_id),
      open_questions: isQuestions ? openQuestions.map(questionText).filter(Boolean) : sectionOpenQuestions,
    };
  });
  return { pack, sections };
}

export function buildPrdDraftContent(input = {}) {
  const pack = resolvePack(input);
  const chunks = Array.isArray(pack?.chunks) ? pack.chunks : [];
  const openQuestions = Array.isArray(pack?.open_questions) ? pack.open_questions : [];
  const template = resolvePrdTemplate({
    workspace_id: cleanText(input.workspace_id || pack?.workspace_id),
    product_type_code: input.product_type_code,
    product_type_template: input.product_type_template,
    enabled_modules: input.enabled_modules,
  });
  const sections = template.modules.map((module) => {
    const isQuestions = module.key === "open_questions";
    const selected = isQuestions ? [] : chooseChunks(chunks, PRD_KEYWORDS[module.key] || [module.title]);
    const sectionOpenQuestions = !isQuestions && !selected.length ? [openQuestionForSection(module.title)] : [];
    return {
      key: module.key,
      title: module.title,
      content: sectionContent({
        chunks: selected,
        openQuestions: isQuestions ? openQuestions : [],
        fallback: isQuestions ? "暂无明确待确认问题。" : "基于当前资料生成初稿，需产品、研发、供应链共同确认。",
      }).replace(FORBIDDEN_PRD_TERMS, ""),
      source_chunk_ids: selected.map((chunk) => chunk.id).filter(Boolean),
      source_refs: selected.map((chunk) => ({
        chunk_id: chunk.id,
        title: chunkTitle(chunk),
        source_id: chunk.source_id || "",
      })).filter((item) => item.chunk_id || item.source_id),
      open_questions: isQuestions ? openQuestions.map(questionText).filter(Boolean) : sectionOpenQuestions,
    };
  });
  return { pack, sections, template };
}

export function generateMrdDraft(input = {}) {
  const { pack, sections } = buildMrdDraftContent(input);
  const workspaceId = cleanText(input.workspace_id || pack?.workspace_id);
  if (!workspaceId) throw new Error("workspace_id_required");
  const title = cleanText(input.title, `${cleanText(pack?.title, "资料包")} MRD 初稿`);
  const status = modelStatus(input);
  const document = createDocument({
    workspace_id: workspaceId,
    project_id: cleanText(input.project_id || pack?.project_id),
    title,
    doc_type: "mrd",
    status: "draft",
    owner_user_id: input.owner_user_id,
    content_text: markdownFor(title, sections),
    content: {
      normalized_sections: sections,
      generation: "deterministic_pack_draft",
    },
    metadata: {
      generated_by: "document-generation-service",
      pack_id: cleanText(pack?.id),
      needs_review: true,
      model_status: status,
    },
    access_policy: conservativeAccessPolicy(),
  });
  return { document, sections, needs_review: true, model_status: status };
}

export function generatePrdDraft(input = {}) {
  const { pack, sections, template } = buildPrdDraftContent(input);
  const workspaceId = cleanText(input.workspace_id || pack?.workspace_id);
  if (!workspaceId) throw new Error("workspace_id_required");
  const title = cleanText(input.title, `${cleanText(pack?.title, "资料包")} PRD 初稿`);
  const status = modelStatus(input);
  const contentText = markdownFor(title, sections).replace(FORBIDDEN_PRD_TERMS, "");
  const document = createDocument({
    workspace_id: workspaceId,
    project_id: cleanText(input.project_id || pack?.project_id),
    title,
    doc_type: "prd",
    status: "draft",
    owner_user_id: input.owner_user_id,
    content_text: contentText,
    content: {
      normalized_sections: sections,
      generation: "deterministic_pack_draft",
      product_type_template: template.product_type_template,
    },
    metadata: {
      generated_by: "document-generation-service",
      pack_id: cleanText(pack?.id),
      product_type_code: cleanText(template.product_type_template?.code || input.product_type_code),
      enabled_modules: sections.map((section) => section.key),
      needs_review: true,
      model_status: status,
    },
    access_policy: conservativeAccessPolicy(),
  });
  return { document, sections, needs_review: true, model_status: status };
}
