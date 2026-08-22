import type { Readable, Writable } from "node:stream";
import type { ThinkingLevel, WorkerExtensionMode, WorkerProjectTrustOverride } from "../types.js";
export type WorkerSpawnImplementation = "node:child_process" | "cross-spawn";
export declare function resolveWorkerSpawnImplementation(platform?: NodeJS.Platform): WorkerSpawnImplementation;
export interface WorkerProcessOptions {
    cwd: string;
    command?: string;
    baseArgs?: string[];
    model?: string;
    thinkingLevel?: ThinkingLevel;
    tools?: string[];
    workerExtensions?: string[];
    systemPromptPath?: string;
    extensionMode?: WorkerExtensionMode;
    projectTrust?: WorkerProjectTrustOverride;
    /**
     * When true, do NOT pass `--no-skills` to the worker Pi session. Needed when
     * the delegated task requested `skills: [...]`: without this, Pi's skill
     * discovery is disabled and the requested skill names have no available
     * skill context in the worker session. Default `false` keeps the tighter
     * worker-minimal footprint.
     */
    allowSkills?: boolean;
    extraArgs?: string[];
    env?: NodeJS.ProcessEnv;
}
export interface ExitInfo {
    code: number | null;
    signal: NodeJS.Signals | null;
    error?: Error;
}
export interface WorkerTransport {
    pid?: number;
    stdin: Writable;
    stdout: Readable;
    stderr: Readable;
    kill(signal?: NodeJS.Signals): boolean;
    on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    off(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
    off(event: "error", listener: (error: Error) => void): this;
    off(event: string, listener: (...args: unknown[]) => void): this;
}
export interface WorkerProcessHandle {
    readonly transport: WorkerTransport;
    readonly pid?: number;
    readonly stderrBuffer: string;
    waitForExit(): Promise<ExitInfo>;
    kill(signal?: NodeJS.Signals): boolean;
    dispose(signal?: NodeJS.Signals): Promise<ExitInfo>;
}
export type SpawnWorkerProcess = (options: WorkerProcessOptions) => WorkerProcessHandle;
export declare const WORKER_PROCESS_DISPOSE_MAX_MS: number;
interface KillableProcess {
    pid?: number;
    kill(signal?: NodeJS.Signals): boolean;
}
interface TaskkillProcess extends KillableProcess {
    once(event: "error", listener: () => void): unknown;
    once(event: "close", listener: (code: number | null) => void): unknown;
}
type TaskkillSpawn = (command: string, args: string[], options: {
    stdio: "ignore";
}) => TaskkillProcess;
export declare function terminateWindowsWorkerTree(processHandle: KillableProcess, spawnTaskkill?: TaskkillSpawn, timeoutMs?: number): Promise<void>;
export declare function buildWorkerProcessArgs(options: WorkerProcessOptions): string[];
export declare function spawnWorkerProcess(options: WorkerProcessOptions): WorkerProcessHandle;
export {};
