import { afterEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const { feedbackRecordFieldsFor, submitFeedbackToFeishu, syncableRecordsFor } = await import("./feishu-service.js");

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FEISHU_OAUTH_APP_ID;
  delete process.env.FEISHU_OAUTH_APP_SECRET;
  delete process.env.FEISHU_FEEDBACK_APP_ID;
  delete process.env.FEISHU_FEEDBACK_APP_SECRET;
});

describe("feishu-service", () => {
  it("skips sample records for real sync", () => {
    const state = {
      products: [
        { id: "sample-product", sample: true, name: "示例产品" },
        { id: "real-product", name: "真实产品" },
      ],
      demands: [
        { id: "sample-demand", sample: true, title: "示例需求" },
        { id: "real-demand", title: "真实需求" },
      ],
    };

    expect(syncableRecordsFor("products", state, "user-1").map((item) => item.id)).toEqual(["real-product"]);
    expect(syncableRecordsFor("demands", state, "user-1").map((item) => item.id)).toEqual(["real-demand"]);
  });

  it("maps low-friction web feedback to the Feishu inbox schema", () => {
    const fields = feedbackRecordFieldsFor(
      {
        type: "Bug",
        content: "保存后页面没有刷新",
        contact: "飞书联系我",
        page: "/app?screen=products",
      },
      {
        id: "user-1",
        name: "Graham",
        email: "",
        auth_provider: "feishu",
        feishu_open_id: "ou_x",
        feishu_union_id: "on_y",
      },
      new Date("2026-05-15T01:02:03+08:00")
    );

    expect(fields).toMatchObject({
      "标题": "保存后页面没有刷新",
      "类型": "Bug",
      "严重程度": "影响使用",
      "描述": "保存后页面没有刷新",
      "用户名称": "Graham",
      "用户ID": "user-1",
      "用户邮箱（如有）": "",
      "联系方式": "飞书联系我",
      "飞书 Open ID": "ou_x",
      "飞书 Union ID": "on_y",
      "登录方式": "飞书 OAuth",
      "状态": "新反馈",
      "来源": "Web App",
    });
    expect(fields["页面路径"]).toEqual({
      link: "https://loom.palecedar.site/app?screen=products",
      text: "/app?screen=products",
    });
    expect(fields["提交时间"]).toBe(new Date("2026-05-15T01:02:03+08:00").getTime());
  });

  it("keeps the feedback form tolerant and defaults unknown types", () => {
    const fields = feedbackRecordFieldsFor(
      { type: "random", content: "  一个想法\n\n可以更快  " },
      { id: "legacy-default", name: "visitor", auth_provider: "password" },
      new Date("2026-05-15T00:00:00Z")
    );

    expect(fields["类型"]).toBe("其他");
    expect(fields["严重程度"]).toBe("一般");
    expect(fields["描述"]).toBe("一个想法 可以更快");
    expect(fields["登录方式"]).toBe("访客/体验");
  });

  it("can submit feedback with Feishu OAuth app credentials from production env", async () => {
    dbModule.migrate();
    process.env.FEISHU_OAUTH_APP_ID = "cli_test";
    process.env.FEISHU_OAUTH_APP_SECRET = "secret";
    const calls = [];
    vi.stubGlobal("fetch", async (url, options = {}) => {
      calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
      if (String(url).includes("/auth/v3/tenant_access_token/internal")) {
        return Response.json({ code: 0, tenant_access_token: "tenant-token" });
      }
      return Response.json({ code: 0, data: { record: { record_id: "rec-test" } } });
    });

    await expect(submitFeedbackToFeishu(
      "regular-user",
      { type: "功能建议", content: "希望支持快捷反馈", page: "/app" },
      { id: "regular-user", name: "User", auth_provider: "feishu" }
    )).resolves.toEqual({ ok: true, record_id: "rec-test" });

    expect(calls[0].body).toMatchObject({ app_id: "cli_test", app_secret: "secret" });
    expect(calls[1].url).toContain("/bitable/v1/apps/OeS5bT8kjalJnEs85Qgcs5jQnIg/tables/tblfN7MErcVmepYF/records");
    expect(calls[1].body.fields).toMatchObject({
      "类型": "功能建议",
      "描述": "希望支持快捷反馈",
      "登录方式": "飞书 OAuth",
    });
  });

  it("prefers dedicated feedback app credentials over Feishu OAuth credentials", async () => {
    dbModule.migrate();
    process.env.FEISHU_OAUTH_APP_ID = "cli_oauth";
    process.env.FEISHU_OAUTH_APP_SECRET = "oauth-secret";
    process.env.FEISHU_FEEDBACK_APP_ID = "cli_feedback";
    process.env.FEISHU_FEEDBACK_APP_SECRET = "feedback-secret";
    const calls = [];
    vi.stubGlobal("fetch", async (url, options = {}) => {
      calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
      if (String(url).includes("/auth/v3/tenant_access_token/internal")) {
        return Response.json({ code: 0, tenant_access_token: "tenant-token" });
      }
      return Response.json({ code: 0, data: { record: { record_id: "rec-feedback" } } });
    });

    await expect(submitFeedbackToFeishu(
      "regular-user",
      { type: "Bug", content: "反馈专用 App 测试", page: "/app" },
      { id: "regular-user", name: "User", auth_provider: "feishu" }
    )).resolves.toEqual({ ok: true, record_id: "rec-feedback" });

    expect(calls[0].body).toMatchObject({ app_id: "cli_feedback", app_secret: "feedback-secret" });
  });
});
