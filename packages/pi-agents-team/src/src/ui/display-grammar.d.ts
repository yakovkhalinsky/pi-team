import { type WorkerRuntimeState, type WorkerStatus } from "../types.js";
export type WorkerAttentionPriority = "needs_reply" | "needs_recovery" | "in_progress" | "completed_or_idle";
export interface WorkerAttentionDisplay {
    key: WorkerAttentionPriority;
    rank: number;
    label: string;
    primaryAction: string;
}
export interface WorkerStatusDisplay {
    status: WorkerStatus;
    label: string;
    glyph: string;
    primaryAction: string;
}
export declare const WORKER_ATTENTION_ORDER: readonly WorkerAttentionPriority[];
export declare function formatWorkerDisplayId(workerId: string): string;
export declare function formatProfileLabel(profileName: string): string;
export declare function formatWorkerIdList(workerIds: readonly string[]): string;
export declare function formatWorkerIdListSuffix(workerIds: readonly string[]): string;
export type AgentToolName = "delegate_task" | "agent_result" | "wait_for_agents" | "agent_message" | "agent_status" | "ping_agents" | "agent_cancel";
export interface AgentToolTitleArgs {
    profileName?: string;
    workerId?: string;
    workerIds?: readonly string[];
    reuseWorkerId?: string;
}
export declare function buildAgentToolCallTitle(toolName: AgentToolName, args?: AgentToolTitleArgs): string;
export declare function formatWorkerLabel(worker: Pick<WorkerRuntimeState, "workerId" | "profileName">): string;
export declare function formatWorkerToolLabel(worker: Pick<WorkerRuntimeState, "workerId" | "profileName">): string;
export declare function formatWorkerStatusLabel(worker: Pick<WorkerRuntimeState, "status" | "finalAnswer"> | WorkerStatus): string;
export declare function getWorkerStatusDisplay(status: WorkerStatus): WorkerStatusDisplay;
export declare function getWorkerStatusGlyph(worker: Pick<WorkerRuntimeState, "status" | "finalAnswer">): string;
export declare function getWorkerAttentionPriority(worker: Pick<WorkerRuntimeState, "status" | "error" | "pendingRelayQuestions">): WorkerAttentionPriority;
export declare function getWorkerAttentionDisplay(priority: WorkerAttentionPriority): WorkerAttentionDisplay;
export declare function getWorkerPrimaryAction(worker: Pick<WorkerRuntimeState, "status" | "error" | "finalAnswer" | "pendingRelayQuestions">): string;
export declare function buildWorkerActionHint(worker: Pick<WorkerRuntimeState, "status" | "error" | "finalAnswer" | "pendingRelayQuestions">): string;
export declare function formatWorkerStartedToast(worker: Pick<WorkerRuntimeState, "workerId" | "profileName">): string;
export declare function formatWorkersStartedToast(workers: readonly Pick<WorkerRuntimeState, "workerId">[]): string;
export declare function formatTerminalStatusAction(status: WorkerStatus): "complete" | "cancelled" | "failed" | "exited";
export declare function formatWorkerTerminalToast(worker: Pick<WorkerRuntimeState, "workerId" | "profileName" | "status">): string;
export declare function formatWorkersTerminalToast(workers: readonly Pick<WorkerRuntimeState, "workerId" | "status">[]): string;
export declare function formatRelayToast(worker: Pick<WorkerRuntimeState, "workerId" | "profileName">, question: string): string;
export declare function formatCommandWarning(message: string): string;
