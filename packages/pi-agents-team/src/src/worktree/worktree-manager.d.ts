import type { ExecFileException } from "node:child_process";
export declare const DEFAULT_WORKTREE_BASE_PATH = ".pi-team/worktrees";
export interface GitWorktreeEntry {
    path: string;
    head?: string;
    branch?: string;
    detached?: boolean;
    prunable?: boolean;
}
export interface WorktreeManagerOptions {
    enabled?: boolean;
    basePath?: string;
    cleanupOnTerminal?: boolean;
    cleanupOnPrune?: boolean;
    reuseExisting?: boolean;
    fallbackToOriginalCwd?: boolean;
}
export interface WorktreeRemovalResult {
    removed: boolean;
    error?: Error;
}
export interface WorktreeRemovalSummary {
    workerId: string;
    removed: boolean;
    error?: Error;
}
type ExecFileCallback = (error: ExecFileException | null, stdout: string, stderr: string) => void;
type ExecFileRunner = (file: string, args: string[], options: {
    cwd?: string;
}, callback: ExecFileCallback) => unknown;
export declare function findGitRoot(cwd: string, runExecFile?: ExecFileRunner): Promise<string | {
    notGit: true;
    error: Error;
}>;
export declare function listGitWorktrees(cwd: string, runExecFile?: ExecFileRunner): Promise<GitWorktreeEntry[]>;
export declare function resolveWorktreeBasePath(gitRoot: string, basePath: string): string;
export declare function buildWorktreePath(basePath: string, workerId: string): string;
export declare function sanitizeWorkerId(workerId: string): string;
export declare class WorktreeManager {
    options: Required<WorktreeManagerOptions>;
    private runExecFile;
    private roots;
    private paths;
    constructor(options?: WorktreeManagerOptions, runExecFile?: ExecFileRunner);
    resolveWorkerCwd(requestedCwd: string, workerId: string): Promise<string>;
    getWorktreePath(workerId: string): string | undefined;
    getGitRoot(workerId: string): string | undefined;
    listWorktrees(): Array<{
        workerId: string;
        path: string;
    }>;
    removeWorktree(workerId: string, force?: boolean): Promise<WorktreeRemovalResult>;
    removeAllWorktrees(force?: boolean): Promise<WorktreeRemovalSummary[]>;
}
export declare const _testing: {
    DEFAULT_WORKTREE_BASE_PATH: string;
    sanitizeWorkerId: (workerId: string) => string;
    buildWorktreePath: (basePath: string, workerId: string) => string;
    resolveWorktreeBasePath: (gitRoot: string, basePath: string) => string;
};
export {};
