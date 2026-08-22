import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { WorkerRuntimeState, WorkerStatus } from "../types.js";
import type { CommandRegistrationContext } from "./team.js";
type StopResult = {
    kind: "cancel";
    workerId: string;
    profileName: string;
    previousStatus: WorkerStatus;
    nextStatus: WorkerStatus;
} | {
    kind: "close";
    workerId: string;
    profileName: string;
    previousStatus: WorkerStatus;
    nextStatus: WorkerStatus;
} | {
    kind: "refuse";
    workerId: string;
    status: WorkerStatus;
    reason: string;
} | {
    kind: "error";
    workerId: string;
    profileName?: string;
    previousStatus?: WorkerStatus;
    message: string;
};
declare function describe(result: StopResult): string;
declare function stopOne(dependencies: CommandRegistrationContext, worker: WorkerRuntimeState): Promise<StopResult>;
export declare function registerTeamStopCommand(pi: ExtensionAPI, dependencies: CommandRegistrationContext): void;
export declare const _testing: {
    stopOne: typeof stopOne;
    describe: typeof describe;
};
export {};
