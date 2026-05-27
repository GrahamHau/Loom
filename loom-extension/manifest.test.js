import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("loom extension manifest", () => {
  it("only injects the detector script by default", () => {
    const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8"));
    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.content_scripts[0].js).toEqual(["content/detector.js"]);
  });

  it("lazy injection keeps detector and platform extractors separate", () => {
    const sidepanel = readFileSync(new URL("./sidepanel/sidepanel.js", import.meta.url), "utf8");

    expect(sidepanel).toContain("async function ensureContentScriptsInjected");
    expect(sidepanel).toContain('files: ["content/detector.js", EXTRACTOR_FILES[platform]]');
    expect(sidepanel).toContain("extractor_missing");
    expect(sidepanel).not.toContain("async function ensureExtractorInjected");
  });

  it("keeps expensive sidepanel work bounded", () => {
    const sidepanel = readFileSync(new URL("./sidepanel/sidepanel.js", import.meta.url), "utf8");
    const background = readFileSync(new URL("./background/service-worker.js", import.meta.url), "utf8");

    expect(background).toContain("loom_ai_before_save: false");
    expect(sidepanel).toContain("const AUTO_AI_ENABLED = false");
    expect(sidepanel).toContain("const URL_WATCH_INTERVAL_MS = 1600");
    expect(sidepanel).toContain("const BOOTSTRAP_CACHE_MS = 30000");
    expect(sidepanel).toContain("const COMMENT_COLLECT_INTERVAL_MS = 2500");
    expect(sidepanel).toContain("const COMMENT_COLLECT_MAX_MS = 15000");
    expect(sidepanel).toContain("await ensureContentScriptsInjected(state.tab.id, state.page.platform);");
    expect(sidepanel).not.toContain("await ensureContentScriptsInjected(state.tab.id, state.page.platform, { force: true });");
  });

  it("forces sidepanel recognition on URL changes instead of keeping stale detail state", () => {
    const sidepanel = readFileSync(new URL("./sidepanel/sidepanel.js", import.meta.url), "utf8");

    expect(sidepanel).toContain('message?.type !== "LOOM_PAGE_URL_CHANGED"');
    expect(sidepanel).toContain("void syncIfUrlChanged({");
    expect(sidepanel).toContain("forceUrlChange: true");
    expect(sidepanel).not.toContain("locked-ignore-detail-url");
  });
});
