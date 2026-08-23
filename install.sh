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
EXTENSION_PATH=""   # resolved after SOURCE_DIR is known (see Step 3)
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
  -e, --extension-path DIR
                        Path to the pi-agents-team extension source (default:
                        <source>/packages/pi-agents-team). Override to pin a
                        specific source location for forks or CI.
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

  # Pin the extension source to a custom clone
  ./install.sh --extension-path /opt/my-fork/packages/pi-agents-team
EOF
  exit 0
}

# ─── Parse args ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--target)    TARGET_DIR="$2"; shift 2 ;;
    -e|--extension-path) EXTENSION_PATH="$2"; shift 2 ;;
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

if [[ -d "${PI_TEAM_DIR}" && "${FORCE}" == "false" ]]; then
  die ".pi-team/ already exists. Use --force to overwrite."
fi

if [[ -d "${PI_CONFIG_DIR}" && "${FORCE}" == "false" ]]; then
  warn ".pi/agent/ already exists — backing up"
  cp -r "${PI_CONFIG_DIR}" "${PI_CONFIG_DIR}.backup.$(date +%s)"
fi

ok "Target directory ready"

# ─── Step 3: Install pi-agents-team extension ────────────────────────────────
printf "\n${BOLD}Step 3: Installing pi-agents-team extension${NC}\n\n"

if [[ "${SKIP_EXTENSION}" == "true" ]]; then
  info "Skipping extension install (--skip-extension)"
else
  # Resolve EXTENSION_PATH: explicit --extension-path wins, else default
  # to <source>/packages/pi-agents-team. Works for both a local clone
  # (SCRIPT_DIR == SOURCE_DIR) and curl|bash (SCRIPT_DIR is somewhere else,
  # SOURCE_DIR is the temp clone).
  if [[ -z "${EXTENSION_PATH}" ]]; then
    EXTENSION_PATH="${SOURCE_DIR}/packages/pi-agents-team"
  fi
  # Always normalise to an absolute path so the audit line is unambiguous
  # and so pi's path resolver sees a stable location.
  EXTENSION_PATH="$(cd "${EXTENSION_PATH}" 2>/dev/null && pwd || echo "${EXTENSION_PATH}")"

  # Validate the source. Refuse to silently fall back to a registry install
  # — a missing local copy means the user pointed at the wrong tree.
  if [[ ! -d "${EXTENSION_PATH}" ]]; then
    die "Extension source directory not found: ${EXTENSION_PATH}
  Hint: pass --extension-path DIR to pin the source, or --skip-extension to skip."
  fi
  if [[ ! -f "${EXTENSION_PATH}/package.json" ]]; then
    die "Extension source has no package.json: ${EXTENSION_PATH}
  Hint: pass --extension-path DIR to pin the source, or --skip-extension to skip."
  fi

  info "Extension source: ${EXTENSION_PATH}"

  if command -v pi &>/dev/null; then
    info "Installing pi-agents-team extension from local source..."
    if pi install -l "${EXTENSION_PATH}" 2>/dev/null; then
      ok "pi-agents-team installed from local source (project-local)"
    elif pi install "${EXTENSION_PATH}" 2>/dev/null; then
      ok "pi-agents-team installed from local source (global)"
    else
      warn "Could not install pi-agents-team via pi install."
      warn "Install manually: pi install ${EXTENSION_PATH}"
      warn "Or for one-run:  pi -e ${EXTENSION_PATH}"
    fi
  else
    warn "pi not found — install the extension later:"
    warn "  pi install ${EXTENSION_PATH}"
  fi
fi

# ─── Step 4: Copy pi-team files ──────────────────────────────────────────────
printf "\n${BOLD}Step 4: Installing pi-team files${NC}\n\n"

# Remove existing if --force
if [[ -d "${PI_TEAM_DIR}" && "${FORCE}" == "true" ]]; then
  PI_TEAM_BACKUP="${PI_TEAM_DIR}.backup.$(date +%s)"
  info "Backing up existing .pi-team/ to ${PI_TEAM_BACKUP} (--force)"
  mv "${PI_TEAM_DIR}" "${PI_TEAM_BACKUP}"
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

# ─── Step 5: Update .gitignore ──────────────────────────────────────────────
printf "\n${BOLD}Step 5: Updating .gitignore${NC}\n\n"



GITIGNORE="${TARGET_DIR}/.gitignore"
GITIGNORE_MARKER="# Pi Team runtime"
GITIGNORE_ENTRIES=(
  "${GITIGNORE_MARKER}"
  ".pi-team/workspace/"
  ".pi-team/.teamwork/"
  ".pi-team/worktrees/"
  ".env"
  ""
)

# Append the block only once: marker prevents duplicate headers on reruns
if grep -qF "${GITIGNORE_MARKER}" "${GITIGNORE}" 2>/dev/null; then
  ok ".gitignore already has pi-team block"
else
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
fi

# ─── Step 6: Summary ───────────────────────────────────────────────
printf "\n"
printf "${BOLD}  ╔══════════════════════════════════════════════════╗${NC}\n"
printf "${BOLD}  ║              Installation Complete!              ║${NC}\n"
printf "${BOLD}  ╚══════════════════════════════════════════════════╝${NC}\n"
printf "\n"

printf "${GREEN}Installed:${NC}\n"
printf "  ${PI_TEAM_DIR}/\n"
printf "  ├── prompts/orchestrator.md          (Team Lead — Stage 1 + Stage 7)\n"
printf "  ├── prompts/agents/*.md              (six paper role prompts)\n"
printf "  ├── reference/*.md                   (7 protocol documents — paper artefacts)\n"
printf "  ├── teams/*.md                       (6 paper-aligned team presets)\n"
printf "  ├── config/                          (team.json, statuses.json, charter template)\n"
printf "  ├── bin/                             (pi-team-init, pi-team-status, pi-team-cleanup)\n"
printf "  └── workspace/                       (runtime workspace, git-ignored)\n"
printf "\n"

printf "${BOLD}Next steps:${NC}\n"
printf "\n"
printf "  1. ${BOLD}Start pi in your project${NC}\n"
printf "     cd ${TARGET_DIR}\n"
printf "     pi\n"
printf "\n"
printf "  2. ${BOLD}Verify team mode is active${NC}\n"
printf "     /agents              (list the 6 discovered team agents)\n"
printf "\n"
printf "  3. ${BOLD}Scaffold a durable record${NC}\n"
printf "     .pi-team/bin/pi-team-init.sh <team-name> <feature-id> [preset]\n"
printf "     edit .pi-team/workspace/<team-name>/CHARTER.md\n"
printf "\n"
printf "  4. ${BOLD}Give your team a goal${NC}\n"
printf "     \"Plan a feature: add CSV export to the reports page.\"\n"
printf "\n"
printf "  5. ${BOLD}Customise roles${NC} (optional)\n"
printf "     Edit .pi/agents/*.md to:\n"
printf "     - Rewrite the whenToUse trigger sentence per role\n"
printf "     - Change thinking levels (off/minimal/low/medium/high/xhigh/max)\n"
printf "     - Override prompt paths\n"
printf "\n"
printf "  6. ${BOLD}Read the paper${NC}\n"
printf "     https://yakov.khalinsky.com/agentic-team-protocol/\n"
printf "\n"

printf "${BOLD}Commands:${NC}\n"
printf "  /agents                List discovered team agents\n"
printf "  /stop-worker <id>      Abort a running worker\n"
printf "\n"

printf "${BOLD}Anti-patterns the paper names:${NC}\n"
printf "  • Role collapse: two roles merged into one agent\n"
printf "  • Missing Dispatcher: routing by implicit convention\n"
printf "  • Verifiability gap: the Verifier exists on paper but cannot inspect\n"
printf "  • Memory blindness: the Archivist is disconnected, mistakes repeat\n"
printf "  • Skipped Researcher: decisions without options or trade-offs\n"
printf "  • Runtime without rollback: live changes lack a tested recovery path\n"
printf "  • Archivist as secretary: copying chat logs instead of authoring records\n"
printf "\n"

printf "${YELLOW}⚠  Run teams on a branch you can throw away.${NC}\n"
printf "${YELLOW}   Review the durable record and charter before merging to main.${NC}\n"
printf "\n"