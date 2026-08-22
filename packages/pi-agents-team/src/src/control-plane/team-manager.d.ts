import { TaskRegistry } from "./task-registry.js";
import { type WorkerMessageDeliveryResolved } from "../comms/agent-messaging.js";
import { WorkerManager, type AssistantChunk, type WorkerActivityEvent, type WorkerConsoleEvent } from "../runtime/worker-manager.js";
import type { WorktreeManager } from "../worktree/worktree-manager.js";
import type { DelegatedTaskInput, PersistedTeamState, TeamConfig, TeamPathScope, ThinkingLevel, WorkerExtensionMode, WorkerRuntimeState, WorkerStatus, WorkerUsageAggregate } from "../types.js";
export declare function isTerminalWorkerStatus(status: WorkerStatus): boolean;
export type RoutingMode = "team" | "solo";
export interface DelegateTaskRequest {
    title: string;
    goal: string;
    profileName: string;
    cwd: string;
    contextHints?: string[];
    expectedOutput?: string;
    pathScope?: TeamPathScope;
    skills?: string[];
    model?: string;
    orchestratorModel?: string;
    orchestratorThinkingLevel?: ThinkingLevel;
    /**
     * Trust decision for the visible orchestrator's current project. Undefined
     * means the Pi runtime did not expose a trust decision (older Pi), so worker
     * launches must not receive new trust override flags.
     */
    projectTrusted?: boolean;
    /** Root that the orchestrator trust decision applies to. */
    projectTrustRoot?: string;
    thinkingLevel?: ThinkingLevel;
    tools?: string[];
    systemPromptPath?: string;
    extensionMode?: WorkerExtensionMode;
    reuseWorkerId?: string;
}
export interface AgentResult {
    worker: WorkerRuntimeState;
    task?: DelegatedTaskInput;
}
export interface AgentMessageResult extends AgentResult {
    delivery: WorkerMessageDeliveryResolved;
    previousStatus: WorkerStatus;
}
export interface PingAgentsRequest {
    workerIds?: string[];
    mode?: "passive" | "active";
}
export declare class TeamManager {
    private readonly events;
    private readonly registry;
    private readonly workerManager;
    private readonly worktreeManager;
    private workerCounter;
    private taskCounter;
    private _routingMode;
    private readonly activePingTimeoutMs;
    private readonly activeRefreshes;
    readonly displayCost: boolean;
    constructor(options?: {
        config?: TeamConfig;
        registry?: TaskRegistry;
        workerManager?: WorkerManager;
        worktreeManager?: WorktreeManager;
        routingMode?: RoutingMode;
        displayCost?: boolean;
        activePingTimeoutMs?: number;
    });
    get routingMode(): RoutingMode;
    setRoutingMode(mode: RoutingMode): void;
    private nextWorkerId;
    private nextTaskId;
    resolveWorkerId(input: string): string | undefined;
    readonly config: TeamConfig;
    onStateChange(listener: (state: PersistedTeamState) => void): () => void;
    onBeforePrompt(listener: (state: PersistedTeamState) => void): () => void;
    restore(state: PersistedTeamState): void;
    snapshot(): PersistedTeamState;
    delegateTask(request: DelegateTaskRequest, signal?: AbortSignal): Promise<AgentResult>;
    listWorkers(): WorkerRuntimeState[];
    getWorkerStatus(workerId: string): WorkerRuntimeState | undefined;
    getWorkerResult(workerId: string): AgentResult | undefined;
    getWorkerTranscript(workerId: string): string | undefined;
    getWorkerConsole(workerId: string): WorkerConsoleEvent[] | undefined;
    getWorkerActivity(workerId: string): WorkerActivityEvent[] | undefined;
    getAssistantTail(workerId: string, fromIndex?: number): AssistantChunk[];
    onAssistantChunk(listener: (workerId: string, chunk: AssistantChunk) => void): () => void;
    onActivityEvent(listener: (workerId: string, event: WorkerActivityEvent) => void): () => void;
    messageWorker(workerId: string, message: string, delivery?: "auto" | "steer" | "follow_up"): Promise<AgentMessageResult>;
    messageAllWorkers(message: string, delivery?: "auto" | "steer" | "follow_up"): Promise<AgentMessageResult[]>;
    cancelAllWorkers(): Promise<AgentResult[]>;
    pingWorkers(request?: PingAgentsRequest): Promise<AgentResult[]>;
    private refreshWorkerForActivePing;
    private persistActivePingWarning;
    private buildActivePingSnapshotSummary;
    private reuseWorkerForTask;
    closeWorker(workerId: string, reason?: string): Promise<AgentResult>;
    closeAllWorkers(): Promise<AgentResult[]>;
    cancelWorker(workerId: string): Promise<AgentResult>;
    dispose(): Promise<void>;
    pruneTerminalWorkers(): Promise<WorkerRuntimeState[]>;
    aggregateUsage(): WorkerUsageAggregate;
    waitForTerminal(targetIds: string[], options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
        wakeOnRelay?: boolean;
    }): Promise<{
        reason: "all_terminal" | "timeout" | "aborted" | "relay_raised";
        workers: WorkerRuntimeState[];
        newRelays?: Array<{
            workerId: string;
            profileName: string;
            question: string;
            urgency: string;
        }>;
    }>;
    private requireWorker;
    private requireResult;
}
