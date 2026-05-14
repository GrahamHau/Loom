import { db, migrate } from "../server/db.js";

function betterNewsRow(a, b) {
  if (Boolean(b.thumbnail_url) !== Boolean(a.thumbnail_url)) return b.thumbnail_url ? b : a;
  if (String(b.updated_at || "") !== String(a.updated_at || "")) return String(b.updated_at || "") > String(a.updated_at || "") ? b : a;
  return String(b.created_at || "") > String(a.created_at || "") ? b : a;
}

function mergeClassification(target, duplicate) {
  const current = target.classification_json ? JSON.parse(target.classification_json) : {};
  const extra = duplicate.classification_json ? JSON.parse(duplicate.classification_json) : {};
  return JSON.stringify({
    ...extra,
    ...current,
    deduped_from: [duplicate.id, ...(Array.isArray(current.deduped_from) ? current.deduped_from : [])],
  });
}

migrate();

const sourceGroups = db.prepare(`
  SELECT user_id, url, COUNT(*) AS count
  FROM news_sources
  WHERE TRIM(url) != ''
  GROUP BY user_id, url
  HAVING count > 1
`).all();

let deletedSources = 0;
const sourceTx = db.transaction(() => {
  for (const group of sourceGroups) {
    const rows = db.prepare(`
      SELECT *
      FROM news_sources
      WHERE user_id = ? AND url = ?
      ORDER BY is_active DESC, updated_at DESC, created_at ASC
    `).all(group.user_id, group.url);
    const keeper = rows[0];
    for (const duplicate of rows.slice(1)) {
      db.prepare("UPDATE news_items SET source_id = ?, source_name = ? WHERE user_id = ? AND source_id = ?")
        .run(keeper.id, keeper.name, duplicate.user_id, duplicate.id);
      deletedSources += db.prepare("DELETE FROM news_sources WHERE id = ? AND user_id = ?").run(duplicate.id, duplicate.user_id).changes;
    }
  }
});
sourceTx();

const newsGroups = db.prepare(`
  SELECT user_id, original_url, COUNT(*) AS count
  FROM news_items
  WHERE TRIM(original_url) != ''
  GROUP BY user_id, original_url
  HAVING count > 1
`).all();

let deletedNews = 0;
const newsTx = db.transaction(() => {
  for (const group of newsGroups) {
    const rows = db.prepare(`
      SELECT *
      FROM news_items
      WHERE user_id = ? AND original_url = ?
      ORDER BY updated_at DESC, created_at DESC
    `).all(group.user_id, group.original_url);
    let keeper = rows[0];
    for (const row of rows.slice(1)) keeper = betterNewsRow(keeper, row);

    for (const duplicate of rows.filter((row) => row.id !== keeper.id)) {
      const nextThumbnail = keeper.thumbnail_url || duplicate.thumbnail_url || "";
      const nextClassification = mergeClassification(keeper, duplicate);
      db.prepare(`
        UPDATE news_items
        SET thumbnail_url = ?, classification_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(nextThumbnail, nextClassification, keeper.id, keeper.user_id);
      deletedNews += db.prepare("DELETE FROM news_items WHERE id = ? AND user_id = ?").run(duplicate.id, duplicate.user_id).changes;
    }
  }
});
newsTx();

console.log(JSON.stringify({
  duplicateSourceGroups: sourceGroups.length,
  deletedSources,
  duplicateNewsGroups: newsGroups.length,
  deletedNews,
}, null, 2));
