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

function mockLlmJsonSequence(payloads, onRequest = () => {}) {
  let index = 0;
  vi.stubGlobal("fetch", async (_url, options) => {
    const body = JSON.parse(options.body);
    onRequest(body, index);
    const payload = payloads[Math.min(index, payloads.length - 1)];
    index += 1;
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

  it("does not pass current Taobao price as original price when source lacks a real original price", async () => {
    let prompt = "";
    mockLlmJson({
      name: "SmallRig cage",
      price: "¥435",
      discount_price: "¥435",
      original_price: "",
      selling_points: [],
      negative_keywords: [],
      tag_values: {},
    }, (body) => {
      prompt = body.messages?.map((message) => message.content).join("\n") || "";
    });

    const result = await parsers.parseProductRaw(dbModule.getLegacyUserId(), {
      platform: "taobao",
      data: {
        name: "SmallRig cage",
        price: "¥435",
        discount_price: "¥435",
        original_price: "",
      },
    });

    expect(prompt).toContain("原价：");
    expect(prompt).not.toContain("原价：¥435");
    expect(result.original_price).toBe("");
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

  it("returns Chinese selling points for Amazon raw bullets when AI organizes them", async () => {
    mockLlmJson({
      name: "Magnetic fill light",
      brand: "NEEWER",
      selling_points: ["磁吸快装", "亮度可调", "适合桌面补光"],
      negative_keywords: [],
      ai_summary: "适合桌面拍摄的磁吸补光灯",
      tag_values: {},
    });

    const result = await parsers.parseProductRaw(dbModule.getLegacyUserId(), {
      platform: "amazon",
      data: {
        title: "Magnetic fill light",
        url: "https://example.test/magnetic-fill-light",
        raw_bullets: [
          "Magnetic mount for quick setup",
          "Adjustable brightness for desktop shooting",
          "Compact size for small studio spaces",
        ],
      },
    });

    expect(result.selling_points).toEqual(["磁吸快装", "亮度可调", "适合桌面补光"]);
  });

  it("returns Chinese visible comments for Amazon raw comments when AI organizes them", async () => {
    let prompt = "";
    mockLlmJson({
      name: "Magnetic fill light",
      brand: "NEEWER",
      selling_points: ["磁吸快装"],
      visible_comments: [
        { id: "r1", user_name: "Alice", content: "磁吸安装很方便", like_count: 3, posted_at_text: "2026-05-01" },
        { user_name: "Bob", content: "桌面补光够用，但再轻一点更好", like_count: 1, posted_at_text: "2026-05-03" },
      ],
      negative_keywords: [],
      ai_summary: "适合桌面拍摄的磁吸补光灯",
      tag_values: {},
    }, (body) => {
      prompt = body.messages?.map((message) => message.content).join("\n") || "";
    });

    const result = await parsers.parseProductRaw(dbModule.getLegacyUserId(), {
      platform: "amazon",
      data: {
        title: "Magnetic fill light",
        url: "https://example.test/magnetic-fill-light",
        raw_bullets: ["Magnetic mount for quick setup"],
        visible_comments: [
          { user_name: "Alice", content: "Really useful magnetic mount", like_count: 3, posted_at_text: "May 1, 2026" },
          { user_name: "Bob", content: "Brightness is good for desk shooting", like_count: 1, posted_at_text: "May 3, 2026" },
        ],
      },
    });

    expect(prompt).toContain("可见评论");
    expect(prompt).toContain("Alice：Really useful magnetic mount");
    expect(result.visible_comments).toEqual([
      { id: "r1", user_name: "Alice", content: "磁吸安装很方便", like_count: 3, posted_at_text: "2026-05-01", location: "", is_reply: false },
      { id: "", user_name: "Bob", content: "桌面补光够用，但再轻一点更好", like_count: 1, posted_at_text: "2026-05-03", location: "", is_reply: false },
    ]);
  });

  it("preserves Amazon source comment ids when AI translates comments without ids", async () => {
    mockLlmJson({
      name: "Magnetic fill light",
      brand: "NEEWER",
      selling_points: ["磁吸快装"],
      visible_comments: [
        { user_name: "Alice", content: "磁吸安装很方便", like_count: 3 },
        { user_name: "Bob", content: "桌面补光够用", like_count: 1 },
      ],
      negative_keywords: [],
      ai_summary: "适合桌面拍摄的磁吸补光灯",
      tag_values: {},
    });

    const result = await parsers.parseProductRaw(dbModule.getLegacyUserId(), {
      platform: "amazon",
      data: {
        title: "Magnetic fill light",
        url: "https://example.test/magnetic-fill-light",
        raw_bullets: ["Magnetic mount for quick setup"],
        visible_comments: [
          { id: "review-a", user_name: "Alice", content: "Really useful magnetic mount", like_count: 3, posted_at_text: "May 1, 2026" },
          { id: "review-b", user_name: "Bob", content: "Brightness is good for desk shooting", like_count: 1, posted_at_text: "May 3, 2026" },
        ],
      },
    });

    expect(result.visible_comments).toEqual([
      { id: "review-a", user_name: "Alice", content: "磁吸安装很方便", like_count: 3, posted_at_text: "May 1, 2026", location: "", is_reply: false },
      { id: "review-b", user_name: "Bob", content: "桌面补光够用", like_count: 1, posted_at_text: "May 3, 2026", location: "", is_reply: false },
    ]);
  });

  it("repairs untranslated Amazon comments before returning the first AI organize result", async () => {
    const prompts = [];
    mockLlmJsonSequence([
      {
        name: "LEOFOTO tac table",
        brand: "LEOFOTO",
        selling_points: ["稳定支撑"],
        visible_comments: [
          { id: "review-a", user_name: "Hopper", content: "Lots of ways to position your optics and weather station for PRS matches", like_count: 0 },
          { id: "review-b", user_name: "Philip East", content: "This is a great tripod table. Very easy to set up and use.", like_count: 0 },
        ],
        negative_keywords: [],
        ai_summary: "适合户外装备支撑的折叠桌",
        tag_values: {},
      },
      {
        visible_comments: [
          { id: "review-a", user_name: "Hopper", content: "可以用多种方式放置光学设备和气象站，适合 PRS 比赛。", like_count: 0 },
          { id: "review-b", user_name: "Philip East", content: "这款三脚架桌很好，安装和使用都很方便，拧紧后非常稳定。", like_count: 0 },
        ],
        selling_points: ["集成 Arca 导轨", "可折叠战术桌", "稳定支撑"],
      },
    ], (body) => {
      prompts.push(body.messages?.map((message) => message.content).join("\n") || "");
    });

    const result = await parsers.parseProductRaw(dbModule.getLegacyUserId(), {
      platform: "amazon",
      data: {
        title: "LEOFOTO FDM-05 Foldable Tac Table",
        url: "https://example.test/leofoto",
        raw_bullets: ["Integrated Arca Rail", "Foldable tactical table"],
        visible_comments: [
          { id: "review-a", user_name: "Hopper", content: "Lots of ways to position your optics and weather station for PRS matches", like_count: 0, posted_at_text: "Reviewed in the United States on August 25, 2025" },
          { id: "review-b", user_name: "Philip East", content: "This is a great tripod table. Very easy to set up and use.", like_count: 0, posted_at_text: "Reviewed in the United States on July 18, 2025" },
        ],
      },
    });

    expect(result.visible_comments).toEqual([
      { id: "review-a", user_name: "Hopper", content: "可以用多种方式放置光学设备和气象站，适合 PRS 比赛。", like_count: 0, posted_at_text: "Reviewed in the United States on August 25, 2025", location: "", is_reply: false },
      { id: "review-b", user_name: "Philip East", content: "这款三脚架桌很好，安装和使用都很方便，拧紧后非常稳定。", like_count: 0, posted_at_text: "Reviewed in the United States on July 18, 2025", location: "", is_reply: false },
    ]);
    expect(result.selling_points).toEqual(["集成 Arca 导轨", "可折叠战术桌", "稳定支撑"]);
    expect(result.__loom_ai_warnings).toEqual([]);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("上一次 AI 结果仍有英文");
  });

  it("appends Amazon detail-image selling points after the listing selling points", async () => {
    const userId = dbModule.getLegacyUserId();
    repo.updateSettings(userId, {
      llm_vision_api_url: "https://vision.test/v1",
      llm_vision_model: "vision-test",
      llm_vision_api_key: "vision-secret",
    });
    const calls = [];
    mockLlmJsonSequence(
      [
        { name: "桌面补光灯", selling_points: ["磁吸快装", "亮度可调"], ai_summary: "桌面补光灯" },
        { selling_points: ["Type-C 快充", "亮度可调", "CRI 95 高显色"] },
      ],
      (body) => calls.push(body),
    );

    const result = await parsers.parseProductRaw(userId, {
      platform: "amazon",
      data: {
        name: "Desk Light",
        raw_bullets: ["Magnetic mount", "Adjustable brightness"],
        detail_images: ["https://img.test/a1.jpg", "https://img.test/a2.jpg"],
      },
    });

    // 第二段是视觉调用：用 vision 模型读详情图
    expect(calls).toHaveLength(2);
    expect(calls[1].model).toBe("vision-test");
    expect(calls[1].messages[1].content.filter((part) => part.type === "image_url")).toHaveLength(2);
    // listing 卖点在前，详情图卖点追加在后，重复项（“亮度可调”）去重
    expect(result.selling_points).toEqual(["磁吸快装", "亮度可调", "Type-C 快充", "CRI 95 高显色"]);
  });

  it("keeps Amazon listing selling points unchanged when no detail images are present", async () => {
    const userId = dbModule.getLegacyUserId();
    repo.updateSettings(userId, {
      llm_vision_api_url: "https://vision.test/v1",
      llm_vision_model: "vision-test",
      llm_vision_api_key: "vision-secret",
    });
    const calls = [];
    mockLlmJson({ name: "桌面补光灯", selling_points: ["磁吸快装", "亮度可调"], ai_summary: "桌面补光灯" }, (body) => calls.push(body));

    const result = await parsers.parseProductRaw(userId, {
      platform: "amazon",
      data: { name: "Desk Light", raw_bullets: ["Magnetic mount"], detail_images: [] },
    });

    // 没详情图就不触发视觉调用，只有一段文本整理
    expect(calls).toHaveLength(1);
    expect(result.selling_points).toEqual(["磁吸快装", "亮度可调"]);
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
