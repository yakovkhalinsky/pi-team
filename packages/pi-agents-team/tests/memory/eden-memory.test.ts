import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
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
    assert.equal(options.enabled, true);
    assert.equal(options.semanticSearch, false);
  });

  it("parses the enabled and semantic-search flags", () => {
    assert.equal(resolveEdenOptions({ [EDEN_ENV_FIELDS.ENABLED]: "false" }).enabled, false);
    assert.equal(resolveEdenOptions({ [EDEN_ENV_FIELDS.ENABLED]: "0" }).enabled, false);
    assert.equal(resolveEdenOptions({ [EDEN_ENV_FIELDS.ENABLED]: "no" }).enabled, false);
    assert.equal(resolveEdenOptions({ [EDEN_ENV_FIELDS.ENABLED]: "true" }).enabled, true);
    assert.equal(resolveEdenOptions({ [EDEN_ENV_FIELDS.ENABLED]: "1" }).enabled, true);
    assert.equal(resolveEdenOptions({ [EDEN_ENV_FIELDS.SEMANTIC_SEARCH]: "true" }).semanticSearch, true);
    assert.equal(resolveEdenOptions({ [EDEN_ENV_FIELDS.SEMANTIC_SEARCH]: "false" }).semanticSearch, false);
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

  it("detects a locked database in health", async () => {
    const bin = makeFakeBin(`
console.error('time=... level=ERROR msg="health failed" err="database /x.db is locked by another eden-memory process"');
process.exit(1);
`);
    const result = await health({ bin, db: "/x.db", workspaceId: "ws", userId: "user", agentId: "agent" });
    assert.equal(result.ok, false);
    assert.equal(result.locked, true);
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
});
