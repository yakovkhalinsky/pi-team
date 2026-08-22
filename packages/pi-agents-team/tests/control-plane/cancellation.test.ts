import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import extensionFactory from "../../src/extensions/pi-agent-team/index.js";
import { TeamManager } from "../../src/src/control-plane/team-manager.js";
import { TaskRegistry } from "../../src/src/control-plane/task-registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..", "..");

function readPrompt(relPath: string) {
  return readFileSync(join(repoRoot, relPath), "utf-8");
}

function createMockPi() {
  const tools = new Map<string, { description?: string }>();
  const handlers = new Map<string, Function[]>();
  return {
    registerTool: (def: { name: string; description?: string }) => {
      tools.set(def.name, def);
    },
    registerCommand: () => {},
    sendMessage: () => {},
    appendEntry: () => {},
    getThinkingLevel: () => undefined,
    on: (event: string, handler: Function) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    },
    emit: (event: string, ...args: unknown[]) => {
      for (const handler of handlers.get(event) ?? []) {
        void handler(...args);
      }
    },
    tools,
    handlers,
  };
}

function createMockContext() {
  return {
    cwd: process.cwd(),
    hasUI: false,
    mode: "api",
    sessionManager: { getBranch: () => [], isPersisted: () => false },
    isProjectTrusted: () => false,
  };
}

function makeWorkerState(workerId: string, status: string) {
  return {
    workerId,
    profileName: "builder",
    sessionMode: "worker",
    status,
    requestedThinkingLevel: "medium",
    effectiveThinkingLevel: "medium",
    startedAt: Date.now(),
    lastEventAt: Date.now(),
    pendingRelayQuestions: [],
    usage: { turns: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
  };
}

function createFakeWorkerManager() {
  const calls = {
    abortWorker: [] as string[],
    shutdownWorker: [] as string[],
    removeWorker: [] as string[],
  };
  const manager = {
    onEvent: () => () => {},
    async abortWorker(workerId: string) { calls.abortWorker.push(workerId); },
    async shutdownWorker(workerId: string) { calls.shutdownWorker.push(workerId); },
    async removeWorker(workerId: string) { calls.removeWorker.push(workerId); },
    async dispose() {},
    hasWorker: () => false,
    getWorker: () => undefined,
    async launchWorker() { throw new Error("not used"); },
    async promptWorker() {},
  };
  return { manager, calls };
}

function createFakeWorktreeManager() {
  return {
    async resolveWorkerCwd(requestedCwd: string) { return requestedCwd; },
    async removeWorktree() { return { removed: true }; },
    async removeAllWorktrees() { return []; },
    getWorktreePath() { return undefined; },
    getGitRoot() { return "/project"; },
    listWorktrees() { return []; },
  };
}

describe("cancellation policy prompts", () => {
  it("root orchestrator prompt contains cancellation policy language", () => {
    const text = readPrompt("prompts/orchestrator.md");
    assert.match(text, /last resort/i, "should describe agent_cancel as last resort");
    assert.match(text, /unrecoverable failure modes/i, "should name unrecoverable failure modes");
    assert.match(text, /Long runtime/i, "should list long runtime as invalid trigger");
    assert.match(text, /token\/context usage/i, "should list token/context usage as invalid trigger");
    assert.match(text, /agent_message.*timeoutMs.*relay.*cancel/i, "should describe escalation ladder");
  });

  it("package orchestrator prompt contains cancellation policy language", () => {
    const text = readPrompt("packages/pi-agents-team/prompts/orchestrator.md");
    assert.match(text, /last resort/i, "should describe agent_cancel as last resort");
    assert.match(text, /unrecoverable failure modes/i, "should name unrecoverable failure modes");
    assert.match(text, /Long runtime/i, "should list long runtime as invalid trigger");
    assert.match(text, /token\/context usage/i, "should list token/context usage as invalid trigger");
    assert.match(text, /agent_message.*timeoutMs.*relay.*cancel/i, "should describe escalation ladder");
  });

  it("agent_cancel tool description is last-resort wording", () => {
    const pi = createMockPi();
    extensionFactory(pi);
    const ctx = createMockContext();
    pi.emit("session_start", { reason: "startup" }, ctx);
    const tool = pi.tools.get("agent_cancel");
    assert.ok(tool, "agent_cancel should be registered");
    const desc = tool!.description ?? "";
    assert.match(desc, /last.resort/i, "description should say last resort");
    assert.match(desc, /stuck|looping|ignoring instructions|repeatedly erroring/i, "description should name stuck/looping/erroring cases");
    assert.match(desc, /agent_message.*wait_for_agents/i, "description should prefer steering/waiting");
  });

  it("builder prompt instructs checkpoint progress messages", () => {
    const text = readPrompt("packages/pi-agents-team/prompts/agents/builder.md");
    assert.match(text, /Checkpoints during long-running work/i, "should have a checkpoints section");
    assert.match(text, /progress\/update messages/i, "should mention progress/update messages");
    assert.match(text, /not a.*final_answer/i, "should warn not to use final answer for checkpoints");
    assert.match(text, /forward motion/i, "should mention forward motion");
  });
});

describe("TeamManager cancellation behavior", () => {
  it("cancelWorker aborts RPC, marks status exited, and emits state_change", async () => {
    const { manager: workerManager, calls } = createFakeWorkerManager();
    const worktreeManager = createFakeWorktreeManager();
    const config = {
      version: 1,
      sessionMode: "orchestrator",
      orchestration: { packageName: "x", extensionName: "x", systemPromptTitle: "x", systemPromptNotes: [] },
      rpc: { command: "pi", args: ["--mode", "rpc"], mode: "rpc", noSession: true, transport: "jsonl-lf" },
      summaries: { maxHeadlineLength: 80, maxItemsPerWorker: 3, maxChangedFiles: 8, maxRelayQuestions: 3 },
      ui: { statusKey: "k", widgetKey: "k", titleTemplate: "t", maxVisibleWorkers: 4, showProfileNames: true },
      safety: { preventRecursiveOrchestrator: true, defaultWorkerExtensionMode: "worker-minimal", requirePathScopeForWrites: true, allowWorkerPathsOutsideProject: false, allowProjectProfiles: false },
      persistence: { stateCustomType: "t", statusMessageType: "t", storeTranscripts: false },
      worktree: { enabled: false, basePath: ".wt", cleanupOnTerminal: false, cleanupOnPrune: false },
      profiles: [],
      memory: { edenMemory: { enabled: false } },
    } as any;

    const registry = new TaskRegistry();
    registry.upsertWorker(makeWorkerState("w1", "running"));

    const manager = new TeamManager({ config, workerManager: workerManager as any, worktreeManager: worktreeManager as any, registry });

    let eventCount = 0;
    manager.onStateChange(() => { eventCount += 1; });

    const result = await manager.cancelWorker("w1");

    assert.deepEqual(calls.abortWorker, ["w1"], "abortWorker should be called for w1");
    assert.deepEqual(calls.shutdownWorker, ["w1"], "shutdownWorker should be called for w1");
    assert.equal(result.worker.status, "exited", "result worker should be exited");
    assert.equal(registry.getWorker("w1")?.status, "exited", "registry should mark worker exited");
    assert.ok(eventCount > 0, "state_change should be emitted");
  });

  it("waitForTerminal returns timeout without mutating worker status", async () => {
    const workerManager = createFakeWorkerManager().manager;
    const worktreeManager = createFakeWorktreeManager();
    const config = {
      version: 1,
      sessionMode: "orchestrator",
      orchestration: { packageName: "x", extensionName: "x", systemPromptTitle: "x", systemPromptNotes: [] },
      rpc: { command: "pi", args: ["--mode", "rpc"], mode: "rpc", noSession: true, transport: "jsonl-lf" },
      summaries: { maxHeadlineLength: 80, maxItemsPerWorker: 3, maxChangedFiles: 8, maxRelayQuestions: 3 },
      ui: { statusKey: "k", widgetKey: "k", titleTemplate: "t", maxVisibleWorkers: 4, showProfileNames: true },
      safety: { preventRecursiveOrchestrator: true, defaultWorkerExtensionMode: "worker-minimal", requirePathScopeForWrites: true, allowWorkerPathsOutsideProject: false, allowProjectProfiles: false },
      persistence: { stateCustomType: "t", statusMessageType: "t", storeTranscripts: false },
      worktree: { enabled: false, basePath: ".wt", cleanupOnTerminal: false, cleanupOnPrune: false },
      profiles: [],
      memory: { edenMemory: { enabled: false } },
    } as any;

    const registry = new TaskRegistry();
    registry.upsertWorker(makeWorkerState("w1", "running"));

    const manager = new TeamManager({ config, workerManager: workerManager as any, worktreeManager: worktreeManager as any, registry });

    const result = await manager.waitForTerminal(["w1"], { timeoutMs: 10 });

    assert.equal(result.reason, "timeout", "should return timeout reason");
    assert.equal(registry.getWorker("w1")?.status, "running", "worker status should remain running");
  });
});
