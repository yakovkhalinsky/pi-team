# Builder cancellation issue — analysis & fix plan

- **Date:** 2026-08-22
- **Title:** Orchestrator cancels builder agents perceived as doing too much work
- **Status:** Analyzed; fixes 1–4 pending implementation; point 5 deferred
- **Assigned teams:**
  - **Builder team:** implement fixes 1–4
  - **Verifier team:** validate the fix suite in a later cycle

---

## 1. Issue summary

The orchestrator (agents-team profile) intermittently cancels builder workers during long tasks with the complaint that the builder is **"doing too much work"** — e.g. reading too many files, running too many commands, or exploring beyond what the orchestrator considers necessary. The cancellation is not triggered by a deterministic budget; it is driven by the orchestrator LLM's subjective reading of the builder's live activity and by the open-ended description of the `agent_cancel` tool.

Impact:

- Wasted builder turns and lost intermediate progress.
- False positives on legitimate, scoped builder work.
- Conflicting signals: the builder prompt encourages thoroughness, while the orchestrator prompt implicitly discourages it.

---

## 2. Root cause

There is **no deterministic "too much work" guard**. Three reinforcing factors create the observed behavior:

1. **Subjective orchestrator guidance**
   - `packages/pi-agents-team/prompts/orchestrator.md`
   - `prompts/orchestrator.md`
   - Neither prompt defines objective cancellation criteria (step count, token budget, file-read budget, time budget). The orchestrator must infer when a worker is "overworking," and that inference is sensitive to model drift.

2. **Generic `agent_cancel` tool description**
   - `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts`
   - Current description: `"Abort and shut down a tracked worker."`
   - The description carries no policy constraints, so the orchestrator can use it for any reason it invents, including "too much work."

3. **No builder checkpoint / progress-report contract**
   - `packages/pi-agents-team/prompts/agents/builder.md`
   - The builder is not instructed to surface incremental progress in a way that lets the orchestrator distinguish legitimate depth from runaway exploration.

4. **Cancellation path lacks policy hooks**
   - `packages/pi-agents-team/src/src/control-plane/team-manager.ts`
   - `cancelWorker` / `waitForTerminal` are the concrete execution sites, but they perform no policy checks before honoring the orchestrator's cancel request.

---

## 3. Key files

| # | File | Role in this issue |
|---|------|---------------------|
| 1 | `packages/pi-agents-team/prompts/orchestrator.md` | Orchestrator system guidance that should define deterministic cancellation thresholds |
| 2 | `prompts/orchestrator.md` | Top-level orchestrator prompt; should be kept in sync with (1) |
| 3 | `packages/pi-agents-team/src/extensions/pi-agent-team/index.ts` | Defines `agent_cancel` tool description (`"Abort and shut down a tracked worker."`) |
| 4 | `packages/pi-agents-team/prompts/agents/builder.md` | Builder prompt; lacks explicit checkpoint / progress-reporting guidance |
| 5 | `packages/pi-agents-team/src/src/control-plane/team-manager.ts` | `cancelWorker` and `waitForTerminal` execution path |

---

## 4. Fix plan

### 4.1. Tighten orchestrator cancellation policy (files 1 & 2)

- Add an explicit "When to cancel a worker" section to both orchestrator prompts.
- Allow cancellation **only** for:
  1. Worker explicitly requests cancellation / cannot proceed (relay).
  2. Worker violates path scope or attempts out-of-scope changes.
  3. Worker has been **idle with no tool output for a configurable timeout** (default 5 minutes).
  4. Worker output indicates it has **lost track of the original goal** despite a steer message.
- Prohibit cancelling solely because the worker is "reading too many files" or "running too many commands" when the goal itself requires that depth.
- Require the orchestrator to call `agent_status` or `agent_message` (steer) before `agent_cancel` unless a hard timeout/policy violation is involved.

### 4.2. Tighten `agent_cancel` tool description (file 3)

- Change the description from the generic `"Abort and shut down a tracked worker."` to a policy-bound description.
- Proposed text:
  > "Abort and shut down a tracked worker. Use only when: the worker is stuck after steering, the worker is out of scope, the worker has been idle beyond the timeout, or the worker explicitly asks to stop. Do NOT use merely because the worker is doing many legitimate, goal-aligned steps."

### 4.3. Add builder checkpoint guidance (file 4)

- Insert a "Progress visibility" or "Checkpoint" block in `builder.md` instructing the builder to:
  1. Emit a concise status line after each major step (`read`, `edit`, `bash`, `write`).
  2. Stop and report if it estimates the remaining work will exceed a threshold (e.g. >10 files to touch or >30 tool calls) before continuing.
  3. Use `relay_question` when uncertain about scope rather than silently expanding work.

### 4.4. Regression tests

- Add tests that exercise the cancellation policy end-to-end:
  - A builder performing many legitimate `read`/`bash` calls on a large but scoped task **must not** be cancelled by the orchestrator.
  - A builder that goes idle or veers off topic **must** be cancelled after the prescribed policy steps.
- Target test files:
  - `packages/pi-agents-team/test/` (or equivalent)
  - Focus on orchestrator prompt rendering and `agent_cancel` tool registration/description.

---

## 5. Deferred work

### 5.1. Optional harness watchdog

- A lower-level harness watchdog could enforce deterministic budgets (max tool calls, max wall time, max tokens) independent of the LLM orchestrator.
- **Deferred** because it is a larger harness change and the prompt/tooling fixes (1–4) should be evaluated first.
- If false positives persist after 1–4, revisit watchdog hooks in `team-manager.ts` around `cancelWorker` / `waitForTerminal`.

---

## 6. Tags / index

`#builder` `#orchestrator` `#agent_cancel` `#cancellation` `#policy` `#scope` `#regression` `#watchdog` `#deferred`
