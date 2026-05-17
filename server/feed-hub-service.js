import { nanoid } from "nanoid";
import {
  createFeedExport,
  createFeedGroup,
  listFeedDestinations,
  listFeedGroupSources,
  listFeedGroups,
  listNews,
  listNewsSources,
} from "./repository.js";

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cdata(value) {
  return `<![CDATA[${String(value || "").replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function itemGroupIds(item = {}) {
  const classification = item.classification || {};
  const explicit = Array.isArray(classification.group_ids) ? classification.group_ids : [];
  const sourceGroup = String(classification.source_group || "").trim();
  return [...explicit, ...(sourceGroup ? [sourceGroup] : [])].filter(Boolean);
}

function isWechatSource(source = {}) {
  const adapter = String(source.adapter_type || source.type || "").toLowerCase();
  const sourceGroup = String(source.source_group || source.group || "").toLowerCase();
  return adapter.includes("wechat") || sourceGroup === "wechat-exporter";
}

function isCustomSource(source = {}) {
  return String(source.source_group || source.group || "").toLowerCase() === "custom";
}

function defaultGroupMatchesSource(group = {}, source = {}) {
  const slug = String(group.slug || "").toLowerCase();
  if (slug === "all-sources") return true;
  if (slug === "wechat") return isWechatSource(source);
  if (slug === "custom") return isCustomSource(source);
  return false;
}

function resolvedGroupSources(userId, group = {}, allSources = null) {
  const sources = Array.isArray(allSources) ? allSources : listNewsSources(userId);
  const explicit = listFeedGroupSources(userId, group.id);
  const explicitIds = new Set(explicit.map((source) => source.id));
  const resolved = [];
  const seen = new Set();

  for (const source of sources) {
    if (!source?.id) continue;
    if (!explicitIds.has(source.id) && !defaultGroupMatchesSource(group, source)) continue;
    resolved.push(source);
    seen.add(source.id);
  }

  for (const source of explicit) {
    if (!source?.id || seen.has(source.id)) continue;
    resolved.push(source);
    seen.add(source.id);
  }

  return resolved;
}

function filterItemsForGroup(items = [], group = {}, sources = []) {
  const sourceIds = new Set((sources || []).map((source) => source.id));
  return items.filter((item) => {
    if (sourceIds.has(item.source_id)) return true;
    return itemGroupIds(item).includes(group.id) || itemGroupIds(item).includes(group.slug);
  });
}

function sortItems(items = []) {
  return [...items].sort((a, b) => {
    const left = new Date(a.published_at || a.created_at || 0).getTime();
    const right = new Date(b.published_at || b.created_at || 0).getTime();
    return right - left;
  });
}

function newsItemToExportRecord(item = {}) {
  return {
    id: item.id,
    source_id: item.source_id,
    source: item.source,
    title: item.titleZh || item.original_title,
    original_title: item.original_title,
    url: item.original_url,
    summary: item.summary || "",
    content: item.contentZh || item.original_content || "",
    published_at: item.published_at || item.created_at || "",
    type: item.type || "",
    thumbnail_url: item.thumbnail_url || "",
    classification: item.classification || null,
  };
}

export function ensureDefaultFeedGroups(userId) {
  const existing = listFeedGroups(userId);
  const defaults = [
    { name: "All Sources", slug: "all-sources", description: "All active feed sources", color: "slate" },
    { name: "Wechat", slug: "wechat", description: "Wechat and official account sources", color: "green" },
    { name: "Custom", slug: "custom", description: "Manually added sources", color: "blue" },
  ];
  const existingSlugs = new Set(existing.map((group) => String(group.slug || "").toLowerCase()).filter(Boolean));
  for (const entry of defaults) {
    if (existingSlugs.has(entry.slug)) continue;
    existing.push(createFeedGroup(userId, entry));
  }
  return existing.sort((left, right) => new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime());
}

export function buildFeedHubBootstrap(userId) {
  const groups = ensureDefaultFeedGroups(userId);
  const sources = listNewsSources(userId);
  const destinations = listFeedDestinations(userId);
  const groupedSourceIds = new Set();
  const groupsWithSources = groups.map((group) => {
    const resolvedSources = resolvedGroupSources(userId, group, sources);
    for (const source of resolvedSources) groupedSourceIds.add(source.id);
    return {
      ...group,
      sources: resolvedSources,
    };
  });
  return {
    groups: groupsWithSources,
    ungrouped_sources: sources.filter((source) => !groupedSourceIds.has(source.id)),
    destinations,
    source_counts: {
      all: sources.length,
      active: sources.filter((source) => source.active).length,
      wechat: sources.filter((source) => String(source.adapter_type || source.type).toLowerCase().includes("wechat")).length,
    },
  };
}

export function renderFeedItemsRss({ title, description, link, items = [] }) {
  const rssItems = sortItems(items).map((item) => {
    const headline = item.titleZh || item.original_title || "Untitled";
    const summary = item.summary || stripHtml(item.original_content || "");
    const content = item.contentZh || item.original_content || summary;
    const pubDate = new Date(item.published_at || item.created_at || Date.now()).toUTCString();
    const guid = item.original_url || item.id || nanoid(8);
    return [
      "    <item>",
      `      <title>${escapeXml(headline)}</title>`,
      item.original_url ? `      <link>${escapeXml(item.original_url)}</link>` : "",
      `      <guid isPermaLink="${item.original_url ? "true" : "false"}">${escapeXml(guid)}</guid>`,
      `      <pubDate>${escapeXml(pubDate)}</pubDate>`,
      `      <description>${cdata(summary)}</description>`,
      `      <content:encoded>${cdata(content)}</content:encoded>`,
      item.thumbnail_url ? `      <enclosure url="${escapeXml(item.thumbnail_url)}" type="image/jpeg" />` : "",
      "    </item>",
    ].filter(Boolean).join("\n");
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(link || "")}</link>
    <description>${escapeXml(description || title)}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems}
  </channel>
</rss>
`;
}

export function renderFeedHubOpml({ title = "LOOM Feed Hub", outlines = [] }) {
  const body = outlines.map((outline) =>
    `    <outline text="${escapeXml(outline.text)}" title="${escapeXml(outline.title || outline.text)}" type="rss" xmlUrl="${escapeXml(outline.xmlUrl)}" htmlUrl="${escapeXml(outline.htmlUrl || "")}" />`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(title)}</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${body}
  </body>
</opml>
`;
}

export function renderFreshRssReadingList({ title = "LOOM Feed Hub", opmlUrl }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0" xmlns:frss="https://freshrss.org/opml">
  <head>
    <title>${escapeXml(title)}</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
    <outline text="${escapeXml(title)}" title="${escapeXml(title)}" frss:opmlUrl="${escapeXml(opmlUrl)}" />
  </body>
</opml>
`;
}

export function buildSourceFeed(userId, sourceId) {
  const source = listNewsSources(userId).find((item) => item.id === sourceId);
  if (!source) return null;
  const items = listNews(userId).filter((item) => item.source_id === sourceId);
  return {
    source,
    xml: renderFeedItemsRss({
      title: source.name,
      description: `${source.name} feed`,
      link: source.url,
      items,
    }),
  };
}

export function buildGroupFeed(userId, groupId) {
  const group = listFeedGroups(userId).find((item) => item.id === groupId || item.slug === groupId);
  if (!group) return null;
  const sources = resolvedGroupSources(userId, group);
  const items = filterItemsForGroup(listNews(userId), group, sources);
  return {
    group,
    sources,
    items,
    xml: renderFeedItemsRss({
      title: group.name,
      description: group.description || `${group.name} group feed`,
      link: "",
      items,
    }),
  };
}

export function buildHubOpml(userId, { baseUrl = "", token = "" } = {}) {
  const groups = ensureDefaultFeedGroups(userId);
  const outlines = groups.map((group) => ({
    text: group.name,
    title: group.name,
    xmlUrl: `${baseUrl}/api/feed-hub/public/groups/${group.slug}.xml?token=${encodeURIComponent(token)}`,
  }));
  return renderFeedHubOpml({ title: "LOOM Feed Hub", outlines });
}

export function exportGroupArchive(userId, groupId, { format = "json" } = {}) {
  const payload = buildGroupFeed(userId, groupId);
  if (!payload) return null;
  const records = sortItems(payload.items).map(newsItemToExportRecord);
  const exported = createFeedExport(userId, {
    name: `${payload.group.name} archive`,
    format,
    scope_type: "group",
    scope_id: payload.group.id,
    item_count: records.length,
    payload: {
      group: payload.group,
      sources: payload.sources,
      items: records,
    },
  });
  if (format === "md") {
    const markdown = [
      `# ${payload.group.name}`,
      "",
      ...records.flatMap((item) => [
        `## ${item.title}`,
        "",
        `- Source: ${item.source}`,
        `- Published: ${item.published_at}`,
        `- URL: ${item.url}`,
        item.summary ? `- Summary: ${item.summary}` : "",
        "",
        item.content || "",
        "",
      ].filter(Boolean)),
    ].join("\n");
    return {
      export: exported,
      contentType: "text/markdown; charset=utf-8",
      body: markdown,
    };
  }
  return {
    export: exported,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(exported.payload, null, 2),
  };
}
