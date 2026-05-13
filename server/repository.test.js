import { beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const repo = await import("./repository.js");

beforeEach(() => {
  dbModule.migrate();
  dbModule.saveState({
    user: { name: "Graham", role: "管理员", initials: "GR" },
    products: [],
    demands: [],
    news: [{ id: "n1", starred: false }],
    research: [],
    rssSources: [],
    settings: { llm_api_key: "secret", feishu_app_secret: "secret2" },
  });
  dbModule.db.prepare("DELETE FROM users").run();
  dbModule.db.prepare("DELETE FROM news_items").run();
  dbModule.db.prepare("DELETE FROM news_sources").run();
  dbModule.ensureSeed({
    user: { name: "Graham", role: "管理员", initials: "GR" },
    products: [],
    demands: [],
    news: [],
    research: [],
    rssSources: [],
    settings: { llm_api_key: "secret", feishu_app_secret: "secret2" },
  });
});

describe("repository", () => {
  it("creates per-user products", () => {
    const user = repo.ensureLocalUser({ id: "u1", name: "Alice", initials: "AL", auth_provider: "feishu" });
    const product = repo.createProduct(user.id, { name: "Test Product" });
    expect(product.name).toBe("Test Product");
    expect(repo.rawState(user.id).products).toHaveLength(1);
  });

  it("masks settings in bootstrap", () => {
    const user = repo.ensureLegacyWorkspace();
    expect(repo.bootstrap(user.id).settings.llm_api_key).toBe("********");
    expect(repo.bootstrap(user.id).settings.feishu_app_secret).toBe("********");
  });

  it("isolates products by user", () => {
    const alice = repo.ensureLocalUser({ id: "alice", name: "Alice", initials: "AL", auth_provider: "feishu" });
    const bob = repo.ensureLocalUser({ id: "bob", name: "Bob", initials: "BO", auth_provider: "feishu" });
    repo.createProduct(alice.id, { name: "Alice Camera" });
    repo.createProduct(bob.id, { name: "Bob Light" });
    expect(repo.rawState(alice.id).products.map((item) => item.name)).toEqual(["Alice Camera"]);
    expect(repo.rawState(bob.id).products.map((item) => item.name)).toEqual(["Bob Light"]);
  });

  it("updates news flags per user", () => {
    const user = repo.ensureLocalUser({ id: "u-news", name: "News User", initials: "NU", auth_provider: "feishu" });
    repo.upsertNews(user.id, [{ source_id: "s1", source: "S", original_url: "https://a.test/1", titleZh: "A", date: "2026-05-10" }]);
    const item = repo.listNews(user.id)[0];
    repo.updateNews(user.id, item.id, { starred: true });
    expect(repo.listNews(user.id).find((entry) => entry.id === item.id)?.starred).toBe(true);
  });

  it("dedupes news within the same user only", () => {
    const alice = repo.ensureLocalUser({ id: "alice-news", name: "Alice", initials: "AL", auth_provider: "feishu" });
    const bob = repo.ensureLocalUser({ id: "bob-news", name: "Bob", initials: "BO", auth_provider: "feishu" });
    const input = { source_id: "google", source: "Google News", original_url: "https://news.google.com/rss/a", titleZh: "Tilta launches filter kit", date: "2026-05-10" };
    repo.upsertNews(alice.id, [input]);
    repo.upsertNews(alice.id, [input]);
    repo.upsertNews(bob.id, [input]);
    expect(repo.listNews(alice.id)).toHaveLength(1);
    expect(repo.listNews(bob.id)).toHaveLength(1);
  });

  it("creates and reports news source health fields", () => {
    const user = repo.ensureLocalUser({ id: "u-source", name: "Source User", initials: "SU", auth_provider: "feishu" });
    const source = repo.createNewsSource(user.id, { name: "Test Feed", url: "https://example.com/feed.xml", group: "brand-news", brand: "DJI" });
    expect(source?.source_group).toBe("brand-news");
    expect(source?.brand).toBe("DJI");
    const updated = repo.updateNewsSource(user.id, source.id, { last_fetched_at: "2026-05-11T00:00:00.000Z", last_item_count: 12, last_error: "HTTP 403" });
    expect(updated?.last_item_count).toBe(12);
    expect(updated?.last_error).toBe("HTTP 403");
  });

  it("does not overwrite masked secrets", () => {
    const user = repo.ensureLegacyWorkspace();
    repo.updateSettings(user.id, { llm_api_key: "********", feishu_app_secret: "********", llm_model: "m2" });
    expect(repo.rawState(user.id).settings.llm_api_key).toBe("secret");
    expect(repo.rawState(user.id).settings.feishu_app_secret).toBe("secret2");
    expect(repo.rawState(user.id).settings.llm_model).toBe("m2");
  });

  it("creates and updates research", () => {
    const user = repo.ensureLocalUser({ id: "u-research", name: "Research User", initials: "RU", auth_provider: "feishu" });
    const item = repo.createResearch(user.id, { title: "Test Research", desc: "Idea" });
    repo.updateResearch(user.id, item.id, { products: ["p1"], demands: ["d1"] });
    expect(repo.rawState(user.id).research[0].products).toEqual(["p1"]);
    expect(repo.rawState(user.id).research[0].demands).toEqual(["d1"]);
  });

  it("finds users by feishu identity", () => {
    const user = repo.ensureLocalUser({
      id: "u-feishu",
      name: "Feishu User",
      initials: "FU",
      auth_provider: "feishu",
      feishu_open_id: "ou_xxx",
      feishu_union_id: "on_xxx",
      feishu_tenant_key: "tenant_xxx",
    });
    const found = repo.findUserByFeishuProfile({ open_id: "ou_xxx", union_id: "on_xxx" });
    expect(found?.id).toBe(user.id);
  });
});
