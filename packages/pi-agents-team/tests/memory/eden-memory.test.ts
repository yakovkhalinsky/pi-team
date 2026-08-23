import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  EDEN_DEFAULTS,
  EDEN_ENV_FIELDS,
  rememberRecord,
  documentGoal,
  search,
  health,
  resolveEdenOptions,
  getMissingRequiredEnvFields,
  getMissingRequiredEdenOptions,
  getRequiredEnvFieldNames,
  _testing,
} from "../../src/src/memory/eden-memory.js";

function makeFakeBin(script: string): string {
  const dir = mkdtempSync(join(tmpdir(), "eden-test-"));
  const bin = join(dir, "eden-memory");
  writeFileSync(bin, `#!/usr/bin/env node\n${script}`, { mode: 0o700 });
  return bin;
}

describe("eden-memory wrapper", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "eden-memory-unit-"));
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  });

  it("resolves options from an env map", () => {
    const env = {
      [EDEN_ENV_FIELDS.BIN]: "/custom/bin",
      [EDEN_ENV_FIELDS.DB]: "/custom/db.db",
      [EDEN_ENV_FIELDS.WORKSPACE_ID]: "ws-1",
      [EDEN_ENV_FIELDS.USER_ID]: "user-1",
      [EDEN_ENV_FIELDS.AGENT_ID]: "agent-1",
    };
    const options = resolveEdenOptions(env);
    assert.equal(options.bin, "/custom/bin");
    assert.equal(options.db, "/custom/db.db");
    assert.equal(options.workspaceId, "ws-1");
    assert.equal(options.userId, "user-1");
    assert.equal(options.agentId, "agent-1");
  });

  it("falls back to defaults for missing env values", () => {
    const options = resolveEdenOptions({});
    assert.equal(options.bin, EDEN_DEFAULTS.bin);
    assert.equal(options.db, EDEN_DEFAULTS.db);
    assert.equal(options.workspaceId, EDEN_DEFAULTS.workspaceId);
    assert.equal(options.userId, EDEN_DEFAULTS.userId);
    assert.equal(options.agentId, EDEN_DEFAULTS.agentId);
    assert.equal(options.semanticSearch, false);
  });

  it("parses the semantic-search flag", () => {
    assert.equal(resolveEdenOptions({ [EDEN_ENV_FIELDS.SEMANTIC_SEARCH]: "true" }).semanticSearch, true);
    assert.equal(resolveEdenOptions({ [EDEN_ENV_FIELDS.SEMANTIC_SEARCH]: "false" }).semanticSearch, false);
    assert.equal(resolveEdenOptions({}).semanticSearch, false);
    assert.equal(resolveEdenOptions({ [EDEN_ENV_FIELDS.SEMANTIC_SEARCH]: "yes" }).semanticSearch, false);
  });

  it("reports missing required fields excluding optional LLM keys by default", () => {
    const env = {
      [EDEN_ENV_FIELDS.BIN]: "/bin",
      [EDEN_ENV_FIELDS.DB]: "/db.db",
      [EDEN_ENV_FIELDS.WORKSPACE_ID]: "ws",
      [EDEN_ENV_FIELDS.USER_ID]: "user",
    };
    const missing = getMissingRequiredEnvFields(env);
    assert.deepEqual(missing, [EDEN_ENV_FIELDS.AGENT_ID]);
  });

  it("requires LLM keys when semantic search is enabled", () => {
    const env = {
      [EDEN_ENV_FIELDS.BIN]: "/bin",
      [EDEN_ENV_FIELDS.DB]: "/db.db",
      [EDEN_ENV_FIELDS.WORKSPACE_ID]: "ws",
      [EDEN_ENV_FIELDS.USER_ID]: "user",
      [EDEN_ENV_FIELDS.AGENT_ID]: "agent",
      [EDEN_ENV_FIELDS.SEMANTIC_SEARCH]: "true",
    };
    const missing = getMissingRequiredEnvFields(env);
    assert.ok(missing.includes(EDEN_ENV_FIELDS.LLM_API_KEY));
    assert.ok(missing.includes(EDEN_ENV_FIELDS.LLM_BASE_URL));
  });

  it("returns required field names for semantic search off", () => {
    const names = getRequiredEnvFieldNames(false);
    assert.ok(names.includes(EDEN_ENV_FIELDS.BIN));
    assert.ok(names.includes(EDEN_ENV_FIELDS.DB));
    assert.ok(!names.includes(EDEN_ENV_FIELDS.LLM_API_KEY));
  });

  it("records a memory and parses the JSON response", async () => {
    const db = resolve(tmpDir, "test.db");
    const bin = makeFakeBin(`
const args = process.argv.slice(2);
if (args[0] !== "remember") { process.exit(1); }
if (args[1] === "remember") { process.exit(1); }
const metadataArg = args.indexOf("--metadata");
if (metadataArg === -1 || !args[metadataArg + 1].includes('"marker"')) { process.exit(1); }
console.log(JSON.stringify({ id: "mem-123", status: "remembered" }));
`);
    const result = await rememberRecord(
      { content: "[action] test", metadata: { marker: "[action]", stage: "action" }, tags: ["action"] },
      { bin, db, workspaceId: "ws", userId: "user", agentId: "agent" },
    );
    assert.equal(result.ok, true);
    assert.equal(result.id, "mem-123");
    assert.equal(result.status, "remembered");
  });

  it("returns safe error result when CLI exits non-zero", async () => {
    const bin = makeFakeBin(`
console.error('time=... level=ERROR msg="remember failed" err="already locked: database is locked by another eden-memory process"');
process.exit(1);
`);
    const result = await rememberRecord(
      { content: "test" },
      { bin, db: "/x.db", workspaceId: "ws", userId: "user", agentId: "agent" },
    );
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("database is locked") || result.error?.includes("already locked"), result.error);
  });

  it("checks health without duplicating the subcommand", async () => {
    const bin = makeFakeBin(`
const args = process.argv.slice(2);
if (args[0] !== "health") { process.exit(1); }
if (args[1] === "health") { process.exit(1); }
console.log("ok");
`);
    const result = await health({ bin, db: "/x.db", workspaceId: "ws", userId: "user", agentId: "agent" });
    assert.equal(result.ok, true);
  });

  it("rememberRecord does not pass --workspace-id to the remember subcommand", async () => {
    // Regression test for the silent failure where every session's ATP marker
    // write returned ok:false with error "unknown command: --workspace-id".
    // Root cause: buildIdentityArgs prepended --workspace-id before the
    // subcommand, but the remember subcommand in eden-memory v0.3.137 does
    // NOT accept that flag (search/health/document-cross-workspace do).
    const capturePath = join(tmpDir, "argv-capture.json");
    const bin = makeFakeBin(`
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify(process.argv.slice(2)));
console.log(JSON.stringify({ id: "mem-regression", status: "remembered" }));
`);
    const result = await rememberRecord(
      { content: "[action] regression", metadata: { marker: "[action]", stage: "action" }, tags: ["action"] },
      {
        bin,
        db: "/x.db",
        workspaceId: "ws",
        userId: "user",
        agentId: "agent",
        llmApiKey: "ollama",
        llmBaseUrl: "http://127.0.0.1:11434/v1",
      },
    );
    assert.equal(result.ok, true, `rememberRecord should succeed; got ${JSON.stringify(result)}`);
    const captured = JSON.parse(readFileSync(capturePath, "utf8")) as string[];
    // Subcommand must be the first positional.
    assert.equal(captured[0], "remember", `first arg must be the subcommand; got ${captured[0]}`);
    // --workspace-id must NOT be in the argv at all (remember subcommand rejects it).
    assert.ok(
      !captured.includes("--workspace-id"),
      `argv must not contain --workspace-id; captured: ${JSON.stringify(captured)}`,
    );
    // The other identity flags must still be present.
    const idxOf = (flag: string) => captured.indexOf(flag);
    assert.ok(idxOf("--agent-id") >= 0 && captured[idxOf("--agent-id") + 1] === "agent");
    assert.ok(idxOf("--user-id") >= 0 && captured[idxOf("--user-id") + 1] === "user");
    assert.ok(idxOf("--llm-api-key") >= 0 && captured[idxOf("--llm-api-key") + 1] === "ollama");
    assert.ok(idxOf("--llm-base-url") >= 0 && captured[idxOf("--llm-base-url") + 1] === "http://127.0.0.1:11434/v1");
  });

  it("documentGoal does not pass --workspace-id to the document subcommand", async () => {
    // Same regression as rememberRecord, for the document subcommand.
    const capturePath = join(tmpDir, "argv-capture-document.json");
    const bin = makeFakeBin(`
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify(process.argv.slice(2)));
console.log("document body");
`);
    const result = await documentGoal(
      { bin, db: "/x.db", workspaceId: "ws", userId: "user", agentId: "agent", goalId: "g1" },
    );
    assert.equal(result.ok, true);
    const captured = JSON.parse(readFileSync(capturePath, "utf8")) as string[];
    assert.equal(captured[0], "document");
    assert.ok(!captured.includes("--workspace-id"), `argv must not contain --workspace-id; got ${JSON.stringify(captured)}`);
  });

  it("search still passes --workspace-id (the search subcommand accepts it)", async () => {
    // Symmetric guard: search and health DO accept --workspace-id, so the
    // asymmetric fix above must not have stripped it from them.
    const capturePath = join(tmpDir, "argv-capture-search.json");
    const bin = makeFakeBin(`
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify(process.argv.slice(2)));
console.log(JSON.stringify({ results: [] }));
`);
    const result = await search(
      { bin, db: "/x.db", workspaceId: "ws", userId: "user", agentId: "agent", keywords: "k" },
    );
    assert.equal(result.ok, true);
    const captured = JSON.parse(readFileSync(capturePath, "utf8")) as string[];
    assert.equal(captured[0], "search");
    assert.ok(captured.includes("--workspace-id"), `argv must still contain --workspace-id for search; got ${JSON.stringify(captured)}`);
    const i = captured.indexOf("--workspace-id");
    assert.equal(captured[i + 1], "ws");
  });

  it("reports missing required fields from merged eden options", () => {
    const base = {
      bin: "/bin",
      db: "/db",
      workspaceId: "ws",
      userId: "user",
      agentId: "agent",
    };
    assert.deepEqual(getMissingRequiredEdenOptions(base), []);
    assert.deepEqual(getMissingRequiredEdenOptions({ ...base, agentId: "" }), [EDEN_ENV_FIELDS.AGENT_ID]);
    assert.deepEqual(getMissingRequiredEdenOptions({}), [
      EDEN_ENV_FIELDS.BIN,
      EDEN_ENV_FIELDS.DB,
      EDEN_ENV_FIELDS.WORKSPACE_ID,
      EDEN_ENV_FIELDS.USER_ID,
      EDEN_ENV_FIELDS.AGENT_ID,
    ]);
  });

  it("requires LLM keys in merged eden options when semantic search is enabled", () => {
    const options = {
      bin: "/bin",
      db: "/db",
      workspaceId: "ws",
      userId: "user",
      agentId: "agent",
      semanticSearch: true,
    };
    const missing = getMissingRequiredEdenOptions(options);
    assert.ok(missing.includes(EDEN_ENV_FIELDS.LLM_API_KEY));
    assert.ok(missing.includes(EDEN_ENV_FIELDS.LLM_BASE_URL));
    assert.equal(getMissingRequiredEdenOptions({ ...options, llmApiKey: "sk", llmBaseUrl: "https://x" }).length, 0);
  });

  it("documents a goal from CLI stdout", async () => {
    const bin = makeFakeBin(`
const args = process.argv.slice(2);
if (args[0] !== "document") { process.exit(1); }
if (args[1] === "document") { process.exit(1); }
console.log("# Summary\\n\\nGoal summary text.");
`);
    const result = await documentGoal({ bin, db: "/x.db", workspaceId: "ws", userId: "user", agentId: "agent", goalId: "g1", format: "md" });
    assert.equal(result.ok, true);
    assert.equal(result.output, "# Summary\n\nGoal summary text.");
  });

  it("searches memory records and parses the JSON response", async () => {
    const bin = makeFakeBin(`
const args = process.argv.slice(2);
if (args[0] !== "search") { process.exit(1); }
if (args[1] === "search") { process.exit(1); }
const filtersArg = args.indexOf("--filters");
if (filtersArg === -1 || !args[filtersArg + 1].includes('"stage"')) { process.exit(1); }
console.log(JSON.stringify({ results: [{ id: "mem-1", content: "blocked task" }] }));
`);
    const result = await search(
      { bin, db: "/x.db", workspaceId: "ws", userId: "user", agentId: "agent", keywords: "blocked", filters: { stage: "goal-receipt" }, limit: 10 },
    );
    assert.equal(result.ok, true);
    assert.equal(result.results.length, 1);
    assert.equal((result.results[0] as any).id, "mem-1");
  });

  it("returns empty results when search CLI exits non-zero", async () => {
    const bin = makeFakeBin(`
console.error('time=... level=ERROR msg="search failed" err="database is locked"');
process.exit(1);
`);
    const result = await search(
      { bin, db: "/x.db", workspaceId: "ws", userId: "user", agentId: "agent", keywords: "blocked" },
    );
    assert.equal(result.ok, false);
    assert.deepEqual(result.results, []);
  });

  it("respects an abort signal", async () => {
    const bin = makeFakeBin(`
setTimeout(() => { console.log(JSON.stringify({ id: "late" })); }, 2000);
`);
    const controller = new AbortController();
    const promise = rememberRecord({ content: "test" }, { bin, db: "/x.db", workspaceId: "ws", userId: "user", agentId: "agent" }, controller.signal);
    setTimeout(() => controller.abort(), 50);
    const result = await promise;
    assert.equal(result.ok, false);
  });

  it("spawnEden rejects with a timeout error for a hanging child", async () => {
    const bin = makeFakeBin(`
setTimeout(() => { console.log("done"); }, 60_000);
`);
    await assert.rejects(
      () => _testing.spawnEden(bin, "health", [], { timeoutMs: 50 }),
      /timed out/,
    );
  });

  it("health returns a safe timeout result via timeoutMs", async () => {
    const bin = makeFakeBin(`
setTimeout(() => { console.log("ok"); }, 60_000);
`);
    const result = await health({ bin, db: "/x.db", workspaceId: "ws", userId: "user", agentId: "agent" }, undefined, 50);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("timed out"), result.error);
  });

  it("rememberRecord returns a safe timeout result via timeoutMs", async () => {
    const bin = makeFakeBin(`
setTimeout(() => { console.log(JSON.stringify({ id: "late" })); }, 60_000);
`);
    const result = await rememberRecord(
      { content: "test" },
      { bin, db: "/x.db", workspaceId: "ws", userId: "user", agentId: "agent" },
      undefined,
      50,
    );
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("timed out"), result.error);
  });

  it("documentGoal returns a safe timeout result via timeoutMs", async () => {
    const bin = makeFakeBin(`
setTimeout(() => { console.log("summary"); }, 60_000);
`);
    const result = await documentGoal(
      { bin, db: "/x.db", workspaceId: "ws", userId: "user", agentId: "agent", goalId: "g1" },
      undefined,
      50,
    );
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("timed out"), result.error);
  });

  it("search returns a safe timeout result via timeoutMs", async () => {
    const bin = makeFakeBin(`
setTimeout(() => { console.log(JSON.stringify({ results: [] })); }, 60_000);
`);
    const result = await search(
      { bin, db: "/x.db", workspaceId: "ws", userId: "user", agentId: "agent", keywords: "blocked" },
      undefined,
      50,
    );
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("timed out"), result.error);
    assert.deepEqual(result.results, []);
  });

  it("AbortSignal.timeout aborts health before the wrapper timeout", async () => {
    const bin = makeFakeBin(`
setTimeout(() => { console.log("ok"); }, 60_000);
`);
    const signal = AbortSignal.timeout(50);
    const result = await health({ bin, db: "/x.db", workspaceId: "ws", userId: "user", agentId: "agent" }, signal, 10_000);
    assert.equal(result.ok, false);
  });
});
