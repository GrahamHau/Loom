import { getDocument, updateDocument } from "./knowledge-repository.js";
import { indexDocument } from "./knowledge-indexer.js";

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text ? text : fallback;
}

function cleanPolicy(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    visibility: cleanText(source.visibility, "private"),
    rag_enabled: Boolean(source.rag_enabled),
    bot_enabled: Boolean(source.bot_enabled),
    supplier_visible: Boolean(source.supplier_visible),
    sales_visible: Boolean(source.sales_visible),
    external_safe: Boolean(source.external_safe),
    requires_owner_approval: source.requires_owner_approval !== false,
  };
}

export function patchDocumentSection(documentId, sectionKey, patch = {}) {
  const document = getDocument(documentId);
  if (!document) return null;
  const content = document.content || {};
  const sections = Array.isArray(content.normalized_sections) ? content.normalized_sections : [];
  const nextSections = sections.map((section) => {
    if (section.key !== sectionKey) return section;
    const nextPolicy = patch.access_policy ? cleanPolicy({ ...(section.access_policy || {}), ...patch.access_policy }) : section.access_policy;
    return {
      ...section,
      ...(patch.content !== undefined ? { content: cleanText(patch.content) } : {}),
      ...(patch.status !== undefined ? { status: cleanText(patch.status) } : {}),
      ...(patch.confidence !== undefined ? { confidence: Number(patch.confidence || 0) } : {}),
      ...(nextPolicy ? { access_policy: nextPolicy } : {}),
    };
  });
  return updateDocument(documentId, {
    content: {
      ...content,
      normalized_sections: nextSections,
    },
  });
}

export function publishDocument(documentId, policyPatch = {}) {
  const document = getDocument(documentId);
  if (!document) return null;
  const policy = cleanPolicy({
    ...(document.access_policy || {}),
    visibility: "project_team",
    rag_enabled: true,
    bot_enabled: Boolean(policyPatch.bot_enabled ?? document.bot_enabled),
    ...policyPatch,
  });
  const content = document.content || {};
  const sections = Array.isArray(content.normalized_sections) ? content.normalized_sections : [];
  const nextSections = sections.map((section) => ({
    ...section,
    status: section.status || "published",
    access_policy: cleanPolicy({
      ...policy,
      ...(section.access_policy || {}),
      rag_enabled: section.access_policy?.rag_enabled ?? policy.rag_enabled,
      bot_enabled: section.access_policy?.bot_enabled ?? policy.bot_enabled,
    }),
  }));
  const updated = updateDocument(documentId, {
    status: "published",
    access_policy: policy,
    content: {
      ...content,
      normalized_sections: nextSections,
    },
    metadata: {
      ...(document.metadata || {}),
      published_at: new Date().toISOString(),
    },
  });
  const indexed = indexDocument(updated);
  return { document: updated, indexed };
}

export function sectionsForExport(document, profile = "internal") {
  const sections = Array.isArray(document?.content?.normalized_sections) ? document.content.normalized_sections : [];
  if (profile === "internal" || profile === "feishu") return sections;
  if (profile === "supplier") {
    return sections.filter((section) => section.access_policy?.supplier_visible === true);
  }
  if (profile === "sales") {
    return sections.filter((section) => section.access_policy?.sales_visible === true || section.access_policy?.external_safe === true);
  }
  return [];
}
