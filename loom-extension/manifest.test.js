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
});
