import type { TeamConfig, TeamPathScope, TeamProfileSpec, ThinkingLevel, WorkerExtensionMode } from "../types.js";
export interface LaunchPolicyRequest {
    cwd: string;
    profile: TeamProfileSpec;
    pathScope?: TeamPathScope;
    model?: string;
    orchestratorModel?: string;
    orchestratorThinkingLevel?: ThinkingLevel;
    thinkingLevel?: ThinkingLevel;
    tools?: string[];
    extensionMode?: WorkerExtensionMode;
    systemPromptPath?: string;
}
export interface LaunchPolicyResult {
    cwd: string;
    profile: TeamProfileSpec;
    pathScope?: TeamPathScope;
    model?: string;
    thinkingLevel: ThinkingLevel;
    tools: string[];
    workerExtensions?: string[];
    extensionMode: WorkerExtensionMode;
    systemPromptPath: string;
}
export declare function applyLaunchPolicy(request: LaunchPolicyRequest, config?: TeamConfig): LaunchPolicyResult;
