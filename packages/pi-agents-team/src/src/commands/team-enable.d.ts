import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { LoadedTeamProjectConfig } from "../types.js";
import type { RoutingMode, TeamManager } from "../control-plane/team-manager.js";
export interface TeamEnableCommandDependencies {
    getTeamManager: () => TeamManager;
    getProjectConfig: () => LoadedTeamProjectConfig;
    emitText: (ctx: ExtensionContext, text: string) => void;
    ensureNotReloading: () => void;
}
interface ParsedArgs {
    mode?: RoutingMode;
    persist?: "global" | "local";
    persistAliasDeprecated?: boolean;
    error?: string;
}
declare function parseTeamEnableArgs(args: string): ParsedArgs;
interface CompletionItem {
    value: string;
    label: string;
    description: string;
}
declare function buildTeamEnableCompletions(prefix: string): CompletionItem[];
export declare function deriveScopeFromSourcePath(sourcePath: string, cwd: string): "global" | "local" | undefined;
export declare function persistRoutingMode(scope: "global" | "local", routingMode: RoutingMode, cwd: string): {
    path: string;
    warning?: string;
} | {
    error: string;
};
export declare function runSetRoutingMode(mode: RoutingMode, persist: "global" | "local" | undefined, ctx: ExtensionContext, deps: TeamEnableCommandDependencies, options?: {
    persistAliasDeprecated?: boolean;
}): void;
export declare function registerTeamEnableCommand(pi: ExtensionAPI, dependencies: TeamEnableCommandDependencies): void;
export declare const _testing: {
    parseTeamEnableArgs: typeof parseTeamEnableArgs;
    buildTeamEnableCompletions: typeof buildTeamEnableCompletions;
    persistRoutingMode: typeof persistRoutingMode;
    deriveScopeFromSourcePath: typeof deriveScopeFromSourcePath;
};
export {};
