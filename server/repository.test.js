import { describe, expect, it, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const repo = await import("./repository.js");
const { fieldOptionsText } = await import("./field-config.js");
const { matchFieldKey, matchFieldOption, matchFieldOptionInText, normalizeTagValues } = await import("./field-matcher.js");

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
    settings: {
      llm_api_url: "https://llm.test/v1",
      llm_model: "gpt-test",
      llm_api_key: "secret",
      feishu_app_secret: "secret2",
    },
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

  it("keeps the first collected product cover when later auto updates include another image", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const product = repo.createProduct(legacyUserId, {
      name: "Camera Grip",
      image: "https://img.test/first.jpg",
      thumbnail_url: "https://img.test/first-thumb.jpg",
    });

    const updated = repo.updateProduct(legacyUserId, product.id, {
      image: "https://img.test/later.jpg",
      thumbnail_url: "https://img.test/later-thumb.jpg",
    });

    expect(updated?.image).toBe("https://img.test/first.jpg");
    expect(updated?.thumbnail_url).toBe("https://img.test/first-thumb.jpg");
  });

  it("allows manual product cover override and keeps it against later auto updates", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const product = repo.createProduct(legacyUserId, {
      name: "Camera Grip",
      image: "https://img.test/first.jpg",
      thumbnail_url: "https://img.test/first-thumb.jpg",
    });

    const manual = repo.updateProduct(legacyUserId, product.id, {
      image: "data:image/png;base64,manual-cover",
      image_override: "manual",
    });

    const updated = repo.updateProduct(legacyUserId, product.id, {
      image: "https://img.test/later.jpg",
      thumbnail_url: "https://img.test/later-thumb.jpg",
    });

    expect(manual?.image).toBe("data:image/png;base64,manual-cover");
    expect(manual?.thumbnail_url).toBe("data:image/png;base64,manual-cover");
    expect(updated?.image).toBe("data:image/png;base64,manual-cover");
    expect(updated?.thumbnail_url).toBe("data:image/png;base64,manual-cover");
  });

  it("masks settings in bootstrap", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    expect(repo.bootstrap(legacyUserId).settings.llm_api_key).toBe("********");
    expect(repo.bootstrap(legacyUserId).settings.feishu_app_secret).toBe("********");
    expect(repo.bootstrap(legacyUserId).settings.llm_configured).toBe(true);
  });

  it("updates news flags", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.updateNews(legacyUserId, "n1", { starred: true });
    expect(repo.listNews(legacyUserId).find((item) => item.id === "n1")?.starred).toBe(true);
  });

  it("merges classification metadata when updating news flags or llm fields", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [{
      source_id: "rss-google",
      source: "Google Feed",
      original_url: "https://a.test/grouped",
      titleZh: "A",
      type: "行业趋势",
      classification: {
        merge_key: "same-story",
        source_group: "official-default",
        source_homepage: "https://example.com",
      },
      date: "2026-05-10",
    }]);

    const item = repo.listNews(legacyUserId).find((entry) => entry.original_url === "https://a.test/grouped");
    repo.updateNews(legacyUserId, item.id, {
      llm_processed: 1,
      classification: { reason: "manual_llm" },
    });

    const updated = repo.listNews(legacyUserId).find((entry) => entry.original_url === "https://a.test/grouped");
    expect(updated?.classification).toMatchObject({
      merge_key: "same-story",
      source_group: "official-default",
      source_homepage: "https://example.com",
      reason: "manual_llm",
    });
  });

  it("upserts news by source and url", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [{ source_id: "s1", source: "S", original_url: "https://a.test/1", titleZh: "A", date: "2026-05-10" }]);
    repo.upsertNews(legacyUserId, [{ source_id: "s1", source: "S", original_url: "https://a.test/1", titleZh: "B", date: "2026-05-10" }]);
    expect(repo.listNews(legacyUserId)).toHaveLength(2);
    expect(repo.listNews(legacyUserId).find((item) => item.original_url === "https://a.test/1")?.titleZh).toBe("B");
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

  it("finds reusable thumbnails across users by merge key and prefers same-user matches", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const secondUser = repo.ensureLocalUser({ id: "user-b", name: "User B", auth_provider: "feishu" });

    repo.upsertNews(secondUser.id, [{
      source_id: "google",
      source: "Google Feed",
      original_url: "https://news.google.com/rss/articles/shared-story",
      titleZh: "索尼发布A7R VI",
      thumbnail_url: "https://cdn.test/other-user.jpg",
      type: "新品发布",
      classification: { merge_key: "sony-a7r-vi" },
      date: "2026-05-10",
    }]);

    repo.upsertNews(legacyUserId, [{
      source_id: "google",
      source: "Google Feed",
      original_url: "https://news.google.com/rss/articles/local-story",
      titleZh: "索尼发布A7R VI",
      thumbnail_url: "https://cdn.test/same-user.jpg",
      type: "新品发布",
      classification: { merge_key: "sony-a7r-vi" },
      date: "2026-05-11",
    }]);

    expect(repo.findReusableNewsThumbnail({
      originalUrl: "https://news.google.com/rss/articles/missing-story",
      mergeKey: "sony-a7r-vi",
      titleZh: "索尼发布A7R VI",
      userId: legacyUserId,
    })).toBe("https://cdn.test/same-user.jpg");
  });

  it("finds reusable thumbnails across users by original url when no same-user image exists", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const secondUser = repo.ensureLocalUser({ id: "user-b", name: "User B", auth_provider: "feishu" });

    repo.upsertNews(secondUser.id, [{
      source_id: "google",
      source: "Google Feed",
      original_url: "https://news.google.com/rss/articles/shared-story",
      titleZh: "Canon firmware update",
      thumbnail_url: "https://cdn.test/shared.jpg",
      type: "行业趋势",
      classification: { merge_key: "canon-firmware-update" },
      date: "2026-05-10",
    }]);

    expect(repo.findReusableNewsThumbnail({
      originalUrl: "https://news.google.com/rss/articles/shared-story",
      mergeKey: "canon-firmware-update",
      titleZh: "Canon firmware update",
      userId: legacyUserId,
    })).toBe("https://cdn.test/shared.jpg");
  });

  it("refreshes published_at and metadata for existing news when source sends newer data", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [{
      source_id: "wechat-source",
      source: "索尼 影像圈",
      original_url: "https://mp.weixin.qq.com/s/existing",
      original_title: "旧标题",
      titleZh: "旧标题",
      summary: "旧摘要",
      type: "行业趋势",
      classification: { fakeid: "old", seen: "first" },
      date: "2026-05-06T13:30:00.000Z",
    }]);

    const result = repo.upsertNews(legacyUserId, [{
      source_id: "wechat-source",
      source: "索尼 影像圈",
      source_authority: "watchlist",
      original_url: "https://mp.weixin.qq.com/s/existing",
      original_title: "新标题",
      titleZh: "新标题",
      summary: "新摘要",
      contentZh: "新正文",
      original_content: "新原文摘要",
      type: "新品发布",
      thumbnail_url: "https://cdn.test/wechat.jpg",
      classification: { fakeid: "new", article_aid: "aid-1" },
      published_at: "2026-05-13T15:35:36.000Z",
      llmProcessed: true,
    }]);

    const updated = repo.listNews(legacyUserId).find((item) => item.original_url === "https://mp.weixin.qq.com/s/existing");
    expect(result.updated).toHaveLength(1);
    expect(updated?.published_at).toBe("2026-05-13T15:35:36.000Z");
    expect(updated?.titleZh).toBe("新标题");
    expect(updated?.summary).toBe("新摘要");
    expect(updated?.contentZh).toBe("新正文");
    expect(updated?.thumbnail_url).toBe("https://cdn.test/wechat.jpg");
    expect(updated?.type).toBe("新品发布");
    expect(updated?.classification).toMatchObject({ fakeid: "new", article_aid: "aid-1", seen: "first" });
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

  it("dedupes by original url or same-source title per user", () => {
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
    expect(legacyMatches).toHaveLength(1);
    expect(secondMatches).toHaveLength(1);
    expect(legacyMatches[0].classification.duplicate_urls).toContain("https://news.google.com/rss/b");
  });

  it("near-dedupes news by brand and host even when urls differ", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [
      {
        source_id: "google",
        source: "Google News",
        original_url: "https://news.google.com/rss/articles/insta-go-3s-a",
        titleZh: "Insta360 GO 3S 复古套装发布",
        original_title: "Insta360 GO 3S retro bundle launches",
        type: "新品发布",
        date: "2026-05-10",
      },
      {
        source_id: "google",
        source: "Google News",
        original_url: "https://news.google.com/rss/articles/insta-go-3s-b",
        titleZh: "影石 GO 3S 复古版推出",
        original_title: "Insta360 GO 3S vintage kit announced",
        thumbnail_url: "https://cdn.test/go-3s.jpg",
        type: "新品发布",
        date: "2026-05-11",
      },
    ]);

    const matches = repo.listNews(legacyUserId).filter((item) => item.titleZh.includes("GO 3S"));
    expect(matches).toHaveLength(1);
    expect(matches[0].original_url).toBe("https://news.google.com/rss/articles/insta-go-3s-a");
    expect(matches[0].thumbnail_url).toBe("https://cdn.test/go-3s.jpg");
    expect(matches[0].classification).toMatchObject({
      brand: "Insta360",
      host: "Insta360 GO 3S",
      host_key: "insta360go3s",
    });
    expect(matches[0].classification.duplicate_urls).toContain("https://news.google.com/rss/articles/insta-go-3s-b");
  });

  it("does not cross-source merge generic host stories", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [
      {
        source_id: "source-a",
        source: "Source A",
        original_url: "https://example.com/mobile-7-review",
        titleZh: "DJI Osmo Mobile 7P 评测",
        original_title: "DJI Osmo Mobile 7P review",
        type: "行业趋势",
        date: "2026-05-10",
      },
      {
        source_id: "source-b",
        source: "Source B",
        original_url: "https://example.com/mobile-7-launch",
        titleZh: "DJI Osmo Mobile 7P 发布",
        original_title: "DJI Osmo Mobile 7P launches",
        type: "新品发布",
        date: "2026-05-11",
      },
    ]);

    expect(repo.listNews(legacyUserId).filter((item) => item.titleZh.includes("Osmo Mobile 7P"))).toHaveLength(2);
  });

  it("near-dedupes same-source normalized story wording without brand or host", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [
      {
        source_id: "dcw",
        source: "Digital Camera World",
        original_url: "https://example.com/canon-c2pa-image",
        titleZh: "佳能推C2PA图像验证",
        original_title: "Canon launches C2PA image verification",
        type: "行业趋势",
        date: "2026-05-10",
      },
      {
        source_id: "dcw",
        source: "Digital Camera World",
        original_url: "https://example.com/canon-c2pa-photo",
        titleZh: "佳能推C2PA影像验证",
        original_title: "Canon launches C2PA photo verification",
        thumbnail_url: "https://cdn.test/c2pa.jpg",
        type: "行业趋势",
        date: "2026-05-11",
      },
      {
        source_id: "other",
        source: "Other Source",
        original_url: "https://example.com/other-c2pa-photo",
        titleZh: "佳能推C2PA影像验证",
        original_title: "Canon launches C2PA photo verification",
        type: "行业趋势",
        date: "2026-05-11",
      },
    ]);

    const c2paMatches = repo.listNews(legacyUserId).filter((item) => item.classification?.story_key === "canon-c2pa-image-verify");
    const otherMatches = repo.listNews(legacyUserId).filter((item) => item.source === "Other Source");
    expect(c2paMatches).toHaveLength(1);
    expect(otherMatches).toHaveLength(0);
    expect(c2paMatches[0].source).toBe("Digital Camera World");
    expect(c2paMatches[0].thumbnail_url).toBe("https://cdn.test/c2pa.jpg");
    expect(c2paMatches[0].classification.duplicate_urls).toContain("https://example.com/other-c2pa-photo");
  });

  it("near-dedupes canonical launch stories across sources", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [
      {
        source_id: "gadgetguy",
        source: "GadgetGuy",
        original_url: "https://example.com/sony-alpha-a",
        titleZh: "索尼发布Alpha 7R VI",
        original_title: "Sony Alpha 7R VI launches",
        type: "新品发布",
        date: "2026-05-10",
      },
      {
        source_id: "google",
        source: "Google News",
        original_url: "https://example.com/sony-a7r-b",
        titleZh: "索尼A7R VI新机曝光",
        original_title: "New high-res Sony Alpha 7R VI uses autofocus tech",
        thumbnail_url: "https://cdn.test/sony-a7r.jpg",
        type: "新品发布",
        date: "2026-05-11",
      },
      {
        source_id: "review",
        source: "Review Source",
        original_url: "https://example.com/sony-a7r-review",
        titleZh: "索尼a7R高速版评测",
        original_title: "Sony A7R VI review",
        type: "行业趋势",
        date: "2026-05-11",
      },
    ]);

    const launchMatches = repo.listNews(legacyUserId).filter((item) => item.classification?.story_key === "sony-a7r-vi-launch");
    const reviewMatches = repo.listNews(legacyUserId).filter((item) => item.classification?.story_key === "sony-a7r-vi-review");
    expect(launchMatches).toHaveLength(1);
    expect(reviewMatches).toHaveLength(1);
    expect(launchMatches[0].thumbnail_url).toBe("https://cdn.test/sony-a7r.jpg");
    expect(launchMatches[0].classification.duplicate_urls).toContain("https://example.com/sony-a7r-b");
  });

  it("prefers WeChat as the primary row when near-deduping cross-source stories", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [
      {
        source_id: "google",
        source: "主机新品 - Google News",
        original_url: "https://news.google.com/rss/articles/sony-a7r-vi",
        titleZh: "索尼发布Alpha 7R VI",
        original_title: "Sony Alpha 7R VI launches",
        summary: "Google summary",
        type: "新品发布",
        date: "2026-05-10",
      },
      {
        source_id: "wechat-sony",
        source: "索尼中国",
        original_url: "https://mp.weixin.qq.com/s/sony-a7r-vi",
        titleZh: "新品发布丨Alpha 7R VI索尼新一代全画幅微单发布",
        original_title: "新品发布丨Alpha 7R VI索尼新一代全画幅微单发布",
        summary: "WeChat summary",
        thumbnail_url: "https://cdn.test/wechat.jpg",
        type: "新品发布",
        classification: {
          source_type: "wechat_exporter",
          source_group: "wechat-exporter",
        },
        date: "2026-05-10",
      },
    ]);

    const matches = repo.listNews(legacyUserId).filter((item) => item.classification?.story_key === "sony-a7r-vi-launch");
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe("索尼中国");
    expect(matches[0].original_url).toBe("https://mp.weixin.qq.com/s/sony-a7r-vi");
    expect(matches[0].summary).toBe("WeChat summary");
    expect(matches[0].thumbnail_url).toBe("https://cdn.test/wechat.jpg");
    expect(matches[0].classification.duplicate_urls).toContain("https://news.google.com/rss/articles/sony-a7r-vi");
  });

  it("keeps WeChat as the primary row when a non-WeChat duplicate arrives later", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [
      {
        source_id: "wechat-sony",
        source: "索尼中国",
        original_url: "https://mp.weixin.qq.com/s/sony-a7r-vi-later",
        titleZh: "新品发布丨Alpha 7R VI索尼新一代全画幅微单发布",
        original_title: "新品发布丨Alpha 7R VI索尼新一代全画幅微单发布",
        summary: "WeChat first summary",
        type: "新品发布",
        classification: {
          source_type: "wechat_exporter",
          source_group: "wechat-exporter",
        },
        date: "2026-05-10",
      },
      {
        source_id: "google",
        source: "主机新品 - Google News",
        original_url: "https://news.google.com/rss/articles/sony-a7r-vi-later",
        titleZh: "索尼发布Alpha 7R VI",
        original_title: "Sony Alpha 7R VI launches",
        summary: "Google later summary",
        thumbnail_url: "https://cdn.test/google.jpg",
        type: "新品发布",
        date: "2026-05-11",
      },
    ]);

    const matches = repo.listNews(legacyUserId).filter((item) => item.classification?.story_key === "sony-a7r-vi-launch");
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe("索尼中国");
    expect(matches[0].original_url).toBe("https://mp.weixin.qq.com/s/sony-a7r-vi-later");
    expect(matches[0].summary).toBe("WeChat first summary");
    expect(matches[0].thumbnail_url).toBe("https://cdn.test/google.jpg");
    expect(matches[0].classification.duplicate_urls).toContain("https://news.google.com/rss/articles/sony-a7r-vi-later");
  });

  it("does not classify publisher names containing review as Sony A7R VI review events", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [
      {
        source_id: "photo-review",
        source: "Google News",
        original_url: "https://example.com/photo-review-launch",
        titleZh: "Sony unveils 66.8-megapixel Alpha 7R VI camera - Photo Review",
        original_title: "Sony unveils 66.8-megapixel Alpha 7R VI camera - Photo Review",
        type: "新品发布",
        date: "2026-05-10",
      },
      {
        source_id: "review",
        source: "Google News",
        original_url: "https://example.com/petapixel-review",
        titleZh: "Sony a7R VI Review: The High-Resolution Camera to Rule Them All - PetaPixel",
        original_title: "Sony a7R VI Review: The High-Resolution Camera to Rule Them All - PetaPixel",
        type: "行业趋势",
        date: "2026-05-10",
      },
    ]);

    const all = repo.listNews(legacyUserId);
    expect(all.find((item) => item.original_url === "https://example.com/photo-review-launch")?.classification?.story_key).toBe("sony-a7r-vi-launch");
    expect(all.find((item) => item.original_url === "https://example.com/petapixel-review")?.classification?.story_key).toBe("sony-a7r-vi-review");
  });

  it("does not fold Sony A7R VII or non-launch A7R VI stories into the A7R VI launch key", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [
      {
        source_id: "launch",
        source: "Launch Source",
        original_url: "https://example.com/sony-a7r-vi-launch",
        titleZh: "索尼发布Alpha 7R VI",
        original_title: "Sony Alpha 7R VI launches",
        type: "新品发布",
        date: "2026-05-10",
      },
      {
        source_id: "leak",
        source: "Leak Source",
        original_url: "https://example.com/sony-a7r-vi-leak",
        titleZh: "索尼A7R VI新图泄露",
        original_title: "New leaked Sony A7R VI images",
        type: "行业趋势",
        date: "2026-05-11",
      },
      {
        source_id: "vii",
        source: "Rumor Source",
        original_url: "https://example.com/sony-a7r-vii-rumor",
        titleZh: "索尼A7R VII传闻",
        original_title: "Sony A7R VII rumors",
        type: "行业趋势",
        date: "2026-05-11",
      },
    ]);

    const all = repo.listNews(legacyUserId);
    expect(all.filter((item) => item.classification?.story_key === "sony-a7r-vi-launch")).toHaveLength(1);
    expect(all.filter((item) => item.classification?.story_key === "sony-a7r-vi-leak")).toHaveLength(1);
    expect(all.some((item) => item.original_url === "https://example.com/sony-a7r-vii-rumor")).toBe(true);
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

  it("imports wechat exporter accounts as news sources", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const result = repo.importWechatExporterAccounts(legacyUserId, {
      usefor: "wechat-article-exporter",
      accounts: [
        { fakeid: "MzA3", nickname: "SmallRig斯莫格" },
        { fakeid: "MzA4", nickname: "DJI大疆创新" },
      ],
    }, { interval: 1440 });

    expect(result.created).toHaveLength(2);
    const sources = repo.listNewsSources(legacyUserId).filter((source) => source.type === "wechat_exporter");
    expect(sources).toHaveLength(2);
    expect(sources[0].url).toContain("fakeid=");
    expect(sources[0].fetch_interval).toBe(1440);
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
    expect(state.officialRssSources.length).toBeGreaterThan(0);
    expect(state.officialRssSources.some((source) => source.source_group === "sample-live" || source.source_group === "official-default")).toBe(true);
  });

  it("initializes regular users with empty custom sources and shared official sources", () => {
    const user = repo.ensureLocalUser({ id: "regular-user", name: "Regular User", auth_provider: "feishu" });
    const state = repo.bootstrap(user.id);

    expect(state.onboarding.sampleWorkspace).toBeFalsy();
    expect(state.rssSources).toEqual([]);
    expect(state.officialRssSources.length).toBeGreaterThan(0);
    expect(state.officialRssSources.some((source) => source.source_group === "sample-live" || source.source_group === "official-default")).toBe(true);
  });

  it("hides untranslated news from bootstrap", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [{
      source_id: "wechat-source",
      source: "索尼中国",
      original_url: "https://mp.weixin.qq.com/s/demo",
      original_title: "Sony announces event",
      titleZh: "Sony announces event",
      summary: "",
      contentZh: "",
      type: "行业趋势",
      needsTranslation: true,
      llmProcessed: false,
      date: "2026-05-14",
    }]);

    const state = repo.bootstrap(legacyUserId);
    expect(state.news.find((item) => item.original_url === "https://mp.weixin.qq.com/s/demo")).toBeFalsy();
  });

  it("syncs shared official news from visitor to regular users", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const user = repo.ensureLocalUser({ id: "shared-news-user", name: "Shared User", auth_provider: "feishu" });
    repo.upsertNews(legacyUserId, [{
      source_id: "default-news-google-camera-launches",
      source: "主机新品 - Google News",
      original_url: "https://shared.test/official-news",
      original_title: "Official shared news",
      titleZh: "官方共享资讯",
      summary: "后端统一采集的一条新闻。",
      contentZh: "后端统一采集的一条新闻。",
      type: "新品发布",
      published_at: "2026-05-14T10:00:00.000Z",
      llmProcessed: true,
      classification: { source_group: "official-default" },
    }]);

    const synced = repo.syncOfficialNewsToUser(user.id);
    const state = repo.bootstrap(user.id);
    expect(synced.inserted.length + synced.updated.length).toBeGreaterThan(0);
    expect(state.news.map((item) => item.original_url)).toContain("https://shared.test/official-news");
  });

  it("reports official stream cache status for regular users", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const user = repo.ensureLocalUser({ id: "cache-user", name: "Cache User", auth_provider: "feishu" });
    repo.upsertNews(legacyUserId, [{
      source_id: "default-news-google-camera-launches",
      source: "主机新品 - Google News",
      original_url: "https://shared.test/cached-official-news",
      original_title: "Official cached news",
      titleZh: "官方缓存资讯",
      summary: "后端缓存给用户的官方资讯。",
      contentZh: "后端缓存给用户的官方资讯。",
      type: "新品发布",
      published_at: "2026-05-14T12:00:00.000Z",
      llmProcessed: true,
      classification: { source_group: "official-default" },
    }]);

    const ensured = repo.ensureOfficialNewsCache(user.id);
    expect(ensured.inserted.length + ensured.updated.length).toBeGreaterThan(0);
    expect(ensured.status.visible).toBeGreaterThan(0);
    expect(ensured.status.latestPublishedAt).toBe("2026-05-14T12:00:00.000Z");
  });

  it("does not sync stale official news to regular users", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const user = repo.ensureLocalUser({ id: "stale-shared-news-user", name: "Stale User", auth_provider: "feishu" });
    repo.upsertNews(legacyUserId, [{
      source_id: "default-news-google-camera-launches",
      source: "主机新品 - Google News",
      original_url: "https://shared.test/stale-official-news",
      original_title: "Old official shared news",
      titleZh: "旧官方共享资讯",
      summary: "超过缓存窗口的旧新闻。",
      contentZh: "超过缓存窗口的旧新闻。",
      type: "新品发布",
      published_at: "2025-01-01T00:00:00.000Z",
      llmProcessed: true,
      classification: { source_group: "official-default" },
    }]);

    const synced = repo.syncOfficialNewsToUser(user.id);
    const state = repo.bootstrap(user.id);
    expect(synced.inserted).toHaveLength(0);
    expect(state.news.map((item) => item.original_url)).not.toContain("https://shared.test/stale-official-news");
  });

  it("hides official news when the user disables official stream", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const user = repo.ensureLocalUser({ id: "official-off-user", name: "Official Off", auth_provider: "feishu" });
    repo.upsertNews(legacyUserId, [{
      source_id: "default-news-google-camera-launches",
      source: "主机新品 - Google News",
      original_url: "https://shared.test/hidden-official",
      original_title: "Official hidden news",
      titleZh: "官方隐藏资讯",
      summary: "关闭开关后不应显示。",
      contentZh: "关闭开关后不应显示。",
      type: "新品发布",
      published_at: "2026-05-14T11:00:00.000Z",
      llmProcessed: true,
      classification: { source_group: "official-default" },
    }]);
    repo.syncOfficialNewsToUser(user.id);
    repo.updateSettings(user.id, { official_news_enabled: false });

    const state = repo.bootstrap(user.id);
    expect(state.news.map((item) => item.original_url)).not.toContain("https://shared.test/hidden-official");
  });

  it("resets regular users back into sample workspace", () => {
    const visitor = repo.ensureLegacyWorkspace();
    repo.upsertNews(visitor.id, [{
      source_id: "sample-news-google-accessory-launches",
      source: "配件竞品新品 - Google News",
      original_url: "https://sample.test/reset-seed",
      original_title: "Reset sample news",
      titleZh: "重置演示新闻",
      summary: "用于验证重置后能看到演示新闻。",
      contentZh: "用于验证重置后能看到演示新闻。",
      type: "新品发布",
      published_at: new Date().toISOString(),
      llmProcessed: true,
    }]);
    const user = repo.ensureLocalUser({ id: "sample-reset-user", name: "Reset User", auth_provider: "feishu" });
    repo.finishSampleWorkspace(user.id);
    const result = repo.resetRegularUsersToSampleWorkspace();
    const state = repo.bootstrap(user.id);

    expect(result.reset).toContain(user.id);
    expect(state.onboarding.sampleWorkspace).toBe(true);
    expect(state.products.some((item) => item.sample)).toBe(true);
    expect(state.news.map((item) => item.original_url)).toContain("https://sample.test/reset-seed");
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
    expect(state.rssSources).toEqual([]);
    expect(state.officialRssSources.length).toBeGreaterThan(0);
  });

  it("updates product relation fields", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const product = repo.createProduct(legacyUserId, { name: "Source Product" });
    const updated = repo.updateProduct(legacyUserId, product.id, { related_product_id: "p-2", related_product_name: "Target Product" });
    expect(updated.related_product_id).toBe("p-2");
    expect(updated.related_product_name).toBe("Target Product");
  });

  it("exposes field schema and keeps legacy tag groups for compatibility", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const state = repo.bootstrap(legacyUserId);

    expect(state.settings.fields.find((field) => field.key === "host")?.name).toBe("主机");
    expect(state.settings.tag_groups.find((group) => group.key === "camera_brands")?.name).toBe("主机");
    expect(state.settings.tag_groups.find((group) => group.key === "camera_brands")?.field_key).toBe("host");
    expect(state.settings.fields.find((field) => field.key === "host")?.options).toEqual(expect.arrayContaining([
      "Osmo Pocket 3",
      "Osmo Action 5 Pro",
      "DJI Mini 4 Pro",
      "Insta360 Ace Pro 2",
      "Insta360 X5",
      "Insta360 GO 3S",
    ]));
  });

  it("does not merge brand and host options into a pseudo brands field", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const state = repo.bootstrap(legacyUserId);

    expect(JSON.parse(fieldOptionsText(state.settings.fields, "brand"))).toEqual(expect.arrayContaining(["Ulanzi"]));
    expect(JSON.parse(fieldOptionsText(state.settings.fields, "host"))).toEqual(expect.arrayContaining(["Osmo Pocket 3"]));
    expect(JSON.parse(fieldOptionsText(state.settings.fields, "category"))).toEqual(expect.arrayContaining(["灯光"]));
    expect(JSON.parse(fieldOptionsText(state.settings.fields, "brands"))).toEqual([]);
  });

  it("merges latest official host defaults into existing settings fields", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    repo.updateSettings(legacyUserId, {
      fields: [
        {
          key: "host",
          legacyKey: "camera_brands",
          name: "主机",
          tone: "outline",
          multi: false,
          official: true,
          entities: ["competitor"],
          options: ["DJI Osmo Pocket 3", "Insta360 GO 3"],
        },
      ],
    });

    const state = repo.bootstrap(legacyUserId);
    const hostOptions = state.settings.fields.find((field) => field.key === "host")?.options || [];
    expect(hostOptions).toEqual(expect.arrayContaining([
      "Osmo Pocket 3",
      "Osmo Action 5 Pro",
      "DJI Mini 4 Pro",
      "Insta360 Ace Pro 2",
      "Insta360 X5",
      "Insta360 GO 3S",
      "DJI Osmo Pocket 3",
      "Insta360 GO 3",
    ]));
  });

  it("fuzzy matches field keys and tag options", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const fields = repo.bootstrap(legacyUserId).settings.fields;

    expect(matchFieldKey("适配设备型号", fields)?.field.key).toBe("host");
    expect(matchFieldOption("pocket3", fields.find((field) => field.key === "host"))?.value).toBe("Osmo Pocket 3");
    expect(matchFieldOptionInText("Insta360 GO 3S 复古套装发布", fields.find((field) => field.key === "host"))?.value).toBe("Insta360 GO 3S");
    expect(matchFieldOption("vlog 自拍", fields.find((field) => field.key === "scenarios"))?.value).toBe("Vlog/自拍");
    expect(normalizeTagValues({ 主机: ["DJI Pocket 3"], 场景: ["vlog 自拍"] }, fields)).toEqual({
      host: ["Osmo Pocket 3"],
      scenarios: ["Vlog/自拍"],
    });
  });

  it("normalizes fuzzy product tag values before saving", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const product = repo.createProduct(legacyUserId, {
      name: "Pocket handle",
      tag_values: {
        主机: ["pocket3"],
        品类: ["三脚架"],
        custom_tags: ["小巧"],
      },
    });

    expect(product.tag_values.host).toEqual(["Osmo Pocket 3"]);
    expect(product.host).toBe("Osmo Pocket 3");
    expect(product.tag_values.category).toEqual(["三脚架"]);
    expect(product.category).toBe("三脚架");
    expect(product.tags).toEqual(["小巧"]);
  });

  it("normalizes fuzzy demand tag values before saving", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const demand = repo.createDemand(legacyUserId, {
      title: "旅行自拍支架",
      scenarios: ["vlog 自拍"],
      painpoints: ["太贵"],
    });

    expect(demand.tag_values.scenarios).toEqual(["Vlog/自拍"]);
    expect(demand.scenarios).toEqual(["Vlog/自拍"]);
    expect(demand.tag_values.painpoints).toEqual(["价格过高/性价比低"]);
    expect(demand.painpoints).toEqual(["价格过高/性价比低"]);
  });

  it("dual-writes product tag_values and legacy fields", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const product = repo.createProduct(legacyUserId, {
      name: "Schema Product",
      tag_values: {
        brand: ["DJI"],
        host: ["DJI Osmo Pocket 3"],
        category: ["稳定器"],
        custom_tags: ["便携"],
      },
    });

    expect(product.brand).toBe("DJI");
    expect(product.host).toBe("Osmo Pocket 3");
    expect(product.category).toBe("稳定器");
    expect(product.tags).toEqual(["便携"]);

    const updated = repo.updateProduct(legacyUserId, product.id, { brand: "Ulanzi / SmallRig" });
    expect(updated.tag_values.brand).toEqual(["Ulanzi", "SmallRig"]);
  });

  it("normalizes field aliases without mixing brand host and category", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const product = repo.createProduct(legacyUserId, {
      name: "Alias Product",
      tag_values: {
        品牌名: ["Ulanzi"],
        适配主机: ["DJI Pocket 3"],
        产品品类: ["三脚架"],
      },
    });

    expect(product.brand).toBe("Ulanzi");
    expect(product.host).toBe("Osmo Pocket 3");
    expect(product.category).toBe("三脚架");
    expect(product.tag_values).toMatchObject({
      brand: ["Ulanzi"],
      host: ["Osmo Pocket 3"],
      category: ["三脚架"],
    });
  });

  it("creates custom fields and can attach them to entities", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const field = repo.createField(legacyUserId, {
      name: "目标人群",
      entities: ["competitor"],
      options: ["创作者"],
    });

    expect(field.official).toBe(false);
    expect(repo.listFields(legacyUserId, "competitor").map((item) => item.key)).toContain(field.key);

    const updated = repo.updateField(legacyUserId, field.key, { entities: ["competitor", "inspiration"], options: ["创作者", "摄影爱好者"] });
    expect(updated.entities).toEqual(["competitor", "inspiration"]);
    expect(repo.listFields(legacyUserId, "inspiration").map((item) => item.key)).toContain(field.key);
  });

  it("cleans custom tag_values when settings removes a custom field", () => {
    const legacyUserId = dbModule.getLegacyUserId();
    const field = repo.createField(legacyUserId, { name: "目标人群", entities: ["competitor"], options: ["创作者"] });
    const product = repo.createProduct(legacyUserId, {
      name: "Audience Product",
      tag_values: { [field.key]: ["创作者"] },
    });

    const fields = repo.listFields(legacyUserId).filter((item) => item.key !== field.key);
    repo.updateSettings(legacyUserId, { fields });

    const saved = repo.rawState(legacyUserId).products.find((item) => item.id === product.id);
    expect(saved.tag_values[field.key]).toBeUndefined();
  });
});
