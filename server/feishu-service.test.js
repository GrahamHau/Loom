import { describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const { feedbackRecordFieldsFor, syncableRecordsFor } = await import("./feishu-service.js");

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
      "页面路径": "/app?screen=products",
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
    expect(fields["提交时间"]).toMatch(/2026-05-(14|15) \d{2}:02:03/);
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
});
