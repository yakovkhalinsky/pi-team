# Task Lifecycle

The seven stages a goal passes through from intake to delivery, per [A Protocol for Role-Based Agent Teams](https://yakov.khalinsky.com/agentic-team-protocol/papers/01-protocol/) §4.

## Stage 1 — Goal receipt

**Owner:** Team Lead (orchestrator)

A goal arrives — from the human, from a queued ticket, or from a portfolio scan.

### Entry criteria
- A goal statement exists (even if vague)
- The goal is associated with a feature or package

### Activities
- Team Lead acknowledges the goal
- Team Lead captures the requester, constraints, scope, and package fit

### Exit criteria
- Goal recorded in the durable record as Stage 1 complete

---

## Stage 2 — Routing and assignment

**Owner:** Dispatcher

The Dispatcher classifies the goal, assigns an owner, and records confidence.

### Entry criteria
- Goal exists in the durable record
- Team Lead has signed off on Stage 1

### Activities
- Dispatcher classifies the goal against the six paper roles
- Dispatcher assigns ownership to one role (or sequences multiple roles)
- Dispatcher records confidence and priority

### Exit criteria
- Owner recorded in the durable record
- Confidence recorded (low confidence → escalate before proceeding)

---

## Stage 3 — Context gathering

**Owner:** Researcher (when uncertainty is high); otherwise the goal owner consults the Archivist directly

The paper: "the Researcher leads when uncertainty is high; otherwise the owner consults the Archivist." This is the only optional stage.

### Entry criteria
- Goal routed (Stage 2 complete)
- Uncertainty assessment: is the goal clear enough to act on?

### Activities
- Researcher gathers sources, alternatives, and trade-offs (when uncertainty is high)
- Otherwise the Builder / Runtime pull prior context from the Archivist's record

### Exit criteria
- Findings landed in the durable record (paper: "research never lands" is a Researcher failure mode)
- At least one alternative considered with trade-offs (paper: "a single-option report is confirmation bias")

---

## Stage 4 — Action

**Owner:** Builder (artefact production) or Runtime (live-system execution)

The Builder, Runtime, or specialist executes the plan and records what was done.

### Entry criteria
- Stage 2 routing complete
- Stage 3 complete (or skipped when uncertainty is low)

### Activities
- Builder produces the artefact; or Runtime executes the live-system change
- Both record evidence per command (paper: Builder self-validates; Runtime observes post-state)
- The Builder / Runtime does NOT approve its own work

### Exit criteria
- Artefact or post-state ready for verification
- Evidence record complete
- Hand-off to the Verifier

---

## Stage 5 — Verification

**Owner:** Verifier

The Verifier defines a green gate, gathers evidence, and posts a verdict.

### Entry criteria
- Builder hand-off or Runtime post-state ready
- Evidence record available

### Activities
- Verifier defines the green gate before inspecting (paper: "a verifier who always passes is not a verifier")
- Verifier inspects the artefact or post-state independently
- Verifier checks cross-role interactions (paper: "checks pass locally but fail end-to-end")
- Verifier posts a verdict: pass, fail, or block

### Exit criteria
- Verdict recorded in the durable record
- On fail: goal returns to Stage 4 for a fresh attempt
- On block: goal returns to Stage 2 for re-routing

---

## Stage 6 — Recording and archival

**Owner:** Archivist

The Archivist ensures durable records, decision trails, and updated skills.

### Entry criteria
- Verifier verdict lands

### Activities
- Archivist appends the verdict, the Builder's hand-off, the Runtime's observation, and the Dispatcher's routing decision
- Archivist records decisions, not just outcomes (paper §5.3: "we do not just record results; we record decisions")
- Archivist surfaces recurring lessons as skills (paper: "skills can become stale" — promote them deliberately)

### Exit criteria
- All stage entries recorded
- Cross-links created for future goals to find prior work
- Skills promoted where recurring patterns appear

---

## Stage 7 — Hand-off or closure

**Owner:** Archivist records the transfer; Team Lead closes or transfers

The goal closes, or ownership is transferred explicitly to another role or package.

### Entry criteria
- Archivist has recorded every stage entry (Stage 6 complete)

### Activities
- Team Lead either closes the goal or transfers ownership to another package / role
- Archivist records the transfer as a new entry (never edits the prior record)

### Exit criteria
- Outcome recorded: closed or transferred
- All seven stages have an entry in the durable record

---

## Blocked — the human-held state

The paper does not enumerate a Blocked state explicitly, but the governance annex §8 implies it: when an action requires human approval (the protected tier: production instances, secrets, IAM, force-push), the goal sits until the human acts.

Only a human can move a goal past a Blocked hold. After human return:
1. Team Lead re-runs Stage 2 with the human's input as new routing context
2. Stages 3-6 re-execute as needed
3. Archivist records the human decision as a Stage 6 entry

---

## Anti-pattern reminder

The paper: "Skipping a stage is an anti-pattern. The most expensive mistakes we have made came from treating context gathering or verification as optional." The only exception is Stage 3 (Context gathering), which the paper says is optional when uncertainty is low.
