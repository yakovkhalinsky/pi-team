# Research-Driven Fleet

A full fleet for goals where Stage 3 (Context gathering) runs first and Stage 4 (Action) waits on research findings. Use when uncertainty is high before any decision lands.

## Roster

| Role | Profile name | Thinking | Owns stage |
|---|---|---|---|
| Team Lead | team-lead | high | Goal receipt; Hand-off or closure |
| Dispatcher | dispatcher | high | Routing and assignment |
| Researcher | researcher | high | Context gathering (mandatory) |
| Builder | builder | medium | Action (artefact production) |
| Verifier | verifier | high | Verification |
| Archivist | archivist | medium | Recording and archival |

## Use when

- New domain, new dependency, new failure mode
- Decisions made without options or trade-offs ("Skipped Researcher" is the paper's named anti-pattern)
- Migration planning, architecture review, design studies

## Lifecycle path

```
1. Goal receipt        (Team Lead)
2. Routing            (Dispatcher → Researcher)
3. Context gathering  (Researcher — mandatory)
4. Action             (Builder consumes research findings)
5. Verification       (Verifier checks against research)
6. Recording          (Archivist indexes research + artefact)
7. Closure            (Team Lead)
```

The Runtime is omitted: research-driven work produces artefacts, not live-system changes.
