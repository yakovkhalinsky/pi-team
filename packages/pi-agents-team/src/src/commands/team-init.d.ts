import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { backupExisting, formatBackupTimestamp } from "../util/backup.js";
import { type ProjectRoleFlatConfig, type TeamConfigScope, type TeamProfileSpec, type TeamProjectConfigFile } from "../types.js";
interface InitCommandDependencies {
    emitText: (ctx: ExtensionContext, text: string) => void;
}
type InitScope = "global" | "local";
declare function parseInitArgs(args: string): {
    scope?: InitScope;
    force: boolean;
    error?: string;
};
declare function scaffoldRole(profile: TeamProfileSpec): ProjectRoleFlatConfig;
declare function buildFullScaffold(): TeamProjectConfigFile;
declare function scopeToInternal(scope: InitScope): TeamConfigScope;
export declare function registerTeamInitCommand(pi: ExtensionAPI, dependencies: InitCommandDependencies): void;
export declare const _testing: {
    parseInitArgs: typeof parseInitArgs;
    buildFullScaffold: typeof buildFullScaffold;
    scaffoldRole: typeof scaffoldRole;
    scopeToInternal: typeof scopeToInternal;
    formatBackupTimestamp: typeof formatBackupTimestamp;
    backupExisting: typeof backupExisting;
};
export {};
