import { describe, expect, it } from "vitest";

import { feedHubBundleToLoomNews, resolveFeedHubStreamUrls } from "./sync-feedhub-official-stream.js";

describe("sync-feedhub-official-stream", () => {
  it("discovers delivery streams from the FeedHub catalog", () => {
    const urls = resolveFeedHubStreamUrls({
      categories: [
        { id: 1, title: "All", feed_count: 0 },
        { id: 2, title: "微信公众号", feed_count: 29, delivery_url: "/api/delivery/stream?category_id=2" },
        { id: 3, title: "official-google-news", feed_count: 2, delivery_url: "/api/delivery/stream?category_id=3" },
      ],
    }, "https://rss.ddsm24.site");

    expect(urls).toEqual([
      "https://rss.ddsm24.site/api/delivery/stream?category_id=2&since=5d",
      "https://rss.ddsm24.site/api/delivery/stream?category_id=3&since=5d",
    ]);
  });

  it("only syncs groups assigned to Loom when the catalog has target bindings", () => {
    const urls = resolveFeedHubStreamUrls({
      targets: [{ id: "loom", title: "Loom" }, { id: "digest", title: "AI Digest" }],
      groups: [
        { id: 2, title: "微信公众号", feed_count: 29, delivery_url: "/api/delivery/stream?category_id=2", targets: [{ id: "loom", title: "Loom" }] },
        { id: 3, title: "official-google-news", feed_count: 2, delivery_url: "/api/delivery/stream?category_id=3", targets: [{ id: "digest", title: "AI Digest" }] },
      ],
    }, "https://rss.ddsm24.site", 5, "Loom");

    expect(urls).toEqual([
      "https://rss.ddsm24.site/api/delivery/stream?category_id=2&since=5d",
    ]);
  });

  it("maps FeedHub wechat items to Loom's existing wechat source group", () => {
    const item = feedHubBundleToLoomNews({
      id: "fh_1",
      source_type: "wechat",
      source_name: "极客公园",
      title_original: "标题",
      summary: "摘要",
      canonical_url: "https://mp.weixin.qq.com/s/demo",
      published_at: "2026-05-19T12:06:57+08:00",
      thumbnail_url: "https://example.test/thumb.jpg",
      miniflux_entry_id: 1538,
    });

    expect(item.source_id).toBe("feedhub-wechat-exporter");
    expect(item.classification.source_group).toBe("wechat-exporter");
    expect(item.classification.source_type).toBe("wechat");
    expect(item.type).toBe("资讯");
  });
});
