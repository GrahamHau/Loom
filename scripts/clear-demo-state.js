import { getState, saveState } from "../server/db.js";

const state = getState();

if (!state) {
  console.log("No state found.");
  process.exit(0);
}

const before = {
  products: state.products?.length || 0,
  demands: state.demands?.length || 0,
  news: state.news?.length || 0,
  research: state.research?.length || 0,
};

saveState({
  ...state,
  products: [],
  demands: [],
  news: [],
  research: [],
});

console.log(JSON.stringify({ cleared: before }, null, 2));
