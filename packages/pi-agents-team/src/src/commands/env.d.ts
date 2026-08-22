import { EdenEnvFieldName, EdenMemoryOptions } from "../memory/eden-memory.js";

export interface EnvWizardResult {
  updated: boolean;
  envPath: string;
  missingBefore: EdenEnvFieldName[];
  missingAfter: EdenEnvFieldName[];
  report: string[];
}

export interface EnvCommandContext {
  cwd: string;
  hasUI: boolean;
  ui?: {
    notify: (message: string, level?: "info" | "warning" | "error") => void;
    input: (prompt: string, defaultValue?: string) => Promise<string | null | undefined>;
    confirm: (title: string, message?: string) => Promise<boolean | undefined>;
  };
}

export interface EnvCommandDependencies {
  registerCommand: (
    name: string,
    definition: {
      description: string;
      getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string; description: string }>;
      handler: (args: string, ctx: EnvCommandContext) => Promise<void>;
    },
  ) => void;
}

export function runEnvWizard(ctx: EnvCommandContext, force?: boolean): Promise<EnvWizardResult>;

export function parseEnvArgs(args: string): { force?: boolean; checkOnly?: boolean; error?: string };

export function buildEnvCommandCompletions(prefix: string): Array<{ value: string; label: string; description: string }>;

export function registerTeamEnvCommand(pi: EnvCommandDependencies): void;

export const _testing: {
  buildEnvContents(entries: Record<string, string>): string;
  describeFieldName(name: EdenEnvFieldName): string;
  escapeEnvValue(value: string): string;
  findProjectEnvPath(cwd: string): string;
  formatMissingFieldsReport(missing: EdenEnvFieldName[]): string;
  mergeWithDefaults(entries: Record<string, string>): Record<string, string>;
  parseEnvArgs(args: string): { force?: boolean; checkOnly?: boolean; error?: string };
  promptMissingFields(
    ctx: EnvCommandContext,
    entries: Record<string, string>,
    missing: EdenEnvFieldName[],
  ): Promise<Record<string, string> | undefined>;
  readEnvFile(path: string): Record<string, string>;
  runEnvWizard(ctx: EnvCommandContext, force?: boolean): Promise<EnvWizardResult>;
  ensureEnvIgnored(cwd: string): boolean;
  envIsAlreadyIgnored(gitignorePath: string): boolean;
  findProjectGitignorePath(cwd: string): string;
  applyEnvToProcessEnv(entries: Record<string, string>): void;
};
