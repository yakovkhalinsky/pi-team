import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compareWorkerIds,
  isPackagedProfileName,
  THINKING_LEVELS,
  WORKER_STATUSES,
} from "../src/src/types.js";

describe("types", () => {
  describe("compareWorkerIds", () => {
    it("sorts w-prefixed ids numerically", () => {
      assert.deepEqual(["w2", "w10", "w1"].sort(compareWorkerIds), ["w1", "w2", "w10"]);
    });

    it("sorts non-prefixed ids lexicographically", () => {
      assert.deepEqual(["alpha", "beta", "a1"].sort(compareWorkerIds), ["a1", "alpha", "beta"]);
    });

    it("places w-prefixed ids before plain ids", () => {
      assert.deepEqual(["plain", "w5", "w1"].sort(compareWorkerIds), ["w1", "w5", "plain"]);
    });
  });

  describe("isPackagedProfileName", () => {
    it("returns true for packaged profile names", () => {
      assert.equal(isPackagedProfileName("builder"), true);
      assert.equal(isPackagedProfileName("runtime"), true);
    });

    it("returns false for unknown names", () => {
      assert.equal(isPackagedProfileName("custom"), false);
      assert.equal(isPackagedProfileName(""), false);
    });
  });

  it("THINKING_LEVELS contains expected levels", () => {
    assert.deepEqual(THINKING_LEVELS, ["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
  });

  it("WORKER_STATUSES includes terminal statuses", () => {
    assert.ok(WORKER_STATUSES.includes("completed"));
    assert.ok(WORKER_STATUSES.includes("error"));
    assert.ok(WORKER_STATUSES.includes("idle"));
  });
});
