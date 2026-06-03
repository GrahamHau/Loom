#!/usr/bin/env node
/**
 * 把"官方资讯流"里的每一篇都重新过一遍 LLM（按正文总结 + 分类 + 广告过滤），
 * 而不是只靠启发式按标题分类。路演前跑一次即可。
 *
 * 用法（需先在设置/环境变量里配好 LLM）：
 *   node scripts/process-all-news-llm.js            # 重跑全部
 *   node scripts/process-all-news-llm.js --pending  # 只跑尚未处理的
 *
 * 注意：会把现有资讯的 llm_processed 重置为 0 后逐条重跑，按批次调用 LLM，
 * 完成后同步到所有用户的官方流。
 */
import { getLegacyUserId } from "../server/db.js";
import { listNews, updateNews, syncOfficialNewsToAllUsers } from "../server/repository.js";
import { processNewsWithLlm } from "../server/rss-service.js";
import { isLLMConfigured } from "../server/ai-service.js";

const onlyPending = process.argv.includes("--pending");
const BATCH = 40;

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return Number(process.argv[idx + 1]);
  return fallback;
}
// 可选：只重跑最近 N 天、最多 M 条（路演时用来快速跑可见的那批，而不是全部历史）。
const recentDays = argValue("--recent-days", 0);
const maxItems = argValue("--max", 0);

async function main() {
  const userId = getLegacyUserId();
  if (!isLLMConfigured(userId)) {
    console.error("✗ LLM 未配置。请先在系统设置或环境变量里填好 API URL / 模型 / Key 再运行。");
    process.exit(1);
  }

  let all = listNews(userId); // 已按 published_at 倒序
  console.log(`官方资讯共 ${all.length} 条。`);

  if (recentDays > 0) {
    const cutoff = Date.now() - recentDays * 24 * 60 * 60 * 1000;
    all = all.filter((item) => new Date(item.published_at || item.date || 0).getTime() >= cutoff);
  }
  if (maxItems > 0) all = all.slice(0, maxItems);
  if (recentDays > 0 || maxItems > 0) {
    console.log(`本次范围：${all.length} 条（recentDays=${recentDays || "全部"} / max=${maxItems || "不限"}）。`);
  }

  if (!onlyPending) {
    let reset = 0;
    for (const item of all) {
      updateNews(userId, item.id, { llm_processed: 0, needsTranslation: true });
      reset += 1;
    }
    console.log(`已重置 ${reset} 条为待处理，准备逐条过 LLM…`);
  }

  let round = 0;
  let totals = { processed: 0, kept: 0, filtered: 0, failed: 0 };
  // 逐批处理直到没有 pending（或一整批都失败时停止，避免死循环）。
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await processNewsWithLlm(userId, BATCH);
    round += 1;
    totals = {
      processed: totals.processed + (result.processed || 0),
      kept: totals.kept + (result.kept || 0),
      filtered: totals.filtered + (result.filtered || 0),
      failed: totals.failed + (result.failed || 0),
    };
    console.log(`第 ${round} 批：处理 ${result.processed} · 保留 ${result.kept} · 过滤 ${result.filtered} · 失败 ${result.failed} · 剩余 ${result.remaining}`);
    if (!result.processed || result.remaining <= 0) break;
    if (maxItems > 0 && totals.processed >= maxItems) {
      console.log(`已达 --max ${maxItems} 上限，停止。`);
      break;
    }
    if (result.failed >= BATCH) {
      console.error("整批失败，提前停止（多半是 LLM 连不上）。");
      break;
    }
  }

  syncOfficialNewsToAllUsers();
  console.log("\n完成：", JSON.stringify(totals));
  console.log("已同步到所有用户的官方流。");
}

main().catch((error) => {
  console.error("运行失败：", error?.message || error);
  process.exit(1);
});
