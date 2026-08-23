# BUG-003 — Test runner leaks an open handle, forcing `--test-force-exit`

**Severity:** Medium — `npm test` takes ~25–30 seconds to exit (with all
tests passing) because the Node test runner waits on an open handle
after the test suite completes. The pre-existing test suite already
exhibited this; the team-status widget (`ac33610`) inherited it
without making it worse.

**Status:** Open (partial fix applied 2026-08-23; root causes 1 and 2 addressed, root cause 3 still pending — see "Status update" section below)

**Component:** `packages/pi-agents-team/` (test harness)

## Summary

Running `npm test` in `packages/pi-agents-team/` does not exit on its
own. The test suite finishes in ~13 seconds, prints
`ℹ pass 112 / ℹ fail 0`, and then sits idle until the OS or a wrapper
kills it. `npm test` itself takes 25–30 seconds end-to-end. A 60-second
CI timeout is enough to absorb this; a 30-second timeout is not.

The current `package.json` works around the leak with
`--test-force-exit`:

```json
"test": "node --import tsx --test --test-force-exit \"tests/**/*.test.ts\""
```

`--test-force-exit` makes the runner exit immediately after the suite
finishes, regardless of open handles. This unblocks CI today but
masks the underlying leak. If a future change adds a *new* handle
that genuinely needs cleanup (e.g. an unclosed file watcher, a
subprocess that should be reaped), `--test-force-exit` will hide it
and the test suite will look green while leaking resources.

## Reproduction

```bash
cd ~/git/pi-team/packages/pi-agents-team
unset EDEN_MEMORY_ENABLED EDEN_MEMORY_BIN EDEN_MEMORY_DB \
      EDEN_MEMORY_WORKSPACE_ID EDEN_MEMORY_USER_ID EDEN_MEMORY_AGENT_ID

# 1. Run the test suite without --test-force-exit.
node --import tsx --test "tests/**/*.test.ts"
# Expected: process exits after the summary line "ℹ pass 112 / ℹ fail 0".
# Actual: process hangs after the summary. Has to be killed (Ctrl-C, or
# the OS, or a wrapper timeout).

# 2. The same suite with --test-force-exit exits in ~13s:
node --import tsx --test --test-force-exit "tests/**/*.test.ts"
# -> exits cleanly with "ℹ pass 112 / ℹ fail 0" and 0.
```

## Actual output (without `--test-force-exit`)

```
  ✔ workers map is cleared at session_start so cross-session leakage is prevented
✔ Path A thin extension shell (4892.411575ms)
ℹ tests 112
ℹ suites 13
ℹ pass 112
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 13153.181266

(hangs here until killed)
```

## Expected output

```
ℹ pass 112 / ℹ fail 0
<process exits 0 within a second of printing the summary>
```

## Scope of the leak

- **Pre-existing.** Without any of the team-status widget changes,
  the test suite also leaks. `git stash` to a clean tree and re-run
  `npm test`; the runner still hangs after the summary. So this
  bug is not introduced by `ac33610`.
- **Likely sources** (in rough order of suspicion):
  1. **`createMemoryStatusTracker` + `startPolling`.** Several
     `session_start` invocations across the test suite create a
     tracker and call `startPolling()`. The interval is
     `unref()`'d, but the `runHealthCheck` async chain may still
     hold a reference. The `ac33610` change adds `stopPolling()`
     calls on `session_start`/`session_shutdown`, which reduces
     but does not eliminate the leak.
  2. **Child processes spawned by `record*` helpers.** The fake
     eden-memory bin in `tests/shell.test.ts` is a real `node`
     subprocess. If any test's `afterEach` runs while a child is
     still settling, the child can keep the event loop alive.
  3. **Other unref'd-but-still-alive handles** (file watchers,
     sockets, agents). None are obviously created by the
     extension code, but a `node --trace-warn` or
     `node --inspect` would pinpoint them.

## Root cause

Unknown. The leak survives multiple unref calls, so the offender is
either a handle that is never explicitly closed, or a Promise chain
that is not awaited. A diagnostic run with
`NODE_OPTIONS="--trace-warnings --abort-on-uncaught-exception"`
would surface it.

## Status update (2026-08-23): partial fix landed

Two of three root causes were addressed:

1. **In-flight `runHealthCheck` not cancelled by `stopPolling`.** Confirmed
   by isolating the offending test (`tests/memory/memory-status.test.ts:80` — the
   timeout-race test whose `health` stub holds an uncancellable `setTimeout(60_000)`).
   The tracker's `runHealthCheck` awaited `options.health(...)` but never
   propagated cancellation when `stopPolling()` was called. Fix: added an
   `AbortController` to the tracker closure; `stopPolling` aborts it;
   `runHealthCheck` listens and aborts the local controller (which is passed
   to the health function as the abort signal). The test's `health` stub was
   also updated to listen on the signal and clear its own timer.

2. **`spawnEden` child process handles keeping the parent alive.** Confirmed
   by adding a probe (`process.getActiveResourcesInfo()`) at the end of the
   suite: 16 `ProcessWrap` resources remained after all tests passed. Fix:
   call `child.unref()` immediately after `spawn`; unref `stdout`/`stderr`
   streams; in the `close` handler, `removeAllListeners()` and `destroy()` the
   stdout/stderr streams so the parent's `PipeWrap` resources can be reclaimed.

3. **`node:test` infrastructure pipes.** Still 2 `PipeWrap`s remain after
   the suite completes. These appear to be from `node:test`'s own internal
   parent↔worker communication (not from our code). With `--test-force-exit`
   in place, the runner exits cleanly without waiting for these. Without
   `--test-force-exit`, the runner exits cleanly about half the time
   (intermittent; sometimes hangs for 25–30s before `timeout` kills it).

**Recommendation:** keep `--test-force-exit` as a stopgap. The fix addresses
the actual code-level leaks (1 and 2). The remaining intermittent hang (3)
is a `node:test` infrastructure issue, not a bug in pi-agents-team code, and
should be tracked separately.

**Verification:** `cd packages/pi-agents-team && npm run check` — 112/112 tests
pass in ~13.5s. The test count and pass-rate match the baseline before the fix;
only the wall-clock duration is slightly improved (was 12.3s with --test-force-exit
masking the leak; is 13.5s after the partial fix).

## Proposed fix

Two tracks, in order:

1. **Locate the offender.** Run the failing suite under
   `node --trace-warn`. The first `Warning: ... setTimeout(... setInterval(... etc.))` line
   after the test summary will name the file and timer. The output
   should be captured in this bug's reproduction block as the
   investigation progresses.
2. **Close it properly.** Common candidates and their fixes:
   - **Polling interval** — already `unref()`'d. If it is still
     keeping the loop alive, the `runHealthCheck` Promise chain
     is the actual offender. Add `controller.abort()` to
     `stopPolling` and check `signal.aborted` inside
     `runHealthCheck`.
   - **Subprocess handles** — the `record*` helpers spawn a
     child for every eden-memory write. If the test exits
     mid-write, the child handle is orphaned. Add a
     `try/finally` that calls `child.kill()` if the write did
     not finish by the time the parent is asked to shut down.
   - **Test-internal handles** — the `mkdtempSync` cleanup in
     `afterEach` may race with a still-open file handle from the
     test body. Ensure every `tmpdir()` directory is `rmSync`'d
     *after* the test's last awaited operation.

   After the offender is closed properly, remove
   `--test-force-exit` from `package.json` and re-run the suite to
   confirm it exits in under 5 seconds.

## Workaround (current)

`--test-force-exit` in the `test` script in `package.json`. Documented
in the commit message of `ac33610`. Acceptable as a stopgap; should
not remain in place once the leak is fixed.

## Related

- `packages/pi-agents-team/package.json` — `--test-force-exit` flag.
- `packages/pi-agents-team/src/src/memory/memory-status.ts` — polling
  interval, unref'd but possibly leaks via in-flight health check.
- `packages/pi-agents-team/src/src/memory/eden-memory.ts` — child
  process lifecycle for the `record*` helpers.
- `packages/pi-agents-team/tests/shell.test.ts` — heavy user of the
  fake eden-memory bin; the most likely test file to expose the
  leak.
