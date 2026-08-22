import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatWorkerDetail as formatSharedWorkerDetail } from "../ui/tool-formatters.js";
import type { CommandRegistrationContext } from "./team.js";
declare function formatWorkerDetail(worker: Parameters<typeof formatSharedWorkerDetail>[0], transcript?: string): string;
export declare function registerTeamResultCommand(pi: ExtensionAPI, dependencies: CommandRegistrationContext): void;
export declare const _testing: {
    formatWorkerDetail: typeof formatWorkerDetail;
};
export {};
