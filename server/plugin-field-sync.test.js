import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_FIELDS } from "./field-config.js";
import { DEFAULT_TAG_GROUPS } from "./tag-config.js";

/**
 * Chrome 插件（loom-extension）没有打包，无法在运行时 import 服务端的字段定义，
 * 只能在 sidepanel.js 里硬编码一份 DEFAULT_TAG_GROUPS / DEFAULT_FIELDS 作为离线兜底。
 *
 * 这份兜底必须与服务端 canonical（tag-config.js / field-config.js）保持一致——
 * 否则会出现"插件采集的标签选项 / 字段与 Web 端不一致"的问题（品类、主机型号等）。
 *
 * 本测试把插件里的两份字面量抽出来与服务端逐项对比，任一方改了忘同步就会失败。
 * 若以后给插件接入打包器，可改为直接 import 共享模块并删除本测试。
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIDEPANEL_PATH = resolve(__dirname, "../loom-extension/sidepanel/sidepanel.js");

// 插件作为标签字段处理的字段（不含服务端额外的 price/monthly_sales/rating 等数值字段，
// 那些在插件里是普通表单字段，不走标签系统）。
const TAG_FIELD_KEYS = ["brand", "host", "category", "scenarios", "painpoints", "innovation"];

function extractArrayLiteral(source, name) {
  const match = source.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
  if (!match) throw new Error(`无法在 sidepanel.js 中找到 ${name} 字面量`);
  // 这些是纯数组/字符串字面量（无函数调用），可安全求值。
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${match[1]});`)();
}

function pickGroup(group) {
  return { key: group.key, name: group.name, tone: group.tone, tags: group.tags };
}

function pickField(field) {
  return {
    key: field.key,
    legacyKey: field.legacyKey,
    name: field.name,
    tone: field.tone,
    multi: field.multi,
    official: field.official,
    entities: field.entities,
  };
}

describe("plugin field/tag defaults stay in sync with server canonical", () => {
  const source = readFileSync(SIDEPANEL_PATH, "utf8");
  const pluginTagGroups = extractArrayLiteral(source, "DEFAULT_TAG_GROUPS");
  const pluginFields = extractArrayLiteral(source, "DEFAULT_FIELDS");

  it("tag groups match (key / name / tone / tags)", () => {
    const serverByKey = new Map(DEFAULT_TAG_GROUPS.map((group) => [group.key, pickGroup(group)]));
    const pluginByKey = new Map(pluginTagGroups.map((group) => [group.key, pickGroup(group)]));

    expect([...pluginByKey.keys()].sort()).toEqual([...serverByKey.keys()].sort());
    for (const key of serverByKey.keys()) {
      expect(pluginByKey.get(key)).toEqual(serverByKey.get(key));
    }
  });

  it("tag fields match (key / legacyKey / name / tone / multi / official / entities)", () => {
    const serverByKey = new Map(
      DEFAULT_FIELDS.filter((field) => TAG_FIELD_KEYS.includes(field.key)).map((field) => [field.key, pickField(field)]),
    );
    const pluginByKey = new Map(pluginFields.map((field) => [field.key, pickField(field)]));

    expect([...pluginByKey.keys()].sort()).toEqual([...serverByKey.keys()].sort());
    for (const key of serverByKey.keys()) {
      expect(pluginByKey.get(key)).toEqual(serverByKey.get(key));
    }
  });
});
