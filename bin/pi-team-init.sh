#!/usr/bin/env bash
#
# pi-team-init — Scaffold a team charter and workspace for a new feature
#
set -euo pipefail

TEAM_NAME="${1:-}"
FEATURE_ID="${2:-}"
PRESET="${3:-full-stack}"
PI_TEAM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${TEAM_NAME}" || -z "${FEATURE_ID}" ]]; then
  echo "Usage: pi-team-init <team-name> <feature-id> [preset]"
  echo ""
  echo "Presets: full-stack, deep-backend, deep-frontend, deep-security, deep-infra, deep-llm"
  echo ""
  echo "Example:"
  echo "  pi-team-init payments-revamp ENG-100 full-stack"
  exit 1
fi

WORKSPACE="${PI_TEAM_DIR}/workspace/${TEAM_NAME}"

if [[ -d "${WORKSPACE}" ]]; then
  echo "⚠  Workspace already exists: ${WORKSPACE}"
  echo "   Use a different team name or remove it first."
  exit 1
fi

# Check preset exists
PRESET_FILE="${PI_TEAM_DIR}/teams/${PRESET}.md"
if [[ ! -f "${PRESET_FILE}" ]]; then
  echo "✗  Unknown preset: ${PRESET}"
  echo "   Available: $(ls "${PI_TEAM_DIR}/teams/"*.md | xargs -I{} basename {} .md | tr '\n' ' ')"
  exit 1
fi

# Create workspace
mkdir -p "${WORKSPACE}/artifacts"
mkdir -p "${WORKSPACE}/mailbox"
mkdir -p "${WORKSPACE}/heartbeats"

# Copy charter template
cp "${PI_TEAM_DIR}/config/charter.template.md" "${WORKSPACE}/CHARTER.md"

# Create CONTRACTS.md
cat > "${WORKSPACE}/CONTRACTS.md" <<EOF
# Contract Registry: ${TEAM_NAME}

Append-only registry of cross-task names. Every [design-note] registers what it
exports. Every plan that consumes a sibling's export cites the registry line.

## Exports

<!-- Format: <task-id> exports — <name>: <description> -->

## History

<!-- Renames are new lines that supersede old ones (supersedes: <old-name>) -->
EOF

# Create BASELINE.md
cat > "${WORKSPACE}/BASELINE.md" <<EOF
# Baseline Manifest: ${TEAM_NAME}

## Feature
${FEATURE_ID}

## Baseline commit
$(git rev-parse HEAD 2>/dev/null || echo "<not a git repo or no commits>")

## Validation commands
<!-- Record the exact commands, tool versions, and environment variable names -->
<!-- VALIDATE_BUILD: -->
<!-- VALIDATE_TEST: -->
<!-- VALIDATE_LINT: -->
<!-- VALIDATE_FORMAT: -->

## Test counts
<!-- e.g. 47 passed, 0 failed, 2 skipped -->

## Known failures
<!-- List each known failure with its cause -->
<!-- A failure is pre-existing only when the clean feature branch reproduces it -->

## Setup
<!-- Record WORKTREE_SETUP and any provisioning steps -->
EOF

# Create ESCALATIONS.md
cat > "${WORKSPACE}/ESCALATIONS.md" <<EOF
# Escalations: ${TEAM_NAME}

Log of everything escalated to the human.

---
EOF

# Create events journal
touch "${WORKSPACE}/events.ndjson"

echo "✓  Team workspace created: ${WORKSPACE}"
echo ""
echo "   Team:    ${TEAM_NAME}"
echo "   Feature: ${FEATURE_ID}"
echo "   Preset:  ${PRESET}"
echo ""
echo "   Files:"
echo "   ├── CHARTER.md          (ratify before work begins)"
echo "   ├── CONTRACTS.md        (append-only contract registry)"
echo "   ├── BASELINE.md         (record test counts and known failures)"
echo "   ├── ESCALATIONS.md      (human escalation log)"
echo "   ├── events.ndjson       (append-only event journal)"
echo "   ├── artifacts/          (logs, checklists, evidence files)"
echo "   ├── mailbox/            (agent-to-agent messages)"
echo "   └── heartbeats/         (agent liveness signals)"
echo ""
echo "Next: Edit CHARTER.md, record BASELINE.md, then start work."