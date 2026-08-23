/**
 * Canonical ATP marker table.
 *
 * Single source of truth for every marker the recorder may emit, who is
 * allowed to write it, and which lifecycle stage it belongs to. Mirrors
 * `.pi-team/reference/markers.md` and `.pi-team/reference/task-lifecycle.md`.
 *
 * The Dispatcher enforces marker routing against this table; the recorder
 * writes from it; the status module aggregates from it. Do not introduce a
 * marker that is not in this table.
 *
 * NOTE: This file is shipped as plain JavaScript (the build script copies
 * .ts -> .js verbatim). Type annotations live in atp-markers.d.ts. Do not
 * introduce TypeScript syntax here that Node cannot parse.
 */

/**
 * Canonical ATP marker table. Order mirrors the lifecycle, with worker-event
 * markers grouped at the end.
 */
export const ATP_MARKERS = [
  { marker: "[goal-received]",         stage: "goal-receipt",           owner: "team-lead",       workerEvent: false },
  { marker: "[routing]",               stage: "routing",                owner: "dispatcher",      workerEvent: false },
  { marker: "[context-gathering]",     stage: "context-gathering",      owner: "researcher",      workerEvent: false },
  { marker: "[skip-context-gathering]",stage: "context-gathering",      owner: "dispatcher",      workerEvent: false },
  { marker: "[action]",                stage: "action",                 owner: "builder|runtime", workerEvent: false },
  { marker: "[api-ready]",             stage: "action",                 owner: "builder",         workerEvent: false },
  { marker: "[verdict]",               stage: "verification",           owner: "verifier",        workerEvent: false },
  { marker: "[recorded]",              stage: "recording-and-archival", owner: "archivist",       workerEvent: false },
  { marker: "[closure]",               stage: "hand-off-or-closure",    owner: "team-lead",       workerEvent: false },
  { marker: "[handoff]",               stage: "hand-off-or-closure",    owner: "archivist",       workerEvent: false },
  { marker: "[andon]",                 stage: null,                     owner: "*",               workerEvent: false },
  { marker: "[escalation]",            stage: null,                     owner: "dispatcher",      workerEvent: false },
  { marker: "[worker-terminal]",       stage: "recording-and-archival", owner: "orchestrator",    workerEvent: true  },
  { marker: "[worker-relay]",          stage: "recording-and-archival", owner: "orchestrator",    workerEvent: true  },
  { marker: "[worker-pruned]",         stage: "recording-and-archival", owner: "archivist",       workerEvent: true  },
];

/** Map from marker name to its spec. */
export const ATP_MARKERS_BY_NAME = ATP_MARKERS.reduce((acc, spec) => {
  acc[spec.marker] = spec;
  return acc;
}, Object.create(null));

/** Map from marker name to its lifecycle stage (undefined for non-stage markers). */
export const ATP_MARKER_STAGE = ATP_MARKERS.reduce((acc, spec) => {
  if (spec.stage) acc[spec.marker] = spec.stage;
  return acc;
}, Object.create(null));

/** Map from marker name to its allowed signer. */
export const ATP_MARKER_OWNER = ATP_MARKERS.reduce((acc, spec) => {
  acc[spec.marker] = spec.owner;
  return acc;
}, Object.create(null));

/** The seven lifecycle stages, in canonical order. */
export const ATP_STAGES = [
  "goal-receipt",
  "routing",
  "context-gathering",
  "action",
  "verification",
  "recording-and-archival",
  "hand-off-or-closure",
];

/**
 * Return the marker spec for a name. Throws if the marker is unknown; the
 * recorder treats unknown markers as a programming error because the marker
 * table is the schema and bypassing it breaks Dispatcher routing.
 */
export function getMarkerSpec(marker) {
  const spec = ATP_MARKERS_BY_NAME[marker];
  if (!spec) {
    throw new Error(`Unknown ATP marker: ${marker}. Add it to ATP_MARKERS in atp-markers.ts first.`);
  }
  return spec;
}

/**
 * Return true when a role is allowed to sign a given marker. The wildcard
 * owner `*` accepts any role.
 */
export function isRoleAllowedForMarker(role, marker) {
  const owner = ATP_MARKER_OWNER[marker];
  if (!owner) return false;
  if (owner === "*") return true;
  if (owner === "builder|runtime") return role === "builder" || role === "runtime";
  return owner === role;
}
