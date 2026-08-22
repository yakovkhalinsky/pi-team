export const TEAM_STATE_VERSION = 1;
export const TEAM_PERSISTENCE_VERSION = 2;
export const TEAM_SESSION_MODES = ["orchestrator", "worker"];
/**
 * Names the plugin ships packaged `prompts/agents/<name>.md` prompts for.
 * In schema v4, these are NOT a ceiling — users may rename, drop, or add roles
 * freely. This list is only used for two things:
 *   1. The default `/team-init` scaffold seeds these role keys so first-time
 *      operators see a sensible starting point.
 *   2. When `role.prompt === "default"`, the loader looks for a packaged prompt
 *      at `prompts/agents/<roleName>.md`. Matching names get the packaged file;
 *      custom names get the generic worker template.
 */
export const TEAM_PROFILE_NAMES = [
    "dispatcher",
    "builder",
    "runtime",
    "verifier",
    "researcher",
    "archivist",
];
export function isPackagedProfileName(name) {
    return TEAM_PROFILE_NAMES.includes(name);
}
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
export const WORKER_EXTENSION_MODES = ["inherit", "disable", "worker-minimal"];
export const WORKER_PROJECT_TRUST_OVERRIDES = ["approve", "no-approve"];
export const WORKER_WRITE_POLICIES = ["read-only", "scoped-write"];
// Version constants are the single source of truth for both agents-team.json
// counters. To bump either one, edit ./project-config/versions.ts — no other
// file needs changing. See CLAUDE.md "Schema versioning" for which counter to
// bump in which situation.
import { TEAM_PROJECT_SCHEMA_VERSION, TEAM_PROJECT_SCHEMA_VERSIONS_SUPPORTED, TEAM_SCAFFOLD_VERSION, } from "./project-config/versions.js";
export { TEAM_PROJECT_SCHEMA_VERSION, TEAM_PROJECT_SCHEMA_VERSIONS_SUPPORTED, TEAM_SCAFFOLD_VERSION };
export const DEFAULT_MODEL_SENTINEL = "default";
export const DEFAULT_PROMPT_SENTINEL = "default";
export const TEAM_PROJECT_CONFIG_FILE = "agents-team.json";
export const TEAM_PROJECT_CONFIG_DIR = ".pi/agent";
export const TEAM_PROJECT_CONFIG_RELATIVE_PATH = `${TEAM_PROJECT_CONFIG_DIR}/${TEAM_PROJECT_CONFIG_FILE}`;
export const TEAM_CONFIG_SCOPES = ["global", "project"];
export const TEAM_ENABLED_SOURCES = ["default", "global", "project"];
export const TEAM_PROMPT_SOURCES = ["builtin", "project"];
export const PROJECT_CONFIG_STATUSES = ["builtin", "project", "invalid"];
export const PROJECT_CONFIG_DIAGNOSTIC_SEVERITIES = ["info", "warning", "error"];
export const WORKER_STATUSES = [
    "created",
    "starting",
    "idle",
    "running",
    "waiting_followup",
    "completed",
    "aborted",
    "error",
    "exited",
];
export const PERSISTED_TERMINAL_WORKER_STATUSES = [
    "idle",
    "completed",
    "aborted",
    "error",
    "exited",
];
export function compareWorkerIds(a, b) {
    const am = /^w(\d+)$/.exec(a);
    const bm = /^w(\d+)$/.exec(b);
    if (am && bm)
        return Number(am[1]) - Number(bm[1]);
    if (am)
        return -1;
    if (bm)
        return 1;
    return a.localeCompare(b);
}
export const TEAM_TASK_STATUSES = [
    "queued",
    "running",
    "waiting_followup",
    "completed",
    "blocked",
    "failed",
    "cancelled",
];
export const RELAY_URGENCIES = ["low", "medium", "high"];
export const PING_MODES = ["passive", "active"];
