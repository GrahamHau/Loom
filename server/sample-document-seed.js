import { createStructuredDocument, patchStructuredSection } from "./mrd-prd-service.js";
import { listDocumentsByMetadata } from "./knowledge-repository.js";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function sampleSectionMap(type) {
  if (type === "mrd") {
    return {
      sku_spu: "Pocket 3 / OSMO Pocket 3",
      market_background: "Vlog 与随身创作设备持续增长，用户更关注便携、画质和快速开拍。",
      target_users_scenarios: "旅行记录、日常 vlog、短视频创作、亲子记录。",
      demands_painpoints: "用户希望更轻、更快、更稳定，且能在手机之外独立完成高质量拍摄。",
      competitor_landscape: "竞品主要包括 Action 系列、Insta360 GO/X 系列、手机云台方案等。",
      cost_estimation: "在算力与供应链允许范围内，重点关注结构、传感器、云台和包装成本。",
      opportunity_judgement: "小体积高质量视频仍有明确窗口，Pocket 3 风格产品有清晰差异化。",
      risks_uncertainties: "认证、稳定性、量产一致性和供应链交期是主要风险。",
      recommended_direction: "优先围绕便携、画质、收纳和开拍速度做优化。",
      open_questions: "海外认证是否需要同步覆盖？目标价位与毛利边界如何确认？",
    };
  }
  return {
    product_definition: "Pocket 3 风格的随身创作相机，强调便携、快速开拍与稳定画质。",
    functional_attributes: "支持单手握持、快速开机、自动取景、稳定防抖、清晰收音与快速导出。",
    structure: "整体结构优先轻量化，云台与主机连接需要兼顾抗摔和维护。",
    materials_process: "外壳采用耐磨材料，接触位需要兼顾手感与耐污。",
    id_cmf: "外观克制、机身小巧，颜色以深浅双配为主，强调专业感。",
    electronics_firmware_certification: "补光、供电、连接与认证要求要提前锁定。",
    testing: "重点验证高低温、跌落、按键寿命、云台抖动和续航。",
    packaging: "包装需包含主机、线材、说明书、保护件与必要附件。",
    supplier_delivery: "供应商需要提前确认打样、量产排期和 BOM 备料。",
    quality_acceptance: "量产后以外观一致性、功能完整性和稳定性作为验收核心。",
    open_questions: "是否需要海外版本？是否增加配件套装？目标成本与首发节奏如何定？",
  };
}

export function ensureWorkspaceSampleDocuments(workspaceId, { force = false, projectId = "" } = {}) {
  const wsId = cleanText(workspaceId);
  if (!wsId) return [];
  const updated = [];
  const docs = ["mrd", "prd"];
  const already = listDocumentsByMetadata(wsId, { sampleKind: "pocket3" });
  if (!force && already.length >= docs.length) return already;
  for (const type of docs) {
    const title = type === "mrd" ? "Pocket 3 市场分析示例" : "Pocket 3 产品定义示例";
    const existing = already.find((doc) => doc.doc_type === type);
    const document = existing || createStructuredDocument(type, {
      workspace_id: wsId,
      project_id: projectId,
      title,
      metadata: {
        sample_kind: "pocket3",
        is_sample: true,
      },
    });
    const sections = sampleSectionMap(type);
    for (const section of document.sections || []) {
      const key = section.id.split(":").pop();
      const content = cleanText(sections[key] || "");
      patchStructuredSection(section.id, {
        body_markdown: content,
        evidence_ids: [],
        source_refs: key === "open_questions" ? [] : [{ chunk_id: `sample_${type}_${key}`, title }],
        document_id: document.id,
        section_key: key,
      });
    }
    updated.push(document);
  }
  return updated;
}
