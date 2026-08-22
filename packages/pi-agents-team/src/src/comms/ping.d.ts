import type { RelayQuestion, WorkerRuntimeState } from "../types.js";
export interface WorkerPingSnapshot {
    workerId: string;
    profileName: string;
    status: WorkerRuntimeState["status"];
    taskTitle?: string;
    lastToolName?: string;
    lastSummary?: string;
    relayQuestions: RelayQuestion[];
    lastEventAt: number;
    usage: WorkerRuntimeState["usage"];
}
export declare function buildPassivePing(worker: WorkerRuntimeState): WorkerPingSnapshot;
export declare function formatPingSnapshot(snapshot: WorkerPingSnapshot): string;
