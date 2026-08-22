import { spawn as nodeSpawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, delimiter, extname, isAbsolute, resolve, win32 } from "node:path";
import { VERSION } from "@earendil-works/pi-coding-agent";
const require = createRequire(import.meta.url);
const crossSpawn = require("cross-spawn");
export const HOST_PI_VERSION = VERSION;
export const MINIMUM_WORKER_PI_VERSION = "0.80.6";
const DEFAULT_PROBE_TIMEOUT_MS = 5_000;
export const SUCCESSFUL_PROBE_CACHE_TTL_MS = 30_000;
export const MAX_COMPLETED_PROBE_CACHE_ENTRIES = 64;
const PROBE_OUTPUT_LIMIT_BYTES = 64 * 1024;
const DIAGNOSTIC_LIMIT_CHARS = 500;
const probeCache = new Map();
export function parsePiVersion(output) {
    const match = output.trim().match(/^(?:pi(?:\s+version)?\s+)?v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/i);
    if (!match)
        return undefined;
    const prerelease = match[4]?.split(".") ?? [];
    if (prerelease.some((identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith("0"))) {
        return undefined;
    }
    const core = `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease,
        text: `${core}${prerelease.length > 0 ? `-${prerelease.join(".")}` : ""}`,
    };
}
export function comparePiVersions(left, right) {
    const core = left.major - right.major || left.minor - right.minor || left.patch - right.patch;
    if (core !== 0)
        return core;
    if (left.prerelease.length === 0)
        return right.prerelease.length === 0 ? 0 : 1;
    if (right.prerelease.length === 0)
        return -1;
    for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index += 1) {
        const leftPart = left.prerelease[index];
        const rightPart = right.prerelease[index];
        if (leftPart === undefined)
            return -1;
        if (rightPart === undefined)
            return 1;
        if (leftPart === rightPart)
            continue;
        const leftNumeric = /^\d+$/.test(leftPart);
        const rightNumeric = /^\d+$/.test(rightPart);
        if (leftNumeric && rightNumeric)
            return Number(leftPart) - Number(rightPart);
        if (leftNumeric !== rightNumeric)
            return leftNumeric ? -1 : 1;
        return leftPart < rightPart ? -1 : 1;
    }
    return 0;
}
/**
 * Build the version invocation from the launch contract rather than attempting
 * to parse the wrapper runtime's options. Everything before Pi's explicit RPC
 * mode boundary is the immutable executable prefix (wrapper flags, their
 * values, and the Pi CLI entrypoint); RPC/session flags from the boundary on
 * are replaced by --version.
 */
export function buildPiVersionArgs(baseArgs) {
    if (!baseArgs)
        return ["--version"];
    let rpcBoundary = -1;
    for (let index = 0; index < baseArgs.length; index += 1) {
        if (baseArgs[index] === "--mode" && baseArgs[index + 1] === "rpc")
            rpcBoundary = index;
        if (baseArgs[index] === "--mode=rpc")
            rpcBoundary = index;
    }
    const versionPrefix = rpcBoundary === -1 ? baseArgs : baseArgs.slice(0, rpcBoundary);
    return [...versionPrefix, "--version"];
}
function environmentValue(env, name) {
    if (process.platform !== "win32")
        return env[name];
    const matchingKey = Object.keys(env).sort().find((key) => key.toLowerCase() === name.toLowerCase());
    return matchingKey === undefined ? undefined : env[matchingKey];
}
function executableCandidates(command, env) {
    if (process.platform !== "win32" || extname(command))
        return [command];
    const pathExt = environmentValue(env, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD";
    return [command, ...pathExt.split(";").filter(Boolean).map((extension) => `${command}${extension.toLowerCase()}`)];
}
function fingerprint(value) {
    return createHash("sha256").update(value).digest("hex");
}
function fileIdentity(path) {
    try {
        const stat = statSync(path);
        return `${path}\0file:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    }
    catch {
        return path;
    }
}
function resolveCommandIdentity(command, cwd, suppliedEnv) {
    const env = suppliedEnv ?? process.env;
    if (isAbsolute(command) || command.includes("/") || command.includes("\\")) {
        return fileIdentity(resolve(cwd, command));
    }
    const pathValue = environmentValue(env, "PATH") ?? (process.platform === "win32" ? "" : "/usr/bin:/bin");
    for (const directory of pathValue.split(delimiter)) {
        if (!directory)
            continue;
        for (const candidate of executableCandidates(command, env)) {
            const path = resolve(cwd, directory, candidate);
            if (existsSync(path))
                return fileIdentity(path);
        }
    }
    const pathExt = environmentValue(env, "PATHEXT") ?? "";
    return `unresolved:${command}\0lookup:${fingerprint(`${cwd}\0${pathValue}\0${pathExt}`)}`;
}
function isUrlLike(value) {
    return /^[A-Za-z][A-Za-z\d+.-]*:/.test(value);
}
function resolvePrefixResourceIdentity(value, cwd) {
    const driveMatch = /^([A-Za-z]):(.*)$/.exec(value);
    if (driveMatch) {
        const drive = driveMatch[1].toUpperCase();
        const tail = driveMatch[2];
        if (/^[\\/]/.test(tail)) {
            const normalized = `${drive}:${tail.replaceAll("\\", "/")}`;
            return process.platform === "win32" ? fileIdentity(win32.resolve(value)) : `windows-path:${normalized}`;
        }
        const resolvedCwd = process.platform === "win32" ? win32.resolve(cwd) : resolve(cwd);
        const resolved = process.platform === "win32" ? fileIdentity(win32.resolve(cwd, value)) : `${drive}:${tail}`;
        return `windows-drive-relative:${resolvedCwd}:${resolved}`;
    }
    if (/^(?:\\\\|\/\/)[^\\/]/.test(value)) {
        const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "//");
        return process.platform === "win32" ? fileIdentity(win32.resolve(value)) : `windows-unc:${normalized}`;
    }
    if (isUrlLike(value))
        return value;
    return fileIdentity(resolve(cwd, value));
}
function resolveVersionPrefixIdentity(args, cwd) {
    // Wrapper option grammars are not known here. Conservatively treat every
    // positional argument and inline option value as a cwd-resolved resource;
    // this prevents relative CLI/env-file aliases from sharing compatibility.
    let optionsTerminated = false;
    return args.map((arg) => {
        if (arg === "--version")
            return arg;
        if (arg === "--" && !optionsTerminated) {
            optionsTerminated = true;
            return arg;
        }
        if (optionsTerminated || !arg.startsWith("-"))
            return resolvePrefixResourceIdentity(arg, cwd);
        const equalsIndex = arg.indexOf("=");
        if (equalsIndex === -1)
            return arg;
        const option = arg.slice(0, equalsIndex);
        const value = arg.slice(equalsIndex + 1);
        return value ? `${option}=${resolvePrefixResourceIdentity(value, cwd)}` : arg;
    });
}
export function buildPiVersionProbeCacheKey(command, args, cwd, env) {
    const resolvedCwd = resolve(cwd);
    const identity = JSON.stringify({
        command: resolveCommandIdentity(command, resolvedCwd, env),
        args: resolveVersionPrefixIdentity(args, resolvedCwd),
    });
    return `pi-version-probe:v1:${fingerprint(identity)}`;
}
function appendCapped(current, chunk) {
    if (Buffer.byteLength(current, "utf8") >= PROBE_OUTPUT_LIMIT_BYTES)
        return current;
    const remaining = PROBE_OUTPUT_LIMIT_BYTES - Buffer.byteLength(current, "utf8");
    return current + Buffer.from(String(chunk)).subarray(0, remaining).toString();
}
function diagnostic(value, sensitiveArgs = []) {
    let redacted = value;
    const uniqueSensitiveArgs = [...new Set(sensitiveArgs.filter((arg) => arg.length > 0 && arg !== "--version"))]
        .sort((left, right) => right.length - left.length);
    for (const arg of uniqueSensitiveArgs) {
        redacted = redacted.split(arg).join("[redacted]");
    }
    const trimmed = redacted.trim();
    return trimmed.length <= DIAGNOSTIC_LIMIT_CHARS ? trimmed : `${trimmed.slice(0, DIAGNOSTIC_LIMIT_CHARS)}… [truncated]`;
}
function delay(ms) {
    return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
function signalProcessGroup(pid, child, signal) {
    if (pid === undefined) {
        child.kill(signal);
        return;
    }
    try {
        process.kill(-pid, signal);
    }
    catch {
        child.kill(signal);
    }
}
function tryKill(child) {
    try {
        child.kill();
    }
    catch {
        // The process may already have exited.
    }
}
export async function terminateWindowsProcessTree(child, spawnTaskkill = crossSpawn, timeoutMs = 500) {
    if (child.pid === undefined) {
        tryKill(child);
        return;
    }
    await new Promise((resolveTermination) => {
        let killer;
        let settled = false;
        const finish = (fallback) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timeout);
            if (fallback)
                tryKill(child);
            resolveTermination();
        };
        const timeout = setTimeout(() => {
            if (killer)
                tryKill(killer);
            finish(true);
        }, timeoutMs);
        timeout.unref?.();
        try {
            killer = spawnTaskkill("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
            killer.once("error", () => finish(true));
            killer.once("close", (code) => finish(code !== 0));
        }
        catch {
            finish(true);
        }
    });
}
async function terminateProcessTree(child) {
    if (process.platform === "win32") {
        await terminateWindowsProcessTree(child);
        return;
    }
    signalProcessGroup(child.pid, child, "SIGTERM");
    await delay(250);
    signalProcessGroup(child.pid, child, "SIGKILL");
}
export const runPiVersionCommand = ({ command, args, cwd, env, timeoutMs }) => new Promise((resolveResult) => {
    const spawn = process.platform === "win32" ? crossSpawn : nodeSpawn;
    const child = spawn(command, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        ...(process.platform === "win32" ? {} : { detached: true }),
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let childClosed = false;
    let closeCode = null;
    let resolveClose;
    const closed = new Promise((resolveClosed) => { resolveClose = resolveClosed; });
    const settle = (result) => {
        if (settled)
            return;
        settled = true;
        clearTimeout(timeout);
        resolveResult(result);
    };
    const timeout = setTimeout(() => {
        timedOut = true;
        void (async () => {
            await terminateProcessTree(child);
            if (!childClosed)
                await Promise.race([closed, delay(500)]);
            settle({ stdout, stderr, code: null, error: new Error(`version probe timed out after ${timeoutMs}ms`) });
        })();
    }, timeoutMs);
    timeout.unref?.();
    child.stdout?.on("data", (chunk) => { stdout = appendCapped(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = appendCapped(stderr, chunk); });
    child.on("error", (error) => settle({ stdout, stderr, code: null, error }));
    child.on("close", (code) => {
        childClosed = true;
        closeCode = code;
        resolveClose();
        if (!timedOut)
            settle({ stdout, stderr, code: closeCode });
    });
});
function materializeProbeResult(command, versionArgs, compatibility) {
    return {
        command,
        versionArgs: [...versionArgs],
        ...compatibility,
    };
}
function purgeExpiredCompletedEntries(now) {
    for (const [key, entry] of probeCache) {
        if (entry.state === "completed" && now - entry.completedAt >= SUCCESSFUL_PROBE_CACHE_TTL_MS) {
            probeCache.delete(key);
        }
    }
}
function enforceCompletedEntryLimit() {
    let completedCount = 0;
    for (const entry of probeCache.values()) {
        if (entry.state === "completed")
            completedCount += 1;
    }
    while (completedCount > MAX_COMPLETED_PROBE_CACHE_ENTRIES) {
        let oldestKey;
        let oldestCompletedAt = Number.POSITIVE_INFINITY;
        for (const [key, entry] of probeCache) {
            if (entry.state === "completed" && entry.completedAt < oldestCompletedAt) {
                oldestKey = key;
                oldestCompletedAt = entry.completedAt;
            }
        }
        if (oldestKey === undefined)
            return;
        probeCache.delete(oldestKey);
        completedCount -= 1;
    }
}
export async function probeWorkerPiVersion(options, run = runPiVersionCommand) {
    purgeExpiredCompletedEntries(Date.now());
    const command = options.command ?? "pi";
    const versionArgs = buildPiVersionArgs(options.baseArgs);
    const key = buildPiVersionProbeCacheKey(command, versionArgs, options.cwd, options.env);
    const existing = probeCache.get(key);
    if (existing) {
        const compatibility = existing.state === "completed" ? existing.result : await existing.promise;
        return materializeProbeResult(command, versionArgs, compatibility);
    }
    const pending = (async () => {
        const common = {
            hostVersion: HOST_PI_VERSION,
            minimumVersion: MINIMUM_WORKER_PI_VERSION,
        };
        let result;
        try {
            result = await run({
                command,
                args: versionArgs,
                cwd: options.cwd,
                env: options.env,
                timeoutMs: options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
            });
        }
        catch (error) {
            result = { stdout: "", stderr: "", code: null, error: error instanceof Error ? error : new Error(String(error)) };
        }
        if (result.error || result.code !== 0) {
            const detail = diagnostic(result.error?.message ?? (result.stderr.trim() || `exit code ${result.code}`), versionArgs);
            return {
                ...common,
                supported: false,
                mismatch: false,
                message: `Cannot launch Pi worker: failed to run ${basename(command)} --version (${detail}). Install Pi ${MINIMUM_WORKER_PI_VERSION} or newer, or fix rpc.command.`,
            };
        }
        const parsed = parsePiVersion(result.stdout);
        if (!parsed) {
            const shown = diagnostic(result.stdout, versionArgs) || "no version output";
            return {
                ...common,
                supported: false,
                mismatch: false,
                message: `Cannot launch Pi worker: ${basename(command)} --version returned an unparseable version (${JSON.stringify(shown)}). Install Pi ${MINIMUM_WORKER_PI_VERSION} or newer, or fix rpc.command.`,
            };
        }
        const minimum = parsePiVersion(MINIMUM_WORKER_PI_VERSION);
        const supported = comparePiVersions(parsed, minimum) >= 0;
        return {
            ...common,
            workerVersion: parsed.text,
            supported,
            mismatch: supported && parsed.text !== HOST_PI_VERSION,
            ...(supported ? {} : {
                message: `Cannot launch Pi worker: ${basename(command)} is Pi ${parsed.text}, but RPC workers require Pi ${MINIMUM_WORKER_PI_VERSION} or newer. Update the selected worker command or rpc.command.`,
            }),
        };
    })();
    const entry = { state: "pending", promise: pending };
    probeCache.set(key, entry);
    const compatibility = await pending;
    if (probeCache.get(key) === entry) {
        if (compatibility.supported) {
            probeCache.set(key, {
                state: "completed",
                result: compatibility,
                completedAt: Date.now(),
            });
            enforceCompletedEntryLimit();
        }
        else {
            probeCache.delete(key);
        }
    }
    return materializeProbeResult(command, versionArgs, compatibility);
}
export function clearPiVersionProbeCache() {
    probeCache.clear();
}
function snapshotProbeCache() {
    return Array.from(probeCache, ([key, entry]) => entry.state === "pending"
        ? { key, state: entry.state }
        : {
            key,
            state: entry.state,
            completedAt: entry.completedAt,
            result: { ...entry.result },
        });
}
export const _testing = { snapshotProbeCache };
