import { compareWorkerIds } from "../types.js";
const STATUS_DISPLAY = {
    created: { label: "Created", glyph: "·", primaryAction: "Wait for startup" },
    starting: { label: "Starting", glyph: "◌", primaryAction: "Wait for startup" },
    running: { label: "Running", glyph: "▶", primaryAction: "Monitor progress" },
    waiting_followup: { label: "Waiting for follow-up", glyph: "▸", primaryAction: "Send follow-up" },
    idle: { label: "Idle", glyph: "○", primaryAction: "Reuse or close" },
    completed: { label: "Completed", glyph: "✓", primaryAction: "Review result" },
    aborted: { label: "Aborted", glyph: "✗", primaryAction: "Delegate fresh" },
    error: { label: "Error", glyph: "✗", primaryAction: "Recover or delegate fresh" },
    exited: { label: "Exited", glyph: "✗", primaryAction: "Delegate fresh" },
};
const ATTENTION_DISPLAY = {
    needs_reply: { rank: 0, label: "Needs reply", primaryAction: "Answer relay" },
    needs_recovery: { rank: 1, label: "Needs recovery", primaryAction: "Recover or delegate fresh" },
    in_progress: { rank: 2, label: "Working", primaryAction: "Monitor progress" },
    completed_or_idle: { rank: 3, label: "Done", primaryAction: "Review, reuse, or close" },
};
export const WORKER_ATTENTION_ORDER = [
    "needs_reply",
    "needs_recovery",
    "in_progress",
    "completed_or_idle",
];
export function formatWorkerDisplayId(workerId) {
    return `(${workerId})`;
}
export function formatProfileLabel(profileName) {
    return profileName.trim() || "worker";
}
export function formatWorkerIdList(workerIds) {
    return workerIds.map((workerId) => workerId.trim()).filter(Boolean).sort(compareWorkerIds).join(", ");
}
export function formatWorkerIdListSuffix(workerIds) {
    const ids = formatWorkerIdList(workerIds);
    return ids ? ` (${ids})` : "";
}
export function buildAgentToolCallTitle(toolName, args = {}) {
    switch (toolName) {
        case "delegate_task":
            return args.reuseWorkerId
                ? `Reusing ${formatProfileLabel(args.profileName ?? "")} agent ${formatWorkerDisplayId(args.reuseWorkerId)}`
                : `Launching ${formatProfileLabel(args.profileName ?? "")} agent`;
        case "agent_result":
            return `Reading agent result${formatWorkerIdListSuffix(args.workerId ? [args.workerId] : [])}`;
        case "wait_for_agents":
            return `Waiting for agents${formatWorkerIdListSuffix(args.workerIds ?? [])}`;
        case "agent_message":
            return `Messaging agent${formatWorkerIdListSuffix(args.workerId ? [args.workerId] : [])}`;
        case "agent_status":
            return args.workerId ? `Checking agent status${formatWorkerIdListSuffix([args.workerId])}` : "Checking agent status";
        case "ping_agents":
            return `Pinging agents${formatWorkerIdListSuffix(args.workerIds ?? [])}`;
        case "agent_cancel":
            return `Cancelling agent${formatWorkerIdListSuffix(args.workerId ? [args.workerId] : [])}`;
    }
}
export function formatWorkerLabel(worker) {
    return `${formatProfileLabel(worker.profileName)} ${formatWorkerDisplayId(worker.workerId)}`;
}
export function formatWorkerToolLabel(worker) {
    return `${worker.workerId} (${formatProfileLabel(worker.profileName)})`;
}
export function formatWorkerStatusLabel(worker) {
    const status = typeof worker === "string" ? worker : worker.status;
    if (typeof worker !== "string" && status === "idle" && worker.finalAnswer)
        return "Done (idle)";
    return STATUS_DISPLAY[status].label;
}
export function getWorkerStatusDisplay(status) {
    return { status, ...STATUS_DISPLAY[status] };
}
export function getWorkerStatusGlyph(worker) {
    if (worker.status === "idle" && worker.finalAnswer)
        return "✓";
    return STATUS_DISPLAY[worker.status].glyph;
}
export function getWorkerAttentionPriority(worker) {
    if (worker.pendingRelayQuestions.length > 0)
        return "needs_reply";
    if (worker.error || worker.status === "error" || worker.status === "aborted" || worker.status === "exited")
        return "needs_recovery";
    if (worker.status === "created" || worker.status === "running" || worker.status === "starting" || worker.status === "waiting_followup")
        return "in_progress";
    return "completed_or_idle";
}
export function getWorkerAttentionDisplay(priority) {
    return { key: priority, ...ATTENTION_DISPLAY[priority] };
}
export function getWorkerPrimaryAction(worker) {
    if (worker.pendingRelayQuestions.length > 0)
        return ATTENTION_DISPLAY.needs_reply.primaryAction;
    if (worker.error)
        return ATTENTION_DISPLAY.needs_recovery.primaryAction;
    if (worker.status === "idle" && worker.finalAnswer)
        return "Review result";
    return STATUS_DISPLAY[worker.status].primaryAction;
}
export function buildWorkerActionHint(worker) {
    const attention = getWorkerAttentionDisplay(getWorkerAttentionPriority(worker));
    return `${attention.label}: ${getWorkerPrimaryAction(worker)}`;
}
export function formatWorkerStartedToast(worker) {
    return `${worker.workerId} (${formatProfileLabel(worker.profileName)}) started`;
}
export function formatWorkersStartedToast(workers) {
    return `${workers.length} workers started: ${formatWorkerIdList(workers.map((worker) => worker.workerId))}`;
}
export function formatTerminalStatusAction(status) {
    if (status === "aborted")
        return "cancelled";
    if (status === "error")
        return "failed";
    if (status === "exited")
        return "exited";
    return "complete";
}
export function formatWorkerTerminalToast(worker) {
    return `${worker.workerId} (${formatProfileLabel(worker.profileName)}) ${formatTerminalStatusAction(worker.status)}`;
}
export function formatWorkersTerminalToast(workers) {
    const items = workers
        .slice()
        .sort((left, right) => compareWorkerIds(left.workerId, right.workerId))
        .map((worker) => `${worker.workerId} ${formatTerminalStatusAction(worker.status)}`);
    return `${workers.length} workers done: ${items.join(", ")}`;
}
export function formatRelayToast(worker, question) {
    const preview = question.replace(/\s+/g, " ").trim().slice(0, 120);
    return `Reply to ${worker.workerId} (${formatProfileLabel(worker.profileName)}): ${preview}`;
}
export function formatCommandWarning(message) {
    return `Warning — ${message}`;
}
