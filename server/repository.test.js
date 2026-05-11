import { describe, expect, it, beforeEach } from "vitest";

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
  dbModule.db.prepare("DELETE FROM news_items").run();
  dbModule.db.prepare("DELETE FROM news_sources").run();
  dbModule.db.prepare(`
    INSERT INTO news_items (
      id, user_id, source_id, source_name, original_title, original_url,
      title_zh, summary_zh, type, is_kept, is_read, is_starred, published_at,
      llm_processed, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "n1", "default", "s1", "Source 1", "Seed title", "https://seed.test/1",
    "Seed title", "", "行业趋势", 1, 0, 0, "2026-05-10T00:00:00.000Z",
    1, "2026-05-10T00:00:00.000Z", "2026-05-10T00:00:00.000Z"
  );
});

describe("repository", () => {
  it("creates products", () => {
    const product = repo.createProduct({ name: "Test Product" });
    expect(product.name).toBe("Test Product");
    expect(repo.rawState().products).toHaveLength(1);
  });

  it("masks settings in bootstrap", () => {
    expect(repo.bootstrap().settings.llm_api_key).toBe("********");
    expect(repo.bootstrap().settings.feishu_app_secret).toBe("********");
  });

  it("updates news flags", () => {
    repo.updateNews("n1", { starred: true });
    expect(repo.listNews().find((item) => item.id === "n1")?.starred).toBe(true);
  });

  it("upserts news by source and url", () => {
    repo.upsertNews([{ source_id: "s1", source: "S", original_url: "https://a.test/1", titleZh: "A", date: "2026-05-10" }]);
    repo.upsertNews([{ source_id: "s1", source: "S", original_url: "https://a.test/1", titleZh: "B", date: "2026-05-10" }]);
    expect(repo.listNews()).toHaveLength(2);
    expect(repo.listNews().find((item) => item.original_url === "https://a.test/1")?.titleZh).toBe("A");
  });

  it("dedupes only by original url", () => {
    repo.upsertNews([
      { source_id: "google", source: "配件竞品新品 - Google News", original_url: "https://news.google.com/rss/a", titleZh: "Tilta launches filter kit", original_title: "Tilta launches filter kit", date: "2026-05-10" },
      { source_id: "google", source: "配件竞品新品 - Google News", original_url: "https://news.google.com/rss/b", titleZh: "Tilta launches filter kit", original_title: "Tilta launches filter kit", date: "2026-05-10" },
    ]);
    const matches = repo.listNews().filter((item) => item.original_title === "Tilta launches filter kit");
    expect(matches).toHaveLength(2);
  });

  it("creates and reports news source health fields", () => {
    const source = repo.createNewsSource({ name: "Test Feed", url: "https://example.com/feed.xml", group: "brand-news", brand: "DJI" });
    expect(source?.source_group).toBe("brand-news");
    expect(source?.brand).toBe("DJI");
    const updated = repo.updateNewsSource(source.id, { last_fetched_at: "2026-05-11T00:00:00.000Z", last_item_count: 12, last_error: "HTTP 403" });
    expect(updated?.last_item_count).toBe(12);
    expect(updated?.last_error).toBe("HTTP 403");
  });

  it("does not overwrite masked secrets", () => {
    repo.updateSettings({ llm_api_key: "********", feishu_app_secret: "********", llm_model: "m2" });
    expect(repo.rawState().settings.llm_api_key).toBe("secret");
    expect(repo.rawState().settings.feishu_app_secret).toBe("secret2");
    expect(repo.rawState().settings.llm_model).toBe("m2");
  });

  it("creates and updates research", () => {
    const item = repo.createResearch({ title: "Test Research", desc: "Idea" });
    repo.updateResearch(item.id, { products: ["p1"], demands: ["d1"] });
    expect(repo.rawState().research[0].products).toEqual(["p1"]);
    expect(repo.rawState().research[0].demands).toEqual(["d1"]);
  });
});
