import { describe, it } from "node:test";
import assert from "node:assert/strict";
import extensionFactory from "../src/extensions/pi-agent-team/index.js";

function createMockPi() {
  const handlers = new Map<string, Function[]>();
  return {
    registerTool: (_def) => {},
    registerCommand: (_name, _def) => {},
    sendMessage: (_msg) => {},
    appendEntry: (_type, _data) => {},
    getThinkingLevel: () => undefined,
    on: (event, handler) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    },
    emit: (event, ...args) => {
      for (const handler of handlers.get(event) ?? []) {
        void handler(...args);
      }
    },
    handlers,
  };
}

function createMockContext() {
  return {
    cwd: process.cwd(),
    hasUI: false,
    mode: "api",
    sessionManager: {
      getBranch: () => [],
      isPersisted: () => false,
    },
    isProjectTrusted: () => false,
  };
}

describe("extension entry point", () => {
  it("initializes without throwing", () => {
    const pi = createMockPi();
    assert.doesNotThrow(() => extensionFactory(pi));
  });

  it("registers handlers for lifecycle events", () => {
    const pi = createMockPi();
    extensionFactory(pi);
    assert.ok(pi.handlers.has("session_start"));
    assert.ok(pi.handlers.has("agent_start"));
    assert.ok(pi.handlers.has("agent_end"));
    assert.ok(pi.handlers.has("session_shutdown"));
  });

  it("handles session_start without throwing", async () => {
    const pi = createMockPi();
    extensionFactory(pi);
    const ctx = createMockContext();
    await pi.emit("session_start", { reason: "startup" }, ctx);
  });

  it("handles agent_start and agent_end without throwing", async () => {
    const pi = createMockPi();
    extensionFactory(pi);
    const ctx = createMockContext();
    await pi.emit("agent_start", {}, ctx);
    await pi.emit("agent_end", {}, ctx);
  });
});
