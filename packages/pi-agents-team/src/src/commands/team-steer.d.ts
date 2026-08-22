import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CommandRegistrationContext } from "./team.js";
interface ParsedArgs {
    target?: string;
    message?: string;
    queue: boolean;
    error?: string;
}
declare function parseSteerArgs(raw: string): ParsedArgs;
export declare function registerTeamSteerCommand(pi: ExtensionAPI, dependencies: CommandRegistrationContext): void;
export declare const _testing: {
    parseSteerArgs: typeof parseSteerArgs;
};
export {};
