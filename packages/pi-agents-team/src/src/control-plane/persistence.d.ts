import { type PersistedTeamState, type TeamConfig, type TeamPersistenceRecord } from "../types.js";
interface SessionLikeEntry {
    type: string;
    customType?: string;
    data?: unknown;
}
export type SessionStartReason = "startup" | "reload" | "new" | "resume" | "fork";
export interface MarkRestoredWorkersExitedResult {
    state: PersistedTeamState;
    markedCount: number;
}
export interface CompactPersistenceMeasurement {
    recordCount: number;
    payloadBytes: number;
}
export interface RestorePersistedTeamStateWithMeasurementResult {
    state: PersistedTeamState;
    measurement: CompactPersistenceMeasurement;
}
/** True only for replayable records in the current compact format. */
export declare function isRecognizedCompactPersistenceRecord(value: unknown): value is TeamPersistenceRecord;
/** UTF-8 bytes occupied by the compact record payload, not session framing or total file bytes. */
export declare function compactPersistenceRecordPayloadBytes(record: TeamPersistenceRecord): number;
export declare function measureCompactPersistence(entries: Iterable<SessionLikeEntry>, stateCustomType: string): CompactPersistenceMeasurement;
export declare function restorePersistedTeamStateWithMeasurement(entries: Iterable<SessionLikeEntry>, stateCustomType: string): RestorePersistedTeamStateWithMeasurementResult;
export declare function restorePersistedTeamState(entries: Iterable<SessionLikeEntry>, stateCustomType: string): PersistedTeamState;
export declare function markRestoredWorkersExited(state: PersistedTeamState, reasonOrStartReason?: string | SessionStartReason): MarkRestoredWorkersExitedResult;
export interface CompactPersistenceJournalInstrumentation {
    onRecordHash?(kind: "terminal" | "prune"): void;
}
/** Compact v2 transition journal with append-before-commit semantics. */
export declare class CompactPersistenceJournal {
    private readonly instrumentation?;
    private previousWorkers;
    private observedWorkers;
    private observedSources;
    private observedRecords;
    private pending;
    constructor(instrumentation?: CompactPersistenceJournalInstrumentation | undefined);
    reset(state: PersistedTeamState, config: TeamConfig): void;
    private observeCurrentWorkers;
    prepare(state: PersistedTeamState, config: TeamConfig): TeamPersistenceRecord[];
    /**
     * Stage bounded detached snapshots on the current branch before Pi replaces
     * the runtime after confirmed tree navigation. This never mutates or cancels
     * the live workers; cancelled navigation can continue using them.
     */
    prepareDetachedWorkers(state: PersistedTeamState, config: TeamConfig): TeamPersistenceRecord[];
    commit(record: TeamPersistenceRecord): void;
    /** Resolve an append whose Pi leaf advanced before the call threw. */
    resolveAmbiguousAppend(record: TeamPersistenceRecord): void;
    hasPending(): boolean;
    /** Drop only uncommitted records; used to prevent cross-branch retries. */
    discardPending(): void;
    /** Compatibility helper for non-I/O callers; append wiring must use prepare/commit. */
    collect(state: PersistedTeamState, config: TeamConfig): TeamPersistenceRecord[];
}
export {};
