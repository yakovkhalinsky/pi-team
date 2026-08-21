# Harness Patterns — pi.dev Instantiation

How the Agentic Team Protocol is instantiated on the pi.dev coding agent harness.

## Architecture

Pi Team uses the [pi-agents-team](https://github.com/KristjanPikhof/Pi-Agents-Team) extension's orchestrator-worker RPC model:

```
┌──────────────────────────────────────────────────────────┐
│                    Pi Main Session                         │
│                  (Orchestrator / Team Lead)                │
│                                                            │
│  User ◄──► Orchestrator                                    │
│                │                                           │
│                ├── delegate_task(role, prompt, skills) ──► Worker 1 (RPC)
│                ├── delegate_task(role, prompt, skills) ──► Worker 2 (RPC)
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

- **One visible orchestrator session** — the user's main pi session
- **Many subordinate RPC workers** — `pi --mode rpc --no-session` processes
- **Compact worker outputs** — orchestrator sees summaries + `<final_answer>` only
- **Explicit supervision** — delegate, wait, steer, relay, result tools

## Orchestrator contract

The orchestrator is the only agent that speaks to the user. Workers are background specialists under its supervision.

### Direct answer or delegate

The orchestrator may answer directly for:
- Trivial, already-known, or tiny bounded work

The orchestrator must delegate:
- Investigation, mapping, review, multi-file changes, tests
- Context-hungry work where delegation costs less than the answer

### Wait, don't poll

```
1. delegate_task → returns worker id(s)
2. wait_for_agents(ids) → zero-token wait, returns on:
   - all_terminal: every worker done
   - relay_raised: worker has a question
   - timeout: default 5 min
   - aborted: wait cancelled
3. If relay_raised: read relay, answer via agent_message, wait again
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

### Result shape

```
<final_answer>
headline: one-sentence summary

findings:
- bullet 1
- bullet 2

read_files:
- path/one.ts
- path/two.ts

changed_files:
- path/three.ts

risks:
- edge case worth flagging

next_recommendation:
- what to do next
</final_answer>
```

### Relay questions

Workers must omit `relay_question` entirely when they have nothing to ask. Placeholder values like `none`, `n/a`, `-` are filtered as "no relay."

## Mapping protocol roles to pi.dev workers

| Protocol role | pi.dev profile | Thinking level | When spawned |
|---|---|---|---|
| Team Lead | `team-lead` | high | Orchestrator itself (or dedicated worker for large teams) |
| Principal Architect | `principal-architect` | high | Design gate, review board |
| Sceptical Architect | `sceptical-architect` | high | Design gate, review board (blind-first) |
| Security Reviewer | `security-reviewer` | high | When `review-gates: security` |
| Integrator | `integrator` | medium | After all approvals |
| Backend | `backend` | medium | Implementation tasks |
| Frontend | `frontend` | medium | Implementation tasks |
| QA | `qa` | medium | When `review-gates: qa` |
| Reviewer | `reviewer` | medium | Supporting review |
| Product Manager | `product-manager` | medium | Triage, scope, acceptance |
| Explorer | `explorer` | low | Fast investigation |
| Fixer | `fixer` | medium | Bug fixes |
| Librarian | `librarian` | medium | Documentation |
| Observer | `observer` | low | Monitoring |
| Oracle | `oracle` | high | Research |
| Designer | `designer` | medium | UI/UX specifications |

## Skill discovery

Pi skills are host-level capabilities from the Pi startup banner. Pass installed skill names through `delegate_task.skills`:

```json
{
  "profileName": "backend",
  "skills": ["superpowers:test-driven-development"],
  "taskPrompt": "Implement the CSV export endpoint..."
}
```

When `skills` is non-empty, worker skill discovery is enabled. Omit when no installed skill clearly fits.

## Model extensions

Provider/model extensions are role config, not prompt routing. Declare them as `access.extensions` so the worker process loads those Pi `--extension`/`-e` sources before model resolution:

```json
{
  "backend": {
    "access": {
      "extensions": ["myAnthropic/claude-opus-4"]
    }
  }
}
```

## Session persistence and recovery

Pi Agents Team writes compact worker transitions to Pi's append-only JSONL session:
- Bounded worker/profile identity, terminal status, timestamps
- Compact summaries and Pi-reported usage
- Task metadata, prompts, paths, relays, final answers stay out of persisted payload

Restored live or reusable workers become `exited` because their RPC processes are not attached. Saved summaries and usage remain available.

**Storage warning:** At 10,000 compact records or 64 MiB on the active branch, the extension warns once and recommends a new session.

## Harness mode vs CLI mode

| CLI-process mechanism | Harness-mode equivalent |
|---|---|
| `launch-team.sh start/team` (spawn) | `delegate_task` with composed prompt |
| Mailbox files | Harness agent-to-agent messages (relay) |
| Heartbeats | Harness lifecycle/idle notifications |
| pid files, tmux | Not applicable — harness owns supervision |
| Filesystem degradation statement | Not needed — harness delivers messages |

Everything else is unchanged: the tracker is still the single source of durable truth, markers and statuses are still the protocol, and the report-before-idle contract applies.

## Security boundary

`delegate_task` produces context but cannot authenticate a harness-native process. Protocol gate markers must be submitted by a role spawned through the trusted launcher or a harness integration that provides an equivalent protected per-instance capability channel.

- A **gating reviewer** is spawned through a protected launcher/harness capability
- An **advisory reviewer** is a native harness subagent without that channel — its report routes back through harness messaging, never as a mandatory approval marker
- If all required authenticated contexts are unavailable, record a self/advisory review and escalate