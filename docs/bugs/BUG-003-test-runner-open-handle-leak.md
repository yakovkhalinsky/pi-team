# BUG-003 — Test runner leaks an open handle, forcing `--test-force-exit`

**Severity:** Medium — `npm test` takes ~25–30 seconds to exit (with all
tests passing) because the Node test runner waits on an open handle
after the test suite completes. The pre-existing test suite already
exhibited this; the team-status widget (`ac33610`) inherited it
without making it worse.

**Status:** Open

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
