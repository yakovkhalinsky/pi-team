#!/usr/bin/env bash
#
# pi-team-cleanup — Remove a team workspace after feature completion
#
set -euo pipefail

TEAM_NAME="${1:-}"
PI_TEAM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${TEAM_NAME}" ]]; then
  echo "Usage: pi-team-cleanup <team-name>"
  echo ""
  echo "Removes the team workspace. The git branch is NOT deleted."
  echo "Archive important artifacts before cleanup if needed."
  exit 1
fi

WORKSPACE="${PI_TEAM_DIR}/workspace/${TEAM_NAME}"

if [[ ! -d "${WORKSPACE}" ]]; then
  echo "✗  No workspace found for team: ${TEAM_NAME}"
  exit 1
fi

echo "⚠  This will remove: ${WORKSPACE}"
echo "   The git branch '${TEAM_NAME}' will NOT be deleted."
echo ""
read -rp "Continue? [y/N] " confirm

if [[ "${confirm}" =~ ^[Yy]$ ]]; then
  rm -rf "${WORKSPACE}"
  echo "✓  Workspace removed: ${TEAM_NAME}"
else
  echo "Cancelled."
fi