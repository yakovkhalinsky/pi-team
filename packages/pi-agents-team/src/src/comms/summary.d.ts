import type { RelayQuestion, WorkerRuntimeState, WorkerSummary } from "../types.js";
export declare function extractRelayQuestions(text: string, worker: WorkerRuntimeState): RelayQuestion[];
export declare function buildWorkerSummaryFromText(text: string, worker: WorkerRuntimeState): WorkerSummary;
