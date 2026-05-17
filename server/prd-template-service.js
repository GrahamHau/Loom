import { enabledModulesForProductType, resolveProductTypeTemplate } from "./product-type-template-service.js";

export const PRD_MODULES = [
  { key: "sku_spu", title: "SKU / SPU 信息", required: false },
  { key: "product_definition", title: "产品定义", required: true },
  { key: "functional_attributes", title: "功能属性", required: true },
  { key: "structure", title: "结构要求", required: false },
  { key: "materials_process", title: "材料工艺", required: false },
  { key: "id_cmf", title: "ID / CMF", required: false },
  { key: "electronics_firmware_certification", title: "电子 / 固件 / 认证", required: false },
  { key: "testing", title: "测试要求", required: false },
  { key: "packaging", title: "包装需求", required: false },
  { key: "supplier_delivery", title: "供应商交付", required: false },
  { key: "quality_acceptance", title: "质量验收", required: false },
  { key: "internal_risks", title: "内部风险", required: false },
  { key: "open_questions", title: "待确认问题", required: true },
];

const MODULE_BY_KEY = new Map(PRD_MODULES.map((module) => [module.key, module]));

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function uniqueClean(items = []) {
  return [...new Set(items.map((item) => cleanText(item)).filter(Boolean))];
}

export function resolvePrdModules(input = {}) {
  const productTypeTemplate = resolveProductTypeTemplate(input);
  const enabled = uniqueClean(input.enabled_modules || enabledModulesForProductType({
    ...input,
    product_type_template: productTypeTemplate,
  }));
  const keys = enabled.length ? enabled : ["sku_spu", "product_definition", "functional_attributes", "structure", "materials_process", "id_cmf", "packaging", "testing", "supplier_delivery", "open_questions"];

  return keys.map((key) => MODULE_BY_KEY.get(key) || { key, title: key.replace(/_/g, " "), required: false });
}

export function resolvePrdTemplate(input = {}) {
  const productTypeTemplate = resolveProductTypeTemplate(input);
  return {
    product_type_template: productTypeTemplate,
    modules: resolvePrdModules({ ...input, product_type_template: productTypeTemplate }),
  };
}
