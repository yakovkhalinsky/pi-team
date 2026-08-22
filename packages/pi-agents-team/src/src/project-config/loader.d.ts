import { type LoadedTeamProjectConfig, type ProjectRoleConfig, type RawProjectRoleConfig, type TeamConfig, type TeamConfigScope } from "../types.js";
export declare const GENERIC_WORKER_PROMPT_SENTINEL = "<generic-worker>";
/**
 * Translate the schema v4 role shape into the internal ProjectRoleConfig used
 * by materializeRoleProfile. Shape rules:
 * - model: "default" / null / absent → inherit ceiling (internal null).
 * - prompt: "default" / null / absent → builtin. String → treated as project path.
 *   Object form stays available for explicit prompt source/path control.
 * - access.write: true → "scoped-write"; false → "read-only"; absent → inherit.
 * - access groups tools, extensions, extension mode, worker spawning, and path scope.
 */
export declare function normalizeRawRoleConfig(raw: RawProjectRoleConfig): ProjectRoleConfig;
export declare function findNearestProjectConfigPath(cwd: string): string | undefined;
export declare function getGlobalProjectConfigPath(): string;
/**
 * Single source of truth for the global config path, honoring the
 * `PI_AGENT_TEAM_GLOBAL_CONFIG_PATH` env override. Returns `undefined` when
 * the env explicitly disables global (`""`/`"null"`/`"none"`), an explicit
 * path when the env is set, and the default `~/.pi/agent/agents-team.json`
 * otherwise. Tests and scripted fixtures rely on this to redirect global
 * reads/writes to a tmpdir; `/team-init global`, `/team-enable on|off --global`,
 * and deprecated `/team-enable on|off --persist global` writes must go through
 * the same helper so they don't clobber the user's real
 * home config while the env is pointed elsewhere.
 */
export declare function resolveGlobalConfigPath(): string | undefined;
export declare function findGlobalProjectConfigPath(): string | undefined;
export declare function getProjectConfigPathForScope(scope: TeamConfigScope, cwd: string): string | undefined;
export interface LoadActiveTeamConfigOptions {
    cwd: string;
    baseConfig?: TeamConfig;
    /**
     * Whether to consider the nearest project-local `.pi/agent/agents-team.json`.
     * Defaults to true for direct loader callers. The extension passes false until
     * Pi's project-trust decision says project-local resources are trusted.
     */
    projectConfigTrusted?: boolean;
    /**
     * Override the global config lookup.
     * - `undefined` (default): probe `~/.pi/agent/agents-team.json`.
     * - `null`: skip the global probe entirely (used by tests for isolation).
     * - `string`: treat this as the global config path; load if the file exists.
     */
    globalConfigPath?: string | null;
}
export declare function loadActiveTeamConfig(options?: LoadActiveTeamConfigOptions): LoadedTeamProjectConfig;
export declare function formatProjectConfigDiagnostics(result: LoadedTeamProjectConfig): string;
export declare function isProjectConfigStatus(value: string): value is LoadedTeamProjectConfig["status"];
export declare const _internalProjectConfigPaths: {
    TEAM_PROJECT_CONFIG_DIR: string;
    TEAM_PROJECT_CONFIG_FILE: string;
    TEAM_PROJECT_CONFIG_RELATIVE_PATH: string;
};
