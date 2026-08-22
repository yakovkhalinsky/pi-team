/**
 * Path A thin native extension shell for pi-agents-team.
 *
 * Replaces the heavy /team overlay with a minimal extension that:
 * - discovers role profiles from .pi/agents/*.md (and ~/.pi/agent/agents/*.md)
 * - registers stub delegate_task / wait_for_agents tools
 * - registers a /agents slash command that lists discovered agents
 * - injects a short, deterministic agent list into the orchestrator system prompt
 * - records a lightweight state entry on session start
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import { CONFIG_DIR_NAME, getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

const STATE_CUSTOM_TYPE = "pi-agents-team/state";
const AGENTS_MESSAGE_TYPE = "pi-agents-team/agents-list";

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

function discoverAgents(cwd) {
  const userDir = path.join(getAgentDir(), "agents");
  const projectDir = findProjectAgentsDir(cwd);

  const userAgents = loadAgentsFromDir(userDir, "user");
  const projectAgents = projectDir ? loadAgentsFromDir(projectDir, "project") : [];

  const map = new Map();
  for (const agent of userAgents) map.set(agent.name, agent);
  for (const agent of projectAgents) map.set(agent.name, agent);

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function hasProjectAgents(cwd) {
  const dir = findProjectAgentsDir(cwd);
  if (!dir) return false;
  return loadAgentsFromDir(dir, "project").length > 0;
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

const DelegateTaskSchema = Type.Object(
  {
    title: Type.String({ description: "Short title for the delegated task" }),
    goal: Type.String({ description: "What the agent should accomplish" }),
    profileName: Type.String({ description: "Agent role profile name" }),
    cwd: Type.Optional(Type.String({ description: "Working directory for the agent" })),
  },
  { additionalProperties: false },
);

const WaitForAgentsSchema = Type.Object(
  {
    workerIds: Type.Optional(Type.Array(Type.String(), { description: "Specific worker ids to wait on" })),
    timeoutMs: Type.Optional(Type.Number({ description: "Maximum wait in milliseconds" })),
  },
  { additionalProperties: false },
);

export const _testing = {
  discoverAgents,
  hasProjectAgents,
  formatAgentList,
  buildAgentPromptBlock,
};

export default function (pi) {
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

  pi.on("session_start", async (_event, ctx) => {
    recordState();
    const agents = discoverAgents(ctx.cwd ?? process.cwd());
    if (agents.length > 0 && ctx?.hasUI) {
      ctx.ui.notify(`Pi Agents Team (Path A) loaded ${agents.length} agent profile(s).`, "info");
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const cwd = ctx.cwd ?? process.cwd();
    if (!hasProjectAgents(cwd)) return undefined;

    const agents = discoverAgents(cwd);
    if (agents.length === 0) return undefined;

    const block = buildAgentPromptBlock(agents);
    if (event.systemPrompt.includes(block)) {
      return undefined;
    }

    return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
  });

  pi.registerTool({
    name: "delegate_task",
    label: "Delegate task",
    description: "Stub: records a delegation request for a team agent. Full worker delegation is not implemented in the Path A shell.",
    parameters: DelegateTaskSchema,
    async execute(_toolCallId, params) {
      return {
        content: [
          {
            type: "text",
            text: `delegate_task stub: would dispatch "${params.profileName}" for "${params.title}". Goal: ${params.goal}`,
          },
        ],
      };
    },
  });

  pi.registerTool({
    name: "wait_for_agents",
    label: "Wait for agents",
    description: "Stub: returns immediately. Real agent synchronization is not implemented in the Path A shell.",
    parameters: WaitForAgentsSchema,
    async execute(_toolCallId, params) {
      return {
        content: [
          {
            type: "text",
            text: `wait_for_agents stub: requested workers=${params.workerIds?.join(",") ?? "all"}; timeout=${params.timeoutMs ?? "default"}.`,
          },
        ],
      };
    },
  });

  pi.registerCommand("agents", {
    description: "List discovered team agents from .pi/agents/*.md",
    handler: async (_args, ctx) => {
      const cwd = ctx.cwd ?? process.cwd();
      const agents = discoverAgents(cwd);
      const text = agents.length === 0 ? "No agents discovered." : formatAgentList(agents);
      pi.sendMessage({
        customType: AGENTS_MESSAGE_TYPE,
        content: [{ type: "text", text }],
        display: true,
      });
    },
  });

  recordState();
}
