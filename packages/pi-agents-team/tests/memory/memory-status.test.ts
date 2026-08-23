import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateEdenMemoryStatus,
  createMemoryStatusTracker,
  formatEdenMemoryEvent,
  formatMemoryStatusFragment,
  getMemoryStatusGlyph,
  recordEdenMemoryMarker,
  ensureWorkerEdenMemoryStatus,
  createWorkerEdenMemoryStatus,
} from "../../src/src/memory/memory-status.js";

describe("memory/memory-status", () => {
  describe("createMemoryStatusTracker", () => {
    it("starts with a clean disabled status when not enabled", () => {
      const tracker = createMemoryStatusTracker({ enabled: false });
      assert.equal(tracker.status.enabled, false);
      assert.equal(tracker.status.healthy, undefined);
      assert.equal(tracker.status.recordsWritten, 0);
      assert.equal(tracker.status.recordsFailed, 0);
      assert.equal(tracker.status.recordsSkipped, 0);
      assert.equal(tracker.status.byMarker, undefined);
    });

    it("pre-initialises the byMarker histogram when enabled", () => {
      const tracker = createMemoryStatusTracker({ enabled: true });
      assert.ok(tracker.status.byMarker);
      assert.ok(tracker.status.byMarker?.["[action]"]);
      assert.equal(tracker.status.byMarker?.["[action]"]?.ok, 0);
    });

    it("increments recordsWritten on successful writes", () => {
      const tracker = createMemoryStatusTracker({ enabled: true });
      tracker.updateFromWriteResult({ ok: true });
      tracker.updateFromWriteResult({ ok: true });
      assert.equal(tracker.status.recordsWritten, 2);
      assert.equal(tracker.status.recordsFailed, 0);
      assert.equal(tracker.status.healthy, undefined);
    });

    it("increments recordsFailed and stores lastError on failed writes", () => {
      const tracker = createMemoryStatusTracker({ enabled: true });
      tracker.updateFromWriteResult({ ok: false, error: "disk full" });
      assert.equal(tracker.status.recordsWritten, 0);
      assert.equal(tracker.status.recordsFailed, 1);
      assert.equal(tracker.status.lastError, "disk full");
    });
  });

  describe("polling", () => {
    it("calls health on startPolling and reports failure", async () => {
      let calls = 0;
      const tracker = createMemoryStatusTracker({
        enabled: true,
        health: async () => {
          calls += 1;
          return { ok: false, error: "unreachable" };
        },
        healthIntervalMs: 10,
      });
      tracker.startPolling();
      await new Promise((resolve) => setTimeout(resolve, 30));
      tracker.stopPolling();
      assert.ok(calls >= 1, `expected at least one health call, got ${calls}`);
      assert.equal(tracker.status.healthy, false);
      assert.equal(tracker.status.lastError, "unreachable");
    });

    it("caps health checks with a timeout", async () => {
      let calls = 0;
      const tracker = createMemoryStatusTracker({
        enabled: true,
        health: async (_options, signal) => {
          calls += 1;
          return new Promise((resolve, reject) => {
            const id = setTimeout(() => resolve({ ok: true }), 60_000);
            signal.addEventListener("abort", () => {
              clearTimeout(id);
              reject(new Error("aborted"));
            }, { once: true });
          });
        },
        healthTimeoutMs: 50,
        healthIntervalMs: 10,
      });
      tracker.startPolling();
      await new Promise((resolve) => setTimeout(resolve, 150));
      tracker.stopPolling();
      assert.ok(calls >= 1, `expected at least one health call, got ${calls}`);
      assert.equal(tracker.status.healthy, false);
      assert.ok(tracker.status.lastError?.includes("timed out"), tracker.status.lastError);
    });
  });

  describe("per-worker ATP lifecycle tracking", () => {
    it("records marker results into event history and the byMarker histogram", () => {
      const status = createMemoryStatusTracker({ enabled: true }).status;
      recordEdenMemoryMarker(status, { markerName: "[action]", ok: true, memoryId: "m1", goalId: "g1", taskId: "t1" });
      recordEdenMemoryMarker(status, { markerName: "[recorded]", ok: true, memoryId: "m2", goalId: "g1", taskId: "t1" });
      assert.equal(status.recordsWritten, 2);
      assert.equal(status.recordsFailed, 0);
      assert.equal(status.recordsSkipped, 0);
      assert.equal(status.lastMarkerName, "[recorded]");
      assert.equal(status.lastResult, "ok");
      assert.equal(status.eventHistory?.length, 2);
      assert.deepEqual(status.goalMemoryIds, ["m1", "m2"]);
      assert.deepEqual(status.taskMemoryIds, ["m1", "m2"]);
      assert.equal(status.byMarker?.["[action]"]?.ok, 1);
      assert.equal(status.byMarker?.["[recorded]"]?.ok, 1);
      assert.equal(status.byMarker?.["[verdict]"]?.ok, 0);
    });

    it("tracks last error and result for failed markers", () => {
      const status = createMemoryStatusTracker({ enabled: true }).status;
      recordEdenMemoryMarker(status, { markerName: "[action]", ok: false, error: "write failed" });
      assert.equal(status.lastResult, "error");
      assert.equal(status.lastError, "write failed");
      assert.equal(status.eventHistory?.[0]?.ok, false);
      assert.equal(status.byMarker?.["[action]"]?.error, 1);
    });

    it("counts skipped writes distinctly from failed writes", () => {
      const status = createMemoryStatusTracker({ enabled: true }).status;
      recordEdenMemoryMarker(status, { markerName: "[action]", ok: false, skipped: true, error: "missing env" });
      assert.equal(status.recordsSkipped, 1);
      assert.equal(status.recordsFailed, 0);
      assert.equal(status.lastResult, "skipped");
      assert.equal(status.byMarker?.["[action]"]?.skipped, 1);
    });

    it("caps event history at MAX_EVENT_HISTORY", () => {
      const status = createMemoryStatusTracker({ enabled: true }).status;
      for (let i = 0; i < 10; i += 1) {
        recordEdenMemoryMarker(status, { markerName: "[action]", ok: true });
      }
      assert.equal(status.eventHistory?.length, 8);
    });

    it("ignores disabled or undefined status", () => {
      assert.doesNotThrow(() => recordEdenMemoryMarker(undefined, { markerName: "[action]", ok: true }));
      const disabled = createMemoryStatusTracker({ enabled: false }).status;
      assert.doesNotThrow(() => recordEdenMemoryMarker(disabled, { markerName: "[action]", ok: true }));
      assert.equal(disabled.eventHistory, undefined);
    });

    it("formats an event line without content", () => {
      const line = formatEdenMemoryEvent({ markerName: "[action]", ok: true, ts: 0 });
      assert.ok(line.includes("[action]"));
      assert.ok(line.includes("✓"));
    });
  });

  describe("glyphs and fragments", () => {
    it("returns empty glyph when disabled or undefined", () => {
      assert.equal(getMemoryStatusGlyph(undefined), "");
      assert.equal(getMemoryStatusGlyph({ enabled: false } as any), "");
    });

    it("chooses glyphs by severity (error beats warning, skipped beats ok)", () => {
      assert.equal(getMemoryStatusGlyph({ enabled: true, healthy: true } as any), "✓");
      assert.equal(getMemoryStatusGlyph({ enabled: true, healthy: false } as any), "✗");
      assert.equal(getMemoryStatusGlyph({ enabled: true, lastResult: "error" } as any), "✗");
      assert.equal(getMemoryStatusGlyph({ enabled: true, healthy: true, lastError: "x" } as any), "⚠");
      assert.equal(getMemoryStatusGlyph({ enabled: true, lastResult: "skipped" } as any), "–");
    });

    it("formats a short fragment without content", () => {
      const fragment = formatMemoryStatusFragment({ enabled: true, healthy: true, recordsWritten: 5 } as any);
      assert.ok(fragment.includes("✓"));
      assert.ok(fragment.includes("ok"));
    });

    it("surfaces failures in the fragment", () => {
      const fragment = formatMemoryStatusFragment({ enabled: true, healthy: true, recordsFailed: 2 } as any);
      assert.ok(fragment.includes("2 failed"));
    });

    it("surfaces skipped writes distinctly from failures", () => {
      const fragment = formatMemoryStatusFragment({
        enabled: true,
        healthy: true,
        recordsFailed: 0,
        recordsSkipped: 3,
        lastResult: "skipped",
      } as any);
      assert.ok(fragment.includes("3 skipped"));
    });
  });

  describe("aggregateEdenMemoryStatus", () => {
    it("returns undefined when no statuses are enabled", () => {
      assert.equal(aggregateEdenMemoryStatus(undefined, []), undefined);
      assert.equal(
        aggregateEdenMemoryStatus({ enabled: false } as any, [{ edenMemoryStatus: { enabled: false } as any }]),
        undefined,
      );
    });

    it("sums per-marker counters across team and worker statuses", () => {
      const team = createMemoryStatusTracker({ enabled: true }).status;
      recordEdenMemoryMarker(team, { markerName: "[goal-received]", ok: true });
      recordEdenMemoryMarker(team, { markerName: "[routing]", ok: true });
      recordEdenMemoryMarker(team, { markerName: "[routing]", skipped: true, ok: false });

      const w1 = createMemoryStatusTracker({ enabled: true }).status;
      recordEdenMemoryMarker(w1, { markerName: "[action]", ok: true });
      recordEdenMemoryMarker(w1, { markerName: "[verdict]", ok: false, error: "x" });

      const w2 = createMemoryStatusTracker({ enabled: true }).status;
      recordEdenMemoryMarker(w2, { markerName: "[action]", ok: true });
      recordEdenMemoryMarker(w2, { markerName: "[action]", ok: true });

      const agg = aggregateEdenMemoryStatus(team, [{ edenMemoryStatus: w1 }, { edenMemoryStatus: w2 }]);
      assert.ok(agg);
      // team: [goal-received] ok=1, [routing] ok=1, [routing] skipped=1
      // w1:   [action] ok=1, [verdict] error=1
      // w2:   [action] ok=1, [action] ok=1
      assert.equal(agg?.recordsWritten, 5);
      assert.equal(agg?.recordsFailed, 1);
      assert.equal(agg?.recordsSkipped, 1);
      assert.equal(agg?.byMarker?.["[action]"]?.ok, 3);
      assert.equal(agg?.byMarker?.["[verdict]"]?.error, 1);
      assert.equal(agg?.byMarker?.["[routing]"]?.skipped, 1);
      assert.equal(agg?.totals.ok, 5);
      assert.equal(agg?.totals.error, 1);
      assert.equal(agg?.totals.skipped, 1);
    });

  });

  describe("createWorkerEdenMemoryStatus / ensureWorkerEdenMemoryStatus", () => {
    it("creates a per-worker status with the byMarker histogram pre-initialised", () => {
      const status = createWorkerEdenMemoryStatus(true);
      assert.equal(status.enabled, true);
      assert.ok(status.byMarker);
      assert.ok(status.byMarker?.["[worker-relay]"]);
    });

    it("ensureWorkerEdenMemoryStatus attaches the status when enabled and config is on", () => {
      const worker: { edenMemoryStatus?: any } = {};
      ensureWorkerEdenMemoryStatus(worker, { memory: { edenMemory: { enabled: true } } });
      assert.equal(worker.edenMemoryStatus?.enabled, true);
    });

    it("ensureWorkerEdenMemoryStatus leaves the worker alone when disabled", () => {
      const worker: { edenMemoryStatus?: any } = {};
      ensureWorkerEdenMemoryStatus(worker, { memory: { edenMemory: { enabled: false } } });
      assert.equal(worker.edenMemoryStatus, undefined);
    });
  });
});
