import type { WorkerUsageAggregate, WorkerUsageStats } from "../types.js";
/**
 * Format token counts for narrow status surfaces.
 *
 * Semantics: values below 1000 stay raw; `k` is thousands (1000),
 * `m` is millions (1000000); suffixes are lowercase. One decimal is kept
 * only when it adds signal, so threshold values remain compact (1000 -> 1k).
 */
export declare function formatCompactTokenCount(value: number): string;
type CacheUsageLike = Pick<WorkerUsageStats | WorkerUsageAggregate, "cacheReadTokens" | "cacheWriteTokens">;
type CacheHitUsageLike = Pick<WorkerUsageStats | WorkerUsageAggregate, "inputTokens" | "cacheReadTokens" | "cacheWriteTokens">;
export declare function hasCacheUsage(usage: CacheUsageLike): boolean;
export declare function formatCacheUsage(usage: CacheUsageLike): string | undefined;
export declare function formatCacheHitPercent(usage: CacheHitUsageLike): string | undefined;
export declare function formatCacheUsageWithHit(usage: CacheHitUsageLike): string | undefined;
export declare function formatContextBudget(usage: WorkerUsageStats): string | undefined;
export {};
