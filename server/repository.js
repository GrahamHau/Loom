import { nanoid } from "nanoid";
import { getState, saveState } from "./db.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function bootstrap() {
  const state = clone(getState());
  if (state.settings) {
    state.settings = maskSettings(state.settings);
  }
  return state;
}

export function rawState() {
  return clone(getState());
}

export function mutate(mutator) {
  const state = rawState();
  const result = mutator(state);
  saveState(state);
  return result;
}

export function maskSettings(settings) {
  const masked = { ...settings };
  if (masked.llm_api_key) masked.llm_api_key = "********";
  if (masked.feishu_app_secret) masked.feishu_app_secret = "********";
  return masked;
}

export function createProduct(input) {
  return mutate((state) => {
    const product = {
      id: input.id || nanoid(10),
      emoji: input.emoji || "📦",
      name: input.name || "未命名竞品",
      category: input.category || "未分类",
      tags: input.tags || [],
      status: input.status || "新录入",
      ai_summary: input.ai_summary || "",
      selling_points: input.selling_points || [],
      negative_keywords: input.negative_keywords || [],
      synced_at: null,
      platforms: input.platforms || [],
      ...input,
    };
    state.products.unshift(product);
    return product;
  });
}

export function updateProduct(id, patch) {
  return mutate((state) => {
    const item = state.products.find((product) => product.id === id);
    if (!item) return null;
    Object.assign(item, patch, { updated_at: new Date().toISOString() });
    return item;
  });
}

export function deleteProduct(id) {
  return mutate((state) => {
    const before = state.products.length;
    state.products = state.products.filter((product) => product.id !== id);
    return before !== state.products.length;
  });
}

export function createDemand(input) {
  return mutate((state) => {
    const demand = {
      id: input.id || nanoid(10),
      title: input.title || "未命名需求",
      thumbHue: input.thumbHue ?? 200,
      summary: input.summary || "",
      source: input.source || "manual",
      date: input.date || new Date().toISOString().slice(0, 10),
      innovation: input.innovation || "待分类",
      scenarios: input.scenarios || [],
      painpoints: input.painpoints || [],
      ...input,
    };
    state.demands.unshift(demand);
    return demand;
  });
}

export function updateDemand(id, patch) {
  return mutate((state) => {
    const item = state.demands.find((demand) => demand.id === id);
    if (!item) return null;
    Object.assign(item, patch, { updated_at: new Date().toISOString() });
    return item;
  });
}

export function updateNews(id, patch) {
  return mutate((state) => {
    const item = state.news.find((news) => news.id === id);
    if (!item) return null;
    Object.assign(item, patch);
    return item;
  });
}

export function updateSettings(patch) {
  return mutate((state) => {
    state.settings = { ...(state.settings || {}), ...patch };
    return maskSettings(state.settings);
  });
}
