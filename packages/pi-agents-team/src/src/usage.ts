function numericField(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
export function createZeroWorkerUsageAggregate() {
    return {
        workers: 0,
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsd: 0,
        contextTokens: 0,
    };
}
export function normalizeWorkerUsageAggregate(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return createZeroWorkerUsageAggregate();
    }
    const record = value;
    return {
        workers: numericField(record.workers),
        turns: numericField(record.turns),
        inputTokens: numericField(record.inputTokens),
        outputTokens: numericField(record.outputTokens),
        cacheReadTokens: numericField(record.cacheReadTokens),
        cacheWriteTokens: numericField(record.cacheWriteTokens),
        costUsd: numericField(record.costUsd),
        contextTokens: numericField(record.contextTokens),
    };
}
export function addWorkerUsageToAggregate(aggregate, usage, workerCount = 1) {
    return {
        workers: aggregate.workers + workerCount,
        turns: aggregate.turns + usage.turns,
        inputTokens: aggregate.inputTokens + usage.inputTokens,
        outputTokens: aggregate.outputTokens + usage.outputTokens,
        cacheReadTokens: aggregate.cacheReadTokens + usage.cacheReadTokens,
        cacheWriteTokens: aggregate.cacheWriteTokens + usage.cacheWriteTokens,
        costUsd: aggregate.costUsd + usage.costUsd,
        contextTokens: aggregate.contextTokens + (usage.contextTokens ?? 0),
    };
}
export function aggregateWorkerUsage(activeWorkers, retainedUsage = createZeroWorkerUsageAggregate()) {
    let aggregate = { ...retainedUsage };
    for (const worker of activeWorkers) {
        aggregate = addWorkerUsageToAggregate(aggregate, worker.usage);
    }
    return aggregate;
}
export function hasWorkerUsage(usage) {
    return usage.turns !== 0
        || usage.inputTokens !== 0
        || usage.outputTokens !== 0
        || usage.cacheReadTokens !== 0
        || usage.cacheWriteTokens !== 0
        || usage.costUsd !== 0
        || usage.contextTokens !== 0;
}
