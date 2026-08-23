/**
 * Path A thin native extension shell for pi-agents-team.
 *
 * Replaces the heavy /team overlay with a minimal extension that:
 * - discovers role profiles from project-scope .pi/agents/*.md (walking up
 *   from cwd) and the package-scope .pi/agents/*.md shipped with this
 *   extension. The user-scope directory (~/.pi/agent/agents/*.md) is
 *   intentionally NOT consulted — the team is exactly the 6 protocol roles
 *   plus any project-local overrides.
 * - implements real delegate_task / wait_for_agents tools via worker Pi processes
 * - registers a /agents slash command that lists discovered agents
 * - injects a short, deterministic agent list into the orchestrator system prompt
 * - records a lightweight state entry on session start
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import { CONFIG_DIR_NAME, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { extractFinalAnswer, parseFinalAnswerSummaryFields } from "../../runtime/final-answer.js";
import { cleanupTempPrompt, spawnWorker, writeTempPrompt } from "../../runtime/worker-spawn.js";
import {
  aggregateEdenMemoryStatus,
  createMemoryStatusTracker,
  createWorkerEdenMemoryStatus,
  findBlockedOrUnfinishedGoals,
  formatBlockedGoalsSummary,
  health,
  recordClosure,
  recordGoalReceipt,
  recordHandOff,
  recordRecordingAndArchival,
  recordRouting,
  resolveEdenOptions,
} from "../../src/memory/index.js";

const STATE_CUSTOM_TYPE = "pi-agents-team/state";
const AGENTS_MESSAGE_TYPE = "pi-agents-team/agents-list";
const MEMORY_STATUS_TYPE = "pi-agents-team/memory-status";
const MEMORY_BLOCKED_GOALS_TYPE = "pi-agents-team/memory-blocked-goals";

function readPackageVersion() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(here, "../../../package.json");
    const raw = fs.readFileSync(pkgPath, "utf-8");
    return JSON.parse(raw).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const VERSION = readPackageVersion();

function parseToolList(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const tools = raw
    .filter((t) => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean);
  return tools.length > 0 ? tools : undefined;
}

function loadAgentsFromDir(dir, source) {
  const agents = [];
  if (!fs.existsSync(dir)) return agents;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return agents;
  }

  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = path.join(dir, entry.name);
    let content;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter(content);
    if (typeof frontmatter.name !== "string" || typeof frontmatter.description !== "string") {
      continue;
    }

    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: parseToolList(frontmatter.tools),
      model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
      thinkingLevel: typeof frontmatter.thinkingLevel === "string" ? frontmatter.thinkingLevel : undefined,
      systemPrompt: body,
      source,
      filePath,
    });
  }

  return agents;
}

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function findProjectAgentsDir(cwd) {
  let current = cwd;
  while (true) {
    const candidate = path.join(current, CONFIG_DIR_NAME, "agents");
    if (isDirectory(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function getPackageAgentsDir() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../.pi/agents");
}

function discoverAgents(cwd) {
  // The team is "package + project" only. The user-scope directory
  // (~/.pi/agent/agents/*.md) is intentionally excluded so the orchestrator
  // never sees profiles that are not part of the pi-team protocol — in
  // particular, the stock `main` profile shipped with pi core. See
  // docs/bugs/BUG-005-discover-agents-includes-user-scope-main.md.
  const projectDir = findProjectAgentsDir(cwd);
  const packageDir = getPackageAgentsDir();

  const projectAgents = projectDir ? loadAgentsFromDir(projectDir, "project") : [];
  const packageAgents = loadAgentsFromDir(packageDir, "package");

  const map = new Map();
  for (const agent of packageAgents) map.set(agent.name, agent);
  for (const agent of projectAgents) map.set(agent.name, agent);

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function hasProjectAgents(cwd) {
  return discoverAgents(cwd).length > 0;
}

function formatAgentList(agents) {
  if (agents.length === 0) return "none";
  return agents.map((a) => `- ${a.name}: ${a.description}`).join("\n");
}

function buildAgentPromptBlock(agents) {
  return [
    "## Available team agents",
    "",
    formatAgentList(agents),
    "",
    "Use the `delegate_task` tool to assign work to one of these agents.",
    "Use the `wait_for_agents` tool to collect results before proceeding.",
    "Prefer the smallest scoped agent that can complete the next step.",
  ].join("\n");
}

function formatAgentListDetailed(agents) {
  if (agents.length === 0) return "No agents discovered.";
  const lines = ["Available team agents:", ""];
  for (const agent of agents) {
    lines.push(`- ${agent.name}: ${agent.description}`);
    const meta = [];
    if (agent.tools?.length) meta.push(`tools: ${agent.tools.join(", ")}`);
    if (agent.model) meta.push(`model: ${agent.model}`);
    if (agent.thinkingLevel) meta.push(`thinkingLevel: ${agent.thinkingLevel}`);
    if (meta.length) lines.push(`  ${meta.join(" | ")}`);
  }
  lines.push("");
  lines.push('Delegate with: `delegate_task` using profileName "<agent-name>" etc.');
  return lines.join("\n");
}

function formatAgentDetail(agent) {
  const lines = [
    `Agent: ${agent.name}`,
    `Description: ${agent.description}`,
  ];
  if (agent.tools?.length) lines.push(`Tools: ${agent.tools.join(", ")}`);
  if (agent.model) lines.push(`Model: ${agent.model}`);
  if (agent.thinkingLevel) lines.push(`Thinking level: ${agent.thinkingLevel}`);
  lines.push("");
  lines.push(`Delegate with: \`delegate_task\` using profileName "${agent.name}" etc.`);
  if (agent.systemPrompt?.trim()) {
    lines.push("");
    lines.push(agent.systemPrompt.trim());
  }
  return lines.join("\n");
}

function findAgentByQuery(agents, query) {
  const normalized = query.trim().split(/\s+/)[0].toLowerCase();
  return agents.find((a) => a.name.toLowerCase() === normalized);
}

function sendAgentOutput(pi, ctx, text) {
  const send = typeof ctx?.sendMessage === "function" ? ctx.sendMessage.bind(ctx) : pi.sendMessage?.bind(pi);
  if (send) {
    send({
      customType: AGENTS_MESSAGE_TYPE,
      content: [{ type: "text", text }],
      display: true,
    });
    return;
  }
  console.log(text);
}

const DelegateTaskSchema = Type.Object(
  {
    title: Type.String({ description: "Short title for the delegated task" }),
    goal: Type.String({ description: "What the agent should accomplish" }),
    profileName: Type.String({ description: "Agent role profile name" }),
    cwd: Type.Optional(Type.String({ description: "Working directory for the agent" })),
    contextHints: Type.Optional(Type.String({ description: "Additional context for the worker" })),
    expectedOutput: Type.Optional(Type.String({ description: "Expected output format or contents" })),
    pathScopeRoots: Type.Optional(Type.Array(Type.String(), { description: "Path scope roots for the worker" })),
    skills: Type.Optional(Type.Array(Type.String(), { description: "Skill names to enable in the worker" })),
    timeoutMs: Type.Optional(Type.Number({ description: "Maximum time to wait for the worker in milliseconds" })),
  },
  { additionalProperties: false },
);

const WaitForAgentsSchema = Type.Object(
  {
    workerIds: Type.Optional(Type.Array(Type.String(), { description: "Specific worker ids to wait on" })),
    timeoutMs: Type.Optional(Type.Number({ description: "Maximum wait in milliseconds" })),
    wakeOnRelay: Type.Optional(Type.Boolean({ description: "Return early if a worker raises a relay question" })),
  },
  { additionalProperties: false },
);

const AbortWorkerSchema = Type.Object(
  {
    workerId: Type.String({ description: "Worker id to terminate" }),
  },
  { additionalProperties: false },
);

const TERMINAL_STATUSES = new Set(["completed", "error", "exited", "aborted"]);

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

export const TEAM_STATUS_KEY = "pi-agents-team";
export const TEAM_WIDGET_KEY = "pi-agents-team";

/**
 * Snapshot of everything the team-status widget needs to render. Pure data —
 * no UI references, no closure references. Tests can build and assert on this
 * without standing up a UI surface.
 */
export function buildTeamSnapshot(agents, workers, memoryTracker, lastBlockedGoals) {
  const workerList = Array.from(workers.values());
  const running = workerList.filter((w) => !isTerminalStatus(w.status));
  const completed = workerList.filter((w) => w.status === "completed").length;
  const errored = workerList.filter((w) => w.status === "error" || w.status === "aborted").length;

  let memory = null;
  if (memoryTracker?.status?.enabled) {
    const byMarker = memoryTracker.status.byMarker ?? {};
    const histogramEntries = Object.entries(byMarker)
      .map(([marker, count]) => ({ marker, count }))
      .sort((a, b) => a.marker.localeCompare(b.marker));
    memory = {
      enabled: true,
      ok: memoryTracker.status.healthy === true,
      lastError: memoryTracker.status.lastError ?? null,
      blockedGoalCount: lastBlockedGoals.length,
      byMarker: histogramEntries,
    };
  }

  return {
    agentCount: agents.length,
    agents: agents.map((a) => ({ name: a.name, description: a.description, source: a.source })),
    workers: {
      total: workerList.length,
      running: running.map((w) => ({ workerId: w.workerId, profileName: w.profileName, title: w.title })),
      completed,
      errored,
    },
    memory,
  };
}

function fmt(text) {
  return text;
}

/**
 * One-line summary for the footer status slot. Always non-empty. Pure: only
 * depends on the snapshot.
 */
export function buildStatusLine(snapshot) {
  const { agentCount, workers, memory } = snapshot;
  const parts = [];
  parts.push(`Team (${agentCount} agent${agentCount === 1 ? "" : "s"})`);
  if (workers.total > 0) {
    if (workers.running.length > 0) {
      const names = workers.running.map((w) => w.profileName).join(", ");
      parts.push(`${workers.running.length} running: ${names}`);
    } else {
      parts.push(`${workers.completed} done, ${workers.errored} failed`);
    }
  }
  if (memory?.enabled) {
    parts.push(memory.ok ? "memory: ok" : "memory: degraded");
    if (memory.blockedGoalCount > 0) parts.push(`${memory.blockedGoalCount} blocked`);
  }
  return parts.join(" | ");
}

/**
 * Multi-line panel for the below-editor widget. Pure. Caps at ~30 lines so it
 * doesn't push the chat scrollback too far.
 */
export function buildWidgetLines(snapshot) {
  const lines = [];
  lines.push(`Pi Agents Team — ${snapshot.agentCount} agent${snapshot.agentCount === 1 ? "" : "s"} discovered`);
  lines.push("");

  if (snapshot.agentCount > 0) {
    lines.push("Agents:");
    const shown = snapshot.agents.slice(0, 12);
    for (const a of shown) {
      lines.push(`  - ${a.name} (${a.source}): ${a.description}`);
    }
    if (snapshot.agents.length > shown.length) {
      lines.push(`  … and ${snapshot.agents.length - shown.length} more (use /agents)`);
    }
    lines.push("");
  } else {
    lines.push("No agents discovered. Place profiles in .pi/agents/*.md");
    lines.push("");
  }

  if (snapshot.workers.total > 0) {
    lines.push("Workers:");
    if (snapshot.workers.running.length > 0) {
      for (const w of snapshot.workers.running) {
        lines.push(`  ● ${w.profileName} — ${w.title} (${w.workerId})`);
      }
    }
    lines.push(
      `  total: ${snapshot.workers.total} · done: ${snapshot.workers.completed} · failed: ${snapshot.workers.errored}`,
    );
    lines.push("");
  }

  if (snapshot.memory) {
    lines.push(`Memory: ${snapshot.memory.ok ? "ok" : "degraded"}`);
    if (snapshot.memory.lastError) lines.push(`  last error: ${snapshot.memory.lastError}`);
    if (snapshot.memory.blockedGoalCount > 0) {
      lines.push(`  blocked goals: ${snapshot.memory.blockedGoalCount}`);
    }
    if (snapshot.memory.byMarker.length > 0) {
      lines.push("  byMarker:");
      for (const e of snapshot.memory.byMarker) {
        lines.push(`    ${e.marker}: ${e.count}`);
      }
    }
    lines.push("");
  } else {
    lines.push("Memory: disabled (EDEN_MEMORY_ENABLED not set)");
    lines.push("");
  }

  lines.push("Use /team to toggle this panel. /agents for details.");

  return lines.slice(0, 40);
}

export function collectWorkerResult(record) {
  if (record.status === "completed") {
    return { result: record.result ?? {} };
  }
  if (isTerminalStatus(record.status)) {
    return { error: record.error ?? "Worker ended without result" };
  }
  return {};
}

export function formatRelayList(pendingRelayQuestions) {
  return (pendingRelayQuestions ?? []).map((q) => ({
    workerId: q.workerId,
    questionId: q.questionId ?? `relay-${Math.random().toString(36).slice(2, 8)}`,
    question: q.question ?? q.text ?? "Unspecified relay question",
    askedAt: q.askedAt ?? Date.now(),
  }));
}

function extractAssistantText(event) {
  if (typeof event !== "object" || event === null) return undefined;
  if (event.type && event.type !== "message_update") return undefined;

  const message = event.message ?? event.assistantMessageEvent ?? event.assistant_message ?? event;
  if (message.role && message.role !== "assistant") return undefined;

  const content = message.content;
  if (Array.isArray(content)) {
    const text = content
      .filter((part) => part && part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    return text || undefined;
  }
  if (typeof content === "string" && content.length > 0) return content;
  if (typeof message.text === "string" && message.text.length > 0) return message.text;

  return undefined;
}

function scanRelayQuestion(text) {
  const relayMatch = /relay_question:\s*(.+?)(?=\n\s*(?:\w+:|<\/final_answer>)|$)/is.exec(text);
  if (!relayMatch) return null;
  const question = relayMatch[1].trim();
  const assumptionMatch = /assumption:\s*(.+?)(?=\n\s*(?:\w+:|<\/final_answer>)|$)/is.exec(text);
  const assumption = assumptionMatch?.[1]?.trim();
  return {
    question,
    assumption,
    questionId: `relay-${Math.random().toString(36).slice(2, 8)}`,
  };
}

const workers = new Map();

function generateWorkerId() {
  return `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createWorkerRecord(workerId, profileName, title) {
  const record = {
    workerId,
    profileName,
    title,
    status: "running",
    startTime: Date.now(),
    pendingRelayQuestions: [],
  };
  workers.set(workerId, record);
  return record;
}
function settleWorker(workerId, update) {
  const record = workers.get(workerId);
  if (!record) return;
  Object.assign(record, update, { endTime: Date.now() });
}

function buildWorkerTaskText(params) {
  const parts = [params.goal];
  if (params.contextHints) parts.push(`\n\nContext hints:\n${params.contextHints}`);
  if (params.expectedOutput) parts.push(`\n\nExpected output:\n${params.expectedOutput}`);
  if (params.pathScopeRoots?.length) {
    parts.push(`\n\nPath scope roots:\n${params.pathScopeRoots.join("\n")}`);
  }
  if (params.skills?.length) {
    parts.push(`\n\nSkills:\n${params.skills.join(", ")}`);
  }
  const body = parts.join("");
  const instruction =
    "When you are finished, wrap your complete final response in a single XML block: `<final_answer> ... <\/final_answer>`. Do not include any other content after this block.";
  return `${instruction}\n\n${body}`;
}

function makeDelegateResult(workerId, status, result, error, memory) {
  const payload = { workerId, status, result: result ?? {} };
  if (error) payload.error = error;
  if (memory) payload.memory = memory;
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

export const _testing = {
  discoverAgents,
  hasProjectAgents,
  formatAgentList,
  formatAgentListDetailed,
  formatAgentDetail,
  buildAgentPromptBlock,
  findAgentByQuery,
  sendAgentOutput,
  getWorkerMap: () => workers,
  clearWorkers: () => workers.clear(),
  buildWorkerTaskText,
  isTerminalStatus,
  collectWorkerResult,
  formatRelayList,
  resolveEdenOptions,
  findBlockedOrUnfinishedGoals,
  formatBlockedGoalsSummary,
  // Team-status widget helpers. The keys are stable strings used as the
  // status/widget slot identifiers on the pi UI surface; the builders are
  // pure functions that tests can exercise without a UI mock.
  TEAM_STATUS_KEY,
  TEAM_WIDGET_KEY,
  buildTeamSnapshot,
  buildStatusLine,
  buildWidgetLines,
};

export default function (pi, options = {}) {
  let memoryTracker = null;
  let lastBlockedGoals = [];
  let blockedGoalsReady = Promise.resolve();

  function recordState() {
    try {
      pi.appendEntry(STATE_CUSTOM_TYPE, {
        type: STATE_CUSTOM_TYPE,
        version: VERSION,
      });
    } catch {
      // State recording is best-effort; ignore if no session is active yet.
    }
  }

  function logMemoryWarning(message) {
    try {
      pi.appendEntry(MEMORY_STATUS_TYPE, {
        type: MEMORY_STATUS_TYPE,
        level: "warning",
        message,
      });
    } catch {
      // Best-effort logging.
    }
  }

  // Team-status UI state. Per-session so /new, /resume, /fork get a clean
  // panel and footer. The workers map is module-scoped, but we clear it on
  // session_start so per-session freshness is real.
  let widgetVisible = false;
  let lastUiCtx = null;

  function clearUi() {
    const ui = lastUiCtx?.ui;
    if (!ui) return;
    try {
      if (typeof ui.setStatus === "function") ui.setStatus(TEAM_STATUS_KEY, undefined);
      if (typeof ui.setWidget === "function") ui.setWidget(TEAM_WIDGET_KEY, undefined);
    } catch {
      // Best-effort.
    }
    lastUiCtx = null;
  }

  function refreshUi(ctx) {
    // Stash the ctx so /team and /agents can re-render without needing one.
    if (ctx) lastUiCtx = ctx;
    const uiCtx = lastUiCtx;
    if (!uiCtx?.ui) return;
    const ui = uiCtx.ui;
    if (typeof ui.setStatus !== "function" && typeof ui.setWidget !== "function") return;

    let snapshot;
    try {
      const agents = discoverAgents(uiCtx.cwd ?? process.cwd());
      snapshot = buildTeamSnapshot(agents, workers, memoryTracker, lastBlockedGoals);
    } catch (err) {
      // Discovery failed (e.g. permission error). Render a minimal status.
      const fallback = "Team (unavailable)";
      if (typeof ui.setStatus === "function") ui.setStatus(TEAM_STATUS_KEY, fallback);
      if (widgetVisible && typeof ui.setWidget === "function") {
        ui.setWidget(TEAM_WIDGET_KEY, [fallback, String(err?.message ?? err)]);
      }
      return;
    }

    const statusLine = buildStatusLine(snapshot);
    if (typeof ui.setStatus === "function") ui.setStatus(TEAM_STATUS_KEY, statusLine);
    if (typeof ui.setWidget === "function") {
      if (widgetVisible) {
        ui.setWidget(TEAM_WIDGET_KEY, buildWidgetLines(snapshot), { placement: "belowEditor" });
      } else {
        ui.setWidget(TEAM_WIDGET_KEY, undefined);
      }
    }
  }

  /**
   * Build the aggregated memory block for tool payloads. Always returns
   * undefined when memory is disabled, so callers can omit the key entirely.
   */
  function buildMemoryPayload() {
    const workerStatuses = Array.from(workers.values())
      .map((w) => w.edenMemoryStatus)
      .filter((s) => s && s.enabled);
    return aggregateEdenMemoryStatus(memoryTracker?.status, workerStatuses);
  }

  function attachWorkerMemoryStatus(record) {
    if (!memoryTracker?.status?.enabled) return;
    record.edenMemoryStatus = createWorkerEdenMemoryStatus(true);
  }

  function recordWorkerCompletion(workerId, params, status) {
    if (!memoryTracker?.status?.enabled) return;
    const edenOptions = resolveEdenOptions(process.env);
    void recordRecordingAndArchival(
      `worker ${workerId} finished with status ${status}`,
      { edenOptions, edenMemoryStatus: memoryTracker.status },
      {
        goalId: params.goal,
        taskId: workerId,
        workerId,
        profileName: params.profileName,
        packageName: "pi-agents-team",
        status,
      },
    ).catch(() => {});
  }

  /**
   * Notify the team-status UI that a worker just changed state. Called from
   * the tool bodies (delegate_task, abort_worker, wait_for_agents) and from
   * the /stop-worker command. The agent-loop tool_execution_end hook also
   * calls refreshUi directly, so this is belt-and-braces: even if a tool
   * is invoked outside the agent loop (e.g. from a test), the UI updates.
   */
  function onWorkerStateChanged(ctx) {
    if (ctx) refreshUi(ctx);
  }

  pi.on("session_start", async (_event, ctx) => {
    recordState();
    // Per-session freshness: clear any workers left over from a previous
    // session in this process. (Module-scope map, but the session lifecycle
    // is the right boundary.)
    workers.clear();
    lastBlockedGoals = [];
    if (memoryTracker && typeof memoryTracker.stopPolling === "function") {
      try {
        memoryTracker.stopPolling();
      } catch {
        // Best-effort.
      }
    }
    memoryTracker = null;
    widgetVisible = false;
    lastUiCtx = ctx;
    const agents = discoverAgents(ctx.cwd ?? process.cwd());
    if (agents.length > 0 && ctx?.hasUI) {
      ctx.ui.notify(`Pi Agents Team (Path A) loaded ${agents.length} agent profile(s).`, "info");
    }
    // Set the footer status immediately so the user sees team mode is active,
    // even before any tool runs.
    refreshUi(ctx);

    const edenOptions = resolveEdenOptions(process.env);
    if (edenOptions.enabled === true) {
      memoryTracker = createMemoryStatusTracker({
        enabled: true,
        health,
        edenOptions,
        healthIntervalMs: 60_000,
        healthTimeoutMs: 15_000,
      });
      memoryTracker.startPolling();

      const startupSignal = AbortSignal.timeout(15_000);
      blockedGoalsReady = (async () => {
        try {
          const healthResult = await health(edenOptions, startupSignal);
          memoryTracker.updateFromHealthResult(healthResult);
          if (!healthResult.ok) {
            logMemoryWarning(`Eden-memory health check failed: ${healthResult.error}`);
            return;
          }

          const receiptResult = await recordGoalReceipt(
            `session_start ${new Date().toISOString()}`,
            { edenOptions, edenMemoryStatus: memoryTracker.status, signal: startupSignal },
            { packageName: "pi-agents-team" },
          );
          memoryTracker.updateFromWriteResult(receiptResult);

          const blockedResult = await findBlockedOrUnfinishedGoals(edenOptions, startupSignal);
          if (blockedResult.ok) {
            lastBlockedGoals = blockedResult.goals;
            if (lastBlockedGoals.length > 0) {
              try {
                pi.appendEntry(MEMORY_BLOCKED_GOALS_TYPE, {
                  type: MEMORY_BLOCKED_GOALS_TYPE,
                  count: lastBlockedGoals.length,
                  goals: lastBlockedGoals.slice(0, 10).map((g) => ({ goalId: g.goalId, reason: g.reason })),
                });
              } catch {
                // Best-effort entry.
              }
            }
          } else {
            logMemoryWarning(`Eden-memory blocked-goals query failed: ${blockedResult.error}`);
          }
        } catch (err) {
          logMemoryWarning(`Eden-memory startup check error: ${err?.message ?? String(err)}`);
        }
      })();
    } else {
      blockedGoalsReady = Promise.resolve();
    }
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    // Clear the team-status UI surfaces. Worker map is cleared at the next
    // session_start.
    clearUi();
    if (memoryTracker && typeof memoryTracker.stopPolling === "function") {
      try {
        memoryTracker.stopPolling();
      } catch {
        // Best-effort.
      }
    }
    if (!memoryTracker?.status?.enabled) return;
    // Wait for any in-flight startup work so we don't race the closure write.
    // Capped so a hung eden-memory CLI never blocks session shutdown.
    try {
      await Promise.race([
        blockedGoalsReady,
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    } catch {
      // Best-effort.
    }
    const edenOptions = resolveEdenOptions(process.env);
    await recordClosure(
      "session-shutdown",
      { edenOptions, edenMemoryStatus: memoryTracker.status },
      { packageName: "pi-agents-team" },
    ).catch(() => {});
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const cwd = ctx.cwd ?? process.cwd();
    if (!hasProjectAgents(cwd)) return undefined;

    const agents = discoverAgents(cwd);
    if (agents.length === 0) return undefined;

    // Wait for the session-start blocked-goals lookup to settle before we
    // decide whether to inject the summary. Capped so a hung CLI never blocks
    // the agent.
    try {
      await Promise.race([
        blockedGoalsReady,
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    } catch {
      // Best-effort.
    }

    const block = buildAgentPromptBlock(agents);
    const blockedSummary = formatBlockedGoalsSummary(lastBlockedGoals);
    const injection = blockedSummary ? `${block}\n\n${blockedSummary}` : block;

    if (event.systemPrompt.includes(block)) {
      return blockedSummary && !event.systemPrompt.includes(blockedSummary)
        ? { systemPrompt: `${event.systemPrompt}\n\n${blockedSummary}` }
        : undefined;
    }

    return { systemPrompt: `${event.systemPrompt}\n\n${injection}` };
  });

  pi.on("turn_start", async (_event, ctx) => {
    refreshUi(ctx);
  });

  pi.on("turn_end", async (_event, ctx) => {
    refreshUi(ctx);
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    if (event.toolName === "delegate_task" || event.toolName === "abort_worker") {
      // Refresh after a microtask so the worker record exists in the map.
      queueMicrotask(() => refreshUi(ctx));
    }
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    if (
      event.toolName === "delegate_task" ||
      event.toolName === "abort_worker" ||
      event.toolName === "wait_for_agents"
    ) {
      refreshUi(ctx);
    }
  });

  pi.registerTool({
    name: "delegate_task",
    label: "Delegate task",
    description: "Spawn a worker Pi process for a team agent and return its final answer.",
    parameters: DelegateTaskSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const workerId = generateWorkerId();
      const cwd = params.cwd ?? ctx?.cwd ?? process.cwd();
      const agents = discoverAgents(cwd);
      const agent = agents.find((a) => a.name === params.profileName);

      if (!agent) {
        const available = agents.map((a) => a.name).join(", ") || "none";
        const error = `Unknown agent profile: "${params.profileName}". Available: ${available}.`;
        const errorRecord = createWorkerRecord(workerId, params.profileName, params.title);
        attachWorkerMemoryStatus(errorRecord);
        settleWorker(workerId, { status: "error", error });
        onWorkerStateChanged(ctx);
        return makeDelegateResult(workerId, "error", {}, error, buildMemoryPayload());
      }

      const record = createWorkerRecord(workerId, params.profileName, params.title);
      attachWorkerMemoryStatus(record);
      onWorkerStateChanged(ctx);

      if (memoryTracker?.status?.enabled) {
        const edenOptions = resolveEdenOptions(process.env);
        void recordRouting(
          `delegated "${params.title}" to ${params.profileName}`,
          { edenOptions, edenMemoryStatus: memoryTracker.status },
          {
            goalId: params.goal,
            taskId: workerId,
            workerId,
            profileName: params.profileName,
            packageName: "pi-agents-team",
          },
        ).catch(() => {});
      }

      let tmpFilePath = null;
      let tmpDir = null;

      try {
        if (agent.systemPrompt?.trim()) {
          const tmp = await writeTempPrompt(agent.name, agent.systemPrompt);
          tmpFilePath = tmp.filePath;
          tmpDir = tmp.dir;
        }

        const task = buildWorkerTaskText(params);

        const onLine = (line) => {
          let assistantText;
          try {
            assistantText = extractAssistantText(JSON.parse(line));
          } catch {
            return;
          }
          if (!assistantText) return;
          const relay = scanRelayQuestion(assistantText);
          if (relay && record.pendingRelayQuestions.length === 0) {
            record.pendingRelayQuestions.push({
              workerId,
              questionId: relay.questionId,
              question: relay.assumption
                ? `${relay.question} (assumption: ${relay.assumption})`
                : relay.question,
              askedAt: Date.now(),
            });
          }
        };

        const controller = spawnWorker({
          command: options.command ?? "pi",
          cwd,
          systemPromptPath: tmpFilePath ?? undefined,
          tools: agent.tools,
          model: agent.model,
          thinkingLevel: agent.thinkingLevel,
          allowSkills: Boolean(params.skills?.length),
          extraArgs: [task],
          timeoutMs: params.timeoutMs ?? 300_000,
          spawnImpl: options.spawnImpl,
          signal: _signal,
          onLine,
        });
        record.controller = controller;
        const result = await controller.promise;

        const finalAnswerText = extractFinalAnswer(result.stdout);
        const summary = finalAnswerText ? parseFinalAnswerSummaryFields(finalAnswerText) : {};

        if (result.error || result.exitCode !== 0) {
          const error = result.error || `Worker exited with code ${result.exitCode}`;
          settleWorker(workerId, {
            status: "error",
            error,
            stderr: result.stderr,
            stdout: result.stdout,
            exitCode: result.exitCode ?? null,
          });
          recordWorkerCompletion(workerId, params, "error");
          onWorkerStateChanged(ctx);
          return makeDelegateResult(workerId, "error", { ...summary, finalAnswer: finalAnswerText }, error, buildMemoryPayload());
        }

        if (!finalAnswerText) {
          const error = "No <final_answer> block found in worker output";
          settleWorker(workerId, {
            status: "error",
            error,
            stderr: result.stderr,
            stdout: result.stdout,
            exitCode: result.exitCode ?? null,
          });
          recordWorkerCompletion(workerId, params, "error");
          onWorkerStateChanged(ctx);
          return makeDelegateResult(workerId, "error", { ...summary, finalAnswer: finalAnswerText }, error, buildMemoryPayload());
        }

        const workerResult = { ...summary, finalAnswer: finalAnswerText };
        settleWorker(workerId, {
          status: "completed",
          result: workerResult,
          finalAnswer: finalAnswerText,
          stderr: result.stderr,
          stdout: result.stdout,
          exitCode: result.exitCode ?? 0,
        });
        recordWorkerCompletion(workerId, params, "completed");
        onWorkerStateChanged(ctx);
        return makeDelegateResult(workerId, "completed", workerResult, undefined, buildMemoryPayload());
      } catch (err) {
        const error = err?.message ?? String(err);
        settleWorker(workerId, { status: "error", error });
        recordWorkerCompletion(workerId, params, "error");
        onWorkerStateChanged(ctx);
        return makeDelegateResult(workerId, "error", {}, error, buildMemoryPayload());
      } finally {
        await cleanupTempPrompt(tmpFilePath, tmpDir);
      }
    },
  });

  pi.registerTool({
    name: "wait_for_agents",
    label: "Wait for agents",
    description: "Wait for delegated workers to finish and return their statuses.",
    parameters: WaitForAgentsSchema,
    async execute(_toolCallId, params) {
      const ids = params.workerIds ?? Array.from(workers.keys());
      const timeoutMs = params.timeoutMs ?? 300_000;
      const wakeOnRelay = params.wakeOnRelay ?? true;
      const pollInterval = 200;
      const start = Date.now();

      function snapshotWorker(id) {
        const w = workers.get(id);
        if (!w) {
          return { workerId: id, status: "error", error: "Worker not found" };
        }
        return { workerId: w.workerId, status: w.status, ...collectWorkerResult(w) };
      }

      function snapshotWorkers() {
        return ids.map(snapshotWorker);
      }

      function payload(extra) {
        const out = { ...extra, workers: snapshotWorkers() };
        const memory = buildMemoryPayload();
        if (memory) out.memory = memory;
        return out;
      }

      while (true) {
        if (wakeOnRelay) {
          const relayQuestions = ids.flatMap((id) => {
            const w = workers.get(id);
            if (!w) return [];
            return (w.pendingRelayQuestions ?? []).map((q) => ({ workerId: id, ...q }));
          });
          const newRelays = formatRelayList(relayQuestions);
          if (newRelays.length > 0) {
            onWorkerStateChanged(lastUiCtx);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(payload({ reason: "relay_raised", newRelays })),
                },
              ],
            };
          }
        }

        const allTerminal = ids.every((id) => {
          const w = workers.get(id);
          return w ? isTerminalStatus(w.status) : true;
        });
        if (allTerminal) {
          onWorkerStateChanged(lastUiCtx);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(payload({ reason: "all_terminal" })),
              },
            ],
          };
        }

        if (Date.now() - start >= timeoutMs) {
          onWorkerStateChanged(lastUiCtx);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(payload({ reason: "timeout" })),
              },
            ],
          };
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    },
  });

  pi.registerTool({
    name: "abort_worker",
    label: "Abort worker",
    description: "Terminate a running delegated worker by worker id.",
    parameters: AbortWorkerSchema,
    async execute(_toolCallId, params) {
      const record = workers.get(params.workerId);
      if (!record) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: false, error: "Worker not found" }),
            },
          ],
        };
      }

      if (isTerminalStatus(record.status)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                workerId: record.workerId,
                status: record.status,
                error: `Worker already ${record.status}`,
              }),
            },
          ],
        };
      }

      const killed = record.controller?.child ? record.controller.kill() : false;
      settleWorker(record.workerId, {
        status: "aborted",
        error: killed ? "Worker aborted" : "Worker abort requested",
      });
      recordWorkerCompletion(record.workerId, { goal: record.title, profileName: record.profileName }, "aborted");
      onWorkerStateChanged(lastUiCtx);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              workerId: record.workerId,
              status: record.status,
              killed,
            }),
          },
        ],
      };
    },
  });

  pi.registerCommand("stop-worker", {
    description: "Terminate a running delegated worker: /stop-worker \u003cworkerId\u003e",
    handler: async (args, ctx) => {
      const workerId = typeof args === "string" ? args.trim() : "";
      const record = workers.get(workerId);
      if (!record) {
        sendAgentOutput(pi, ctx, `Worker "${workerId}" not found.`);
        return;
      }

      if (isTerminalStatus(record.status)) {
        sendAgentOutput(pi, ctx, `Worker ${workerId} is already ${record.status}.`);
        return;
      }

      const killed = record.controller?.child ? record.controller.kill() : false;
      settleWorker(workerId, {
        status: "aborted",
        error: killed ? "Worker aborted by command" : "Worker abort requested by command",
      });
      recordWorkerCompletion(workerId, { goal: record.title, profileName: record.profileName }, "aborted");

      sendAgentOutput(
        pi,
        ctx,
        `Worker ${workerId} aborted (${killed ? "kill sent" : "no running controller"}).`,
      );
      refreshUi(ctx);
    },
  });

  pi.registerCommand("team", {
    description: "Toggle the team-status panel below the editor: /team [on|off]",
    handler: async (args, ctx) => {
      const arg = typeof args === "string" ? args.trim().toLowerCase() : "";
      if (arg === "on") widgetVisible = true;
      else if (arg === "off") widgetVisible = false;
      else widgetVisible = !widgetVisible;

      if (widgetVisible) {
        refreshUi(ctx);
        ctx?.ui?.notify?.("Team panel shown. /team to hide.", "info");
      } else {
        // Render once more to clear the widget, but keep the footer status.
        if (ctx?.ui && typeof ctx.ui.setWidget === "function") {
          ctx.ui.setWidget(TEAM_WIDGET_KEY, undefined);
        }
        ctx?.ui?.notify?.("Team panel hidden. /team to show.", "info");
      }
    },
  });

  pi.registerCommand("agents", {
    description: "List discovered team agents from .pi/agents/*.md, or show details: /agents <name>",
    handler: async (args, ctx) => {
      const cwd = ctx.cwd ?? process.cwd();
      const agents = discoverAgents(cwd);
      const query = typeof args === "string" ? args.trim() : "";

      if (!query) {
        sendAgentOutput(pi, ctx, formatAgentListDetailed(agents));
      } else {
        const agent = findAgentByQuery(agents, query);
        if (!agent) {
          const available = agents.map((a) => a.name).join(", ") || "none";
          sendAgentOutput(
            pi,
            ctx,
            `Agent "${query}" not found. Available agents: ${available}.`,
          );
        } else {
          sendAgentOutput(pi, ctx, formatAgentDetail(agent));
        }
      }
      // Keep the team panel in sync with whatever /agents just looked at.
      refreshUi(ctx);
    },
  });

  recordState();
}
