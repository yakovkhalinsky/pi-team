import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import extensionFactory, { _testing } from "../src/extensions/pi-agent-team/index.js";

function createMockPi() {
  const tools: Array<{ name: string; def: any }> = [];
  const commands: Array<{ name: string; def: any }> = [];
  const entries: Array<{ type: string; data: any }> = [];
  const messages: Array<{ customType: string; content: any[]; display: boolean }> = [];
  const handlers = new Map<string, Function[]>();
  const notifs: Array<{ message: string; level: string }> = [];

  const pi = {
    registerTool: (def: any) => tools.push({ name: def.name, def }),
    registerCommand: (name: string, def: any) => commands.push({ name, def }),
    appendEntry: (type: string, data: any) => entries.push({ type, data }),
    sendMessage: (msg: any) => messages.push(msg),
    on: (event: string, handler: Function) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    },
    handlers,
    tools,
    commands,
    entries,
    messages,
    notifs,
  };
  return pi;
}

function createMockContext(overrides: Record<string, any> = {}) {
  const notifs: Array<{ message: string; level: string }> = [];
  return {
    cwd: process.cwd(),
    hasUI: false,
    mode: "api",
    ...overrides,
    ui: {
      notify: (message: string, level: string) => notifs.push({ message, level }),
    },
  };
}

describe("Path A thin extension shell", () => {
  it("registers delegate_task and wait_for_agents tools plus /agents command", () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const toolNames = pi.tools.map((t) => t.name).sort();
    assert.deepEqual(toolNames, ["delegate_task", "wait_for_agents"]);

    const agentsCmd = pi.commands.find((c) => c.name === "agents");
    assert.ok(agentsCmd, "/agents command should be registered");
    assert.ok(agentsCmd.def.handler, "/agents command should have a handler");
  });

  it("records a state entry on load and session_start", () => {
    const pi = createMockPi();
    extensionFactory(pi);
    assert.equal(pi.entries.length, 1);
    assert.equal(pi.entries[0].type, "pi-agents-team/state");
    assert.equal(pi.entries[0].data.type, "pi-agents-team/state");
    assert.ok(typeof pi.entries[0].data.version === "string");

    const sessionStartHandlers = pi.handlers.get("session_start") ?? [];
    assert.equal(sessionStartHandlers.length, 1);
    void sessionStartHandlers[0]({ reason: "startup" }, createMockContext({ hasUI: true }));
    assert.equal(pi.entries.length, 2);
  });

  it("discovers the six role agents from .pi/agents/*.md", () => {
    const agents = _testing.discoverAgents(process.cwd());
    const names = agents.map((a) => a.name);
    for (const required of ["archivist", "builder", "dispatcher", "researcher", "runtime", "verifier"]) {
      assert.ok(names.includes(required), `should discover ${required}`);
    }
    assert.ok(agents.every((a) => typeof a.description === "string" && a.description.length > 0));
  });

  it("injects a deterministic agent list into the orchestrator system prompt", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const handler = pi.handlers.get("before_agent_start")?.[0];
    assert.ok(handler, "before_agent_start handler should be registered");

    const basePrompt = "You are a helpful coding assistant.";
    const result = await handler({ systemPrompt: basePrompt }, createMockContext());
    assert.ok(result, "should return a modified prompt when project agents exist");
    assert.ok(result.systemPrompt.includes("Available team agents"));
    assert.ok(result.systemPrompt.includes("dispatcher:"));
    assert.ok(result.systemPrompt.includes("delegate_task"));
    assert.ok(result.systemPrompt.includes("wait_for_agents"));
  });

  it("does not duplicate the agent block if already present", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const handler = pi.handlers.get("before_agent_start")?.[0];
    const block = _testing.buildAgentPromptBlock(_testing.discoverAgents(process.cwd()));
    const basePrompt = `You are a helpful coding assistant.\n\n${block}`;
    const result = await handler({ systemPrompt: basePrompt }, createMockContext());
    assert.equal(result, undefined);
  });

  it("/agents command sends a formatted agent list", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const cmd = pi.commands.find((c) => c.name === "agents")!;
    await cmd.def.handler("", createMockContext());

    assert.equal(pi.messages.length, 1);
    assert.equal(pi.messages[0].customType, "pi-agents-team/agents-list");
    const text = pi.messages[0].content[0].text as string;
    assert.ok(text.includes("builder:"));
    assert.ok(text.includes("verifier:"));
  });

  it("delegate_task tool returns a stub response", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const tool = pi.tools.find((t) => t.name === "delegate_task")!.def;
    const result = await tool.execute("call-1", {
      title: "Add smoke test",
      goal: "add a smoke test for the shell",
      profileName: "builder",
    });

    const text = result.content[0].text;
    assert.ok(text.includes("delegate_task stub"));
    assert.ok(text.includes("builder"));
  });

  it("wait_for_agents tool returns a stub response", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const tool = pi.tools.find((t) => t.name === "wait_for_agents")!.def;
    const result = await tool.execute("call-2", { workerIds: ["worker-1"], timeoutMs: 5000 });

    const text = result.content[0].text;
    assert.ok(text.includes("wait_for_agents stub"));
    assert.ok(text.includes("worker-1"));
  });
});
