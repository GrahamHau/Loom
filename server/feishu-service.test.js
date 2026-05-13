import { describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const { syncableRecordsFor } = await import("./feishu-service.js");

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
});
