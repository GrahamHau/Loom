import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadSidepanelHelpers(initialStorage = {}) {
  const source = `${readFileSync(new URL("./sidepanel/sidepanel.js", import.meta.url), "utf8")}
globalThis.__loomState = state;
globalThis.__setRunAiProcessForTest = (fn) => { runAiProcess = fn; };`;
  const noop = () => {};
  const storage = { ...initialStorage };
  const sandbox = {
    document: {
      addEventListener: noop,
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
    },
    window: { addEventListener: noop },
    chrome: {
      runtime: { onMessage: { addListener: noop } },
      storage: {
        local: {
          get: async () => ({ ...storage }),
          set: async (next) => Object.assign(storage, next),
          remove: async (keys) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
          },
        },
      },
      tabs: {},
      windows: { WINDOW_ID_NONE: -1, onFocusChanged: { addListener: noop } },
    },
    CSS: { escape: (value) => String(value) },
    fetch: async () => ({ ok: true, json: async () => ({ settings: { extension_ai_before_save: true, tag_groups: [], fields: [], llm_configured: true } }) }),
    console,
    setInterval: () => 1,
    clearInterval: noop,
    setTimeout: () => 1,
    clearTimeout: noop,
    requestAnimationFrame: (fn) => fn(),
  };
  vm.runInNewContext(source, sandbox);
  sandbox.__storage = storage;
  return sandbox;
}

describe("sidepanel comment helpers", () => {
  it("keeps AI-translated Amazon comments when raw polling reads the same review again", () => {
    const { mergeComments } = loadSidepanelHelpers();

    const result = mergeComments(
      [{ id: "r1", user_name: "Alice", content: "磁吸安装很方便", like_count: 3, ai_processed: true }],
      [{ id: "r1", user_name: "Alice", content: "Really useful magnetic mount", like_count: 4 }],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "r1",
      user_name: "Alice",
      content: "磁吸安装很方便",
      like_count: 4,
      ai_processed: true,
    });
  });

  it("keeps AI translated comments matched by source order even when the model omits ids", () => {
    const { alignAiCommentsWithSource, mergeComments } = loadSidepanelHelpers();
    const rawComments = [
      { id: "review-a", user_name: "Alice", content: "Really useful magnetic mount", like_count: 3, posted_at_text: "May 1, 2026" },
      { id: "review-b", user_name: "Bob", content: "Brightness is good for desk shooting", like_count: 1, posted_at_text: "May 3, 2026" },
    ];
    const aiComments = [
      { user_name: "Alice", content: "磁吸安装很方便", like_count: 3 },
      { user_name: "Bob", content: "桌面补光够用", like_count: 1 },
    ];

    const processed = alignAiCommentsWithSource(rawComments, aiComments);
    const afterPolling = mergeComments(processed, rawComments);

    expect(afterPolling).toHaveLength(2);
    expect(afterPolling.map((item) => item.content)).toEqual(["磁吸安装很方便", "桌面补光够用"]);
    expect(afterPolling.map((item) => item.id)).toEqual(["review-a", "review-b"]);
    expect(afterPolling.every((item) => item.ai_processed)).toBe(true);
  });

  it("restores completed AI draft state without turning the button back to first organize", () => {
    const { restoreDraftValue } = loadSidepanelHelpers();

    expect(restoreDraftValue({ __loom_ai_processed: true }, false).__loom_ai_processed).toBe(true);
    expect(restoreDraftValue({ __loom_ai_processed: true }, true).__loom_ai_processed).toBe(false);
  });

  it("surfaces AI quality warnings instead of silently claiming a clean finish", () => {
    const { aiQualityWarningText } = loadSidepanelHelpers();

    expect(aiQualityWarningText({ __loom_ai_warnings: ["comments_untranslated"] })).toContain("评论仍是英文");
    expect(aiQualityWarningText({ __loom_ai_warnings: ["selling_points_untranslated", "comments_missing"] })).toContain("卖点仍是英文");
    expect(aiQualityWarningText({ __loom_ai_warnings: [] })).toBe("");
  });

  it("normalizes string false account setting as disabled for auto AI", () => {
    const { normalizeBooleanSetting } = loadSidepanelHelpers();

    expect(normalizeBooleanSetting("false")).toBe(false);
    expect(normalizeBooleanSetting("0")).toBe(false);
    expect(normalizeBooleanSetting(false)).toBe(false);
    expect(normalizeBooleanSetting("true")).toBe(true);
    expect(normalizeBooleanSetting(true)).toBe(true);
  });

  it("normalizes migrated legacy auto AI setting before it can trigger", async () => {
    const sandbox = loadSidepanelHelpers({ pmcopilot_ai_before_save: "false" });

    const stored = await sandbox.getStoredSettings();

    expect(stored.loom_ai_before_save).toBe(false);
    expect(sandbox.__storage.loom_ai_before_save).toBe(false);
  });

  it("never auto-runs AI after capture even if old settings say enabled", async () => {
    const sandbox = loadSidepanelHelpers({ loom_ai_before_save: true });
    let autoRuns = 0;
    sandbox.__setRunAiProcessForTest(async () => {
      autoRuns += 1;
    });
    Object.assign(sandbox.__loomState, {
      page: { platform: "xiaohongshu", data: { title: "小红书详情" } },
      form: { title: "小红书详情" },
      processed: { __loom_ai_processed: false },
      llmConfigured: true,
      processingAi: false,
      busy: false,
      formDirty: false,
    });

    await sandbox.maybeAutoProcessAfterCapture();

    expect(autoRuns).toBe(0);
  });

  it("does not let bootstrap overwrite an explicit local disabled auto AI setting", async () => {
    const sandbox = loadSidepanelHelpers({ loom_ai_before_save: false });
    sandbox.__loomState.token = "token";
    sandbox.__loomState.apiBase = "https://loom.palecedar.site";

    await sandbox.loadTagGroups();

    expect(sandbox.__storage.loom_ai_before_save).toBe(false);
  });

  it("activates AI-filled tag fields after the first organize pass", () => {
    const sandbox = loadSidepanelHelpers();
    const { buildDraft, activeTagFieldsForDraft } = sandbox;
    sandbox.__loomState.fields = [
      { key: "brand", legacyKey: "competitor_brands", name: "品牌", entities: ["competitor"], multi: true },
      { key: "host", legacyKey: "camera_brands", name: "主机", entities: ["competitor"], multi: true },
      { key: "category", legacyKey: "product_categories", name: "品类", entities: ["competitor"], multi: true },
    ];
    const processed = {
      name: "Pocket 3 cage",
      tag_values: {
        competitor_brands: ["Ulanzi"],
        camera_brands: ["Osmo Pocket 3"],
        product_categories: ["C配件类"],
      },
    };

    const draft = buildDraft("product", processed);
    const active = activeTagFieldsForDraft("product", draft, processed);

    expect(draft.tag_values).toMatchObject({
      brand: ["Ulanzi"],
      host: ["Osmo Pocket 3"],
      category: ["C配件类"],
    });
    expect(active.competitor).toEqual(["brand", "host", "category"]);
  });

  it("applies synchronous AI organize tags without polling a background job", async () => {
    const sandbox = loadSidepanelHelpers();
    const requests = [];
    sandbox.fetch = async (url, options = {}) => {
      requests.push(String(url));
      if (String(url).endsWith("/api/products/parse-raw")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            name: "Pocket 3 cage",
            tag_values: {
              brand: ["Ulanzi"],
              host: ["Osmo Pocket 3"],
              category: ["C配件类"],
            },
            selling_points: ["磁吸快拆"],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };
    Object.assign(sandbox.__loomState, {
      apiBase: "https://loom.test",
      token: "token",
      mode: "product",
      page: {
        platform: "kickstarter",
        data: { title: "Pocket 3 cage", visible_comments: [] },
      },
      pageSignature: "sig",
      fields: [
        { key: "brand", legacyKey: "competitor_brands", name: "品牌", entities: ["competitor"], multi: true },
        { key: "host", legacyKey: "camera_brands", name: "主机", entities: ["competitor"], multi: true },
        { key: "category", legacyKey: "product_categories", name: "品类", entities: ["competitor"], multi: true },
      ],
    });

    await sandbox.processRaw();

    expect(requests).toContain("https://loom.test/api/products/parse-raw");
    expect(requests.some((url) => url.includes("/api/ai-organize/jobs/"))).toBe(false);
    expect(sandbox.__loomState.processed.__loom_ai_processed).toBe(true);
    expect(sandbox.__loomState.form.tag_values).toMatchObject({
      brand: ["Ulanzi"],
      host: ["Osmo Pocket 3"],
      category: ["C配件类"],
    });
    expect(sandbox.__loomState.activeTagFields.competitor).toEqual(["brand", "host", "category"]);
  });
});
