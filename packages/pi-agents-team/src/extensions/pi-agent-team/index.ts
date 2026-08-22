import { closeSync, existsSync, fstatSync, openSync, readSync, statSync, truncateSync, unlinkSync } from "node:fs";
import { Type } from "typebox";
import { CURRENT_SCAFFOLD_VERSION, DEFAULT_TEAM_CONFIG, createDefaultTeamState } from "../../src/config.js";
import { CompactPersistenceJournal, compactPersistenceRecordPayloadBytes, markRestoredWorkersExited, restorePersistedTeamStateWithMeasurement, } from "../../src/control-plane/persistence.js";
import { buildOrchestratorPromptBundle } from "../../src/prompts/contracts.js";
import { TeamManager, isTerminalWorkerStatus } from "../../src/control-plane/team-manager.js";
import { loadActiveTeamConfig } from "../../src/project-config/loader.js";
import { registerCopyCommand } from "../../src/commands/copy.js";
import { registerTeamCommand } from "../../src/commands/team.js";
import { registerTeamEnableCommand } from "../../src/commands/team-enable.js";
import { registerTeamInitCommand } from "../../src/commands/team-init.js";
import { registerTeamResultCommand } from "../../src/commands/team-result.js";
import { registerTeamSteerCommand } from "../../src/commands/team-steer.js";
import { registerTeamStopCommand } from "../../src/commands/team-stop.js";
import { registerTeamEnvCommand, runEnvWizard } from "../../src/commands/env.js";
import {
  recordGoalReceipt,
  recordHandOffOrClosure,
  recordRecordingAndArchival,
  recordRouting,
  recordTerminalStageForProfile,
  recordWorkerPrune,
  recordWorkerRelay,
  recordWorkerTerminal,
} from "../../src/memory/atp-recorder.js";
import { getMissingRequiredEdenOptions, resolveEdenOptions } from "../../src/memory/eden-memory.js";
import { registerTeamAutocomplete } from "../../src/ui/autocomplete.js";
import { buildTeamStatusLine, buildTeamWidgetLines, getTeamStatusTip, hasAnimatedWorkers } from "../../src/ui/status-widget.js";
import { createZeroWorkerUsageAggregate } from "../../src/usage.js";
import { InlineDashboardState } from "../../src/ui/inline-dashboard-state.js";
import { TeamDashboardWidget } from "../../src/ui/inline-dashboard-widget.js";
import { formatRelayToast, formatWorkerLabel, formatWorkerStartedToast, formatWorkerTerminalToast, formatWorkersStartedToast, formatWorkersTerminalToast } from "../../src/ui/display-grammar.js";
import { formatAgentMessageResult, formatAgentResultNotReady, formatDelegateTaskResult, formatWaitForAgentsResult, formatWorkerCompact, formatWorkers } from "../../src/ui/tool-formatters.js";
import { renderAgentToolCallTitle } from "../../src/ui/tool-renderers.js";
import { THINKING_LEVELS } from "../../src/types.js";
const DELEGATE_TASK_MODEL_DESCRIPTION = "Override the worker model (e.g. \"provider/model-id\"). Defaults to the orchestrator's current model.";
const SCOPED_MODEL_PREVIEW_LIMIT = 8;
function createNullableArgumentPreparer(nullableKeys) {
    return function prepareNullableArguments(args) {
        if (typeof args !== "object" || args === null || Array.isArray(args))
            return args;
        const prepared = { ...args };
        for (const key of nullableKeys) {
            if (!(key in prepared))
                prepared[key] = null;
        }
        return prepared;
    };
}
const DelegateTaskSchema = Type.Object({
    title: Type.String({ description: "Short title for the delegated task" }),
    goal: Type.String({ description: "What the worker should accomplish" }),
    profileName: Type.String({ description: "Worker profile name — see the 'Available worker profiles' block in the system prompt for the live list. Names are user-declared in agents-team.json; don't invent names." }),
    cwd: Type.Union([Type.String(), Type.Null()], { description: "Working directory for the worker. Set to null to use the current session cwd." }),
    contextHints: Type.Union([Type.Array(Type.String()), Type.Null()], { description: "Compact context bullets to pass into the worker, or null when none are needed." }),
    expectedOutput: Type.Union([Type.String(), Type.Null()], { description: "Describe the output contract the worker should return, or null when unspecified." }),
    pathScopeRoots: Type.Union([Type.Array(Type.String()), Type.Null()], { description: "Allowed path roots for scoped workers, especially write-capable profiles, or null when unscoped." }),
    pathScopeAllowWrite: Type.Union([Type.Boolean(), Type.Null()], { description: "Whether the delegated path scope may be written to, or null when no path scope is set." }),
    skills: Type.Union([Type.Array(Type.String()), Type.Null()], { description: "List of installed Pi skill names to enable on the worker, or null if no specialized skill is needed. When set, Pi's skill discovery runs for this worker (normally disabled for worker-minimal launches) and the worker is told to load and apply the requested skills by name." }),
    model: Type.Union([Type.String(), Type.Null()], { description: DELEGATE_TASK_MODEL_DESCRIPTION }),
    reuseWorkerId: Type.Union([Type.String(), Type.Null()], { description: "Reuse an existing idle (or waiting_followup) worker's RPC session for this task instead of spawning a fresh process, or null to launch a new worker. Use reuse when the next task is in scope of the previous role and roughly the same path scope — saves spawn cost and keeps warm role context. The worker's prior summary, finalAnswer, and lastTool are reset; a new taskId is allocated. Rejected if the target is running/starting/completed/aborted/error/exited (its RPC is already disposed); cancel + delegate fresh in that case. Check agent_status for `reusable: true` to find candidates." }),
}, { additionalProperties: false });
const WorkerLookupSchema = Type.Object({
    workerId: Type.Union([Type.String(), Type.Null()], { description: "Specific worker id, or null to inspect all tracked workers." }),
}, { additionalProperties: false });
const WorkerMessageSchema = Type.Object({
    workerId: Type.String({ description: "Target worker id" }),
    message: Type.String({ description: "Instruction for the worker" }),
    delivery: Type.Union([Type.String(), Type.Null()], {
        description: 'Delivery mode: "auto", "steer", or "follow_up". Set to null for the default auto behavior. Applied only when the worker is running; idle/waiting_followup workers always receive the message as a fresh prompt that wakes the session and starts a new turn.',
    }),
}, { additionalProperties: false });
const PingAgentsSchema = Type.Object({
    workerIds: Type.Union([Type.Array(Type.String()), Type.Null()], { description: "Worker ids to ping, or null to ping all workers." }),
    mode: Type.Union([Type.String(), Type.Null()], { description: 'Ping mode: "passive" or "active". Set to null for passive. Active mode refreshes state and stats.' }),
}, { additionalProperties: false });
const WorkerIdSchema = Type.Object({
    workerId: Type.String({ description: "Target worker id" }),
}, { additionalProperties: false });
const WaitForAgentsSchema = Type.Object({
    workerIds: Type.Union([Type.Array(Type.String()), Type.Null()], { description: "Worker ids to wait on, or null to wait on every tracked worker." }),
    timeoutMs: Type.Union([Type.Number(), Type.Null()], { description: "Maximum wait in milliseconds, or null to use 300000 (5 min)." }),
    wakeOnRelay: Type.Union([Type.Boolean(), Type.Null()], { description: "Return early with reason=relay_raised when any target raises a new relay question. Set to null for the default true behavior so the orchestrator can answer mid-flight without waiting for every worker to finish." }),
}, { additionalProperties: false });
const SCAFFOLD_FRESHNESS_TOASTS_KEY = Symbol.for("pi-agents-team.scaffoldFreshnessToasts");
const PERSISTENCE_INTEGRITY_BLOCKED_MANAGERS_KEY = Symbol.for("pi-agents-team.persistenceIntegrityBlockedManagers");
const PERSISTENCE_RECORD_WARNING_THRESHOLD = 10_000;
const PERSISTENCE_BYTE_WARNING_THRESHOLD = 64 * 1024 * 1024;
const PERSISTENCE_GROWTH_WARNING = "Pi Agents Team: this active branch contains at least 10,000 compact persistence records or 64 MiB of compact record payloads. Pi sessions are append-only; consider starting a new session. Reload, prune, and branch navigation do not shrink the physical session file. Measured compact payload bytes are not the total session file size.";
const PERSISTENCE_FLUSH_WARNING = "Pi Agents Team: a compact persistence append still failed during final retry; the uncommitted transition could not be saved before teardown.";
const PERSISTENCE_TREE_DROP_WARNING = "Pi Agents Team: compact persistence still failed before tree navigation; unresolved old-branch records were isolated and will not be written onto the new branch.";
const PERSISTENCE_LIVE_WARNING = "Pi Agents Team: a compact persistence append failed; the bounded uncommitted suffix was retained for a later retry.";
const PERSISTENCE_AMBIGUOUS_APPEND_WARNING = "Pi Agents Team: a compact persistence append threw after Pi advanced the session leaf; the durably confirmed tail record was treated as accepted and will not be retried beneath that leaf.";
const PERSISTENCE_AMBIGUOUS_BLOCKED_WARNING = "Pi Agents Team: compact persistence is disabled because this session manager's disk and in-memory state may differ or the session-file boundary could not be captured or restored safely. Restart Pi, reopen the session, or start a new session before retrying persistence; plain /reload is not sufficient.";
const PERSISTENCE_TAIL_READ_BYTES = 32 * 1024;
const PREFERRED_JSON_SCHEMA_SAMPLING = { type: "json_schema", strict: "prefer" };
function createPersistenceGrowthMonitor(notify) {
    let measurement = { recordCount: 0, payloadBytes: 0 };
    let warningLatched = false;
    let warningEnabled = true;
    const evaluate = () => {
        if (!warningEnabled) {
            warningLatched = false;
            return;
        }
        const aboveThreshold = measurement.recordCount >= PERSISTENCE_RECORD_WARNING_THRESHOLD
            || measurement.payloadBytes >= PERSISTENCE_BYTE_WARNING_THRESHOLD;
        if (!aboveThreshold) {
            warningLatched = false;
            return;
        }
        if (warningLatched)
            return;
        warningLatched = true;
        notify(PERSISTENCE_GROWTH_WARNING);
    };
    return {
        replace(next, enabled = true) {
            measurement = { ...next };
            warningEnabled = enabled;
            evaluate();
        },
        recordAppended(payloadBytes) {
            measurement.recordCount += 1;
            measurement.payloadBytes += payloadBytes;
            evaluate();
        },
        snapshot() {
            return { ...measurement };
        },
    };
}
function getProcessStableScaffoldFreshnessToasts() {
    const store = globalThis;
    const existing = store[SCAFFOLD_FRESHNESS_TOASTS_KEY];
    if (existing instanceof Set)
        return existing;
    const freshnessToasts = new Set();
    store[SCAFFOLD_FRESHNESS_TOASTS_KEY] = freshnessToasts;
    return freshnessToasts;
}
function getProcessStablePersistenceIntegrityBlocks() {
    const store = globalThis;
    const existing = store[PERSISTENCE_INTEGRITY_BLOCKED_MANAGERS_KEY];
    if (existing instanceof WeakSet)
        return existing;
    const blockedManagers = new WeakSet();
    store[PERSISTENCE_INTEGRITY_BLOCKED_MANAGERS_KEY] = blockedManagers;
    return blockedManagers;
}
function getOrchestratorThinkingLevel(pi, ctx) {
    return ctx.thinkingLevel
        ?? pi.getThinkingLevel?.()
        ?? ctx.getThinkingLevel?.();
}
function getProjectTrustDecisionForContext(ctx) {
    const isProjectTrusted = ctx.isProjectTrusted;
    if (typeof isProjectTrusted !== "function")
        return undefined;
    return isProjectTrusted.call(ctx) === true;
}
function isProjectConfigTrustedForContext(ctx) {
    return getProjectTrustDecisionForContext(ctx) ?? true;
}
function buildAtpContext(activeProjectConfig, ctx, extra = {}) {
    return {
        packageName: activeProjectConfig?.config?.orchestration?.packageName ?? DEFAULT_TEAM_CONFIG.orchestration.packageName,
        ...extra,
    };
}
function buildAtpRecorderOptions(activeProjectConfig, signal) {
    const memoryEnabled = activeProjectConfig?.config?.memory?.edenMemory?.enabled === true;
    if (!memoryEnabled)
        return undefined;
    const edenOptions = buildEdenMemoryOptions(activeProjectConfig);
    // Honor the .env kill-switch: EDEN_MEMORY_ENABLED=false/0/no disables recording.
    if (!edenOptions.enabled)
        return undefined;
    return {
        env: process.env,
        signal,
        edenOptions,
    };
}
function buildEdenMemoryOptions(activeProjectConfig) {
    const memoryConfig = activeProjectConfig?.config?.memory?.edenMemory;
    const envOptions = resolveEdenOptions(process.env);
    return {
        ...envOptions,
        ...(typeof memoryConfig?.bin === "string" ? { bin: memoryConfig.bin } : {}),
        ...(typeof memoryConfig?.db === "string" ? { db: memoryConfig.db } : {}),
        ...(typeof memoryConfig?.workspaceId === "string" ? { workspaceId: memoryConfig.workspaceId } : {}),
        ...(typeof memoryConfig?.userId === "string" ? { userId: memoryConfig.userId } : {}),
        ...(typeof memoryConfig?.agentId === "string" ? { agentId: memoryConfig.agentId } : {}),
        ...(typeof memoryConfig?.llmApiKey === "string" ? { llmApiKey: memoryConfig.llmApiKey } : {}),
        ...(typeof memoryConfig?.llmBaseUrl === "string" ? { llmBaseUrl: memoryConfig.llmBaseUrl } : {}),
        ...(typeof memoryConfig?.logLevel === "string" ? { logLevel: memoryConfig.logLevel } : {}),
        // Config can override the semantic-search flag from env; enabled is kept
        // from env so EDEN_MEMORY_ENABLED=false/0/no acts as a kill-switch.
        ...(typeof memoryConfig?.semanticSearch === "boolean" ? { semanticSearch: memoryConfig.semanticSearch } : {}),
    };
}
function recordAtpStage(activeProjectConfig, stageRecorder, content, ctx, signal) {
    const options = buildAtpRecorderOptions(activeProjectConfig, signal);
    if (!options)
        return;
    void stageRecorder(content, options, buildAtpContext(activeProjectConfig, ctx));
}
function updateDelegateTaskProfileDescription(config) {
    const profileListSnapshot = config.profiles.map((profile) => profile.name);
    const profileListSummary = profileListSnapshot.length > 0 ? profileListSnapshot.join(", ") : "(none declared)";
    DelegateTaskSchema.properties.profileName.description =
        `Worker profile name. Currently declared in this session: ${profileListSummary}. See the 'Available worker profiles' block in the orchestrator system prompt for details and write policy. Don't invent names that aren't in that list — delegate_task will fail.`;
}
function buildDelegateTaskModelDescription(scopedModels) {
    if (!Array.isArray(scopedModels) || scopedModels.length === 0)
        return DELEGATE_TASK_MODEL_DESCRIPTION;
    const modelRefs = [];
    const seen = new Set();
    for (const entry of scopedModels) {
        if (!entry || typeof entry !== "object")
            continue;
        const model = entry.model;
        if (!model || typeof model !== "object")
            continue;
        const provider = typeof model.provider === "string"
            ? model.provider.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 96)
            : "";
        const id = typeof model.id === "string"
            ? model.id.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160)
            : "";
        if (!provider || !id)
            continue;
        const modelRef = `${provider}/${id}`;
        if (seen.has(modelRef))
            continue;
        seen.add(modelRef);
        modelRefs.push(modelRef);
    }
    if (modelRefs.length === 0)
        return DELEGATE_TASK_MODEL_DESCRIPTION;
    const preview = modelRefs.slice(0, SCOPED_MODEL_PREVIEW_LIMIT).join(", ");
    const remaining = modelRefs.length - SCOPED_MODEL_PREVIEW_LIMIT;
    const overflow = remaining > 0 ? ` (+${remaining} more)` : "";
    return `${DELEGATE_TASK_MODEL_DESCRIPTION} Models suggested by the orchestrator's current Pi scope: ${preview}${overflow}. This list is advisory; role-specific config and worker extensions may make additional model IDs available.`;
}
function updateDelegateTaskModelDescription(scopedModels) {
    DelegateTaskSchema.properties.model.description =
        buildDelegateTaskModelDescription(scopedModels);
}
function isPersistedSession(ctx) {
    const sessionManager = ctx.sessionManager;
    return typeof sessionManager.isPersisted !== "function" || sessionManager.isPersisted() !== false;
}
function captureSessionFileBoundary(sessionFile) {
    if (!sessionFile)
        return undefined;
    try {
        return { path: sessionFile, existed: true, size: statSync(sessionFile).size };
    }
    catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            return { path: sessionFile, existed: false, size: 0 };
        }
        return undefined;
    }
}
function restoreSessionFileBoundary(boundary) {
    if (!boundary)
        return false;
    try {
        if (boundary.existed) {
            truncateSync(boundary.path, boundary.size);
            return statSync(boundary.path).size === boundary.size;
        }
        if (existsSync(boundary.path))
            unlinkSync(boundary.path);
        return !existsSync(boundary.path);
    }
    catch {
        return false;
    }
}
function persistedTailContainsRecord(sessionFile, leafId, stateCustomType, recordId) {
    let descriptor;
    try {
        descriptor = openSync(sessionFile, "r");
        const size = fstatSync(descriptor).size;
        if (size <= 0)
            return false;
        const length = Math.min(size, PERSISTENCE_TAIL_READ_BYTES);
        const buffer = Buffer.allocUnsafe(length);
        const bytesRead = readSync(descriptor, buffer, 0, length, size - length);
        const rawTail = buffer.subarray(0, bytesRead).toString("utf8").trimEnd().split("\n").at(-1);
        if (!rawTail)
            return false;
        const tail = JSON.parse(rawTail);
        if (!tail || typeof tail !== "object" || Array.isArray(tail))
            return false;
        if (!("id" in tail) || tail.id !== leafId
            || !("type" in tail) || tail.type !== "custom"
            || !("customType" in tail) || tail.customType !== stateCustomType
            || !("data" in tail) || !tail.data || typeof tail.data !== "object" || Array.isArray(tail.data)
            || !("recordId" in tail.data))
            return false;
        return tail.data.recordId === recordId;
    }
    catch {
        return false;
    }
    finally {
        if (descriptor !== undefined) {
            try {
                closeSync(descriptor);
            }
            catch {
                // A completed read remains usable; descriptor cleanup cannot change
                // whether the exact record was already present at the file tail.
            }
        }
    }
}
function restoreLatestState(ctx, startReason, config = DEFAULT_TEAM_CONFIG) {
    const sessionManager = ctx.sessionManager;
    const branch = sessionManager.getBranch?.() ?? [];
    const restored = restorePersistedTeamStateWithMeasurement(branch, config.persistence.stateCustomType);
    const { state, markedCount } = markRestoredWorkersExited(restored.state, startReason);
    return { state, markedCount, persistenceMeasurement: restored.measurement };
}
function applyUi(ctx, state, frame = 0, config = DEFAULT_TEAM_CONFIG, active = true, routingMode = "team", displayCost = true, tip, orchestratorWorking = false) {
    if (!ctx?.hasUI)
        return;
    if (!active) {
        ctx.ui.setStatus(config.ui.statusKey, undefined);
        ctx.ui.setWidget(config.ui.widgetKey, undefined);
        return;
    }
    const theme = ctx.ui.theme;
    const widgetLines = buildTeamWidgetLines(state, { frame, routingMode, displayCost, theme, width: 80 });
    ctx.ui.setStatus(config.ui.statusKey, buildTeamStatusLine(state, routingMode, tip, orchestratorWorking, theme));
    if (widgetLines.length === 0) {
        ctx.ui.setWidget(config.ui.widgetKey, undefined);
    }
    else if (ctx.mode === "tui") {
        ctx.ui.setWidget(config.ui.widgetKey, (_tui, widgetTheme) => ({
            render: (width) => buildTeamWidgetLines(state, { frame, routingMode, displayCost, theme: widgetTheme, width }),
            invalidate: () => { },
        }));
    }
    else {
        ctx.ui.setWidget(config.ui.widgetKey, widgetLines);
    }
    ctx.ui.setTitle(config.ui.titleTemplate.replace("{mode}", state.sessionMode));
}
function getDashboardWidgetKey(config = DEFAULT_TEAM_CONFIG) {
    return `${config.ui.widgetKey}-dashboard`;
}
function emitCommandOutput(pi, ctx, text, config = DEFAULT_TEAM_CONFIG) {
    if (ctx.hasUI) {
        pi.sendMessage({
            customType: config.persistence.statusMessageType,
            content: text,
            display: true,
        });
        return;
    }
    console.log(text);
}
function isTeamActive(config) {
    return config.enabled && config.delegationEnabled;
}
function getDisabledMessage(config) {
    const sourceLayer = config.layers.find((layer) => layer.scope === config.enabledSource);
    const path = sourceLayer?.path;
    const pathSuffix = path ? ` (source: ${path})` : "";
    return `Pi Agents Team is disabled${pathSuffix}. Enable it by editing agents-team.json (set enabled: true), then /reload.`;
}
function getProjectConfigNotice(result) {
    if (!result.enabled) {
        return { level: "info", message: getDisabledMessage(result) };
    }
    if (result.status === "project" && result.sourcePath) {
        return {
            level: "info",
            message: `Pi Agents Team: loaded session-frozen project config from ${result.sourcePath}.`,
        };
    }
    if (result.status === "invalid") {
        const firstError = result.diagnostics.find((diagnostic) => diagnostic.severity === "error");
        return {
            level: "warning",
            message: `Pi Agents Team: invalid agents-team.json — delegation disabled${firstError ? ` (${firstError.message})` : ""}.`,
        };
    }
    return undefined;
}
function getProjectConfigPromptNote(result) {
    if (result.status === "project" && result.sourcePath) {
        return `- Session-frozen project role config loaded from ${result.sourcePath}. Treat those profiles as the active role config for this session.`;
    }
    if (result.status === "invalid") {
        const firstError = result.diagnostics.find((diagnostic) => diagnostic.severity === "error");
        return `- Project role config is invalid${result.sourcePath ? ` at ${result.sourcePath}` : ""}. Delegation is disabled until it is fixed.${firstError ? ` First error: ${firstError.message}.` : ""}`;
    }
    return undefined;
}
function getDelegationDisabledMessage(result) {
    const firstError = result.diagnostics.find((diagnostic) => diagnostic.severity === "error");
    return `Delegation is disabled because agents-team.json is invalid${result.sourcePath ? ` at ${result.sourcePath}` : ""}${firstError ? `: ${firstError.message}` : "."}`;
}
function formatScopeLabel(scope) {
    return scope === "project" ? "local" : scope;
}
function formatConfigValue(value) {
    if (typeof value === "string")
        return value;
    if (value === undefined)
        return "undefined";
    try {
        return JSON.stringify(value) ?? String(value);
    }
    catch {
        return String(value);
    }
}
function thinkingLevelWarningToastKey(warning) {
    return `${warning.scope}\0${warning.profileName}\0${formatConfigValue(warning.badValue)}`;
}
function buildThinkingLevelWarningToast(warning) {
    const scopeLabel = formatScopeLabel(warning.scope);
    return `Pi Agents Team: ${scopeLabel} agents-team.json role "${warning.profileName}" has invalid thinkingLevel "${formatConfigValue(warning.badValue)}"; field dropped and default thinkingLevel will be used. Valid values: ${THINKING_LEVELS.join(", ")}.`;
}
function thinkingClampToastKey(event) {
    return `${event.workerId}\0${event.requested}\0${event.effective}`;
}
function buildThinkingClampToast(event) {
    const modelPart = event.modelLabel ? ` for model ${event.modelLabel}` : "";
    return `Pi Agents Team: worker ${event.workerId} (${event.profileName}) requested thinkingLevel ${event.requested}; Pi clamped to ${event.effective}${modelPart} because the model lacks support. Edit agents-team.json or change model.`;
}
function buildPiVersionMismatchToast(event) {
    return event.message;
}
function emitPiVersionMismatchWarning(ctx, message) {
    if (ctx?.hasUI) {
        ctx.ui.notify(message, "warning");
        return;
    }
    console.error(message);
}
function createPiVersionMismatchNotifier(notify) {
    let warned = false;
    return {
        notify(event) {
            if (warned)
                return;
            warned = true;
            notify(buildPiVersionMismatchToast(event));
        },
        reset() {
            warned = false;
        },
    };
}
export const _testing = {
    createPersistenceGrowthMonitor,
    PERSISTENCE_BYTE_WARNING_THRESHOLD,
    PERSISTENCE_GROWTH_WARNING,
    PERSISTENCE_RECORD_WARNING_THRESHOLD,
    buildPiVersionMismatchToast,
    createPiVersionMismatchNotifier,
    emitPiVersionMismatchWarning,
    buildThinkingClampToast,
    buildThinkingLevelWarningToast,
    getOrchestratorThinkingLevel,
    buildDelegateTaskModelDescription,
    getProjectTrustDecisionForContext,
    isProjectConfigTrustedForContext,
    thinkingClampToastKey,
    thinkingLevelWarningToastKey,
    buildAtpRecorderOptions,
    buildEdenMemoryOptions,
};
export default function (pi) {
    let activeProjectConfig = loadActiveTeamConfig({
        cwd: process.cwd(),
        baseConfig: DEFAULT_TEAM_CONFIG,
        projectConfigTrusted: false,
    });
    // Mutate the profileName description to surface the current role list right
    // in the tool schema. Pi's ToolDefinition.parameters is frozen at
    // registerTool time with no dynamic-enum seam, but the `description` string
    // is read by the orchestrator LLM every turn; seeding it here gives the
    // model a schema-level hint of which names are valid. On session_start and
    // /reload the active config may change, so refresh it after trust-aware load.
    updateDelegateTaskProfileDescription(activeProjectConfig.config);
    updateDelegateTaskModelDescription(undefined);
    const deriveInitialRoutingMode = (loaded) => {
        if (!loaded.enabled || !loaded.delegationEnabled)
            return "solo";
        return loaded.persistedRoutingMode ?? "team";
    };
    let teamManager = new TeamManager({
        config: activeProjectConfig.config,
        routingMode: deriveInitialRoutingMode(activeProjectConfig),
        displayCost: activeProjectConfig.displayCost,
    });
    let teamState = createDefaultTeamState(activeProjectConfig.config);
    let activeContext;
    let detachTeamManagerListener = (_flushPersistence) => { };
    const persistenceJournal = new CompactPersistenceJournal();
    const persistenceGrowth = createPersistenceGrowthMonitor((message) => {
        if (activeContext?.hasUI)
            activeContext.ui.notify(message, "warning");
        else
            console.error(message);
    });
    const persistenceFailureWarnings = new Set();
    let provisionalTreeNavigation;
    // Pi /reload rebuilds this factory but retains the SessionManager. Keep the
    // fail-closed latch process-stable and identity-scoped; WeakSet GC naturally
    // releases it once a genuinely replaced/reopened manager becomes unreachable.
    const persistenceIntegrityBlockedManagers = getProcessStablePersistenceIntegrityBlocks();
    const restoredWorkerIds = new Set();
    // Gate for session_start swap window — tool bodies reject during reload so
    // an in-flight delegate_task / wait_for_agents / agent_message doesn't
    // resolve against a disposed TeamManager.
    let reloading = false;
    // De-dup active config scaffold freshness toasts across session_start
    // events. Pi fires session_start on startup, reload, new, resume, fork;
    // without de-dup, operators iterating with /reload see the same warning
    // every time. We emit once per active (scope, scaffoldVersion) or unknown
    // scaffold state per process.
    const toastedScaffoldStale = getProcessStableScaffoldFreshnessToasts();
    const toastedThinkingLevelWarnings = new Map();
    const toastedThinkingClamps = new Map();
    const piVersionMismatchNotifier = createPiVersionMismatchNotifier((message) => {
        emitPiVersionMismatchWarning(activeContext, message);
    });
    const lastStatus = new Map();
    const lastRelayCount = new Map();
    const dashboardState = new InlineDashboardState();
    let dashboardWidget;
    let detachDashboardInput;

    function getOrCreateDashboardWidget(ctx) {
        if (!dashboardWidget) {
            dashboardWidget = new TeamDashboardWidget(ctx, teamManager, dashboardState, {
                displayCost: activeProjectConfig.displayCost,
                cwd: ctx.cwd,
                config: activeProjectConfig.config,
                widgetKey: getDashboardWidgetKey(activeProjectConfig.config),
            });
        }
        else {
            dashboardWidget.setContext(ctx);
            dashboardWidget.teamManager = teamManager;
            dashboardWidget.options.displayCost = activeProjectConfig.displayCost;
            dashboardWidget.displayCost = activeProjectConfig.displayCost !== false;
            dashboardWidget.options.config = activeProjectConfig.config;
            dashboardWidget.options.cwd = ctx.cwd;
        }
        return dashboardWidget;
    }
    function ensureDashboardInputListener(ctx) {
        if (detachDashboardInput)
            return;
        if (!ctx?.hasUI || ctx.mode !== "tui")
            return;
        detachDashboardInput = ctx.ui.onTerminalInput((data) => {
            const widget = dashboardWidget;
            if (!widget || !widget.isActive())
                return undefined;
            const consumed = widget.handleInput(data);
            return consumed ? { consume: true } : undefined;
        });
    }
    function clearDashboardUi(ctx, config = DEFAULT_TEAM_CONFIG) {
        if (ctx?.hasUI)
            ctx.ui.setWidget(getDashboardWidgetKey(config), undefined);
        if (detachDashboardInput) {
            detachDashboardInput();
            detachDashboardInput = undefined;
        }
        dashboardState.setActive(false);
    }
    function clearUi(ctx, config = DEFAULT_TEAM_CONFIG) {
        if (!ctx?.hasUI)
            return;
        ctx.ui.setStatus(config.ui.statusKey, undefined);
        ctx.ui.setWidget(config.ui.widgetKey, undefined);
        clearDashboardUi(ctx, config);
    }
    function renderDashboardWidget(ctx) {
        if (!ctx?.hasUI || ctx.mode !== "tui" || !dashboardState.active)
            return;
        const widget = getOrCreateDashboardWidget(ctx);
        widget.refresh();
        ensureDashboardInputListener(ctx);
    }
    const pendingStartedTransitions = [];
    const pendingTerminalTransitions = [];
    let notificationTimer;
    let spinnerTimer;
    let tipTimer;
    let spinnerFrame = 0;
    let tipIndex = 0;
    let orchestratorWorking = false;
    const SPINNER_INTERVAL_MS = 120;
    const TIP_INTERVAL_MS = 15_000;
    function renderUi(ctx, state, frame = spinnerFrame, config = activeProjectConfig.config, active = isTeamActive(activeProjectConfig), routingMode = teamManager.routingMode, displayCost = activeProjectConfig.displayCost) {
        applyUi(ctx, state, frame, config, active, routingMode, displayCost, getTeamStatusTip(tipIndex), orchestratorWorking);
        renderDashboardWidget(ctx);
        if (ctx?.hasUI && active)
            ensureTipRotationRunning();
        else
            stopTipRotation();
    }
    function ensureSpinnerRunning() {
        if (spinnerTimer || !activeContext?.hasUI)
            return;
        if (!hasAnimatedWorkers(teamState))
            return;
        spinnerTimer = setInterval(() => {
            spinnerFrame = (spinnerFrame + 1) % 10;
            if (!activeContext?.hasUI || !hasAnimatedWorkers(teamState)) {
                stopSpinner();
                return;
            }
            renderUi(activeContext, teamState, spinnerFrame, activeProjectConfig.config, isTeamActive(activeProjectConfig), teamManager.routingMode, activeProjectConfig.displayCost);
        }, SPINNER_INTERVAL_MS);
        if (typeof spinnerTimer.unref === "function")
            spinnerTimer.unref();
    }
    function stopSpinner() {
        if (!spinnerTimer)
            return;
        clearInterval(spinnerTimer);
        spinnerTimer = undefined;
    }
    function ensureTipRotationRunning() {
        if (tipTimer || !activeContext?.hasUI || !isTeamActive(activeProjectConfig))
            return;
        tipTimer = setInterval(() => {
            if (!activeContext?.hasUI || !isTeamActive(activeProjectConfig)) {
                stopTipRotation();
                return;
            }
            tipIndex += 1;
            renderUi(activeContext, teamState, spinnerFrame, activeProjectConfig.config, true, teamManager.routingMode, activeProjectConfig.displayCost);
        }, TIP_INTERVAL_MS);
        if (typeof tipTimer.unref === "function")
            tipTimer.unref();
    }
    function stopTipRotation() {
        if (!tipTimer)
            return;
        clearInterval(tipTimer);
        tipTimer = undefined;
    }
    function resetUiTracking() {
        lastStatus.clear();
        lastRelayCount.clear();
        pendingStartedTransitions.length = 0;
        pendingTerminalTransitions.length = 0;
        if (notificationTimer) {
            clearTimeout(notificationTimer);
            notificationTimer = undefined;
        }
    }
    function flushWorkerNotifications() {
        notificationTimer = undefined;
        const started = pendingStartedTransitions.splice(0);
        const terminal = pendingTerminalTransitions.splice(0);
        if (!activeContext?.hasUI)
            return;
        const startedItems = started.filter((item) => {
            const current = lastStatus.get(item.workerId);
            return current === "starting" || current === "running";
        });
        if (startedItems.length === 1) {
            activeContext.ui.notify(formatWorkerStartedToast(startedItems[0]), "info");
        }
        else if (startedItems.length > 1) {
            activeContext.ui.notify(formatWorkersStartedToast(startedItems), "info");
        }
        const terminalItems = terminal.filter((item) => {
            const current = lastStatus.get(item.workerId);
            return current ? isTerminalWorkerStatus(current) : false;
        });
        if (terminalItems.length === 1) {
            activeContext.ui.notify(formatWorkerTerminalToast(terminalItems[0]), "info");
        }
        else if (terminalItems.length > 1) {
            activeContext.ui.notify(formatWorkersTerminalToast(terminalItems), "info");
        }
    }
    function notifyThinkingLevelWarnings(ctx, warnings) {
        if (!ctx.hasUI || !warnings?.length)
            return;
        for (const warning of warnings) {
            const dedupKey = thinkingLevelWarningToastKey(warning);
            if (toastedThinkingLevelWarnings.has(dedupKey))
                continue;
            toastedThinkingLevelWarnings.set(dedupKey, true);
            ctx.ui.notify(buildThinkingLevelWarningToast(warning), "warning");
        }
    }
    function notifyActiveConfigFreshness(ctx, loaded) {
        if (!ctx.hasUI)
            return;
        const freshness = loaded.activeConfigFreshness;
        if (freshness.kind === "none" || freshness.parseStatus !== "valid")
            return;
        const scopeLabel = freshness.scope === "project" ? "local" : "global";
        const initScope = scopeLabel;
        if (freshness.scaffoldVersionMissing) {
            const dedupKey = `${freshness.scope}\0unknown`;
            if (toastedScaffoldStale.has(dedupKey))
                return;
            toastedScaffoldStale.add(dedupKey);
            ctx.ui.notify(`Pi Agents Team: active ${scopeLabel} agents-team.json has no scaffoldVersion; plugin is ${CURRENT_SCAFFOLD_VERSION} and cannot verify scaffold freshness. Run /team-init ${initScope} --force to refresh if this file predates scaffoldVersion tracking (old file is backed up first).`, "warning");
            return;
        }
        if (!freshness.scaffoldStale || freshness.scaffoldVersion === undefined)
            return;
        const dedupKey = `${freshness.scope}\0${freshness.scaffoldVersion}`;
        if (toastedScaffoldStale.has(dedupKey))
            return;
        toastedScaffoldStale.add(dedupKey);
        ctx.ui.notify(`Pi Agents Team: active ${scopeLabel} agents-team.json is scaffoldVersion ${freshness.scaffoldVersion}, plugin is ${CURRENT_SCAFFOLD_VERSION}. Run /team-init ${initScope} --force to refresh (old file is backed up first).`, "warning");
    }
    function notifyThinkingClamp(event) {
        if (!activeContext?.hasUI)
            return;
        const dedupKey = thinkingClampToastKey(event);
        if (toastedThinkingClamps.has(dedupKey))
            return;
        toastedThinkingClamps.set(dedupKey, true);
        activeContext.ui.notify(buildThinkingClampToast(event), "warning");
    }
    function notifyPiVersionMismatch(event) {
        piVersionMismatchNotifier.notify(event);
    }
    function currentSessionManager() {
        return activeContext?.sessionManager;
    }
    function currentLeafId() {
        return currentSessionManager()?.getLeafId?.();
    }
    function assertPersistenceAppendStillOnOriginBranch() {
        const navigation = provisionalTreeNavigation;
        if (!navigation)
            return;
        const sessionManager = currentSessionManager();
        const leafId = sessionManager?.getLeafId?.();
        if (leafId === undefined)
            return;
        if (navigation.rootDispatchBlocked && !navigation.confirmed && navigation.originLeafId === null) {
            throw new Error("Refusing to append root-origin persistence before tree navigation is confirmed or cancelled.");
        }
        if (leafId === navigation.appendLeafId)
            return;
        if (navigation.appendLeafId === null && !navigation.confirmed) {
            const branch = Array.from(sessionManager?.getBranch?.() ?? []);
            const reachedPreexistingDestination = branch.some((entry) => typeof entry.id === "string"
                && navigation.preexistingEntryIds.has(entry.id)
                && !navigation.originBranchEntryIds.has(entry.id));
            const leafEntry = leafId === null ? undefined : sessionManager?.getEntry?.(leafId);
            const reachedNavigationArtifact = leafEntry?.type === "branch_summary"
                || (leafEntry?.type === "label"
                    && typeof leafEntry.targetId === "string"
                    && navigation.preexistingEntryIds.has(leafEntry.targetId));
            if (!reachedPreexistingDestination && !reachedNavigationArtifact)
                return;
        }
        if (navigation.appendLeafId !== null) {
            const branch = sessionManager?.getBranch?.();
            if (branch && Array.from(branch).some((entry) => entry.id === navigation.appendLeafId))
                return;
        }
        throw new Error("Refusing to append an old-branch compact persistence record after the active branch changed.");
    }
    function observePersistenceAppendLeaf() {
        const navigation = provisionalTreeNavigation;
        if (!navigation)
            return;
        const leafId = currentLeafId();
        if (leafId !== undefined)
            navigation.appendLeafId = leafId;
    }
    function appendPreparedPersistence(maxBatches = 2, initialRecords) {
        const sessionManagerAtStart = currentSessionManager();
        if (sessionManagerAtStart && persistenceIntegrityBlockedManagers.has(sessionManagerAtStart)) {
            warnPersistenceFailure(PERSISTENCE_AMBIGUOUS_BLOCKED_WARNING);
            return false;
        }
        for (let batch = 0; batch < maxBatches; batch += 1) {
            const records = batch === 0 && initialRecords
                ? initialRecords
                : persistenceJournal.prepare(teamState, activeProjectConfig.config);
            if (records.length === 0)
                return true;
            for (const record of records) {
                const leafBeforeAppend = currentLeafId();
                const sessionManagerBeforeAppend = currentSessionManager();
                const explicitlyPersisted = sessionManagerBeforeAppend?.isPersisted?.() === true;
                const sessionFileBeforeAppend = explicitlyPersisted
                    ? sessionManagerBeforeAppend.getSessionFile?.()
                    : undefined;
                const fileBoundary = captureSessionFileBoundary(sessionFileBeforeAppend);
                if (explicitlyPersisted && (!sessionFileBeforeAppend || !fileBoundary)) {
                    persistenceIntegrityBlockedManagers.add(sessionManagerBeforeAppend);
                    warnPersistenceFailure(PERSISTENCE_AMBIGUOUS_BLOCKED_WARNING);
                    return false;
                }
                try {
                    // Keep this guard adjacent to appendEntry: prepare may have run while an
                    // asynchronous tree summary was still moving the active leaf.
                    assertPersistenceAppendStillOnOriginBranch();
                    pi.appendEntry(activeProjectConfig.config.persistence.stateCustomType, record);
                }
                catch {
                    const sessionManager = currentSessionManager();
                    const leafAfterFailure = sessionManager?.getLeafId?.();
                    const advancedLeafId = typeof leafAfterFailure === "string" ? leafAfterFailure : undefined;
                    const leafEntry = advancedLeafId ? sessionManager?.getEntry?.(advancedLeafId) : undefined;
                    const entryData = leafEntry?.data;
                    const entryRecordId = entryData && typeof entryData === "object" && "recordId" in entryData
                        ? entryData.recordId
                        : undefined;
                    const advancedToAttemptedRecord = leafBeforeAppend !== undefined
                        && advancedLeafId !== undefined
                        && advancedLeafId !== leafBeforeAppend
                        && leafEntry?.type === "custom"
                        && leafEntry.customType === activeProjectConfig.config.persistence.stateCustomType
                        && entryRecordId === record.recordId;
                    if (!advancedToAttemptedRecord || advancedLeafId === undefined)
                        return false;
                    const persisted = sessionManager?.isPersisted?.() !== false;
                    const sessionFile = sessionManager?.getSessionFile?.();
                    const durablyConfirmed = !persisted
                        || (typeof sessionFile === "string"
                            && persistedTailContainsRecord(sessionFile, advancedLeafId, activeProjectConfig.config.persistence.stateCustomType, record.recordId));
                    if (!durablyConfirmed) {
                        // Truncating the partial write cannot remove the attempted entry from
                        // SessionManager's private index. Move its leaf back when possible so
                        // ordinary session writes remain rooted at a durable parent, but fail
                        // closed: only a clean reload can make memory match disk again.
                        restoreSessionFileBoundary(fileBoundary);
                        try {
                            if (leafBeforeAppend === null)
                                sessionManager?.resetLeaf?.();
                            else
                                sessionManager?.branch?.(leafBeforeAppend);
                        }
                        catch {
                            // The integrity block below is required regardless of leaf repair.
                        }
                        if (sessionManager)
                            persistenceIntegrityBlockedManagers.add(sessionManager);
                        else if (sessionManagerBeforeAppend)
                            persistenceIntegrityBlockedManagers.add(sessionManagerBeforeAppend);
                        warnPersistenceFailure(PERSISTENCE_AMBIGUOUS_BLOCKED_WARNING);
                        return false;
                    }
                    // Pi 0.80.6/0.80.7 update SessionManager's leaf before synchronous
                    // persistence and extension emission complete. Commit only when the
                    // exact in-memory entry is also the durable file tail.
                    observePersistenceAppendLeaf();
                    persistenceJournal.resolveAmbiguousAppend(record);
                    persistenceGrowth.recordAppended(compactPersistenceRecordPayloadBytes(record));
                    warnPersistenceFailure(PERSISTENCE_AMBIGUOUS_APPEND_WARNING);
                    continue;
                }
                observePersistenceAppendLeaf();
                persistenceJournal.commit(record);
                persistenceGrowth.recordAppended(compactPersistenceRecordPayloadBytes(record));
            }
        }
        return !persistenceJournal.hasPending();
    }
    function warnPersistenceFailure(message) {
        if (persistenceFailureWarnings.has(message))
            return;
        persistenceFailureWarnings.add(message);
        if (activeContext?.hasUI)
            activeContext.ui.notify(message, "warning");
        else
            console.error(message);
    }
    function attemptBoundedPersistenceFlush() {
        try {
            // Finite invariant: one retained suffix plus one batch derived from the
            // latest state. A persistent failure is attempted only once per flush.
            return appendPreparedPersistence(2);
        }
        catch {
            return false;
        }
    }
    function flushPendingPersistence() {
        if (!attemptBoundedPersistenceFlush())
            warnPersistenceFailure(PERSISTENCE_FLUSH_WARNING);
    }
    function attachTeamManagerListener(manager) {
        detachTeamManagerListener();
        resetUiTracking();
        const detachBeforePromptListener = manager.onBeforePrompt((state) => {
            teamState = state;
            const checkpointRecords = persistenceJournal.prepareDetachedWorkers(teamState, activeProjectConfig.config);
            if (!appendPreparedPersistence(1, checkpointRecords)) {
                warnPersistenceFailure(PERSISTENCE_LIVE_WARNING);
                throw new Error("Worker prompt was not sent because its durable persistence checkpoint could not be appended.");
            }
        });
        const lastPrunedUsageTotals = createZeroWorkerUsageAggregate();
        const detachStateListener = manager.onStateChange((state) => {
            teamState = state;
            // Persistence is best-effort at this callback boundary. Pi invokes state
            // listeners inside successful RPC lifecycle transitions, so append I/O
            // must never escape and relabel a settled worker as worker_error.
            if (!attemptBoundedPersistenceFlush())
                warnPersistenceFailure(PERSISTENCE_LIVE_WARNING);
            renderUi(activeContext, teamState, spinnerFrame, activeProjectConfig.config, isTeamActive(activeProjectConfig), teamManager.routingMode, activeProjectConfig.displayCost);
            if (hasAnimatedWorkers(teamState)) {
                ensureSpinnerRunning();
            }
            else {
                stopSpinner();
            }
            for (const worker of Object.values(state.activeWorkers)) {
                const previous = lastStatus.get(worker.workerId);
                const nowTerminal = isTerminalWorkerStatus(worker.status);
                const wasTerminal = previous ? isTerminalWorkerStatus(previous) : false;
                if (!previous && (worker.status === "starting" || worker.status === "running")) {
                    pendingStartedTransitions.push({
                        workerId: worker.workerId,
                        profileName: worker.profileName,
                    });
                    if (notificationTimer)
                        clearTimeout(notificationTimer);
                    notificationTimer = setTimeout(flushWorkerNotifications, 400);
                }
                if (previous !== worker.status && nowTerminal && !wasTerminal) {
                    pendingTerminalTransitions.push({
                        workerId: worker.workerId,
                        profileName: worker.profileName,
                        status: worker.status,
                    });
                    if (notificationTimer)
                        clearTimeout(notificationTimer);
                    notificationTimer = setTimeout(flushWorkerNotifications, 400);
                    const atpCtx = {
                        ...buildAtpContext(activeProjectConfig, activeContext, { taskId: worker.currentTask?.taskId, profileName: worker.profileName, goalId: worker.currentTask?.title, worktreePath: worker.worktreePath }),
                    };
                    void recordWorkerTerminal(worker.workerId, worker.status, worker.lastSummary?.headline ?? worker.currentTask?.title ?? "", buildAtpRecorderOptions(activeProjectConfig), atpCtx);
                    if (worker.finalAnswer?.trim()) {
                        void recordTerminalStageForProfile(worker.profileName, worker.finalAnswer.trim(), buildAtpRecorderOptions(activeProjectConfig), atpCtx);
                    }
                }
                lastStatus.set(worker.workerId, worker.status);
                const prevRelays = lastRelayCount.get(worker.workerId) ?? 0;
                const currRelays = worker.pendingRelayQuestions.length;
                if (currRelays > prevRelays && activeContext?.hasUI) {
                    const newest = worker.pendingRelayQuestions[worker.pendingRelayQuestions.length - 1];
                    const question = newest?.question?.trim();
                    if (question) {
                        activeContext.ui.notify(formatRelayToast(worker, question), "warning");
                    }
                }
                if (currRelays > prevRelays) {
                    const newest = worker.pendingRelayQuestions[worker.pendingRelayQuestions.length - 1];
                    if (newest?.question) {
                        void recordWorkerRelay(worker.workerId, newest.question, newest.assumption, buildAtpRecorderOptions(activeProjectConfig), {
                            ...buildAtpContext(activeProjectConfig, activeContext, { taskId: worker.currentTask?.taskId, profileName: worker.profileName, goalId: worker.currentTask?.title, relayUrgency: newest.urgency, worktreePath: worker.worktreePath }),
                        });
                    }
                }
                lastRelayCount.set(worker.workerId, currRelays);
            }
            const pruned = state.prunedWorkerUsageTotals;
            const changed = pruned.workers !== lastPrunedUsageTotals.workers
                || pruned.turns !== lastPrunedUsageTotals.turns
                || pruned.inputTokens !== lastPrunedUsageTotals.inputTokens
                || pruned.outputTokens !== lastPrunedUsageTotals.outputTokens
                || pruned.costUsd !== lastPrunedUsageTotals.costUsd;
            if (changed) {
                Object.assign(lastPrunedUsageTotals, pruned);
                void recordWorkerPrune(pruned.workers, pruned, buildAtpRecorderOptions(activeProjectConfig), buildAtpContext(activeProjectConfig, activeContext));
            }
        });
        const workerEvents = manager.workerManager;
        const detachWorkerEventListener = workerEvents?.onEvent((_worker, event) => {
            if (event.type === "thinking_clamped") {
                notifyThinkingClamp(event);
            }
        }) ?? (() => { });
        const detachVersionMismatchListener = workerEvents?.onPiVersionMismatch(notifyPiVersionMismatch) ?? (() => { });
        let detached = false;
        detachTeamManagerListener = (flushPersistence = true) => {
            if (detached)
                return;
            detached = true;
            // session_tree confirms Pi already changed leaves. The handler isolates
            // old pending data before replacement, and this old listener must not
            // derive or append another old-branch candidate at the new leaf.
            if (flushPersistence && !provisionalTreeNavigation?.confirmed)
                flushPendingPersistence();
            detachBeforePromptListener();
            detachStateListener();
            detachWorkerEventListener();
            detachVersionMismatchListener();
        };
    }
    async function replaceTeamManager(config) {
        detachTeamManagerListener();
        await teamManager.dispose();
        teamManager = new TeamManager({ config, routingMode: deriveInitialRoutingMode(activeProjectConfig), displayCost: activeProjectConfig.displayCost });
        attachTeamManagerListener(teamManager);
        teamState = createDefaultTeamState(config);
        renderUi(activeContext, teamState, spinnerFrame, config, isTeamActive(activeProjectConfig), teamManager.routingMode, activeProjectConfig.displayCost);
    }
    attachTeamManagerListener(teamManager);
    const commandDependencies = {
        get teamManager() {
            return teamManager;
        },
        emitText: (ctx, text) => emitCommandOutput(pi, ctx, text, activeProjectConfig.config),
        toggleInlineDashboard: (ctx, initialWorkerId) => {
            const wasActive = dashboardState.active;
            if (!wasActive) {
                dashboardState.setActive(true);
            }
            else if (!initialWorkerId) {
                dashboardState.setActive(false);
            }
            if (initialWorkerId)
                dashboardState.selectWorker(initialWorkerId);
            const widget = getOrCreateDashboardWidget(ctx);
            if (dashboardState.active) {
                widget.refresh();
                ensureDashboardInputListener(ctx);
            }
            else {
                widget.clear();
            }
        },
    };
    registerTeamCommand(pi, commandDependencies);
    registerCopyCommand(pi, commandDependencies);
    registerTeamInitCommand(pi, { emitText: commandDependencies.emitText });
    registerTeamEnableCommand(pi, {
        getTeamManager: () => teamManager,
        getProjectConfig: () => activeProjectConfig,
        emitText: commandDependencies.emitText,
        ensureNotReloading,
    });
    registerTeamResultCommand(pi, commandDependencies);
    registerTeamSteerCommand(pi, commandDependencies);
    registerTeamStopCommand(pi, commandDependencies);
    registerTeamEnvCommand(pi);
    function ensureNotReloading() {
        if (reloading) {
            throw new Error("Pi Agents Team is reloading its project config — retry in a moment.");
        }
    }
    pi.registerTool({
        name: "delegate_task",
        label: "Delegate Task",
        description: "Launch a background Pi RPC worker for a bounded delegated task and track it in the orchestrator state.",
        parameters: DelegateTaskSchema,
        prepareArguments: createNullableArgumentPreparer([
            "cwd",
            "contextHints",
            "expectedOutput",
            "pathScopeRoots",
            "pathScopeAllowWrite",
            "skills",
            "model",
            "reuseWorkerId",
        ]),
        constrainedSampling: PREFERRED_JSON_SCHEMA_SAMPLING,
        renderCall: renderAgentToolCallTitle("delegate_task"),
        async execute(_toolCallId, params, signal, _onUpdate, ctx) {
            ensureNotReloading();
            if (!activeProjectConfig.enabled) {
                throw new Error(getDisabledMessage(activeProjectConfig));
            }
            if (!activeProjectConfig.delegationEnabled) {
                throw new Error(getDelegationDisabledMessage(activeProjectConfig));
            }
            if (teamManager.routingMode === "solo") {
                throw new Error("Team routing off. Run /team-enable on to delegate.");
            }
            const pathScope = params.pathScopeRoots?.length
                ? {
                    roots: params.pathScopeRoots,
                    allowReadOutsideRoots: false,
                    allowWrite: params.pathScopeAllowWrite === true,
                }
                : undefined;
            const orchestratorModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
            const orchestratorThinkingLevel = getOrchestratorThinkingLevel(pi, ctx);
            const projectTrusted = getProjectTrustDecisionForContext(ctx);
            const result = await teamManager.delegateTask({
                title: params.title,
                goal: params.goal,
                profileName: params.profileName,
                cwd: params.cwd ?? ctx.cwd,
                contextHints: params.contextHints ?? undefined,
                expectedOutput: params.expectedOutput ?? undefined,
                pathScope,
                skills: params.skills ?? undefined,
                model: params.model ?? undefined,
                orchestratorModel,
                orchestratorThinkingLevel,
                projectTrusted,
                projectTrustRoot: projectTrusted === undefined ? undefined : activeProjectConfig.projectRoot ?? ctx.cwd,
                reuseWorkerId: params.reuseWorkerId ?? undefined,
            }, signal);
            recordAtpStage(activeProjectConfig, recordRouting, `Routed to ${params.profileName}: ${params.title}`, ctx, signal);
            teamState = teamManager.snapshot();
            renderUi(activeContext, teamState, spinnerFrame, activeProjectConfig.config, isTeamActive(activeProjectConfig), teamManager.routingMode, activeProjectConfig.displayCost);
            return {
                content: [
                    {
                        type: "text",
                        text: formatDelegateTaskResult({ ...result, reuseWorkerId: params.reuseWorkerId ?? undefined }),
                    },
                ],
                details: result,
            };
        },
    });
    pi.registerTool({
        name: "agent_status",
        label: "Agent Status",
        description: "Return compact status for one worker or all tracked workers. Done statuses are idle/completed/aborted/error/exited; starting/running/waiting_followup are not done. Each worker carries `reusable: true` when its RPC session is still alive (idle or waiting_followup) — pass that workerId as delegate_task.reuseWorkerId to skip spawning a fresh process. For the worker's actual output, call agent_result.",
        parameters: WorkerLookupSchema,
        prepareArguments: createNullableArgumentPreparer(["workerId"]),
        constrainedSampling: PREFERRED_JSON_SCHEMA_SAMPLING,
        renderCall: renderAgentToolCallTitle("agent_status"),
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const resolvedId = params.workerId ? teamManager.resolveWorkerId(params.workerId) ?? params.workerId : undefined;
            const workers = resolvedId
                ? [teamManager.getWorkerStatus(resolvedId)].filter((worker) => Boolean(worker))
                : teamManager.listWorkers();
            const decorated = workers.map((worker) => ({
                ...worker,
                reusable: worker.status === "idle" || worker.status === "waiting_followup",
            }));
            return {
                content: [{ type: "text", text: formatWorkers(workers) }],
                details: { workers: decorated },
            };
        },
    });
    pi.registerTool({
        name: "agent_result",
        label: "Agent Result",
        description: "Get a terminal worker's final deliverable as compact plain text: worker title, optional task/status/error/relay lines, scan-friendly summary sections when available, then Result: followed by the verbatim contents of the worker's <final_answer>…</final_answer> block. Results remain unavailable until agent settlement; wait_for_agents before retrying. Terminal error/aborted/exited workers remain readable. This is the authoritative answer — synthesize directly from it. If the final_answer block is missing after settlement, steer or re-delegate with a clearer final_answer instruction instead of reading files yourself.",
        parameters: WorkerIdSchema,
        constrainedSampling: PREFERRED_JSON_SCHEMA_SAMPLING,
        renderCall: renderAgentToolCallTitle("agent_result"),
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const workerId = teamManager.resolveWorkerId(params.workerId) ?? params.workerId;
            const result = teamManager.getWorkerResult(workerId);
            if (!result) {
                throw new Error(`Unknown worker: ${params.workerId}`);
            }
            if (!isTerminalWorkerStatus(result.worker.status)) {
                return {
                    content: [{ type: "text", text: formatAgentResultNotReady(result.worker) }],
                    details: {
                        workerId: result.worker.workerId,
                        status: result.worker.status,
                        ready: false,
                    },
                };
            }
            const compactResult = formatWorkerCompact(result.worker);
            const restoredResultNote = !result.worker.finalAnswer?.trim() && restoredWorkerIds.has(result.worker.workerId)
                ? "\n\nResult note: Full final answers are live-session-only and are unavailable after session restore; use the retained summary and usage above."
                : "";
            return {
                content: [{ type: "text", text: compactResult + restoredResultNote }],
                details: result,
            };
        },
    });
    pi.registerTool({
        name: "agent_message",
        label: "Agent Message",
        description: "Send a message to a tracked worker. Running workers receive it as a mid-stream steer (or a follow_up queued onto the live stream when delivery=follow_up). Idle/waiting_followup workers wake up and start a new turn with the message as the next user prompt; completed/aborted/error/exited workers cannot receive messages.",
        parameters: WorkerMessageSchema,
        prepareArguments: createNullableArgumentPreparer(["delivery"]),
        constrainedSampling: PREFERRED_JSON_SCHEMA_SAMPLING,
        renderCall: renderAgentToolCallTitle("agent_message"),
        async execute(_toolCallId, params) {
            ensureNotReloading();
            const delivery = params.delivery === "steer" || params.delivery === "follow_up" ? params.delivery : "auto";
            const workerId = teamManager.resolveWorkerId(params.workerId) ?? params.workerId;
            const result = await teamManager.messageWorker(workerId, params.message, delivery);
            return {
                content: [{ type: "text", text: formatAgentMessageResult(result) }],
                details: result,
            };
        },
    });
    pi.registerTool({
        name: "ping_agents",
        label: "Ping Agents",
        description: "Return passive or active status for tracked workers. Active mode refreshes attached live workers and returns registry snapshots for restored/disposed workers. Prefer wait_for_agents while waiting. Done statuses are idle/completed/aborted/error/exited; running means not done.",
        parameters: PingAgentsSchema,
        prepareArguments: createNullableArgumentPreparer(["workerIds", "mode"]),
        constrainedSampling: PREFERRED_JSON_SCHEMA_SAMPLING,
        renderCall: renderAgentToolCallTitle("ping_agents"),
        async execute(_toolCallId, params) {
            const mode = params.mode === "active" ? "active" : "passive";
            const resolvedIds = params.workerIds?.map((id) => teamManager.resolveWorkerId(id) ?? id);
            const results = await teamManager.pingWorkers({ workerIds: resolvedIds, mode });
            return {
                content: [{ type: "text", text: formatWorkers(results.map((result) => result.worker)) }],
                details: { mode, results },
            };
        },
    });
    pi.registerTool({
        name: "wait_for_agents",
        label: "Wait for Agents",
        description: "Block until every target worker reaches a terminal status (idle, completed, aborted, error, exited) or until a target raises a new relay question. Also honors a timeout. Returns reason=all_terminal, relay_raised (with newRelays listed), timeout, aborted, or wrapper-only no_workers when no targets are tracked. Prefer this over repeated ping_agents polling — it consumes no tokens while waiting. Use it after delegate_task; when it returns relay_raised, answer via agent_message and call wait_for_agents again to resume.",
        parameters: WaitForAgentsSchema,
        prepareArguments: createNullableArgumentPreparer(["workerIds", "timeoutMs", "wakeOnRelay"]),
        constrainedSampling: PREFERRED_JSON_SCHEMA_SAMPLING,
        renderCall: renderAgentToolCallTitle("wait_for_agents"),
        async execute(_toolCallId, params, signal) {
            ensureNotReloading();
            const targetIds = params.workerIds?.length
                ? params.workerIds.map((id) => teamManager.resolveWorkerId(id) ?? id)
                : teamManager.listWorkers().map((worker) => worker.workerId);
            if (targetIds.length === 0) {
                const details = { reason: "no_workers", workers: [] };
                return {
                    content: [{ type: "text", text: formatWaitForAgentsResult(details) }],
                    details,
                };
            }
            const result = await teamManager.waitForTerminal(targetIds, {
                timeoutMs: params.timeoutMs ?? 300_000,
                signal,
                wakeOnRelay: params.wakeOnRelay !== false,
            });
            const details = { reason: result.reason, workers: result.workers };
            if (result.newRelays)
                details.newRelays = result.newRelays;
            return {
                content: [{ type: "text", text: formatWaitForAgentsResult(details) }],
                details,
            };
        },
    });
    pi.registerTool({
        name: "agent_cancel",
        label: "Agent Cancel",
        description: "Abort and shut down a tracked worker.",
        parameters: WorkerIdSchema,
        constrainedSampling: PREFERRED_JSON_SCHEMA_SAMPLING,
        renderCall: renderAgentToolCallTitle("agent_cancel"),
        async execute(_toolCallId, params) {
            ensureNotReloading();
            const workerId = teamManager.resolveWorkerId(params.workerId) ?? params.workerId;
            const result = await teamManager.cancelWorker(workerId);
            return {
                content: [{ type: "text", text: `Cancelled ${formatWorkerLabel(result.worker)}.` }],
                details: result,
            };
        },
    });
    pi.on("session_start", async (event, ctx) => {
        stopTipRotation();
        activeContext = ctx;
        dashboardState.setActive(false);
        clearDashboardUi(ctx, activeProjectConfig.config);
        piVersionMismatchNotifier.reset();
        reloading = true;
        try {
            activeProjectConfig = loadActiveTeamConfig({
                cwd: ctx.cwd,
                baseConfig: DEFAULT_TEAM_CONFIG,
                projectConfigTrusted: isProjectConfigTrustedForContext(ctx),
            });
            updateDelegateTaskProfileDescription(activeProjectConfig.config);
            updateDelegateTaskModelDescription(ctx.scopedModels);
            await replaceTeamManager(activeProjectConfig.config);
            const { state, markedCount, persistenceMeasurement } = restoreLatestState(ctx, event.reason, activeProjectConfig.config);
            teamState = state;
            provisionalTreeNavigation = undefined;
            persistenceGrowth.replace(persistenceMeasurement, isPersistedSession(ctx));
            restoredWorkerIds.clear();
            for (const workerId of Object.keys(teamState.activeWorkers))
                restoredWorkerIds.add(workerId);
            persistenceJournal.reset(teamState, activeProjectConfig.config);
            teamManager.restore(teamState);
            registerTeamAutocomplete(ctx, {
                getWorkers: () => teamManager.listWorkers(),
                getProfiles: () => activeProjectConfig.config.profiles,
            });
            renderUi(ctx, teamState, spinnerFrame, activeProjectConfig.config, isTeamActive(activeProjectConfig), teamManager.routingMode, activeProjectConfig.displayCost);
            if (!ctx.hasUI)
                return;
            if (activeProjectConfig.enabled) {
                ctx.ui.notify("Team ready — orchestrator mode", "info");
            }
            const configNotice = getProjectConfigNotice(activeProjectConfig);
            if (configNotice) {
                ctx.ui.notify(configNotice.message, configNotice.level);
            }
            notifyActiveConfigFreshness(ctx, activeProjectConfig);
            notifyThinkingLevelWarnings(ctx, activeProjectConfig.thinkingLevelWarnings);
            if (activeProjectConfig.config.memory?.edenMemory?.enabled === true) {
                const edenOptions = buildEdenMemoryOptions(activeProjectConfig);
                if (edenOptions.enabled !== false) {
                    const missingEnv = getMissingRequiredEdenOptions(edenOptions);
                    if (missingEnv.length > 0) {
                        const wizardResult = await runEnvWizard(ctx, false);
                        const level = wizardResult.missingAfter.length > 0 ? "warning" : "info";
                        ctx.ui.notify(wizardResult.report.join("\n"), level);
                    }
                }
            }
            if (event.reason !== "startup" && markedCount > 0 && isTeamActive(activeProjectConfig)) {
                const noun = markedCount === 1 ? "worker" : "workers";
                ctx.ui.notify(`Workers exited — ${markedCount} ${noun} restored from ${event.reason}; relaunch if needed.`, "warning");
            }
            recordAtpStage(activeProjectConfig, recordGoalReceipt, `Session started (${event.reason})`, ctx);
        }
        finally {
            reloading = false;
        }
    });
    pi.on("session_before_tree", async (event, ctx) => {
        // Pi fires this before summary generation and before moving the leaf.
        // Persist detached representations of live workers on the origin branch,
        // but do not dispose or cancel their runtimes: cancellation/abort emits no
        // session_tree and those workers must remain usable.
        activeContext = ctx;
        const sessionManager = currentSessionManager();
        const leafId = currentLeafId();
        const originLeafId = leafId !== undefined ? leafId : event.preparation.oldLeafId;
        const originBranchEntryIds = new Set(Array.from(sessionManager?.getBranch?.() ?? [])
            .flatMap((entry) => typeof entry.id === "string" ? [entry.id] : []));
        const preexistingEntryIds = new Set(Array.from(sessionManager?.getEntries?.() ?? [])
            .flatMap((entry) => typeof entry.id === "string" ? [entry.id] : []));
        const navigation = {
            originLeafId,
            appendLeafId: originLeafId,
            confirmed: false,
            rootDispatchBlocked: false,
            originBranchEntryIds,
            preexistingEntryIds,
        };
        provisionalTreeNavigation = navigation;
        event.signal?.addEventListener("abort", () => {
            if (provisionalTreeNavigation === navigation && !navigation.confirmed) {
                navigation.rootDispatchBlocked = false;
            }
        }, { once: true });
        persistenceJournal.prepareDetachedWorkers(teamState, activeProjectConfig.config);
        attemptBoundedPersistenceFlush();
        navigation.rootDispatchBlocked = originLeafId === null;
    });
    pi.on("session_tree", async (event, ctx) => {
        activeContext = ctx;
        dashboardState.setActive(false);
        clearDashboardUi(ctx, activeProjectConfig.config);
        // This event is the first confirmation that Pi has moved the leaf. Isolate
        // the unresolved old suffix now—not during the provisional before hook.
        const hadUnresolvedOldRecords = persistenceJournal.hasPending();
        const provisional = provisionalTreeNavigation;
        provisionalTreeNavigation = {
            originLeafId: event.oldLeafId,
            appendLeafId: event.oldLeafId,
            confirmed: true,
            rootDispatchBlocked: false,
            originBranchEntryIds: provisional?.originBranchEntryIds ?? new Set(),
            preexistingEntryIds: provisional?.preexistingEntryIds ?? new Set(),
        };
        persistenceJournal.discardPending();
        if (hadUnresolvedOldRecords)
            warnPersistenceFailure(PERSISTENCE_TREE_DROP_WARNING);
        reloading = true;
        try {
            await replaceTeamManager(activeProjectConfig.config);
            const { state, persistenceMeasurement } = restoreLatestState(ctx, "reload", activeProjectConfig.config);
            teamState = state;
            persistenceGrowth.replace(persistenceMeasurement, isPersistedSession(ctx));
            restoredWorkerIds.clear();
            for (const workerId of Object.keys(teamState.activeWorkers))
                restoredWorkerIds.add(workerId);
            persistenceJournal.reset(teamState, activeProjectConfig.config);
            provisionalTreeNavigation = undefined;
            teamManager.restore(teamState);
            renderUi(ctx, teamState, spinnerFrame, activeProjectConfig.config, isTeamActive(activeProjectConfig), teamManager.routingMode, activeProjectConfig.displayCost);
        }
        finally {
            provisionalTreeNavigation = undefined;
            reloading = false;
        }
    });
    function releaseCancelledTreeNavigation() {
        if (provisionalTreeNavigation && !provisionalTreeNavigation.confirmed) {
            provisionalTreeNavigation = undefined;
        }
    }
    pi.on("agent_start", async (_event, ctx) => {
        activeContext = ctx;
        orchestratorWorking = true;
        releaseCancelledTreeNavigation();
        teamState = teamManager.snapshot();
        renderUi(ctx, teamState, spinnerFrame, activeProjectConfig.config, isTeamActive(activeProjectConfig), teamManager.routingMode, activeProjectConfig.displayCost);
    });
    pi.on("agent_end", async (_event, ctx) => {
        activeContext = ctx;
        teamState = teamManager.snapshot();
        renderUi(ctx, teamState, spinnerFrame, activeProjectConfig.config, isTeamActive(activeProjectConfig), teamManager.routingMode, activeProjectConfig.displayCost);
    });
    pi.on("agent_settled", async (_event, ctx) => {
        activeContext = ctx;
        orchestratorWorking = false;
        teamState = teamManager.snapshot();
        renderUi(ctx, teamState, spinnerFrame, activeProjectConfig.config, isTeamActive(activeProjectConfig), teamManager.routingMode, activeProjectConfig.displayCost);
    });
    pi.on("before_agent_start", async (event, ctx) => {
        activeContext = ctx;
        releaseCancelledTreeNavigation();
        orchestratorWorking = true;
        teamState = teamManager.snapshot();
        renderUi(ctx, teamState, spinnerFrame, activeProjectConfig.config, isTeamActive(activeProjectConfig), teamManager.routingMode, activeProjectConfig.displayCost);
        if (!activeProjectConfig.enabled) {
            return { systemPrompt: event.systemPrompt };
        }
        const projectConfigPromptNote = getProjectConfigPromptNote(activeProjectConfig);
        return {
            systemPrompt: [
                event.systemPrompt,
                buildOrchestratorPromptBundle(teamState, activeProjectConfig.config, teamManager.routingMode),
                projectConfigPromptNote,
            ].filter((item) => Boolean(item)).join("\n\n"),
        };
    });
    pi.on("session_shutdown", async (_event, ctx) => {
        stopSpinner();
        stopTipRotation();
        if (provisionalTreeNavigation && !provisionalTreeNavigation.confirmed)
            provisionalTreeNavigation = undefined;
        try {
            // Keep the listener attached: disposal may synchronously publish exited
            // terminal workers that must become compact persistence records.
            await teamManager.dispose();
        }
        finally {
            teamState = teamManager.snapshot();
            flushPendingPersistence();
            detachTeamManagerListener(false);
            clearUi(ctx, activeProjectConfig.config);
            orchestratorWorking = false;
            recordAtpStage(activeProjectConfig, recordHandOffOrClosure, `Session shutting down`, ctx);
            activeContext = undefined;
        }
    });
}
