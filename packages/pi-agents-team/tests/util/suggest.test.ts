import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatUnknownWorker, suggestTargets } from "../../src/src/util/suggest.js";

describe("util/suggest", () => {
  describe("suggestTargets", () => {
    it("returns empty for empty input", () => {
      assert.deepEqual(suggestTargets("", ["w1", "w2"]), []);
    });

    it("matches exact worker ids", () => {
      assert.deepEqual(suggestTargets("w1", ["w1", "builder", "runtime"]), ["w1"]);
    });

    it("matches prefix", () => {
      assert.deepEqual(suggestTargets("w", ["w1", "w2", "builder"]), ["w1", "w2"]);
    });

    it("suggests close typos within maxDistance", () => {
      assert.deepEqual(suggestTargets("w2", ["w1", "w22"]), ["w1", "w22"]);
    });

    it("deduplicates candidates", () => {
      assert.deepEqual(suggestTargets("w1", ["w1", "w1"]), ["w1"]);
    });

    it("respects the limit option", () => {
      const candidates = ["w1", "w2", "w3"];
      assert.equal(suggestTargets("w", candidates, { limit: 2 }).length, 2);
    });
  });

  describe("formatUnknownWorker", () => {
    it("returns base message when no suggestions", () => {
      assert.equal(formatUnknownWorker("wx", []), "Unknown worker: wx");
    });

    it("appends suggestions", () => {
      assert.equal(formatUnknownWorker("wx", ["w1", "w2"]), "Unknown worker: wx. Did you mean: w1, w2?");
    });
  });
});
