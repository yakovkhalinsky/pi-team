# Plan: Orchestrator memory discipline

**Date:** 2026-08-23
**Status:** Draft for review
**Predecessor:** Stream A recorder bug fix at commit `7e9060e` (unblocks the recorder); Stream B Fleet Dashboard prototype v3 (parallel dispatch)
**Resolves:** the missing discipline layer between "the recorder works" and "the Team Lead always uses the recorder" — every Team-Lead write to `docs/research/`, `docs/plans/`, or `docs/bugs/` must produce a parallel ATP marker.

## Context

Stream A landed at commit `7e9060e`. The recorder bug that was returning `{ok: false, error: "..."}` for every write is fixed; `recordGoalReceipt`, `recordRouting`, `recordAction`, `recordRecordingAndArchival`, `recordClosure`, and the per-marker helpers in `packages/pi-agents-team/src/src/memory/atp-recorder.ts` now succeed end-to-end against the live `~/.eden-memory/default.db`. The marker table at `packages/pi-agents-team/src/src/memory/atp-markers.ts` is canonical and unchanged: it pins every marker name to its lifecycle stage and its allowed signer.

Until this plan lands, the Team Lead has been writing to `docs/research/`, `docs/plans/`, and `docs/bugs/` *without* parallel ATP marker writes. The protocol surface (the marker table and the recorder) is in place; what was missing was the discipline on the orchestrator side, and a test that catches regression on the extension path. Both are small, both live in this plan. The plan is **documentation only**: no source-code changes, no marker-table changes, no recorder changes. It documents the dual-write pattern (markdown audit log + eden-memory replay) for the case when the recorder's env gate fires, and the test plan for `tests/shell.test.ts` that catches "wrote to docs/ without parallel marker."

## Goal

Every Team-Lead write to `docs/research/**/README.md`, `docs/research/**/*.md`, `docs/plans/*.md`, or `docs/bugs/*.md` produces a parallel ATP marker via `recordAction` (for builder-shipped artefacts) or `recordRecordingAndArchival` (for archivist-shipped records). The plan does **NOT** mandate markers for `docs/reference/**` (settled protocol facts, written rarely and with a separate review path) or `docs/README.md` (the table of contents, written once and rarely edited). The marker table at `packages/pi-agents-team/src/src/memory/atp-markers.ts` is the source of truth for which role signs which marker; this plan simply enforces that the Team Lead always invokes the right per-stage helper with the right per-call `ctx.agentId`.

## The discipline

The discipline is: **for every write to the in-scope folders, write a marker; the marker's signer is the role that did the work, not the package.** The Team Lead is the writer of record for `docs/research/`, `docs/plans/`, and `docs/bugs/`, but it signs on behalf of the role that produced the content. The five lifecycle steps below are the concrete rules.

### 1. Goal receipt

When a user goal lands, the Team Lead calls `recordGoalReceipt` *before* any other work begins. The marker carries the goal id, the user-supplied goal text, and the `agentId: "team-lead"` per-call override.

```js
await recordGoalReceipt(
  `goal:${goalId} ${sanitize(goalText)}`,
  { env: process.env, timeoutMs: 30000 },
  { agentId: "team-lead", goalId, packageName: "pi-agents-team" },
);
```

The marker table pins `[goal-received]` to owner `team-lead`. This call is the first durable record of the goal; everything else hangs off its `goalId`.

### 2. Routing

When the orchestrator decides which role gets the goal (Stage 2), the Team Lead invokes `recordRouting` on the dispatcher's behalf. The marker carries the chosen `profileName` and the rationale; the `agentId: "dispatcher"` override is what the marker table requires.

```js
await recordRouting(
  `goal:${goalId} profile:${profileName} rationale:${sanitize(rationale)}`,
  { env: process.env, timeoutMs: 30000 },
  { agentId: "dispatcher", goalId, packageName: "pi-agents-team" },
);
```

Per the marker table, `[routing]` is signed by `dispatcher`. The Team Lead writes on the dispatcher's behalf; the per-call `agentId` keeps the durable record honest.

### 3. Action

When a builder produces a file (artefact, plan, prototype), the builder's `recordAction` call carries the artefact path and a one-paragraph summary. The Team Lead invokes `recordAction` on the builder's behalf when relaying the hand-off; the `agentId: "builder"` override is what the marker table requires.

```js
await recordAction(
  `path:${artefactPath} ${sanitize(summary)}`,
  { env: process.env, timeoutMs: 30000 },
  { agentId: "builder", goalId, packageName: "pi-agents-team" },
);
```

If the runtime produces the artefact (e.g. an updated live-system summary), `agentId` is `"runtime"` instead. The marker table's `builder|runtime` owner field accepts either.

### 4. Recorded

When the durable record itself gets a new entry (the markdown audit log under `docs/research/`), `recordRecordingAndArchival` carries the entry path and the `supersedes:` discipline. The `agentId: "archivist"` override is what the marker table requires.

```js
await recordRecordingAndArchival(
  `path:${entryPath} ${sanitize(summary)}`,
  { env: process.env, timeoutMs: 30000 },
  { agentId: "archivist", goalId, packageName: "pi-agents-team", supersedes: previousId },
);
```

The `supersedes` field is the chain that lets a verifier follow the evolution of a research thread; the markdown audit log mirrors the same chain with a `supersedes:` line at the top of each entry.

### 5. Closure

When the goal closes, `recordClosure` (signed `team-lead`) is called as the last write. The marker carries the goal id and the close reason.

```js
await recordClosure(
  `goal:${goalId} reason:${sanitize(reason)}`,
  { env: process.env, timeoutMs: 30000 },
  { agentId: "team-lead", goalId, packageName: "pi-agents-team" },
);
```

`[closure]` is distinct from `[handoff]`: closure means the goal's lifecycle is fully complete (per-goal), while handoff means the goal is being moved to another role or package mid-flight (per the marker table, `[handoff]` is signed by `archivist`). The Team Lead always writes `[closure]`; the archivist writes `[handoff]` when transferring ownership.

### Cross-cutting: per-call `agentId`, never the env default

Every helper above takes a third argument `ctx` whose `agentId` is the per-call override. The recorder reads this override and substitutes it for the env-resolved `EDEN_AGENT_ID` value when invoking `eden-memory remember --agent-id <signer>`. **The Team Lead MUST set `ctx.agentId` on every call** to one of the seven valid signer values listed in the next section.

## Role-derived `agentId`

The `EDEN_AGENT_ID` env default is the Claude Code session identity (`claude-code-cli` from `setup claude`); it is **NOT** a valid ATP signer. The marker table at `packages/pi-agents-team/src/src/memory/atp-markers.ts` defines exactly seven valid signers, plus the wildcard `*` for `[andon]`. The full mapping, copied from `ATP_MARKERS`:

| Marker                          | Stage                       | Owner                  |
|---------------------------------|-----------------------------|------------------------|
| `[goal-received]`               | `goal-receipt`              | `team-lead`            |
| `[routing]`                     | `routing`                   | `dispatcher`           |
| `[context-gathering]`           | `context-gathering`         | `researcher`           |
| `[skip-context-gathering]`      | `context-gathering`         | `dispatcher`           |
| `[action]`                      | `action`                    | `builder\|runtime`     |
| `[api-ready]`                   | `action`                    | `builder`              |
| `[verdict]`                     | `verification`              | `verifier`             |
| `[recorded]`                    | `recording-and-archival`    | `archivist`            |
| `[closure]`                     | `hand-off-or-closure`       | `team-lead`            |
| `[handoff]`                     | `hand-off-or-closure`       | `archivist`            |
| `[andon]`                       | (none)                      | `*`                    |
| `[escalation]`                  | (none)                      | `dispatcher`           |
| `[worker-terminal]`             | `recording-and-archival`    | `orchestrator`         |
| `[worker-relay]`                | `recording-and-archival`    | `orchestrator`         |
| `[worker-pruned]`               | `recording-and-archival`    | `archivist`            |

Seven protocol roles drive these signers (the orchestrator is the seventh; it produces worker-event markers but never lifecycle markers). The mapping the Team Lead uses:

- `team-lead` for `[goal-received]` and `[closure]`.
- `dispatcher` for `[routing]`, `[skip-context-gathering]`, and `[escalation]`.
- `researcher` for `[context-gathering]`.
- `builder` for `[action]` and `[api-ready]`.
- `runtime` for `[action]` when runtime produces.
- `verifier` for `[verdict]`.
- `archivist` for `[recorded]`, `[handoff]`, and `[worker-pruned]`.
- `orchestrator` for `[worker-terminal]` and `[worker-relay]`.
- Any role for `[andon]`.

The `.env` `EDEN_AGENT_ID=claude-code-cli` value is wrong but is **handled by the per-call `agentId` override**: the override replaces the env value when the recorder invokes `eden-memory remember`. Fixing `.env` to `EDEN_AGENT_ID=team-lead` is a separate documentation change and is not part of this plan.

## Dual-write pattern

When the recorder returns `{ok: false, skipped: true, error: "..."}` (missing LLM keys, eden-memory unreachable, binary missing), the Team Lead MUST:

1. **Capture the skip in the markdown audit log** with a `supersedes:` field linking back to the previous entry in the thread. The capture has the same shape as the marker that *would* have been written — marker name, signer role, goal id, summary — so the audit log is a complete shadow of the durable record when the env gate fires.
2. **Replay from the audit log** the next time the env is fixed. A future `tools/replay-skipped-records.mjs` script will scan `docs/research/**/README.md` and `docs/research/**/*.md` for `supersedes:` chains with no matching eden-memory record, and replay them in order. The replay script is a separate follow-up; **this plan does not write it**.
3. **Sign the audit-log entry by the role that should have signed the durable marker.** The audit log is an artefact; every entry is signed by the role that should have signed the durable marker, so the verifier can compare audit log vs eden-memory to detect drift.

The catch-all error code for a skip is whatever the recorder returns in `result.error`. Common cases:

- `Missing required eden-memory env fields: EDEN_LLM_API_KEY, EDEN_LLM_BASE_URL` — the developer is running without LLM-augmented semantic search. The Team Lead still writes the marker; only semantic search is disabled. The recorder returns `{ok: true, id: "..."}` and no skip is captured.
- `Missing required eden-memory env fields: EDEN_MEMORY_BIN, EDEN_MEMORY_DB, EDEN_WORKSPACE_ID, EDEN_USER_ID, EDEN_AGENT_ID` — the developer is running without eden-memory entirely. Every call returns `{ok: false, skipped: true}`. The Team Lead captures every call in the audit log.
- `spawn EACCES` — the binary exists but is not executable. The Team Lead captures the skip and surfaces a `[andon]` (signed by any role) with the path.

## Scope

### In scope (each new file or substantive edit produces one parallel marker)

- `docs/research/**/README.md` — research thread summaries.
- `docs/research/**/*.md` — individual research entries, prototypes, notes.
- `docs/plans/*.md` — plan files (this plan is one).
- `docs/bugs/*.md` — bug files.

A "substantive edit" is one that adds, removes, or rewrites more than one sentence. Typos, link fixes, and clarifying parentheticals do not require a marker. The Team Lead uses judgement; the marker table is the audit trail.

### Out of scope (no marker required)

- `docs/reference/**` — settled protocol facts, written rarely and reviewed separately.
- `docs/README.md` — the table of contents, written once and rarely edited.
- `*.test.ts` — test files; the tests assert on marker output, they don't produce markers.
- `dist/` — build output, regenerated from `src/`.
- `node_modules/` — dependencies.
- Code under `packages/*/src/` — source-code changes are routed through the Stream A/B/C pipeline, which already produces markers via the extension's `recordAction` calls.

## Test plan

Add one new test to `packages/pi-agents-team/tests/shell.test.ts`:

1. **Set a fake eden-memory bin** using the existing `makeFakeEdenBin()` / `setEdenEnv(bin)` helpers in `tests/shell.test.ts` (around lines 100–140). The fake binary writes its captured argv to a log file in JSON, so the test can assert on `--agent-id` and the marker name without depending on the live `~/.eden-memory/default.db`.
2. **Simulate the Team Lead writing a plan file and emitting the parallel `[action]` marker.** The simulation calls `recordAction` via the recorder's public API (the same surface the extension uses), passing the per-call `agentId: "builder"` override and the plan path in the content.
3. **Assert the captured argv includes the marker `[action]` and the agent-id `builder`.** The assertion checks that `--agent-id builder` appears adjacent to `--content ...` and that the marker name `[action]` appears in the content. This is the same shape as the existing `records eden-memory health, goal-receipt and blocked goals on session_start when enabled` test in `tests/shell.test.ts` (around line 700), which already asserts on `goal-receipt` markers carrying `--agent-id team-lead`.
4. **Re-use `findProjectAgentsDir` and `discoverAgents`** to confirm the six roles are still discoverable. This is a regression guard: if the marker table or `discoverAgents` drifts, the test fails loudly.

The test pattern is the one already used in `tests/memory/atp-recorder.test.ts`; copy the structure and the assertions. The new test goes in `describe("Path A thin extension shell", …)` near the other `recordAction`-related cases.

A second assertion worth adding in the same test: **the captured argv does NOT contain `--agent-id claude-code-cli`.** This catches the regression where the per-call override is dropped and the env default leaks through. Without this guard, the marker would be silently signed by the wrong role and the durable record would lie.

## Out of scope / follow-ups

- **Identity / passport / assertions subsystems.** Out of scope. These are separate protocol layers; the recorder is correct as-is.
- **The replay script (`tools/replay-skipped-records.mjs`).** A separate follow-up. It is not part of this plan; this plan only documents the dual-write pattern that the replay script will consume.
- **Fixing `.env` `EDEN_AGENT_ID=claude-code-cli`.** Handled by the per-call `agentId` override. Changing `.env` to `EDEN_AGENT_ID=team-lead` is a separate doc change.
- **Adding markers for `docs/reference/` or `docs/README.md`.** Not in scope; these folders are not part of the protocol surface.
- **Moving the discipline into a typed wrapper.** A future change could add `recordTeamLeadMarker(name, content, ctx)` that asserts `name` matches the `ctx.agentId` per the marker table. That is a code change, not documentation; out of scope here.

## Verification

How to verify the plan works:

- **Artefacts.** The plan file is `docs/plans/orchestrator-memory-discipline.md`. The dual-write pattern is documented in §Dual-write pattern. The role-to-marker mapping is in §Role-derived `agentId`, copied verbatim from `packages/pi-agents-team/src/src/memory/atp-markers.ts`.
- **Marker ids that should land.**
  - One `[action]` marker signed `agentId: "builder"` for writing this plan, with `goalId: "stream-c-discipline-plan-2026-08-23"` and `packageName: "pi-agents-team"`. The marker is recorded at hand-off.
  - No `[goal-received]` or `[routing]` marker — those are owned by Stage 1 and Stage 2 of the lifecycle, which the orchestrator runs in the parent session, not this stream.
- **Test names that should pass.** `tests/shell.test.ts` — a new test (proposed name: `"recordAction enforces per-call agentId and the [action] marker on doc writes"`) that sets a fake eden-memory bin, calls `recordAction` with `agentId: "builder"`, and asserts the captured argv contains `[action]` and `--agent-id builder`, and does NOT contain `--agent-id claude-code-cli`. The existing `records eden-memory health, goal-receipt and blocked goals on session_start when enabled` test should keep passing — it already exercises the same per-call `agentId` mechanism for `team-lead`.
- **No source files modified.** `git status` after writing this plan shows only `docs/plans/orchestrator-memory-discipline.md` as a new file. No `packages/*/src/**` changes, no `atp-markers.ts` changes, no `atp-recorder.ts` changes.

## Risk

The plan is documentation; the actual enforcement comes from the orchestrator discipline. If the Team Lead skips markers, the test in step 7 catches it for the **extension path** (the recorder being invoked from `delegate_task`'s `recordTerminalStageForProfile` chain) but not for arbitrary file writes by the Team Lead directly to `docs/research/`, `docs/plans/`, or `docs/bugs/`. The latter path is governed by the orchestrator's self-discipline, not by an automated test. A future iteration could add a pre-commit hook that scans in-scope folders and refuses to land a write without a parallel marker in the same commit; that is a separate follow-up.

Two minor risks worth flagging:

1. **The audit log drift.** If the env gate fires for an extended period, the markdown audit log will accumulate entries that the durable record does not have. The replay script is a follow-up; until it ships, the audit log is the only canonical record during gate outages.
2. **The role-to-marker mapping drift.** If `atp-markers.ts` adds a marker without this plan updating the mapping, the Team Lead will use the wrong `agentId` on the new marker. The fix is mechanical (copy the new row into the table in §Role-derived `agentId`), but it requires human attention every time the marker table changes.

## Sign-off

Stream C done. The plan documents the discipline, the role mapping, the dual-write pattern, the scope, the test, the verification, and the risk. The recorder is the protocol surface; the marker table is the schema; the plan is the discipline that connects them. The verifier may proceed.
