# Durable ATP record keeping with eden-memory

Pi Agents Team can append Agent Team Protocol (ATP) lifecycle markers to a local [eden-memory](https://github.com/KristjanPikhof/eden-memory) SQLite store. This document covers how to enable the integration, the required `.env` fields, the marker contract, startup blocked-task detection, and how memory writes tolerate transient contention.

## Enabling the integration

The eden-memory ATP integration is **controlled by environment variables** so it remains optional in the Path A thin extension. Set `EDEN_MEMORY_ENABLED=true` (or leave it unset, in which case it defaults to enabled) and configure the required base fields listed below. When `EDEN_MEMORY_ENABLED=false` or the required fields are missing, the extension behaves exactly as before: no memory writes are attempted and no startup checks are run.

```bash
export EDEN_MEMORY_ENABLED=true
export EDEN_MEMORY_BIN=/home/yakov/.local/bin/eden-memory
export EDEN_MEMORY_DB=/home/yakov/.eden-memory/default.db
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

The recorder mirrors the seven-stage ATP lifecycle from `.pi-team/reference/task-lifecycle.md` and the marker grammar from `.pi-team/reference/markers.md`.

| Stage | Marker | Owner | When written |
|---|---|---|---|
| 1 Goal receipt | `[goal-received]` | team-lead | `session_start` |
| 2 Routing | `[routing]` | dispatcher | `delegate_task` |
| 3 Context gathering | `[context-gathering]` | researcher | researcher worker reaches terminal idle/completed with a final answer |
| 4 Action | `[action]` | builder\|runtime | builder/runtime worker reaches terminal idle/completed with a final answer |
| 5 Verification | `[verdict]` | verifier | verifier worker reaches terminal idle/completed with a final answer |
| 6 Recording and archival | `[recorded]` + worker events | archivist | archivist worker reaches terminal idle/completed with a final answer; also on worker terminal/relay/prune state changes |
| 7 Hand-off or closure | `[closure]` | team-lead | `session_shutdown` |

Each record is written with `eden-memory remember --content ... --metadata '{...}'`. The content line is human-readable and grep-friendly:

```text
[action] goal:Implement-feature task:t3 worker:w2 owner:builder|runtime round:1
Built artefact X for profile builder.
```

The `--metadata` object includes:

- `marker` — the bracketed marker name
- `stage` — the ATP stage key
- `owner` — the stage owner role
- `recordedAt` — epoch milliseconds
- `goalId`, `taskId`, `workerId`, `profileName`, `packageName` when known
- `round` and `supersedes` when provided by the caller

Memory writes are best-effort. A missing `.env` or an `eden-memory` CLI failure is returned as `{ ok: false, error, skipped }` and never thrown into the user-facing tool path.

## Startup blocked/unfinished task detection

On every `session_start`, when eden-memory is enabled and configured, the thin extension runs a lightweight health check and queries the durable store for potentially blocked or unfinished work:

1. It searches memory for recent `[goal-received]` markers with the keywords `blocked` or `unfinished`.
2. It searches for goals that have been received (`stage: goal-receipt`) but have not yet been closed (`stage: hand-off-or-closure`).
3. The union of those goal IDs is surfaced as a short `pi-agents-team/memory-blocked-goals` entry via `pi.appendEntry`.
4. A concise summary is also appended to the orchestrator system prompt injection (when project agents are present) so the orchestrator can decide whether to resume or ask about the work.

The detection is heuristic: it relies on the marker text and the presence/absence of lifecycle stage markers in the same workspace/user/agent scope. It does not block session startup; if the query fails, the error is logged via `pi.appendEntry` and the session continues normally.

Warnings are emitted during the startup sequence only. There is no per-session notification deduplication; the one-warning-per-session effect is a consequence of the startup-only logging, not an explicit deduplication mechanism.

## Concurrency and retries

Short-lived `eden-memory` CLI invocations used by pi-agents-team share the SQLite database via WAL mode and rely on SQLite's built-in busy handling. Transient contention from multiple agents writing at the same time is resolved automatically with retries; failures only surface after the retry budget is exhausted.

Long-running processes (e.g., the MCP server, a sync loop, or a relay server) may still use an exclusive advisory lock for their own maintenance operations. If you run one of those alongside pi-agents-team and see a "database is locked by another eden-memory process" error, stop that long-running process and retry. Normal concurrent agent writes no longer require stopping sibling CLI processes.

## Document / report summaries

The `atp-recorder` module exposes `generateStageSummary(options, signal)` which calls `eden-memory document` to produce a goal or topic summary. This is intended for stage 6 (archivist) summaries. The call is safe: failures return `{ ok: false, error }` rather than throwing.

## Testing

Unit tests under `tests/memory/` mock the `eden-memory` CLI with temporary scripts so they do not require a real database or the global default DB. They cover record formatting, CLI invocation error paths, abort signals, `.env` resolution, and the new search wrapper. Run them with:

```bash
npm test
```

End-to-end writes against a live eden-memory DB are not exercised in the suite because they require an unlocked database and a configured LLM for semantic features.
