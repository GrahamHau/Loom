import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_PATH = ":memory:";

const dbModule = await import("./db.js");
const repo = await import("./repository.js");
const {
  FeishuProjectMcpClient,
  parseMcpResponseText,
  syncFeishuProjectMcpForUser,
  testFeishuProjectMcpForUser,
} = await import("./feishu-project-mcp-client.js");

beforeEach(() => {
  dbModule.migrate();
  dbModule.db.prepare("DELETE FROM app_data").run();
  dbModule.ensureSeed({
    user: { name: "Graham", role: "管理员", initials: "GR" },
    settings: {},
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function okText(text) {
  return {
    ok: true,
    status: 200,
    text: async () => text,
  };
}

describe("parseMcpResponseText", () => {
  it("parses regular JSON-RPC responses", () => {
    const parsed = parseMcpResponseText(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }));
    expect(parsed.result.ok).toBe(true);
  });

  it("parses text/event-stream data payloads", () => {
    const parsed = parseMcpResponseText([
      "event: message",
      'data: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"tools/list"}]}}',
      "",
    ].join("\n"));
    expect(parsed.result.tools[0].name).toBe("tools/list");
  });
});

describe("FeishuProjectMcpClient", () => {
  it("sends JSON-RPC with the X-Mcp-Token header", async () => {
    const fetchImpl = vi.fn(async () => okText(JSON.stringify({ result: { serverInfo: { name: "Meego" } } })));
    const client = new FeishuProjectMcpClient({ url: "https://project.feishu.cn/mcp_server/v1", token: "secret-token", fetchImpl });

    await expect(client.initialize()).resolves.toMatchObject({ serverInfo: { name: "Meego" } });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [_url, options] = fetchImpl.mock.calls[0];
    expect(options.headers["X-Mcp-Token"]).toBe("secret-token");
    expect(JSON.parse(options.body).method).toBe("initialize");
  });

  it("rejects missing token before sending the request", async () => {
    const fetchImpl = vi.fn();
    const client = new FeishuProjectMcpClient({ token: "", fetchImpl });

    await expect(client.listTools()).rejects.toMatchObject({ code: "missing_feishu_project_mcp_token" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces tool call errors without including the token", async () => {
    const fetchImpl = vi.fn(async () => okText(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32602, message: "invalid project_key" },
    })));
    const client = new FeishuProjectMcpClient({ token: "secret-token", fetchImpl });

    await expect(client.callTool("list_workitem_types", { project_key: "bad" })).rejects.toMatchObject({
      code: "feishu_project_mcp_rpc_error",
      message: "invalid project_key",
    });
    await expect(client.callTool("list_workitem_types", { project_key: "bad" })).rejects.not.toThrow("secret-token");
  });
});

describe("testFeishuProjectMcpForUser", () => {
  it("returns a safe connection summary and updates test timestamp", async () => {
    const userId = dbModule.getLegacyUserId();
    repo.updateSettings(userId, {
      feishu_mcp_token: "secret-token",
      feishu_mcp_project_key: "project-1",
    });
    const fetchImpl = vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.method === "initialize") return okText(JSON.stringify({ result: { serverInfo: { name: "Meego MCP Server", version: "1.0.0" } } }));
      if (body.method === "tools/list") return okText(JSON.stringify({ result: { tools: [{ name: "search_project_info" }, { name: "list_workitem_types" }] } }));
      if (body.params.name === "search_project_info") return okText(JSON.stringify({ result: { project: { project_key: "project-1", name: "产研中心产品开发流程" } } }));
      return okText(JSON.stringify({
        result: {
          work_item_types: [
            { key: "idea-type", name: "产品想法登记" },
            { key: "project-type", name: "产品立项流程" },
            { key: "program-type", name: "项目集流程" },
          ],
        },
      }));
    });

    const summary = await testFeishuProjectMcpForUser(userId, { fetchImpl });

    expect(summary).toMatchObject({
      connected: true,
      workItemTypeCount: 3,
      ideaTypeFound: true,
      projectTypeFound: true,
      programTypeFound: true,
    });
    expect(JSON.stringify(summary)).not.toContain("secret-token");
    expect(repo.rawState(userId).settings.last_feishu_project_mcp_test_at).toBeTruthy();
    expect(repo.rawState(userId).settings.feishu_project_idea_type_key).toBeTruthy();
  });
});

describe("syncFeishuProjectMcpForUser", () => {
  it("mirrors project work items and field values through flexible MCP tools", async () => {
    const user = repo.ensureLocalUser({ id: "mcp-sync-user", name: "MCP Sync", role_code: "admin", auth_provider: "password", withDefaultWorkspace: true });
    const userId = user.id;
    const workspaceId = repo.ensureDefaultWorkspaceForUser(user, { autoAssign: true }).workspace_id;
    repo.updateSettings(userId, {
      feishu_mcp_token: "secret-token",
      feishu_mcp_project_key: "project-1",
      feishu_mcp_project_name: "产研中心产品开发流程",
    });
    const fetchImpl = vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.method === "initialize") return okText(JSON.stringify({ result: { serverInfo: { name: "Meego MCP Server" } } }));
      if (body.method === "tools/list") {
        return okText(JSON.stringify({ result: { tools: [
          { name: "list_workitem_types" },
          { name: "list_workitem_field_config" },
          { name: "list_workitems" },
          { name: "get_workitem_brief" },
        ] } }));
      }
      if (body.params.name === "list_workitem_types") {
        return okText(JSON.stringify({ result: { work_item_types: [
          { key: "idea-type", name: "产品想法登记" },
          { key: "project-type", name: "产品立项流程" },
        ] } }));
      }
      if (body.params.name === "list_workitem_field_config") {
        return okText(JSON.stringify({ result: { fields: [
          { field_key: "field_363968", field_name: "想法概述", field_type: "text" },
        ] } }));
      }
      if (body.params.name === "list_workitems") {
        return okText(JSON.stringify({ result: { items: [
          {
            id: "wi-1",
            name: "智能相机电池仓",
            work_item_type_key: body.params.arguments.work_item_type_key,
            work_item_type_name: "产品想法登记",
            current_node: { id: "node-1", name: "想法登记", owners: [{ user_key: "u1", name: "Graham" }] },
            fields: [{ field_key: "field_363968", value: "客户希望电池仓更易拆装" }],
          },
        ] } }));
      }
      if (body.params.name === "get_workitem_brief") {
        return okText(JSON.stringify({ result: { work_item: {
          id: "wi-1",
          name: "智能相机电池仓",
          work_item_type_key: "idea-type",
          work_item_type_name: "产品想法登记",
          status: { key: "reviewing", name: "评审中" },
          work_item_current_node: { node_key: "node-1", node_name: "想法登记", owners: [{ user_key: "u1", name: "Graham" }] },
          fields: [{ field_key: "field_363968", value: "客户希望电池仓更易拆装" }],
          updated_at: "2026-05-27T09:00:00.000Z",
        } } }));
      }
      return okText(JSON.stringify({ result: {} }));
    });

    const result = await syncFeishuProjectMcpForUser(userId, { workspaceId, fetchImpl, limit: 10 });

    expect(result.synced.items).toBeGreaterThan(0);
    const items = repo.listFeishuProjectItems({ workspace_id: workspaceId, project_key: "project-1", limit: 10 });
    expect(items[0]).toMatchObject({
      work_item_id: "wi-1",
      name: "智能相机电池仓",
      current_node_name: "想法登记",
    });
    expect(items[0].fields.field_363968.text).toContain("电池仓");
    expect(repo.rawState(userId).settings.last_feishu_project_mcp_sync_at).toBeTruthy();
  });
});
