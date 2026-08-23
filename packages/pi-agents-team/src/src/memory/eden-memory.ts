import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";

/**
 * Required .env fields for the eden-memory ATP integration. The wizard writes
 * these into the project .env; the wrapper reads them at call time so tests
 * can inject values without mutating global process.env.
 */
export const EDEN_ENV_FIELDS = {
  BIN: "EDEN_MEMORY_BIN",
  ENABLED: "EDEN_MEMORY_ENABLED",
  DB: "EDEN_MEMORY_DB",
  WORKSPACE_ID: "EDEN_WORKSPACE_ID",
  USER_ID: "EDEN_USER_ID",
  AGENT_ID: "EDEN_AGENT_ID",
  SEMANTIC_SEARCH: "EDEN_MEMORY_SEMANTIC_SEARCH",
  LLM_API_KEY: "EDEN_LLM_API_KEY",
  LLM_BASE_URL: "EDEN_LLM_BASE_URL",
};

/**
 * Identity defaults used when a project .env is missing or partial. They match
 * the names required by `eden-memory remember` and are surfaced by the /team-env
 * wizard as the starting values.
 */
export const EDEN_DEFAULTS = {
  bin: "/home/yakov/.local/bin/eden-memory",
  db: resolve(homedir(), ".eden-memory", "default.db"),
  workspaceId: "default",
  userId: "yakov",
  agentId: "pi-agents-team",
  enabled: "true",
  semanticSearch: "false",
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickOption(options, key, fallback) {
  if (options && typeof options[key] === "string" && options[key].length > 0)
    return options[key];
  return fallback;
}

function buildGlobalArgs(options = {}) {
  const args = [];
  if (options.db) args.push("--db", options.db);
  if (options.logLevel) args.push("--log-level", options.logLevel);
  if (options.logFormat) args.push("--log-format", options.logFormat);
  return args;
}

function buildIdentityArgs(options = {}) {
  const args = [];
  if (options.workspaceId) args.push("--workspace-id", options.workspaceId);
  if (options.userId) args.push("--user-id", options.userId);
  if (options.agentId) args.push("--agent-id", options.agentId);
  if (options.orgId) args.push("--org-id", options.orgId);
  if (options.llmApiKey) args.push("--llm-api-key", options.llmApiKey);
  if (options.llmBaseUrl) args.push("--llm-base-url", options.llmBaseUrl);
  return args;
}

function spawnEden(bin, subcommand, args, options = {}) {
  const { signal, timeoutMs = 10_000 } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error("Aborted");
      error.name = "AbortError";
      reject(error);
      return;
    }
    let settled = false;
    let timedOut = false;
    let aborted = false;
    const child = spawn(bin, [subcommand, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    if (typeof child.unref === "function") child.unref();
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    if (typeof child.stdout.unref === "function") child.stdout.unref();
    if (typeof child.stderr.unref === "function") child.stderr.unref();
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // Ignore cleanup failures.
      }
    }, timeoutMs);
    if (typeof timeoutId.unref === "function") timeoutId.unref();

    function cleanup() {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    }

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (timedOut) {
        const error = new Error(`Eden-memory process timed out after ${timeoutMs}ms`);
        error.name = "TimeoutError";
        reject(error);
      } else if (aborted) {
        const error = new Error("Aborted");
        error.name = "AbortError";
        reject(error);
      } else {
        resolve({ code, stdout, stderr });
      }
      // Release stdio handles so the parent's PipeWraps can be reclaimed.
      // Otherwise the parent's event loop stays alive even after the child
      // has exited (the test runner reports this as a hang).
      if (child.stdout) {
        child.stdout.removeAllListeners();
        child.stdout.destroy();
      }
      if (child.stderr) {
        child.stderr.removeAllListeners();
        child.stderr.destroy();
      }
    });
    function onAbort() {
      if (settled) return;
      aborted = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // Ignore cleanup failures.
      }
    }
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function tryParseJson(text) {
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseEnabledFlag(value) {
  const normalized = (value ?? "").toLowerCase();
  return !(normalized === "false" || normalized === "0" || normalized === "no");
}

function parseSemanticSearchFlag(value) {
  return (value ?? "").toLowerCase() === "true";
}

const EDEN_OPTION_KEY_MAP = {
  [EDEN_ENV_FIELDS.BIN]: "bin",
  [EDEN_ENV_FIELDS.DB]: "db",
  [EDEN_ENV_FIELDS.WORKSPACE_ID]: "workspaceId",
  [EDEN_ENV_FIELDS.USER_ID]: "userId",
  [EDEN_ENV_FIELDS.AGENT_ID]: "agentId",
  [EDEN_ENV_FIELDS.LLM_API_KEY]: "llmApiKey",
  [EDEN_ENV_FIELDS.LLM_BASE_URL]: "llmBaseUrl",
};

function cleanErrorMessage(stderr) {
  const lines = stderr.split("\n").map((line) => line.trim()).filter(Boolean);
  // Prefer the last ERROR/ERR line; eden-memory logs structured errors.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (/err\s*=|error:?/i.test(line)) {
      const match = line.match(/err\s*=\s*["']([^"']+)["']|error:?\s*(.+)/i);
      return match ? (match[1] ?? match[2]).trim() : line;
    }
  }
  return lines.at(-1) ?? stderr.trim();
}

function normalizeTags(tags) {
  if (!tags || tags.length === 0) return "";
  return tags
    .map((tag) =>
      String(tag)
        .trim()
        .replace(/\|/g, "-")
        .replace(/[^a-zA-Z0-9_\-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
    )
    .filter(Boolean)
    .join(" ");
}

function buildRememberContent(record) {
  const tags = normalizeTags(record.tags);
  if (!tags) return record.content;
  return `${record.content}\n\nTags: ${tags}`;
}

/**
 * Append a single structured ATP marker to the eden-memory durable store.
 * Errors are caught and returned as a result object so lifecycle callers never
 * throw on a failed memory write.
 */
export async function rememberRecord(record, options = {}, signal, timeoutMs) {
  const bin = options.bin ?? EDEN_DEFAULTS.bin;
  const args = [
    ...buildGlobalArgs(options),
    ...buildIdentityArgs(options),
  ];
  args.push("--content", buildRememberContent(record));
  if (record.id) args.push("--id", record.id);
  if (record.metadata && Object.keys(record.metadata).length > 0) {
    args.push("--metadata", JSON.stringify(record.metadata));
  }
  try {
    const { code, stdout, stderr } = await spawnEden(bin, "remember", args, { signal, timeoutMs });
    if (code !== 0) {
      const error = cleanErrorMessage(stderr || stdout);
      return { ok: false, error, stderr: stderr || stdout };
    }
    const parsed = tryParseJson(stdout);
    return {
      ok: true,
      id: parsed?.id,
      status: parsed?.status,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Generate a document summary for a goal/topic from eden-memory. Used by the
 * ATP recorder to produce stage summaries (stage 6 / archivist).
 */
export async function documentGoal(options, signal, timeoutMs) {
  const bin = options.bin ?? EDEN_DEFAULTS.bin;
  const args = [
    ...buildGlobalArgs(options),
    ...buildIdentityArgs(options),
  ];
  if (options.goalId) args.push("--goal-id", options.goalId);
  if (options.topic) args.push("--topic", options.topic);
  if (options.audience) args.push("--audience", options.audience);
  if (options.format) args.push("--format", options.format === "md" ? "markdown" : options.format);
  if (options.limit !== undefined && Number.isFinite(options.limit)) args.push("--limit", String(options.limit));
  try {
    const { code, stdout, stderr } = await spawnEden(bin, "document", args, { signal, timeoutMs });
    if (code !== 0) {
      const error = cleanErrorMessage(stderr || stdout);
      return { ok: false, error, stderr: stderr || stdout };
    }
    return { ok: true, output: stdout.trim() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Search memory records by keywords and optional metadata filters.
 * Safe wrapper: failures return an empty result set rather than throwing.
 */
export async function search(options, signal, timeoutMs) {
  const bin = options.bin ?? EDEN_DEFAULTS.bin;
  const args = [
    ...buildGlobalArgs(options),
    ...buildIdentityArgs(options),
  ];
  if (options.keywords) args.push("--keywords", String(options.keywords));
  if (options.content) args.push("--content", String(options.content));
  if (options.prefix) args.push("--prefix", String(options.prefix));
  if (options.topic) args.push("--topic", String(options.topic));
  if (options.id) args.push("--id", String(options.id));
  if (isRecord(options.filters)) args.push("--filters", JSON.stringify(options.filters));
  if (options.limit !== undefined && Number.isFinite(options.limit)) args.push("--limit", String(options.limit));
  try {
    const { code, stdout, stderr } = await spawnEden(bin, "search", args, { signal, timeoutMs });
    if (code !== 0) {
      const error = cleanErrorMessage(stderr || stdout);
      return { ok: false, error, stderr: stderr || stdout, results: [] };
    }
    const parsed = tryParseJson(stdout);
    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    return { ok: true, results };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      results: [],
    };
  }
}

/**
 * Check whether the configured eden-memory database is reachable.
 *
 * The team code does not track database locking as a separate UI state.
 * Eden-memory is lockless at the CLI level: SQLite handles concurrency
 * internally, and any failed write — including connection-pool exhaustion —
 * surfaces as `{ ok: false, error, stderr? }` and is treated the same as
 * any other write failure by the rest of the team code.
 */
export async function health(options = {}, signal, timeoutMs) {
  const bin = options.bin ?? EDEN_DEFAULTS.bin;
  const args = [...buildGlobalArgs(options)];
  try {
    const { code, stdout, stderr } = await spawnEden(bin, "health", args, { signal, timeoutMs });
    if (code !== 0) {
      const error = cleanErrorMessage(stderr || stdout);
      return { ok: false, error, stderr: stderr || stdout };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Resolve the effective eden-memory options from the project .env at runtime.
 * Tests pass a custom env map to avoid touching process.env.
 */
export function resolveEdenOptions(env = process.env) {
  return {
    bin: env[EDEN_ENV_FIELDS.BIN] ?? EDEN_DEFAULTS.bin,
    db: env[EDEN_ENV_FIELDS.DB] ?? EDEN_DEFAULTS.db,
    workspaceId: env[EDEN_ENV_FIELDS.WORKSPACE_ID] ?? EDEN_DEFAULTS.workspaceId,
    userId: env[EDEN_ENV_FIELDS.USER_ID] ?? EDEN_DEFAULTS.userId,
    agentId: env[EDEN_ENV_FIELDS.AGENT_ID] ?? EDEN_DEFAULTS.agentId,
    llmApiKey: env[EDEN_ENV_FIELDS.LLM_API_KEY],
    llmBaseUrl: env[EDEN_ENV_FIELDS.LLM_BASE_URL],
    enabled: parseEnabledFlag(env[EDEN_ENV_FIELDS.ENABLED]),
    semanticSearch: parseSemanticSearchFlag(env[EDEN_ENV_FIELDS.SEMANTIC_SEARCH]),
  };
}

/**
 * Return the list of .env field names that are considered required for the
 * integration, plus whether the semantic-search pair is required.
 */
export function getRequiredEnvFieldNames(semanticSearchEnabled) {
  const base = [
    EDEN_ENV_FIELDS.BIN,
    EDEN_ENV_FIELDS.DB,
    EDEN_ENV_FIELDS.WORKSPACE_ID,
    EDEN_ENV_FIELDS.USER_ID,
    EDEN_ENV_FIELDS.AGENT_ID,
  ];
  if (semanticSearchEnabled) {
    base.push(EDEN_ENV_FIELDS.LLM_API_KEY, EDEN_ENV_FIELDS.LLM_BASE_URL);
  }
  return base;
}

export function getMissingRequiredEnvFields(env = process.env) {
  const semanticSearchEnabled = (env[EDEN_ENV_FIELDS.SEMANTIC_SEARCH] ?? "").toLowerCase() === "true";
  const required = getRequiredEnvFieldNames(semanticSearchEnabled);
  return required.filter((name) => !env[name]?.trim());
}

/**
 * Check missing required fields from the merged config+env options map.
 * This honors values supplied by buildEdenMemoryOptions / resolveEdenOptions,
 * not raw process.env, so config overrides are reflected in the gating check.
 */
export function getMissingRequiredEdenOptions(options = {}) {
  const semanticSearchEnabled = options.semanticSearch === true;
  const required = getRequiredEnvFieldNames(semanticSearchEnabled);
  return required.filter((name) => {
    const key = EDEN_OPTION_KEY_MAP[name];
    const value = options[key];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

export const _testing = {
  buildGlobalArgs,
  buildIdentityArgs,
  buildRememberContent,
  cleanErrorMessage,
  normalizeTags,
  spawnEden,
};
