import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const seedPath = path.join(projectRoot, "src", "legacy", "data.js");

export function loadSeedData() {
  const code = fs.readFileSync(seedPath, "utf8");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: seedPath });
  const seed = context.window.PMC_DATA;
  return {
    ...seed,
    settings: {
      llm_api_type: "openai",
      llm_api_url: "https://api.minimax.chat/v1",
      llm_model: "MiniMax-Text-01",
      llm_api_key: "",
      llm_timeout_ms: 30000,
      feishu_app_id: "",
      feishu_app_secret: "",
      feishu_base_token: "",
      feishu_products_table_id: "",
      feishu_demands_table_id: "",
      feishu_news_table_id: "",
      feishu_table_token: "",
      last_llm_test_at: null,
      last_feishu_test_at: null,
      rss_collect_enabled: true,
      rss_collect_interval_ms: 15 * 60 * 1000,
    },
  };
}
