import { describe, expect, it, beforeEach } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const repo = await import("./repository.js");

beforeEach(() => {
  dbModule.migrate();
  dbModule.saveState({
    user: { name: "Graham", role: "管理员", initials: "GR" },
    products: [],
    demands: [],
    news: [{ id: "n1", starred: false }],
    research: [],
    rssSources: [],
    settings: { llm_api_key: "secret", feishu_app_secret: "secret2" },
  });
});

describe("repository", () => {
  it("creates products", () => {
    const product = repo.createProduct({ name: "Test Product" });
    expect(product.name).toBe("Test Product");
    expect(repo.rawState().products).toHaveLength(1);
  });

  it("masks settings in bootstrap", () => {
    expect(repo.bootstrap().settings.llm_api_key).toBe("********");
    expect(repo.bootstrap().settings.feishu_app_secret).toBe("********");
  });

  it("updates news flags", () => {
    repo.updateNews("n1", { starred: true });
    expect(repo.rawState().news[0].starred).toBe(true);
  });

  it("upserts news by source and url", () => {
    repo.upsertNews([{ source_id: "s1", source: "S", original_url: "https://a.test/1", titleZh: "A", date: "2026-05-10" }]);
    repo.upsertNews([{ source_id: "s1", source: "S", original_url: "https://a.test/1", titleZh: "B", date: "2026-05-10" }]);
    expect(repo.rawState().news).toHaveLength(2);
    expect(repo.rawState().news.find((item) => item.original_url === "https://a.test/1").titleZh).toBe("B");
  });

  it("does not overwrite masked secrets", () => {
    repo.updateSettings({ llm_api_key: "********", feishu_app_secret: "********", llm_model: "m2" });
    expect(repo.rawState().settings.llm_api_key).toBe("secret");
    expect(repo.rawState().settings.feishu_app_secret).toBe("secret2");
    expect(repo.rawState().settings.llm_model).toBe("m2");
  });

  it("creates and updates research", () => {
    const item = repo.createResearch({ title: "Test Research", desc: "Idea" });
    repo.updateResearch(item.id, { products: ["p1"], demands: ["d1"] });
    expect(repo.rawState().research[0].products).toEqual(["p1"]);
    expect(repo.rawState().research[0].demands).toEqual(["d1"]);
  });
});
