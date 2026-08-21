# Runtime Fleet

A fleet for goals that change live systems: deploy, migrate, scale, restart, configure. The paper names "Runtime without rollback" as one of the seven anti-patterns, so the Archivist must record the rollback plan before any execution.

## Roster

| Role | Profile name | Thinking | Owns stage |
|---|---|---|---|
| Team Lead | team-lead | high | Goal receipt; Hand-off or closure |
| Dispatcher | dispatcher | high | Routing and assignment |
| Researcher | researcher | high | Context gathering (when uncertainty is high) |
| Builder | builder | medium | Action (artefact production — the change to apply) |
| Runtime | runtime | high | Action (live-system execution) |
| Verifier | verifier | high | Verification (post-state) |
| Archivist | archivist | medium | Recording and archival |

## Use when

- Deploying a release
- Migrating data or schema
- Scaling, capacity, or configuration changes
- Any change to the protected tier (production instances, secrets, IAM, certificates, DNS, backups, logs)

## Safety rules from the paper

- The Runtime must hold a tested rollback plan. "A rollback you have never exercised is hope, not a plan."
- The Runtime cannot modify the protected tier without explicit human approval.
- The Verifier gates acceptance on the Runtime's observed post-state, not on the Runtime's intent.
- The Archivist must record the rollback plan, the execution, and the post-state as separate entries.
