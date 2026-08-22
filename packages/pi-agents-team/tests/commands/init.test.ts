import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { _testing } from "../../src/src/commands/team-init.js";

describe("/team-init scaffold", () => {
  it("includes the eden-memory memory block", () => {
    const scaffold = _testing.buildFullScaffold();
    assert.equal(scaffold.memory?.edenMemory?.enabled, false);
    assert.equal(scaffold.memory?.edenMemory?.semanticSearch, false);
  });
});
