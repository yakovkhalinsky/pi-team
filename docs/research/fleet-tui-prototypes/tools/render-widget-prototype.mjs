#!/usr/bin/env node
/**
 * Prototype v2 render driver.
 *
 * Imports `buildTeamSnapshot` and `buildWidgetLines` directly from the
 * compiled extension at packages/pi-agents-team/dist/extensions/pi-agent-team/index.js
 * (lines 267 and 387 of that file). Constructs three realistic snapshots
 * and renders each at widths 80 / 100 / 120 columns, emitting
 * tools/rendered.json — a 3 × 3 grid that the v2 HTML mockup loads.
 *
 * Why a render driver instead of generating lines inside the HTML?
 *   - The driver pins the prototype to the *compiled* extension output, so
 *     if buildWidgetLines ever drifts, the prototype falls out of sync and
 *     the test bench notices. That is the whole point of this prototype:
 *     we want to see what the user actually sees, not what we wish they
 *     would see.
 *   - The HTML can stay static and trivial to eyeball.
 *
 * Worker shape mirrors packages/pi-agents-team/tests/shell.test.ts lines
 * 1090–1280. Memory shape mirrors the production tracker shape from
 * createMemoryStatusTracker / aggregateEdenMemoryStatus (object buckets
 * { ok, error, skipped }, not raw numbers).
 *
 * Run from repo root: `node docs/research/fleet-tui-prototypes/tools/render-widget-prototype.mjs`
 * Output: docs/research/fleet-tui-prototypes/tools/rendered.json
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_PATH = resolve(__dirname, "rendered.json");
// The driver lives at docs/research/fleet-tui-prototypes/tools/... so the
// repo root is four levels up from this file.
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

// Dynamic import because ES module static imports require a string literal
// path. We resolve DIST_PATH relative to this file so the driver can be
// invoked from any cwd (`node docs/research/fleet-tui-prototypes/tools/render-widget-prototype.mjs`).
const ext = await import(DIST_PATH);
const { buildTeamSnapshot, buildWidgetLines } = ext;

const WIDTHS = [80, 100, 120];
// Pin the clock so the rendered durations are stable across runs.
// Real sessions re-render every tick; the prototype just needs a credible
// shape. Pick a "now" that makes the demo workers look mid-flight, not
// brand-new and not stale.
const NOW = 1_700_000_000_000;

// --- agents --------------------------------------------------------------
// discoverAgents is not exported from the compiled extension — only
// buildTeamSnapshot / buildWidgetLines / buildStatusLine are. The agent
// roster shape the snapshot needs is `{ name, description, source }` per
// the buildTeamSnapshot signature. We mirror what discoverAgents produces
// from the project's .pi/agents/*.md (six profiles) so the rendered
// "Agents:" one-liner matches the real session output.
const agents = [
  { name: "dispatcher", description: "Routes user goals to the right agent role", source: "profile" },
  { name: "researcher", description: "Reduces uncertainty before a decision lands", source: "profile" },
  { name: "verifier", description: "Checks artifacts against claims and assertions", source: "profile" },
  { name: "builder", description: "Produces the artefact; reports changed files", source: "profile" },
  { name: "archivist", description: "Append-only ledger; corrections are new entries", source: "profile" },
  { name: "runtime", description: "Owns the IPC envelope and spawn-time context", source: "profile" },
];

// --- snapshot 1: idle -----------------------------------------------------
// No workers, no memory. The widget should render only the static agent
// roster one-liner and the discovery hint — the "what does a fresh session
// look like" baseline.
const idleWorkers = new Map();

const idleSnapshot = buildTeamSnapshot(agents, idleWorkers, null, [], NOW);

// --- snapshot 2: one-running ---------------------------------------------
// A single in-flight worker on a recognisable task title. This is the
// shape BUG-004 reproduces: the user expects to see orchestration status
// and currently cannot.
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

// --- snapshot 3: three running + three recent + memory -------------------
// Busy session. Three active workers (different profiles so the roster
// is information-dense), three recent terminal workers with mixed
// outcomes, and a memory tracker with the production bucket shape
// { ok, error, skipped } so the byMarker histogram has real signal —
// including one skip-only marker that the widget renders with a leading
// `!`.
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

// Production memory tracker shape: byMarker is a map of bucket objects
// { ok, error, skipped } (see tests/shell.test.ts "byMarker renders the
// production bucket shape"). One marker is intentionally skip-only so we
// can verify the widget's leading `!` glyph works.
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

const lastBlockedGoals = [
  { goalId: "g-blocked-1" },
  { goalId: "g-blocked-2" },
];

const busySnapshot = buildTeamSnapshot(
  agents,
  threeRunningWorkers,
  memoryTracker,
  lastBlockedGoals,
  NOW,
);

// --- render grid ---------------------------------------------------------
// We feed each snapshot into buildWidgetLines once per width. The lines
// the function returns are pure ASCII / CJK-safe Unicode — no ANSI
// escapes — so the HTML can render them verbatim inside <pre> blocks.
// (The compiled buildWidgetLines does not emit ANSI; that is the contract
// for setWidget consumers in the pi host.)
//
// The "width" is documented in the JSON's meta block but is not actually
// fed to buildWidgetLines because the compiled function does not accept
// a width parameter today — line truncation lives one layer up in the
// pi host (which wraps lines to the editor column width). Recording the
// width lets the mockup decide which grid entry to show; future
// prototypes that exercise a width-aware buildWidgetLines can populate
// this differently.
function renderAt(snapshotId, snapshot, width) {
  const rawLines = buildWidgetLines(snapshot, NOW);
  // Visible width: visible length of each line in monospace columns. The
  // mockup uses this to display the "longest line" stat and to spot any
  // runaway output that would have wrapped awkwardly in a real terminal.
  const longestLineCols = rawLines.reduce(
    (max, line) => Math.max(max, [...line].length),
    0,
  );
  return {
    snapshotId,
    width,
    description: snapshotDescriptions[snapshotId],
    lineCount: rawLines.length,
    longestLineCols,
    lines: rawLines,
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
    grid.push(renderAt(snapshotId, snapshot, width));
  }
}

const payload = {
  schema: "prototype-v2-rendered-grid/v1",
  generatedAt: new Date(NOW).toISOString(),
  widths: WIDTHS,
  snapshots: snapshotDescriptions,
  entries: grid,
};

writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");

// Surface a one-line summary so the operator can see at a glance that
// the grid is complete.
const summary = grid
  .map((e) => `${e.snapshotId}@${e.width}: ${e.lineCount} lines, longest=${e.longestLineCols} cols`)
  .join("\n  ");
process.stdout.write(
  `Wrote ${OUT_PATH} — ${grid.length} entries (3 snapshots × ${WIDTHS.length} widths)\n  ${summary}\n`,
);
