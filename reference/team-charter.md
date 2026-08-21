# Team Charter

Charter template and ratification rules for an agentic team.

## Purpose

A team charter is the founding document that binds a team of agents to a shared operating contract. It is ratified before work begins and is the reference point when something goes wrong.

## Charter template

```markdown
# Team Charter: [Team Name]

## Feature
[Feature ID and one-line description]

## Team preset
[preset-name: full-stack | deep-backend | deep-frontend | deep-security | deep-infra | deep-llm]

## Roster

| Role | Specialised name | Protocol mapping | Model profile |
|---|---|---|---|
| Team Lead | [name] | team-lead | [pi profile] |
| Principal Architect | [name] | principal-architect | [pi profile] |
| Sceptical Architect | [name] | sceptical-architect | [pi profile] |
| [additional roles...] | | | |

## Scope

### In scope
- [item 1]
- [item 2]

### NOT in scope
- [item 1]
- [item 2]

## Acceptance criteria
- [ ] [criterion 1 — measurable]
- [ ] [criterion 2 — measurable]

## Execution mode
- [ ] Sequential (default)
- [ ] Parallel (MAX_ACTIVE_IMPLEMENTERS: [N])

## Review gates
- [ ] Core: Team Lead + Principal Architect + Sceptical Architect (always)
- [ ] Security (required for: [tasks])
- [ ] QA (required for: [tasks])

## Validation commands
- VALIDATE_BUILD: [command or null]
- VALIDATE_TEST: [command or null]
- VALIDATE_LINT: [command or null]
- VALIDATE_FORMAT: [command or null]
- VALIDATE_SCRIPT: [command or null]

## Baseline
- Test count: [N passed, N failed, N skipped]
- Known failures: [list with cause]
- Baseline commit: [SHA]

## Communication
- Tracker: [Markdown | Linear | Jira | GitHub Issues]
- Write mode: [broker | all]
- Stuck threshold: [15] minutes
- Escalate after: [2] failed recovery rungs

## Ratification
- [ ] Product Manager approved scope
- [ ] Principal Architect approved plan
- [ ] Sceptical Architect challenged and cleared
- [ ] Team Lead confirmed resources and preset

## Signatures
- Team Lead: — [name], [date]
- Principal Architect: — [name], [date]
- Sceptical Architect: — [name], [date]
- Product Manager: — [name], [date]
```

## Ratification rules

1. **Product approval first.** The Product Manager (or Team Lead where no PM exists) must approve scope and acceptance criteria before architecture review.

2. **Both architects must ratify.** The Principal Architect and Sceptical Architect independently review the charter. Both must sign. A pushback from either sends it back for revision.

3. **Blind-first challenge.** The Sceptical Architect writes their provisional assessment before reading the Principal Architect's verdict.

4. **Binding conditions.** Any conditions attached to ratification (e.g., "security review required for auth tasks") are recorded in the charter and enforced by the dispatcher.

5. **No work before ratification.** No task may be claimed or implemented until the charter is ratified. The dispatcher refuses claims against an unratified charter.

6. **Amendment requires re-ratification.** Any change to scope, acceptance criteria, execution mode, or review gates requires fresh signatures from all original ratifiers.

7. **Charter is evidence, not authority.** The charter is the founding document, but the tracker remains the single source of durable truth. A charter condition that is not reflected in tracker state is not enforceable by automation.

## When to create a charter

- **Always** for multi-task features delivered by a team
- **Optional** for single-task work in solo mode (the task description serves as a mini-charter)
- **Mandatory** before parallel execution — the charter's execution mode and review gates are validated by the pre-parallel checklist

## Charter storage

The charter is committed to the team workspace:

```
.pi-team/workspace/<team-name>/CHARTER.md
```

It is referenced by task packets and review packages. The dispatcher validates charter ratification status before claiming the first task.