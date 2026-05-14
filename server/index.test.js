import { afterEach, beforeEach, describe, expect, it } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = ":memory:";
process.env.APP_USERNAME = "tester@example.com";
process.env.APP_PASSWORD = "secret123";

const dbModule = await import("./db.js");
const { default: app, zonedDateHour } = await import("./index.js");

let server;
let baseUrl = "";

function extractCookie(headers) {
  const raw = headers.get("set-cookie") || "";
  return raw.split(";")[0] || "";
}

beforeEach(async () => {
  dbModule.migrate();
  dbModule.db.prepare("DELETE FROM news_items").run();
  dbModule.db.prepare("DELETE FROM news_sources").run();
  dbModule.db.prepare("DELETE FROM users").run();
  dbModule.db.prepare("DELETE FROM app_data").run();
  dbModule.db.prepare("DELETE FROM api_tokens").run();
  dbModule.ensureSeed({
    user: { name: "Graham", role: "管理员", initials: "GR" },
    products: [],
    demands: [],
    news: [],
    research: [],
    rssSources: [],
    settings: { llm_api_key: "secret", feishu_app_secret: "secret2" },
  });
  server = await new Promise((resolve) => {
    const next = app.listen(0, "127.0.0.1", () => resolve(next));
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  server = null;
  baseUrl = "";
});

describe("auth logout", () => {
  it("clears the session and revokes all user tokens on web logout", async () => {
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.APP_USERNAME,
        password: process.env.APP_PASSWORD,
      }),
    });
    const loginBody = await loginResponse.json();
    const sessionCookie = extractCookie(loginResponse.headers);

    expect(loginResponse.status).toBe(200);
    expect(sessionCookie.startsWith("connect.sid=")).toBe(true);
    expect(loginBody.token).toBeTruthy();

    const pluginTokenResponse = await fetch(`${baseUrl}/api/auth/extension/session-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_cookie: decodeURIComponent(sessionCookie.split("=")[1] || ""),
      }),
    });
    const pluginTokenBody = await pluginTokenResponse.json();
    expect(pluginTokenResponse.status).toBe(200);
    expect(pluginTokenBody.token).toBeTruthy();

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: sessionCookie },
    });
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers.get("set-cookie") || "").toContain("connect.sid=");

    const meWithCookie = await fetch(`${baseUrl}/api/me`, {
      headers: { Cookie: sessionCookie },
    });
    expect(meWithCookie.status).toBe(401);

    const meWithPluginToken = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${pluginTokenBody.token}` },
    });
    expect(meWithPluginToken.status).toBe(401);

    const meWithLoginToken = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    expect(meWithLoginToken.status).toBe(401);
  });
});

describe("scheduler timezones", () => {
  it("uses Beijing time for fixed WeChat collection hours", () => {
    expect(zonedDateHour("Asia/Shanghai", new Date("2026-05-14T01:00:00.000Z"))).toEqual({
      date: "2026-05-14",
      hour: 9,
    });
    expect(zonedDateHour("Asia/Shanghai", new Date("2026-05-14T13:00:00.000Z"))).toEqual({
      date: "2026-05-14",
      hour: 21,
    });
  });
});
