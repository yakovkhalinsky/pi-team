# Migrating to Path A

Path A is a major simplification of `pi-agents-team`. It removes the heavy orchestrator-side overlay and replaces it with a thin native extension that discovers agents from Markdown profiles and delegates real work to worker Pi processes.

## What Path A changes

- **No more `/team` overlay.** The interactive dashboard, worker inspection, copy/result/steer/stop controls, and role-scoped routing UI are gone.
- **Configuration moves from `agents-team.json` to `.pi/agents/*.md`.** Each role becomes a single Markdown file with YAML frontmatter plus a prompt body.
- **No manual discovery command.** The agent list is injected into the orchestrator's system prompt on every `before_agent_start` (the `## Available team agents` block), so the orchestrator always sees the live team. There is no `/agents` command — discovery is the prompt, not a manual step.
- **Delegation is handled by built-in tools.** The extension registers `delegate_task` and `wait_for_agents`; the old `agent_status`, `agent_result`, `agent_message`, `ping_agents`, and `agent_cancel` tools are removed.
- **Eden-memory is a required primitive.** The team either loads fully (when `eden-memory` is healthy) or doesn't load (when the binary is unreachable). When it doesn't load, the orchestrator sees a normal pi session with no team tools, no team widget, no system-prompt block, a footer status reading `Team unavailable — eden-memory unreachable`, and a `ctx.ui.notify` fired with the same message. There is no `EDEN_MEMORY_ENABLED` env var; the var is silently ignored if set. To remove the team entirely, uninstall the extension.
- **Plain-JS compatibility is preserved.** The source is emitted JavaScript in `.ts` files; the runtime does not depend on TypeScript.

## Breaking changes

### Slash commands removed

The following commands no longer exist:

- `/team`
- `/team-steer`
- `/team-stop`
- `/team-enable`
- `/team-result`
- `/team-copy`
- `/team-init`
- `/team-env`
- `/agents` (the agent list is now in the system prompt; there is no command to list it)

Use the `delegate_task` / `wait_for_agents` tools to run and monitor work, and read the `## Available team agents` block in the orchestrator's system prompt to see which profiles are loaded.

### Tools removed

These orchestrator-facing tools are gone:

- `agent_status`
- `agent_result`
- `agent_message`
- `ping_agents`
- `agent_cancel`

`delegate_task` now returns the worker result directly, and `wait_for_agents` polls the in-memory worker map until workers are terminal, time out, or raise a relay question.

### Removed features

- Custom session persistence and recovery.
- Parallel git worktree creation and cleanup.
- The `/team-env` wizard, `.env` scaffolding, and eden-memory dashboard widgets (the interactive status UI is gone; the underlying ATP marker recording is preserved).
- Interactive dashboard, cost tracking, console/activity/Raw views, and transcript copying.
- `agents-team.json` schema, role merging, global/project config layering, and scaffold versioning.

## How to migrate an existing `agents-team.json`

For each profile in your old `agents-team.json` `roles` map, create a file named `.pi/agents/<profileName>.md` (project-local) or `~/.pi/agent/agents/<profileName>.md` (global).

### Frontmatter mapping

Old `agents-team.json` fields map to YAML frontmatter as follows:

| Old JSON field | New Markdown frontmatter | Notes |
|---|---|---|
| `name` or role key | `name` | Identifier passed to `delegate_task`. |
| `description` | `description` | Shown by `/agents` and injected into the orchestrator prompt. |
| `access.tools` | `tools` | Array or comma-separated tool names. |
| `model` | `model` | Optional worker model override. |
| `thinkingLevel` | `thinkingLevel` | Optional `low` / `medium` / `high` / `max`. |

### Example migration

Old `agents-team.json`:

```json
{
  "schemaVersion": 4,
  "enabled": true,
  "roles": {
    "builder": {
      "description": "Implement scoped changes and verify them.",
      "access": {
        "tools": ["read", "bash", "write", "edit", "git"]
      },
      "model": "",
      "thinkingLevel": "medium",
      "prompt": "prompts/agents/builder.md"
    }
  }
}
```

New `.pi/agents/builder.md`:

```markdown
---
name: builder
description: Implement scoped changes and verify them.
tools:
  - read
  - bash
  - write
  - edit
  - git
model: ""
thinkingLevel: medium
---

# Builder Worker Contract

I am the **builder** worker...
```

Everything after the closing `---` of the frontmatter becomes the worker system prompt. If your old profile pointed to an external prompt file, copy the file contents into the body of the new Markdown file.

### Discovery rules

1. The extension walks from the current working directory upward looking for `.pi/agents/`.
2. It also loads `~/.pi/agent/agents/*.md` if present.
3. Project-local profiles override global profiles with the same `name`.
4. A profile is valid only if it has both `name` and `description` frontmatter strings.

## New usage examples

### List agents

```
/agents
```

Example output injected into the orchestrator prompt:

```text
## Available team agents

- builder: Implement scoped changes and verify them.
- verifier: Review changes for correctness and safety.

Use the `delegate_task` tool to assign work to one of these agents.
Use the `wait_for_agents` tool to collect results before proceeding.
```

### Delegate a task

```json
{
  "title": "Add migration guide",
  "goal": "Write MIGRATION.md covering Path A changes.",
  "profileName": "builder",
  "cwd": "packages/pi-agents-team",
  "expectedOutput": "A concise markdown migration guide"
}
```

`delegate_task` spawns a worker Pi process with:

- `--mode json -p --no-session`
- the agent system prompt appended via `--append-system-prompt`
- optional `--model`, `--thinking`, and `--tools`
- minimal worker flags (`--no-extensions`, `--no-prompt-templates`, `--no-themes`, `--no-context-files`, `--no-skills` unless `skills` are requested)

It returns a compact JSON payload:

```json
{
  "workerId": "worker-1699999999999-abc123",
  "status": "completed",
  "result": {
    "headline": "wrote migration guide",
    "finalAnswer": "..."
  },
  "memory": {
    "enabled": true,
    "healthy": true,
    "recordsWritten": 4,
    "byMarker": {
      "[routing]":   { "ok": 1, "error": 0, "skipped": 0 },
      "[action]":    { "ok": 1, "error": 0, "skipped": 0 },
      "[verdict]":   { "ok": 1, "error": 0, "skipped": 0 },
      "[recorded]":  { "ok": 1, "error": 0, "skipped": 0 }
    }
  }
}
```

The optional `memory` block is present whenever eden-memory is enabled and configured. It carries a per-marker histogram so the orchestrator can verify the lifecycle completed without parsing the durable store. See [docs/memory.md](./docs/memory.md) for the full schema.

### Wait for agents

```json
{
  "workerIds": ["worker-1699999999999-abc123"],
  "timeoutMs": 300000,
  "wakeOnRelay": true
}
```

`wait_for_agents` returns one of the following reasons:

- `all_terminal` — every requested worker is `completed`, `error`, `exited`, or `aborted`.
- `relay_raised` — a worker has a pending relay question and `wakeOnRelay` is true.
- `timeout` — the wait exceeded `timeoutMs`.

## Stability improvements and known limitations

### Improvements

- Smaller surface area means fewer moving parts and less state to corrupt.
- Worker results are produced by real `pi` subprocesses and are returned verbatim.
- No global state file or `.env` setup is required.
- Deterministic agent list injection prevents the orchestrator from hallucinating available roles.

### Known limitations

- **No interactive dashboard.** Worker progress is not shown in a TUI dashboard. Use `wait_for_agents` and the returned JSON payloads.
- **Best-effort persistence.** The extension writes a single `pi-agents-team/state` entry via `pi.appendEntry` on load and session start, but worker transcripts, activity streams, and usage details are not persisted.
- **No automatic recovery.** If the main Pi session exits, in-memory worker state is lost. Re-run `delegate_task` for any unfinished work.
- **No parallel git worktrees.** Workers run in the directory supplied by `cwd` (defaulting to the orchestrator cwd). Manage worktrees externally if you need them.
- **No eden-memory dashboard.** ATP markers are still written to the configured SQLite store when enabled, but there is no TUI status widget or cost tab. The orchestrator's view of memory state is the `memory` block on `delegate_task` / `wait_for_agents` payloads (see above). Use the durable store directly if you need to inspect history.
- **Eden-memory startup blocked-task check.** On `session_start`, the extension queries eden-memory for goals that look blocked or unfinished and appends a short summary to the orchestrator prompt. Failures are logged via `pi.appendEntry` and do not block startup.
- **`agent_message` is gone.** Relay questions are surfaced by `wait_for_agents`; respond to them in the main session by calling `delegate_task` again or by updating the worker context directly.

## Rollback

Path A is intentionally not backward compatible. If you need the old dashboard, persistence, or worktree features, stay on the pre-Path-A release branch and do not install the Path A package version.
