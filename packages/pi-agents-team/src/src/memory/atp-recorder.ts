import {
  rememberRecord,
  documentGoal,
  resolveEdenOptions,
  getMissingRequiredEdenOptions,
} from "./eden-memory.js";
import { recordEdenMemoryMarker } from "./memory-status.js";
import {
  ATP_MARKERS_BY_NAME,
  ATP_MARKER_OWNER,
  ATP_MARKER_STAGE,
  getMarkerSpec,
} from "./atp-markers.js";

// Re-export the marker table for callers that import the constants directly.
export {
  ATP_STAGES,
  ATP_MARKERS,
  ATP_MARKERS_BY_NAME,
  ATP_MARKER_STAGE,
  ATP_MARKER_OWNER,
  getMarkerSpec,
  isRoleAllowedForMarker,
} from "./atp-markers.js";
import type {
  AtpStage,
  AtpMarkerName,
  AtpMarkerSpec,
} from "./atp-markers.js";

/**
 * Backwards-compatible marker map. Existing callers use this to translate
 * a stage into its canonical marker name. Derived from the marker table.
 */
export const ATP_MARKER_NAMES: Readonly<Record<AtpStage, string>> = (() => {
  const out = Object.create(null) as Record<AtpStage, string>;
  for (const spec of Object.values(ATP_MARKERS_BY_NAME) as AtpMarkerSpec[]) {
    if (spec.stage && !(spec.stage in out)) {
      out[spec.stage] = spec.marker;
    }
  }
  return out;
})();

/**
 * Backwards-compatible stage-owner map. Derived from the marker table.
 */
export const ATP_STAGE_OWNERS: Readonly<Record<AtpStage, string>> = (() => {
  const out = Object.create(null) as Record<AtpStage, string>;
  for (const spec of Object.values(ATP_MARKERS_BY_NAME) as AtpMarkerSpec[]) {
    if (spec.stage && !(spec.stage in out)) {
      out[spec.stage] = spec.owner;
    }
  }
  return out;
})();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeString(value: unknown, maxLength = 2000): string {
  if (value === undefined || value === null) return "";
  let text: string;
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

/**
 * Resolve the marker name for a write. Stage-based writes use the stage's
 * primary marker; explicit marker writes use the literal name. Returns the
 * canonical marker plus its spec.
 */
function resolveMarker(input: { stage?: AtpStage; marker?: AtpMarkerName }): {
  marker: AtpMarkerName;
  spec: AtpMarkerSpec;
} {
  if (input.marker) {
    return { marker: input.marker, spec: getMarkerSpec(input.marker) };
  }
  if (input.stage) {
    const marker = ATP_MARKER_NAMES[input.stage];
    if (!marker) {
      throw new Error(`No marker mapped for stage: ${input.stage}`);
    }
    return { marker: marker as AtpMarkerName, spec: getMarkerSpec(marker as AtpMarkerName) };
  }
  throw new Error("writeStageMarker requires either a stage or a marker");
}

function buildMetadata(marker: AtpMarkerName, ctx: Record<string, unknown> = {}): Record<string, unknown> {
  const spec = getMarkerSpec(marker);
  const now = Date.now();
  const metadata: Record<string, unknown> = {
    marker,
    stage: spec.stage,
    owner: spec.owner,
    workerEvent: spec.workerEvent,
    recordedAt: now,
  };
  if (typeof ctx.goalId === "string") metadata.goalId = sanitizeString(ctx.goalId, 128);
  if (typeof ctx.taskId === "string") metadata.taskId = sanitizeString(ctx.taskId, 128);
  if (typeof ctx.workerId === "string") metadata.workerId = sanitizeString(ctx.workerId, 128);
  if (typeof ctx.profileName === "string") metadata.profileName = sanitizeString(ctx.profileName, 64);
  if (typeof ctx.packageName === "string") metadata.packageName = sanitizeString(ctx.packageName, 128);
  if (typeof ctx.requester === "string") metadata.requester = sanitizeString(ctx.requester, 64);
  if (typeof ctx.worktreePath === "string") metadata.worktreePath = sanitizeString(ctx.worktreePath, 260);
  if (typeof ctx.round === "number" && Number.isFinite(ctx.round)) metadata.round = ctx.round;
  if (typeof ctx.supersedes === "string") metadata.supersedes = sanitizeString(ctx.supersedes, 128);
  return metadata;
}

function buildMarkerLine(marker: AtpMarkerName, content: string, ctx: Record<string, unknown> = {}): string {
  const spec = getMarkerSpec(marker);
  const goal = typeof ctx.goalId === "string" ? ` goal:${sanitizeString(ctx.goalId, 64)}` : "";
  const task = typeof ctx.taskId === "string" ? ` task:${sanitizeString(ctx.taskId, 64)}` : "";
  const worker = typeof ctx.workerId === "string" ? ` worker:${sanitizeString(ctx.workerId, 64)}` : "";
  const round = typeof ctx.round === "number" && Number.isFinite(ctx.round) ? ` round:${ctx.round}` : "";
  const owner = spec.owner === "*" ? "" : ` owner:${spec.owner}`;
  const head = `${marker}${goal}${task}${worker}${owner}${round}`;
  const body = sanitizeString(content, 1500);
  return `${head}\n${body}`;
}

function buildRecord(marker: AtpMarkerName, content: string, ctx: Record<string, unknown> = {}) {
  const metadata = buildMetadata(marker, ctx);
  const goalId = typeof ctx.goalId === "string" ? sanitizeString(ctx.goalId, 64) : undefined;
  return {
    id: goalId ? `${goalId}-${marker.replace(/[\[\]]/g, "")}-${Date.now()}` : undefined,
    content: buildMarkerLine(marker, content, ctx),
    metadata,
    tags: [
      marker,
      getMarkerSpec(marker).stage ?? "non-stage",
      getMarkerSpec(marker).owner,
      typeof ctx.profileName === "string" ? ctx.profileName : undefined,
      typeof ctx.packageName === "string" ? ctx.packageName : undefined,
    ].filter((tag): tag is string => Boolean(tag)),
  };
}

async function writeMarker(
  marker: AtpMarkerName,
  content: string,
  options: Record<string, unknown> = {},
  ctx: Record<string, unknown> = {},
): Promise<{
  ok: boolean;
  marker: AtpMarkerName;
  stage?: AtpStage | null;
  memoryId?: string;
  error?: string;
  skipped?: boolean;
}> {
  const edenOptions = (options.edenOptions as Parameters<typeof getMissingRequiredEdenOptions>[0] | undefined)
    ?? resolveEdenOptions(options.env as Parameters<typeof resolveEdenOptions>[0] | undefined);
  const missing = getMissingRequiredEdenOptions(edenOptions);
  if (missing.length > 0) {
    const error = `Missing required eden-memory env fields: ${missing.join(", ")}`;
    const status = options.edenMemoryStatus as Parameters<typeof recordEdenMemoryMarker>[0] | undefined;
    if (status) {
      recordEdenMemoryMarker(status, {
        markerName: marker,
        ok: false,
        error,
        skipped: true,
      });
    }
    return { ok: false, marker, error, skipped: true };
  }
  const record = buildRecord(marker, content, ctx);
  const result = await rememberRecord(
    record,
    edenOptions as Parameters<typeof rememberRecord>[1],
    options.signal as AbortSignal | undefined,
    options.timeoutMs as number | undefined,
  );
  const status = options.edenMemoryStatus as Parameters<typeof recordEdenMemoryMarker>[0] | undefined;
  if (status) {
    recordEdenMemoryMarker(status, {
      markerName: marker,
      ok: result.ok,
      error: result.error,
      memoryId: result.id,
      goalId: typeof record.metadata.goalId === "string" ? record.metadata.goalId : undefined,
      taskId: typeof record.metadata.taskId === "string" ? record.metadata.taskId : undefined,
    });
  }
  return {
    ok: result.ok,
    marker,
    stage: ATP_MARKER_STAGE[marker] ?? null,
    memoryId: result.id,
    error: result.error,
  };
}

// Backwards-compatible stage helper.
async function writeStageMarker(
  stage: AtpStage,
  content: string,
  options: Record<string, unknown> = {},
  ctx: Record<string, unknown> = {},
) {
  const { marker, spec } = resolveMarker({ stage });
  const result = await writeMarker(marker, content, options, ctx);
  return { ...result, stage: spec.stage ?? undefined };
}

// ---------- Per-stage helpers (existing public API) ----------

export async function recordGoalReceipt(content: string, options: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  return writeStageMarker("goal-receipt", content, options, ctx);
}

export async function recordRouting(content: string, options: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  return writeStageMarker("routing", content, options, ctx);
}

export async function recordContextGathering(content: string, options: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  return writeStageMarker("context-gathering", content, options, ctx);
}

/**
 * Skip-context-gathering now writes its own marker name (`[skip-context-gathering]`)
 * rather than nesting it inside `[context-gathering]`. The stage metadata is
 * preserved so the lifecycle grouping remains correct.
 */
export async function recordSkipContextGathering(content: string, options: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  return writeMarker("[skip-context-gathering]", sanitizeString(content, 1400), options, ctx);
}

export async function recordAction(content: string, options: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  return writeStageMarker("action", content, options, ctx);
}

export async function recordVerification(content: string, options: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  return writeStageMarker("verification", content, options, ctx);
}

export async function recordRecordingAndArchival(content: string, options: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  return writeStageMarker("recording-and-archival", content, options, ctx);
}

/**
 * Stage 7 closure. Writes the literal `[closure]` marker signed by team-lead.
 */
export async function recordHandOffOrClosure(content: string, options: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  return writeStageMarker("hand-off-or-closure", content, options, ctx);
}

// ---------- New first-class record types (move 3) ----------

/**
 * Stage 4 builder contract: the artefact is ready for downstream consumers.
 * Signed by `builder`.
 */
export async function recordApiReady(content: string, options: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  return writeMarker("[api-ready]", content, options, ctx);
}

/**
 * Stage 7 ownership transfer. Distinct from `[closure]` — the goal is not
 * finished, it is being moved to another role or package. Signed by the
 * archivist (per the marker table).
 */
export async function recordHandOff(content: string, options: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  return writeMarker("[handoff]", content, options, ctx);
}

/**
 * Goal-level closure marker. Distinct from the session-shutdown `[closure]`
 * record: this one is per-goal. The dispatcher or archivist calls this when
 * a goal's lifecycle is fully complete.
 */
export async function recordClosure(content: string, options: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  return writeMarker("[closure]", content, options, ctx);
}

/**
 * Stop-the-line report. Any role may write `[andon]`; the marker table's
 * owner is `*` and the dispatcher does not gate it.
 */
export async function recordAndon(reason: string, error: string | undefined, options: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  const parts = [reason];
  if (error) parts.push(`error:${error}`);
  return writeMarker("[andon]", parts.join(" "), options, ctx);
}

/**
 * Escalation to the human operator. Required fields per the marker doc:
 * `question:`, `context:`, `options:`, `default-if-silent:`. Caller is the
 * dispatcher.
 */
export interface EscalationFields {
  question: string;
  context?: string;
  options?: string[];
  defaultIfSilent?: string;
}

export async function recordEscalation(fields: EscalationFields, options: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) {
  const opts = (fields.options ?? []).map((o) => `- ${o}`).join("\n");
  const lines = [
    `question:${fields.question}`,
    fields.context ? `context:${fields.context}` : null,
    opts ? `options:\n${opts}` : null,
    fields.defaultIfSilent ? `default-if-silent:${fields.defaultIfSilent}` : null,
  ].filter(Boolean);
  return writeMarker("[escalation]", lines.join("\n"), options, ctx);
}

// ---------- Per-profile dispatch (unchanged behaviour) ----------

const PROFILE_STAGE_DISPATCH: Record<string, (content: string, options: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<ReturnType<typeof writeStageMarker>>> = {
  researcher: recordContextGathering,
  verifier: recordVerification,
  archivist: recordRecordingAndArchival,
  builder: recordAction,
  runtime: recordAction,
};

export async function recordTerminalStageForProfile(
  profileName: string,
  content: string,
  options: Record<string, unknown> = {},
  ctx: Record<string, unknown> = {},
) {
  const recorder = PROFILE_STAGE_DISPATCH[profileName];
  if (!recorder) return { ok: true, skipped: true };
  return recorder(content, options, ctx);
}

// ---------- Worker-event helpers (move 2) ----------
//
// Worker events now write their literal marker names (`[worker-terminal]`,
// `[worker-relay]`, `[worker-pruned]`) with the actual signer in metadata
// — orchestrator for terminal/relay, archivist for pruned. The stage
// metadata is still `recording-and-archival` so the durable-record grouping
// is preserved, but the marker name and owner no longer lie.

export async function recordWorkerTerminal(
  workerId: string,
  status: string,
  summary: string,
  options: Record<string, unknown> = {},
  ctx: Record<string, unknown> = {},
) {
  const content = `worker:${sanitizeString(workerId, 64)} status:${sanitizeString(status, 32)} ${sanitizeString(summary, 1200)}`;
  return writeMarker("[worker-terminal]", content, options, { ...ctx, workerId, status });
}

export async function recordWorkerRelay(
  workerId: string,
  question: string,
  assumption: string,
  options: Record<string, unknown> = {},
  ctx: Record<string, unknown> = {},
) {
  const content = `worker:${sanitizeString(workerId, 64)} question:${sanitizeString(question, 700)} assumption:${sanitizeString(assumption, 700)}`;
  return writeMarker("[worker-relay]", content, options, { ...ctx, workerId, relayQuestion: question });
}

export async function recordWorkerPrune(
  prunedCount: number,
  usageTotals: Record<string, unknown>,
  options: Record<string, unknown> = {},
  ctx: Record<string, unknown> = {},
) {
  const merged = {
    ...ctx,
    prunedUsage: isRecord(usageTotals) ? usageTotals : undefined,
  };
  return writeMarker(
    "[worker-pruned]",
    `count:${prunedCount} totals:${sanitizeString(usageTotals, 700)}`,
    options,
    merged,
  );
}

// ---------- Document generation (unchanged) ----------

export async function generateStageSummary(
  options: Parameters<typeof documentGoal>[0],
  signal?: AbortSignal,
  timeoutMs?: number,
) {
  const result = await documentGoal({ ...options, format: "md", audience: "agent" }, signal, timeoutMs);
  return {
    ok: result.ok,
    output: result.output,
    error: result.error,
  };
}

export const _testing = {
  ATP_MARKER_NAMES,
  ATP_STAGE_OWNERS,
  ATP_MARKER_OWNER,
  buildMetadata,
  buildMarkerLine,
  buildRecord,
  sanitizeString,
  resolveMarker,
};
