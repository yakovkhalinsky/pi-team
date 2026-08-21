#!/usr/bin/env bash
#
# pi-team-init — Scaffold a team charter and durable record for a new feature
#
# Implements the Agentic Team Protocol (https://yakov.khalinsky.com/agentic-team-protocol/):
# six role contracts and a seven-stage task lifecycle.
#
set -euo pipefail

TEAM_NAME="${1:-}"
FEATURE_ID="${2:-}"
PRESET="${3:-full-fleet}"
PI_TEAM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${TEAM_NAME}" || -z "${FEATURE_ID}" ]]; then
  echo "Usage: pi-team-init <team-name> <feature-id> [preset]"
  echo ""
  echo "Presets: full-fleet, research-driven, builder-fleet, runtime-fleet, verification-fleet, archive-fleet"
  echo ""
  echo "Example:"
  echo "  pi-team-init payments-revamp ENG-100 full-fleet"
  exit 1
fi

WORKSPACE="${PI_TEAM_DIR}/workspace/${TEAM_NAME}"

if [[ -d "${WORKSPACE}" ]]; then
  echo "⚠  Workspace already exists: ${WORKSPACE}"
  echo "   Use a different team name or remove it first."
  exit 1
fi

PRESET_FILE="${PI_TEAM_DIR}/teams/${PRESET}.md"
if [[ ! -f "${PRESET_FILE}" ]]; then
  echo "✗  Unknown preset: ${PRESET}"
  echo "   Available: $(ls "${PI_TEAM_DIR}/teams/"*.md | xargs -I{} basename {} .md | tr '\n' ' ')"
  exit 1
fi

mkdir -p "${WORKSPACE}/artifacts"
mkdir -p "${WORKSPACE}/mailbox"
mkdir -p "${WORKSPACE}/heartbeats"

cp "${PI_TEAM_DIR}/config/charter.template.md" "${WORKSPACE}/CHARTER.md"

# Durable record: append-only log per the paper's §6 anti-pattern "Archivist as secretary"
cat > "${WORKSPACE}/RECORD.md" <<EOF
# Durable Record: ${TEAM_NAME}

Append-only. The paper names "Archivist as secretary" as an anti-pattern; this file
is the canonical record, not a chat-log dump. Corrections are new entries with
\`supersedes:\` — never edits.

## Lifecycle stage history

<!-- New goals append one block at the end of this section.
     Template:
     <goal-id> — <one-line description>
       Stage 1 (Goal receipt)        Team Lead       <ts>  <digest>
       Stage 2 (Routing)             Dispatcher      <ts>  <digest>  owner=<role>  confidence=<n>
       Stage 3 (Context gathering)   Researcher      <ts>  <digest>  (skipped when uncertainty is low)
       Stage 4 (Action)              Builder|Runtime <ts>  <digest>  evidence=<path>
       Stage 5 (Verification)        Verifier        <ts>  <digest>  verdict=<pass|fail|block>
       Stage 6 (Recording)           Archivist       <ts>  <digest>
       Stage 7 (Closure)             Team Lead       <ts>  <digest>  outcome=<closed|transferred>
-->

## Decision trail

<!-- Per-role decisions with reasoning, not just outcomes. The paper: "we do not just
record results; we record decisions." -->

## Superseded entries

<!-- Format:
     <entry-id>
       superseded-by: <new-entry-id>
       reason: <why>
-->
EOF

# Skills: recurring lessons the Archivist promotes from the durable record
cat > "${WORKSPACE}/SKILLS.md" <<EOF
# Skills: ${TEAM_NAME}

Skills are recurring lessons the Archivist has promoted from the durable record.
A skill is a decision the team has made repeatedly; each entry cites the source
records that motivated promotion.

## Skills

<!-- Format: ### <skill-name>
- source: <record-id or set of record-ids>
- promoted: <date>
- applies to: <stage>
- description: <what to do>
-->
EOF

# Runbooks
cat > "${WORKSPACE}/RUNBOOKS.md" <<EOF
# Runbooks: ${TEAM_NAME}

Operational procedures. The paper §8 names runbooks as part of the charter.

## Rollback (Runtime stage 4)

The paper names "Runtime without rollback" as an anti-pattern. Every live-system
change must cite a tested rollback plan; a rollback that has never been exercised
is hope, not a plan.

## Recovery (any stage)

When a goal is stuck or undelivered, the Team Lead applies the recovery ladder
before re-dispatching.

## Closure (Archivist stage 6, Team Lead stage 7)

A goal closes only after the Archivist has recorded every stage entry and the
Verifier has accepted. Stage 7 either closes the goal or transfers ownership;
the Archivist records the transfer.
EOF

# Escalations
cat > "${WORKSPACE}/ESCALATIONS.md" <<EOF
# Escalations: ${TEAM_NAME}

Log of every escalation to the human. Required fields:

  [escalation]
  question: <one sentence>
  context:  <≤ 4 lines>
  options:
    - <option 1> — <one-line consequence>
    - <option 2> — <one-line consequence>
  default-if-silent: <action> after <duration>

An [escalation] without options + default is a protocol error — pull the
andon cord instead.

---
EOF

touch "${WORKSPACE}/events.ndjson"

echo "✓  Team workspace created: ${WORKSPACE}"
echo ""
echo "   Team:    ${TEAM_NAME}"
echo "   Feature: ${FEATURE_ID}"
echo "   Preset:  ${PRESET}"
echo ""
echo "   Files:"
echo "   ├── CHARTER.md       (ratify the six roles, decision rights, lifecycle path)"
echo "   ├── RECORD.md        (append-only durable record — Stage 6 home)"
echo "   ├── SKILLS.md        (recurring lessons promoted from the record)"
echo "   ├── RUNBOOKS.md      (rollback, recovery, closure procedures)"
echo "   ├── ESCALATIONS.md   (human escalation log)"
echo "   ├── events.ndjson    (append-only event journal)"
echo "   ├── artifacts/       (logs, evidence files, gate criteria)"
echo "   ├── mailbox/         (agent-to-agent messages)"
echo "   └── heartbeats/      (agent liveness signals)"
echo ""
echo "Next: ratify CHARTER.md, then run the seven-stage lifecycle."
