import type { WorkerActivityEvent, WorkerConsoleEvent } from "../runtime/worker-manager.js";
import type { WorkerRuntimeState } from "../types.js";
export declare function buildCopyPayload(worker: WorkerRuntimeState, transcript: string | undefined, consoleEvents: WorkerConsoleEvent[] | undefined, activityEvents?: WorkerActivityEvent[]): string;
