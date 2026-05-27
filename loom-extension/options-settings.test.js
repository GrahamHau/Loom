import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadOptionsHelpers() {
  const source = readFileSync(new URL("./options/options.js", import.meta.url), "utf8");
  const noop = () => {};
  const elements = new Map();
  const element = (id, value = "") => {
    if (!elements.has(id)) {
      elements.set(id, {
          id,
          value,
          checked: false,
          textContent: "",
          disabled: false,
          addEventListener: noop,
      });
    }
    return elements.get(id);
  };
  [
    "api-base",
    "default-mode",
    "ai-before-save",
    "ai-before-save-label",
    "map-product-name",
    "map-product-brand",
    "map-product-category",
    "map-demand-title",
    "map-demand-summary",
    "connection-state",
  ].forEach((id) => element(id));
  element("api-base").value = "https://loom.palecedar.site";
  element("default-mode").value = "auto";
  element("ai-before-save").checked = false;
  const storage = {};
  const sandbox = {
    document: {
      addEventListener: noop,
      getElementById: (id) => element(id),
      querySelectorAll: (selector) => selector === "[data-platform]" ? [] : [],
    },
    window: { open: noop },
    chrome: {
      storage: {
        local: {
          get: async () => ({ ...storage }),
          set: async (next) => Object.assign(storage, next),
          remove: async (keys) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
          },
        },
      },
      tabs: { query: async () => [] },
      scripting: { executeScript: async () => [] },
      cookies: { remove: async () => ({}) },
    },
    globalThis: {},
    console,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  return { sandbox, storage, element };
}

describe("extension options settings", () => {
  it("treats string false from account settings as disabled", async () => {
    const { sandbox, storage, element } = loadOptionsHelpers();
    storage.loom_token = "token";
    sandbox.fetch = async () => ({
      ok: true,
      json: async () => ({ extension_ai_before_save: "false" }),
    });

    await sandbox.load();

    expect(element("ai-before-save").checked).toBe(false);
    expect(element("ai-before-save-label").textContent).toBe("关闭");
    expect(storage.loom_ai_before_save).toBe(false);
  });

  it("syncs web auth before deciding AI organize can only be saved locally", async () => {
    const { sandbox, storage, element } = loadOptionsHelpers();
    let syncCalled = false;
    let savedAuthorization = "";
    sandbox.syncAuthFromOpenWebTab = async () => {
      syncCalled = true;
      await sandbox.chrome.storage.local.set({ loom_token: "synced-token" });
      return { token: "synced-token", apiBase: "https://loom.palecedar.site" };
    };
    sandbox.fetch = async (_url, options = {}) => {
      savedAuthorization = options.headers?.Authorization || "";
      return { ok: true, json: async () => ({ extension_ai_before_save: false }) };
    };

    element("ai-before-save").checked = false;
    await sandbox.saveSettings();

    expect(syncCalled).toBe(true);
    expect(savedAuthorization).toBe("Bearer synced-token");
    expect(storage.loom_ai_before_save).toBe(false);
    expect(element("connection-state").textContent).toBe("设置已保存到账户");
  });

  it("keeps hidden AI auto organize preference disabled by default", async () => {
    const html = readFileSync(new URL("./options/options.html", import.meta.url), "utf8");

    expect(html).toContain('<input id="ai-before-save" type="checkbox" hidden>');
    expect(html).not.toContain('class="switch-field" aria-label="AI 自动整理"');
  });

  it("saves AI auto organize immediately when the hidden preference changes", async () => {
    const { sandbox, storage, element } = loadOptionsHelpers();
    storage.loom_token = "token";
    let savedBody = null;
    sandbox.fetch = async (_url, options = {}) => {
      if (options.method === "PATCH") {
        savedBody = JSON.parse(options.body);
      }
      return { ok: true, json: async () => ({ extension_ai_before_save: false }) };
    };

    element("ai-before-save").checked = false;
    await sandbox.saveAutoAiPreference(false);

    expect(savedBody).toEqual({ extension_ai_before_save: false });
    expect(storage.loom_ai_before_save).toBe(false);
    expect(element("connection-state").textContent).toBe("AI 自动整理已关闭，已保存到账户");
  });
});
