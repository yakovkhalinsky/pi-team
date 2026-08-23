# Pi Agents Team (Path A)

Path A is a thin, native Pi extension. It exposes a small set of tools and slash commands for delegating work to specialist agents, plus a persistent on-screen **team-status widget** so you can see what your team is doing at a glance.

The orchestrator discovers role profiles from project-scope `.pi/agents/*.md` (walking up from the working directory) and the package-scope `.pi/agents/*.md` shipped with this extension. The team is **package + project agents only** — the user-scope directory (`~/.pi/agent/agents/*.md`) is intentionally not consulted, so the orchestrator always sees exactly the 6 pi-team protocol roles (plus any project-local overrides), never the stock pi `main` profile or any other user-scope profile. The extension then uses the built-in `delegate_task` and `wait_for_agents` tools to spawn worker Pi processes and collect their `<final_answer>` blocks.

## Team UI

The extension is always visible when the team is loaded. There is no toggle.

- **Footer status** — A persistent one-liner in the TUI footer such as `● Team (6 agents)` or `Team — builder working on "fix bug" · 2m`. Renders via `ctx.ui.setStatus` and updates on every state change.
- **Widget panel** — A multi-line panel below the editor listing active workers, recent terminal workers, the agent roster, and the eden-memory status / byMarker histogram. Renders via `ctx.ui.setWidget` with `placement: "belowEditor"`.
- **Per-tool feedback** — The footer status and the panel both update live as workers are spawned, complete, error out, or are aborted. No need to type a command to see what's happening.

When eden-memory is unreachable, the team falls back gracefully: a one-line footer status reads `Team unavailable — eden-memory unreachable`, a `ctx.ui.notify` is fired, and the orchestrator sees a normal pi session with no team tools. Fix the binary path (or install eden-memory) and restart pi.

## What remains

- `delegate_task` tool — spawn a worker Pi process for a profile and return its final answer.
- `wait_for_agents` tool — poll tracked workers until they are terminal, time out, or raise a relay question.
- `abort_worker` tool — terminate a running worker.
- `/stop-worker <workerId>` command — abort a worker by id.
- In-memory worker state with best-effort `pi.appendEntry` persistence.
- Eden-memory ATP integration — required. When the binary is reachable, the extension records lifecycle markers on `session_start`, `delegate_task`, and worker completion, runs a startup check for blocked/unfinished goals, and surfaces a per-marker histogram in both the team panel and every `delegate_task` / `wait_for_agents` tool result. When the binary is unreachable, the team falls back to a normal pi session. See [docs/memory.md](./docs/memory.md).
- Plain-JS source that ships as native ESM.

The orchestrator's system prompt is the authoritative discovery surface: every `before_agent_start` injects the `## Available team agents` block (with each profile's name and description) into the prompt, so the orchestrator always sees the live team without needing a manual slash command. There is no `/agents` command — discovery happens automatically.

## What was removed

The interactive dashboard, session recovery, custom persistence, parallel git worktrees, eden-memory integration, and the full set of old slash commands and tools are gone. See [MIGRATION.md](./MIGRATION.md) for the complete breaking-change list and migration steps.

## Install

```bash
pi install npm:pi-agents-team
```

For local development from this repository:

```bash
cd packages/pi-agents-team
npm install
pi -e ./src/extensions/index.ts
```

## Agent profile format

Create one Markdown file per agent under `.pi/agents/` (project-local). The team is the package-shipped 6 protocol roles plus any project-local overrides in this directory.

```markdown
---
name: builder
description: Implement code, tests, docs, and configuration inside a bounded scope.
tools:
  - read
  - bash
  - write
  - edit
model: ""
thinkingLevel: medium
---

# Builder Worker Contract

I am the **builder** worker...
```

Supported frontmatter fields:

- `name` (required) — profile identifier used by `delegate_task`.
- `description` (required) — short summary injected into the orchestrator prompt.
- `tools` (optional) — list of tool names the worker is allowed to use.
- `model` (optional) — override the worker model.
- `thinkingLevel` (optional) — `low`, `medium`, `high`, or `max`.

Everything after the frontmatter is used as the worker system prompt.

## Usage examples

Delegate work to the `builder` agent:

```json
{
  "tool": "delegate_task",
  "params": {
    "title": "Add smoke test",
    "goal": "Add a passing smoke test for the shell.",
    "profileName": "builder",
    "expectedOutput": "A passing test file under tests/"
  }
}
```

Wait for tracked workers:

```json
{
  "tool": "wait_for_agents",
  "params": {
    "workerIds": ["worker-123..."],
    "timeoutMs": 300000,
    "wakeOnRelay": true
  }
}
```

## Build and test

```bash
npm run build
npm run typecheck
npm test
```

## Migration

If you used the pre-Path-A `agents-team.json` configuration, read [MIGRATION.md](./MIGRATION.md) before upgrading.

## License

[MIT](LICENSE). Copyright © 2026 Kristjan Pikhof.
