# Research: Fleet TUI prototypes

**Date:** 2026-08-23
**Status:** Research in progress
**Method:** Prototype-driven (build cheap artefacts first; only graduate to plans/references once we know which solution is right)
**Prototypes in this directory:** 1

| # | File | Date | Notes |
|---|---|---|---|
| v1 | [`prototype-v1-2026-08-23.html`](./prototype-v1-2026-08-23.html) | 2026-08-23 | xterm.js page with 8 pre-baked views; data hard-coded against fictional `eda-monorepo` |
| v2 | [`prototype-v2-2026-08-23.html`](./prototype-v2-2026-08-23.html) + [`tools/render-widget-prototype.mjs`](./tools/render-widget-prototype.mjs) | 2026-08-23 | Above-vs-below placement A/B using real `buildWidgetLines` output at widths 80 / 100 / 120; closes the v1 → v2 next-prototype commitment |
| v3 | [`prototype-v3-2026-08-23.html`](./prototype-v3-2026-08-23.html) + [`tools/render-fleet-dashboard-prototype.mjs`](./tools/render-fleet-dashboard-prototype.mjs) | 2026-08-23 | Fleet Dashboard view (v1 layout) rendered from real `buildTeamSnapshot` data with `[tracked-not-yet]` markers for columns the codebase does not track; side-by-side vs the v2 compact widget |

**Related work (not under this research):**
- `docs/plans/team-status-widget.md` — Path A `setWidget` / `setStatus` plan, in progress
- `docs/bugs/BUG-004-team-widget-visual-not-verified-in-tui.md` — the open bug that the compact-widget view is meant to close
- `packages/pi-agents-team/src/src/memory/atp-markers.ts` — the canonical seven-stage marker table (this is what we are *not* changing as part of this research)
- `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts` — current `buildWidgetLines` / `buildStatusLine` (this is the surface any new prototype would extend)

## What this research is trying to learn

We have an existing Path A extension that exposes a footer status and a below-editor widget. The widget is a flat roster with one-line summaries; users report they "can't see the orchestration status." A prototype showed up that suggests eight richer views. The research question is **not** "should we implement the eight views" — the answer to that is obviously "no, not all at once." The questions are:

1. **What does the user actually need to see at a glance?** Live activity, blocked goals, the assertion ledger, the cost breakdown, all of the above, none of the above? We don't know. The prototype author guessed; we should measure.
2. **Which of the eight views are information-dense enough to be worth the screen real estate?** A view that fits in 6 lines is a candidate; a view that needs 60 is a different kind of decision.
3. **What is the right rendering surface for each view?** Below-editor widget, above-editor widget, in-conversation custom message, a tab in a modal, a slash-command projection? Each has a cost in pi's UI model.
4. **Where does the design vocabulary stop and the protocol stop?** The prototype uses verbs (`create_task_brief → ... → complete_task`) and a roster (`architect`, `releaser`, `web-debugger`) that are not in our protocol. Some of those are renders; some are opinions that would change the protocol if we adopted them.

## What this research is not trying to decide

- **The seven-stage lifecycle is not up for debate.** `ATP_MARKERS` is the protocol; the recorder writes to it; the Dispatcher enforces owner rules. Anything that contradicts it is a research question, not a fait accompli.
- **The six-role roster is not up for debate.** Adding `architect`, `releaser`, `web-debugger` to the project would be a paper-level decision, not a TUI decision. If the prototype suggests we need them, that goes to a research question of its own.
- **Identity / passport material is out of scope for the first prototype round.** It is the longest pole in the tent and the prototype's biggest leap. The failure-signal checks are a cheap precursor, but no keys.
- **A new `assertions` subsystem is out of scope** until we have a clearer answer to "what does the verifier actually verify." The four guards (sourceless batches refused; batch ≤ 8; evidence is named; wrong-plane demoted) are worth a prototype of their own; the ledger pane is not.

## Method

Each prototype in this directory is **one concrete artefact** (HTML, sketch, recorded terminal session, mock data file) plus **one short notes section** at the bottom of this README describing what it was trying to test, what we learned, and what the next prototype should be. We graduate to a `docs/plans/` entry only when:

- We have ≥ 2 prototypes that point at the same answer.
- We have a clear shape for the implementation (not just a wish list).
- The "what is already in flight" table says we have something to extend, not something to invent.

A prototype does not need to be a TUI. A prototype can be a JSON file with a realistic dispatch ledger, a screenshot of a competitor's tool, a one-page sketch on paper, a five-line TypeScript snippet, or a transcript of a real session. Whatever cheap thing tests the question.

## The eight views in v1, read against the existing surface

This section reads each view in `prototype-v1-2026-08-23.html` and answers three questions: *what does the view show*, *what already exists in the project that maps to it*, and *what's new*. This is a research observation, not a plan. The point is to know which views to spend prototype budget on, not to spec them.

### 1. Fleet Dashboard

**What it shows.** A roster grouped by category (Hub, Native roster, Research helpers, Coms peers). For each row: glyph (●/◐/✓/✗/⊘), name, model, context %, state, current activity, and a `↳ delegate` annotation. Top of view: a `Summary` line (`running 4 · done 2 · failed 0 · waiting 1`) and totals (`wall time 3m 24s · tokens 142,318 · cost $0.42`).

**What already exists.**
- `buildTeamSnapshot(agents, workers, memoryTracker, lastBlockedGoals, now)` in `extensions/pi-agent-team/index.ts` produces exactly the inputs the view needs: per-worker `(profileName, title, startTime, status)`, an aggregate of `running / recent / completed / errored`, and a memory summary with by-marker histogram.
- `buildWidgetLines(snapshot)` already prints a roster with active + recent workers, capped at ~30 lines.

**What's new.**
- Per-agent model and context-percentage columns. Today the widget does not show model or context.
- Per-profile cost aggregation. We track per-call but not per-profile.
- The "filter, kill, restart, finished-toggle" affordances. The current widget is read-only.
- "Coms peers" as a category. We do not have a coms concept in Path A.

### 2. Dispatch Loop

**What it shows.** A five-role state-machine diagram (Dispatcher → Researcher → Verifier → Builder → Archivist) drawn as boxes connected with arrows. Below it, the last 5 events from `session/events.ndjson`. Footer references the Agentic Team Protocol v1.0 verb chain.

**What already exists.**
- `ATP_MARKERS` in `src/src/memory/atp-markers.ts` is the canonical marker table with owner restrictions; the seven lifecycle stages are encoded.
- The recorder functions (`recordGoalReceipt`, `recordRouting`, `recordHandOff`, `recordClosure`, etc.) emit those markers.

**What's new.**
- The "Agentic Team Protocol v1.0" verbs in the prototype (`create_task_brief → assign_agent → accept_assignment → submit_evidence → review_evidence → handoff_evidence → submit_deliverable → complete_task`) **are not the seven lifecycle stages** and **are not what the recorder emits**. Adopting them is a protocol change, not a UI change.
- A live `session/events.ndjson` tail. The recorder is write-only today.
- A five-box state-machine diagram. Pi's `setWidget` is `string[]` lines; box-drawing in plain text is a real design constraint, not a free choice.

### 3. Assertions Pane

**What it shows.** A ledger of assertions (A1..A6) with id, tag (`runtime-ui` / `test` / `code-grep` / `manual`), status (`proven` / `unproven` / `failed` / `pending`), a "source" trace, the condition text, and named evidence. Below the ledger, a tag legend and a "Guards" section listing the four enforcement rules.

**What already exists.**
- The Dispatcher contract says "you will record confidence"; a verification contract built before the first dispatch is consistent with that.
- The Archivist contract is "append-only; corrections are new entries with `supersedes:`" — same shape as a `supersedes:` pointer on a demoted assertion.

**What's new.**
- We have **no `assertions` concept in the codebase today.** This is the largest single piece of new structure in the prototype.
- The four guards (sourceless batches refused; batch ≤ 8; evidence is named; wrong-plane demoted) are independently useful even without the pane.

### 4. Returns Pane

**What it shows.** A worker's structured upward return with explicit sections for `assertions_proven` / `assertions_unproven` / `assertions_failed` / `changed_files` / `tests_run` / `open_risks` / `requires_user_decision`. Each proven assertion carries a named artifact path and a `verify-claim <id>` attestation.

**What already exists.**
- `extractFinalAnswer` in `runtime/final-answer.ts` already parses the worker's `<final_answer>` block — the orchestrator never sees full transcripts.
- The Builder role contract says "make the artefact reviewable."

**What's new.**
- The structured projection of `final_answer` into named sections is not something we currently parse. We surface the raw `<final_answer>` text.
- A "verify-claim" attestation per assertion is not in the protocol.

### 5. Parity Pane

**What it shows.** A 7-row × 3-column matrix where every column is a "member of a set" and every row is a "touchpoint." Each cell is `✓ / ✗ / … / —` where `…` means *pending* and `—` means *not applicable*. A per-set verdict at the bottom.

**What already exists.**
- The Researcher role contract ("you will reduce uncertainty before a decision lands") is the natural owner.

**What's new.**
- A `parity` data structure, a `[parity]` marker, and the "refusal gate" — if any cell reads ✗ on the WHOLE set, the dispatch is rejected.
- The "honest display" rule (`…` means pending, not success).

### 6. Passport

**What it shows.** Identity (ed25519 key, sha256 fingerprint, attestation, status with 24h expiry), Delegation scopes (granted_by, depth, expires, spend vs budget, tools), Agora (signed-message log this session exchanged), Failure signals (four checks).

**What already exists.**
- We do **not** have any identity material in the codebase today. Worker Pi processes are spawned with no signing, no fingerprint, no delegation grant.
- "Delegation scopes" (spend caps, depth limits, tool allowlists) are partially in `worker-spawn.ts` but not exposed to the user or signed.

**What's new.**
- Everything. This is the longest pole in the tent. The four failure signals (scope violations; revoked delegations; stale identity refs; information-withholding) are a cheap first step — two of the four are free.

### 7. Session Modal

**What it shows.** The Fleet Dashboard with one row selected, expanded to show model + context %, cwd, project, purpose, started, uptime, heart-beat, passport, delegation. A "Live activity tail" of recent tool calls. An Actions list (focus / cancel / restart / model / zoom / steer).

**What already exists.**
- The `workers` map in the extension closure already carries startTime, endTime, profileName, title, status.

**What's new.**
- A per-worker view that includes model, context %, cwd, heart-beat, and a tool-call tail. None of these are surfaced today.
- "Per-tool allowlist projection" (do not leak raw transcripts) — partially what `final_answer.ts` already does; a live version is real work.
- A "focus pane" affordance — we don't have multiple panes.
- A "re-dispatch same task" primitive — we have `abort_worker` but not a re-dispatch.

### 8. Compact Widget

**What it shows.** A single boxed panel above the editor with one row per agent: glyph, name, model, ctx %, state, and a `↳ delegate` annotation. Toggled with Alt+Shift+A; visible only when running agents exist. Below the panel, a "Pause vs Cancel" legend distinguishing `paused_by_user` / `interrupted` / `cancelled`.

**What already exists.**
- This is **directly the Path A widget** from `team-status-widget.md`, with a richer roster column set (model, ctx %, the `↳ delegate` chain).
- `ctx.ui.setStatus` and `ctx.ui.setWidget` (with `placement: "belowEditor"`) are the surfaces the plan targets.

**What's new.**
- A `placement: "aboveEditor"` option. The plan says below; the prototype says above.
- The model + context % + `↳ delegate` columns.
- The Pause/Cancel state distinction. Currently treated as one thing; splitting it is a behaviour change in the orchestrator (needs a "pause" verb), not just a UI change.

## What is already in flight (and what v1 says about it)

| Concern | Already in flight? | Where | What v1 suggests |
|---|---|---|---|
| Below-editor widget (roster) | Yes | `buildWidgetLines` in `extensions/pi-agent-team/index.ts` | Add model + ctx % + per-profile cost columns |
| Above-editor compact widget | No | — | Worth a prototype comparing above-vs-below placement |
| Per-worker cost breakdown | No | — | Trivially aggregable; cheap prototype |
| Live events.ndjson tail | No | — | v1 shows the value; the implementation question is "where does the read happen" |
| Structured `final_answer` projection | Partial | `final_answer.ts` parses but doesn't project | v1 shows what the projection should look like |
| Assertions as first-class | No | — | The four guards are a cheap precursor; the pane is a follow-up |
| Parity data structure | No | — | v1 shows the shape; the refusal-gate rule is a separate question |
| Identity / Passport | No | — | Out of scope for the first prototype round |
| Agentic Team Protocol v1.0 verbs | No | — | Adopting them is a protocol change, not a TUI change |
| Pause / Interrupted / Cancelled | No | — | A behaviour change, not a UI change |

## Questions each prototype should help answer

These are open. The right next prototype is the one that has the cheapest answer to the most-decisions.

1. **Above vs below the editor.** A prototype that places the compact widget both ways and screenshots both (closing BUG-004) would resolve the placement question for tab 8 in one shot. **Cheapest first prototype.**
2. **Information density.** Render the Fleet Dashboard contents as a string with a known terminal width and measure how many rows it consumes. If it blows past 30 lines, the "all in one view" approach is dead and we should split. **Trivial prototype.**
3. **Per-profile cost.** Aggregate cost by `profileName` from a recorded session's events and check the prototype's `(D $0.08 · R $0.12 · B $0.18 · V $0.04)` against reality. If the breakdown is meaningful, the column is worth keeping; if every dispatch collapses to a single model, the column is a tax. **Trivial prototype if we have the data.**
4. **The four guards as a dispatcher module.** Sketch an `assertions.json` shape and a guarded-dispatcher that refuses a batch without assertions. The point is not the pane — it's whether the guards feel useful when written. **Medium prototype.**
5. **Failure signals without a passport.** Implement `assertPassportInvariants(snapshot)` against the existing snapshot and see whether the four checks produce meaningful output today. If "no scope violations" and "no revoked delegations" both trivially pass, that's still useful — the user sees the system self-checking. **Cheap prototype.**
6. **Honest-display rule.** Render an assertion cell as `…` (pending) and confirm that downstream consumers (orchestrator prompt, dispatch header) do not silently treat `…` as success. **Trivial prototype.**

Items 1, 2, 3, 5, 6 are answerable in under half a day each. Item 4 is a day. None of them require a protocol change.

## Known bugs in the v1 artifact

The HTML prototype was preserved verbatim from the source. While saving it, four defects were noticed. They are in the prototype, not in the codebase, but worth flagging because the same bugs would reappear if anyone copy-pastes from the HTML into production TUI code:

- **Line 105** (xterm add-on script tag): the URL is `jsdelir.net` (typo) instead of `jsdelivr.net`. The FitAddon would never load.
- **Line 458** (Passport view, header of "Failure signals" section): the template literal is opened with a backtick but closed with `';` (a single quote + semicolon), so the literal is unterminated. The whole line 458 and several lines after it would not parse.
- **Line 462** (Passport view, "Failure signals" sub-label): the parens are unbalanced — `(memory-systems: federated failure modes` is missing a closing `)`.
- **Line 303** (Assertions Pane, `[code-grep]` legend): the pattern string starts with a stray double-quote (`"case .walkover`) that doesn't match the closing brace structure.

These will accumulate per prototype. Future prototypes in this directory should be checked for the same class of bug (URL typos, mismatched quotes/parens, stray characters in JSON-shaped strings) before being checked in.

## When does a prototype graduate?

A prototype is a hypothesis. It graduates to `docs/plans/<thing>.md` when:

- The shape is decided (we know what we're building, not what we're exploring).
- The cost is bounded (we can write a file-by-file plan that someone else can pick up).
- At least one person other than the author has looked at the prototype and said "yes, this is the right direction."

Until then it stays in `docs/research/`. If a prototype turns out to be wrong, the right move is to write a v2 in this directory that takes the opposite approach — not to delete v1. The history of dead ends is part of the research record.

## Per-prototype notes

### v1 — 2026-08-23 — `prototype-v1-2026-08-23.html`

**What this prototype is testing.** Whether an xterm.js page with 8 hard-coded views is a useful shape for a "fleet of agents" UI. The author is a third party (not the project maintainer); this is a reference design, not a finished proposal.

**What we learned.**
- The eight views are not equally weighted. The Compact Widget, Fleet Dashboard, and Session Modal are doing the same job at different sizes; the other five (Dispatch Loop, Assertions Pane, Returns Pane, Parity Pane, Passport) are doing different jobs.
- The vocabulary in the prototype mixes our protocol (`[routing]`, `[verdict]`) with verbs that are not ours (`create_task_brief`, `accept_assignment`). The first prototype's biggest weakness is that it does not say which is which.
- The Passport view is the prototype's biggest leap — full identity, ed25519, delegation scopes, Agora message bus — and the rest of the views are intelligible without it. That makes it a clean deferral.
- The "failure signals" section at the bottom of the Passport view is the cheapest useful piece. Two of the four checks (revoked delegations, stale identity refs) are free today; the other two (scope violations, information-withholding) are real work.
- Above-the-editor placement for the compact widget is a real open question. The current plan says below; this prototype says above. The `docs/bugs/BUG-004` reproduction captures the trade-off.

**What this prototype does not test.**
- Information density. The xterm page does not constrain itself to a known terminal width.
- Real data. Everything is hard-coded against a fictional project.
- How the views interact with pi's UI surface (status slot, widget placement, slash commands, custom messages).
- Whether the prototype's authoring style is one we would maintain.

**Next prototype to try.** Above-vs-below-the-editor placement for the compact widget, against real worker data, at a known terminal width. Render the widget both ways in two screenshots; if the user can read both at a glance, the placement question is settled. This is item 1 in the "Questions each prototype should help answer" section.

### v2 — 2026-08-23 — `prototype-v2-2026-08-23.html` + `tools/render-widget-prototype.mjs`

**What this prototype is testing.** Whether the Path A team-status widget, rendered from real `buildWidgetLines` output, fits and reads at `aboveEditor` vs `belowEditor` across realistic terminal widths (80 / 100 / 120 cols). The current plan (`docs/plans/team-status-widget.md`) commits to `belowEditor`; the v1 prototype author committed to `aboveEditor`; BUG-004 lists this as the most likely cause of the user-reported "I can't see the orchestration status" symptom. This prototype is the cheapest first prototype for that question (README § "Questions each prototype should help answer" #1).

**Construction.**
- A Node.js driver (`tools/render-widget-prototype.mjs`) imports `buildTeamSnapshot` and `buildWidgetLines` directly from `packages/pi-agents-team/dist/extensions/pi-agent-team/index.js` (lines 267 and 387 of the compiled file). It does not touch the extension source.
- Three realistic snapshots: idle (no workers, no memory); one-running (one active builder, no recent); busy (three active, three recent with mixed outcomes, memory tracker with the production `{ ok, error, skipped }` bucket shape — including one intentional skip-only marker to verify the `!` glyph).
- Worker shape mirrors `packages/pi-agents-team/tests/shell.test.ts` lines 1090–1280.
- Each snapshot is rendered at widths 80 / 100 / 120 into `tools/rendered.json` — a 3 × 3 grid with `{ snapshotId, width, description, lineCount, longestLineCols, lines }` per entry.
- The HTML mockup inlines the JSON inside `<script type="application/json">` so it loads with no network calls and no CORS. It uses a hash-based selector (`#w=80|100|120&s=idle|one-running|busy`) so the URL is shareable.
- Colour tokens are reused verbatim from `prototype-v1-2026-08-23.html` lines 6–24. The four documented v1 bugs (line 105 jsdelir typo, line 303 stray quote, line 458 mismatched backtick/quote, line 462 unbalanced parens) are checked for and absent from this file — the README's "Known bugs in the v1 artifact" bug-class checklist passes.

**What the user actually sees at each placement.**
- **`aboveEditor`.** The widget renders immediately above the chat scrollback and the editor prompt. The user's eye lands on the widget as soon as they look at the screen; the prompt sits below it. The widget is not occluded by anything that scrolls with the chat.
- **`belowEditor`.** The widget renders below the editor prompt. The user's eye lands on the prompt first, then on the chat scrollback; the widget sits "out of frame" below — visible only when they scroll past the prompt or expand the terminal viewport.
- Both panels in the mockup render the **same widget output** at the same selected width. The only difference is where the widget sits in the screen, which is the entire research question.

**Does either placement push the editor prompt off-screen on a typical 100-col terminal?**
- At width 100, the busiest snapshot (busy: 23 lines, longest 76 cols) puts the widget at ~24 lines of vertical space. With a typical 30–40 row terminal, the `aboveEditor` widget sits at the top and the prompt sits in the middle — comfortably visible. The `belowEditor` widget sits below the prompt and the last 5–10 lines of the widget (memory section, byMarker histogram) may fall outside a viewport that has already been filled by chat scrollback.
- The widget never exceeds 76 columns at any width, so no widget line wraps awkwardly at 80+. The longest lines fit with 4 columns of headroom even at w=80.

**Does either placement cause the widget to scroll out of view on a busy session?**
- `aboveEditor` keeps the widget pinned near the top of the screen regardless of chat scrollback length. If the chat scrollback grows past the available vertical space, the editor prompt and below it are what scroll, not the widget.
- `belowEditor` puts the widget behind the chat scrollback. On a long session with lots of scrollback, the widget can scroll out of view entirely; the user has to scroll down past the prompt to find it.

**Does the rendered widget fit in the documented 30-line cap from the Path A plan?**
- Yes. The busiest snapshot renders 23 lines (`busy@*`), which is under the 30-line cap documented in `team-status-widget.md`. The `lines.slice(0, 40)` defensive cap inside `buildWidgetLines` is also never reached. The cap is fine as written.

**Does either placement fit a busy session's widget, visually?**
- `aboveEditor` is more visible but pushes the prompt downward by ~23 lines. On a 30-row terminal that is a substantial chunk of the screen real estate.
- `belowEditor` is less visible because the prompt sits above it, but the widget does not displace the prompt. The trade-off is visibility of orchestration status vs. proximity to the editor prompt.

**Is the placement question settled?**
- **No — needs v3 with a live pi TUI integration.** This prototype shows that the *content* of the widget is the same in both placements and that the widget never exceeds its width or line cap. What it cannot show is what happens when the user is mid-turn, when the chat scrollback is interleaved with editor activity, when the user has the prompt focused, or when pi's host chooses to honour vs ignore the placement hint. BUG-004 is about the user not seeing the orchestration status — and that symptom is consistent with `belowEditor` placement pushing the widget below the fold of a busy terminal.
- **What this prototype does falsify:** it falsifies the *worst* version of the `belowEditor` commitment — the version where the widget would render outside its line cap or wrap awkwardly. The widget content is well-formed at all three widths. The placement decision is now isolated from content concerns.
- **What this prototype does *not* falsify or confirm:** whether `aboveEditor` actually shows in pi's TUI the way the static mockup suggests. The mockup is HTML; pi's host is a TUI. A v3 that runs `setWidget` inside a real pi session and screenshots the result is the next step. The packet asks "does it settle the question" — the honest answer is "no, but it narrows it: if v3 confirms `aboveEditor`, the plan change is one line."

**Implications for `docs/plans/team-status-widget.md`.**
- If v3 confirms `aboveEditor`, the plan changes by exactly one line: `placement: "belowEditor"` → `placement: "aboveEditor"` in the `setWidget` call. Everything else (capping at 30 lines, the active-first priority order, the agent roster one-liner) is content-level and unaffected.
- If v3 confirms `belowEditor`, no plan change is needed; BUG-004 needs a different hypothesis (likely "the widget is below the fold on the user's terminal size" — which this prototype suggests is plausible on busy sessions).
- If v3 is inconclusive, the question graduates to a design question rather than a placement question: do we need an additional surface (a footer status pill, a slash-command projection) regardless of widget placement? The current footer status line (`buildStatusLine`) already exists and the prototype does not exercise it — that is also a v3 candidate.

**What this prototype does not test.**
- Real pi TUI rendering. Static HTML is a faithful proxy for *content* and *position*, but not for terminal escape codes, focus management, or how pi's host chooses to honour the placement hint.
- Interaction. The v1 prototype had keyboard shortcuts (Alt+Shift+A); v2 is static. A live TUI prototype would test whether a toggle key helps when the widget is in the wrong place.
- The 30-line cap under stress. We tested one busy snapshot; under higher concurrency the widget could plausibly grow (recent cap is 5; we only used 3). A stress test snapshot with 5 recent workers is a follow-up.
- Snapshot 4 (idle with memory). We did not include it because the placement question does not depend on the memory section. A future prototype that exercises memory-only states would help.

**Self-validation evidence.**
- `node --check docs/research/fleet-tui-prototypes/tools/render-widget-prototype.mjs` — exit 0.
- Driver execution: `node docs/research/fleet-tui-prototypes/tools/render-widget-prototype.mjs` — wrote `tools/rendered.json`, 9 entries (3 snapshots × 3 widths), no errors.
- dist build: `cd packages/pi-agents-team && npm run build` — exit 0 ("Built dist: 17 file(s), 7 declaration(s)"). Build commit: `ce3645d9f941366fce3f482fc0a67c1963fa6156` (the same commit the prototype was authored against; dist was rebuilt and the build commit recorded in the driver's evidence block).
- HTML verification: loaded into JSDOM 26 (`/tmp/verify-html.mjs`), asserted (a) both widget `<pre>` blocks contain identical text, (b) width and snapshot pickers reflect the hash, (c) hash changes re-render both panels, (d) no console errors. All four checks passed.
- v1 bug-class checklist: scanned for `jsdelir.net`, mismatched backtick/quote on line 458, unbalanced parens on line 462, and stray quote in `[code-grep]` — none present.
- Inlined JSON in the HTML matches `tools/rendered.json` byte-for-byte at the entry level (verified with a Python comparison after re-running the driver).

### v3 — 2026-08-23 — `prototype-v3-2026-08-23.html` + `tools/render-fleet-dashboard-prototype.mjs`

**What this prototype is testing.** Whether the Fleet Dashboard view from v1 (lines 152–210 of `prototype-v1-2026-08-23.html`) is shippable as a *real* widget today, given the data the existing `buildTeamSnapshot` already produces. The prototype renders the v1 layout using only the snapshot fields that exist, and marks every v1 column the codebase does not track with the literal stub `[tracked-not-yet]` so the gap is visible at a glance. It is honest about which v1 columns are aspirational vs real, and is not a plan to implement the missing data plumbing.

**Construction.**
- A Node.js driver (`tools/render-fleet-dashboard-prototype.mjs`) imports `buildTeamSnapshot` from `packages/pi-agents-team/dist/extensions/pi-agent-team/index.js` (line 267) and the existing `buildWidgetLines` (line 387) as a baseline. The driver adds a new pure function `buildFleetDashboardLines(snapshot, width)` that renders the v1 layout, truncated to `width` columns with a `…` suffix when a row would overflow.
- Same three snapshots as v2 (idle, one-running, busy), rendered at widths 80 / 100 / 120. Output is `tools/fleet-dashboard.json` — a 3 × 3 grid where each entry carries both the v3 Fleet Dashboard lines (this prototype's question) and the v2 compact-widget lines (the baseline) so the mockup can show a side-by-side comparison from a single inline JSON.
- HTML mockup (`prototype-v3-2026-08-23.html`) inlines the JSON inside `<script type="application/json">`. Hash selector `#w=80|100|120&s=idle|one-running|busy`. Colour tokens reused verbatim from v1 lines 6–24; the four v1 bug classes (URL typo, mismatched backtick/quote, unbalanced parens, stray quote) are explicitly absent.
- No code change to the extension source. The driver imports the dist unchanged.
- No protocol change. `atp-markers.ts` is untouched.
- No identity / passport / assertions / parity panes (deferred by the research README).

**Stubbed columns — every v1 column the prototype does NOT render from real data, and why.**

The v1 Fleet Dashboard row format is `● <name>  model: <m>  ctx: <c>  state: <s>  <status-activity>  ↳ delegate <target>`. Of the seven pieces of information in that row, only two are real today:

- **Glyph (●/◐/✓/✗/⊘)** — real. `buildTeamSnapshot` exposes `workers.running[i]` with a derived status (running, completed, errored, aborted) and the driver maps that to the same glyphs the existing `buildWidgetLines` uses.
- **Profile name** — real. `workers.running[i].profileName` and `workers.recent[i].profileName`.
- **Task title** — real. `workers.running[i].title` and `workers.recent[i].title`.
- **Duration** — real. `workers.running[i].duration` and `workers.recent[i].duration` (formatted by the dist as `47s` / `2m` / `1m35s`).

The other v1 columns are stubbed with the literal marker `[tracked-not-yet]`, and each one is stubbed for a specific reason:

- **model** — stubbed. The codebase does not track which model a worker is using. `worker-spawn.ts` selects a backend/model per role, but the chosen value is not propagated to the worker record or to the snapshot. The v1 row wants `claude-opus-4.6` / `gpt-5.5 (xh)` / `github-copilot/claude-sonnet-4.6` etc.; the snapshot has no field for this. Stubbing is the only honest option today.
- **ctx %** (context window usage) — stubbed. The codebase does not sample the model's context window. The runtime `extractFinalAnswer` parses the worker's final answer but does not request usage metrics from the model. The v1 row wants `67%` / `34%` / `—` (idle); the snapshot has no field for this. The v2 baseline widget does not have this column either, so adding it requires new data plumbing in the orchestrator (call the model's usage endpoint, store it on the worker record, expose it via the snapshot).
- **state** (e.g. `synthesising`, `running`, `booting`, `working`) — stubbed. The worker record carries exactly one status field: `running` / `completed` / `error` / `aborted`. The v1 row's richer state vocabulary (booting, working, synthesising) is not in the protocol. The summary line's `waiting W` field is therefore always 0 today: the protocol has no booting status to count.
- **status activity text** (e.g. `composing A4..A6`, `planning task breakdown`) — stubbed. The snapshot has `worker.title` (the task brief), not a live activity tail. The v1 row's free-form activity text would need either a new event stream (workers emitting `[routing]` / `[hand-off]` markers at sub-second cadence) or a tool-call tail. Neither exists today.
- **↳ delegate <target>** — stubbed. The codebase does not track delegate chains. `buildTeamSnapshot` exposes a flat `workers` map keyed by `workerId` with no `parent` or `delegatedTo` field. The packet acknowledges this: "only emit if the worker has a `parent` or `delegatedTo` field; otherwise leave blank (the codebase doesn't track delegate chains today)." The v1 row wants to show that a builder was delegated-to by a planner; the snapshot has no field for this. The dispatcher's `[hand-off]` marker is the closest signal we have, and it is in the protocol but not in the snapshot.
- **kill / restart / finished-toggle affordances** — stubbed (the affordance *names* render as `[tracked-not-yet] filter · ...`; the affordance itself is not implemented). These are Stage 4 action verbs that need a behaviour change in the orchestrator (`abort_worker` exists, but `restart_worker` and `toggle_finished` do not). The packet explicitly defers this work: "Do not implement kill / restart / finished-toggle affordances. Those are Stage 4 action verbs that need a behaviour change in the orchestrator, not a UI render."
- **Hub (orchestrator) worker** — stubbed. The v1 layout has a top-level "Hub (orchestrator)" row showing `hub-pi-001`. The codebase has no separate orchestrator worker; the orchestrator is the in-process dispatcher that runs the user's session, not a spawned worker. The driver renders the row with a stub name and stub columns so the category is visible in the layout but honest about its status.
- **Coms peers** — stubbed (the category is rendered, the row is a stub). The v1 layout has a "Coms peers" category for cross-process peers (architect, releaser, web-debugger) that communicate over an out-of-process bus. Path A has no coms concept; coms is a separate design track.
- **project context (cwd)** — partially real. The v1 row wants `project: eda-monorepo` in the header. The driver renders `process.cwd()`'s basename (`pi-team` in this run) as the closest real signal. The codebase does not track the user's project name; the v1 prototype hard-codes `eda-monorepo`. The driver is honest about the substitution: the header reads `Fleet Dashboard · N agents · <cwd>` rather than fabricating a project name.
- **mode (standard / xh)** — stubbed. The v1 row wants a mode indicator. The runtime has per-role effort overrides (`ATP_BUILDER_EFFORT=medium`) but does not surface a global mode in the snapshot.
- **wall time, tokens, cost** (totals line) — not stubbed, not rendered. The v1 totals line is `wall time 3m 24s · tokens 142,318 · cost $0.42`. The packet explicitly says not to fabricate these: "Totals line: only the running count and the recent.length; no wall-time / tokens / cost (those columns don't exist in `buildTeamSnapshot`)." The driver renders `totals: 6 · done: 2 · failed: 1 · recent: 3` instead.

**What the user actually sees at each width and snapshot.**

The numbers below come from the rendered grid (`tools/fleet-dashboard.json`); the longest-line column is the visible width in monospace columns, and the truncation suffix `…` indicates the line was sliced to fit. Where a line is truncated, the row is still readable as a one-line summary (the title is the only part that gets cut at the widest widths) but the model / ctx / state / `↳ delegate` columns are not visible at narrower widths because they are stubs and the driver keeps them in the row regardless of width.

- **idle @ 80, 100, 120.** 13 lines, longest line 80 / 100 / 120 cols. The view shows the Fleet Dashboard header, the stub filter hint line, an empty `Summary running 0 · done 0 · failed 0 · waiting 0`, the empty totals line, a Hub category with one stub row, an empty Native roster (no workers, no rows emitted), an empty Research helpers category, the Coms peers stub row, and the footer stub hint line. The Memory section is omitted because the idle snapshot has no memory tracker. The category headers (Hub, Native roster, Research helpers, Coms peers) are always present even when empty — the reader sees the shape of the view at idle. The category section is the same width as the header.
- **one-running @ 80, 100, 120.** 16 lines, longest line 80 / 100 / 120 cols. Adds the running builder row in the Native roster category. The title (`Investigate flaky test in shell.test.ts`) is fully readable at w=120, partially truncated at w=100, and heavily truncated at w=80. The Memory section is still omitted (no memory tracker in the one-running snapshot).
- **busy @ 80, 100, 120.** 30 lines, longest line 80 / 100 / 120 cols. The view shows all six workers (3 running, 3 recent) plus the Memory section (3 active + 4 byMarker rows + header = ~10 lines). At w=80, the worker rows truncate aggressively (each row has five stub columns + a title + duration, which together exceed 80 cols) — the reader sees `…` at the end of each row but the leading glyph + profile name + truncated title is still legible. At w=120 the worker rows truncate at the trailing stub column only; the title and duration are fully visible. The Memory section's byMarker rows are short enough to fit at all three widths.

**Is the Fleet Dashboard a candidate to ship, or does the missing data plumbing need to land first?**

**Needs v4: yes — the missing data plumbing must land first.** The prototype falsifies the "ship the v1 layout as-is" hypothesis cleanly: five of the seven information pieces in the v1 row are stubs, and a reader who lands on the Fleet Dashboard without context will see a wall of `[tracked-not-yet]` and reasonably conclude the view is broken. The data plumbing that is missing is independently useful and is not blocked by the prototype — the model / ctx / state / delegate / cost columns each map to a concrete feature in the orchestrator (per-worker model selection, context-window sampling, sub-status vocabulary, hand-off chain tracking, per-profile cost aggregation) that can land in any order. v4 is the prototype that re-renders the same layout with real values in the columns that are stubbed today.

What this prototype *does* settle: the layout itself is a credible shape. The category-grouped roster reads cleanly, the truncated rows still convey the per-worker state (glyph + profile + truncated title), and the summary + totals line gives the user a single-glance count. The 30-line cap from the Path A plan holds for the busy snapshot at all three widths. The truncation policy (slice to width with `…`) is what the v1 prototype did and it works here too. If the missing data plumbing lands, the layout does not need to change — only the stub markers do.

What this prototype *does not* settle: which of the seven missing data features should be the highest priority to land first. Cost and tokens are the easiest (events.ndjson already records the per-call price, aggregation by profile is a one-line query). Model is medium (the worker-spawn config has the value; the plumbing is to write it onto the worker record). Context % is hardest (the model has to opt-in to returning usage metrics, and not all backends do). Delegate chains are a separate design question (do we add a `parent` field to the worker record, or do we infer the chain from the `[hand-off]` marker stream?).

**Implications for `docs/plans/team-status-widget.md`.**

- The Path A plan currently ships a flat roster (the existing `buildWidgetLines`). The v3 prototype shows the Fleet Dashboard shape is a strict superset of that shape: it adds category headers (Hub / Native roster / Research helpers / Coms peers) and per-row model / ctx / state / `↳ delegate` columns. The compact widget continues to work as a below-editor status pill; the Fleet Dashboard is a separate, larger surface.
- If the team wants to ship the Fleet Dashboard as a v4 plan, the implementation is: (a) the layout function in the driver moves into the extension, (b) the stub columns get filled in as the corresponding data plumbing lands, (c) the surface is exposed as a new `setWidget` placement or a new `setDetail` call so it can be toggled separately from the compact widget.
- If the team wants to ship the Fleet Dashboard *now* with the stub markers, the prototype is the plan: the layout function, the truncation policy, and the side-by-side comparison vs the compact widget are all ready. The downside is a row that reads `[tracked-not-yet]` five times — which is exactly the honest signal the prototype was designed to emit.

**What this prototype does not test.**

- Real pi TUI rendering. Like v2, the mockup is HTML, not a TUI. The placement question (above-vs-below editor) is settled-ish by v2; this prototype focuses on the *content* question.
- The Hub orchestrator worker. The Hub category is rendered with a stub row because there is no such worker in the snapshot. A future prototype that distinguishes "in-process orchestrator" from "spawned worker" would be needed to render the Hub row from real data.
- The Coms peers concept. The category is rendered as a stub because Path A has no coms concept. A v4 prototype that lands coms as a separate research track would be needed.
- The `[tracked-not-yet]` marker is rendered in plain orange text; the prototype does not test whether a different visual treatment (e.g. a tooltipped "?" or a faded gray) would communicate the gap better. The marker was chosen for directness — it says exactly what the column is not, in English.

**Self-validation evidence.**

- `node --check docs/research/fleet-tui-prototypes/tools/render-fleet-dashboard-prototype.mjs` — exit 0.
- Driver execution: `node docs/research/fleet-tui-prototypes/tools/render-fleet-dashboard-prototype.mjs` — wrote `tools/fleet-dashboard.json`, 9 entries (3 snapshots × 3 widths), no errors. Entries verified to be the expected key set `{idle,one-running,busy} × {80,100,120}`.
- dist build: `cd packages/pi-agents-team && npm run build` — exit 0 ("Built dist: 17 file(s), 7 declaration(s)"). Build commit `7e9060e` (Stream A recorder bug fix landed at this commit; dist rebuilt cleanly before the v3 driver ran).
- HTML verification: loaded into JSDOM 26 (`/tmp/verify-html-v3.mjs`), asserted (a) Fleet panel and compact widget panel both render for the default hash `#w=100&s=busy`, (b) the Fleet panel contains `[tracked-not-yet]` stubs and the compact widget does not, (c) the width and snapshot pickers reflect the hash, (d) switching to `#w=80&s=idle` re-renders both panels with idle content, (e) no console errors, (f) the four v1 bug classes (`jsdelir.net`, mismatched backtick/quote, unbalanced parens on line 462, stray quote in `[code-grep]`) are absent. All six checks passed.
- The 9-entry grid is byte-stable across re-runs (the driver pins `NOW` to a fixed epoch and the snapshot data is inlined, so the output is deterministic).
- The v3 driver imports `buildTeamSnapshot` and `buildWidgetLines` directly from the compiled dist (lines 267 and 387); no in-memory mocks. If `buildWidgetLines` ever drifts, the right panel of the v3 mockup falls out of sync and the test bench notices — same fallback property as v2.
