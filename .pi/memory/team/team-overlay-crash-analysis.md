# /team Overlay Crash Analysis

**Date:** 2026-08-22  
**Analyzed by:** w5 (architecture map), w6 (elimination design), w7 (runtime exit paths)  
**Memory owner:** Pi Agents Team / runtime stability

## Problem Statement

While running agents under the Pi Agents Team `/team` overlay, synchronous runtime exceptions inside the extension escape into the host `pi` process and cause the entire session to exit. The failure mode is not a graceful worker error or an isolated TUI glitch: it is a hard process crash that terminates the orchestrator, loses in-flight work, and leaves users unable to continue the session.

Three parallel research lanes converged on the same conclusion: the overlay and its supporting runtime layer are built as a heavy, custom TUI/state/dashboard stack inside the extension process. Unguarded `EventEmitter` listeners, unwrapped timer callbacks, and synchronous UI/state rendering paths allow any thrown error to propagate to the top of the host process, where Node's default behavior is to exit.

## Root Cause

1. **Unguarded `EventEmitter` listeners and timer callbacks propagate synchronous throws.**  
   The overlay registers many callbacks (`onTerminalInput`, `onStateChange`, `onEvent`, `onActivityEvent`, `setInterval`/`setTimeout` handlers) without a process-level `uncaughtException` guard or a per-callback `try/catch` wrapper. When any listener throws, Node treats it as an uncaught exception in the host process.

2. **The overlay is a heavy custom TUI/dashboard/state layer.**  
   `/team` does not rely on a battle-tested Pi TUI abstraction. It builds its own inline widget (`TeamDashboardWidget`), keyboard router, roster list, inspect/console/cost renderers, theme palette, and spinner/tip timers. Every one of these components is a fragility point: text wrapping, ANSI width math, worker state snapshots, JSONL parsing, and async command races can all throw while the widget is active.

3. **Extension errors become host process errors.**  
   Because the extension runs in the same Node process as Pi, there is no isolation. A bug in `wrapLines`, a corrupt ANSI sequence, a stale input listener after overlay close, or a JSONL parse error becomes a fatal crash.

## Concrete Crash / Exit Sites

These file:line references are from the current runtime-exit investigation in `packages/pi-agents-team/src`. They are the locations where an unguarded throw can exit the host process.

### EventEmitter / listener propagation

| Site | File:Line | Risk |
|------|-----------|------|
| Inline dashboard input listener registered | `src/extensions/pi-agent-team/index.ts:560` | `ctx.ui.onTerminalInput` callback runs on every keystroke; if `widget.handleInput` throws, the exception is delivered to Pi's event loop. |
| State-change listener (dashboard re-render) | `src/extensions/pi-agent-team/index.ts:908` | `manager.onStateChange` triggers `renderUi` + persistence; any synchronous throw during render exits. |
| Worker event emitter | `src/runtime/worker-manager.ts:1188` | `this.emitter.emit("event", ...)` inside `applyNormalizedEvent` has no wrapper; downstream UI listeners can crash Pi. |
| RPC client event/parse emit | `src/runtime/rpc-client.ts:167` and `183` | `handleRecord` / `handleParseError` emit `"event"` / `"error"`; bad worker JSONL or malformed RPC line can throw in the listener. |
| Worker process stderr/exit listener | `src/runtime/worker-process.ts:76`–`83` | Process `"error"` and `"exit"` events feed into the same unguarded `EventEmitter` chain. |

### Timer callbacks

| Site | File:Line | Risk |
|------|-----------|------|
| Spinner timer | `src/extensions/pi-agent-team/index.ts:614` | `setInterval` re-renders widget every 120 ms while workers are animated; any render error is uncaught. |
| Tip rotation timer | `src/extensions/pi-agent-team/index.ts:634` | `setInterval` re-renders every 15 s; same exposure. |
| Worker notification batcher | `src/extensions/pi-agent-team/index.ts:933` and `943` | `setTimeout(flushWorkerNotifications, 400)` fires after state changes; formatting toasts can throw. |
| Active ping refresh timeout | `src/control-plane/team-manager.ts:462` | `setTimeout(() => finish("timeout"), ...)` races with RPC refresh; unwrapped `finish` callers can throw. |
| Deadline timer | `src/runtime/worker-manager.ts:801` | `setTimeout` rejects the in-flight promise, but callers may not catch it, causing unhandled rejection. |

### Synchronous rendering / overlay code paths

| Site | File:Line | Risk |
|------|-----------|------|
| Overlay render entry | `src/ui/inline-dashboard-widget.ts:66` | `render(width, theme)` builds lines and calls `ctx.ui.setWidget`; a throw here crashes on every refresh. |
| Inspect body render | `src/ui/inline-dashboard-widget.ts:124` | `buildInspectText` + `wrapLines` process worker transcript/console/activity; any bad data (malformed ANSI, undefined palette) throws. |
| Console body render | `src/ui/inline-dashboard-widget.ts:144` | `buildConsoleLines` + `wrapLines`; raw worker output with tabs/control bytes is sanitized but still risky. |
| Cost body render | `src/ui/inline-dashboard-widget.ts:158` | `buildCostLines` aggregates usage; `costUsd.toFixed(4)` on `NaN` throws. |
| Roster render | `src/ui/overlay.ts:484`–`530` | `RosterSelectList.render` builds items and calls `SelectList` from `pi-tui`; bad worker state can break selection math. |
| Text wrapping | `src/ui/overlay.ts:462`–`530` | `wrapLines` / `wrapTextLine` loops over worker text with ANSI-aware truncation; infinite-loop guards exist but still depend on caller context. |

### JSONL parse and RPC errors

| Site | File:Line | Risk |
|------|-----------|------|
| Strict JSONL parser error path | `src/runtime/rpc-client.ts:182` | `handleParseError` emits `"error"`; unhandled listener throw exits. |
| JSONL record handler | `src/runtime/rpc-client.ts:162` | `handleRecord` dispatches to `handleResponse` or emits `"event"`; malformed response objects can break consumers. |

### Command/state races

| Site | File:Line | Risk |
|------|-----------|------|
| `/team` command toggles dashboard | `src/commands/team.ts:32` | Calls `toggleInlineDashboard(ctx)`; if widget creation throws, command handler exits Pi. |
| `/team-steer` input dialog | `src/ui/inline-dashboard-widget.ts:289` | `ctx.ui.input(...).then(...)` has a rejection path but the `.catch` only notifies; if the promise chain is not awaited, unhandled rejection crashes in some Node versions. |
| `/team` refresh snapshot | `src/ui/inline-dashboard-widget.ts:265` | `refreshSnapshot` calls `teamManager.pingWorkers({ mode: "active" })`; active ping refresh timeout race can reject unhandled. |
| `attachTeamManagerListener` state handler | `src/extensions/pi-agent-team/index.ts:908` | Executes persistence flush + `renderUi` + toast formatting + ATP recorder `void` calls; any throw in the synchronous portion is fatal. |

## Overlay Fragility Points (Architecture Mapping)

The `/team` overlay is a large custom surface area. The architecture mapping identified these fragility points:

1. **Stale input listener after overlay close.**  
   `ensureDashboardInputListener` attaches a `ctx.ui.onTerminalInput` callback at `index.ts:555`. The detach function is stored in `detachDashboardInput`, but if overlay state becomes inconsistent (e.g., session shutdown, session tree navigation, error during close), the listener may remain active and route keystrokes into a disposed widget.

2. **Synchronous `state_change` UI crashes.**  
   `TeamManager.events.emit("state_change", ...)` at `team-manager.ts:102` triggers the extension listener at `index.ts:908`, which synchronously: flushes persistence, re-renders the status widget, re-renders the inline dashboard, starts/stops timers, and formats toasts. Any exception anywhere in that chain exits Pi.

3. **Unhandled rejections from async UI commands.**  
   `steerCurrent`, `messageCurrent`, `newTask`, `pruneTerminal` in `inline-dashboard-widget.ts` use `void this...` or bare `.then/.catch` chains. In Node 22+, unhandled rejections from async work inside extension callbacks can still terminate the process depending on host behavior.

4. **JSONL parse errors from worker stdout.**  
   Worker processes stream JSON Lines over stdout. A truncated line, a worker crash print, or a stray log line causes `StrictJsonlParser` to call `onError`, which emits `"error"`. If the error listener throws, Pi exits.

5. **Command/state races.**  
   `/team-steer`, `/team-stop`, `/team-result`, `delegate_task`, `agent_message`, and `agent_cancel` can all run while `session_tree`, `session_shutdown`, or `replaceTeamManager` is in progress. There is no global command lock, and `TeamManager` can be swapped underneath a running command.

6. **Stuck refresh promises.**  
   `refreshWorkerForActivePing` (`team-manager.ts:432`) de-dupes in-flight refreshes in `activeRefreshes`. A worker RPC that never resolves leaves the promise cached; subsequent pings race against a timeout, but the original promise remains pending forever, leaking handles and event listeners.

7. **Widget render vs. terminal resize race.**  
   `TeamDashboardWidget.render` (`inline-dashboard-widget.ts:47`) is called on terminal resize and during every spinner tick. `buildTeamWidgetLines` and `wrapLines` are not re-entrant; overlapping render calls can corrupt shared mutable state (e.g., `currentPalette` in `overlay.ts`).

8. **Mutable global palette/theme.**  
   `overlay.ts` uses module-level mutable state `currentPalette`, `fallbackTheme`, etc. Concurrent or re-entrant renders can observe a half-updated palette.

9. **No process-level fault boundary.**  
   There is no `process.on("uncaughtException", ...)` or `process.on("unhandledRejection", ...)` boundary installed by the extension. The overlay expects every one of its ~30 listener/callback sites to be perfect.

10. **Persistence flush inside state-change callback.**  
    `appendPreparedPersistence` (`index.ts:729`) is invoked synchronously from the `state_change` listener. File I/O + `pi.appendEntry` inside a UI-driven callback means a disk or Pi API error can throw directly into the event-emitting path.

## Design Options

Three broad directions were evaluated:

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A. Defensive patch overlay | Add `try/catch` around every listener, timer, render path, and emitter call. Keep the existing overlay, commands, and `agents-team.json` config. | Keeps all current features; short-term stabilization possible. | Whack-a-mole; the surface area is huge; new features will reintroduce the same class of bug; heavy TUI still lives in the extension. |
| B. Replace overlay with native Pi TUI primitives | Move dashboard rendering into Pi's built-in status/widget/TUI system and make the extension supply plain text only. | Smaller extension footprint; Pi owns the TUI lifecycle. | Still keeps many `/team-*` commands and `agents-team.json`; command races and JSONL issues remain. |
| C. **Thin native-style extension** | Eliminate the overlay entirely. Replace `agents-team.json` with plain `.pi/agents/*.md` role files. Drop most `/team-*` commands. Keep only minimal delegation tools (`delegate_task`, `agent_status`, `agent_result`, `agent_message`, `ping_agents`, `wait_for_agents`, `agent_cancel`) and a text-only `/team` summary command. Persist state via native `pi.appendEntry`. | Eliminates the entire TUI crash surface; removes config fragility; aligns with Pi's native extension model; durable and simple. | Loses keyboard overlay, inline inspect/console/cost tabs, and real-time spinner. |

## Recommended Path: Thin Native-Style Extension

Adopt **Option C** as the target architecture.

Key changes:

- **Remove the overlay entirely.** Delete `TeamDashboardWidget`, `InlineDashboardState`, `overlay.ts`, `dashboard.ts` (or reduce to summary-only), spinner/tip timers, and the `onTerminalInput` listener.
- **Replace `agents-team.json` with `.pi/agents/*.md`.** Each role is a plain Markdown file (profile prompt + metadata header). No JSON schema validation, no `agents-team.json` parsing errors, no scaffoldVersion stale warnings.
- **Drop most `/team-*` commands.** Remove `/team-init`, `/team-enable`, `/team-steer`, `/team-stop`, `/team-copy`, `/team-env`, and the inline dashboard mode of `/team`.
- **Keep only minimal delegation tools.** Retain: `delegate_task`, `agent_status`, `agent_result`, `agent_message`, `ping_agents`, `wait_for_agents`, `agent_cancel`.
- **Keep a text-only `/team` summary command.** It prints a compact list of workers, statuses, and pending relays (like the existing non-TUI path in `src/commands/team.ts`).
- **Use native `pi.appendEntry` for persistence.** Continue using `ctx.sessionManager` / `pi.appendEntry` for durable state, but move persistence out of synchronous UI callbacks and into explicit lifecycle hooks (`session_before_tree`, `session_shutdown`, tool boundaries) with `try/catch` + warning instead of throw.

## What to Remove vs. What to Keep

### Remove

- `src/ui/inline-dashboard-widget.ts` and `InlineDashboardState`
- `src/ui/overlay.ts` (or reduce to shared text helpers only)
- `src/ui/dashboard.ts` non-summary rendering paths (`buildTeamDashboardLines` summary path may be kept)
- `src/ui/status-widget.ts` inline widget rendering (status line may be kept if Pi consumes plain text)
- `src/commands/team-init.ts`
- `src/commands/team-enable.ts`
- `src/commands/team-steer.ts`
- `src/commands/team-stop.ts`
- `src/commands/copy.ts` (`/team-copy`)
- `src/commands/env.ts` (`/team-env` wizard)
- `src/ui/autocomplete.ts` (unless Pi provides native completions)
- Global/local `agents-team.json` schema and loader complexity in `src/project-config/loader.ts`
- Spinner and tip timers in `src/extensions/pi-agent-team/index.ts`
- `ctx.ui.onTerminalInput` dashboard routing
- `ATP` eden-memory recorder (optional: replace with `pi.appendEntry` markers or remove if not needed)

### Keep

- `TeamManager` core (launch, prompt, steer, follow-up, abort, refresh, disposal)
- `WorkerManager` core (spawn, RPC client, event normalization, state machine)
- `TaskRegistry` (worker/task tracking)
- `WorktreeManager` (per-worker cwd isolation)
- `agent_status`, `agent_result`, `agent_message`, `ping_agents`, `wait_for_agents`, `agent_cancel` tool implementations
- `delegate_task` tool
- Text-only `/team` summary command
- Compact persistence via `pi.appendEntry` (`CompactPersistenceJournal`, `persistence.ts`)
- Path-scope safety (`src/safety/...`)

## Immediate Short-Term Stabilization Patch List (Bridge)

Before the thin-extension refactor lands, apply these defensive wrappers as a crash-reduction bridge. The goal is not perfection but to reduce the frequency of host process exits.

1. **Wrap all `EventEmitter` listeners installed by the extension with a domain-style `try/catch`.**  
   Add a helper `safeListener(fn)` in `src/extensions/pi-agent-team/index.ts` that logs to `console.error` and notifies via `ctx.ui.notify(..., "error")` instead of throwing. Apply to `onStateChange`, `onBeforePrompt`, `onEvent`, `onPiVersionMismatch`, `onAssistantChunk`, `onActivityEvent`, `onTerminalInput`, and all RPC client callbacks.

2. **Guard every timer callback.**  
   Wrap `setInterval`/`setTimeout` bodies in `src/extensions/pi-agent-team/index.ts:614`, `634`, `933`, `943`; `team-manager.ts:462`; and `worker-manager.ts:801` with `try/catch` that stops the timer and logs instead of exiting.

3. **Install a process-level uncaught-exception handler for extension scope.**  
   At extension startup (`index.ts`), register a one-time `process.on("uncaughtException", ...)` that logs the error, notifies the user, and attempts to clear the dashboard widget and stop timers before Pi exits. This is a last-resort safety net, not a fix.

4. **Wrap `renderUi` and all render helpers.**  
   In `index.ts`, wrap `renderUi` so any exception inside `applyUi`, `renderDashboardWidget`, `buildTeamWidgetLines`, or `ensureSpinnerRunning` is caught and results in a fallback plain-text status line.

5. **Add defensive wrappers in `inline-dashboard-widget.ts`.**  
   Wrap `render`, `handleInput`, `refreshSnapshot`, `steerCurrent`, `messageCurrent`, `newTask`, and `pruneTerminal` so they catch and notify instead of throwing into Pi.

6. **Add defensive wrappers in `overlay.ts`.**  
   Wrap `buildInspectText`, `buildConsoleLines`, `buildCostLines`, `wrapLines`, `RosterSelectList.render`, and `enforceWidth` with `try/catch` returning a safe error line (e.g., `[overlay render error: ${message}]`).

7. **Guard `RpcClient` emit paths.**  
   Wrap `handleRecord` (`rpc-client.ts:162`), `handleResponse` (`169`), and `handleParseError` (`182`) so emitter calls do not propagate throws from downstream listeners.

8. **Guard `WorkerManager.emitter.emit`.**  
   In `worker-manager.ts`, wrap the final `this.emitter.emit("event", ...)` at `1188` in `applyNormalizedEvent` with `try/catch` and route errors to a new `worker_extension_error` style event.

9. **Make active ping refresh promises bounded and leak-free.**  
   In `team-manager.ts:432` (`refreshWorkerForActivePing`), store an `AbortController` per worker, cancel the previous refresh before starting a new one, and cap total lifetime to `activePingTimeoutMs + 1000`.

10. **Disable inline dashboard by default or add a kill switch.**  
    Add a config flag `ui.inlineDashboard: false` and an env var `PI_AGENTS_TEAM_NO_OVERLAY=1` so users (and CI) can run the text-only summary path immediately while patches land.

11. **Validate worker data before render.**  
    In `buildTeamWidgetLines` and `buildInspectText`, defensively coerce `costUsd`, `usage.*Tokens`, `worker.status`, and palette functions to safe values instead of trusting structured clones.

12. **Add `unhandledRejection` logging.**  
    Install `process.on("unhandledRejection", ...)` in the extension to log rejection sources from async UI commands (`steerCurrent`, `messageCurrent`, etc.) and surface them as warnings.

## Assigned Next Steps

1. **Prototype thin native extension in a feature branch.**  
   Branch from `main` (or the current worktree), create `feature/thin-native-team`, and delete the overlay/JSON-config heavy components. Keep `TeamManager`, `WorkerManager`, core tools, and text `/team`.

2. **Verify stability.**  
   Run the existing test suite (`npm test`), add targeted tests for:
   - malformed worker JSONL stdout,
   - throwing listeners,
   - timer failures,
   - rapid `/team` open/close cycles,
   - session tree navigation while workers are active,
   and confirm the host `pi` process does not exit.

3. **Deprecate the overlay.**  
   Once the thin native branch passes tests and a manual smoke session:
   - Mark `/team-init`, `/team-enable`, `/team-steer`, `/team-stop`, `/team-copy`, `/team-env`, and inline dashboard mode as deprecated in the old extension.
   - Ship the thin native extension as the default.
   - Archive the overlay-heavy source under a `legacy/` folder or remove it after one release cycle.

4. **Update documentation.**  
   Rewrite `README.md` and prompts to describe `.pi/agents/*.md` roles and the text-only `/team` command.

5. **Communicate breaking changes.**  
   Notify users that `agents-team.json` is replaced by `.pi/agents/*.md`, that `/team-*` commands are removed, and that the keyboard overlay is gone in favor of plain-text agent tooling.

---

**Status:** research complete, recommendation recorded, awaiting prototype branch.  
**Confidence:** high — the three research lanes independently identified the same root cause and the same fix: eliminate the overlay.

## Path A Implementation Outcome

**Status:** completed and verified on branch `path-a-shell`.  
**Final commit hash:** `37976f5` (current HEAD of `path-a-shell` at the time of this update).  
**Date:** 2026-08-22

### Summary of what was implemented

- **Thin native extension shell.** The extension now discovers roles from plain `.pi/agents/*.md` files instead of the heavy `agents-team.json` schema.
- **`delegate_task` worker delegation.** Spawns a `pi` worker per role and returns the worker's `<final_answer>` to the orchestrator.
- **`wait_for_agents` polling.** Polls tracked workers, supports a timeout, and can wake when a relay occurs (`wakeOnRelay`).
- **Text-only `/agents` summary command.** Replaces the interactive `/team` dashboard with a compact plain-text list of workers and statuses.
- **`before_agent_start` orchestrator prompt injection.** Prepares the orchestrator with context before an agent worker starts.
- **`pi.appendEntry` state recording.** Uses native Pi persistence instead of custom persistence machinery.
- **Major cleanup.** Deleted the overlay UI, most `/team-*` commands, `agents-team.json`, custom persistence, the worktree manager, the eden-memory core integration, and the obsolete tools `agent_status`, `agent_result`, `agent_message`, `ping_agents`, and `agent_cancel`.
- **Documentation.** Added a new `MIGRATION.md` and rewrote `README.md` for the thin-native model.

### Verification results

- **18 tests passing.**
- **Build clean.**
- **Typecheck clean.**
- **Verifier:** APPROVE.

### Known limitations

- No interactive dashboard remains; agent status is available only through the text `/agents` summary and tooling.
- `wait_for_agents` state is kept **in-memory only**; it is not persisted across extension reloads.
- Real `pi` spawn was **not exercised in automated tests**; the worker delegation path was tested against mocked/spawn-observed behavior.

### Deferred point 5 (harness watchdog)

Point 5 from the earlier cancellation fix — a harness-level watchdog for stuck worker processes — is still noted, but it is now less relevant because the overlay itself has been removed. Any future watchdog work should target worker-lifecycle safety in the thin shell rather than overlay state recovery.

### Next recommendation

Before merging `path-a-shell` to `main`:

1. **Smoke-test against a real `pi` binary.** Run a live `/agents` summary and a real `delegate_task` end-to-end to confirm worker spawn, relay, and `<final_answer>` extraction behave with the actual host.
2. **Consider adding `package-lock.json`.** Reproducible installs will help CI and future contributors, especially now that the package surface has been reduced.
