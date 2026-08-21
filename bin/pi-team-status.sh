#!/usr/bin/env bash
#
# pi-team-status — Show team workspace status and active workers
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

  # Charter status
  if [[ -f "${team_dir}/CHARTER.md" ]]; then
    ratified=$(grep -c '\- \[x\]' "${team_dir}/CHARTER.md" 2>/dev/null || echo 0)
    total=$(grep -c '\- \[' "${team_dir}/CHARTER.md" 2>/dev/null || echo 0)
    echo "  Charter: ${ratified}/${total} ratified"
  fi

  # Contract registry
  if [[ -f "${team_dir}/CONTRACTS.md" ]]; then
    exports=$(grep -c 'exports —' "${team_dir}/CONTRACTS.md" 2>/dev/null || echo 0)
    echo "  Contracts: ${exports} exports registered"
  fi

  # Escalations
  if [[ -f "${team_dir}/ESCALATIONS.md" ]]; then
    esc_count=$(grep -c '^\[escalation\]' "${team_dir}/ESCALATIONS.md" 2>/dev/null || echo 0)
    echo "  Escalations: ${esc_count}"
  fi

  # Events
  if [[ -f "${team_dir}/events.ndjson" ]]; then
    event_count=$(wc -l < "${team_dir}/events.ndjson" 2>/dev/null || echo 0)
    echo "  Events: ${event_count} logged"
  fi

  # Heartbeats
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

  # Mailbox
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

  # Artifacts
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