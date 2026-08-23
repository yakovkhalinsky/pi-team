/**
 * Type declarations for memory-status.ts. The runtime is plain JavaScript;
 * this file carries the type annotations for consumers.
 */

import type { AtpMarkerName } from "./atp-markers.js";

export interface MarkerBucket {
  ok: number;
  error: number;
  skipped: number;
  lastTs?: number;
}

export interface EdenMemoryEvent {
  markerName: AtpMarkerName;
  ok: boolean;
  error?: string;
  memoryId?: string;
  ts: number;
}

export interface EdenMemoryMarkerResult {
  markerName: AtpMarkerName;
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

export interface EdenMemoryStatus {
  enabled: boolean;
  healthy: boolean | undefined;
  locked: boolean;
  recordsWritten: number;
  recordsFailed: number;
  recordsSkipped: number;
  lastError: string | undefined;
  lastHealthCheckAt: number | undefined;
  lastWriteAt: number | undefined;
  lastMarkerName?: AtpMarkerName;
  lastResult?: "ok" | "skipped" | "error";
  goalMemoryIds?: string[];
  taskMemoryIds?: string[];
  eventHistory?: EdenMemoryEvent[];
  byMarker?: Partial<Record<AtpMarkerName, MarkerBucket>>;
}

export interface EdenMemoryAggregateStatus {
  enabled: true;
  recordsWritten: number;
  recordsFailed: number;
  recordsSkipped: number;
  locked: boolean;
  healthy: boolean | undefined;
  lastError: string | undefined;
  byMarker: Partial<Record<AtpMarkerName, MarkerBucket>>;
  totals: MarkerBucket;
}

export interface MemoryStatusTrackerOptions {
  enabled: boolean;
  health?: (
    options?: Record<string, unknown>,
    signal?: AbortSignal,
    timeoutMs?: number,
  ) => Promise<EdenMemoryHealthResult>;
  edenOptions?: Record<string, unknown>;
  healthIntervalMs?: number;
  healthTimeoutMs?: number;
}

export interface MemoryStatusTracker {
  status: EdenMemoryStatus;
  updateFromWriteResult(result: EdenMemoryWriteResult): void;
  updateFromHealthResult(result: EdenMemoryHealthResult): void;
  startPolling(): void;
  stopPolling(): void;
}

export declare function createMemoryStatusTracker(options: MemoryStatusTrackerOptions): MemoryStatusTracker;
export declare function createWorkerEdenMemoryStatus(enabled: boolean): EdenMemoryStatus;
export declare function ensureWorkerEdenMemoryStatus(
  worker: { edenMemoryStatus?: EdenMemoryStatus },
  config: { memory?: { edenMemory?: { enabled?: boolean } } } | undefined,
): void;
export declare function getMemoryStatusGlyph(status: EdenMemoryStatus | undefined): string;
export declare function formatMemoryStatusFragment(status: EdenMemoryStatus | undefined): string;
export declare function recordEdenMemoryMarker(status: EdenMemoryStatus | undefined, result: EdenMemoryMarkerResult): void;
export declare function formatEdenMemoryEvent(event: EdenMemoryEvent): string;
export declare function aggregateEdenMemoryStatus(
  teamStatus: EdenMemoryStatus | undefined,
  workers: { edenMemoryStatus?: EdenMemoryStatus }[] | undefined,
): EdenMemoryAggregateStatus | undefined;
export declare const _testing: {
  normalizeError: (result: { error?: unknown }) => string | undefined;
  MAX_EVENT_HISTORY: number;
  emptyByMarker: () => Partial<Record<AtpMarkerName, MarkerBucket>>;
  aggregateEdenMemoryStatus: (
    teamStatus: EdenMemoryStatus | undefined,
    workers: { edenMemoryStatus?: EdenMemoryStatus }[] | undefined,
  ) => EdenMemoryAggregateStatus | undefined;
};
