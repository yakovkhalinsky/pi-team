import { type NormalizedWorkerEvent } from "./event-normalizer.js";
import { RpcClient, type RpcSessionState, type RpcSessionStats } from "./rpc-client.js";
import { type ProbeWorkerPiVersion } from "./pi-version.js";
import { type SpawnWorkerProcess, type WorkerProcessHandle } from "./worker-process.js";
export { extractFinalAnswer } from "./final-answer.js";
import type { DelegatedTaskInput, ThinkingLevel, WorkerExtensionMode, WorkerProjectTrustOverride, WorkerRuntimeState } from "../types.js";
export interface LaunchWorkerOptions {
    workerId: string;
    profileName: string;
    task: DelegatedTaskInput;
    cwd: string;
    model?: string;
    thinkingLevel?: ThinkingLevel;
    tools?: string[];
    workerExtensions?: string[];
    systemPromptPath?: string;
    extensionMode?: WorkerExtensionMode;
    projectTrust?: WorkerProjectTrustOverride;
    allowSkills?: boolean;
    command?: string;
    baseArgs?: string[];
    extraArgs?: string[];
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
}
export interface ManagedWorkerRecord {
    workerId: string;
    client: RpcClient;
    handle: WorkerProcessHandle;
    state: WorkerRuntimeState;
}
export interface WorkerPiVersionMismatchEvent {
    type: "pi_version_mismatch";
    hostVersion: string;
    workerVersion: string;
    command: string;
    message: string;
}
export interface WorkerConsoleEvent {
    ts: number;
    kind: "status" | "tool_start" | "tool_end" | "assistant_text" | "assistant_message" | "queue" | "error" | "exit";
    text: string;
}
export type WorkerActivityKind = "status" | "command" | "tool" | "process" | "final_summary" | "queue" | "error" | "exit";
export type WorkerActivityStatus = "started" | "completed" | "error" | "info";
export interface WorkerActivityEvent {
    id: string;
    ts: number;
    updatedAt: number;
    actionKind: WorkerActivityKind;
    status: WorkerActivityStatus;
    label: string;
    summary?: string;
    toolName?: string;
    command?: string;
    outputSnippet?: string;
    hiddenLineCount?: number;
    sourceEvent: NormalizedWorkerEvent["type"] | "worker_text_flush";
    toolCallId?: string;
    finalSummaryFields?: {
        headline?: string;
        risks?: string[];
        nextRecommendation?: string;
    };
}
export interface AssistantChunk {
    index: number;
    ts: number;
    text: string;
}
export interface WorkerLaunchSnapshot {
    cwd: string;
    command?: string;
    baseArgs?: string[];
    model?: string;
    thinkingLevel?: ThinkingLevel;
    tools?: string[];
    workerExtensions?: string[];
    systemPromptPath?: string;
    extensionMode?: WorkerExtensionMode;
    projectTrust?: WorkerProjectTrustOverride;
    allowSkills: boolean;
}
export interface WorkerManagerLifecycleOptions {
    abortTimeoutMs?: number;
    handleDisposeTimeoutMs?: number;
}
export declare const DEFAULT_HANDLE_DISPOSE_TIMEOUT_MS: number;
export declare class WorkerManager {
    private readonly spawnProcess;
    private readonly workers;
    private readonly pendingLaunches;
    private readonly emitter;
    private readonly probeVersion;
    private readonly abortTimeoutMs;
    private readonly handleDisposeTimeoutMs;
    private disposed;
    private disposePromise?;
    constructor(spawnProcess?: SpawnWorkerProcess, probeVersion?: ProbeWorkerPiVersion, lifecycle?: WorkerManagerLifecycleOptions);
    onEvent(listener: (worker: ManagedWorkerRecord, event: NormalizedWorkerEvent) => void): () => void;
    onPiVersionMismatch(listener: (event: WorkerPiVersionMismatchEvent) => void): () => void;
    launchWorker(options: LaunchWorkerOptions): Promise<ManagedWorkerRecord>;
    private launchReservedWorker;
    hasWorker(workerId: string): boolean;
    getLaunchSnapshot(workerId: string): WorkerLaunchSnapshot | undefined;
    removeWorker(workerId: string): Promise<void>;
    prepareWorkerReuse(workerId: string, task: DelegatedTaskInput): ManagedWorkerRecord;
    reuseWorker(workerId: string, message: string, task: DelegatedTaskInput): Promise<void>;
    closeWorker(workerId: string, reason?: string): Promise<void>;
    promptWorker(workerId: string, message: string): Promise<void>;
    steerWorker(workerId: string, message: string): Promise<void>;
    followUpWorker(workerId: string, message: string): Promise<void>;
    abortWorker(workerId: string): Promise<void>;
    refreshState(workerId: string): Promise<RpcSessionState>;
    refreshStats(workerId: string, signal?: AbortSignal): Promise<RpcSessionStats>;
    getWorker(workerId: string): ManagedWorkerRecord | undefined;
    getWorkerTranscript(workerId: string): string | undefined;
    getWorkerConsole(workerId: string): WorkerConsoleEvent[] | undefined;
    getWorkerActivity(workerId: string): WorkerActivityEvent[] | undefined;
    getAssistantTail(workerId: string, fromIndex?: number): AssistantChunk[];
    onAssistantChunk(listener: (workerId: string, chunk: AssistantChunk) => void): () => void;
    onActivityEvent(listener: (workerId: string, event: WorkerActivityEvent) => void): () => void;
    private appendAssistantChunk;
    private appendConsole;
    private appendActivity;
    private updateActivity;
    private nextActivityId;
    private appendFinalSummaryActivity;
    private discoverFinalAnswer;
    private flushPendingText;
    listWorkers(): ManagedWorkerRecord[];
    shutdownWorker(workerId: string, signal?: NodeJS.Signals): Promise<void>;
    dispose(): Promise<void>;
    private disposeAll;
    private disposePendingHandleBounded;
    private disposeHandleBounded;
    private withDeadline;
    private applyNormalizedEvent;
    private detectThinkingClamp;
    private updateUsage;
    private assertSupportedWorkerVersion;
    private requireWorker;
    private snapshot;
}
