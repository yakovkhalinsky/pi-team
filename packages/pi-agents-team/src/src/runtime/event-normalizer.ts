function now() {
    return Date.now();
}
function asRecord(value) {
    return typeof value === "object" && value !== null ? value : {};
}
function asStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === "string");
}
function asFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
export function normalizeRpcEvent(event) {
    switch (event.type) {
        case "agent_start":
            return [
                { type: "worker_started", timestamp: now() },
                { type: "worker_running", timestamp: now() },
            ];
        case "message_update": {
            const assistantMessageEvent = asRecord(event.assistantMessageEvent);
            if (assistantMessageEvent.type !== "text_delta")
                return [];
            const delta = assistantMessageEvent.delta;
            return typeof delta === "string" ? [{ type: "worker_text_delta", delta, timestamp: now() }] : [];
        }
        case "message_end": {
            const message = asRecord(event.message);
            return Object.keys(message).length > 0 ? [{ type: "worker_message", message, timestamp: now() }] : [];
        }
        case "tool_execution_start":
            return [
                {
                    type: "worker_tool_started",
                    toolCallId: typeof event.toolCallId === "string" ? event.toolCallId : "",
                    toolName: typeof event.toolName === "string" ? event.toolName : "",
                    args: asRecord(event.args),
                    timestamp: now(),
                },
            ];
        case "tool_execution_end":
            return [
                {
                    type: "worker_tool_finished",
                    toolCallId: typeof event.toolCallId === "string" ? event.toolCallId : "",
                    toolName: typeof event.toolName === "string" ? event.toolName : "",
                    result: asRecord(event.result),
                    isError: event.isError === true,
                    timestamp: now(),
                },
            ];
        case "queue_update":
            return [
                {
                    type: "worker_queue_updated",
                    steering: asStringArray(event.steering),
                    followUp: asStringArray(event.followUp),
                    timestamp: now(),
                },
            ];
        case "agent_end":
            return [{ type: "worker_agent_end", messages: Array.isArray(event.messages) ? event.messages : undefined, timestamp: now() }];
        case "summarization_retry_scheduled":
            return [{
                    type: "worker_summarization_retry_scheduled",
                    attempt: asFiniteNumber(event.attempt),
                    maxAttempts: asFiniteNumber(event.maxAttempts),
                    delayMs: asFiniteNumber(event.delayMs),
                    errorMessage: typeof event.errorMessage === "string" ? event.errorMessage : undefined,
                    timestamp: now(),
                }];
        case "summarization_retry_attempt_start": {
            const source = event.source === "compaction" || event.source === "branchSummary" ? event.source : undefined;
            const reason = source === "compaction"
                && (event.reason === "manual" || event.reason === "threshold" || event.reason === "overflow")
                ? event.reason
                : undefined;
            return [{
                    type: "worker_summarization_retry_attempt_started",
                    source,
                    reason,
                    timestamp: now(),
                }];
        }
        case "summarization_retry_finished":
            return [{ type: "worker_summarization_retry_finished", timestamp: now() }];
        case "agent_settled":
            return [{ type: "worker_idle", timestamp: now() }];
        case "extension_error":
            return [
                {
                    type: "worker_extension_error",
                    error: typeof event.error === "string" ? event.error : "Unknown extension error",
                    timestamp: now(),
                },
            ];
        default:
            return [];
    }
}
export function createWorkerStateEvent(state) {
    return {
        type: "worker_state",
        state,
        timestamp: now(),
    };
}
export function createThinkingClampedEvent(options) {
    return {
        type: "thinking_clamped",
        workerId: options.workerId,
        profileName: options.profileName,
        modelLabel: options.modelLabel,
        requested: options.requested,
        effective: options.effective,
        timestamp: now(),
    };
}
export function createWorkerExitEvent(code, signal, stderr, error) {
    return {
        type: "worker_exit",
        code,
        signal,
        stderr,
        error,
        timestamp: now(),
    };
}
