import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Page images must actually reach the API.
 *
 * server/document-vision.ts renders a scanned PDF's pages, uploads them to the
 * Files API and hands the ids down as attachmentImageFileIds. Everything up to
 * that point was tested and worked. What was never tested was the last step --
 * whether AnthropicProvider puts those ids in the request -- and it did not.
 * Image blocks were emitted only inside a branch requiring BOTH container
 * attachments and code execution configured, which a text-only worker reading
 * a scan has neither of, so the ids fell through to the plain-text push and
 * the model was sent the prompt alone.
 *
 * These assert on the request the provider builds, because that is the only
 * place the question "did the pixels get sent?" has an answer.
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

const FINAL = {
  content: [{ type: "text", text: "The scan is a 1967 postcard." }],
  stop_reason: "end_turn",
  usage: { input_tokens: 747, output_tokens: 42 },
};

/**
 * Both provider methods reach the API through `messages.stream` -- complete()
 * wraps it in awaitStreamWithIdleTimeout (server/anthropic-stream.ts) rather
 * than calling messages.create at all. So the mock has to satisfy that
 * wrapper's contract (on/abort/finalMessage) as well as being async-iterable
 * for streamComplete's delta loop.
 */
function streamOf(final: any) {
  return {
    on: (_event: string, _handler: (e?: unknown) => void) => {},
    abort: () => {},
    async *[Symbol.asyncIterator]() { /* no text deltas needed */ },
    finalMessage: async () => final,
  };
}

/** The content blocks of the single user message the provider sent. */
function sentBlocks(): any[] {
  const req = streamMock.mock.calls[0][0];
  return req.messages[0].content;
}

describe("a scanned document's pages reach the Anthropic request", () => {
  beforeEach(() => {
    createMock.mockReset();
    streamMock.mockReset();
    streamMock.mockImplementation(() => streamOf(FINAL));
  });

  it("sends image blocks for a text-only worker, with no container anywhere", async () => {
    await getProvider("anthropic").complete(
      [{ role: "user", content: "Read the attached pages.", attachmentImageFileIds: ["file_a", "file_b"] } as any],
      {},
    );

    const blocks = sentBlocks();
    // This is the assertion that was false in production.
    expect(blocks.filter((b: any) => b.type === "image")).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: "image", source: { type: "file", file_id: "file_a" } });
    expect(blocks[1]).toEqual({ type: "image", source: { type: "file", file_id: "file_b" } });
    // Pixels first, then the instruction that refers to them.
    expect(blocks[2]).toEqual({ type: "text", text: "Read the attached pages." });
    // A scan is not a code-execution attachment and must not be sent as one.
    expect(blocks.some((b: any) => b.type === "container_upload")).toBe(false);
  });

  it("needs no anthropic-beta header to do it", async () => {
    await getProvider("anthropic").complete(
      [{ role: "user", content: "Read it.", attachmentImageFileIds: ["file_a"] } as any],
      {},
    );

    // Checked against the real API: a file-source image block is not gated on
    // the Files beta. If that ever changes this fails here rather than in a run.
    const reqOptions = streamMock.mock.calls[0][1] ?? {};
    expect(reqOptions.headers?.["anthropic-beta"]).toBeUndefined();
  });

  it("sends them on the STREAMING path too, which is what a DAG worker uses", async () => {
    // agent-runtime.ts reaches the model through streamCompleteWithFallback, so
    // a fix applied only to complete() would leave the real path broken.
    await getProvider("anthropic").streamComplete!(
      [{ role: "user", content: "Read the attached pages.", attachmentImageFileIds: ["file_a"] } as any],
      {},
      () => {},
    );

    const blocks = sentBlocks();
    expect(blocks[0]).toEqual({ type: "image", source: { type: "file", file_id: "file_a" } });
    expect(blocks[1]).toEqual({ type: "text", text: "Read the attached pages." });
  });

  it("still sends container_upload when code execution IS configured", async () => {
    // The pre-existing branch must keep working: images first, then every file
    // as a container_upload, then the text.
    await getProvider("anthropic").complete(
      [{
        role: "user",
        content: "Build the deck.",
        attachmentFileIds: ["file_doc"],
        attachmentImageFileIds: ["file_img"],
      } as any],
      { anthropicContainer: {} } as any,
    );

    const blocks = sentBlocks();
    expect(blocks.map((b: any) => b.type)).toEqual(["image", "container_upload", "text"]);
  });

  it("leaves a message with no attachments as a plain string", async () => {
    await getProvider("anthropic").complete([{ role: "user", content: "No files here." } as any], {});

    expect(streamMock.mock.calls[0][0].messages[0].content).toBe("No files here.");
  });
});
