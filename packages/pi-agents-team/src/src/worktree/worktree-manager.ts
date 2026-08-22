import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
/**
 * Worktree lifecycle manager for pi-agents-team.
 *
 * Detects the git repository root from a requested cwd, then creates a
 * dedicated worktree per worker under a configurable base path. Non-git
 * projects fall back to the original cwd transparently. Worktrees are
 * removed on terminal/prune/dispose with `git worktree remove` (best-effort).
 */
export const DEFAULT_WORKTREE_BASE_PATH = ".pi-team/worktrees";
function defaultExecFile(file, args, options, callback) {
    return execFile(file, args, options, callback);
}
function promiseExecFile(file, args, options, runExecFile = defaultExecFile) {
    return new Promise((resolve, reject) => {
        runExecFile(file, args, options, (error, stdout, stderr) => {
            if (error) {
                const wrapped = new Error(`${file} ${args.join(" ")} failed: ${error.message}${stderr ? `; ${stderr}` : ""}`);
                wrapped.cause = error;
                reject(wrapped);
            }
            else {
                resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
            }
        });
    });
}
export function findGitRoot(cwd, runExecFile = defaultExecFile) {
    return promiseExecFile("git", ["rev-parse", "--show-toplevel"], { cwd }, runExecFile)
        .then((result) => result.stdout.trim())
        .catch((error) => ({ notGit: true, error }));
}
export function listGitWorktrees(cwd, runExecFile = defaultExecFile) {
    return promiseExecFile("git", ["worktree", "list", "--porcelain"], { cwd }, runExecFile)
        .then((result) => {
        const worktrees = [];
        let current = {};
        for (const line of result.stdout.split("\n")) {
            if (line.startsWith("worktree ")) {
                if (current.path)
                    worktrees.push(current);
                current = { path: line.slice("worktree ".length).trim() };
            }
            else if (line.startsWith("HEAD ")) {
                current.head = line.slice("HEAD ".length).trim();
            }
            else if (line.startsWith("branch ")) {
                current.branch = line.slice("branch ".length).trim();
            }
            else if (line === "detached") {
                current.detached = true;
            }
            else if (line === "prunable") {
                current.prunable = true;
            }
        }
        if (current.path)
            worktrees.push(current);
        return worktrees;
    })
        .catch(() => []);
}
export function resolveWorktreeBasePath(gitRoot, basePath) {
    if (isAbsolute(basePath))
        return basePath;
    return resolve(gitRoot, basePath);
}
export function buildWorktreePath(basePath, workerId) {
    return resolve(basePath, workerId);
}
export function sanitizeWorkerId(workerId) {
    // Allow only alphanumerics, hyphens, and underscores so the directory name
    // is safe and deterministic.
    return workerId.replace(/[^a-zA-Z0-9_-]/g, "_");
}
export class WorktreeManager {
    options;
    runExecFile;
    roots = new Map();
    paths = new Map();
    constructor(options = {}, runExecFile = defaultExecFile) {
        this.options = {
            enabled: options.enabled ?? true,
            basePath: options.basePath ?? DEFAULT_WORKTREE_BASE_PATH,
            cleanupOnTerminal: options.cleanupOnTerminal ?? true,
            cleanupOnPrune: options.cleanupOnPrune ?? true,
            reuseExisting: options.reuseExisting ?? true,
            fallbackToOriginalCwd: options.fallbackToOriginalCwd !== false,
        };
        this.runExecFile = runExecFile;
    }
    /**
     * Resolve the effective cwd for a worker. If worktrees are disabled or the
     * project is not under git, returns `requestedCwd`. Otherwise creates (or
     * reuses) a worktree named after the worker and returns its path.
     */
    async resolveWorkerCwd(requestedCwd, workerId) {
        if (!this.options.enabled)
            return requestedCwd;
        const existing = this.paths.get(workerId);
        if (existing)
            return existing;
        const gitRootResult = await findGitRoot(requestedCwd, this.runExecFile);
        if (typeof gitRootResult !== "string") {
            if (this.options.fallbackToOriginalCwd)
                return requestedCwd;
            throw new Error(`Worktrees enabled but ${requestedCwd} is not inside a git repository: ${gitRootResult.error?.message ?? "git detection failed"}`);
        }
        const gitRoot = gitRootResult;
        const basePath = resolveWorktreeBasePath(gitRoot, this.options.basePath);
        const safeId = sanitizeWorkerId(workerId);
        const worktreePath = buildWorktreePath(basePath, safeId);
        this.roots.set(workerId, gitRoot);
        this.paths.set(workerId, worktreePath);
        if (existsSync(worktreePath)) {
            if (this.options.reuseExisting)
                return worktreePath;
            // Remove stale directory so we can recreate it. Best-effort.
            try {
                rmSync(worktreePath, { recursive: true, force: true });
            }
            catch {
                // Ignore; `git worktree add` will fail if the path is still locked.
            }
        }
        else {
            try {
                mkdirSync(basePath, { recursive: true });
            }
            catch {
                // `git worktree add` will report the real error if creation fails.
            }
        }
        await promiseExecFile("git", ["worktree", "add", "--detach", worktreePath], { cwd: gitRoot }, this.runExecFile);
        return worktreePath;
    }
    getWorktreePath(workerId) {
        return this.paths.get(workerId);
    }
    getGitRoot(workerId) {
        return this.roots.get(workerId);
    }
    listWorktrees() {
        return Array.from(this.paths.entries()).map(([workerId, path]) => ({ workerId, path }));
    }
    /**
     * Remove a worker's worktree. Safe to call when worktrees are disabled,
     * when the worker was launched outside a worktree, or when removal fails.
     */
    async removeWorktree(workerId, force = false) {
        const path = this.paths.get(workerId);
        if (!path)
            return { removed: false };
        this.paths.delete(workerId);
        this.roots.delete(workerId);
        try {
            const args = force ? ["worktree", "remove", "--force", path] : ["worktree", "remove", path];
            await promiseExecFile("git", args, { cwd: path }, this.runExecFile);
            return { removed: true };
        }
        catch (error) {
            // Best-effort cleanup: also try recursive rm in case the worktree
            // metadata is gone but the directory remains.
            try {
                rmSync(path, { recursive: true, force: true });
            }
            catch {
                // Nothing more we can do.
            }
            return { removed: false, error };
        }
    }
    /**
     * Remove every tracked worktree. Used on dispose.
     */
    async removeAllWorktrees(force = false) {
        const results = [];
        for (const workerId of Array.from(this.paths.keys())) {
            results.push({ workerId, ...(await this.removeWorktree(workerId, force)) });
        }
        return results;
    }
}
export const _testing = {
    DEFAULT_WORKTREE_BASE_PATH,
    sanitizeWorkerId,
    buildWorktreePath,
    resolveWorktreeBasePath,
};
