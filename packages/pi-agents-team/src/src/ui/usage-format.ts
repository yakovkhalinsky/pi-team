/**
 * Format token counts for narrow status surfaces.
 *
 * Semantics: values below 1000 stay raw; `k` is thousands (1000),
 * `m` is millions (1000000); suffixes are lowercase. One decimal is kept
 * only when it adds signal, so threshold values remain compact (1000 -> 1k).
 */
export function formatCompactTokenCount(value) {
    if (value >= 1_000_000)
        return `${formatScaled(value / 1_000_000)}m`;
    if (value >= 1_000)
        return `${formatScaled(value / 1_000)}k`;
    return `${value}`;
}
export function hasCacheUsage(usage) {
    return usage.cacheReadTokens !== 0 || usage.cacheWriteTokens !== 0;
}
export function formatCacheUsage(usage) {
    if (!hasCacheUsage(usage))
        return undefined;
    return `cache=r${formatCompactTokenCount(usage.cacheReadTokens)}/w${formatCompactTokenCount(usage.cacheWriteTokens)}`;
}
export function formatCacheHitPercent(usage) {
    if (!hasCacheUsage(usage))
        return undefined;
    const denominator = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
    if (denominator === 0)
        return undefined;
    return `${((usage.cacheReadTokens / denominator) * 100).toFixed(1)}%`;
}
export function formatCacheUsageWithHit(usage) {
    const cache = formatCacheUsage(usage);
    if (!cache)
        return undefined;
    const hit = formatCacheHitPercent(usage);
    return hit ? `${cache} hit=${hit}` : cache;
}
export function formatContextBudget(usage) {
    const percent = usage.contextPercent;
    const remaining = usage.contextRemainingTokens;
    if (percent === undefined && remaining === undefined)
        return undefined;
    const parts = [];
    if (percent !== undefined) {
        const window = usage.contextWindow !== undefined ? `/${formatCompactTokenCount(usage.contextWindow)}` : "";
        parts.push(`ctx=${formatPercent(percent)}%${window}`);
    }
    if (remaining !== undefined)
        parts.push(`rem=${formatCompactTokenCount(remaining)}`);
    return parts.join(" ");
}
function formatPercent(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
function formatScaled(value) {
    return value.toFixed(1).replace(/\.0$/, "");
}
