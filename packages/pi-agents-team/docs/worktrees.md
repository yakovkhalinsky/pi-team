# Parallel git worktrees

Pi Agents Team can run each delegated task in its own git worktree so that parallel builders, runtimes, and verifiers do not collide on the same checked-out working tree. Worktree support is **disabled by default** and is opt-in via `agents-team.json`.

## When to enable worktrees

Enable worktrees when you routinely delegate multiple concurrent tasks that write files or run builds/tests in the same repository. Isolating each worker in its own checkout prevents:

- Uncommitted file changes from one worker confusing another.
- Build artefacts, `node_modules`, or generated files from parallel jobs clobbering each other.
- Branch checkout races when workers need different base states.

Keep worktrees disabled for simple, read-only analysis tasks where sharing the orchestrator's working tree is fine.

## Configuration

Add a top-level `worktree` block to `agents-team.json`:

```json
{
  "schemaVersion": 4,
  "enabled": true,
  "worktree": {
    "enabled": true,
    "basePath": ".pi-team/worktrees",
    "cleanupOnTerminal": true,
    "cleanupOnPrune": true
  },
  "roles": {}
}
```

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Master switch. When `false`, workers use the requested `cwd` directly. |
| `basePath` | `.pi-team/worktrees` | Directory under the git root where worktrees are created. Absolute paths are used as-is; relative paths resolve against the repo root. |
| `cleanupOnTerminal` | `true` | Remove the worktree when the worker becomes terminal via cancel, close, error, or normal completion. |
| `cleanupOnPrune` | `true` | Remove the worktree when `/team` prune (or the `p` dashboard key) evicts a terminal worker. |

If `worktree` is omitted, the defaults above apply with `enabled: false`.

## How it works

When a task is delegated and worktrees are enabled:

1. The extension detects the git repository root by running `git rev-parse --show-toplevel` from the requested `cwd`.
2. It creates a dedicated worktree at `<repoRoot>/<basePath>/<workerId>` with `git worktree add --detach <path>`.
3. The worker RPC process is launched with that worktree as its `cwd`.
4. The worktree path is recorded in worker state and surfaces in:
   - `/team` dashboard Inspect tab
   - `/team-copy` output
   - `agent_status` details
   - ATP `[recorded]`/worker-event markers as `worktreePath`
5. On terminal transition or prune, the extension runs `git worktree remove <path>` and falls back to recursive directory removal if git metadata is already gone.

Non-git projects are handled gracefully: when `fallbackToOriginalCwd` is enabled (the default), the worker simply uses the requested `cwd`. The fallback behaviour is baked into the `WorktreeManager`; users do not configure it directly.

## Reusing workers

Reused workers keep their original worktree because the RPC process was spawned there. `delegate_task.reuseWorkerId` only succeeds when the resolved worktree path for that `workerId` matches the worker's recorded `cwd`. Because worktree paths are deterministic per `workerId`, this is automatic unless the `basePath` config changes between the original launch and the reuse request.

## Safety and containment

- Worktrees are always created inside the detected git root, so they respect `safety.allowWorkerPathsOutsideProject: false`.
- The worker's `pathScope` roots are resolved against the worktree `cwd`, not the orchestrator's `cwd`. If you want a worker to read from the orchestrator's tree as well, use absolute roots or set `allowReadOutsideRoots: true`.
- Cleanup is best-effort. A worker that holds files open or leaves a subprocess in the worktree may prevent removal; the extension records the failure but does not block the rest of the session.

## Operational tips

- Add `.pi-team/worktrees/` to your `.gitignore` so the worktree directories do not show up as untracked files in the main tree.
- If you switch `basePath` while workers are still live, reuse of those workers will fail with a `cwd` mismatch. Prune terminal workers before changing the base path.
- Worktrees share the same `.git` object database, so cloning and fetching are cheap, but large build outputs inside each worktree still consume disk space. Keep `cleanupOnTerminal: true` unless you need to inspect the tree after the worker finishes.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `git worktree add` fails with "already a worktree" | A stale worktree entry exists from a crashed session. | Run `git worktree list`, then `git worktree remove --force <path>`. |
| Worker cannot see orchestrator's uncommitted changes | Worktrees start detached and do not inherit working-tree changes. | Commit or stage the changes you want the worker to see, or design tasks that do not rely on them. |
| Reuse fails with cwd mismatch | `basePath` changed, or the original worker's worktree was removed. | Delegate a fresh worker. |
