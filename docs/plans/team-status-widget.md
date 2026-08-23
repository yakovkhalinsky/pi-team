# Plan: Path A team-status widget

**Date:** 2026-08-23
**Status:** Draft for review
**Predecessor:** BUG-001 close (`7034f59`), BUG-002 close (pending), Path A rewrite (`f823789`)
**Resolves:** "I can't see the orchestration status and agents are not getting listed" — user-reported UX gap

## Context

Path A is a thin native pi extension. After BUG-001 was fixed, the extension loads cleanly and `pi list` shows it. But the user reports that they cannot see *any* team-related UI in a running `pi` session: no agent list, no orchestration status, no memory summary. Investigation confirmed:

- The orchestrator **does** receive the team context: the `## Available team agents` block is in the system prompt on every `before_agent_start`, the `delegate_task` / `wait_for_agents` / `abort_worker` tools are registered, the `/agents` and `/stop-worker` slash commands are registered, the optional eden-memory histogram is in tool payloads.
- The only on-screen signal today is a **one-shot toast** on `session_start` (`ctx.ui.notify("Pi Agents Team (Path A) loaded N agent profile(s).", "info")`) which is transient and easy to miss.

The previous `/team` overlay (Path B) was removed in commit `f823789` as heavy and fragile. Path A replaced it with a "minimal shell" that was *too* minimal — the user has no way to tell at a glance that team mode is active, how many agents are loaded, whether a worker is running, or what the memory state is.

This plan restores a visible team UI without going back to a custom TUI shell. It uses the documented `ctx.ui.setStatus` and `ctx.ui.setWidget` surfaces that pi already provides for exactly this purpose. It is **not** a TUI rewrite, it is **not** the old `/team` overlay, and it does not change any tool, command, or marker behaviour.

## Goals

1. **Persistent on-screen team indicator.** A footer status indicator is visible from the moment the session starts until shutdown, showing team mode, agent count, and current state.
2. **Expanded team panel on demand.** A `setWidget` panel below the editor that lists all discovered agents and shows live worker / memory state. Toggleable via a slash command.
3. **Live worker status.** When a worker is running, the widget and the footer status both reflect it ("running 2/3", "builder working…"). When all workers complete, status settles to "idle".
4. **Live memory status when eden-memory is enabled.** The widget surfaces the byMarker histogram and blocked-goal count when available.
5. **Toggle command.** A new `/team` command toggles the widget. The footer indicator is always visible; the widget is opt-in.
6. **No regressions in tests, no new dependencies.**

## Non-goals

- Replacing the slash-command list, the tools, or the system-prompt injection. All existing behaviour stays.
- Building a custom TUI component (no `ctx.ui.custom()`). The widget is plain `string[]` lines; pi handles rendering.
- Drawing the widget above the editor by default. Default placement is **below** the editor (so it does not displace the chat scrollback). Above-editor is the documented default and is too aggressive.
- Cross-session persistence of widget open/closed state. Resets each session.

## Architecture decisions

### Decision 1: Two surfaces, one source of truth

- `ctx.ui.setStatus("pi-agents-team", …)` — one-line footer indicator. Always visible while team mode is active. Updated on every state change.
- `ctx.ui.setWidget("pi-agents-team", string[], { placement: "belowEditor" })` — multi-line panel below the editor. Visible when the user has toggled `/team` on. Same content as the in-conversation `/team` listing.
- A single `renderTeamStatus()` function builds both surfaces from the same in-memory snapshot. The status line is a one-line summary; the widget is the full table. They are always in sync.

### Decision 2: State lives in the extension closure, not module scope

The current `workers` map is at module scope. The UI state must be at **session scope** so that switching sessions (`/new`, `/resume`, `/fork`) clears the widget and rebuilds it for the new session's agents. Move the workers map into the `default function (pi, options)` closure. `clearWorkers` (currently a testing export) still works for tests by holding a reference to the same map.

This is also a small bug fix: today, switching sessions in a long-lived process leaks workers from the previous session's map. After this change, each session gets a fresh map.

### Decision 3: Widget placement is `belowEditor`, default off

The widget below the editor is the natural home for a "status panel" that the user pulls up to inspect, not a chat-replacing surface. It defaults to **hidden** and is toggled by `/team`. This matches how `examples/extensions/widget-placement.ts` and `examples/extensions/status-line.ts` are structured (always-on status, on-demand widget).

### Decision 4: Theme via `ctx.ui.theme.fg(...)`

Use `theme.fg("accent", "Team")` and `theme.fg("dim", "...")` for the status line, and `theme.fg("success", "...")` / `theme.fg("warning", "...")` / `theme.fg("error", "...")` for state glyphs. No hardcoded ANSI colors. Falls back to plain text in headless mode.

### Decision 5: Render-on-event, not interval polling

The widget renders on:
- `session_start` / `session_shutdown`
- `before_agent_start` (catches model/turn changes that affect the team)
- `agent_start` / `agent_end`
- `turn_start` / `turn_end`
- `tool_execution_start` / `tool_execution_end` for `delegate_task` and `abort_worker`
- The `/team` command
- The `/agents` command (refreshes after a discovery change)

No setInterval timers. The status and widget re-render only when something has changed. This is cheap and avoids the typical "spinner runaway" bug.

## File-by-file plan

### 1. `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts` (source)

- **Move `workers` map into the closure.** New `let workers = new Map();` inside `default function (pi, options)`. Update `_testing.clearWorkers` to call `pi.getWorkers?.().clear()` via a testing hook, or keep it as a closure-scoped helper exported via a new internal API. Tests will be updated to grab a reference.
- **Add `renderTeamStatus(ctx, options?)`** — pure function: takes a snapshot of `{agents, workers, memory, blockedGoals}` and returns `{ statusLine: string, widgetLines: string[] }`.
- **Add `applyTeamStatus(ctx, snapshot, { widgetVisible })`** — calls `ctx.ui.setStatus` and (when visible) `ctx.ui.setWidget`. Centralises the only two `ctx.ui` calls beyond `notify` and the existing `setEditorText`-style helpers.
- **Session-scoped state:**
  - `let widgetVisible = false;`
  - `let lastSnapshot = { agents: [], workers: new Map(), memory: null, blockedGoals: [] };`
  - `function refreshUi(ctx) { applyTeamStatus(ctx, snapshot(), { widgetVisible }); }`
- **Hook into events:**
  - `session_start` — after existing init, call `refreshUi(ctx)`.
  - `session_shutdown` — call `ctx.ui.setStatus("pi-agents-team", undefined)` and `ctx.ui.setWidget("pi-agents-team", undefined)`. Frees the footer slot.
  - `turn_start` / `turn_end` — call `refreshUi(ctx)`. Cheap; no rendering on idle.
  - `tool_execution_start` for `delegate_task` — call `refreshUi(ctx)` after the worker is created.
  - `tool_execution_end` for `delegate_task`, `wait_for_agents`, `abort_worker` — call `refreshUi(ctx)`.
  - `model_select` and `thinking_level_select` — call `refreshUi(ctx)` so the widget reflects the current model/thinking (these are good moments, but not strictly necessary; included for completeness).
- **New `/team` command:**
  - Toggles `widgetVisible` on/off.
  - On enable, calls `refreshUi(ctx)` and notifies "Team panel shown".
  - On disable, calls `ctx.ui.setWidget("pi-agents-team", undefined)` and notifies "Team panel hidden".
- **Extend the existing `/agents` command:** after rendering the list to the conversation, also call `refreshUi(ctx)` so the widget (if visible) reflects the same data.
- **Memory snapshot:** when `memoryTracker` is non-null, include `{ enabled: true, histogram: { byMarker: {…} }, blockedGoalCount: lastBlockedGoals.length, lastHealth: … }` in the snapshot. When null, `memory: null` and the widget says "memory: disabled".

### 2. `packages/pi-agents-team/dist/extensions/pi-agent-team/index.js` (build output)

Regenerated by `npm run build`. The `scripts/build.mjs` is a structural copy, so the `.ts` source change is the only authoritative edit. Verified by `node --check dist/extensions/index.js` and `node --check dist/extensions/pi-agent-team/index.js`. CI step (the missing one from BUG-001's "Proposed fix") catches any TS leak.

### 3. `packages/pi-agents-team/tests/shell.test.ts` (test mock + new cases)

- **Expand `createMockContext`** to include `setStatus`, `setWidget`, `theme` (a minimal theme object with `fg()` returning the input string). The mock's UI state must record all calls so tests can assert.
- **Add `getWorkers`** access to the mock so tests can pre-seed workers (since the workers map is now closure-scoped, tests need a way to inject).
- **New tests:**
  - `session_start` sets the footer status with the team name and agent count.
  - `session_shutdown` clears the footer status and the widget.
  - `/team` toggles widget visibility and calls `setWidget` accordingly.
  - When a `delegate_task` tool_execution_start fires, the status line shows "running 1/N".
  - When that tool ends, the status line reflects the terminal state.
  - When `memory` is enabled (mock `memoryTracker`), the widget includes the byMarker histogram.
  - When `memory` is disabled, the widget says "memory: disabled" and does not throw.
  - The widget is **not** shown by default (setWidget is not called until `/team` is invoked).
  - Status survives across multiple `before_agent_start` events (no re-init on every turn).

### 4. `docs/bugs/BUG-001-extension-build-leaks-ts-into-js.md` (follow-up)

Add a note in the existing bug file that the missing `node --check dist/**/*.js` CI guard from the original "Proposed fix" is now warranted given the increase in build output (the widget code adds more surface area for a TS regression to slip into). Implementation: a `npm run lint:dist` script that runs `node --check` over every `.js` in `dist/`.

### 5. `packages/pi-agents-team/README.md` (user-facing)

Add a one-paragraph "Team UI" section under "What you get" describing the footer indicator and the `/team` widget. Include a one-line example:

```
/team    # toggle the team panel below the editor (agent list, running workers, memory)
```

Update the "Design" sentence that currently says "replaces the previous `/team` overlay with minimal, deterministic multi-agent support" to clarify that the replacement still includes a `/team` command, but it now toggles a lightweight status widget rather than launching a full overlay.

## Verification

- `npm run build` — clean, all 17 `.js` files parse.
- `node --check dist/extensions/pi-agent-team/index.js` — passes.
- `npm run typecheck` — passes.
- `npm test` — 102 + N tests pass, 3/3 consecutive stable runs.
- Manual `pi` session in this repo:
  - Footer shows `● Team (7 agents)` from the moment the session starts.
  - `/team` toggles a panel below the editor listing the 7 agents.
  - Asking the orchestrator to delegate a task to `runtime` makes the footer show `● Team (1 running: runtime)` while the worker is alive, then settle to `✓ Team` when it returns.
  - With `EDEN_MEMORY_ENABLED=true`, the panel shows the byMarker histogram and blocked-goal count.
  - `/new` clears the panel and re-renders it from the fresh session's discovery.
- BUG-001's `node --check` guard is now in CI (or documented as a follow-up).

## Risk

- **Module-scope `workers` → closure-scope.** The current `_testing.clearWorkers` is exported and used by tests. After the move, the test surface needs a `getWorkers()` helper. The behavioural change (workers from a previous session no longer leak into a new one) is a small bug fix, not a regression, but it could surface latent bugs in tests that assumed map persistence.
- **Render on every event.** Each `turn_start` / `turn_end` re-renders. In a long session this is a string-build per turn (a few dozen lines). Cheap. No risk.
- **`setWidget` line count.** The widget caps at 30 lines: 1 header + 7 agents + 1 footer + 5 worker lines + 5 memory lines + buffer. Within pi's documented limits.
- **Theme tokens.** If a custom theme lacks a token (e.g. `toolTitle`), `theme.fg` returns the plain string. The widget is defensive about this.

## Out of scope / follow-ups

- A persistent TUI shell (the old `/team` overlay) is **not** being restored.
- A `custom()` TUI component for the team panel is **not** being added. The string-array widget is sufficient.
- CI `node --check dist/**/*.js` guard is recommended in the BUG-001 follow-up note; not strictly part of this plan.
- "Memory summary" the user mentioned is the existing tool-payload `memory` block and the eden-memory byMarker histogram; both are surfaced in the widget. If the user wants a *separate* in-conversation memory summary that is not a follow-up here.
