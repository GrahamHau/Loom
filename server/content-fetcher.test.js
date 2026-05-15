import { describe, expect, it } from "vitest";

const { cleanHtml, fetchPageContent, fetchPageImage, resolvePageUrl } = await import("./content-fetcher.js");

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

  it("fetches only page image metadata for rss enrichment", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      url: "https://www.example.com/articles/demo",
      text: async () => `
        <html>
          <head>
            <meta name="twitter:image" content="https://cdn.example.com/card.jpg" />
          </head>
          <body>demo</body>
        </html>
      `,
    });

    try {
      const result = await fetchPageImage("https://www.example.com/articles/demo");
      expect(result.image).toBe("https://cdn.example.com/card.jpg");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to the first body image when meta image is missing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      url: "https://www.example.com/articles/demo",
      text: async () => `
        <html>
          <body>
            <img data-src="/images/body-cover.jpg" />
          </body>
        </html>
      `,
    });

    try {
      const result = await fetchPageImage("https://www.example.com/articles/demo");
      expect(result.image).toBe("https://www.example.com/images/body-cover.jpg");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("prefers a larger srcset image over logo-like assets", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      url: "https://www.example.com/articles/demo",
      text: async () => `
        <html>
          <body>
            <img src="/assets/logo.png" />
            <img
              src="/images/cover-small.jpg"
              srcset="/images/cover-small.jpg 480w, /images/hero-large.jpg 1280w"
            />
          </body>
        </html>
      `,
    });

    try {
      const result = await fetchPageImage("https://www.example.com/articles/demo");
      expect(result.image).toBe("https://www.example.com/images/hero-large.jpg");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("avoids share-button assets when a real article image exists", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      url: "https://www.example.com/articles/demo",
      text: async () => `
        <html>
          <head>
            <meta property="og:image" content="https://static.addtoany.com/buttons/share_save_120_16.png" />
            <script type="application/ld+json">
              {"image":"https://www.example.com/wp-content/uploads/2026/05/real-cover.jpg"}
            </script>
          </head>
        </html>
      `,
    });

    try {
      const result = await fetchPageImage("https://www.example.com/articles/demo");
      expect(result.image).toBe("https://www.example.com/wp-content/uploads/2026/05/real-cover.jpg");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("resolves canonical article urls from link rel canonical", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      url: "https://news.google.com/rss/articles/demo",
      text: async () => `
        <html>
          <head>
            <link rel="canonical" href="https://www.example.com/articles/final-story?utm_source=google" />
          </head>
        </html>
      `,
    });

    try {
      const result = await fetchPageImage("https://news.google.com/rss/articles/demo");
      expect(result.articleUrl).toBe("https://www.example.com/articles/final-story?utm_source=google");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("decodes Google News batch urls before fetching page image", async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push(String(url));
      if (String(url).includes("/rss/articles/")) {
        return {
          ok: true,
          url: String(url),
          text: async () => '<html><body><div data-n-a-ts="1778827598" data-n-a-sg="AaLI4RQw90fBiWzp0iadMMCjFj6H"></div></body></html>',
        };
      }
      if (String(url).includes("batchexecute")) {
        return {
          ok: true,
          text: async () => `)]}'\n\n[[\"wrb.fr\",\"Fbv4je\",\"[\\\"garturlres\\\",\\\"https://www.gadgetguy.com.au/sony-alpha-7r-vi-camera-australia-price-details/\\\",1]\",null,null,null,\"generic\"]]`,
        };
      }
      return {
        ok: true,
        url: "https://www.gadgetguy.com.au/sony-alpha-7r-vi-camera-australia-price-details/",
        text: async () => `
          <html>
            <head>
              <meta property="og:image" content="https://www.gadgetguy.com.au/wp-content/uploads/2026/05/sony-alpha-7r-vi.jpg" />
            </head>
          </html>
        `,
      };
    };

    try {
      const result = await fetchPageImage("https://news.google.com/rss/articles/CBMigwFBVV95cUxQNEdPdFlEZ1ZCSDVzZTRhRFU4UmVGNUQzcC03ZDhtUFJJRFpKaXk4Vjg3TjVON0Jyc1Rza1BJeU1jTTVKSVF2cTR2U1R2RnlVbXlDQnZTZ1NJWnU2eGFUNE5WZE1ZUkl6bTJ5VHVoV2RNa0Flc2k1UEp0RnhmRVlTbmRRMA?oc=5");
      expect(calls.some((url) => url.includes("batchexecute?rpcids=Fbv4je"))).toBe(true);
      expect(calls.some((url) => url.includes("/rss/articles/CBMigwFBVV95cUxQNEdPdFlEZ1ZCSDVzZTRhRFU4UmVGNUQzcC03ZDhtUFJJRFpKaXk4Vjg3TjVON0Jyc1Rza1BJeU1jTTVKSVF2cTR2U1R2RnlVbXlDQnZTZ1NJWnU2eGFUNE5WZE1ZUkl6bTJ5VHVoV2RNa0Flc2k1UEp0RnhmRVlTbmRRMA"))).toBe(true);
      expect(calls.some((url) => url.startsWith("https://www.gadgetguy.com.au/sony-alpha-7r-vi-camera-australia-price-details/"))).toBe(true);
      expect(result.articleUrl).toBe("https://www.gadgetguy.com.au/sony-alpha-7r-vi-camera-australia-price-details/");
      expect(result.image).toBe("https://www.gadgetguy.com.au/wp-content/uploads/2026/05/sony-alpha-7r-vi.jpg");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("resolves the final page url for rss dedupe", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      url: "https://www.example.com/articles/original?utm_source=google",
      text: async () => "<html></html>",
    });

    try {
      await expect(resolvePageUrl("https://news.google.com/rss/articles/demo")).resolves.toBe("https://www.example.com/articles/original?utm_source=google");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("resolves Google News batch urls for dedupe when html stays on Google", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url).includes("/rss/articles/")) {
        return {
          ok: true,
          url: String(url),
          text: async () => '<html><body><div data-n-a-ts="1778827598" data-n-a-sg="AaLI4RQw90fBiWzp0iadMMCjFj6H"></div></body></html>',
        };
      }
      if (String(url).includes("batchexecute")) {
        return {
          ok: true,
          text: async () => `)]}'\n\n[[\"wrb.fr\",\"Fbv4je\",\"[\\\"garturlres\\\",\\\"https://www.digitalcameraworld.com/cameras/sony-alpha-7r-vi-leak\\\",1]\",null,null,null,\"generic\"]]`,
        };
      }
      return {
        ok: true,
        url: "https://www.digitalcameraworld.com/cameras/sony-alpha-7r-vi-leak",
        text: async () => "<html></html>",
      };
    };

    try {
      await expect(resolvePageUrl("https://news.google.com/rss/articles/CBMigwFBVV95cUxQNEdPdFlEZ1ZCSDVzZTRhRFU4UmVGNUQzcC03ZDhtUFJJRFpKaXk4Vjg3TjVON0Jyc1Rza1BJeU1jTTVKSVF2cTR2U1R2RnlVbXlDQnZTZ1NJWnU2eGFUNE5WZE1ZUkl6bTJ5VHVoV2RNa0Flc2k1UEp0RnhmRVlTbmRRMA?oc=5")).resolves.toBe("https://www.digitalcameraworld.com/cameras/sony-alpha-7r-vi-leak");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
