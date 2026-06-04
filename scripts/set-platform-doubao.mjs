// 把「平台统一 AI 整理配置」设为火山方舟（Ark）豆包，供所有插件用户共享。
// 用法（key 从环境变量读，绝不写进仓库）：
//   ARK_API_KEY=ark-xxxx node scripts/set-platform-doubao.mjs
// 可选环境变量覆盖默认值：
//   ARK_BASE_URL   默认 https://ark.cn-beijing.volces.com/api/v3
//   DOUBAO_MODEL          默认 doubao-1-5-pro-32k-250115
//   DOUBAO_VISION_MODEL   默认 doubao-1-5-vision-pro-32k-250115
//   DATABASE_PATH  指定要写入的 sqlite（默认走 .env / db.js 的解析结果）
//
// 写入哪个库就对哪个库生效：本地调试写本地快照库；线上生效请在生产服务器上
// 指向生产 DATABASE_PATH 运行（或直接在管理后台「AI 整理」页填同样的值）。

import { updatePlatformAiConfig, getPlatformAiConfig } from "../server/platform-ai-config.js";

const apiKey = process.env.ARK_API_KEY?.trim();
if (!apiKey) {
  console.error("缺少 ARK_API_KEY 环境变量。示例：ARK_API_KEY=ark-xxxx node scripts/set-platform-doubao.mjs");
  process.exit(1);
}

const config = {
  enabled: true,
  api_type: "openai",
  api_url: (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").trim(),
  model: (process.env.DOUBAO_MODEL || "doubao-1-5-pro-32k-250115").trim(),
  vision_model: (process.env.DOUBAO_VISION_MODEL || "doubao-1-5-vision-pro-32k-250115").trim(),
  api_key: apiKey,
  allow_all_users: true,
  allow_future_users: true,
};

updatePlatformAiConfig({ id: "script:set-platform-doubao" }, config);

const saved = getPlatformAiConfig(); // 脱敏返回
console.log("已写入平台 AI 整理配置（豆包/火山方舟）：");
console.log(JSON.stringify(saved, null, 2));
