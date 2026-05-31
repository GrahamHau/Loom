import {
  listFeishuProjectItems,
  rawState,
  updateSettings,
  upsertFeishuProjectFieldConfig,
  upsertFeishuProjectItem,
  upsertFeishuProjectItemField,
} from "./repository.js";

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
  return types.find((item) => pattern.test(String(item?.name || item?.work_item_type_name || item?.type_name || ""))) || null;
}

function extractWorkItemTypes(result) {
  const parsed = parseToolContent(result);
  const candidates = [
    parsed?.list,
    parsed?.data?.list,
    parsed?.result?.list,
    result?.work_item_types,
    result?.workItemTypes,
    result?.data?.work_item_types,
    result?.data?.workItemTypes,
    result?.items,
    result?.data?.items,
    parsed?.items,
    parsed?.data?.items,
    Array.isArray(result) ? result : null,
  ].filter(Array.isArray);
  return candidates[0] || [];
}

function extractProjectSummary(result) {
  const parsed = parseToolContent(result);
  const source = [
    parsed?.project,
    parsed?.data?.project,
    parsed?.result?.project,
    parsed?.project_info,
    parsed?.data?.project_info,
    parsed?.result?.project_info,
    Array.isArray(parsed?.projects) ? parsed.projects[0] : null,
    Array.isArray(parsed?.project_infos) ? parsed.project_infos[0] : null,
    Array.isArray(parsed?.items) ? parsed.items[0] : null,
    Array.isArray(parsed?.data?.items) ? parsed.data.items[0] : null,
    Array.isArray(parsed?.data?.projects) ? parsed.data.projects[0] : null,
    Array.isArray(parsed?.data?.project_infos) ? parsed.data.project_infos[0] : null,
    parsed?.data,
    parsed,
  ].find((item) => item && typeof item === "object") || {};
  if (!source || typeof source !== "object") return null;
  return {
    key: source.project_key || source.projectKey || source.key || "",
    name: source.name || source.project_name || source.projectName || "",
  };
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeJsonParse(value, fallback = null) {
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseToolContent(result) {
  const content = result?.content || result?.data?.content;
  if (!Array.isArray(content)) return result;
  const texts = content
    .map((item) => item?.text || item?.content || "")
    .map(cleanText)
    .filter(Boolean);
  if (!texts.length) return result;
  for (const text of texts) {
    const parsed = safeJsonParse(text, null);
    if (parsed !== null) return parsed;
  }
  return { text: texts.join("\n") };
}

function nestedCandidates(result, keys) {
  const parsed = parseToolContent(result);
  return [
    parsed,
    parsed?.data,
    parsed?.result,
    parsed?.result?.data,
    parsed?.workitems,
    parsed?.work_items,
    parsed?.workItems,
    parsed?.items,
    parsed?.list,
    parsed?.records,
    parsed?.data?.workitems,
    parsed?.data?.work_items,
    parsed?.data?.workItems,
    parsed?.data?.items,
    parsed?.data?.list,
    parsed?.data?.records,
    parsed?.result?.workitems,
    parsed?.result?.work_items,
    parsed?.result?.workItems,
    parsed?.result?.items,
    parsed?.result?.list,
    parsed?.result?.records,
    ...keys.map((key) => parsed?.[key] || parsed?.data?.[key] || parsed?.result?.[key]),
  ];
}

function extractWorkItems(result) {
  return nestedCandidates(result, ["work_item_list", "workItemList", "work_item_briefs", "workItemBriefs"])
    .find(Array.isArray) || [];
}

function extractMqlRows(result) {
  const parsed = parseToolContent(result);
  const data = parsed?.data;
  if (!data || typeof data !== "object") return [];
  return Object.values(data).flatMap((group) => Array.isArray(group) ? group : []);
}

function extractFieldConfigs(result) {
  return nestedCandidates(result, ["fields", "field_configs", "fieldConfigList", "work_item_fields", "workItemFields"])
    .find(Array.isArray) || [];
}

function normalizeUserList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.owners)) return value.owners;
  if (Array.isArray(value.members)) return value.members;
  if (Array.isArray(value.users)) return value.users;
  return [value].filter(Boolean);
}

function normalizeFieldValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFieldValue(item)).filter(Boolean).join("、");
  }
  return firstText(value.label, value.name, value.value, value.text, value.display_value, value.displayValue, value.key) || JSON.stringify(value);
}

function normalizeFieldConfig(raw = {}, type = {}) {
  const key = firstText(raw.field_key, raw.fieldKey, raw.key, raw.id);
  if (!key) return null;
  return {
    work_item_type_key: firstText(raw.work_item_type_key, raw.workItemTypeKey, type.key, type.work_item_type_key),
    field_key: key,
    field_name: firstText(raw.field_name, raw.fieldName, raw.name, raw.label, key),
    field_type: firstText(raw.field_type, raw.fieldType, raw.type),
    options: raw.options || raw.options_json || raw.option_list || raw.optionsList || [],
    field_desc: firstText(raw.field_desc, raw.fieldDesc, raw.description, raw.desc),
    raw,
  };
}

function normalizeItemField(raw = {}, fieldConfigsByKey = new Map()) {
  const key = firstText(raw.field_key, raw.fieldKey, raw.key, raw.id);
  if (!key) return null;
  const config = fieldConfigsByKey.get(key) || {};
  const value = raw.value ?? raw.value_json ?? raw.field_value ?? raw.fieldValue ?? raw.display_value ?? raw.displayValue ?? raw.text ?? "";
  return {
    field_key: key,
    field_name: firstText(raw.field_name, raw.fieldName, raw.name, raw.label, config.field_name, key),
    field_type: firstText(raw.field_type, raw.fieldType, raw.type, config.field_type),
    value,
    value_text: firstText(raw.value_text, raw.valueText, raw.display_value, raw.displayValue, normalizeFieldValue(value)),
  };
}

function collectRawFields(raw = {}) {
  const candidates = [
    raw.fields,
    raw.field_values,
    raw.fieldValues,
    raw.work_item_fields,
    raw.workItemFields,
    raw.custom_fields,
    raw.customFields,
    raw.detail?.fields,
    raw.work_item_detail?.fields,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") {
      return Object.entries(candidate).map(([key, value]) => ({
        field_key: key,
        ...(value && typeof value === "object" && !Array.isArray(value) ? value : { value }),
      }));
    }
  }
  return [];
}

function normalizeMqlFieldValue(value = {}) {
  if (value.string_value !== undefined) return String(value.string_value || "").trim();
  if (value.long_value !== undefined) return String(value.long_value || "").trim();
  if (value.double_value !== undefined) return String(value.double_value || "").trim();
  if (value.key_label_value?.label !== undefined) return String(value.key_label_value.label || "").trim();
  if (Array.isArray(value.key_label_value_list)) {
    return value.key_label_value_list.map((item) => item?.label).filter(Boolean).join("、");
  }
  if (value.user_value?.name_cn !== undefined) return String(value.user_value.name_cn || "").trim();
  return "";
}

function normalizeMqlRow(raw = {}, { projectKey = "", type = {} } = {}) {
  const fields = Array.isArray(raw.moql_field_list) ? raw.moql_field_list : [];
  const fieldMap = new Map(fields.map((field) => [field.key, normalizeMqlFieldValue(field.value || {})]));
  const workItemId = firstText(fieldMap.get("work_item_id"), raw.work_item_id, raw.id);
  const name = firstText(fieldMap.get("name"), raw.name, raw.title);
  const typeKeyValue = typeKey(type);
  if (!workItemId || !typeKeyValue) return null;
  return {
    project_key: projectKey,
    work_item_id: workItemId,
    work_item_type_key: typeKeyValue,
    work_item_type_name: typeName(type),
    name,
    raw,
  };
}

function buildIdeaMql(projectName, typeNameValue, limit) {
  const safeProject = String(projectName || "").replace(/`/g, "");
  const safeType = String(typeNameValue || "").replace(/`/g, "");
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  return [
    "SELECT `work_item_id`,`name`",
    `FROM \`${safeProject}\`.\`${safeType}\``,
    `LIMIT ${safeLimit}`,
  ].join(" ");
}

function normalizeWorkItem(raw = {}, { projectKey = "", type = {}, fieldConfigsByKey = new Map() } = {}) {
  const currentNode = raw.work_item_current_node || raw.current_node || raw.currentNode || raw.node || {};
  const status = raw.status || raw.state || raw.status_info || raw.state_info || {};
  const typeKey = firstText(
    raw.work_item_type_key,
    raw.workItemTypeKey,
    raw.type_key,
    raw.typeKey,
    raw.work_item_type?.key,
    raw.workItemType?.key,
    type.key,
    type.work_item_type_key
  );
  const workItemId = firstText(raw.work_item_id, raw.workItemId, raw.id, raw.id_str, raw.key);
  if (!workItemId || !typeKey) return null;
  const fields = collectRawFields(raw).map((field) => normalizeItemField(field, fieldConfigsByKey)).filter(Boolean);
  return {
    project_key: firstText(raw.project_key, raw.projectKey, projectKey),
    work_item_id: workItemId,
    work_item_type_key: typeKey,
    work_item_type_name: firstText(raw.work_item_type_name, raw.workItemTypeName, raw.type_name, raw.typeName, raw.work_item_type?.name, raw.workItemType?.name, type.name, type.work_item_type_name),
    name: firstText(raw.name, raw.title, raw.work_item_name, raw.workItemName, raw.summary),
    status_key: firstText(raw.status_key, raw.statusKey, status.key, status.id, raw.state_key, raw.stateKey),
    status_name: firstText(raw.status_name, raw.statusName, status.name, status.label, raw.state_name, raw.stateName),
    current_node_key: firstText(raw.current_node_key, raw.currentNodeKey, currentNode.node_key, currentNode.nodeKey, currentNode.id, currentNode.key),
    current_node_name: firstText(raw.current_node_name, raw.currentNodeName, currentNode.node_name, currentNode.nodeName, currentNode.name),
    current_owners: normalizeUserList(raw.current_owners || raw.currentOwners || currentNode.owners || currentNode.owner),
    role_members: raw.role_members || raw.roleMembers || raw.roles || raw.role_assignees || [],
    created_by: raw.created_by || raw.createdBy || raw.creator || raw.created_user || {},
    updated_by: raw.updated_by || raw.updatedBy || raw.updater || raw.updated_user || {},
    created_at: firstText(raw.created_at, raw.createdAt, raw.create_time, raw.created_time, raw.createdTime),
    updated_at: firstText(raw.updated_at, raw.updatedAt, raw.update_time, raw.updated_time, raw.updatedTime),
    source_url: firstText(raw.source_url, raw.sourceUrl, raw.url, raw.link),
    raw,
    fields,
  };
}

export function getFeishuProjectMcpSettings(userId) {
  const settings = rawState(userId)?.settings || {};
  return {
    url: cleanText(settings.feishu_mcp_url) || FEISHU_PROJECT_MCP_DEFAULT_URL,
    token: cleanText(settings.feishu_mcp_token),
    projectKey: cleanText(settings.feishu_mcp_project_key || settings.feishu_project_default_project_key),
    projectName: cleanText(settings.feishu_mcp_project_name || settings.feishu_project_default_project_name),
    ideaTypeKey: cleanText(settings.feishu_project_idea_type_key),
  };
}

function chooseTool(toolNames, candidates) {
  return candidates.find((name) => toolNames.includes(name)) || "";
}

async function maybeCallTool(client, toolNames, candidates, args = {}) {
  const tool = chooseTool(toolNames, candidates);
  if (!tool) return { tool: "", result: null };
  return { tool, result: await client.callTool(tool, args) };
}

function typeKey(type = {}) {
  return firstText(type.key, type.work_item_type_key, type.workItemTypeKey, type.type_key, type.typeKey, type.id);
}

function typeName(type = {}) {
  return firstText(type.name, type.work_item_type_name, type.workItemTypeName, type.type_name, type.typeName);
}

function candidateTypes(types = [], settings = {}) {
  const preferred = [];
  const configured = settings.ideaTypeKey ? types.find((type) => typeKey(type) === settings.ideaTypeKey) : null;
  if (configured) preferred.push(configured);
  for (const pattern of [/产品想法登记/, /产品立项/, /项目集/]) {
    const match = types.find((type) => !preferred.includes(type) && pattern.test(typeName(type)));
    if (match) preferred.push(match);
  }
  return preferred.length ? preferred : types.slice(0, 3);
}

function listArgs({ projectKey, type, limit, pageToken = "" }) {
  const workItemTypeKey = typeKey(type);
  return {
    project_key: projectKey,
    work_item_type_key: workItemTypeKey,
    work_item_type_keys: workItemTypeKey ? [workItemTypeKey] : undefined,
    type_key: workItemTypeKey,
    fields: "_all",
    page_size: Math.min(Math.max(Number(limit) || 50, 1), 100),
    limit: Math.min(Math.max(Number(limit) || 50, 1), 100),
    ...(pageToken ? { page_token: pageToken } : {}),
  };
}

async function enrichItemFromBrief(client, toolNames, item, { projectKey, fieldConfigsByKey }) {
  const tool = chooseTool(toolNames, ["get_workitem_brief", "get_work_item_brief", "get_workitem_detail", "get_work_item_detail"]);
  if (!tool || !item?.work_item_id) return item;
  try {
    const result = await client.callTool(tool, {
      project_key: projectKey,
      work_item_id: item.work_item_id,
      fields: "_all",
    });
    const parsed = parseToolContent(result);
    const detail = parsed?.work_item || parsed?.workitem || parsed?.item || parsed?.data || parsed?.result || parsed;
    const normalized = normalizeWorkItem(
      { ...(item.raw || {}), ...(detail || {}) },
      { projectKey, type: item, fieldConfigsByKey }
    );
    return normalized || item;
  } catch {
    return item;
  }
}

async function syncFieldConfigs({ client, toolNames, workspaceId, projectKey, type }) {
  const typeKeyValue = typeKey(type);
  if (!typeKeyValue) return { fieldConfigsByKey: new Map(), count: 0 };
  const { result } = await maybeCallTool(client, toolNames, [
    "list_workitem_field_config",
    "list_work_item_field_config",
    "list_workitem_fields",
    "list_work_item_fields",
  ], {
    project_key: projectKey,
    work_item_type_key: typeKeyValue,
    type_key: typeKeyValue,
  });
  const configs = extractFieldConfigs(result).map((raw) => normalizeFieldConfig(raw, type)).filter(Boolean);
  const fieldConfigsByKey = new Map(configs.map((field) => [field.field_key, field]));
  for (const field of configs) {
    upsertFeishuProjectFieldConfig({
      workspace_id: workspaceId,
      project_key: projectKey,
      ...field,
    });
  }
  return { fieldConfigsByKey, count: configs.length };
}

async function syncItemsForType({ client, toolNames, workspaceId, projectKey, type, limit, fieldConfigsByKey }) {
  const listTool = chooseTool(toolNames, [
    "list_workitem",
    "list_workitems",
    "list_work_item",
    "list_work_items",
    "search_workitem",
    "search_workitems",
    "search_work_item",
    "search_work_items",
    "query_workitem",
    "query_workitems",
    "query_work_item",
    "query_work_items",
    "list_workitem_briefs",
    "list_work_item_briefs",
    "search_workitem_info",
    "search_work_item_info",
  ]);
  if (!listTool) return { tool: "", count: 0 };
  const result = await client.callTool(listTool, listArgs({ projectKey, type, limit }));
  const raws = extractWorkItems(result);
  let count = 0;
  for (const raw of raws.slice(0, Math.min(Math.max(Number(limit) || 50, 1), 100))) {
    const normalized = normalizeWorkItem(raw, { projectKey, type, fieldConfigsByKey });
    const enriched = await enrichItemFromBrief(client, toolNames, normalized, { projectKey, fieldConfigsByKey });
    if (!enriched?.work_item_id) continue;
    upsertFeishuProjectItem({
      workspace_id: workspaceId,
      project_key: projectKey,
      ...enriched,
    });
    for (const field of enriched.fields || []) {
      upsertFeishuProjectItemField({
        workspace_id: workspaceId,
        project_key: projectKey,
        work_item_id: enriched.work_item_id,
        ...field,
      });
    }
    count += 1;
  }
  return { tool: listTool, count };
}

async function syncItemsByMql({ client, toolNames, workspaceId, projectKey, projectName, type, limit }) {
  if (!toolNames.includes("search_by_mql")) return { tool: "", count: 0 };
  const mql = buildIdeaMql(projectName, typeName(type), limit);
  const result = await client.callTool("search_by_mql", {
    project_key: projectKey,
    mql,
  });
  const rows = extractMqlRows(result);
  let count = 0;
  for (const row of rows) {
    const normalized = normalizeMqlRow(row, { projectKey, type });
    if (!normalized?.work_item_id) continue;
    upsertFeishuProjectItem({
      workspace_id: workspaceId,
      project_key: projectKey,
      ...normalized,
    });
    count += 1;
  }
  return { tool: "search_by_mql", count };
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
  let project = settings.projectKey ? { key: settings.projectKey, name: settings.projectName || "" } : null;
  let workItemTypes = [];

  if (toolNames.includes("search_project_info")) {
    try {
      const projectResult = await client.callTool("search_project_info", settings.projectKey ? { project_key: settings.projectKey } : {});
      project = extractProjectSummary(projectResult) || project;
    } catch (error) {
      if (settings.projectKey) throw error;
    }
  }
  const resolvedProjectKey = cleanText(project?.key || settings.projectKey);
  if (resolvedProjectKey && toolNames.includes("list_workitem_types")) {
    const typeResult = await client.callTool("list_workitem_types", { project_key: resolvedProjectKey });
    workItemTypes = extractWorkItemTypes(typeResult);
  }

  const ideaType = findTypeByName(workItemTypes, /产品想法登记/);
  const projectType = findTypeByName(workItemTypes, /产品立项/);
  const programType = findTypeByName(workItemTypes, /项目集/);
  const summary = {
    connected: true,
    serverInfo: initResult?.serverInfo || initResult?.server_info || null,
    project,
    workItemTypeCount: workItemTypes.length,
    ideaTypeFound: Boolean(ideaType),
    projectTypeFound: Boolean(projectType),
    programTypeFound: Boolean(programType),
    ideaType: ideaType ? { key: typeKey(ideaType), name: typeName(ideaType) } : null,
  };
  updateSettings(userId, {
    last_feishu_project_mcp_test_at: new Date().toISOString(),
    ...(project?.key ? {
      feishu_mcp_project_key: project.key,
      feishu_project_default_project_key: project.key,
      feishu_mcp_project_name: project.name || settings.projectName || "",
      feishu_project_default_project_name: project.name || settings.projectName || "",
    } : {}),
    ...(summary.ideaType?.key ? {
      feishu_project_idea_type_key: summary.ideaType.key,
    } : {}),
  });
  return summary;
}

export async function syncFeishuProjectMcpForUser(userId, { workspaceId = "", fetchImpl, limit = 50 } = {}) {
  const settings = getFeishuProjectMcpSettings(userId);
  if (!settings.token) {
    throw new FeishuProjectMcpError("请先填写飞书项目 MCP Token。", { code: "missing_feishu_project_mcp_token" });
  }
  if (!settings.projectKey) {
    throw new FeishuProjectMcpError("请先固定飞书项目空间 project_key。", { code: "missing_feishu_project_key" });
  }
  const resolvedWorkspaceId = cleanText(workspaceId || rawState(userId)?.workspace?.workspace_id || rawState(userId)?.workspace?.id);
  if (!resolvedWorkspaceId) {
    throw new FeishuProjectMcpError("缺少 Loom workspace，无法镜像飞书项目。", { code: "missing_workspace_id" });
  }
  const client = new FeishuProjectMcpClient({
    url: settings.url,
    token: settings.token,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  await client.initialize();
  const toolsResult = await client.listTools();
  const tools = toolsResult?.tools || toolsResult?.data?.tools || [];
  const toolNames = summarizeToolNames(tools);
  if (!toolNames.length) {
    throw new FeishuProjectMcpError("飞书项目 MCP 没有返回可用工具。", { code: "missing_feishu_project_tools" });
  }
  const typeResult = toolNames.includes("list_workitem_types")
    ? await client.callTool("list_workitem_types", { project_key: settings.projectKey })
    : null;
  const workItemTypes = extractWorkItemTypes(typeResult);
  const selectedTypes = candidateTypes(workItemTypes, settings);
  if (!selectedTypes.length) {
    throw new FeishuProjectMcpError("没有识别到可同步的飞书项目工作项类型。", { code: "missing_work_item_types" });
  }

  let fieldConfigCount = 0;
  let itemCount = 0;
  const syncedTypes = [];
  const usedTools = new Set(["initialize", "tools/list", ...(typeResult ? ["list_workitem_types"] : [])]);
  for (const type of selectedTypes) {
    const fieldSync = await syncFieldConfigs({
      client,
      toolNames,
      workspaceId: resolvedWorkspaceId,
      projectKey: settings.projectKey,
      type,
    });
    fieldConfigCount += fieldSync.count;
    const itemSync = await syncItemsForType({
      client,
      toolNames,
      workspaceId: resolvedWorkspaceId,
      projectKey: settings.projectKey,
      type,
      limit,
      fieldConfigsByKey: fieldSync.fieldConfigsByKey,
    });
    const effectiveItemSync = itemSync.count > 0 ? itemSync : await syncItemsByMql({
      client,
      toolNames,
      workspaceId: resolvedWorkspaceId,
      projectKey: settings.projectKey,
      projectName: settings.projectName,
      type,
      limit,
    });
    if (effectiveItemSync.tool) usedTools.add(effectiveItemSync.tool);
    itemCount += effectiveItemSync.count;
    syncedTypes.push({
      key: typeKey(type),
      name: typeName(type),
      items: effectiveItemSync.count,
      fields: fieldSync.count,
    });
  }
  const now = new Date().toISOString();
  updateSettings(userId, {
    last_feishu_project_mcp_sync_at: now,
    last_feishu_project_mcp_test_at: rawState(userId)?.settings?.last_feishu_project_mcp_test_at || now,
    feishu_project_default_project_key: settings.projectKey,
    feishu_mcp_project_key: settings.projectKey,
    ...(settings.projectName ? {
      feishu_project_default_project_name: settings.projectName,
      feishu_mcp_project_name: settings.projectName,
    } : {}),
    ...(settings.ideaTypeKey ? { feishu_project_idea_type_key: settings.ideaTypeKey } : {}),
  });
  return {
    ok: true,
    project: { key: settings.projectKey, name: settings.projectName },
    synced: {
      items: itemCount,
      field_configs: fieldConfigCount,
      types: syncedTypes,
    },
    tools_used: Array.from(usedTools),
    mirror_count: listFeishuProjectItems({
      workspace_id: resolvedWorkspaceId,
      project_key: settings.projectKey,
      limit: 100,
    }).length,
    synced_at: now,
  };
}
