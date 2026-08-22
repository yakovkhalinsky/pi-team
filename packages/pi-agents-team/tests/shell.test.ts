import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
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

function createMockChild(stdout: string, stderr: string, exitCode: number) {
  const child = new EventEmitter() as any;
  child.pid = 12345;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => true;
  setImmediate(() => {
    child.stdout.emit("data", stdout);
    child.stderr.emit("data", stderr);
    child.emit("close", exitCode, null);
  });
  return child;
}

describe("Path A thin extension shell", () => {
  beforeEach(() => {
    _testing.clearWorkers();
  });

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

  it("delegate_task spawns a worker with the right command and arguments", async () => {
    const pi = createMockPi();
    const spawnCalls: Array<{ command: string; args: string[]; options: any }> = [];
    const mockSpawn = (command: string, args: string[], options: any) => {
      spawnCalls.push({ command, args, options });
      return createMockChild(
        "Some prelude\n<final_answer>\nheadline: did the thing\n\nresult body\n</final_answer>\n",
        "warn line\n",
        0,
      );
    };
    extensionFactory(pi, { spawnImpl: mockSpawn });

    const tool = pi.tools.find((t) => t.name === "delegate_task")!.def;
    const result = await tool.execute(
      "call-1",
      {
        title: "Add smoke test",
        goal: "add a smoke test for the shell",
        profileName: "builder",
        contextHints: "use node:test",
        expectedOutput: "passing test file",
        pathScopeRoots: ["packages/pi-agents-team/tests"],
        skills: ["testing"],
      },
      undefined,
      undefined,
      createMockContext(),
    );

    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0].command, "pi");
    const args = spawnCalls[0].args;
    assert.ok(args.includes("--mode"), "should set output mode");
    assert.ok(args.includes("json"), "should use json mode");
    assert.ok(args.includes("-p"), "should use non-interactive print mode");
    assert.ok(args.includes("--no-session"), "should not persist session");
    assert.ok(args.includes("--append-system-prompt"), "should append agent system prompt");
    assert.ok(args.includes("--no-extensions"), "should start a minimal worker");
    assert.ok(!args.includes("--no-skills"), "should allow skills when requested");

    const taskArg = args[args.length - 1];
    assert.ok(taskArg.includes("add a smoke test for the shell"));
    assert.ok(taskArg.includes("use node:test"));
    assert.ok(taskArg.includes("packages/pi-agents-team/tests"));
    assert.ok(taskArg.includes("testing"));

    const payload = JSON.parse(result.content[0].text);
    assert.ok(payload.workerId.startsWith("worker-"));
    assert.equal(payload.status, "completed");
    assert.equal(payload.result.headline, "did the thing");
    assert.ok(payload.result.finalAnswer.includes("result body"));

    const record = _testing.getWorkerMap().get(payload.workerId);
    assert.ok(record, "worker should be tracked in memory");
    assert.equal(record.status, "completed");
    assert.equal(record.result.headline, "did the thing");
    assert.ok(record.finalAnswer.includes("result body"));
  });

  it("delegate_task returns a clear error for an unknown profile", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const tool = pi.tools.find((t) => t.name === "delegate_task")!.def;
    const result = await tool.execute("call-2", {
      title: "Mystery task",
      goal: "do something",
      profileName: "nonexistent",
    });

    const payload = JSON.parse(result.content[0].text);
    assert.ok(payload.workerId.startsWith("worker-"));
    assert.equal(payload.status, "error");
    assert.ok(payload.error.includes("Unknown agent profile"));
    assert.ok(payload.error.includes("nonexistent"));

    const record = _testing.getWorkerMap().get(payload.workerId);
    assert.equal(record.status, "error");
    assert.ok(record.error.includes("nonexistent"));
  });

  it("delegate_task fails gracefully when the worker exits non-zero", async () => {
    const pi = createMockPi();
    const mockSpawn = () => createMockChild("", "spawn failed\n", 1);
    extensionFactory(pi, { spawnImpl: mockSpawn });

    const tool = pi.tools.find((t) => t.name === "delegate_task")!.def;
    const result = await tool.execute(
      "call-3",
      { title: "Bad worker", goal: "fail", profileName: "builder" },
      undefined,
      undefined,
      createMockContext(),
    );

    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.status, "error");
    assert.ok(payload.error.includes("exited with code 1"));

    const record = _testing.getWorkerMap().get(payload.workerId);
    assert.equal(record.status, "error");
    assert.ok(record.stderr.includes("spawn failed"));
  });

  it("delegate_task fails gracefully when no final_answer block is found", async () => {
    const pi = createMockPi();
    const mockSpawn = () => createMockChild("plain text without final answer", "", 0);
    extensionFactory(pi, { spawnImpl: mockSpawn });

    const tool = pi.tools.find((t) => t.name === "delegate_task")!.def;
    const result = await tool.execute(
      "call-4",
      { title: "No final answer", goal: "return plain text", profileName: "builder" },
      undefined,
      undefined,
      createMockContext(),
    );

    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.status, "error");
    assert.ok(payload.error.includes("No <final_answer>"));

    const record = _testing.getWorkerMap().get(payload.workerId);
    assert.equal(record.status, "error");
  });

  it("wait_for_agents returns tracked worker statuses", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const delegateTool = pi.tools.find((t) => t.name === "delegate_task")!.def;
    const waitTool = pi.tools.find((t) => t.name === "wait_for_agents")!.def;

    const delegateResult = await delegateTool.execute(
      "call-5",
      { title: "Tracked task", goal: "do work", profileName: "nonexistent" },
      undefined,
      undefined,
      createMockContext(),
    );
    const workerId = JSON.parse(delegateResult.content[0].text).workerId;

    const waitResult = await waitTool.execute("call-6", { workerIds: [workerId], timeoutMs: 1000 });
    const payload = JSON.parse(waitResult.content[0].text);
    assert.equal(payload.reason, "all_terminal");
    assert.equal(payload.workers.length, 1);
    assert.equal(payload.workers[0].workerId, workerId);
    assert.equal(payload.workers[0].status, "error");
    assert.ok(payload.workers[0].error.includes("Unknown agent profile"));
  });

  it("wait_for_agents waits on all tracked workers when no IDs are provided", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const map = _testing.getWorkerMap();
    map.set("worker-a", {
      workerId: "worker-a",
      profileName: "builder",
      status: "completed",
      startTime: Date.now(),
      endTime: Date.now(),
      result: { headline: "done", finalAnswer: "answer-a" },
      finalAnswer: "answer-a",
      pendingRelayQuestions: [],
    });
    map.set("worker-b", {
      workerId: "worker-b",
      profileName: "verifier",
      status: "error",
      startTime: Date.now(),
      endTime: Date.now(),
      error: "boom",
      exitCode: 1,
      pendingRelayQuestions: [],
    });

    const waitTool = pi.tools.find((t) => t.name === "wait_for_agents")!.def;
    const waitResult = await waitTool.execute("call-7", { timeoutMs: 1000 });
    const payload = JSON.parse(waitResult.content[0].text);

    assert.equal(payload.reason, "all_terminal");
    assert.equal(payload.workers.length, 2);
    const statuses = payload.workers.map((w) => w.status).sort();
    assert.deepEqual(statuses, ["completed", "error"]);
    const a = payload.workers.find((w) => w.workerId === "worker-a");
    assert.equal(a!.result.headline, "done");
    const b = payload.workers.find((w) => w.workerId === "worker-b");
    assert.ok(b!.error.includes("boom"));
  });

  it("wait_for_agents waits on explicit worker IDs only", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const map = _testing.getWorkerMap();
    map.set("worker-1", {
      workerId: "worker-1",
      profileName: "builder",
      status: "running",
      startTime: Date.now(),
      pendingRelayQuestions: [],
    });
    map.set("worker-2", {
      workerId: "worker-2",
      profileName: "builder",
      status: "completed",
      startTime: Date.now(),
      endTime: Date.now(),
      result: {},
      finalAnswer: "",
      pendingRelayQuestions: [],
    });
    map.set("worker-3", {
      workerId: "worker-3",
      profileName: "builder",
      status: "completed",
      startTime: Date.now(),
      endTime: Date.now(),
      result: {},
      finalAnswer: "",
      pendingRelayQuestions: [],
    });

    const waitTool = pi.tools.find((t) => t.name === "wait_for_agents")!.def;
    const waitResult = await waitTool.execute("call-8", {
      workerIds: ["worker-2", "worker-3"],
      timeoutMs: 1000,
    });
    const payload = JSON.parse(waitResult.content[0].text);

    assert.equal(payload.reason, "all_terminal");
    assert.deepEqual(
      payload.workers.map((w) => w.workerId).sort(),
      ["worker-2", "worker-3"],
    );
  });

  it("wait_for_agents returns timeout when a worker stays running", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    _testing.getWorkerMap().set("worker-running", {
      workerId: "worker-running",
      profileName: "builder",
      status: "running",
      startTime: Date.now(),
      pendingRelayQuestions: [],
    });

    const waitTool = pi.tools.find((t) => t.name === "wait_for_agents")!.def;
    const start = Date.now();
    const waitResult = await waitTool.execute("call-9", {
      workerIds: ["worker-running"],
      timeoutMs: 50,
    });
    const elapsed = Date.now() - start;
    const payload = JSON.parse(waitResult.content[0].text);

    assert.equal(payload.reason, "timeout");
    assert.equal(payload.workers.length, 1);
    assert.equal(payload.workers[0].status, "running");
    assert.ok(elapsed < 500, "should time out quickly");
  });

  it("wait_for_agents returns relay_raised early when a worker has pending relay questions", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    _testing.getWorkerMap().set("worker-relay", {
      workerId: "worker-relay",
      profileName: "builder",
      status: "running",
      startTime: Date.now(),
      pendingRelayQuestions: [{ questionId: "q1", question: "Need path scope" }],
    });

    const waitTool = pi.tools.find((t) => t.name === "wait_for_agents")!.def;
    const waitResult = await waitTool.execute("call-10", {
      workerIds: ["worker-relay"],
      timeoutMs: 10_000,
    });
    const payload = JSON.parse(waitResult.content[0].text);

    assert.equal(payload.reason, "relay_raised");
    assert.equal(payload.workers.length, 1);
    assert.equal(payload.workers[0].status, "running");
    assert.equal(payload.newRelays.length, 1);
    assert.equal(payload.newRelays[0].workerId, "worker-relay");
    assert.equal(payload.newRelays[0].questionId, "q1");
    assert.equal(payload.newRelays[0].question, "Need path scope");
  });

  it("wait_for_agents aggregates completed and error results", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const map = _testing.getWorkerMap();
    map.set("worker-ok", {
      workerId: "worker-ok",
      profileName: "builder",
      status: "completed",
      startTime: Date.now(),
      endTime: Date.now(),
      result: { headline: "ok", finalAnswer: "all good" },
      finalAnswer: "all good",
      pendingRelayQuestions: [],
    });
    map.set("worker-bad", {
      workerId: "worker-bad",
      profileName: "verifier",
      status: "error",
      startTime: Date.now(),
      endTime: Date.now(),
      error: "validation failed",
      exitCode: 2,
      pendingRelayQuestions: [],
    });

    const waitTool = pi.tools.find((t) => t.name === "wait_for_agents")!.def;
    const waitResult = await waitTool.execute("call-11", { timeoutMs: 1000 });
    const payload = JSON.parse(waitResult.content[0].text);

    assert.equal(payload.reason, "all_terminal");
    const ok = payload.workers.find((w) => w.workerId === "worker-ok");
    const bad = payload.workers.find((w) => w.workerId === "worker-bad");
    assert.equal(ok!.status, "completed");
    assert.equal(ok!.result.headline, "ok");
    assert.equal(bad!.status, "error");
    assert.equal(bad!.error, "validation failed");
  });
});
