# Bugs

Reports for known issues in this repo, tracked here so they can be picked up and
fixed in batches. Each bug lives in its own file with a stable id, reproduction
steps, and a proposed fix direction. Use the id when referencing a bug in
commits or PRs.

## Index

| ID | Title | Severity | Status |
|---|---|---|---|
| [BUG-001](./BUG-001-extension-build-leaks-ts-into-js.md) | Extension build emits TypeScript-only syntax into `.js` output; runtime parse error in pi | High — extension is non-functional | Fixed (`7034f59`) |
| [BUG-002](./BUG-002-installer-pulls-from-public-npm-registry.md) | `install.sh` installs the public npm `pi-agents-team` (a different upstream package) instead of the local source | High — wrong code shipped into user projects | Open — fix designed but not committed |
| [BUG-003](./BUG-003-test-runner-open-handle-leak.md) | `npm test` hangs for ~25s after printing the summary because of an open handle; `--test-force-exit` masks it | Medium — slow CI; future leaks will be invisible | Open |
| [BUG-004](./BUG-004-team-widget-visual-not-verified-in-tui.md) | Team-status widget contents are unit-tested but the rendered TUI appearance has not been visually verified | Low — data is correct, visual is unverified | Open |
| [BUG-005](./BUG-005-discover-agents-includes-user-scope-main.md) | `discoverAgents` includes user-scope `~/.pi/agent/agents/*.md`; orchestrator sees 7 agents (incl. default `main`) instead of 6 pi-team roles | Medium — wrong team size in widget, system prompt, `/agents`, and `delegate_task` validation | Open — fix designed but deferred |

## Severity rubric

- **High** — the project is non-functional, ships wrong code, or corrupts state.
- **Medium** — the project works but with degraded behaviour or visible warnings.
- **Low** — cosmetic, doc, or nice-to-have.

## Conventions

- Each bug file uses the template below.
- Keep the **Reproduction** section runnable from a clean clone.
- Mark **Status** as `Open`, `In Progress`, `Fixed`, or `Wontfix`.
- When fixed, link the closing commit in the file's footer.
