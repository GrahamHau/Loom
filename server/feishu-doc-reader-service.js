export class FeishuDocumentReadError extends Error {
  constructor(message = "无法读取飞书文档。请确认文档链接正确、LOOM 飞书应用有云文档读取权限，或改用复制粘贴导入。") {
    super(message);
    this.name = "FeishuDocumentReadError";
    this.code = "feishu_document_read_unavailable";
  }
}

export async function readFeishuDocument() {
  throw new FeishuDocumentReadError();
}
