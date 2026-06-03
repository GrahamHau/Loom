import { callLLM } from "./ai-service.js";
import { rawState, updateResearch } from "./repository.js";

const SUFFICIENT_PRODUCTS = 3;
const SUFFICIENT_DEMANDS = 5;

function collectPainpoints(demands = []) {
  const out = [];
  for (const demand of demands) {
    const list = Array.isArray(demand.painpoints) ? demand.painpoints : [];
    for (const item of list) {
      const value = String(item || "").trim();
      if (value) out.push(value);
    }
  }
  return out;
}

function productBriefOf(product = {}) {
  return {
    name: product.name || "未命名竞品",
    category: product.category || "",
    tags: (Array.isArray(product.tags) ? product.tags : []).slice(0, 12),
    selling_points: (Array.isArray(product.selling_points) ? product.selling_points : []).slice(0, 8),
    summary: String(product.ai_summary || "").slice(0, 200),
  };
}

function dataSufficiencyOf(products, demands) {
  return {
    products: products.length,
    demands: demands.length,
    ok: products.length >= SUFFICIENT_PRODUCTS && demands.length >= SUFFICIENT_DEMANDS,
  };
}

function emptyPayload(dataSufficiency) {
  return {
    painpoint_clusters: [],
    selling_points: { common: [], differentiated: [] },
    opportunities: [],
    hero_insight: "",
    data_sufficiency: dataSufficiency,
    generated_at: new Date().toISOString(),
  };
}

/**
 * 调研档案的 AI 增强层（语义聚类 + 卖点提炼 + 机会洞察 + 一句话洞察）。
 * 纯文本 LLM 调用（走 callLLM），无向量、无检索。结果缓存在 research.dossier_ai。
 * 所有数字仍由前端纯规则聚合，这里只做"语义归并"和"洞察",失败时调用方回退规则版。
 */
export async function analyzeDossier(userId, id) {
  const state = rawState(userId);
  const research = (state?.research || []).find((item) => item.id === id);
  if (!research) return null;

  const products = (research.products || [])
    .map((pid) => (state.products || []).find((product) => product.id === pid))
    .filter(Boolean);
  const demands = (research.demands || [])
    .map((did) => (state.demands || []).find((demand) => demand.id === did))
    .filter(Boolean);

  const dataSufficiency = dataSufficiencyOf(products, demands);

  if (!products.length && !demands.length) {
    const payload = emptyPayload(dataSufficiency);
    updateResearch(userId, id, { dossier_ai: payload });
    return payload;
  }

  const painpoints = collectPainpoints(demands);
  const productBriefs = products.map(productBriefOf);

  const sampleNote = dataSufficiency.ok
    ? ""
    : `\n注意：当前样本偏少（${products.length} 个竞品 / ${demands.length} 条用户声音），请保守表述，不要把弱信号当成结论，不要编造数据。`;

  const system = "你是泛3C影像配件（脚架/补光灯/手柄/手机夹/支架/麦克风）品类的资深产品调研分析师。只返回 JSON，不输出多余内容。";
  const user = `下面是一个调研项目的关联数据，请做语义层面的归并与洞察。${sampleNote}

调研主题：${research.title}
产品设想：${research.desc || research.description || ""}

关联竞品（${products.length} 个）：
${JSON.stringify(productBriefs, null, 2)}

用户痛点原始词条（${painpoints.length} 条，可能有大量同义/碎词）：
${JSON.stringify(painpoints, null, 2)}

任务：
1. painpoint_clusters：把语义相近的痛点合并成簇（例："卡扣松"+"扣子不结实"+"快拆不稳" → "快拆结构稳固性"）。每簇给代表性名称 label、包含的原始词条 members、出现次数 count。最多 8 簇，按 count 降序。
2. selling_points：从竞品里提炼 common（≥30% 竞品都具备的通用卖点）与 differentiated（仅个别竞品具备的差异化卖点）。
3. opportunities：结合"高频痛点"与"主流竞品尚未覆盖"，给 2-4 条机会点，每条 title（≤15字）+ rationale（≤40字，点明判断依据）。
4. hero_insight：一句话核心洞察（≤45字），点出主战场或最大机会，供产品经理拍板用。

返回 JSON：
{
  "painpoint_clusters": [{"label": "", "members": [], "count": 0}],
  "selling_points": {"common": [], "differentiated": []},
  "opportunities": [{"title": "", "rationale": ""}],
  "hero_insight": ""
}`;

  const result = await callLLM({
    userId,
    purpose: "research:dossier_analyze",
    system,
    user,
    responseFormat: "json",
    temperature: 0.3,
    maxTokens: 1100,
  });

  const payload = {
    painpoint_clusters: Array.isArray(result.painpoint_clusters)
      ? result.painpoint_clusters
          .map((cluster) => ({
            label: String(cluster?.label || "").trim().slice(0, 24),
            members: (Array.isArray(cluster?.members) ? cluster.members : [])
              .map((member) => String(member || "").trim())
              .filter(Boolean)
              .slice(0, 20),
            count: Math.max(0, Math.round(Number(cluster?.count) || 0)),
          }))
          .filter((cluster) => cluster.label)
          .slice(0, 8)
      : [],
    selling_points: {
      common: (Array.isArray(result.selling_points?.common) ? result.selling_points.common : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .slice(0, 12),
      differentiated: (Array.isArray(result.selling_points?.differentiated) ? result.selling_points.differentiated : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .slice(0, 12),
    },
    opportunities: (Array.isArray(result.opportunities) ? result.opportunities : [])
      .map((item) => ({
        title: String(item?.title || "").trim().slice(0, 24),
        rationale: String(item?.rationale || "").trim().slice(0, 80),
      }))
      .filter((item) => item.title)
      .slice(0, 4),
    hero_insight: String(result.hero_insight || "").trim().slice(0, 120),
    data_sufficiency: dataSufficiency,
    generated_at: new Date().toISOString(),
  };

  updateResearch(userId, id, { dossier_ai: payload });
  return payload;
}
