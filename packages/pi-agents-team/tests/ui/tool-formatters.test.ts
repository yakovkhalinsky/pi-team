import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatAgentMessageResult,
  formatAgentResultNotReady,
  formatDelegateTaskResult,
  formatWaitForAgentsResult,
  formatWorkerCompact,
  formatWorkers,
  truncateList,
  truncateScanValue,
} from "../../src/src/ui/tool-formatters.js";

describe("ui/tool-formatters", () => {
  const baseWorker = {
    workerId: "w1",
    profileName: "builder",
    status: "running",
    pendingRelayQuestions: [],
    usage: { turns: 1, inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01, contextTokens: 0 },
  };

  describe("formatDelegateTaskResult", () => {
    it("includes worker id and task title", () => {
      const result = { worker: { ...baseWorker, currentTask: { title: "Fix bug", taskId: "t1" } }, warnings: [] };
      assert.ok(formatDelegateTaskResult(result).includes("w1"));
      assert.ok(formatDelegateTaskResult(result).includes("Fix bug"));
      assert.ok(formatDelegateTaskResult(result).includes("t1"));
    });

    it("includes warnings", () => {
      const result = { worker: { ...baseWorker, currentTask: { title: "Task" } }, warnings: ["slow model"] };
      assert.ok(formatDelegateTaskResult(result).includes("slow model"));
    });
  });

  describe("formatAgentMessageResult", () => {
    it("describes steer delivery", () => {
      const result = { worker: baseWorker, delivery: "steer", previousStatus: "running" };
      assert.ok(formatAgentMessageResult(result).startsWith("Steering"));
    });

    it("describes follow_up delivery", () => {
      const result = { worker: baseWorker, delivery: "follow_up", previousStatus: "waiting_followup" };
      assert.ok(formatAgentMessageResult(result).startsWith("Queued follow-up"));
    });

    it("describes waking an idle agent", () => {
      const result = { worker: { ...baseWorker, status: "idle" }, previousStatus: "idle" };
      assert.ok(formatAgentMessageResult(result).startsWith("Waking"));
    });
  });

  describe("formatWaitForAgentsResult", () => {
    it("handles no workers", () => {
      const text = formatWaitForAgentsResult({ reason: "no_workers" });
      assert.ok(text.includes("no agents"));
      assert.ok(text.includes("delegate a task first"));
    });

    it("summarizes all terminal", () => {
      const text = formatWaitForAgentsResult({ reason: "all_terminal", workers: [baseWorker] });
      assert.ok(text.includes("all agents finished"));
      assert.ok(text.includes("w1"));
    });

    it("summarizes relay raised", () => {
      const relay = { workerId: "w1", profileName: "builder", urgency: "high", question: "q?", assumption: "a" };
      const text = formatWaitForAgentsResult({ reason: "relay_raised", workers: [baseWorker], newRelays: [relay] });
      assert.ok(text.includes("relay question(s) need reply"));
      assert.ok(text.includes("q?"));
    });
  });

  describe("formatAgentResultNotReady", () => {
    it("states the worker is not ready", () => {
      const text = formatAgentResultNotReady(baseWorker);
      assert.ok(text.includes("w1"));
      assert.ok(text.includes("not ready"));
    });
  });

  describe("formatWorkerCompact", () => {
    it("shows header and final answer note when missing", () => {
      const text = formatWorkerCompact(baseWorker);
      assert.ok(text.includes("builder (w1)"));
      assert.ok(text.includes("No final answer block"));
    });

    it("shows pending relay questions", () => {
      const worker = { ...baseWorker, pendingRelayQuestions: [{ question: "Need input", assumption: "none", urgency: "medium" }] };
      const text = formatWorkerCompact(worker);
      assert.ok(text.includes("Need input"));
    });
  });

  describe("formatWorkers", () => {
    it("lists workers", () => {
      const text = formatWorkers([baseWorker]);
      assert.ok(text.includes("w1"));
      assert.ok(text.includes("builder"));
    });

    it("reports empty list", () => {
      assert.equal(formatWorkers([]), "No active or persisted workers.");
    });
  });

  describe("truncateList", () => {
    it("joins items when under limit", () => {
      assert.equal(truncateList(["a", "b", "c"], 5), "a, b, c");
    });

    it("truncates with overflow", () => {
      assert.equal(truncateList(["a", "b", "c", "d", "e"], 3), "a, b, c… (+2 more)");
    });
  });

  describe("truncateScanValue", () => {
    it("trims whitespace and strips ansi", () => {
      assert.equal(truncateScanValue("  hello  \nworld  "), "hello world");
    });

    it("uses placeholder for empty values", () => {
      assert.equal(truncateScanValue("", { placeholder: "none" }), "none");
    });
  });
});
