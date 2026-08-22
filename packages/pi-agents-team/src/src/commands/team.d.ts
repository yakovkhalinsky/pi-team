import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TeamManager } from "../control-plane/team-manager.js";
export interface CommandRegistrationContext {
    teamManager: TeamManager;
    emitText: (ctx: ExtensionContext, text: string) => void;
}
export declare function registerTeamCommand(pi: ExtensionAPI, dependencies: CommandRegistrationContext): void;
