import { afterEach, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const repo = await import("./repository.js");
const { __rssTestUtils, collectSource, extractRssThumbnail, heuristicClassifyNews, processNewsWithLlm, shouldCollectSource, shouldEnrichSourceImages } = await import("./rss-service.js");

afterEach(() => {
  delete globalThis.fetch;
});

describe("rss-service classification", () => {
  it("keeps official product launches as product news", () => {
    const result = heuristicClassifyNews({
      source: { name: "NEEWER News", authority: "official" },
      item: {
        title: "NEEWER launches new camera cage for Sony Alpha",
        contentSnippet: "The new camera cage is available now with updated mounting points.",
      },
    });
    expect(result.type).toBe("新品发布");
    expect(result.classification.reason).toBe("heuristic_new_product");
  });

  it("drops broad photography stories", () => {
    const result = heuristicClassifyNews({
      source: { name: "PetaPixel", authority: "watchlist" },
      item: {
        title: "Center for Creative Photography Adds Archives of Nine Influential Photographers",
        contentSnippet: "The archive collection has been donated to a research center.",
      },
    });
    expect(result).toBe(null);
  });

  it("drops teaser and expected launch stories", () => {
    const result = heuristicClassifyNews({
      source: { name: "主机新品 - Google News", authority: "aggregator" },
      item: {
        title: "Canon Posts Enigmatic Teaser for a New Camera Set to Debut Next Week",
        contentSnippet: "The company is expected to reveal more details soon.",
      },
    });
    expect(result).toBe(null);
  });

  it("drops official non-gear collections", () => {
    const result = heuristicClassifyNews({
      source: { name: "Apple Newsroom", authority: "official" },
      item: {
        title: "Apple introduces a new Pride Collection",
        contentSnippet: "The collection includes a new watch band and wallpaper.",
      },
    });
    expect(result).toBe(null);
  });

  it("keeps trend reports as trend", () => {
    const result = heuristicClassifyNews({
      source: { name: "PetaPixel", authority: "watchlist" },
      item: {
        title: "New camera market report points to mirrorless demand shift",
        contentSnippet: "A new market report shows changing consumer demand across imaging categories.",
      },
    });
    expect(result.type).toBe("行业趋势");
    expect(result.classification.reason).toBe("heuristic_trend");
  });

  it("refreshes dedupe keys from high-confidence LLM story keys", async () => {
    dbModule.migrate();
    dbModule.db.prepare("DELETE FROM news_items").run();
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
      },
    });
    const userId = dbModule.getLegacyUserId();
    repo.upsertNews(userId, [{
      source_id: "google",
      source: "GadgetGuy",
      original_url: "https://example.com/sony-a7r-vi",
      original_title: "Sony Alpha 7R VI launches",
      titleZh: "Sony Alpha 7R VI launches",
      summary: "A new full-frame camera launches.",
      llmProcessed: false,
      needsTranslation: true,
      date: "2026-05-15T00:00:00.000Z",
    }]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, options = {}) => {
      const body = JSON.parse(options.body);
      expect(body.messages[0].content).toContain("story_key");
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                keep: true,
                type: "new_product",
                title_zh: "索尼发布Alpha 7R VI",
                summary_zh: "索尼发布新款高像素全画幅相机。",
                content_zh: "索尼发布Alpha 7R VI，主打高像素和新的自动对焦能力。",
                story_key: "sony-a7r-vi-launch",
                story_event: "launch",
                dedupe_confidence: 0.91,
              }),
            },
          }],
        }),
      };
    };

    try {
      const result = await processNewsWithLlm(userId, 1);
      expect(result.kept).toBe(1);
      const saved = repo.listNews(userId).find((item) => item.original_url === "https://example.com/sony-a7r-vi");
      expect(saved?.classification).toMatchObject({
        reason: "manual_llm",
        story_key: "sony-a7r-vi-launch",
        near_merge_key: "unknown::generic::sony-a7r-vi-launch",
        story_event: "launch",
        dedupe_confidence: 0.91,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("marks ambiguous updates for llm review", () => {
    const result = heuristicClassifyNews({
      source: { name: "Brand Feed", authority: "watchlist" },
      item: {
        title: "Creator workflow update adds new feature series",
        contentSnippet: "The lineup update improves workflow for creators.",
      },
    });
    expect(result.type).toBe("待判定");
    expect(result.classification.reason).toBe("heuristic_ambiguous");
  });

  it("downgrades media launch-like story to trend when evidence is weak", () => {
    const result = heuristicClassifyNews({
      item: {
        sourceName: "PetaPixel",
        title: "New camera system launches into creator workflow conversation",
        contentSnippet: "The story discusses how the new lineup fits the market without official launch details.",
      },
    });
    expect(result.type).toBe("行业趋势");
    expect(result.classification.reason).toBe("media_launch_downgraded_to_trend");
  });

  it("collects only due sources for scheduler", () => {
    const now = new Date("2026-05-11T12:00:00.000Z");
    expect(shouldCollectSource({ active: true, url: "https://a.test", fetch_interval: 60, last_fetched_at: "2026-05-11T10:30:00.000Z" }, now)).toBe(true);
    expect(shouldCollectSource({ active: true, url: "https://a.test", fetch_interval: 60, last_fetched_at: "2026-05-11T11:30:00.000Z" }, now)).toBe(false);
  });

  it("extracts thumbnails from encoded rss content", () => {
    expect(extractRssThumbnail({
      contentEncoded: '<p><img data-src="https://cdn.example.com/news.jpg" /></p>',
    })).toBe("https://cdn.example.com/news.jpg");
  });

  it("only enriches managed official sources with page images", () => {
    expect(shouldEnrichSourceImages({ id: "rss-google-camera-launches", authority: "aggregator" })).toBe(true);
    expect(shouldEnrichSourceImages({ id: "custom-watchlist-feed", type: "rss", source_group: "competitor", authority: "watchlist" })).toBe(true);
    expect(shouldEnrichSourceImages({ id: "custom-feed", type: "rss", source_group: "custom", authority: "watchlist" })).toBe(true);
    expect(shouldEnrichSourceImages({ id: "custom-non-rss", type: "manual", source_group: "custom", authority: "watchlist" })).toBe(false);
  });

  it("parses wechat exporter source urls", () => {
    const parsed = __rssTestUtils.parseWechatExporterSourceUrl({
      url: "https://wewerss.loom.ai/api/public/v1/article?fakeid=MzA3&authKey=abc123&size=15&begin=5",
    });
    expect(parsed.articleEndpoint).toBe("https://wewerss.loom.ai/api/public/v1/article");
    expect(parsed.accountByUrlEndpoint).toBe("https://wewerss.loom.ai/api/public/v1/accountbyurl");
    expect(parsed.fakeid).toBe("MzA3");
    expect(parsed.authKey).toBe("abc123");
    expect(parsed.size).toBe(15);
    expect(parsed.begin).toBe(5);
  });

  it("normalizes tracking params for rss item dedupe", () => {
    expect(__rssTestUtils.normalizeUrlForDedupe("https://example.com/a/?utm_source=google&utm_medium=rss&x=1#section")).toBe("https://example.com/a/?x=1");
  });

  it("uses resolved article urls for Google News item dedupe", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      url: "https://www.example.com/news/product-launch?utm_source=google",
      text: async () => "<html></html>",
    });

    try {
      const result = await __rssTestUtils.resolveOriginalArticleUrl({
        link: "https://news.google.com/rss/articles/CBMi-demo?oc=5",
      });
      expect(result).toBe("https://www.example.com/news/product-launch");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("extracts canonical article urls from Google News html", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      url: "https://news.google.com/rss/articles/CBMi-demo?oc=5",
      text: async () => '<html><script>{"url":"https:\\/\\/www.example.com\\/real-article?utm_source=google"}</script></html>',
    });

    try {
      const result = await __rssTestUtils.resolveOriginalArticleUrl({
        title: "SmallRig Launches Camera Cage - Example",
        link: "https://news.google.com/rss/articles/CBMi-demo?oc=5",
        source: { url: "https://www.example.com" },
      });
      expect(result).toBe("https://www.example.com/real-article");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to source and title keys when Google News does not reveal article urls", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      url: "https://news.google.com/rss/articles/CBMi-demo?oc=5",
      text: async () => "<html></html>",
    });

    try {
      const result = await __rssTestUtils.resolveOriginalArticleUrl({
        title: "SmallRig Launches New Camera Cage - Newsshooter",
        link: "https://news.google.com/rss/articles/CBMi-demo?oc=5",
        source: { url: "https://www.newsshooter.com" },
      });
      expect(result).toBe("google-news://newsshooter.com/smallrig-launches-new-camera-cage");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("builds a stable title-based dedupe key for unresolved Google News items", () => {
    const key = __rssTestUtils.dedupeKeyForItem({
      original_url: "google-news://newsshooter.com/smallrig-launches-new-camera-cage",
      titleZh: "SmallRig launches new camera cage",
      source: "配件竞品新品 - Google News",
      classification: { source_homepage: "https://www.newsshooter.com" },
    });
    expect(key).toBe("https://newsshooter.com::smallrig-launches-new-camera-cage");
  });

  it("uses the original Google News rss url as image fallback for unresolved articles", () => {
    const imageUrl = __rssTestUtils.imageLookupUrlForItem({
      original_url: "google-news://newsshooter.com/smallrig-launches-new-camera-cage",
      article_url: "google-news://newsshooter.com/smallrig-launches-new-camera-cage",
      classification: {
        rss_url: "https://news.google.com/rss/articles/CBMi-demo?oc=5",
      },
    });
    expect(imageUrl).toBe("https://news.google.com/rss/articles/CBMi-demo?oc=5");
  });

  it("uses source homepage as a last-resort image lookup for Google News items", () => {
    const imageUrl = __rssTestUtils.imageLookupUrlForItem({
      original_url: "google-news://newsshooter.com/smallrig-launches-new-camera-cage",
      article_url: "google-news://newsshooter.com/smallrig-launches-new-camera-cage",
      classification: {
        source_homepage: "https://www.newsshooter.com",
      },
    });
    expect(imageUrl).toBe("https://www.newsshooter.com");
  });

  it("retries image enrichment when the current image is a google placeholder or logo-like asset", () => {
    expect(__rssTestUtils.shouldRetryImageEnrichment({
      thumbnail_url: "",
    })).toBe(true);

    expect(__rssTestUtils.shouldRetryImageEnrichment({
      thumbnail_url: "https://news.google.com/favicon.ico",
    })).toBe(true);

    expect(__rssTestUtils.shouldRetryImageEnrichment({
      thumbnail_url: "https://cdn.example.com/assets/logo-placeholder.png",
    })).toBe(true);

    expect(__rssTestUtils.shouldRetryImageEnrichment({
      thumbnail_url: "https://cdn.example.com/images/article-cover.jpg",
    })).toBe(false);
  });

  it("keeps trying later candidate urls when an earlier image lookup fails", async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes("news.google.com")) {
        const error = new Error("HTTP 429");
        error.name = "FetchError";
        throw error;
      }
      return {
        ok: true,
        url: String(url),
        text: async () => `
          <html>
            <head>
              <meta property="og:image" content="https://cdn.example.com/final-cover.jpg" />
            </head>
          </html>
        `,
      };
    };

    const item = {
      original_url: "google-news://newsshooter.com/smallrig-launches-new-camera-cage",
      article_url: "google-news://newsshooter.com/smallrig-launches-new-camera-cage",
      thumbnail_url: "",
      classification: {
        rss_url: "https://news.google.com/rss/articles/CBMi-demo?oc=5",
        source_homepage: "https://www.newsshooter.com",
      },
    };

    for (const imageUrl of [
      __rssTestUtils.imageLookupUrlForItem(item),
      item.classification.rss_url,
      item.classification.source_homepage,
    ].filter((url, index, array) => url && array.indexOf(url) === index)) {
      try {
        const page = await (await import("./content-fetcher.js")).fetchPageImage(imageUrl);
        if (page.image) {
          item.thumbnail_url = page.image;
          break;
        }
      } catch {}
    }

    expect(calls).toContain("https://news.google.com/rss/articles/CBMi-demo?oc=5");
    expect(calls.some((url) => url.startsWith("https://www.newsshooter.com"))).toBe(true);
    expect(item.thumbnail_url).toBe("https://cdn.example.com/final-cover.jpg");
  });

  it("reuses a known thumbnail before trying blocked publisher pages", async () => {
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
      settings: {},
    });
    const legacyUserId = dbModule.getLegacyUserId();
    repo.upsertNews(legacyUserId, [{
      source_id: "google-old",
      source: "主机新品 - Google News",
      source_authority: "aggregator",
      original_url: "https://news.google.com/rss/articles/known-story",
      titleZh: "索尼发布A7R VI",
      thumbnail_url: "https://cdn.example.com/known-cover.jpg",
      type: "新品发布",
      classification: {
        merge_key: "sony-a7r-vi",
        source_group: "official-default",
      },
      date: "2026-05-10T00:00:00.000Z",
    }]);
    repo.createNewsSource(legacyUserId, {
      id: "rss-google-camera-launches",
      name: "主机新品 - Google News",
      url: "https://example.com/feed.xml",
      type: "rss",
      authority: "aggregator",
      group: "official-default",
      source_group: "official-default",
      active: true,
    });

    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes("feed.xml")) {
        return {
          ok: true,
          text: async () => `<?xml version="1.0" encoding="UTF-8"?>
            <rss version="2.0">
              <channel>
                <title>Google Feed</title>
                <item>
                  <title>Sony launches a7R VI camera</title>
                  <link>https://news.google.com/rss/articles/known-story</link>
                  <pubDate>Fri, 15 May 2026 00:00:00 GMT</pubDate>
                  <description>New product launch.</description>
                </item>
              </channel>
            </rss>`,
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    try {
      await collectSource(legacyUserId, {
        id: "rss-google-camera-launches",
        user_id: legacyUserId,
        name: "主机新品 - Google News",
        url: "https://example.com/feed.xml",
        type: "rss",
        authority: "aggregator",
        source_group: "official-default",
        active: true,
      });

      const saved = repo.listNews(legacyUserId).find((item) => item.original_url === "https://news.google.com/rss/articles/known-story");
      expect(saved?.thumbnail_url).toBe("https://cdn.example.com/known-cover.jpg");
      expect(saved?.classification).toMatchObject({
        image_enriched: true,
        image_source: "reused_known_thumbnail",
      });
      expect(calls).toContain("https://example.com/feed.xml");
      expect(calls.every((url) => !url.includes("nofilmschool.com"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("enriches wechat exporter items when exporter cover is missing", async () => {
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
      settings: {},
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.includes("/api/public/v1/article")) {
        return {
          status: 200,
          json: async () => ({
            base_resp: { ret: 0 },
            articles: [{
              aid: "aid-1",
              title: "新品发布丨Alpha 7R VI索尼新一代全画幅微单发布",
              digest: "正文摘要",
              author_name: "索尼中国",
              link: "https://mp.weixin.qq.com/s/demo-article",
              update_time: 1715750400,
            }],
          }),
        };
      }
      if (target.includes("/api/public/v1/accountbyurl")) {
        return {
          status: 200,
          json: async () => ({
            base_resp: { ret: 0 },
            list: [{ fakeid: "MzA3" }],
          }),
        };
      }
      if (target.includes("mp.weixin.qq.com")) {
        return {
          ok: true,
          url: target,
          text: async () => `
            <html>
              <head>
                <meta property="og:image" content="https://cdn.weixin.qq.com/covers/cover-final.jpg" />
              </head>
            </html>
          `,
        };
      }
      return originalFetch(url, options);
    };

    try {
      const result = await collectSource("wechat-test-user", {
        id: "wechat-source",
        name: "索尼中国",
        type: "wechat_exporter",
        url: "https://wewerss.loom.ai/api/public/v1/article?authKey=abc123&accountUrl=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2Fseed",
        authority: "official",
        source_group: "wechat-exporter",
        active: true,
      });

      expect(result.inserted).toHaveLength(1);
      const saved = repo.listNews("wechat-test-user")[0];
      expect(saved?.thumbnail_url).toBe("https://cdn.weixin.qq.com/covers/cover-final.jpg");
      expect(saved?.classification).toMatchObject({
        source_type: "wechat_exporter",
        image_enriched: true,
        image_source: "wechat_page_meta",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
