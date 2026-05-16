import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const repo = await import("./repository.js");
const { applySealConfig } = await import("./seal-config.js");

beforeEach(() => {
  dbModule.migrate();
  dbModule.db.prepare("DELETE FROM workspace_members").run();
  dbModule.db.prepare("DELETE FROM workspaces").run();
  dbModule.db.prepare("DELETE FROM news_sources").run();
  dbModule.db.prepare("DELETE FROM users").run();
  dbModule.db.prepare("DELETE FROM app_data").run();
  dbModule.ensureSeed({
    user: { name: "visitor", role: "产品经理", initials: "VI" },
    products: [],
    demands: [],
    news: [],
    research: [],
    rssSources: [],
    settings: {},
  });
});

describe("seal config", () => {
  it("applies private workspaces and source lists from json", () => {
    const dir = mkdtempSync(join(tmpdir(), "loom-seal-"));
    repo.ensureLocalUser({
      id: "manual-collins",
      email: "collins@example.com",
      name: "Collins",
      auth_provider: "password",
    });
    writeFileSync(join(dir, "workspaces.json"), JSON.stringify([
      { slug: "company", name: "Company Workspace", type: "company" },
      { slug: "collins-workplace", name: "Collins' workplace", type: "small_team" },
    ], null, 2));
    writeFileSync(join(dir, "users.json"), JSON.stringify([
      { username: "seal-user", name: "Seal User", role_code: "member" },
    ], null, 2));
    writeFileSync(join(dir, "workspace-members.json"), JSON.stringify([
      { email: "collins@example.com", workspace_slug: "collins-workplace", role: "admin" },
      { user_id: "password-seal-user", workspace_slug: "collins-workplace", role: "member" },
    ], null, 2));
    writeFileSync(join(dir, "news-sources.json"), JSON.stringify([
      {
        id: "rss-private-test",
        user_id: dbModule.getLegacyUserId(),
        workspace_slug: "company",
        name: "Private Test Feed",
        url: "https://example.com/feed.xml",
        type: "rss",
        group: "official-default",
        source_group: "official-default",
      },
    ], null, 2));

    const result = applySealConfig(dir);
    const source = repo.listNewsSources(dbModule.getLegacyUserId()).find((item) => item.id === "rss-private-test");
    const member = dbModule.db.prepare(`
      SELECT w.slug, wm.role
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = ?
    `).get("manual-collins");

    expect(result).toMatchObject({
      configured: true,
      workspaces: 2,
      users: 1,
      workspaceMembers: 2,
      newsSources: 1,
    });
    expect(source?.name).toBe("Private Test Feed");
    expect(member).toMatchObject({ slug: "collins-workplace", role: "admin" });
    expect(repo.findUserById("password-seal-user")?.name).toBe("Seal User");
  });
});
