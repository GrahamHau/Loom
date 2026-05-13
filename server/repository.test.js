import { describe, expect, it, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const repo = await import("./repository.js");

beforeEach(() => {
  dbModule.migrate();
  dbModule.db.prepare("DELETE FROM news_items").run();
  dbModule.db.prepare("DELETE FROM news_sources").run();
  dbModule.db.prepare("DELETE FROM users").run();
  dbModule.db.prepare("DELETE FROM app_data").run();
  dbModule.ensureSeed({
    user: { name: "Graham", role: "管理员", initials: "GR" },
    products: [],
    demands: [],
    news: [],
    research: [],
    rssSources: [],
    settings: { llm_api_key: "secret", feishu_app_secret: "secret2" },
  });
  const legacyUserId = dbModule.getLegacyUserId();
  repo.ensureLegacyWorkspace();
  dbModule.db.prepare(`
    INSERT INTO news_items (
      id, user_id, source_id, source_name, original_title, original_url,
      title_zh, summary_zh, type, is_kept, is_read, is_starred, published_at,
      llm_processed, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "n1", legacyUserId, "s1", "Source 1", "Seed title", "https://seed.test/1",
    "Seed title", "", "行业趋势", 1, 0, 0, "2026-05-10T00:00:00.000Z",
    1, "2026-05-10T00:00:00.000Z", "2026-05-10T00:00:00.000Z"
  );
});

describe("repository", () => {
  it("creates products", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const product = repo.createProduct(legacyUserId, { name: "Test Product" });
    expect(product.name).toBe("Test Product");
    expect(repo.rawState(legacyUserId).products).toHaveLength(1);
  });

  it("masks settings in bootstrap", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    expect(repo.bootstrap(legacyUserId).settings.llm_api_key).toBe("********");
    expect(repo.bootstrap(legacyUserId).settings.feishu_app_secret).toBe("********");
  });

  it("updates news flags", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.updateNews(legacyUserId, "n1", { starred: true });
    expect(repo.listNews(legacyUserId).find((item) => item.id === "n1")?.starred).toBe(true);
  });

  it("upserts news by source and url", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [{ source_id: "s1", source: "S", original_url: "https://a.test/1", titleZh: "A", date: "2026-05-10" }]);
    repo.upsertNews(legacyUserId, [{ source_id: "s1", source: "S", original_url: "https://a.test/1", titleZh: "B", date: "2026-05-10" }]);
    expect(repo.listNews(legacyUserId)).toHaveLength(2);
    expect(repo.listNews(legacyUserId).find((item) => item.original_url === "https://a.test/1")?.titleZh).toBe("A");
  });

  it("dedupes by original url per user", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const secondUser = repo.ensureLocalUser({ id: "user-b", name: "User B", auth_provider: "feishu" });
    repo.upsertNews(legacyUserId, [
      { source_id: "google", source: "配件竞品新品 - Google News", original_url: "https://news.google.com/rss/a", titleZh: "Tilta launches filter kit", original_title: "Tilta launches filter kit", date: "2026-05-10" },
      { source_id: "google", source: "配件竞品新品 - Google News", original_url: "https://news.google.com/rss/b", titleZh: "Tilta launches filter kit", original_title: "Tilta launches filter kit", date: "2026-05-10" },
    ]);
    repo.upsertNews(secondUser.id, [
      { source_id: "google", source: "配件竞品新品 - Google News", original_url: "https://news.google.com/rss/a", titleZh: "Tilta launches filter kit", original_title: "Tilta launches filter kit", date: "2026-05-10" },
    ]);
    const legacyMatches = repo.listNews(legacyUserId).filter((item) => item.original_title === "Tilta launches filter kit");
    const secondMatches = repo.listNews(secondUser.id).filter((item) => item.original_title === "Tilta launches filter kit");
    expect(legacyMatches).toHaveLength(2);
    expect(secondMatches).toHaveLength(1);
  });

  it("creates and reports news source health fields", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const source = repo.createNewsSource(legacyUserId, { name: "Test Feed", url: "https://example.com/feed.xml", group: "brand-news", brand: "DJI" });
    expect(source?.source_group).toBe("brand-news");
    expect(source?.brand).toBe("DJI");
    const updated = repo.updateNewsSource(legacyUserId, source.id, { last_fetched_at: "2026-05-11T00:00:00.000Z", last_item_count: 12, last_error: "HTTP 403" });
    expect(updated?.last_item_count).toBe(12);
    expect(updated?.last_error).toBe("HTTP 403");
  });

  it("does not overwrite masked secrets", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.updateSettings(legacyUserId, { llm_api_key: "********", feishu_app_secret: "********", llm_model: "m2" });
    expect(repo.rawState(legacyUserId).settings.llm_api_key).toBe("secret");
    expect(repo.rawState(legacyUserId).settings.feishu_app_secret).toBe("secret2");
    expect(repo.rawState(legacyUserId).settings.llm_model).toBe("m2");
  });

  it("creates and updates research", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const item = repo.createResearch(legacyUserId, { title: "Test Research", desc: "Idea" });
    repo.updateResearch(legacyUserId, item.id, { products: ["p1"], demands: ["d1"] });
    expect(repo.rawState(legacyUserId).research[0].products).toEqual(["p1"]);
    expect(repo.rawState(legacyUserId).research[0].demands).toEqual(["d1"]);
  });

  it("keeps user workspaces isolated", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const secondUser = repo.ensureLocalUser({ id: "user-c", name: "User C", auth_provider: "feishu" });
    repo.createProduct(legacyUserId, { name: "Legacy Product" });
    repo.createProduct(secondUser.id, { name: "Feishu Product" });

    expect(repo.rawState(legacyUserId).products.map((item) => item.name)).toEqual(["Legacy Product"]);
    expect(repo.rawState(secondUser.id).products.map((item) => item.name)).toEqual(["Feishu Product"]);
  });
});
