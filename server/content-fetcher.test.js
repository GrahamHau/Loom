import { describe, expect, it } from "vitest";

const { cleanHtml, fetchPageContent } = await import("./content-fetcher.js");

describe("content-fetcher", () => {
  it("keeps plain text cleanup bounded", () => {
    expect(cleanHtml("<div>Hello <strong>world</strong></div>")).toBe("Hello world");
  });

  it("extracts and resolves escaped image urls", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      url: "https://www.xiaohongshu.com/explore/abc123",
      text: async () => `
        <html>
          <head>
            <title>Test Note</title>
            <meta name="description" content="demo description" />
            <script type="application/ld+json">
              {"image":"https:\\/\\/ci.xiaohongshu.com\\/notes\\/cover.jpg"}
            </script>
          </head>
          <body>hello</body>
        </html>
      `,
    });

    try {
      const result = await fetchPageContent("https://xhslink.com/abc123");
      expect(result.platform).toBe("xiaohongshu");
      expect(result.image).toBe("https://ci.xiaohongshu.com/notes/cover.jpg");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("resolves relative image urls against final page url", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      url: "https://www.example.com/articles/demo",
      text: async () => `
        <html>
          <head>
            <meta property="og:image" content="/images/demo.png" />
          </head>
          <body>demo</body>
        </html>
      `,
    });

    try {
      const result = await fetchPageContent("https://short.example/demo");
      expect(result.image).toBe("https://www.example.com/images/demo.png");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
