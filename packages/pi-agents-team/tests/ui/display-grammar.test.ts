import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatProfileLabel,
  formatWorkerDisplayId,
  formatWorkerIdList,
  formatWorkerLabel,
  formatWorkerStatusLabel,
  getWorkerStatusGlyph,
  getWorkerAttentionPriority,
  buildAgentToolCallTitle,
} from "../../src/src/ui/display-grammar.js";

describe("ui/display-grammar", () => {
  describe("formatProfileLabel", () => {
    it("trims whitespace and falls back to 'worker'", () => {
      assert.equal(formatProfileLabel("  builder  "), "builder");
      assert.equal(formatProfileLabel(""), "worker");
    });
  });

  describe("formatWorkerDisplayId", () => {
    it("wraps the id in parentheses", () => {
      assert.equal(formatWorkerDisplayId("w1"), "(w1)");
    });
  });

  describe("formatWorkerIdList", () => {
    it("sorts ids numerically and joins them", () => {
      assert.equal(formatWorkerIdList(["w2", "w10", "w1"]), "w1, w2, w10");
    });

    it("drops blank entries", () => {
      assert.equal(formatWorkerIdList(["w1", "", "  ", "w2"]), "w1, w2");
    });
  });

  describe("formatWorkerLabel", () => {
    it("combines profile label and worker id", () => {
      const label = formatWorkerLabel({ profileName: "builder", workerId: "w3" });
      assert.equal(label, "builder (w3)");
    });
  });

  describe("formatWorkerStatusLabel", () => {
    it("labels idle-with-final-answer as done", () => {
      assert.equal(formatWorkerStatusLabel({ status: "idle", finalAnswer: "done" }), "Done (idle)");
    });

    it("labels plain statuses", () => {
      assert.equal(formatWorkerStatusLabel({ status: "running" }), "Running");
      assert.equal(formatWorkerStatusLabel({ status: "error" }), "Error");
    });
  });

  describe("getWorkerStatusGlyph", () => {
    it("returns checkmark for idle worker with final answer", () => {
      assert.equal(getWorkerStatusGlyph({ status: "idle", finalAnswer: "yes" }), "✓");
    });

    it("returns status glyph otherwise", () => {
      assert.equal(getWorkerStatusGlyph({ status: "running" }), "▶");
      assert.equal(getWorkerStatusGlyph({ status: "starting" }), "◌");
    });
  });

  describe("getWorkerAttentionPriority", () => {
    it("prioritizes pending relay questions", () => {
      const worker = { status: "running", pendingRelayQuestions: [{ question: "q" }] } as any;
      assert.equal(getWorkerAttentionPriority(worker), "needs_reply");
    });

    it("then errors", () => {
      assert.equal(getWorkerAttentionPriority({ status: "running", error: "boom", pendingRelayQuestions: [] }), "needs_recovery");
    });

    it("then active work", () => {
      assert.equal(getWorkerAttentionPriority({ status: "running", pendingRelayQuestions: [] }), "in_progress");
    });

    it("then completed or idle", () => {
      assert.equal(getWorkerAttentionPriority({ status: "completed", pendingRelayQuestions: [] }), "completed_or_idle");
      assert.equal(getWorkerAttentionPriority({ status: "idle", pendingRelayQuestions: [] }), "completed_or_idle");
    });
  });

  describe("buildAgentToolCallTitle", () => {
    it("titles delegate_task", () => {
      assert.equal(buildAgentToolCallTitle("delegate_task", { profileName: "builder" }), "Launching builder agent");
    });

    it("titles reuse case", () => {
      assert.equal(
        buildAgentToolCallTitle("delegate_task", { profileName: "runtime", reuseWorkerId: "w2" }),
        "Reusing runtime agent (w2)",
      );
    });

    it("titles other tools", () => {
      assert.equal(buildAgentToolCallTitle("wait_for_agents", { workerIds: ["w1", "w2"] }), "Waiting for agents (w1, w2)");
      assert.equal(buildAgentToolCallTitle("agent_result", { workerId: "w1" }), "Reading agent result (w1)");
    });
  });
});
