import { createDefaultTeamState } from "../src/src/config.js";
import type { PersistedTeamState, WorkerRuntimeState } from "../src/src/types.js";

export function makeWorker(options: Partial<WorkerRuntimeState> & { workerId: string; profileName: string }): WorkerRuntimeState {
  const now = Date.now();
  return {
    workerId: options.workerId,
    profileName: options.profileName,
    sessionMode: "worker",
    status: options.status ?? "running",
    requestedThinkingLevel: "medium",
    effectiveThinkingLevel: "medium",
    processId: undefined,
    startedAt: options.startedAt ?? now,
    lastEventAt: options.lastEventAt ?? now,
    lastToolName: options.lastToolName,
    currentTask: options.currentTask,
    lastSummary: options.lastSummary,
    finalAnswer: options.finalAnswer,
    pendingRelayQuestions: options.pendingRelayQuestions ?? [],
    usage: {
      turns: options.usage?.turns ?? 0,
      inputTokens: options.usage?.inputTokens ?? 0,
      outputTokens: options.usage?.outputTokens ?? 0,
      cacheReadTokens: options.usage?.cacheReadTokens ?? 0,
      cacheWriteTokens: options.usage?.cacheWriteTokens ?? 0,
      costUsd: options.usage?.costUsd ?? 0,
      contextTokens: options.usage?.contextTokens ?? 0,
      contextWindow: options.usage?.contextWindow,
      contextPercent: options.usage?.contextPercent,
      contextRemainingTokens: options.usage?.contextRemainingTokens,
    },
    error: options.error,
  };
}

export function makeTeamState(workers: WorkerRuntimeState[] = []): PersistedTeamState {
  const state = createDefaultTeamState();
  for (const worker of workers) {
    state.activeWorkers[worker.workerId] = worker;
  }
  return state as PersistedTeamState;
}
