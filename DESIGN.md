# LOOM Design Notes

This file follows the spirit of `awesome-design-md`: keep the design system explicit enough that future agents can extend LOOM without guessing.

## Product Tone

LOOM is an internal product intelligence workspace, not a generic SaaS dashboard. The UI should feel calm, dense, trustworthy, and editorial. Prefer workspace language over marketing language.

## Visual System

- Palette: use the existing warm neutral tokens in `src/legacy/styles.css`; use `--accent` sparingly for active states and source-of-truth actions.
- Surfaces: prefer light layered panels, thin borders, and subtle background gradients. Avoid heavy shadows and decorative cards that do not carry workflow meaning.
- Typography: keep compact app typography. Primary page titles can be more expressive, but controls, rows, labels, and metadata should stay tight and readable.
- Icons: use single-stroke line icons from `src/legacy/components.jsx`; icon size should usually be 13-16px.
- Tags: use the existing `Tag` component style. Do not invent new pill styles unless a state needs stronger distinction.

## Knowledge Studio Pattern

Knowledge Studio is a workflow surface for RAG, MRD, and PRD:

1. Import source material.
2. Publish to RAG with explicit permission switches.
3. Build a knowledge pack.
4. Ask questions with citations.
5. Generate MRD/PRD drafts.
6. Review evidence and export scoped versions.

Design rules:

- Show workflow state at the top so users know what step is missing.
- Keep evidence and permissions visible near generation/export actions.
- Never imply AI has created final truth. Use "draft", "needs review", "citations", and "open questions".
- PRD copy should fit hardware/product definition work: functional attributes, structure, materials, certification, testing, packaging, supplier delivery.
- Avoid software MVP/backlog/sprint language in PRD-facing UI.

## Interaction Rules

- Primary actions should map to real backend calls; avoid inert demo buttons.
- If an adapter is only prepared, label it as prepared or pending, not synced/complete.
- Permission switches must be visible before publishing or export.
- Empty states should explain the next action, not merely say empty.

## Responsive Rules

- Three-column workbench on desktop.
- Collapse to one column below 1120px.
- Keep command controls full-width on mobile.

