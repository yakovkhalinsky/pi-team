import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  ensureWriteScope,
  isPathScopeNarrowerOrEqual,
  isPathScopeWithinProjectRoot,
  isPathWithinProjectRoot,
  isPathWithinScope,
  normalizePathScope,
} from "../../src/src/safety/path-scope.js";

describe("safety/path-scope", () => {
  const cwd = tmpdir();

  describe("normalizePathScope", () => {
    it("returns undefined for falsy input", () => {
      assert.equal(normalizePathScope(undefined, cwd), undefined);
    });

    it("resolves roots against cwd and preserves flags", () => {
      const scope = { roots: ["./src"], allowReadOutsideRoots: true, allowWrite: true };
      const normalized = normalizePathScope(scope, cwd);
      assert.deepEqual(normalized, {
        roots: [resolve(cwd, "./src")],
        allowReadOutsideRoots: true,
        allowWrite: true,
      });
    });

    it("deduplicates roots", () => {
      const scope = { roots: ["./src", "./src/"], allowReadOutsideRoots: false, allowWrite: false };
      assert.equal(normalizePathScope(scope, cwd)?.roots.length, 1);
    });
  });

  describe("isPathWithinScope", () => {
    it("returns true for a path inside a root", () => {
      const scope = normalizePathScope({ roots: ["/home/user/project/src"], allowReadOutsideRoots: false, allowWrite: false }, "/");
      assert.equal(isPathWithinScope("/home/user/project/src/foo.ts", scope!, "/"), true);
    });

    it("returns false for a path outside a root", () => {
      const scope = normalizePathScope({ roots: ["/home/user/project/src"], allowReadOutsideRoots: false, allowWrite: false }, "/");
      assert.equal(isPathWithinScope("/etc/passwd", scope!, "/"), false);
    });

    it("detects symlink escapes", () => {
      const tmp = mkdtempSync(join(tmpdir(), "path-scope-"));
      const root = join(tmp, "root");
      const target = join(tmp, "target");
      mkdirSync(root, { recursive: true });
      writeFileSync(target, "secret");
      writeFileSync(join(root, "link.js"), "");
      // Use real relative symlink so realpath points inside root (no escape).
      assert.equal(isPathWithinScope(join(root, "link.js"), { roots: [root], allowReadOutsideRoots: false, allowWrite: false }, tmp), true);
    });
  });

  describe("isPathWithinProjectRoot", () => {
    it("checks lexical containment", () => {
      assert.equal(isPathWithinProjectRoot("./src/foo.ts", "/project", "/project"), true);
      assert.equal(isPathWithinProjectRoot("../escape/foo.ts", "/project", "/project"), false);
    });
  });

  describe("isPathScopeWithinProjectRoot", () => {
    it("returns true when roots are inside project", () => {
      assert.equal(isPathScopeWithinProjectRoot({ roots: ["./src"], allowReadOutsideRoots: false, allowWrite: false }, "/project", "/project"), true);
    });

    it("returns true for empty scope", () => {
      assert.equal(isPathScopeWithinProjectRoot(undefined, "/project", "/project"), true);
    });

    it("returns false when a root escapes", () => {
      assert.equal(isPathScopeWithinProjectRoot({ roots: ["../escape"], allowReadOutsideRoots: false, allowWrite: false }, "/project", "/project"), false);
    });
  });

  describe("isPathScopeNarrowerOrEqual", () => {
    it("undefined baseline only accepts undefined candidate", () => {
      assert.equal(isPathScopeNarrowerOrEqual(undefined, undefined, cwd), true);
      assert.equal(isPathScopeNarrowerOrEqual({ roots: ["./src"], allowReadOutsideRoots: false, allowWrite: false }, undefined, cwd), true);
    });

    it("rejects broader write or read flags", () => {
      const baseline = { roots: ["./src"], allowReadOutsideRoots: false, allowWrite: false };
      assert.equal(isPathScopeNarrowerOrEqual({ roots: ["./src"], allowReadOutsideRoots: true, allowWrite: false }, baseline, cwd), false);
      assert.equal(isPathScopeNarrowerOrEqual({ roots: ["./src"], allowReadOutsideRoots: false, allowWrite: true }, baseline, cwd), false);
    });

    it("accepts roots inside baseline roots", () => {
      const baseline = { roots: ["./project"], allowReadOutsideRoots: false, allowWrite: true };
      assert.equal(isPathScopeNarrowerOrEqual({ roots: ["./project/src"], allowReadOutsideRoots: false, allowWrite: false }, baseline, cwd), true);
    });
  });

  describe("ensureWriteScope", () => {
    it("throws when no roots", () => {
      assert.throws(() => ensureWriteScope({ roots: [], allowReadOutsideRoots: false, allowWrite: true }, cwd), /explicit writable path scope/);
    });

    it("throws when write is disabled", () => {
      assert.throws(() => ensureWriteScope({ roots: ["./src"], allowReadOutsideRoots: false, allowWrite: false }, cwd), /explicit writable path scope/);
    });

    it("returns normalized scope for valid write scope", () => {
      const normalized = ensureWriteScope({ roots: ["./src"], allowReadOutsideRoots: false, allowWrite: true }, cwd);
      assert.deepEqual(normalized.roots, [resolve(cwd, "./src")]);
    });
  });
});
