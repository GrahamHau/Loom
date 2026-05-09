import { callLLM } from "./ai-service.js";
import { rawState, updateResearch } from "./repository.js";

function productSummary(product) {
  const first = product.platforms?.[0] || {};
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: first.price || "",
    rating: first.rating || "",
    selling_points: product.selling_points || [],
    negative_keywords: product.negative_keywords || [],
    ai_summary: product.ai_summary || "",
  };
}

function demandSummary(demand) {
  return {
    id: demand.id,
    title: demand.title,
    source: demand.source,
    innovation: demand.innovation,
    scenarios: demand.scenarios || [],
    painpoints: demand.painpoints || [],
    summary: demand.summary || "",
  };
}

function normalizeAnalysis(result) {
  if (Array.isArray(result.analysis)) return result.analysis;
  if (Array.isArray(result.sections)) return result.sections;
  return [
    {
      icon: "📊",
      title: "AI 分析",
      confidence: Number(result.confidence || 0.7),
      text: result.report || result.text || "未生成有效分析。",
      source: result.source || "PM Copilot 数据库",
    },
  ];
}

export async function analyzeResearch(id) {
  const state = rawState();
  const research = (state.research || []).find((item) => item.id === id);
  if (!research) return null;
  updateResearch(id, { status: "分析中" });

  const products = (research.products || [])
    .map((pid) => state.products.find((product) => product.id === pid))
    .filter(Boolean)
    .map(productSummary);
  const demands = (research.demands || [])
    .map((did) => state.demands.find((demand) => demand.id === did))
    .filter(Boolean)
    .map(demandSummary);

  const result = await callLLM({
    system: "你是产品经理的市场调研分析助手。只返回 JSON。",
    user: `基于产品想法、关联竞品和关联需求，生成市场调研报告。返回 JSON：
{
  "analysis": [
    {"icon":"📊","title":"竞品格局","confidence":0.85,"text":"结论","source":"数据来源"},
    {"icon":"💡","title":"差异化机会","confidence":0.75,"text":"结论","source":"数据来源"},
    {"icon":"💰","title":"定价建议","confidence":0.7,"text":"结论","source":"数据来源"},
    {"icon":"⚠️","title":"风险提示","confidence":0.65,"text":"结论","source":"数据来源"}
  ]
}

调研标题：${research.title}
产品描述：${research.desc || research.description || ""}
关联竞品：${JSON.stringify(products, null, 2)}
关联需求：${JSON.stringify(demands, null, 2)}`,
    responseFormat: "json",
    temperature: 0.3,
  });

  return updateResearch(id, {
    status: "已完成",
    analysis: normalizeAnalysis(result),
    ai_confidence: Number(result.ai_confidence || 0.75),
  });
}
