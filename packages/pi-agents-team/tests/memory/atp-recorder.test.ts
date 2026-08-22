import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  recordGoalReceipt,
  recordRouting,
  recordContextGathering,
  recordAction,
  recordVerification,
  recordRecordingAndArchival,
  recordHandOffOrClosure,
  recordWorkerTerminal,
  recordWorkerRelay,
  recordWorkerPrune,
  recordTerminalStageForProfile,
  ATP_STAGES,
  _testing,
} from "../../src/src/memory/atp-recorder.js";
import { EDEN_ENV_FIELDS } from "../../src/src/memory/eden-memory.js";

function makeFakeBin(): string {
  const dir = mkdtempSync(join(tmpdir(), "atp-recorder-"));
  const bin = join(dir, "eden-memory");
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] !== "remember") { process.exit(1); }
const contentArg = args.indexOf("--content");
if (contentArg === -1) { process.exit(1); }
const metadataArg = args.indexOf("--metadata");
if (metadataArg === -1) { process.exit(1); }
console.log(JSON.stringify({ id: "atp-mem-" + Date.now(), status: "remembered" }));
`,
    { mode: 0o700 },
  );
  return bin;
}

function buildEnv(bin: string): Record<string, string> {
  return {
    [EDEN_ENV_FIELDS.BIN]: bin,
    [EDEN_ENV_FIELDS.DB]: resolve(join(bin, ".."), "test.db"),
    [EDEN_ENV_FIELDS.WORKSPACE_ID]: "ws",
    [EDEN_ENV_FIELDS.USER_ID]: "user",
    [EDEN_ENV_FIELDS.AGENT_ID]: "agent",
  };
}

describe("ATP recorder", () => {
  let bin: string;

  beforeEach(() => {
    bin = makeFakeBin();
  });

  afterEach(() => {
    try {
      rmSync(join(bin, ".."), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("covers all seven lifecycle stages", () => {
    assert.deepEqual(ATP_STAGES, [
      "goal-receipt",
      "routing",
      "context-gathering",
      "action",
      "verification",
      "recording-and-archival",
      "hand-off-or-closure",
    ]);
  });

  it("builds marker lines with required fields", () => {
    const line = _testing.buildMarkerLine("action", "Produced artefact", {
      goalId: "g1",
      taskId: "t1",
      workerId: "w1",
      profileName: "builder",
      round: 1,
    });
    assert.ok(line.includes("[action]"));
    assert.ok(line.includes("goal:g1"));
    assert.ok(line.includes("task:t1"));
    assert.ok(line.includes("worker:w1"));
    assert.ok(line.includes("owner:builder|runtime"));
    assert.ok(line.includes("round:1"));
    assert.ok(line.includes("Produced artefact"));
  });

  it("builds metadata with round and supersession", () => {
    const meta = _testing.buildMetadata("routing", {
      goalId: "g1",
      taskId: "t1",
      round: 2,
      supersedes: "prev-id",
    });
    assert.equal(meta.marker, "[routing]");
    assert.equal(meta.stage, "routing");
    assert.equal(meta.owner, "dispatcher");
    assert.equal(meta.round, 2);
    assert.equal(meta.supersedes, "prev-id");
    assert.equal(meta.goalId, "g1");
  });

  it("records each lifecycle stage successfully", async () => {
    const env = buildEnv(bin);
    const ctx = { goalId: "g1", taskId: "t1", workerId: "w1", profileName: "builder" };
    const stages = [
      { fn: recordGoalReceipt, label: "Goal received" },
      { fn: recordRouting, label: "Routed to builder" },
      { fn: recordContextGathering, label: "Context gathered" },
      { fn: recordAction, label: "Built artefact" },
      { fn: recordVerification, label: "Passed verification" },
      { fn: recordRecordingAndArchival, label: "Archived" },
      { fn: recordHandOffOrClosure, label: "Closed" },
    ];
    for (const { fn, label } of stages) {
      const result = await fn(label, { env }, ctx);
      assert.equal(result.ok, true, `${label} should record`);
      assert.ok(result.memoryId?.startsWith("atp-mem-"), `${label} should have memory id`);
    }
  });

  it("uses merged eden options instead of raw env when gating recording", async () => {
    const env = buildEnv(bin);
    const edenOptions = {
      bin: env[EDEN_ENV_FIELDS.BIN],
      db: env[EDEN_ENV_FIELDS.DB],
      workspaceId: env[EDEN_ENV_FIELDS.WORKSPACE_ID],
      userId: env[EDEN_ENV_FIELDS.USER_ID],
      agentId: env[EDEN_ENV_FIELDS.AGENT_ID],
      enabled: true,
      semanticSearch: false,
    };
    // env is empty, but edenOptions carries the merged values.
    const result = await recordAction("Built artefact", { env: {}, edenOptions }, { goalId: "g1" });
    assert.equal(result.ok, true, "should record using merged edenOptions");
  });

  it("skips recording when merged eden options are missing required fields", async () => {
    const result = await recordAction("Built artefact", { env: {}, edenOptions: { enabled: true, semanticSearch: false } }, { goalId: "g1" });
    assert.equal(result.ok, false);
    assert.equal(result.skipped, true);
    assert.ok(result.error?.includes("Missing required eden-memory env fields"));
    assert.ok(result.error?.includes(EDEN_ENV_FIELDS.BIN));
  });

  it("skips recording when required env fields are missing", async () => {
    const env = {
      [EDEN_ENV_FIELDS.BIN]: "",
      [EDEN_ENV_FIELDS.DB]: "",
      [EDEN_ENV_FIELDS.WORKSPACE_ID]: "",
      [EDEN_ENV_FIELDS.USER_ID]: "",
      [EDEN_ENV_FIELDS.AGENT_ID]: "",
    };
    const result = await recordAction("Built artefact", { env }, { goalId: "g1" });
    assert.equal(result.ok, false);
    assert.equal(result.skipped, true);
    assert.ok(result.error?.includes("Missing required eden-memory env fields"));
  });

  it("records worker terminal events", async () => {
    const env = buildEnv(bin);
    const result = await recordWorkerTerminal("w1", "completed", "Implemented feature", { env }, { taskId: "t1", profileName: "builder" });
    assert.equal(result.ok, true);
    assert.equal(result.marker, "[recorded]");
  });

  it("records worker relay events", async () => {
    const env = buildEnv(bin);
    const result = await recordWorkerRelay("w2", "Need permission to deploy", "Assume production is allowed", { env }, { taskId: "t2", profileName: "runtime" });
    assert.equal(result.ok, true);
    assert.ok(result.error === undefined);
  });

  it("records worker prune events", async () => {
    const env = buildEnv(bin);
    const result = await recordWorkerPrune(2, { workers: 2, turns: 4, inputTokens: 100, outputTokens: 200, costUsd: 0.001 }, { env });
    assert.equal(result.ok, true);
  });

  it("sanitizes long content", () => {
    const long = "a".repeat(3000);
    const cleaned = _testing.sanitizeString(long, 100);
    assert.equal(cleaned.length, 100);
    assert.ok(cleaned.endsWith("…"));
  });

  it("dispatches terminal stage markers by profile name", async () => {
    const env = buildEnv(bin);
    const base = { env, goalId: "g1", taskId: "t1", workerId: "w1" };
    const researcher = await recordTerminalStageForProfile("researcher", "Findings landed", base);
    assert.equal(researcher.ok, true);
    assert.equal(researcher.stage, "context-gathering");
    const verifier = await recordTerminalStageForProfile("verifier", "Passed", base);
    assert.equal(verifier.ok, true);
    assert.equal(verifier.stage, "verification");
    const archivist = await recordTerminalStageForProfile("archivist", "Archived", base);
    assert.equal(archivist.ok, true);
    assert.equal(archivist.stage, "recording-and-archival");
    const builder = await recordTerminalStageForProfile("builder", "Built", base);
    assert.equal(builder.ok, true);
    assert.equal(builder.stage, "action");
    const runtime = await recordTerminalStageForProfile("runtime", "Deployed", base);
    assert.equal(runtime.ok, true);
    assert.equal(runtime.stage, "action");
    const dispatcher = await recordTerminalStageForProfile("dispatcher", "Routed", base);
    assert.equal(dispatcher.skipped, true);
  });
});
