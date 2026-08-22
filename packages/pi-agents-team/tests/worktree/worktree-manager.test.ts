import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
    WorktreeManager,
    findGitRoot,
    listGitWorktrees,
    sanitizeWorkerId,
    buildWorktreePath,
    resolveWorktreeBasePath,
} from "../../src/src/worktree/worktree-manager.js";

describe("worktree/worktree-manager", () => {
    function makeMockExecFile() {
        const calls: Array<{ file: string; args: string[]; cwd?: string }> = [];
        const mock = (file: string, args: string[], options: { cwd?: string }, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
            calls.push({ file, args, cwd: options.cwd });
            callback(null, "", "");
        };
        return { mock, calls };
    }

    function makeMockExecFileWithHandler(handler: (file: string, args: string[], cwd?: string) => { stdout?: string; stderr?: string; error?: Error }) {
        const calls: Array<{ file: string; args: string[]; cwd?: string }> = [];
        const mock = (file: string, args: string[], options: { cwd?: string }, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
            calls.push({ file, args, cwd: options.cwd });
            const result = handler(file, args, options.cwd);
            if (result?.error) {
                callback(result.error, "", result.stderr ?? "");
            } else {
                callback(null, result?.stdout ?? "", result?.stderr ?? "");
            }
        };
        return { mock, calls };
    }

    describe("findGitRoot", () => {
        it("returns the git root when git rev-parse succeeds", async () => {
            const { mock } = makeMockExecFileWithHandler((_file, args, _cwd) => {
                if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
                    return { stdout: "/home/user/project\n" };
                }
                return {};
            });
            const result = await findGitRoot("/some/path", mock);
            assert.equal(result, "/home/user/project");
        });

        it("returns a not-git marker when git rev-parse fails", async () => {
            const { mock } = makeMockExecFileWithHandler((_file, args, _cwd) => {
                if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
                    return { error: new Error("not a git repository") };
                }
                return {};
            });
            const result = await findGitRoot("/some/path", mock);
            assert.equal(typeof result === "object" && "notGit" in result, true);
        });
    });

    describe("listGitWorktrees", () => {
        it("parses git worktree list --porcelain output", async () => {
            const porcelain = [
                "worktree /home/user/project/.wt/w1",
                "HEAD cdb27aa1c25f8c3422a3c31c79c8a48d2095f3fe",
                "branch refs/heads/feature-1",
                "",
                "worktree /home/user/project/.wt/w2",
                "HEAD cdb27aa1c25f8c3422a3c31c79c8a48d2095f3fe",
                "detached",
                "",
            ].join("\n");
            const { mock } = makeMockExecFileWithHandler((_file, args, _cwd) => {
                if (args[0] === "worktree" && args[1] === "list") {
                    return { stdout: porcelain };
                }
                return {};
            });
            const worktrees = await listGitWorktrees("/home/user/project", mock);
            assert.equal(worktrees.length, 2);
            assert.equal(worktrees[0].path, "/home/user/project/.wt/w1");
            assert.equal(worktrees[0].branch, "refs/heads/feature-1");
            assert.equal(worktrees[1].detached, true);
        });

        it("returns an empty array on git failure", async () => {
            const { mock } = makeMockExecFileWithHandler((_file, args, _cwd) => {
                if (args[0] === "worktree" && args[1] === "list") {
                    return { error: new Error("fatal: not a git repo") };
                }
                return {};
            });
            const worktrees = await listGitWorktrees("/nope", mock);
            assert.deepEqual(worktrees, []);
        });
    });

    describe("helpers", () => {
        it("sanitizes worker ids", () => {
            assert.equal(sanitizeWorkerId("w1"), "w1");
            assert.equal(sanitizeWorkerId("worker/1"), "worker_1");
            assert.equal(sanitizeWorkerId("worker 1"), "worker_1");
        });

        it("resolves absolute base paths unchanged", () => {
            assert.equal(resolveWorktreeBasePath("/project", "/wt"), "/wt");
        });

        it("resolves relative base paths against the git root", () => {
            assert.equal(resolveWorktreeBasePath("/project", ".wt"), resolve("/project", ".wt"));
        });

        it("builds worktree paths under the base", () => {
            assert.equal(buildWorktreePath("/project/.wt", "w1"), resolve("/project/.wt/w1"));
        });
    });

    describe("WorktreeManager", () => {
        it("returns the original cwd when worktrees are disabled", async () => {
            const manager = new WorktreeManager({ enabled: false });
            const cwd = await manager.resolveWorkerCwd("/project", "w1");
            assert.equal(cwd, "/project");
        });

        it("falls back to original cwd for non-git projects when fallback is enabled", async () => {
            const { mock, calls } = makeMockExecFileWithHandler((_file, args, _cwd) => {
                if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
                    return { error: new Error("not a git repository") };
                }
                return {};
            });
            const manager = new WorktreeManager({ enabled: true, fallbackToOriginalCwd: true }, mock);
            const cwd = await manager.resolveWorkerCwd("/not-git", "w1");
            assert.equal(cwd, "/not-git");
            assert.equal(calls.length, 1);
        });

        it("throws for non-git projects when fallback is disabled", async () => {
            const { mock } = makeMockExecFileWithHandler((_file, args, _cwd) => {
                if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
                    return { error: new Error("not a git repository") };
                }
                return {};
            });
            const manager = new WorktreeManager({ enabled: true, fallbackToOriginalCwd: false }, mock);
            await assert.rejects(manager.resolveWorkerCwd("/not-git", "w1"), /not a git repository/);
        });

        it("creates a worktree under the configured base path for a git project", async () => {
            const tmp = mkdtempSync(join(tmpdir(), "pi-team-worktree-"));
            try {
                const { mock, calls } = makeMockExecFileWithHandler((file, args, cwd) => {
                    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
                        return { stdout: `${tmp}\n` };
                    }
                    return {};
                });
                const manager = new WorktreeManager({ enabled: true, basePath: ".pi-team/worktrees" }, mock);
                const cwd = await manager.resolveWorkerCwd(tmp, "w1");
                assert.equal(cwd, resolve(tmp, ".pi-team/worktrees/w1"));
                const addCall = calls.find((call) => call.args[0] === "worktree" && call.args[1] === "add");
                assert.ok(addCall);
                assert.equal(addCall?.args[2], "--detach");
                assert.equal(addCall?.args[3], resolve(tmp, ".pi-team/worktrees/w1"));
                assert.equal(manager.getWorktreePath("w1"), resolve(tmp, ".pi-team/worktrees/w1"));
                assert.equal(manager.getGitRoot("w1"), tmp);
            }
            finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it("reuses an existing worktree path without re-running git worktree add", async () => {
            const tmp = mkdtempSync(join(tmpdir(), "pi-team-worktree-"));
            const worktreePath = resolve(tmp, ".pi-team/worktrees/w1");
            try {
                mkdirSync(worktreePath, { recursive: true });
                const { mock, calls } = makeMockExecFileWithHandler((file, args, cwd) => {
                    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
                        return { stdout: `${tmp}\n` };
                    }
                    return {};
                });
                const manager = new WorktreeManager({ enabled: true, basePath: ".pi-team/worktrees" }, mock);
                const cwd = await manager.resolveWorkerCwd(tmp, "w1");
                assert.equal(cwd, worktreePath);
                const addCall = calls.find((call) => call.args[0] === "worktree" && call.args[1] === "add");
                assert.equal(addCall, undefined);
            }
            finally {
                rmSync(tmp, { recursive: true, force: true });
            }
        });

        it("removes a tracked worktree", async () => {
            const { mock, calls } = makeMockExecFileWithHandler((file, args, cwd) => {
                if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
                    return { stdout: "/project\n" };
                }
                return {};
            });
            const manager = new WorktreeManager({ enabled: true, basePath: ".wt" }, mock);
            await manager.resolveWorkerCwd("/project", "w1");
            await manager.removeWorktree("w1");
            const removeCall = calls.find((call) => call.args[0] === "worktree" && call.args[1] === "remove");
            assert.ok(removeCall);
            assert.equal(removeCall?.args[2], resolve("/project", ".wt/w1"));
            assert.equal(manager.getWorktreePath("w1"), undefined);
        });

        it("removes all tracked worktrees on dispose", async () => {
            const { mock, calls } = makeMockExecFileWithHandler((file, args, cwd) => {
                if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
                    return { stdout: "/project\n" };
                }
                return {};
            });
            const manager = new WorktreeManager({ enabled: true, basePath: ".wt" }, mock);
            await manager.resolveWorkerCwd("/project", "w1");
            await manager.resolveWorkerCwd("/project", "w2");
            const removed = await manager.removeAllWorktrees();
            assert.equal(removed.length, 2);
            const removeCalls = calls.filter((call) => call.args[0] === "worktree" && call.args[1] === "remove");
            assert.equal(removeCalls.length, 2);
        });

        it("is safe to remove an untracked worker id", async () => {
            const manager = new WorktreeManager({ enabled: true });
            const result = await manager.removeWorktree("w999");
            assert.equal(result.removed, false);
        });

        it("reports the list of tracked worktrees", async () => {
            const { mock } = makeMockExecFileWithHandler((file, args, cwd) => {
                if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
                    return { stdout: "/project\n" };
                }
                return {};
            });
            const manager = new WorktreeManager({ enabled: true, basePath: ".wt" }, mock);
            await manager.resolveWorkerCwd("/project", "w1");
            await manager.resolveWorkerCwd("/project", "w2");
            const list = manager.listWorktrees();
            assert.deepEqual(list.map((item) => item.workerId).sort(), ["w1", "w2"]);
        });
    });
});
