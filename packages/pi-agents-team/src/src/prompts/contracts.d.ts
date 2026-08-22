import type { RoutingMode } from "../control-plane/team-manager.js";
import type { DelegatedTaskInput, PersistedTeamState, TeamConfig } from "../types.js";
export declare function getOrchestratorPromptPath(): string;
export declare function getWorkerPromptPath(profileName: string, config?: TeamConfig): string;
export declare function loadOrchestratorPrompt(): string;
/**
 * Resolve the worker prompt for a given profile, handling:
 *  - inline prompt text (from `"prompt": "<prose>"` that didn't resolve to a file)
 *  - the generic-worker sentinel (from `"prompt": "default"` on a custom-named role)
 *  - a packaged or project-provided markdown file
 *
 * For generic-worker resolution, the role's name + description are substituted
 * into `{NAME}` / `{DESCRIPTION}` placeholders in the template.
 */
export declare function loadWorkerPrompt(profileName: string, config?: TeamConfig): string;
export declare function buildOrchestratorPromptBundle(state: PersistedTeamState, config?: TeamConfig, routingMode?: RoutingMode): string;
export declare function buildWorkerTaskPrompt(task: DelegatedTaskInput): string;
