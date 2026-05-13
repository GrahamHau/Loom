import { describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const { extractRssThumbnail, heuristicClassifyNews, shouldCollectSource, shouldEnrichSourceImages } = await import("./rss-service.js");

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
});
