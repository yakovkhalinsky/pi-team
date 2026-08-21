# Task Lifecycle

The seven stages a goal passes through from intake to delivery.

## Stage 1: Intake

**Owner:** Team Lead (with Product Manager)

A goal arrives — from the human, from a queued ticket, or from a portfolio scan.

### Entry criteria
- A goal statement exists (even if vague)
- The goal is associated with a feature or task in the tracker

### Activities
- Team Lead acknowledges the goal
- Product Manager (if rostered) triages scope
- Team Lead selects or confirms the team preset

### Exit criteria
- Goal is recorded as a `[feature]` in the tracker
- Team preset is confirmed

### Markers
- `[feature]` created with initial description

---

## Stage 2: Triage

**Owner:** Product Manager → Team Lead

### Entry criteria
- Feature exists in tracker
- Team preset confirmed

### Activities
- Product Manager defines acceptance criteria
- Product Manager identifies dependencies and risks
- Team Lead confirms resource availability
- Tasks are created with explicit scope and dependencies

### Exit criteria
- Acceptance criteria are measurable
- Tasks are created with dependencies, declared files, and resources
- NOT-in-scope is explicitly stated

### Markers
- `[product-approval]` or `[product-pushback]` from PM
- Tasks in `[Planned]` status

---

## Stage 3: Planning

**Owner:** Principal Architect (with Sceptical Architect)

### Entry criteria
- Tasks in `[Planned]` status
- Acceptance criteria defined
- Product approval obtained (or pushback resolved)

### Activities
- Principal Architect reviews task list and dependencies
- Sceptical Architect independently challenges the plan
- Contract registry is populated during planning
- Baseline manifest is recorded (test counts, known failures, validation commands)

### Exit criteria
- Both architects agree on execution order
- Contract registry has entries for all cross-task names
- BASELINE.md is committed

### Markers
- Architecture checklist created
- Contract registry entries
- BASELINE.md

---

## Stage 4: Design Gate

**Owner:** Implementer → Principal Architect → Sceptical Architect

### Entry criteria
- Task in `[Planned]` status
- Architecture checklist available
- Contract registry populated

### Activities
- Implementer submits `[design-note]` (approach, API/contract changes, data-model changes, affected components)
- Principal Architect reviews and either `[design-approved]` (with numbered checklist) or `[design-pushback]`
- Sceptical Architect independently reviews and either `[sceptical-design-approved]` or `[sceptical-design-pushback]`
- Both approvals required before any code

### Exit criteria
- `[design-approved]` from Principal Architect
- `[sceptical-design-approved]` from Sceptical Architect
- Any binding conditions are recorded

### Markers
- `[design-note]` → `[design-approved]` / `[design-pushback]`
- `[sceptical-design-approved]` / `[sceptical-design-pushback]`

---

## Stage 5: Implementation

**Owner:** Implementer (Backend / Frontend)

### Entry criteria
- Both design approvals present
- Task moved to `[Active]`
- Task packet created (complete tracker comment history)
- Isolated worktree provisioned

### Activities
- Implementer works in isolated worktree on task branch
- Checkpoint commits on task branch only
- `[divergence]` notes for anything done differently from design
- Self-validation against BASELINE.md
- Contract registry updated for any new exports

### Exit criteria
- All validation commands pass (bar = no new failures vs BASELINE.md)
- Evidence records recorded per validation command
- Clean task-branch checkpoint commit
- `[review-request]` submitted with changed files, evidence, and `NOT validated:` section

### Markers
- `[divergence]` (additive, as needed)
- `[api-ready]` (backend, when contract available for frontend)
- `[review-request]` (moves task to `[Review]`)

---

## Stage 6: Review

**Owner:** Three core reviewers (independent, parallel) + declared supporting gates

### Entry criteria
- Task in `[Review]` status
- `[review-request]` with evidence records
- Exact review package generated (binding manifest)

### Activities
Three mandatory core reviews start from the same exact package, run independently:

1. **Team Lead** — specification/quality checklist, acceptance criteria, maintainability, tests, operational readiness, CI evidence
2. **Principal Architect** — conformance to approved design, boundary violations, coupling, contract drift
3. **Sceptical Architect** — blind-first provisional assessment, then challenges assumptions, complexity, failure modes, reversibility

Optional supporting gates (when declared):
- **Security Reviewer** — threat assessment, data/authority tracing, abuse paths, adversarial verification, residual risk
- **QA** — test coverage, regression validation, real-path tests, negative controls

### Evidence and re-execution

| Role | Suites | Condition |
|---|---|---|
| Implementer | runs; records evidence | always |
| Principal Architect | inspect + spot-check | only while evidence commit == branch HEAD |
| Sceptical Architect | inspect + targeted checks | independently selected from risks |
| Team Lead | inspect + re-run quality evidence | exact acceptance/CI coverage |
| Security Reviewer | targeted adversarial checks | independently selected from threat model |
| Integrator | **always re-runs** | unconditional |

Any mismatch between evidence record and re-run = automatic `[review-findings]` labelled `trust-breach (severity: critical)`.

### Exit criteria — approval path
- `[team-lead-approval]` with exact file list
- `[architecture-approval]` with exact file list
- `[sceptical-architecture-approval]` with exact file list
- Every declared supporting approval (security, QA) with exact file lists
- All approvals bind the same review package SHA-256

### Exit criteria — findings path
- `[review-findings]` with numbered problems
- Task returns to `[Planned]` for a fresh attempt
- Fresh `[review-request]` required after rework

### Markers
- `[review-findings]` → back to Planned
- `[team-lead-approval]` / `[architecture-approval]` / `[sceptical-architecture-approval]`
- `[security-approval]` / `[review-approval]` (supporting)

---

## Stage 7: Delivery

**Owner:** Integrator → Team Lead

### Entry criteria
- All core and declared-gate approvals present
- All approvals bind the same review package
- Approved file lists match the review package

### Activities
- Integrator verifies all approvals, authorised distinct signers, identical file lists
- Integrator runs `integrate-task` — merge with `--no-commit`, validate, commit, record transaction
- Integrator re-runs all validation unconditionally
- Conflicts abort before commit
- Terminal task status move after verified integration
- Principal Architect runs divergence sweep (sequential: post-integration; parallel: already ran at Review entry)

### Exit criteria
- Integration transaction says `completed`
- Task in `[Ready to deploy]`
- All tasks terminal → notify Team Lead and Principal Architect
- Feature resolution requires Lead's completion checklist

### Markers
- Integration commit on feature branch
- Task moved to `[Ready to deploy]`
- `[progress]` upserted mechanically
- `[digest]` upserted per feature

---

## Blocked — the human-held state

At any point, observing `[Blocked]` interrupts only that task's lane:
- Stop its workers
- Revoke its publication capabilities
- Reject its outbox and integration activity
- All independent lanes continue

Only a human can move a task out of `[Blocked]`. After human return:
1. Team Lead publishes `[resume-review]` (unchanged, requirements-changed, or needs-human)
2. If requirements changed: `[resume-plan]` + both architect design approvals
3. Clean worktree required
4. Fresh numbered attempt from new packet

---

## Escalation

When the recovery ladder is exhausted or a scope/business question arises:

```
[escalation]
question: <one sentence>
context: <≤ 4 lines>
options:
  - <option 1> — <one-line consequence>
  - <option 2> — <one-line consequence>
default-if-silent: <action> after <duration>
```

Also appended to `ESCALATIONS.md`. An `[escalation]` without options + default is a protocol error (`[andon]`).