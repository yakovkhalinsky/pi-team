import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractFinalAnswer } from "../../src/runtime/final-answer.js";

function assistantEvent(text: string) {
  return {
    type: "message_update",
    usage: {},
    assistantMessageEvent: {
      role: "assistant",
      content: [{ type: "text", text }],
    },
  };
}

describe("final-answer extraction", () => {
  it("extracts content from a final_answer block", () => {
    const text = "preamble\n<final_answer>\nheadline: done\n\nbody\n</final_answer>\n";
    assert.equal(extractFinalAnswer(text), "headline: done\n\nbody");
  });

  it("returns undefined for an empty final_answer block", () => {
    assert.equal(extractFinalAnswer("<final_answer></final_answer>"), undefined);
  });

  it("falls back to the last assistant text block in JSON mode when no tag is present", () => {
    const stdout = [
      JSON.stringify(assistantEvent("first")),
      JSON.stringify(assistantEvent("hello")),
    ].join("\n");
    assert.equal(extractFinalAnswer(stdout), "hello");
  });

  it("prefers an explicit final_answer tag over later plain assistant text", () => {
    const stdout = [
      JSON.stringify(assistantEvent("<final_answer>tagged</final_answer>")),
      JSON.stringify(assistantEvent("later")),
    ].join("\n");
    assert.equal(extractFinalAnswer(stdout), "tagged");
  });

  it("returns undefined when no tag and no JSON assistant messages are present", () => {
    assert.equal(extractFinalAnswer("plain text without final answer"), undefined);
  });
});
