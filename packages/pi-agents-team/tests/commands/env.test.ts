import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  _testing,
  registerTeamEnvCommand,
} from "../../src/src/commands/env.js";
import { EDEN_ENV_FIELDS } from "../../src/src/memory/eden-memory.js";

function createMockUi() {
  return {
    notifyCalls: [] as Array<{ message: string; level?: string }>,
    inputCalls: [] as Array<{ prompt: string; defaultValue?: string }>,
    confirmCalls: [] as Array<{ title: string; message?: string }>,
    notify(message: string, level?: string) {
      this.notifyCalls.push({ message, level });
    },
    async input(prompt: string, defaultValue?: string) {
      this.inputCalls.push({ prompt, defaultValue });
      return defaultValue ?? "";
    },
    async confirm(title: string, message?: string) {
      this.confirmCalls.push({ title, message });
      return true;
    },
  };
}

function createMockPi() {
  const commands = new Map<string, {
    description: string;
    handler: (args: string, ctx: unknown) => Promise<void>;
    getArgumentCompletions?: (prefix: string) => Array<unknown>;
  }>();
  return {
    commands,
    registerCommand(name: string, def: any) {
      commands.set(name, def);
    },
  };
}

function createCtx(cwd: string, hasUI = true) {
  const ui = createMockUi();
  return { cwd, hasUI, ui };
}

describe("/team-env command", () => {
  let tmpDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "team-env-test-"));
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  });

  it("registers the command with completions", () => {
    const pi = createMockPi();
    registerTeamEnvCommand(pi);
    assert.ok(pi.commands.has("team-env"));
    const cmd = pi.commands.get("team-env")!;
    assert.ok(cmd.description.includes(".env"));
    const completions = cmd.getArgumentCompletions!("");
    assert.ok(completions.some((c: any) => c.value === "--force"));
    assert.ok(completions.some((c: any) => c.value === "--check"));
  });

  it("parses args for --force and --check", () => {
    assert.deepEqual(_testing.parseEnvArgs(""), { force: false, checkOnly: false });
    assert.deepEqual(_testing.parseEnvArgs("--force"), { force: true, checkOnly: false });
    assert.deepEqual(_testing.parseEnvArgs("--check"), { force: false, checkOnly: true });
    assert.ok(_testing.parseEnvArgs("--unknown").error);
  });

  it("reads an existing .env file", () => {
    const envPath = resolve(tmpDir, ".env");
    const content = [
      "# comment",
      `${EDEN_ENV_FIELDS.DB}=/db.db`,
      "",
      `${EDEN_ENV_FIELDS.AGENT_ID}=agent-1`,
    ].join("\n");
    writeFileSync(envPath, content);
    const parsed = _testing.readEnvFile(envPath);
    assert.equal(parsed[EDEN_ENV_FIELDS.DB], "/db.db");
    assert.equal(parsed[EDEN_ENV_FIELDS.AGENT_ID], "agent-1");
  });

  it("reports missing fields in check mode", async () => {
    const pi = createMockPi();
    registerTeamEnvCommand(pi);
    const ctx = createCtx(tmpDir);
    await pi.commands.get("team-env")!.handler("--check", ctx);
    const notification = ctx.ui.notifyCalls[0];
    assert.ok(notification.message.includes("Missing required eden-memory env fields"));
    assert.equal(notification.level, "warning");
  });

  it("creates a .env file with defaults when none exists", async () => {
    const pi = createMockPi();
    registerTeamEnvCommand(pi);
    const ctx = createCtx(tmpDir);
    // Stub health so the wizard does not try to spawn the real binary.
    ctx.ui.confirm = async () => false; // skip interactive prompts, defaults cover required fields
    await pi.commands.get("team-env")!.handler("", ctx);
    const envPath = resolve(tmpDir, ".env");
    assert.ok(existsSync(envPath), ".env should be created");
    const text = readFileSync(envPath, "utf8");
    assert.ok(text.includes(EDEN_ENV_FIELDS.DB));
    assert.ok(text.includes(EDEN_ENV_FIELDS.AGENT_ID));
    assert.ok(text.includes(EDEN_ENV_FIELDS.WORKSPACE_ID));
  });

  it("writes semantic-search LLM fields when configured", async () => {
    const envPath = resolve(tmpDir, ".env");
    writeFileSync(
      envPath,
      `${EDEN_ENV_FIELDS.SEMANTIC_SEARCH}=true\n${EDEN_ENV_FIELDS.BIN}=/bin\n${EDEN_ENV_FIELDS.DB}=/db\n${EDEN_ENV_FIELDS.WORKSPACE_ID}=ws\n${EDEN_ENV_FIELDS.USER_ID}=user\n${EDEN_ENV_FIELDS.AGENT_ID}=agent\n`,
    );
    const pi = createMockPi();
    registerTeamEnvCommand(pi);
    const ctx = createCtx(tmpDir);
    ctx.ui.confirm = async () => false;
    ctx.ui.input = async () => null; // would leave LLM fields empty, but check mode won't write
    await pi.commands.get("team-env")!.handler("--check", ctx);
    const notification = ctx.ui.notifyCalls[0];
    assert.ok(notification.message.includes(EDEN_ENV_FIELDS.LLM_API_KEY));
    assert.ok(notification.message.includes(EDEN_ENV_FIELDS.LLM_BASE_URL));
  });

  it("auto-prompts for missing semantic-search fields and writes them", async () => {
    const envPath = resolve(tmpDir, ".env");
    writeFileSync(
      envPath,
      `${EDEN_ENV_FIELDS.BIN}=/fake-bin\n${EDEN_ENV_FIELDS.DB}=/db\n${EDEN_ENV_FIELDS.WORKSPACE_ID}=ws\n${EDEN_ENV_FIELDS.USER_ID}=user\n${EDEN_ENV_FIELDS.AGENT_ID}=agent\n${EDEN_ENV_FIELDS.SEMANTIC_SEARCH}=true\n`,
    );
    const ctx = createCtx(tmpDir);
    ctx.ui.input = async (prompt) => {
      if (prompt.includes("API key")) return "sk-test";
      if (prompt.includes("base URL")) return "https://api.example.com";
      return "";
    };
    ctx.ui.confirm = async () => true;
    const result = await _testing.runEnvWizard(ctx, false);
    assert.equal(result.updated, true);
    assert.equal(result.missingAfter.length, 0);
    const text = readFileSync(envPath, "utf8");
    assert.ok(text.includes("sk-test"));
    assert.ok(text.includes("https://api.example.com"));
  });

  it("reports that env vars are active in the current session after writing .env", async () => {
    const ctx = createCtx(tmpDir);
    ctx.ui.confirm = async () => false;
    const result = await _testing.runEnvWizard(ctx, false);
    assert.ok(result.report.some((line) => line.includes("active in the current session")));
  });

  it("refreshes process.env with the written eden-memory values", async () => {
    const ctx = createCtx(tmpDir);
    ctx.ui.confirm = async () => false;
    delete process.env[EDEN_ENV_FIELDS.AGENT_ID];
    delete process.env[EDEN_ENV_FIELDS.WORKSPACE_ID];
    const result = await _testing.runEnvWizard(ctx, false);
    assert.equal(result.updated, true);
    assert.ok(process.env[EDEN_ENV_FIELDS.AGENT_ID], "AGENT_ID should be set in process.env");
    assert.ok(process.env[EDEN_ENV_FIELDS.WORKSPACE_ID], "WORKSPACE_ID should be set in process.env");
  });

  it("escapes newlines in env values", () => {
    const escaped = _testing.escapeEnvValue("line1\nline2\r");
    assert.equal(escaped, "line1\\nline2\\r");
  });

  it("reports an already-complete .env at info level with positive wording", async () => {
    const envPath = resolve(tmpDir, ".env");
    writeFileSync(
      envPath,
      [
        `${EDEN_ENV_FIELDS.BIN}=/fake-bin`,
        `${EDEN_ENV_FIELDS.DB}=/db`,
        `${EDEN_ENV_FIELDS.WORKSPACE_ID}=ws`,
        `${EDEN_ENV_FIELDS.USER_ID}=user`,
        `${EDEN_ENV_FIELDS.AGENT_ID}=agent`,
        `${EDEN_ENV_FIELDS.SEMANTIC_SEARCH}=false`,
        "",
      ].join("\n"),
    );
    const pi = createMockPi();
    registerTeamEnvCommand(pi);
    const ctx = createCtx(tmpDir);
    await pi.commands.get("team-env")!.handler("", ctx);
    const notification = ctx.ui.notifyCalls[0];
    assert.equal(notification.level, "info");
    assert.ok(notification.message.includes("Project .env found at"), `unexpected message: ${notification.message}`);
    assert.ok(notification.message.includes("Everything is already configured"), `unexpected message: ${notification.message}`);
    assert.ok(notification.message.includes("All required eden-memory env fields are present"));
  });

  it("writes .env atomically without leaving temp files", async () => {
    const ctx = createCtx(tmpDir);
    ctx.ui.confirm = async () => false;
    const result = await _testing.runEnvWizard(ctx, false);
    assert.equal(result.updated, true);
    const envPath = resolve(tmpDir, ".env");
    assert.ok(existsSync(envPath), ".env should be created");
    const text = readFileSync(envPath, "utf8");
    assert.ok(text.includes(EDEN_ENV_FIELDS.DB));
    const leftovers = readdirSync(tmpDir).filter((name) => name.startsWith(".env.tmp."));
    assert.equal(leftovers.length, 0, "no atomic-write temp files should be left behind");
  });

  it("backs up an existing .env before overwriting", async () => {
    const envPath = resolve(tmpDir, ".env");
    const oldContent = `${EDEN_ENV_FIELDS.BIN}=/old-bin\n${EDEN_ENV_FIELDS.DB}=/old-db\n${EDEN_ENV_FIELDS.WORKSPACE_ID}=old-ws\n${EDEN_ENV_FIELDS.USER_ID}=old-user\n${EDEN_ENV_FIELDS.AGENT_ID}=old-agent\n${EDEN_ENV_FIELDS.SEMANTIC_SEARCH}=false\n`;
    writeFileSync(envPath, oldContent);
    const ctx = createCtx(tmpDir);
    ctx.ui.confirm = async () => false;
    const result = await _testing.runEnvWizard(ctx, true);
    assert.equal(result.updated, true);
    assert.ok(result.report.some((line) => line.startsWith("Backed up previous .env to")));
    const backups = readdirSync(tmpDir).filter((name) => /^\d{4}-\d{2}-\d{2}-\d{6}-\.env/.test(name));
    assert.equal(backups.length, 1, "exactly one timestamped backup should exist");
    assert.equal(readFileSync(resolve(tmpDir, backups[0]), "utf8"), oldContent);
    assert.ok(existsSync(envPath), ".env should still exist after backup and overwrite");
  });

  it("appends .env to .gitignore when missing", async () => {
    const gitignorePath = resolve(tmpDir, ".gitignore");
    writeFileSync(gitignorePath, "node_modules/\n");
    const ctx = createCtx(tmpDir);
    ctx.ui.confirm = async () => false;
    const result = await _testing.runEnvWizard(ctx, false);
    assert.equal(result.updated, true);
    assert.ok(result.report.some((line) => line.includes("Added .env to")));
    const gitignoreText = readFileSync(gitignorePath, "utf8");
    assert.ok(gitignoreText.includes(".env\n"));
    assert.ok(gitignoreText.startsWith("node_modules/\n.env\n"), "should append .env on its own line");
  });

  it("creates .gitignore with .env when none exists", async () => {
    const gitignorePath = resolve(tmpDir, ".gitignore");
    const ctx = createCtx(tmpDir);
    ctx.ui.confirm = async () => false;
    const result = await _testing.runEnvWizard(ctx, false);
    assert.equal(result.updated, true);
    assert.ok(existsSync(gitignorePath));
    assert.equal(readFileSync(gitignorePath, "utf8"), ".env\n");
  });

  it("does not duplicate .env in .gitignore when already present", async () => {
    const gitignorePath = resolve(tmpDir, ".gitignore");
    writeFileSync(gitignorePath, "node_modules/\n.env\n");
    const ctx = createCtx(tmpDir);
    ctx.ui.confirm = async () => false;
    const result = await _testing.runEnvWizard(ctx, true);
    assert.equal(result.updated, true);
    assert.ok(!result.report.some((line) => line.includes("Added .env to")));
    const gitignoreText = readFileSync(gitignorePath, "utf8");
    const matches = gitignoreText.split("\n").filter((line) => line.trim() === ".env");
    assert.equal(matches.length, 1, ".env should appear exactly once");
  });

  it("treats .env* and .env/ in .gitignore as already covering .env", async () => {
    for (const pattern of [".env*", ".env/"]) {
      const gitignorePath = resolve(tmpDir, ".gitignore");
      writeFileSync(gitignorePath, `${pattern}\n`);
      const ctx = createCtx(tmpDir);
      ctx.ui.confirm = async () => false;
      const result = await _testing.runEnvWizard(ctx, true);
      assert.equal(result.updated, true);
      assert.ok(!result.report.some((line) => line.includes("Added .env to")), `should not append for ${pattern}`);
      const gitignoreText = readFileSync(gitignorePath, "utf8");
      assert.equal(gitignoreText.trim(), pattern);
    }
  });

  it("check mode reports a complete .env at info level", async () => {
    const envPath = resolve(tmpDir, ".env");
    writeFileSync(
      envPath,
      [
        `${EDEN_ENV_FIELDS.BIN}=/fake-bin`,
        `${EDEN_ENV_FIELDS.DB}=/db`,
        `${EDEN_ENV_FIELDS.WORKSPACE_ID}=ws`,
        `${EDEN_ENV_FIELDS.USER_ID}=user`,
        `${EDEN_ENV_FIELDS.AGENT_ID}=agent`,
        `${EDEN_ENV_FIELDS.SEMANTIC_SEARCH}=false`,
        "",
      ].join("\n"),
    );
    const pi = createMockPi();
    registerTeamEnvCommand(pi);
    const ctx = createCtx(tmpDir);
    await pi.commands.get("team-env")!.handler("--check", ctx);
    const notification = ctx.ui.notifyCalls[0];
    assert.equal(notification.level, "info");
    assert.ok(notification.message.includes("Project .env found at"));
  });
});
