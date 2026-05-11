import { listNews, listNewsSources, upsertNews } from "../server/repository.js";
import { heuristicClassifyNews } from "../server/rss-service.js";

const currentNews = listNews();
const sources = new Map(listNewsSources().map((source) => [source.id, source]));
let updated = 0;
let filtered = 0;

const reclassified = currentNews.map((news) => {
  const source = sources.get(news.source_id) || { name: news.source, authority: news.source_authority };
  const classified = heuristicClassifyNews({
    source,
    item: {
      title: news.original_title || news.titleZh,
      link: news.original_url,
      contentSnippet: news.original_content || news.summary,
      content: news.original_content || news.summary,
      summary: news.summary,
    },
  });
  if (!classified) {
    filtered += 1;
    if (news.type || !news.classification || !news.source_authority) updated += 1;
    return {
      ...news,
      type: null,
      source_authority: source.authority || news.source_authority || "watchlist",
      classification: { authority: source.authority || "watchlist", reason: "reclassified_filtered" },
      thumbHue: news.thumbHue ?? 40,
    };
  }

  if (news.type !== classified.type || !news.classification || !news.source_authority) updated += 1;
  return {
    ...news,
    type: classified.type,
    titleZh: news.titleZh || classified.titleZh,
    summary: news.summary || classified.summary,
    contentZh: news.contentZh || classified.contentZh,
    needsTranslation: news.needsTranslation ?? classified.needsTranslation,
    source_authority: classified.classification?.authority || source.authority || "watchlist",
    classification: classified.classification,
    thumbHue: classified.type === "新品发布" ? 220 : 40,
  };
});

upsertNews(reclassified);

const after = listNews();
const counts = after.reduce((acc, news) => {
  const key = news.type || "filtered";
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  total: after.length,
  updated,
  filtered,
  counts,
}, null, 2));
