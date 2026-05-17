import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const repo = await import("./repository.js");
const parsers = await import("./parsers.js");

function mockLlmJson(payload, onRequest = () => {}) {
  vi.stubGlobal("fetch", async (_url, options) => {
    const body = JSON.parse(options.body);
    onRequest(body);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    };
  });
}

beforeEach(() => {
  dbModule.migrate();
  dbModule.db.prepare("DELETE FROM llm_call_logs").run();
  dbModule.db.prepare("DELETE FROM users").run();
  dbModule.db.prepare("DELETE FROM app_data").run();
  dbModule.ensureSeed({
    user: { name: "Graham", role: "管理员", initials: "GR" },
    products: [],
    demands: [],
    news: [],
    research: [],
    rssSources: [],
    settings: {
      llm_api_url: "https://llm.test/v1",
      llm_model: "gpt-test",
      llm_api_key: "secret",
    },
  });
  repo.ensureLegacyWorkspace();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parsers account fields", () => {
  it("recognizes default product fields even when account custom fields are empty", async () => {
    mockLlmJson({
      name: "Osmo light",
      brand: "DJI",
      category: "灯光",
      tag_values: {
        brand: ["DJI"],
        category: ["灯光"],
      },
      selling_points: ["轻便"],
      negative_keywords: [],
      ai_summary: "轻便补光灯",
    });

    const result = await parsers.parseProductRaw(dbModule.getLegacyUserId(), {
      platform: "amazon",
      data: { title: "Osmo light", url: "https://example.test/product" },
    });

    expect(result.brand).toBe("DJI");
    expect(result.category).toBe("灯光");
    expect(result.tag_values).toEqual({
      brand: ["DJI"],
      category: ["灯光"],
    });
    expect(result.field_suggestions).toEqual([]);
  });

  it("normalizes AI product tags into default and custom fields", async () => {
    const userId = dbModule.getLegacyUserId();
    const audience = repo.createField(userId, {
      key: "audience",
      name: "目标人群",
      entities: ["competitor"],
      options: ["创作者"],
    });
    mockLlmJson({
      name: "Creator tripod",
      brand: "DJI",
      tag_values: {
        目标人群: ["创作者"],
        brand: ["DJI"],
      },
      selling_points: ["自动跟拍"],
      negative_keywords: [],
      ai_summary: "创作者三脚架",
    });

    const result = await parsers.parseProductRaw(userId, {
      platform: "kickstarter",
      data: { title: "Creator tripod", url: "https://example.test/tripod" },
    });

    expect(result.tag_values).toEqual({
      [audience.key]: ["创作者"],
      brand: ["DJI"],
    });
  });

  it("maps legacy product AI fields into configured account fields", async () => {
    const userId = dbModule.getLegacyUserId();
    const brand = repo.createField(userId, {
      key: "brand",
      name: "品牌",
      entities: ["competitor"],
      options: ["DJI"],
    });
    const category = repo.createField(userId, {
      key: "category",
      name: "品类",
      entities: ["competitor"],
      options: ["灯光"],
    });
    mockLlmJson({
      name: "DJI light",
      brand: "DJI",
      category: "灯光",
      selling_points: ["便携"],
      negative_keywords: [],
      ai_summary: "便携补光灯",
    });

    const result = await parsers.parseProductRaw(userId, {
      platform: "amazon",
      data: { title: "DJI light", url: "https://example.test/light" },
    });

    expect(result.tag_values).toEqual({
      brand: ["DJI"],
      category: ["灯光"],
    });
    expect(result.field_suggestions).toEqual([]);
  });

  it("normalizes AI demand tags into default and custom fields", async () => {
    const userId = dbModule.getLegacyUserId();
    const scene = repo.createField(userId, {
      key: "scene",
      name: "场景",
      entities: ["inspiration"],
      options: ["露营"],
    });
    mockLlmJson({
      title: "露营补光需求",
      summary: "用户想在露营时补光",
      tag_values: {
        场景: ["露营"],
        innovation: ["结构创新"],
      },
      tags_scenario: ["露营"],
      tags_painpoint: [],
      tags_innovation: "结构创新",
      tags_custom: [],
    });

    const result = await parsers.parseDemandRaw(userId, {
      platform: "xiaohongshu",
      data: { title: "露营补光需求", content: "夜间露营拍摄需要柔和补光" },
    });

    expect(result.tag_values).toEqual({
      [scene.key]: ["露营"],
      innovation: ["结构创新"],
      scenarios: ["露营"],
    });
  });

  it("maps legacy demand AI fields into configured account fields", async () => {
    const userId = dbModule.getLegacyUserId();
    const scene = repo.createField(userId, {
      key: "scene",
      name: "使用场景",
      entities: ["inspiration"],
      options: ["露营"],
    });
    mockLlmJson({
      title: "露营补光需求",
      summary: "用户想在露营时补光",
      tags_scenario: ["露营"],
      tags_painpoint: [],
      tags_innovation: "结构创新",
      tags_custom: [],
    });

    const result = await parsers.parseDemandRaw(userId, {
      platform: "xiaohongshu",
      data: { title: "露营补光需求", content: "夜间露营拍摄需要柔和补光" },
    });

    expect(result.tag_values).toEqual({
      [scene.key]: ["露营"],
      innovation: ["结构创新"],
      scenarios: ["露营"],
    });
  });

  it("recognizes default demand fields when account custom fields are empty", async () => {
    mockLlmJson({
      title: "Vlog 自拍补光需求",
      summary: "用户想要更便携的自拍补光方案",
      tags_scenario: ["vlog 自拍"],
      tags_painpoint: ["太重"],
      tags_innovation: "形态创新",
      tags_custom: ["便携"],
    });

    const result = await parsers.parseDemandRaw(dbModule.getLegacyUserId(), {
      platform: "xiaohongshu",
      data: { title: "Vlog 自拍补光需求", content: "自拍补光灯太重，携带不方便" },
    });

    expect(result.tag_values).toEqual({
      scenarios: ["Vlog/自拍"],
      painpoints: ["携带不便/太重"],
      innovation: ["形态创新"],
      custom_tags: ["便携"],
    });
    expect(result.field_suggestions).toEqual([]);
  });
});
