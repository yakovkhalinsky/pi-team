import { EventEmitter } from "node:events";
import { StringDecoder } from "node:string_decoder";
function isRpcResponse(record) {
    return record.type === "response" && "command" in record && "success" in record;
}
export class StrictJsonlParser {
    onRecord;
    onError;
    decoder = new StringDecoder("utf8");
    buffer = "";
    constructor(onRecord, onError) {
        this.onRecord = onRecord;
        this.onError = onError;
    }
    push(chunk) {
        this.buffer += typeof chunk === "string" ? chunk : this.decoder.write(chunk);
        this.flushCompleteLines();
    }
    end() {
        this.buffer += this.decoder.end();
        this.flushCompleteLines();
        if (!this.buffer.trim()) {
            this.buffer = "";
            return;
        }
        const line = this.normalizeLine(this.buffer);
        this.buffer = "";
        this.parseLine(line);
    }
    flushCompleteLines() {
        while (true) {
            const newlineIndex = this.buffer.indexOf("\n");
            if (newlineIndex === -1)
                return;
            const rawLine = this.buffer.slice(0, newlineIndex);
            this.buffer = this.buffer.slice(newlineIndex + 1);
            this.parseLine(this.normalizeLine(rawLine));
        }
    }
    normalizeLine(line) {
        return line.endsWith("\r") ? line.slice(0, -1) : line;
    }
    parseLine(line) {
        if (!line.trim())
            return;
        try {
            this.onRecord(JSON.parse(line));
        }
        catch (error) {
            this.onError(error instanceof Error ? error : new Error(String(error)), line);
        }
    }
}
export class RpcClient {
    transport;
    emitter = new EventEmitter();
    pending = new Map();
    parser;
    requestCounter = 0;
    disposed = false;
    constructor(transport) {
        this.transport = transport;
        this.parser = new StrictJsonlParser((record) => this.handleRecord(record), (error, line) => this.handleParseError(error, line));
        this.transport.stdout.on("data", this.handleStdoutData);
        this.transport.stdout.on("end", this.handleStdoutEnd);
    }
    onEvent(listener) {
        this.emitter.on("event", listener);
        return () => this.emitter.off("event", listener);
    }
    onError(listener) {
        this.emitter.on("error", listener);
        return () => this.emitter.off("error", listener);
    }
    async prompt(message, options) {
        await this.send({
            type: "prompt",
            message,
            ...(options?.streamingBehavior ? { streamingBehavior: options.streamingBehavior } : {}),
        });
    }
    async steer(message) {
        await this.send({ type: "steer", message });
    }
    async followUp(message) {
        await this.send({ type: "follow_up", message });
    }
    async abort() {
        await this.send({ type: "abort" });
    }
    async getState() {
        return this.send({ type: "get_state" });
    }
    async getMessages() {
        return this.send({ type: "get_messages" });
    }
    async getSessionStats(signal) {
        return this.send({ type: "get_session_stats" }, signal);
    }
    async send(command, signal) {
        if (this.disposed) {
            throw new Error("RPC client has been disposed");
        }
        const id = command.id ?? this.nextId();
        const payload = { ...command, id };
        const body = `${JSON.stringify(payload)}\n`;
        return new Promise((resolve, reject) => {
            let settled = false;
            const cleanup = () => signal?.removeEventListener("abort", onAbort);
            const deferred = {
                resolve: (value) => {
                    if (settled)
                        return;
                    settled = true;
                    cleanup();
                    resolve(value);
                },
                reject: (error) => {
                    if (settled)
                        return;
                    settled = true;
                    cleanup();
                    reject(error);
                },
            };
            const onAbort = () => {
                this.pending.delete(id);
                deferred.reject(new Error(`RPC command aborted: ${command.type}`));
            };
            this.pending.set(id, deferred);
            if (signal) {
                if (signal.aborted) {
                    onAbort();
                    return;
                }
                signal.addEventListener("abort", onAbort, { once: true });
            }
            this.transport.stdin.write(body, (error) => {
                if (!error)
                    return;
                this.pending.delete(id);
                deferred.reject(error instanceof Error ? error : new Error(String(error)));
            });
        });
    }
    dispose(reason = "RPC client disposed") {
        if (this.disposed)
            return;
        this.disposed = true;
        this.transport.stdout.off("data", this.handleStdoutData);
        this.transport.stdout.off("end", this.handleStdoutEnd);
        this.parser.end();
        this.rejectAllPending(new Error(reason));
        this.emitter.removeAllListeners();
    }
    handleStdoutData = (chunk) => {
        this.parser.push(chunk);
    };
    handleStdoutEnd = () => {
        this.parser.end();
    };
    handleRecord(record) {
        if (isRpcResponse(record)) {
            this.handleResponse(record);
            return;
        }
        this.emitter.emit("event", record);
    }
    handleResponse(response) {
        if (!response.id)
            return;
        const deferred = this.pending.get(response.id);
        if (!deferred)
            return;
        this.pending.delete(response.id);
        if (response.success) {
            deferred.resolve(response.data);
            return;
        }
        deferred.reject(new Error(response.error ?? `RPC command failed: ${response.command}`));
    }
    handleParseError(error, line) {
        this.emitter.emit("error", new Error(`Failed to parse RPC line: ${error.message}\nLine: ${line}`));
    }
    nextId() {
        this.requestCounter += 1;
        return `rpc-${this.requestCounter}`;
    }
    rejectAllPending(error) {
        for (const deferred of this.pending.values()) {
            deferred.reject(error);
        }
        this.pending.clear();
    }
}
