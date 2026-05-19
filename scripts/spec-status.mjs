#!/usr/bin/env node
// Walks docs/specs/M*-*/README.md, parses YAML frontmatter, and prints a
// dashboard of milestone status + dependency graph + what's ready to pick up.
//
// Exit codes:
//   0 - all frontmatter valid
//   1 - one or more milestones have invalid frontmatter
//
// Usage:
//   node scripts/spec-status.mjs              # human-readable dashboard
//   node scripts/spec-status.mjs --json       # machine-readable JSON
//   node scripts/spec-status.mjs --next       # only print pickable milestones

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SPECS_DIR = join(REPO_ROOT, "docs", "specs");

const REQUIRED_FIELDS = [
  "id",
  "name",
  "title",
  "status",
  "depends_on",
  "blocks",
  "critical_path",
  "acceptance_pass",
];
const VALID_STATUS = new Set(["planned", "in_progress", "done", "blocked"]);

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      val = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (val === "true") {
      val = true;
    } else if (val === "false") {
      val = false;
    } else if (val === "null") {
      val = null;
    }
    out[key] = val;
  }
  return out;
}

function loadAllMilestones() {
  const dirs = readdirSync(SPECS_DIR)
    .filter((d) => /^M\d+-/.test(d))
    .map((d) => join(SPECS_DIR, d))
    .filter((p) => statSync(p).isDirectory())
    .sort((a, b) => {
      const na = Number(a.match(/M(\d+)/)[1]);
      const nb = Number(b.match(/M(\d+)/)[1]);
      return na - nb;
    });
  const out = [];
  const errors = [];
  for (const dir of dirs) {
    const readme = join(dir, "README.md");
    let text;
    try {
      text = readFileSync(readme, "utf8");
    } catch {
      errors.push({ dir, error: "README.md missing" });
      continue;
    }
    const fm = parseFrontmatter(text);
    if (!fm) {
      errors.push({ dir, error: "no frontmatter" });
      continue;
    }
    const missing = REQUIRED_FIELDS.filter((f) => !(f in fm));
    if (missing.length) {
      errors.push({ dir, error: `missing fields: ${missing.join(", ")}` });
      continue;
    }
    if (!VALID_STATUS.has(fm.status)) {
      errors.push({ dir, error: `invalid status: ${fm.status}` });
      continue;
    }
    out.push(fm);
  }
  return { milestones: out, errors };
}

function pickable(milestones) {
  const byId = Object.fromEntries(milestones.map((m) => [m.id, m]));
  return milestones.filter((m) => {
    if (m.status !== "planned") return false;
    for (const dep of m.depends_on || []) {
      const d = byId[dep];
      if (!d || d.status !== "done") return false;
    }
    return true;
  });
}

const STATUS_GLYPH = {
  planned: "·",
  in_progress: "▸",
  done: "✓",
  blocked: "✗",
};

function table(milestones) {
  const rows = milestones.map((m) => {
    const cp = m.critical_path ? "★" : " ";
    const deps = (m.depends_on || []).join(",") || "-";
    return [
      `${STATUS_GLYPH[m.status]} ${m.id}`,
      cp,
      m.title,
      m.status,
      deps,
      m.acceptance_pass ? "✓" : "·",
    ];
  });
  const headers = ["", "CP", "TITLE", "STATUS", "DEPS", "ACC"];
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length))
  );
  const fmt = (cells) =>
    cells.map((c, i) => String(c).padEnd(widths[i])).join("  ");
  const sep = widths.map((w) => "─".repeat(w)).join("  ");
  return [fmt(headers), sep, ...rows.map(fmt)].join("\n");
}

function summary(milestones) {
  const counts = { planned: 0, in_progress: 0, done: 0, blocked: 0 };
  for (const m of milestones) counts[m.status]++;
  const total = milestones.length;
  const cp = milestones.filter((m) => m.critical_path);
  const cpDone = cp.filter((m) => m.status === "done").length;
  return {
    total,
    done: counts.done,
    in_progress: counts.in_progress,
    planned: counts.planned,
    blocked: counts.blocked,
    critical_path_progress: `${cpDone}/${cp.length}`,
  };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const { milestones, errors } = loadAllMilestones();

  if (args.has("--json")) {
    console.log(
      JSON.stringify(
        { milestones, errors, summary: summary(milestones) },
        null,
        2
      )
    );
    process.exit(errors.length ? 1 : 0);
  }

  if (args.has("--next")) {
    const next = pickable(milestones);
    if (!next.length) {
      console.log("No milestones currently pickable.");
      return;
    }
    for (const m of next) {
      console.log(`${m.id}  ${m.title}  (depends: ${(m.depends_on || []).join(",") || "none"})`);
    }
    return;
  }

  // Default: human dashboard.
  console.log("LOOM Spec Status");
  console.log("================\n");

  if (errors.length) {
    console.log("Frontmatter errors:");
    for (const e of errors) console.log(`  ${e.dir}: ${e.error}`);
    console.log("");
  }

  console.log(table(milestones));
  console.log("");

  const s = summary(milestones);
  console.log(
    `Summary: ${s.done}/${s.total} done · ${s.in_progress} in-progress · ${s.planned} planned · ${s.blocked} blocked`
  );
  console.log(`Critical path: ${s.critical_path_progress}`);

  const next = pickable(milestones);
  if (next.length) {
    console.log("\nReady to pick up:");
    for (const m of next) {
      const cp = m.critical_path ? " ★" : "";
      console.log(`  ${m.id}  ${m.title}${cp}`);
    }
  } else {
    console.log("\nNo milestones currently pickable.");
  }

  process.exit(errors.length ? 1 : 0);
}

main();
