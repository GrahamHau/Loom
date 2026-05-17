import { getDocumentTemplate, listDocumentTemplates } from "./knowledge-repository.js";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function normalizeHeading(value) {
  return cleanText(value)
    .replace(/^#+\s*/, "")
    .replace(/[：:]\s*$/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function blockText(block) {
  if (!block) return "";
  if (block.type === "table") {
    return (block.rows || []).map((row) => row.join(" | ")).join("\n");
  }
  return cleanText(block.text);
}

function sectionMatchers(section) {
  return [section.title, section.key, ...(section.aliases || [])]
    .map(normalizeHeading)
    .filter(Boolean);
}

export function resolveDocumentTemplate({ workspaceId, docType = "other", templateId = "" } = {}) {
  if (!workspaceId) return null;
  if (templateId) {
    const found = listDocumentTemplates(workspaceId).find((item) => item.id === templateId);
    if (found) return found;
  }
  return getDocumentTemplate(workspaceId, docType, "v1") || listDocumentTemplates(workspaceId, docType)[0] || null;
}

export function normalizeBlocksWithTemplate(rawBlocks = [], template) {
  const sections = Array.isArray(template?.sections) ? template.sections : [];
  const sectionByKey = new Map(sections.map((section) => [section.key, section]));
  const matcherEntries = sections.flatMap((section) => sectionMatchers(section).map((matcher) => ({ matcher, section })));
  const buckets = new Map();
  const unmatched = [];
  const imagePlaceholders = [];
  let currentKey = "";

  for (const block of rawBlocks) {
    const type = cleanText(block?.type, "paragraph");
    if (type === "image_placeholder") {
      const image = {
        block_id: block.block_id,
        section_key: currentKey,
        note: block.text || "图片未导入，请查看原文档",
        metadata: block.metadata || { reason: "p0_skip_binary" },
      };
      imagePlaceholders.push(image);
      if (currentKey) {
        const bucket = buckets.get(currentKey) || { blocks: [], tables: [], refs: [] };
        bucket.blocks.push(block);
        bucket.refs.push(block.block_id);
        buckets.set(currentKey, bucket);
      } else {
        unmatched.push({ title: "未归类图片", content: image.note, source_block_refs: [block.block_id].filter(Boolean), reason: "image_without_section" });
      }
      continue;
    }

    if (type === "heading") {
      const heading = normalizeHeading(block.text);
      const matched = matcherEntries.find((entry) => entry.matcher === heading || heading.includes(entry.matcher) || entry.matcher.includes(heading));
      if (matched) {
        currentKey = matched.section.key;
      } else {
        currentKey = "";
        unmatched.push({
          title: cleanText(block.text, "未匹配标题"),
          content: "",
          source_block_refs: [block.block_id].filter(Boolean),
          reason: "heading_not_in_template",
        });
      }
      continue;
    }

    const text = blockText(block);
    if (!text) continue;
    if (!currentKey || !sectionByKey.has(currentKey)) {
      unmatched.push({
        title: "未匹配内容",
        content: text,
        source_block_refs: [block.block_id].filter(Boolean),
        reason: "content_without_template_section",
      });
      continue;
    }
    const bucket = buckets.get(currentKey) || { blocks: [], tables: [], refs: [] };
    bucket.blocks.push(block);
    bucket.refs.push(block.block_id);
    if (type === "table") bucket.tables.push(block.rows || []);
    buckets.set(currentKey, bucket);
  }

  const normalizedSections = sections
    .map((section) => {
      const bucket = buckets.get(section.key);
      if (!bucket) return null;
      const content = bucket.blocks
        .filter((block) => block.type !== "table" && block.type !== "image_placeholder")
        .map(blockText)
        .filter(Boolean)
        .join("\n\n");
      const imageNotes = bucket.blocks
        .filter((block) => block.type === "image_placeholder")
        .map((block) => block.text)
        .filter(Boolean);
      return {
        key: section.key,
        title: section.title,
        content,
        tables: bucket.tables,
        image_notes: imageNotes,
        source_block_refs: bucket.refs.filter(Boolean),
        confidence: 0.82,
        access_policy: {
          visibility: "private",
          rag_enabled: false,
          bot_enabled: false,
          supplier_visible: false,
          sales_visible: false,
        },
      };
    })
    .filter(Boolean);

  return {
    template_id: template?.id || "",
    normalized_sections: normalizedSections,
    unmatched_sections: unmatched.filter((item) => item.content || item.title),
    image_placeholders: imagePlaceholders,
  };
}
