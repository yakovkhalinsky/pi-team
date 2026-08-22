export interface EdenMemoryOptions {
  bin?: string;
  db?: string;
  workspaceId?: string;
  userId?: string;
  agentId?: string;
  orgId?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
  logLevel?: string;
  logFormat?: "text" | "json";
  enabled?: boolean;
  semanticSearch?: boolean;
}

export interface EdenRememberRecord {
  content: string;
  id?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface EdenRememberResult {
  ok: boolean;
  id?: string;
  status?: string;
  error?: string;
  stderr?: string;
}

export interface EdenDocumentOptions {
  goalId?: string;
  topic?: string;
  audience?: "human" | "agent" | "manager";
  format?: "json" | "md" | "markdown" | "html";
  limit?: number;
}

export interface EdenDocumentResult {
  ok: boolean;
  output?: string;
  error?: string;
  stderr?: string;
}

export interface EdenSearchOptions extends EdenMemoryOptions {
  keywords?: string;
  content?: string;
  prefix?: string;
  topic?: string;
  id?: string;
  filters?: Record<string, unknown>;
  limit?: number;
}

export interface EdenSearchResult {
  ok: boolean;
  results: unknown[];
  error?: string;
  stderr?: string;
}

export interface EdenHealthResult {
  ok: boolean;
  locked?: boolean;
  error?: string;
  stderr?: string;
}

export type EdenEnvFieldName =
  | "EDEN_MEMORY_BIN"
  | "EDEN_MEMORY_ENABLED"
  | "EDEN_MEMORY_DB"
  | "EDEN_WORKSPACE_ID"
  | "EDEN_USER_ID"
  | "EDEN_AGENT_ID"
  | "EDEN_MEMORY_SEMANTIC_SEARCH"
  | "EDEN_LLM_API_KEY"
  | "EDEN_LLM_BASE_URL";

export const EDEN_ENV_FIELDS: Record<
  "BIN" | "ENABLED" | "DB" | "WORKSPACE_ID" | "USER_ID" | "AGENT_ID" | "SEMANTIC_SEARCH" | "LLM_API_KEY" | "LLM_BASE_URL",
  EdenEnvFieldName
>;

export const EDEN_DEFAULTS: {
  bin: string;
  db: string;
  workspaceId: string;
  userId: string;
  agentId: string;
  enabled: string;
  semanticSearch: string;
};

export function rememberRecord(
  record: EdenRememberRecord,
  options?: EdenMemoryOptions,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<EdenRememberResult>;

export function documentGoal(
  options: EdenDocumentOptions & EdenMemoryOptions,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<EdenDocumentResult>;

export function search(
  options: EdenSearchOptions,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<EdenSearchResult>;

export function health(
  options?: EdenMemoryOptions,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<EdenHealthResult>;

export function resolveEdenOptions(env?: Record<string, string | undefined>): EdenMemoryOptions;

export function getRequiredEnvFieldNames(semanticSearchEnabled?: boolean): EdenEnvFieldName[];

export function getMissingRequiredEnvFields(env?: Record<string, string | undefined>): EdenEnvFieldName[];

export function getMissingRequiredEdenOptions(options?: Partial<EdenMemoryOptions>): EdenEnvFieldName[];

export const _testing: {
  buildGlobalArgs(options?: EdenMemoryOptions): string[];
  buildIdentityArgs(options?: EdenMemoryOptions): string[];
  buildRememberContent(record: EdenRememberRecord): string;
  cleanErrorMessage(stderr: string): string;
  normalizeTags(tags?: string[]): string;
  spawnEden(
    bin: string,
    subcommand: string,
    args: string[],
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<{ code: number | null; stdout: string; stderr: string }>;
};
