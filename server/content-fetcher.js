import { AppError } from "./ai-service.js";

const FETCH_TIMEOUT_MS = 30000;
const MAX_TEXT_LENGTH = 12000;
const GOOGLE_NEWS_HOSTS = new Set(["news.google.com", "news.url.google.com"]);
const GOOGLE_NEWS_RPCID = "Fbv4je";
const GOOGLE_NEWS_REQUEST_SIGNATURE = '[["en-US","US",["FINANCE_TOP_INDICES","WEB_TEST_1_0_0"],null,null,1,1,"US:en",null,180,null,null,null,null,null,0,null,null,[1608992183,723341000]],"en-US","US",1,[2,3,4,8],1,0,"655000234",0,0,null,0]';

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

function isGoogleNewsHost(rawUrl) {
  try {
    return GOOGLE_NEWS_HOSTS.has(new URL(rawUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function firstMatch(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return normalizeExtractedValue(match[1]);
  }
  return "";
}

function allMatches(html, patterns) {
  const values = [];
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const regex = new RegExp(pattern.source, flags);
    let match;
    while ((match = regex.exec(html))) {
      if (match?.[1]) values.push(normalizeExtractedValue(match[1]));
      if (regex.lastIndex === match.index) regex.lastIndex += 1;
    }
  }
  return values;
}

function firstJsonString(value, keys) {
  for (const key of keys) {
    const pattern = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i");
    const match = String(value || "").match(pattern);
    if (match?.[1]) return normalizeExtractedValue(match[1]);
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

function normalizeExtractedValue(text) {
  return decodeHtml(String(text || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " "));
}

function resolveAssetUrl(rawUrl, baseUrl) {
  const value = normalizeExtractedValue(rawUrl);
  if (!value) return "";
  if (value.startsWith("data:")) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function pickSrcsetUrl(value) {
  const entries = String(value || "")
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
  return entries.at(-1) || "";
}

function normalizeGoogleNewsArticleId(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const index = parts.lastIndexOf("articles");
    if (index < 0 || !parts[index + 1]) return "";
    return parts[index + 1];
  } catch {
    return "";
  }
}

function decodeGoogleNewsArticleId(articleId) {
  if (!articleId) return "";
  try {
    const normalized = articleId.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    let decoded = Buffer.from(padded, "base64").toString("latin1");
    const prefix = Buffer.from([0x08, 0x13, 0x22]).toString("latin1");
    if (decoded.startsWith(prefix)) decoded = decoded.slice(prefix.length);
    const suffix = Buffer.from([0xd2, 0x01, 0x00]).toString("latin1");
    if (decoded.endsWith(suffix)) decoded = decoded.slice(0, -suffix.length);
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    const first = bytes[0];
    if (first === undefined) return "";
    decoded = first >= 0x80 ? decoded.slice(2, first + 2) : decoded.slice(1, first + 1);
    return decoded;
  } catch {
    return "";
  }
}

function extractGoogleNewsTokens(html) {
  return {
    timestamp: normalizeExtractedValue(html.match(/data-n-a-ts="([^"]+)"/)?.[1] || ""),
    signature: normalizeExtractedValue(html.match(/data-n-a-sg="([^"]+)"/)?.[1] || ""),
  };
}

function extractGoogleNewsBatchUrl(payload) {
  const text = String(payload || "");
  for (const pattern of [
    /\["garturlres","([^"]+)",/,
    /\[\\"garturlres\\",\\"([^"]+)\\"/,
    /garturlres\\",\\"([^"]+)\\"/,
  ]) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeExtractedValue(match[1]);
  }
  return "";
}

async function fetchGoogleNewsBatchUrl(articleId, tokens = {}) {
  const timestamp = String(tokens.timestamp || "").trim();
  const signature = String(tokens.signature || "").trim();
  if (!articleId || !timestamp || !signature) return "";
  const response = await fetch(`https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=${GOOGLE_NEWS_RPCID}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "Mozilla/5.0 Loom/0.1 (+https://github.com/GrahamHau/Loom)",
      Referer: "https://news.google.com/",
    },
    body: new URLSearchParams({
      "f.req": JSON.stringify([[[
        GOOGLE_NEWS_RPCID,
        `["garturlreq",${GOOGLE_NEWS_REQUEST_SIGNATURE},"${articleId}",${timestamp},"${signature}"]`,
        null,
        "generic",
      ]]]),
    }).toString(),
  });
  if (!response.ok) return "";
  return extractGoogleNewsBatchUrl(await response.text());
}

async function resolveGoogleNewsUrl(rawUrl) {
  if (!isGoogleNewsHost(rawUrl)) return "";
  const articleId = normalizeGoogleNewsArticleId(rawUrl);
  if (!articleId) return "";
  const decoded = decodeGoogleNewsArticleId(articleId);
  if (/^https?:\/\//i.test(decoded)) return decoded;
  if (decoded) {
    const html = await fetch(rawUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 Loom/0.1 (+https://github.com/GrahamHau/Loom)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    }).then((response) => response.text());
    const batchUrl = await fetchGoogleNewsBatchUrl(articleId, extractGoogleNewsTokens(html));
    if (/^https?:\/\//i.test(batchUrl)) return batchUrl;
  }
  return "";
}

function imageCandidateScore(url) {
  const value = String(url || "").toLowerCase();
  if (!value) return Number.NEGATIVE_INFINITY;
  let score = 0;
  if (/\.(avif|webp|png|jpe?g)(?:[?#]|$)/i.test(value)) score += 8;
  if (/(cover|hero|featured|feature|article|post|social|share|banner|card|lead|main|large|original)/i.test(value)) score += 20;
  if (/(logo|avatar|icon|sprite|favicon|placeholder|default|blank|spacer|share_save|addtoany|buttons\/share)/i.test(value)) score -= 90;
  if (/googleusercontent\.com\/.+(?:=|[?&])s0-w\d+/i.test(value)) score -= 80;
  if (/\/ads?\//i.test(value)) score -= 40;
  return score;
}

function pickBestImageCandidate(candidates, pageUrl) {
  let bestUrl = "";
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const resolved = resolveAssetUrl(pickSrcsetUrl(candidate) || candidate, pageUrl);
    if (!resolved) continue;
    const score = imageCandidateScore(resolved);
    if (score > bestScore) {
      bestUrl = resolved;
      bestScore = score;
    }
  }
  return bestScore >= 0 ? bestUrl : "";
}

function extractArticleUrlFromHtml(html, pageUrl) {
  const canonical = resolveAssetUrl(firstMatch(html, [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:url["'][^>]+content=["']([^"']+)["']/i,
  ]), pageUrl);
  if (canonical) return canonical;
  return resolveAssetUrl(firstJsonString(html, ["url", "articleUrl", "canonicalUrl"]), pageUrl);
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

async function fetchPageResponse(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError(400, "invalid_url", "链接格式不正确。");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AppError(400, "unsupported_url", "只支持 http/https 链接。");
  }

  const candidateUrls = [];
  try {
    const resolvedGoogleUrl = await resolveGoogleNewsUrl(parsed.toString());
    if (resolvedGoogleUrl) candidateUrls.push(resolvedGoogleUrl);
  } catch {
    // Fall through to the original Google News URL.
  }
  candidateUrls.push(parsed.toString());

  let lastAppError = null;
  for (const candidateUrl of candidateUrls.filter((value, index, array) => value && array.indexOf(value) === index)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(candidateUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 Loom/0.1 (+https://github.com/GrahamHau/Loom)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
      });
      if (!response.ok) {
        lastAppError = new AppError(response.status, "fetch_failed", `页面抓取失败：HTTP ${response.status}`);
        continue;
      }
      const html = await response.text();
      return { parsed: new URL(candidateUrl), response, html };
    } catch (error) {
      if (error.name === "AbortError") {
        lastAppError = new AppError(504, "fetch_timeout", "页面抓取超过 30 秒。");
        continue;
      }
      if (error instanceof AppError) {
        lastAppError = error;
        continue;
      }
      lastAppError = new AppError(502, "fetch_unavailable", "页面无法访问或被目标站点拦截。", { message: error.message });
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastAppError || new AppError(502, "fetch_unavailable", "页面无法访问或被目标站点拦截。");
}

export async function fetchPageHtml(url) {
  const { parsed, response, html } = await fetchPageResponse(url);
  return {
    url: response.url || parsed.toString(),
    html,
  };
}

function extractImageFromHtml(html, pageUrl) {
  const metaImage = pickBestImageCandidate(allMatches(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:image:url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image:url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+rel=["']preload["'][^>]+as=["']image["'][^>]+href=["']([^"']+)["']/i,
    /"og:image"[^>]*content=["']([^"']+)["']/i,
    /"image"\s*:\s*"([^"]+)"/i,
    /"images"\s*:\s*\[\s*"([^"]+)"/i,
    /"imageList"\s*:\s*\[\s*"([^"]+)"/i,
    /"thumbnailUrl"\s*:\s*"([^"]+)"/i,
  ]), pageUrl);
  if (metaImage) return metaImage;

  return pickBestImageCandidate(allMatches(html, [
    /<img[^>]+data-lazy-srcset=["']([^"']+)["'][^>]*>/i,
    /<img[^>]+data-srcset=["']([^"']+)["'][^>]*>/i,
    /<img[^>]+srcset=["']([^"']+)["'][^>]*>/i,
    /<source[^>]+srcset=["']([^"']+)["'][^>]*>/i,
    /<img[^>]+(?:data-src|data-original|data-lazy-src|data-actualsrc|data-flickity-lazyload|src)=["']([^"']+)["'][^>]*>/i,
    /<video[^>]+poster=["']([^"']+)["'][^>]*>/i,
  ]), pageUrl);
}

export async function fetchPageImage(url) {
  const { parsed, response, html } = await fetchPageResponse(url);
  const pageUrl = response.url || parsed.toString();
  const articleUrl = extractArticleUrlFromHtml(html, pageUrl);
  return {
    url: pageUrl,
    articleUrl: articleUrl && !articleUrl.includes("news.google.com")
      ? articleUrl
      : !isGoogleNewsHost(pageUrl)
        ? pageUrl
        : "",
    image: extractImageFromHtml(html, pageUrl),
  };
}

export async function resolvePageUrl(url) {
  const { parsed, response, html } = await fetchPageResponse(url);
  const pageUrl = response.url || parsed.toString();
  const articleUrl = extractArticleUrlFromHtml(html, pageUrl);
  if (articleUrl && !articleUrl.includes("news.google.com")) return articleUrl;
  return !isGoogleNewsHost(pageUrl) ? pageUrl : parsed.toString();
}

export async function fetchPageContent(url) {
  try {
    const { parsed, response, html } = await fetchPageResponse(url);
    const pageUrl = response.url || parsed.toString();
    const title = firstMatch(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i,
    ]);
    const description = firstMatch(html, [
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const image = extractImageFromHtml(html, pageUrl);
    const text = cleanHtml(html);
    return {
      url: pageUrl,
      platform: detectPlatform(pageUrl),
      title,
      description,
      image,
      text,
      content: [title, description, text].filter(Boolean).join("\n\n").slice(0, MAX_TEXT_LENGTH),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "fetch_unavailable", "页面无法访问或被目标站点拦截。", { message: error.message });
  }
}
