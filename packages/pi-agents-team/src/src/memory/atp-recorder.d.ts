import { EdenMemoryOptions, EdenRememberRecord } from "./eden-memory.js";

export type AtpStage =
  | "goal-receipt"
  | "routing"
  | "context-gathering"
  | "action"
  | "verification"
  | "recording-and-archival"
  | "hand-off-or-closure";

export const ATP_STAGES: AtpStage[];
export const ATP_MARKER_NAMES: Record<AtpStage, string>;
export const ATP_STAGE_OWNERS: Record<AtpStage, string>;

export interface AtpRecorderOptions {
  env?: Record<string, string | undefined>;
  edenOptions?: EdenMemoryOptions;
  signal?: AbortSignal;
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
  marker?: string;
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

export function recordGoalReceipt(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordRouting(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordContextGathering(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordSkipContextGathering(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordAction(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordVerification(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordRecordingAndArchival(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;
export function recordHandOffOrClosure(content: string, options?: AtpRecorderOptions, ctx?: AtpRecordContext): Promise<AtpRecordResult>;

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
): Promise<{ ok: boolean; output?: string; error?: string }>;

export const _testing: {
  ATP_MARKER_NAMES: Record<AtpStage, string>;
  ATP_STAGE_OWNERS: Record<AtpStage, string>;
  buildMetadata(stage: AtpStage, ctx?: AtpRecordContext): Record<string, unknown>;
  buildMarkerLine(stage: AtpStage, content: string, ctx?: AtpRecordContext): string;
  buildRecord(stage: AtpStage, content: string, ctx?: AtpRecordContext): EdenRememberRecord;
  sanitizeString(value: unknown, maxLength?: number): string;
};
