import { EventEmitter } from "node:events";
import { DEFAULT_TEAM_CONFIG } from "../config.js";
import { TaskRegistry } from "./task-registry.js";
import { resolveWorkerMessageDelivery } from "../comms/agent-messaging.js";
import { buildPassivePing } from "../comms/ping.js";
import { buildWorkerTaskPrompt } from "../prompts/contracts.js";
import { WorkerManager } from "../runtime/worker-manager.js";
import { applyLaunchPolicy } from "../safety/launch-policy.js";
import { isPathWithinProjectRoot } from "../safety/path-scope.js";
import { aggregateWorkerUsage } from "../usage.js";
const TERMINAL_STATUSES = new Set([
    "idle",
    "completed",
    "aborted",
    "error",
    "exited",
]);
export function isTerminalWorkerStatus(status) {
    return TERMINAL_STATUSES.has(status);
}
/**
 * Statuses where the worker's RPC client has been (or is about to be) disposed.
 * `idle` and `waiting_followup` are terminal for UI purposes but the client is
 * still alive and can legitimately accept a new prompt. The statuses below are
 * "truly done" — prompting them would hit a disposed client and confusingly
 * flip the dashboard back to `running` before throwing. Callers that receive
 * a message for one of these must cancel + re-delegate.
 */
const UNREACHABLE_STATUSES = new Set([
    "completed",
    "aborted",
    "error",
    "exited",
]);
const REUSABLE_STATUSES = new Set(["idle", "waiting_followup"]);
const REUSE_CONTEXT_HARD_PERCENT = 80;
const REUSE_CONTEXT_MIN_REMAINING_TOKENS = 32768;
const ACTIVE_PING_REFRESH_TIMEOUT_MS = 2_000;
function toolsetEqual(a, b) {
    if (a === b)
        return true;
    if (!a || !b)
        return false;
    if (a.length !== b.length)
        return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((value, index) => value === sortedB[index]);
}
function orderedArrayEqual(a, b) {
    if (a === b)
        return true;
    if (!a || !b)
        return false;
    if (a.length !== b.length)
        return false;
    return a.every((value, index) => value === b[index]);
}
function rejectSaturatedReuse(worker) {
    const percent = worker.usage.contextPercent;
    const remaining = worker.usage.contextRemainingTokens;
    const saturatedByPercent = percent !== undefined && percent >= REUSE_CONTEXT_HARD_PERCENT;
    const saturatedByRemaining = remaining !== undefined && remaining <= REUSE_CONTEXT_MIN_REMAINING_TOKENS;
    if (!saturatedByPercent && !saturatedByRemaining)
        return;
    const details = [
        percent !== undefined ? `contextPercent=${percent}%` : undefined,
        remaining !== undefined ? `contextRemainingTokens=${remaining}` : undefined,
    ].filter((value) => value !== undefined);
    throw new Error(`Cannot reuse worker ${worker.workerId}: context budget is saturated${details.length > 0 ? ` (${details.join(", ")})` : ""}. Delegate fresh (omit reuseWorkerId).`);
}
function resolveWorkerProjectTrustOverride(request, launchCwd) {
    if (request.projectTrusted === undefined)
        return undefined;
    const projectRoot = request.projectTrustRoot ?? request.cwd;
    if (!isPathWithinProjectRoot(launchCwd, projectRoot, projectRoot))
        return undefined;
    return request.projectTrusted ? "approve" : "no-approve";
}
export class TeamManager {
    events = new EventEmitter();
    registry;
    workerManager;
    workerCounter = 0;
    taskCounter = 0;
    _routingMode;
    activePingTimeoutMs;
    activeRefreshes = new Map();
    displayCost;
    constructor(options) {
        this.config = options?.config ?? DEFAULT_TEAM_CONFIG;
        this.registry = options?.registry ?? new TaskRegistry();
        this.workerManager = options?.workerManager ?? new WorkerManager();
        this._routingMode = options?.routingMode ?? "team";
        this.activePingTimeoutMs = options?.activePingTimeoutMs ?? ACTIVE_PING_REFRESH_TIMEOUT_MS;
        this.displayCost = options?.displayCost !== false;
        this.workerManager.onEvent((worker) => {
            this.registry.upsertWorker(worker.state);
            this.events.emit("state_change", this.snapshot());
        });
    }
    get routingMode() {
        return this._routingMode;
    }
    setRoutingMode(mode) {
        if (this._routingMode === mode)
            return;
        this._routingMode = mode;
        this.events.emit("state_change", this.snapshot());
    }
    nextWorkerId() {
        do {
            this.workerCounter += 1;
            const candidate = `w${this.workerCounter}`;
            if (!this.registry.getWorker(candidate))
                return candidate;
        } while (this.workerCounter < 10000);
        throw new Error("Could not allocate worker id");
    }
    nextTaskId() {
        this.taskCounter += 1;
        return `t${this.taskCounter}`;
    }
    resolveWorkerId(input) {
        const trimmed = input.trim();
        if (!trimmed)
            return undefined;
        const direct = this.registry.getWorker(trimmed);
        if (direct)
            return direct.workerId;
        const numeric = /^\d+$/.test(trimmed) ? `w${trimmed}` : undefined;
        if (numeric) {
            const byNumeric = this.registry.getWorker(numeric);
            if (byNumeric)
                return byNumeric.workerId;
        }
        const lowered = trimmed.toLowerCase();
        const matches = this.registry.listWorkers().filter((worker) => worker.workerId.toLowerCase().startsWith(lowered));
        if (matches.length === 1)
            return matches[0].workerId;
        return undefined;
    }
    config;
    onStateChange(listener) {
        this.events.on("state_change", listener);
        return () => this.events.off("state_change", listener);
    }
    onBeforePrompt(listener) {
        this.events.on("before_prompt", listener);
        return () => this.events.off("before_prompt", listener);
    }
    restore(state) {
        this.registry.restore(state);
        for (const worker of this.registry.listWorkers()) {
            const match = /^w(\d+)$/.exec(worker.workerId);
            if (match)
                this.workerCounter = Math.max(this.workerCounter, Number(match[1]));
        }
        for (const taskId of Object.keys(state.taskRegistry ?? {})) {
            const match = /^t(\d+)$/.exec(taskId);
            if (match)
                this.taskCounter = Math.max(this.taskCounter, Number(match[1]));
        }
        this.events.emit("state_change", this.snapshot());
    }
    snapshot() {
        return this.registry.snapshot();
    }
    async delegateTask(request, signal) {
        const profile = this.config.profiles.find((item) => item.name === request.profileName);
        if (!profile) {
            const available = this.config.profiles.map((item) => item.name).join(", ") || "(none)";
            throw new Error(`Unknown team profile: ${request.profileName}. Configured profiles: ${available}.`);
        }
        if (request.reuseWorkerId) {
            return this.reuseWorkerForTask(request, signal);
        }
        const launchPlan = applyLaunchPolicy({
            cwd: request.cwd,
            profile,
            pathScope: request.pathScope,
            model: request.model,
            orchestratorModel: request.orchestratorModel,
            orchestratorThinkingLevel: request.orchestratorThinkingLevel,
            thinkingLevel: request.thinkingLevel,
            tools: request.tools,
            extensionMode: request.extensionMode,
            systemPromptPath: request.systemPromptPath,
        }, this.config);
        const projectTrust = resolveWorkerProjectTrustOverride(request, launchPlan.cwd);
        const taskId = this.nextTaskId();
        const workerId = this.nextWorkerId();
        const skills = request.skills?.map((name) => name.trim()).filter((name) => name.length > 0);
        const task = {
            taskId,
            title: request.title,
            goal: request.goal,
            requestedBy: "orchestrator",
            profileName: request.profileName,
            cwd: request.cwd,
            contextHints: request.contextHints ?? [],
            expectedOutput: request.expectedOutput,
            pathScope: launchPlan.pathScope,
            skills: skills && skills.length > 0 ? skills : undefined,
            orchestratorThinkingLevel: request.orchestratorThinkingLevel,
            createdAt: Date.now(),
        };
        this.registry.registerTask(task);
        let worker;
        try {
            worker = await this.workerManager.launchWorker({
                workerId,
                profileName: request.profileName,
                task,
                cwd: launchPlan.cwd,
                model: launchPlan.model,
                thinkingLevel: launchPlan.thinkingLevel,
                tools: launchPlan.tools,
                workerExtensions: launchPlan.workerExtensions,
                systemPromptPath: launchPlan.systemPromptPath,
                extensionMode: launchPlan.extensionMode,
                projectTrust,
                command: this.config.rpc.command,
                baseArgs: this.config.rpc.args,
                // Only enable Pi's skill discovery when the task actually requested
                // skills. Without this the worker launches with `--no-skills` (set in
                // buildWorkerProcessArgs), the available skill context is omitted, and
                // the task prompt's requested-skill instructions are impossible to
                // satisfy.
                allowSkills: task.skills !== undefined && task.skills.length > 0,
                signal,
            });
        }
        catch (error) {
            this.registry.removeWorker(workerId);
            this.registry.unregisterTask(taskId);
            this.events.emit("state_change", this.snapshot());
            throw error;
        }
        this.registry.upsertWorker(worker.state);
        try {
            signal?.throwIfAborted();
            this.events.emit("before_prompt", this.snapshot());
            signal?.throwIfAborted();
        }
        catch (error) {
            try {
                await this.workerManager.shutdownWorker(workerId);
            }
            catch {
                // Preserve the checkpoint/cancellation error; process disposal is bounded.
            }
            await this.workerManager.removeWorker(workerId);
            this.registry.removeWorker(workerId);
            this.registry.unregisterTask(taskId);
            this.events.emit("state_change", this.snapshot());
            throw error;
        }
        await this.workerManager.promptWorker(workerId, buildWorkerTaskPrompt(task));
        const liveWorker = this.workerManager.getWorker(workerId);
        if (liveWorker) {
            this.registry.upsertWorker(liveWorker.state);
        }
        this.events.emit("state_change", this.snapshot());
        return { worker: liveWorker?.state ?? worker.state, task };
    }
    listWorkers() {
        return this.registry.listWorkers();
    }
    getWorkerStatus(workerId) {
        return this.registry.getWorker(workerId);
    }
    getWorkerResult(workerId) {
        const worker = this.registry.getWorker(workerId);
        if (!worker)
            return undefined;
        return {
            worker,
            task: worker.currentTask ? this.registry.getTask(worker.currentTask.taskId) : undefined,
        };
    }
    getWorkerTranscript(workerId) {
        return this.workerManager.getWorkerTranscript(workerId);
    }
    getWorkerConsole(workerId) {
        return this.workerManager.getWorkerConsole(workerId);
    }
    getWorkerActivity(workerId) {
        return this.workerManager.getWorkerActivity(workerId);
    }
    getAssistantTail(workerId, fromIndex) {
        return this.workerManager.getAssistantTail(workerId, fromIndex);
    }
    onAssistantChunk(listener) {
        return this.workerManager.onAssistantChunk(listener);
    }
    onActivityEvent(listener) {
        return this.workerManager.onActivityEvent(listener);
    }
    async messageWorker(workerId, message, delivery = "auto") {
        const worker = this.requireWorker(workerId);
        const previousStatus = worker.status;
        if (UNREACHABLE_STATUSES.has(worker.status)) {
            throw new Error(`Worker ${workerId} is ${worker.status} — its RPC session is already disposed. Re-delegate the task with delegate_task (and /team to clear terminal entries from the dashboard).`);
        }
        const nextDelivery = resolveWorkerMessageDelivery(worker.status, delivery);
        if (nextDelivery === "steer") {
            await this.workerManager.steerWorker(workerId, message);
        }
        else if (nextDelivery === "follow_up") {
            await this.workerManager.followUpWorker(workerId, message);
        }
        else {
            await this.workerManager.promptWorker(workerId, message);
        }
        await this.workerManager.refreshState(workerId);
        const result = this.requireResult(workerId);
        return { ...result, delivery: nextDelivery, previousStatus };
    }
    async messageAllWorkers(message, delivery = "auto") {
        // Explicitly excludes UNREACHABLE_STATUSES (completed/aborted/error/exited)
        // so broadcast never tries to prompt a disposed RPC client.
        const deliverable = ["running", "idle", "waiting_followup"];
        const targets = this.listWorkers().filter((worker) => deliverable.includes(worker.status));
        const results = [];
        for (const worker of targets) {
            try {
                results.push(await this.messageWorker(worker.workerId, message, delivery));
            }
            catch (error) {
                const latest = this.registry.getWorker(worker.workerId);
                if (!latest)
                    continue;
                results.push({
                    worker: { ...latest, error: error instanceof Error ? error.message : String(error) },
                    task: latest.currentTask ? this.registry.getTask(latest.currentTask.taskId) : undefined,
                    delivery: delivery === "follow_up" ? "follow_up" : "steer",
                    previousStatus: latest.status,
                });
            }
        }
        return results;
    }
    async cancelAllWorkers() {
        const targets = this.listWorkers().filter((worker) => !isTerminalWorkerStatus(worker.status));
        const results = [];
        for (const worker of targets) {
            try {
                results.push(await this.cancelWorker(worker.workerId));
            }
            catch (error) {
                const latest = this.registry.getWorker(worker.workerId);
                if (!latest)
                    continue;
                results.push({
                    worker: { ...latest, error: error instanceof Error ? error.message : String(error) },
                    task: latest.currentTask ? this.registry.getTask(latest.currentTask.taskId) : undefined,
                });
            }
        }
        return results;
    }
    async pingWorkers(request = {}) {
        const mode = request.mode ?? "passive";
        const workerIds = request.workerIds?.length ? request.workerIds : this.listWorkers().map((worker) => worker.workerId);
        const activeOutcomes = new Map();
        if (mode === "active") {
            const outcomes = await Promise.all(workerIds.map(async (workerId) => [
                workerId,
                await this.refreshWorkerForActivePing(workerId),
            ]));
            for (const [workerId, outcome] of outcomes)
                activeOutcomes.set(workerId, outcome);
        }
        for (const [workerId, activeOutcome] of activeOutcomes) {
            if (activeOutcome.status !== "refreshed")
                this.persistActivePingWarning(workerId, activeOutcome.message);
        }
        return workerIds.map((workerId) => {
            const result = this.requireResult(workerId);
            result.worker.lastSummary = result.worker.lastSummary ?? {
                workerId: result.worker.workerId,
                taskId: result.worker.currentTask?.taskId ?? result.worker.workerId,
                headline: buildPassivePing(result.worker).lastSummary ?? `${result.worker.profileName}:${result.worker.status}`,
                status: result.worker.status,
                currentToolName: result.worker.lastToolName,
                readFiles: [],
                changedFiles: [],
                risks: [],
                relayQuestionCount: result.worker.pendingRelayQuestions.length,
                updatedAt: Date.now(),
            };
            return result;
        });
    }
    async refreshWorkerForActivePing(workerId) {
        const snapshot = this.registry.getWorker(workerId);
        if (!snapshot)
            return { status: "registry_only", message: `Unknown worker: ${workerId}` };
        if (!this.workerManager.hasWorker(workerId)) {
            return {
                status: "registry_only",
                message: `Active ping returned registry snapshot only for ${workerId}: worker RPC is not attached (restored or disposed).`,
            };
        }
        let refresh = this.activeRefreshes.get(workerId);
        if (!refresh) {
            refresh = (async () => {
                try {
                    await this.workerManager.refreshState(workerId);
                    await this.workerManager.refreshStats(workerId);
                    const refreshed = this.workerManager.getWorker(workerId);
                    if (refreshed)
                        this.registry.upsertWorker(refreshed.state);
                    return { status: "refreshed" };
                }
                catch (error) {
                    return {
                        status: "failed",
                        message: `Active ping refresh failed for ${workerId}: ${error instanceof Error ? error.message : String(error)}`,
                    };
                }
            })();
            this.activeRefreshes.set(workerId, refresh);
            refresh.finally(() => {
                if (this.activeRefreshes.get(workerId) === refresh)
                    this.activeRefreshes.delete(workerId);
            });
        }
        // Bound each active ping call without spawning duplicate refreshes for the same worker.
        // If the RPC never resolves, later calls reuse the same in-flight promise instead of
        // accumulating more stuck get_state/get_session_stats requests.
        let timeout;
        try {
            return await Promise.race([
                refresh,
                new Promise((resolve) => {
                    timeout = setTimeout(() => {
                        resolve({
                            status: "timeout",
                            message: `Active ping refresh timed out for ${workerId} after ${this.activePingTimeoutMs}ms; returned latest registry snapshot.`,
                        });
                    }, this.activePingTimeoutMs);
                    if (typeof timeout.unref === "function")
                        timeout.unref();
                }),
            ]);
        }
        finally {
            if (timeout)
                clearTimeout(timeout);
        }
    }
    persistActivePingWarning(workerId, message) {
        const worker = this.registry.getWorker(workerId);
        if (!worker)
            return;
        worker.error = message;
        worker.lastSummary = this.buildActivePingSnapshotSummary(worker, message);
        this.registry.upsertWorker(worker);
    }
    buildActivePingSnapshotSummary(worker, headline) {
        return {
            workerId: worker.workerId,
            taskId: worker.currentTask?.taskId ?? worker.workerId,
            headline,
            status: worker.status,
            currentToolName: worker.lastToolName,
            readFiles: [],
            changedFiles: [],
            risks: [],
            relayQuestionCount: worker.pendingRelayQuestions.length,
            updatedAt: Date.now(),
        };
    }
    async reuseWorkerForTask(request, signal) {
        const requestedId = request.reuseWorkerId;
        const resolvedId = this.resolveWorkerId(requestedId) ?? requestedId;
        const target = this.registry.getWorker(resolvedId);
        if (!target) {
            throw new Error(`Unknown workerId: ${requestedId}. Cannot reuse a worker that is not tracked.`);
        }
        if (!REUSABLE_STATUSES.has(target.status)) {
            const hint = UNREACHABLE_STATUSES.has(target.status)
                ? `worker is ${target.status} — its RPC session is already disposed; launch a new one with delegate_task (omit reuseWorkerId).`
                : `worker is ${target.status} — wait for it to become idle, or delegate a fresh worker.`;
            throw new Error(`Cannot reuse worker ${resolvedId}: ${hint}`);
        }
        if (target.profileName !== request.profileName) {
            throw new Error(`Cannot reuse worker ${resolvedId}: its profile is ${target.profileName}, request is ${request.profileName}. Reuse only same-profile workers.`);
        }
        const launchPlan = applyLaunchPolicy({
            cwd: request.cwd,
            profile: this.config.profiles.find((item) => item.name === request.profileName),
            pathScope: request.pathScope,
            model: request.model,
            orchestratorModel: request.orchestratorModel,
            orchestratorThinkingLevel: request.orchestratorThinkingLevel,
            thinkingLevel: request.thinkingLevel,
            tools: request.tools,
            extensionMode: request.extensionMode,
            systemPromptPath: request.systemPromptPath,
        }, this.config);
        const projectTrust = resolveWorkerProjectTrustOverride(request, launchPlan.cwd);
        const skills = request.skills?.map((name) => name.trim()).filter((name) => name.length > 0);
        const newAllowSkills = skills !== undefined && skills.length > 0;
        const existing = this.workerManager.getLaunchSnapshot(resolvedId);
        if (!existing) {
            throw new Error(`Cannot reuse worker ${resolvedId}: runtime record missing. Delegate fresh.`);
        }
        const mismatches = [];
        if (existing.cwd !== launchPlan.cwd)
            mismatches.push(`cwd (${existing.cwd} → ${launchPlan.cwd})`);
        if (existing.command !== this.config.rpc.command) {
            mismatches.push(`command (${existing.command ?? "pi"} → ${this.config.rpc.command})`);
        }
        if (!orderedArrayEqual(existing.baseArgs, this.config.rpc.args))
            mismatches.push(`baseArgs`);
        if (existing.model !== launchPlan.model)
            mismatches.push(`model (${existing.model ?? "default"} → ${launchPlan.model ?? "default"})`);
        if (existing.thinkingLevel !== launchPlan.thinkingLevel)
            mismatches.push(`thinkingLevel`);
        if (existing.systemPromptPath !== launchPlan.systemPromptPath)
            mismatches.push(`systemPromptPath`);
        if (existing.extensionMode !== launchPlan.extensionMode)
            mismatches.push(`extensionMode`);
        if (!orderedArrayEqual(existing.workerExtensions, launchPlan.workerExtensions))
            mismatches.push(`workerExtensions`);
        if (existing.projectTrust !== projectTrust) {
            mismatches.push(`projectTrust (${existing.projectTrust ?? "none"} → ${projectTrust ?? "none"})`);
        }
        if (!toolsetEqual(existing.tools, launchPlan.tools))
            mismatches.push(`tools`);
        if (existing.allowSkills !== newAllowSkills) {
            mismatches.push(`skills (worker launched with allowSkills=${existing.allowSkills}, request needs ${newAllowSkills})`);
        }
        if (mismatches.length > 0) {
            throw new Error(`Cannot reuse worker ${resolvedId}: launch settings differ on ${mismatches.join(", ")}. These are baked into the worker process at spawn and cannot change between tasks. Delegate fresh (omit reuseWorkerId) or align the request.`);
        }
        signal?.throwIfAborted();
        await this.workerManager.refreshStats(resolvedId, signal);
        const refreshedWorker = this.workerManager.getWorker(resolvedId);
        if (refreshedWorker) {
            this.registry.upsertWorker(refreshedWorker.state);
            rejectSaturatedReuse(refreshedWorker.state);
        }
        else {
            throw new Error(`Cannot reuse worker ${resolvedId}: runtime record missing after stats refresh. Delegate fresh.`);
        }
        const taskId = this.nextTaskId();
        const task = {
            taskId,
            title: request.title,
            goal: request.goal,
            requestedBy: "orchestrator",
            profileName: request.profileName,
            cwd: request.cwd,
            contextHints: request.contextHints ?? [],
            expectedOutput: request.expectedOutput,
            pathScope: launchPlan.pathScope,
            skills: skills && skills.length > 0 ? skills : undefined,
            orchestratorThinkingLevel: request.orchestratorThinkingLevel,
            createdAt: Date.now(),
        };
        this.registry.registerTask(task);
        const preparedWorker = this.workerManager.prepareWorkerReuse(resolvedId, task);
        this.registry.upsertWorker(preparedWorker.state);
        try {
            signal?.throwIfAborted();
            this.events.emit("before_prompt", this.snapshot());
            signal?.throwIfAborted();
        }
        catch (error) {
            try {
                await this.workerManager.shutdownWorker(resolvedId);
            }
            catch {
                // Preserve the checkpoint/cancellation error; process disposal is bounded.
            }
            const exited = this.registry.markWorkerExited(resolvedId, "Worker closed before reuse prompt.");
            if (exited)
                this.registry.upsertWorker(exited);
            this.registry.unregisterTask(taskId);
            this.events.emit("state_change", this.snapshot());
            throw error;
        }
        await this.workerManager.promptWorker(resolvedId, buildWorkerTaskPrompt(task));
        const liveWorker = this.workerManager.getWorker(resolvedId);
        if (liveWorker) {
            this.registry.upsertWorker(liveWorker.state);
        }
        this.events.emit("state_change", this.snapshot());
        return { worker: liveWorker?.state ?? target, task };
    }
    async closeWorker(workerId, reason = "Worker closed by operator.") {
        const worker = this.requireWorker(workerId);
        if (!REUSABLE_STATUSES.has(worker.status)) {
            throw new Error(`Cannot close worker ${workerId}: status is ${worker.status}. Only idle/waiting_followup workers can be closed; running workers need /team-stop.`);
        }
        await this.workerManager.closeWorker(workerId, reason);
        const updated = this.registry.markWorkerExited(workerId, reason);
        if (!updated) {
            throw new Error(`Unknown worker: ${workerId}`);
        }
        this.events.emit("state_change", this.snapshot());
        return this.requireResult(workerId);
    }
    async closeAllWorkers() {
        const targets = this.listWorkers().filter((worker) => REUSABLE_STATUSES.has(worker.status));
        const results = [];
        for (const worker of targets) {
            try {
                results.push(await this.closeWorker(worker.workerId));
            }
            catch (error) {
                const latest = this.registry.getWorker(worker.workerId);
                if (!latest)
                    continue;
                results.push({
                    worker: { ...latest, error: error instanceof Error ? error.message : String(error) },
                    task: latest.currentTask ? this.registry.getTask(latest.currentTask.taskId) : undefined,
                });
            }
        }
        return results;
    }
    async cancelWorker(workerId) {
        await this.workerManager.abortWorker(workerId);
        await this.workerManager.shutdownWorker(workerId);
        const worker = this.registry.markWorkerExited(workerId, "Worker cancelled by orchestrator.");
        if (!worker) {
            throw new Error(`Unknown worker: ${workerId}`);
        }
        this.events.emit("state_change", this.snapshot());
        return this.requireResult(workerId);
    }
    async dispose() {
        this.activeRefreshes.clear();
        await this.workerManager.dispose();
    }
    async pruneTerminalWorkers() {
        const terminal = this.registry.listWorkers().filter((worker) => isTerminalWorkerStatus(worker.status));
        const removed = [];
        for (const worker of terminal) {
            this.activeRefreshes.delete(worker.workerId);
            if (this.workerManager.hasWorker(worker.workerId)) {
                try {
                    await this.workerManager.removeWorker(worker.workerId);
                }
                catch {
                    // Best-effort: don't let runtime cleanup failure block dashboard prune.
                }
            }
            const result = this.registry.removeWorker(worker.workerId);
            if (result)
                removed.push(result);
        }
        if (removed.length > 0) {
            this.events.emit("state_change", this.snapshot());
        }
        return removed;
    }
    aggregateUsage() {
        return aggregateWorkerUsage(this.registry.listWorkers(), this.registry.getPrunedWorkerUsageTotals());
    }
    async waitForTerminal(targetIds, options = {}) {
        const resolved = targetIds
            .map((id) => this.resolveWorkerId(id) ?? id)
            .filter((id, index, arr) => arr.indexOf(id) === index);
        const wakeOnRelay = options.wakeOnRelay !== false;
        const baselineRelays = new Map();
        for (const id of resolved) {
            const worker = this.registry.getWorker(id);
            baselineRelays.set(id, worker?.pendingRelayQuestions.length ?? 0);
        }
        const snapshotTargets = () => resolved
            .map((id) => this.registry.getWorker(id))
            .filter((worker) => Boolean(worker));
        const allTerminal = () => {
            const workers = snapshotTargets();
            if (workers.length < resolved.length)
                return false;
            return workers.every((worker) => isTerminalWorkerStatus(worker.status));
        };
        const collectNewRelays = () => {
            const newRelays = [];
            for (const worker of snapshotTargets()) {
                const baseline = baselineRelays.get(worker.workerId) ?? 0;
                if (worker.pendingRelayQuestions.length > baseline) {
                    for (const relay of worker.pendingRelayQuestions.slice(baseline)) {
                        newRelays.push({
                            workerId: worker.workerId,
                            profileName: worker.profileName,
                            question: relay.question,
                            urgency: relay.urgency,
                        });
                    }
                }
            }
            return newRelays;
        };
        if (allTerminal()) {
            return { reason: "all_terminal", workers: snapshotTargets() };
        }
        return new Promise((resolve) => {
            let settled = false;
            const timeoutMs = options.timeoutMs ?? 300_000;
            const cleanup = () => {
                this.events.off("state_change", listener);
                if (timer)
                    clearTimeout(timer);
                if (options.signal)
                    options.signal.removeEventListener("abort", onAbort);
            };
            const finish = (reason) => {
                if (settled)
                    return;
                settled = true;
                cleanup();
                const payload = { reason, workers: snapshotTargets() };
                if (reason === "relay_raised")
                    payload.newRelays = collectNewRelays();
                resolve(payload);
            };
            const listener = () => {
                if (allTerminal()) {
                    finish("all_terminal");
                    return;
                }
                if (wakeOnRelay && collectNewRelays().length > 0) {
                    finish("relay_raised");
                }
            };
            const onAbort = () => finish("aborted");
            const timer = setTimeout(() => finish("timeout"), timeoutMs);
            this.events.on("state_change", listener);
            if (options.signal) {
                if (options.signal.aborted) {
                    finish("aborted");
                    return;
                }
                options.signal.addEventListener("abort", onAbort);
            }
        });
    }
    requireWorker(workerId) {
        const worker = this.registry.getWorker(workerId);
        if (!worker) {
            throw new Error(`Unknown worker: ${workerId}`);
        }
        return worker;
    }
    requireResult(workerId) {
        const result = this.getWorkerResult(workerId);
        if (!result) {
            throw new Error(`Unknown worker: ${workerId}`);
        }
        return result;
    }
}
