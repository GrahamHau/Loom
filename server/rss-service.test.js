import { describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const { __rssTestUtils, extractRssThumbnail, heuristicClassifyNews, shouldCollectSource, shouldEnrichSourceImages } = await import("./rss-service.js");

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
      source: { name: "主机品牌新品 - Google News", authority: "aggregator" },
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
    expect(shouldEnrichSourceImages({ id: "custom-feed", source_group: "custom", authority: "watchlist" })).toBe(false);
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
});
