import type { EdenMemoryOptions, EdenRememberRecord } from "./eden-memory.js";
import type { EdenMemoryStatus } from "./memory-status.js";
import type { AtpStage, AtpMarkerName } from "./atp-markers.js";

export type { AtpStage, AtpMarkerName } from "./atp-markers.js";
export {
  ATP_STAGES,
  ATP_MARKERS,
  ATP_MARKERS_BY_NAME,
  ATP_MARKER_STAGE,
  ATP_MARKER_OWNER,
  getMarkerSpec,
  isRoleAllowedForMarker,
} from "./atp-markers.js";

export const ATP_MARKER_NAMES: Readonly<Record<AtpStage, string>>;
export const ATP_STAGE_OWNERS: Readonly<Record<AtpStage, string>>;

export interface AtpRecorderOptions {
  env?: Record<string, string | undefined>;
  edenOptions?: EdenMemoryOptions;
  signal?: AbortSignal;
  timeoutMs?: number;
  edenMemoryStatus?: EdenMemoryStatus;
}

export interface AtpRecordContext {
  goalId?: string;
  taskId?: string;
  workerId?: string;
  profileName?: string;
  packageName?: string;
  requester?: string;
  round?: number;
  supersedes?: string;
  [key: string]: unknown;
}

export interface AtpRecordResult {
  ok: boolean;
  stage?: AtpStage;
  marker?: AtpMarkerName;
  memoryId?: string;
  error?: string;
  skipped?: boolean;
}

export interface WorkerEventContext extends AtpRecordContext {
  status?: string;
  relayQuestion?: string;
  relayUrgency?: string;
  prunedUsage?: Record<string, unknown>;
}

export interface StageSummaryOptions extends EdenMemoryOptions {
  goalId?: string;
  topic?: string;
}

export interface EscalationFields {
  question: string;
  context?: string;
  options?: string[];
  defaultIfSilent?: string;
}

export function recordGoalReceipt(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordRouting(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordContextGathering(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordSkipContextGathering(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordAction(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordVerification(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordRecordingAndArchival(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordHandOffOrClosure(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;

export function recordApiReady(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordHandOff(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordClosure(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordAndon(reason: string, error: string | undefined, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordEscalation(fields: EscalationFields, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;

export function recordTerminalStageForProfile(
  profileName: string,
  content: string,
  options?: AtpRecorderOptions,
  ctx?: AtpRecordContext,
): Promise<AtpRecordResult>;

export function recordWorkerTerminal(
  workerId: string,
  status: string,
  summary: string,
  options?: AtpRecorderOptions,
  ctx?: WorkerEventContext,
): Promise<AtpRecordResult>;

export function recordWorkerRelay(
  workerId: string,
  question: string,
  assumption: string,
  options?: AtpRecorderOptions,
  ctx?: WorkerEventContext,
): Promise<AtpRecordResult>;

export function recordWorkerPrune(
  prunedCount: number,
  usageTotals: Record<string, unknown>,
  options?: AtpRecorderOptions,
  ctx?: AtpRecordContext,
): Promise<AtpRecordResult>;

export function generateStageSummary(
  options: StageSummaryOptions,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<{ ok: boolean; output?: string; error?: string }>;

export const _testing: {
  ATP_MARKER_NAMES: Readonly<Record<AtpStage, string>>;
  ATP_STAGE_OWNERS: Readonly<Record<AtpStage, string>>;
  buildMetadata(marker: AtpMarkerName, ctx?: AtpRecordContext): Record<string, unknown>;
  buildMarkerLine(marker: AtpMarkerName, content: string, ctx?: AtpRecordContext): string;
  buildRecord(marker: AtpMarkerName, content: string, ctx?: AtpRecordContext): EdenRememberRecord;
  sanitizeString(value: unknown, maxLength?: number): string;
};
