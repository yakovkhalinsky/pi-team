# Plan: eden-memory as a required primitive (ARCHIVED — superseded)

**Date:** 2026-08-23
**Status:** Archived. **Superseded by** [`config-review-eden-memory-required.md`](./config-review-eden-memory-required.md), which shipped in commit `101660f` on 2026-08-23. This draft is kept for historical reference only.

**Predecessor:** `b499a1d` (moves 1-6), `30db698` (move 7 docs), `d301ba9` (Stage 6 note + worktree cleanup)

## Context

Seven moves shipped on top of the Path A extension to make eden-memory the durable record for ATP markers: marker table as schema, first-class record types, byMarker histogram, `memory` block on tool payloads, blocked-goals detection awaiting at startup, session-shutdown `[closure]`. The runtime is honest now — markers write to their literal names, worker-event markers carry their actual signers, the orchestrator can verify lifecycle completion from the histogram.

The remaining work is a contract change: eden-memory becomes a *required primitive* rather than an optional integration. This plan covers that change plus the gap items surfaced by the post-move review.

## Goals

1. **Eden-memory is required.** `session_start` fails fast if eden-memory is unconfigured or unreachable. No silent degradation. Optional mode is preserved as a documented `required: false` escape hatch for evaluation.
2. **All defined markers have writers.** Every `record*()` helper added in move 3 has a callsite. The orchestrator writes `[skip-context-gathering]`, `[handoff]`, `[api-ready]`, `[andon]`, `[escalation]` at the right lifecycle points.
3. **Per-goal `[closure]` is real.** Move 4 wired session-shutdown `[closure]` only. Per-goal closure is the actual Stage 7 contract; this plan adds it.
4. **No dead-code helpers.** `getMemoryStatusGlyph`, `formatMemoryStatusFragment`, `formatEdenMemoryEvent`, `isRoleAllowedForMarker` either have a host or are deleted.
5. **`memory` block on tool payloads becomes mandatory and useful.** A `glyph` field, a `recent` array of formatted events, marker context on warnings. The orchestrator can answer "did this goal complete?" from the payload alone.
6. **Docs match the runtime.** `MIGRATION.md`, `README.md`, `docs/memory.md`, `install.sh`, role charters all reflect the required-primitive contract.

## Non-goals

- Runtime enforcement of marker routing (Dispatcher-equivalent in extension). Deferred — protocol enforcement happens in worker prompts, not this package.
- Cross-session aggregation. Out of scope — that's an Archivist agent responsibility per the paper.
- Semantic search UI. Out of scope.

## Architecture decisions

### Decision 1: "Required" means A + B (fail-fast startup, fail-loud runtime)

Two readings of "required primitive":

- **A**: required at startup. If eden-memory is unconfigured or unreachable, the extension refuses to load. Hard failure.
- **D**: required at every write. Every marker write failure raises `[andon]` and stops the lifecycle.

We adopt **A**, with a softer runtime contract:

- Startup: if `edenMemory.required !== false` and any fatal condition holds (env missing, binary missing, health check fails), the extension logs `pi.appendEntry(MEMORY_STATUS_TYPE, {level: "fatal", …})` and skips tool registration. The orchestrator sees no team contract.
- Runtime: marker writes that fail are still recorded in the byMarker histogram honestly (`byMarker[name].error += 1`). They also emit a warning entry with marker context. They do *not* silently mark the worker task as successful. The orchestrator is expected to surface persistent write failures as `[andon]`, but the package doesn't enforce that — it's an orchestrator-policy concern.

This matches the existing PI extension model (which records best-effort and lets the orchestrator decide).

### Decision 2: Configuration knob, not a hard flip

The change is too big to flip in one commit. We add `memory.edenMemory.required: boolean` to `agents-team.json`, default `true`. The flag is honored in this commit. For users who can't immediately comply, `required: false` keeps the optional-mode behaviour.

This makes the change a *contract change with a deprecation period* rather than a breaking change.

### Decision 3: Marker write failures are awaited in critical paths, fire-and-forget in telemetry

Three paths write markers that affect lifecycle correctness:

- `session_start` → `[goal-received]` (move 4, already awaited).
- `delegate_task` start → `[routing]` (currently fire-and-forget).
- Worker terminal/relay/prune → `[worker-terminal]` / `[worker-relay]` / `[worker-pruned]` (currently fire-and-forget).

The first is awaited because session-start blocks on it. The latter two are fire-and-forget because they're emitted from within an already-resolving tool call and the write failure doesn't change the tool's success outcome.

For this plan we change `[routing]` to awaited (it's cheap and surfaces problems early). We keep worker-event markers fire-and-forget (their failure is captured by the histogram and by warning entries, which is enough).

### Decision 4: Per-goal closure piggybacks on worker completion

Per-goal `[closure]` should fire when a goal's worker tree has reached terminal status. The simplest point is *after* the worker reaches terminal but *before* the tool result returns. We add `recordClosure` to the `delegate_task` terminal handler, keyed by the goalId from the worker's params.

## Work packets

Each packet is independently shippable. **Total: 8 packets, 6 can run in parallel.**

### Packet 1: Required-primitive configuration knob

**Owner:** Builder
**Scope:** `.pi/agent/agents-team.json`, `agents-team.json` config docs, `examples/`
**Files:** config files only, no source code changes
**Deliverable:** Add `memory.edenMemory.required: true` to the example config. Document the flag in `.pi-team/config/` or `README.md`. Add a migration note for users with existing configs.

### Packet 2: Fail-fast at session_start

**Owner:** Builder
**Scope:** `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`
**Files:** extension index, `src/src/memory/index.ts` (add `edenMemoryRequired()` helper), tests
**Deliverable:** When `edenOptions.required !== false` and any fatal condition holds (env missing fields, binary missing, health check fails), the extension:
- Logs `pi.appendEntry(MEMORY_STATUS_TYPE, {level: "fatal", ...})`.
- Calls `ctx.ui.notify("Eden-memory is required but unreachable: …", "error")`.
- Does not register `delegate_task` / `wait_for_agents` / `abort_worker` tools.
- Does not register `/agents` or `/stop-worker` commands.

When `edenOptions.required === false`, current behaviour is preserved.
**Tests:** new tests covering required-and-missing-env, required-and-binary-missing, required-and-health-failing, optional-still-works.

### Packet 3: Drop `enabled: false` codepaths from memory-status

**Owner:** Builder
**Scope:** `packages/pi-agents-team/src/src/memory/memory-status.ts`
**Files:** memory-status, tests
**Deliverable:** Remove the "disabled" branches from `getMemoryStatusGlyph`, `formatMemoryStatusFragment`, `aggregateEdenMemoryStatus`. Remove the `enabled` parameter from `createWorkerEdenMemoryStatus`. Delete `ensureWorkerEdenMemoryStatus` (it's now a no-op since always-enabled). Update tests to drop the "disabled" cases.

The `EdenMemoryStatus.enabled` field stays (for forward compat — orchestrators may want to surface "memory active"). It just becomes a constant `true`.

### Packet 4: Adopt the orphan UI helpers

**Owner:** Builder
**Scope:** `packages/pi-agents-team/src/src/memory/memory-status.ts`, `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`
**Files:** memory-status, extension
**Deliverable:**
- `aggregateEdenMemoryStatus` adds a `glyph` field (the aggregated severity glyph).
- Adds a `recent` field: an array of the last N (e.g. 5) `formatEdenMemoryEvent`-formatted lines from event history across all statuses.
- Extension's `buildMemoryPayload` uses these.
- If adoption turns out to need a different shape (e.g. a per-marker `events: string[]`), that's fine — the helpers have a host now.
**Tests:** new test in `memory-status.test.ts` covering `glyph` and `recent` fields.

### Packet 5: Wire orphan `record*()` helpers

**Owner:** Builder
**Scope:** `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`
**Files:** extension
**Deliverable:**
- `[skip-context-gathering]`: add a `params.skipContextGathering` flag to `delegate_task`'s schema. When true, write `[skip-context-gathering]` after the routing write. The dispatcher prompt or orchestrator can pass this when it's decided Stage 3 isn't needed.
- `[handoff]`: add a `params.handoffTo` field to `delegate_task`'s schema. When set, write `[handoff]` before writing the routing marker for the new owner. Archivist-handoff semantics: "ownership of this goal transfers to `<role>` before Stage 4 starts."
- `[api-ready]`: add a `params.apiReady` field. When the builder worker's `finalAnswer` contains a top-level `contract:` field, write `[api-ready]` with the contract's name/URL.
- `[andon]` and `[escalation]`: add `/andon <reason>` and `/escalate <question>` slash commands. The `/andon` command records `[andon]` and stops any running workers owned by this goal. The `/escalate` command records `[escalation]` and surfaces the question via `ctx.ui.notify`.
**Tests:** new tests covering each new marker emission.

### Packet 6: Per-goal `[closure]` and awaited `[routing]`

**Owner:** Builder
**Scope:** `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`
**Files:** extension, tests
**Deliverable:**
- In the `delegate_task` terminal handler, when the worker's `params.goal` is set, write `[closure]` for that goalId after the worker reaches terminal status. If `params.goal` is missing, fall back to the current session-shutdown-only behaviour.
- In the `delegate_task` start path, change the `void recordRouting(...).catch(...)` to `await recordRouting(...).catch(...)`. This surfaces routing-write failures synchronously and prevents the histogram from lagging the tool result.
**Tests:** new test verifying `[closure]` fires per-goal. Update existing routing test to await.

### Packet 7: Enriched warning entries

**Owner:** Builder
**Scope:** `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`
**Files:** extension
**Deliverable:** `logMemoryWarning` takes an optional context object: `{marker, goalId, taskId, workerId, error}`. The warning entry carries the context fields as data alongside the message. Test coverage for the new shape.

### Packet 8: Docs and installer updates

**Owner:** Builder (with Researcher review)
**Scope:** All docs, `install.sh`
**Files:**
- `packages/pi-agents-team/docs/memory.md` — drop "optional" framing; document `required` flag and fail-fast behaviour.
- `packages/pi-agents-team/MIGRATION.md` — change "Eden-memory ATP integration is preserved (optional)" → "Eden-memory is a required primitive." Add migration step for `required: false` users.
- `packages/pi-agents-team/README.md` — same.
- `README.md` (top-level) — same.
- `install.sh` — add a smoke test: after install, `eden-memory --version` and fail the install if it returns non-zero and the user hasn't passed `--skip-eden-check`.
- `.pi-team/reference/task-lifecycle.md` — note that without eden-memory, Stage 6 and Stage 7 cannot complete.

## Dependency graph

```
Packet 1 (config knob) ─────────────────────────────► Packet 8 (docs)
Packet 2 (fail-fast) ───────┐
Packet 3 (drop disabled)    │
Packet 4 (adopt helpers)    ├──── all need to land before Packet 8's "docs reflect runtime"
Packet 5 (wire helpers)     │
Packet 6 (per-goal closure) │
Packet 7 (warnings) ────────┘
```

Packets 2-7 are independent of each other at the code level. They touch disjoint files except packet 4 which touches both `memory-status.ts` and the extension.

**Parallelisable:** Packets 2, 3, 4, 5, 6, 7 can all run in parallel. Packet 1 is config-only, also parallelisable. Packet 8 (docs) must come last and incorporates the result of all the others.

## Test plan

After all packets land:

1. `npm test` from the package root: 102 tests + new tests from packets 2, 3, 4, 5, 6, 7 must all pass. Target ≥ 130 tests.
2. `npm run check` from the package root: build + typecheck + tests in sequence.
3. Manual smoke test: `install.sh --skip-eden-check` should still work (preserves the escape hatch). `install.sh` without the flag should fail loudly if eden-memory binary is missing.
4. End-to-end with a live eden-memory: enable integration, run a goal, verify all seven markers appear in the byMarker histogram with `ok=1` each.

## Open questions for the human

1. **Packet 5's `[api-ready]` trigger.** Should it fire when the worker's `finalAnswer` contains a top-level `contract:` field, or should the builder explicitly opt in via `params.apiReady`? The former is automatic but fragile (any string matching the shape triggers it); the latter is explicit but requires builder cooperation. My recommendation: explicit opt-in via `params.apiReady = true` in the delegate call, with a check that the final answer contains a `contract:` field.

2. **Packet 5's `/andon` semantics.** Should `/andon <reason>` abort running workers for the goal, or just record the marker? Per the markers doc, `[andon]` is "what failed, exact error, what was not done." Recording without aborting seems consistent, but the orchestrator may want both.

3. **Packet 8's `install.sh` failure mode.** Should missing eden-memory be a hard install failure, or a warning with instructions? My recommendation: hard failure by default, `--skip-eden-check` to override.

4. **Per-goal `[closure]` for already-closed goals.** If the same goal is closed twice (e.g. session restart replays a goal), should the second `[closure]` be a no-op or a new record? Per the markers doc, "corrections are new entries with `supersedes:`" — so we should always emit. But we should also include `supersedes: <prior-closure-id>` if a prior exists. This is more invasive than the packet suggests — it requires querying eden-memory at close time. Recommendation: emit a new `[closure]` per call; if a prior exists for the same goal, leave the supersedes handling for a later packet (no query at write time).

## Estimate

- Packet 1: ~30 min
- Packet 2: ~1 hour
- Packet 3: ~30 min (mostly deletion + test updates)
- Packet 4: ~45 min
- Packet 5: ~2 hours (largest packet; five new emissions)
- Packet 6: ~30 min
- Packet 7: ~15 min
- Packet 8: ~1 hour (docs are numerous)

**Total:** ~6-7 hours of focused work, can be parallelised to ~2 hours wall-clock with three Builder slots.

## Exit criteria

This plan is complete when:

- `agents-team.json` example has `memory.edenMemory.required: true`.
- `session_start` fails fast when eden-memory is missing and the flag is true.
- All `record*()` helpers have at least one callsite in the extension.
- The `memory` block on tool payloads includes `glyph` and `recent` fields.
- Per-goal `[closure]` fires on worker terminal.
- `[routing]` write is awaited (no fire-and-forget).
- Warning entries carry marker context.
- All docs reflect required-primitive semantics.
- All tests pass (≥ 130).
- `install.sh` smoke-tests eden-memory presence.
- A 5-minute manual smoke test confirms: install with eden-memory present → orchestrator can run a goal → all seven stages produce markers → histogram is accurate.
