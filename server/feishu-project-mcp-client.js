import { rawState, updateSettings } from "./repository.js";

export const FEISHU_PROJECT_MCP_DEFAULT_URL = "https://project.feishu.cn/mcp_server/v1";

export class FeishuProjectMcpError extends Error {
  constructor(message, { code = "feishu_project_mcp_error", status, data } = {}) {
    super(message);
    this.name = "FeishuProjectMcpError";
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

function cleanText(value) {
  return String(value || "").trim();
}

function jsonRpcRequest(method, params) {
  return {
    jsonrpc: "2.0",
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    method,
    ...(params === undefined ? {} : { params }),
  };
}

export function parseMcpResponseText(text) {
  const raw = cleanText(text);
  if (!raw) return null;
  if (!raw.includes("\n") && raw.startsWith("{")) return JSON.parse(raw);

  const dataLines = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    dataLines.push(data);
  }
  if (!dataLines.length) return JSON.parse(raw);

  let parsed = null;
  for (const data of dataLines) {
    parsed = JSON.parse(data);
    if (parsed?.result !== undefined || parsed?.error) return parsed;
  }
  return parsed;
}

function assertOkJsonRpc(payload) {
  if (payload?.error) {
    const message = payload.error.message || "飞书项目 MCP 调用失败";
    throw new FeishuProjectMcpError(message, {
      code: "feishu_project_mcp_rpc_error",
      data: payload.error,
    });
  }
  return payload?.result ?? payload;
}

function summarizeToolNames(tools = []) {
  return tools.map((tool) => tool?.name || tool?.tool_name || "").filter(Boolean);
}

function findTypeByName(types = [], pattern) {
  return types.some((item) => pattern.test(String(item?.name || item?.work_item_type_name || item?.type_name || "")));
}

function extractWorkItemTypes(result) {
  const candidates = [
    result?.work_item_types,
    result?.workItemTypes,
    result?.data?.work_item_types,
    result?.data?.workItemTypes,
    result?.items,
    result?.data?.items,
    Array.isArray(result) ? result : null,
  ].filter(Array.isArray);
  return candidates[0] || [];
}

function extractProjectSummary(result) {
  const source = result?.project || result?.data?.project || result?.data || result || {};
  if (!source || typeof source !== "object") return null;
  return {
    key: source.project_key || source.projectKey || source.key || "",
    name: source.name || source.project_name || source.projectName || "",
  };
}

export function getFeishuProjectMcpSettings(userId) {
  const settings = rawState(userId)?.settings || {};
  return {
    url: cleanText(settings.feishu_mcp_url) || FEISHU_PROJECT_MCP_DEFAULT_URL,
    token: cleanText(settings.feishu_mcp_token),
    projectKey: cleanText(settings.feishu_mcp_project_key),
  };
}

export class FeishuProjectMcpClient {
  constructor({ url = FEISHU_PROJECT_MCP_DEFAULT_URL, token, fetchImpl = fetch } = {}) {
    this.url = cleanText(url) || FEISHU_PROJECT_MCP_DEFAULT_URL;
    this.token = cleanText(token);
    this.fetchImpl = fetchImpl;
  }

  async request(method, params) {
    if (!this.token) {
      throw new FeishuProjectMcpError("请先填写飞书项目 MCP Token。", { code: "missing_feishu_project_mcp_token" });
    }
    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "X-Mcp-Token": this.token,
      },
      body: JSON.stringify(jsonRpcRequest(method, params)),
    });
    const text = await response.text();
    const payload = parseMcpResponseText(text);
    if (!response.ok) {
      throw new FeishuProjectMcpError(`飞书项目 MCP HTTP ${response.status}`, {
        code: "feishu_project_mcp_http_error",
        status: response.status,
        data: payload,
      });
    }
    return assertOkJsonRpc(payload);
  }

  initialize() {
    return this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "Loom", version: "0.1.0" },
    });
  }

  listTools() {
    return this.request("tools/list");
  }

  callTool(name, args = {}) {
    return this.request("tools/call", { name, arguments: args });
  }
}

export async function testFeishuProjectMcpForUser(userId, { fetchImpl } = {}) {
  const settings = getFeishuProjectMcpSettings(userId);
  if (!settings.token) {
    throw new FeishuProjectMcpError("请先填写飞书项目 MCP Token。", { code: "missing_feishu_project_mcp_token" });
  }
  const client = new FeishuProjectMcpClient({
    url: settings.url,
    token: settings.token,
    ...(fetchImpl ? { fetchImpl } : {}),
  });

  const initResult = await client.initialize();
  const toolsResult = await client.listTools();
  const tools = toolsResult?.tools || toolsResult?.data?.tools || [];
  const toolNames = summarizeToolNames(tools);
  let project = settings.projectKey ? { key: settings.projectKey, name: "" } : null;
  let workItemTypes = [];

  if (toolNames.includes("search_project_info")) {
    try {
      const projectResult = await client.callTool("search_project_info", settings.projectKey ? { project_key: settings.projectKey } : {});
      project = extractProjectSummary(projectResult) || project;
    } catch (error) {
      if (settings.projectKey) throw error;
    }
  }
  if (settings.projectKey && toolNames.includes("list_workitem_types")) {
    const typeResult = await client.callTool("list_workitem_types", { project_key: settings.projectKey });
    workItemTypes = extractWorkItemTypes(typeResult);
  }

  const summary = {
    connected: true,
    serverInfo: initResult?.serverInfo || initResult?.server_info || null,
    project,
    workItemTypeCount: workItemTypes.length,
    ideaTypeFound: findTypeByName(workItemTypes, /产品想法登记/),
    projectTypeFound: findTypeByName(workItemTypes, /产品立项/),
    programTypeFound: findTypeByName(workItemTypes, /项目集/),
  };
  updateSettings(userId, { last_feishu_project_mcp_test_at: new Date().toISOString() });
  return summary;
}
