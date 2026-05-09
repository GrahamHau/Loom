import { AppError } from "./ai-service.js";

const FETCH_TIMEOUT_MS = 30000;
const MAX_TEXT_LENGTH = 12000;

function detectPlatform(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("amazon.")) return "amazon";
  if (host.includes("taobao.") || host.includes("tmall.")) return "taobao";
  if (host.includes("jd.")) return "jd";
  if (host.includes("xiaohongshu.") || host.includes("xhslink.")) return "xiaohongshu";
  if (host.includes("kickstarter.")) return "kickstarter";
  if (host.includes("youtube.") || host.includes("youtu.be")) return "youtube";
  if (host.includes("instagram.")) return "instagram";
  return "other";
}

function firstMatch(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }
  return "";
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function cleanHtml(html) {
  return decodeHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim())
    .slice(0, MAX_TEXT_LENGTH);
}

export async function fetchPageContent(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError(400, "invalid_url", "链接格式不正确。");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AppError(400, "unsupported_url", "只支持 http/https 链接。");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 PM-Copilot/0.1 (+https://github.com/GrahamHau/PM-Copilot)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new AppError(response.status, "fetch_failed", `页面抓取失败：HTTP ${response.status}`);
    }
    const html = await response.text();
    const title = firstMatch(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i,
    ]);
    const description = firstMatch(html, [
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const image = firstMatch(html, [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const text = cleanHtml(html);
    return {
      url: parsed.toString(),
      platform: detectPlatform(parsed.toString()),
      title,
      description,
      image,
      text,
      content: [title, description, text].filter(Boolean).join("\n\n").slice(0, MAX_TEXT_LENGTH),
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new AppError(504, "fetch_timeout", "页面抓取超过 30 秒。");
    }
    if (error instanceof AppError) throw error;
    throw new AppError(502, "fetch_unavailable", "页面无法访问或被目标站点拦截。", { message: error.message });
  } finally {
    clearTimeout(timeout);
  }
}
