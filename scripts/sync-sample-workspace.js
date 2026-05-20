#!/usr/bin/env node
import dotenv from "dotenv";
import process from "node:process";

dotenv.config({ path: [".env.local", ".env", ".env.production"] });

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const { getLegacyUserId, migrate } = await import("../server/db.js");
  const { syncSampleWorkspaceFromUser } = await import("../server/repository.js");
  migrate();
  const args = parseArgs(process.argv.slice(2));
  const sourceUserId = cleanText(args["source-user-id"] || process.env.LOOM_SAMPLE_SOURCE_USER_ID);
  const targetUserId = cleanText(args["target-user-id"] || getLegacyUserId(), getLegacyUserId());
  const result = syncSampleWorkspaceFromUser({
    sourceUserId,
    targetUserId,
    limits: {
      products: numberArg(args.products),
      demands: numberArg(args.demands),
      research: numberArg(args.research),
      news: numberArg(args.news),
    },
    replace: args.replace !== "false",
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.skipped) process.exitCode = 1;
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
    } else {
      out[key] = next;
      index += 1;
    }
  }
  return out;
}

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function numberArg(value) {
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
