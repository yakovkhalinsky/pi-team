import { Type } from "typebox";
import { TEAM_SCAFFOLD_VERSION, type PersistedTeamState, type TeamConfig, type WorkerRuntimeState } from "./types.js";
export { TEAM_SCAFFOLD_VERSION };
export declare const CURRENT_SCAFFOLD_VERSION: 4;
export declare const TeamPathScopeSchema: Type.TObject<{
    roots: Type.TArray<Type.TString>;
    allowReadOutsideRoots: Type.TBoolean;
    allowWrite: Type.TBoolean;
}>;
export declare const TeamProfileSpecSchema: Type.TObject<{
    name: Type.TString;
    description: Type.TString;
    model: Type.TOptional<Type.TString>;
    thinkingLevel: Type.TOptional<Type.TSchema>;
    tools: Type.TArray<Type.TString>;
    extensions: Type.TOptional<Type.TArray<Type.TString>>;
    promptPath: Type.TString;
    promptInline: Type.TOptional<Type.TString>;
    extensionMode: Type.TSchema;
    writePolicy: Type.TSchema;
    pathScope: Type.TOptional<Type.TObject<{
        roots: Type.TArray<Type.TString>;
        allowReadOutsideRoots: Type.TBoolean;
        allowWrite: Type.TBoolean;
    }>>;
    canSpawnWorkers: Type.TBoolean;
}>;
export declare const ProjectRolePromptSchema: Type.TObject<{
    source: Type.TSchema;
    path: Type.TOptional<Type.TUnion<[Type.TString, Type.TNull]>>;
}>;
export declare const ProjectRoleAccessSchema: Type.TObject<{
    tools: Type.TOptional<Type.TArray<Type.TString>>;
    extensions: Type.TOptional<Type.TArray<Type.TString>>;
    write: Type.TOptional<Type.TBoolean>;
    extensionMode: Type.TOptional<Type.TSchema>;
    canSpawnWorkers: Type.TOptional<Type.TBoolean>;
    pathScope: Type.TOptional<Type.TObject<{
        roots: Type.TArray<Type.TString>;
        allowReadOutsideRoots: Type.TBoolean;
        allowWrite: Type.TBoolean;
    }>>;
}>;
export declare const TeamProjectWorkerAccessSchema: Type.TObject<{
    allowPathsOutsideProject: Type.TOptional<Type.TBoolean>;
}>;
export declare const TeamProjectDisplaySchema: Type.TObject<{
    cost: Type.TOptional<Type.TBoolean>;
}>;
export declare const TeamWorktreeConfigSchema: Type.TObject<{
    enabled: Type.TBoolean;
    basePath: Type.TString;
    cleanupOnTerminal: Type.TBoolean;
    cleanupOnPrune: Type.TBoolean;
}>;
/**
 * Schema v4 role shape. Role selection fields stay at the top level, while
 * worker capabilities and path controls live under `access`.
 * Normalization into the internal ProjectRoleConfig happens in the loader.
 */
export declare const ProjectRoleConfigSchema: Type.TObject<{
    whenToUse: Type.TOptional<Type.TUnion<[Type.TString, Type.TNull]>>;
    model: Type.TOptional<Type.TUnion<[Type.TString, Type.TNull]>>;
    thinkingLevel: Type.TOptional<Type.TSchema>;
    access: Type.TOptional<Type.TObject<{
        tools: Type.TOptional<Type.TArray<Type.TString>>;
        extensions: Type.TOptional<Type.TArray<Type.TString>>;
        write: Type.TOptional<Type.TBoolean>;
        extensionMode: Type.TOptional<Type.TSchema>;
        canSpawnWorkers: Type.TOptional<Type.TBoolean>;
        pathScope: Type.TOptional<Type.TObject<{
            roots: Type.TArray<Type.TString>;
            allowReadOutsideRoots: Type.TBoolean;
            allowWrite: Type.TBoolean;
        }>>;
    }>>;
    prompt: Type.TOptional<Type.TUnion<[Type.TString, Type.TNull, Type.TObject<{
        source: Type.TSchema;
        path: Type.TOptional<Type.TUnion<[Type.TString, Type.TNull]>>;
    }>]>>;
}>;
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
export declare const TeamProjectConfigSchema: Type.TObject<{
    schemaVersion: Type.TOptional<Type.TNumber>;
    version: Type.TOptional<Type.TNumber>;
    scaffoldVersion: Type.TOptional<Type.TNumber>;
    defaultsVersion: Type.TOptional<Type.TNumber>;
    enabled: Type.TOptional<Type.TBoolean>;
    routingMode: Type.TOptional<Type.TUnion<[Type.TLiteral<"team">, Type.TLiteral<"solo">]>>;
    workerAccess: Type.TOptional<Type.TObject<{
        allowPathsOutsideProject: Type.TOptional<Type.TBoolean>;
    }>>;
    display: Type.TOptional<Type.TObject<{
        cost: Type.TOptional<Type.TBoolean>;
    }>>;
    worktree: Type.TOptional<Type.TObject<{
        enabled: Type.TBoolean;
        basePath: Type.TString;
        cleanupOnTerminal: Type.TBoolean;
        cleanupOnPrune: Type.TBoolean;
    }>>;
    roles: Type.TOptional<Type.TRecord<"^.*$", Type.TObject<{
        whenToUse: Type.TOptional<Type.TUnion<[Type.TString, Type.TNull]>>;
        model: Type.TOptional<Type.TUnion<[Type.TString, Type.TNull]>>;
        thinkingLevel: Type.TOptional<Type.TSchema>;
        access: Type.TOptional<Type.TObject<{
            tools: Type.TOptional<Type.TArray<Type.TString>>;
            extensions: Type.TOptional<Type.TArray<Type.TString>>;
            write: Type.TOptional<Type.TBoolean>;
            extensionMode: Type.TOptional<Type.TSchema>;
            canSpawnWorkers: Type.TOptional<Type.TBoolean>;
            pathScope: Type.TOptional<Type.TObject<{
                roots: Type.TArray<Type.TString>;
                allowReadOutsideRoots: Type.TBoolean;
                allowWrite: Type.TBoolean;
            }>>;
        }>>;
        prompt: Type.TOptional<Type.TUnion<[Type.TString, Type.TNull, Type.TObject<{
            source: Type.TSchema;
            path: Type.TOptional<Type.TUnion<[Type.TString, Type.TNull]>>;
        }>]>>;
    }>>>;
}>;
export declare const WorkerUsageStatsSchema: Type.TObject<{
    turns: Type.TNumber;
    inputTokens: Type.TNumber;
    outputTokens: Type.TNumber;
    cacheReadTokens: Type.TNumber;
    cacheWriteTokens: Type.TNumber;
    costUsd: Type.TNumber;
    contextTokens: Type.TOptional<Type.TNumber>;
    contextWindow: Type.TOptional<Type.TNumber>;
    contextPercent: Type.TOptional<Type.TNumber>;
    contextRemainingTokens: Type.TOptional<Type.TNumber>;
}>;
export declare const WorkerUsageAggregateSchema: Type.TObject<{
    workers: Type.TNumber;
    turns: Type.TNumber;
    inputTokens: Type.TNumber;
    outputTokens: Type.TNumber;
    cacheReadTokens: Type.TNumber;
    cacheWriteTokens: Type.TNumber;
    costUsd: Type.TNumber;
    contextTokens: Type.TNumber;
}>;
export declare const RelayQuestionSchema: Type.TObject<{
    relayId: Type.TString;
    workerId: Type.TString;
    taskId: Type.TString;
    question: Type.TString;
    assumption: Type.TString;
    urgency: Type.TSchema;
    choices: Type.TOptional<Type.TArray<Type.TString>>;
    createdAt: Type.TNumber;
    resolvedAt: Type.TOptional<Type.TNumber>;
    resolution: Type.TOptional<Type.TString>;
}>;
export declare const WorkerSummarySchema: Type.TObject<{
    workerId: Type.TString;
    taskId: Type.TString;
    headline: Type.TString;
    status: Type.TSchema;
    currentToolName: Type.TOptional<Type.TString>;
    readFiles: Type.TArray<Type.TString>;
    changedFiles: Type.TArray<Type.TString>;
    risks: Type.TArray<Type.TString>;
    nextRecommendation: Type.TOptional<Type.TString>;
    relayQuestionCount: Type.TNumber;
    updatedAt: Type.TNumber;
}>;
export declare const DelegatedTaskInputSchema: Type.TObject<{
    taskId: Type.TString;
    title: Type.TString;
    goal: Type.TString;
    requestedBy: Type.TSchema;
    profileName: Type.TString;
    cwd: Type.TString;
    contextHints: Type.TArray<Type.TString>;
    expectedOutput: Type.TOptional<Type.TString>;
    pathScope: Type.TOptional<Type.TObject<{
        roots: Type.TArray<Type.TString>;
        allowReadOutsideRoots: Type.TBoolean;
        allowWrite: Type.TBoolean;
    }>>;
    orchestratorThinkingLevel: Type.TOptional<Type.TSchema>;
    createdAt: Type.TNumber;
}>;
export declare const WorkerRuntimeStateSchema: Type.TObject<{
    workerId: Type.TString;
    profileName: Type.TString;
    sessionMode: Type.TSchema;
    status: Type.TSchema;
    requestedThinkingLevel: Type.TSchema;
    effectiveThinkingLevel: Type.TSchema;
    processId: Type.TOptional<Type.TNumber>;
    startedAt: Type.TNumber;
    lastEventAt: Type.TNumber;
    lastToolName: Type.TOptional<Type.TString>;
    currentTask: Type.TOptional<Type.TObject<{
        taskId: Type.TString;
        title: Type.TString;
        goal: Type.TString;
        requestedBy: Type.TSchema;
        profileName: Type.TString;
        cwd: Type.TString;
        contextHints: Type.TArray<Type.TString>;
        expectedOutput: Type.TOptional<Type.TString>;
        pathScope: Type.TOptional<Type.TObject<{
            roots: Type.TArray<Type.TString>;
            allowReadOutsideRoots: Type.TBoolean;
            allowWrite: Type.TBoolean;
        }>>;
        orchestratorThinkingLevel: Type.TOptional<Type.TSchema>;
        createdAt: Type.TNumber;
    }>>;
    lastSummary: Type.TOptional<Type.TObject<{
        workerId: Type.TString;
        taskId: Type.TString;
        headline: Type.TString;
        status: Type.TSchema;
        currentToolName: Type.TOptional<Type.TString>;
        readFiles: Type.TArray<Type.TString>;
        changedFiles: Type.TArray<Type.TString>;
        risks: Type.TArray<Type.TString>;
        nextRecommendation: Type.TOptional<Type.TString>;
        relayQuestionCount: Type.TNumber;
        updatedAt: Type.TNumber;
    }>>;
    finalAnswer: Type.TOptional<Type.TString>;
    pendingRelayQuestions: Type.TArray<Type.TObject<{
        relayId: Type.TString;
        workerId: Type.TString;
        taskId: Type.TString;
        question: Type.TString;
        assumption: Type.TString;
        urgency: Type.TSchema;
        choices: Type.TOptional<Type.TArray<Type.TString>>;
        createdAt: Type.TNumber;
        resolvedAt: Type.TOptional<Type.TNumber>;
        resolution: Type.TOptional<Type.TString>;
    }>>;
    usage: Type.TObject<{
        turns: Type.TNumber;
        inputTokens: Type.TNumber;
        outputTokens: Type.TNumber;
        cacheReadTokens: Type.TNumber;
        cacheWriteTokens: Type.TNumber;
        costUsd: Type.TNumber;
        contextTokens: Type.TOptional<Type.TNumber>;
        contextWindow: Type.TOptional<Type.TNumber>;
        contextPercent: Type.TOptional<Type.TNumber>;
        contextRemainingTokens: Type.TOptional<Type.TNumber>;
    }>;
    error: Type.TOptional<Type.TString>;
    worktreePath: Type.TOptional<Type.TString>;
}>;
export declare const TeamUiStateSchema: Type.TObject<{
    statusKey: Type.TString;
    widgetKey: Type.TString;
    lastRenderAt: Type.TNumber;
}>;
export declare const TeamConfigSchema: Type.TObject<{
    version: Type.TLiteral<1>;
    sessionMode: Type.TSchema;
    orchestration: Type.TObject<{
        packageName: Type.TString;
        extensionName: Type.TString;
        systemPromptTitle: Type.TString;
        systemPromptNotes: Type.TArray<Type.TString>;
    }>;
    rpc: Type.TObject<{
        command: Type.TString;
        args: Type.TArray<Type.TString>;
        mode: Type.TLiteral<"rpc">;
        noSession: Type.TBoolean;
        transport: Type.TLiteral<"jsonl-lf">;
    }>;
    summaries: Type.TObject<{
        maxHeadlineLength: Type.TNumber;
        maxItemsPerWorker: Type.TNumber;
        maxChangedFiles: Type.TNumber;
        maxRelayQuestions: Type.TNumber;
    }>;
    ui: Type.TObject<{
        statusKey: Type.TString;
        widgetKey: Type.TString;
        titleTemplate: Type.TString;
        maxVisibleWorkers: Type.TNumber;
        showProfileNames: Type.TBoolean;
    }>;
    safety: Type.TObject<{
        preventRecursiveOrchestrator: Type.TBoolean;
        defaultWorkerExtensionMode: Type.TSchema;
        requirePathScopeForWrites: Type.TBoolean;
        allowWorkerPathsOutsideProject: Type.TBoolean;
        allowProjectProfiles: Type.TBoolean;
        projectRoot: Type.TOptional<Type.TString>;
    }>;
    persistence: Type.TObject<{
        stateCustomType: Type.TString;
        statusMessageType: Type.TString;
        storeTranscripts: Type.TBoolean;
    }>;
    worktree: Type.TOptional<Type.TObject<{
        enabled: Type.TBoolean;
        basePath: Type.TString;
        cleanupOnTerminal: Type.TBoolean;
        cleanupOnPrune: Type.TBoolean;
    }>>;
    profiles: Type.TArray<Type.TObject<{
        name: Type.TString;
        description: Type.TString;
        model: Type.TOptional<Type.TString>;
        thinkingLevel: Type.TOptional<Type.TSchema>;
        tools: Type.TArray<Type.TString>;
        extensions: Type.TOptional<Type.TArray<Type.TString>>;
        promptPath: Type.TString;
        promptInline: Type.TOptional<Type.TString>;
        extensionMode: Type.TSchema;
        writePolicy: Type.TSchema;
        pathScope: Type.TOptional<Type.TObject<{
            roots: Type.TArray<Type.TString>;
            allowReadOutsideRoots: Type.TBoolean;
            allowWrite: Type.TBoolean;
        }>>;
        canSpawnWorkers: Type.TBoolean;
    }>>;
}>;
export declare const PersistedTeamStateSchema: Type.TObject<{
    version: Type.TLiteral<1>;
    sessionMode: Type.TSchema;
    activeWorkers: Type.TRecord<"^.*$", Type.TObject<{
        workerId: Type.TString;
        profileName: Type.TString;
        sessionMode: Type.TSchema;
        status: Type.TSchema;
        requestedThinkingLevel: Type.TSchema;
        effectiveThinkingLevel: Type.TSchema;
        processId: Type.TOptional<Type.TNumber>;
        startedAt: Type.TNumber;
        lastEventAt: Type.TNumber;
        lastToolName: Type.TOptional<Type.TString>;
        currentTask: Type.TOptional<Type.TObject<{
            taskId: Type.TString;
            title: Type.TString;
            goal: Type.TString;
            requestedBy: Type.TSchema;
            profileName: Type.TString;
            cwd: Type.TString;
            contextHints: Type.TArray<Type.TString>;
            expectedOutput: Type.TOptional<Type.TString>;
            pathScope: Type.TOptional<Type.TObject<{
                roots: Type.TArray<Type.TString>;
                allowReadOutsideRoots: Type.TBoolean;
                allowWrite: Type.TBoolean;
            }>>;
            orchestratorThinkingLevel: Type.TOptional<Type.TSchema>;
            createdAt: Type.TNumber;
        }>>;
        lastSummary: Type.TOptional<Type.TObject<{
            workerId: Type.TString;
            taskId: Type.TString;
            headline: Type.TString;
            status: Type.TSchema;
            currentToolName: Type.TOptional<Type.TString>;
            readFiles: Type.TArray<Type.TString>;
            changedFiles: Type.TArray<Type.TString>;
            risks: Type.TArray<Type.TString>;
            nextRecommendation: Type.TOptional<Type.TString>;
            relayQuestionCount: Type.TNumber;
            updatedAt: Type.TNumber;
        }>>;
        finalAnswer: Type.TOptional<Type.TString>;
        pendingRelayQuestions: Type.TArray<Type.TObject<{
            relayId: Type.TString;
            workerId: Type.TString;
            taskId: Type.TString;
            question: Type.TString;
            assumption: Type.TString;
            urgency: Type.TSchema;
            choices: Type.TOptional<Type.TArray<Type.TString>>;
            createdAt: Type.TNumber;
            resolvedAt: Type.TOptional<Type.TNumber>;
            resolution: Type.TOptional<Type.TString>;
        }>>;
        usage: Type.TObject<{
            turns: Type.TNumber;
            inputTokens: Type.TNumber;
            outputTokens: Type.TNumber;
            cacheReadTokens: Type.TNumber;
            cacheWriteTokens: Type.TNumber;
            costUsd: Type.TNumber;
            contextTokens: Type.TOptional<Type.TNumber>;
            contextWindow: Type.TOptional<Type.TNumber>;
            contextPercent: Type.TOptional<Type.TNumber>;
            contextRemainingTokens: Type.TOptional<Type.TNumber>;
        }>;
        error: Type.TOptional<Type.TString>;
        worktreePath: Type.TOptional<Type.TString>;
    }>>;
    prunedWorkerUsageTotals: Type.TObject<{
        workers: Type.TNumber;
        turns: Type.TNumber;
        inputTokens: Type.TNumber;
        outputTokens: Type.TNumber;
        cacheReadTokens: Type.TNumber;
        cacheWriteTokens: Type.TNumber;
        costUsd: Type.TNumber;
        contextTokens: Type.TNumber;
    }>;
    taskRegistry: Type.TRecord<"^.*$", Type.TObject<{
        taskId: Type.TString;
        title: Type.TString;
        goal: Type.TString;
        requestedBy: Type.TSchema;
        profileName: Type.TString;
        cwd: Type.TString;
        contextHints: Type.TArray<Type.TString>;
        expectedOutput: Type.TOptional<Type.TString>;
        pathScope: Type.TOptional<Type.TObject<{
            roots: Type.TArray<Type.TString>;
            allowReadOutsideRoots: Type.TBoolean;
            allowWrite: Type.TBoolean;
        }>>;
        orchestratorThinkingLevel: Type.TOptional<Type.TSchema>;
        createdAt: Type.TNumber;
    }>>;
    relayQueue: Type.TArray<Type.TObject<{
        relayId: Type.TString;
        workerId: Type.TString;
        taskId: Type.TString;
        question: Type.TString;
        assumption: Type.TString;
        urgency: Type.TSchema;
        choices: Type.TOptional<Type.TArray<Type.TString>>;
        createdAt: Type.TNumber;
        resolvedAt: Type.TOptional<Type.TNumber>;
        resolution: Type.TOptional<Type.TString>;
    }>>;
    ui: Type.TObject<{
        statusKey: Type.TString;
        widgetKey: Type.TString;
        lastRenderAt: Type.TNumber;
    }>;
    updatedAt: Type.TNumber;
}>;
export declare const DEFAULT_TEAM_CONFIG: TeamConfig;
export declare function createDefaultTeamState(config?: TeamConfig, now?: number): PersistedTeamState;
export declare function normalizePersistedTeamState(raw: unknown, config?: TeamConfig): PersistedTeamState;
export declare function buildOrchestratorSystemPrompt(state: PersistedTeamState, config?: TeamConfig): string;
export declare const FOUNDATION_STATUS: {
    implementedTaskStatuses: readonly ["queued", "running", "waiting_followup", "completed", "blocked", "failed", "cancelled"];
    implementedWorkerStatuses: readonly ["created", "starting", "idle", "running", "waiting_followup", "completed", "aborted", "error", "exited"];
    implementedPingModes: readonly ["passive", "active"];
};
