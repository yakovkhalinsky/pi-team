# Pi Agents Team (Path A)

Path A is a thin, native Pi extension. It exposes a small set of tools and slash commands for delegating work to specialist agents, plus a persistent on-screen **team-status widget** so you can see what your team is doing at a glance.

The orchestrator discovers role profiles from `.pi/agents/*.md` (and optional `~/.pi/agent/agents/*.md`), then uses the built-in `delegate_task` and `wait_for_agents` tools to spawn worker Pi processes and collect their `<final_answer>` blocks.

## Team UI

The extension is always visible:

- **Footer status** — A persistent one-liner in the TUI footer such as `● Team (7 agents)` or `● Team (1 running: builder)`. Renders via `ctx.ui.setStatus` and updates on every state change.
- **`/team` command** — Toggles a multi-line panel below the editor listing discovered agents, currently running workers, and the eden-memory status / byMarker histogram (when memory is enabled). Renders via `ctx.ui.setWidget` with `placement: "belowEditor"`.
- **Per-tool feedback** — The footer status and the panel both update live as workers are spawned, complete, error out, or are aborted. No need to type a command to see what's happening.

```
/team      # toggle the team panel below the editor (agent list, running workers, memory)
/agents    # list discovered agents (or show details: /agents <name>)
```

## What remains

- `/team` slash command — toggle the on-screen team panel.
- `/agents` slash command — list discovered agent profiles.
- `delegate_task` tool — spawn a worker Pi process for a profile and return its final answer.
- `wait_for_agents` tool — poll tracked workers until they are terminal, time out, or raise a relay question.
- `abort_worker` tool — terminate a running worker.
- `/stop-worker <workerId>` command — abort a worker by id.
- In-memory worker state with best-effort `pi.appendEntry` persistence.
- Eden-memory ATP integration (optional) — when `EDEN_MEMORY_ENABLED=true` and the required env fields are configured, the extension records lifecycle markers on `session_start`, `delegate_task`, and worker completion, runs a startup check for blocked/unfinished goals, and surfaces a per-marker histogram in both the team panel and every `delegate_task` / `wait_for_agents` tool result. See [docs/memory.md](./docs/memory.md).
- Plain-JS source that ships as native ESM.

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

Create one Markdown file per agent under `.pi/agents/` (project-local) or `~/.pi/agent/agents/` (global):

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
- `description` (required) — short summary shown by `/agents` and injected into the orchestrator prompt.
- `tools` (optional) — list of tool names the worker is allowed to use.
- `model` (optional) — override the worker model.
- `thinkingLevel` (optional) — `low`, `medium`, `high`, or `max`.

Everything after the frontmatter is used as the worker system prompt.

## Usage examples

List available agents:

```
/agents
```

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
