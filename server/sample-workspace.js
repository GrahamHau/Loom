import { buildEmptyState } from "./seed.js";

export const SAMPLE_WORKSPACE_VERSION = "public-empty-2026-05";
export const SAMPLE_NEWS_MAX_AGE_HOURS = Number(process.env.SAMPLE_NEWS_MAX_AGE_HOURS || 240);

export const SAMPLE_NEWS_SOURCES = [];
export const DEFAULT_NEWS_SOURCES = [];

export function sampleSourceId(userId, sourceId) {
  return `${sourceId}-${String(userId || "user").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function isStateEmptyForSample(state = {}) {
  return ["products", "demands", "research"].every((key) => !Array.isArray(state[key]) || state[key].length === 0) &&
    (!Array.isArray(state.rssSources) || state.rssSources.length === 0);
}

export function isSampleWorkspace(state = {}) {
  return Boolean(state?.onboarding?.sampleWorkspace);
}

export function isRecentSampleNews(item, now = new Date()) {
  const published = new Date(item?.published_at || item?.date || "");
  if (Number.isNaN(published.getTime())) return false;
  const ageHours = (now.getTime() - published.getTime()) / 36e5;
  return ageHours >= 0 && ageHours <= SAMPLE_NEWS_MAX_AGE_HOURS;
}

export function sampleWorkspaceState(user = {}) {
  const state = buildEmptyState(user);
  state.onboarding = {
    sampleWorkspace: true,
    sampleVersion: SAMPLE_WORKSPACE_VERSION,
    label: "体验工作区",
    liveNews: false,
    newsMaxAgeHours: SAMPLE_NEWS_MAX_AGE_HOURS,
    created_at: nowIso(),
  };
  return state;
}
