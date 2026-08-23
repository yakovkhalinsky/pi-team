/**
 * Phase 1 eden-memory UI/UX surfacing.
 *
 * Centralizes eden-memory health polling and async write result aggregation.
 * The tracker exposes a plain, mutable status object that UI code can read
 * on every render, and it updates itself when memory writes complete or when
 * a health check resolves.
 *
 * Status model:
 *   - per-write counters (recordsWritten/Failed/Skipped) come straight from
 *     the recorder's perspective: one increment per marker write attempt.
 *   - byMarker is the histogram that UI consumers actually want: per-marker
 *     counts and last-write timestamps, so the orchestrator can see whether
 *     the lifecycle actually completed.
 *   - No duplicate `recordCount` field; the three counters sum to the total.
 */

import { ATP_MARKERS_BY_NAME, type AtpMarkerName } from "./atp-markers.js";

const MAX_EVENT_HISTORY = 8;

function nowMs(): number {
  return Date.now();
}

function normalizeError(result: { error?: unknown }): string | undefined {
  if (result.error === undefined || result.error === null) return undefined;
  if (typeof result.error === "string") return result.error.trim() || undefined;
  if (result.error instanceof Error) return result.error.message.trim() || undefined;
  try {
    return String(result.error).trim() || undefined;
  } catch {
    return undefined;
  }
}

export interface MarkerBucket {
  ok: number;
  error: number;
  skipped: number;
  lastTs?: number;
}

export interface EdenMemoryEvent {
  markerName: AtpMarkerName;
  ok: boolean;
  error?: string;
  memoryId?: string;
  ts: number;
}

export interface EdenMemoryMarkerResult {
  markerName: AtpMarkerName;
  ok: boolean;
  error?: string;
  memoryId?: string;
  goalId?: string;
  taskId?: string;
  ts?: number;
  skipped?: boolean;
}

export interface EdenMemoryWriteResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface EdenMemoryHealthResult {
  ok: boolean;
  locked?: boolean;
  error?: string;
}

export interface EdenMemoryStatus {
  enabled: boolean;
  healthy: boolean | undefined;
  locked: boolean;
  recordsWritten: number;
  recordsFailed: number;
  recordsSkipped: number;
  lastError: string | undefined;
  lastHealthCheckAt: number | undefined;
  lastWriteAt: number | undefined;
  lastMarkerName?: AtpMarkerName;
  lastResult?: "ok" | "skipped" | "error";
  goalMemoryIds?: string[];
  taskMemoryIds?: string[];
  eventHistory?: EdenMemoryEvent[];
  /** Per-marker histogram. Keys are marker names from the canonical table. */
  byMarker?: Partial<Record<AtpMarkerName, MarkerBucket>>;
}

/**
 * Initial empty bucket for every marker in the canonical table. UI consumers
 * can rely on `byMarker[marker]` being defined for every marker name.
 */
function emptyByMarker(): Partial<Record<AtpMarkerName, MarkerBucket>> {
  const out: Partial<Record<AtpMarkerName, MarkerBucket>> = {};
  for (const name of Object.keys(ATP_MARKERS_BY_NAME) as AtpMarkerName[]) {
    out[name] = { ok: 0, error: 0, skipped: 0 };
  }
  return out;
}

/**
 * Create a fresh per-worker eden-memory status object.
 * Callers may mutate this object directly; the ATP recorder updates it
 * in place as lifecycle markers are written.
 */
export function createWorkerEdenMemoryStatus(enabled: boolean): EdenMemoryStatus {
  return {
    enabled,
    healthy: undefined,
    locked: false,
    recordsWritten: 0,
    recordsFailed: 0,
    recordsSkipped: 0,
    lastError: undefined,
    lastHealthCheckAt: undefined,
    lastWriteAt: undefined,
    byMarker: enabled ? emptyByMarker() : undefined,
  };
}

/**
 * Ensure a worker state carries an enabled eden-memory status when memory
 * is configured. Safe to call repeatedly; preserves an existing enabled status.
 */
export function ensureWorkerEdenMemoryStatus(
  worker: { edenMemoryStatus?: EdenMemoryStatus },
  config: { memory?: { edenMemory?: { enabled?: boolean } } } | undefined,
): void {
  const enabled = config?.memory?.edenMemory?.enabled === true;
  if (!enabled) return;
  if (!worker.edenMemoryStatus || worker.edenMemoryStatus.enabled !== true) {
    worker.edenMemoryStatus = createWorkerEdenMemoryStatus(true);
  }
}

/**
 * Create a live memory status tracker.
 *
 * When `health` is provided, startPolling() begins a bounded interval that
 * calls it and updates status.healthy / status.locked. Call stopPolling()
 * before teardown to release the timer.
 */
export function createMemoryStatusTracker(
  options: {
    enabled: boolean;
    health?: (
      options?: Record<string, unknown>,
      signal?: AbortSignal,
      timeoutMs?: number,
    ) => Promise<EdenMemoryHealthResult>;
    edenOptions?: Record<string, unknown>;
    healthIntervalMs?: number;
    healthTimeoutMs?: number;
  },
): {
  status: EdenMemoryStatus;
  updateFromWriteResult: (result: EdenMemoryWriteResult) => void;
  updateFromHealthResult: (result: EdenMemoryHealthResult) => void;
  startPolling: () => void;
  stopPolling: () => void;
} {
  const status: EdenMemoryStatus = {
    enabled: options.enabled,
    healthy: undefined,
    locked: false,
    recordsWritten: 0,
    recordsFailed: 0,
    recordsSkipped: 0,
    lastError: undefined,
    lastHealthCheckAt: undefined,
    lastWriteAt: undefined,
    byMarker: options.enabled ? emptyByMarker() : undefined,
  };

  let timer: NodeJS.Timeout | undefined;
  let runningHealthCheck = false;

  function updateFromWriteResult(result: EdenMemoryWriteResult): void {
    status.lastWriteAt = nowMs();
    if (result.ok) {
      status.recordsWritten += 1;
      return;
    }
    status.recordsFailed += 1;
    status.lastError = normalizeError(result);
  }

  function updateFromHealthResult(result: EdenMemoryHealthResult): void {
    status.lastHealthCheckAt = nowMs();
    status.healthy = result.ok && !result.locked;
    status.locked = result.locked === true;
    if (!status.healthy) {
      status.lastError = normalizeError(result);
    } else {
      status.lastError = undefined;
    }
  }

  async function runHealthCheck(): Promise<void> {
    if (!options.enabled || !options.health || runningHealthCheck) return;
    runningHealthCheck = true;
    try {
      const timeoutMs = options.healthTimeoutMs ?? 10_000;
      const timeout = new Promise<never>((_, reject) => {
        const id = setTimeout(
          () => reject(new Error(`Eden-memory health check timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
        if (typeof id.unref === "function") id.unref();
      });
      const result = await Promise.race([
        options.health(options.edenOptions, AbortSignal.timeout(timeoutMs), timeoutMs),
        timeout,
      ]);
      updateFromHealthResult(result);
    } catch (error) {
      updateFromHealthResult({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      runningHealthCheck = false;
    }
  }

  function startPolling(): void {
    if (timer || !options.enabled || !options.health) return;
    void runHealthCheck();
    timer = setInterval(() => {
      void runHealthCheck();
    }, Math.max(5_000, options.healthIntervalMs ?? 30_000));
    if (typeof timer.unref === "function") timer.unref();
  }

  function stopPolling(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = undefined;
  }

  return { status, updateFromWriteResult, updateFromHealthResult, startPolling, stopPolling };
}

/**
 * Compact memory glyph for narrow UI surfaces.
 *
 * Severity order (highest priority first):
 *   locked → error → warning (last error) → skipped (last write) → ok → unknown
 */
export function getMemoryStatusGlyph(status: EdenMemoryStatus | undefined): string {
  if (!status || !status.enabled) return "";
  if (status.locked) return "🔒";
  if (status.healthy === false) return "✗";
  if (status.lastResult === "error") return "✗";
  if (status.lastError) return "⚠";
  if (status.lastResult === "skipped") return "–";
  if (status.healthy === true) return "✓";
  return "◌";
}

/**
 * Short human-readable memory status fragment for wider UI surfaces.
 * Never includes record content.
 */
export function formatMemoryStatusFragment(status: EdenMemoryStatus | undefined): string {
  if (!status || !status.enabled) return "";
  const glyph = getMemoryStatusGlyph(status);
  const parts: string[] = [];
  if (status.locked) parts.push("locked");
  else if (status.healthy === false) parts.push("unhealthy");
  else if (status.lastResult === "skipped") parts.push(`${status.recordsSkipped} skipped`);
  else if (status.recordsFailed > 0) parts.push(`${status.recordsFailed} failed`);
  else if (status.healthy === true) parts.push("ok");
  const summary = parts.join(" ") || "memory";
  return `${glyph} ${summary}`.trim();
}

/**
 * Record a single ATP marker result against a worker's eden-memory status.
 * Mutates the supplied status in place, updating the per-marker histogram and
 * derived counters. Safe to call with undefined/disabled status.
 */
export function recordEdenMemoryMarker(
  status: EdenMemoryStatus | undefined,
  result: EdenMemoryMarkerResult,
): void {
  if (!status || !status.enabled) return;
  const ts = result.ts ?? nowMs();
  const event: EdenMemoryEvent = {
    markerName: result.markerName,
    ok: result.ok,
    error: result.error,
    memoryId: result.memoryId,
    ts,
  };
  status.eventHistory = status.eventHistory ?? [];
  status.eventHistory.push(event);
  if (status.eventHistory.length > MAX_EVENT_HISTORY) {
    status.eventHistory.shift();
  }

  // Per-marker histogram. Buckets are pre-initialised in
  // emptyByMarker() so this is always safe.
  const bucket = (status.byMarker ?? (status.byMarker = emptyByMarker()))[result.markerName] ??= {
    ok: 0,
    error: 0,
    skipped: 0,
  };
  bucket.lastTs = ts;
  if (result.skipped) bucket.skipped += 1;
  else if (result.ok) bucket.ok += 1;
  else bucket.error += 1;

  if (result.skipped) {
    status.recordsSkipped += 1;
  } else if (result.ok) {
    status.recordsWritten += 1;
  } else {
    status.recordsFailed += 1;
  }
  status.lastMarkerName = result.markerName;
  status.lastResult = result.ok ? "ok" : result.skipped ? "skipped" : "error";
  if (!result.ok && result.error) {
    status.lastError = result.error;
  }
  if (result.goalId && result.ok && result.memoryId) {
    status.goalMemoryIds = status.goalMemoryIds ?? [];
    if (!status.goalMemoryIds.includes(result.memoryId)) {
      status.goalMemoryIds.push(result.memoryId);
    }
  }
  if (result.taskId && result.ok && result.memoryId) {
    status.taskMemoryIds = status.taskMemoryIds ?? [];
    if (!status.taskMemoryIds.includes(result.memoryId)) {
      status.taskMemoryIds.push(result.memoryId);
    }
  }
  status.lastWriteAt = ts;
}

/**
 * Format one ATP event as a short, content-free line for activity timelines.
 */
export function formatEdenMemoryEvent(event: EdenMemoryEvent): string {
  const glyph = event.ok ? "✓" : "✗";
  return `${glyph} ${event.markerName}`;
}

/**
 * Aggregate eden-memory counters across a team-level status and any number of
 * per-worker statuses. Returns undefined when no status is enabled, so callers
 * can hide the line entirely.
 *
 * The aggregate carries a per-marker histogram so the orchestrator can see
 * which lifecycle markers actually landed.
 */
export interface EdenMemoryAggregateStatus {
  enabled: true;
  recordsWritten: number;
  recordsFailed: number;
  recordsSkipped: number;
  locked: boolean;
  healthy: boolean | undefined;
  lastError: string | undefined;
  byMarker: Partial<Record<AtpMarkerName, MarkerBucket>>;
  totals: { ok: number; error: number; skipped: number; lastTs?: number };
}

export function aggregateEdenMemoryStatus(
  teamStatus: EdenMemoryStatus | undefined,
  workers: { edenMemoryStatus?: EdenMemoryStatus }[] | undefined,
): EdenMemoryAggregateStatus | undefined {
  const statuses: EdenMemoryStatus[] = [];
  if (teamStatus && teamStatus.enabled) statuses.push(teamStatus);
  for (const worker of workers ?? []) {
    if (worker.edenMemoryStatus && worker.edenMemoryStatus.enabled) {
      statuses.push(worker.edenMemoryStatus);
    }
  }
  if (statuses.length === 0) return undefined;

  const byMarker: Partial<Record<AtpMarkerName, MarkerBucket>> = emptyByMarker();
  const totals: MarkerBucket = { ok: 0, error: 0, skipped: 0 };

  for (const s of statuses) {
    for (const [name, bucket] of Object.entries(s.byMarker ?? {}) as [AtpMarkerName, MarkerBucket][]) {
      const target = byMarker[name]!;
      target.ok += bucket.ok;
      target.error += bucket.error;
      target.skipped += bucket.skipped;
      if (bucket.lastTs && (!target.lastTs || bucket.lastTs > target.lastTs)) {
        target.lastTs = bucket.lastTs;
      }
    }
  }
  for (const bucket of Object.values(byMarker) as MarkerBucket[]) {
    totals.ok += bucket.ok;
    totals.error += bucket.error;
    totals.skipped += bucket.skipped;
  }

  return {
    enabled: true,
    recordsWritten: totals.ok,
    recordsFailed: totals.error,
    recordsSkipped: totals.skipped,
    locked: statuses.some((s) => s.locked),
    healthy: statuses.some((s) => s.healthy === false)
      ? false
      : statuses.some((s) => s.healthy === true)
        ? true
        : undefined,
    lastError: statuses.map((s) => s.lastError).filter((e): e is string => Boolean(e))[0],
    byMarker,
    totals,
  };
}

export const _testing = {
  normalizeError,
  MAX_EVENT_HISTORY,
  emptyByMarker,
  aggregateEdenMemoryStatus,
};
