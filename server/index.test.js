import { afterEach, beforeEach, describe, expect, it } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = ":memory:";
process.env.APP_USERNAME = "tester@example.com";
process.env.APP_PASSWORD = "secret123";
process.env.LOOM_OWNER_EMAIL = "";

const dbModule = await import("./db.js");
const { default: app, zonedDateHour } = await import("./index.js");

let server;
let baseUrl = "";

function extractCookie(headers) {
  const raw = headers.get("set-cookie") || "";
  return raw.split(";")[0] || "";
}

beforeEach(async () => {
  process.env.LOOM_OWNER_EMAIL = "";
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

describe("admin users", () => {
  async function login(username = process.env.APP_USERNAME, password = process.env.APP_PASSWORD) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const body = await response.json();
    return { response, body, cookie: extractCookie(response.headers) };
  }

  it("blocks non-admin users from the admin API", async () => {
    const { cookie } = await login();
    const response = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(403);
  });

  it("allows the configured owner to manage users and revoke disabled user tokens", async () => {
    process.env.LOOM_OWNER_EMAIL = process.env.APP_USERNAME;
    dbModule.migrate();

    const ownerLogin = await login();
    expect(ownerLogin.body.user.is_owner).toBe(true);

    const created = dbModule.db.prepare(`
      INSERT INTO users (
        id, email, name, initials, role, role_code, status, auth_provider, created_at, updated_at
      ) VALUES (
        'regular-admin-test', 'regular@example.com', 'Regular', 'RE', '成员', 'member', 'active', 'password', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run();
    expect(created.changes).toBe(1);
    dbModule.upsertApiToken("regular-token", "regular-admin-test");

    const listResponse = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Cookie: ownerLogin.cookie },
    });
    const listBody = await listResponse.json();
    expect(listResponse.status).toBe(200);
    expect(listBody.items.some((item) => item.id === "regular-admin-test")).toBe(true);

    const disableResponse = await fetch(`${baseUrl}/api/admin/users/regular-admin-test`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerLogin.cookie },
      body: JSON.stringify({ status: "suspended" }),
    });
    expect(disableResponse.status).toBe(200);

    const tokenResponse = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: "Bearer regular-token" },
    });
    expect(tokenResponse.status).toBe(401);

    const originalUsername = process.env.APP_USERNAME;
    try {
      process.env.APP_USERNAME = "regular@example.com";
      const disabledLogin = await login("regular@example.com", process.env.APP_PASSWORD);
      expect(disabledLogin.response.status).toBe(403);
    } finally {
      process.env.APP_USERNAME = originalUsername;
    }
  });

  it("protects the last active owner from demotion", async () => {
    process.env.LOOM_OWNER_EMAIL = process.env.APP_USERNAME;
    dbModule.migrate();
    const { cookie, body } = await login();

    const response = await fetch(`${baseUrl}/api/admin/users/${body.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ role_code: "member" }),
    });

    expect(response.status).toBe(409);
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
