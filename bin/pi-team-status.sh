#!/usr/bin/env bash
#
# pi-team-status — Show team workspace status and durable-record health
#
set -euo pipefail

PI_TEAM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="${PI_TEAM_DIR}/workspace"

if [[ ! -d "${WORKSPACE_ROOT}" || -z "$(ls -A "${WORKSPACE_ROOT}" 2>/dev/null)" ]]; then
  echo "No team workspaces found."
  echo "Run pi-team-init <team-name> <feature-id> [preset] to create one."
  exit 0
fi

echo "═══════════════════════════════════════════════════════════"
echo "  Pi Team Status"
echo "═══════════════════════════════════════════════════════════"
echo ""

for team_dir in "${WORKSPACE_ROOT}"/*/; do
  [[ -d "${team_dir}" ]] || continue
  team_name="$(basename "${team_dir}")"

  echo "  Team: ${team_name}"
  echo "  ─────────────────────────────────────────────────────"

  if [[ -f "${team_dir}/CHARTER.md" ]]; then
    ratified=$(grep -c '\- \[x\]' "${team_dir}/CHARTER.md" 2>/dev/null || true)
    total=$(grep -c '\- \[' "${team_dir}/CHARTER.md" 2>/dev/null || true)
    ratified="${ratified:-0}"
    total="${total:-0}"
    echo "  Charter: ${ratified}/${total} ratified"
  fi

  if [[ -f "${team_dir}/RECORD.md" ]]; then
    goals=$(grep -cE '^(### |<goal-id>)' "${team_dir}/RECORD.md" 2>/dev/null || true)
    goals="${goals:-0}"
    supersedes=$(grep -cE '^(- superseded-by:|<entry-id>)' "${team_dir}/RECORD.md" 2>/dev/null || true)
    supersedes="${supersedes:-0}"
    echo "  Durable record: ${goals} goals, ${supersedes} superseded entries"
  fi

  if [[ -f "${team_dir}/SKILLS.md" ]]; then
    skills=$(grep -c '^### ' "${team_dir}/SKILLS.md" 2>/dev/null || true)
    skills="${skills:-0}"
    echo "  Skills: ${skills} promoted"
  fi

  if [[ -f "${team_dir}/ESCALATIONS.md" ]]; then
    esc=$(grep -c '^\[escalation\]' "${team_dir}/ESCALATIONS.md" 2>/dev/null || true)
    esc="${esc:-0}"
    echo "  Escalations: ${esc}"
  fi

  if [[ -f "${team_dir}/events.ndjson" ]]; then
    events=$(wc -l < "${team_dir}/events.ndjson" 2>/dev/null || true)
    events="${events:-0}"
    echo "  Events: ${events} logged"
  fi

  hb_dir="${team_dir}/heartbeats"
  if [[ -d "${hb_dir}" && -n "$(ls -A "${hb_dir}" 2>/dev/null)" ]]; then
    echo "  Heartbeats:"
    for hb in "${hb_dir}"/*; do
      [[ -f "${hb}" ]] || continue
      role=$(basename "${hb}")
      line=$(head -1 "${hb}")
      echo "    ${role}: ${line}"
    done
  fi

  mb_root="${team_dir}/mailbox"
  if [[ -d "${mb_root}" ]]; then
    for mb_dir in "${mb_root}"/*/; do
      [[ -d "${mb_dir}" ]] || continue
      count=$(ls "${mb_dir}"*.md 2>/dev/null | wc -l)
      if [[ "${count}" -gt 0 ]]; then
        role=$(basename "${mb_dir}")
        echo "  Mailbox ${role}: ${count} unread"
      fi
    done
  fi

  art_dir="${team_dir}/artifacts"
  if [[ -d "${art_dir}" && -n "$(ls -A "${art_dir}" 2>/dev/null)" ]]; then
    art_count=$(find "${art_dir}" -type f | wc -l)
    echo "  Artifacts: ${art_count} files"
  fi

  echo ""
done

echo "═══════════════════════════════════════════════════════════"
echo "  Use /team in pi to see live worker status"
echo "═══════════════════════════════════════════════════════════"
