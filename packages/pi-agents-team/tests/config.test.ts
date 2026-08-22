import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDefaultTeamState, DEFAULT_TEAM_CONFIG, normalizePersistedTeamState } from "../src/src/config.js";
import { TEAM_STATE_VERSION } from "../src/src/types.js";

describe("config", () => {
  describe("DEFAULT_TEAM_CONFIG", () => {
    it("has required top-level structure", () => {
      assert.ok(Array.isArray(DEFAULT_TEAM_CONFIG.profiles));
      assert.ok(DEFAULT_TEAM_CONFIG.profiles.length > 0);
      assert.equal(typeof DEFAULT_TEAM_CONFIG.ui.statusKey, "string");
      assert.equal(typeof DEFAULT_TEAM_CONFIG.ui.widgetKey, "string");
    });
  });

  describe("createDefaultTeamState", () => {
    it("returns a clean orchestrator state", () => {
      const state = createDefaultTeamState();
      assert.equal(state.version, TEAM_STATE_VERSION);
      assert.equal(state.sessionMode, "orchestrator");
      assert.deepEqual(state.activeWorkers, {});
      assert.deepEqual(state.relayQueue, []);
      assert.equal(typeof state.updatedAt, "number");
    });

    it("uses provided timestamp", () => {
      const now = 123456789;
      const state = createDefaultTeamState(DEFAULT_TEAM_CONFIG, now);
      assert.equal(state.updatedAt, now);
      assert.equal(state.ui.lastRenderAt, now);
    });
  });

  describe("normalizePersistedTeamState", () => {
    it("returns default state for non-object input", () => {
      const state = normalizePersistedTeamState(null);
      assert.equal(state.version, TEAM_STATE_VERSION);
      assert.deepEqual(state.activeWorkers, {});
    });

    it("preserves provided workers and relay queue", () => {
      const raw = {
        activeWorkers: { w1: { workerId: "w1", profileName: "builder", status: "running" } },
        relayQueue: [{ relayId: "r1" }],
      };
      const state = normalizePersistedTeamState(raw as any);
      assert.equal(state.activeWorkers.w1.workerId, "w1");
      assert.equal(state.relayQueue.length, 1);
    });

    it("normalizes usage totals", () => {
      const raw = { prunedWorkerUsageTotals: { turns: "bad", costUsd: -1 } };
      const state = normalizePersistedTeamState(raw as any);
      assert.equal(state.prunedWorkerUsageTotals.turns, 0);
      assert.equal(state.prunedWorkerUsageTotals.costUsd, -1);
    });
  });
});
