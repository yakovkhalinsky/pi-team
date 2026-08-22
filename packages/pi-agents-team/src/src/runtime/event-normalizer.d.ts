import type { RpcEvent, RpcSessionState } from "./rpc-client.js";
import type { ThinkingLevel } from "../types.js";
export interface WorkerStartedEvent {
    type: "worker_started";
    timestamp: number;
}
export interface WorkerRunningEvent {
    type: "worker_running";
    timestamp: number;
}
export interface WorkerTextDeltaEvent {
    type: "worker_text_delta";
    delta: string;
    timestamp: number;
}
export interface WorkerMessageEvent {
    type: "worker_message";
    message: Record<string, unknown>;
    timestamp: number;
}
export interface WorkerToolStartedEvent {
    type: "worker_tool_started";
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    timestamp: number;
}
export interface WorkerToolFinishedEvent {
    type: "worker_tool_finished";
    toolCallId: string;
    toolName: string;
    result: Record<string, unknown>;
    isError: boolean;
    timestamp: number;
}
export interface WorkerQueueUpdatedEvent {
    type: "worker_queue_updated";
    steering: string[];
    followUp: string[];
    timestamp: number;
}
export interface WorkerAgentEndEvent {
    type: "worker_agent_end";
    messages?: unknown[];
    timestamp: number;
}
export interface WorkerSummarizationRetryScheduledEvent {
    type: "worker_summarization_retry_scheduled";
    attempt?: number;
    maxAttempts?: number;
    delayMs?: number;
    errorMessage?: string;
    timestamp: number;
}
export interface WorkerSummarizationRetryAttemptStartedEvent {
    type: "worker_summarization_retry_attempt_started";
    source?: "compaction" | "branchSummary";
    reason?: "manual" | "threshold" | "overflow";
    timestamp: number;
}
export interface WorkerSummarizationRetryFinishedEvent {
    type: "worker_summarization_retry_finished";
    timestamp: number;
}
export interface WorkerIdleEvent {
    type: "worker_idle";
    timestamp: number;
}
export interface WorkerErrorEvent {
    type: "worker_error";
    error: string;
    timestamp: number;
}
export interface WorkerExtensionErrorEvent {
    type: "worker_extension_error";
    error: string;
    timestamp: number;
}
export interface WorkerStateEvent {
    type: "worker_state";
    state: RpcSessionState;
    timestamp: number;
}
export interface WorkerThinkingClampedEvent {
    type: "thinking_clamped";
    workerId: string;
    profileName: string;
    modelLabel: string;
    requested: ThinkingLevel;
    effective: ThinkingLevel;
    timestamp: number;
}
export interface WorkerExitEvent {
    type: "worker_exit";
    code: number | null;
    signal: NodeJS.Signals | null;
    stderr?: string;
    error?: string;
    timestamp: number;
}
export type NormalizedWorkerEvent = WorkerStartedEvent | WorkerRunningEvent | WorkerTextDeltaEvent | WorkerMessageEvent | WorkerToolStartedEvent | WorkerToolFinishedEvent | WorkerQueueUpdatedEvent | WorkerAgentEndEvent | WorkerSummarizationRetryScheduledEvent | WorkerSummarizationRetryAttemptStartedEvent | WorkerSummarizationRetryFinishedEvent | WorkerIdleEvent | WorkerErrorEvent | WorkerExtensionErrorEvent | WorkerStateEvent | WorkerThinkingClampedEvent | WorkerExitEvent;
export declare function normalizeRpcEvent(event: RpcEvent): NormalizedWorkerEvent[];
export declare function createWorkerStateEvent(state: RpcSessionState): WorkerStateEvent;
export declare function createThinkingClampedEvent(options: {
    workerId: string;
    profileName: string;
    modelLabel: string;
    requested: ThinkingLevel;
    effective: ThinkingLevel;
}): WorkerThinkingClampedEvent;
export declare function createWorkerExitEvent(code: number | null, signal: NodeJS.Signals | null, stderr?: string, error?: string): WorkerExitEvent;
