import type { Theme } from "@earendil-works/pi-coding-agent";
import { type PersistedTeamState } from "../types.js";
export declare const SPINNER_FRAMES: string[];
export declare const TEAM_STATUS_TIPS: readonly ["Use /team to view workers", "Use /team-result <id> for final output", "Use /team-copy <id> to copy a worker result", "Use /team-init [local] to rewrite default team", "Use /team-steer <id> <message> to guide a worker", "Use /team-stop <id> to cancel or close a worker", "Use /team <id> to view one worker details", "Use /team-enable [on/off] to manage orchestrator"];
export declare function hasAnimatedWorkers(state: PersistedTeamState): boolean;
export interface WidgetRenderOptions {
    frame?: number;
    routingMode?: "team" | "solo";
    displayCost?: boolean;
    now?: number;
    theme?: Theme;
    width?: number;
}
export declare function getTeamStatusTip(index: number): string;
export declare function buildTeamStatusLine(state: PersistedTeamState, routingMode?: "team" | "solo", tip?: string, orchestratorWorking?: boolean, theme?: Theme, width?: number): string;
export declare function buildTeamWidgetLines(state: PersistedTeamState, options?: WidgetRenderOptions): string[];
