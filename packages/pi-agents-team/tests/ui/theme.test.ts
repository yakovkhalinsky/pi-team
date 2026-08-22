import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bold, dim, fallbackPalette, stripAnsi, sanitizeTerminalText, themedPalette } from "../../src/src/ui/theme.js";

describe("ui/theme", () => {
  describe("fallbackPalette", () => {
    it("contains expected stylers", () => {
      assert.equal(typeof fallbackPalette.bold, "function");
      assert.equal(typeof fallbackPalette.success, "function");
      assert.equal(typeof fallbackPalette.danger, "function");
    });
  });

  describe("bold", () => {
    it("wraps text with ANSI bold", () => {
      assert.equal(bold("hi"), "\x1b[1mhi\x1b[0m");
    });
  });

  describe("stripAnsi", () => {
    it("removes ANSI escape codes", () => {
      assert.equal(stripAnsi(bold(dim("text"))), "text");
    });
  });

  describe("sanitizeTerminalText", () => {
    it("strips ANSI sequences", () => {
      assert.equal(sanitizeTerminalText(bold("x")), "x");
    });

    it("replaces tabs with spaces", () => {
      assert.equal(sanitizeTerminalText("a\tb"), "a    b");
    });

    it("removes control characters", () => {
      assert.equal(sanitizeTerminalText("hello\x00world"), "helloworld");
    });
  });

  describe("themedPalette", () => {
    it("falls back to legacy palette for invalid theme", () => {
      assert.equal(themedPalette(undefined), fallbackPalette);
      assert.equal(themedPalette({}), fallbackPalette);
    });

    it("uses theme functions when available", () => {
      const theme = {
        fg: (slot, text) => `[${slot}:${text}]`,
        bold: (text) => `*${text}*`,
        inverse: (text) => `~${text}~`,
      };
      const palette = themedPalette(theme);
      assert.equal(palette.accent("x"), "[accent:x]");
      assert.equal(palette.accentBold("x"), "*[accent:x]*");
      assert.equal(palette.inverse("x"), "~x~");
    });
  });
});
