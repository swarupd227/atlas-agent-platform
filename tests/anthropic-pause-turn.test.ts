import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression tests for Anthropic's "pause_turn" stop reason.
 *
 * A code-execution turn that does real work (load the pptx/pdf Skill, then
 * write the file) does not finish in one response: Anthropic returns
 * stop_reason "pause_turn" and expects the paused assistant content echoed back
 * to continue. Before this was handled, AnthropicProvider returned the paused
 * response as if it were final -- with no tool_use blocks, both agent loops
 * treated it as "the agent is done" and finalized the run on the model's
 * narration, so the .pptx/.pdf was never produced (only an outline).
 */

const createMock = vi.fn();
const streamMock = vi.fn();

vi.mock("../server/llm-provider-keys", () => ({
  resolveProviderKey: async () => ({ apiKey: "test-key", baseUrl: undefined }),
}));

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: createMock, stream: streamMock };
    constructor(_opts: any) {}
  }
  return { default: MockAnthropic };
});

const { getProvider } = await import("../server/llm-provider");

/** Minimal Anthropic Message shape the provider reads. */
function msg(opts: {
  stop_reason: string;
  text?: string;
  toolUse?: { id: string; name: string; input: any };
  fileId?: string;
  containerId?: string;
}) {
  const content: any[] = [];
  if (opts.text) content.push({ type: "text", text: opts.text });
  if (opts.toolUse) content.push({ type: "tool_use", ...opts.toolUse });
  if (opts.fileId) {
    content.push({
      type: "bash_code_execution_tool_result",
      tool_use_id: "srvtoolu_1",
      content: { type: "bash_code_execution_result", content: [{ file_id: opts.fileId }] },
    });
  }
  return {
    content,
    stop_reason: opts.stop_reason,
    usage: { input_tokens: 100, output_tokens: 50 },
    ...(opts.containerId ? { container: { id: opts.containerId } } : {}),
  };
}

describe("AnthropicProvider pause_turn continuation", () => {
  beforeEach(() => {
    createMock.mockReset();
    streamMock.mockReset();
  });

  it("resumes a paused turn and returns the file the resumed leg produced", async () => {
    // Leg 1: model narrates + reads the skill, turn pauses -- no file yet.
    createMock.mockResolvedValueOnce(
      msg({ stop_reason: "pause_turn", text: "Let me read the pptx skill file.", containerId: "container_abc" }),
    );
    // Leg 2: resumed, writes the deck and finishes.
    createMock.mockResolvedValueOnce(
      msg({ stop_reason: "end_turn", text: " Here is your deck.", fileId: "file_deck_123", containerId: "container_abc" }),
    );

    const result = await getProvider("anthropic").complete([{ role: "user", content: "Make a pptx" }], {
      model: "claude-sonnet-4-5",
      anthropicServerTools: [{ type: "code_execution_20250825", name: "code_execution" }],
      anthropicContainer: { skills: [{ type: "anthropic", skill_id: "pptx", version: "latest" }] },
      anthropicBetas: ["code-execution-2025-08-25", "skills-2025-10-02"],
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.generatedFiles).toEqual([{ fileId: "file_deck_123", toolUseId: "srvtoolu_1" }]);
    expect(result.stopReason).toBe("end_turn");
    // Text and usage from both legs are folded into one result.
    expect(result.content).toBe("Let me read the pptx skill file. Here is your deck.");
    expect(result.tokensUsed.total).toBe(300);
  });

  it("echoes the paused assistant content back and reuses the container", async () => {
    createMock.mockResolvedValueOnce(msg({ stop_reason: "pause_turn", text: "working", containerId: "container_abc" }));
    createMock.mockResolvedValueOnce(msg({ stop_reason: "end_turn", text: "done" }));

    await getProvider("anthropic").complete([{ role: "user", content: "Make a pptx" }], {
      model: "claude-sonnet-4-5",
      anthropicContainer: { skills: [{ type: "anthropic", skill_id: "pptx", version: "latest" }] },
    });

    const secondCall = createMock.mock.calls[1][0];
    const lastMessage = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMessage.role).toBe("assistant");
    expect(lastMessage.content).toEqual([{ type: "text", text: "working" }]);
    // Same container, so files written before the pause survive the resume.
    expect(secondCall.container.id).toBe("container_abc");
    expect(secondCall.container.skills).toEqual([{ type: "anthropic", skill_id: "pptx", version: "latest" }]);
  });

  it("does not re-request when the first response already ended the turn", async () => {
    createMock.mockResolvedValueOnce(msg({ stop_reason: "end_turn", text: "hello" }));

    const result = await getProvider("anthropic").complete([{ role: "user", content: "hi" }], { model: "claude-sonnet-4-5" });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result.content).toBe("hello");
    expect(result.stopReason).toBe("end_turn");
  });

  it("still surfaces client tool_use calls from a resumed turn", async () => {
    createMock.mockResolvedValueOnce(msg({ stop_reason: "pause_turn", text: "thinking" }));
    createMock.mockResolvedValueOnce(
      msg({ stop_reason: "tool_use", toolUse: { id: "toolu_1", name: "lookup", input: { q: "x" } } }),
    );

    const result = await getProvider("anthropic").complete([{ role: "user", content: "hi" }], { model: "claude-sonnet-4-5" });

    expect(result.toolCalls).toEqual([{ id: "toolu_1", name: "lookup", arguments: { q: "x" } }]);
    expect(result.stopReason).toBe("tool_use");
  });

  it("gives up after the continuation cap instead of looping forever", async () => {
    createMock.mockResolvedValue(msg({ stop_reason: "pause_turn", text: "." }));

    const result = await getProvider("anthropic").complete([{ role: "user", content: "hi" }], { model: "claude-sonnet-4-5" });

    // MAX_PAUSE_TURN_CONTINUATIONS (8) resumes on top of the initial request.
    expect(createMock).toHaveBeenCalledTimes(9);
    expect(result.stopReason).toBe("pause_turn");
  });
});
