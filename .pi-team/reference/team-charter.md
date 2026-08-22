# Team Charter

A charter binds a team of agents to a shared operating contract. Per the paper §8, a charter names "identity, mission, boundaries, roles, decision rights, dependencies, runbooks, skills, and retirement condition." Ratification happens before work begins and is the reference point when something goes wrong.

The charter template at `.pi-team/config/charter.template.md` is the project's canonical instantiation.

## The paper's charter content (§8)

- **Identity** — what this team is, what it owns, who charters it
- **Mission** — what "done" means for this team
- **Boundaries** — in scope, out of scope, protected tier (the things no team member authorises without human approval)
- **Roles** — which of the six paper roles are active on this team
- **Decision rights** — what each role decides and what it cannot decide
- **Dependencies** — external systems, packages, contracts the team relies on
- **Runbooks** — rollback, recovery, closure procedures
- **Skills** — recurring lessons promoted from the durable record
- **Retirement condition** — what ends this charter

## Ratification

The paper §8: "Governance separates the Founders' Circle, which charters and ratifies, from Anchor Operations, which runs product teams inside guardrails."

Ratification steps:

1. **Product approval** (or Team Lead where no PM exists): scope, mission, boundaries
2. **Dispatcher** approved routing: which stages run, which are optional
3. **Researcher** confirmed information sources and uncertainty threshold
4. **Builder / Runtime** confirmed acceptance criteria for their stage
5. **Verifier** confirmed gate criteria for each stage transition
6. **Archivist** confirmed workspace structure and retention policy

Each signature is itself a marker — appended to the durable record by the role that signs.

## Charter storage

The charter is committed to the team workspace at `.pi-team/workspace/<team-name>/CHARTER.md`. It is cited by every stage entry the Archivist appends; the Archivist refuses to record a stage entry whose charter has not been ratified.

## When to amend

Any change to scope, mission, boundaries, decision rights, dependencies, runbooks, skills, or retirement condition requires fresh signatures from all original ratifiers. The amendment is itself a new entry in the durable record with `supersedes: <prior-charter-id>`.

## Charter as evidence, not authority

The charter is the founding document, but the durable record remains the source of truth. A charter condition that is not reflected in the durable record is not enforceable by automation. The Dispatcher enforces charter routing against record entries, not against charter text alone.
