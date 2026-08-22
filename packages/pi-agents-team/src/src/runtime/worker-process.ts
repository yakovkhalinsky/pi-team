import { spawn as nodeSpawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { createDeferred } from "./deferred.js";
const require = createRequire(import.meta.url);
const crossSpawn = require("cross-spawn");
export function resolveWorkerSpawnImplementation(platform = process.platform) {
    return platform === "win32" ? "cross-spawn" : "node:child_process";
}
function selectSpawn(platform = process.platform) {
    return resolveWorkerSpawnImplementation(platform) === "cross-spawn" ? crossSpawn : nodeSpawn;
}
const PROCESS_TERMINATION_GRACE_MS = 250;
const PROCESS_EXIT_WAIT_MS = 500;
const WINDOWS_TREE_KILL_TIMEOUT_MS = 500;
export const WORKER_PROCESS_DISPOSE_MAX_MS = WINDOWS_TREE_KILL_TIMEOUT_MS + PROCESS_EXIT_WAIT_MS;
function delay(ms) {
    const { promise, resolve } = createDeferred();
    setTimeout(resolve, ms);
    return promise;
}
function tryKill(processHandle, signal) {
    try {
        processHandle.kill(signal);
    }
    catch {
        // The process may already have exited.
    }
}
export async function terminateWindowsWorkerTree(processHandle, spawnTaskkill = crossSpawn, timeoutMs = WINDOWS_TREE_KILL_TIMEOUT_MS) {
    if (processHandle.pid === undefined) {
        tryKill(processHandle, "SIGKILL");
        return;
    }
    const { promise, resolve } = createDeferred();
    let killer;
    let settled = false;
    const finish = (fallback) => {
        if (settled)
            return;
        settled = true;
        clearTimeout(timeout);
        if (fallback)
            tryKill(processHandle, "SIGKILL");
        resolve();
    };
    const timeout = setTimeout(() => {
        if (killer)
            tryKill(killer, "SIGKILL");
        finish(true);
    }, timeoutMs);
    try {
        killer = spawnTaskkill("taskkill", ["/pid", String(processHandle.pid), "/T", "/F"], { stdio: "ignore" });
        killer.once("error", () => finish(true));
        killer.once("close", (code) => finish(code !== 0));
    }
    catch {
        finish(true);
    }
    await promise;
}
function signalPosixProcessGroup(processHandle, signal) {
    if (processHandle.pid === undefined)
        return processHandle.kill(signal);
    try {
        process.kill(-processHandle.pid, signal);
        return true;
    }
    catch {
        return processHandle.kill(signal);
    }
}
async function waitForExitBounded(exitPromise, timeoutMs) {
    return Promise.race([
        exitPromise,
        delay(timeoutMs).then(() => undefined),
    ]);
}
class NodeWorkerProcessHandle extends EventEmitter {
    transport;
    platform;
    stderr = "";
    exitPromise;
    disposePromise;
    constructor(transport, platform = process.platform) {
        super();
        this.transport = transport;
        this.platform = platform;
        this.transport.stderr.on("data", (chunk) => {
            this.stderr += chunk.toString();
        });
        this.transport.stdin.on("error", () => {
            // Child process launch failures are reported through the process "error" event below.
        });
        const { promise, resolve } = createDeferred();
        this.exitPromise = promise;
        this.transport.on("exit", (code, signal) => resolve({ code, signal }));
        this.transport.on("error", (error) => {
            this.stderr += `${error.message}\n`;
            resolve({ code: null, signal: null, error });
        });
    }
    get pid() {
        return this.transport.pid;
    }
    get stderrBuffer() {
        return this.stderr;
    }
    waitForExit() {
        return this.exitPromise;
    }
    kill(signal = "SIGTERM") {
        return this.platform === "win32"
            ? this.transport.kill(signal)
            : signalPosixProcessGroup(this.transport, signal);
    }
    dispose(signal = "SIGTERM") {
        if (!this.disposePromise)
            this.disposePromise = this.disposeProcess(signal);
        return this.disposePromise;
    }
    async disposeProcess(signal) {
        if (this.platform === "win32") {
            await terminateWindowsWorkerTree(this.transport);
        }
        else {
            this.kill(signal);
            await delay(PROCESS_TERMINATION_GRACE_MS);
            this.kill("SIGKILL");
        }
        return (await waitForExitBounded(this.exitPromise, PROCESS_EXIT_WAIT_MS))
            ?? { code: null, signal: "SIGKILL" };
    }
}
export function buildWorkerProcessArgs(options) {
    const args = [...(options.baseArgs ?? ["--mode", "rpc", "--no-session"])];
    if (options.projectTrust === "approve")
        args.push("--approve");
    if (options.projectTrust === "no-approve")
        args.push("--no-approve");
    if (options.model)
        args.push("--model", options.model);
    if (options.thinkingLevel)
        args.push("--thinking", options.thinkingLevel);
    if (options.tools && options.tools.length > 0)
        args.push("--tools", options.tools.join(","));
    if (options.systemPromptPath)
        args.push("--append-system-prompt", options.systemPromptPath);
    if (options.extensionMode && options.extensionMode !== "inherit") {
        args.push("--no-extensions");
        if (options.extensionMode === "worker-minimal") {
            for (const source of options.workerExtensions ?? [])
                args.push("--extension", source);
        }
        args.push("--no-prompt-templates", "--no-themes", "--no-context-files");
        if (!options.allowSkills)
            args.push("--no-skills");
    }
    if (options.extraArgs)
        args.push(...options.extraArgs);
    return args;
}
export function spawnWorkerProcess(options) {
    const command = options.command ?? "pi";
    const args = buildWorkerProcessArgs(options);
    const spawn = selectSpawn();
    const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ["pipe", "pipe", "pipe"],
        ...(process.platform === "win32" ? {} : { detached: true }),
    });
    return new NodeWorkerProcessHandle(child);
}
