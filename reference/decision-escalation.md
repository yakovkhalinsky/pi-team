# Decision and Escalation

Decision rights and escalation paths for the agentic team.

## Decision rights matrix

| Decision | Authority | Condition |
|---|---|---|
| Create feature / tasks | Team Lead | After product approval |
| Approve scope / acceptance | Product Manager | Always |
| Push back on scope | Product Manager | Always |
| Open / close design gate | Principal Architect | Always |
| Challenge design independently | Sceptical Architect | Always, blind-first |
| Approve architecture | Principal Architect | On exact review package |
| Approve sceptical architecture | Sceptical Architect | On exact review package, blind-first |
| Approve security | Security Reviewer | When security gate declared |
| Approve quality / spec | Team Lead | On exact review package |
| Approve QA | QA Engineer | When QA gate declared |
| Return task for rework | Any reviewer | On findings |
| Move task to Active | Dispatcher | After design approval + claim |
| Move task to Review | Implementer | After self-validation + review-request |
| Move task to Ready to deploy | Integrator | After all approvals + verified merge |
| Move task to Blocked | Team Lead / automation | When stuck or human needed |
| Move task out of Blocked | **Human only** | Always — no automation |
| Reassign task | Team Lead | After handoff comment |
| Kill & relaunch worker | Team Lead | Recovery ladder rung 4 |
| Merge to feature branch | Integrator | **Only role** — after all approvals |
| Deploy to production | Release executor | After CI + policy + approval |
| Escalate to human | Team Lead | After recovery ladder exhausted |

## Three-tier authority model

Every action resolves to exactly one tier:

### DENY — nobody inside the team can authorise
- Path escape or recursive deletion outside task scope
- Database/schema drops or truncation
- Production instance, cluster, storage, network, DNS, certificate, key, backup, or log deletion
- Secret extraction
- Privilege escalation
- Wildcard IAM
- Force-push or history rewrite
- Policy or sandbox bypasses

### REQUIRE HUMAN APPROVAL — protected verifier must authorise exact manifest
- Non-destructive production infrastructure changes
- IAM, network, DNS, certificate, capacity, schema, backfill, traffic, cost, or scale changes
- External communication
- Accepting Critical risk (when lead is mapped to an architect)

### ALLOW WITHIN SCOPE — assigned role within boundaries
- Read-only inspection, plans, tests, builds, linting
- Worktree-local edits
- Task-branch checkpoint commits
- Brokered integration
- Health checks
- Policy-clean immutable-artifact release

## Escalation protocol

### When to escalate

1. **Scope or business-rule questions** — when the team cannot resolve a product decision
2. **Destructive actions** — when a proposed action touches the DENY tier
3. **After ESCALATE_AFTER_ATTEMPTS failed recovery rungs** — when the recovery ladder is exhausted
4. **Critical architecture risk** — when accepting the risk requires human authority
5. **Missing capabilities** — when a protocol step cannot be performed due to missing tools/access

### Escalation format

```
[escalation]
question: <one sentence>
context: <≤ 4 lines>
options:
  - <option 1> — <one-line consequence>
  - <option 2> — <one-line consequence>
default-if-silent: <action> after <duration>
```

Also appended to `ESCALATIONS.md`.

### Rules

- An `[escalation]` without options + default is a protocol error — emit `[andon]` instead
- Silence never approves — the `default-if-silent` is a safety net, not consent
- Independent work continues while the human decides
- The escalation channel is the **only** way to reach the human during autonomous operation

## Andon cord

### When to pull it

- A task is in an unexpected status
- An adapter operation fails
- Validation fails
- You are blocked or see contradictory instructions
- An escalation lacks options + default

### What to do

1. Stop the affected action or task
2. Write an `[andon]` comment: what failed, exact error, what you did NOT do
3. Notify the Team Lead
4. Continue independent work unless the failure invalidates shared authority

### What NOT to do

- Never work around a failure
- Never fabricate a result
- Never claim a status you did not verify
- Never silently skip a protocol step

## Recovery ladder

For non-Blocked work, in order, one rung at a time:

### Rung 1: Message
Send the worker a concrete instruction via `agent_message` or mailbox.

### Rung 2: Decide
Make a binding process decision. Architecture disputes go to both architects. If the lead is mapped to either architect, or Critical risk would be accepted, escalate to human.

### Rung 3: Reassign
Write a `[handoff]` comment summarising state. Move the task back to `[Planned]`, clear the assignee, and relaunch a fresh agent.

### Rung 4: Kill & Relaunch
Quarantine the dead instance's working copy. Relaunch a fresh agent that resumes from tracker state alone.

### Rung 5: Escalate
Write an `[escalation]` comment + append to `ESCALATIONS.md`. Reserved for scope/business questions, destructive actions, or after `ESCALATE_AFTER_ATTEMPTS` failed rungs.

**Never** apply this ladder to bypass a `[Blocked]` hold.