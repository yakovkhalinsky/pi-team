# Harness Patterns — pi.dev Instantiation

How the [Agentic Team Protocol](https://yakov.khalinsky.com/agentic-team-protocol/papers/01-protocol/) instantiates on pi.dev, per the paper's §7 ("harness-agnostic; pi packages, Claude Project instructions, or Cursor `.cursorrules` files") and the [pi-agents-team](https://github.com/KristjanPikhof/Pi-Agents-Team) extension.

## Mapping paper roles to pi.dev profiles

| Paper role | Profile name | Thinking | Owns stage |
|---|---|---|---|
| Team Lead (orchestrator) | `team-lead` | high | Stage 1 (Goal receipt); closure half of Stage 7 |
| Dispatcher | `dispatcher` | high | Stage 2 (Routing and assignment) |
| Researcher | `researcher` | high | Stage 3 (Context gathering, when uncertainty is high) |
| Builder | `builder` | medium | Stage 4 (Action — artefact production) |
| Runtime | `runtime` | high | Stage 4 (Action — live-system execution) |
| Verifier | `verifier` | high | Stage 5 (Verification) |
| Archivist | `archivist` | medium | Stage 6 (Recording and archival); ownership-transfer half of Stage 7 |

There is no seventh profile. The paper says (§4): "the Builder, Runtime, or specialist executes the plan and records what was done" — when a goal needs a capability the six cannot supply, the Builder / Runtime consume tools available in their harness. The protocol does not enumerate further specialists.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Pi Main Session                         │
│                  (Orchestrator / Team Lead)                │
│                                                            │
│  User ◄──► Orchestrator                                    │
│                │                                           │
│                ├── delegate_task(profile, prompt, skills)  │
│                │                                           │
│                ├── delegate_task(dispatcher) ──► Worker 1 │
│                ├── delegate_task(researcher)  ──► Worker 2 │
│                ├── delegate_task(builder)     ──► Worker 3 │
│                ├── delegate_task(runtime)     ──► Worker 4 │
│                ├── delegate_task(verifier)    ──► Worker 5 │
│                ├── delegate_task(archivist)   ──► Worker 6 │
│                │                                           │
│                ├── wait_for_agents(ids) ◄── zero-token    │
│                │                                           │
│                ├── agent_message(id, msg) ──► relay answer │
│                │                                           │
│                ◄── agent_result(id)                        │
│                                                            │
│  synthesise ──► user-facing answer                         │
└──────────────────────────────────────────────────────────┘
```

### Key properties

- **One visible orchestrator session** — the user's main pi session hosts Stages 1 and 7
- **Many subordinate RPC workers** — `pi --mode rpc --no-session` processes, each running one paper role
- **Compact worker outputs** — orchestrator sees summaries + `<final_answer>` only
- **Explicit supervision** — delegate, wait, steer, relay, result tools

## The seven stages, by lifecycle

| Stage | Owner | What the orchestrator does |
|---|---|---|
| 1. Goal receipt | Team Lead | Capture requester, constraints, scope, package fit |
| 2. Routing and assignment | Dispatcher | `delegate_task(dispatcher, …)` |
| 3. Context gathering | Researcher | `delegate_task(researcher, …)` (skipped when uncertainty is low) |
| 4. Action | Builder / Runtime | `delegate_task(builder, …)` or `delegate_task(runtime, …)` |
| 5. Verification | Verifier | `delegate_task(verifier, …)` |
| 6. Recording and archival | Archivist | `delegate_task(archivist, …)` |
| 7. Hand-off or closure | Archivist records; Team Lead closes | Either `[closure]` or `[handoff]` |

The optional stage is Stage 3. The paper says (§4): "the Researcher leads when uncertainty is high; otherwise the owner consults the Archivist." In practice: when the Dispatcher's recorded confidence is below the project threshold, route to the Researcher first; otherwise the Builder / Runtime consult the Archivist directly via `agent_message(archivist, …)`.

## Orchestrator contract

The orchestrator is the only agent that speaks to the user. Workers are background specialists under its supervision.

### Direct answer or delegate

The orchestrator may answer directly for trivial, already-known, or tiny bounded work. The orchestrator must delegate substantial investigation, review, mapping, and multi-file changes.

### Wait, don't poll

```
1. delegate_task → returns worker id(s)
2. wait_for_agents(ids) → zero-token wait
3. If relay_raised: answer via agent_message, wait again
4. If all_terminal: agent_result per worker, synthesise
```

**Forbidden:** looping ping_agents, sleeping in bash, spawning workers to check on workers, treating interim text as a result.

### Context-aware reuse

| Worker context | Reuse guidance |
|---|---|
| < 50% | Normal same-scope reuse |
| 50–70% | Cautious reuse |
| > 70% | Discouraged — prefer fresh |
| ≥ 80% or ≤ 32768 tokens remaining | Rejected — must delegate fresh |

## Worker contract

Every worker prompt assumes:
- Subordinate to the orchestrator
- Does not speak to the user directly
- Keeps output compact and structured
- Raises a relay question rather than blocking forever
- Wraps final deliverable in `<final_answer>…</final_answer>`
- Signs every comment with the role name verbatim (paper §5.3: "identity discipline on every write")

### Result shape

```
<final_answer>
headline: one-sentence summary

findings:
- bullet 1
- bullet 2

risks:
- anything the next stage should know

next_recommendation:
- what the orchestrator should route next
</final_answer>
```

### Relay questions

Workers must omit `relay_question` entirely when they have nothing to ask. Placeholder values like `none`, `n/a`, `-` are filtered as "no relay."

## Skill discovery

Pi skills are host-level capabilities from the Pi startup banner. Pass installed skill names through `delegate_task.skills`:

```json
{
  "profileName": "researcher",
  "skills": ["superpowers:test-driven-development"],
  "taskPrompt": "Reduce uncertainty on whether the new auth flow breaks the legacy contract..."
}
```

When `skills` is non-empty, worker skill discovery is enabled. Omit when no installed skill clearly fits.

## Identity discipline

The paper (§7): "identity discipline on every write." Every worker signs with its role name verbatim. The Dispatcher refuses a marker whose claimed signer is not allowed for that marker.

- A comment signed `dispatcher` is accepted at Stage 2; rejected at Stage 5.
- A comment signed `verifier` is accepted at Stage 5; rejected at Stage 2.
- No role signs a Stage it does not own.

## Security boundary

The protected tier (§8 governance implication): the orchestrator refuses to delegate a Stage 4 task to the Runtime whose target is production instances, secrets, IAM, certificates, DNS, backups, logs, or force-push, without explicit human approval.

`delegate_task` produces context but cannot authenticate a harness-native process. Protocol-stage markers must be submitted by a role spawned through a trusted launcher or a harness integration that provides an equivalent protected per-instance capability channel.

- A **gating role** is spawned through a protected launcher / harness capability
- An **advisory role** is a native harness subagent without that channel — its report routes back through harness messaging, never as a mandatory approval marker
- If all required authenticated contexts are unavailable, record a self / advisory review and escalate
