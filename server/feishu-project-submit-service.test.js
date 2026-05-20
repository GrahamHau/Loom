import { describe, expect, it } from "vitest";
import { buildFeishuProjectIdeaDraft } from "./feishu-project-submit-service.js";

describe("buildFeishuProjectIdeaDraft", () => {
  const completeResearch = {
    id: "r1",
    title: "智能相机电池仓",
    desc: "用户在长时间拍摄时担心电量不够，需要一个可快速更换的电池仓。",
    source: "竞品观察",
    thumbnail_url: "https://img.test/battery-case.jpg",
    evidences: [
      { title: "竞品页面", url: "https://example.test/product" },
      { title: "用户反馈", source_url: "https://example.test/comment" },
    ],
  };

  it("builds a complete product idea draft from research, user mapping, and defaults", () => {
    const draft = buildFeishuProjectIdeaDraft({
      research: completeResearch,
      currentUserMapping: { meego_user_key: "ou_user_1" },
      settings: { feishu_project_default_product_group: "智能影像" },
    });

    expect(draft.missing_required).toEqual([]);
    expect(draft.fields).toMatchObject({
      name: "智能相机电池仓",
      field_363968: "智能相机电池仓",
      field_c7883e: "竞品观察",
      field_96241e: "https://img.test/battery-case.jpg",
      field_f4db36: "智能影像",
    });
    expect(draft.fields.field_b651c4).toContain("用户在长时间拍摄时担心电量不够");
    expect(draft.fields.field_b651c4).toContain("https://example.test/product");
    expect(draft.roles).toEqual({ "想法提出人": ["ou_user_1"] });
    expect(draft.ready).toBe(true);
  });

  it("marks product group as missing when no default or override is present", () => {
    const draft = buildFeishuProjectIdeaDraft({
      research: completeResearch,
      currentUserMapping: { meego_user_key: "ou_user_1" },
      settings: {},
    });

    expect(draft.missing_required).toContainEqual({
      key: "field_f4db36",
      label: "产品组别",
      type: "field",
      reason: "missing_product_group",
    });
    expect(draft.fields).not.toHaveProperty("field_f4db36");
    expect(draft.ready).toBe(false);
  });

  it("marks idea proposer as missing when the current user has no Meego mapping", () => {
    const draft = buildFeishuProjectIdeaDraft({
      research: completeResearch,
      currentUserMapping: {},
      settings: { feishu_project_default_product_group: "智能影像" },
    });

    expect(draft.missing_required).toContainEqual({
      key: "想法提出人",
      label: "想法提出人",
      type: "role",
      reason: "missing_meego_user_key",
    });
    expect(draft.roles).toEqual({});
    expect(draft.ready).toBe(false);
  });

  it("does not fabricate an illustration when research has no image", () => {
    const draft = buildFeishuProjectIdeaDraft({
      research: {
        ...completeResearch,
        thumbnail_url: "",
        image: "",
        evidences: [{ title: "纯文本证据", url: "https://example.test/text" }],
      },
      currentUserMapping: { meego_user_key: "ou_user_1" },
      settings: { feishu_project_default_product_group: "智能影像" },
    });

    expect(draft.fields).not.toHaveProperty("field_96241e");
    expect(draft.missing_required).toContainEqual({
      key: "field_96241e",
      label: "示意图",
      type: "field",
      reason: "missing_illustration",
    });
    expect(draft.warnings).toContainEqual({
      key: "field_96241e",
      message: "没有找到已采集图片或示意图，提交前需要用户上传或补充真实图片。",
    });
  });

  it("does not require or default product leader and idea follower roles", () => {
    const draft = buildFeishuProjectIdeaDraft({
      research: completeResearch,
      currentUserMapping: {
        meego_user_key: "ou_user_1",
        product_leader_user_key: "ou_leader",
        idea_follower_user_key: "ou_follower",
      },
      settings: { feishu_project_default_product_group: "智能影像" },
    });

    expect(draft.roles).toEqual({ "想法提出人": ["ou_user_1"] });
    expect(draft.missing_required.map((item) => item.key)).not.toContain("产品leader");
    expect(draft.missing_required.map((item) => item.key)).not.toContain("想法跟进人");
  });
});
