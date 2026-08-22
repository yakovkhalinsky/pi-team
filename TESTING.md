# Testing the Pi Agents Team extension locally

This repo uses a pnpm 11 workspace. All commands below are run from the repo root unless noted.

## Quick build & install

```bash
# Ensure pnpm 11.22.0 is active
cd /home/yakov/git/pi-team
pnpm --version        # should print 11.22.0

# Install all workspace dependencies
pnpm install

# Build the local extension package
pnpm run build        # => Built dist: 110 file(s), 48 declaration(s)

# Verify Pi wiring resolves the local package
cd .pi/npm
node --input-type=module -e 'import mod from "pi-agents-team"; console.log(typeof mod)'
# should print "function"
cd ../..
```

If pnpm is not on your PATH, run it through the pinned version:

```bash
pnpm exec pnpm --version
```

## Run Pi

Start `pi` in the repo root so it loads the local extension:

```bash
cd /home/yakov/git/pi-team
pi
```

## Smoke tests inside Pi

### 1. Role names match the paper

Type:

```
/team-enable on
```

Expected: the response lists the six Agentic Team Protocol roles:
`dispatcher`, `builder`, `runtime`, `verifier`, `researcher`, `archivist`.
Old names like `explorer`, `fixer`, `reviewer`, `observer` must not appear.

### 2. Wide-terminal overlay

Resize your terminal to at least 80 columns, then:

```
/team
```

Expected: a small overlay anchored at the bottom-right (40% width, 40% height).
It should not cover the whole chat, and the editor should stay visible.

### 3. Narrow-terminal inline text

Open a narrow terminal (or resize):

```bash
stty cols 50
pi
```

Inside Pi:

```
/team
```

Expected: instead of opening an overlay, Pi emits a compact inline dashboard
into the chat history. The status line collapses to glyph-only (e.g. `T▶`).

Resize back when done:

```bash
stty cols 120
```

### 4. Overlay action keys

On a wide terminal:

```
/team
```

Use the overlay:

- Arrow keys / `j` / `k` — navigate workers
- `s` — editor prefills `/team-steer <selected-id> `
- `m` — editor prefills `/team-steer <selected-id> `
- `c` or `x` — editor prefills `/team-stop <selected-id> `
- `p` — prunes terminal workers and closes the overlay
- `q` or `esc` — closes the overlay

Expected: after `s`/`m`/`c`/`x`, focus returns to the main editor with the slash
command already typed. Press Enter to submit it.

### 5. Inspect a worker inline

On a narrow terminal:

```
/team w1
```

Expected: compact inspect text emitted into the chat history, not an overlay.

On a wide terminal:

```
/team w1
```

Expected: overlay opens to the Inspect tab for that worker.

### 6. Delegate using paper roles

Ask the orchestrator to use a specific role:

```
/researcher: find where authentication is handled
```

or

```
Use the team. Researcher should find where auth is handled, then builder should refactor it.
```

Expected: spawned worker IDs show `profileName: researcher`, `builder`, etc.
No `explorer`, `fixer`, or `reviewer` workers should be created.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Old role names still appear | Run `/team-init --force` to regenerate `.pi/agent/agents-team.json`, then restart Pi. |
| `/team` opens the old large overlay | `dist/` is stale. Run `pnpm run build` and restart Pi. |
| Extension fails to load | Reinstall wiring: `pnpm install`. Check `.pi/npm/node_modules/pi-agents-team` symlinks to `packages/pi-agents-team`. |
| `pi` command not found | Make sure the `pi` binary is on your PATH or use `npx pi` / the full path. |
| npm scripts fail | Use `pnpm`. `npm install` and `npm run build` are no longer configured. |

## Reset to clean state

```bash
rm -rf node_modules .pnpm-store .pi/npm/node_modules packages/pi-agents-team/node_modules
pnpm install
pnpm run build
```
