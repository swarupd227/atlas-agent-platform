/**
 * AWS-only mode (server/ai-egress.ts and the provider layer): with it on nothing is sent to OpenAI or to Anthropic's own API.
 * A chat request that asked for an OpenAI model is answered by Claude on Bedrock and marked as such; what has no Bedrock equivalent is
 * refused in words. With it off, everything is as it was. Run without AWS: Bedrock is a stand-in that records what it was sent, and the
 * OpenAI SDK is a stand-in that counts how often it was built and called.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/storage", () => ({ storage: {} }));
vi.mock("../server/db", () => ({ db: { execute: vi.fn() } }));

let keyPresent = true;
vi.mock("../server/llm-provider-keys", () => ({
  resolveProviderKey: async () => (keyPresent ? { apiKey: "test-openai-key", baseUrl: undefined, source: "env" } : { apiKey: undefined, baseUrl: undefined, source: "none" }),
}));

import { parseBedrockConfig, type BedrockConfig } from "../server/bedrock-config";
let current: BedrockConfig = parseBedrockConfig({});
vi.mock("../server/bedrock-config", async (importOriginal) => {
  const real = await importOriginal<typeof import("../server/bedrock-config")>();
  return { ...real, loadBedrockConfig: async () => ({ config: current, source: "admin" as const }) };
});

let bedrockClient: { client: any; config: any } | null = null;
vi.mock("../server/bedrock-anthropic", async (importOriginal) => {
  const real = await importOriginal<typeof import("../server/bedrock-anthropic")>();
  return { ...real, getBedrockChatClient: async () => bedrockClient, bedrockChatBlocksFallback: async () => false };
});

const sdk = { built: 0, chat: vi.fn(), transcribe: vi.fn(), embed: vi.fn(), images: vi.fn() };
vi.mock("openai", () => {
  class FakeOpenAI {
    chat = { completions: { create: sdk.chat } };
    audio = { transcriptions: { create: sdk.transcribe } };
    embeddings = { create: sdk.embed };
    images = { generate: sdk.images };
    constructor(_opts: unknown) { sdk.built++; }
  }
  return { default: FakeOpenAI, toFile: async (b: unknown, name: string) => ({ b, name }) };
});

import { createBedrockAnthropicClient } from "../server/bedrock-anthropic";
import type { BedrockSender } from "../server/bedrock-client";
import {
  AwsOnlyBlockedError, aiAssistAvailable, assertNotAwsOnly, awsOnlyActive, createGuardedOpenAi, openAiClient, openAiClientForKey,
} from "../server/ai-egress";
import { getAvailableProviders, getProvider } from "../server/llm-provider";
import { getAnthropicClient } from "../server/claude";
import { embedWith, openAiTarget } from "../server/embedding-backend";

const SONNET = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
const HAIKU = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const chatOn = (over: Record<string, unknown> = {}) =>
  parseBedrockConfig({ enabled: true, region: "eu-central-1", useForChat: true, models: { chat: { modelId: SONNET }, fast: { modelId: HAIKU } }, ...over });
const awsOnlyConfig = () => chatOn({ awsOnly: true });

const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
function claudeStream(text: string) {
  const events = [
    { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "x", content: [], stop_reason: null, usage: { input_tokens: 12, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ...(text.match(/.{1,5}/g) ?? []).map((t) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } })),
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 9 } },
    { type: "message_stop" },
  ];
  return { body: (async function* () { for (const e of events) yield { chunk: { bytes: enc(e) } }; })() };
}
function useBedrock(config: BedrockConfig, answer = "Answered on Bedrock.") {
  const calls: any[] = [];
  const sender: BedrockSender = { async send(cmd: any) { calls.push(cmd); return claudeStream(answer); } };
  bedrockClient = { client: createBedrockAnthropicClient(sender, config), config };
  return calls;
}

beforeEach(() => {
  keyPresent = true; current = parseBedrockConfig({}); bedrockClient = null;
  sdk.built = 0; sdk.chat.mockReset(); sdk.transcribe.mockReset(); sdk.embed.mockReset(); sdk.images.mockReset();
});

describe("what AWS only is", () => {
  it("is on only when Bedrock is enabled and the setting is on", async () => {
    expect(await awsOnlyActive()).toBe(false);
    current = chatOn(); expect(await awsOnlyActive()).toBe(false);
    current = awsOnlyConfig(); expect(await awsOnlyActive()).toBe(true);
    current = chatOn({ awsOnly: true, enabled: false }); expect(await awsOnlyActive()).toBe(false);
  });

  it("cannot be set without chat on Bedrock, because nothing would answer", () => {
    expect(() => parseBedrockConfig({ enabled: true, region: "eu-central-1", awsOnly: true })).toThrow(/needs chat switched to Bedrock/);
    expect(() => parseBedrockConfig({ enabled: true, region: "eu-central-1", awsOnly: true, useForChat: true, models: { chat: { modelId: SONNET } } })).not.toThrow();
  });

  it("assertNotAwsOnly says what was refused, in words", async () => {
    current = awsOnlyConfig();
    await expect(assertNotAwsOnly("Dictation")).rejects.toThrow(/Dictation is not available while AWS-only mode is on/);
    await expect(assertNotAwsOnly("Dictation")).rejects.toMatchObject({ status: 409, code: "aws_only", name: "AwsOnlyBlockedError" });
  });
});

describe("a request for an OpenAI model, with AWS only on", () => {
  beforeEach(() => { current = awsOnlyConfig(); });

  it("is answered by the Bedrock chat model, never by OpenAI, and says so", async () => {
    const calls = useBedrock(current, "Bedrock wrote this.");
    const r = await getProvider("openai").complete([{ role: "user", content: "hello" }], { model: "gpt-4.1" });
    expect(r.content).toBe("Bedrock wrote this.");
    expect(calls).toHaveLength(1);
    expect(calls[0].input.modelId).toBe(SONNET);
    expect(sdk.built).toBe(0);
    expect(sdk.chat).not.toHaveBeenCalled();
    expect(r).toMatchObject({ requestedProvider: "openai", actualProvider: "anthropic", providerFallback: true, fallbackReason: "aws_only" });
    expect(r.tokensUsed.prompt).toBe(12);
  });

  it("a small OpenAI model is answered by the quick-tasks model", async () => {
    const calls = useBedrock(current);
    await getProvider("openai").complete([{ role: "user", content: "x" }], { model: "gpt-4.1-nano" });
    await getProvider("openai").complete([{ role: "user", content: "x" }], { model: "gpt-4o-mini" });
    await getProvider("openai").complete([{ role: "user", content: "x" }], { model: "gpt-4o" });
    expect(calls.map((c) => c.input.modelId)).toEqual([HAIKU, HAIKU, SONNET]);
  });

  it("a streamed request delivers its text as it arrives, from Bedrock", async () => {
    useBedrock(current, "Streaming from Bedrock.");
    const chunks: string[] = [];
    const r = await getProvider("openai").streamComplete!([{ role: "user", content: "go" }], { model: "gpt-4.1" }, (c) => chunks.push(c));
    expect(chunks.join("")).toBe("Streaming from Bedrock.");
    expect(r.providerFallback).toBe(true);
    expect(sdk.built).toBe(0);
  });

  it("embeddings, the health check and the provider list never touch OpenAI", async () => {
    await expect(getProvider("openai").embed!(["a"])).rejects.toBeInstanceOf(AwsOnlyBlockedError);
    expect(await getProvider("openai").healthCheck()).toMatchObject({ ok: false, error: expect.stringMatching(/AWS-only mode is on/) });
    const info = (await getAvailableProviders()).find((p) => p.name === "openai");
    expect(info?.configured).toBe(false);
    expect(sdk.built).toBe(0);
  });

  it("Claude on Anthropic's own API is refused when chat is not on Bedrock (it never is, with AWS only, unless set by hand)", async () => {
    bedrockClient = null;
    await expect(getAnthropicClient()).rejects.toBeInstanceOf(AwsOnlyBlockedError);
    await expect(getProvider("anthropic").complete([{ role: "user", content: "x" }])).rejects.toBeInstanceOf(AwsOnlyBlockedError);
  });

  it("document search through OpenAI is refused", async () => {
    await expect(embedWith(openAiTarget(), ["some passage"])).rejects.toThrow(/Document search through OpenAI is not available while AWS-only mode is on/);
    expect(sdk.built).toBe(0);
  });

  it("the raw OpenAI client, and a key someone is trying out, are refused", async () => {
    await expect(openAiClient("Embeddings")).rejects.toBeInstanceOf(AwsOnlyBlockedError);
    await expect(openAiClientForKey("Testing an OpenAI key", "sk-test")).rejects.toBeInstanceOf(AwsOnlyBlockedError);
    expect(sdk.built).toBe(0);
  });
});

describe("the guarded OpenAI client, with AWS only on", () => {
  beforeEach(() => { current = awsOnlyConfig(); });

  it("answers chat.completions.create from Bedrock, in OpenAI's shape, carrying what the platform's own calls use", async () => {
    const calls = useBedrock(current, '{"actions":["a","b","c"]}');
    const openai = createGuardedOpenAi();
    const out: any = await openai.chat.completions.create({
      model: "gpt-4.1-nano", max_tokens: 150, temperature: 0.3, response_format: { type: "json_object" },
      messages: [{ role: "system", content: "Return JSON." }, { role: "user", content: "Suggest." }],
    });
    expect(out.choices[0].message.content).toBe('{"actions":["a","b","c"]}');
    expect(out.usage).toEqual({ prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 });
    const body = JSON.parse(calls[0].input.body);
    expect(calls[0].input.modelId).toBe(HAIKU);
    expect(body.max_tokens).toBe(150);
    expect(body.temperature).toBe(0.3);
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "Suggest." });
    expect(JSON.stringify(body)).toContain("Return JSON.");
    expect(sdk.built).toBe(0);
  });

  it("max_completion_tokens counts as the limit too", async () => {
    const calls = useBedrock(current);
    await createGuardedOpenAi().chat.completions.create({ model: "gpt-4.1", max_completion_tokens: 8192, messages: [{ role: "system", content: "Be brief." }] as any });
    expect(JSON.parse(calls[0].input.body).max_tokens).toBe(8192);
  });

  it("refuses what has no Bedrock counterpart, naming it", async () => {
    const openai = createGuardedOpenAi();
    await expect(openai.audio.transcriptions.create({ file: {} as any, model: "x" })).rejects.toThrow(/Speech-to-text and text-to-speech is not available/);
    await expect(openai.images.generate({ prompt: "x" } as any)).rejects.toThrow(/Image generation is not available/);
    await expect(openai.responses.create({ model: "x", input: "y" } as any)).rejects.toThrow(/OpenAI's web search is not available/);
    await expect(createGuardedOpenAi("Dictation").audio.transcriptions.create({ file: {} as any, model: "x" })).rejects.toThrow(/Dictation is not available/);
    expect(sdk.built).toBe(0);
    expect(sdk.transcribe).not.toHaveBeenCalled();
  });

  it("refuses a streamed or tool-using request made straight to OpenAI instead of quietly dropping the stream or the tools", async () => {
    useBedrock(current);
    const openai = createGuardedOpenAi();
    await expect(openai.chat.completions.create({ model: "x", stream: true, messages: [{ role: "user", content: "y" }] } as any)).rejects.toBeInstanceOf(AwsOnlyBlockedError);
    await expect(openai.chat.completions.create({ model: "x", tools: [{ type: "function", function: { name: "f" } }], messages: [{ role: "user", content: "y" }] } as any)).rejects.toBeInstanceOf(AwsOnlyBlockedError);
  });

  it("refuses a message with an image for OpenAI, rather than sending it anywhere", async () => {
    useBedrock(current);
    await expect(createGuardedOpenAi().chat.completions.create({
      model: "gpt-4.1", messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,xx" } }] }] as any,
    })).rejects.toBeInstanceOf(AwsOnlyBlockedError);
  });
});

describe("with AWS only off, nothing changes", () => {
  it("the OpenAI provider calls OpenAI", async () => {
    sdk.chat.mockResolvedValue({ choices: [{ message: { content: "from openai" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } });
    const r = await getProvider("openai").complete([{ role: "user", content: "hi" }], { model: "gpt-4.1" });
    expect(r.content).toBe("from openai");
    expect(r.providerFallback).toBeUndefined();
    expect(sdk.chat).toHaveBeenCalledTimes(1);
  });

  it("chat on Bedrock alone does not touch OpenAI requests", async () => {
    current = chatOn();
    sdk.chat.mockResolvedValue({ choices: [{ message: { content: "still openai" }, finish_reason: "stop" }], usage: {} });
    const calls = useBedrock(current);
    const r = await getProvider("openai").complete([{ role: "user", content: "hi" }], { model: "gpt-4.1" });
    expect(r.content).toBe("still openai");
    expect(calls).toHaveLength(0);
  });

  it("the guarded client builds nothing until it is used, and then calls the real SDK", async () => {
    const openai = createGuardedOpenAi();
    expect(sdk.built).toBe(0);
    sdk.chat.mockResolvedValue({ choices: [{ message: { content: "real" } }] });
    const out: any = await openai.chat.completions.create({ model: "gpt-4.1", messages: [{ role: "user", content: "x" }] });
    expect(out.choices[0].message.content).toBe("real");
    expect(sdk.built).toBe(1);
    sdk.transcribe.mockResolvedValue({ text: "hello" });
    expect(((await openai.audio.transcriptions.create({ file: {} as any, model: "m" })) as any).text).toBe("hello");
    expect(sdk.built).toBe(1);
  });

  it("with no OpenAI key, creating the client is fine and the call says OpenAI is not set up", async () => {
    keyPresent = false;
    const openai = createGuardedOpenAi();
    await expect(openai.chat.completions.create({ model: "x", messages: [] })).rejects.toThrow(/OpenAI is not set up on this server/);
  });

  it("AI-assist features are available when OpenAI has a key, and not when it has none", async () => {
    expect(await aiAssistAvailable()).toBe(true);
    keyPresent = false;
    expect(await aiAssistAvailable()).toBe(false);
  });

  it("with AWS only on they are available without any OpenAI key, because Bedrock answers", async () => {
    keyPresent = false; current = awsOnlyConfig();
    expect(await aiAssistAvailable()).toBe(true);
  });
});
