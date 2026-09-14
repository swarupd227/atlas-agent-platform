/**
 * Tools an agent must actually call before its answer counts.
 *
 * Live: three Deck Studio QA passes in a row returned "QA Result: PASS" with
 * zero tool calls, on decks inspection showed had overflowing text, missing
 * speaker notes and leftover template text. An agent can now declare
 * runtimeConfig.requiredToolCalls; the runtime forces the call and refuses an
 * answer that was never backed by one.
 */
import { describe, it, expect } from "vitest";
import {
  MAX_FORCES_PER_TOOL,
  isSatisfyingCall,
  missingRequiredToolCalls,
  nextForcedToolChoice,
  requiredToolCallsError,
  resolveRequiredToolCalls,
  toolFunctionName,
} from "../server/required-tool-calls";
import { anthropicToolChoice, buildCanonicalTools } from "../server/llm-provider";

describe("resolveRequiredToolCalls", () => {
  it("reads, trims, lower-cases and de-duplicates the declared tools", () => {
    expect(resolveRequiredToolCalls({ requiredToolCalls: [" Inspect_Document ", "inspect_document", "get_board"] })).toEqual([
      "inspect_document",
      "get_board",
    ]);
  });

  it("is empty for agents without the setting or with a malformed one", () => {
    expect(resolveRequiredToolCalls(undefined)).toEqual([]);
    expect(resolveRequiredToolCalls({})).toEqual([]);
    expect(resolveRequiredToolCalls({ requiredToolCalls: "inspect_document" })).toEqual([]);
    expect(resolveRequiredToolCalls({ requiredToolCalls: [42, "", null] })).toEqual([]);
  });
});

describe("isSatisfyingCall", () => {
  it("counts a call that ran and did not report failure", () => {
    expect(isSatisfyingCall({ toolName: "inspect_document", result: { ok: true, slides: 28 } })).toBe(true);
  });

  it("does not count a dispatch error, an MCP error payload or a built-in tool's ok:false", () => {
    expect(isSatisfyingCall({ toolName: "inspect_document", error: "Tool not found" })).toBe(false);
    expect(isSatisfyingCall({ toolName: "inspect_board", result: { isError: true, content: [] } })).toBe(false);
    expect(isSatisfyingCall({ toolName: "inspect_document", result: { ok: false, error: "No document found" } })).toBe(false);
  });
});

describe("missingRequiredToolCalls", () => {
  it("lists required tools with no successful call, in declaration order", () => {
    const calls = [
      { toolName: "inspect_document", result: { ok: false, error: "no file" } },
      { toolName: "get_board", result: { board_id: "b1" } },
    ];
    expect(missingRequiredToolCalls(["inspect_document", "get_board"], calls)).toEqual(["inspect_document"]);
    expect(missingRequiredToolCalls(["inspect_document"], [...calls, { toolName: "Inspect_Document", result: { ok: true } }])).toEqual([]);
  });
});

describe("nextForcedToolChoice", () => {
  const offered = ["fill_board_text", "inspect_document", "get_board"];

  it("forces the first unmet required tool, by the name the model is offered", () => {
    const forced = new Map<string, number>();
    const name = nextForcedToolChoice(["inspect_document"], offered, [], forced);
    expect(name).toBe("mcp_1_inspect_document");
    // It must be the exact name buildCanonicalTools gives the model, or the provider rejects it.
    const canonical = buildCanonicalTools(offered.map((toolName) => ({ serverId: "s", serverName: "S", toolName, toolDescription: "", toolInputSchema: {} })));
    expect(canonical.map((t) => t.name)).toContain(name);
  });

  it("stops forcing once the tool has been called successfully", () => {
    expect(nextForcedToolChoice(["inspect_document"], offered, [{ toolName: "inspect_document", result: { ok: true } }], new Map())).toBeUndefined();
  });

  it("gives up on a tool after a bounded number of forced attempts, so it cannot burn every iteration", () => {
    const forced = new Map<string, number>();
    for (let i = 0; i < MAX_FORCES_PER_TOOL; i++) {
      expect(nextForcedToolChoice(["inspect_document"], offered, [], forced)).toBe("mcp_1_inspect_document");
    }
    expect(nextForcedToolChoice(["inspect_document"], offered, [], forced)).toBeUndefined();
  });

  it("moves on to the next unmet tool, and skips tools this agent is not offered", () => {
    const forced = new Map<string, number>();
    const calls = [{ toolName: "inspect_document", result: { ok: true } }];
    expect(nextForcedToolChoice(["inspect_document", "delete_everything", "get_board"], offered, calls, forced)).toBe("mcp_2_get_board");
  });

  it("does nothing for agents that require nothing", () => {
    expect(nextForcedToolChoice([], offered, [], new Map())).toBeUndefined();
  });
});

describe("requiredToolCallsError", () => {
  it("separates tools that were offered but not called from tools the agent never had", () => {
    const text = requiredToolCallsError(["inspect_document", "inspect_board"], ["inspect_document"]);
    expect(text).toContain("not made successfully: inspect_document");
    expect(text).toContain("not available to this agent: inspect_board");
    expect(text).toContain("answer is not accepted");
  });
});

describe("toolFunctionName", () => {
  it("sanitises the tool name the same way the tool loop does", () => {
    expect(toolFunctionName(3, "generate-design.post")).toBe("mcp_3_generate_design_post");
  });
});

describe("anthropicToolChoice", () => {
  const tools = [{ name: "mcp_0_inspect_document" }, { type: "code_execution_20250825", name: "code_execution" }];

  it("forces a tool that is on offer", () => {
    expect(anthropicToolChoice({ toolChoice: { name: "mcp_0_inspect_document" } }, tools)).toEqual({
      tool_choice: { type: "tool", name: "mcp_0_inspect_document" },
    });
  });

  it("adds nothing when no tool is requested or the tool is not in the request", () => {
    expect(anthropicToolChoice(undefined, tools)).toEqual({});
    expect(anthropicToolChoice({ toolChoice: { name: "mcp_9_missing" } }, tools)).toEqual({});
    expect(anthropicToolChoice({ toolChoice: { name: "mcp_0_inspect_document" } }, undefined)).toEqual({});
  });
});
