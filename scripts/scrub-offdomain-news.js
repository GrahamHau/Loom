#!/usr/bin/env node
/**
 * Keyword-only cleanup for already-kept official news that is clearly
 * off-domain macro/finance/energy noise. This does not call LLM.
 *
 * Usage: node scripts/scrub-offdomain-news.js
 */
import { db } from "../server/db.js";
import { isOffDomainNoise } from "../server/news-domain-filter.js";
import { listNews, syncOfficialNewsToAllUsers, updateNews } from "../server/repository.js";

const userIds = db.prepare("SELECT DISTINCT user_id FROM news_items").all().map((row) => row.user_id);
let scrubbed = 0;

for (const userId of userIds) {
  const news = listNews(userId);
  for (const item of news) {
    const title = item.titleZh || item.original_title || "";
    const content = `${item.summary || ""} ${item.contentZh || item.original_content || ""}`;
    if (!isOffDomainNoise(title, content)) continue;
    updateNews(userId, item.id, {
      is_kept: 0,
      classification: { ...(item.classification || {}), reason: "off_domain_scrubbed", off_domain: true },
    });
    scrubbed += 1;
  }
}

syncOfficialNewsToAllUsers();
console.log(`Done: scrubbed ${scrubbed} off-domain items across ${userIds.length} users.`);
