# Builder Fleet

A fleet for goals that produce durable artefacts but do not run against live systems: code, documents, schemas, configuration in version control, datasets.

## Roster

| Role | Profile name | Thinking | Owns stage |
|---|---|---|---|
| Team Lead | team-lead | high | Goal receipt; Hand-off or closure |
| Dispatcher | dispatcher | high | Routing and assignment |
| Researcher | researcher | high | Context gathering (when uncertainty is high) |
| Builder | builder | medium | Action (artefact production) |
| Verifier | verifier | high | Verification |
| Archivist | archivist | medium | Recording and archival |

## Use when

- New code, refactor, or feature
- Document, ADR, runbook, design doc
- Schema, contract, or configuration in version control
- Dataset, fixture, or test artefact

## Builder failure modes the paper names

- Locally correct but globally wrong
- Incomplete
- Drift out of sync with the documentation

The Builder self-validates; the Verifier independently re-runs validation where evidence allows. The Archivist must record both passes for future goals to reuse.
