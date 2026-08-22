import type { DelegatedTaskInput, WorkerRuntimeState, WorkerStatus } from "../types.js";
export declare const TOOL_SECTION_LABELS: {
    readonly worker: "Worker";
    readonly profile: "Profile";
    readonly status: "Status";
    readonly task: "Task";
    readonly goal: "Goal";
    readonly cwd: "CWD";
    readonly pathScope: "Path scope";
    readonly lifecycle: "Lifecycle";
    readonly wait: "Wait";
    readonly relayQuestions: "Pending relay questions";
    readonly summary: "Headline";
    readonly readFiles: "Read files";
    readonly changedFiles: "Changed files";
    readonly risks: "Risks";
    readonly nextAction: "Next";
    readonly usage: "Usage";
    readonly context: "Context";
    readonly error: "Error";
    readonly warning: "Warning";
    readonly finalAnswerNote: "Result note";
    readonly finalAnswer: "Result";
    readonly latestAssistantText: "Latest assistant text";
};
export declare const TOOL_SECTION_ORDER: readonly ["Lifecycle", "Status", "Pending relay questions", "Headline", "Read files", "Changed files", "Risks", "Next", "Result note", "Result"];
export declare const WORKER_STATUS_SCAN_ORDER: readonly WorkerStatus[];
export declare const FINAL_ANSWER_METADATA_LABELS: {
    readonly headline: "Headline";
    readonly filesRead: "Read files";
    readonly filesChanged: "Changed files";
    readonly risks: "Risks";
    readonly nextRecommendation: "Next";
    readonly relayQuestions: "Pending relay questions";
    readonly resultNote: "Result note";
    readonly result: "Result";
};
export interface ScanFriendlyTextOptions {
    maxWidth?: number;
    placeholder?: string;
}
export interface ScanSectionInput {
    label: string;
    value?: string | number | boolean | null;
    items?: readonly (string | number | boolean | null | undefined)[];
    maxWidth?: number;
    empty?: string;
}
export interface WaitForAgentsFormatInput {
    reason: "all_terminal" | "timeout" | "aborted" | "relay_raised" | "no_workers";
    workers: WorkerRuntimeState[];
    newRelays?: Array<{
        workerId: string;
        profileName: string;
        question: string;
        urgency: string;
    }>;
}
export interface FormatWorkerDetailOptions {
    transcript?: string;
    compactUsage?: boolean;
    includeProfileLine?: boolean;
}
export declare function visibleWidth(text: string): number;
export declare function truncateScanValue(value: string, options?: ScanFriendlyTextOptions): string;
export declare function formatScanSection(section: ScanSectionInput): string | undefined;
export declare function truncateList(items: readonly string[], max: number): string;
export declare function formatWorkerListItem(worker: WorkerRuntimeState): string;
export declare function formatWorkers(workers: readonly WorkerRuntimeState[]): string;
export interface DelegateTaskFormatInput {
    worker: Pick<WorkerRuntimeState, "workerId" | "profileName" | "status" | "currentTask">;
    task?: DelegatedTaskInput;
    reuseWorkerId?: string;
    warnings?: readonly string[];
}
export declare function formatDelegateTaskResult(result: DelegateTaskFormatInput): string;
export interface AgentMessageFormatInput {
    worker: Pick<WorkerRuntimeState, "workerId" | "profileName" | "status">;
    delivery: "steer" | "follow_up" | "prompt";
    previousStatus?: WorkerStatus;
}
export declare function formatAgentMessageResult(result: AgentMessageFormatInput): string;
export declare function formatWaitForAgentsResult(result: WaitForAgentsFormatInput): string;
export declare function formatAgentResultNotReady(worker: WorkerRuntimeState): string;
export declare function formatWorkerCompact(worker: WorkerRuntimeState): string;
export declare function formatWorkerDetail(worker: WorkerRuntimeState, options?: FormatWorkerDetailOptions): string;
