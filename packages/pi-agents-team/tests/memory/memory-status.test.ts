import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateEdenMemoryStatus,
  createMemoryStatusTracker,
  formatEdenMemoryEvent,
  formatMemoryStatusFragment,
  getMemoryStatusGlyph,
  recordEdenMemoryMarker,
  createWorkerEdenMemoryStatus,
} from "../../src/src/memory/memory-status.js";

describe("memory/memory-status", () => {
  describe("createMemoryStatusTracker", () => {
    it("starts with a clean status and a pre-initialised byMarker histogram", () => {
      const tracker = createMemoryStatusTracker({});
      assert.equal(tracker.status.healthy, undefined);
      assert.equal(tracker.status.recordsWritten, 0);
      assert.equal(tracker.status.recordsFailed, 0);
      assert.equal(tracker.status.recordsSkipped, 0);
      assert.ok(tracker.status.byMarker);
      assert.ok(tracker.status.byMarker?.["[action]"]);
      assert.equal(tracker.status.byMarker?.["[action]"]?.ok, 0);
    });

    it("increments recordsWritten on successful writes", () => {
      const tracker = createMemoryStatusTracker({});
      tracker.updateFromWriteResult({ ok: true });
      tracker.updateFromWriteResult({ ok: true });
      assert.equal(tracker.status.recordsWritten, 2);
      assert.equal(tracker.status.recordsFailed, 0);
      assert.equal(tracker.status.healthy, undefined);
    });

    it("increments recordsFailed and stores lastError on failed writes", () => {
      const tracker = createMemoryStatusTracker({});
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
      const status = createMemoryStatusTracker({}).status;
      recordEdenMemoryMarker(status, { markerName: "[action]", ok: true, memoryId: "m1", goalId: "g1", taskId: "t1" });
      recordEdenMemoryMarker(status, { markerName: "[recorded]", ok: true, memoryId: "m2", goalId: "g1", taskId: "t1" });

      assert.equal(status.recordsWritten, 2);
      assert.equal(status.recordsFailed, 0);
      assert.ok(status.eventHistory);
      assert.equal(status.eventHistory?.length, 2);
      assert.equal(status.byMarker?.["[action]"]?.ok, 1);
      assert.equal(status.byMarker?.["[recorded]"]?.ok, 1);
    });

    it("tracks last error and result for failed markers", () => {
      const status = createMemoryStatusTracker({}).status;
      recordEdenMemoryMarker(status, { markerName: "[action]", ok: false, error: "boom" });
      assert.equal(status.recordsFailed, 1);
      assert.equal(status.lastResult, "error");
      assert.equal(status.lastError, "boom");
      assert.equal(status.byMarker?.["[action]"]?.error, 1);
    });

    it("counts skipped writes distinctly from failed writes", () => {
      const status = createMemoryStatusTracker({}).status;
      recordEdenMemoryMarker(status, { markerName: "[action]", skipped: true, ok: false });
      assert.equal(status.recordsSkipped, 1);
      assert.equal(status.recordsFailed, 0);
      assert.equal(status.lastResult, "skipped");
      assert.equal(status.byMarker?.["[action]"]?.skipped, 1);
    });

    it("caps event history at MAX_EVENT_HISTORY", () => {
      const status = createMemoryStatusTracker({}).status;
      // Push enough markers to overflow; just check the cap.
      for (let i = 0; i < 250; i += 1) {
        recordEdenMemoryMarker(status, { markerName: "[action]", ok: true });
      }
      assert.ok(status.eventHistory);
      assert.ok((status.eventHistory?.length ?? 0) <= 200);
    });

    it("ignores undefined status without throwing", () => {
      // Should be a no-op.
      recordEdenMemoryMarker(undefined, { markerName: "[action]", ok: true });
      assert.ok(true);
    });

    it("formats an event line without content", () => {
      const line = formatEdenMemoryEvent({ markerName: "[action]", ok: true, ts: Date.now() });
      assert.ok(line.includes("[action]"));
      assert.ok(line.includes("✓"));
    });
  });

  describe("glyphs and fragments", () => {
    it("returns empty glyph for undefined status", () => {
      assert.equal(getMemoryStatusGlyph(undefined), "");
    });

    it("chooses glyphs by severity (error beats warning, skipped beats ok)", () => {
      assert.equal(getMemoryStatusGlyph({ healthy: true } as any), "✓");
      assert.equal(getMemoryStatusGlyph({ healthy: false } as any), "✗");
      assert.equal(getMemoryStatusGlyph({ lastResult: "error" } as any), "✗");
      assert.equal(getMemoryStatusGlyph({ healthy: true, lastError: "x" } as any), "⚠");
      assert.equal(getMemoryStatusGlyph({ lastResult: "skipped" } as any), "–");
    });

    it("formats a short fragment without content", () => {
      const fragment = formatMemoryStatusFragment({ healthy: true, recordsWritten: 5 } as any);
      assert.ok(fragment.includes("✓"));
      assert.ok(fragment.includes("ok"));
    });

    it("surfaces failures in the fragment", () => {
      const fragment = formatMemoryStatusFragment({ healthy: true, recordsFailed: 2 } as any);
      assert.ok(fragment.includes("2 failed"));
    });

    it("surfaces skipped writes distinctly from failures", () => {
      const fragment = formatMemoryStatusFragment({
        healthy: true,
        recordsFailed: 0,
        recordsSkipped: 3,
        lastResult: "skipped",
      } as any);
      assert.ok(fragment.includes("3 skipped"));
    });
  });

  describe("aggregateEdenMemoryStatus", () => {
    it("returns undefined when no statuses are provided", () => {
      assert.equal(aggregateEdenMemoryStatus(undefined, []), undefined);
      assert.equal(
        aggregateEdenMemoryStatus(undefined, [{ edenMemoryStatus: undefined }]),
        undefined,
      );
    });

    it("sums per-marker counters across team and worker statuses", () => {
      const team = createMemoryStatusTracker({}).status;
      recordEdenMemoryMarker(team, { markerName: "[goal-received]", ok: true });
      recordEdenMemoryMarker(team, { markerName: "[routing]", ok: true });
      recordEdenMemoryMarker(team, { markerName: "[routing]", skipped: true, ok: false });

      const w1 = createMemoryStatusTracker({}).status;
      recordEdenMemoryMarker(w1, { markerName: "[action]", ok: true });
      recordEdenMemoryMarker(w1, { markerName: "[verdict]", ok: false, error: "x" });

      const w2 = createMemoryStatusTracker({}).status;
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

  describe("createWorkerEdenMemoryStatus", () => {
    it("creates a per-worker status with the byMarker histogram pre-initialised", () => {
      const status = createWorkerEdenMemoryStatus();
      assert.ok(status.byMarker);
      assert.ok(status.byMarker?.["[worker-relay]"]);
      assert.equal(status.recordsWritten, 0);
      assert.equal(status.recordsFailed, 0);
    });
  });
});
