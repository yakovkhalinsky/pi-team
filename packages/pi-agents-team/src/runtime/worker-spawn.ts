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

/**
 * Spawn a worker Pi child process and return a controller that exposes the
 * running child, a kill function, and a promise for the final result.
 *
 * The controller resolves with `{ exitCode, stdout, stderr, error }`.
 * Optional `onLine(line)` receives every complete stdout line as it arrives.
 * Optional `signal` (AbortSignal) will terminate the child with `kill()` and
 * resolve the promise with `error: "aborted"`.
 */
export function spawnWorker(options) {
  const command = options.command ?? "pi";
  const args = buildWorkerArgs(options);
  const spawnImpl = options.spawnImpl ?? spawn;
  const timeoutMs = options.timeoutMs;
  const onLine = typeof options.onLine === "function" ? options.onLine : null;
  const signal = options.signal;

  let child = null;
  let settled = false;
  let stdout = "";
  let stderr = "";
  let stdoutBuffer = "";
  let aborted = false;
  let timeoutRef = null;
  let killTimeoutRef = null;
  let abortHandler = null;

  const controller = {
    child,
    promise: null,
    kill(sig) {
      if (!controller.child) return false;
      try {
        return controller.child.kill(sig ?? "SIGTERM");
      } catch {
        return false;
      }
    },
  };

  controller.promise = new Promise((resolve) => {
    const cleanup = () => {
      if (timeoutRef) {
        clearTimeout(timeoutRef);
        timeoutRef = null;
      }
      if (killTimeoutRef) {
        clearTimeout(killTimeoutRef);
        killTimeoutRef = null;
      }
      if (abortHandler && signal) {
        try {
          signal.removeEventListener("abort", abortHandler);
        } catch {
          // Best-effort cleanup.
        }
        abortHandler = null;
      }
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    function flushStdoutLines() {
      if (!onLine) return;
      let idx = stdoutBuffer.indexOf("\n");
      while (idx !== -1) {
        let line = stdoutBuffer.slice(0, idx);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        stdoutBuffer = stdoutBuffer.slice(idx + 1);
        onLine(line);
        idx = stdoutBuffer.indexOf("\n");
      }
    }

    function handleAbort() {
      if (settled) return;
      aborted = true;
      controller.kill();
      finish({ exitCode: null, stdout, stderr, error: "aborted" });
    }

    if (signal) {
      abortHandler = handleAbort;
      signal.addEventListener("abort", abortHandler, { once: true });
      if (signal.aborted) {
        handleAbort();
        return;
      }
    }

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

    controller.child = child;

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onLine) {
        stdoutBuffer += text;
        flushStdoutLines();
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      finish({ exitCode: null, stdout, stderr, error: err.message });
    });

    child.on("close", (code, signal) => {
      if (onLine && stdoutBuffer.length > 0) {
        onLine(stdoutBuffer);
        stdoutBuffer = "";
      }
      finish({
        exitCode: code,
        stdout,
        stderr,
        error: aborted ? "aborted" : (signal ? `terminated by ${signal}` : undefined),
      });
    });

    if (timeoutMs && timeoutMs > 0) {
      timeoutRef = setTimeout(() => {
        try {
          child.kill("SIGTERM");
        } catch {
          // Process may already have exited.
        }
        killTimeoutRef = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // Ignore repeated kill failures.
          }
        }, 1000);
      }, timeoutMs);
    }
  });

  return controller;
}
