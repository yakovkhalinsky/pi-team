import { search } from "./eden-memory.js";

const MAX_GOALS = 50;
const BLOCKED_KEYWORDS = "blocked unfinished stuck failed error";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractGoalId(result) {
  if (!isRecord(result)) return undefined;
  const metadata = isRecord(result.metadata) ? result.metadata : {};
  if (typeof metadata.goalId === "string" && metadata.goalId.trim()) return metadata.goalId.trim();
  if (typeof result.goalId === "string" && result.goalId.trim()) return result.goalId.trim();
  const content = typeof result.content === "string" ? result.content : "";
  const match = content.match(/goal:([^\s]+)/);
  return match?.[1];
}

function extractContent(result) {
  if (!isRecord(result)) return "";
  if (typeof result.content === "string") return result.content;
  if (typeof result.text === "string") return result.text;
  return "";
}

/**
 * Query eden-memory for blocked or unfinished goals/tasks.
 *
 * Heuristic:
 * 1. Search for recent goal-receipt markers that also match the keywords
 *    "blocked", "unfinished", "stuck", "failed", or "error".
 * 2. Search for all recent goal-receipt markers.
 * 3. Search for all recent hand-off-or-closure markers.
 * 4. Return goal IDs present in (2) but missing from (3), plus any goal IDs
 *    returned by (1).
 *
 * The function never throws. If eden-memory is unreachable or misconfigured,
 * it returns { ok: false, goals: [], error }.
 */
export async function findBlockedOrUnfinishedGoals(options, signal, timeoutMs) {
  const common = {
    bin: options.bin,
    db: options.db,
    workspaceId: options.workspaceId,
    userId: options.userId,
    agentId: options.agentId,
    orgId: options.orgId,
    llmApiKey: options.llmApiKey,
    llmBaseUrl: options.llmBaseUrl,
    logLevel: options.logLevel,
    logFormat: options.logFormat,
    limit: options.limit ?? MAX_GOALS,
  };

  const [blockedSearch, goalReceiptSearch, closureSearch] = await Promise.all([
    search(
      {
        ...common,
        keywords: BLOCKED_KEYWORDS,
        filters: { stage: "goal-receipt" },
      },
      signal,
      timeoutMs,
    ),
    search(
      {
        ...common,
        filters: { stage: "goal-receipt" },
      },
      signal,
      timeoutMs,
    ),
    search(
      {
        ...common,
        filters: { stage: "hand-off-or-closure" },
      },
      signal,
      timeoutMs,
    ),
  ]);

  if (!blockedSearch.ok && !goalReceiptSearch.ok && !closureSearch.ok) {
    const firstError = blockedSearch.error || goalReceiptSearch.error || closureSearch.error || "eden-memory search failed";
    return { ok: false, goals: [], error: firstError };
  }

  const receiptGoalIds = new Map();
  for (const result of goalReceiptSearch.results ?? []) {
    const goalId = extractGoalId(result);
    if (!goalId) continue;
    if (!receiptGoalIds.has(goalId)) {
      receiptGoalIds.set(goalId, extractContent(result));
    }
  }

  const closedGoalIds = new Set();
  for (const result of closureSearch.results ?? []) {
    const goalId = extractGoalId(result);
    if (goalId) closedGoalIds.add(goalId);
  }

  const blockedGoalIds = new Map();
  for (const result of blockedSearch.results ?? []) {
    const goalId = extractGoalId(result);
    if (!goalId) continue;
    blockedGoalIds.set(goalId, { reason: "keyword-match", content: extractContent(result) });
  }

  const unfinished = [];
  for (const [goalId, content] of receiptGoalIds.entries()) {
    if (!closedGoalIds.has(goalId)) {
      const blocked = blockedGoalIds.get(goalId);
      unfinished.push({
        goalId,
        reason: blocked ? `unfinished + ${blocked.reason}` : "unfinished",
        content: blocked?.content || content,
      });
      blockedGoalIds.delete(goalId);
    }
  }

  const blocked = Array.from(blockedGoalIds.entries()).map(([goalId, info]) => ({
    goalId,
    reason: info.reason,
    content: info.content,
  }));

  const goals = [...unfinished, ...blocked].slice(0, MAX_GOALS);
  return { ok: true, goals };
}

/**
 * Format a short, content-free summary of blocked/unfinished goals for prompt
 * injection. Returns undefined when there are no goals or memory is disabled.
 */
export function formatBlockedGoalsSummary(goals) {
  if (!goals || goals.length === 0) return undefined;
  const lines = goals.map((g) => `- ${g.goalId} (${g.reason})`).slice(0, 10);
  return [
    "## Eden-memory blocked/unfinished goals",
    "",
    ...lines,
    "",
    goals.length > 10 ? `...and ${goals.length - 10} more.` : "",
    "Consider resuming these goals if they are still relevant.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export const _testing = {
  extractGoalId,
  extractContent,
};
