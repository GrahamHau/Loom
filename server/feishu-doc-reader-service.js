import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 30000;

export class FeishuDocumentReadError extends Error {
  constructor(message = "无法读取飞书文档。请确认文档链接正确、LOOM 飞书应用有云文档读取权限，或改用复制粘贴导入。") {
    super(message);
    this.name = "FeishuDocumentReadError";
    this.code = "feishu_document_read_unavailable";
  }
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function commandFromEnv() {
  return cleanText(process.env.LARK_CLI_BIN || "lark-cli");
}

function normalizeCliContent(value) {
  return String(value || "")
    .replace(/<title>([^<]+)<\/title>/gi, "# $1\n")
    .replace(/<\/?(?:fragment|excerpt)\b[^>]*>/gi, "\n")
    .replace(/<(?:img|whiteboard|source|file|bitable|sheet|cite)\b[^>]*>(?:<\/(?:img|whiteboard|source|file|bitable|sheet|cite)>)?/gi, "\n[图片]\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|li|tr|table|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleFromContent(content, fallback = "") {
  const titleTag = String(content || "").match(/<title>([^<]+)<\/title>/i);
  if (titleTag?.[1]) return cleanText(titleTag[1], fallback);
  const markdownTitle = String(content || "").split("\n").map((line) => line.trim()).find((line) => /^#\s+/.test(line));
  return markdownTitle ? cleanText(markdownTitle.replace(/^#\s+/, ""), fallback) : fallback;
}

function parseCliOutput(stdout, sourceUri) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new FeishuDocumentReadError("飞书文档读取返回格式异常，请改用复制粘贴导入。");
  }
  if (parsed?.ok === false) {
    throw new FeishuDocumentReadError(parsed?.error?.message || parsed?.message);
  }
  const document = parsed?.data?.document || {};
  const content = cleanText(document.content);
  if (!content) {
    throw new FeishuDocumentReadError("飞书文档内容为空或暂不可读取。");
  }
  return {
    title: titleFromContent(content, cleanText(document.title || sourceUri, "飞书文档")),
    text: normalizeCliContent(content),
    metadata: {
      document_id: document.document_id,
      revision_id: document.revision_id,
    },
  };
}

export const __feishuDocReaderTestUtils = {
  normalizeCliContent,
  parseCliOutput,
  titleFromContent,
};

export async function readFeishuDocument(input = {}) {
  const sourceUri = cleanText(input.source_uri || input.url || input.doc || input.token);
  if (!sourceUri) throw new FeishuDocumentReadError("缺少飞书文档链接。");
  const command = commandFromEnv();
  const args = [
    "docs",
    "+fetch",
    "--api-version",
    "v2",
    "--doc",
    sourceUri,
    "--doc-format",
    "markdown",
    "--detail",
    "simple",
    "--format",
    "json",
  ];
  try {
    const { stdout } = await execFileAsync(command, args, {
      timeout: Number(process.env.FEISHU_DOC_READ_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    });
    const result = parseCliOutput(stdout, sourceUri);
    if (!result.text) throw new FeishuDocumentReadError("飞书文档内容为空或暂不可读取。");
    return result;
  } catch (error) {
    if (error instanceof FeishuDocumentReadError) throw error;
    if (error.code === "ENOENT") {
      throw new FeishuDocumentReadError("服务器未安装 lark-cli，暂不能直接读取飞书文档。请改用复制粘贴导入。");
    }
    if (error.killed || error.signal === "SIGTERM") {
      throw new FeishuDocumentReadError("读取飞书文档超时，请稍后重试或改用复制粘贴导入。");
    }
    const detail = cleanText(error.stderr || error.stdout || error.message);
    throw new FeishuDocumentReadError(detail ? `飞书文档读取失败：${detail.slice(0, 300)}` : undefined);
  }
}
