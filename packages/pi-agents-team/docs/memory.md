# Durable ATP record keeping with eden-memory

Pi Agents Team can append Agent Team Protocol (ATP) lifecycle markers to a local [eden-memory](https://github.com/KristjanPikhof/eden-memory) SQLite store. This document covers how to enable the integration, the required `.env` fields, the marker contract, startup blocked-task detection, how memory writes tolerate transient contention, and the per-poll memory surface the orchestrator sees on every `wait_for_agents` call.

The marker grammar in this document mirrors the canonical table in `atp-markers.ts` (the runtime source of truth) and `.pi-team/reference/markers.md`. When the runtime table and the docs disagree, the runtime table wins and this doc is wrong.

## Enabling the integration

The eden-memory ATP integration is **controlled by environment variables** so it remains optional in the Path A thin extension. Set `EDEN_MEMORY_ENABLED=true` (or leave it unset, in which case it defaults to enabled) and configure the required base fields listed below. When `EDEN_MEMORY_ENABLED=false` or the required fields are missing, the extension behaves exactly as before: no memory writes are attempted and no startup checks are run.

```bash
export EDEN_MEMORY_ENABLED=true
export EDEN_MEMORY_BIN=/home/yakov/.local/bin/eden-memory
export EDEN_MEMORY_DB=/home/eden-memory/default.db
export EDEN_WORKSPACE_ID=default
export EDEN_USER_ID=yakov
export EDEN_AGENT_ID=pi-agents-team
```

If semantic document generation is enabled (`EDEN_MEMORY_SEMANTIC_SEARCH=true`), the LLM pair is also required:

```bash
export EDEN_LLM_API_KEY=sk-...
export EDEN_LLM_BASE_URL=https://api.openai.com/v1
```

## Required base fields

| Variable | Purpose |
|---|---|
| `EDEN_MEMORY_BIN` | Path to the `eden-memory` binary. Default: `/home/yakov/.local/bin/eden-memory`. |
| `EDEN_MEMORY_DB` | SQLite database path. Default: `~/.eden-memory/default.db`. |
| `EDEN_WORKSPACE_ID` | Workspace scope for memory records. Default: `default`. |
| `EDEN_USER_ID` | User identity for memory records. Default: `yakov`. |
| `EDEN_AGENT_ID` | Agent identity for memory records. Default: `pi-agents-team`. |

## Optional fields

| Variable | Purpose |
|---|---|
| `EDEN_MEMORY_ENABLED` | `true`/`false` toggle. Defaults to enabled. |
| `EDEN_MEMORY_SEMANTIC_SEARCH` | `true` to enable semantic document generation. |
| `EDEN_LLM_API_KEY` | Required when semantic search is enabled. |
| `EDEN_LLM_BASE_URL` | Required when semantic search is enabled. |

## ATP marker contract

The recorder mirrors the seven-stage ATP lifecycle from `.pi-team/reference/task-lifecycle.md` and the marker grammar from `.pi-team/reference/markers.md`. Every marker the recorder may emit is listed in the canonical table in `atp-markers.ts`. The Dispatcher enforces that a marker's claimed signer matches the role that wrote it; the recorder derives the marker name and owner from the table so they cannot drift.

### Lifecycle stage markers

These markers close out a lifecycle stage. They are written by the role that owns the stage, per the marker table.

| Stage | Marker | Owner | When written |
|---|---|---|---|
| 1 Goal receipt | `[goal-received]` | team-lead | `session_start` |
| 2 Routing | `[routing]` | dispatcher | every `delegate_task` call |
| 3 Context gathering (ran) | `[context-gathering]` | researcher | researcher worker reaches terminal status |
| 3 Context gathering (skipped) | `[skip-context-gathering]` | dispatcher | dispatcher explicitly skipped Stage 3 (uncertainty was low) |
| 4 Action | `[action]` | builder or runtime | builder/runtime worker reaches terminal status |
| 4 Action (contract ready) | `[api-ready]` | builder | builder emits a public contract for downstream consumers |
| 5 Verification | `[verdict]` | verifier | verifier worker reaches terminal status |
| 6 Recording and archival | `[recorded]` | archivist | archivist worker reaches terminal status |
| 7 Hand-off | `[handoff]` | archivist | ownership of a live task is transferred to another role or package |
| 7 Closure | `[closure]` | team-lead | `session_shutdown`, or per-goal closure by the dispatcher/archivist |

### Operational markers (outside the seven stages)

| Marker | Owner | When written |
|---|---|---|
| `[andon]` | any role (`*`) | Stop-the-line: any role can report a failure with `reason:` and `error:` |
| `[escalation]` | dispatcher | Human-in-the-loop gate. Body must carry `question:`, `context:`, `options:`, `default-if-silent:` |

### Worker-event markers (orchestrator telemetry)

These are emitted by the orchestrator as it observes worker lifecycle. They record under `stage: recording-and-archival` for durable-record grouping, but the marker name and owner reflect the *actual* signer (orchestrator or archivist), not the stage owner.

| Marker | Owner | When written |
|---|---|---|
| `[worker-terminal]` | orchestrator | a worker reaches `completed`, `error`, or `aborted` |
| `[worker-relay]` | orchestrator | a worker raises a relay question for the orchestrator to answer |
| `[worker-pruned]` | archivist | the orchestrator prunes worker state (memory, cost, or session-end cleanup) |

Each record is written with `eden-memory remember --content ... --metadata '{...}'`. The content line is human-readable and grep-friendly:

```text
[action] goal:Implement-feature task:t3 worker:w2 owner:builder|runtime round:1
Built artefact X for profile builder.
```

The `--metadata` object includes:

- `marker` — the bracketed marker name (e.g. `[action]`)
- `stage` — the ATP stage key (`null` for `[andon]`/`[escalation]`)
- `owner` — the role allowed to sign this marker per the marker table
- `workerEvent` — `true` for `[worker-terminal]` / `[worker-relay]` / `[worker-pruned]`
- `recordedAt` — epoch milliseconds
- `goalId`, `taskId`, `workerId`, `profileName`, `packageName` when known
- `round` and `supersedes` when provided by the caller

Memory writes are best-effort. A missing `.env` or an `eden-memory` CLI failure is returned as `{ ok: false, error, skipped }` and never thrown into the user-facing tool path.

## What the orchestrator sees: the `memory` block on tool payloads

Path A removed the `/team` overlay, but the orchestrator still needs a per-poll view of memory state to know whether the lifecycle actually completed. Every `delegate_task` and `wait_for_agents` tool result now carries a `memory` block when eden-memory is enabled. The block is built by `aggregateEdenMemoryStatus(teamStatus, workers)` from the per-worker statuses the orchestrator tracks in memory.

Shape:

```jsonc
{
  "memory": {
    "enabled": true,
    "healthy": true,
    "locked": false,
    "recordsWritten": 6,
    "recordsFailed": 0,
    "recordsSkipped": 0,
    "lastError": null,
    "totals": { "ok": 6, "error": 0, "skipped": 0 },

    // Per-marker histogram. Keys are exactly the marker names in
    // atp-markers.ts; buckets are pre-initialised so consumers can rely on
    // `byMarker[name]` being defined for every canonical marker.
    "byMarker": {
      "[goal-received]":        { "ok": 1, "error": 0, "skipped": 0, "lastTs": 1734567890123 },
      "[routing]":              { "ok": 1, "error": 0, "skipped": 0, "lastTs": 1734567890456 },
      "[context-gathering]":    { "ok": 0, "error": 0, "skipped": 0 },
      "[skip-context-gathering]":{ "ok": 0, "error": 0, "skipped": 0 },
      "[action]":               { "ok": 1, "error": 0, "skipped": 0, "lastTs": 1734567890789 },
      "[api-ready]":            { "ok": 0, "error": 0, "skipped": 0 },
      "[verdict]":              { "ok": 1, "error": 0, "skipped": 0, "lastTs": 1734567891012 },
      "[recorded]":             { "ok": 1, "error": 0, "skipped": 0, "lastTs": 1734567891234 },
      "[closure]":              { "ok": 1, "error": 0, "skipped": 0, "lastTs": 1734567891456 },
      "[handoff]":              { "ok": 0, "error": 0, "skipped": 0 },
      "[andon]":                { "ok": 0, "error": 0, "skipped": 0 },
      "[escalation]":           { "ok": 0, "error": 0, "skipped": 0 },
      "[worker-terminal]":      { "ok": 1, "error": 0, "skipped": 0, "lastTs": 1734567891678 },
      "[worker-relay]":         { "ok": 0, "error": 0, "skipped": 0 },
      "[worker-pruned]":        { "ok": 0, "error": 0, "skipped": 0 }
    }
  }
}
```

When eden-memory is disabled or unconfigured, the `memory` key is absent. The orchestrator should treat absence as "no memory surface available" and continue without it.

Reading the histogram is the orchestrator's primary way to verify the lifecycle. For example, after a goal's worker has reached terminal status:

- `[action].ok >= 1` and `[verdict].ok >= 1` and `[closure].ok >= 1` — the goal ran through to closure.
- `[action].ok >= 1` but `[verdict].ok === 0` and `[verdict].error > 0` — verification failed; check `lastError` and the worker's stderr.
- `[closure].ok === 0` despite `[recorded].ok >= 1` — the recording happened but the goal was never closed; either the dispatcher skipped closure or the orchestrator crashed mid-flight.

## Startup blocked/unfinished task detection

On every `session_start`, when eden-memory is enabled and configured, the thin extension runs a lightweight health check and queries the durable store for potentially blocked or unfinished work:

1. It searches memory for recent `[goal-received]` markers with the keywords `blocked` or `unfinished`.
2. It searches for goals that have been received (`stage: goal-receipt`) but have not yet been closed (`stage: hand-off-or-closure`). `[closure]` and `[handoff]` both count as "the goal left goal-receipt" for this query.
3. The union of those goal IDs is surfaced as a short `pi-agents-team/memory-blocked-goals` entry via `pi.appendEntry`.
4. A concise summary is also appended to the orchestrator system prompt injection (when project agents are present) so the orchestrator can decide whether to resume or ask about the work. The injection awaits the startup query with a 2-second ceiling so a hung CLI never blocks the agent.

The detection is heuristic: it relies on the marker text and the presence/absence of lifecycle stage markers in the same workspace/user/agent scope. It does not block session startup; if the query fails, the error is logged via `pi.appendEntry` and the session continues normally.

Warnings are emitted during the startup sequence only. There is no per-session notification deduplication; the one-warning-per-session effect is a consequence of the startup-only logging, not an explicit deduplication mechanism.

## Concurrency and retries

Short-lived `eden-memory` CLI invocations used by pi-agents-team share the SQLite database via WAL mode and rely on SQLite's built-in busy handling. Transient contention from multiple agents writing at the same time is resolved automatically with retries; failures only surface after the retry budget is exhausted.

Long-running processes (e.g., the MCP server, a sync loop, or a relay server) may still use an exclusive advisory lock for their own maintenance operations. If you run one of those alongside pi-agents-team and see a "database is locked by another eden-memory process" error, stop that long-running process and retry. Normal concurrent agent writes no longer require stopping sibling CLI processes.

## Document / report summaries

The `atp-recorder` module exposes `generateStageSummary(options, signal)` which calls `eden-memory document` to produce a goal or topic summary. This is intended for stage 6 (archivist) summaries. The call is safe: failures return `{ ok: false, error }` rather than throwing.

## Adding a new marker

If the lifecycle grows and you need a new marker (say `[blocked-external]`):

1. Add an entry to `ATP_MARKERS` in `src/memory/atp-markers.ts` with `{ marker, stage, owner, workerEvent }`.
2. Add the marker to `.pi-team/reference/markers.md` (canonical name, signer, meaning).
3. Add a `record*()` thin wrapper in `src/memory/atp-recorder.ts` that calls `writeMarker("your-marker", content, options, ctx)`.
4. Add tests under `tests/memory/` covering the wrapper.
5. Update `docs/memory.md` (this file) with the marker in the appropriate table.

Do not invent a marker at a callsite. The runtime throws `Unknown ATP marker` if a caller references a marker that isn't in the table — by design.

## Testing

Unit tests under `tests/memory/` mock the `eden-memory` CLI with temporary scripts so they do not require a real database or the global default DB. They cover:

- Record formatting (`buildMetadata`, `buildMarkerLine`, `buildRecord`).
- CLI invocation error paths, abort signals, `.env` resolution, search wrapper.
- Marker table invariants (every marker has a stage/owner pair, derived maps are consistent).
- Per-marker histogram aggregation in `aggregateEdenMemoryStatus`.

Run them with:

```bash
npm test
```

End-to-end writes against a live eden-memory DB are not exercised in the suite because they require an unlocked database and a configured LLM for semantic features.
