import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateEdenMemoryStatus,
  createMemoryStatusTracker,
  createWorkerEdenMemoryStatus,
  recordEdenMemoryMarker,
} from "../../src/src/memory/index.js";

/**
 * Verifies the wire shape of the memory block that the extension attaches to
 * `delegate_task` and `wait_for_agents` tool payloads. We don't go through the
 * full extension lifecycle here — the shell.test.ts suite covers that — and
 * instead pin down the contract consumers depend on:
 *
 *   { enabled, byMarker, totals, recordsWritten/Failed/Skipped,
 *     healthy, lastError }
 *
 * `byMarker` is keyed by every marker in the canonical table, with
 * { ok, error, skipped, lastTs? } buckets.
 */
describe("memory block in tool payloads (contract)", () => {
  it("aggregateEdenMemoryStatus returns undefined when memory is disabled everywhere", () => {
    const agg = aggregateEdenMemoryStatus(undefined, []);
    assert.equal(agg, undefined);
  });

  it("aggregate produces byMarker keyed by every canonical marker with zeroed buckets", () => {
    const team = createMemoryStatusTracker({ enabled: true }).status;
    const agg = aggregateEdenMemoryStatus(team, []);
    assert.ok(agg);
    assert.equal(agg?.enabled, true);
    assert.ok(agg?.byMarker);
    // Every marker from the canonical table should be present with zeroed buckets.
    const expectedMarkers = [
      "[goal-received]", "[routing]", "[context-gathering]", "[skip-context-gathering]",
      "[action]", "[api-ready]", "[verdict]", "[recorded]", "[closure]", "[handoff]",
      "[andon]", "[escalation]", "[worker-terminal]", "[worker-relay]", "[worker-pruned]",
    ];
    for (const m of expectedMarkers) {
      assert.ok(agg?.byMarker[m], `byMarker must include ${m}`);
      assert.equal(agg?.byMarker[m]?.ok, 0);
      assert.equal(agg?.byMarker[m]?.error, 0);
      assert.equal(agg?.byMarker[m]?.skipped, 0);
    }
  });

  it("aggregate sums per-marker buckets across team + worker statuses", () => {
    const team = createMemoryStatusTracker({ enabled: true }).status;
    recordEdenMemoryMarker(team, { markerName: "[goal-received]", ok: true });
    recordEdenMemoryMarker(team, { markerName: "[routing]", ok: true });

    const w1 = createWorkerEdenMemoryStatus(true);
    recordEdenMemoryMarker(w1, { markerName: "[action]", ok: true });
    recordEdenMemoryMarker(w1, { markerName: "[action]", ok: true });
    recordEdenMemoryMarker(w1, { markerName: "[verdict]", ok: false, error: "x" });

    const agg = aggregateEdenMemoryStatus(team, [{ edenMemoryStatus: w1 }]);
    assert.ok(agg);
    assert.equal(agg?.byMarker?.["[goal-received]"]?.ok, 1);
    assert.equal(agg?.byMarker?.["[routing]"]?.ok, 1);
    assert.equal(agg?.byMarker?.["[action]"]?.ok, 2);
    assert.equal(agg?.byMarker?.["[verdict]"]?.error, 1);
    assert.equal(agg?.recordsWritten, 4);
    assert.equal(agg?.recordsFailed, 1);
    assert.equal(agg?.totals.ok, 4);
    assert.equal(agg?.totals.error, 1);
  });
});
