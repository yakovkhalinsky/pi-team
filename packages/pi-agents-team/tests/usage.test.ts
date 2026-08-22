import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addWorkerUsageToAggregate,
  aggregateWorkerUsage,
  createZeroWorkerUsageAggregate,
  hasWorkerUsage,
  normalizeWorkerUsageAggregate,
} from "../src/src/usage.js";

describe("usage", () => {
  it("createZeroWorkerUsageAggregate returns all zeros", () => {
    const agg = createZeroWorkerUsageAggregate();
    assert.deepEqual(agg, {
      workers: 0,
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
      contextTokens: 0,
    });
  });

  it("normalizeWorkerUsageAggregate coerces invalid values to zero", () => {
    assert.deepEqual(normalizeWorkerUsageAggregate(null), createZeroWorkerUsageAggregate());
    assert.deepEqual(normalizeWorkerUsageAggregate("bad"), createZeroWorkerUsageAggregate());
    assert.deepEqual(
      normalizeWorkerUsageAggregate({ turns: "10", inputTokens: Infinity, costUsd: NaN }),
      createZeroWorkerUsageAggregate(),
    );
  });

  it("normalizeWorkerUsageAggregate keeps valid numbers", () => {
    const agg = { workers: 2, turns: 5, inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5, costUsd: 0.123, contextTokens: 1 };
    assert.deepEqual(normalizeWorkerUsageAggregate(agg), agg);
  });

  it("addWorkerUsageToAggregate adds usage and increments worker count", () => {
    const base = createZeroWorkerUsageAggregate();
    const usage = { turns: 1, inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01, contextTokens: 0 };
    const result = addWorkerUsageToAggregate(base, usage, 2);
    assert.equal(result.workers, 2);
    assert.equal(result.turns, 1);
    assert.equal(result.inputTokens, 10);
    assert.equal(result.outputTokens, 20);
    assert.equal(result.costUsd, 0.01);
  });

  it("hasWorkerUsage returns false for zero aggregate", () => {
    assert.equal(hasWorkerUsage(createZeroWorkerUsageAggregate()), false);
  });

  it("hasWorkerUsage returns true when any field is non-zero", () => {
    const base = createZeroWorkerUsageAggregate();
    for (const key of ["turns", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "costUsd", "contextTokens"]) {
      const agg = { ...base, [key]: key === "costUsd" ? 0.001 : 1 };
      assert.equal(hasWorkerUsage(agg), true, `expected usage for ${key}`);
    }
  });

  it("aggregateWorkerUsage sums retained and active worker usage", () => {
    const retained = { workers: 1, turns: 2, inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.1, contextTokens: 0 };
    const workers = [
      { usage: { turns: 1, inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01, contextTokens: 0 } },
      { usage: { turns: 3, inputTokens: 15, outputTokens: 25, cacheReadTokens: 2, cacheWriteTokens: 1, costUsd: 0.04, contextTokens: 0 } },
    ];
    const result = aggregateWorkerUsage(workers, retained);
    assert.equal(result.workers, 3);
    assert.equal(result.turns, 6);
    assert.equal(result.inputTokens, 40);
    assert.equal(result.outputTokens, 40);
    assert.equal(result.cacheReadTokens, 2);
    assert.equal(result.cacheWriteTokens, 1);
    assert.equal(result.costUsd, 0.15);
  });
});
