import type { WorkerStatus } from "../types.js";
export type WorkerMessageDeliveryInput = "auto" | "steer" | "follow_up";
export type WorkerMessageDeliveryResolved = "steer" | "follow_up" | "prompt";
export type WorkerMessageDelivery = WorkerMessageDeliveryInput;
export declare function resolveWorkerMessageDelivery(status: WorkerStatus, delivery?: WorkerMessageDeliveryInput): WorkerMessageDeliveryResolved;
