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
    const product = repo.createProduct(legacyUserId, { name: "Test Product", related_product_id: "p-1", related_product_name: "Linked Product" });
    expect(product.name).toBe("Test Product");
    expect(product.related_product_id).toBe("p-1");
    expect(product.related_product_name).toBe("Linked Product");
    expect(repo.rawState(legacyUserId).products.filter((item) => !item.sample)).toHaveLength(1);
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

  it("updates missing thumbnail on existing news during upsert", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [{ source_id: "s1", source: "S", original_url: "https://a.test/with-image", titleZh: "A", type: "行业趋势", date: "2026-05-10" }]);
    const result = repo.upsertNews(legacyUserId, [{
      source_id: "s1",
      source: "S",
      original_url: "https://a.test/with-image",
      titleZh: "A",
      type: "行业趋势",
      thumbnail_url: "https://cdn.test/a.jpg",
      classification: { image_enriched: true },
      date: "2026-05-10",
    }]);

    expect(result.updated).toHaveLength(1);
    expect(repo.listNews(legacyUserId).find((item) => item.original_url === "https://a.test/with-image")?.thumbnail_url).toBe("https://cdn.test/a.jpg");
  });

  it("includes translated-but-unprocessed news in the LLM queue", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [{
      source_id: "rss-official",
      source: "Official Feed",
      source_authority: "official",
      original_url: "https://a.test/needs-zh",
      original_title: "Brand launches a new camera light",
      titleZh: "Brand launches a new camera light",
      type: "新品发布",
      needsTranslation: true,
      llmProcessed: true,
      date: "2026-05-10",
    }]);

    const pending = repo.listPendingNewsForLlm(legacyUserId, 10);
    expect(pending.map((item) => item.original_url)).toContain("https://a.test/needs-zh");
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

  it("dedupes news sources by url per user", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const first = repo.createNewsSource(legacyUserId, { name: "Feed A", url: "https://example.com/feed.xml", group: "brand-news" });
    const second = repo.createNewsSource(legacyUserId, { name: "Feed A Updated", url: "https://example.com/feed.xml", group: "brand-news", fetch_interval: 120 });
    const sources = repo.listNewsSources(legacyUserId).filter((source) => source.url === "https://example.com/feed.xml");

    expect(second.id).toBe(first.id);
    expect(sources).toHaveLength(1);
    expect(sources[0].name).toBe("Feed A Updated");
    expect(sources[0].fetch_interval).toBe(120);
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

    expect(repo.rawState(legacyUserId).products.filter((item) => !item.sample).map((item) => item.name)).toEqual(["Legacy Product"]);
    expect(repo.rawState(secondUser.id).products.map((item) => item.name)).toEqual(["Feishu Product"]);
  });

  it("initializes visitor with a sample workspace and live news sources", () => {
    const visitor = repo.ensureLegacyWorkspace();
    const state = repo.bootstrap(visitor.id);

    expect(state.onboarding.sampleWorkspace).toBe(true);
    expect(state.products.some((item) => item.sample)).toBe(true);
    expect(state.demands.some((item) => item.sample)).toBe(true);
    expect(state.research.some((item) => item.sample)).toBe(true);
    expect(state.rssSources.length).toBeGreaterThan(0);
    expect(state.rssSources.some((source) => source.source_group === "sample-live")).toBe(true);
  });

  it("filters stale news in sample workspaces", () => {
    const visitor = repo.ensureLegacyWorkspace();
    repo.upsertNews(visitor.id, [
      {
        source_id: "sample-news-google-accessory-launches",
        source: "配件竞品新品 - Google News",
        original_url: "https://sample.test/recent",
        original_title: "Recent camera accessory launch",
        titleZh: "Recent camera accessory launch",
        type: "新品发布",
        published_at: new Date().toISOString(),
      },
      {
        source_id: "sample-news-google-accessory-launches",
        source: "配件竞品新品 - Google News",
        original_url: "https://sample.test/stale",
        original_title: "Old camera accessory launch",
        titleZh: "Old camera accessory launch",
        type: "新品发布",
        published_at: "2025-01-01T00:00:00.000Z",
      },
    ]);

    const state = repo.bootstrap(visitor.id);
    expect(state.news.map((item) => item.original_url)).toContain("https://sample.test/recent");
    expect(state.news.map((item) => item.original_url)).not.toContain("https://sample.test/stale");
    expect(state.onboarding.liveNewsReady).toBe(true);
  });

  it("keeps visitor permanently in sample workspace", () => {
    const visitor = repo.ensureLegacyWorkspace();
    repo.finishSampleWorkspace(visitor.id);
    const state = repo.bootstrap(visitor.id);

    expect(state.onboarding.sampleWorkspace).toBe(true);
    expect(state.onboarding.visitorOnly).toBe(true);
    expect(state.onboarding.canExitSample).toBe(false);
    expect(state.products.some((item) => item.sample)).toBe(true);
  });

  it("keeps old visitor seed data inside the sample workspace", () => {
    const visitor = repo.ensureLegacyWorkspace();
    repo.createProduct(visitor.id, { name: "Old Visitor Product" });

    const nextVisitor = repo.ensureLegacyWorkspace();
    const state = repo.bootstrap(nextVisitor.id);

    expect(state.onboarding.sampleWorkspace).toBe(true);
    expect(state.products.map((item) => item.name)).toContain("Old Visitor Product");
    expect(state.products.every((item) => item.sample)).toBe(true);
  });

  it("lets real first-login users exit the sample workspace", () => {
    const user = repo.ensureLocalUser({ id: "real-sample-user", name: "Real User", auth_provider: "feishu", withSampleWorkspace: true });
    repo.finishSampleWorkspace(user.id);
    const state = repo.bootstrap(user.id);

    expect(state.onboarding.sampleWorkspace).toBe(false);
    expect(state.products).toEqual([]);
    expect(state.demands).toEqual([]);
    expect(state.research).toEqual([]);
  });

  it("updates product relation fields", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const product = repo.createProduct(legacyUserId, { name: "Source Product" });
    const updated = repo.updateProduct(legacyUserId, product.id, { related_product_id: "p-2", related_product_name: "Target Product" });
    expect(updated.related_product_id).toBe("p-2");
    expect(updated.related_product_name).toBe("Target Product");
  });
});
