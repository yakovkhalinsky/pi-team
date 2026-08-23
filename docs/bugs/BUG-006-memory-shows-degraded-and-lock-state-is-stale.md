# BUG-006: memory shows "degraded" forever, and the lock-state concept is stale

**Severity:** Medium — cosmetic-but-persistent UI lie; a runtime concept (`locked`) that
no longer reflects how eden-memory actually behaves.
**Status:** Fixed (`d81e67d`). `locked` concept removed; `buildTeamSnapshot` now reads `memoryTracker.status.healthy === true`. Same commit ships the BUG-003 partial fix (AbortController in tracker; spawnEden child/stream unref); the two remaining `node:test` PipeWrap leaks are still pending and `BUG-003` remains Open.
**Discovered:** 2026-08-23, while reviewing the team-status widget's `memory:` line.

## Summary

Two related defects in the eden-memory integration:

1. **The footer and widget always say `memory: degraded`, even when eden-memory is
   healthy.** The snapshot reads `memoryTracker.status.ok`, but that field is never
   set anywhere. The tracker maintains `status.healthy` (and `status.locked`); `ok` is
   a phantom field. So the comparison `status.ok === true` is always false, and every
   session reports `degraded`.

2. **The whole `locked` concept is stale.** Eden-memory is documented as lockless
   (commit `856d1e9` removed the lock-recovery guidance; `docs/memory.md` says
   "eden-memory CLI is lockless"). The team code, however, still parses
   `"locked by another eden-memory process"` out of CLI stderr, surfaces a separate
   `🔒` glyph, has a `status.locked` field, has a `locked` field on the aggregate,
   and has tests asserting on all of these. SQLite handles concurrency internally;
   when the connection pool is exhausted, eden-memory returns a generic
   `ok: false, error: "..."` — the team should treat that as a normal failed write,
   not as a distinct UI state.

The two bugs are linked because the tracker's `healthy` derivation still factors in
`result.locked`:

```ts
// memory-status.ts:121
status.healthy = result.ok && !result.locked;
```

So as long as `locked` exists, `healthy` can be wrong too. Removing the lock
concept cleans up both bugs in one shot.

## Reproduction

### Bug 1 — degraded UI

1. Install and configure eden-memory correctly (`EDEN_MEMORY_BIN`, `EDEN_MEMORY_DB`,
   `EDEN_WORKSPACE_ID`, `EDEN_USER_ID`, `EDEN_AGENT_ID` all set; binary works).
2. Start a `pi` session in any repo with `.pi/agent/` profiles.
3. Observe the footer status: it reads `Team (N agents) | memory: degraded`.
4. Open `/team` to see the panel: it reads `Memory: degraded`.
5. Run `eden-memory health` directly: it returns `{ok: true}`.

The UI lies about eden-memory health on every session.

### Bug 2 — stale lock concept

1. `grep -rn "locked\|lock" packages/pi-agents-team/src | grep -v "block"` — five
   files reference `locked` as if it were a real runtime state.
2. `grep -n "🔒" packages/pi-agents-team/src` — there is a `🔒` glyph that the UI
   can render. It will only render if the parser ever sees the lock string, which
   in current eden-memory it never does.
3. The lock string parser in `eden-memory.ts:317` is a string-match on
   `"locked by another eden-memory process"` or `"already locked"`. Eden-memory no
   longer emits these (CLI is lockless); the branch is dead in practice, and even
   if it fired it would just turn an `ok: false` into an `ok: false` with extra
   noise.

## Root cause

### Bug 1 — phantom field

`buildTeamSnapshot` (extensions/pi-agent-team/index.ts:280) reads a field that
the tracker never writes:

```ts
ok: memoryTracker.status.ok === true,   // always false
```

The tracker's status object (memory-status.ts:91–105) initialises `healthy`,
`locked`, `recordsWritten`, etc., but never `ok`. The result is propagated to
`buildStatusLine` (line 321) and `buildWidgetLines` (line 365), both of which
branch on `memory.ok` and default to the "degraded" / non-ok label.

### Bug 2 — lock as a first-class state

The lock concept was introduced when eden-memory used an exclusive advisory lock
for all writes. That lock was removed upstream; the team code was not cleaned up.
A scan shows the lock concept lives in:

- `src/src/memory/eden-memory.ts:309–320` — `health()` parses the CLI's stderr
  for `"locked by another eden-memory process"` / `"already locked"` and returns
  `{ok: false, locked: true, error, stderr}`.
- `src/src/memory/eden-memory.d.ts:65` — `EdenHealthResult.locked?: boolean`.
- `src/src/memory/memory-status.ts:62, 89, 96, 121–122` — `status.locked` field,
  initialised to `false`, set from `result.locked`. Also affects
  `status.healthy = result.ok && !result.locked`.
- `src/src/memory/memory-status.ts:183, 200` — `🔒` glyph and `"locked"` fragment.
- `src/src/memory/memory-status.ts:321` — `aggregateEdenMemoryStatus` carries
  `locked: statuses.some((s) => s.locked)`.
- `src/src/memory/memory-status.d.ts:42, 49, 69` — type declarations for the same.

The user-stated principle is: SQLite handles concurrency; connection-pool
exhaustion is just an error. So we drop the parser, the field, the glyph, and the
aggregate field, and let `ok: false + error: "..."` flow through the same path as
any other failure.

## Proposed fix

### Code changes

1. **`eden-memory.ts` `health()`**: drop the `locked` string-match. The function
   returns `{ok, error?, stderr?}` only. When eden-memory reports pool exhaustion,
   it's already `{ok: false, error: "..."}`; the team code treats that the same
   way as any other write failure (counted in `recordsFailed`, surfaced via
   `lastError`).

2. **`eden-memory.d.ts`**: drop `locked?: boolean` from `EdenHealthResult`.

3. **`memory-status.ts`**:
   - Drop `status.locked` from the tracker's status shape.
   - Change `status.healthy = result.ok && !result.locked;` to
     `status.healthy = result.ok;`.
   - Drop the `if (status.locked)` branches in `getMemoryStatusGlyph` (no more
     `🔒`) and `formatMemoryStatusFragment` (no more `"locked"` word).
   - Drop `locked: statuses.some(...)` from `aggregateEdenMemoryStatus`.

4. **`memory-status.d.ts`**: drop `locked` from `EdenMemoryStatus` and
   `EdenMemoryAggregateStatus`.

5. **`index.ts` `buildTeamSnapshot`**: fix Bug 1 by deriving `ok` from `healthy`:
   ```ts
   ok: memoryTracker.status.healthy === true,
   ```
   (Equivalently: `memoryTracker.status.healthy !== false`. Either works; the
   former matches "the tracker has confirmed health at least once.")

6. **`docs/memory.md`**: drop the paragraph that mentions "an exclusive advisory
   lock for their own maintenance operations" — that paragraph is about the
   upstream lock concept we are no longer tracking. Add a one-sentence note that
   SQLite handles concurrency internally and the team treats any failed write
   (including pool exhaustion) as a normal error.

### Test changes

- `tests/memory/eden-memory.test.ts`:
  - The "returns safe error result when CLI exits non-zero" test (line ~125)
    still passes — it doesn't assert on `locked`, only on `ok: false`.
  - The "detects locked database from CLI stderr" test (line ~158, the one that
    asserts `result.locked === true`) **is deleted**. There is no `locked` field
    any more.
  - No other test in this file references `locked`.

- `tests/memory/memory-status.test.ts`:
  - The "tracker reflects locked state" test block (lines ~53–57, asserting
    `tracker.status.locked` before and after `updateFromHealthResult({ok: false,
    locked: true, ...})`) **is deleted**.
  - The "getMemoryStatusGlyph returns 🔒 for locked status" test (line ~173) is
    **deleted**.
  - The "aggregateEdenMemoryStatus picks up locked" test (lines ~239–241,
    asserting `agg?.locked === true`) **is deleted**.
  - The corresponding aggregate tests should also stop setting `enabled: true` on
    per-worker statuses (the `enabled` field is also being removed by the
    no-opt-out refactor; if that lands first, this bug fix is simpler).

- `tests/shell.test.ts`:
  - The two tests at lines 1147 (`1 blocked`) and 777+ (`records eden-memory
    health, goal-receipt and blocked goals on session_start when enabled`) are
    **not affected** — they assert on `blocked` (goal state), not on `locked`.
  - **New test**: `"memory snapshot reports ok when tracker is healthy"`. Setup:
    a fake `memoryTracker` with `status.healthy === true`, `status.locked`
    absent. Call `buildTeamSnapshot(agents, workers, memoryTracker, [])`. Assert
    `snapshot.memory.ok === true`.
  - **New test**: `"memory snapshot reports degraded when tracker is unhealthy"`.
    Setup: `status.healthy === false, status.lastError = "..."`. Assert
    `snapshot.memory.ok === false` and `snapshot.memory.lastError === "..."`.
  - **New test**: `"memory snapshot reports degraded when tracker has no health
    yet"`. Setup: `status.healthy === undefined`. Assert `snapshot.memory.ok ===
    false` (or, equivalently, that the widget shows `degraded` until the first
    health check lands). This preserves today's behaviour for the "tracker
    exists but hasn't polled yet" case.

### Test count impact

| Action | Count |
|---|---|
| Baseline | 112 |
| Delete lock-parser test in eden-memory.test.ts | -1 |
| Delete lock-state test in memory-status.test.ts | -1 |
| Delete 🔒 glyph test | -1 |
| Delete aggregate-locked test | -1 |
| Add 3 `buildTeamSnapshot` healthy/degraded/unknown tests | +3 |
| **Net** | **+0** (112 → 112) |

The shape of the tests changes (more "behaviour-driven", fewer
"field-existence-driven"), but the count holds.

## Risks

- **Any downstream user reading `status.locked` or `agg.locked` sees `undefined`.**
  Behaviour change. Mitigation: this is an internal API; no external consumers
  per the design (the orchestrator reads `memory.blockedGoalCount` and the
  histogram, not `locked`).
- **The new `ok: status.healthy === true` means `ok` stays false until the first
  health check lands.** Today, `ok` is also false (the phantom-field bug). So
  there's a window between `session_start` and the first health result where the
  UI still shows `degraded`. Mitigation: the `lastHealthCheckAt` field already
  exists; the widget can show "checking…" during that window if we want. Out of
  scope for this fix — the current behaviour is "degraded," which is no worse.
- **The new tests assume `enabled` is still a field on the tracker status.**
  The no-opt-out refactor (`docs/plans/config-review-eden-memory-required-tasks.md`)
  removes `enabled` entirely. If both land in the same release, the new tests
  should construct the tracker differently. Mitigation: land BUG-006 first (small,
  self-contained), then land the refactor. The refactor's Phase 2 already
  collapses `enabled` checks to truthiness checks on the tracker object, which
  composes cleanly.

## Out of scope

- Changing eden-memory itself (we're a downstream consumer; the user owns the
  upstream change).
- A "checking…" UI state during the first health poll.
- Connection-pool tuning (out of team-code scope; the team code's job is to
  observe and report).
- Removing the `enabled` field (covered by the no-opt-out refactor).

## Verification

- `cd packages/pi-agents-team && npm run check` — clean.
- `grep -rn "locked\|🔒" packages/pi-agents-team/src packages/pi-agents-team/tests
  | grep -v "block" | grep -v "test-block"` returns zero matches in
  `src/` and only lock-unrelated matches in `tests/`.
- Manual smoke test: start a session with eden-memory healthy, footer shows
  `memory: ok`; with eden-memory down, footer shows `memory: degraded` (and the
  graceful-fallback path from the no-opt-out refactor fires if/when that's
  landed).

## Closing commit

[`d81e67d`](https://github.com/yakovkhalinsky/pi-team/commit/d81e67d) —
`fix(memory): BUG-003 partial + BUG-006`. Note: this commit also ships the
BUG-003 partial fix; BUG-003 is **not** closed by this commit (two `node:test`
PipeWraps still leak intermittently without `--test-force-exit`).
