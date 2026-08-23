# Plan: eden-memory and the team as built-in primitives (no opt-out)

**Date:** 2026-08-23
**Status:** Implemented
**Predecessor:** `ac33610` (team-status widget), `8a090c9` (BUG-005)
**Resolves:** the user's three requirements, sharpened: "you require eden-memory, you require the whole team, simply remove the code that handles 'config' and just build it in."
**Supersedes:** the prior draft at this path (which proposed fail-fast and an opt-out). This revision: graceful fallback to a normal pi session with a message; widget is always on when the team is up.
**Related:** `docs/plans/eden-memory-required-primitive.md` (existing draft plan that this builds on).

## Context

The user reviewed the prior draft (`docs/plans/config-review-eden-memory-required.md`) and made three decisions:

1. **Pushback 1: identity env vars stay.** The user agreed that `EDEN_MEMORY_BIN`, `EDEN_MEMORY_DB`, `EDEN_WORKSPACE_ID`, `EDEN_USER_ID`, `EDEN_AGENT_ID` are connection identity, not opt-out config. They stay as env-var inputs. The plan keeps them.
2. **Pushback 2: graceful fallback, not fail-fast.** When eden-memory is unreachable, the extension **falls back to a normal pi session** (no team tools, no team widget, no orchestrator system-prompt block) and **displays a message** to the user. The user can still use pi; they just don't have a team. This is different from the prior plan's "fail fast and refuse to load."
3. **Widget is always on when the team is up.** No `/team` toggle. When the team loads, the widget is rendered. When the team doesn't load, the widget doesn't render. The user cannot turn the widget off.

The principle, restated: **if a thing is required, there is no opt-out knob, but the absence of the thing degrades gracefully to a normal pi experience rather than blocking the user.**

## The principle, applied

> If a thing is required, there is no opt-out knob. The thing either works (and the team is fully loaded) or it doesn't (and the user gets a normal pi session with a clear message).

What "required" means here:
- **eden-memory is required.** The team writes markers, tracks state, and surfaces blocked goals. Without eden-memory, the team has no memory and the contract is broken. **No opt-out.**
- **The team is required when it can be loaded.** If eden-memory is up, the team loads. If eden-memory is down, the team is not loaded and the user gets plain pi.
- **The 6 protocol roles are required.** `discoverAgents` returns whatever the package ships, plus any project-local overrides. There is no config to "skip the package agents."

What is *not* "config" under this principle, and therefore stays:
- **Connection identity for eden-memory** — `EDEN_MEMORY_BIN`, `EDEN_MEMORY_DB`, `EDEN_WORKSPACE_ID`, `EDEN_USER_ID`, `EDEN_AGENT_ID`. Inputs, not toggles.
- **Optional features on top of eden-memory** — `EDEN_MEMORY_SEMANTIC_SEARCH` enables semantic search when set to `true`. Feature flag, not a "disable the team" flag.
- **The extension registration** — `.pi/settings.json`'s `packages` key. This is how pi finds the extension.
- **The team-status widget, when the team is up.** Always rendered. Not a toggle.

**Specifically — the runtime `enabled` field is config, not state.** The current code has `memoryTracker.status.enabled` and `createWorkerEdenMemoryStatus(enabled)`. These are set once at construction and never updated by health results. The defensive checks (`if (!memoryTracker?.status?.enabled) return;`) ask "is memory on?" when the answer is implicit in "does the tracker exist?" Same for `ensureWorkerEdenMemoryStatus(worker, config)` — it reads `config?.memory?.edenMemory?.enabled`, a config flag, to decide whether to attach a status. With no `EDEN_MEMORY_ENABLED` config, this function is dead. All three go.

## Config surfaces, before and after

### Surface 1: `EDEN_MEMORY_ENABLED` env var

**Before.** Read by `parseEnabledFlag` in `eden-memory.ts`. If unset, defaults to `true` (by accident of the parser). If set to `false`/`0`/`no`, the team runs in optional mode: no memory tracker, no byMarker histogram, no goal-receipt recording. The widget shows "Memory: disabled." Two tests assert this behaviour.

**After.** **Removed.** No env var. No parser. No branch. The team is always in required-eden-memory mode. The `enabled` field is removed from the `resolveEdenOptions` return shape.

**Code changes.**
- `packages/pi-agents-team/src/src/memory/eden-memory.ts`:
  - Drop `ENABLED: "EDEN_MEMORY_ENABLED"` from `EDEN_ENV_FIELDS`.
  - Drop `enabled: "true"` from `EDEN_DEFAULTS`.
  - Drop `parseEnabledFlag`.
  - Drop `enabled:` from the `resolveEdenOptions` return.
- `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`:
  - Drop the `if (edenOptions.enabled === true)` wrapper around memory tracker creation.
  - Drop the `else { blockedGoalsReady = Promise.resolve(); }` branch.
  - Replace the "team not loaded because eden-memory disabled" path with the new graceful-fallback path (see Surface 6).

**Test changes.**
- `packages/pi-agents-team/tests/memory/eden-memory.test.ts`:
  - Remove `assert.equal(options.enabled, true)` from the "falls back to defaults" test.
  - Remove the "parses the enabled and semantic-search flags" test (or trim it to just the `SEMANTIC_SEARCH` assertions, which stay).
- `packages/pi-agents-team/tests/shell.test.ts`:
  - Remove the "does not run eden-memory startup work when disabled" test. There is no disabled mode.
  - Remove the "widget says memory: disabled when eden-memory is not enabled" test. The widget never says this.
  - Add a new test: "session_start falls back to a normal pi session when eden-memory is unreachable." Asserts: no team tools, no team commands, no widget, a footer status is set explaining the unavailability, and a `ctx.ui.notify(...)` message was emitted.

### Surface 2: `EDEN_DEFAULTS` identity values

**Before.** Hardcoded `userId: "yakov"`, `bin: "/home/yakov/.local/bin/eden-memory"`, `db: ~/.eden-memory/default.db`. User-specific footguns for any other user.

**After.** **Kept, documented as identity fallbacks, not opt-outs.** No code change here beyond a comment. The defaults are the last-resort values if the env vars are unset.

### Surface 3: `.env` file

**Before.** The user (or `install.sh`) writes the keys. The contract test asserts that empty env means eden-memory is enabled.

**After.** The `.env` is the **identity source** for eden-memory. It contains:
- `EDEN_MEMORY_BIN` — path to the binary
- `EDEN_MEMORY_DB` — path to the database
- `EDEN_WORKSPACE_ID` — workspace identifier
- `EDEN_USER_ID` — user identifier
- `EDEN_AGENT_ID` — agent identifier (default: `pi-agents-team`)
- `EDEN_MEMORY_SEMANTIC_SEARCH` — feature flag (default: `false`)

It does **not** contain `EDEN_MEMORY_ENABLED` (the var is gone).

**Code change.** `install.sh` (Step 5 or wherever `.env` is generated) stops writing `EDEN_MEMORY_ENABLED`. If a stale `.env` has it, the extension ignores it (the constant is gone, so the value is dead).

### Surface 4: `.pi/agent/agents-team.json` (legacy Path B config)

**Before.** A 6-key config file (`enabled`, `routingMode`, `workerAccess`, `display`, `memory`, `worktree`, `roles`). **Not read by the Path A extension at all.** The `memory.edenMemory.enabled: true` block has no effect.

**After.** **Deleted.** From the template (`templates/.pi/agent/agents-team.json`), from this repo's `.pi/agent/`, and from `~/git/eden-memory`'s `.pi/agent/`. The file is misleading; removing it removes a source of confusion.

**Code change.** `install.sh` Step 2 (the agents-team config step) is removed. The `GITIGNORE_ENTRIES` no longer needs to know about the file.

### Surface 5: `memory.enabled` runtime field (and `createWorkerEdenMemoryStatus(enabled)`)

**Before.** `memoryTracker.status.enabled` is a boolean. `createWorkerEdenMemoryStatus(true|false)` is the per-worker equivalent. Defensive checks throughout the extension read it (e.g. `if (!memoryTracker?.status?.enabled) return;`). 5 sites in `memory-status.ts` and 5 sites in `index.ts`. The field is set once at construction and **never updated** by health results — so for the lifetime of the tracker, `status.enabled === true` is equivalent to "the tracker exists." The field is redundant: it asks "is memory on?" when the answer is implicit in "does the tracker exist?"

**After.** **Removed.** The runtime check becomes "is there a tracker?" — if the tracker exists, memory is on; if it doesn't, the team isn't loaded (graceful fallback). Replace `memoryTracker?.status?.enabled` with `memoryTracker` in the defensive checks. The `enabled` field is dropped from both the tracker's `status` and the per-worker `edenMemoryStatus`. `createWorkerEdenMemoryStatus` takes no parameter and just returns a fresh status object.

**Sub-decision: `ensureWorkerEdenMemoryStatus(worker, config)`.** This function reads `config?.memory?.edenMemory?.enabled === true` and is a config-aware helper. It is **not called from `index.ts` production code**; only the test file exercises it. With no `EDEN_MEMORY_ENABLED` config, the function has nothing to check against. Recommendation: **delete the function** (and its tests). It is dead config-aware code in the public API, and "remove config for required primitives" extends to it. If a future caller needs a per-worker ensure, they can call `createWorkerEdenMemoryStatus()` directly.

**Code change.** `packages/pi-agents-team/src/src/memory/memory-status.ts`:
- Drop `enabled` from the tracker's status object.
- Drop `enabled` from the per-worker status object.
- Change `createWorkerEdenMemoryStatus(enabled)` to `createWorkerEdenMemoryStatus()` (no parameter). Always returns a status with `byMarker: emptyByMarker()`.
- Delete `ensureWorkerEdenMemoryStatus` and its export.
- In `formatMemoryStatusFragment`, `getMemoryStatusGlyph`, `formatEdenMemoryEvent`, and `aggregateEdenMemoryStatus`: replace `if (!status || !status.enabled) return ...` with `if (!status) return ...`. Same for `worker.edenMemoryStatus && worker.edenMemoryStatus.enabled` → `worker.edenMemoryStatus`.

`packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`:
- Replace all `memoryTracker?.status?.enabled` reads with `memoryTracker` (or `memoryTracker != null`).
- The single call site `createWorkerEdenMemoryStatus(true)` becomes `createWorkerEdenMemoryStatus()`.

**Test changes.**
- `packages/pi-agents-team/tests/memory/memory-status.test.ts`:
  - The `describe("createWorkerEdenMemoryStatus / ensureWorkerEdenMemoryStatus")` block: trim to just the `createWorkerEdenMemoryStatus` tests (which now test a no-arg function), and delete the `ensureWorkerEdenMemoryStatus` describe entirely.
  - The `aggregateEdenMemoryStatus` tests: assertions like `teamStatus.enabled = true` become `teamStatus = { ... }` (just a truthy object). The contract is "the aggregate includes a status if it's truthy," not "if `enabled` is true."
- `packages/pi-agents-team/tests/memory/eden-memory.test.ts`: the test that checks `resolveEdenOptions({}).enabled === true` (already slated for removal in Surface 1) — gone.
- `packages/pi-agents-team/tests/shell.test.ts`: the `buildTeamSnapshot` test that constructs `fakeTracker` with `enabled: true` — drop the field. `memoryTracker?.status?.enabled` reads in test expectations are not present (the tests assert on `setStatus`/`setWidget` outputs, not the `enabled` field directly).

### Surface 6: Graceful fallback when eden-memory is unreachable

**Before.** If `health()` fails, the extension logs a warning and continues. The widget shows "memory: degraded." The team runs in a degraded state where markers are best-effort and the byMarker histogram is empty.

**After.** **Graceful fallback.** At `session_start`, the extension checks eden-memory health. Two outcomes:

- **Healthy.** The extension loads the team normally: registers `delegate_task`, `wait_for_agents`, `abort_worker`, `/agents`, `/stop-worker`. Renders the team-status widget. Injects the orchestrator system-prompt block. Sets the footer status. All as today.

- **Unhealthy** (binary missing, `health()` returns `{ok: false}`, or `health()` throws). The extension:
  1. Logs a `pi.appendEntry(MEMORY_STATUS_TYPE, { level: "fatal", ... })` with the health error and the expected binary path.
  2. Sets the footer status to a one-line message: "Team unavailable — eden-memory unreachable at `<bin>`. Run install or fix the path."
  3. Notifies the user via `ctx.ui.notify(...)` with the same message.
  4. **Does not register the team tools, the team commands, the team widget, or the system-prompt block.** The orchestrator sees a normal pi session with no team contract.

  The user can fix eden-memory (or the path) and reload. The next `session_start` will succeed (or fail) the same way.

**Code change.** `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts` `session_start` handler. The health check is the gating point. The handler runs to completion in both cases; tool/command registration is conditional on health.

**Test changes.**
- New test: "session_start falls back gracefully when eden-memory is unreachable." Asserts: no team tools, no team commands, no widget content, footer status is set, `ctx.ui.notify` was called.
- New test: "session_start falls back gracefully when eden-memory binary is missing." Same shape, but the failure mode is a missing file (caught by `spawnEden` or `fs.existsSync`).
- Keep the existing happy-path tests (they cover the team-loaded case).

### Surface 7: Widget is always on when the team is up

**Before.** `widgetVisible` defaults to `false`. The `/team` slash command toggles it. The footer status is always visible; the panel is opt-in.

**After.** **Widget is always rendered when the team is loaded.** No `widgetVisible` state. No `/team` command. The footer status is the only thing the user *might* want to hide, and there's no knob for that either.

- When the team loads, the panel is rendered via `setWidget(TEAM_WIDGET_KEY, lines, { placement: "belowEditor" })` on every refresh.
- When the team does not load (graceful fallback), the panel is not rendered.
- The `/team` slash command is **removed**.

**Code changes.**
- `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`:
  - Remove `let widgetVisible = false;` and the `widgetVisible` references in `refreshUi` and `clearUi`.
  - Remove the `pi.registerCommand("team", ...)` block.
  - In `refreshUi`, the `setWidget` branch becomes unconditional when the team is loaded: `if (memoryTracker) ui.setWidget(TEAM_WIDGET_KEY, buildWidgetLines(snapshot), { placement: "belowEditor" });` (no `if (widgetVisible)` guard).
  - In `clearUi` (session_shutdown), the widget clear stays.
  - In `session_start`, drop the `widgetVisible = false;` reset.
  - The widget hint line (`Use /team to toggle this panel. /agents for details.`) becomes: `Use /agents for details.`

**Test changes.**
- `packages/pi-agents-team/tests/shell.test.ts`:
  - Remove the `"/team command toggles the widget visibility"` test.
  - Update the `widget does not throw and stays minimal when no agents are discovered` test (the hint assertion about `/team` becomes an assertion about `/agents`).
  - New test: "session_start renders the widget when the team is loaded." Asserts: `setWidget` was called with non-undefined lines.
  - New test: "session_start does not render the widget when the team falls back." Asserts: `setWidget` was called with `undefined` for the team widget key.

## What is *not* changing

- **BUG-005** (the `main` user-scope agent) — still deferred per the user's earlier request. The user-scope branch in `discoverAgents` stays for now. This plan does not touch it.
- **BUG-003** (test runner open handle) — still deferred. The `--test-force-exit` workaround stays.
- **BUG-004** (widget visual) — still deferred. Still unverified in a real TUI.
- **BUG-002** (install.sh path-based fix) — still pending. The changes in this plan to `install.sh` (`.env` generation, `agents-team.json` removal) can land with or without BUG-002's path-based install fix.

## Implementation

A single commit:

```
feat(path-a): eden-memory and the team are built-in primitives, no opt-out
```

Covering:

1. Remove `EDEN_MEMORY_ENABLED` env var, the parser, and all opt-out branches.
2. Remove `memoryTracker.status.enabled` and `createWorkerEdenMemoryStatus`'s parameter; replace with null/truthy checks on the tracker/status object itself. Delete `ensureWorkerEdenMemoryStatus` (config-aware dead code).
3. Graceful fallback at `session_start` if eden-memory is unreachable: no team tools, no team commands, no team widget, but a normal pi session with a footer status and a notification explaining why.
4. Widget is always on when the team is loaded; remove the `/team` command and the `widgetVisible` state.
5. Update tests: remove opt-out tests, remove toggle tests, remove `ensureWorkerEdenMemoryStatus` tests, add graceful-fallback tests, add "widget is always on" tests.
6. Update `install.sh`: stop writing `EDEN_MEMORY_ENABLED` to `.env`; remove the `agents-team.json` step; validate the binary exists on install.
7. Prune `templates/.pi/agent/agents-team.json`.
8. Update README's "What remains" / "Team UI" sections to reflect the new contract.

## Risk

- **Behaviour change for users who were running in optional mode.** Setting `EDEN_MEMORY_ENABLED=false` no longer does anything (the var is gone). The team either works fully or doesn't load. This is the intended outcome. The commit message should call this out.
- **Identity defaults are still hardcoded.** `EDEN_DEFAULTS` has `userId: "yakov"` and `bin: "/home/yakov/.local/bin/eden-memory"`. User-specific footguns. **Not changed in this commit** — not opt-out config, just fallbacks. A separate change can hardcode-better defaults.
- **Graceful fallback means CI environments that don't run eden-memory get a normal pi session, not a team.** A developer who relied on the team running in their CI will lose that. The CI needs to set up eden-memory, or the team is just absent. Worth documenting.
- **Widget is always on.** Some users will not like the panel being persistent. The user has explicitly accepted this trade-off. If a user really needs more space, they can resize their terminal.
- **No `/team` command.** Users who were using `/team` to toggle will lose the command. The session_start footer is always there; the panel is always there. `/team` is no longer needed.

## Open questions

1. **Footer status wording for the fallback.** "Team unavailable — eden-memory unreachable at `<bin>`. Run install or fix the path." — too long? Too short? Should it be a separate status key (e.g. `TEAM_AVAILABILITY_KEY`) so the user can grep for it? Recommendation: single line, same `TEAM_STATUS_KEY`, no separate key. Keep it simple.

2. **Notification wording.** Same text as the footer? Or a one-liner with a hint? Recommendation: same text. The user sees both; redundancy is fine for an actionable error.

3. **Should the fallback's footer status be cleared on a successful health retry?** Today the health check runs once at session_start. If eden-memory becomes reachable mid-session (someone starts the daemon), the extension doesn't notice. The user has to restart. Recommendation: don't add mid-session retry in this commit. It can come later if there's demand.

4. **Should the widget panel placement be changed?** It's currently `belowEditor` (below the input). If the panel is always on, "belowEditor" puts it right above the footer, which is the natural reading order. Alternative: `aboveEditor` (between scrollback and input) — that would push the scrollback up but might feel intrusive. Recommendation: keep `belowEditor` as it is. The user can file a separate UI change if they want a different placement.
