import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const uploadsDir = process.env.UPLOADS_DIR || path.join(projectRoot, "uploads");
const mediaDir = path.join(uploadsDir, "remote-media");
const MAX_MEDIA_BYTES = Math.max(128 * 1024, Number(process.env.REMOTE_MEDIA_CACHE_MAX_BYTES || 6 * 1024 * 1024));
const FETCH_TIMEOUT_MS = Math.max(1000, Number(process.env.REMOTE_MEDIA_CACHE_TIMEOUT_MS || 12000));

const EXT_BY_TYPE = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

function cleanText(value) {
  return String(value ?? "").trim();
}

function isCacheableRemoteImage(value) {
  const url = cleanText(value);
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isXiaohongshuImage(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("xhscdn.com") || host.includes("xiaohongshu.com");
  } catch {
    return false;
  }
}

function imageRequestHeaders(url) {
  const base = {
    "User-Agent": "Mozilla/5.0 LOOM/0.1",
    Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
    Referer: new URL(url).origin,
  };
  if (!isXiaohongshuImage(url)) return base;
  return {
    ...base,
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    Referer: "https://www.xiaohongshu.com/",
  };
}

function extensionFor(contentType, url) {
  const fromType = EXT_BY_TYPE[String(contentType || "").split(";")[0].trim().toLowerCase()];
  if (fromType) return fromType;
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"].includes(ext) ? ext : ".jpg";
  } catch {
    return ".jpg";
  }
}

function cachePathFor(url, contentType = "") {
  const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 32);
  const ext = extensionFor(contentType, url);
  return {
    filePath: path.join(mediaDir, `${hash}${ext}`),
    publicPath: `/uploads/remote-media/${hash}${ext}`,
  };
}

export async function cacheRemoteImage(url) {
  if (!isCacheableRemoteImage(url)) return "";
  const initial = cachePathFor(url);
  if (fs.existsSync(initial.filePath)) return initial.publicPath;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: imageRequestHeaders(url),
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) return "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_MEDIA_BYTES) return "";

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_MEDIA_BYTES) return "";
    const target = cachePathFor(url, contentType);
    fs.mkdirSync(mediaDir, { recursive: true });
    if (!fs.existsSync(target.filePath)) fs.writeFileSync(target.filePath, buffer);
    return target.publicPath;
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

export async function withCachedImageFields(input = {}) {
  const image = cleanText(input.image || input.thumbnail_url);
  if (!image) return input;
  const cached = await cacheRemoteImage(image);
  if (!cached) return input;
  return {
    ...input,
    image: cached,
    thumbnail_url: cached,
    original_image_url: input.original_image_url || image,
  };
}
