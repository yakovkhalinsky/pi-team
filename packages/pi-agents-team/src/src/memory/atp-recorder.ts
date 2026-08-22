import {
  rememberRecord,
  documentGoal,
  resolveEdenOptions,
  getMissingRequiredEdenOptions,
} from "./eden-memory.js";

/**
 * ATP lifecycle stages, mirroring `.pi-team/reference/task-lifecycle.md` and
 * `.pi-team/reference/markers.md`.
 */
export const ATP_STAGES = [
  "goal-receipt",
  "routing",
  "context-gathering",
  "action",
  "verification",
  "recording-and-archival",
  "hand-off-or-closure",
];

export const ATP_MARKER_NAMES = {
  "goal-receipt": "[goal-received]",
  routing: "[routing]",
  "context-gathering": "[context-gathering]",
  action: "[action]",
  verification: "[verdict]",
  "recording-and-archival": "[recorded]",
  "hand-off-or-closure": "[closure]",
};

export const ATP_STAGE_OWNERS = {
  "goal-receipt": "team-lead",
  routing: "dispatcher",
  "context-gathering": "researcher",
  action: "builder|runtime",
  verification: "verifier",
  "recording-and-archival": "archivist",
  "hand-off-or-closure": "team-lead",
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeString(value, maxLength = 2000) {
  if (value === undefined || value === null) return "";
  let text;
  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  text = text.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function buildMetadata(stage, ctx = {}) {
  const now = Date.now();
  const metadata = {
    marker: ATP_MARKER_NAMES[stage],
    stage,
    owner: ATP_STAGE_OWNERS[stage],
    recordedAt: now,
  };
  if (ctx.goalId) metadata.goalId = sanitizeString(ctx.goalId, 128);
  if (ctx.taskId) metadata.taskId = sanitizeString(ctx.taskId, 128);
  if (ctx.workerId) metadata.workerId = sanitizeString(ctx.workerId, 128);
  if (ctx.profileName) metadata.profileName = sanitizeString(ctx.profileName, 64);
  if (ctx.packageName) metadata.packageName = sanitizeString(ctx.packageName, 128);
  if (ctx.requester) metadata.requester = sanitizeString(ctx.requester, 64);
  if (ctx.worktreePath) metadata.worktreePath = sanitizeString(ctx.worktreePath, 260);
  if (typeof ctx.round === "number" && Number.isFinite(ctx.round)) metadata.round = ctx.round;
  if (ctx.supersedes) metadata.supersedes = sanitizeString(ctx.supersedes, 128);
  return metadata;
}

function buildMarkerLine(stage, content, ctx = {}) {
  const marker = ATP_MARKER_NAMES[stage];
  const owner = ATP_STAGE_OWNERS[stage];
  const goal = ctx.goalId ? ` goal:${sanitizeString(ctx.goalId, 64)}` : "";
  const task = ctx.taskId ? ` task:${sanitizeString(ctx.taskId, 64)}` : "";
  const worker = ctx.workerId ? ` worker:${sanitizeString(ctx.workerId, 64)}` : "";
  const round = typeof ctx.round === "number" && Number.isFinite(ctx.round) ? ` round:${ctx.round}` : "";
  const head = `${marker}${goal}${task}${worker} owner:${owner}${round}`;
  const body = sanitizeString(content, 1500);
  return `${head}\n${body}`;
}

function buildRecord(stage, content, ctx = {}) {
  const metadata = buildMetadata(stage, ctx);
  return {
    id: ctx.goalId ? `${sanitizeString(ctx.goalId, 64)}-${stage}-${Date.now()}` : undefined,
    content: buildMarkerLine(stage, content, ctx),
    metadata,
    tags: [stage, ATP_STAGE_OWNERS[stage], ctx.profileName, ctx.packageName].filter((tag) => Boolean(tag)),
  };
}

async function writeStageMarker(stage, content, options = {}, ctx = {}) {
  const edenOptions = options.edenOptions ?? resolveEdenOptions(options.env);
  const missing = getMissingRequiredEdenOptions(edenOptions);
  if (missing.length > 0) {
    return {
      ok: false,
      stage,
      marker: ATP_MARKER_NAMES[stage],
      error: `Missing required eden-memory env fields: ${missing.join(", ")}`,
      skipped: true,
    };
  }
  const record = buildRecord(stage, content, ctx);
  const result = await rememberRecord(record, edenOptions, options.signal);
  return {
    ok: result.ok,
    stage,
    marker: ATP_MARKER_NAMES[stage],
    memoryId: result.id,
    error: result.error,
  };
}

export async function recordGoalReceipt(content, options, ctx) {
  return writeStageMarker("goal-receipt", content, options, ctx);
}

export async function recordRouting(content, options, ctx) {
  return writeStageMarker("routing", content, options, ctx);
}

export async function recordContextGathering(content, options, ctx) {
  return writeStageMarker("context-gathering", content, options, ctx);
}

export async function recordSkipContextGathering(content, options, ctx) {
  return writeStageMarker("context-gathering", `[skip-context-gathering] ${sanitizeString(content, 1400)}`, options, ctx);
}

export async function recordAction(content, options, ctx) {
  return writeStageMarker("action", content, options, ctx);
}

export async function recordVerification(content, options, ctx) {
  return writeStageMarker("verification", content, options, ctx);
}

export async function recordRecordingAndArchival(content, options, ctx) {
  return writeStageMarker("recording-and-archival", content, options, ctx);
}

export async function recordHandOffOrClosure(content, options, ctx) {
  return writeStageMarker("hand-off-or-closure", content, options, ctx);
}

const PROFILE_STAGE_DISPATCH = {
  researcher: recordContextGathering,
  verifier: recordVerification,
  archivist: recordRecordingAndArchival,
  builder: recordAction,
  runtime: recordAction,
};

export async function recordTerminalStageForProfile(profileName, content, options, ctx) {
  const recorder = PROFILE_STAGE_DISPATCH[profileName];
  if (!recorder) return { ok: true, skipped: true };
  return recorder(content, options, ctx);
}

export async function recordWorkerTerminal(workerId, status, summary, options, ctx) {
  const merged = {
    ...ctx,
    workerId,
    status,
  };
  return writeStageMarker(
    "recording-and-archival",
    `[worker-terminal] worker:${sanitizeString(workerId, 64)} status:${sanitizeString(status, 32)} ${sanitizeString(summary, 1200)}`,
    options,
    merged,
  );
}

export async function recordWorkerRelay(workerId, question, assumption, options, ctx) {
  const merged = {
    ...ctx,
    workerId,
    relayQuestion: question,
  };
  return writeStageMarker(
    "recording-and-archival",
    `[worker-relay] worker:${sanitizeString(workerId, 64)} question:${sanitizeString(question, 700)} assumption:${sanitizeString(assumption, 700)}`,
    options,
    merged,
  );
}

export async function recordWorkerPrune(prunedCount, usageTotals, options, ctx) {
  const merged = {
    ...ctx,
    prunedUsage: isRecord(usageTotals) ? usageTotals : undefined,
  };
  return writeStageMarker(
    "recording-and-archival",
    `[worker-pruned] count:${prunedCount} totals:${sanitizeString(usageTotals, 700)}`,
    options,
    merged,
  );
}

/**
 * Ask eden-memory to produce a goal/topic document from the durable record.
 * Safe wrapper: failures return an empty output rather than throwing.
 */
export async function generateStageSummary(options, signal) {
  const result = await documentGoal({ ...options, format: "md", audience: "agent" }, signal);
  return {
    ok: result.ok,
    output: result.output,
    error: result.error,
  };
}

export const _testing = {
  ATP_MARKER_NAMES,
  ATP_STAGE_OWNERS,
  buildMetadata,
  buildMarkerLine,
  buildRecord,
  sanitizeString,
};
