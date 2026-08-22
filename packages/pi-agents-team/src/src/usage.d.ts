import type { WorkerRuntimeState, WorkerUsageAggregate, WorkerUsageStats } from "./types.js";
export declare function createZeroWorkerUsageAggregate(): WorkerUsageAggregate;
export declare function normalizeWorkerUsageAggregate(value: unknown): WorkerUsageAggregate;
export declare function addWorkerUsageToAggregate(aggregate: WorkerUsageAggregate, usage: WorkerUsageStats, workerCount?: number): WorkerUsageAggregate;
export declare function aggregateWorkerUsage(activeWorkers: Iterable<WorkerRuntimeState>, retainedUsage?: WorkerUsageAggregate): WorkerUsageAggregate;
export declare function hasWorkerUsage(usage: WorkerUsageAggregate): boolean;
