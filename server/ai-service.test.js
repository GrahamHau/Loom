import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const aiService = await import("./ai-service.js");

beforeEach(() => {
  dbModule.migrate();
  dbModule.db.prepare("DELETE FROM llm_call_logs").run();
  dbModule.db.prepare("DELETE FROM app_data").run();
  dbModule.ensureSeed({
    user: { name: "Graham", role: "管理员", initials: "GR" },
    settings: {
      llm_api_url: "https://text.example/v1",
      llm_model: "text-model",
      llm_api_key: "text-key",
      llm_vision_api_url: "https://vision.example/v1",
      llm_vision_model: "vision-model",
      llm_vision_api_key: "vision-key",
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockResponse(payload) {
  return {
    ok: true,
    json: async () => payload,
  };
}

describe("ai-service routing", () => {
  it("routes image prompts through the vision model first and then text model", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      if (calls.length === 1) {
        expect(body.model).toBe("vision-model");
        expect(body.messages[1].content[0].type).toBe("text");
        expect(body.messages[1].content.some((item) => item.type === "image_url")).toBe(true);
        return mockResponse({ choices: [{ message: { content: JSON.stringify({ brand: "DJI", summary: "vision" }) } }] });
      }
      expect(body.model).toBe("text-model");
      expect(String(body.messages[1].content)).toContain("视觉模型提取结果");
      return mockResponse({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] });
    });

    await aiService.callRoutedLLM({
      userId: dbModule.getLegacyUserId(),
      system: "text system",
      user: "text user",
      imageUrls: ["https://img.test/a.jpg"],
      visionSystem: "vision system",
      visionUser: "vision user",
    });

    expect(calls).toHaveLength(2);
    const logs = dbModule.db.prepare("SELECT kind, purpose, status FROM llm_call_logs ORDER BY created_at ASC, rowid ASC").all();
    expect(logs.map((log) => log.kind)).toEqual(["vision", "text"]);
    expect(logs.every((log) => log.status === "ok")).toBe(true);
  });

  it("uses the text model directly when no images are present", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      expect(body.model).toBe("text-model");
      expect(body.messages[1].content).toBe("text user");
      return mockResponse({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] });
    });

    await aiService.callRoutedLLM({
      userId: dbModule.getLegacyUserId(),
      system: "text system",
      user: "text user",
      imageUrls: [],
    });

    expect(calls).toHaveLength(1);
    const log = dbModule.db.prepare("SELECT kind, purpose, status FROM llm_call_logs").get();
    expect(log.kind).toBe("text");
    expect(log.status).toBe("ok");
  });

  it("records failed LLM calls without storing prompt content", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "rate limited" } }),
    }));

    await expect(aiService.callLLM({
      userId: dbModule.getLegacyUserId(),
      purpose: "test:failure",
      system: "secret system",
      user: "secret user",
    })).rejects.toMatchObject({ code: "llm_request_failed" });

    const log = dbModule.db.prepare("SELECT * FROM llm_call_logs").get();
    expect(log.status).toBe("error");
    expect(log.http_status).toBe(429);
    expect(JSON.stringify(log)).not.toContain("secret user");
  });
});
