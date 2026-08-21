#!/usr/bin/env bash
#
# Pi Team Installer
#
# Installs a comprehensive agentic team setup for the pi.dev coding agent harness,
# implementing the Agentic Team Protocol (https://yakov.khalinsky.com/agentic-team-protocol/).
#
set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$(pwd)"
FORCE=false
SKIP_EXTENSION=false
PI_CMD="pi"
NODE_CMD="node"
GIT_CMD="git"

# ─── Colors ──────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' BOLD='' NC=''
fi

info()  { printf "${BLUE}ℹ${NC}  %s\n" "$*"; }
ok()    { printf "${GREEN}✓${NC}  %s\n" "$*"; }
warn()  { printf "${YELLOW}⚠${NC}  %s\n" "$*"; }
error() { printf "${RED}✗${NC}  %s\n" "$*" >&2; }
die()   { error "$*"; exit 1; }

# ─── Help ────────────────────────────────────────────────────────────────────
usage() {
  cat <<'EOF'
Pi Team Installer — comprehensive agentic team setup for pi.dev

Usage: install.sh [OPTIONS]

Options:
  -t, --target DIR       Target project directory (default: current directory)
  -f, --force            Overwrite existing .pi-team/ and .pi/agent/ configs
  --skip-extension       Skip installing the pi-agents-team extension
  --pi CMD               Pi command path (default: pi)
  -h, --help             Show this help message

Examples:
  # Install into current project
  ./install.sh

  # Install into a specific project
  ./install.sh --target /path/to/my-project

  # Force overwrite existing setup
  ./install.sh --force

  # Skip extension install (already installed)
  ./install.sh --skip-extension
EOF
  exit 0
}

# ─── Parse args ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--target)    TARGET_DIR="$2"; shift 2 ;;
    -f|--force)     FORCE=true; shift ;;
    --skip-extension) SKIP_EXTENSION=true; shift ;;
    --pi)           PI_CMD="$2"; shift 2 ;;
    -h|--help)      usage ;;
    *)              die "Unknown option: $1 (use --help)" ;;
  esac
done

# ─── Header ──────────────────────────────────────────────────────────────────
printf "\n"
printf "${BOLD}  ╔══════════════════════════════════════════════════╗${NC}\n"
printf "${BOLD}  ║          Pi Team Installer  v1.0.0               ║${NC}\n"
printf "${BOLD}  ║   Agentic Team Protocol for pi.dev               ║${NC}\n"
printf "${BOLD}  ╚══════════════════════════════════════════════════╝${NC}\n"
printf "\n"

# ─── Resolve source ──────────────────────────────────────────────────────────
# If running from the repo, use local files. If running via curl, clone.
if [[ -f "${SCRIPT_DIR}/config/team.json" && -f "${SCRIPT_DIR}/prompts/orchestrator.md" ]]; then
  SOURCE_DIR="${SCRIPT_DIR}"
  info "Using local source: ${SOURCE_DIR}"
else
  info "Running from remote — cloning pi-team repository..."
  SOURCE_DIR="$(mktemp -d)"
  trap 'rm -rf "${SOURCE_DIR}"' EXIT
  if ! ${GIT_CMD} clone --depth 1 git@github.com:yakovkhalinsky/pi-team.git "${SOURCE_DIR}" 2>/dev/null; then
    if ! ${GIT_CMD} clone --depth 1 https://github.com/yakovkhalinsky/pi-team.git "${SOURCE_DIR}" 2>/dev/null; then
      die "Could not clone pi-team repository. Check network and git access."
    fi
  fi
  ok "Cloned to temporary directory"
fi

# ─── Step 1: Check prerequisites ─────────────────────────────────────────────
printf "\n${BOLD}Step 1: Checking prerequisites${NC}\n\n"

# Git
if command -v git &>/dev/null; then
  ok "git: $(git --version 2>/dev/null | head -1)"
else
  die "git is required but not found in PATH"
fi

# Node
if command -v node &>/dev/null; then
  NODE_VERSION="$(node --version 2>/dev/null)"
  NODE_MAJOR="${NODE_VERSION#v}"
  NODE_MAJOR="${NODE_MAJOR%%.*}"
  if [[ "${NODE_MAJOR}" -lt 22 ]]; then
    warn "Node ${NODE_VERSION} — pi-agents-team requires >= 22.19.0"
  else
    ok "Node: ${NODE_VERSION}"
  fi
else
  warn "Node.js not found — required by pi and pi-agents-team (>= 22.19.0)"
fi

# Pi
if command -v pi &>/dev/null; then
  ok "pi: found at $(command -v pi)"
elif [[ "${SKIP_EXTENSION}" == "true" ]]; then
  warn "pi not found in PATH — skipping extension check"
else
  warn "pi not found in PATH — you'll need to install it: npm install -g @earendil-works/pi-coding-agent"
fi

# ─── Step 2: Validate target ─────────────────────────────────────────────────
printf "\n${BOLD}Step 2: Validating target directory${NC}\n\n"

TARGET_DIR="$(cd "${TARGET_DIR}" && pwd)"
info "Target: ${TARGET_DIR}"

if [[ ! -d "${TARGET_DIR}" ]]; then
  die "Target directory does not exist: ${TARGET_DIR}"
fi

if [[ ! -w "${TARGET_DIR}" ]]; then
  die "Target directory is not writable: ${TARGET_DIR}"
fi

# Check for existing installation
PI_TEAM_DIR="${TARGET_DIR}/.pi-team"
PI_CONFIG_DIR="${TARGET_DIR}/.pi/agent"
PI_CONFIG_FILE="${PI_CONFIG_DIR}/agents-team.json"

if [[ -d "${PI_TEAM_DIR}" && "${FORCE}" == "false" ]]; then
  die ".pi-team/ already exists. Use --force to overwrite."
fi

if [[ -f "${PI_CONFIG_FILE}" && "${FORCE}" == "false" ]]; then
  warn ".pi/agent/agents-team.json already exists — backing up"
  cp "${PI_CONFIG_FILE}" "${PI_CONFIG_FILE}.backup.$(date +%s)"
fi

ok "Target directory ready"

# ─── Step 3: Install pi-agents-team extension ────────────────────────────────
printf "\n${BOLD}Step 3: Installing pi-agents-team extension${NC}\n\n"

if [[ "${SKIP_EXTENSION}" == "true" ]]; then
  info "Skipping extension install (--skip-extension)"
else
  if command -v pi &>/dev/null; then
    info "Installing pi-agents-team extension..."
    if pi install -l npm:pi-agents-team 2>/dev/null; then
      ok "pi-agents-team installed (project-local)"
    elif pi install npm:pi-agents-team 2>/dev/null; then
      ok "pi-agents-team installed (global)"
    else
      warn "Could not install pi-agents-team via pi install."
      warn "Install manually: pi install npm:pi-agents-team"
      warn "Or for one-run:  pi -e npm:pi-agents-team"
    fi
  else
    warn "pi not found — install the extension later:"
    warn "  pi install npm:pi-agents-team"
  fi
fi

# ─── Step 4: Copy pi-team files ──────────────────────────────────────────────
printf "\n${BOLD}Step 4: Installing pi-team files${NC}\n\n"

# Remove existing if --force
if [[ -d "${PI_TEAM_DIR}" && "${FORCE}" == "true" ]]; then
  info "Removing existing .pi-team/ (--force)"
  rm -rf "${PI_TEAM_DIR}"
fi

# Create directories
mkdir -p "${PI_TEAM_DIR}/prompts/agents"
mkdir -p "${PI_TEAM_DIR}/reference"
mkdir -p "${PI_TEAM_DIR}/teams"
mkdir -p "${PI_TEAM_DIR}/config"
mkdir -p "${PI_TEAM_DIR}/bin"
mkdir -p "${PI_TEAM_DIR}/workspace"
mkdir -p "${PI_CONFIG_DIR}"

# Copy prompts
info "Copying prompts..."
cp "${SOURCE_DIR}/prompts/orchestrator.md" "${PI_TEAM_DIR}/prompts/"
for f in "${SOURCE_DIR}"/prompts/agents/*.md; do
  [[ -f "$f" ]] && cp "$f" "${PI_TEAM_DIR}/prompts/agents/"
done
ok "Prompts installed ($(ls "${PI_TEAM_DIR}/prompts/agents/"*.md 2>/dev/null | wc -l) role prompts + orchestrator)"

# Copy reference docs
info "Copying reference documentation..."
for f in "${SOURCE_DIR}"/reference/*.md; do
  [[ -f "$f" ]] && cp "$f" "${PI_TEAM_DIR}/reference/"
done
ok "Reference docs installed ($(ls "${PI_TEAM_DIR}/reference/"*.md 2>/dev/null | wc -l) documents)"

# Copy team presets
info "Copying team presets..."
for f in "${SOURCE_DIR}"/teams/*.md; do
  [[ -f "$f" ]] && cp "$f" "${PI_TEAM_DIR}/teams/"
done
ok "Team presets installed ($(ls "${PI_TEAM_DIR}/teams/"*.md 2>/dev/null | wc -l) presets)"

# Copy config
info "Copying configuration..."
cp "${SOURCE_DIR}/config/team.json" "${PI_TEAM_DIR}/config/"
cp "${SOURCE_DIR}/config/statuses.json" "${PI_TEAM_DIR}/config/"
cp "${SOURCE_DIR}/config/charter.template.md" "${PI_TEAM_DIR}/config/"
ok "Configuration installed"

# Copy bin scripts
info "Copying helper scripts..."
for f in "${SOURCE_DIR}"/bin/*.sh; do
  [[ -f "$f" ]] && cp "$f" "${PI_TEAM_DIR}/bin/" && chmod +x "${PI_TEAM_DIR}/bin/$(basename "$f")"
done
ok "Helper scripts installed"

# ─── Step 5: Create .pi/agent/agents-team.json ───────────────────────────────
printf "\n${BOLD}Step 5: Creating pi agents-team config${NC}\n\n"

if [[ -f "${PI_CONFIG_FILE}" && "${FORCE}" == "true" ]]; then
  info "Overwriting agents-team.json (--force)"
fi

cp "${SOURCE_DIR}/config/team.json" "${PI_CONFIG_FILE}"
ok "Created ${PI_CONFIG_FILE}"

# ─── Step 6: Update .gitignore ───────────────────────────────────────────────
printf "\n${BOLD}Step 6: Updating .gitignore${NC}\n\n"

GITIGNORE="${TARGET_DIR}/.gitignore"
GITIGNORE_ENTRIES=(
  "# Pi Team runtime"
  ".pi-team/workspace/"
  ".pi-team/.teamwork/"
  ""
)

# Check if entries already exist
NEEDS_UPDATE=false
for entry in ".pi-team/workspace/" ".pi-team/.teamwork/"; do
  if ! grep -qF "${entry}" "${GITIGNORE}" 2>/dev/null; then
    NEEDS_UPDATE=true
    break
  fi
done

if [[ "${NEEDS_UPDATE}" == "true" ]]; then
  # Append with newline if file exists and doesn't end with one
  if [[ -f "${GITIGNORE}" ]]; then
    if [[ -s "${GITIGNORE}" && "$(tail -c1 "${GITIGNORE}")" != "" ]]; then
      printf "\n" >> "${GITIGNORE}"
    fi
  fi
  for entry in "${GITIGNORE_ENTRIES[@]}"; do
    printf "%s\n" "${entry}" >> "${GITIGNORE}"
  done
  ok "Updated .gitignore with .pi-team/ runtime entries"
else
  ok ".gitignore already has pi-team entries"
fi

# ─── Step 7: Summary ─────────────────────────────────────────────────────────
printf "\n"
printf "${BOLD}  ╔══════════════════════════════════════════════════╗${NC}\n"
printf "${BOLD}  ║              Installation Complete!              ║${NC}\n"
printf "${BOLD}  ╚══════════════════════════════════════════════════╝${NC}\n"
printf "\n"

printf "${GREEN}Installed:${NC}\n"
printf "  ${PI_TEAM_DIR}/\n"
printf "  ├── prompts/orchestrator.md          (orchestrator contract)\n"
printf "  ├── prompts/agents/*.md              (16 role prompts)\n"
printf "  ├── reference/*.md                   (7 protocol documents)\n"
printf "  ├── teams/*.md                       (6 preset teams)\n"
printf "  ├── config/                          (team.json, statuses.json, charter template)\n"
printf "  ├── bin/                             (helper scripts)\n"
printf "  └── workspace/                       (runtime workspace, git-ignored)\n"
printf "  ${PI_CONFIG_FILE}        (pi agents-team config)\n"
printf "\n"

printf "${BOLD}Next steps:${NC}\n"
printf "\n"
printf "  1. ${BOLD}Start pi in your project${NC}\n"
printf "     cd ${TARGET_DIR}\n"
printf "     pi\n"
printf "\n"
printf "  2. ${BOLD}Verify team mode is active${NC}\n"
printf "     /team-enable on\n"
printf "     /team              (open the dashboard)\n"
printf "\n"
printf "  3. ${BOLD}Give your team a goal${NC}\n"
printf "     \"Plan a feature: add CSV export to the reports page.\"\n"
printf "\n"
printf "  4. ${BOLD}Customise roles${NC} (optional)\n"
printf "     Edit .pi/agent/agents-team.json to:\n"
printf "     - Rename roles\n"
printf "     - Change thinking levels\n"
printf "     - Override prompt paths\n"
printf "     - Add custom roles\n"
printf "\n"
printf "  5. ${BOLD}Read the protocol${NC}\n"
printf "     .pi-team/reference/protocol.md        (core protocol)\n"
printf "     .pi-team/reference/task-lifecycle.md  (7-stage lifecycle)\n"
printf "     .pi-team/reference/markers.md         (coordination markers)\n"
printf "\n"
printf "${BOLD}Commands:${NC}\n"
printf "  /team                  Live dashboard\n"
printf "  /team-steer <id> <msg> Message a worker\n"
printf "  /team-stop <id|all>    Stop workers\n"
printf "  /team-result <id>      Get worker's final answer\n"
printf "  /team-enable on|off    Toggle team/solo mode\n"
printf "\n"

printf "${YELLOW}⚠  Run teams on a branch you can throw away.${NC}\n"
printf "${YELLOW}   Review the tracker before merging to main.${NC}\n"
printf "\n"