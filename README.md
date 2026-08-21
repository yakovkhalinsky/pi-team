# Pi Team

A comprehensive agentic team setup for the [pi.dev](https://pi.dev) coding agent harness, implementing the [Agentic Team Protocol](https://yakov.khalinsky.com/agentic-team-protocol/) — a harness-agnostic protocol for role-based agent teams.

## What this gives you

- **Role-based agent team** running inside pi.dev's orchestrator-worker model
- **Six specialised roles** with explicit contracts, decision rights, and escalation paths
- **Seven-stage task lifecycle** from intake to delivery with structured coordination markers
- **Independent review board** — no agent approves its own work
- **Team charter** template with ratification rules
- **Decision and escalation** framework with andon cord support
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

1. Verify prerequisites (`pi`, `node`, `git`)
2. Install the `pi-agents-team` extension (if not already present)
3. Scaffold `.pi/agent/agents-team.json` with all protocol roles
4. Copy prompts, reference docs, team presets, and config templates
5. Add `.pi-team/` to your project `.gitignore`
6. Print next-step instructions

## Roles

| Role | Profile name | Thinking | Responsibility |
|---|---|---|---|
| **Team Lead** | `team-lead` | high | Coordinates the team, supervises, recovers stuck agents, escalates to human |
| **Principal Architect** | `principal-architect` | high | Owns the primary architecture position, gates design, reviews conformance |
| **Sceptical Architect** | `sceptical-architect` | high | Independently challenges design and review — blind-first assessments |
| **Security Reviewer** | `security-reviewer` | high | Independent security sign-off, threat modelling, abuse-path analysis |
| **Integrator** | `integrator` | medium | Only role that writes the feature branch; serialised merge and validation |
| **Backend** | `backend` | medium | Backend implementation in isolated worktrees |
| **Frontend** | `frontend` | medium | Frontend implementation in isolated worktrees |
| **QA** | `qa` | medium | Quality assurance, test coverage, regression validation |
| **Reviewer** | `reviewer` | medium | Independent code review against exact packages |
| **Product Manager** | `product-manager` | medium | Scope, acceptance criteria, product sign-off |
| **Explorer** | `explorer` | low | Fast investigation, codebase mapping, dependency tracing |
| **Fixer** | `fixer` | medium | Bug reproduction and fix implementation |
| **Librarian** | `librarian` | medium | Documentation, knowledge artefacts, contract registry |
| **Observer** | `observer` | low | Monitoring, status reporting, health checks |
| **Oracle** | `oracle` | high | Research, analysis, feasibility studies |
| **Designer** | `designer` | medium | UI/UX design, interface specifications |

## Task lifecycle

```
Intake → Triage → Planning → Design Gate → Implementation → Review → Delivery
                                                ↑                  │
                                                └── findings ───────┘
```

Each stage has explicit entry/exit criteria, owned artefacts, and structured coordination markers. See [`reference/task-lifecycle.md`](reference/task-lifecycle.md).

## Team presets

| Preset | Roster | Use when |
|---|---|---|
| `full-stack` | Lead · Principal Architect · Sceptical Architect · PM · Full Stack · QA | Features cutting through schema, API, and UI |
| `deep-backend` | Lead · Principal Backend Architect · Sceptical Architect · PM · Staff Engineer · QA | Domain logic, data models, APIs, performance |
| `deep-frontend` | Lead · Principal Frontend Architect · Sceptical Architect · PM · Frontend Engineer · QA | UI architecture, client state, design systems |
| `deep-security` | Lead · Principal Security Architect · Sceptical Architect · Security Engineer · PM · QA | Security features and hardening |
| `deep-infra` | Lead · Principal Infra Architect · Sceptical Architect · Security · PM · Cloud Engineer · SRE · QA | Cloud infrastructure, IaC, reliability |
| `deep-llm` | Lead · Principal LLM Architect · Sceptical LLM Architect · PM · LLM Engineer · Staff Backend · Full Stack · QA | LLM systems, RAG, evaluation, inference |

## How it works

Pi Team uses pi.dev's native orchestrator-worker RPC model:

1. The **orchestrator** (your main pi session) acts as Team Lead
2. Work is **delegated** to background RPC workers, each running a role-specific prompt
3. Workers return a compact `<final_answer>` block — the orchestrator never sees full transcripts
4. The orchestrator **waits** (zero-token) for workers, answers **relay questions** mid-flight, and synthesises results
5. Coordination happens through **structured markers** in task comments and the team workspace

```
┌─────────────────────────────────────────────────┐
│                 Orchestrator                      │
│              (Team Lead / user)                   │
│                                                   │
│  delegate_task ──► ┌──────────────┐               │
│                    │   Worker 1   │  (architect)  │
│  wait_for_agents ──►├──────────────┤               │
│                    │   Worker 2   │  (implement)  │
│  agent_message  ──►├──────────────┤               │
│                    │   Worker 3   │  (review)     │
│  agent_result   ◄──┴──────────────┘               │
│                                                   │
│  synthesise ──► user-facing answer                │
└─────────────────────────────────────────────────┘
```

## Configuration

After installation, configure your team in `.pi/agent/agents-team.json`:

```json
{
  "enabled": true,
  "routingMode": "team",
  "roles": {
    "team-lead": {
      "thinkingLevel": "high",
      "promptPath": ".pi-team/prompts/agents/team-lead.md"
    },
    "principal-architect": {
      "thinkingLevel": "high",
      "promptPath": ".pi-team/prompts/agents/principal-architect.md"
    }
    // ... see full config after install
  }
}
```

Toggle between team and solo mode:

```bash
pi /team-enable on     # team mode (default after install)
pi /team-enable off    # solo mode (standard pi without workers)
```

## Operator commands

| Command | What it does |
|---|---|
| `/team` | Open the live dashboard (workers, inspect, console, cost) |
| `/team-steer <id\|all> <msg>` | Message one worker or broadcast to all |
| `/team-stop <id\|all>` | Stop one or all workers |
| `/team-result <id>` | Print the worker's verbatim `<final_answer>` |
| `/team-enable on\|off` | Toggle between team and solo mode |
| `/team-init [global\|local]` | Scaffold config with built-in roles |

## Project structure after install

```
your-project/
├── .pi/
│   └── agent/
│       └── agents-team.json        # Pi Agents Team role config
├── .pi-team/
│   ├── prompts/
│   │   ├── orchestrator.md          # Orchestrator contract
│   │   └── agents/                  # 16 role-specific prompts
│   ├── reference/                   # Protocol documentation
│   ├── teams/                       # 6 preset team definitions
│   ├── config/
│   │   ├── team.json                # Default role config
│   │   ├── statuses.json            # Status state machine
│   │   └── charter.template.md      # Team charter template
│   └── bin/                         # Helper scripts
└── .gitignore                       # Updated with .pi-team/
```

## Documentation

| Document | Answers |
|---|---|
| [`reference/protocol.md`](reference/protocol.md) | What is the core protocol and its invariants? |
| [`reference/role-contracts.md`](reference/role-contracts.md) | What does each role promise to the others? |
| [`reference/task-lifecycle.md`](reference/task-lifecycle.md) | How does a goal pass through seven stages? |
| [`reference/harness-patterns.md`](reference/harness-patterns.md) | How is the protocol instantiated on pi.dev? |
| [`reference/team-charter.md`](reference/team-charter.md) | How is a team charter created and ratified? |
| [`reference/decision-escalation.md`](reference/decision-escalation.md) | Who decides what, and when to escalate? |
| [`reference/markers.md`](reference/markers.md) | What structured markers coordinate the team? |

## Requirements

- **pi.dev** (`@earendil-works/pi-coding-agent`) >= 0.80.6
- **Node.js** >= 22.19.0
- **Git**

## License

MIT