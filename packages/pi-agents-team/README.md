# Pi Agents Team (Path A)

Path A is a thin, native Pi extension that replaces the previous `/team` overlay with minimal, deterministic multi-agent support.

The orchestrator discovers role profiles from `.pi/agents/*.md` (and optional `~/.pi/agent/agents/*.md`), then uses the built-in `delegate_task` and `wait_for_agents` tools to spawn worker Pi processes and collect their `<final_answer>` blocks.

## What remains

- `/agents` slash command — list discovered agent profiles.
- `delegate_task` tool — spawn a worker Pi process for a profile and return its final answer.
- `wait_for_agents` tool — poll tracked workers until they are terminal, time out, or raise a relay question.
- In-memory worker state with best-effort `pi.appendEntry` persistence.
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
