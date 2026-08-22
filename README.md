# Pi Team

A comprehensive agentic team setup for the [pi.dev](https://pi.dev) coding agent harness, implementing the [Agentic Team Protocol](https://yakov.khalinsky.com/agentic-team-protocol/papers/01-protocol/) — a harness-agnostic protocol whose operating contracts make a team of agents coherent enough to debug when something goes wrong.

## What this gives you

- **Six paper-aligned role contracts** — Dispatcher, Builder, Runtime, Verifier, Researcher, Archivist — with explicit "promises," decision authority, "cannot," and failure modes for each
- **Seven-stage task lifecycle** — Goal receipt → Routing → Context gathering → Action → Verification → Recording → Hand-off or closure — with the only optional stage explicitly identified (Stage 3)
- **Append-only durable record** — corrections are new entries with `supersedes:`, never edits; the Archivist enforces the invariant
- **Identity discipline** — every comment signed by its role name verbatim; the Dispatcher enforces marker routing
- **Protected-tier escalation** — production instances, secrets, IAM, DNS, certificates, backups, logs, force-push are explicitly outside what the team can authorise without human approval
- **Anti-pattern visibility** — the seven anti-patterns the paper names (role collapse, missing dispatcher, verifiability gap, memory blindness, skipped researcher, runtime without rollback, archivist as secretary) are surfaced in every charter and every prompt
- **One-command installer** that scaffolds the full setup into any project

## Quick start

```bash
# From your project root:
curl -fsSL https://raw.githubusercontent.com/yakovkhalinsky/pi-team/main/install.sh | bash

# Or clone and run locally:
git clone git@github.com:yakovkhalinsky/pi-team.git
cd pi-team && ./install.sh --target /path/to/your/project
```

The installer will:

1. Verify prerequisites (`pi`, `node` ≥ 22.19.0, `git`)
2. Install the `pi-agents-team` extension (if not already present)
3. Scaffold `.pi/agent/agents-team.json` with the six paper roles, schema v4, and `whenToUse` trigger sentences
4. Copy prompts, reference docs, team presets, and config templates
5. Add `.pi-team/workspace/` and `.pi-team/.teamwork/` to your project `.gitignore` (runtime artefacts only — prompts and reference docs stay tracked)
6. Print next-step instructions

## Roles

The paper defines exactly six role contracts (§3). There is no seventh protocol role. When a goal needs a capability the six cannot supply, the Builder or Runtime consumes tools available in their harness.

### The six paper roles

| Role | Profile name | Thinking | Owns lifecycle stage |
|---|---|---|---|
| **Dispatcher** | `dispatcher` | high | Stage 2 — Routing and assignment |
| **Researcher** | `researcher` | high | Stage 3 — Context gathering (when uncertainty is high) |
| **Builder** | `builder` | medium | Stage 4 — Action (artefact production) |
| **Runtime** | `runtime` | high | Stage 4 — Action (live-system execution) |
| **Verifier** | `verifier` | high | Stage 5 — Verification |
| **Archivist** | `archivist` | medium | Stage 6 — Recording and archival; ownership-transfer half of Stage 7 |

The **Team Lead** is the pi.dev orchestrator (your main session) and hosts Stage 1 (Goal receipt) and the closure half of Stage 7 (Hand-off or closure). It is not one of the six paper roles — it is the harness instantiation that holds them together.

## The seven-stage task lifecycle

```
1. Goal receipt            (Team Lead — orchestrator)
2. Routing and assignment  (Dispatcher)
3. Context gathering       (Researcher when uncertainty is high; otherwise goal owner consults Archivist)
4. Action                  (Builder for artefacts, Runtime for live systems)
5. Verification            (Verifier)
6. Recording and archival  (Archivist)
7. Hand-off or closure     (Archivist records ownership transfer; Team Lead closes or transfers)
```

Skipping a stage is an anti-pattern the paper calls out: "the most expensive mistakes we have made came from treating context gathering or verification as optional." The only optional stage is Stage 3 — the paper is explicit: "the Researcher leads when uncertainty is high; otherwise the owner consults the Archivist."

See [`reference/task-lifecycle.md`](reference/task-lifecycle.md).

## Coordination markers

The paper does not define a marker grammar; it says (§5.3): "we do not just record results; we record decisions." The project extends the paper with a marker grammar so cross-role hand-offs are grep-able in the durable record:

`[goal-received]` `[routing]` `[context-gathering]` `[skip-context-gathering]` `[action]` `[api-ready]` `[verdict]` `[recorded]` `[closure]` `[handoff]` `[andon]` `[escalation]`

Marker routing is enforced — the Dispatcher refuses a marker whose claimed signer is not allowed for that marker. **No role approves its own work.** When a marker's only allowed role is the task's own implementer, an independent verifier substitutes; none available → `[andon]`.

See [`reference/markers.md`](reference/markers.md).

## Team presets

The paper does not enumerate presets; it describes one six-role operations fleet in §1. The project provides six presets, each choosing which of the six paper roles are active. Presets are documented in `.pi-team/reference/harness-patterns.md`.

| Preset | Active roles | Use when |
|---|---|---|
| `full-fleet` | All six + Team Lead | Any goal that touches more than one paper role — the default |
| `research-driven` | Dispatcher, Researcher, Builder, Verifier, Archivist + Team Lead | Uncertainty is high before any decision lands; Stage 3 runs mandatory |
| `builder-fleet` | Dispatcher, Researcher, Builder, Verifier, Archivist + Team Lead | Producing durable artefacts without live-system changes |
| `runtime-fleet` | All six + Team Lead | Operating live systems; rollback plan must be in the durable record before execution |
| `verification-fleet` | Dispatcher, Researcher, Verifier, Archivist + Team Lead | Independent acceptance gate on existing work |
| `archive-fleet` | Dispatcher, Researcher, Archivist + Team Lead | Maintaining the durable record; ownership transfer; skill promotion |

## Protected tier (paper §8 governance implication)

The following are explicitly outside what the team can authorise without human approval:

- Production instances, clusters, storage, network, DNS, certificates, keys, backups, logs
- IAM, secrets, force-push, history rewrite
- Database / schema drops or truncation

The Dispatcher refuses to route any goal whose target is the protected tier without explicit human approval.

## Anti-patterns the paper names

The paper enumerates seven anti-patterns (§6). Every charter and every prompt surfaces them so they are visible before they become incidents:

- **Role collapse.** Two roles merged into one agent. The Builder cannot be the sole Verifier of its own work.
- **Missing Dispatcher.** Tasks assigned by implicit convention. Missed hand-offs and duplicated work.
- **Verifiability gap.** The Verifier exists on paper but cannot inspect.
- **Memory blindness.** The Archivist is disconnected; mistakes repeat.
- **Skipped Researcher.** Decisions without options or trade-offs.
- **Runtime without rollback.** Live changes lack a tested recovery path.
- **Archivist as secretary.** Copies chat logs instead of authoring canonical records.

## How it works

Pi Team uses pi.dev's native orchestrator-worker RPC model:

1. The **orchestrator** (your main pi session) acts as Team Lead and hosts Stages 1 and 7
2. Each paper role runs as a background RPC worker via `delegate_task`
3. Workers return a compact `<final_answer>` block — the orchestrator never sees full transcripts
4. The orchestrator **waits** (zero-token) for workers, answers **relay questions** mid-flight, and synthesises results
5. The durable record carries every stage entry with append-only semantics

```
┌─────────────────────────────────────────────────┐
│                 Orchestrator                      │
│            (Team Lead / user)                     │
│                                                   │
│  Stage 1: Goal receipt  ◄──► User                │
│                                                   │
│  Stage 2: Routing        ──►  Dispatcher          │
│  Stage 3: Context (opt)  ──►  Researcher          │
│  Stage 4: Action         ──►  Builder | Runtime   │
│  Stage 5: Verification   ──►  Verifier            │
│  Stage 6: Recording      ──►  Archivist           │
│  Stage 7: Closure        ◄──  Archivist handoff   │
│                                                   │
│  durable record ◄── append-only                  │
└─────────────────────────────────────────────────┘
```

## Configuration

After installation, configure your team in `.pi/agent/agents-team.json`:

```json
{
  "schemaVersion": 4,
  "scaffoldVersion": 4,
  "enabled": true,
  "routingMode": "team",
  "workerAccess": {
    "allowPathsOutsideProject": false
  },
  "display": {
    "cost": true
  },
  "memory": {
    "edenMemory": {
      "enabled": true,
      "semanticSearch": false
    }
  },
  "worktree": {
    "enabled": true,
    "basePath": ".pi-team/worktrees",
    "cleanupOnTerminal": true,
    "cleanupOnPrune": true
  },
  "roles": {
    "dispatcher": {
      "whenToUse": "Use for Stage 2 (Routing and assignment) — classify the goal, set priority, record ownership and confidence.",
      "model": "default",
      "thinkingLevel": "high",
      "prompt": ".pi-team/prompts/agents/dispatcher.md"
    },
    "researcher": {
      "whenToUse": "Use for Stage 3 (Context gathering) when uncertainty is high — reduce uncertainty before a decision lands.",
      "model": "default",
      "thinkingLevel": "high",
      "prompt": ".pi-team/prompts/agents/researcher.md"
    }
    // ... builder, runtime, verifier, archivist
  }
}
```

> **Schema v4 notes:** `schemaVersion: 4` is required. Per-role `promptPath` was renamed to `prompt` (a string is treated as a project-relative path to your own `.md`; use `"default"` for the built-in prompt). Optional per-role knobs:
> - `whenToUse` — trigger sentence shown to the orchestrator (e.g. "Use for Stage 2 ...")
> - `model` — `"default"` (inherit) or `"provider/model-id"`
> - `thinkingLevel` — `off | minimal | low | medium | high | xhigh | max`
> - `access` — `tools`, `write`, `pathScope`, `extensionMode`, `extensions`, `canSpawnWorkers`

Toggle between team and solo mode:

```bash
pi /team-enable on     # team mode (default after install)
pi /team-enable off    # solo mode (standard pi without workers)
```

## Web research extensions

`web_search` and `web_fetch` are Researcher-only tools for Stage 3 context gathering. The Researcher uses them to reduce uncertainty from external sources such as package registries, API references, release notes, and documentation.

Install web-search extensions **project-locally**, not globally:

```bash
pi install -l npm:@earendil-works/pi-web-search
```

Do not install them globally (`pi install npm:...`) because the orchestrator must never invoke `web_search` or `web_fetch` itself. Scope the extension to the `researcher` role by adding it to `access.extensions` in `.pi/agent/agents-team.json`:

```json
{
  "roles": {
    "researcher": {
      "access": {
        "tools": ["read", "bash", "grep", "find", "ls", "web_search", "web_fetch"],
        "extensions": ["npm:@earendil-works/pi-web-search"]
      }
    }
  }
}
```

The install-time `agents-team.json` already includes `web_search` and `web_fetch` in the Researcher's tool list. The orchestrator contract explicitly forbids calling those tools from the main session — always delegate web research to a `researcher` worker.

## Operator commands

| Command | What it does |
|---|---|
| `/team` | Open the live dashboard (workers, inspect, console, cost) |
| `/team-steer <id\|all> <msg>` | Message one worker or broadcast to all |
| `/team-stop <id\|all>` | Stop one or all workers |
| `/team-result <id>` | Print the worker's verbatim `<final_answer>` |
| `/team-enable on\|off` | Toggle between team and solo mode |
| `/team-init [global\|local]` | Scaffold config with built-in roles |

Helper scripts in `.pi-team/bin/` add protocol-aware workspace management:

```bash
.pi-team/bin/pi-team-init.sh <team-name> <feature-id> [preset]   # Scaffold CHARTER, RECORD, SKILLS, RUNBOOKS, ESCALATIONS
.pi-team/bin/pi-team-status.sh                                  # Show team workspace status, charter ratification, durable-record health
.pi-team/bin/pi-team-cleanup.sh <team-name>                     # Archive-and-remove a team workspace after feature completion
```

## Project structure after install

```
your-project/
├── .pi/
│   └── agent/
│       └── agents-team.json        # Pi Agents Team role config (schema v4)
└── .pi-team/
    ├── prompts/
    │   ├── orchestrator.md          # Team Lead contract (Stage 1 + Stage 7)
    │   └── agents/                  # Six paper role prompts
    ├── reference/                   # 7 protocol documents
    ├── config/
    │   ├── team.json                # Default role config (canonical)
    │   ├── statuses.json            # Seven-stage lifecycle + transitions
    │   └── charter.template.md      # Team charter template
    └── bin/                         # Helper scripts
```

`.pi-team/workspace/` and `.pi-team/.teamwork/` are runtime-only and git-ignored.

## Documentation

| Document | Answers |
|---|---|
| [`reference/protocol.md`](reference/protocol.md) | What is the core protocol and its six role contracts? |
| [`reference/role-contracts.md`](reference/role-contracts.md) | What does each role promise, decide, and cannot decide? |
| [`reference/task-lifecycle.md`](reference/task-lifecycle.md) | How does a goal pass through the seven stages? |
| [`reference/markers.md`](reference/markers.md) | What markers coordinate cross-role hand-offs in the durable record? |
| [`reference/decision-escalation.md`](reference/decision-escalation.md) | Who decides what, and when to escalate? |
| [`reference/harness-patterns.md`](reference/harness-patterns.md) | How is the protocol instantiated on pi.dev? |
| [`reference/team-charter.md`](reference/team-charter.md) | How is a team charter created and ratified? |

## Requirements

- **pi.dev** (`@earendil-works/pi-coding-agent`) >= 0.80.6
- **Node.js** >= 22.19.0
- **Git**

## License

MIT
