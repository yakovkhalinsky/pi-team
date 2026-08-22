export declare const TEAM_STATE_VERSION: 1;
export declare const TEAM_PERSISTENCE_VERSION: 2;
export declare const TEAM_SESSION_MODES: readonly ["orchestrator", "worker"];
export type TeamSessionMode = (typeof TEAM_SESSION_MODES)[number];
/**
 * Names the plugin ships packaged `prompts/agents/<name>.md` prompts for.
 * In schema v4, these are NOT a ceiling — users may rename, drop, or add roles
 * freely. This list is only used for two things:
 *   1. The default `/team-init` scaffold seeds these role keys so first-time
 *      operators see a sensible starting point.
 *   2. When `role.prompt === "default"`, the loader looks for a packaged prompt
 *      at `prompts/agents/<roleName>.md`. Matching names get the packaged file;
 *      custom names get the generic worker template.
 */
export declare const TEAM_PROFILE_NAMES: readonly ["dispatcher", "builder", "runtime", "verifier", "researcher", "archivist"];
export type TeamProfileName = (typeof TEAM_PROFILE_NAMES)[number];
export declare function isPackagedProfileName(name: string): name is TeamProfileName;
export declare const THINKING_LEVELS: readonly ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
export declare const WORKER_EXTENSION_MODES: readonly ["inherit", "disable", "worker-minimal"];
export type WorkerExtensionMode = (typeof WORKER_EXTENSION_MODES)[number];
export declare const WORKER_PROJECT_TRUST_OVERRIDES: readonly ["approve", "no-approve"];
export type WorkerProjectTrustOverride = (typeof WORKER_PROJECT_TRUST_OVERRIDES)[number];
export declare const WORKER_WRITE_POLICIES: readonly ["read-only", "scoped-write"];
export type WorkerWritePolicy = (typeof WORKER_WRITE_POLICIES)[number];
import { TEAM_PROJECT_SCHEMA_VERSION, TEAM_PROJECT_SCHEMA_VERSIONS_SUPPORTED, TEAM_SCAFFOLD_VERSION } from "./project-config/versions.js";
export { TEAM_PROJECT_SCHEMA_VERSION, TEAM_PROJECT_SCHEMA_VERSIONS_SUPPORTED, TEAM_SCAFFOLD_VERSION };
export declare const DEFAULT_MODEL_SENTINEL: "default";
export declare const DEFAULT_PROMPT_SENTINEL: "default";
export declare const TEAM_PROJECT_CONFIG_FILE = "agents-team.json";
export declare const TEAM_PROJECT_CONFIG_DIR = ".pi/agent";
export declare const TEAM_PROJECT_CONFIG_RELATIVE_PATH = ".pi/agent/agents-team.json";
export declare const TEAM_CONFIG_SCOPES: readonly ["global", "project"];
export type TeamConfigScope = (typeof TEAM_CONFIG_SCOPES)[number];
export declare const TEAM_ENABLED_SOURCES: readonly ["default", "global", "project"];
export type TeamEnabledSource = (typeof TEAM_ENABLED_SOURCES)[number];
export declare const TEAM_PROMPT_SOURCES: readonly ["builtin", "project"];
export type TeamPromptSource = (typeof TEAM_PROMPT_SOURCES)[number];
export declare const PROJECT_CONFIG_STATUSES: readonly ["builtin", "project", "invalid"];
export type ProjectConfigStatus = (typeof PROJECT_CONFIG_STATUSES)[number];
export declare const PROJECT_CONFIG_DIAGNOSTIC_SEVERITIES: readonly ["info", "warning", "error"];
export type ProjectConfigDiagnosticSeverity = (typeof PROJECT_CONFIG_DIAGNOSTIC_SEVERITIES)[number];
export declare const WORKER_STATUSES: readonly ["created", "starting", "idle", "running", "waiting_followup", "completed", "aborted", "error", "exited"];
export type WorkerStatus = (typeof WORKER_STATUSES)[number];
export declare const PERSISTED_TERMINAL_WORKER_STATUSES: readonly ["idle", "completed", "aborted", "error", "exited"];
export type PersistedTerminalWorkerStatus = (typeof PERSISTED_TERMINAL_WORKER_STATUSES)[number];
export declare function compareWorkerIds(a: string, b: string): number;
export declare const TEAM_TASK_STATUSES: readonly ["queued", "running", "waiting_followup", "completed", "blocked", "failed", "cancelled"];
export type TeamTaskStatus = (typeof TEAM_TASK_STATUSES)[number];
export declare const RELAY_URGENCIES: readonly ["low", "medium", "high"];
export type RelayUrgency = (typeof RELAY_URGENCIES)[number];
export declare const PING_MODES: readonly ["passive", "active"];
export type PingMode = (typeof PING_MODES)[number];
export interface TeamPathScope {
    roots: string[];
    allowReadOutsideRoots: boolean;
    allowWrite: boolean;
}
export interface TeamProfileSpec {
    name: TeamProfileName | string;
    description: string;
    model?: string;
    thinkingLevel?: ThinkingLevel;
    tools: string[];
    extensions?: string[];
    /**
     * Path to the worker prompt markdown. May be the literal string
     * "<generic-worker>" — a sentinel that tells the prompt loader to use the
     * packaged generic-worker template with the role's name+description
     * substituted in. Ignored when `promptInline` is set.
     */
    promptPath: string;
    /**
     * Inline prompt text, used when the user sets `"prompt": "<prose>"` in
     * agents-team.json for strings that don't resolve to a readable file.
     * Overrides `promptPath` when present.
     */
    promptInline?: string;
    extensionMode: WorkerExtensionMode;
    writePolicy: WorkerWritePolicy;
    pathScope?: TeamPathScope;
    canSpawnWorkers: boolean;
}
export interface ProjectRolePermissions {
    tools?: string[] | null;
    extensions?: string[] | null;
    extensionMode?: WorkerExtensionMode;
    writePolicy?: WorkerWritePolicy;
    pathScope?: TeamPathScope;
    canSpawnWorkers?: boolean;
}
export interface ProjectRolePromptConfig {
    source: TeamPromptSource;
    path?: string | null;
}
export interface ProjectRoleConfig {
    description?: string | null;
    model?: string | null;
    thinkingLevel?: ThinkingLevel;
    permissions: ProjectRolePermissions;
    prompt: ProjectRolePromptConfig;
}
export interface ProjectRoleAccessConfig {
    tools?: string[];
    extensions?: string[];
    write?: boolean;
    extensionMode?: WorkerExtensionMode;
    canSpawnWorkers?: boolean;
    pathScope?: TeamPathScope;
}
/**
 * Shape emitted by /team-init (schemaVersion 4+). Role identity and model
 * selection stay at the top level; capability and path controls live under
 * `access` so operators can find the worker permission surface in one place.
 *
 * `whenToUse` is the canonical field for telling the orchestrator when to
 * delegate to this role — write it as a trigger sentence ("Use when..."),
 * not a passive description of capability.
 */
export interface ProjectRoleFlatConfig {
    whenToUse?: string | null;
    model?: string | null;
    thinkingLevel?: ThinkingLevel;
    access?: ProjectRoleAccessConfig;
    prompt?: string | null | ProjectRolePromptConfig;
}
export type RawProjectRoleConfig = ProjectRoleConfig | ProjectRoleFlatConfig;
export type ProjectRoleConfigMap = Record<string, ProjectRoleConfig>;
export type PartialProjectRoleConfigMap = Record<string, ProjectRoleConfig>;
export type PartialRawProjectRoleConfigMap = Record<string, RawProjectRoleConfig>;
export interface TeamProjectWorkerAccessConfig {
    allowPathsOutsideProject?: boolean;
}
export interface TeamProjectDisplayConfig {
    cost?: boolean;
}
export interface TeamProjectConfigFile {
    schemaVersion: typeof TEAM_PROJECT_SCHEMA_VERSION;
    scaffoldVersion?: number;
    enabled?: boolean;
    routingMode?: "team" | "solo";
    workerAccess?: TeamProjectWorkerAccessConfig;
    display?: TeamProjectDisplayConfig;
    roles?: PartialRawProjectRoleConfigMap;
}
export interface TeamProjectConfigLayer {
    scope: TeamConfigScope;
    path: string;
    enabled?: boolean;
    scaffoldVersion?: number;
    scaffoldStale?: boolean;
    /** True when the file's `schemaVersion` is outside TEAM_PROJECT_SCHEMA_VERSIONS_SUPPORTED. */
    schemaMismatch?: boolean;
    /** The raw `schemaVersion` value found in the file, for toast messaging. */
    rawSchemaVersion?: number;
}
export type ActiveTeamConfigFreshness = {
    kind: "layer";
    scope: TeamConfigScope;
    path: string;
    parseStatus: "valid" | "schema-mismatch" | "fatal";
    scaffoldVersion?: number;
    scaffoldVersionMissing: boolean;
    scaffoldStale: boolean;
    rawSchemaVersion?: number;
} | {
    kind: "none";
    parseStatus: "none";
    scaffoldVersionMissing: false;
    scaffoldStale: false;
};
export interface ProjectConfigDiagnostic {
    severity: ProjectConfigDiagnosticSeverity;
    code: string;
    message: string;
    fieldPath?: string;
}
export interface ThinkingLevelConfigWarning {
    scope: TeamConfigScope;
    profileName: string;
    badValue: unknown;
}
export interface LoadedTeamProjectConfig {
    status: ProjectConfigStatus;
    config: TeamConfig;
    sourcePath?: string;
    projectRoot?: string;
    layers: TeamProjectConfigLayer[];
    /** The layer whose scaffold freshness should be evaluated for boot warnings. */
    activeConfigFreshness: ActiveTeamConfigFreshness;
    enabled: boolean;
    enabledSource: TeamEnabledSource;
    diagnostics: ProjectConfigDiagnostic[];
    thinkingLevelWarnings?: ThinkingLevelConfigWarning[];
    delegationEnabled: boolean;
    persistedRoutingMode?: "team" | "solo";
    /** Whether to show cost in the UI. Defaults to true when absent. Read via `config.display?.cost ?? true`. */
    displayCost: boolean;
}
export interface DelegatedTaskInput {
    taskId: string;
    title: string;
    goal: string;
    requestedBy: "user" | "orchestrator" | "operator";
    profileName: string;
    cwd: string;
    contextHints: string[];
    expectedOutput?: string;
    pathScope?: TeamPathScope;
    skills?: string[];
    orchestratorThinkingLevel?: ThinkingLevel;
    createdAt: number;
}
export interface WorkerUsageStats {
    turns: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costUsd: number;
    contextTokens?: number;
    contextWindow?: number;
    contextPercent?: number;
    contextRemainingTokens?: number;
}
export interface WorkerUsageAggregate {
    workers: number;
    turns: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costUsd: number;
    contextTokens: number;
}
export interface RelayQuestion {
    relayId: string;
    workerId: string;
    taskId: string;
    question: string;
    assumption: string;
    urgency: RelayUrgency;
    choices?: string[];
    createdAt: number;
    resolvedAt?: number;
    resolution?: string;
}
export interface WorkerSummary {
    workerId: string;
    taskId: string;
    headline: string;
    status: WorkerStatus;
    currentToolName?: string;
    readFiles: string[];
    changedFiles: string[];
    risks: string[];
    nextRecommendation?: string;
    relayQuestionCount: number;
    updatedAt: number;
}
export interface WorkerRuntimeState {
    workerId: string;
    profileName: string;
    sessionMode: TeamSessionMode;
    status: WorkerStatus;
    requestedThinkingLevel: ThinkingLevel;
    effectiveThinkingLevel: ThinkingLevel;
    processId?: number;
    startedAt: number;
    lastEventAt: number;
    lastToolName?: string;
    currentTask?: DelegatedTaskInput;
    lastSummary?: WorkerSummary;
    finalAnswer?: string;
    pendingRelayQuestions: RelayQuestion[];
    usage: WorkerUsageStats;
    error?: string;
    worktreePath?: string;
}
export interface TeamWorktreeConfig {
    enabled: boolean;
    basePath: string;
    cleanupOnTerminal: boolean;
    cleanupOnPrune: boolean;
}
export interface TeamUiState {
    statusKey: string;
    widgetKey: string;
    lastRenderAt: number;
}
export interface TeamConfig {
    version: typeof TEAM_STATE_VERSION;
    sessionMode: TeamSessionMode;
    orchestration: {
        packageName: string;
        extensionName: string;
        systemPromptTitle: string;
        systemPromptNotes: string[];
    };
    rpc: {
        command: string;
        args: string[];
        mode: "rpc";
        noSession: boolean;
        transport: "jsonl-lf";
    };
    summaries: {
        maxHeadlineLength: number;
        maxItemsPerWorker: number;
        maxChangedFiles: number;
        maxRelayQuestions: number;
    };
    ui: {
        statusKey: string;
        widgetKey: string;
        titleTemplate: string;
        maxVisibleWorkers: number;
        showProfileNames: boolean;
    };
    safety: {
        preventRecursiveOrchestrator: boolean;
        defaultWorkerExtensionMode: WorkerExtensionMode;
        requirePathScopeForWrites: boolean;
        allowWorkerPathsOutsideProject: boolean;
        allowProjectProfiles: boolean;
        projectRoot?: string;
    };
    persistence: {
        stateCustomType: string;
        statusMessageType: string;
        storeTranscripts: boolean;
    };
    memory?: TeamMemoryConfig;
    worktree?: TeamWorktreeConfig;
    profiles: TeamProfileSpec[];
}
export interface CompactPersistedWorkerSummary<Status extends PersistedTerminalWorkerStatus = PersistedTerminalWorkerStatus> {
    headline: string;
    status: Status;
    readFiles: string[];
    changedFiles: string[];
    risks: string[];
    nextRecommendation?: string;
    updatedAt: number;
}
interface CompactPersistedWorkerForStatus<Status extends PersistedTerminalWorkerStatus> {
    workerId: string;
    profileName: string;
    status: Status;
    startedAt: number;
    lastEventAt: number;
    lastSummary?: CompactPersistedWorkerSummary<Status>;
    usage: WorkerUsageStats;
}
/** A wire worker whose optional summary must carry the worker's exact status. */
export type CompactPersistedWorker = {
    [Status in PersistedTerminalWorkerStatus]: CompactPersistedWorkerForStatus<Status>;
}[PersistedTerminalWorkerStatus];
export type TeamPersistenceRecord = {
    version: typeof TEAM_PERSISTENCE_VERSION;
    kind: "worker_terminal";
    recordId: string;
    worker: CompactPersistedWorker;
} | {
    version: typeof TEAM_PERSISTENCE_VERSION;
    kind: "worker_pruned";
    recordId: string;
    workerId: string;
    usage: WorkerUsageStats;
};
export interface PersistedTeamState {
    version: typeof TEAM_STATE_VERSION;
    sessionMode: TeamSessionMode;
    activeWorkers: Record<string, WorkerRuntimeState>;
    prunedWorkerUsageTotals: WorkerUsageAggregate;
    taskRegistry: Record<string, DelegatedTaskInput>;
    relayQueue: RelayQuestion[];
    ui: TeamUiState;
    updatedAt: number;
}
