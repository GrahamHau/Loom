import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const seedPath = path.join(projectRoot, "src", "legacy", "data.js");

export function defaultSettings() {
  return {
    llm_api_type: "openai",
    llm_api_url: "",
    llm_model: "",
    llm_api_key: "",
    llm_timeout_ms: Number(process.env.LLM_TIMEOUT_MS || 30000),
    search_provider: "tavily",
    search_enabled: false,
    search_api_url: "",
    search_api_key: "",
    search_model: "",
    feishu_app_id: "",
    feishu_app_secret: "",
    feishu_base_token: "",
    feishu_products_table_id: "",
    feishu_demands_table_id: "",
    feishu_news_table_id: "",
    feishu_table_token: "",
    last_llm_test_at: null,
    last_feishu_test_at: null,
    rss_collect_enabled: process.env.RSS_COLLECT_ENABLED !== "false",
    rss_collect_interval_ms: Number(process.env.RSS_COLLECT_INTERVAL_MS || 15 * 60 * 1000),
  };
}

export function loadEmptyData() {
  return {
    user: {
      name: "Graham",
      role: "产品经理",
      initials: "G",
    },
    products: [],
    demands: [],
    news: [],
    research: [],
    rssSources: [],
    settings: defaultSettings(),
  };
}

export function loadSeedData() {
  const code = fs.readFileSync(seedPath, "utf8");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: seedPath });
  const seed = context.window.PMC_DATA;
  return {
    ...seed,
    settings: defaultSettings(),
  };
}

export function loadInitialData() {
  if (process.env.SEED_DEMO_DATA === "true") {
    return loadSeedData();
  }
  return loadEmptyData();
}
