import { EventEmitter } from "node:events";
import { createDeferred } from "./deferred.js";
import { createThinkingClampedEvent, createWorkerExitEvent, createWorkerStateEvent, normalizeRpcEvent, } from "./event-normalizer.js";
import { RpcClient } from "./rpc-client.js";
import { HOST_PI_VERSION, probeWorkerPiVersion, } from "./pi-version.js";
import { spawnWorkerProcess, WORKER_PROCESS_DISPOSE_MAX_MS, } from "./worker-process.js";
import { buildWorkerSummaryFromText, extractRelayQuestions } from "../comms/summary.js";
import { extractFinalAnswer, parseFinalAnswerSummaryFields } from "./final-answer.js";
export { extractFinalAnswer } from "./final-answer.js";
import { THINKING_LEVELS } from "../types.js";
const REUSABLE_STATUSES = new Set(["idle", "waiting_followup"]);
const UNREACHABLE_TERMINAL_STATUSES = new Set([
    "completed",
    "aborted",
    "error",
    "exited",
]);
const CONSOLE_BUFFER_LIMIT = 500;
const ACTIVITY_BUFFER_LIMIT = 500;
const TOOL_OUTPUT_ACTIVITY_LINE_LIMIT = 6;
const TOOL_OUTPUT_ACTIVITY_CHAR_LIMIT = 800;
const ASSISTANT_TEXT_BATCH_MS = 400;
// Cap is on the number of buffered text-delta chunks, NOT rendered lines —
// a single chunk may contain newlines. Memory is bounded by the byte cap;
// the chunk cap exists to keep the array from growing unboundedly when each
// chunk is small. Either limit shifts the oldest chunk out.
const ASSISTANT_BUFFER_CHUNK_CAP = 4096;
const ASSISTANT_BUFFER_BYTE_CAP = 256 * 1024;
const ASSISTANT_TRANSCRIPT_BYTE_CAP = 256 * 1024;
const ASSISTANT_TRANSCRIPT_LINE_CAP = 4000;
const DEFAULT_ABORT_TIMEOUT_MS = 1_000;
export const DEFAULT_HANDLE_DISPOSE_TIMEOUT_MS = WORKER_PROCESS_DISPOSE_MAX_MS + 250;
function launchAbortError(workerId) {
    const error = new Error(`Worker launch aborted for ${workerId}`);
    error.name = "AbortError";
    return error;
}
function throwIfLaunchAborted(workerId, signal) {
    if (signal?.aborted)
        throw launchAbortError(workerId);
}
async function waitForAbort(promise, signal, createAbortError) {
    if (!signal)
        return promise;
    if (signal.aborted)
        throw createAbortError();
    const { promise: aborted, reject } = createDeferred();
    const onAbort = () => reject(createAbortError());
    signal.addEventListener("abort", onAbort, { once: true });
    try {
        return await Promise.race([promise, aborted]);
    }
    finally {
        signal.removeEventListener("abort", onAbort);
    }
}
function emptyUsage() {
    return {
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsd: 0,
    };
}
function trimSummary(text, maxLength = 160) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength)
        return normalized;
    return `${normalized.slice(0, maxLength - 1)}…`;
}
function finiteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function snippet(value, maxLength = 200) {
    if (value === undefined || value === null)
        return "";
    let text;
    if (typeof value === "string") {
        text = value;
    }
    else {
        try {
            text = JSON.stringify(value);
        }
        catch {
            text = String(value);
        }
    }
    return trimSummary(text, maxLength);
}
function extractResultText(result) {
    const content = result?.content;
    if (Array.isArray(content)) {
        const pieces = content
            .filter((part) => typeof part === "object" && part !== null)
            .filter((part) => part.type === "text" && typeof part.text === "string")
            .map((part) => part.text);
        if (pieces.length > 0)
            return pieces.join("\n");
    }
    return snippet(result);
}
function extractCommand(args) {
    const direct = args.command;
    if (typeof direct === "string" && direct.trim())
        return direct.trim();
    const cmd = args.cmd;
    if (typeof cmd === "string" && cmd.trim())
        return cmd.trim();
    return undefined;
}
function buildOutputSnippet(text) {
    const normalized = text.replace(/\r/g, "").trim();
    if (!normalized)
        return { snippet: "", hiddenLineCount: 0 };
    const lines = normalized.split("\n");
    const visibleLines = lines.slice(0, TOOL_OUTPUT_ACTIVITY_LINE_LIMIT);
    let output = visibleLines.join("\n");
    let hiddenLineCount = Math.max(0, lines.length - visibleLines.length);
    if (Buffer.byteLength(output, "utf8") > TOOL_OUTPUT_ACTIVITY_CHAR_LIMIT) {
        output = trimSummary(output, TOOL_OUTPUT_ACTIVITY_CHAR_LIMIT);
        if (hiddenLineCount === 0 && lines.length > 1)
            hiddenLineCount = lines.length - 1;
    }
    return { snippet: output, hiddenLineCount };
}
function extractAssistantText(message) {
    const content = Array.isArray(message.content) ? message.content : [];
    return content
        .filter((part) => typeof part === "object" && part !== null)
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n")
        .trim();
}
function buildFinalSummary(finalAnswer) {
    const fields = parseFinalAnswerSummaryFields(finalAnswer);
    const pieces = [fields?.headline, fields?.risks?.[0] ? `Risk: ${fields.risks[0]}` : undefined, fields?.nextRecommendation ? `Next: ${fields.nextRecommendation}` : undefined]
        .filter((value) => Boolean(value));
    return { summary: trimSummary(pieces.length > 0 ? pieces.join(" · ") : finalAnswer, 360), fields };
}
function trimTranscriptTail(text) {
    let trimmed = text;
    const lines = trimmed.split("\n");
    if (lines.length > ASSISTANT_TRANSCRIPT_LINE_CAP) {
        trimmed = lines.slice(-ASSISTANT_TRANSCRIPT_LINE_CAP).join("\n");
    }
    let start = 0;
    while (Buffer.byteLength(trimmed.slice(start), "utf8") > ASSISTANT_TRANSCRIPT_BYTE_CAP) {
        start += Math.max(1, Math.ceil((Buffer.byteLength(trimmed.slice(start), "utf8") - ASSISTANT_TRANSCRIPT_BYTE_CAP) / 4));
    }
    if (start > 0)
        trimmed = trimmed.slice(start);
    const droppedLength = Math.max(0, text.length - trimmed.length);
    return { text: trimmed, droppedText: droppedLength > 0 ? text.slice(0, droppedLength) : "" };
}
function transcriptTruncationNote(record) {
    if (!record.textBufferTruncated)
        return undefined;
    const parts = [
        record.textBufferDroppedBytes > 0 ? `${record.textBufferDroppedBytes.toLocaleString()} bytes` : undefined,
        record.textBufferDroppedLines > 0 ? `${record.textBufferDroppedLines.toLocaleString()} lines` : undefined,
    ].filter((part) => Boolean(part));
    return `[transcript truncated: showing retained tail; omitted ${parts.join(" / ") || "earlier assistant text"}]`;
}
function appendTranscriptText(record, text) {
    const combined = record.textBuffer + text;
    const trimmed = trimTranscriptTail(combined);
    if (trimmed.droppedText) {
        record.textBufferTruncated = true;
        record.textBufferDroppedBytes += Buffer.byteLength(trimmed.droppedText, "utf8");
        record.textBufferDroppedLines += Math.max(0, trimmed.droppedText.split("\n").length - 1);
    }
    record.textBuffer = trimmed.text;
}
function setTranscriptText(record, text) {
    const trimmed = trimTranscriptTail(text);
    record.textBufferTruncated = Boolean(trimmed.droppedText);
    record.textBufferDroppedBytes = trimmed.droppedText ? Buffer.byteLength(trimmed.droppedText, "utf8") : 0;
    record.textBufferDroppedLines = trimmed.droppedText ? Math.max(0, trimmed.droppedText.split("\n").length - 1) : 0;
    record.textBuffer = trimmed.text;
}
function finalSummaryKey(finalAnswer) {
    return finalAnswer.replace(/\s+/g, " ").trim();
}
function buildSummary(state, text) {
    const summary = buildWorkerSummaryFromText(text || state.currentTask?.title || `${state.profileName}:${state.status}`, state);
    return {
        ...summary,
        headline: trimSummary(summary.headline),
        relayQuestionCount: state.pendingRelayQuestions.length,
    };
}
function createInitialState(options) {
    const requestedThinkingLevel = options.thinkingLevel ?? "medium";
    return {
        workerId: options.workerId,
        profileName: options.profileName,
        sessionMode: "worker",
        status: "starting",
        requestedThinkingLevel,
        effectiveThinkingLevel: requestedThinkingLevel,
        startedAt: Date.now(),
        lastEventAt: Date.now(),
        currentTask: options.task,
        pendingRelayQuestions: [],
        usage: emptyUsage(),
    };
}
function isThinkingLevel(value) {
    return typeof value === "string" && THINKING_LEVELS.includes(value);
}
function deriveStatusFromSessionState(state) {
    return state.isStreaming ? "running" : "idle";
}
function createWorkerProcessOptions(options) {
    return {
        cwd: options.cwd,
        command: options.command,
        baseArgs: options.baseArgs,
        model: options.model,
        thinkingLevel: options.thinkingLevel,
        tools: options.tools,
        workerExtensions: options.workerExtensions,
        systemPromptPath: options.systemPromptPath,
        extensionMode: options.extensionMode,
        projectTrust: options.projectTrust,
        allowSkills: options.allowSkills,
        extraArgs: options.extraArgs,
        env: options.env,
    };
}
export class WorkerManager {
    spawnProcess;
    workers = new Map();
    pendingLaunches = new Map();
    emitter = new EventEmitter();
    probeVersion;
    abortTimeoutMs;
    handleDisposeTimeoutMs;
    disposed = false;
    disposePromise;
    constructor(spawnProcess = spawnWorkerProcess, probeVersion, lifecycle = {}) {
        this.spawnProcess = spawnProcess;
        // Tests and embedders that inject a fake process launcher must not
        // accidentally execute the developer's machine-global `pi` binary.
        this.probeVersion = probeVersion ?? (spawnProcess === spawnWorkerProcess
            ? probeWorkerPiVersion
            : async (options) => ({
                command: options.command ?? "pi",
                versionArgs: ["--version"],
                hostVersion: HOST_PI_VERSION,
                minimumVersion: HOST_PI_VERSION,
                workerVersion: HOST_PI_VERSION,
                supported: true,
                mismatch: false,
            }));
        this.abortTimeoutMs = lifecycle.abortTimeoutMs ?? DEFAULT_ABORT_TIMEOUT_MS;
        this.handleDisposeTimeoutMs = lifecycle.handleDisposeTimeoutMs ?? DEFAULT_HANDLE_DISPOSE_TIMEOUT_MS;
    }
    onEvent(listener) {
        this.emitter.on("event", listener);
        return () => this.emitter.off("event", listener);
    }
    onPiVersionMismatch(listener) {
        this.emitter.on("pi_version_mismatch", listener);
        return () => this.emitter.off("pi_version_mismatch", listener);
    }
    launchWorker(options) {
        try {
            throwIfLaunchAborted(options.workerId, options.signal);
        }
        catch (error) {
            return Promise.reject(error);
        }
        if (this.disposed) {
            return Promise.reject(new Error("WorkerManager is disposed; cannot launch workers"));
        }
        if (this.workers.has(options.workerId) || this.pendingLaunches.has(options.workerId)) {
            return Promise.reject(new Error(`Worker already exists: ${options.workerId}`));
        }
        // Reserve the id synchronously, before version preflight yields, so two
        // same-id callers cannot both reach spawn.
        const pending = { cancelled: false, abortController: new AbortController() };
        this.pendingLaunches.set(options.workerId, pending);
        const promise = this.launchReservedWorker(options, pending).finally(() => {
            if (this.pendingLaunches.get(options.workerId) === pending) {
                this.pendingLaunches.delete(options.workerId);
            }
        });
        pending.promise = promise;
        return promise;
    }
    async launchReservedWorker(options, pending) {
        const launchSignal = options.signal
            ? AbortSignal.any([options.signal, pending.abortController.signal])
            : pending.abortController.signal;
        const version = await waitForAbort(this.probeVersion({
            command: options.command,
            baseArgs: options.baseArgs,
            cwd: options.cwd,
            env: options.env,
        }), launchSignal, () => launchAbortError(options.workerId));
        if (pending.cancelled || this.disposed) {
            throw new Error(`Worker launch cancelled for ${options.workerId}: WorkerManager is disposed`);
        }
        this.assertSupportedWorkerVersion(version, options.workerId);
        if (version.mismatch && version.workerVersion) {
            this.emitter.emit("pi_version_mismatch", {
                type: "pi_version_mismatch",
                hostVersion: version.hostVersion,
                workerVersion: version.workerVersion,
                command: version.command,
                message: `Pi Agents Team: host Pi ${version.hostVersion} is launching worker Pi ${version.workerVersion} via ${version.command}; the supported version mismatch is non-fatal.`,
            });
        }
        throwIfLaunchAborted(options.workerId, launchSignal);
        const handle = this.spawnProcess(createWorkerProcessOptions(options));
        pending.handle = handle;
        const client = new RpcClient(handle.transport);
        const requestedThinkingLevel = options.thinkingLevel ?? "medium";
        const record = {
            workerId: options.workerId,
            client,
            handle,
            state: createInitialState(options),
            textBuffer: "",
            console: [],
            activity: [],
            pendingToolActivityByCallId: new Map(),
            pendingTextDelta: "",
            pendingTextFlushAt: 0,
            unsubscribers: [],
            closing: false,
            awaitingSettlement: false,
            requestedThinkingLevel,
            thinkingClamped: false,
            assistantChunks: [],
            assistantChunkBytes: 0,
            assistantNextIndex: 0,
            activityNextIndex: 0,
            finalSummaryKeys: new Set(),
            textBufferTruncated: false,
            textBufferDroppedBytes: 0,
            textBufferDroppedLines: 0,
            launchSnapshot: {
                cwd: options.cwd,
                command: options.command,
                baseArgs: options.baseArgs ? [...options.baseArgs] : undefined,
                model: options.model,
                thinkingLevel: options.thinkingLevel,
                tools: options.tools ? [...options.tools] : undefined,
                workerExtensions: options.workerExtensions ? [...options.workerExtensions] : undefined,
                systemPromptPath: options.systemPromptPath,
                extensionMode: options.extensionMode,
                projectTrust: options.projectTrust,
                allowSkills: options.allowSkills === true,
            },
        };
        this.workers.set(options.workerId, record);
        record.unsubscribers.push(client.onEvent((event) => {
            for (const normalizedEvent of normalizeRpcEvent(event)) {
                this.applyNormalizedEvent(record, normalizedEvent);
            }
        }));
        record.unsubscribers.push(client.onError((error) => {
            const normalizedEvent = {
                type: "worker_error",
                error: error.message,
                timestamp: Date.now(),
            };
            this.applyNormalizedEvent(record, normalizedEvent);
        }));
        let launchCommitted = false;
        const exitPromise = handle.waitForExit().then((exitInfo) => {
            if (launchCommitted) {
                const event = createWorkerExitEvent(exitInfo.code, exitInfo.signal, handle.stderrBuffer, exitInfo.error?.message);
                this.applyNormalizedEvent(record, event);
            }
            return exitInfo;
        });
        try {
            const state = await waitForAbort(Promise.race([
                this.refreshState(options.workerId),
                exitPromise.then((exitInfo) => {
                    throw exitInfo.error ?? new Error("Worker exited before launch completed");
                }),
            ]), launchSignal, () => launchAbortError(options.workerId));
            throwIfLaunchAborted(options.workerId, launchSignal);
            launchCommitted = true;
            this.detectThinkingClamp(record, state);
            return this.snapshot(options.workerId);
        }
        catch (error) {
            for (const off of record.unsubscribers)
                off();
            record.client.dispose("Worker launch failed");
            this.workers.delete(options.workerId);
            let cleanupError;
            try {
                await this.disposePendingHandleBounded(pending, `launch cleanup for ${options.workerId}`);
            }
            catch (disposeError) {
                cleanupError = disposeError;
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (cleanupError) {
                const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
                throw new AggregateError([error, cleanupError], `Worker launch failed for ${options.workerId}: ${errorMessage}; ${cleanupMessage}`);
            }
            throw new Error(`Worker launch failed for ${options.workerId}: ${errorMessage}`, { cause: error });
        }
    }
    hasWorker(workerId) {
        return this.workers.has(workerId);
    }
    getLaunchSnapshot(workerId) {
        const record = this.workers.get(workerId);
        return record ? {
            ...record.launchSnapshot,
            baseArgs: record.launchSnapshot.baseArgs ? [...record.launchSnapshot.baseArgs] : undefined,
            tools: record.launchSnapshot.tools ? [...record.launchSnapshot.tools] : undefined,
            workerExtensions: record.launchSnapshot.workerExtensions ? [...record.launchSnapshot.workerExtensions] : undefined,
        } : undefined;
    }
    async removeWorker(workerId) {
        const record = this.workers.get(workerId);
        if (!record)
            return;
        if (REUSABLE_STATUSES.has(record.state.status)) {
            try {
                await this.closeWorker(workerId, "Worker auto-closed on removal.");
            }
            catch {
                // Best-effort: still drop the map entry below.
            }
        }
        for (const off of record.unsubscribers)
            off();
        record.client.dispose("Worker removed");
        this.workers.delete(workerId);
    }
    prepareWorkerReuse(workerId, task) {
        const record = this.requireWorker(workerId);
        if (!REUSABLE_STATUSES.has(record.state.status)) {
            throw new Error(`Worker ${workerId} cannot be reused (status=${record.state.status}). Only idle and waiting_followup workers retain a live RPC session.`);
        }
        record.state.currentTask = task;
        record.state.finalAnswer = undefined;
        record.state.lastToolName = undefined;
        record.state.pendingRelayQuestions = [];
        record.state.lastSummary = undefined;
        record.state.error = undefined;
        record.textBuffer = "";
        record.pendingTextDelta = "";
        record.pendingTextFlushAt = 0;
        record.activity = [];
        record.pendingToolActivityByCallId = new Map();
        record.assistantChunks = [];
        record.assistantChunkBytes = 0;
        record.assistantNextIndex = 0;
        record.activityNextIndex = 0;
        record.finalSummaryKeys = new Set();
        record.textBufferTruncated = false;
        record.textBufferDroppedBytes = 0;
        record.textBufferDroppedLines = 0;
        record.awaitingSettlement = false;
        // Reuse keeps the same RPC session and launch-time model/thinking flags,
        // so the post-launch clamp comparison remains valid for the reused task.
        return this.snapshot(workerId);
    }
    async reuseWorker(workerId, message, task) {
        this.prepareWorkerReuse(workerId, task);
        await this.promptWorker(workerId, message);
    }
    async closeWorker(workerId, reason = "Worker closed by operator.") {
        const record = this.requireWorker(workerId);
        if (!REUSABLE_STATUSES.has(record.state.status)) {
            throw new Error(`Worker ${workerId} cannot be closed (status=${record.state.status}). Only idle and waiting_followup workers can be closed; running workers need /team-stop.`);
        }
        record.closing = true;
        record.state.error = reason;
        await record.handle.dispose();
    }
    async promptWorker(workerId, message) {
        const record = this.requireWorker(workerId);
        record.awaitingSettlement = true;
        record.state.status = "running";
        record.state.lastEventAt = Date.now();
        record.state.lastSummary = buildSummary(record.state, record.textBuffer || message);
        this.emitter.emit("event", this.snapshot(workerId), { type: "worker_running", timestamp: record.state.lastEventAt });
        try {
            await record.client.prompt(message);
        }
        catch (error) {
            const timestamp = Date.now();
            const errorMessage = error instanceof Error ? error.message : String(error);
            record.awaitingSettlement = false;
            record.state.status = "error";
            record.state.error = errorMessage;
            record.state.lastEventAt = timestamp;
            record.state.lastSummary = buildSummary(record.state, errorMessage);
            this.flushPendingText(record);
            this.appendConsole(record, { ts: timestamp, kind: "error", text: errorMessage });
            this.emitter.emit("event", this.snapshot(workerId), {
                type: "worker_error",
                error: errorMessage,
                timestamp,
            });
            throw error;
        }
    }
    async steerWorker(workerId, message) {
        const record = this.requireWorker(workerId);
        await record.client.steer(message);
    }
    async followUpWorker(workerId, message) {
        const record = this.requireWorker(workerId);
        await record.client.followUp(message);
    }
    async abortWorker(workerId) {
        const record = this.requireWorker(workerId);
        const timestamp = Date.now();
        // Pi emits agent_settled before the abort RPC response. Establish terminal
        // precedence first so that event cannot expose a transient successful idle.
        record.awaitingSettlement = false;
        record.state.status = "aborted";
        record.state.lastEventAt = timestamp;
        record.state.lastSummary = buildSummary(record.state, record.textBuffer || "Aborted");
        try {
            await this.withDeadline(record.client.abort(), this.abortTimeoutMs, `Abort RPC for ${workerId}`);
        }
        catch (error) {
            const abortMessage = error instanceof Error ? error.message : String(error);
            let shutdownError;
            try {
                // TeamManager cannot reach its follow-up shutdown when abort rejects
                // or hangs. Bounded disposal prevents either failure from stranding
                // the cancellation call forever.
                await this.disposeHandleBounded(record.handle, `abort cleanup for ${workerId}`);
            }
            catch (errorDuringShutdown) {
                shutdownError = errorDuringShutdown;
            }
            let shutdownMessage;
            if (shutdownError instanceof Error)
                shutdownMessage = shutdownError.message;
            else if (shutdownError !== undefined)
                shutdownMessage = String(shutdownError);
            const detail = shutdownMessage
                ? `Abort RPC failed: ${abortMessage}; process shutdown also failed: ${shutdownMessage}`
                : `Abort RPC failed: ${abortMessage}; worker process was terminated`;
            const failedAt = Date.now();
            record.awaitingSettlement = false;
            record.state.status = shutdownMessage ? "error" : "aborted";
            record.state.error = detail;
            record.state.lastEventAt = failedAt;
            record.state.lastSummary = buildSummary(record.state, detail);
            this.appendConsole(record, { ts: failedAt, kind: "error", text: detail });
            this.appendActivity(record, {
                id: this.nextActivityId(record, "worker_error", failedAt),
                ts: failedAt,
                updatedAt: failedAt,
                actionKind: "error",
                status: "error",
                label: "Abort failed",
                summary: trimSummary(detail, 260),
                sourceEvent: "worker_error",
            });
            this.emitter.emit("event", this.snapshot(workerId), {
                type: "worker_error",
                error: detail,
                timestamp: failedAt,
            });
            throw new Error(detail, { cause: error });
        }
    }
    async refreshState(workerId) {
        const record = this.requireWorker(workerId);
        const state = await record.client.getState();
        this.applyNormalizedEvent(record, createWorkerStateEvent(state));
        return state;
    }
    async refreshStats(workerId, signal) {
        const record = this.requireWorker(workerId);
        let stats;
        try {
            stats = await record.client.getSessionStats(signal);
        }
        catch (error) {
            if (!signal?.aborted)
                throw error;
            const abortError = new Error(`Worker reuse aborted for ${workerId}`, { cause: error });
            abortError.name = "AbortError";
            throw abortError;
        }
        record.state.usage = this.updateUsage(record.state.usage, stats);
        record.state.lastSummary = buildSummary(record.state, record.textBuffer);
        return stats;
    }
    getWorker(workerId) {
        return this.snapshot(workerId);
    }
    getWorkerTranscript(workerId) {
        const record = this.workers.get(workerId);
        if (!record)
            return undefined;
        const note = transcriptTruncationNote(record);
        return note ? `${note}\n${record.textBuffer}` : record.textBuffer;
    }
    getWorkerConsole(workerId) {
        const record = this.workers.get(workerId);
        if (!record)
            return undefined;
        return record.console.slice();
    }
    getWorkerActivity(workerId) {
        const record = this.workers.get(workerId);
        if (!record)
            return undefined;
        this.discoverFinalAnswer(record, "worker_text_flush", Date.now());
        return structuredClone(record.activity);
    }
    getAssistantTail(workerId, fromIndex) {
        const record = this.workers.get(workerId);
        if (!record)
            return [];
        if (fromIndex === undefined)
            return record.assistantChunks.slice();
        return record.assistantChunks.filter((chunk) => chunk.index >= fromIndex);
    }
    onAssistantChunk(listener) {
        this.emitter.on("assistant_chunk", listener);
        return () => this.emitter.off("assistant_chunk", listener);
    }
    onActivityEvent(listener) {
        this.emitter.on("activity_event", listener);
        return () => this.emitter.off("activity_event", listener);
    }
    appendAssistantChunk(record, ts, text) {
        if (!text)
            return;
        const chunk = { index: record.assistantNextIndex, ts, text };
        record.assistantNextIndex += 1;
        record.assistantChunks.push(chunk);
        record.assistantChunkBytes += Buffer.byteLength(text, "utf8");
        // Keep at least one chunk even if it overshoots the byte cap; otherwise a
        // single oversized delta would self-evict and leave the live tail empty.
        while (record.assistantChunks.length > 1
            && (record.assistantChunks.length > ASSISTANT_BUFFER_CHUNK_CAP
                || record.assistantChunkBytes > ASSISTANT_BUFFER_BYTE_CAP)) {
            const dropped = record.assistantChunks.shift();
            if (!dropped)
                break;
            record.assistantChunkBytes -= Buffer.byteLength(dropped.text, "utf8");
        }
        this.emitter.emit("assistant_chunk", record.workerId, chunk);
    }
    appendConsole(record, event) {
        record.console.push(event);
        if (record.console.length > CONSOLE_BUFFER_LIMIT) {
            record.console.splice(0, record.console.length - CONSOLE_BUFFER_LIMIT);
        }
    }
    appendActivity(record, event) {
        record.activity.push(event);
        if (record.activity.length > ACTIVITY_BUFFER_LIMIT) {
            const pruned = record.activity.splice(0, record.activity.length - ACTIVITY_BUFFER_LIMIT);
            const prunedIds = new Set(pruned.map((item) => item.id));
            for (const [callId, activityId] of record.pendingToolActivityByCallId.entries()) {
                if (prunedIds.has(activityId))
                    record.pendingToolActivityByCallId.delete(callId);
            }
        }
        this.emitter.emit("activity_event", record.workerId, structuredClone(event));
    }
    updateActivity(record, activityId, patch) {
        const activity = record.activity.find((item) => item.id === activityId);
        if (!activity)
            return false;
        Object.assign(activity, patch);
        this.emitter.emit("activity_event", record.workerId, structuredClone(activity));
        return true;
    }
    nextActivityId(record, sourceEvent, timestamp) {
        const index = record.activityNextIndex;
        record.activityNextIndex += 1;
        return `${record.workerId}:${sourceEvent}:${timestamp}:${index}`;
    }
    appendFinalSummaryActivity(record, sourceEvent, ts, finalAnswer) {
        const key = finalSummaryKey(finalAnswer);
        if (record.finalSummaryKeys.has(key))
            return;
        record.finalSummaryKeys.add(key);
        record.state.finalAnswer = finalAnswer;
        const finalSummary = buildFinalSummary(finalAnswer);
        this.appendActivity(record, {
            id: this.nextActivityId(record, sourceEvent, ts),
            ts,
            updatedAt: ts,
            actionKind: "final_summary",
            status: "completed",
            label: "Final answer",
            summary: finalSummary.summary,
            sourceEvent,
            finalSummaryFields: finalSummary.fields,
        });
    }
    discoverFinalAnswer(record, sourceEvent, ts) {
        const finalAnswer = extractFinalAnswer(record.pendingTextDelta) ?? extractFinalAnswer(record.textBuffer);
        if (!finalAnswer)
            return undefined;
        this.appendFinalSummaryActivity(record, sourceEvent, ts, finalAnswer);
        return finalAnswer;
    }
    flushPendingText(record) {
        if (!record.pendingTextDelta)
            return;
        const ts = record.pendingTextFlushAt || Date.now();
        const pendingText = record.pendingTextDelta;
        const text = trimSummary(pendingText, 400);
        this.appendConsole(record, {
            ts,
            kind: "assistant_text",
            text,
        });
        const finalAnswer = this.discoverFinalAnswer(record, "worker_text_flush", ts);
        if (finalAnswer) {
        }
        else if (!/<final[_\s-]?answer\b|<\/final[_\s-]?answer>/i.test(pendingText)) {
            this.appendActivity(record, {
                id: this.nextActivityId(record, "worker_text_flush", ts),
                ts,
                updatedAt: ts,
                actionKind: "process",
                status: "info",
                label: "Thinking",
                summary: trimSummary(text, 260),
                sourceEvent: "worker_text_flush",
            });
        }
        record.pendingTextDelta = "";
        record.pendingTextFlushAt = 0;
    }
    listWorkers() {
        return Array.from(this.workers.keys())
            .map((workerId) => this.snapshot(workerId))
            .filter((worker) => worker !== undefined);
    }
    async shutdownWorker(workerId, signal = "SIGTERM") {
        const record = this.requireWorker(workerId);
        await this.disposeHandleBounded(record.handle, `shutdown for ${workerId}`, signal);
    }
    dispose() {
        if (!this.disposePromise) {
            this.disposed = true;
            this.disposePromise = this.disposeAll();
        }
        return this.disposePromise;
    }
    async disposeAll() {
        const pending = Array.from(this.pendingLaunches.values());
        for (const launch of pending) {
            launch.cancelled = true;
            launch.abortController.abort();
        }
        const pendingHandles = new Set(pending.flatMap((launch) => launch.handle ? [launch.handle] : []));
        for (const record of this.workers.values())
            record.closing = true;
        const cleanupAttempts = pending.map((launch) => this.disposePendingHandleBounded(launch, "pending launch cleanup"));
        for (const record of this.workers.values()) {
            if (pendingHandles.has(record.handle))
                continue;
            cleanupAttempts.push(this.disposeHandleBounded(record.handle, `worker cleanup for ${record.workerId}`));
        }
        const launchSettlements = pending.flatMap((launch) => launch.promise ? [launch.promise] : []);
        const results = await Promise.allSettled([...cleanupAttempts, ...launchSettlements]);
        const cleanupFailures = results
            .slice(0, cleanupAttempts.length)
            .flatMap((result) => result.status === "rejected" ? [result.reason] : []);
        if (cleanupFailures.length > 0) {
            throw new AggregateError(cleanupFailures, `WorkerManager disposal failed for ${cleanupFailures.length} cleanup attempt(s)`);
        }
    }
    disposePendingHandleBounded(pending, label) {
        if (!pending.disposePromise) {
            pending.disposePromise = pending.handle
                ? this.disposeHandleBounded(pending.handle, label)
                : Promise.resolve();
        }
        return pending.disposePromise;
    }
    async disposeHandleBounded(handle, label, signal = "SIGTERM") {
        await this.withDeadline(handle.dispose(signal), this.handleDisposeTimeoutMs, label);
    }
    async withDeadline(operation, timeoutMs, label) {
        const { promise: timeout, reject } = createDeferred();
        const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
        try {
            return await Promise.race([operation, timeout]);
        }
        finally {
            clearTimeout(timer);
        }
    }
    applyNormalizedEvent(record, event) {
        if (UNREACHABLE_TERMINAL_STATUSES.has(record.state.status)
            && (event.type === "worker_started"
                || event.type === "worker_running"
                || event.type === "worker_queue_updated")) {
            return;
        }
        if (UNREACHABLE_TERMINAL_STATUSES.has(record.state.status)
            && record.state.status !== "aborted"
            && (event.type === "worker_text_delta"
                || event.type === "worker_message"
                || event.type === "worker_tool_started"
                || event.type === "worker_tool_finished"
                || event.type === "worker_agent_end")) {
            return;
        }
        if (event.type === "worker_idle"
            && (!record.awaitingSettlement || UNREACHABLE_TERMINAL_STATUSES.has(record.state.status))) {
            return;
        }
        if ((event.type === "worker_summarization_retry_scheduled"
            || event.type === "worker_summarization_retry_attempt_started"
            || event.type === "worker_summarization_retry_finished")
            && (!record.awaitingSettlement || UNREACHABLE_TERMINAL_STATUSES.has(record.state.status))) {
            return;
        }
        if (event.type !== "worker_state") {
            record.state.lastEventAt = event.timestamp;
        }
        switch (event.type) {
            case "worker_started":
            case "worker_running":
                if (UNREACHABLE_TERMINAL_STATUSES.has(record.state.status))
                    break;
                record.awaitingSettlement = true;
                record.state.status = "running";
                this.flushPendingText(record);
                this.appendConsole(record, { ts: event.timestamp, kind: "status", text: "running" });
                this.appendActivity(record, {
                    id: this.nextActivityId(record, event.type, event.timestamp),
                    ts: event.timestamp,
                    updatedAt: event.timestamp,
                    actionKind: "status",
                    status: "info",
                    label: "Worker running",
                    summary: "running",
                    sourceEvent: event.type,
                });
                break;
            case "worker_text_delta":
                appendTranscriptText(record, event.delta);
                if (!UNREACHABLE_TERMINAL_STATUSES.has(record.state.status))
                    record.state.status = "running";
                record.state.lastSummary = buildSummary(record.state, record.textBuffer);
                record.pendingTextDelta += event.delta;
                record.pendingTextFlushAt = record.pendingTextFlushAt || event.timestamp;
                if (event.timestamp - record.pendingTextFlushAt >= ASSISTANT_TEXT_BATCH_MS || record.pendingTextDelta.length > 320) {
                    this.flushPendingText(record);
                }
                this.appendAssistantChunk(record, event.timestamp, event.delta);
                break;
            case "worker_message": {
                this.flushPendingText(record);
                const assistantText = extractAssistantText(event.message);
                if (assistantText) {
                    const finalAnswer = extractFinalAnswer(assistantText);
                    setTranscriptText(record, finalAnswer ?? assistantText);
                    if (!UNREACHABLE_TERMINAL_STATUSES.has(record.state.status)) {
                        record.state.pendingRelayQuestions = extractRelayQuestions(assistantText, record.state);
                    }
                    record.state.lastSummary = buildSummary(record.state, assistantText);
                    this.appendConsole(record, {
                        ts: event.timestamp,
                        kind: "assistant_message",
                        text: trimSummary(finalAnswer ?? assistantText, 600),
                    });
                    if (finalAnswer) {
                        this.appendFinalSummaryActivity(record, event.type, event.timestamp, finalAnswer);
                    }
                    else {
                        this.appendActivity(record, {
                            id: this.nextActivityId(record, event.type, event.timestamp),
                            ts: event.timestamp,
                            updatedAt: event.timestamp,
                            actionKind: "process",
                            status: "info",
                            label: "Assistant message",
                            summary: trimSummary(assistantText, 260),
                            sourceEvent: event.type,
                        });
                    }
                }
                const messageUsage = event.message.usage;
                if (messageUsage) {
                    record.state.usage.inputTokens += Number(messageUsage.input ?? 0);
                    record.state.usage.outputTokens += Number(messageUsage.output ?? 0);
                    record.state.usage.cacheReadTokens += Number(messageUsage.cacheRead ?? 0);
                    record.state.usage.cacheWriteTokens += Number(messageUsage.cacheWrite ?? 0);
                    record.state.usage.contextTokens = Number(messageUsage.totalTokens ?? 0) || undefined;
                    const cost = messageUsage.cost;
                    record.state.usage.costUsd += Number(cost?.total ?? 0);
                    record.state.usage.turns += 1;
                }
                break;
            }
            case "worker_tool_started": {
                if (!UNREACHABLE_TERMINAL_STATUSES.has(record.state.status))
                    record.state.status = "running";
                record.state.lastToolName = event.toolName;
                record.state.lastSummary = buildSummary(record.state, record.textBuffer);
                this.flushPendingText(record);
                this.appendConsole(record, {
                    ts: event.timestamp,
                    kind: "tool_start",
                    text: `${event.toolName} ${snippet(event.args, 180)}`.trim(),
                });
                const command = extractCommand(event.args);
                const isCommand = event.toolName === "bash" || event.toolName === "shell" || command !== undefined;
                const activityId = this.nextActivityId(record, event.type, event.timestamp);
                if (event.toolCallId)
                    record.pendingToolActivityByCallId.set(event.toolCallId, activityId);
                this.appendActivity(record, {
                    id: activityId,
                    ts: event.timestamp,
                    updatedAt: event.timestamp,
                    actionKind: isCommand ? "command" : "tool",
                    status: "started",
                    label: isCommand ? `Ran ${command ?? event.toolName}` : `Used ${event.toolName || "tool"}`,
                    summary: command ? trimSummary(command, 220) : snippet(event.args, 220),
                    toolName: event.toolName,
                    ...(command ? { command } : {}),
                    sourceEvent: event.type,
                    toolCallId: event.toolCallId || undefined,
                });
                break;
            }
            case "worker_tool_finished": {
                record.state.lastToolName = event.toolName;
                record.state.lastSummary = buildSummary(record.state, record.textBuffer);
                this.appendConsole(record, {
                    ts: event.timestamp,
                    kind: "tool_end",
                    text: `${event.toolName}${event.isError ? " [error]" : ""} → ${snippet(extractResultText(event.result), 260)}`,
                });
                const resultText = extractResultText(event.result);
                const output = buildOutputSnippet(resultText);
                const pendingId = event.toolCallId ? record.pendingToolActivityByCallId.get(event.toolCallId) : undefined;
                if (pendingId) {
                    record.pendingToolActivityByCallId.delete(event.toolCallId);
                    const patched = this.updateActivity(record, pendingId, {
                        updatedAt: event.timestamp,
                        status: event.isError ? "error" : "completed",
                        toolName: event.toolName,
                        ...(output.snippet ? { outputSnippet: output.snippet } : {}),
                        ...(output.hiddenLineCount > 0 ? { hiddenLineCount: output.hiddenLineCount } : {}),
                        sourceEvent: event.type,
                    });
                    if (patched)
                        break;
                }
                {
                    this.appendActivity(record, {
                        id: this.nextActivityId(record, event.type, event.timestamp),
                        ts: event.timestamp,
                        updatedAt: event.timestamp,
                        actionKind: "tool",
                        status: event.isError ? "error" : "completed",
                        label: `${event.toolName || "Tool"} finished`,
                        toolName: event.toolName,
                        ...(output.snippet ? { outputSnippet: output.snippet } : {}),
                        ...(output.hiddenLineCount > 0 ? { hiddenLineCount: output.hiddenLineCount } : {}),
                        sourceEvent: event.type,
                        toolCallId: event.toolCallId || undefined,
                    });
                }
                break;
            }
            case "worker_queue_updated":
                record.state.lastSummary = buildSummary(record.state, record.textBuffer);
                if (event.steering.length > 0 || event.followUp.length > 0) {
                    this.appendConsole(record, {
                        ts: event.timestamp,
                        kind: "queue",
                        text: `steering=${event.steering.length} followUp=${event.followUp.length}`,
                    });
                    this.appendActivity(record, {
                        id: this.nextActivityId(record, event.type, event.timestamp),
                        ts: event.timestamp,
                        updatedAt: event.timestamp,
                        actionKind: "queue",
                        status: "info",
                        label: "Messages queued",
                        summary: `steering=${event.steering.length} followUp=${event.followUp.length}`,
                        sourceEvent: event.type,
                    });
                }
                break;
            case "worker_agent_end":
                this.flushPendingText(record);
                record.state.lastSummary = buildSummary(record.state, record.textBuffer);
                break;
            case "worker_summarization_retry_scheduled": {
                const details = [];
                if (event.attempt !== undefined && event.maxAttempts !== undefined) {
                    details.push(`attempt ${event.attempt}/${event.maxAttempts}`);
                }
                else if (event.attempt !== undefined) {
                    details.push(`attempt ${event.attempt}`);
                }
                if (event.delayMs !== undefined)
                    details.push(`delay ${event.delayMs}ms`);
                if (event.errorMessage)
                    details.push(trimSummary(event.errorMessage, 160));
                const summary = details.join(" · ") || "awaiting retry";
                this.appendConsole(record, { ts: event.timestamp, kind: "status", text: `summarization retry scheduled: ${summary}` });
                this.appendActivity(record, {
                    id: this.nextActivityId(record, event.type, event.timestamp),
                    ts: event.timestamp,
                    updatedAt: event.timestamp,
                    actionKind: "process",
                    status: "info",
                    label: "Summarization retry scheduled",
                    summary,
                    sourceEvent: event.type,
                });
                break;
            }
            case "worker_summarization_retry_attempt_started": {
                const label = event.source === "compaction"
                    ? "Compaction retry started"
                    : event.source === "branchSummary"
                        ? "Branch summary retry started"
                        : "Summarization retry started";
                const summary = event.reason ? `reason=${event.reason}` : "retry attempt started";
                this.appendConsole(record, { ts: event.timestamp, kind: "status", text: `${label}: ${summary}` });
                this.appendActivity(record, {
                    id: this.nextActivityId(record, event.type, event.timestamp),
                    ts: event.timestamp,
                    updatedAt: event.timestamp,
                    actionKind: "process",
                    status: "info",
                    label,
                    summary,
                    sourceEvent: event.type,
                });
                break;
            }
            case "worker_summarization_retry_finished":
                this.appendConsole(record, { ts: event.timestamp, kind: "status", text: "summarization retry loop finished; awaiting Pi settlement" });
                this.appendActivity(record, {
                    id: this.nextActivityId(record, event.type, event.timestamp),
                    ts: event.timestamp,
                    updatedAt: event.timestamp,
                    actionKind: "process",
                    status: "info",
                    label: "Summarization retry finished",
                    summary: "retry loop ended; awaiting Pi settlement",
                    sourceEvent: event.type,
                });
                break;
            case "worker_idle":
                record.awaitingSettlement = false;
                record.state.status = "idle";
                record.state.error = undefined;
                record.state.lastSummary = buildSummary(record.state, record.textBuffer);
                this.flushPendingText(record);
                this.appendConsole(record, { ts: event.timestamp, kind: "status", text: record.state.status });
                this.appendActivity(record, {
                    id: this.nextActivityId(record, event.type, event.timestamp),
                    ts: event.timestamp,
                    updatedAt: event.timestamp,
                    actionKind: "status",
                    status: "info",
                    label: "Worker idle",
                    summary: record.state.status,
                    sourceEvent: event.type,
                });
                break;
            case "worker_extension_error":
                // Pi extension errors are diagnostic-only. They must not clear the
                // settlement guard or terminate an otherwise live RPC session. Once a
                // worker is unreachable, its terminal cause and summary are authoritative;
                // keep the late diagnostic visible without replacing either one.
                if (!UNREACHABLE_TERMINAL_STATUSES.has(record.state.status)) {
                    record.state.error = event.error;
                    record.state.lastSummary = buildSummary(record.state, event.error);
                }
                this.appendConsole(record, { ts: event.timestamp, kind: "error", text: event.error });
                this.appendActivity(record, {
                    id: this.nextActivityId(record, event.type, event.timestamp),
                    ts: event.timestamp,
                    updatedAt: event.timestamp,
                    actionKind: "error",
                    status: "error",
                    label: "Extension error",
                    summary: trimSummary(event.error, 260),
                    sourceEvent: event.type,
                });
                break;
            case "worker_error":
                record.awaitingSettlement = false;
                record.state.status = "error";
                record.state.error = event.error;
                record.state.lastSummary = buildSummary(record.state, event.error);
                this.flushPendingText(record);
                this.appendConsole(record, { ts: event.timestamp, kind: "error", text: event.error });
                this.appendActivity(record, {
                    id: this.nextActivityId(record, event.type, event.timestamp),
                    ts: event.timestamp,
                    updatedAt: event.timestamp,
                    actionKind: "error",
                    status: "error",
                    label: "Worker error",
                    summary: trimSummary(event.error, 260),
                    sourceEvent: event.type,
                });
                break;
            case "worker_state": {
                if (isThinkingLevel(event.state.thinkingLevel)) {
                    record.state.effectiveThinkingLevel = event.state.thinkingLevel;
                }
                if (record.state.status === "starting" && !event.state.isStreaming) {
                    break;
                }
                if (UNREACHABLE_TERMINAL_STATUSES.has(record.state.status)) {
                    break;
                }
                const previousStatus = record.state.status;
                record.state.status = record.awaitingSettlement && !event.state.isStreaming
                    ? "running"
                    : deriveStatusFromSessionState(event.state);
                if (record.state.status !== previousStatus) {
                    record.state.lastEventAt = event.timestamp;
                }
                record.state.lastSummary = buildSummary(record.state, record.textBuffer);
                break;
            }
            case "thinking_clamped":
                break;
            case "worker_exit": {
                record.awaitingSettlement = false;
                const preserveTerminalStatus = UNREACHABLE_TERMINAL_STATUSES.has(record.state.status);
                if (!preserveTerminalStatus) {
                    if (record.closing) {
                        record.state.status = "exited";
                    }
                    else if (event.error) {
                        record.state.status = "error";
                        record.state.error = event.error;
                    }
                    else {
                        record.state.status = event.signal === "SIGTERM" ? "aborted" : "exited";
                        if (event.code && event.code !== 0) {
                            record.state.status = "error";
                            record.state.error = event.stderr || `Worker exited with code ${event.code}`;
                        }
                    }
                    record.state.lastSummary = buildSummary(record.state, record.textBuffer || event.stderr || "Worker exited");
                }
                this.flushPendingText(record);
                this.appendConsole(record, {
                    ts: event.timestamp,
                    kind: "exit",
                    text: `status=${record.state.status}${event.code !== null ? ` code=${event.code}` : ""}${event.signal ? ` signal=${event.signal}` : ""}`,
                });
                this.appendActivity(record, {
                    id: this.nextActivityId(record, event.type, event.timestamp),
                    ts: event.timestamp,
                    updatedAt: event.timestamp,
                    actionKind: "exit",
                    status: record.state.status === "error" ? "error" : "completed",
                    label: "Worker exited",
                    summary: `status=${record.state.status}${event.code !== null ? ` code=${event.code}` : ""}${event.signal ? ` signal=${event.signal}` : ""}`,
                    sourceEvent: event.type,
                });
                record.client.dispose(`Worker exited: ${event.code ?? "signal"}`);
                break;
            }
        }
        this.emitter.emit("event", this.snapshot(record.workerId), event);
    }
    detectThinkingClamp(record, state) {
        if (!isThinkingLevel(state.thinkingLevel))
            return;
        record.state.effectiveThinkingLevel = state.thinkingLevel;
        if (record.requestedThinkingLevel === record.state.effectiveThinkingLevel)
            return;
        record.thinkingClamped = true;
        this.applyNormalizedEvent(record, createThinkingClampedEvent({
            workerId: record.workerId,
            profileName: record.state.profileName,
            modelLabel: record.launchSnapshot.model ?? "default",
            requested: record.requestedThinkingLevel,
            effective: record.state.effectiveThinkingLevel,
        }));
    }
    updateUsage(current, stats) {
        const tokens = stats.tokens;
        const contextUsage = stats.contextUsage;
        const contextTokens = contextUsage ? finiteNumber(contextUsage.tokens) : current.contextTokens;
        const contextWindow = contextUsage ? finiteNumber(contextUsage.contextWindow) : undefined;
        const contextPercent = contextUsage ? finiteNumber(contextUsage.percent) : undefined;
        const contextRemainingTokens = contextUsage
            ? contextTokens !== undefined && contextWindow !== undefined
                ? Math.max(0, contextWindow - contextTokens)
                : undefined
            : undefined;
        return {
            turns: current.turns,
            inputTokens: tokens?.input ?? current.inputTokens,
            outputTokens: tokens?.output ?? current.outputTokens,
            cacheReadTokens: tokens?.cacheRead ?? current.cacheReadTokens,
            cacheWriteTokens: tokens?.cacheWrite ?? current.cacheWriteTokens,
            costUsd: stats.cost ?? current.costUsd,
            contextTokens,
            contextWindow,
            contextPercent,
            contextRemainingTokens,
        };
    }
    assertSupportedWorkerVersion(version, workerId) {
        if (!version.supported) {
            const detail = version.message ?? `Cannot launch Pi worker: unsupported Pi version from ${version.command}.`;
            throw new Error(`Worker launch failed for ${workerId}: ${detail}`);
        }
    }
    requireWorker(workerId) {
        const worker = this.workers.get(workerId);
        if (!worker) {
            throw new Error(`Unknown worker: ${workerId}`);
        }
        return worker;
    }
    snapshot(workerId) {
        const record = this.workers.get(workerId);
        if (!record)
            return undefined;
        return {
            workerId: record.workerId,
            client: record.client,
            handle: record.handle,
            state: structuredClone(record.state),
        };
    }
}
