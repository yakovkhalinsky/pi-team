import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildInspectText, buildConsoleLines, buildCostLines, RosterSelectList } from "../../src/src/ui/overlay.js";
import { fallbackPalette, stripAnsi } from "../../src/src/ui/theme.js";
import { makeTeamState, makeWorker } from "../fixtures.js";

function plain(text: string): string {
  return stripAnsi(text);
}

describe("ui/overlay", () => {
  describe("buildInspectText", () => {
    it("renders a Memory block for the selected worker", () => {
      const worker = makeWorker({
        workerId: "w1",
        profileName: "builder",
        status: "running",
        edenMemoryStatus: {
          enabled: true,
          healthy: true,
          locked: false,
          recordsWritten: 0,
          recordsFailed: 0,
          lastError: undefined,
          lastHealthCheckAt: undefined,
          lastWriteAt: undefined,
          recordCount: 2,
          lastMarkerName: "[action]",
          lastResult: "ok",
          goalMemoryIds: ["g1"],
          taskMemoryIds: ["t1-m1"],
          eventHistory: [
            { markerName: "[action]", ok: true, memoryId: "t1-m1", ts: 1000 },
            { markerName: "[recorded]", ok: true, memoryId: "g1", ts: 2000 },
          ],
        },
      });
      const text = plain(buildInspectText(worker, "", [], [], fallbackPalette));
      assert.ok(text.includes("Memory"));
      assert.ok(text.includes("Enabled:"));
      assert.ok(text.includes("Last marker:"));
      assert.ok(text.includes("[action]"));
      assert.ok(text.includes("Records:"));
      assert.ok(text.includes("2"));
      assert.ok(text.includes("Goal memories:"));
      assert.ok(text.includes("Task memories:"));
    });

    it("shows disabled state when eden-memory is off", () => {
      const worker = makeWorker({
        workerId: "w1",
        profileName: "builder",
        status: "running",
        edenMemoryStatus: { enabled: false, healthy: undefined, locked: false, recordsWritten: 0, recordsFailed: 0, lastError: undefined, lastHealthCheckAt: undefined, lastWriteAt: undefined },
      });
      const text = plain(buildInspectText(worker, "", [], [], fallbackPalette));
      assert.ok(text.includes("Memory"));
      assert.ok(text.includes("eden-memory disabled"));
    });

    it("renders status, task, summary, and final-answer blocks", () => {
      const worker = makeWorker({
        workerId: "w1",
        profileName: "builder",
        status: "running",
        currentTask: { title: "Fix overlay", goal: "restore helpers", expectedOutput: "green tests", contextHints: [] },
        lastSummary: { headline: "Done", readFiles: [], changedFiles: [], risks: [], nextRecommendation: "" },
        finalAnswer: "<final_answer>headline: fixed</final_answer>",
        usage: { turns: 3, inputTokens: 1000, outputTokens: 500, costUsd: 0.0123 },
      });
      const text = buildInspectText(worker, "", [], [], fallbackPalette);
      assert.ok(text.includes("Status"));
      assert.ok(text.includes("w1"));
      assert.ok(text.includes("Fix overlay"));
      assert.ok(text.includes("Summary"));
      assert.ok(text.includes("Final answer"));
      assert.ok(text.includes("Latest assistant text"));
    });

    it("shows pending relay questions in the operator block", () => {
      const worker = makeWorker({
        workerId: "w2",
        profileName: "verifier",
        status: "waiting_followup",
        pendingRelayQuestions: [{ relayId: "r1", workerId: "w2", taskId: "t1", question: "Which file?", assumption: "overlay.ts", urgency: "high", createdAt: 0 }],
      });
      const text = buildInspectText(worker, "", [], [], fallbackPalette);
      assert.ok(text.includes("Needs operator"));
      assert.ok(text.includes("Which file?"));
      assert.ok(text.includes("overlay.ts"));
    });
  });

  describe("buildConsoleLines", () => {
    it("surfaces memory lifecycle events in activity mode", () => {
      const worker = makeWorker({
        workerId: "w3",
        profileName: "runtime",
        status: "running",
        edenMemoryStatus: {
          enabled: true,
          healthy: true,
          locked: false,
          recordsWritten: 0,
          recordsFailed: 0,
          lastError: undefined,
          lastHealthCheckAt: undefined,
          lastWriteAt: undefined,
          eventHistory: [
            { markerName: "[action]", ok: true, memoryId: "m1", ts: 1000 },
            { markerName: "[recorded]", ok: false, error: "locked", ts: 2000 },
          ],
        },
      });
      const lines = buildConsoleLines(worker, [], [], [], "activity");
      const text = lines.join("\n");
      assert.ok(text.includes("Memory [action] ok"));
      assert.ok(text.includes("Memory [recorded] error"));
      assert.ok(text.includes("locked"));
    });

    it("renders activity lines from console events", () => {
      const worker = makeWorker({ workerId: "w3", profileName: "runtime", status: "running" });
      const consoleEvents = [
        { ts: 1000, kind: "tool_start", text: "git status" },
        { ts: 2000, kind: "tool_end", text: "On branch main\n→ clean" },
      ];
      const lines = buildConsoleLines(worker, [], consoleEvents, [], "activity");
      const text = lines.join("\n");
      assert.ok(text.includes("w3"));
      assert.ok(text.includes("activity"));
      assert.ok(text.includes("Ran git status"));
    });

    it("falls back to synthesizing activity from the worker and events", () => {
      const worker = makeWorker({ workerId: "w4", profileName: "builder", status: "idle", finalAnswer: "done" });
      const lines = buildConsoleLines(worker, [], [], [], "activity");
      const text = lines.join("\n");
      assert.ok(text.includes("activity"));
      assert.ok(text.includes("Final answer"));
    });

    it("renders raw console lines when mode is raw", () => {
      const worker = makeWorker({ workerId: "w5", profileName: "builder", status: "running" });
      const chunks = [{ ts: 1000, index: 0, text: "hello" }];
      const events = [{ ts: 2000, kind: "stdout", text: "world" }];
      const lines = buildConsoleLines(worker, chunks, events, [], "raw");
      const text = lines.join("\n");
      assert.ok(text.includes("— raw —"));
      assert.ok(text.includes("assistant chunk #0"));
      assert.ok(text.includes("stdout"));
    });

    it("shows an empty-state message when there is no activity", () => {
      const worker = makeWorker({ workerId: "w6", profileName: "builder", status: "idle" });
      const lines = buildConsoleLines(worker, [], [], [], "activity");
      const text = lines.join("\n");
      assert.ok(text.includes("no activity yet"));
    });
  });

  describe("buildCostLines", () => {
    it("renders totals and per-worker rows", () => {
      const state = makeTeamState([
        makeWorker({ workerId: "w7", profileName: "builder", status: "running", usage: { turns: 2, inputTokens: 2000, outputTokens: 1000, costUsd: 0.02 } }),
        makeWorker({ workerId: "w8", profileName: "verifier", status: "idle", usage: { turns: 1, inputTokens: 500, outputTokens: 200, costUsd: 0.005 } }),
      ]);
      state.prunedWorkerUsageTotals = { workers: 1, turns: 1, inputTokens: 300, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.001 };
      const lines = buildCostLines(state);
      const text = lines.join("\n");
      assert.ok(text.includes("Σ workers=3"));
      assert.ok(text.includes("w7"));
      assert.ok(text.includes("w8"));
      assert.ok(text.includes("retained/pruned"));
    });

    it("shows aggregate eden-memory counters in cost view", () => {
      const state = makeTeamState([
        makeWorker({ workerId: "w7", profileName: "builder", status: "running", edenMemoryStatus: { enabled: true, recordsWritten: 2, recordsFailed: 1, recordsSkipped: 0, recordCount: 3, healthy: true, locked: false, lastError: undefined } }),
      ]);
      state.edenMemoryStatus = { enabled: true, recordsWritten: 1, recordsFailed: 0, recordsSkipped: 0, recordCount: 1, healthy: true, locked: false, lastError: undefined };
      const lines = buildCostLines(state);
      const text = lines.join("\n");
      assert.ok(text.includes("eden-memory:"));
      assert.ok(text.includes("records=4"));
      assert.ok(text.includes("failed=1"));
      assert.ok(text.includes("skipped=0"));
    });

    it("hides eden-memory line when memory is disabled everywhere", () => {
      const state = makeTeamState([
        makeWorker({ workerId: "w7", profileName: "builder", status: "running" }),
      ]);
      const lines = buildCostLines(state);
      const text = lines.join("\n");
      assert.ok(!text.includes("eden-memory"));
    });

    it("shows a no-workers message when totals and workers are empty", () => {
      const state = makeTeamState();
      const lines = buildCostLines(state);
      assert.equal(lines[0], "(no tracked workers)");
    });
  });

  describe("RosterSelectList", () => {
    it("renders grouped workers", () => {
      const state = makeTeamState([
        makeWorker({ workerId: "w9", profileName: "builder", status: "running" }),
        makeWorker({ workerId: "w10", profileName: "verifier", status: "idle" }),
      ]);
      const list = new RosterSelectList(state, "w9");
      const lines = list.render(80, 30);
      const text = lines.join("\n");
      assert.ok(text.includes("Working"));
      assert.ok(text.includes("Done"));
      assert.ok(text.includes("w9"));
      assert.ok(text.includes("w10"));
    });

    it("renders an empty-state when there are no workers", () => {
      const list = new RosterSelectList(makeTeamState(), undefined);
      const lines = list.render(80, 10);
      const text = lines.join("\n");
      assert.ok(text.includes("No tracked workers"));
    });
  });
});
