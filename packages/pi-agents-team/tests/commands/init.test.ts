import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { _testing } from "../../src/src/commands/team-init.js";
import { DEFAULT_TEAM_CONFIG } from "../../src/src/config.js";

describe("/team-init scaffold", () => {
  it("enables eden-memory by default", () => {
    const scaffold = _testing.buildFullScaffold();
    assert.equal(scaffold.memory?.edenMemory?.enabled, true);
    assert.equal(scaffold.memory?.edenMemory?.semanticSearch, false);
  });

  it("includes the worktree block with safe defaults", () => {
    const scaffold = _testing.buildFullScaffold();
    assert.equal(scaffold.worktree?.enabled, true);
    assert.equal(scaffold.worktree?.basePath, ".pi-team/worktrees");
    assert.equal(scaffold.worktree?.cleanupOnTerminal, true);
    assert.equal(scaffold.worktree?.cleanupOnPrune, true);
  });

  it("matches DEFAULT_TEAM_CONFIG memory and worktree defaults", () => {
    const scaffold = _testing.buildFullScaffold();
    assert.deepEqual(scaffold.memory, DEFAULT_TEAM_CONFIG.memory);
    assert.deepEqual(scaffold.worktree, DEFAULT_TEAM_CONFIG.worktree);
  });
});
