import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { OverlayOptions } from "@earendil-works/pi-tui";
import type { AgentMessageResult, TeamManager } from "../control-plane/team-manager.js";
import type { AssistantChunk, WorkerActivityEvent, WorkerConsoleEvent } from "../runtime/worker-manager.js";
import { type PersistedTeamState } from "../types.js";
import { buildTeamDashboardText } from "./dashboard.js";
type OverlayTab = "workers" | "inspect" | "console" | "cost";
interface OverlayLikeTerminal {
    columns: number;
    rows: number;
}
interface OverlayLikeTui {
    terminal: OverlayLikeTerminal;
    requestRender?: (force?: boolean) => void;
}
export declare const TEAM_DASHBOARD_OVERLAY_OPTIONS: OverlayOptions;
declare function sanitizeText(text: string): string;
export declare function buildTabBar(active: OverlayTab, routingMode: "team" | "solo", displayCost?: boolean): string;
interface OverlayTeamManager {
    snapshot(): PersistedTeamState;
    pingWorkers(options?: {
        mode?: "passive" | "active";
    }): Promise<unknown>;
    getWorkerTranscript(workerId: string): string | undefined;
    getWorkerConsole(workerId: string): WorkerConsoleEvent[] | undefined;
    getWorkerActivity?(workerId: string): WorkerActivityEvent[] | undefined;
    getAssistantTail(workerId: string, fromIndex?: number): AssistantChunk[];
    onAssistantChunk?(listener: (workerId: string, chunk: AssistantChunk) => void): () => void;
    onActivityEvent?(listener: (workerId: string, event: WorkerActivityEvent) => void): () => void;
    messageWorker?(workerId: string, message: string, delivery?: "auto" | "steer" | "follow_up"): Promise<AgentMessageResult>;
    closeWorker?(workerId: string, reason?: string): Promise<unknown>;
    cancelWorker?(workerId: string): Promise<unknown>;
    pruneTerminalWorkers?(): Promise<unknown[]>;
    delegateTask?(request: {
        title: string;
        goal: string;
        profileName: string;
        cwd: string;
        reuseWorkerId?: string;
    }): Promise<unknown>;
    routingMode?: "team" | "solo";
    config?: {
        profiles: Array<{
            name: string;
        }>;
    };
    displayCost?: boolean;
}
export declare const TEAM_DASHBOARD_INITIAL_REFRESH_TIMEOUT_MS = 5000;
export interface OpenTeamDashboardOptions {
    initialWorkerId?: string;
    cwd?: string;
    displayCost?: boolean;
    theme?: Theme;
    initialRefreshTimeoutMs?: number;
}
export declare function createTeamDashboardOverlayComponent(tui: OverlayLikeTui, teamManager: OverlayTeamManager, initialSnapshot: PersistedTeamState, done: () => void, options?: OpenTeamDashboardOptions): {
    render(width: number): string[];
    invalidate(): void;
    handleInput(data: string): void;
    dispose(): void;
};
export declare function openTeamDashboardOverlay(ctx: ExtensionContext, teamManager: TeamManager, options?: OpenTeamDashboardOptions): Promise<void>;
export { buildTeamDashboardText, sanitizeText };
