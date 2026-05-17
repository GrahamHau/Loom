import {
  ensureDefaultKnowledgeTemplates,
  getProductTypeTemplate,
  listProductTypeTemplates,
} from "./knowledge-repository.js";

export const DEFAULT_PRODUCT_TYPE_CODE = "generic_hardware";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function uniqueClean(items = []) {
  return [...new Set(items.map((item) => cleanText(item)).filter(Boolean))];
}

export function resolveProductTypeTemplate(input = {}) {
  const workspaceId = cleanText(input.workspace_id || input.workspaceId);
  const directTemplate = input.product_type_template || input.template;
  if (directTemplate?.enabled_modules) {
    return {
      ...directTemplate,
      enabled_modules: uniqueClean(directTemplate.enabled_modules),
    };
  }

  if (!workspaceId) return null;
  ensureDefaultKnowledgeTemplates(workspaceId);

  const code = cleanText(input.product_type_code || input.productTypeCode, DEFAULT_PRODUCT_TYPE_CODE)
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_");
  return getProductTypeTemplate(workspaceId, code)
    || getProductTypeTemplate(workspaceId, DEFAULT_PRODUCT_TYPE_CODE)
    || listProductTypeTemplates(workspaceId)[0]
    || null;
}

export function enabledModulesForProductType(input = {}) {
  const template = resolveProductTypeTemplate(input);
  return uniqueClean(input.enabled_modules || template?.enabled_modules || []);
}
