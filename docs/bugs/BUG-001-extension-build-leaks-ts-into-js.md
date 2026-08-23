# BUG-001 — Extension build emits TypeScript-only syntax into `.js` output; runtime parse error in pi

**Severity:** High — the `pi-agents-team` extension is non-functional in any
project that installs it. Pi fails to start.

**Status:** Fixed (commit `7034f59`)

**Component:** `packages/pi-agents-team/`

## Closing note

Closed by commit `7034f59` "fix(memory): strip TypeScript syntax from runtime .ts files".

The fix took **option 2** of the proposed approaches, but applied at the
**source level** rather than as a post-build transform: the three offending
runtime files (`atp-markers.ts`, `memory-status.ts`, `atp-recorder.ts`) were
rewritten as plain JavaScript with all type annotations moved to the sibling
`.d.ts` files. The build script's structural-copy assumption — that the TS
sources are pure JS — is now correct for every file in the tree.

The plan's "recommended" option (transpile with `tsc`) was **not** taken.
The source-as-JS-with-sibling-types convention matches the rest of the
package and avoids introducing a second compilation step.

### Follow-up: still-needed CI guard

The original "Proposed fix" ended with:

> add a CI step that runs `node --check dist/extensions/index.js` (and
> ideally every emitted file) so this regression cannot reappear silently.

This guard was **not** added as part of the original fix. The Path A team-status
widget (`docs/plans/team-status-widget.md`, merged) significantly increases
the build output's surface area, making a `node --check` guard more important,
not less. Recommended follow-up: a `npm run lint:dist` script that runs
`node --check` over every `.js` in `dist/`, wired into CI.


**Component:** `packages/pi-agents-team/`

## Summary

`packages/pi-agents-team/scripts/build.mjs` is a "structural copy" — it copies
`.ts` files to `.js` without transpilation. Several source files contain
TypeScript-only syntax (notably `import type … from "…"`, generic parameter
annotations on `const` declarations, and `as` casts). That syntax ends up in
the emitted `.js` files, which Node refuses to parse when pi loads the
extension at startup.

## Reproduction

From a clean checkout of `~/git/pi-team`:

```bash
# 1. Build the local extension
cd ~/git/pi-team
pnpm install
pnpm run build

# 2. Confirm the broken output exists
grep -n "import type" packages/pi-agents-team/dist/src/memory/atp-recorder.js
# => 25:import type {

# 3. Install into a project and try to start pi
cd /tmp && mkdir bug001 && cd bug001
git init -q
~/git/pi-team/install.sh --extension-path ~/git/pi-team/packages/pi-agents-team
echo "/exit" | pi
```

## Actual output

```
Error: Failed to load extension "/home/yakov/git/pi-team/packages/pi-agents-team/dist/extensions/index.js":
Failed to load extension: ParseError: Unexpected token, expected "from"
  /home/yakov/git/pi-team/packages/pi-agents-team/dist/src/memory/atp-recorder.js:25:12
Hint: Start without extensions using "pi -ne".
```

## Expected output

Pi starts normally and the extension's commands/tools are available.

## Affected files

Files in `dist/` that are direct `.ts` → `.js` copies and contain TypeScript-only syntax. Confirmed via `grep -n "import type" dist/ src/`:

- `dist/src/memory/atp-recorder.js` — `import type` at line 25; also TS annotations on `const` and `as` casts throughout
- `dist/src/memory/memory-status.js` — `import type` at line 1; TS annotations
- The corresponding `.d.ts` files are also direct copies (acceptable in `.d.ts`, but the build script doesn't differentiate)

There may be additional files in `dist/src/memory/` (e.g. `atp-markers.js`,
`blocked-goals.js`, `eden-memory.js`) that exhibit the same pattern but are
not currently reached by the loader's import graph.

## Root cause

`scripts/build.mjs` comment says:

> The TS sources are pure JS emitted by the original compile, so this script
> performs a structural copy: .ts -> .js and .d.ts -> .d.ts, preserving
> relative ESM import specifiers.

That assumption is wrong for the `src/src/memory/` subtree — those sources are
hand-written TypeScript and were never pre-compiled. The script needs to
either:

1. **Transpile** the `.ts` files using a TypeScript-aware toolchain (e.g.
   `tsc --emitDeclarationOnly false --target es2022 --module nodenext`), or
2. **Strip** TS-only syntax from the emitted `.js` files (regex pass to drop
   `import type {…}` blocks, generic param annotations on locals, and `as`
   casts), or
3. **Pin `.ts` → keep as `.ts`** and rely on Node's experimental TS stripping
   (`--experimental-strip-types`, Node 22.6+).

## Proposed fix

Recommended: option 1 (transpile with `tsc`). It's the most correct, and the
repo already declares `typescript` as a devDependency and ships a
`tsconfig.json`. Replace the structural copy in `scripts/build.mjs` with a
`tsc -p .` invocation that emits to `dist/`. Test that the resulting `dist/`
is plain ESM JavaScript.

If transpilation is too disruptive for an interim release, option 2 (a regex
pre-processor that strips `import type` lines and known annotations) is a
quick, low-risk mitigation. Whichever direction is taken, add a CI step
that runs `node --check dist/extensions/index.js` (and ideally every emitted
file) so this regression cannot reappear silently.

## Related

- `packages/pi-agents-team/scripts/build.mjs` — the broken build script.
- `packages/pi-agents-team/tsconfig.json` — exists but is unused by the build.
- `package.json` `scripts.build` — calls `node scripts/build.mjs`.
