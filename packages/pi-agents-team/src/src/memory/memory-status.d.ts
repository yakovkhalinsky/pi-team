export interface EdenMemoryEvent {
    markerName: string;
    ok: boolean;
    error?: string;
    memoryId?: string;
    ts: number;
}

export interface EdenMemoryStatus {
    enabled: boolean;
    healthy: boolean | undefined;
    locked: boolean;
    recordsWritten: number;
    recordsFailed: number;
    recordsSkipped?: number;
    lastError: string | undefined;
    lastHealthCheckAt: number | undefined;
    lastWriteAt: number | undefined;
    goalMemoryIds?: string[];
    taskMemoryIds?: string[];
    recordCount?: number;
    lastMarkerName?: string;
    lastResult?: "ok" | "skipped" | "error";
    eventHistory?: EdenMemoryEvent[];
}
export interface EdenMemoryMarkerResult {
    markerName: string;
    ok: boolean;
    error?: string;
    memoryId?: string;
    goalId?: string;
    taskId?: string;
    ts?: number;
    skipped?: boolean;
}
export interface EdenMemoryWriteResult {
    ok: boolean;
    id?: string;
    error?: string;
}
export interface EdenMemoryHealthResult {
    ok: boolean;
    locked?: boolean;
    error?: string;
}
export interface EdenMemoryAggregateStatus {
    enabled: true;
    recordsWritten: number;
    recordsFailed: number;
    recordsSkipped: number;
    recordCount: number;
    locked: boolean;
    healthy: boolean | undefined;
    lastError: string | undefined;
}
export interface MemoryStatusTracker {
    status: EdenMemoryStatus;
    updateFromWriteResult(result: EdenMemoryWriteResult): void;
    updateFromHealthResult(result: EdenMemoryHealthResult): void;
    startPolling(): void;
    stopPolling(): void;
}
export interface MemoryStatusTrackerOptions {
    enabled: boolean;
    health?: (options?: Record<string, unknown>, signal?: AbortSignal, timeoutMs?: number) => Promise<EdenMemoryHealthResult>;
    edenOptions?: Record<string, unknown>;
    healthIntervalMs?: number;
    healthTimeoutMs?: number;
}
export declare function createMemoryStatusTracker(options: MemoryStatusTrackerOptions): MemoryStatusTracker;
export declare function createWorkerEdenMemoryStatus(enabled: boolean): EdenMemoryStatus;
export declare function ensureWorkerEdenMemoryStatus(worker: {
    edenMemoryStatus?: EdenMemoryStatus;
}, config: {
    memory?: {
        edenMemory?: {
            enabled?: boolean;
        };
    };
} | undefined): void;
export declare function getMemoryStatusGlyph(status: EdenMemoryStatus | undefined): string;
export declare function formatMemoryStatusFragment(status: EdenMemoryStatus | undefined): string;
export declare function recordEdenMemoryMarker(status: EdenMemoryStatus | undefined, result: EdenMemoryMarkerResult): void;
export declare function formatEdenMemoryEvent(event: EdenMemoryEvent): string;
export declare function formatWorkerMemoryLine(status: EdenMemoryStatus | undefined): string | undefined;
export declare function aggregateEdenMemoryStatus(teamStatus: EdenMemoryStatus | undefined, workers: {
    edenMemoryStatus?: EdenMemoryStatus;
}[] | undefined): EdenMemoryAggregateStatus | undefined;
export declare const _testing: {
    normalizeError: (result: {
        error?: unknown;
    }) => string | undefined;
    MAX_EVENT_HISTORY: number;
    aggregateEdenMemoryStatus: (teamStatus: EdenMemoryStatus | undefined, workers: {
        edenMemoryStatus?: EdenMemoryStatus;
    }[] | undefined) => EdenMemoryAggregateStatus | undefined;
};
