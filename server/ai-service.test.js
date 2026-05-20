import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const aiService = await import("./ai-service.js");
const repo = await import("./repository.js");

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

  it("skips image payloads when no vision model is configured", async () => {
    const userId = dbModule.getLegacyUserId();
    repo.updateSettings(userId, {
      llm_vision_api_url: "",
      llm_vision_model: "",
      llm_vision_api_key: "",
    });
    const calls = [];
    vi.stubGlobal("fetch", async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      expect(body.model).toBe("text-model");
      expect(body.messages[1].content).toBe("text user");
      return mockResponse({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] });
    });

    await aiService.callRoutedLLM({
      userId,
      system: "text system",
      user: "text user",
      imageUrls: ["https://img.test/a.jpg", "https://img.test/b.jpg"],
    });

    expect(calls).toHaveLength(1);
    const logs = dbModule.db.prepare("SELECT kind, purpose, status FROM llm_call_logs").all();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ kind: "text", status: "ok" });
  });

  it("falls back to admin platform AI config for allowed users without personal LLM", async () => {
    const userId = "platform-ai-user";
    dbModule.db.prepare(`
      INSERT INTO users (
        id, email, name, initials, role, role_code, status, auth_provider, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(userId, "user@example.com", "Platform User", "PU", "成员", "member", "active", "password");
    dbModule.saveUserState(userId, {
      user: { id: userId, name: "Platform User", auth_provider: "password" },
      products: [],
      demands: [],
      news: [],
      research: [],
      rssSources: [],
      settings: {},
    });
    dbModule.writeJson("platform_ai_organize_config", {
      enabled: true,
      api_type: "openai",
      api_url: "https://platform.example/v1",
      model: "platform-model",
      api_key: "platform-key",
      allow_all_users: false,
      allowed_user_ids: [userId],
    });
    const calls = [];
    vi.stubGlobal("fetch", async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, body, authorization: options.headers.Authorization });
      return mockResponse({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] });
    });

    await aiService.callLLM({
      userId,
      purpose: "platform-ai:test",
      system: "system",
      user: "user",
    });

    expect(calls).toHaveLength(1);
    expect(String(calls[0].url)).toBe("https://platform.example/v1/chat/completions");
    expect(calls[0].body.model).toBe("platform-model");
    expect(calls[0].authorization).toBe("Bearer platform-key");
  });

  it("does not use platform AI config for users outside the allow list", async () => {
    const userId = "platform-ai-denied";
    dbModule.db.prepare(`
      INSERT INTO users (
        id, email, name, initials, role, role_code, status, auth_provider, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(userId, "denied@example.com", "Denied User", "DU", "成员", "member", "active", "password");
    dbModule.saveUserState(userId, {
      user: { id: userId, name: "Denied User", auth_provider: "password" },
      settings: {},
    });
    dbModule.writeJson("platform_ai_organize_config", {
      enabled: true,
      api_url: "https://platform.example/v1",
      model: "platform-model",
      api_key: "platform-key",
      allow_all_users: false,
      allowed_user_ids: ["other-user"],
    });

    await expect(aiService.callLLM({
      userId,
      purpose: "platform-ai:denied",
      system: "system",
      user: "user",
    })).rejects.toMatchObject({ code: "llm_not_configured" });
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
