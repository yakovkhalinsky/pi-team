# BUG-004 — Team-status widget contents are unit-tested, but the rendered visual has not been verified in a real TUI session

**Severity:** Low — the widget *content* is fully covered by unit tests
(`buildTeamSnapshot`, `buildStatusLine`, `buildWidgetLines` are
exercised against a `ctx.ui` mock), and the orchestrator agent
confirms via `pi -p` that the `## Available team agents` block is in
the system prompt. The remaining unverified piece is the **rendered
appearance** of the footer status and the `/team` panel when an
interactive `pi` TUI session is running.

**Status:** Open

**Component:** `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`
(team-status widget added in `ac33610`)

## Summary

The team-status widget added by commit `ac33610` calls
`ctx.ui.setStatus(...)` and `ctx.ui.setWidget(...)` correctly. The
test suite asserts on the **arguments** to those calls and on the
**lines** produced by `buildWidgetLines`. What the test suite does
*not* assert on:

- That the footer status line actually appears in the rendered TUI
  footer.
- That the widget panel actually appears below the editor in the
  rendered TUI.
- That the line wrapping, colour, and placement match user
  expectations on a typical terminal.
- That the widget does not visually clash with the chat scrollback
  or the input prompt at common terminal widths (80, 100, 120
  columns).

In other words: the widget's *data* is correct, but the *visual
result* has only been verified by reading the source.

## Why this matters

If the user reports "I still can't see the team UI" after installing
the extension, there are two possibilities:

1. The widget is correct but the user is looking at the wrong
   place, or running `pi -p` instead of interactive `pi`, or has
   too small a terminal, or has a theme that hides dim text.
2. The widget is actually broken in a way the tests don't cover
   (e.g. the panel is rendered off-screen, the footer slot is
   being clobbered by another extension, the `placement` value is
   wrong, etc.).

We have no way to distinguish these cases from the current test
coverage alone. The user has already reported the symptom once
("I can't see the orchestration status"); a follow-up visual
verification is the cheapest way to rule out category 2.

## Reproduction

```bash
# 1. Confirm the extension is installed.
cd ~/git/pi-team
pi list
# => should list pi-agents-team in both user and project scope.

# 2. Open an interactive TUI session.
pi

# 3. From the prompt, type /team to toggle the panel.

# 4. Visually confirm:
#    - The footer (or status line) shows "Team (7 agents)" or similar
#      from the moment the session starts, even before any tool runs.
#    - After /team, a multi-line panel appears below the editor
#      listing the 7 agents.
#    - The panel is readable on a typical terminal width (80-120 col).
#    - The footer does not get clobbered when the orchestrator runs
#      a turn.

# 5. Trigger a worker:
#    > "Delegate the task of listing this directory to the runtime agent"
#    While the worker runs, the footer should show "1 running: runtime".
#    When the worker completes, the footer should settle.
```

## Expected result

The footer is visible at all times, the panel is visible on demand,
and the live updates work during a worker run. A short note in the
bug's "Verification" section confirming these visual checks
(either by screenshot, by terminal recording, or by a developer
sign-off note) closes the bug.

## Possible visual-only failure modes

- **Widget placement.** `placement: "belowEditor"` is documented
  but the test mock doesn't render. If the actual placement is
  wrong (e.g. above the input prompt and pushing it offscreen),
  the panel would be invisible without scrolling. Fix: try
  placement `"aboveEditor"` or omit the placement option and let
  pi use the default.
- **Footer collision.** pi shows model + thinking level in the
  footer by default. If the team status line is appended to the
  same slot, the line may wrap or get truncated. Fix: shorten the
  status line; reserve a dedicated status slot.
- **Hidden by theme.** `theme.fg("dim", "...")` is invisible on
  some themes. Fix: use `theme.fg("muted", "...")` or
  `theme.fg("accent", "...")` for the team brand.
- **Empty state.** When no agents are discovered (e.g. user has
  no `.pi/agents/*.md`), the widget should say so cleanly. Unit
  test covers the string; visual test would catch
  "no message shown at all".

## Proposed fix

1. **Add a manual verification checklist** to
   `docs/plans/team-status-widget.md` under a new "Visual
   verification" section, listing the four checks above.
2. **Run the checklist** by a developer with a TTY. Take a
   terminal capture (e.g. `asciinema`) and attach to the bug.
3. **If a visual defect is found**, add a regression test that
   uses a thin TUI harness (e.g. render the widget to a string
   buffer with the same theme the real TUI uses) so the defect
   cannot reappear.
4. **If no defect is found**, mark the bug fixed and link to the
   capture as evidence.

## Workaround

None. Users who can't see the team UI in interactive `pi` can
still verify the extension is working by running `pi -p` and
asking the model to print the contents of the system prompt's
`## Available team agents` block. That confirms the data side.
The visual side requires a TTY.

## Related

- `docs/plans/team-status-widget.md` — the implementation plan.
- `ac33610` — the commit that introduced the widget.
- `packages/pi-agents-team/README.md` "Team UI" section —
  documents the contract this bug is verifying visually.
