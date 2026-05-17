#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { readFeishuDocument } from "../server/feishu-doc-reader-service.js";
import { FEISHU_PRD_MRD_CANDIDATES, GRAHAM_FEISHU_USER_ID, GRAHAM_WORKSPACE_ID } from "./feishu-prd-mrd-candidates.js";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(String(args.output || "tmp/feishu-prd-mrd-payload.json"));
  const docs = args.file ? JSON.parse(fs.readFileSync(args.file, "utf8")) : FEISHU_PRD_MRD_CANDIDATES;
  const items = [];

  for (const doc of docs) {
    try {
      const readResult = await readFeishuDocument(doc);
      items.push({
        title: doc.title || readResult.title,
        doc_type: doc.doc_type,
        source_uri: doc.source_uri,
        text: readResult.text,
        metadata: readResult.metadata || {},
        read_status: "ok",
      });
    } catch (error) {
      items.push({
        title: doc.title,
        doc_type: doc.doc_type,
        source_uri: doc.source_uri,
        raw_blocks: [],
        read_status: "failed",
        error: error.message || "feishu_read_failed",
      });
    }
  }

  const payload = {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    target: {
      workspace_id: GRAHAM_WORKSPACE_ID,
      user_id: GRAHAM_FEISHU_USER_ID,
      user_label: "黄冠淏（Graham/白杉）",
    },
    items,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({
    output: outputPath,
    target: payload.target,
    total: items.length,
    readable: items.filter((item) => item.read_status === "ok").length,
    failed: items.filter((item) => item.read_status !== "ok").map((item) => ({ title: item.title, error: item.error })),
  }, null, 2));
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}
