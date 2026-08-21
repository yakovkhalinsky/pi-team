# Structured Coordination Markers

All coordination artefacts are comments on the task, written through the adapter, beginning with an exact marker. Markers are the machine-readable protocol — never invent new ones, never misspell them.

## Marker reference

| Marker | Written by | Meaning / required content |
|---|---|---|
| `[design-note]` | implementer | Proposed approach before any code: approach, API/contract changes, data-model changes, affected components. Registers exports in CONTRACTS.md. |
| `[design-approved]` | principal-architect | Gate open. Carries a numbered architecture checklist plus any binding conditions. |
| `[design-pushback]` | principal-architect | Gate closed. Lists required changes. |
| `[sceptical-design-approved]` | sceptical-architect | Independent design challenge cleared. Lists tested assumptions, evidence, binding risk controls. |
| `[sceptical-design-pushback]` | sceptical-architect | Independent gate closed. Lists material assumptions, impact, evidence gap, severity, feasible resolution. |
| `[dependency-hold]` | team-lead | Dependency-impact verdict for a queued or in-flight direct dependent. Verdict: `blocked`, `partially-actionable`, or `independent`. |
| `[resume-review]` | team-lead | Human-resume communication verdict: `unchanged`, `requirements-changed`, or `needs-human`. |
| `[resume-plan]` | team-lead | Revised implementation plan after a `requirements-changed` resume verdict. |
| `[api-ready]` | backend | Contract available for frontend: endpoints, request/response shapes. |
| `[divergence]` | implementer | What was done differently from the task/design note and why. Additive — never edit the original task description. |
| `[review-request]` | implementer | Ready for review: what changed, changed files, evidence record per validation command, baseline comparison, `NOT validated:` section. |
| `[review-findings]` | reviewer / qa / team-lead / architects / security | Numbered problems that must be fixed. Task goes back to Planned. |
| `[review-approval]` | reviewer / qa | Optional supporting approval with explicit list of approved file paths. |
| `[team-lead-approval]` | team-lead | Mandatory independent specification, quality, test, and operability sign-off with exact files. |
| `[architecture-approval]` | principal-architect | Architecture review sign-off with exact file-list and review-package binding. |
| `[sceptical-architecture-approval]` | sceptical-architect | Independent architecture challenge cleared, with exact file-list and review-package binding. |
| `[security-approval]` | security-reviewer | Independent security sign-off: threat surfaces, focused verification, residual risk, exact files. |
| `[product-approval]` | product owner | Scope/acceptance sign-off: scope ruling, acceptance-criteria verdict, conditions. |
| `[product-pushback]` | product owner | Scope gate closed: what must change before work proceeds. |
| `[handoff]` | team-lead | Reassignment: summary of state so a fresh agent can resume. |
| `[progress]` | dispatcher | One per task, upserted mechanically: stage, actor, attempt, updated-at, one-line summary. |
| `[digest]` | dispatcher | One per feature, upserted mechanically: one line per task with status and execution stage. |
| `[andon]` | any role | Stop-the-line report: what failed, exact error, what you did NOT do. |
| `[escalation]` | team-lead | Needs the human. Required: `question:`, `context:`, `options:` (≥ 2), `default-if-silent:`. Also appended to ESCALATIONS.md. |

## Budget and supersession

An agent-authored gate-marker comment is ≤ 25 lines. Full checklists, logs, and long rationale live in the workspace `artifacts/` directory and are cited by path.

Each marker carries a `round: N` field. `supersedes:` is included when round ≥ 2. The comment with the highest `round:` not named by a later `supersedes:` is current; everything else is history.

## Routing enforcement

Marker routing is enforced — the marker table names the role(s) accepted by the workflow. The integrator refuses a marker whose claimed signer is not allowed.

**No role approves its own work.** When a marker's only allowed role is the task's own implementer, an independent verifier substitutes. None available → `[andon]`.

## Evidence records

Every validated command in a `[review-request]` carries an evidence record:

```
Evidence:
  commit:   <sha of working copy HEAD when command ran>
  command:  <exact command>
  env:      <non-secret variable names required; values omitted>
  exit:     <code>
  counts:   <e.g. 47 passed, 0 failed, 2 skipped>
  baseline: <same command's baseline commit, exit, and counts; cite BASELINE.md>
  duration: <seconds>
  log:      <path to log file>
NOT validated:
  <command> — <reason>
```

A claimed result without its evidence record **is** NOT validated.

## Contract registry

`CONTRACTS.md` is an append-only registry:
- Every `[design-note]` registers what it exports — schema/field names, event constants, endpoint paths, enum values
- Every plan that consumes a sibling's export cites the registry line
- Two tasks spelling the same concept differently is a `[design-pushback]` on the later one
- Renames are new lines that supersede old ones — never edits

## Baseline manifest

`BASELINE.md` records at feature-branch creation:
- Current test counts
- Known failures with their cause
- Validation commands that exist right now

The bar is "no new failures", not "all green". Nobody gets blamed for red that predates the branch.

## Status flow

```
[Planned] → [Active] → [Review] → [Ready to deploy]
                ↑           │
                └─ findings ┘

[Blocked] (human-held — no automated exit)
```

Feature flow:
```
[Planned] → [Active] → [Resolved] (→ [Live] with production delivery)
```