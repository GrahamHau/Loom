import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { DEFAULT_TAG_GROUPS } from "./tag-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const seedPath = path.join(projectRoot, "src", "legacy", "data.js");

export function defaultSettings() {
  return {
    llm_api_type: "openai",
    llm_api_url: "",
    llm_model: "",
    llm_api_key: "",
    llm_vision_api_type: "openai",
    llm_vision_api_url: "",
    llm_vision_model: "",
    llm_vision_api_key: "",
    llm_timeout_ms: Number(process.env.LLM_TIMEOUT_MS || 30000),
    search_provider: "tavily",
    search_enabled: false,
    search_api_url: "",
    search_api_key: "",
    search_model: "",
    search_tavily_enabled: false,
    search_tavily_api_key: "",
    search_tavily_api_url: "https://api.tavily.com/search",
    search_tavily_mode: "basic",
    search_serpapi_enabled: false,
    search_serpapi_api_key: "",
    search_serpapi_api_url: "https://serpapi.com/search.json",
    search_serpapi_engine: "google",
    tag_groups: DEFAULT_TAG_GROUPS,
    feishu_app_id: "",
    feishu_app_secret: "",
    feishu_base_token: "",
    feishu_products_table_id: "",
    feishu_demands_table_id: "",
    feishu_news_table_id: "",
    feishu_table_token: "",
    last_llm_test_at: null,
    last_llm_vision_test_at: null,
    last_feishu_test_at: null,
    official_news_enabled: true,
    rss_collect_enabled: process.env.RSS_COLLECT_ENABLED !== "false",
    rss_collect_interval_ms: Number(process.env.RSS_COLLECT_INTERVAL_MS || 15 * 60 * 1000),
  };
}

export function buildEmptyState(user = {}) {
  return {
    user: {
      id: user.id || "",
      name: user.name || "LOOM",
      role: user.role || "成员",
      initials: user.initials || "L",
      auth_provider: user.auth_provider || "password",
    },
    products: [],
    demands: [],
    news: [],
    research: [],
    rssSources: [],
    settings: defaultSettings(),
  };
}

export function loadEmptyData() {
  return buildEmptyState({
    name: "visitor",
    role: "产品经理",
    initials: "VI",
  });
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
