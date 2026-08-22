import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const INSTALLER = join(REPO_ROOT, "install.sh");

function runInstaller(target: string, args: string[] = []) {
    const result = spawnSync("bash", [INSTALLER, "--skip-extension", "--target", target, ...args], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
            ...process.env,
            // Suppress colours so output is easier to read on failures
            TERM: "dumb",
        },
    });
    return result;
}

function initGitRepo(path: string) {
    mkdirSync(path, { recursive: true });
    const init = spawnSync("git", ["init"], { cwd: path, encoding: "utf8" });
    if (init.status !== 0) {
        throw new Error(`git init failed: ${init.stderr}`);
    }
}

describe("installer/install.sh", () => {
    let tempBase: string;

    before(() => {
        tempBase = mkdtempSync(join(tmpdir(), "pi-team-installer-"));
    });

    after(() => {
        if (tempBase) {
            rmSync(tempBase, { recursive: true, force: true });
        }
    });

    function makeTarget(): string {
        const target = join(tempBase, `repo-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        initGitRepo(target);
        return target;
    }

    it("updates .gitignore with the runtime entries", () => {
        const target = makeTarget();
        const result = runInstaller(target);
        assert.equal(result.status, 0, `install.sh failed: ${result.stderr}`);

        const gitignore = readFileSync(join(target, ".gitignore"), "utf8");
        assert.match(gitignore, /^# Pi Team runtime$/m, "missing marker");
        assert.match(gitignore, /^\.pi-team\/workspace\/$/m, "missing workspace entry");
        assert.match(gitignore, /^\.pi-team\/\.teamwork\/$/m, "missing teamwork entry");
        assert.match(gitignore, /^\.pi-team\/worktrees\/$/m, "missing worktrees entry");
        assert.match(gitignore, /^\.env$/m, "missing .env entry");
    });

    it("does not duplicate the pi-team .gitignore block on rerun with --force", () => {
        const target = makeTarget();
        const first = runInstaller(target);
        assert.equal(first.status, 0, `first install failed: ${first.stderr}`);

        const second = runInstaller(target, ["--force"]);
        assert.equal(second.status, 0, `second install with --force failed: ${second.stderr}`);

        const gitignore = readFileSync(join(target, ".gitignore"), "utf8");
        const markers = gitignore.match(/^# Pi Team runtime$/gm);
        assert.equal(markers?.length, 1, "expected exactly one pi-team marker");
    });

    it("keeps existing entries and appends the pi-team block once", () => {
        const target = makeTarget();
        writeFileSync(join(target, ".gitignore"), "node_modules/\n*.log\n", { flag: "w" });

        const result = runInstaller(target);
        assert.equal(result.status, 0, `install failed: ${result.stderr}`);

        const gitignore = readFileSync(join(target, ".gitignore"), "utf8");
        assert.match(gitignore, /^node_modules\/$/m, "lost node_modules entry");
        assert.match(gitignore, /^# Pi Team runtime$/m, "missing marker");
        const markers = gitignore.match(/^# Pi Team runtime$/gm);
        assert.equal(markers?.length, 1, "expected exactly one pi-team marker");
    });

    it("backs up .pi-team/ and recreates it when --force is used", () => {
        const target = makeTarget();
        const first = runInstaller(target);
        assert.equal(first.status, 0, `first install failed: ${first.stderr}`);

        const originalMarker = join(target, ".pi-team", "prompts", "orchestrator.md");
        assert.ok(existsSync(originalMarker), "expected initial .pi-team to be created");

        // Add a sentinel file so we can verify the backup retained the old tree
        writeFileSync(join(target, ".pi-team", "sentinel.txt"), "old", { flag: "w" });

        const second = runInstaller(target, ["--force"]);
        assert.equal(second.status, 0, `forced install failed: ${second.stderr}`);

        const entries = readdirSync(target, { withFileTypes: true })
            .filter((e) => e.isDirectory() && e.name.startsWith(".pi-team.backup."))
            .map((e) => e.name);
        assert.ok(entries.length >= 1, "expected a .pi-team.backup.<timestamp> directory");

        const backupDir = join(target, entries[0]);
        assert.ok(existsSync(join(backupDir, "sentinel.txt")), "backup should contain the old sentinel");
        assert.ok(!existsSync(join(target, ".pi-team", "sentinel.txt")), "new .pi-team should not have the old sentinel");
        assert.ok(existsSync(originalMarker), "new .pi-team should contain fresh files");
    });

    it("backs up agents-team.json when --force is used", () => {
        const target = makeTarget();
        const first = runInstaller(target);
        assert.equal(first.status, 0, `first install failed: ${first.stderr}`);

        const configPath = join(target, ".pi", "agent", "agents-team.json");
        assert.ok(existsSync(configPath), "expected agents-team.json to be created");
        writeFileSync(configPath, "{\"sentinel\":true}", { flag: "w" });

        const second = runInstaller(target, ["--force"]);
        assert.equal(second.status, 0, `forced install failed: ${second.stderr}`);

        const entries = readdirSync(join(target, ".pi", "agent"))
            .filter((e) => e.startsWith("agents-team.json.backup."));
        assert.ok(entries.length >= 1, "expected an agents-team.json backup file");

        const backupPath = join(target, ".pi", "agent", entries[0]);
        assert.equal(readFileSync(backupPath, "utf8"), "{\"sentinel\":true}", "backup should contain the overwritten config");

        const currentConfig = JSON.parse(readFileSync(configPath, "utf8"));
        assert.equal(currentConfig.memory?.edenMemory?.enabled, true, "new config should enable edenMemory");
        assert.equal(currentConfig.worktree?.enabled, true, "new config should enable worktrees");
    });

    it("refuses to overwrite .pi-team/ without --force", () => {
        const target = makeTarget();
        const first = runInstaller(target);
        assert.equal(first.status, 0, `first install failed: ${first.stderr}`);

        const second = runInstaller(target);
        assert.notEqual(second.status, 0, "expected second install to fail without --force");
        assert.match(second.stderr, /\.pi-team\/ already exists/, "expected existing .pi-team error");
    });
});
