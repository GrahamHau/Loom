import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

function loadAuthErrors() {
  const source = readFileSync(new URL("./shared/auth-errors.js", import.meta.url), "utf8");
  const sandbox = { globalThis: {} };
  sandbox.window = sandbox.globalThis;
  vm.runInNewContext(source, sandbox);
  return sandbox.globalThis.LoomAuthErrors;
}

describe("extension auth error classification", () => {
  test("treats fetch and closed-connection failures as network errors", () => {
    const authErrors = loadAuthErrors();

    expect(authErrors.isNetworkAuthError(new TypeError("Failed to fetch"))).toBe(true);
    expect(authErrors.isNetworkAuthError(new Error("Load failed"))).toBe(true);
    expect(authErrors.isNetworkAuthError({ status: 0, message: "net::ERR_CONNECTION_CLOSED" })).toBe(true);
  });

  test("does not treat definite auth failures as network errors", () => {
    const authErrors = loadAuthErrors();

    expect(authErrors.isNetworkAuthError({ status: 401, message: "Unauthorized" })).toBe(false);
    expect(authErrors.isNetworkAuthError({ status: 403, message: "Forbidden" })).toBe(false);
    expect(authErrors.isNetworkAuthError(new Error("服务器未返回插件登录凭证"))).toBe(false);
  });
});
