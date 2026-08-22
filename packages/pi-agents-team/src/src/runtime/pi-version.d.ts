export declare const HOST_PI_VERSION: string;
export declare const MINIMUM_WORKER_PI_VERSION = "0.80.6";
export declare const SUCCESSFUL_PROBE_CACHE_TTL_MS = 30000;
export declare const MAX_COMPLETED_PROBE_CACHE_ENTRIES = 64;
export interface ParsedPiVersion {
    major: number;
    minor: number;
    patch: number;
    prerelease: string[];
    text: string;
}
export interface PiVersionCommandResult {
    stdout: string;
    stderr: string;
    code: number | null;
    error?: Error;
}
export type RunPiVersionCommand = (input: {
    command: string;
    args: string[];
    cwd: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs: number;
}) => Promise<PiVersionCommandResult>;
export interface PiVersionProbeOptions {
    command?: string;
    baseArgs?: string[];
    cwd: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
}
export interface PiVersionProbeResult {
    command: string;
    versionArgs: string[];
    hostVersion: string;
    minimumVersion: string;
    workerVersion?: string;
    supported: boolean;
    mismatch: boolean;
    message?: string;
}
export type ProbeWorkerPiVersion = (options: PiVersionProbeOptions) => Promise<PiVersionProbeResult>;
export declare function parsePiVersion(output: string): ParsedPiVersion | undefined;
export declare function comparePiVersions(left: ParsedPiVersion, right: ParsedPiVersion): number;
/**
 * Build the version invocation from the launch contract rather than attempting
 * to parse the wrapper runtime's options. Everything before Pi's explicit RPC
 * mode boundary is the immutable executable prefix (wrapper flags, their
 * values, and the Pi CLI entrypoint); RPC/session flags from the boundary on
 * are replaced by --version.
 */
export declare function buildPiVersionArgs(baseArgs: string[] | undefined): string[];
export declare function buildPiVersionProbeCacheKey(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): string;
interface KillableChild {
    pid?: number;
    kill(signal?: NodeJS.Signals): boolean;
}
type TaskkillSpawn = (command: string, args: string[], options: {
    stdio: "ignore";
}) => KillableChild & {
    once(event: "error", listener: () => void): unknown;
    once(event: "close", listener: (code: number | null) => void): unknown;
};
export declare function terminateWindowsProcessTree(child: KillableChild, spawnTaskkill?: TaskkillSpawn, timeoutMs?: number): Promise<void>;
export declare const runPiVersionCommand: RunPiVersionCommand;
export declare function probeWorkerPiVersion(options: PiVersionProbeOptions, run?: RunPiVersionCommand): Promise<PiVersionProbeResult>;
export declare function clearPiVersionProbeCache(): void;
declare function snapshotProbeCache(): unknown[];
export declare const _testing: {
    snapshotProbeCache: typeof snapshotProbeCache;
};
export {};
