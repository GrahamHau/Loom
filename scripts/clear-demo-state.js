import { db, getState, saveState } from "../server/db.js";

const state = getState();

if (!state) {
  console.log("No state found.");
  process.exit(0);
}

const before = {
  products: state.products?.length || 0,
  demands: state.demands?.length || 0,
  news: db.prepare("SELECT COUNT(*) AS count FROM news_items").get().count,
  newsSources: db.prepare("SELECT COUNT(*) AS count FROM news_sources").get().count,
  research: state.research?.length || 0,
};

db.prepare("DELETE FROM news_items").run();
db.prepare("DELETE FROM news_sources").run();

saveState({
  ...state,
  products: [],
  demands: [],
  news: [],
  research: [],
});

console.log(JSON.stringify({ cleared: before }, null, 2));
