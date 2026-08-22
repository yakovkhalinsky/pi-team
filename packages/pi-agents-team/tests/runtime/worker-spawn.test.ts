import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawnWorker } from "../../src/runtime/worker-spawn.js";

function createMockChild(stdout: string, stderr: string, exitCode: number, signal: string | null = null) {
  const child = new EventEmitter() as any;
  child.pid = 12345;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = (sig?: string) => {
    setImmediate(() => child.emit("close", exitCode, sig ?? signal));
    return true;
  };
  setImmediate(() => {
    child.stdout.emit("data", stdout);
    child.stderr.emit("data", stderr);
    if (!child.kill.manuallyCalled) child.emit("close", exitCode, signal);
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

function createStreamingChild(lines: string[]) {
  const child = new EventEmitter() as any;
  child.pid = 12345;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => true;
  setImmediate(() => {
    for (const line of lines) {
      child.stdout.emit("data", line + "\n");
    }
    child.emit("close", 0, null);
  });
  return child;
}

describe("spawnWorker controller", () => {
  it("collects full stdout/stderr and resolves with exit code", async () => {
    const controller = spawnWorker({
      command: "echo",
      args: ["hello"],
      spawnImpl: () => createMockChild("out\n", "err\n", 0),
    });

    const result = await controller.promise;
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "out\n");
    assert.equal(result.stderr, "err\n");
    assert.equal(result.error, undefined);
  });

  it("streams every stdout line via onLine", async () => {
    const lines: string[] = [];
    const controller = spawnWorker({
      command: "echo",
      args: ["hello"],
      spawnImpl: () => createStreamingChild(["line 1", "line 2", "line 3"]),
      onLine: (line) => lines.push(line),
    });

    await controller.promise;
    assert.deepEqual(lines, ["line 1", "line 2", "line 3"]);
  });

  it("kill() sends a signal and resolves with termination reason", async () => {
    const controller = spawnWorker({
      command: "sleep",
      args: ["10"],
      spawnImpl: () => createHangingChild(),
    });

    const killed = controller.kill("SIGTERM");
    assert.equal(killed, true);

    const result = await controller.promise;
    assert.equal(result.exitCode, null);
    assert.equal(result.error, "terminated by SIGTERM");
  });

  it("honours an AbortSignal and resolves with aborted", async () => {
    const signal = AbortSignal.timeout(10);
    const controller = spawnWorker({
      command: "sleep",
      args: ["10"],
      spawnImpl: () => createHangingChild(),
      signal,
    });

    const result = await controller.promise;
    assert.equal(result.error, "aborted");
    assert.equal(result.exitCode, null);
  });

  it("uses SIGTERM then SIGKILL when timeout expires", async () => {
    const signals: string[] = [];
    const child = createHangingChild();
    const originalKill = child.kill.bind(child);
    child.kill = (signal?: string) => {
      signals.push(signal ?? "SIGTERM");
      return originalKill(signal);
    };

    const controller = spawnWorker({
      command: "sleep",
      args: ["10"],
      spawnImpl: () => child,
      timeoutMs: 50,
    });

    const result = await controller.promise;
    assert.equal(result.error, "terminated by SIGTERM");
    assert.deepEqual(signals, ["SIGTERM"]);
  });
});
