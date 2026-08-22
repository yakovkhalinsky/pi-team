/**
 * Phase 1 eden-memory UI/UX surfacing.
 *
 * Centralizes eden-memory health polling and async write result aggregation.
 * The tracker exposes a plain, mutable status object that UI code can read
 * on every render, and it updates itself when memory writes complete or when
 * a health check resolves. Notifications are one-time per distinct failure
 * signature (error message + lock flag).
 */

/**
 * Maximum ATP lifecycle events retained per worker. Keeps the UI snippet
 * short while still showing a useful recent tail.
 */
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

function notificationSignature(error, locked) {
  return `${locked ? "locked:" : "err:"}${error ?? ""}`;
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
  };

  let timer;
  let runningHealthCheck = false;
  let lastNotifiedSignature;

  function maybeNotify() {
    if (!status.enabled) return undefined;
    const signature = notificationSignature(status.lastError, status.locked);
    if (status.healthy === false || status.locked || status.lastError) {
      if (lastNotifiedSignature === signature) return undefined;
      lastNotifiedSignature = signature;
      if (status.locked) return "Eden memory locked by another process";
      if (status.lastError) return `Eden memory failed: ${status.lastError}`;
      return "Eden memory unhealthy";
    }
    return undefined;
  }

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
      const result = await options.health(options.edenOptions);
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

  function consumeNotification() {
    return maybeNotify();
  }

  return {
    status,
    updateFromWriteResult,
    updateFromHealthResult,
    startPolling,
    stopPolling,
    consumeNotification,
  };
}

/**
 * Compact memory glyph for narrow UI surfaces.
 */
export function getMemoryStatusGlyph(status) {
  if (!status || !status.enabled) return "";
  if (status.locked) return "🔒";
  if (status.lastError) return "⚠";
  if (status.healthy === false) return "✗";
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
  else if (status.recordsFailed > 0) parts.push(`${status.recordsFailed} failed`);
  else if (status.healthy === true) parts.push("ok");
  const summary = parts.join(" ") || "memory";
  return `${glyph} ${summary}`.trim();
}

/**
 * Record a single ATP marker result against a worker's eden-memory status.
 * Mutates the supplied status in place, maintaining a short event history
 * and updating derived counters. Safe to call with undefined/disabled status.
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
  status.recordCount = (status.recordCount ?? 0) + 1;
  if (result.skipped) {
    status.recordsSkipped = (status.recordsSkipped ?? 0) + 1;
  } else if (result.ok) {
    status.recordsWritten = (status.recordsWritten ?? 0) + 1;
  } else {
    status.recordsFailed = (status.recordsFailed ?? 0) + 1;
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
 * One-line memory/archival status suitable for tool-result formatters.
 * Returns undefined when memory is disabled or absent so callers can skip it.
 */
export function formatWorkerMemoryLine(status) {
  if (!status || !status.enabled) return undefined;
  const glyph = getMemoryStatusGlyph(status);
  const parts = [];
  if (status.lastMarkerName) parts.push(`last=${status.lastMarkerName}`);
  parts.push(`records=${status.recordCount ?? 0}`);
  if (status.lastError) parts.push(`err=${status.lastError}`);
  const fragment = parts.join(" · ");
  return `${glyph} Memory · ${fragment}`.trim();
}

/**
 * Aggregate eden-memory counters across a team-level status and any number of
 * per-worker statuses. Returns undefined when no status is enabled, so callers
 * can hide the line entirely.
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
  return {
    enabled: true,
    recordsWritten: statuses.reduce((sum, s) => sum + (s.recordsWritten ?? 0), 0),
    recordsFailed: statuses.reduce((sum, s) => sum + (s.recordsFailed ?? 0), 0),
    recordsSkipped: statuses.reduce((sum, s) => sum + (s.recordsSkipped ?? 0), 0),
    recordCount: statuses.reduce((sum, s) => sum + (s.recordCount ?? 0), 0),
    locked: statuses.some((s) => s.locked),
    healthy: statuses.some((s) => s.healthy === false) ? false : statuses.some((s) => s.healthy === true) ? true : undefined,
    lastError: statuses.map((s) => s.lastError).filter(Boolean)[0],
  };
}

export const _testing = {
  normalizeError,
  notificationSignature,
  MAX_EVENT_HISTORY,
  aggregateEdenMemoryStatus,
};
