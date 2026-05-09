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
});
