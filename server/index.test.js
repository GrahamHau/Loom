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

  it("keeps password users unassigned until admin assigns a workspace", async () => {
    process.env.LOOM_OWNER_EMAIL = process.env.APP_USERNAME;
    dbModule.migrate();
    const ownerLogin = await login();

    dbModule.db.prepare(`
      INSERT INTO users (
        id, email, name, initials, role, role_code, status, auth_provider, created_at, updated_at
      ) VALUES (
        'manual-user-test', 'manual@example.com', 'Manual', 'MA', '成员', 'member', 'active', 'password', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run();

    const dashboardResponse = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { Cookie: ownerLogin.cookie },
    });
    const dashboardBody = await dashboardResponse.json();
    expect(dashboardResponse.status).toBe(200);
    expect(dashboardBody.totals.unassigned_users).toBeGreaterThanOrEqual(1);
    expect(dashboardBody.unassigned_users.some((user) => user.id === "manual-user-test")).toBe(true);

    const createWorkspaceResponse = await fetch(`${baseUrl}/api/admin/workspaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerLogin.cookie },
      body: JSON.stringify({ name: "GF Team", slug: "gf-team", type: "small_team" }),
    });
    const workspace = await createWorkspaceResponse.json();
    expect(createWorkspaceResponse.status).toBe(201);
    expect(workspace.slug).toBe("gf-team");

    const assignResponse = await fetch(`${baseUrl}/api/admin/users/manual-user-test/workspaces/gf-team`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerLogin.cookie },
      body: JSON.stringify({ role: "member" }),
    });
    const assigned = await assignResponse.json();
    expect(assignResponse.status).toBe(200);
    expect(assigned.workspaces.some((item) => item.slug === "gf-team")).toBe(true);
  });

  it("auto-assigns Feishu users to the configured company workspace", async () => {
    const { ensureLocalUser } = await import("./repository.js");
    ensureLocalUser({
      id: "feishu-user-test",
      email: "feishu@example.com",
      name: "Feishu User",
      auth_provider: "feishu",
      feishu_open_id: "ou_test",
    });

    const member = dbModule.db.prepare(`
      SELECT w.slug, wm.role, wm.is_default
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = ?
    `).get("feishu-user-test");

    expect(member.slug).toBe("company");
    expect(member.role).toBe("member");
    expect(member.is_default).toBe(1);
  });

  it("assigns the configured password owner as company workspace admin", async () => {
    process.env.LOOM_OWNER_EMAIL = process.env.APP_USERNAME;
    dbModule.migrate();
    const ownerLogin = await login();
    expect(ownerLogin.body.user.is_owner).toBe(true);

    const member = dbModule.db.prepare(`
      SELECT w.slug, wm.role, wm.is_default
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = ?
    `).get(ownerLogin.body.user.id);

    expect(member.slug).toBe("company");
    expect(member.role).toBe("admin");
    expect(member.is_default).toBe(1);
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
