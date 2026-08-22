import type { Theme } from "@earendil-works/pi-coding-agent";
import { type PersistedTeamState, type WorkerRuntimeState } from "../types.js";
import { type WorkerAttentionPriority } from "./display-grammar.js";
export type WorkerAttentionGroup = WorkerAttentionPriority;
export interface WorkerRosterSection {
    key: WorkerAttentionGroup;
    label: string;
    workers: WorkerRuntimeState[];
}
export interface TeamDashboardTextOptions {
    theme?: Theme;
    width?: number;
    displayCost?: boolean;
}
export declare function getWorkerAttentionGroup(worker: WorkerRuntimeState): WorkerAttentionGroup;
export declare function buildWorkerPrioritySnippet(worker: WorkerRuntimeState): string;
export declare function buildRosterSections(state: PersistedTeamState): WorkerRosterSection[];
export declare function buildActionSummaryLine(state: PersistedTeamState, theme?: Theme): string;
export declare function buildCompactTeamSummaryLine(state: PersistedTeamState, theme?: Theme): string;
export declare function buildTeamDashboardLines(state: PersistedTeamState, themeOrOptions?: Theme | TeamDashboardTextOptions, width?: number): string[];
export declare function buildTeamDashboardText(state: PersistedTeamState, themeOrOptions?: Theme | TeamDashboardTextOptions, width?: number): string;
