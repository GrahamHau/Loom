import { queryKnowledge } from "./knowledge-query-service.js";

export function buildKnowledgeAnswerCard(result = {}) {
  return {
    type: "interactive",
    data: {
      title: result.mode === "refused" ? "LOOM 暂无可回答资料" : "LOOM 知识库回答",
      answer: result.answer || "",
      confidence: result.confidence || 0,
      citations: result.citations || [],
      actions: ["helpful", "not_accurate", "ask_pm", "open_loom"],
      gaps: result.gaps || [],
    },
  };
}

export async function handleFeishuBotQuestion(input = {}) {
  const result = await queryKnowledge({
    ...input,
    channel: input.channel || "feishu_group",
  });
  return {
    result,
    card: buildKnowledgeAnswerCard(result),
  };
}
