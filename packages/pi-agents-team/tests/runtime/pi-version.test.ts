import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPiVersionArgs,
  buildPiVersionProbeCacheKey,
  comparePiVersions,
  parsePiVersion,
} from "../../src/src/runtime/pi-version.js";

describe("runtime/pi-version", () => {
  describe("parsePiVersion", () => {
    it("parses simple versions", () => {
      assert.deepEqual(parsePiVersion("1.2.3"), { major: 1, minor: 2, patch: 3, prerelease: [], text: "1.2.3" });
      assert.deepEqual(parsePiVersion("v0.80.6"), { major: 0, minor: 80, patch: 6, prerelease: [], text: "0.80.6" });
    });

    it("parses versions with prerelease", () => {
      assert.deepEqual(parsePiVersion("0.80.0-beta.1"), {
        major: 0,
        minor: 80,
        patch: 0,
        prerelease: ["beta", "1"],
        text: "0.80.0-beta.1",
      });
    });

    it("rejects invalid versions", () => {
      assert.equal(parsePiVersion("not-a-version"), undefined);
      assert.equal(parsePiVersion("01.02.03"), undefined);
    });
  });

  describe("comparePiVersions", () => {
    it("compares major/minor/patch", () => {
      assert.equal(comparePiVersions(parsePiVersion("1.0.0")!, parsePiVersion("0.9.9")!), 1);
      assert.equal(comparePiVersions(parsePiVersion("0.80.6")!, parsePiVersion("0.80.6")!), 0);
      assert.equal(comparePiVersions(parsePiVersion("0.79.0")!, parsePiVersion("0.80.0")!), -1);
    });

    it("treats release as newer than prerelease", () => {
      assert.equal(comparePiVersions(parsePiVersion("0.80.0")!, parsePiVersion("0.80.0-beta.1")!), 1);
      assert.equal(comparePiVersions(parsePiVersion("0.80.0-beta.1")!, parsePiVersion("0.80.0")!), -1);
    });

    it("compares prerelease segments", () => {
      assert.equal(comparePiVersions(parsePiVersion("0.80.0-beta.2")!, parsePiVersion("0.80.0-beta.10")!), -8);
      assert.equal(comparePiVersions(parsePiVersion("0.80.0-alpha.1")!, parsePiVersion("0.80.0-beta.1")!), -1);
    });
  });

  describe("buildPiVersionArgs", () => {
    it("returns just --version for empty args", () => {
      assert.deepEqual(buildPiVersionArgs(undefined), ["--version"]);
    });

    it("strips everything from --mode rpc onward", () => {
      const args = ["--foo", "bar", "--mode", "rpc", "--session", "x"];
      assert.deepEqual(buildPiVersionArgs(args), ["--foo", "bar", "--version"]);
    });

    it("handles inline --mode=rpc", () => {
      const args = ["--foo", "--mode=rpc", "--session", "x"];
      assert.deepEqual(buildPiVersionArgs(args), ["--foo", "--version"]);
    });
  });

  describe("buildPiVersionProbeCacheKey", () => {
    it("produces stable keys", () => {
      const key1 = buildPiVersionProbeCacheKey("pi", ["--version"], "/cwd", undefined);
      const key2 = buildPiVersionProbeCacheKey("pi", ["--version"], "/cwd", undefined);
      assert.equal(typeof key1, "string");
      assert.equal(key1, key2);
    });

    it("differentiates commands", () => {
      const key1 = buildPiVersionProbeCacheKey("pi", ["--version"], "/cwd", undefined);
      const key2 = buildPiVersionProbeCacheKey("pi2", ["--version"], "/cwd", undefined);
      assert.notEqual(key1, key2);
    });
  });
});
