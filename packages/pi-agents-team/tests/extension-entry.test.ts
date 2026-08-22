import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import extensionFactory, { _testing } from "../src/extensions/pi-agent-team/index.js";
import { EDEN_ENV_FIELDS } from "../src/src/memory/eden-memory.js";

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

function createMockContext(overrides = {}) {
  return {
    cwd: process.cwd(),
    hasUI: false,
    mode: "api",
    sessionManager: {
      getBranch: () => [],
      isPersisted: () => false,
    },
    isProjectTrusted: () => false,
    ...overrides,
  };
}

describe("extension entry point", () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  });

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

  it("honors the EDEN_MEMORY_ENABLED env kill-switch in buildAtpRecorderOptions", () => {
    const activeProjectConfig = {
      config: {
        memory: {
          edenMemory: {
            enabled: true,
          },
        },
      },
    };
    for (const value of ["false", "0", "no"]) {
      process.env[EDEN_ENV_FIELDS.ENABLED] = value;
      assert.equal(_testing.buildAtpRecorderOptions(activeProjectConfig), undefined, `should disable for ${value}`);
    }
    for (const value of ["true", "1", "yes"]) {
      process.env[EDEN_ENV_FIELDS.ENABLED] = value;
      assert.ok(_testing.buildAtpRecorderOptions(activeProjectConfig), `should enable for ${value}`);
    }
    // Unset env defaults to enabled.
    delete process.env[EDEN_ENV_FIELDS.ENABLED];
    assert.ok(_testing.buildAtpRecorderOptions(activeProjectConfig), "should enable when env var is unset");
  });

  it("builds eden memory options that merge config over env", () => {
    process.env[EDEN_ENV_FIELDS.BIN] = "/env/bin";
    process.env[EDEN_ENV_FIELDS.DB] = "/env/db";
    process.env[EDEN_ENV_FIELDS.WORKSPACE_ID] = "env-ws";
    process.env[EDEN_ENV_FIELDS.USER_ID] = "env-user";
    process.env[EDEN_ENV_FIELDS.AGENT_ID] = "env-agent";
    process.env[EDEN_ENV_FIELDS.SEMANTIC_SEARCH] = "false";
    const activeProjectConfig = {
      config: {
        memory: {
          edenMemory: {
            enabled: true,
            bin: "/config/bin",
            workspaceId: "config-ws",
            semanticSearch: true,
          },
        },
      },
    };
    const options = _testing.buildEdenMemoryOptions(activeProjectConfig);
    assert.equal(options.bin, "/config/bin", "config bin overrides env");
    assert.equal(options.db, "/env/db", "env db used when config omits it");
    assert.equal(options.workspaceId, "config-ws", "config workspaceId overrides env");
    assert.equal(options.semanticSearch, true, "config semanticSearch overrides env");
    assert.equal(options.enabled, true, "enabled is kept from env (unset defaults to true)");
  });

  it("handles agent_start and agent_end without throwing", async () => {
    const pi = createMockPi();
    extensionFactory(pi);
    const ctx = createMockContext();
    await pi.emit("agent_start", {}, ctx);
    await pi.emit("agent_end", {}, ctx);
  });
});
