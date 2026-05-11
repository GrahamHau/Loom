import { describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const { heuristicClassifyNews } = await import("./rss-service.js");

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
    expect(result.classification.reason).toBe("official_strong_launch");
  });

  it("does not classify broad photography stories as product launches", () => {
    const result = heuristicClassifyNews({
      source: { name: "PetaPixel", authority: "watchlist" },
      item: {
        title: "Center for Creative Photography Adds Archives of Nine Influential Photographers",
        contentSnippet: "The archive collection has been donated to a research center.",
      },
    });
    expect(result.type).toBe("行业趋势");
    expect(result.classification.reason).toBe("non_product_or_broad_news");
  });

  it("keeps teaser and expected launch stories out of product launches", () => {
    const result = heuristicClassifyNews({
      source: { name: "主机品牌新品 - Google News", authority: "aggregator" },
      item: {
        title: "Canon Posts Enigmatic Teaser for a New Camera Set to Debut Next Week",
        contentSnippet: "The company is expected to reveal more details soon.",
      },
    });
    expect(result.type).toBe("行业趋势");
    expect(result.classification.reason).toBe("non_product_or_broad_news");
  });

  it("keeps official non-gear collections out of product launches", () => {
    const result = heuristicClassifyNews({
      source: { name: "Apple Newsroom", authority: "official" },
      item: {
        title: "Apple introduces a new Pride Collection",
        contentSnippet: "The collection includes a new watch band and wallpaper.",
      },
    });
    expect(result.type).toBe("行业趋势");
  });
});
