import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTeamStatusLine,
  buildTeamWidgetLines,
  getTeamStatusTip,
  hasAnimatedWorkers,
  SPINNER_FRAMES,
} from "../../src/src/ui/status-widget.js";
import { makeTeamState, makeWorker } from "../fixtures.js";

describe("ui/status-widget", () => {
  describe("SPINNER_FRAMES", () => {
    it("has ten braille frames", () => {
      assert.equal(SPINNER_FRAMES.length, 10);
    });
  });

  describe("hasAnimatedWorkers", () => {
    it("returns true when a worker is non-terminal", () => {
      const state = makeTeamState([makeWorker({ workerId: "w1", profileName: "builder", status: "running" })]);
      assert.equal(hasAnimatedWorkers(state), true);
    });

    it("returns false when all workers are terminal", () => {
      const state = makeTeamState([makeWorker({ workerId: "w1", profileName: "builder", status: "idle" })]);
      assert.equal(hasAnimatedWorkers(state), false);
    });
  });

  describe("getTeamStatusTip", () => {
    it("cycles through tips", () => {
      assert.ok(getTeamStatusTip(0).startsWith("Use /team"));
      assert.equal(getTeamStatusTip(1000), getTeamStatusTip(1000 % 8));
    });
  });

  describe("buildTeamStatusLine", () => {
    it("renders a full status line with theme", () => {
      const state = makeTeamState([]);
      const line = buildTeamStatusLine(state, "team", "tip text", false, undefined, 80);
      assert.ok(line.includes("Team"));
      assert.ok(line.includes("tip text") || line.includes("Tip"));
    });

    it("renders glyph tier at narrow widths", () => {
      const state = makeTeamState([]);
      const line = buildTeamStatusLine(state, "team", undefined, false, undefined, 10);
      assert.equal(line.trim().length <= 7, true);
    });

    it("marks solo mode", () => {
      const state = makeTeamState([]);
      const line = buildTeamStatusLine(state, "solo", undefined, false, undefined, 80);
      assert.ok(line.includes("Solo"));
    });

    it("surfaces memory status in full and glyph tiers", () => {
      const state = makeTeamState([]);
      state.edenMemoryStatus = { enabled: true, healthy: true, locked: false, recordsWritten: 1, recordsFailed: 0 };
      const full = buildTeamStatusLine(state, "team", undefined, false, undefined, 80);
      assert.ok(full.includes("✓"));
      const glyph = buildTeamStatusLine(state, "team", undefined, false, undefined, 10);
      assert.ok(glyph.includes("✓"));
    });
  });

  describe("buildTeamWidgetLines", () => {
    it("returns empty array in solo mode", () => {
      const lines = buildTeamWidgetLines(makeTeamState(), { routingMode: "solo", width: 80 });
      assert.deepEqual(lines, []);
    });

    it("returns empty array when no workers and cost hidden", () => {
      const lines = buildTeamWidgetLines(makeTeamState(), { routingMode: "team", width: 80, displayCost: false });
      assert.deepEqual(lines, []);
    });

    it("renders a header and counts with at least one worker", () => {
      const lines = buildTeamWidgetLines(
        makeTeamState([makeWorker({ workerId: "w1", profileName: "builder", status: "running" })]),
        { routingMode: "team", width: 80, displayCost: false },
      );
      assert.ok(lines.length > 0);
      assert.ok(lines[0].includes("Pi Agents Team"));
    });

    it("renders active worker lines", () => {
      const state = makeTeamState([
        makeWorker({ workerId: "w1", profileName: "builder", status: "running", currentTask: { title: "Implement" } }),
      ]);
      const lines = buildTeamWidgetLines(state, { routingMode: "team", width: 80, displayCost: false });
      const text = lines.join("\n");
      assert.ok(text.includes("w1"));
      assert.ok(text.includes("Implement"));
    });

    it("renders a memory status line when enabled", () => {
      const state = makeTeamState([
        makeWorker({ workerId: "w1", profileName: "builder", status: "running" }),
      ]);
      state.edenMemoryStatus = { enabled: true, healthy: true, locked: false, recordsWritten: 3, recordsFailed: 0 };
      const lines = buildTeamWidgetLines(state, { routingMode: "team", width: 80, displayCost: false });
      const text = lines.join("\n");
      assert.ok(text.includes("Memory"));
      assert.ok(text.includes("✓"));
    });
  });
});
