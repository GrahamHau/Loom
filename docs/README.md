# Loom Docs Entry

Status: canonical entrypoint after the 2026-05-19 product reset.

Update 2026-05-20 Round 7: Feishu Project MCP supersedes the Bitable-first
implementation path for the Ulanzi product-development workflow. Feishu Project
is already the team's structured system of record, with standard work-item
types, lifecycle nodes, field metadata, comments, and operation records exposed
through the Feishu Project MCP server. Bitable remains a compatibility and
supplementary source for teams or flows that are not yet in Feishu Project, but
it is no longer the primary sync target for this reset.

These four files are the current implementation authority for Loom's next
phase:

- `architecture-at-a-glance.md` - human-readable product and system overview.
- `competition-roadmap.md` - Codex execution brief for the competition/demo
  phase. Its Round 7 addendum overrides the older Bitable WS-2/WS-3 path.
- `ui-architecture.md` - Web information architecture and navigation reset.
- `decision-chain.md` - decision-chain design. Section 12 is now the
  implementation truth for the current Ulanzi flow: Loom reads Feishu Project
  MCP work items, fields, lifecycle nodes, comments, operation records, and
  weekly progress text.
- `feishu-project-mcp-integration.md` - concrete integration boundary: product
  idea registration maps to Research Workshop; product approval and project-set
  flows are imported as read-only project lists/context, not controlled by
  Loom.

Older milestone specs under `docs/specs/` and `docs/superpowers/specs/` remain
useful implementation background, but they are no longer the primary product
direction. If an older spec conflicts with the four files above, follow the four
files above first and update the older spec before using it as an execution
source.

Core reset:

- Feishu remains the team's work surface and source of truth; for the current
  product-development flow, that source is Feishu Project MCP first, Bitable
  second.
- Loom is the private context layer that reads external signals plus internal
  weekly updates, then produces dashboard summaries, abnormal-state alerts,
  reverse Q&A context, and research export packages.
- Web does not host an AI chat module. Web provides structured views, one-shot
  AI actions, exports, and handoff to Feishu.
