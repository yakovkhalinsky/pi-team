import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateEdenMemoryStatus,
  createMemoryStatusTracker,
  formatEdenMemoryEvent,
  formatMemoryStatusFragment,
  formatWorkerMemoryLine,
  getMemoryStatusGlyph,
  recordEdenMemoryMarker,
} from "../../src/src/memory/memory-status.js";

describe("memory/memory-status", () => {
  describe("createMemoryStatusTracker", () => {
    it("starts with a clean disabled status when not enabled", () => {
      const tracker = createMemoryStatusTracker({ enabled: false });
      assert.equal(tracker.status.enabled, false);
      assert.equal(tracker.status.healthy, undefined);
      assert.equal(tracker.status.recordsWritten, 0);
      assert.equal(tracker.status.recordsFailed, 0);
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

    it("updates healthy/locked from health results", () => {
      const tracker = createMemoryStatusTracker({ enabled: true });
      tracker.updateFromHealthResult({ ok: true });
      assert.equal(tracker.status.healthy, true);
      assert.equal(tracker.status.locked, false);
      tracker.updateFromHealthResult({ ok: false, locked: true, error: "database is locked" });
      assert.equal(tracker.status.healthy, false);
      assert.equal(tracker.status.locked, true);
      assert.equal(tracker.status.lastError, "database is locked");
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
  });

  describe("per-worker ATP lifecycle tracking", () => {
    it("records marker results into event history", () => {
      const status = createMemoryStatusTracker({ enabled: true }).status;
      recordEdenMemoryMarker(status, { markerName: "[action]", ok: true, memoryId: "m1", goalId: "g1", taskId: "t1" });
      recordEdenMemoryMarker(status, { markerName: "[recorded]", ok: true, memoryId: "m2", goalId: "g1", taskId: "t1" });
      assert.equal(status.recordCount, 2);
      assert.equal(status.lastMarkerName, "[recorded]");
      assert.equal(status.lastResult, "ok");
      assert.equal(status.eventHistory?.length, 2);
      assert.deepEqual(status.goalMemoryIds, ["m1", "m2"]);
      assert.deepEqual(status.taskMemoryIds, ["m1", "m2"]);
    });

    it("tracks last error and result for failed markers", () => {
      const status = createMemoryStatusTracker({ enabled: true }).status;
      recordEdenMemoryMarker(status, { markerName: "[action]", ok: false, error: "write failed" });
      assert.equal(status.lastResult, "error");
      assert.equal(status.lastError, "write failed");
      assert.equal(status.eventHistory?.[0]?.ok, false);
    });

    it("caps event history at MAX_EVENT_HISTORY", () => {
      const status = createMemoryStatusTracker({ enabled: true }).status;
      for (let i = 0; i < 10; i += 1) {
        recordEdenMemoryMarker(status, { markerName: `[m${i}]`, ok: true });
      }
      assert.equal(status.eventHistory?.length, 8);
      assert.equal(status.eventHistory?.[0]?.markerName, "[m2]");
    });

    it("ignores disabled or undefined status", () => {
      assert.doesNotThrow(() => recordEdenMemoryMarker(undefined, { markerName: "[x]", ok: true }));
      const disabled = createMemoryStatusTracker({ enabled: false }).status;
      assert.doesNotThrow(() => recordEdenMemoryMarker(disabled, { markerName: "[x]", ok: true }));
      assert.equal(disabled.eventHistory, undefined);
    });

    it("formats an event line without content", () => {
      const line = formatEdenMemoryEvent({ markerName: "[action]", ok: true, ts: 0 });
      assert.ok(line.includes("[action]"));
      assert.ok(line.includes("✓"));
    });

    it("formats a worker memory line for tool output", () => {
      const status = createMemoryStatusTracker({ enabled: true }).status;
      recordEdenMemoryMarker(status, { markerName: "[action]", ok: true, memoryId: "m1" });
      const line = formatWorkerMemoryLine(status);
      assert.ok(line);
      assert.ok(line?.includes("Memory"));
      assert.ok(line?.includes("[action]"));
      assert.ok(line?.includes("records=1"));
    });

    it("returns undefined memory line when disabled", () => {
      assert.equal(formatWorkerMemoryLine(undefined), undefined);
      assert.equal(formatWorkerMemoryLine(createMemoryStatusTracker({ enabled: false }).status), undefined);
    });
  });

  describe("glyphs and fragments", () => {
    it("returns empty glyph when disabled or undefined", () => {
      assert.equal(getMemoryStatusGlyph(undefined), "");
      assert.equal(getMemoryStatusGlyph({ enabled: false } as any), "");
    });

    it("chooses glyphs by severity", () => {
      assert.equal(getMemoryStatusGlyph({ enabled: true, healthy: true } as any), "✓");
      assert.equal(getMemoryStatusGlyph({ enabled: true, healthy: false } as any), "✗");
      assert.equal(getMemoryStatusGlyph({ enabled: true, healthy: true, lastError: "x" } as any), "⚠");
      assert.equal(getMemoryStatusGlyph({ enabled: true, locked: true } as any), "🔒");
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
  });

  describe("aggregateEdenMemoryStatus", () => {
    it("returns undefined when no statuses are enabled", () => {
      assert.equal(aggregateEdenMemoryStatus(undefined, []), undefined);
      assert.equal(aggregateEdenMemoryStatus({ enabled: false } as any, [{ edenMemoryStatus: { enabled: false } as any }]), undefined);
    });

    it("sums counters across team and worker statuses", () => {
      const team = { enabled: true, recordsWritten: 2, recordsFailed: 0, recordsSkipped: 1, recordCount: 3 } as any;
      const workers = [
        { edenMemoryStatus: { enabled: true, recordsWritten: 5, recordsFailed: 1, recordsSkipped: 0, recordCount: 6 } as any },
        { edenMemoryStatus: { enabled: true, recordsWritten: 0, recordsFailed: 2, recordsSkipped: 0, recordCount: 2 } as any },
      ];
      const agg = aggregateEdenMemoryStatus(team, workers);
      assert.ok(agg);
      assert.equal(agg?.recordsWritten, 7);
      assert.equal(agg?.recordsFailed, 3);
      assert.equal(agg?.recordsSkipped, 1);
      assert.equal(agg?.recordCount, 11);
    });

    it("reports locked if any status is locked", () => {
      const workers = [{ edenMemoryStatus: { enabled: true, locked: true } as any }];
      const agg = aggregateEdenMemoryStatus(undefined, workers);
      assert.equal(agg?.locked, true);
    });
  });
});
