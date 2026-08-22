import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRosterSections, buildTeamDashboardLines, buildCompactTeamSummaryLine, buildNarrowTeamDashboardText } from "../../src/src/ui/dashboard.js";
import { makeTeamState, makeWorker } from "../fixtures.js";

describe("ui/dashboard", () => {
  describe("buildRosterSections", () => {
    it("groups workers by attention priority", () => {
      const state = makeTeamState([
        makeWorker({ workerId: "w1", profileName: "builder", status: "idle" }),
        makeWorker({ workerId: "w2", profileName: "runtime", status: "running" }),
        makeWorker({ workerId: "w3", profileName: "verifier", status: "running", error: "oops" }),
      ]);
      const sections = buildRosterSections(state);
      const keys = sections.filter((s) => s.workers.length > 0).map((s) => s.key);
      assert.deepEqual(keys, ["needs_recovery", "in_progress", "completed_or_idle"]);
    });

    it("sorts workers within each section numerically", () => {
      const state = makeTeamState([
        makeWorker({ workerId: "w10", profileName: "builder", status: "running" }),
        makeWorker({ workerId: "w2", profileName: "runtime", status: "running" }),
      ]);
      const section = buildRosterSections(state).find((s) => s.key === "in_progress");
      const ids = section?.workers.map((w) => w.workerId);
      assert.deepEqual(ids, ["w2", "w10"]);
    });
  });

  describe("buildCompactTeamSummaryLine", () => {
    it("includes worker count, mode and relay count", () => {
      const state = makeTeamState([
        makeWorker({ workerId: "w1", profileName: "builder", status: "running" }),
      ]);
      state.relayQueue.push({ relayId: "r1", workerId: "w1", taskId: "t1", question: "q", assumption: "a", urgency: "medium", createdAt: 0 });
      const line = buildCompactTeamSummaryLine(state);
      assert.ok(line.includes("workers 1"));
      assert.ok(line.includes("mode orchestrator"));
      assert.ok(line.includes("relays 1"));
    });
  });

  describe("buildTeamDashboardLines", () => {
    it("renders a header and no-worker message", () => {
      const lines = buildTeamDashboardLines(makeTeamState(), { displayCost: false });
      assert.ok(lines[0].includes("Dashboard"));
      assert.ok(lines.some((line) => line.includes("No tracked workers")));
    });

    it("renders worker sections", () => {
      const state = makeTeamState([
        makeWorker({ workerId: "w1", profileName: "builder", status: "running", currentTask: { title: "Implement feature" } }),
      ]);
      const lines = buildTeamDashboardLines(state, { displayCost: false });
      const text = lines.join("\n");
      assert.ok(text.includes("Working"));
      assert.ok(text.includes("w1"));
      assert.ok(text.includes("Implement feature"));
    });
  });

  describe("buildNarrowTeamDashboardText", () => {
    it("renders compact text summary", () => {
      const state = makeTeamState([
        makeWorker({ workerId: "w1", profileName: "builder", status: "idle" }),
      ]);
      const text = buildNarrowTeamDashboardText(state);
      assert.ok(text.includes("workers=1"));
      assert.ok(text.includes("w1"));
      assert.ok(text.includes("Done"));
    });
  });
});
