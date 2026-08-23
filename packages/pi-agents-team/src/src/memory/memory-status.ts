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
 *
 * NOTE: This file is shipped as plain JavaScript (the build script copies
 * .ts -> .js verbatim). Type annotations live in memory-status.d.ts. Do not
 * introduce TypeScript syntax here that Node cannot parse.
 */

import { ATP_MARKERS_BY_NAME } from "./atp-markers.js";

const MAX_EVENT_HISTORY = 8;

function nowMs() {
  return Date.now();
}

function normalizeError(result) {
  if (result.error === undefined || result.error === null) return undefined;
  if (typeof result.error === "string") return result.error.trim() || undefined;
  if (result.error instanceof Error) return result.error.message.trim() || undefined;
  try {
    return String(result.error).trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Initial empty bucket for every marker in the canonical table. UI consumers
 * can rely on `byMarker[marker]` being defined for every marker name.
 */
function emptyByMarker() {
  const out = Object.create(null);
  for (const name of Object.keys(ATP_MARKERS_BY_NAME)) {
    out[name] = { ok: 0, error: 0, skipped: 0 };
  }
  return out;
}

/**
 * Create a fresh per-worker eden-memory status object.
 * Callers may mutate this object directly; the ATP recorder updates it
 * in place as lifecycle markers are written.
 */
export function createWorkerEdenMemoryStatus(enabled) {
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
export function ensureWorkerEdenMemoryStatus(worker, config) {
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
export function createMemoryStatusTracker(options) {
  const status = {
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

  let timer;
  let runningHealthCheck = false;

  function updateFromWriteResult(result) {
    status.lastWriteAt = nowMs();
    if (result.ok) {
      status.recordsWritten += 1;
      return;
    }
    status.recordsFailed += 1;
    status.lastError = normalizeError(result);
  }

  function updateFromHealthResult(result) {
    status.lastHealthCheckAt = nowMs();
    status.healthy = result.ok && !result.locked;
    status.locked = result.locked === true;
    if (!status.healthy) {
      status.lastError = normalizeError(result);
    } else {
      status.lastError = undefined;
    }
  }

  async function runHealthCheck() {
    if (!options.enabled || !options.health || runningHealthCheck) return;
    runningHealthCheck = true;
    try {
      const timeoutMs = options.healthTimeoutMs ?? 10_000;
      const timeout = new Promise((_, reject) => {
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

  function startPolling() {
    if (timer || !options.enabled || !options.health) return;
    void runHealthCheck();
    timer = setInterval(() => {
      void runHealthCheck();
    }, Math.max(5_000, options.healthIntervalMs ?? 30_000));
    if (typeof timer.unref === "function") timer.unref();
  }

  function stopPolling() {
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
export function getMemoryStatusGlyph(status) {
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
export function formatMemoryStatusFragment(status) {
  if (!status || !status.enabled) return "";
  const glyph = getMemoryStatusGlyph(status);
  const parts = [];
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
export function recordEdenMemoryMarker(status, result) {
  if (!status || !status.enabled) return;
  const ts = result.ts ?? nowMs();
  const event = {
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
  status.byMarker = status.byMarker ?? emptyByMarker();
  const bucket = status.byMarker[result.markerName] ?? (status.byMarker[result.markerName] = {
    ok: 0,
    error: 0,
    skipped: 0,
  });
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
export function formatEdenMemoryEvent(event) {
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
export function aggregateEdenMemoryStatus(teamStatus, workers) {
  const statuses = [];
  if (teamStatus && teamStatus.enabled) statuses.push(teamStatus);
  for (const worker of workers ?? []) {
    if (worker.edenMemoryStatus && worker.edenMemoryStatus.enabled) {
      statuses.push(worker.edenMemoryStatus);
    }
  }
  if (statuses.length === 0) return undefined;

  const byMarker = emptyByMarker();
  const totals = { ok: 0, error: 0, skipped: 0 };

  for (const s of statuses) {
    for (const [name, bucket] of Object.entries(s.byMarker ?? {})) {
      const target = byMarker[name];
      target.ok += bucket.ok;
      target.error += bucket.error;
      target.skipped += bucket.skipped;
      if (bucket.lastTs && (!target.lastTs || bucket.lastTs > target.lastTs)) {
        target.lastTs = bucket.lastTs;
      }
    }
  }
  for (const bucket of Object.values(byMarker)) {
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
    lastError: statuses.map((s) => s.lastError).filter((e) => Boolean(e))[0],
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
