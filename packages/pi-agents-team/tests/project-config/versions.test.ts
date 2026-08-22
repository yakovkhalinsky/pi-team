import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TEAM_PROJECT_SCHEMA_VERSION,
  TEAM_PROJECT_SCHEMA_VERSIONS_SUPPORTED,
  TEAM_SCAFFOLD_VERSION,
} from "../../src/src/project-config/versions.js";

describe("project-config/versions", () => {
  it("schema version is a supported positive integer", () => {
    assert.ok(Number.isInteger(TEAM_PROJECT_SCHEMA_VERSION));
    assert.ok(TEAM_PROJECT_SCHEMA_VERSION > 0);
    assert.ok(TEAM_PROJECT_SCHEMA_VERSIONS_SUPPORTED.includes(TEAM_PROJECT_SCHEMA_VERSION));
  });

  it("scaffold version is a positive integer", () => {
    assert.ok(Number.isInteger(TEAM_SCAFFOLD_VERSION));
    assert.ok(TEAM_SCAFFOLD_VERSION > 0);
  });

  it("supported versions list is non-empty and sorted", () => {
    assert.ok(TEAM_PROJECT_SCHEMA_VERSIONS_SUPPORTED.length > 0);
    const sorted = [...TEAM_PROJECT_SCHEMA_VERSIONS_SUPPORTED].sort((a, b) => a - b);
    assert.deepEqual(TEAM_PROJECT_SCHEMA_VERSIONS_SUPPORTED, sorted);
  });
});
