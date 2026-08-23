# BUG-002 — `install.sh` installs the public npm `pi-agents-team` instead of the local source

**Severity:** High — wrong code is shipped into every user project.

**Status:** Open — the fix described below was developed and verified
locally in an earlier session, but the corresponding code change to
`install.sh` was never committed. The current `install.sh` still calls
`pi install -l npm:pi-agents-team`, which is the buggy behaviour.
The bug file documents the planned fix so a future commit can land
it without re-deriving the design.

**Component:** `install.sh`

## Summary

`install.sh` Step 3 called `pi install -l npm:pi-agents-team`. `npm:` is a
pi resolver prefix that means *look up this name on the public npm
registry*. The package on the public registry
(`https://www.npmjs.com/package/pi-agents-team`, maintained by
`@esmaabi` / Kristjan Pikhof) is a different upstream project from the
fork that lives in this repo at `packages/pi-agents-team/`. Until this fix,
running the installer dropped the upstream package into the user's project
instead of this repo's own extension.

## Why this matters

- The repo's own extension is a Path A fork with different schemas, prompts,
  and runtime behaviour. Mixing the two leads to confusing failures where
  "the installer says success but pi-team commands don't behave as documented
  in this repo's `reference/`."
- The repo's documented identity ("comprehensive agentic team setup for
  pi.dev, implementing the Agentic Team Protocol") requires that the
  installed extension be the one developed alongside the protocol docs in
  this repo. The public-npm package is an independent upstream and does not
  satisfy that contract.

## Reproduction (against the unfixed installer)

```bash
git clone https://github.com/yakovkhalinsky/pi-team.git
cd pi-team
git checkout <commit-before-fix>     # any commit on the original `main`
git reset --hard b908774             # last commit before the fix, if available

# In a scratch project:
mkdir /tmp/bug002 && cd /tmp/bug002 && git init -q
/path/to/pi-team/install.sh

# Inspect what got installed:
cat .pi/settings.json
# => { "packages": ["npm:pi-agents-team"] }    # WRONG — this is the upstream package
```

The public-npm `pi-agents-team` `package.json` (verify with
`npm view pi-agents-team`):

```json
{
  "name": "pi-agents-team",
  "version": "2026.8.5",
  "maintainers": [{ "name": "esmaabi", "email": "kristjan@pikhof.eu" }],
  "homepage": "https://github.com/KristjanPikhof/pi-agents-team"
}
```

This repo's local fork (verify with
`cat ~/git/pi-team/packages/pi-agents-team/package.json`):

```json
{
  "name": "pi-agents-team",
  "version": "2027.0.0-path-a.0",
  "author": { "name": "Kristjan Pikhof", "url": "https://github.com/KristjanPikhof" },
  "homepage": "https://github.com/KristjanPikhof/pi-agents-team"
}
```

(Author and homepage overlap, but the version line and the surrounding
contents diverge — the local copy is the source of truth for this repo.)

## Fix

Changed `install.sh` Step 3 to:

1. Default `EXTENSION_PATH` to `${SOURCE_DIR}/packages/pi-agents-team`
   (works for both `bash install.sh` from a clone and
   `curl | bash` after a temp-clone).
2. Run `pi install -l "${EXTENSION_PATH}"` (a path source, not an npm name).
3. Fall back to `pi install "${EXTENSION_PATH}"` (global) if `-l` rejects
   the path source.
4. Print the absolute `EXTENSION_PATH` so the user can audit it.
5. Refuse to continue if the path is missing or has no `package.json` —
   `die` with a hint pointing at `--extension-path` and
   `--skip-extension`.
6. Add a new flag `-e, --extension-path DIR` so forks and CI overrides can
   pin a specific source location.

Updated the "Install manually" / "pi not found" hints to print the resolved
path instead of `npm:pi-agents-team`.

### Diff summary

```
 install.sh | 35 +++++++++++++++++++++++++++--------
 1 file changed, 27 insertions(+), 8 deletions(-)
```

(Exact diff is in the working tree; commit pending.)

## Verification

After applying the fix, running the installer against `/home/yakov/git/eden-memory`:

```
Step 3: Installing pi-agents-team extension

ℹ  Extension source: /home/yakov/git/pi-team/packages/pi-agents-team
ℹ  Installing pi-agents-team extension from local source...
Installing /home/yakov/git/pi-team/packages/pi-agents-team...
Installed /home/yakov/git/pi-team/packages/pi-agents-team
✓  pi-agents-team installed from local source (project-local)
```

And the resulting project-local `.pi/settings.json`:

```json
{
  "packages": [
    "../../pi-team/packages/pi-agents-team"
  ]
}
```

The relative path is resolved by pi against the project's `.pi/` directory
tree at load time, so it points at the local source on this machine. This is
the documented trade-off of source-only install — see the **Trade-offs**
note below.

## Trade-offs introduced by the fix

- The path stored in `.pi/settings.json` is machine-local. On a different
  machine (or after the source repo moves) the relative path will not
  resolve. This is acceptable per the project requirement that the extension
  always come from this repo's source, not a registry. It would be worth
  documenting this in the README's "Quick start" section so users don't try
  to copy the project to another machine and expect the install to be
  portable. A future enhancement could be a `pi-team-pin.sh` helper that
  rewrites the path on checkout.

## Files changed

- `install.sh` — Step 3 (extension install) and the help/usage text.
