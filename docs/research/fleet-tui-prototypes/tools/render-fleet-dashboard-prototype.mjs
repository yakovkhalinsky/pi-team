#!/usr/bin/env node
/**
 * Prototype v3 render driver.
 *
 * Imports `buildTeamSnapshot` directly from the compiled extension at
 * packages/pi-agents-team/dist/extensions/pi-agent-team/index.js (line
 * 267 of that file) and constructs three realistic snapshots identical
 * to the v2 driver. For each snapshot, builds a Fleet Dashboard view
 * using a new pure function `buildFleetDashboardLines(snapshot, width)`
 * that mirrors the v1 layout (prototype-v1-2026-08-23.html lines
 * 152–210) as closely as the real snapshot data permits — and stub-marks
 * the v1 columns that the codebase does not track today (model, ctx %,
 * cost, wall time, `↳ delegate`, kill/restart, coms peers, project
 * context, mode).
 *
 * Emits tools/fleet-dashboard.json — a 3 × 3 grid that the v3 HTML
 * mockup loads inline.
 *
 * Why a separate driver and a separate HTML file?
 *   - The v2 driver emits buildWidgetLines output (the existing flat
 *     widget). The v3 driver emits a different view (the Fleet
 *     Dashboard) using the *same* snapshot input. Sharing a single
 *     driver + JSON would conflate two different research questions
 *     (placement, already settled-ish in v2) with the one this
 *     prototype asks (which v1 columns are real today, which are
 *     aspirational).
 *   - The HTML mockup for v3 needs a side-by-side Fleet Dashboard vs
 *     compact widget comparison, which the v2 layout does not have.
 *
 * What this prototype is honest about:
 *   - `buildTeamSnapshot` exposes only the data needed for the
 *     existing Path A widget. It does NOT carry per-worker model,
 *     context %, cost, parent/delegate chain, or coms-peer metadata.
 *   - This driver renders the v1 layout with `[tracked-not-yet]`
 *     markers in those columns so the reader can see the gap at a
 *     glance. The README addendum names every stubbed column and why
 *     the codebase cannot fill it today.
 *
 * Run from repo root: `node docs/research/fleet-tui-prototypes/tools/render-fleet-dashboard-prototype.mjs`
 * Output: docs/research/fleet-tui-prototypes/tools/fleet-dashboard.json
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, basename } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_PATH = resolve(__dirname, "fleet-dashboard.json");
// Driver lives at docs/research/fleet-tui-prototypes/tools/... so repo
// root is four levels up from this file.
const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const DIST_PATH = resolve(
  REPO_ROOT,
  "packages",
  "pi-agents-team",
  "dist",
  "extensions",
  "pi-agent-team",
  "index.js",
);

// Dynamic import because ES module static imports require a string
// literal path. We resolve DIST_PATH relative to this file so the
// driver can be invoked from any cwd.
const ext = await import(DIST_PATH);
const { buildTeamSnapshot, buildWidgetLines } = ext;

const WIDTHS = [80, 100, 120];
// Pin the clock so the rendered durations are stable across runs.
const NOW = 1_700_000_000_000;

// --- project context -----------------------------------------------------
// Header suffix is the cwd basename (the packet's "project-or-cwd").
// Render it as the real cwd the driver was invoked from, not a
// fictional project name.
const PROJECT_BASENAME = basename(process.cwd());

// --- agents --------------------------------------------------------------
// discoverAgents is not exported from the compiled extension. The agent
// roster shape the snapshot needs is `{ name, description, source }`.
// Same six profiles as v2 (mirrors what discoverAgents produces from
// .pi/agents/*.md).
const agents = [
  { name: "dispatcher", description: "Routes user goals to the right agent role", source: "profile" },
  { name: "researcher", description: "Reduces uncertainty before a decision lands", source: "profile" },
  { name: "verifier", description: "Checks artifacts against claims and assertions", source: "profile" },
  { name: "builder", description: "Produces the artefact; reports changed files", source: "profile" },
  { name: "archivist", description: "Append-only ledger; corrections are new entries", source: "profile" },
  { name: "runtime", description: "Owns the IPC envelope and spawn-time context", source: "profile" },
];

// --- snapshot 1: idle ----------------------------------------------------
const idleWorkers = new Map();
const idleSnapshot = buildTeamSnapshot(agents, idleWorkers, null, [], NOW);

// --- snapshot 2: one-running ---------------------------------------------
const oneRunningWorkers = new Map([
  [
    "w-builder-flaky",
    {
      workerId: "w-builder-flaky",
      profileName: "builder",
      title: "Investigate flaky test in shell.test.ts",
      status: "running",
      startTime: NOW - 47_000,
      pendingRelayQuestions: [],
    },
  ],
]);
const oneRunningSnapshot = buildTeamSnapshot(
  agents,
  oneRunningWorkers,
  null,
  [],
  NOW,
);

// --- snapshot 3: busy ----------------------------------------------------
const threeRunningWorkers = new Map([
  [
    "w-builder-parity",
    {
      workerId: "w-builder-parity",
      profileName: "builder",
      title: "Implement parity data structure",
      status: "running",
      startTime: NOW - 2 * 60_000,
      pendingRelayQuestions: [],
    },
  ],
  [
    "w-verifier-assertions",
    {
      workerId: "w-verifier-assertions",
      profileName: "verifier",
      title: "Wire assertions guard into dispatcher",
      status: "running",
      startTime: NOW - 95_000,
      pendingRelayQuestions: [],
    },
  ],
  [
    "w-researcher-cost",
    {
      workerId: "w-researcher-cost",
      profileName: "researcher",
      title: "Aggregate per-profile cost from events.ndjson",
      status: "running",
      startTime: NOW - 180_000,
      pendingRelayQuestions: [],
    },
  ],
  [
    "w-builder-prev-1",
    {
      workerId: "w-builder-prev-1",
      profileName: "builder",
      title: "Refactor worker-spawn IPC envelope",
      status: "completed",
      startTime: NOW - 9 * 60_000,
      endTime: NOW - 7 * 60_000,
      pendingRelayQuestions: [],
    },
  ],
  [
    "w-verifier-prev-1",
    {
      workerId: "w-verifier-prev-1",
      profileName: "verifier",
      title: "Cross-check buildWidgetLines cap behaviour",
      status: "completed",
      startTime: NOW - 14 * 60_000,
      endTime: NOW - 11 * 60_000,
      pendingRelayQuestions: [],
    },
  ],
  [
    "w-archivist-prev-1",
    {
      workerId: "w-archivist-prev-1",
      profileName: "archivist",
      title: "Append-only migration notes from old ledger",
      status: "error",
      startTime: NOW - 22 * 60_000,
      endTime: NOW - 19 * 60_000,
      pendingRelayQuestions: [],
    },
  ],
]);

const memoryTracker = {
  status: {
    enabled: true,
    healthy: true,
    byMarker: {
      "[action]": { ok: 5, error: 1, skipped: 0 },
      "[closure]": { ok: 0, error: 0, skipped: 2 },
      "[routing]": { ok: 3, error: 0, skipped: 0 },
      "[recorded]": { ok: 1, error: 0, skipped: 0 },
    },
  },
};

const lastBlockedGoals = [{ goalId: "g-blocked-1" }, { goalId: "g-blocked-2" }];

const busySnapshot = buildTeamSnapshot(
  agents,
  threeRunningWorkers,
  memoryTracker,
  lastBlockedGoals,
  NOW,
);

// --- pure function: buildFleetDashboardLines ----------------------------
// Renders the Fleet Dashboard view at the given width. The layout
// follows prototype-v1-2026-08-23.html lines 152–210. Where the
// snapshot does not carry the column data (model, ctx %, cost, wall
// time, parent/delegatedTo, coms peers, project context, mode), the
// driver writes a literal `[tracked-not-yet]` marker so the reader can
// see the gap. Where the snapshot does carry the data, the driver
// renders the real value.
//
// Truncation policy: lines longer than `width` are sliced to
// `width - 1` characters with a `…` (U+2026) appended. This matches the
// v1 prototype's behaviour (which did not word-wrap either). width=0
// or negative is treated as "no truncation".
const STUB = "[tracked-not-yet]";
const ELLIPSIS = "…";

function truncate(line, width) {
  if (!width || width <= 0) return line;
  // Visible width: count code points, not UTF-16 units, so multi-byte
  // glyphs (●, ✓, ✗, ⊘, ↳) are treated as one column each.
  const cols = [...line];
  if (cols.length <= width) return line;
  if (width <= 1) return ELLIPSIS;
  return cols.slice(0, width - 1).join("") + ELLIPSIS;
}

// Pick a glyph for a recent (terminal) worker. Mirrors buildWidgetLines'
// status→glyph mapping (line 414 of the dist): completed → ✓, aborted
// → ⊘, anything else (error/exited) → ✗.
function glyphForStatus(status) {
  if (status === "completed") return "✓";
  if (status === "aborted") return "⊘";
  return "✗";
}

// Compose one worker row. The packet asks for: glyph, profile name,
// task title, duration. The packet also asks for the v1 columns
// (model, ctx, state, status, `↳ delegate`) — those are stubbed.
function activeRow(profileName, title, duration) {
  // Spaces match v1's column rhythm: `  ● <name>  model: ...  ctx: ...
  //  state: ...  <status>`.
  return (
    `  ● ${profileName}  ${STUB}  ${STUB}  ${STUB}  `
    + `"${title}" · ${duration}  ${STUB}`
  );
}

function recentRow(profileName, title, duration, status) {
  return (
    `  ${glyphForStatus(status)} ${profileName}  ${STUB}  ${STUB}  ${STUB}  `
    + `"${title}" · ${duration} · ${status}  ${STUB}`
  );
}

function buildFleetDashboardLines(snapshot, width) {
  const { workers, agentCount } = snapshot;
  const lines = [];

  // Header — `Fleet Dashboard · N agents · <cwd basename>`.
  lines.push(`Fleet Dashboard · ${agentCount} agents · ${PROJECT_BASENAME}`);

  // Filter / affordance hint line. The packet says do NOT implement
  // kill/restart/finished-toggle — those are Stage 4 action verbs.
  // We render the v1 hint line with the action keys shown but note
  // they are stubbed via the [tracked-not-yet] treatment in the
  // panel-foot block of the HTML.
  lines.push(
    `${STUB} filter · ${STUB} toggle finished · ${STUB} kill · ${STUB} restart · ${STUB} close`,
  );
  lines.push("");

  // Summary line: `running X · done Y · failed Z · waiting W`.
  // W is the count of "booting" workers if any. The protocol does not
  // expose a booting status today (worker.status is "running" or a
  // terminal value), so W is 0 in every real snapshot. The packet
  // tells us to derive W this way; we render it as 0.
  const running = workers.running.length;
  const done = workers.completed;
  const failed = workers.errored;
  const waiting = 0; // no booting status in the protocol today
  lines.push(
    `Summary  running ${running} · done ${done} · failed ${failed} · waiting ${waiting}`,
  );

  // Totals line: only the running count and recent.length. No wall
  // time, no tokens, no cost (none of those are in the snapshot).
  lines.push(
    `totals: ${workers.total} · done: ${done} · failed: ${failed} · recent: ${workers.recent.length}`,
  );
  lines.push("");

  // Category sections. The packet's snapshot shape does not have a
  // "category" field on workers — workers are flat. The v1 layout
  // groups them by role (Hub / Native roster / Research helpers /
  // Coms peers). We map the six-role profile roster to those buckets
  // by profile name. Coms peers and Hub are stubbed as
  // [tracked-not-yet] because the codebase has no coms-peer concept
  // and no hub orchestrator as a separate worker entry — both are
  // out-of-protocol categories today.
  //
  // The mapping is hard-coded against the six profiles we know about
  // (mirror of the agents array above). Unknown profile names fall
  // through to "Native roster" by default.
  const NATIVE_ROSTER = new Set(["builder", "verifier", "archivist"]);
  const RESEARCH_HELPERS = new Set(["researcher"]);

  // Hub (orchestrator) — no such worker in the snapshot; render the
  // header line and one stub row so the category exists in the
  // rendering.
  lines.push("Hub (orchestrator)");
  lines.push(
    `  ● hub-pi-001  ${STUB}  ${STUB}  ${STUB}  `
      + `${STUB}  ${STUB}`,
  );
  lines.push("");

  // Native roster — group running + recent workers whose profile is
  // in the native set. Order: running first (matches the v1 layout's
  // "active work" priority), then recent.
  const nativeRunning = workers.running.filter((w) => NATIVE_ROSTER.has(w.profileName));
  const nativeRecent = workers.recent.filter((w) => NATIVE_ROSTER.has(w.profileName));
  if (nativeRunning.length > 0 || nativeRecent.length > 0) {
    lines.push("Native roster");
    for (const w of nativeRunning) {
      lines.push(activeRow(w.profileName, w.title, w.duration));
    }
    for (const w of nativeRecent) {
      lines.push(recentRow(w.profileName, w.title, w.duration, w.status));
    }
    lines.push("");
  }

  // Research helpers — same shape, research profiles.
  const researchRunning = workers.running.filter((w) => RESEARCH_HELPERS.has(w.profileName));
  const researchRecent = workers.recent.filter((w) => RESEARCH_HELPERS.has(w.profileName));
  if (researchRunning.length > 0 || researchRecent.length > 0) {
    lines.push("Research helpers");
    for (const w of researchRunning) {
      lines.push(activeRow(w.profileName, w.title, w.duration));
    }
    for (const w of researchRecent) {
      lines.push(recentRow(w.profileName, w.title, w.duration, w.status));
    }
    lines.push("");
  }

  // Coms peers — out-of-protocol category. The codebase has no coms
  // concept in Path A; render the header so the reader sees the
  // category exists in the v1 layout and notes it is empty/stubbed.
  lines.push("Coms peers (pool: [tracked-not-yet])");
  lines.push(
    `  ${STUB} coms-peer  ${STUB}  ${STUB}  ${STUB}  `
      + `${STUB}  ${STUB}`,
  );
  lines.push("");

  // Memory section — if the snapshot carries memory, surface a one
  // line summary so the reader sees the byMarker data IS real. This
  // is the only place the prototype renders data that is NOT in v1's
  // layout, because it answers a different question: "what does the
  // Fleet Dashboard look like if we have memory to surface?"
  if (snapshot.memory && snapshot.memory.enabled) {
    lines.push("Memory");
    lines.push(
      `  ${snapshot.memory.ok ? "ok" : "degraded"} · `
        + `skipped ${snapshot.memory.skippedTotal} · `
        + `blocked goals ${snapshot.memory.blockedGoalCount}`,
    );
    for (const e of snapshot.memory.byMarker) {
      lines.push(
        `  ${e.marker}: ${e.total} (${e.ok} ok, ${e.error} err, ${e.skipped} skip)`,
      );
    }
    lines.push("");
  }

  // Footer hint line — matches the v1 layout's `↑↓ select  Enter
  // detail  f filter  ...` row. The interactive keys are stubbed for
  // the same reason as the filter line above.
  lines.push(
    `${STUB} select  ${STUB} detail  ${STUB} filter  ${STUB} kill  ${STUB} restart  ${STUB} close`,
  );

  return lines.map((l) => truncate(l, width));
}

// --- render grid ---------------------------------------------------------
// Each entry carries BOTH the v3 Fleet Dashboard lines (this prototype's
// research question) AND the existing buildWidgetLines output (the v2
// baseline) so the mockup can do a side-by-side comparison from a
// single inline JSON. The compact-widget panel is render-only — its
// content is unchanged from v2.
function entryFor(snapshotId, snapshot, width) {
  const lines = buildFleetDashboardLines(snapshot, width);
  const longestLineCols = lines.reduce(
    (max, line) => Math.max(max, [...line].length),
    0,
  );
  const widgetLines = buildWidgetLines(snapshot, NOW);
  const widgetLongestLineCols = widgetLines.reduce(
    (max, line) => Math.max(max, [...line].length),
    0,
  );
  return {
    snapshotId,
    width,
    description: snapshotDescriptions[snapshotId],
    lineCount: lines.length,
    longestLineCols,
    lines,
    compactWidget: {
      lineCount: widgetLines.length,
      longestLineCols: widgetLongestLineCols,
      lines: widgetLines,
    },
  };
}

const snapshotDescriptions = {
  idle: "Idle — no workers, no memory. Fresh-session baseline.",
  "one-running":
    "One running — single in-flight builder on a flaky-test task.",
  busy:
    "Busy — three active workers, three recent (mixed outcomes), memory with non-zero byMarker.",
};

const snapshots = [
  ["idle", idleSnapshot],
  ["one-running", oneRunningSnapshot],
  ["busy", busySnapshot],
];

const grid = [];
for (const [snapshotId, snapshot] of snapshots) {
  for (const width of WIDTHS) {
    grid.push(entryFor(snapshotId, snapshot, width));
  }
}

const payload = {
  schema: "prototype-v3-fleet-dashboard-grid/v1",
  generatedAt: new Date(NOW).toISOString(),
  widths: WIDTHS,
  projectBasename: PROJECT_BASENAME,
  snapshots: snapshotDescriptions,
  stubs: {
    marker: STUB,
    stubbedColumns: [
      "model",
      "ctx %",
      "state (worker.status alternatives)",
      "status activity text",
      "↳ delegate chain (parent / delegatedTo)",
      "kill / restart / finished-toggle affordances",
      "comms peer roster",
      "project context (cwd) — header renders it as `process.cwd()` basename only",
      "mode (standard / xh / etc.)",
      "wall time, tokens, cost (totals line)",
    ],
  },
  entries: grid,
};

writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");

const summary = grid
  .map(
    (e) =>
      `${e.snapshotId}@${e.width}: ${e.lineCount} lines, longest=${e.longestLineCols} cols`,
  )
  .join("\n  ");
process.stdout.write(
  `Wrote ${OUT_PATH} — ${grid.length} entries (3 snapshots × ${WIDTHS.length} widths)\n  ${summary}\n`,
);
