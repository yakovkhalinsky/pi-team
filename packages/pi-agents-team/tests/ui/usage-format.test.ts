import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatCompactTokenCount,
  formatCacheUsage,
  formatCacheHitPercent,
  formatCacheUsageWithHit,
  formatContextBudget,
  hasCacheUsage,
} from "../../src/src/ui/usage-format.js";

describe("ui/usage-format", () => {
  describe("formatCompactTokenCount", () => {
    it("keeps small values raw", () => {
      assert.equal(formatCompactTokenCount(0), "0");
      assert.equal(formatCompactTokenCount(999), "999");
    });

    it("formats thousands with k suffix", () => {
      assert.equal(formatCompactTokenCount(1000), "1k");
      assert.equal(formatCompactTokenCount(1500), "1.5k");
      assert.equal(formatCompactTokenCount(999_999), "1000k");
    });

    it("formats millions with m suffix", () => {
      assert.equal(formatCompactTokenCount(1_000_000), "1m");
      assert.equal(formatCompactTokenCount(2_500_000), "2.5m");
    });
  });

  describe("hasCacheUsage", () => {
    it("returns false when cache counters are zero", () => {
      assert.equal(hasCacheUsage({ cacheReadTokens: 0, cacheWriteTokens: 0 }), false);
    });

    it("returns true when any cache counter is non-zero", () => {
      assert.equal(hasCacheUsage({ cacheReadTokens: 1, cacheWriteTokens: 0 }), true);
      assert.equal(hasCacheUsage({ cacheReadTokens: 0, cacheWriteTokens: 1 }), true);
    });
  });

  describe("formatCacheUsage", () => {
    it("returns undefined without cache usage", () => {
      assert.equal(formatCacheUsage({ cacheReadTokens: 0, cacheWriteTokens: 0 }), undefined);
    });

    it("formats read/write counters", () => {
      assert.equal(formatCacheUsage({ cacheReadTokens: 1234, cacheWriteTokens: 56 }), "cache=r1.2k/w56");
    });
  });

  describe("formatCacheHitPercent", () => {
    it("returns undefined when there is no cache usage", () => {
      assert.equal(formatCacheHitPercent({ inputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 }), undefined);
    });

    it("calculates hit percent", () => {
      assert.equal(formatCacheHitPercent({ inputTokens: 50, cacheReadTokens: 50, cacheWriteTokens: 0 }), "50.0%");
    });

    it("returns undefined with zero denominator", () => {
      assert.equal(formatCacheHitPercent({ inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }), undefined);
    });
  });

  describe("formatContextBudget", () => {
    it("returns undefined when no budget fields are set", () => {
      assert.equal(formatContextBudget({}), undefined);
    });

    it("includes percent and window", () => {
      assert.equal(formatContextBudget({ contextPercent: 45, contextWindow: 128_000 }), "ctx=45%/128k");
    });

    it("includes remaining tokens", () => {
      assert.equal(formatContextBudget({ contextRemainingTokens: 5_000 }), "rem=5k");
    });

    it("joins percent and remaining", () => {
      assert.equal(
        formatContextBudget({ contextPercent: 80, contextRemainingTokens: 10_000 }),
        "ctx=80% rem=10k",
      );
    });
  });
});
