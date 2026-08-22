import { type DelegatedTaskInput, type PersistedTeamState, type WorkerRuntimeState, type WorkerUsageAggregate } from "../types.js";
export declare class TaskRegistry {
    private state;
    constructor(initialState?: PersistedTeamState);
    restore(nextState: PersistedTeamState): void;
    registerTask(task: DelegatedTaskInput): void;
    unregisterTask(taskId: string): void;
    upsertWorker(worker: WorkerRuntimeState): void;
    markWorkerExited(workerId: string, reason: string): WorkerRuntimeState | undefined;
    removeWorker(workerId: string): WorkerRuntimeState | undefined;
    listWorkers(): WorkerRuntimeState[];
    getWorker(workerId: string): WorkerRuntimeState | undefined;
    getTask(taskId: string): DelegatedTaskInput | undefined;
    getPrunedWorkerUsageTotals(): WorkerUsageAggregate;
    snapshot(): PersistedTeamState;
    private touch;
    private refreshDerivedState;
}
