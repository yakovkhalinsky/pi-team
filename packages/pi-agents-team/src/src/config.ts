import { Type } from "typebox";
import { compareWorkerIds, PING_MODES, RELAY_URGENCIES, TEAM_SCAFFOLD_VERSION, TEAM_PROFILE_NAMES, TEAM_PROJECT_SCHEMA_VERSION, TEAM_PROMPT_SOURCES, TEAM_SESSION_MODES, TEAM_STATE_VERSION, TEAM_TASK_STATUSES, THINKING_LEVELS, WORKER_EXTENSION_MODES, WORKER_STATUSES, WORKER_WRITE_POLICIES, } from "./types.js";
import { createZeroWorkerUsageAggregate, normalizeWorkerUsageAggregate } from "./usage.js";
// Re-export so consumers (/team-init, loader) can import from config.ts alongside DEFAULT_TEAM_CONFIG.
export { TEAM_SCAFFOLD_VERSION };
export const CURRENT_SCAFFOLD_VERSION = TEAM_SCAFFOLD_VERSION;
function enumSchema(values) {
    return Type.Union(values.map((value) => Type.Literal(value)));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export const TeamPathScopeSchema = Type.Object({
    roots: Type.Array(Type.String()),
    allowReadOutsideRoots: Type.Boolean({ default: false }),
    allowWrite: Type.Boolean({ default: false }),
});
export const TeamProfileSpecSchema = Type.Object({
    name: Type.String(),
    description: Type.String(),
    model: Type.Optional(Type.String()),
    thinkingLevel: Type.Optional(enumSchema(THINKING_LEVELS)),
    tools: Type.Array(Type.String()),
    extensions: Type.Optional(Type.Array(Type.String())),
    promptPath: Type.String(),
    promptInline: Type.Optional(Type.String()),
    extensionMode: enumSchema(WORKER_EXTENSION_MODES),
    writePolicy: enumSchema(WORKER_WRITE_POLICIES),
    pathScope: Type.Optional(TeamPathScopeSchema),
    canSpawnWorkers: Type.Boolean({ default: false }),
});
const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);
export const ProjectRolePromptSchema = Type.Object({
    source: enumSchema(TEAM_PROMPT_SOURCES),
    path: Type.Optional(NullableStringSchema),
}, { additionalProperties: false });
export const ProjectRoleAccessSchema = Type.Object({
    tools: Type.Optional(Type.Array(Type.String())),
    extensions: Type.Optional(Type.Array(Type.String())),
    write: Type.Optional(Type.Boolean()),
    extensionMode: Type.Optional(enumSchema(WORKER_EXTENSION_MODES)),
    canSpawnWorkers: Type.Optional(Type.Boolean()),
    pathScope: Type.Optional(TeamPathScopeSchema),
}, { additionalProperties: false });
export const TeamProjectWorkerAccessSchema = Type.Object({
    allowPathsOutsideProject: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
export const TeamProjectDisplaySchema = Type.Object({
    cost: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
const FlatPromptValueSchema = Type.Union([Type.String(), Type.Null(), ProjectRolePromptSchema]);
/**
 * Schema v4 role shape. Role selection fields stay at the top level, while
 * worker capabilities and path controls live under `access`.
 * Normalization into the internal ProjectRoleConfig happens in the loader.
 */
export const ProjectRoleConfigSchema = Type.Object({
    whenToUse: Type.Optional(NullableStringSchema),
    model: Type.Optional(NullableStringSchema),
    thinkingLevel: Type.Optional(enumSchema(THINKING_LEVELS)),
    access: Type.Optional(ProjectRoleAccessSchema),
    prompt: Type.Optional(FlatPromptValueSchema),
}, { additionalProperties: false });
export const EdenMemoryConfigSchema = Type.Object({
    enabled: Type.Boolean({ default: false }),
    bin: Type.Optional(Type.String()),
    db: Type.Optional(Type.String()),
    workspaceId: Type.Optional(Type.String()),
    userId: Type.Optional(Type.String()),
    agentId: Type.Optional(Type.String()),
    semanticSearch: Type.Boolean({ default: false }),
    llmApiKey: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    llmBaseUrl: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    logLevel: Type.Optional(Type.String()),
}, { additionalProperties: false });

export const TeamMemoryConfigSchema = Type.Object({
    edenMemory: Type.Optional(EdenMemoryConfigSchema),
}, { additionalProperties: false });

/**
 * Role keys are free-form — users own the role map. `schemaVersion` is
 * validated at parse time as a number (not a literal) so older files still
 * pass the first parse gate; the loader inspects the value afterwards and
 * emits a warning + built-in fallback when it doesn't match
 * TEAM_PROJECT_SCHEMA_VERSIONS_SUPPORTED.
 *
 * `version` (legacy top-level field from the pre-rename era) is accepted as
 * an optional additional property so that files scaffolded with the old name
 * don't fail parse — they get the schema_version_mismatch warning like any
 * other unsupported file.
 */
export const TeamProjectConfigSchema = Type.Object({
    schemaVersion: Type.Optional(Type.Number()),
    version: Type.Optional(Type.Number()),
    scaffoldVersion: Type.Optional(Type.Number()),
    defaultsVersion: Type.Optional(Type.Number()),
    enabled: Type.Optional(Type.Boolean()),
    routingMode: Type.Optional(Type.Union([Type.Literal("team"), Type.Literal("solo")])),
    workerAccess: Type.Optional(TeamProjectWorkerAccessSchema),
    display: Type.Optional(TeamProjectDisplaySchema),
    memory: Type.Optional(TeamMemoryConfigSchema),
    roles: Type.Optional(Type.Record(Type.String(), ProjectRoleConfigSchema)),
}, { additionalProperties: false });
export const WorkerUsageStatsSchema = Type.Object({
    turns: Type.Number({ default: 0 }),
    inputTokens: Type.Number({ default: 0 }),
    outputTokens: Type.Number({ default: 0 }),
    cacheReadTokens: Type.Number({ default: 0 }),
    cacheWriteTokens: Type.Number({ default: 0 }),
    costUsd: Type.Number({ default: 0 }),
    contextTokens: Type.Optional(Type.Number()),
    contextWindow: Type.Optional(Type.Number()),
    contextPercent: Type.Optional(Type.Number()),
    contextRemainingTokens: Type.Optional(Type.Number()),
});
export const WorkerUsageAggregateSchema = Type.Object({
    workers: Type.Number({ default: 0 }),
    turns: Type.Number({ default: 0 }),
    inputTokens: Type.Number({ default: 0 }),
    outputTokens: Type.Number({ default: 0 }),
    cacheReadTokens: Type.Number({ default: 0 }),
    cacheWriteTokens: Type.Number({ default: 0 }),
    costUsd: Type.Number({ default: 0 }),
    contextTokens: Type.Number({ default: 0 }),
});
export const RelayQuestionSchema = Type.Object({
    relayId: Type.String(),
    workerId: Type.String(),
    taskId: Type.String(),
    question: Type.String(),
    assumption: Type.String(),
    urgency: enumSchema(RELAY_URGENCIES),
    choices: Type.Optional(Type.Array(Type.String())),
    createdAt: Type.Number(),
    resolvedAt: Type.Optional(Type.Number()),
    resolution: Type.Optional(Type.String()),
});
export const WorkerSummarySchema = Type.Object({
    workerId: Type.String(),
    taskId: Type.String(),
    headline: Type.String(),
    status: enumSchema(WORKER_STATUSES),
    currentToolName: Type.Optional(Type.String()),
    readFiles: Type.Array(Type.String()),
    changedFiles: Type.Array(Type.String()),
    risks: Type.Array(Type.String()),
    nextRecommendation: Type.Optional(Type.String()),
    relayQuestionCount: Type.Number({ default: 0 }),
    updatedAt: Type.Number(),
});
export const DelegatedTaskInputSchema = Type.Object({
    taskId: Type.String(),
    title: Type.String(),
    goal: Type.String(),
    requestedBy: enumSchema(["user", "orchestrator", "operator"]),
    profileName: Type.String(),
    cwd: Type.String(),
    contextHints: Type.Array(Type.String()),
    expectedOutput: Type.Optional(Type.String()),
    pathScope: Type.Optional(TeamPathScopeSchema),
    orchestratorThinkingLevel: Type.Optional(enumSchema(THINKING_LEVELS)),
    createdAt: Type.Number(),
});
export const WorkerRuntimeStateSchema = Type.Object({
    workerId: Type.String(),
    profileName: Type.String(),
    sessionMode: enumSchema(TEAM_SESSION_MODES),
    status: enumSchema(WORKER_STATUSES),
    requestedThinkingLevel: enumSchema(THINKING_LEVELS),
    effectiveThinkingLevel: enumSchema(THINKING_LEVELS),
    processId: Type.Optional(Type.Number()),
    startedAt: Type.Number(),
    lastEventAt: Type.Number(),
    lastToolName: Type.Optional(Type.String()),
    currentTask: Type.Optional(DelegatedTaskInputSchema),
    lastSummary: Type.Optional(WorkerSummarySchema),
    finalAnswer: Type.Optional(Type.String()),
    pendingRelayQuestions: Type.Array(RelayQuestionSchema),
    usage: WorkerUsageStatsSchema,
    error: Type.Optional(Type.String()),
});
export const TeamUiStateSchema = Type.Object({
    statusKey: Type.String(),
    widgetKey: Type.String(),
    lastRenderAt: Type.Number(),
});
export const TeamConfigSchema = Type.Object({
    version: Type.Literal(TEAM_STATE_VERSION),
    sessionMode: enumSchema(TEAM_SESSION_MODES),
    orchestration: Type.Object({
        packageName: Type.String(),
        extensionName: Type.String(),
        systemPromptTitle: Type.String(),
        systemPromptNotes: Type.Array(Type.String()),
    }),
    rpc: Type.Object({
        command: Type.String(),
        args: Type.Array(Type.String()),
        mode: Type.Literal("rpc"),
        noSession: Type.Boolean({ default: true }),
        transport: Type.Literal("jsonl-lf"),
    }),
    summaries: Type.Object({
        maxHeadlineLength: Type.Number({ minimum: 1 }),
        maxItemsPerWorker: Type.Number({ minimum: 1 }),
        maxChangedFiles: Type.Number({ minimum: 1 }),
        maxRelayQuestions: Type.Number({ minimum: 1 }),
    }),
    ui: Type.Object({
        statusKey: Type.String(),
        widgetKey: Type.String(),
        titleTemplate: Type.String(),
        maxVisibleWorkers: Type.Number({ minimum: 1 }),
        showProfileNames: Type.Boolean({ default: true }),
    }),
    safety: Type.Object({
        preventRecursiveOrchestrator: Type.Boolean({ default: true }),
        defaultWorkerExtensionMode: enumSchema(WORKER_EXTENSION_MODES),
        requirePathScopeForWrites: Type.Boolean({ default: true }),
        allowWorkerPathsOutsideProject: Type.Boolean({ default: true }),
        allowProjectProfiles: Type.Boolean({ default: false }),
        projectRoot: Type.Optional(Type.String()),
    }),
    persistence: Type.Object({
        stateCustomType: Type.String(),
        statusMessageType: Type.String(),
        storeTranscripts: Type.Boolean({ default: false }),
    }),
    memory: Type.Optional(TeamMemoryConfigSchema),
    profiles: Type.Array(TeamProfileSpecSchema),
});
export const PersistedTeamStateSchema = Type.Object({
    version: Type.Literal(TEAM_STATE_VERSION),
    sessionMode: enumSchema(TEAM_SESSION_MODES),
    activeWorkers: Type.Record(Type.String(), WorkerRuntimeStateSchema),
    prunedWorkerUsageTotals: WorkerUsageAggregateSchema,
    taskRegistry: Type.Record(Type.String(), DelegatedTaskInputSchema),
    relayQueue: Type.Array(RelayQuestionSchema),
    ui: TeamUiStateSchema,
    updatedAt: Type.Number(),
});
export const DEFAULT_TEAM_CONFIG = {
    version: TEAM_STATE_VERSION,
    sessionMode: "orchestrator",
    orchestration: {
        packageName: "Pi Agents Team",
        extensionName: "pi-agent-team",
        systemPromptTitle: "Pi Agents Team Orchestrator Mode",
        systemPromptNotes: [
            "The visible Pi session is the orchestrator and owns all user-facing dialogue; workers are subordinate RPC peers that report compact summaries.",
            "Answer directly only for trivial, already-known, or tiny bounded asks; delegate investigation, review, mapping, and multi-file work.",
            "When the user asks for N workers or parallel analysis, spawn them immediately in one batch — do not pre-explore the repo yourself first.",
            "After delegate_task, call wait_for_agents until workers finish; do not poll with ping_agents or sleep in bash.",
            "Worker completion toasts (✓ ...) are UI-only; ignore them and do not re-call agent_result after you already have the summary.",
            "agent_result is authoritative: synthesize from its <final_answer>; if empty, re-delegate smaller slices or steer the worker, not your own tools.",
            "Before non-trivial reuse, inspect worker usage: reuse normally below 50%, cautiously from 50-70%, prefer fresh above 70%, and spawn fresh at/above 80% context or at/below 32768 remaining tokens.",
            "Delegate explicitly, safely, and scoped to profile names plus path ownership.",
        ],
    },
    rpc: {
        command: "pi",
        args: ["--mode", "rpc", "--no-session"],
        mode: "rpc",
        noSession: true,
        transport: "jsonl-lf",
    },
    summaries: {
        maxHeadlineLength: 160,
        maxItemsPerWorker: 3,
        maxChangedFiles: 8,
        maxRelayQuestions: 3,
    },
    ui: {
        statusKey: "pi-agent-team",
        widgetKey: "pi-agent-team",
        titleTemplate: "pi - Pi Agents Team ({mode})",
        maxVisibleWorkers: 4,
        showProfileNames: true,
    },
    safety: {
        preventRecursiveOrchestrator: true,
        defaultWorkerExtensionMode: "worker-minimal",
        requirePathScopeForWrites: true,
        allowWorkerPathsOutsideProject: true,
        allowProjectProfiles: false,
    },
    persistence: {
        stateCustomType: "pi-agent-team/state",
        statusMessageType: "pi-agent-team/status",
        storeTranscripts: false,
    },
    memory: {
        edenMemory: {
            enabled: true,
            semanticSearch: false,
        },
    },
    profiles: [
        {
            name: TEAM_PROFILE_NAMES[0],
            description: "Route and assign work. I classify the goal, set priority, record ownership and confidence, and name the next role. No goal skips dispatch.",
            thinkingLevel: "high",
            tools: ["read", "grep", "find", "ls", "bash"],
            promptPath: "prompts/agents/dispatcher.md",
            extensionMode: "worker-minimal",
            writePolicy: "read-only",
            canSpawnWorkers: false,
        },
        {
            name: TEAM_PROFILE_NAMES[1],
            description: "Produce durable artefacts. I write code, documents, schemas, and configurations, then self-validate before handing off to the Verifier.",
            thinkingLevel: "medium",
            tools: ["read", "bash", "edit", "write"],
            promptPath: "prompts/agents/builder.md",
            extensionMode: "worker-minimal",
            writePolicy: "scoped-write",
            canSpawnWorkers: false,
        },
        {
            name: TEAM_PROFILE_NAMES[2],
            description: "Operate live systems. I deploy, migrate, scale, restart, and configure, and I keep a tested rollback plan inside the safe tier.",
            thinkingLevel: "high",
            tools: ["read", "bash", "edit", "write"],
            promptPath: "prompts/agents/runtime.md",
            extensionMode: "worker-minimal",
            writePolicy: "scoped-write",
            canSpawnWorkers: false,
        },
        {
            name: TEAM_PROFILE_NAMES[3],
            description: "Independent validation gate. I define the green gate, re-run evidence where possible, and post a verdict before integration or deployment.",
            thinkingLevel: "high",
            tools: ["read", "grep", "find", "ls", "bash"],
            promptPath: "prompts/agents/verifier.md",
            extensionMode: "worker-minimal",
            writePolicy: "read-only",
            canSpawnWorkers: false,
        },
        {
            name: TEAM_PROFILE_NAMES[4],
            description: "Reduce uncertainty. I gather context, surface alternatives with trade-offs, and land findings the team can act on.",
            thinkingLevel: "medium",
            tools: ["read", "grep", "find", "ls", "bash"],
            promptPath: "prompts/agents/researcher.md",
            extensionMode: "worker-minimal",
            writePolicy: "read-only",
            canSpawnWorkers: false,
        },
        {
            name: TEAM_PROFILE_NAMES[5],
            description: "Maintain the durable record. I append, index, and surface recurring lessons so the team can retrieve context and turn it into skills.",
            thinkingLevel: "medium",
            tools: ["read", "grep", "find", "ls", "bash"],
            promptPath: "prompts/agents/archivist.md",
            extensionMode: "worker-minimal",
            writePolicy: "read-only",
            canSpawnWorkers: false,
        },
    ],
};
export function createDefaultTeamState(config = DEFAULT_TEAM_CONFIG, now = Date.now()) {
    return {
        version: TEAM_STATE_VERSION,
        sessionMode: config.sessionMode,
        activeWorkers: {},
        prunedWorkerUsageTotals: createZeroWorkerUsageAggregate(),
        taskRegistry: {},
        relayQueue: [],
        ui: {
            statusKey: config.ui.statusKey,
            widgetKey: config.ui.widgetKey,
            lastRenderAt: now,
        },
        updatedAt: now,
    };
}
export function normalizePersistedTeamState(raw, config = DEFAULT_TEAM_CONFIG) {
    const base = createDefaultTeamState(config);
    if (!isRecord(raw))
        return base;
    const activeWorkers = isRecord(raw.activeWorkers)
        ? raw.activeWorkers
        : base.activeWorkers;
    const taskRegistry = isRecord(raw.taskRegistry) ? raw.taskRegistry : base.taskRegistry;
    const relayQueue = Array.isArray(raw.relayQueue) ? raw.relayQueue : base.relayQueue;
    const rawUi = isRecord(raw.ui) ? raw.ui : {};
    const prunedWorkerUsageTotals = normalizeWorkerUsageAggregate(raw.prunedWorkerUsageTotals);
    return {
        ...base,
        sessionMode: raw.sessionMode === "worker" ? "worker" : base.sessionMode,
        activeWorkers,
        prunedWorkerUsageTotals,
        taskRegistry,
        relayQueue,
        ui: {
            ...base.ui,
            statusKey: typeof rawUi.statusKey === "string" ? rawUi.statusKey : base.ui.statusKey,
            widgetKey: typeof rawUi.widgetKey === "string" ? rawUi.widgetKey : base.ui.widgetKey,
            lastRenderAt: typeof rawUi.lastRenderAt === "number" ? rawUi.lastRenderAt : base.ui.lastRenderAt,
        },
        updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : base.updatedAt,
    };
}
export function buildOrchestratorSystemPrompt(state, config = DEFAULT_TEAM_CONFIG) {
    const profileList = config.profiles.map((profile) => profile.name).join(", ");
    const activeWorkerCount = Object.keys(state.activeWorkers).length;
    const relayCount = state.relayQueue.length;
    return [
        `# ${config.orchestration.systemPromptTitle}`,
        "",
        ...config.orchestration.systemPromptNotes.map((note) => `- ${note}`),
        "- If worker-control tools are not available yet, do not pretend background workers ran; work directly and explain the scaffold status when relevant.",
        "- When delegation becomes available, prefer bounded tasks with explicit profile choice, cwd, output contract, and compact summaries.",
        `- Available profile names: ${profileList}.`,
        `- Active worker count in this session snapshot: ${activeWorkerCount}.`,
        `- Pending relay questions in this session snapshot: ${relayCount}.`,
        `- Worker transport contract: ${config.rpc.transport} via ${[config.rpc.command, ...config.rpc.args].join(" ")}.`,
        `- Safety defaults: recursion prevention=${String(config.safety.preventRecursiveOrchestrator)}, require path scope for writes=${String(config.safety.requirePathScopeForWrites)}, allow worker paths outside project=${String(config.safety.allowWorkerPathsOutsideProject)}.`,
    ].join("\n");
}
export const FOUNDATION_STATUS = {
    implementedTaskStatuses: TEAM_TASK_STATUSES,
    implementedWorkerStatuses: WORKER_STATUSES,
    implementedPingModes: PING_MODES,
};
