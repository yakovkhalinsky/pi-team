/**
 * Path A thin native extension shell for pi-agents-team.
 *
 * Replaces the heavy /team overlay with a minimal extension that:
 * - discovers role profiles from .pi/agents/*.md (and ~/.pi/agent/agents/*.md)
 * - implements real delegate_task / wait_for_agents tools via worker Pi processes
 * - registers a /agents slash command that lists discovered agents
 * - injects a short, deterministic agent list into the orchestrator system prompt
 * - records a lightweight state entry on session start
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import { CONFIG_DIR_NAME, getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { extractFinalAnswer, parseFinalAnswerSummaryFields } from "../../runtime/final-answer.js";
import { cleanupTempPrompt, spawnWorker, writeTempPrompt } from "../../runtime/worker-spawn.js";
import {
  createMemoryStatusTracker,
  findBlockedOrUnfinishedGoals,
  formatBlockedGoalsSummary,
  health,
  recordGoalReceipt,
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
  const userDir = path.join(getAgentDir(), "agents");
  const projectDir = findProjectAgentsDir(cwd);
  const packageDir = getPackageAgentsDir();

  const userAgents = loadAgentsFromDir(userDir, "user");
  const projectAgents = projectDir ? loadAgentsFromDir(projectDir, "project") : [];
  const packageAgents = loadAgentsFromDir(packageDir, "package");

  const map = new Map();
  for (const agent of userAgents) map.set(agent.name, agent);
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

const TERMINAL_STATUSES = new Set(["completed", "error", "exited", "aborted"]);

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
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
    "When you are finished, wrap your complete final response in a single XML block: `<final_answer> ... </final_answer>`. Do not include any other content after this block.";
  return `${instruction}\n\n${body}`;
}

function makeDelegateResult(workerId, status, result, error) {
  const payload = { workerId, status, result: result ?? {} };
  if (error) payload.error = error;
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
};

export default function (pi, options = {}) {
  let memoryTracker = null;
  let lastBlockedGoals = [];

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

  pi.on("session_start", async (_event, ctx) => {
    recordState();
    const agents = discoverAgents(ctx.cwd ?? process.cwd());
    if (agents.length > 0 && ctx?.hasUI) {
      ctx.ui.notify(`Pi Agents Team (Path A) loaded ${agents.length} agent profile(s).`, "info");
    }

    const edenOptions = resolveEdenOptions(process.env);
    if (edenOptions.enabled === true) {
      memoryTracker = createMemoryStatusTracker({
        enabled: true,
        health,
        edenOptions,
        healthIntervalMs: 60_000,
      });
      memoryTracker.startPolling();

      void (async () => {
        try {
          const healthResult = await health(edenOptions);
          memoryTracker.updateFromHealthResult(healthResult);
          if (!healthResult.ok) {
            logMemoryWarning(`Eden-memory health check failed: ${healthResult.error}`);
            return;
          }

          const receiptResult = await recordGoalReceipt(
            `session_start ${new Date().toISOString()}`,
            { edenOptions, edenMemoryStatus: memoryTracker.status },
            { packageName: "pi-agents-team" },
          );
          memoryTracker.updateFromWriteResult(receiptResult);

          const blockedResult = await findBlockedOrUnfinishedGoals(edenOptions);
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
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const cwd = ctx.cwd ?? process.cwd();
    if (!hasProjectAgents(cwd)) return undefined;

    const agents = discoverAgents(cwd);
    if (agents.length === 0) return undefined;

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
        createWorkerRecord(workerId, params.profileName, params.title);
        settleWorker(workerId, { status: "error", error });
        return makeDelegateResult(workerId, "error", {}, error);
      }

      createWorkerRecord(workerId, params.profileName, params.title);

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
        const result = await spawnWorker({
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
        });

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
          return makeDelegateResult(workerId, "error", { ...summary, finalAnswer: finalAnswerText }, error);
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
          return makeDelegateResult(workerId, "error", { ...summary, finalAnswer: finalAnswerText }, error);
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
        return makeDelegateResult(workerId, "completed", workerResult);
      } catch (err) {
        const error = err?.message ?? String(err);
        settleWorker(workerId, { status: "error", error });
        recordWorkerCompletion(workerId, params, "error");
        return makeDelegateResult(workerId, "error", {}, error);
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

      while (true) {
        const allTerminal = ids.every((id) => {
          const w = workers.get(id);
          return w ? isTerminalStatus(w.status) : true;
        });
        if (allTerminal) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ reason: "all_terminal", workers: snapshotWorkers() }),
              },
            ],
          };
        }

        if (wakeOnRelay) {
          const relayQuestions = ids.flatMap((id) => {
            const w = workers.get(id);
            if (!w) return [];
            return (w.pendingRelayQuestions ?? []).map((q) => ({ workerId: id, ...q }));
          });
          const newRelays = formatRelayList(relayQuestions);
          if (newRelays.length > 0) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    reason: "relay_raised",
                    workers: snapshotWorkers(),
                    newRelays,
                  }),
                },
              ],
            };
          }
        }

        if (Date.now() - start >= timeoutMs) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ reason: "timeout", workers: snapshotWorkers() }),
              },
            ],
          };
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
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
        return;
      }

      const agent = findAgentByQuery(agents, query);
      if (!agent) {
        const available = agents.map((a) => a.name).join(", ") || "none";
        sendAgentOutput(
          pi,
          ctx,
          `Agent "${query}" not found. Available agents: ${available}.`,
        );
        return;
      }

      sendAgentOutput(pi, ctx, formatAgentDetail(agent));
    },
  });

  recordState();
}
