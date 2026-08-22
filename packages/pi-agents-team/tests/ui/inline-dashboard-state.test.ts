import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InlineDashboardState } from "../../src/src/ui/inline-dashboard-state.js";
import { makeTeamState, makeWorker } from "../fixtures.js";

describe("ui/inline-dashboard-state", () => {
  it("starts inactive", () => {
    const state = new InlineDashboardState();
    assert.equal(state.active, false);
    assert.equal(state.tab, "workers");
  });

  it("toggles active state", () => {
    const state = new InlineDashboardState();
    assert.equal(state.toggleActive(), true);
    assert.equal(state.toggleActive(), false);
  });

  it("setActive resets follow flags when inactive", () => {
    const state = new InlineDashboardState();
    state.inspectFollow = true;
    state.consoleFollow = true;
    state.setActive(false);
    assert.equal(state.inspectFollow, false);
    assert.equal(state.consoleFollow, false);
  });

  it("selectWorker resets scroll and console mode", () => {
    const state = new InlineDashboardState();
    state.inspectScroll = 5;
    state.consoleMode = "raw";
    state.selectWorker("w1");
    assert.equal(state.selectedWorkerId, "w1");
    assert.equal(state.inspectScroll, 0);
    assert.equal(state.consoleMode, "activity");
  });

  it("ensureSelectedWorker picks first worker when none selected", () => {
    const state = new InlineDashboardState();
    const team = makeTeamState([makeWorker({ workerId: "w2", profileName: "builder", status: "running" })]);
    state.ensureSelectedWorker(team);
    assert.equal(state.selectedWorkerId, "w2");
  });

  it("ensureSelectedWorker clears selection when no workers", () => {
    const state = new InlineDashboardState();
    state.selectedWorkerId = "w1";
    state.ensureSelectedWorker(makeTeamState());
    assert.equal(state.selectedWorkerId, undefined);
  });

  it("setTab ignores unknown tabs", () => {
    const state = new InlineDashboardState();
    state.setTab("unknown");
    assert.equal(state.tab, "workers");
    state.setTab("console");
    assert.equal(state.tab, "console");
  });
});
