# Team Charter: [Team Name]

A charter binds a team of agents to a shared operating contract. The paper §8 names what a charter contains: identity, mission, boundaries, roles, decision rights, dependencies, runbooks, skills, and retirement condition. Ratification happens before work begins and is the reference point when something goes wrong.

## Feature
[Feature ID and one-line description]

## Fleet (six paper roles)
- Team Lead — hosts Goal receipt and Hand-off or closure
- Dispatcher — owns Routing and assignment
- Researcher — owns Context gathering (when uncertainty is high)
- Builder — owns Action (artefact production)
- Runtime — owns Action (live-system execution)
- Verifier — owns Verification
- Archivist — owns Recording and archival; ownership-transfer half of Hand-off or closure

## Mission
[One-paragraph mission: what this team is chartered to do, what "done" means]

## Boundaries
### In scope
- [item 1]
- [item 2]

### Out of scope
- [item 1]
- [item 2]

### Protected tier (cannot modify without human approval)
- Production instances, clusters, storage
- Network, DNS, certificates, keys
- Backups, logs, audit trails
- IAM, secrets, force-push, history rewrite
- Database / schema drops or truncation

## Decision rights (per paper role)

| Role | Decides | Cannot decide |
|---|---|---|
| Team Lead | Goal receipt, hand-off, closure | Substantive content decisions |
| Dispatcher | Classification, priority, ownership, routing | Approving work, modifying artefacts |
| Researcher | Where to look, what to surface, alternatives | Approving work, taking action |
| Builder | How to construct the artefact, self-validation | Approving own work, merging to main |
| Runtime | Live-system execution, rollback execution | Approving own execution, modifying the protected tier |
| Verifier | Pass / fail / block verdict, gate criteria | Editing the artefact, re-routing |
| Archivist | Workspace structure, index, record entries | Approving work, modifying live state |

## Lifecycle path

The paper's seven stages: Goal receipt → Routing and assignment → Context gathering → Action → Verification → Recording and archival → Hand-off or closure. Skipping a stage is an anti-pattern. The only optional stage is Context gathering, which the paper says the Researcher leads "when uncertainty is high; otherwise the owner consults the Archivist."

## Runbooks
- [link or path to runbook 1]
- [link or path to runbook 2]

## Skills
- [skill name — short description — last promoted from the durable record]

## Dependencies
- [external dependency 1]
- [external dependency 2]

## Retirement condition
- [What ends this team's charter — feature shipped, package deprecated, ownership transferred]

## Ratification (per paper §8: separate Founders' Circle from Anchor Operations)

- [ ] Product approval (or Team Lead where no PM exists): scope, mission, boundaries
- [ ] Dispatcher approved routing (which stages run, which are optional)
- [ ] Researcher confirmed information sources and uncertainty threshold
- [ ] Builder / Runtime confirmed acceptance criteria for their stage
- [ ] Verifier confirmed gate criteria for each stage transition
- [ ] Archivist confirmed workspace structure and retention policy

## Anti-patterns to watch (paper §6)

- Role collapse: two roles merged into one agent
- Missing Dispatcher: routing by implicit convention
- Verifiability gap: the Verifier cannot inspect
- Memory blindness: the Archivist is disconnected
- Skipped Researcher: decisions without options or trade-offs
- Runtime without rollback: live changes lack a tested recovery path
- Archivist as secretary: copying chat logs instead of authoring canonical records

## Signatures
- Team Lead: — [name], [date]
- Dispatcher: — [name], [date]
- Researcher: — [name], [date]
- Builder: — [name], [date]
- Runtime: — [name], [date]
- Verifier: — [name], [date]
- Archivist: — [name], [date]
