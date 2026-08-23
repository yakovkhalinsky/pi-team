# Coordination Markers

The paper does not define a marker grammar. It says (§5.3 Observability): "we do not just record results; we record decisions" and implies that the durable record is the source of truth for cross-role hand-offs.

This document is the project's extension: a marker grammar that wraps the durable record so cross-role hand-offs are grep-able. Markers are machine-readable comments on the durable record; every marker is signed by the role that writes it.

## Marker rules

- Markers are written by exactly one role. The marker table names the role(s) accepted by the workflow.
- Markers are never invented ad hoc; if a hand-off needs a new shape, the new shape is a new entry in this document before any worker uses it.
- The Dispatcher refuses a marker whose claimed signer is not allowed.
- The Archivist enforces append-only — corrections are new entries with `supersedes:`, never edits.
- The canonical marker list lives in `packages/pi-agents-team/src/src/memory/atp-markers.ts` (`ATP_MARKERS`). This document is the human-readable description of that table. When the runtime table and this document disagree, the runtime table is correct and this document is out of date.

## Marker reference (project extension)

| Marker | Written by | Meaning |
|---|---|---|
| `[goal-received]` | team-lead | Stage 1 complete: goal captured, requester, constraints, package fit |
| `[routing]` | dispatcher | Stage 2 complete: classification, owner, priority, confidence |
| `[context-gathering]` | researcher | Stage 3 complete: findings landed, alternatives surfaced, sources cited |
| `[skip-context-gathering]` | dispatcher | Stage 3 skipped: uncertainty was low, owner consulted Archivist directly |
| `[action]` | builder \| runtime | Stage 4 complete: artefact produced or live-system change executed |
| `[api-ready]` | builder | Builder's contract is available for downstream consumers |
| `[verdict]` | verifier | Stage 5 complete: pass, fail, or block |
| `[recorded]` | archivist | Stage 6 complete: durable record updated, decisions logged, skills promoted where applicable |
| `[closure]` | team-lead | Stage 7: goal closed |
| `[handoff]` | archivist | Stage 7: ownership transferred to another role or package |
| `[andon]` | any role | Stop-the-line report: what failed, exact error, what was not done |
| `[escalation]` | dispatcher | Needs the human. Required: `question:`, `context:`, `options:`, `default-if-silent:` |

## Routing enforcement

The Dispatcher enforces marker routing: a marker whose claimed signer is not the role that wrote it is rejected. **No role approves its own work.** When a marker's only allowed role is the task's own implementer, an independent verifier substitutes. None available → `[andon]`.

## Evidence records

Every action in Stage 4 (Builder / Runtime) carries an evidence record:

```
Evidence:
  command:  <exact command>
  exit:     <code>
  counts:   <e.g. 47 passed, 0 failed, 2 skipped>
  baseline: <baseline commit, exit, counts>
  duration: <seconds>
  log:      <path to log>
NOT validated:
  <command> — <reason>
```

A claimed result without its evidence record is NOT validated.

## Supersession

Each marker carries a `round: N` field. `supersedes:` is included when round ≥ 2. The comment with the highest `round:` not named by a later `supersedes:` is current; everything else is history.

The Archivist enforces this — the durable record is append-only, and the history is a sequence of entries with `supersedes:` links, not a set of editable rows.

## Worktree context

When the harness runs parallel tasks in git worktrees, relevant markers include `worktreePath` in their metadata. The path is the worker's dedicated checkout directory; it lets the orchestrator route follow-up work to the same tree and lets the Archivist reconstruct which tree produced a given artefact. Worktree paths are recorded on `[routing]`, `[action]`, `[verdict]`, `[recorded]` worker events, and any `[handoff]` that transfers ownership of a live task.

## Worker-event markers

The runtime table also defines three orchestrator/archivist telemetry markers that are *not* lifecycle stages but are first-class records in the durable store:

- `[worker-terminal]` — written by the orchestrator when a worker reaches `completed` / `error` / `aborted`. Records under `stage: recording-and-archival` for grouping.
- `[worker-relay]` — written by the orchestrator when a worker raises a relay question.
- `[worker-pruned]` — written by the archivist when worker state is pruned (cost, memory, or session-end cleanup).

These markers exist so the durable record can reconstruct the full execution trace (which workers ran, when they finished, what they relayed, what was pruned) without depending on a separate telemetry channel. They are emitted with `workerEvent: true` in metadata so consumers can distinguish them from stage-completion markers at a glance.
