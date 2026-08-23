# Tasks: eden-memory and the team as built-in primitives

**Date:** 2026-08-23
**Status:** Pending sign-off
**Companion to:** `docs/plans/config-review-eden-memory-required.md` (the design). This file is the **implementation breakdown** — every concrete change, in dependency order, with file paths and verification.
**Predecessor:** `ac33610` (team-status widget), `8a090c9` (BUG-005).

## How to use this file

Tasks are grouped into **phases**. Each phase should land as one commit. Phases are ordered by dependency: later phases assume earlier phases are in. Within a phase, tasks are numbered for reference but can be edited in any order as long as the phase's `Verification` passes.

**Convention.** Every code change cites a file path and a rough location (line range or function name). Every test change cites the test file and the test name (in backticks). Every deletion is a deletion, not a comment.

**Single commit at the end.** All seven phases land in one commit: `feat(path-a): eden-memory and the team are built-in primitives, no opt-out`. The phases here are for review and review-only — they should not produce seven separate commits.

---

## Phase 0 — Pre-flight (no code change)

These are reading-only steps. Do them first so the rest of the phases are accurate.

- [ ] **0.1** Read `packages/pi-agents-team/src/src/memory/eden-memory.ts` end-to-end. Note line numbers for `EDEN_ENV_FIELDS` (line ~10), `EDEN_DEFAULTS` (~27), `parseEnabledFlag` (~153), `parseSemanticSearchFlag` (~158), `resolveEdenOptions` (~335).
- [ ] **0.2** Read `packages/pi-agents-team/src/src/memory/memory-status.ts` end-to-end. Note line numbers for `createWorkerEdenMemoryStatus` (~58), `ensureWorkerEdenMemoryStatus` (~77), `createMemoryStatusTracker` (~92), `formatMemoryStatusFragment` (~182), `getMemoryStatusGlyph` (~197), `formatEdenMemoryEvent` (~215), `aggregateEdenMemoryStatus` (~285).
- [ ] **0.3** Read `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts` lines 500–740 (the `default function` body) and lines 1080–1140 (the `/team` command and `/agents` command). Note `session_start`, `session_shutdown`, `refreshUi`, `clearUi`, the `if (edenOptions.enabled === true)` branch, the `let widgetVisible` declaration, the `pi.registerCommand("team", ...)` block, and the `createWorkerEdenMemoryStatus(true)` call site.
- [ ] **0.4** Read the existing test mocks in `tests/shell.test.ts` (`createMockContext` ~line 36) and `tests/memory/memory-status.test.ts` (`createMemoryStatusTracker` block ~line 13) so the test changes in later phases are precise.
- [ ] **0.5** Run `cd packages/pi-agents-team && npm test 2>&1 | tail -10` to confirm the current test count is **112/112 pass** before any change. Record the exact number in the commit message.

**Phase 0 verification:** the current behaviour is documented and the baseline test count is known.

---

## Phase 1 — Strip `EDEN_MEMORY_ENABLED` (Surface 1)

**Files:** `packages/pi-agents-team/src/src/memory/eden-memory.ts`, `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`, `tests/memory/eden-memory.test.ts`, `tests/shell.test.ts`.

This is the surface-level removal. After this phase, the env var is dead, the parser is gone, and the optional-mode branches are removed. The graceful-fallback path (Phase 4) replaces them.

### Source code

- [ ] **1.1** In `eden-memory.ts` `EDEN_ENV_FIELDS` (~line 10): delete the line `ENABLED: "EDEN_MEMORY_ENABLED",`.
- [ ] **1.2** In `eden-memory.ts` `EDEN_DEFAULTS` (~line 27): delete the line `enabled: "true",`.
- [ ] **1.3** In `eden-memory.ts`: delete the entire `parseEnabledFlag` function (~lines 153–157).
- [ ] **1.4** In `eden-memory.ts` `resolveEdenOptions` (~line 335): delete the line `enabled: parseEnabledFlag(env[EDEN_ENV_FIELDS.ENABLED]),` from the returned object.
- [ ] **1.5** In `index.ts` `session_start` handler (~line 666): replace the entire `if (edenOptions.enabled === true) { ... } else { blockedGoalsReady = Promise.resolve(); }` block with the unconditional tracker creation that Phase 4 will refine. For now, use the existing tracker-creation code but always run it (drop the `if` guard and the `else` branch).
- [ ] **1.6** In `index.ts` `attachWorkerMemoryStatus` (~line 608) and `recordWorkerCompletion` (~line 613): drop the `if (!memoryTracker?.status?.enabled) return;` guards — these are replaced in Phase 3 with `if (!memoryTracker) return;`. For now, just delete the guards (they'd be no-ops after Phase 1's change since the field still exists but is no longer set).

### Tests to delete

- [ ] **1.7** In `tests/memory/eden-memory.test.ts`: in the test "falls back to defaults for missing env values", delete the line `assert.equal(options.enabled, true);`.
- [ ] **1.8** In `tests/memory/eden-memory.test.ts`: delete the entire test "parses the enabled and semantic-search flags" (the `EDEN_MEMORY_ENABLED` assertions are gone; keep nothing from this test — `EDEN_MEMORY_SEMANTIC_SEARCH` parsing moves to a new test in 1.9).
- [ ] **1.9** In `tests/memory/eden-memory.test.ts`: add a new test "parses the semantic-search flag" with just the four semantic-search assertions from the deleted test:
  ```ts
  it("parses the semantic-search flag", () => {
    assert.equal(resolveEdenOptions({ [EDEN_ENV_FIELDS.SEMANTIC_SEARCH]: "true" }).semanticSearch, true);
    assert.equal(resolveEdenOptions({ [EDEN_ENV_FIELDS.SEMANTIC_SEARCH]: "false" }).semanticSearch, false);
    assert.equal(resolveEdenOptions({}).semanticSearch, false);
    assert.equal(resolveEdenOptions({ [EDEN_ENV_FIELDS.SEMANTIC_SEARCH]: "yes" }).semanticSearch, false);
  });
  ```
- [ ] **1.10** In `tests/shell.test.ts`: delete the test "does not run eden-memory startup work when disabled".
- [ ] **1.11** In `tests/shell.test.ts`: delete the test "widget says memory: disabled when eden-memory is not enabled" (Phase 4 will replace it with the "widget says team unavailable" test).

**Phase 1 verification:**
- `npm run build` clean.
- `npm run typecheck` clean.
- `npm test`: expect 110 tests, 110 pass (down 2 from 112: the two deleted tests in 1.10 and 1.11). The new test 1.9 brings it back to 110. The deleted 1.7 line doesn't change the count.
- `grep -rn "EDEN_MEMORY_ENABLED\|parseEnabledFlag\|edenOptions\.enabled" packages/pi-agents-team/src packages/pi-agents-team/tests` returns **zero matches** (the `enabled` field on `resolveEdenOptions` is gone; the parser is gone; the wrapper is gone).

---

## Phase 2 — Strip `memory.enabled` runtime field (Surface 5)

**Files:** `packages/pi-agents-team/src/src/memory/memory-status.ts`, `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`, `tests/memory/memory-status.test.ts`, `tests/shell.test.ts`.

This phase removes the redundant runtime `enabled` field from the tracker's status and the per-worker status. The `createWorkerEdenMemoryStatus(enabled)` parameter goes. The dead `ensureWorkerEdenMemoryStatus` function is deleted.

### Source code

- [ ] **2.1** In `memory-status.ts` `createWorkerEdenMemoryStatus` (~line 58): change the signature from `(enabled)` to `()`. Remove `enabled` from the returned object. Keep `byMarker: emptyByMarker()` always (the conditional goes away).
- [ ] **2.2** In `memory-status.ts`: delete the entire `ensureWorkerEdenMemoryStatus` function (~lines 77–84). Also delete the export and any associated JSDoc.
- [ ] **2.3** In `memory-status.ts` `createMemoryStatusTracker` (~line 92): in the returned `status` object, delete the `enabled: options.enabled,` line. Also delete the `byMarker: options.enabled ? emptyByMarker() : undefined,` line and replace with `byMarker: emptyByMarker(),` (the tracker is always created when this function is called, so byMarker is always initialised).
- [ ] **2.4** In `memory-status.ts` `formatMemoryStatusFragment` (~line 182): change `if (!status || !status.enabled) return "";` to `if (!status) return "";`.
- [ ] **2.5** In `memory-status.ts` `getMemoryStatusGlyph` (~line 197): same change — `if (!status || !status.enabled) return "";` → `if (!status) return "";`.
- [ ] **2.6** In `memory-status.ts` `formatEdenMemoryEvent` (~line 215): same change.
- [ ] **2.7** In `memory-status.ts` `aggregateEdenMemoryStatus` (~line 285): change `if (teamStatus && teamStatus.enabled) statuses.push(teamStatus);` to `if (teamStatus) statuses.push(teamStatus);`. Change `if (worker.edenMemoryStatus && worker.edenMemoryStatus.enabled) {` to `if (worker.edenMemoryStatus) {`.
- [ ] **2.8** In `index.ts`: replace all 5 occurrences of `memoryTracker?.status?.enabled` with `memoryTracker` (or `memoryTracker != null` if a clearer intent is desired). The sites are at lines 273, 608, 613, 730, 831 (per the audit).
- [ ] **2.9** In `index.ts` `attachWorkerMemoryStatus` (~line 608): change `record.edenMemoryStatus = createWorkerEdenMemoryStatus(true);` to `record.edenMemoryStatus = createWorkerEdenMemoryStatus();`.

### Tests

- [ ] **2.10** In `tests/memory/memory-status.test.ts`: in the `describe("createWorkerEdenMemoryStatus / ensureWorkerEdenMemoryStatus")` block, change the `createWorkerEdenMemoryStatus` tests to call the no-arg function. The tests that pass `false` should now assert that the returned object always has `byMarker` initialised. Add a test that the no-arg function always returns an object with `byMarker`.
- [ ] **2.11** In `tests/memory/memory-status.test.ts`: delete the `describe("createWorkerEdenMemoryStatus / ensureWorkerEdenMemoryStatus")` tests that exercise `ensureWorkerEdenMemoryStatus`. There are two such tests ("ensureWorkerEdenMemoryStatus attaches the status when enabled and config is on" and "ensureWorkerEdenMemoryStatus leaves the worker alone when disabled"). Both go.
- [ ] **2.12** In `tests/memory/memory-status.test.ts`: in the `aggregateEdenMemoryStatus` describe, change all `teamStatus = { enabled: true, ... }` constructions to `teamStatus = { ... }` (truthy object, no `enabled` field). Update assertions that check `teamStatus.enabled` to check for truthiness instead.
- [ ] **2.13** In `tests/shell.test.ts`: in the test "buildTeamSnapshot and buildStatusLine produce expected shapes", remove the `enabled: true` field from the `fakeTracker` construction. The test should pass a status object without that field.

**Phase 2 verification:**
- `npm run build` clean.
- `npm run typecheck` clean.
- `npm test`: expect ~108 tests, all pass. (Down 2 from 110: the two deleted `ensureWorkerEdenMemoryStatus` tests in 2.11. The 2.10 update doesn't change the count.)
- `grep -rn "ensureWorkerEdenMemoryStatus\|status\.enabled\|edenMemoryStatus\.enabled" packages/pi-agents-team/src packages/pi-agents-team/tests` returns **zero matches** (the function is gone, the field is gone, all reads are gone).
- `grep -rn "createWorkerEdenMemoryStatus(true" packages/pi-agents-team/src packages/pi-agents-team/tests` returns **zero matches** (the parameter is gone).

---

## Phase 3 — Conditional tool/command/widget registration (Surface 6 part 1)

**Files:** `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`, `tests/shell.test.ts`.

This phase introduces a `teamLoaded` boolean that gates all team-side registration. The health check sets it. Phases 4 and 5 will reuse it.

This phase is a refactor (move existing code into a conditional) — no behaviour change yet. The team is currently always loaded, so `teamLoaded` is always `true` after `session_start`. This sets up Phase 4 (graceful fallback) and Phase 5 (widget is always on).

### Source code

- [ ] **3.1** In `index.ts`: add a `let teamLoaded = false;` to the closure scope of `default function`, alongside `let memoryTracker = null;`.
- [ ] **3.2** In `index.ts` `session_start`: after the existing memory-tracker creation (the body that was previously gated by `if (edenOptions.enabled === true)`), set `teamLoaded = true;`. The widget-rendering branch in `refreshUi` (added in Phase 5) will check this.
- [ ] **3.3** In `index.ts` `session_start`: at the top of the handler, after the early `recordState()` and `workers.clear()` and `lastBlockedGoals = []` calls, set `teamLoaded = false;`. This is the "fallback" default. Phase 4 will set it back to `true` only on health success.
- [ ] **3.4** In `index.ts` `session_shutdown`: set `teamLoaded = false;` in the same place as the existing `clearUi()` call. (Reset on shutdown so a new session starts clean.)

This phase **does not** change the behaviour — `teamLoaded` is set to `true` unconditionally today, and Phase 4 will add the condition. After this phase, `teamLoaded` is effectively always `true` after `session_start`. Subsequent phases gate the widget and the team registration on it.

**Phase 3 verification:**
- `npm run build` clean.
- `npm run typecheck` clean.
- `npm test`: ~108 tests, all pass. (Same as end of Phase 2; no test changes in this phase.)
- `grep -n "teamLoaded" packages/pi-agents-team/src/extensions/pi-agent-team/index.ts` shows the four sites above (declaration, two resets, one set).
- `grep -rn "teamLoaded" packages/pi-agents-team/tests` returns **zero matches** — no test changes.

---

## Phase 4 — Graceful fallback (Surface 6 part 2)

**Files:** `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`, `tests/shell.test.ts`.

This phase is the heart of the contract change. After this phase, when eden-memory is unreachable, the team is not loaded and the user gets a normal pi session with a footer status and a notification.

### Source code

The current `session_start` handler does this (paraphrased from `index.ts`):

```
session_start(event, ctx):
  recordState()
  workers.clear()
  lastBlockedGoals = []
  ... stopPolling/memoryTracker reset ...
  widgetVisible = false (Phase 5 will remove)
  lastUiCtx = ctx
  agents = discoverAgents(ctx.cwd ?? process.cwd())
  if (agents.length > 0 && ctx?.hasUI) notify(...)
  refreshUi(ctx)
  edenOptions = resolveEdenOptions(process.env)
  if (edenOptions.enabled === true) {           // <-- gated
    memoryTracker = createMemoryStatusTracker(...)
    memoryTracker.startPolling()
    ... health check + goal-receipt + blocked-goals ...
  } else {
    blockedGoalsReady = Promise.resolve()
  }
```

After Phase 4, the shape is:

```
session_start(event, ctx):
  recordState()
  workers.clear()
  lastBlockedGoals = []
  ... stopPolling/memoryTracker reset ...
  lastUiCtx = ctx
  teamLoaded = false    // <-- new
  agents = discoverAgents(...)
  if (agents.length > 0 && ctx?.hasUI) notify(...)
  // The widget is now rendered conditionally. But we need a snapshot first
  // to know if the team is up. Defer widget rendering until after the
  // health check.
  edenOptions = resolveEdenOptions(process.env)
  startupSignal = AbortSignal.timeout(15_000)
  healthResult = await health(edenOptions, startupSignal)
  if (healthResult.ok) {
    teamLoaded = true    // <-- new
    memoryTracker = createMemoryStatusTracker(...)
    memoryTracker.startPolling()
    memoryTracker.updateFromHealthResult(healthResult)
    ... goal-receipt + blocked-goals ...
  } else {
    // Graceful fallback.
    pi.appendEntry(MEMORY_STATUS_TYPE, {
      type: MEMORY_STATUS_TYPE,
      level: "fatal",
      message: `eden-memory unreachable at ${edenOptions.bin}: ${healthResult.error}`,
    })
    // Footer + notify. Note: refreshUi reads teamLoaded.
    refreshUi(ctx)
    ctx?.ui?.notify?.(`Team unavailable — eden-memory unreachable at ${edenOptions.bin}. Run install or fix the path.`, "error")
    return    // <-- no team registration
  }
  refreshUi(ctx)
  // (then: tool/command registration as today, all inside this branch)
  registerTool(delegate_task, ...)
  registerTool(wait_for_agents, ...)
  registerTool(abort_worker, ...)
  registerCommand(stop-worker, ...)
  registerCommand(agents, ...)
```

The tool and command registration currently happens at the top level of `default function`, not inside `session_start`. The current shape is "register everything synchronously on extension load, then `session_start` adds state." For graceful fallback, the team tools/commands must be registered only when the team is loaded. The cleanest way is to move tool/command registration **inside** `session_start` (which is also what pi's extension model supports — `pi.registerTool()` works inside `session_start` per the docs).

- [ ] **4.1** Refactor `index.ts` so that `pi.registerTool(delegate_task, ...)`, `pi.registerTool(wait_for_agents, ...)`, `pi.registerTool(abort_worker, ...)`, `pi.registerCommand("stop-worker", ...)`, and `pi.registerCommand("agents", ...)` happen inside `session_start` (after `teamLoaded = true`). The implementations of these tools/commands stay where they are (defined as local functions or inner objects); only the registration calls move.
- [ ] **4.2** In `session_start`, after the `if (healthResult.ok) { ... }` branch, restructure the existing health-check block so the tracker creation happens inside the success branch. The `startupSignal`, the `health(edenOptions, startupSignal)` call, the `memoryTracker.startPolling()` call, the `recordGoalReceipt`, the `findBlockedOrUnfinishedGoals`, the `logMemoryWarning` calls all stay — but they run only on health success. On failure, the fatal entry, refreshUi (which reads `teamLoaded = false`), notify, and early return.
- [ ] **4.3** In `session_start`, the `refreshUi(ctx)` call that was unconditional moves to **after** the `if (healthResult.ok)` block, and inside `session_start` it's called once at the end. In the fallback branch, it's called before the `return` so the user sees the footer status immediately.
- [ ] **4.4** In `session_start`, the `agents.length > 0 && ctx?.hasUI` notification ("Pi Agents Team (Path A) loaded N agent profile(s).") stays as-is — it fires before the health check, telling the user agents are discovered. The footer status (set by `refreshUi`) carries the load state.

A subtle issue: tool/command registration inside `session_start` runs **every session start**, not just on first load. `pi.registerTool()` is idempotent (per the docs: "new tools are refreshed immediately in the same session"), but the **call sites** must not duplicate. Define the tool/command bodies once (as `const delegateTaskTool = { name: "delegate_task", ... }`) outside `session_start`, then call `pi.registerTool(delegateTaskTool)` inside `session_start`. The same for the other four.

- [ ] **4.5** In `index.ts`: refactor the tool/command definitions to be **factories** that return the tool/command object, called once per `session_start`. The `delegate_task`, `wait_for_agents`, `abort_worker` tool bodies reference the closure-scope `memoryTracker`, `workers`, `attachWorkerMemoryStatus`, `recordWorkerCompletion`, `aggregateEdenMemoryStatus`, etc. — these stay in the closure. The factory functions take no arguments and close over the closure state. Re-registering the same tool name on every session is a no-op for pi but a fresh closure each time.

### Tests

- [ ] **4.6** In `tests/shell.test.ts`: add a new test "session_start falls back gracefully when eden-memory is unreachable". Setup: a `pi` mock with the standard extension. Use the existing `createMockPi()` helper. The fake eden bin is **not** in `process.env.PATH` (or `EDEN_MEMORY_BIN` points to a missing file). Run `session_start`. Assert: (a) the `delegate_task`, `wait_for_agents`, `abort_worker` tools are NOT in `pi.tools`; (b) the `/agents`, `/stop-worker` commands are NOT in `pi.commands`; (c) a `pi-agents-team/memory-status` entry with `level: "fatal"` was appended; (d) `ctx.ui.setStatus` was called with the team status key and a string containing "unreachable"; (e) `ctx.ui.notify` was called with a string containing "unreachable".
- [ ] **4.7** In `tests/shell.test.ts`: add a new test "session_start falls back gracefully when eden-memory binary is missing". Same shape as 4.6, but the failure mode is a missing file. Set `EDEN_MEMORY_BIN=/does/not/exist/eden-memory` in `process.env` (clean up in `afterEach`).
- [ ] **4.8** In `tests/shell.test.ts`: the existing "does not run eden-memory startup work when disabled" test was deleted in Phase 1. The happy-path tests (e.g. "records eden-memory health, goal-receipt and blocked goals on session_start when enabled") still pass because they set up the fake bin and exercise the success branch.

**Phase 4 verification:**
- `npm run build` clean.
- `npm run typecheck` clean.
- `npm test`: ~110 tests, all pass. (Up 2 from 108: the two new fallback tests in 4.6 and 4.7.)
- `grep -n "registerTool\|registerCommand" packages/pi-agents-team/src/extensions/pi-agent-team/index.ts` shows the calls are inside `session_start`, not at the top level of `default function`.
- Manual smoke test (if a TTY is available): with `EDEN_MEMORY_BIN` pointing at a missing file, `pi` should start normally, the footer should say "Team unavailable — eden-memory unreachable", and a notification should fire.

---

## Phase 5 — Widget is always on (Surface 7)

**Files:** `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`, `tests/shell.test.ts`.

This phase makes the widget always-on when the team is loaded, removes the `widgetVisible` state, and removes the `/team` command.

### Source code

- [ ] **5.1** In `index.ts`: delete the line `let widgetVisible = false;` in the closure scope. Delete any reference to `widgetVisible` in `session_start` (the reset `widgetVisible = false;`).
- [ ] **5.2** In `index.ts` `refreshUi`: remove the `if (widgetVisible)` guard around the `setWidget` call. The widget is now rendered when `teamLoaded === true` (or, equivalently, when `memoryTracker` exists, since `memoryTracker` is only created on health success in Phase 4). Simplify the conditional to `if (teamLoaded) { setWidget(TEAM_WIDGET_KEY, buildWidgetLines(snapshot), { placement: "belowEditor" }); } else { setWidget(TEAM_WIDGET_KEY, undefined); }`.
- [ ] **5.3** In `index.ts` `clearUi` (session_shutdown): the existing `setWidget(TEAM_WIDGET_KEY, undefined)` stays. No change.
- [ ] **5.4** In `index.ts`: delete the entire `pi.registerCommand("team", { ... })` block (~lines 1107–1126 per the audit). Replace any reference to the `/team` command in code with `/agents` (the only other slash command the extension provides).
- [ ] **5.5** In `index.ts` `buildWidgetLines`: change the final line from `"Use /team to toggle this panel. /agents for details."` to `"Use /agents for details."`. The team panel is always visible when the team is loaded; the toggle command is gone.

### Tests

- [ ] **5.6** In `tests/shell.test.ts`: delete the test `"/team command toggles the widget visibility"`. The toggle no longer exists.
- [ ] **5.7** In `tests/shell.test.ts`: in the test "widget does not throw and stays minimal when no agents are discovered", update the assertion `assert.ok(lines.some((l) => l.includes("/team")), "should include the /team hint");` to assert on `/agents` instead: `assert.ok(lines.some((l) => l.includes("/agents")), "should include the /agents hint");`.
- [ ] **5.8** In `tests/shell.test.ts`: add a new test "session_start renders the widget when the team is loaded". Setup: the standard extension with the fake eden bin in env. Run `session_start` with a `hasUI: true` context. Assert: the most recent `setWidget` call for the team widget key has a non-undefined `value` (an array of strings).
- [ ] **5.9** In `tests/shell.test.ts`: add a new test "session_start does not render the widget when the team falls back". Setup: `EDEN_MEMORY_BIN` pointing at a missing file. Run `session_start`. Assert: the most recent `setWidget` call for the team widget key has `value: undefined`.

**Phase 5 verification:**
- `npm run build` clean.
- `npm run typecheck` clean.
- `npm test`: ~109 tests, all pass. (Net: deleted 1 (5.6), added 2 (5.8, 5.9), updated 1 (5.7, no count change).)
- `grep -rn "widgetVisible\|/team command" packages/pi-agents-team/src packages/pi-agents-team/tests` returns **zero matches**.
- The `pi.commands` list in the test mock, after `session_start` runs, contains `["stop-worker", "agents"]` and **not** `"team"`.

---

## Phase 6 — Prune legacy config files (Surface 4)

**Files:** `templates/.pi/agent/agents-team.json`, `install.sh`, this repo's `.pi/agent/agents-team.json`, eden-memory's `.pi/agent/agents-team.json`.

This phase deletes the legacy Path B config file. The extension does not read it; deleting it removes a source of confusion.

### File deletions

- [ ] **6.1** Delete `templates/.pi/agent/agents-team.json` from the repo. Commit this as part of the same commit (the template is gitignored? — verify; if not, the deletion is just a tracked file removal).
- [ ] **6.2** Delete `~/git/pi-team/.pi/agent/agents-team.json` from the working tree. This is a tracked file? — verify; the `.pi/` directory in the repo is the project-local pi config.
- [ ] **6.3** Delete `~/git/eden-memory/.pi/agent/agents-team.json`. This is not a tracked file (eden-memory is a separate repo), but the user wants the file removed from the deployed install. Use `rm` directly; this is a user-scope cleanup, not a tracked file deletion.

### `install.sh` changes

- [ ] **6.4** In `install.sh`: identify the step that writes or backs up `agents-team.json` (around line 160 per the audit). Remove the backup logic. The `if [[ -f "${PI_CONFIG_FILE}" && "${FORCE}" == "false" ]]; then warn ...; cp ...; fi` block goes.
- [ ] **6.5** In `install.sh`: identify the variables `PI_CONFIG_FILE` and `AGENTS_TEAM_CONFIG` (or whatever they are named). Remove the variables if they're now unused. Verify with `grep -n "PI_CONFIG_FILE\|AGENTS_TEAM_CONFIG" install.sh` after the deletion — should return zero matches.
- [ ] **6.6** In `install.sh`: identify the `GITIGNORE_ENTRIES` array (~line 264 per the audit). It may reference `agents-team.json` indirectly via `${PI_TEAM_DIR}`. Verify the array is still correct after removing the agents-team step.

### Test impact

None. There are no tests for `install.sh`'s handling of `agents-team.json`.

**Phase 6 verification:**
- `git status` shows the deletion of `templates/.pi/agent/agents-team.json` and (if applicable) the project's own `.pi/agent/agents-team.json`.
- `ls ~/.pi/agent/agents-team.json 2>&1` returns "No such file or directory" in both `~/git/pi-team` and `~/git/eden-memory`.
- `grep -n "agents-team.json\|AGENTS_TEAM\|PI_CONFIG_FILE" install.sh templates/` returns zero matches.

---

## Phase 7 — `.env` cleanup (Surface 3)

**Files:** `install.sh`, this repo's `.env` (if applicable), eden-memory's `.env` (if applicable).

This phase stops `install.sh` from writing `EDEN_MEMORY_ENABLED` to `.env` and removes the line from existing `.env` files (without touching the other identity vars).

### `install.sh` changes

- [ ] **7.1** In `install.sh`: identify the step that writes `.env` (Step 5 or wherever). The line that writes `EDEN_MEMORY_ENABLED=true` (or similar) goes. The other env vars (`EDEN_MEMORY_BIN`, `EDEN_MEMORY_DB`, `EDEN_WORKSPACE_ID`, `EDEN_USER_ID`, `EDEN_AGENT_ID`, `EDEN_MEMORY_SEMANTIC_SEARCH`) stay.
- [ ] **7.2** In `install.sh`: if there's a step that *validates* the `.env` (checks all required keys are present), update the validation to no longer require `EDEN_MEMORY_ENABLED`.

### `.env` files

- [ ] **7.3** In `~/git/pi-team/.env`: if the file has `EDEN_MEMORY_ENABLED=...`, remove that line. Leave the other vars alone.
- [ ] **7.4** In `~/git/eden-memory/.env`: if the file has `EDEN_MEMORY_ENABLED=...`, remove that line. (The user mentioned this repo in earlier sessions; verify it has a `.env` and act accordingly.)

### Test impact

None. There are no tests for `.env` generation.

**Phase 7 verification:**
- `grep -rn "EDEN_MEMORY_ENABLED" packages/pi-agents-team install.sh .env 2>/dev/null` returns zero matches (the env var is gone from the source, the install script, and the deployed `.env` files).
- `cat .env` shows the identity vars but not `EDEN_MEMORY_ENABLED`.

---

## Phase 8 — README update

**Files:** `packages/pi-agents-team/README.md`.

This phase documents the new contract. The README is the user-facing contract for the extension; it should accurately reflect the build-in, no-opt-out behaviour.

- [ ] **8.1** In `README.md`: update the "Team UI" section to remove the `/team` command reference. The team panel is now always visible when the team is loaded; the toggle command is gone.
- [ ] **8.2** In `README.md`: update the "What remains" list. Remove `/team` from the slash commands. Add a note that the team loads when eden-memory is healthy and falls back to a normal pi session with a footer status when it isn't.
- [ ] **8.3** In `README.md`: add a short "Configuration" or "Requirements" section that lists what the team needs: (a) the extension must be installed via `pi install` or `pi install -l`; (b) the `EDEN_MEMORY_BIN` env var must point at a working eden-memory binary; (c) the other identity env vars (`EDEN_MEMORY_DB`, `WORKSPACE_ID`, `USER_ID`, `AGENT_ID`) must be set, with defaults documented. State that there is no opt-out — if any of these fail, the team is not loaded.
- [ ] **8.4** In `README.md`: drop any mention of `EDEN_MEMORY_ENABLED`. The var is gone.

**Phase 8 verification:**
- `grep -n "EDEN_MEMORY_ENABLED\|/team command\|widgetVisible" README.md` returns zero matches.
- Reading the "Team UI" section top-to-bottom, the contract is: "team is always on if eden-memory is healthy, falls back gracefully otherwise, no toggle."

---

## Phase 9 — Final commit and verification

This phase produces the single commit and runs the full verification suite.

- [ ] **9.1** Run `cd packages/pi-agents-team && npm run check` (build + typecheck + test). All green. Record the final test count and duration in the commit message.
- [ ] **9.2** Run `git diff --stat` to confirm the scope of the change. Expected files touched:
  - `packages/pi-agents-team/src/src/memory/eden-memory.ts` (Phase 1)
  - `packages/pi-agents-team/src/src/memory/memory-status.ts` (Phase 2)
  - `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts` (Phases 3, 4, 5)
  - `packages/pi-agents-team/tests/memory/eden-memory.test.ts` (Phase 1)
  - `packages/pi-agents-team/tests/memory/memory-status.test.ts` (Phase 2)
  - `packages/pi-agents-team/tests/shell.test.ts` (Phases 1, 2, 4, 5)
  - `install.sh` (Phases 6, 7)
  - `templates/.pi/agent/agents-team.json` (Phase 6, deleted)
  - `packages/pi-agents-team/README.md` (Phase 8)
  - `.pi/agent/agents-team.json` in this repo (Phase 6, deleted)
  - `.env` in this repo and eden-memory (Phase 7, line removal)
  - `docs/plans/config-review-eden-memory-required.md` (header — mark status as "Implemented" and add the closing commit SHA once 9.3 lands)
- [ ] **9.3** Commit with the message:
  ```
  feat(path-a): eden-memory and the team are built-in primitives, no opt-out

  Apply the principle that required primitives have no configuration knob.
  The team either loads fully (when eden-memory is healthy) or doesn't
  load (when it isn't), and the user gets a normal pi session with a
  clear footer status and notification in the latter case. There is no
  EDEN_MEMORY_ENABLED env var, no /team toggle, no widgetVisible state,
  and no runtime `enabled` field on the memory tracker.

  Detailed design: docs/plans/config-review-eden-memory-required.md
  Detailed task breakdown: docs/plans/config-review-eden-memory-required-tasks.md

  What this commit does
  ---------------------

  1. Removes EDEN_MEMORY_ENABLED, parseEnabledFlag, and the optional-mode
     branch in session_start. The env var is no longer read; the
     EDEN_DEFAULTS.enabled field is gone; the resolveEdenOptions return
     shape no longer has an `enabled` key.

  2. Removes the runtime `enabled` field from memoryTracker.status and
     from the per-worker edenMemoryStatus. The defensive checks (5 in
     memory-status.ts, 5 in index.ts) collapse to "is the tracker
     truthy?" createWorkerEdenMemoryStatus takes no parameter and
     always returns a status with byMarker initialised.
     ensureWorkerEdenMemoryStatus(worker, config) is deleted: it was
     config-aware, is not called from production, and has no purpose
     once the config is gone.

  3. Refactors session_start to gate tool/command registration on
     eden-memory health. On health success, the team loads normally
     (all tools, commands, widget, system-prompt block). On health
     failure, the extension logs a fatal entry, sets a one-line
     footer status ("Team unavailable — eden-memory unreachable at
     <bin>"), fires a ctx.ui.notify, and does not register the team.
     The orchestrator sees a normal pi session.

  4. Makes the team-status widget always-on when the team is loaded.
     Removes widgetVisible, the /team command, and the toggle logic.
     The widget is rendered on every refresh when the team is up and
     not rendered when the team falls back. The hint line in the
     widget changes from "Use /team to toggle this panel. /agents
     for details." to "Use /agents for details."

  5. Prunes the legacy Path B config file. templates/.pi/agent/
     agents-team.json is deleted. This repo's .pi/agent/
     agents-team.json is deleted. eden-memory's deployed
     .pi/agent/agents-team.json is removed. install.sh no longer
     writes or backs up the file. The .pi/agent/agents-team.json
     format implied configuration that the extension does not
     honour; removing it removes a source of confusion.

  6. install.sh stops writing EDEN_MEMORY_ENABLED to .env. Existing
     .env files in this repo and in eden-memory have the
     EDEN_MEMORY_ENABLED line removed. The other identity env vars
     (EDEN_MEMORY_BIN, EDEN_MEMORY_DB, EDEN_WORKSPACE_ID,
     EDEN_USER_ID, EDEN_AGENT_ID) stay — they are connection
     identity, not opt-out config.

  7. README is updated to reflect the new contract: the team is on
     when the extension is installed and eden-memory is healthy,
     falls back gracefully otherwise, has no toggle, has no opt-out.

  Tests
  -----

  - Removed: the two "disabled mode" tests in shell.test.ts, the
    "parses the enabled flag" test in eden-memory.test.ts, the
    "/team command toggles" test, and the two
    ensureWorkerEdenMemoryStatus tests.
  - Added: "session_start falls back gracefully when eden-memory
    is unreachable", "session_start falls back gracefully when
    eden-memory binary is missing", "session_start renders the
    widget when the team is loaded", "session_start does not
    render the widget when the team falls back", and a fresh
    "parses the semantic-search flag" test that doesn't share
    surface with the deleted enabled test.

  Test count: N tests, all pass (record the actual N before
  committing).

  Behaviour changes for downstream users
  -------------------------------------

  - EDEN_MEMORY_ENABLED is no longer read. Users who set it to
    `false` to disable the team get normal behaviour — the var
    is silently ignored. They will see the team load and the
    widget appear. To disable the team, uninstall the extension.
  - /team is gone. The widget is always on when the team is
    loaded. There is no way to hide it.
  - ensureWorkerEdenMemoryStatus(worker, config) is removed from
    the public API. External callers (if any) need to call
    createWorkerEdenMemoryStatus() directly.
  - The byMarker histogram is always initialised when the
    tracker is created. The conditional `options.enabled ?
    emptyByMarker() : undefined` is gone. Code that branched on
    `status.byMarker === undefined` will see a non-undefined
    histogram now.

  Closes the design at docs/plans/config-review-eden-memory-required.md.
  ```
- [ ] **9.4** Push to `origin/main` (the user has been pushing after each commit; this commit is no different). The user is the one who decides when to push; this task is "produce the commit, don't push."

---

## Test count ledger

| Phase | Net change | Cumulative |
|---|---|---|
| Baseline | — | 112 |
| Phase 1 | -2 + 1 (1.10, 1.11 deleted; 1.9 added) | 111 |
| Phase 2 | -2 (2.11) | 109 |
| Phase 3 | 0 | 109 |
| Phase 4 | +2 (4.6, 4.7) | 111 |
| Phase 5 | -1 + 2 (5.6 deleted; 5.8, 5.9 added) | 112 |
| Phase 6 | 0 | 112 |
| Phase 7 | 0 | 112 |
| Phase 8 | 0 | 112 |
| Phase 9 | — | 112 |

So we land at **~112 tests, all pass**. The count is the same as the baseline; the shape of the tests is materially different (fewer "config knob" tests, more "graceful fallback" tests).

If the actual count differs by ±2 at the end, the commit message should reflect the real number. The test ledger is for the implementer's tracking, not a hard target.

---

## Risk checklist

Carried forward from the plan, with the action that mitigates each:

- [ ] **Users running in optional mode via EDEN_MEMORY_ENABLED=false:** the var is silently ignored after this commit. The commit message calls this out. (Mitigation: commit message + README.)
- [ ] **CI environments without eden-memory:** the team is not loaded. Documented in the README "Requirements" section. (Mitigation: README 8.3.)
- [ ] **External callers of ensureWorkerEdenMemoryStatus:** the function is removed. Documented as a behaviour change. (Mitigation: commit message.)
- [ ] **External callers reading status.byMarker to detect "memory not enabled":** the histogram is now always present. Documented as a behaviour change. (Mitigation: commit message.)
- [ ] **Users who liked the /team toggle to hide the panel:** the toggle is gone. The widget is always on. The user has explicitly accepted this. (Mitigation: none needed; this is the requested behaviour.)
- [ ] **The graceful-fallback footer status is set once at session_start and not cleared on later health recovery:** documented in the plan's open question 3. Not addressed in this commit; can be added later. (Mitigation: README + commit message note.)

---

## Out of scope (carried forward from the plan)

- BUG-005 (the `main` user-scope agent). User-scope branch in `discoverAgents` stays.
- BUG-003 (test runner open handle). `--test-force-exit` workaround stays.
- BUG-004 (widget visual). Still unverified in a real TUI.
- BUG-002 (install.sh path-based fix). Still pending. Not bundled with this commit.
- A `pi-team setup` wizard or `/team-env` slash command. The fallback notification references this; it can be added later.

---

## Execution summary

**9 phases, 1 commit.** Phases 0–9 in dependency order. Test count starts at 112 and ends at ~112. The diff touches ~10 files in the package, plus install.sh, the template, and the deployed `.pi/agent/` and `.env` files.

The implementer should be able to follow this file top-to-bottom and produce a single, reviewable commit.
