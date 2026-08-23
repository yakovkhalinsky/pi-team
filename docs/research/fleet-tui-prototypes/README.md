# Research: Fleet TUI prototypes

**Date:** 2026-08-23
**Status:** Research in progress
**Method:** Prototype-driven (build cheap artefacts first; only graduate to plans/references once we know which solution is right)
**Prototypes in this directory:** 1

| # | File | Date | Notes |
|---|---|---|---|
| v1 | [`prototype-v1-2026-08-23.html`](./prototype-v1-2026-08-23.html) | 2026-08-23 | xterm.js page with 8 pre-baked views; data hard-coded against fictional `eda-monorepo` |

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
