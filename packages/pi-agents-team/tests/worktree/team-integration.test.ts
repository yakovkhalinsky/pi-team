import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TeamManager } from "../../src/src/control-plane/team-manager.js";

describe("worktree/team-manager integration", () => {
    it("delegates with a worktree cwd when worktrees are enabled", async () => {
        const launchCalls: Array<Record<string, unknown>> = [];
        let eventCount = 0;
        const fakeWorkerManager = {
            onEvent(listener: (worker: { state: Record<string, unknown> }) => void) {
                this._listener = listener;
                return () => { this._listener = undefined; };
            },
            _listener: undefined as ((worker: { state: Record<string, unknown> }) => void) | undefined,
            async launchWorker(options: Record<string, unknown>) {
                launchCalls.push(options);
                const state = {
                    workerId: options.workerId,
                    profileName: options.profileName,
                    sessionMode: "worker",
                    status: "idle",
                    requestedThinkingLevel: options.thinkingLevel ?? "medium",
                    effectiveThinkingLevel: options.thinkingLevel ?? "medium",
                    startedAt: Date.now(),
                    lastEventAt: Date.now(),
                    currentTask: options.task,
                    pendingRelayQuestions: [],
                    usage: { turns: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
                };
                const record = { workerId: options.workerId, state };
                this._records.set(options.workerId, record);
                if (this._listener) this._listener(record as any);
                return record;
            },
            _records: new Map<string, { workerId: string; state: Record<string, unknown> }>(),
            async promptWorker() { },
            getWorker(workerId: string) { return this._records.get(workerId) as any; },
            hasWorker() { return true; },
            async removeWorker() { },
            async shutdownWorker() { },
            async dispose() { },
        };

        const worktreeManager = {
            async resolveWorkerCwd(requestedCwd: string, workerId: string) {
                return `/worktrees/${workerId}`;
            },
            async removeWorktree() { return { removed: true }; },
            async removeAllWorktrees() { return []; },
            getWorktreePath(workerId: string) { return `/worktrees/${workerId}`; },
            getGitRoot() { return "/project"; },
            listWorktrees() { return []; },
        };

        const config = {
            version: 1,
            sessionMode: "orchestrator",
            orchestration: { packageName: "x", extensionName: "x", systemPromptTitle: "x", systemPromptNotes: [] },
            rpc: { command: "pi", args: ["--mode", "rpc"], mode: "rpc", noSession: true, transport: "jsonl-lf" },
            summaries: { maxHeadlineLength: 80, maxItemsPerWorker: 3, maxChangedFiles: 8, maxRelayQuestions: 3 },
            ui: { statusKey: "k", widgetKey: "k", titleTemplate: "t", maxVisibleWorkers: 4, showProfileNames: true },
            safety: { preventRecursiveOrchestrator: true, defaultWorkerExtensionMode: "worker-minimal", requirePathScopeForWrites: true, allowWorkerPathsOutsideProject: true, allowProjectProfiles: false },
            persistence: { stateCustomType: "t", statusMessageType: "t", storeTranscripts: false },
            worktree: { enabled: true, basePath: ".wt", cleanupOnTerminal: true, cleanupOnPrune: true },
            profiles: [{ name: "builder", description: "b", tools: ["read", "edit"], promptPath: "p.md", extensionMode: "worker-minimal", writePolicy: "scoped-write", pathScope: { roots: ["."], allowReadOutsideRoots: false, allowWrite: true }, canSpawnWorkers: false }],
        } as any;

        const manager = new TeamManager({ config, workerManager: fakeWorkerManager as any, worktreeManager: worktreeManager as any });
        manager.onStateChange(() => { eventCount += 1; });

        const result = await manager.delegateTask({
            title: "Test task",
            goal: "do work",
            profileName: "builder",
            cwd: "/project",
        });

        assert.equal(launchCalls.length, 1);
        assert.equal(launchCalls[0].cwd, "/worktrees/w1");
        assert.equal((launchCalls[0] as any).worktreePath, "/worktrees/w1");
        assert.equal(result.worker.worktreePath, "/worktrees/w1");
        assert.equal(eventCount, 2); // launch event + final upsert
    });

    it("prune cleans up the worktree when cleanupOnPrune is enabled", async () => {
        const removed: string[] = [];
        const fakeWorkerManager = {
            onEvent(listener: () => void) { return () => { }; },
            hasWorker() { return false; },
            async removeWorker() { },
            async dispose() { },
        };
        const worktreeManager = {
            async resolveWorkerCwd() { return "/worktrees/w1"; },
            async removeWorktree(workerId: string) { removed.push(workerId); return { removed: true }; },
            async removeAllWorktrees() { return []; },
            getWorktreePath() { return "/worktrees/w1"; },
        };

        const config = {
            version: 1,
            sessionMode: "orchestrator",
            orchestration: { packageName: "x", extensionName: "x", systemPromptTitle: "x", systemPromptNotes: [] },
            rpc: { command: "pi", args: ["--mode", "rpc"], mode: "rpc", noSession: true, transport: "jsonl-lf" },
            summaries: { maxHeadlineLength: 80, maxItemsPerWorker: 3, maxChangedFiles: 8, maxRelayQuestions: 3 },
            ui: { statusKey: "k", widgetKey: "k", titleTemplate: "t", maxVisibleWorkers: 4, showProfileNames: true },
            safety: { preventRecursiveOrchestrator: true, defaultWorkerExtensionMode: "worker-minimal", requirePathScopeForWrites: true, allowWorkerPathsOutsideProject: true, allowProjectProfiles: false },
            persistence: { stateCustomType: "t", statusMessageType: "t", storeTranscripts: false },
            worktree: { enabled: true, basePath: ".wt", cleanupOnTerminal: false, cleanupOnPrune: true },
            profiles: [],
        } as any;

        const manager = new TeamManager({ config, workerManager: fakeWorkerManager as any, worktreeManager: worktreeManager as any });
        manager["registry"].upsertWorker({
            workerId: "w1",
            profileName: "builder",
            sessionMode: "worker",
            status: "completed",
            requestedThinkingLevel: "medium",
            effectiveThinkingLevel: "medium",
            startedAt: Date.now(),
            lastEventAt: Date.now(),
            worktreePath: "/worktrees/w1",
            pendingRelayQuestions: [],
            usage: { turns: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
        } as any);

        await manager.pruneTerminalWorkers();
        assert.deepEqual(removed, ["w1"]);
    });
});
