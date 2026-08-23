import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import extensionFactory, { _testing } from "../src/extensions/pi-agent-team/index.js";
import { EDEN_ENV_FIELDS } from "../src/src/memory/eden-memory.js";

const ORIGINAL_ENV = { ...process.env };

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


function createHangingChild() {
  const child = new EventEmitter() as any;
  child.pid = 12345;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = (signal?: string) => {
    setImmediate(() => child.emit("close", null, signal ?? "SIGTERM"));
    return true;
  };
  return child;
}

async function waitForController(workerId: string) {
  for (let i = 0; i < 100; i++) {
    const record = _testing.getWorkerMap().get(workerId);
    if (record?.controller?.child) return record;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Controller was not attached to worker record");
}


function createRelayChild() {
  const relayEvent = {
    type: "message_update",
    assistantMessageEvent: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "<final_answer>\nheadline: need guidance\n\nrelay_question: which path scope should I use?\nassumption: packages/pi-agents-team/src\n</final_answer>",
        },
      ],
    },
  };
  return createMockChild(JSON.stringify(relayEvent) + "\n", "", 0);
}

function makeFakeEdenBin(): { bin: string; dir: string; log: string } {
  const dir = mkdtempSync(join(tmpdir(), "eden-shell-test-"));
  const bin = join(dir, "eden-memory");
  const log = join(dir, "calls.log");
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const subcommand = args[0];
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ subcommand, args }) + "\\n");
if (subcommand === "remember") {
  console.log(JSON.stringify({ id: "mem-" + Date.now(), status: "remembered" }));
} else if (subcommand === "health") {
  console.log("ok");
} else if (subcommand === "search") {
  const filtersIndex = args.indexOf("--filters");
  const filters = filtersIndex !== -1 ? args[filtersIndex + 1] : "{}";
  const parsed = JSON.parse(filters);
  if (parsed && parsed.stage === "goal-receipt") {
    const keywordsIndex = args.indexOf("--keywords");
    if (keywordsIndex !== -1 && args[keywordsIndex + 1].includes("blocked")) {
      console.log(JSON.stringify({ results: [{ id: "mem-blocked", content: "[goal-received] goal:g1 blocked", metadata: { stage: "goal-receipt", goalId: "g1" } }] }));
    } else {
      console.log(JSON.stringify({ results: [{ id: "mem-g1", content: "[goal-received] goal:g1", metadata: { stage: "goal-receipt", goalId: "g1" } }] }));
    }
  } else if (parsed && parsed.stage === "hand-off-or-closure") {
    console.log(JSON.stringify({ results: [] }));
  } else {
    console.log(JSON.stringify({ results: [] }));
  }
} else {
  console.log(JSON.stringify({}));
}
`,
    { mode: 0o700 },
  );
  return { bin, dir, log };
}

function setEdenEnv(bin: string): void {
  process.env[EDEN_ENV_FIELDS.BIN] = bin;
  process.env[EDEN_ENV_FIELDS.DB] = resolve(join(bin, ".."), "test.db");
  process.env[EDEN_ENV_FIELDS.WORKSPACE_ID] = "ws";
  process.env[EDEN_ENV_FIELDS.USER_ID] = "user";
  process.env[EDEN_ENV_FIELDS.AGENT_ID] = "agent";
  process.env[EDEN_ENV_FIELDS.ENABLED] = "true";
}

describe("Path A thin extension shell", () => {
  let fakeEden: { bin: string; dir: string; log: string } | undefined;

  beforeEach(() => {
    _testing.clearWorkers();
  });

  afterEach(() => {
    for (const key of Object.values(EDEN_ENV_FIELDS)) {
      if (key in ORIGINAL_ENV) {
        process.env[key] = ORIGINAL_ENV[key];
      } else {
        delete process.env[key];
      }
    }
    if (fakeEden) {
      try {
        rmSync(fakeEden.dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup failures
      }
      fakeEden = undefined;
    }
  });

  it("registers delegate_task, wait_for_agents and abort_worker tools plus /agents and /stop-worker commands", () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const toolNames = pi.tools.map((t) => t.name).sort();
    assert.deepEqual(toolNames, ["abort_worker", "delegate_task", "wait_for_agents"]);

    const agentsCmd = pi.commands.find((c) => c.name === "agents");
    assert.ok(agentsCmd, "/agents command should be registered");
    assert.ok(agentsCmd!.def.handler, "/agents command should have a handler");

    const stopCmd = pi.commands.find((c) => c.name === "stop-worker");
    assert.ok(stopCmd, "/stop-worker command should be registered");
    assert.ok(stopCmd!.def.handler, "/stop-worker command should have a handler");
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

  it("falls back to package agents when no project override exists", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-agents-fallback-"));
    try {
      const agents = _testing.discoverAgents(tmpDir);
      const names = agents.map((a) => a.name);
      for (const required of ["archivist", "builder", "dispatcher", "researcher", "runtime", "verifier"]) {
        assert.ok(names.includes(required), `should discover ${required} from package fallback`);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
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
    assert.ok(text.includes("Available team agents:"));
    assert.ok(text.includes("builder:"));
    assert.ok(text.includes("verifier:"));
    assert.ok(text.includes("tools:"));
    assert.ok(text.includes("Delegate with:"));
  });

  it("/agents builder shows detailed builder profile", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const cmd = pi.commands.find((c) => c.name === "agents")!;
    await cmd.def.handler("builder", createMockContext());

    assert.equal(pi.messages.length, 1);
    assert.equal(pi.messages[0].customType, "pi-agents-team/agents-list");
    const text = pi.messages[0].content[0].text as string;
    assert.ok(text.includes("Agent: builder"));
    assert.ok(text.includes("Builder Worker Contract"));
    assert.ok(text.includes('Delegate with: `delegate_task` using profileName "builder" etc.'));
  });

  it("/agents unknown returns a friendly not found message", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const cmd = pi.commands.find((c) => c.name === "agents")!;
    await cmd.def.handler("unknown", createMockContext());

    assert.equal(pi.messages.length, 1);
    assert.equal(pi.messages[0].customType, "pi-agents-team/agents-list");
    const text = pi.messages[0].content[0].text as string;
    assert.ok(text.includes('Agent "unknown" not found.'));
    assert.ok(text.includes("Available agents:"));
    assert.ok(text.includes("builder"));
  });

  it("buildWorkerTaskText prepends the final-answer contract instruction", () => {
    const text = _testing.buildWorkerTaskText({ goal: "do the thing" });
    assert.ok(text.includes("When you are finished, wrap your complete final response in a single XML block"));
    assert.ok(text.includes("<final_answer>"));
    assert.ok(text.includes("do the thing"));
    assert.ok(text.startsWith("When you are finished"));
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

  it("delegate_task streams a relay question from worker stdout", async () => {
    const pi = createMockPi();
    const mockSpawn = () => createRelayChild();
    extensionFactory(pi, { spawnImpl: mockSpawn });

    const tool = pi.tools.find((t) => t.name === "delegate_task")!.def;
    await tool.execute(
      "call-relay",
      { title: "Relay task", goal: "ask a question", profileName: "builder" },
      undefined,
      undefined,
      createMockContext(),
    );

    const record = Array.from(_testing.getWorkerMap().values())[0];
    assert.ok(record, "worker should be tracked");
    assert.equal(record.status, "completed");
    assert.equal(record.pendingRelayQuestions.length, 1);
    assert.equal(record.pendingRelayQuestions[0].question, "which path scope should I use? (assumption: packages/pi-agents-team/src)");
    assert.ok(record.pendingRelayQuestions[0].questionId?.startsWith("relay-"));
  });

  it("abort_worker tool kills a running worker and marks it aborted", async () => {
    const pi = createMockPi();
    const mockSpawn = () => createHangingChild();
    extensionFactory(pi, { spawnImpl: mockSpawn });

    const delegateTool = pi.tools.find((t) => t.name === "delegate_task")!.def;
    const abortTool = pi.tools.find((t) => t.name === "abort_worker")!.def;

    const delegatePromise = delegateTool.execute(
      "call-hang",
      { title: "Hang", goal: "hang forever", profileName: "builder" },
      undefined,
      undefined,
      createMockContext(),
    );

    const workerId = Array.from(_testing.getWorkerMap().keys())[0];
    assert.ok(workerId, "worker should exist");
    const record = await waitForController(workerId);

    const abortResult = await abortTool.execute("abort-1", { workerId });
    const abortPayload = JSON.parse(abortResult.content[0].text);
    assert.equal(abortPayload.success, true);
    assert.equal(abortPayload.workerId, workerId);
    assert.equal(abortPayload.status, "aborted");
    assert.equal(abortPayload.killed, true);

    assert.equal(record!.status, "aborted");

    await delegatePromise;
  });

  it("abort_worker tool returns an error for an unknown or terminal worker", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const abortTool = pi.tools.find((t) => t.name === "abort_worker")!.def;

    const missing = await abortTool.execute("abort-2", { workerId: "no-such" });
    assert.equal(JSON.parse(missing.content[0].text).success, false);

    _testing.getWorkerMap().set("worker-done", {
      workerId: "worker-done",
      profileName: "builder",
      status: "completed",
      startTime: Date.now(),
      endTime: Date.now(),
      result: {},
      finalAnswer: "",
      pendingRelayQuestions: [],
    });
    const terminal = await abortTool.execute("abort-3", { workerId: "worker-done" });
    const terminalPayload = JSON.parse(terminal.content[0].text);
    assert.equal(terminalPayload.success, false);
    assert.equal(terminalPayload.status, "completed");
  });

  it("/stop-worker command aborts a running worker", async () => {
    const pi = createMockPi();
    const mockSpawn = () => createHangingChild();
    extensionFactory(pi, { spawnImpl: mockSpawn });

    const delegateTool = pi.tools.find((t) => t.name === "delegate_task")!.def;
    const stopCmd = pi.commands.find((c) => c.name === "stop-worker")!;

    const delegatePromise = delegateTool.execute(
      "call-stop",
      { title: "Hang", goal: "hang forever", profileName: "builder" },
      undefined,
      undefined,
      createMockContext(),
    );

    const workerId = Array.from(_testing.getWorkerMap().keys())[0];
    const record = await waitForController(workerId);

    await stopCmd.def.handler(workerId, createMockContext());

    assert.equal(record!.status, "aborted");
    assert.equal(pi.messages.length, 1);
    assert.ok(pi.messages[0].content[0].text.includes("aborted"));

    await delegatePromise;
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

  it("does not run eden-memory startup work when disabled", async () => {
    const pi = createMockPi();
    extensionFactory(pi);

    const sessionStartHandlers = pi.handlers.get("session_start") ?? [];
    await sessionStartHandlers[0]({ reason: "startup" }, createMockContext());

    const memoryEntries = pi.entries.filter((e) => e.type.startsWith("pi-agents-team/memory"));
    assert.equal(memoryEntries.length, 0, "should not write memory entries when disabled");
  });

  it("records eden-memory health, goal-receipt and blocked goals on session_start when enabled", async () => {
    fakeEden = makeFakeEdenBin();
    setEdenEnv(fakeEden.bin);

    const pi = createMockPi();
    extensionFactory(pi);

    const sessionStartHandlers = pi.handlers.get("session_start") ?? [];
    await sessionStartHandlers[0]({ reason: "startup" }, createMockContext());

    // Poll for the blocked-goals entry with a deadline so this test isn't flaky.
    const deadline = Date.now() + 5_000;
    let blockedGoalsEntry = null;
    while (Date.now() < deadline) {
      blockedGoalsEntry = pi.entries.find((e) => e.type === "pi-agents-team/memory-blocked-goals") ?? null;
      if (blockedGoalsEntry) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(blockedGoalsEntry, "should record a blocked-goals entry");
    assert.equal(blockedGoalsEntry!.data.count, 1);
    assert.equal(blockedGoalsEntry!.data.goals[0].goalId, "g1");

    const statusEntries = pi.entries.filter((e) => e.type === "pi-agents-team/memory-status");
    assert.equal(statusEntries.length, 0, "no warnings should be logged when queries succeed");

    const logLines = readFileSync(fakeEden.log, "utf-8").trim().split("\n").filter(Boolean);
    const healthCall = logLines.some((line) => line.includes('"subcommand":"health"'));
    assert.ok(healthCall, "should call eden-memory health");
  });

  it("records ATP routing and completion markers when delegate_task runs with eden-memory enabled", async () => {
    fakeEden = makeFakeEdenBin();
    setEdenEnv(fakeEden.bin);

    const pi = createMockPi();
    const mockSpawn = () =>
      createMockChild(
        "Some prelude\n<final_answer>\nheadline: did the thing\n\nresult body\n</final_answer>\n",
        "",
        0,
      );
    extensionFactory(pi, { spawnImpl: mockSpawn });

    const sessionStartHandlers = pi.handlers.get("session_start") ?? [];
    await sessionStartHandlers[0]({ reason: "startup" }, createMockContext());
    await new Promise((resolve) => setTimeout(resolve, 100));

    const tool = pi.tools.find((t) => t.name === "delegate_task")!.def;
    await tool.execute(
      "call-memory",
      { title: "Memory task", goal: "do the thing", profileName: "builder" },
      undefined,
      undefined,
      createMockContext(),
    );

    // Poll the log file with a deadline so this test isn't flaky on slow CI.
    const deadline = Date.now() + 5_000;
    let log = "";
    while (Date.now() < deadline) {
      log = readFileSync(fakeEden.log, "utf-8");
      if (log.includes("[recorded]")) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(log.includes('"subcommand":"remember"'), "should record remember markers");
    const rememberLines = log.split("\n").filter((line) => line.includes('"subcommand":"remember"'));
    assert.ok(
      rememberLines.some((line) => line.includes("[routing]")),
      "should record a routing marker at delegation start",
    );
    assert.ok(
      rememberLines.some((line) => line.includes("[recorded]")),
      "should record a recording-and-archival marker at worker completion",
    );
  });

  it("injects blocked goals summary into the orchestrator prompt when enabled", async () => {
    fakeEden = makeFakeEdenBin();
    setEdenEnv(fakeEden.bin);

    const pi = createMockPi();
    extensionFactory(pi);

    const sessionStartHandlers = pi.handlers.get("session_start") ?? [];
    await sessionStartHandlers[0]({ reason: "startup" }, createMockContext());

    // Wait for the blocked-goals entry to land, then call before_agent_start.
    // The handler itself awaits the blocked-goals promise with a 2s ceiling.
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (pi.entries.some((e) => e.type === "pi-agents-team/memory-blocked-goals")) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const handler = pi.handlers.get("before_agent_start")?.[0];
    const result = await handler({ systemPrompt: "You are a helpful coding assistant." }, createMockContext());
    assert.ok(result, "should return a modified prompt");
    assert.ok(result.systemPrompt.includes("Eden-memory blocked/unfinished goals"), "should include blocked goals header");
    assert.ok(result.systemPrompt.includes("g1"), "should mention the goal id");
  });
});
