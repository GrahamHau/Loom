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
      category: "L灯光类",
      tag_values: {
        brand: ["DJI"],
        category: ["L灯光类"],
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
    expect(result.category).toBe("L灯光类");
    expect(result.tag_values).toEqual({
      brand: ["DJI"],
      category: ["L灯光类"],
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
      options: ["L灯光类"],
    });
    mockLlmJson({
      name: "DJI light",
      brand: "DJI",
      category: "L灯光类",
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
      category: ["L灯光类"],
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
    });

    const result = await parsers.parseDemandRaw(dbModule.getLegacyUserId(), {
      platform: "xiaohongshu",
      data: { title: "Vlog 自拍补光需求", content: "自拍补光灯太重，携带不方便" },
    });

    expect(result.tag_values).toEqual({
      scenarios: ["vlog 自拍"],
      painpoints: ["太重"],
      innovation: ["形态创新"],
    });
    expect(result.field_suggestions).toEqual([]);
  });

  it("routes Xiaohongshu demand images through vision and comments through text finalize", async () => {
    const userId = dbModule.getLegacyUserId();
    repo.updateSettings(userId, {
      llm_vision_api_url: "https://vision.test/v1",
      llm_vision_model: "vision-test",
      llm_vision_api_key: "vision-secret",
    });
    const calls = [];
    vi.stubGlobal("fetch", async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      if (calls.length === 1) {
        expect(body.model).toBe("vision-test");
        expect(body.messages[1].content.filter((part) => part.type === "image_url")).toHaveLength(3);
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: JSON.stringify({ image_summary: "图里是 Pocket 3 的补光配件" }) } }] }),
        };
      }
      expect(body.model).toBe("gpt-test");
      expect(String(body.messages[1].content)).toContain("视觉模型提取结果");
      expect(String(body.messages[1].content)).toContain("评论A：希望适配 Pocket3");
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({
          title: "Pocket 3 补光配件需求",
          summary: "用户希望 Pocket 3 低光拍摄有更便携补光方案",
          host: "DJI Pocket 3",
          tags_scenario: ["vlog 自拍"],
          tags_painpoint: ["太重"],
          tags_innovation: "形态创新",
        }) } }] }),
      };
    });

    const result = await parsers.parseDemandRaw(userId, {
      platform: "xiaohongshu",
      data: {
        title: "夜拍补光",
        content: "Pocket3 夜间拍摄太暗",
        thumbnail_url: "https://img.test/cover.jpg",
        image_urls: ["https://img.test/cover.jpg", "https://img.test/two.jpg", "https://img.test/three.jpg"],
        visible_comments: [
          { user_name: "评论A", content: "希望适配 Pocket3" },
          { user_name: "评论B", content: "别太重" },
        ],
      },
    });

    expect(calls).toHaveLength(2);
    expect(result.host).toBe("Osmo Pocket 3");
    expect(result.host_match).toMatchObject({
      raw_name: "DJI Pocket 3",
      canonical_name: "Osmo Pocket 3",
      matched_by: "fuzzy",
    });
    expect(result.tag_values.host).toEqual(["Osmo Pocket 3"]);
    expect(result.ai_summary).toBe("用户希望 Pocket 3 低光拍摄有更便携补光方案");
  });
});
