import type { Readable, Writable } from "node:stream";
import type { RpcSessionState as PiRpcSessionState } from "@earendil-works/pi-coding-agent";
export interface RpcCommandBase {
    type: string;
    id?: string;
}
export interface RpcResponse<TData = unknown> {
    type: "response";
    id?: string;
    command: string;
    success: boolean;
    data?: TData;
    error?: string;
}
export type RpcEvent = Record<string, unknown> & {
    type: string;
};
export interface RpcSessionState {
    model: unknown;
    thinkingLevel: PiRpcSessionState["thinkingLevel"];
    isStreaming: boolean;
    isCompacting: boolean;
    steeringMode: string;
    followUpMode: string;
    sessionFile?: string;
    sessionId: string;
    sessionName?: string;
    autoCompactionEnabled: boolean;
    messageCount: number;
    pendingMessageCount: number;
}
export interface RpcSessionStats {
    sessionFile?: string;
    sessionId: string;
    userMessages: number;
    assistantMessages: number;
    toolCalls: number;
    toolResults: number;
    totalMessages: number;
    tokens?: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
        total: number;
    };
    cost?: number;
    contextUsage?: {
        tokens: number | null;
        contextWindow: number | null;
        percent: number | null;
    };
}
export interface RpcTransport {
    stdin: Writable;
    stdout: Readable;
    stderr?: Readable;
}
export interface PromptRpcCommand extends RpcCommandBase {
    type: "prompt";
    message: string;
    streamingBehavior?: "steer" | "followUp";
}
export interface SimpleMessageRpcCommand extends RpcCommandBase {
    type: "steer" | "follow_up" | "abort" | "get_state" | "get_messages" | "get_session_stats";
    message?: string;
}
export type SupportedRpcCommand = PromptRpcCommand | SimpleMessageRpcCommand;
export declare class StrictJsonlParser {
    private readonly onRecord;
    private readonly onError;
    private readonly decoder;
    private buffer;
    constructor(onRecord: (record: RpcEvent | RpcResponse) => void, onError: (error: Error, line: string) => void);
    push(chunk: string | Buffer): void;
    end(): void;
    private flushCompleteLines;
    private normalizeLine;
    private parseLine;
}
export declare class RpcClient {
    private readonly transport;
    private readonly emitter;
    private readonly pending;
    private readonly parser;
    private requestCounter;
    private disposed;
    constructor(transport: RpcTransport);
    onEvent(listener: (event: RpcEvent) => void): () => void;
    onError(listener: (error: Error) => void): () => void;
    prompt(message: string, options?: {
        streamingBehavior?: "steer" | "followUp";
    }): Promise<void>;
    steer(message: string): Promise<void>;
    followUp(message: string): Promise<void>;
    abort(): Promise<void>;
    getState(): Promise<RpcSessionState>;
    getMessages(): Promise<unknown>;
    getSessionStats(signal?: AbortSignal): Promise<RpcSessionStats>;
    send<TData>(command: SupportedRpcCommand, signal?: AbortSignal): Promise<TData>;
    dispose(reason?: string): void;
    private readonly handleStdoutData;
    private readonly handleStdoutEnd;
    private handleRecord;
    private handleResponse;
    private handleParseError;
    private nextId;
    private rejectAllPending;
}
