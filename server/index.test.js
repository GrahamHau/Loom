import { afterEach, beforeEach, describe, expect, it } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = ":memory:";
process.env.APP_USERNAME = "tester@example.com";
process.env.APP_PASSWORD = "secret123";
process.env.APP_PASSWORD_ACCOUNTS = "";
process.env.LOOM_OWNER_EMAIL = "";
process.env.LOOM_BOT_INGRESS_KEY = "test_ingress_key";
process.env.REMOTE_MEDIA_CACHE_TIMEOUT_MS = "1000";

const dbModule = await import("./db.js");
const repo = await import("./repository.js");
const { default: app, zonedDateHour } = await import("./index.js");

let server;
let baseUrl = "";

function extractCookie(headers) {
  const raw = headers.get("set-cookie") || "";
  return raw.split(";")[0] || "";
}

beforeEach(async () => {
  process.env.LOOM_OWNER_EMAIL = "";
  process.env.APP_PASSWORD_ACCOUNTS = "";
  dbModule.migrate();
  dbModule.db.prepare("DELETE FROM news_items").run();
  dbModule.db.prepare("DELETE FROM news_sources").run();
  dbModule.db.prepare("DELETE FROM demand_cluster_question_hits").run();
  dbModule.db.prepare("DELETE FROM demand_cluster_members").run();
  dbModule.db.prepare("DELETE FROM demand_clusters").run();
  dbModule.db.prepare("DELETE FROM heat_weight_settings").run();
  dbModule.db.prepare("DELETE FROM competitor_specs").run();
  dbModule.db.prepare("DELETE FROM competitor_platforms").run();
  dbModule.db.prepare("DELETE FROM competitors").run();
  dbModule.db.prepare("DELETE FROM category_templates").run();
  dbModule.db.prepare("DELETE FROM query_audit").run();
  dbModule.db.prepare("DELETE FROM citations").run();
  dbModule.db.prepare("DELETE FROM query_indexes").run();
  dbModule.db.prepare("DELETE FROM knowledge_query_logs").run();
  dbModule.db.prepare("DELETE FROM knowledge_gaps").run();
  dbModule.db.prepare("DELETE FROM knowledge_chunks_fts").run();
  dbModule.db.prepare("DELETE FROM knowledge_chunks").run();
  dbModule.db.prepare("DELETE FROM knowledge_sources").run();
  dbModule.db.prepare("DELETE FROM evidence_links").run();
  dbModule.db.prepare("DELETE FROM evidences").run();
  dbModule.db.prepare("DELETE FROM signals").run();
  dbModule.db.prepare("DELETE FROM users").run();
  dbModule.db.prepare("DELETE FROM app_data").run();
  dbModule.db.prepare("DELETE FROM api_tokens").run();
  dbModule.ensureSeed({
    user: { name: "Graham", role: "管理员", initials: "GR" },
    products: [],
    demands: [],
    news: [],
    research: [],
    rssSources: [],
    settings: { llm_api_key: "secret", feishu_app_secret: "secret2" },
  });
  server = await new Promise((resolve) => {
    const next = app.listen(0, "127.0.0.1", () => resolve(next));
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  server = null;
  baseUrl = "";
});

describe("auth logout", () => {
  it("clears the session and revokes all user tokens on web logout", async () => {
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.APP_USERNAME,
        password: process.env.APP_PASSWORD,
      }),
    });
    const loginBody = await loginResponse.json();
    const sessionCookie = extractCookie(loginResponse.headers);

    expect(loginResponse.status).toBe(200);
    expect(sessionCookie.startsWith("connect.sid=")).toBe(true);
    expect(loginBody.token).toBeTruthy();

    const pluginTokenResponse = await fetch(`${baseUrl}/api/auth/extension/session-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_cookie: decodeURIComponent(sessionCookie.split("=")[1] || ""),
      }),
    });
    const pluginTokenBody = await pluginTokenResponse.json();
    expect(pluginTokenResponse.status).toBe(200);
    expect(pluginTokenBody.token).toBeTruthy();

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: sessionCookie },
    });
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers.get("set-cookie") || "").toContain("connect.sid=");

    const meWithCookie = await fetch(`${baseUrl}/api/me`, {
      headers: { Cookie: sessionCookie },
    });
    expect(meWithCookie.status).toBe(401);

    const meWithPluginToken = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${pluginTokenBody.token}` },
    });
    expect(meWithPluginToken.status).toBe(401);

    const meWithLoginToken = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    expect(meWithLoginToken.status).toBe(401);
  });
});

describe("document imports", () => {
  async function login() {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.APP_USERNAME,
        password: process.env.APP_PASSWORD,
      }),
    });
    return { cookie: extractCookie(response.headers), body: await response.json() };
  }

  it("imports pasted PRD text through the API and keeps it out of RAG by default", async () => {
    const { cookie } = await login();
    const response = await fetch(`${baseUrl}/api/document-imports/paste`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        workspace_id: "ws-company",
        doc_type: "prd",
        title: "Quick Release PRD",
        text: "功能需求\n产品需支持单手快拆。\n\n[图片]\n\n额外供应商说明\n这段先保留为未匹配。",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.import.status).toBe("indexed");
    expect(body.import.document_id).toBe(body.document.id);
    expect(body.document.rag_enabled).toBe(false);
    expect(body.document.content.normalized_sections.map((section) => section.key)).toContain("functional_attributes");
    expect(body.document.content.image_placeholders).toHaveLength(1);
    expect(body.document.content.unmatched_sections.some((section) => section.title.includes("额外供应商说明"))).toBe(true);

    const readResponse = await fetch(`${baseUrl}/api/document-imports/${body.import.id}`, {
      headers: { Cookie: cookie },
    });
    const readBody = await readResponse.json();
    expect(readResponse.status).toBe(200);
    expect(readBody.document.id).toBe(body.document.id);
  });
});

describe("signal evidence APIs", () => {
  async function login() {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.APP_USERNAME,
        password: process.env.APP_PASSWORD,
      }),
    });
    return { cookie: extractCookie(response.headers), body: await response.json() };
  }

  it("deduplicates signals and links evidence back to a product", async () => {
    const { cookie } = await login();
    const productResponse = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "p_seed_signal",
        name: "Godox SL60W II",
        brand: "Godox",
      }),
    });
    expect(productResponse.status).toBe(201);

    const signalPayload = {
      origin: "plugin",
      type: "product",
      source_url: "https://www.amazon.com/dp/B07K84YW86",
      raw_payload: { title: "Godox SL60W", price: 89.99 },
      workspace_id: "ws-company",
    };
    const firstSignalResponse = await fetch(`${baseUrl}/api/signals`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(signalPayload),
    });
    const firstSignal = await firstSignalResponse.json();
    expect(firstSignalResponse.status).toBe(200);
    expect(firstSignal).toMatchObject({ deduplicated: false });
    expect(firstSignal.signal_id).toMatch(/^sig_/);

    const duplicateSignalResponse = await fetch(`${baseUrl}/api/signals`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(signalPayload),
    });
    const duplicateSignal = await duplicateSignalResponse.json();
    expect(duplicateSignalResponse.status).toBe(200);
    expect(duplicateSignal).toMatchObject({
      signal_id: firstSignal.signal_id,
      deduplicated: true,
    });

    const signalReadResponse = await fetch(`${baseUrl}/api/signals/${firstSignal.signal_id}?workspace_id=ws-company`, {
      headers: { Cookie: cookie },
    });
    const signalRead = await signalReadResponse.json();
    expect(signalRead.seen_count).toBe(2);

    const evidenceResponse = await fetch(`${baseUrl}/api/evidences`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "claim_numeric",
        claim_text: "price = $89.99",
        signal_ids: [firstSignal.signal_id],
        extracted_by: "human",
        workspace_id: "ws-company",
        links: [{ entity_type: "product", entity_id: "p_seed_signal", field_path: "price" }],
      }),
    });
    const evidence = await evidenceResponse.json();
    expect(evidenceResponse.status).toBe(200);
    expect(evidence.id).toMatch(/^ev_/);

    const productWithEvidenceResponse = await fetch(`${baseUrl}/api/products/p_seed_signal?include=evidence&workspace_id=ws-company`, {
      headers: { Cookie: cookie },
    });
    const productWithEvidence = await productWithEvidenceResponse.json();
    expect(productWithEvidenceResponse.status).toBe(200);
    expect(productWithEvidence.evidence_status).toBe("current");
    expect(productWithEvidence.evidence_count).toBe(1);
    expect(productWithEvidence.evidences[0]).toMatchObject({
      id: evidence.id,
      claim_text: "price = $89.99",
      signal_ids: [firstSignal.signal_id],
    });

    const evidenceListResponse = await fetch(`${baseUrl}/api/evidences?entity_type=product&entity_id=p_seed_signal&workspace_id=ws-company`, {
      headers: { Cookie: cookie },
    });
    const evidenceList = await evidenceListResponse.json();
    expect(evidenceListResponse.status).toBe(200);
    expect(evidenceList).toHaveLength(1);
    expect(evidenceList[0].id).toBe(evidence.id);
  });

  it("rejects evidence without valid signal ids", async () => {
    const { cookie } = await login();
    const emptyResponse = await fetch(`${baseUrl}/api/evidences`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "claim_numeric",
        claim_text: "price = $89.99",
        signal_ids: [],
        extracted_by: "human",
        workspace_id: "ws-company",
      }),
    });
    const emptyBody = await emptyResponse.json();
    expect(emptyResponse.status).toBe(400);
    expect(emptyBody.error).toContain("signal_ids");

    const missingResponse = await fetch(`${baseUrl}/api/evidences`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "claim_numeric",
        claim_text: "price = $89.99",
        signal_ids: ["sig_missing"],
        extracted_by: "human",
        workspace_id: "ws-company",
      }),
    });
    const missingBody = await missingResponse.json();
    expect(missingResponse.status).toBe(400);
    expect(missingBody.error).toContain("signal not found");
  });
});

describe("M4 query API", () => {
  async function login() {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.APP_USERNAME,
        password: process.env.APP_PASSWORD,
      }),
    });
    return { cookie: extractCookie(response.headers), body: await response.json() };
  }

  it("upserts sources, answers through /api/query, and resolves stable citations", async () => {
    const { cookie } = await login();
    const upsertResponse = await fetch(`${baseUrl}/api/query/upsert`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws-company",
        sources: [{
          id: "mrd_seed_xyz",
          type: "mrd_section",
          title: "色温分析",
          body: "色温范围 2700-6500K，适合直播补光。",
          visibility: "internal_only",
          evidence_ids: ["ev_color_temp"],
          confidence: 0.9,
        }],
      }),
    });
    const upsert = await upsertResponse.json();
    expect(upsertResponse.status).toBe(200);
    expect(upsert.upserted_count).toBe(1);

    const firstQueryResponse = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: "ws-company", q: "色温范围 2700K", chat_type: "web" }),
    });
    const firstQuery = await firstQueryResponse.json();
    expect(firstQueryResponse.status).toBe(200);
    expect(firstQuery).toMatchObject({
      adapter: "local",
      visibility_applied: "internal_only",
    });
    expect(firstQuery.trace_id).toMatch(/^trace_/);
    expect(firstQuery.confidence).toBeGreaterThan(0.3);
    expect(firstQuery.citations[0]).toMatchObject({
      source_id: "mrd_seed_xyz",
      source_type: "mrd_section",
      evidence_id: "ev_color_temp",
    });
    expect(firstQuery.citations[0].id).toMatch(/^cit_/);

    const secondQueryResponse = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: "ws-company", q: "直播补光色温是多少", chat_type: "web" }),
    });
    const secondQuery = await secondQueryResponse.json();
    expect(secondQuery.citations[0].id).toBe(firstQuery.citations[0].id);

    const citationResponse = await fetch(`${baseUrl}/api/citations/${firstQuery.citations[0].id}?workspace_id=ws-company`, {
      headers: { Cookie: cookie },
    });
    const citation = await citationResponse.json();
    expect(citationResponse.status).toBe(200);
    expect(citation).toMatchObject({
      id: firstQuery.citations[0].id,
      source_id: "mrd_seed_xyz",
      source_type: "mrd_section",
    });
    expect(citation.source_body_full).toContain("2700-6500K");
  });

  it("refuses no-match queries and filters group chat to external-safe sources", async () => {
    const { cookie } = await login();
    await fetch(`${baseUrl}/api/query/upsert`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws-company",
        sources: [
          {
            id: "kc_internal_runtime",
            type: "knowledge_answer",
            title: "内部续航",
            body: "Godox 续航内部判断 internal runtime secret。",
            visibility: "internal_only",
          },
          {
            id: "kc_external_runtime",
            type: "knowledge_answer",
            title: "外部续航",
            body: "Godox 续航对外口径 external runtime answer。",
            visibility: "external_safe",
          },
        ],
      }),
    });

    const noMatchResponse = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: "ws-company", q: "xqz123 完全不存在的随机词组" }),
    });
    const noMatch = await noMatchResponse.json();
    expect(noMatchResponse.status).toBe(200);
    expect(noMatch.confidence).toBeLessThan(0.3);
    expect(noMatch.citations).toHaveLength(0);
    expect(noMatch.answer).toContain("暂无可靠来源");

    const groupQueryResponse = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws-company",
        q: "Godox 续航 runtime",
        chat_type: "group",
        visibility_ceiling: "external_safe",
      }),
    });
    const groupQuery = await groupQueryResponse.json();
    expect(groupQueryResponse.status).toBe(200);
    expect(groupQuery.visibility_applied).toBe("external_safe");
    expect(groupQuery.citations.map((citation) => citation.source_id)).toContain("kc_external_runtime");
    expect(groupQuery.citations.map((citation) => citation.source_id)).not.toContain("kc_internal_runtime");
  });

  it("reports local query adapter health", async () => {
    const { cookie } = await login();
    const response = await fetch(`${baseUrl}/api/query/health?workspace_id=ws-company`, {
      headers: { Cookie: cookie },
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ adapter: "local", ok: true });
  });
});

describe("M2 competitor and M3 demand cluster APIs", () => {
  async function login() {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.APP_USERNAME,
        password: process.env.APP_PASSWORD,
      }),
    });
    return { cookie: extractCookie(response.headers), body: await response.json() };
  }

  it("deduplicates competitors by brand/model and filters by numeric specs", async () => {
    const { cookie } = await login();
    const createFirst = await fetch(`${baseUrl}/api/competitors`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws-company",
        brand: "Godox",
        model: "SL60W II",
        category_id: "cat_lighting_continuous",
        specs: { wattage: 60, cri: 95, color_temp: "5600K" },
      }),
    });
    const first = await createFirst.json();
    expect(createFirst.status).toBe(200);
    expect(first.matched_existing).toBe(false);
    expect(first.competitor.id).toMatch(/^cmp_/);

    const createDuplicate = await fetch(`${baseUrl}/api/competitors`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws-company",
        brand: "GODOX",
        model: "sl60w 2",
        category_id: "cat_lighting_continuous",
      }),
    });
    const duplicate = await createDuplicate.json();
    expect(createDuplicate.status).toBe(200);
    expect(duplicate).toMatchObject({
      matched_existing: true,
      competitor: { id: first.competitor.id },
    });

    await fetch(`${baseUrl}/api/competitors/${first.competitor.id}/platforms`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws-company",
        platform: "amazon",
        url: "https://amazon.com/dp/AAA",
        price_value: 89.99,
        price_currency: "USD",
        raw_image_url: "https://example.com/godox.jpg",
      }),
    });
    await fetch(`${baseUrl}/api/competitors/${first.competitor.id}/platforms`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws-company",
        platform: "taobao",
        url: "https://item.taobao.com/item.htm?id=684931",
        price_value: 598,
        price_currency: "CNY",
      }),
    });

    const listResponse = await fetch(`${baseUrl}/api/competitors?workspace_id=ws-company&category=cat_lighting_continuous&filter=${encodeURIComponent(JSON.stringify([{ key: "wattage", op: ">=", value: 60 }]))}`, {
      headers: { Cookie: cookie },
    });
    const list = await listResponse.json();
    expect(listResponse.status).toBe(200);
    expect(list).toHaveLength(1);
    expect(list[0].platforms).toHaveLength(2);
    expect(list[0].specs.find((spec) => spec.key === "wattage").value_number).toBe(60);
    expect(list[0].missing_required_specs).toEqual([]);

    const templatesResponse = await fetch(`${baseUrl}/api/category-templates?workspace_id=ws-company`, {
      headers: { Cookie: cookie },
    });
    const templates = await templatesResponse.json();
    expect(templatesResponse.status).toBe(200);
    expect(templates.some((template) => template.id === "cat_lighting_continuous")).toBe(true);
  });

  it("rejects attaching a platform URL to two competitors", async () => {
    const { cookie } = await login();
    const a = await (await fetch(`${baseUrl}/api/competitors`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: "ws-company", brand: "Aputure", model: "LS 60x", category_id: "cat_lighting_continuous" }),
    })).json();
    const b = await (await fetch(`${baseUrl}/api/competitors`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: "ws-company", brand: "SmallRig", model: "RC60B", category_id: "cat_lighting_continuous" }),
    })).json();
    await fetch(`${baseUrl}/api/competitors/${a.competitor.id}/platforms`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: "ws-company", platform: "amazon", url: "https://amazon.com/dp/DUP" }),
    });

    const duplicateUrl = await fetch(`${baseUrl}/api/competitors/${b.competitor.id}/platforms`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: "ws-company", platform: "amazon", url: "https://amazon.com/dp/DUP" }),
    });
    const body = await duplicateUrl.json();
    expect(duplicateUrl.status).toBe(409);
    expect(body.error).toContain("url already attached");
  });

  it("clusters demands, computes heat, records question hits, merges and splits clusters", async () => {
    const { cookie } = await login();
    const demandInputs = [
      { id: "d_quick_1", title: "希望支持快装板", summary: "Arca 快装板兼容性不好", created_at: "2026-05-17T10:00:00.000Z" },
      { id: "d_quick_2", title: "想要 Arca 兼容", summary: "快装板需要更兼容", created_at: "2026-05-16T10:00:00.000Z" },
      { id: "d_quick_3", title: "快装结构更稳", summary: "希望加快装结构", created_at: "2026-04-30T10:00:00.000Z" },
      { id: "d_battery_1", title: "希望续航更久", summary: "直播灯续航不够", created_at: "2026-05-17T11:00:00.000Z" },
    ];
    for (const demand of demandInputs) {
      const response = await fetch(`${baseUrl}/api/demands`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify(demand),
      });
      expect(response.status).toBe(201);
    }

    const recomputeResponse = await fetch(`${baseUrl}/api/demand-clusters/recompute`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: "ws-company", only_unclustered: true }),
    });
    const recompute = await recomputeResponse.json();
    expect(recomputeResponse.status).toBe(200);
    expect(recompute.estimated_demands).toBe(4);
    expect(recompute.clusters_created).toBeGreaterThanOrEqual(2);

    const listResponse = await fetch(`${baseUrl}/api/demand-clusters?workspace_id=ws-company&window=30d&order=heat`, {
      headers: { Cookie: cookie },
    });
    const clusters = await listResponse.json();
    expect(listResponse.status).toBe(200);
    const quickCluster = clusters.find((cluster) => cluster.canonical_text.includes("快装") || cluster.canonical_text.toLowerCase().includes("arca"));
    expect(quickCluster.member_count).toBe(3);
    expect(quickCluster.mentions_7d).toBe(2);
    expect(quickCluster.mentions_30d).toBe(3);
    expect(quickCluster.heat).toBe((3 * 2) + 3);

    const hitResponse = await fetch(`${baseUrl}/api/demand-clusters/${quickCluster.id}/question-hits`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws-company",
        asker_id: "u_sales_01",
        query_text: "客户问快装板兼容性怎么回答",
      }),
    });
    expect(hitResponse.status).toBe(200);
    const afterHit = await (await fetch(`${baseUrl}/api/demand-clusters/${quickCluster.id}?workspace_id=ws-company`, {
      headers: { Cookie: cookie },
    })).json();
    expect(afterHit.internal_questions_30d).toBe(1);
    expect(afterHit.heat).toBe((3 * 2) + 3 + 5);

    const batteryCluster = clusters.find((cluster) => cluster.id !== quickCluster.id);
    const mergeResponse = await fetch(`${baseUrl}/api/demand-clusters/${batteryCluster.id}/merge`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: "ws-company", target_id: quickCluster.id }),
    });
    const merge = await mergeResponse.json();
    expect(mergeResponse.status).toBe(200);
    expect(merge.moved_members).toBe(1);

    const splitResponse = await fetch(`${baseUrl}/api/demand-clusters/${quickCluster.id}/split`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws-company",
        split_demand_ids: ["d_battery_1"],
        new_canonical_text: "续航更久",
      }),
    });
    const split = await splitResponse.json();
    expect(splitResponse.status).toBe(200);
    expect(split.new_cluster_id).toMatch(/^dc_/);
    expect(split.moved_members).toBe(1);
  });
});

describe("M5 Feishu Bot MVP", () => {
  async function login() {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.APP_USERNAME,
        password: process.env.APP_PASSWORD,
      }),
    });
    return { cookie: extractCookie(response.headers), body: await response.json() };
  }

  async function seedBotSource(cookie) {
    const upsert = await fetch(`${baseUrl}/api/query/upsert`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws-company",
        sources: [
          {
            id: "bot_internal_runtime",
            type: "knowledge_answer",
            title: "内部续航口径",
            body: "Godox SL60W 续航内部测试为 80 分钟。",
            visibility: "internal_only",
          },
          {
            id: "bot_external_runtime",
            type: "knowledge_answer",
            title: "外部续航口径",
            body: "Godox SL60W 在持续输出场景下提供出色续航。",
            visibility: "external_safe",
          },
        ],
      }),
    });
    expect(upsert.status).toBe(200);
  }

  function botEvent({ open_id = "ou_pm_001", chat_id = "oc_p2p_pm", chat_type = "p2p", text = "Godox SL60W 续航多久?", message_id = `om_${chat_id}` } = {}) {
    return {
      workspace_id: "ws-company",
      event_id: `evt_${message_id}`,
      message_id,
      chat_id,
      chat_type,
      sender_id: open_id,
      message_type: "text",
      content: JSON.stringify({ text }),
      create_time: "1779120000000",
    };
  }

  it("answers PM private chat with internal citations and records a conversation", async () => {
    const { cookie, body } = await login();
    await seedBotSource(cookie);
    const bindResponse = await fetch(`${baseUrl}/api/bot/feishu/users`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws-company",
        open_id: "ou_pm_001",
        loom_user_id: body.user.id,
        role: "pm",
        display_name: "PM Alice",
      }),
    });
    expect(bindResponse.status).toBe(200);

    const eventResponse = await fetch(`${baseUrl}/api/bot/feishu/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Loom-Bot-Ingress-Key": "test_ingress_key" },
      body: JSON.stringify(botEvent()),
    });
    const result = await eventResponse.json();
    expect(eventResponse.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.card.data.answer).toContain("80 分钟");
    expect(result.card.data.visibility_applied).toBe("internal_only");
    expect(result.card.data.citations[0].source_id).toBe("bot_internal_runtime");
    expect(result.conversation.visibility_ceiling_used).toBe("internal_only");
  });

  it("filters group chat to external-safe content even for PM users", async () => {
    const { cookie, body } = await login();
    await seedBotSource(cookie);
    await fetch(`${baseUrl}/api/bot/feishu/users`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws-company",
        open_id: "ou_pm_001",
        loom_user_id: body.user.id,
        role: "pm",
        display_name: "PM Alice",
      }),
    });

    const eventResponse = await fetch(`${baseUrl}/api/bot/feishu/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Loom-Bot-Ingress-Key": "test_ingress_key" },
      body: JSON.stringify(botEvent({ chat_id: "oc_group_team", chat_type: "group", message_id: "om_group_1" })),
    });
    const result = await eventResponse.json();
    expect(eventResponse.status).toBe(200);
    expect(result.card.data.answer).not.toContain("80 分钟");
    expect(result.card.data.answer).toContain("持续输出场景下提供出色续航");
    expect(result.card.data.visibility_applied).toBe("external_safe");
    expect(result.card.data.citations.map((citation) => citation.source_id)).toEqual(["bot_external_runtime"]);
  });

  it("rejects missing ingress key and records card actions", async () => {
    const { cookie, body } = await login();
    await fetch(`${baseUrl}/api/bot/feishu/users`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: "ws-company",
        open_id: "ou_pm_001",
        loom_user_id: body.user.id,
        role: "pm",
        display_name: "PM Alice",
      }),
    });

    const unauthorizedResponse = await fetch(`${baseUrl}/api/bot/feishu/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Lark-Signature": "test" },
      body: JSON.stringify(botEvent({ message_id: "om_bad" })),
    });
    expect(unauthorizedResponse.status).toBe(401);

    const actionResponse = await fetch(`${baseUrl}/api/bot/feishu/card-actions`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json", "X-Loom-Bot-Ingress-Key": "test_ingress_key" },
      body: JSON.stringify({
        workspace_id: "ws-company",
        action: "report_incorrect",
        message_id: "om_group_1",
        user_open_id: "ou_pm_001",
        payload: { trace_id: "trace_action" },
      }),
    });
    const action = await actionResponse.json();
    expect(actionResponse.status).toBe(200);
    expect(action).toMatchObject({ ok: true, feedback: "incorrect" });
  });

  it("does not enable bot ingress with a test fallback key in production", async () => {
    const originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      LOOM_BOT_INGRESS_KEY: process.env.LOOM_BOT_INGRESS_KEY,
    };
    process.env.NODE_ENV = "production";
    delete process.env.LOOM_BOT_INGRESS_KEY;
    try {
      const response = await fetch(`${baseUrl}/api/bot/feishu/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Loom-Bot-Ingress-Key": "test_ingress_key" },
        body: JSON.stringify(botEvent({ message_id: "om_no_prod_key" })),
      });
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ error: "bot_ingress_not_configured" });
    } finally {
      process.env.NODE_ENV = originalEnv.NODE_ENV;
      process.env.LOOM_BOT_INGRESS_KEY = originalEnv.LOOM_BOT_INGRESS_KEY;
    }
  });
});

describe("media cache", () => {
  async function login() {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.APP_USERNAME,
        password: process.env.APP_PASSWORD,
      }),
    });
    return { cookie: extractCookie(response.headers) };
  }

  it("caches remote demand cover images during creation", async () => {
    const { cookie } = await login();
    const imageResponse = new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
    });
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      if (String(url).startsWith("https://img.test/")) return imageResponse.clone();
      return originalFetch(url, options);
    };
    try {
      const response = await fetch(`${baseUrl}/api/demands`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "小红书图片需求",
          source: "xiaohongshu",
          thumbnail_url: "https://img.test/xhs-cover.jpg",
        }),
      });
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.thumbnail_url).toMatch(/^\/uploads\/remote-media\/.+\.jpg$/);
      expect(body.image).toBe(body.thumbnail_url);
      expect(body.original_image_url).toBe("https://img.test/xhs-cover.jpg");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("re-caches xiaohongshu images during demand updates", async () => {
    const { cookie } = await login();
    const originalFetch = global.fetch;
    global.fetch = async (url, options = {}) => {
      if (String(url).includes("xhscdn.com")) {
        if (String(options.headers?.Referer || "").includes("xiaohongshu.com")) {
          return new Response(new Uint8Array([1, 2, 3, 4]), {
            status: 200,
            headers: { "Content-Type": "image/webp" },
          });
        }
        return new Response(null, { status: 403 });
      }
      return originalFetch(url, options);
    };
    try {
      const createResponse = await fetch(`${baseUrl}/api/demands`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "XHS source",
          source: "xiaohongshu",
          thumbnail_url: "https://sns-webpic-qc.xhscdn.com/202605181115/test.webp",
        }),
      });
      const created = await createResponse.json();
      expect(created.thumbnail_url).toMatch(/^\/uploads\/remote-media\//);

      const patchResponse = await fetch(`${baseUrl}/api/demands/${created.id}`, {
        method: "PATCH",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "XHS updated",
          thumbnail_url: "https://sns-webpic-qc.xhscdn.com/202605181115/test.webp",
        }),
      });
      const patched = await patchResponse.json();
      expect(patchResponse.status).toBe(200);
      expect(patched.thumbnail_url).toMatch(/^\/uploads\/remote-media\//);
      expect(patched.original_image_url).toBe("https://sns-webpic-qc.xhscdn.com/202605181115/test.webp");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("knowledge project and document APIs", () => {
  async function login() {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.APP_USERNAME,
        password: process.env.APP_PASSWORD,
      }),
    });
    return { cookie: extractCookie(response.headers), body: await response.json() };
  }

  it("creates projects, templates, documents, packs, query, drafts, and supplier exports through APIs", async () => {
    const { cookie } = await login();
    const ownerUser = repo.findUserByEmail(process.env.APP_USERNAME);
    ownerUser.role_code = "member";
    dbModule.addWorkspaceMember("ws-company", ownerUser.id, { role: "member", status: "active", isDefault: true });
    const projectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ workspace_id: "ws-company", name: "Tripod PRD", code: "TRI" }),
    });
    const project = await projectResponse.json();
    expect(projectResponse.status).toBe(201);

    const templateResponse = await fetch(`${baseUrl}/api/product-type-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        workspace_id: "ws-company",
        name: "机加件",
        code: "machined_part",
        enabled_modules: ["product_definition", "structure", "packaging", "open_questions"],
      }),
    });
    expect(templateResponse.status).toBe(201);

    const importResponse = await fetch(`${baseUrl}/api/document-imports/paste`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        workspace_id: "ws-company",
        project_id: project.id,
        doc_type: "prd",
        text: "结构要求\n需要稳定支撑 quick tripod。\n\n包装需求\n需要保护内托。",
      }),
    });
    const imported = await importResponse.json();
    expect(importResponse.status).toBe(201);

    const entitiesResponse = await fetch(`${baseUrl}/api/knowledge/entities?workspace_id=ws-company&project_id=${project.id}`, {
      headers: { Cookie: cookie },
    });
    const entities = await entitiesResponse.json();
    expect(entitiesResponse.status).toBe(200);
    expect(entities.map((entity) => entity.entity_type)).toEqual(expect.arrayContaining(["document", "doc_section", "feature", "packaging_requirement"]));
    const feature = entities.find((entity) => entity.entity_type === "feature");
    expect(feature.source_refs[0].document_id).toBe(imported.document.id);

    const graphResponse = await fetch(`${baseUrl}/api/knowledge/entities/${feature.id}/graph?workspace_id=ws-company&depth=2`, {
      headers: { Cookie: cookie },
    });
    const graph = await graphResponse.json();
    expect(graphResponse.status).toBe(200);
    expect(graph.nodes.some((node) => node.id === feature.id)).toBe(true);
    expect(graph.edges.some((edge) => edge.relation_type === "appears_in")).toBe(true);

    const peer = repo.ensureLocalUser({
      id: "knowledge-peer-user",
      email: "knowledge-peer@example.com",
      name: "Knowledge Peer",
      auth_provider: "password",
      role_code: "member",
    });
    dbModule.addWorkspaceMember("ws-company", peer.id, { role: "member", status: "active", isDefault: true });
    repo.upsertApiToken("knowledge-peer-token", peer.id);
    const peerAuth = { Authorization: "Bearer knowledge-peer-token" };

    const privateListResponse = await fetch(`${baseUrl}/api/knowledge/entities?workspace_id=ws-company`, {
      headers: peerAuth,
    });
    const privateList = await privateListResponse.json();
    expect(privateListResponse.status).toBe(200);
    expect(privateList.map((entity) => entity.id)).not.toContain(feature.id);

    const privateGraphResponse = await fetch(`${baseUrl}/api/knowledge/entities/${feature.id}/graph?workspace_id=ws-company`, {
      headers: peerAuth,
    });
    expect(privateGraphResponse.status).toBe(404);

    const publishResponse = await fetch(`${baseUrl}/api/documents/${imported.document.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ rag_enabled: true, bot_enabled: true }),
    });
    ownerUser.role_code = "owner";
    expect(publishResponse.status).toBe(200);

    const publishedListResponse = await fetch(`${baseUrl}/api/knowledge/entities?workspace_id=ws-company&project_id=${project.id}`, {
      headers: { Cookie: cookie },
    });
    const publishedList = await publishedListResponse.json();
    expect(publishedList.map((entity) => entity.id)).toContain(feature.id);

    const seededFusion = (await import("./knowledge-repository.js")).createKnowledgeFusionCandidate({
      workspace_id: "ws-company",
      project_id: project.id,
      candidate_type: "entity",
      action: "review",
      source_entity_ids: [feature.id],
      proposed_entity: {
        canonical_name: feature.canonical_name,
        entity_type: feature.entity_type,
      },
      reason: "API permission test",
      confidence: 0.5,
    });
    const fusionResponse = await fetch(`${baseUrl}/api/knowledge/fusion-candidates?workspace_id=ws-company&project_id=${project.id}`, {
      headers: { Cookie: cookie },
    });
    const fusionCandidates = await fusionResponse.json();
    const reviewCandidate = fusionCandidates.find((candidate) => candidate.id === seededFusion.id);
    expect(fusionResponse.status).toBe(200);
    expect(reviewCandidate).toBeTruthy();

    const peerPatch = await fetch(`${baseUrl}/api/knowledge/fusion-candidates/${reviewCandidate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...peerAuth },
      body: JSON.stringify({ workspace_id: "ws-company", status: "approved" }),
    });
    expect(peerPatch.status).toBe(403);

    dbModule.addWorkspaceMember("ws-company", ownerUser.id, { role: "admin", status: "active", isDefault: true });
    const approveFusion = await fetch(`${baseUrl}/api/knowledge/fusion-candidates/${reviewCandidate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ workspace_id: "ws-company", status: "approved" }),
    });
    expect(approveFusion.status).toBe(200);

    const invalidFusion = await fetch(`${baseUrl}/api/knowledge/fusion-candidates/${reviewCandidate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ workspace_id: "ws-company", status: "pending" }),
    });
    expect(invalidFusion.status).toBe(400);

    const packResponse = await fetch(`${baseUrl}/api/knowledge/packs/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ workspace_id: "ws-company", project_id: project.id }),
    });
    const pack = await packResponse.json();
    expect(packResponse.status).toBe(201);
    expect(pack.chunks.length).toBeGreaterThan(0);

    const queryResponse = await fetch(`${baseUrl}/api/knowledge/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ workspace_id: "ws-company", project_id: project.id, pack_id: pack.id, question: "quick tripod" }),
    });
    const queryBody = await queryResponse.json();
    expect(queryResponse.status).toBe(200);
    expect(queryBody.citations.length).toBeGreaterThan(0);

    const draftResponse = await fetch(`${baseUrl}/api/documents/prd/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ workspace_id: "ws-company", project_id: project.id, pack_id: pack.id, product_type_code: "machined_part" }),
    });
    const draft = await draftResponse.json();
    expect(draftResponse.status).toBe(201);
    expect(draft.sections.map((section) => section.key)).toEqual(["product_definition", "structure", "packaging", "open_questions"]);

    const patchResponse = await fetch(`${baseUrl}/api/documents/${draft.document.id}/sections/structure`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ access_policy: { supplier_visible: true } }),
    });
    expect(patchResponse.status).toBe(200);

    const exportResponse = await fetch(`${baseUrl}/api/documents/${draft.document.id}/export/supplier`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const exported = await exportResponse.json();
    expect(exportResponse.status).toBe(200);
    expect(exported.sections.map((section) => section.key)).toEqual(["structure"]);
  });

  it("blocks cross-workspace ids and unauthenticated bot RAG access", async () => {
    const { cookie } = await login();
    const otherUser = repo.ensureLocalUser({
      id: "other-workspace-user",
      email: "other@example.com",
      name: "Other",
      auth_provider: "feishu",
    });
    dbModule.ensureWorkspace({ id: "ws-other", slug: "other", name: "Other Workspace" });
    dbModule.addWorkspaceMember("ws-other", otherUser.id, { role: "member", status: "active", isDefault: true });

    const otherDoc = (await import("./knowledge-repository.js")).createDocument({
      id: "doc-other-workspace",
      workspace_id: "ws-other",
      title: "Other Secret",
      doc_type: "prd",
      owner_user_id: otherUser.id,
      content: {
        normalized_sections: [
          { key: "functional_attributes", title: "功能属性", content: "quick secret" },
        ],
      },
      access_policy: { visibility: "workspace", rag_enabled: true },
    });
    const otherPack = (await import("./knowledge-repository.js")).createKnowledgePack({
      id: "pack-other-workspace",
      workspace_id: "ws-other",
      project_id: "other-project",
      title: "Other Pack",
      pack_type: "project",
    });
    const otherGap = (await import("./knowledge-repository.js")).createKnowledgeGap({
      id: "gap-other-workspace",
      workspace_id: "ws-other",
      project_id: "other-project",
      pack_id: otherPack.id,
      question: "other workspace question",
      reason: "missing_source",
    });
    const otherEntity = (await import("./knowledge-repository.js")).createKnowledgeEntity({
      id: "entity-other-workspace",
      workspace_id: "ws-other",
      project_id: "other-project",
      entity_type: "feature",
      canonical_name: "Other secret feature",
    });
    const otherPolicy = (await import("./governance-service.js")).upsertKnowledgeSourcePolicy({
      id: "ksp-other-workspace",
      workspace_id: "ws-other",
      source_type: "document",
      source_id: otherDoc.id,
      rag_enabled: false,
      bot_enabled: false,
    });
    const otherGraphView = (await import("./graph-service.js")).createGraphView({
      id: "gv-other-workspace",
      workspace_id: "ws-other",
      root_entity_id: otherEntity.id,
      owner_user_id: otherUser.id,
      name: "Other Graph",
    });
    const otherFusion = (await import("./knowledge-repository.js")).createKnowledgeFusionCandidate({
      id: "fusion-other-workspace",
      workspace_id: "ws-other",
      project_id: "other-project",
      candidate_type: "entity",
      action: "review",
      source_entity_ids: [otherEntity.id],
      proposed_entity: {
        canonical_name: otherEntity.canonical_name,
        entity_type: otherEntity.entity_type,
      },
      reason: "other workspace fusion",
    });
    const otherMrd = (await import("./mrd-prd-service.js")).createStructuredDocument("mrd", {
      id: "mrd-other-workspace",
      workspace_id: "ws-other",
      title: "Other MRD",
      created_by: otherUser.id,
    });

    const readOther = await fetch(`${baseUrl}/api/documents/${otherDoc.id}`, {
      headers: { Cookie: cookie },
    });
    const exportOther = await fetch(`${baseUrl}/api/documents/${otherDoc.id}/export/supplier`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const projectsOther = await fetch(`${baseUrl}/api/projects?workspace_id=ws-other`, {
      headers: { Cookie: cookie },
    });
    const botUnauthed = await fetch(`${baseUrl}/api/bot/feishu/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: "ws-company", question: "quick secret" }),
    });
    const draftOtherPack = await fetch(`${baseUrl}/api/documents/prd/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ pack_id: otherPack.id }),
    });
    const syncOtherGap = await fetch(`${baseUrl}/api/knowledge/gaps/${otherGap.id}/sync-feishu`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const graphOtherEntity = await fetch(`${baseUrl}/api/knowledge/entities/${otherEntity.id}/graph?workspace_id=ws-other`, {
      headers: { Cookie: cookie },
    });
    const answerOtherGap = await fetch(`${baseUrl}/api/knowledge-gaps/${otherGap.id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        answer_text: "should not answer",
        evidence_ids: ["ev_missing"],
      }),
    });
    const dismissOtherGap = await fetch(`${baseUrl}/api/knowledge-gaps/${otherGap.id}/dismiss`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const patchOtherPolicy = await fetch(`${baseUrl}/api/knowledge/source-policies/${otherPolicy.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ workspace_id: "ws-company", rag_enabled: true }),
    });
    const patchOtherGraphView = await fetch(`${baseUrl}/api/graph/views/${otherGraphView.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ workspace_id: "ws-company", name: "Leaked Graph" }),
    });
    const acceptOtherFusion = await fetch(`${baseUrl}/api/ontology/fusion-candidates/${otherFusion.id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ workspace_id: "ws-company" }),
    });
    const patchOtherMrdSection = await fetch(`${baseUrl}/api/mrd-sections/${otherMrd.document_id || otherMrd.id}:market_background`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ body_markdown: "should not patch" }),
    });

    expect(readOther.status).toBe(404);
    expect(exportOther.status).toBe(404);
    expect(projectsOther.status).toBe(403);
    expect(botUnauthed.status).toBe(401);
    expect(draftOtherPack.status).toBe(404);
    expect(syncOtherGap.status).toBe(404);
    expect(graphOtherEntity.status).toBe(403);
    expect(answerOtherGap.status).toBe(404);
    expect(dismissOtherGap.status).toBe(404);
    expect(patchOtherPolicy.status).toBe(404);
    expect(patchOtherGraphView.status).toBe(404);
    expect(acceptOtherFusion.status).toBe(404);
    expect(patchOtherMrdSection.status).toBe(404);

    const unchangedGap = (await import("./knowledge-repository.js")).getKnowledgeGap(otherGap.id);
    const unchangedPolicy = (await import("./governance-service.js")).getKnowledgeSourcePolicyById(otherPolicy.id);
    const unchangedGraphView = (await import("./graph-service.js")).getGraphView(otherGraphView.id);
    const unchangedFusion = (await import("./knowledge-repository.js")).getKnowledgeFusionCandidate(otherFusion.id);
    const unchangedMrd = (await import("./mrd-prd-service.js")).getStructuredDocument(otherMrd.id);
    expect(unchangedGap.status).toBe("open");
    expect(unchangedPolicy.rag_enabled).toBe(false);
    expect(unchangedGraphView.name).toBe("Other Graph");
    expect(unchangedFusion.status).toBe("pending");
    expect(unchangedMrd.sections.find((section) => section.id.endsWith(":market_background")).body_markdown).toBe("");
  });

  it("does not trust client-supplied draft chunks without a server-loaded pack", async () => {
    const { cookie } = await login();

    const response = await fetch(`${baseUrl}/api/documents/prd/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        project_id: "client-pack-project",
        pack: {
          id: "client-pack",
          title: "Client Pack",
          chunks: [
            {
              id: "client-secret-chunk",
              title: "Client Secret",
              text: "不应该进入服务端草稿的 quick secret。",
            },
          ],
        },
        chunks: [
          {
            id: "client-raw-chunk",
            title: "Client Raw Secret",
            text: "也不应该进入服务端草稿。",
          },
        ],
        enabled_modules: ["functional_attributes"],
      }),
    });
    const body = await response.json();
    const text = body.document.content_text;

    expect(response.status).toBe(201);
    expect(text).not.toContain("quick secret");
    expect(text).not.toContain("Client Raw Secret");
    expect(body.sections[0].source_refs).toEqual([]);
    expect(body.sections[0].open_questions[0]).toContain("功能属性");
  });
});

describe("admin users", () => {
  async function login(username = process.env.APP_USERNAME, password = process.env.APP_PASSWORD) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const body = await response.json();
    return { response, body, cookie: extractCookie(response.headers) };
  }

  it("blocks non-admin users from the admin API", async () => {
    const { cookie } = await login();
    const response = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(403);
  });

  it("allows the configured owner to manage users and revoke disabled user tokens", async () => {
    process.env.LOOM_OWNER_EMAIL = process.env.APP_USERNAME;
    dbModule.migrate();

    const ownerLogin = await login();
    expect(ownerLogin.body.user.is_owner).toBe(true);

    const created = dbModule.db.prepare(`
      INSERT INTO users (
        id, email, name, initials, role, role_code, status, auth_provider, created_at, updated_at
      ) VALUES (
        'regular-admin-test', 'regular@example.com', 'Regular', 'RE', '成员', 'member', 'active', 'password', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run();
    expect(created.changes).toBe(1);
    dbModule.upsertApiToken("regular-token", "regular-admin-test");

    const listResponse = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Cookie: ownerLogin.cookie },
    });
    const listBody = await listResponse.json();
    expect(listResponse.status).toBe(200);
    expect(listBody.items.some((item) => item.id === "regular-admin-test")).toBe(true);

    const disableResponse = await fetch(`${baseUrl}/api/admin/users/regular-admin-test`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerLogin.cookie },
      body: JSON.stringify({ status: "suspended" }),
    });
    expect(disableResponse.status).toBe(200);

    const tokenResponse = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: "Bearer regular-token" },
    });
    expect(tokenResponse.status).toBe(401);

    const originalUsername = process.env.APP_USERNAME;
    try {
      process.env.APP_USERNAME = "regular@example.com";
      const disabledLogin = await login("regular@example.com", process.env.APP_PASSWORD);
      expect(disabledLogin.response.status).toBe(403);
    } finally {
      process.env.APP_USERNAME = originalUsername;
    }
  });

  it("protects the last active owner from demotion", async () => {
    process.env.LOOM_OWNER_EMAIL = process.env.APP_USERNAME;
    dbModule.migrate();
    const { cookie, body } = await login();

    const response = await fetch(`${baseUrl}/api/admin/users/${body.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ role_code: "member" }),
    });

    expect(response.status).toBe(409);
  });

  it("allows secondary password accounts from private config", async () => {
    process.env.APP_PASSWORD_ACCOUNTS = "collins:0719";

    const loginResult = await login("collins", "0719");

    expect(loginResult.response.status).toBe(200);
    expect(loginResult.body.user.name).toBe("collins");
    expect(loginResult.body.user.role_code).toBe("member");
  });

  it("exposes the default workspace in bootstrap", async () => {
    process.env.APP_PASSWORD_ACCOUNTS = "collins:0719";
    dbModule.ensureWorkspace({ name: "Collins' workplace", slug: "collins-workplace", type: "small_team" });
    dbModule.addWorkspaceMember("ws-collins-workplace", "password-collins", { role: "member", isDefault: true });

    const loginResult = await login("collins", "0719");
    const bootstrapResponse = await fetch(`${baseUrl}/api/bootstrap`, {
      headers: { Cookie: loginResult.cookie },
    });
    const body = await bootstrapResponse.json();

    expect(bootstrapResponse.status).toBe(200);
    expect(body.workspace).toMatchObject({ slug: "collins-workplace", name: "Collins' workplace" });
    expect(body.workspaces).toHaveLength(1);
  });

  it("keeps password users unassigned until admin assigns a workspace", async () => {
    process.env.LOOM_OWNER_EMAIL = process.env.APP_USERNAME;
    dbModule.migrate();
    const ownerLogin = await login();

    dbModule.db.prepare(`
      INSERT INTO users (
        id, email, name, initials, role, role_code, status, auth_provider, created_at, updated_at
      ) VALUES (
        'manual-user-test', 'manual@example.com', 'Manual', 'MA', '成员', 'member', 'active', 'password', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run();

    const dashboardResponse = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { Cookie: ownerLogin.cookie },
    });
    const dashboardBody = await dashboardResponse.json();
    expect(dashboardResponse.status).toBe(200);
    expect(dashboardBody.totals.unassigned_users).toBeGreaterThanOrEqual(1);
    expect(dashboardBody.unassigned_users.some((user) => user.id === "manual-user-test")).toBe(true);

    const createWorkspaceResponse = await fetch(`${baseUrl}/api/admin/workspaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerLogin.cookie },
      body: JSON.stringify({ name: "Collins' workplace", slug: "collins-workplace", type: "small_team" }),
    });
    const workspace = await createWorkspaceResponse.json();
    expect(createWorkspaceResponse.status).toBe(201);
    expect(workspace.slug).toBe("collins-workplace");

    const assignResponse = await fetch(`${baseUrl}/api/admin/users/manual-user-test/workspaces/collins-workplace`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerLogin.cookie },
      body: JSON.stringify({ role: "member" }),
    });
    const assigned = await assignResponse.json();
    expect(assignResponse.status).toBe(200);
    expect(assigned.workspaces.some((item) => item.slug === "collins-workplace")).toBe(true);
  });

  it("auto-assigns Feishu users to the configured company workspace", async () => {
    const { ensureLocalUser } = await import("./repository.js");
    ensureLocalUser({
      id: "feishu-user-test",
      email: "feishu@example.com",
      name: "Feishu User",
      auth_provider: "feishu",
      feishu_open_id: "ou_test",
    });

    const member = dbModule.db.prepare(`
      SELECT w.slug, wm.role, wm.is_default
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = ?
    `).get("feishu-user-test");

    expect(member.slug).toBe("company");
    expect(member.role).toBe("member");
    expect(member.is_default).toBe(1);
  });

  it("assigns the configured password owner as company workspace admin", async () => {
    process.env.LOOM_OWNER_EMAIL = process.env.APP_USERNAME;
    dbModule.migrate();
    const ownerLogin = await login();
    expect(ownerLogin.body.user.is_owner).toBe(true);

    const member = dbModule.db.prepare(`
      SELECT w.slug, wm.role, wm.is_default
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = ?
    `).get(ownerLogin.body.user.id);

    expect(member.slug).toBe("company");
    expect(member.role).toBe("admin");
    expect(member.is_default).toBe(1);
  });

  it("exposes LLM observability summary and logs to admins", async () => {
    process.env.LOOM_OWNER_EMAIL = process.env.APP_USERNAME;
    dbModule.migrate();
    const ownerLogin = await login();

    dbModule.db.prepare(`
      INSERT INTO llm_call_logs (
        id, user_id, workspace_id, kind, purpose, model, api_url, status,
        http_status, duration_ms, total_tokens, created_at
      ) VALUES (
        'llm-log-test', ?, NULL, 'text', 'products:parse_raw', 'm', 'https://llm.test/v1', 'ok',
        200, 123, 45, CURRENT_TIMESTAMP
      )
    `).run(ownerLogin.body.user.id);

    const summaryResponse = await fetch(`${baseUrl}/api/admin/observability/llm/summary`, {
      headers: { Cookie: ownerLogin.cookie },
    });
    const summary = await summaryResponse.json();
    expect(summaryResponse.status).toBe(200);
    expect(summary.total.calls).toBeGreaterThanOrEqual(1);
    expect(summary.by_purpose.some((item) => item.purpose === "products:parse_raw")).toBe(true);

    const logsResponse = await fetch(`${baseUrl}/api/admin/observability/llm/logs`, {
      headers: { Cookie: ownerLogin.cookie },
    });
    const logs = await logsResponse.json();
    expect(logsResponse.status).toBe(200);
    expect(logs.items.some((item) => item.id === "llm-log-test")).toBe(true);
  });
});

describe("feed hub", () => {
  async function login() {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: process.env.APP_USERNAME,
        password: process.env.APP_PASSWORD,
      }),
    });
    return { cookie: extractCookie(response.headers), body: await response.json() };
  }

  it("exposes feed hub bootstrap and public opml/rss urls", async () => {
    const { cookie } = await login();
    const sourceResponse = await fetch(`${baseUrl}/api/news-sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        name: "Sony Feed",
        url: "https://example.com/sony.xml",
        group: "custom",
      }),
    });
    const source = await sourceResponse.json();

    const groupResponse = await fetch(`${baseUrl}/api/feed-hub/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "Photography Brands", slug: "photography-brands" }),
    });
    const group = await groupResponse.json();

    const assignResponse = await fetch(`${baseUrl}/api/feed-hub/groups/${group.id}/sources/${source.id}`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(assignResponse.status).toBe(201);

    dbModule.db.prepare(`
      INSERT INTO news_items (
        id, user_id, source_id, source_name, original_title, original_url, title_zh, summary_zh, content_zh, type,
        is_kept, is_read, is_starred, published_at, llm_processed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "hub-news-1",
      "password-tester-example-com",
      source.id,
      source.name,
      "Sony launches Alpha",
      "https://example.com/sony-launch",
      "索尼发布 Alpha",
      "新品摘要",
      "新品正文",
      "新品发布",
      1,
      0,
      0,
      "2026-05-16T00:00:00.000Z",
      1,
      "2026-05-16T00:00:00.000Z",
      "2026-05-16T00:00:00.000Z",
    );

    const bootstrapResponse = await fetch(`${baseUrl}/api/feed-hub/bootstrap`, {
      headers: { Cookie: cookie },
    });
    const bootstrap = await bootstrapResponse.json();
    expect(bootstrapResponse.status).toBe(200);
    expect(bootstrap.feed_token).toBeTruthy();
    expect(bootstrap.public_urls.opml).toContain("/api/feed-hub/public/opml.xml?token=");

    const publicOpml = await fetch(bootstrap.public_urls.opml);
    expect(publicOpml.status).toBe(200);
    expect(await publicOpml.text()).toContain("photography-brands.xml");

    const groupFeedResponse = await fetch(`${baseUrl}/api/feed-hub/public/groups/photography-brands.xml?token=${bootstrap.feed_token}`);
    expect(groupFeedResponse.status).toBe(200);
    expect(await groupFeedResponse.text()).toContain("索尼发布 Alpha");
  });

  it("auto-populates default feed hub groups from source semantics", async () => {
    const { cookie } = await login();

    const customResponse = await fetch(`${baseUrl}/api/news-sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        name: "Sony Feed",
        url: "https://example.com/sony.xml",
        group: "custom",
      }),
    });
    expect(customResponse.status).toBe(201);

    repo.importWechatExporterAccounts("password-tester-example-com", {
      usefor: "wechat-article-exporter",
      accounts: [
        { fakeid: "MzA3", nickname: "SmallRig斯莫格" },
      ],
    }, {
      interval: 1440,
      rsshubBaseUrl: "https://rss.example.com",
      maxPerSource: 12,
    });

    const bootstrapResponse = await fetch(`${baseUrl}/api/feed-hub/bootstrap`, {
      headers: { Cookie: cookie },
    });
    const bootstrap = await bootstrapResponse.json();

    expect(bootstrapResponse.status).toBe(200);
    const allGroup = bootstrap.groups.find((group) => group.slug === "all-sources");
    const wechatGroup = bootstrap.groups.find((group) => group.slug === "wechat");
    const customGroup = bootstrap.groups.find((group) => group.slug === "custom");

    expect(allGroup?.sources.map((source) => source.name)).toEqual(expect.arrayContaining(["Sony Feed", "SmallRig斯莫格"]));
    expect(wechatGroup?.sources.map((source) => source.name)).toEqual(["SmallRig斯莫格"]);
    expect(customGroup?.sources.map((source) => source.name)).toEqual(["Sony Feed"]);
    expect(bootstrap.ungrouped_sources).toEqual([]);
  });
});

describe("scheduler timezones", () => {
  it("uses Beijing time for fixed WeChat collection hours", () => {
    expect(zonedDateHour("Asia/Shanghai", new Date("2026-05-14T01:00:00.000Z"))).toEqual({
      date: "2026-05-14",
      hour: 9,
    });
    expect(zonedDateHour("Asia/Shanghai", new Date("2026-05-14T13:00:00.000Z"))).toEqual({
      date: "2026-05-14",
      hour: 21,
    });
  });
});
