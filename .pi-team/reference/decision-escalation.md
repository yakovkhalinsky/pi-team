# Decision and Escalation

The paper does not enumerate an escalation format — it says (§5.4 Fallback): "The Dispatcher escalates to a human when confidence is low." This document is the project extension that gives the escalation a structured shape so the durable record can carry it.

## When to escalate

The Dispatcher routes to a human escalation when:

1. **Scope or business-rule questions** — when the team cannot resolve a product decision
2. **Destructive actions** — when a proposed action touches the protected tier (production instances, secrets, IAM, certificates, DNS, backups, logs, force-push)
3. **Missing capabilities** — when a protocol step cannot be performed due to missing tools or access
4. **Researcher information gap** — when the Researcher declares the question cannot be answered from available sources

## Escalation format

```
[escalation]
question: <one sentence>
context:  <≤ 4 lines>
options:
  - <option 1> — <one-line consequence>
  - <option 2> — <one-line consequence>
default-if-silent: <action> after <duration>
```

## Rules

- An `[escalation]` without options + default is a protocol error — emit `[andon]` instead.
- Silence never approves — the `default-if-silent` is a safety net, not consent.
- The escalation channel is the only way to reach the human during autonomous operation.
- Independent work continues while the human decides.

## Protected tier (paper §8 governance implication)

The following are protected-tier actions; the Dispatcher refuses to route them without explicit human approval:

- Production instance, cluster, storage, network, DNS, certificate, key, backup, or log deletion or modification
- Secret extraction
- Privilege escalation, wildcard IAM
- Force-push or history rewrite
- Database / schema drops or truncation
- Policy or sandbox bypasses

## Three-tier authority model

Every action resolves to one tier. This is the project's elaboration of the paper's "Fallback behaviour must be explicit, not emergent" (§5.4).

### DENY — no team member authorises
- Path escape or recursive deletion outside task scope
- The protected-tier actions above

### REQUIRE HUMAN APPROVAL — Dispatcher escalates, human signs
- Non-destructive production changes (capacity, traffic, scale, cost)
- External communication
- Any goal where the Dispatcher's recorded confidence is below the project threshold

### ALLOW WITHIN SCOPE — assigned role inside its boundaries
- Read-only inspection, plans, tests, builds, linting
- Worktree-local edits
- Task-branch checkpoint commits
- Health checks
- Durable record appends (Archivist)

## Recovery ladder

The paper does not enumerate a recovery ladder. This is the project's elaboration, modelled on the cross-cutting concern of fallback (§5.4). For non-Blocked work, in order, one rung at a time:

1. **Message** — concrete instruction to the worker via `agent_message`
2. **Decide** — binding process decision; the Dispatcher may re-route
3. **Reassign** — Dispatcher records the handoff, Archivist appends the transfer entry
4. **Kill & relaunch** — quarantine the dead instance's working copy, respawn
5. **Escalate** — `[escalation]` with `question:`, `context:`, `options:`, `default-if-silent:`

Never apply this ladder to bypass a Blocked hold.

## Andon cord

Pull it — stop the affected action, write `[andon]`, notify the orchestrator — when:

- A goal is in an unexpected stage
- An operation fails
- Validation fails
- An escalation lacks options + default

Never work around a failure. Never fabricate a result. Never claim a status you did not verify. Never silently skip a protocol step.
