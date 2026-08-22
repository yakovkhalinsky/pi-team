import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const DEFAULT_BASE_ARGS = ["--mode", "json", "-p", "--no-session"];
const DEFAULT_WORKER_MINIMAL_FLAGS = [
  "--no-extensions",
  "--no-prompt-templates",
  "--no-themes",
  "--no-context-files",
];

export function buildWorkerArgs(options) {
  const args = [...(options.baseArgs ?? DEFAULT_BASE_ARGS)];
  if (options.model) args.push("--model", options.model);
  if (options.thinkingLevel) args.push("--thinking", options.thinkingLevel);
  if (options.tools && options.tools.length > 0) args.push("--tools", options.tools.join(","));
  if (options.systemPromptPath) args.push("--append-system-prompt", options.systemPromptPath);
  if (options.workerMinimal !== false) {
    args.push(...DEFAULT_WORKER_MINIMAL_FLAGS);
    if (!options.allowSkills) args.push("--no-skills");
  }
  if (options.extraArgs) args.push(...options.extraArgs);
  return args;
}

export async function writeTempPrompt(agentName, prompt) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-worker-"));
  const safeName = agentName.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
  await fs.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
  return { dir: tmpDir, filePath };
}

export async function cleanupTempPrompt(filePath, dir) {
  try {
    if (filePath) await fs.unlink(filePath);
  } catch {
    // Temp cleanup is best-effort.
  }
  try {
    if (dir) await fs.rmdir(dir);
  } catch {
    // Ignore non-empty or already-removed directories.
  }
}

export async function spawnWorker(options) {
  const command = options.command ?? "pi";
  const args = buildWorkerArgs(options);
  const spawnImpl = options.spawnImpl ?? spawn;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      child = spawnImpl(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ["ignore", "pipe", "pipe"],
        ...(process.platform === "win32" ? {} : { detached: true }),
      });
    } catch (err) {
      finish({ exitCode: null, stdout, stderr, error: err.message });
      return;
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      finish({ exitCode: null, stdout, stderr, error: err.message });
    });

    child.on("close", (code, signal) => {
      finish({
        exitCode: code,
        stdout,
        stderr,
        error: signal ? `terminated by ${signal}` : undefined,
      });
    });

    const timeoutMs = options.timeoutMs;
    if (timeoutMs && timeoutMs > 0) {
      const timeout = setTimeout(() => {
        try {
          child.kill("SIGTERM");
        } catch {
          // Process may already have exited.
        }
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // Ignore repeated kill failures.
          }
        }, 1000);
      }, timeoutMs);
      child.on("close", () => clearTimeout(timeout));
    }
  });
}
