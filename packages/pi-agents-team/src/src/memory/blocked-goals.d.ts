import { EdenMemoryOptions } from "./eden-memory.js";

export interface BlockedGoal {
  goalId: string;
  reason: string;
  content?: string;
}

export interface BlockedGoalsResult {
  ok: boolean;
  goals: BlockedGoal[];
  error?: string;
}

export function findBlockedOrUnfinishedGoals(
  options: EdenMemoryOptions,
  signal?: AbortSignal,
): Promise<BlockedGoalsResult>;

export function formatBlockedGoalsSummary(goals: BlockedGoal[] | undefined): string | undefined;

export const _testing: {
  extractGoalId(result: unknown): string | undefined;
  extractContent(result: unknown): string;
};
