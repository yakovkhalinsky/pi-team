# Verification Fleet

A fleet for goals that need an independent acceptance gate without producing new artefacts or running against live systems. Useful for review of work already produced, regression sweeps, and audit.

## Roster

| Role | Profile name | Thinking | Owns stage |
|---|---|---|---|
| Team Lead | team-lead | high | Goal receipt; Hand-off or closure |
| Dispatcher | dispatcher | high | Routing and assignment |
| Researcher | researcher | high | Context gathering (gate criteria, prior incidents) |
| Verifier | verifier | high | Verification |
| Archivist | archivist | medium | Recording and archival |

## Use when

- Independent review of an existing artefact
- Regression sweep against a baseline
- Audit replay ("re-running the chain with fresh eyes")
- Verifiability-gap closure (the paper names "Verifiability gap" as an anti-pattern: a Verifier who exists on paper but cannot inspect)

## Anti-pattern reminder

"Checks pass locally but fail end-to-end" — the Verifier must check cross-role interactions, not just the artefact in front of them. A regression suite that runs in isolation does not catch a contract break between two roles.
