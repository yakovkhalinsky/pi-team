import type { RelayQuestion, WorkerRuntimeState } from "../types.js";
export declare function collectPendingRelayQuestions(activeWorkers: Record<string, WorkerRuntimeState>): RelayQuestion[];
