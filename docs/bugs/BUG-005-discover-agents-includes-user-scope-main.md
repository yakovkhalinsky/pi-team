# BUG-005 — `discoverAgents` includes user-scope `~/.pi/agent/agents/*.md` profiles; orchestrator sees 7 agents instead of 6 pi-team roles

**Severity:** Medium — the orchestrator's `## Available team agents` block, the `/team` widget, the `/agents` slash command, and the `delegate_task` profile validation all include a 7th agent (`main`, the default pi profile from `~/.pi/agent/agents/main.md`) that is not part of the pi-team protocol. The user wants the team to be exactly the 6 protocol roles.

**Status:** Fixed (`afc8fe7`). Option A applied — user-scope branch dropped from `discoverAgents`; the team is now `package + project` only. Verified end-to-end: `pi -p "list the agents from your system prompt block"` in `~/git/eden-memory`, `~/git/pi-team`, and `~` all return exactly 6 names with no `main`; the widget footer reads `Team (6 agents)`; `delegate_task` with `profileName: "main"` returns the "Unknown agent profile" error.

**Component:** `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts` (`discoverAgents`)

## Summary

`discoverAgents(cwd)` in the Path A extension currently reads agent profiles from three locations and merges them:

| Source | Path | Examples |
|---|---|---|
| user | `~/.pi/agent/agents/*.md` | `main` (the default pi profile that ships with pi core) |
| project | `<cwd>/.pi/agents/*.md` (walking up) | project-specific team members |
| package | `<extension>/.pi/agents/*.md` | the 6 pi-team roles: `archivist`, `builder`, `dispatcher`, `researcher`, `runtime`, `verifier` |

The merge order is user → package → project, with later sources overriding earlier ones on a name clash. The result is a single sorted list of discovered agents.

In a clean install (no project-local `.pi/agents/`, default pi profile in `~/.pi/agent/agents/main.md`), the orchestrator sees **7 agents** instead of the documented 6 pi-team roles:

```
$ cd ~/git/eden-memory && pi -p "list agents from your system prompt block"
archivist
builder
dispatcher
main              <-- not a pi-team role; comes from ~/.pi/agent/agents/main.md
researcher
runtime
verifier
```

Same result in `~/git/pi-team` and in `~`. The 7th entry is always the user-scope `main` profile.

## Why this matters

The user expects the team to be exactly the 6 pi-team protocol roles. The presence of `main` in the team list:

- **Pollutes the team-status widget.** The footer and panel list `main` next to `builder` and friends, with no visual indicator that it is not a protocol role. A new user looking at the team has to know which names are "real" team members and which are leftovers from the default pi profile.
- **Pollutes the system prompt block.** The orchestrator's `## Available team agents` section lists all 7. The orchestrator can mistakenly route work to `main` even when a protocol role is more appropriate.
- **Pollutes `delegate_task` validation.** A `profileName: "main"` call succeeds even though `main` is not part of the team. The user did not intend `main` to be a valid delegation target.
- **Misrepresents the protocol.** The pi-team `reference/protocol.md` documents exactly six roles. The orchestrator's view of "the team" should match.

## Reproduction

From a clean checkout with default pi config (the stock `~/.pi/agent/agents/main.md` exists) and the pi-team extension installed (any project that has `packages/pi-agents-team/` in its `pi install` settings):

```bash
# 1. Confirm the user-scope profile exists.
ls -la ~/.pi/agent/agents/
# => main.md

# 2. Confirm the user-scope profile is in the orchestrator's view.
cd ~/git/eden-memory
pi -p "Print the exact list of agent names from the '## Available team agents' section of your system prompt. One per line."

# Actual:
#   archivist
#   builder
#   dispatcher
#   main              <-- not a pi-team role
#   researcher
#   runtime
#   verifier

# 3. Confirm the widget shows 7.
# Open interactive pi, look at the footer: "Team (7 agents)".
# Type /team to toggle the panel. Count the listed agents. It is 7.

# 4. Confirm delegate_task accepts "main".
pi -p "Use the delegate_task tool with profileName=\"main\" and any goal."
# => succeeds (or fails for some other reason, but not "Unknown agent profile: main").
```

## Expected

The orchestrator sees exactly 6 agents: `archivist`, `builder`, `dispatcher`, `researcher`, `runtime`, `verifier`. The `main` profile is not listed in the system prompt, the widget, the `/agents` command output, or accepted as a `delegate_task` `profileName`.

## Root cause

`discoverAgents` in `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts` reads the user-scope directory without filtering:

```ts
function discoverAgents(cwd) {
  const userDir = path.join(getAgentDir(), "agents");
  const projectDir = findProjectAgentsDir(cwd);
  const packageDir = getPackageAgentsDir();

  const userAgents = loadAgentsFromDir(userDir, "user");
  const projectAgents = projectDir ? loadAgentsFromDir(projectDir, "project") : [];
  const packageAgents = loadAgentsFromDir(packageDir, "package");

  const map = new Map();
  for (const agent of userAgents) map.set(agent.name, agent);
  for (const agent of packageAgents) map.set(agent.name, agent);
  for (const agent of projectAgents) map.set(agent.name, agent);

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
```

The user-scope branch is unconditional. The original intent (per the README and the protocol docs) was for the team to be the 6 protocol roles, with project-local `.pi/agents/*.md` as the supported extension point. The user-scope branch was likely added to allow custom user profiles to participate, but it has the side effect of also pulling in `main`, which is the default pi agent and not a team member.

## Proposed fix

Two design choices to confirm before implementing.

### Option A: exclude the user-scope directory entirely (broadest reading)

Drop the user-scope branch. The team is `package + project` only. The orchestrator never sees anything in `~/.pi/agent/agents/`.

- **Pros:** matches the user's stated intent ("only the 6 pi-team agents"). Simple. Predictable contract. Project-local `.pi/agents/*.md` still works for project-specific extensions.
- **Cons:** a user who has a custom user-scope profile (e.g. `~/.pi/agent/agents/security-reviewer.md`) loses access to it in the team. They would have to copy it into their project's `.pi/agents/`. This is arguably the right trade-off (user-scope is for pi's default agent, not for the team), but it is a behaviour change that could surprise someone.

### Option B: filter `main` by name (narrowest reading)

Keep the user-scope branch but skip the profile named `main`. Other user-scope profiles still join the team.

- **Pros:** minimal change. Only the actual offender (`main`) is removed. Custom user-scope profiles still work.
- **Cons:** treats the symptom, not the cause. If the user adds a different default agent later (e.g. `default` or `assistant`), the bug returns. The contract becomes "the team excludes `main`" which is a brittle special case.

The user said: *"when pi-team is installed we want the project to only see the 6 pi-team agents, orchestrator should not have access to main(default) agent."*

Read literally this is closer to Option B (filter `main`). But the framing "only the 6 pi-team agents" is closer to Option A. Both readings are defensible. **Recommended: Option A**, with the rationale that the user-scope directory is for pi's default agent, not for the team, and any custom team agents belong in a project's `.pi/agents/`.

### Implementation (Option A)

1. **Remove the user-scope branch from `discoverAgents`.** Delete the `userDir` lookup, the `userAgents` load, and the `for (const agent of userAgents) map.set(...)` line.
2. **Drop the now-unused `getAgentDir` import** if nothing else in the file uses it. (Likely it can go; verify with a grep.)
3. **Update the test suite.** Several existing tests assert "7 agents" in this environment. They should assert "6 agents" (or be made source-agnostic by counting the package agents and adding project-scope agents explicitly). The `_testing.discoverAgents` test in `tests/shell.test.ts` is the main place to update.
4. **Update `package.json` description and the README "Team UI" section** to clarify that the team is `package + project` agents only. The user-scope directory is not part of the team.
5. **Consider deleting or renaming `~/.pi/agent/agents/main.md`.** Out of scope for this bug — the file is pi core's default agent, not the team's. The user did not ask to delete it. Note in the commit that the file is intentionally left in place.

### Implementation (Option B)

1. **Filter `main` from the user-scope load.** In `loadAgentsFromDir` for the user dir, skip entries whose name is `main`. Or filter the loaded list before merging.
2. **Update the test suite** to assert "6 agents" instead of "7".
3. **Document the special case** in the README and a code comment.

## Files affected

- `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts` — `discoverAgents` (and possibly the import of `getAgentDir`).
- `packages/pi-agents-team/tests/shell.test.ts` — multiple assertions that count agents, plus any test that pre-seeds user-scope agents.
- `packages/pi-agents-team/README.md` — "Team UI" / "What remains" sections.

## Verification

- `npm run build`, `npm run typecheck`, `npm test` — all green, 112+ tests pass.
- Manual in eden-memory: `pi -p "list the agents from your system prompt block"` shows exactly 6 names, no `main`.
- Manual in `~`: same, 6 names.
- Manual in `~/git/pi-team`: same, 6 names.
- Open interactive `pi` in eden-memory: footer says `Team (6 agents)`, `/team` panel lists 6, no `main`.
- `delegate_task` with `profileName: "main"` returns the existing "Unknown agent profile" error.

## Risk

- **Behaviour change.** Any downstream user who was relying on a custom user-scope profile being part of the team will lose that. For Option A, this is the entire point. For Option B, this is contained to the `main` profile only.
- **No file deletion.** `~/.pi/agent/agents/main.md` is not touched. pi core still uses it as the default agent for sessions that are not team-managed.
- **Test surface.** The existing test suite is calibrated for 7 agents in this environment. Updating the assertions is mechanical but spans several tests.

## Workaround (today)

Manual, per-project: delete or rename `~/.pi/agent/agents/main.md`. This hides `main` from `discoverAgents` and the orchestrator sees 6. Side effect: pi's default agent for non-team sessions also disappears, which may break the default interactive flow.

The right fix is the code change in `discoverAgents`, not the workaround.

## Related

- `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts` — `discoverAgents`, `loadAgentsFromDir`, `getPackageAgentsDir`, `findProjectAgentsDir`.
- `reference/protocol.md` — the 6 protocol roles the team is supposed to be.
- `ac33610` — added the team-status widget, which surfaces the 7-agent count visibly.
- `BUG-004` — the team widget's visual is also unverified, but the data is the issue here.

## Closing commit

[`afc8fe7`](https://github.com/yakovkhalinsky/pi-team/commit/afc8fe7) —
`fix(discovery): BUG-005 — drop user-scope agents from team`.
