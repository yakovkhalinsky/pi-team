import { beforeEach, afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _testing } from "../../src/src/commands/team-enable.js";

describe("/team-enable persistRoutingMode", () => {
  let tmpDir: string;
  let previousGlobalConfigPath: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "team-enable-test-"));
    previousGlobalConfigPath = process.env.PI_AGENT_TEAM_GLOBAL_CONFIG_PATH;
    process.env.PI_AGENT_TEAM_GLOBAL_CONFIG_PATH = join(tmpDir, "agents-team.json");
  });

  afterEach(() => {
    if (previousGlobalConfigPath === undefined) {
      delete process.env.PI_AGENT_TEAM_GLOBAL_CONFIG_PATH;
    } else {
      process.env.PI_AGENT_TEAM_GLOBAL_CONFIG_PATH = previousGlobalConfigPath;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a timestamped backup before patching an existing config", () => {
    const original = { schemaVersion: 5, routingMode: "team", enabled: true };
    writeFileSync(join(tmpDir, "agents-team.json"), JSON.stringify(original, null, 2), { mode: 0o600 });

    const result = _testing.persistRoutingMode("global", "solo", tmpDir);

    assert.ok(!("error" in result), "expected success but got error");
    assert.equal(result.path, join(tmpDir, "agents-team.json"));
    assert.ok(result.backupPath, "expected a backup path");
    assert.ok(
      result.backupPath.startsWith(tmpDir),
      `backup path ${result.backupPath} should be inside tmp dir`,
    );

    const backupContent = JSON.parse(readFileSync(result.backupPath, "utf8"));
    assert.equal(backupContent.routingMode, "team", "backup should contain original routingMode");

    const writtenContent = JSON.parse(readFileSync(result.path, "utf8"));
    assert.equal(writtenContent.routingMode, "solo", "written config should have new routingMode");
    assert.equal(writtenContent.enabled, true, "unrelated fields should be preserved");
  });

  it("does not create a backup when the config file does not exist", () => {
    const result = _testing.persistRoutingMode("global", "team", tmpDir);

    assert.ok(!("error" in result), "expected success but got error");
    assert.equal(result.path, join(tmpDir, "agents-team.json"));
    assert.equal(result.backupPath, undefined, "expected no backup path for a new file");

    const writtenContent = JSON.parse(readFileSync(result.path, "utf8"));
    assert.equal(writtenContent.routingMode, "team");
  });

  it("is idempotent and creates a fresh backup on each persist", () => {
    const original = { schemaVersion: 5, routingMode: "solo", enabled: true };
    writeFileSync(join(tmpDir, "agents-team.json"), JSON.stringify(original, null, 2), { mode: 0o600 });

    const first = _testing.persistRoutingMode("global", "solo", tmpDir);
    assert.ok(!("error" in first), "first persist should succeed");
    assert.ok(first.backupPath, "first persist should back up the original");

    const firstContent = readFileSync(first.path, "utf8");

    const second = _testing.persistRoutingMode("global", "solo", tmpDir);
    assert.ok(!("error" in second), "second persist should succeed");
    assert.ok(second.backupPath, "second persist should back up the previous file");

    const secondContent = readFileSync(second.path, "utf8");
    assert.equal(firstContent, secondContent, "same routingMode should produce identical output");

    const backups = readdirSync(tmpDir).filter((name) => name.endsWith("agents-team.json") && name !== "agents-team.json");
    assert.equal(backups.length, 2, "each persist should produce one backup");
    assert.notEqual(first.backupPath, second.backupPath, "backup paths should be unique");
  });
});
