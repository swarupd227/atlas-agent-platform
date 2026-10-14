/**
 * Claude on Amazon Bedrock (server/bedrock-anthropic.ts) without AWS: which model answers, what is refused, the request that
 * is sent, the Message that comes back, the stream, the errors the retry rules read, and the provider layer on top.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/storage", () => ({ storage: {} }));
vi.mock("../server/llm-provider-keys", () => ({
  resolveProviderKey: async () => ({ apiKey: "anthropic-key", baseUrl: undefined }),
}));

let bedrockClient: { client: any; config: any } | null = null;
let blocksFallback = false;
vi.mock("../server/bedrock-anthropic", async (importOriginal) => {
  const real = await importOriginal<typeof import("../server/bedrock-anthropic")>();
  return {
    ...real,
    getBedrockChatClient: async () => bedrockClient,
    bedrockChatBlocksFallback: async () => blocksFallback,
  };
});

import { InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { awaitStreamWithIdleTimeout } from "../server/anthropic-stream";
import { anthropicRequestBody, BedrockUnsupportedError, testBedrockModel, type BedrockSender } from "../server/bedrock-client";
import { changedBedrockFields, defaultBedrockConfig, isClaudeModelId, parseBedrockConfig } from "../server/bedrock-config";
import {
  chatOnBedrock, createBedrockAnthropicClient, MessageAccumulator, pickBedrockModel, toApiError,
} from "../server/bedrock-anthropic";
import { completeWithFallback, getProvider } from "../server/llm-provider";

const SONNET = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
const HAIKU = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

const config = (over: Record<string, unknown> = {}) =>
  parseBedrockConfig({ enabled: true, region: "eu-central-1", useForChat: true, models: { chat: { modelId: SONNET }, fast: { modelId: HAIKU } }, ...over });

const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
const jsonReply = (o: unknown) => ({ body: enc(o) });
const bodyOf = (cmd: any) => JSON.parse(cmd.input.body as string);

/** The events Claude streams for a short answer, then a tool call whose input arrives in two pieces. */
function claudeEvents(opts: { text?: string; tool?: { id: string; name: string; json: string[] } } = {}) {
  const ev: any[] = [{ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-4-5", content: [], stop_reason: null, usage: { input_tokens: 21, output_tokens: 1 } } }];
  let i = 0;
  if (opts.text !== undefined) {
    ev.push({ type: "content_block_start", index: i, content_block: { type: "text", text: "" } });
    for (const part of opts.text.match(/.{1,4}/g) ?? []) ev.push({ type: "content_block_delta", index: i, delta: { type: "text_delta", text: part } });
    ev.push({ type: "content_block_stop", index: i });
    i++;
  }
  if (opts.tool) {
    ev.push({ type: "content_block_start", index: i, content_block: { type: "tool_use", id: opts.tool.id, name: opts.tool.name, input: {} } });
    for (const j of opts.tool.json) ev.push({ type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: j } });
    ev.push({ type: "content_block_stop", index: i });
  }
  ev.push({ type: "message_delta", delta: { stop_reason: opts.tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 17 } });
  ev.push({ type: "message_stop" });
  return ev;
}

const streamReply = (events: any[], tail: any[] = []) => ({
  body: (async function* () {
    for (const e of events) yield { chunk: { bytes: enc(e) } };
    for (const t of tail) yield t;
  })(),
});

function sender(handler: (cmd: any, opts?: any) => any): BedrockSender & { calls: any[] } {
  const calls: any[] = [];
  return { calls, async send(cmd: any, opts?: any) { calls.push(cmd); return handler(cmd, opts); } };
}

beforeEach(() => { bedrockClient = null; blocksFallback = false; });

describe("the settings", () => {
  it("chat on Bedrock is off unless an administrator turns it on, and old saved settings still load", () => {
    expect(defaultBedrockConfig().useForChat).toBe(false);
    const old = parseBedrockConfig({ enabled: true, region: "eu-central-1", models: { chat: { modelId: "some.other-model" } } });
    expect(old.useForChat).toBe(false);
    expect(chatOnBedrock(old)).toBe(false);
  });

  it("needs a Claude model to be chosen first", () => {
    expect(() => parseBedrockConfig({ enabled: true, region: "eu-central-1", useForChat: true })).toThrow(/Choose the Claude model/);
    expect(() => parseBedrockConfig({ enabled: true, region: "eu-central-1", useForChat: true, models: { chat: { modelId: "amazon.titan-text-express-v1" } } })).toThrow(/Claude models only/);
    expect(() => parseBedrockConfig({ enabled: true, region: "eu-central-1", useForChat: true, models: { chat: { modelId: SONNET }, fast: { modelId: "meta.llama3-70b-instruct-v1:0" } } })).toThrow(/fast model.*Claude/);
  });

  it("takes a Claude id, a regional profile id or an ARN", () => {
    for (const id of ["anthropic.claude-3-haiku-20240307-v1:0", SONNET, "arn:aws:bedrock:eu-west-1:123456789012:application-inference-profile/abc123"]) {
      expect(isClaudeModelId(id)).toBe(true);
    }
    expect(isClaudeModelId("amazon.titan-embed-text-v2:0")).toBe(false);
  });

  it("is routed only when switched on, Bedrock is enabled, a region exists and a chat model is set", () => {
    expect(chatOnBedrock(config())).toBe(true);
    expect(chatOnBedrock(config({ useForChat: false }))).toBe(false);
    expect(chatOnBedrock(config({ enabled: false }))).toBe(false);
  });

  it("the change shows in the audit list by name", () => {
    expect(changedBedrockFields(config({ useForChat: false }), config())).toEqual(["useForChat"]);
  });
});

describe("which Bedrock model answers", () => {
  it("any Claude name the platform uses is answered by the chat model; a haiku by the fast model when there is one", () => {
    const c = config();
    expect(pickBedrockModel(c, "claude-sonnet-4-5")).toBe(SONNET);
    expect(pickBedrockModel(c, "claude-opus-4-5")).toBe(SONNET);
    expect(pickBedrockModel(c, undefined)).toBe(SONNET);
    expect(pickBedrockModel(c, "claude-haiku-4-5")).toBe(HAIKU);
    expect(pickBedrockModel(config({ models: { chat: { modelId: SONNET } } }), "claude-3-5-haiku-20241022")).toBe(SONNET);
  });

  it("an id that is already a Bedrock id is left alone", () => {
    expect(pickBedrockModel(config(), "eu.anthropic.claude-opus-4-1-20250805-v1:0")).toBe("eu.anthropic.claude-opus-4-1-20250805-v1:0");
  });
});

describe("the request", () => {
  it("is the Messages request with the model moved out and a version added", () => {
    const body = anthropicRequestBody({
      model: "claude-sonnet-4-5", stream: true, metadata: { user_id: "u" }, max_tokens: 100, temperature: 0.2,
      system: "be brief", messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "lookup", description: "d", input_schema: { type: "object" } }, { type: "custom", name: "other", input_schema: { type: "object" } }],
      tool_choice: { type: "tool", name: "lookup" },
    });
    expect(body).toEqual({
      anthropic_version: "bedrock-2023-05-31", max_tokens: 100, temperature: 0.2, system: "be brief",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "lookup", description: "d", input_schema: { type: "object" } }, { type: "custom", name: "other", input_schema: { type: "object" } }],
      tool_choice: { type: "tool", name: "lookup" },
    });
  });

  it("refuses, in words, what only Anthropic's own servers can do", () => {
    const sandbox = () => anthropicRequestBody({ max_tokens: 5, messages: [], tools: [{ type: "code_execution_20250825", name: "code_execution" }] });
    expect(sandbox).toThrow(BedrockUnsupportedError);
    expect(sandbox).toThrow(/code-running sandbox.*does not offer/);
    expect(() => anthropicRequestBody({ max_tokens: 5, messages: [], tools: [{ type: "web_search_20250305", name: "web_search" }] })).toThrow(/web search/);
    expect(() => anthropicRequestBody({ max_tokens: 5, messages: [], container: { skills: [] } })).toThrow(/sandbox/);
    try { sandbox(); } catch (e: any) { expect(e.status).toBe(400); }
  });
});

describe("a whole answer (create)", () => {
  it("sends the mapped model and returns a Message the platform can read", async () => {
    const s = sender(() => jsonReply({ id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-4-5-20250929", content: [{ type: "text", text: "Hello" }], stop_reason: "end_turn", usage: { input_tokens: 9, output_tokens: 2 } }));
    const client = createBedrockAnthropicClient(s, config());
    const out = await client.messages.create({ model: "claude-sonnet-4-5", max_tokens: 50, messages: [{ role: "user", content: "hi" }] });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]).toBeInstanceOf(InvokeModelCommand);
    expect(s.calls[0].input.modelId).toBe(SONNET);
    expect(bodyOf(s.calls[0])).toMatchObject({ anthropic_version: "bedrock-2023-05-31", max_tokens: 50 });
    expect(bodyOf(s.calls[0]).model).toBeUndefined();
    expect(out.content[0].text).toBe("Hello");
    expect(out.model).toBe("claude-sonnet-4-5");         // the name the platform's price table knows
    expect(out.bedrock_model_id).toBe(SONNET);            // what really answered
    expect(out.served_by).toBe("aws_bedrock");
  });

  it("says what an AWS failure means and carries the status the retry rules read", async () => {
    const cases: Array<[string, number, number, RegExp]> = [
      ["ThrottlingException", 429, 429, /limiting requests/],
      ["ServiceUnavailableException", 503, 503, /could not answer/],
      ["ModelTimeoutException", 504, 503, /could not answer/],
      ["AccessDeniedException", 403, 403, /not allowed to call this model/],
    ];
    for (const [name, http, want, text] of cases) {
      const s = sender(() => { throw Object.assign(new Error(name), { name, $metadata: { httpStatusCode: http } }); });
      const client = createBedrockAnthropicClient(s, config());
      const err: any = await client.messages.create({ model: "claude-sonnet-4-5", max_tokens: 5, messages: [] }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.status).toBe(want);
      expect(err.message).toMatch(/^Amazon Bedrock: /);
      expect(err.message).toMatch(text);
    }
  });

  it("an access-denied for a model not switched on points at Model access", async () => {
    const s = sender(() => { throw Object.assign(new Error("You don't have access to the model with the specified model ID."), { name: "AccessDeniedException", $metadata: { httpStatusCode: 403 } }); });
    const err: any = await createBedrockAnthropicClient(s, config()).messages.create({ model: "claude-sonnet-4-5", max_tokens: 5, messages: [] }).catch((e: unknown) => e);
    expect(err.message).toMatch(/Model access/);
    expect(err.message).toContain(SONNET);
  });

  it("a cancelled call stays a cancelled call", () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(toApiError(abort, { modelId: SONNET, region: "x" })).toBe(abort);
  });

  it("refuses a sandbox request before anything is sent", async () => {
    const s = sender(() => jsonReply({}));
    const client = createBedrockAnthropicClient(s, config());
    await expect(client.messages.create({ model: "claude-sonnet-4-5", max_tokens: 5, messages: [], tools: [{ type: "code_execution_20250825", name: "code_execution" }] })).rejects.toThrow(/sandbox/);
    expect(s.calls).toHaveLength(0);
  });

  it("the file storage the sandbox needs is said to be missing, not crashed on", async () => {
    const client = createBedrockAnthropicClient(sender(() => ({})), config());
    await expect(client.beta.files.download("file_1")).rejects.toThrow(/does not offer/);
  });
});

describe("a streamed answer", () => {
  it("yields every event, calls the text listener, and ends with the finished Message", async () => {
    const events = claudeEvents({ text: "Hello there!" });
    const s = sender(() => streamReply(events));
    const stream = createBedrockAnthropicClient(s, config()).messages.stream({ model: "claude-haiku-4-5", max_tokens: 50, messages: [{ role: "user", content: "hi" }] });
    const texts: string[] = [];
    const seen: string[] = [];
    stream.on("text", (t: string) => texts.push(t));
    stream.on("streamEvent", (e: any) => seen.push(e.type));
    const iterated: string[] = [];
    for await (const e of stream) iterated.push(e.type);
    const final = await stream.finalMessage();
    expect(s.calls[0]).toBeInstanceOf(InvokeModelWithResponseStreamCommand);
    expect(s.calls[0].input.modelId).toBe(HAIKU);
    expect(texts.join("")).toBe("Hello there!");
    expect(iterated).toEqual(events.map((e) => e.type));
    expect(seen).toEqual(iterated);
    expect(final.content).toEqual([{ type: "text", text: "Hello there!" }]);
    expect(final.stop_reason).toBe("end_turn");
    expect(final.usage).toMatchObject({ input_tokens: 21, output_tokens: 17 });
    expect(final.model).toBe("claude-haiku-4-5");
  });

  it("assembles a tool call whose input arrives in pieces", async () => {
    const s = sender(() => streamReply(claudeEvents({ text: "Checking.", tool: { id: "toolu_1", name: "lookup", json: ['{"acco', 'unt":"A-', '17"}'] } })));
    const stream = createBedrockAnthropicClient(s, config()).messages.stream({ model: "claude-sonnet-4-5", max_tokens: 50, messages: [] });
    const final = await stream.finalMessage();
    expect(final.stop_reason).toBe("tool_use");
    expect(final.content[1]).toMatchObject({ type: "tool_use", id: "toolu_1", name: "lookup", input: { account: "A-17" } });
  });

  it("a tool call with no arguments has an empty input, not a parse error", async () => {
    const s = sender(() => streamReply(claudeEvents({ tool: { id: "toolu_2", name: "ping", json: [] } })));
    const final = await createBedrockAnthropicClient(s, config()).messages.stream({ model: "claude-sonnet-4-5", max_tokens: 5, messages: [] }).finalMessage();
    expect(final.content[0].input).toEqual({});
  });

  it("a failure inside the stream rejects both the iteration and the final Message, with a status", async () => {
    const s = sender(() => streamReply(claudeEvents({ text: "Par" }).slice(0, 3), [{ throttlingException: { message: "Too many requests" } }]));
    const stream = createBedrockAnthropicClient(s, config()).messages.stream({ model: "claude-sonnet-4-5", max_tokens: 5, messages: [] });
    await expect((async () => { for await (const _ of stream) { /* drain */ } })()).rejects.toMatchObject({ status: 429 });
    await expect(stream.finalMessage()).rejects.toMatchObject({ status: 429 });
  });

  it("Claude's own error event keeps the status the retry rules know (overloaded is 529)", async () => {
    const s = sender(() => streamReply([claudeEvents()[0], { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }]));
    await expect(createBedrockAnthropicClient(s, config()).messages.stream({ model: "claude-sonnet-4-5", max_tokens: 5, messages: [] }).finalMessage())
      .rejects.toMatchObject({ status: 529, message: "Overloaded" });
  });

  it("a call that fails to start rejects with an explained error", async () => {
    const s = sender(() => { throw Object.assign(new Error("denied"), { name: "AccessDeniedException", $metadata: { httpStatusCode: 403 } }); });
    await expect(createBedrockAnthropicClient(s, config()).messages.stream({ model: "claude-sonnet-4-5", max_tokens: 5, messages: [] }).finalMessage())
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/^Amazon Bedrock: /) });
  });

  it("aborting stops the call and reads as a cancellation, not a Bedrock failure", async () => {
    let sentSignal: AbortSignal | undefined;
    const s = sender((_cmd, opts) => {
      sentSignal = opts?.abortSignal;
      return new Promise((_, reject) => opts?.abortSignal?.addEventListener("abort", () => reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }))));
    });
    const stream = createBedrockAnthropicClient(s, config()).messages.stream({ model: "claude-sonnet-4-5", max_tokens: 5, messages: [] });
    setTimeout(() => stream.abort(), 20);
    await expect(stream.finalMessage()).rejects.toMatchObject({ name: "AbortError" });
    expect(sentSignal?.aborted).toBe(true);
  });

  it("works under the platform's idle watchdog, which listens before the first event", async () => {
    const s = sender(() => streamReply(claudeEvents({ text: "ok" })));
    const stream = createBedrockAnthropicClient(s, config()).messages.stream({ model: "claude-sonnet-4-5", max_tokens: 5, messages: [] });
    const final = await awaitStreamWithIdleTimeout<any>(stream, { idleTimeoutMs: 5_000 });
    expect(final.content[0].text).toBe("ok");
  });

  it("a caller's own abort signal reaches AWS", async () => {
    const ac = new AbortController();
    let sentSignal: AbortSignal | undefined;
    const s = sender((_cmd, opts) => { sentSignal = opts?.abortSignal; return streamReply(claudeEvents({ text: "x" })); });
    const stream = createBedrockAnthropicClient(s, config()).messages.stream({ model: "claude-sonnet-4-5", max_tokens: 5, messages: [] }, { signal: ac.signal });
    await stream.finalMessage();
    ac.abort();
    expect(sentSignal?.aborted).toBe(true);
  });
});

describe("the accumulator", () => {
  it("refuses to invent an answer when the stream ended before it began", () => {
    expect(() => new MessageAccumulator().final()).toThrow(/before it began/);
  });

  it("reports a cut-off tool call instead of passing broken arguments on", () => {
    const acc = new MessageAccumulator();
    for (const e of claudeEvents({ tool: { id: "t", name: "n", json: ['{"a":'] } }).slice(0, 3)) acc.add(e);
    expect(() => acc.add({ type: "content_block_stop", index: 0 })).toThrow(/cut off/);
  });
});

describe("the connection test", () => {
  it("makes the same call chat makes and reads the answer from a Messages reply", async () => {
    const s = sender(() => jsonReply({ content: [{ type: "text", text: "OK" }] }));
    const r = await testBedrockModel(s, config(), "chat");
    expect(r).toMatchObject({ ok: true, purpose: "chat", modelId: SONNET, reply: "OK" });
    expect(s.calls[0]).toBeInstanceOf(InvokeModelCommand);
    expect(bodyOf(s.calls[0]).anthropic_version).toBe("bedrock-2023-05-31");
  });

  it("says so when the chat model is not a Claude model, without calling AWS", async () => {
    const s = sender(() => jsonReply({}));
    const r = await testBedrockModel(s, parseBedrockConfig({ enabled: true, region: "eu-central-1", models: { chat: { modelId: "amazon.titan-text-express-v1" } } }), "chat");
    expect(r.ok).toBe(false);
    expect(r.problem?.code).toBe("not_claude");
    expect(s.calls).toHaveLength(0);
  });
});

describe("the provider layer on top", () => {
  const useBedrock = (handler: (cmd: any, opts?: any) => any, over: Record<string, unknown> = {}) => {
    const s = sender(handler);
    const cfg = config(over);
    bedrockClient = { client: createBedrockAnthropicClient(s, cfg), config: cfg };
    return s;
  };

  it("complete() returns the text, the tool calls and the cost through Bedrock", async () => {
    const s = useBedrock(() => streamReply(claudeEvents({ text: "Done.", tool: { id: "toolu_9", name: "lookup", json: ['{"q":"x"}'] } })));
    const r = await getProvider("anthropic").complete([{ role: "user", content: "go" }], {
      model: "claude-sonnet-4-5", tools: [{ name: "lookup", description: "d", parameters: { type: "object", properties: { q: { type: "string" } } } }],
    });
    expect(s.calls[0].input.modelId).toBe(SONNET);
    expect(r.content).toBe("Done.");
    expect(r.toolCalls).toEqual([{ id: "toolu_9", name: "lookup", arguments: { q: "x" } }]);
    expect(r.tokensUsed).toEqual({ prompt: 21, completion: 17, total: 38 });
    expect(r.costUsd).toBeGreaterThan(0);
    expect(bodyOf(s.calls[0]).tools[0]).toMatchObject({ name: "lookup" });
  });

  it("streamComplete() delivers the text as it arrives", async () => {
    useBedrock(() => streamReply(claudeEvents({ text: "Streaming answer." })));
    const chunks: string[] = [];
    const r = await getProvider("anthropic").streamComplete!([{ role: "user", content: "go" }], { model: "claude-sonnet-4-5" }, (c) => chunks.push(c));
    expect(chunks.join("")).toBe("Streaming answer.");
    expect(r.content).toBe("Streaming answer.");
  });

  it("the provider reports itself as configured and says it is on Bedrock", async () => {
    useBedrock(() => streamReply([]));
    const info = await getProvider("anthropic").getInfo();
    expect(info.configured).toBe(true);
    expect(info.displayName).toMatch(/Amazon Bedrock/);
  });

  it("a step that needs the sandbox stops with the explanation, and is not handed to another vendor", async () => {
    useBedrock(() => streamReply([]));
    await expect(completeWithFallback([{ role: "user", content: "go" }], {
      model: "claude-sonnet-4-5", anthropicServerTools: [{ type: "code_execution_20250825", name: "code_execution" }],
    })).rejects.toThrow(/sandbox/);
  });

  it("a throttled Claude call is retried on Bedrock before anything else is tried", async () => {
    let attempts = 0;
    useBedrock(() => {
      attempts++;
      if (attempts === 1) throw Object.assign(new Error("slow down"), { name: "ThrottlingException", $metadata: { httpStatusCode: 429 } });
      return streamReply(claudeEvents({ text: "second time" }));
    });
    const r = await getProvider("anthropic").complete([{ role: "user", content: "go" }], { model: "claude-sonnet-4-5" });
    expect(attempts).toBe(2);
    expect(r.content).toBe("second time");
  }, 30_000);
});

describe("falling back to OpenAI", () => {
  const failing = { name: "ServiceUnavailableException", $metadata: { httpStatusCode: 503 } };

  it("with AWS only on, a Claude call that fails on Bedrock is not sent to OpenAI", async () => {
    blocksFallback = true;
    const fake = (name: string, fn: () => any) => ({ providerName: name, complete: vi.fn(fn), getInfo: vi.fn() }) as any;
    const anthropic = fake("anthropic", () => { throw Object.assign(new Error("Amazon Bedrock: down"), { status: 503 }); });
    const openai = fake("openai", () => ({ content: "from openai" }));
    await expect(completeWithFallback([{ role: "user", content: "go" }], { model: "claude-sonnet-4-5" }, [anthropic, openai])).rejects.toThrow(/All providers failed|Amazon Bedrock/);
    expect(openai.complete).not.toHaveBeenCalled();
    void failing;
  });

  it("without it, behaviour is what it was: the next provider is tried", async () => {
    blocksFallback = false;
    const fake = (name: string, fn: () => any) => ({ providerName: name, complete: vi.fn(fn), getInfo: vi.fn() }) as any;
    const anthropic = fake("anthropic", () => { throw Object.assign(new Error("down"), { status: 503 }); });
    const openai = fake("openai", () => ({ content: "from openai" }));
    const r = await completeWithFallback([{ role: "user", content: "go" }], { model: "claude-sonnet-4-5" }, [anthropic, openai]);
    expect(r.content).toBe("from openai");
    expect(r.providerFallback).toBe(true);
  });
});
