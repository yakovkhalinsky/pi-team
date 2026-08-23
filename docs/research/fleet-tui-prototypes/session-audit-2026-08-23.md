# Session audit log — 2026-08-23 — memory discipline + Fleet Dashboard prototype

**Goal:** `pi-team-session-2026-08-23`
**Scope:** Fix memory usage gaps in the orchestrator session; prototype the v1 Fleet Dashboard view against real worker data; document the orchestrator memory discipline.
**Owner:** team-lead
**Recording status:** Partial — see "Durable store status" below.
**Predecessor:** v1 prototype (`prototype-v1-2026-08-23.html`), BUG-006, BUG-004, `team-status-widget.md` plan.

## Durable store status

This session spans a real bug in the recorder (`buildIdentityArgs` prepended `--workspace-id` before the `remember` subcommand, which eden-memory v0.3.137 rejects). That bug was filed as the root cause of BUG-006's "memory: degraded" symptom and was fixed at commit `7e9060e`. As a result:

- **Pre-`7e9060e` markers did not land in eden-memory.** Every `[routing]`, `[action]`, `[verdict]`, `[recorded]`, `[closure]` write attempted by any session before the fix would have returned `{ok: false, error: "unknown command: --workspace-id"}`. The marker stream from earlier sessions is therefore sparse; this session's work is the first to actually land.
- **Markers from this session that DID land in eden-memory:**
  - `[action]` id `0ea82840-aa4e-46cf-82b9-37334fc76f31` — Stream A (recorder bug fix), builder, goal `stream-a-recorder-fix-2026-08-23`.
  - `[recorded]` id `3781128f-504f-41c5-b244-006cfd7cec7a` — Stream A landing record, archivist, goal `stream-a-recorder-fix-2026-08-23`.
  - `[action]` id `d0641b0e-1ad5-4e54-a315-985917316a75` — Stream B (Fleet Dashboard prototype v3), builder, goal `stream-b-prototype-v3-2026-08-23`.
  - `[action]` id `8530b8ae-70b3-4f3e-873d-b0f72483f06b` — Stream C (orchestrator-memory-discipline plan), builder, goal `stream-c-discipline-plan-2026-08-23`.
- **Markers captured in this audit log only (dual-write fallback):**
  - The early-session actions — the user's first ask ("settle the above-vs-below placement question"), the dispatch to the v2 builder, the v2 hand-off, the prototype v2 itself — are NOT represented in eden-memory because the recorder was broken at the time. They are captured here with `supersedes: none` (no prior entry exists).

## Dual-write fallback (per the orchestrator-memory-discipline plan §Dual-write pattern)

When the recorder returns `{ok: false, skipped: true}` or `{ok: false, error: "..."}` for a write that should have happened, the orchestrator MUST:

1. Capture the skip / failure in this audit log with a `supersedes: <previous-id-or-none>` field.
2. Continue the workflow; the durable entry will catch up when env is fixed.
3. Sign every entry with the role that should have signed the durable marker.

The replay script (`tools/replay-skipped-records.mjs`) is a documented follow-up; once written, it walks this audit log and re-submits each entry to eden-memory using the working recorder.

## Per-event audit entries

```
[goal-received] 2026-08-23T13:14Z team-lead
  goal: pi-team-session-2026-08-23
  content: User asked: fix memory usage gaps in the agentic team protocol and prototype the Fleet Dashboard UI update.
  supersedes: none
  durable-store: missing (recorder broken pre-7e9060e)
  replay: pending

[routing] 2026-08-23T13:18Z dispatcher
  goal: pi-team-session-2026-08-23
  content: Goal routed to builder for Stage 4 action: build prototype v2 (above-vs-below widget placement) per docs/research/fleet-tui-prototypes/README.md question #1.
  supersedes: none
  durable-store: missing (recorder broken pre-7e9060e)
  replay: pending

[action] 2026-08-23T13:25Z builder
  goal: pi-team-session-2026-08-23
  content: Prototype v2 built: prototype-v2-2026-08-23.html (26,612 B), tools/render-widget-prototype.mjs (10,324 B), tools/rendered.json (7,221 B). Recommendation: 'needs v3' — falsifies the worst-case belowEditor content concern but cannot confirm aboveEditor without a live TUI run.
  supersedes: none
  durable-store: missing (recorder broken pre-7e9060e)
  replay: pending

[action] 2026-08-23T13:54Z builder
  goal: stream-a-recorder-fix-2026-08-23
  content: Stream A landed at commit 7e9060e: eden-memory recorder bug fix. buildIdentityArgsForRemember strips --workspace-id before remember/document subcommands. Regression tests added. 118/118 tests pass.
  supersedes: none
  durable-store: PRESENT (id 0ea82840-aa4e-46cf-82b9-37334fc76f31)

[recorded] 2026-08-23T13:51Z archivist
  goal: stream-a-recorder-fix-2026-08-23
  content: Stream A landing record. Marker 0ea82840-aa4e-46cf-82b9-37334fc76f31 recorded.
  supersedes: none
  durable-store: PRESENT (id 3781128f-504f-41c5-b244-006cfd7cec7a)

[action] 2026-08-23T14:00Z builder
  goal: stream-b-prototype-v3-2026-08-23
  content: Stream B landed: prototype v3 (Fleet Dashboard UI). prototype-v3-2026-08-23.html (41,601 B), tools/render-fleet-dashboard-prototype.mjs (17,848 B), tools/fleet-dashboard.json (19,455 B). 3 snapshots × 3 widths = 9 entries. Honest about stubbed columns. Recommendation: 'needs v4' — missing data plumbing must land before the Fleet Dashboard view ships.
  supersedes: none
  durable-store: PRESENT (id d0641b0e-1ad5-4e54-a315-985917316a75)

[action] 2026-08-23T14:09Z builder
  goal: stream-c-discipline-plan-2026-08-23
  content: Stream C landed: docs/plans/orchestrator-memory-discipline.md (209 lines). Documents the discipline rules, role-derived agentId mapping, dual-write pattern, scope, test plan.
  supersedes: none
  durable-store: PRESENT (id 8530b8ae-70b3-4f3e-873d-b0f72483f06b)

[recorded] 2026-08-23T14:18Z archivist
  goal: pi-team-session-2026-08-23
  content: Session audit log written at docs/research/fleet-tui-prototypes/session-audit-2026-08-23.md. Five early-session events missing durable-store entries listed as replay candidates.
  supersedes: none
  durable-store: PRESENT (id fd1e85cd-fc45-4d35-b89a-9a9a1d2d02b8)
```

## Pending markers (replay candidates)

The following events from this session do NOT have durable-store entries and would be replayed by `tools/replay-skipped-records.mjs` once it lands:

| Marker | Goal | Signer | Content |
|---|---|---|---|
| `[goal-received]` | `pi-team-session-2026-08-23` | team-lead | User asked: fix memory usage gaps + Fleet Dashboard prototype |
| `[routing]` | `pi-team-session-2026-08-23` | dispatcher | Goal routed to builder for v2 (placement prototype) |
| `[action]` | `pi-team-session-2026-08-23` | builder | Prototype v2 built (placement question, needs v3) |
| `[verdict]` | `pi-team-session-2026-08-23` | verifier | Verifier acceptance of v2 (pending) |
| `[closure]` | `pi-team-session-2026-08-23` | team-lead | Session closure (pending Verifier verdict on Stream B + C) |

The replay script (out of scope for this session) would:

1. Walk this audit log.
2. For each row where `durable-store: missing`, call the corresponding `record*` function with the same `goalId`, `agentId`, and content.
3. Update the row to `durable-store: PRESENT (id <new-id>)`.
4. Replace the audit log with the updated one, preserving `supersedes:` discipline.

## Supersedes discipline

Each entry carries a `supersedes:` field. Today every entry is `supersedes: none` because no prior session recorded against this goal. If a future edit revises an entry (e.g. a new `[verdict]` supersedes an old one), the new entry sets `supersedes: <old-id>` and the old entry gets a `superseded-by: <new-id>` field added on the next audit-log write. The audit log is append-only with corrections; entries are never deleted.

## Sign-off

This audit log was authored by `team-lead` retroactively after the recorder was fixed (commit `7e9060e`). The retroactive entries are NOT fabrications — they are reconstructed from the session transcript and the artefacts on disk, with `supersedes: none` because no prior durable entry exists. The dual-write pattern in `docs/plans/orchestrator-memory-discipline.md` §Dual-write pattern documents this fallback.

The closure marker for goal `pi-team-session-2026-08-23` will be recorded once the Verifier accepts Streams B and C. That marker ID will be added here.
