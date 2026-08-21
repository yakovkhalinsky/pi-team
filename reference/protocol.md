# Agentic Team Protocol

A harness-agnostic protocol for role-based agent teams, instantiated for the pi.dev coding agent harness. The authoritative source is [A Protocol for Role-Based Agent Teams](https://yakov.khalinsky.com/agentic-team-protocol/papers/01-protocol/) — this document is a faithful summary, not the paper itself.

## The six role contracts

The paper defines exactly six roles (§3). Each role writes its contracts in first person; these are operating contracts, not prompt wrappers.

### Dispatcher

We are the Dispatcher. We decide who does what. Our contract is routing: given a goal and the current state of the fleet, we assign the task to the right role, set priority, and track ownership. We fail when we route silently by keyword, assign the same task to multiple roles without merge logic, or forget to escalate when confidence is low.

### Builder

We are the Builder. We produce durable artefacts. Our contract is constructive correctness: the artefact should do what was asked, fit the surrounding context, and be reviewable by the Verifier. We fail when our changes are locally correct but globally wrong, incomplete, or drift out of sync with the documentation.

### Runtime

We are the Runtime. We operate live systems. Our contract is safe execution: run the change, observe the result, and report back. We fail when we make destructive changes without a recovery path, lose runtime state on restart, or diverge from the intended system state.

### Verifier

We are the Verifier. We check work before it is integrated or deployed. Our contract is independent validation. We fail when our checks pass locally but fail end-to-end, miss cross-role interactions, or become rubber-stamp approvals.

### Researcher

We are the Researcher. We gather context before decisions are made. Our contract is informed choice. We fail when decisions are made on stale context, when alternatives are missing, or when research never lands.

### Archivist

We are the Archivist. We maintain durable memory. Our contract is accessible history: any agent should be able to find what the fleet already knows. We fail when documentation is stale, notes are unsearchable, or knowledge is trapped in one agent's private memory.

## The seven-stage task lifecycle

Every goal follows the same seven stages (§4). Skipping a stage is an anti-pattern.

1. **Goal receipt** — capture the request, requester, constraints, and package fit.
2. **Routing and assignment** — the Dispatcher classifies the goal, assigns an owner, and records confidence.
3. **Context gathering** — the Researcher leads when uncertainty is high; otherwise the owner consults the Archivist.
4. **Action** — the Builder, Runtime, or specialist executes the plan and records what was done.
5. **Verification** — the Verifier defines a green gate, gathers evidence, and posts a verdict.
6. **Recording and archival** — the Archivist ensures durable records, decision trails, and updated skills.
7. **Hand-off or closure** — the goal closes, or ownership is transferred explicitly to another role or package.

The only optional stage is Stage 3 (Context gathering): the paper is explicit that the Researcher leads "when uncertainty is high; otherwise the owner consults the Archivist."

## Cross-cutting concerns

### Memory (§5.1)

Memory is the substrate that lets ownership, observability, and fallback work across restarts and hand-offs. Each role needs different things from memory: the Dispatcher needs current ownership; the Builder needs prior art; the Runtime needs rollback plans; the Verifier needs baselines; the Researcher needs sources; the Archivist needs the whole corpus. A memory system built for only one role starves the others.

### Ownership (§5.2)

Ownership is the answer to the question: if this fails, who is responsible? It must survive restarts and hand-offs, so it is recorded in shared memory, not held in-process. When a goal is handed off, ownership is transferred explicitly.

### Observability (§5.3)

A role without observable output cannot be debugged. The paper: "We do not just record results; we record decisions." The Dispatcher logs why it chose a role. The Verifier logs why it passed or failed. The Archivist logs what was updated and why.

### Fallback (§5.4)

Fallback behaviour must be explicit, not emergent. The Dispatcher escalates to a human when confidence is low. The Builder stops and asks for clarification. The Runtime runs the rollback plan. The Verifier blocks forward motion. The Researcher declares the information gap. The Archivist falls back to the last canonical, immutable artefact. Fallbacks that have never been exercised are hopes, not plans.

## Anti-patterns (§6)

- **Role collapse.** Two roles are merged into one agent. The Builder cannot be the sole Verifier of its own work.
- **Missing Dispatcher.** Tasks are assigned by implicit convention. The result is missed hand-offs and duplicated work.
- **Verifiability gap.** The Verifier exists on paper but cannot inspect the Builder's output or the Runtime's live state.
- **Memory blindness.** The Archivist is disconnected, so the fleet repeats mistakes.
- **Skipped Researcher.** Decisions are made without options or trade-offs.
- **Runtime without rollback.** Live changes lack a tested recovery path.
- **Archivist as secretary.** The Archivist copies chat logs instead of authoring canonical records.

## Harness instantiation (§7)

The protocol is harness-agnostic. Each harness represents roles differently — Pi packages, Claude Project instructions, or Cursor `.cursorrules` files — but the obligations are the same. In all three cases an external router or controller selects the active role, because none of the harnesses provides native multi-role orchestration. Durable state lives in an external memory layer such as a project memory store, with identity discipline on every write.

For pi.dev specifically: the Team Lead session acts as the orchestrator and hosts Stage 1 (Goal receipt) and the closure half of Stage 7 (Hand-off or closure). Each paper role runs as a background RPC worker via `delegate_task`. The protocol-level markers, lifecycle status, and durable record live in the project workspace; identity discipline (role name verbatim, signatures grep-able) is enforced on every artefact the worker posts.

## Governance (§8)

Teams that span more than one session need a charter. The charter defines the team's identity, mission, boundaries, roles, decision rights, dependencies, runbooks, skills, and retirement condition. Governance separates the Founders' Circle, which charters and ratifies, from Anchor Operations, which runs product teams inside guardrails.

## Discussion (§9)

The contribution of the paper is not to invent roles but to make them operable across harnesses. A role is not a prompt wrapper or a model identity; it is a set of obligations that other roles can rely on. By naming the obligations and the hand-offs between them, the protocol makes failures visible before they become incidents.

## Limitations (§10)

The protocol is derived from qualitative operational experience, not a controlled experiment. It is a design tool, not a proof. Future work includes instrumenting the autonomy index and decision-velocity metrics that Anchor Operations should track, and validating the harness patterns against longer-running production pilots.
