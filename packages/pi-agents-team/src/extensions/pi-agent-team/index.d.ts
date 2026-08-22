import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type CompactPersistenceMeasurement } from "../../src/control-plane/persistence.js";
import type { NormalizedWorkerEvent } from "../../src/runtime/event-normalizer.js";
import type { WorkerPiVersionMismatchEvent } from "../../src/runtime/worker-manager.js";
import { type ThinkingLevel, type ThinkingLevelConfigWarning } from "../../src/types.js";
import { type EdenMemoryOptions } from "../../src/memory/eden-memory.js";
declare function buildAtpRecorderOptions(activeProjectConfig: unknown, signal?: AbortSignal): {
    env: Record<string, string | undefined>;
    signal?: AbortSignal;
    edenOptions: EdenMemoryOptions;
} | undefined;
declare function buildEdenMemoryOptions(activeProjectConfig: unknown): EdenMemoryOptions;
declare function createPersistenceGrowthMonitor(notify: (message: string) => void): {
    replace(next: CompactPersistenceMeasurement, enabled?: boolean): void;
    recordAppended(payloadBytes: number): void;
    snapshot(): CompactPersistenceMeasurement;
};
declare function getOrchestratorThinkingLevel(pi: ExtensionAPI, ctx: ExtensionContext): ThinkingLevel | undefined;
declare function getProjectTrustDecisionForContext(ctx: ExtensionContext): boolean | undefined;
declare function isProjectConfigTrustedForContext(ctx: ExtensionContext): boolean;
declare function buildDelegateTaskModelDescription(scopedModels: unknown): string;
declare function thinkingLevelWarningToastKey(warning: ThinkingLevelConfigWarning): string;
declare function buildThinkingLevelWarningToast(warning: ThinkingLevelConfigWarning): string;
declare function thinkingClampToastKey(event: Extract<NormalizedWorkerEvent, {
    type: "thinking_clamped";
}>): string;
declare function buildThinkingClampToast(event: Extract<NormalizedWorkerEvent, {
    type: "thinking_clamped";
}>): string;
declare function buildPiVersionMismatchToast(event: WorkerPiVersionMismatchEvent): string;
declare function emitPiVersionMismatchWarning(ctx: ExtensionContext | undefined, message: string): void;
declare function createPiVersionMismatchNotifier(notify: (message: string) => void): {
    notify(event: WorkerPiVersionMismatchEvent): void;
    reset(): void;
};
export declare const _testing: {
    createPersistenceGrowthMonitor: typeof createPersistenceGrowthMonitor;
    PERSISTENCE_BYTE_WARNING_THRESHOLD: number;
    PERSISTENCE_GROWTH_WARNING: string;
    PERSISTENCE_RECORD_WARNING_THRESHOLD: number;
    buildPiVersionMismatchToast: typeof buildPiVersionMismatchToast;
    createPiVersionMismatchNotifier: typeof createPiVersionMismatchNotifier;
    emitPiVersionMismatchWarning: typeof emitPiVersionMismatchWarning;
    buildThinkingClampToast: typeof buildThinkingClampToast;
    buildThinkingLevelWarningToast: typeof buildThinkingLevelWarningToast;
    getOrchestratorThinkingLevel: typeof getOrchestratorThinkingLevel;
    buildDelegateTaskModelDescription: typeof buildDelegateTaskModelDescription;
    getProjectTrustDecisionForContext: typeof getProjectTrustDecisionForContext;
    isProjectConfigTrustedForContext: typeof isProjectConfigTrustedForContext;
    thinkingClampToastKey: typeof thinkingClampToastKey;
    thinkingLevelWarningToastKey: typeof thinkingLevelWarningToastKey;
    buildAtpRecorderOptions: typeof buildAtpRecorderOptions;
    buildEdenMemoryOptions: typeof buildEdenMemoryOptions;
};
export default function (pi: ExtensionAPI): void;
export {};
