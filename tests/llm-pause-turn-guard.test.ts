/**
 * Bounding the sandbox output echoed back on Anthropic pause_turn
 * continuations. Reproduces the live 2026-09-08 failure: a code-execution
 * turn printed a 15MB .pptx master's XML, the mandatory echo of that output
 * exceeded the context window, and the continuation failed with
 * "prompt is too long: 314487 tokens > 200000".
 */
import { describe, it, expect } from "vitest";
import {
  boundPausedTurnContent,
  PAUSE_TURN_ECHO_SOFT_LIMIT_CHARS,
  PAUSE_TURN_RESULT_BLOCK_CAP_CHARS,
} from "../server/llm-provider";

const result = (stdout: string, stderr = "") => ({
  type: "bash_code_execution_tool_result",
  tool_use_id: "srvtoolu_1",
  content: { type: "bash_code_execution_result", stdout, stderr, return_code: 0, content: [] },
});

describe("boundPausedTurnContent", () => {
  it("counts stdout+stderr chars and leaves content untouched below the soft limit", () => {
    const content = [{ type: "text", text: "inspecting" }, result("a".repeat(1000), "b".repeat(50))];
    const out = boundPausedTurnContent(content, 0);
    expect(out.chars).toBe(1050);
    expect(out.truncatedBlocks).toBe(0);
    expect(out.content).toBe(content); // same reference: nothing rebuilt
  });

  it("leaves even a huge block alone while the cumulative echo is still under the soft limit", () => {
    const big = "x".repeat(PAUSE_TURN_RESULT_BLOCK_CAP_CHARS + 10);
    const out = boundPausedTurnContent([result(big)], 0);
    expect(out.truncatedBlocks).toBe(0);
    expect(out.content[0].content.stdout).toBe(big);
  });

  it("cuts oversized result blocks to the cap with an in-band marker once over the soft limit", () => {
    const big = "y".repeat(200_000);
    const out = boundPausedTurnContent([{ type: "text", text: "t" }, result(big)], PAUSE_TURN_ECHO_SOFT_LIMIT_CHARS);
    expect(out.chars).toBe(200_000);
    expect(out.truncatedBlocks).toBe(1);
    const stdout: string = out.content[1].content.stdout;
    expect(stdout.startsWith("y".repeat(PAUSE_TURN_RESULT_BLOCK_CAP_CHARS))).toBe(true);
    expect(stdout).toContain("platform truncated this output");
    expect(stdout.length).toBeLessThan(PAUSE_TURN_RESULT_BLOCK_CAP_CHARS + 300);
    // Non-result blocks and small results pass through unchanged.
    expect(out.content[0]).toEqual({ type: "text", text: "t" });
  });

  it("keeps the block shape (type, tool_use_id, return_code) when truncating", () => {
    const out = boundPausedTurnContent([result("z".repeat(100_000), "e".repeat(70_000))], PAUSE_TURN_ECHO_SOFT_LIMIT_CHARS + 1);
    const b = out.content[0];
    expect(b.type).toBe("bash_code_execution_tool_result");
    expect(b.tool_use_id).toBe("srvtoolu_1");
    expect(b.content.type).toBe("bash_code_execution_result");
    expect(b.content.return_code).toBe(0);
    expect(out.truncatedBlocks).toBe(2);
  });
});
