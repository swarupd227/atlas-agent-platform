/**
 * Anthropic prompt caching (server/anthropic-prompt-cache.ts), and what it does to a request to Claude.
 *
 * The properties that matter:
 *  - with the setting off a request and its accounting are what they always were;
 *  - with it on, the breakpoints sit on the tools, the system prompt and (only inside a tool loop) the end
 *    of the conversation, and never more than the API allows;
 *  - cached tokens are counted in the prompt and priced at their own rates, because Anthropic reports them
 *    apart from input_tokens and a caller that read only input_tokens would under-report cost;
 *  - Bedrock never gets the new fields;
 *  - the pure transform leaves its input untouched.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const streamMock = vi.fn();
const setting = vi.hoisted(() => ({ value: "off" as string | undefined, throws: false }));
const bedrock = vi.hoisted(() => ({ on: false }));

vi.mock("../server/storage", () => ({
  storage: { getPlatformSetting: vi.fn(async () => { if (setting.throws) throw new Error("db down"); return setting.value === undefined ? undefined : { value: setting.value }; }) },
}));
vi.mock("../server/llm-provider-keys", () => ({ resolveProviderKey: async () => ({ apiKey: "test-key", baseUrl: undefined }) }));
vi.mock("../server/bedrock-anthropic", () => ({
  // The Bedrock client is a stand-in for the Anthropic one: the provider calls the same messages.stream on it.
  getBedrockChatClient: async () => (bedrock.on ? { client: { messages: { create: vi.fn(), stream: streamMock } }, config: {} } : null),
  bedrockChatBlocksFallback: async () => false,
}));
vi.mock("../server/ai-egress", () => ({ awsOnlyActive: async () => false, AwsOnlyBlockedError: class extends Error {} }));
vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: vi.fn(), stream: streamMock };
    constructor(_opts: unknown) {}
  }
  return { default: MockAnthropic };
});

import {
  applyPromptCaching, readAnthropicUsage, cacheResultFields, promptCachingSettingOn, promptCachingActive, resetPromptCachingSettingCache,
  recordCacheUsage, cacheStats, resetCacheStats, MAX_CACHE_BREAKPOINTS, CACHE_READ_MULTIPLIER, CACHE_WRITE_MULTIPLIER, PROMPT_CACHING_SETTING,
} from "../server/anthropic-prompt-cache";
const { getProvider, getPriceTable } = await import("../server/llm-provider");

const EPH = { type: "ephemeral" };
const deepFreeze = <T>(o: T): T => { if (o && typeof o === "object") { Object.values(o as object).forEach(deepFreeze); Object.freeze(o); } return o; };

// ── the transform ───────────────────────────────────────────────────────────────────────────────────────────────

describe("applyPromptCaching", () => {
  const tools = [
    { name: "a", description: "first", input_schema: { type: "object" } },
    { name: "b", description: "second", input_schema: { type: "object" } },
    { type: "web_search_20250305", name: "web_search" },
  ];

  it("puts a breakpoint on the system prompt, as a text block", () => {
    const r = applyPromptCaching({ system: "You are an agent.", messages: [{ role: "user", content: "hi" }] });
    expect(r.system).toEqual([{ type: "text", text: "You are an agent.", cache_control: EPH }]);
  });

  it("leaves an empty system prompt out", () => {
    const r = applyPromptCaching({ system: "   ", messages: [{ role: "user", content: "hi" }] });
    expect(r.system).toBeUndefined();
    expect(applyPromptCaching({ messages: [{ role: "user", content: "hi" }] }).system).toBeUndefined();
  });

  it("puts the tool breakpoint on the last CUSTOM tool, never on a server tool", () => {
    const r = applyPromptCaching({ tools, messages: [{ role: "user", content: "hi" }] });
    expect(r.tools![0]).not.toHaveProperty("cache_control");
    expect(r.tools![1]).toMatchObject({ name: "b", cache_control: EPH });
    expect(r.tools![2]).toEqual({ type: "web_search_20250305", name: "web_search" });
  });

  it("a request with only server tools gets no tool breakpoint", () => {
    const r = applyPromptCaching({ tools: [{ type: "code_execution_20250825", name: "code_execution" }], messages: [{ role: "user", content: "hi" }] });
    expect(r.breakpoints).toBe(0);
    expect(r.tools![0]).not.toHaveProperty("cache_control");
  });

  it("a first call (no assistant turn yet) gets no end-of-conversation breakpoint: its tail has nothing to be reused by", () => {
    const messages = [{ role: "user", content: "hello" }];
    const r = applyPromptCaching({ system: "s", tools, messages });
    expect(r.messages).toBe(messages);
    expect(r.breakpoints).toBe(2);
  });

  it("inside a tool loop the conversation ends on a breakpoint: a tool_result block, or a plain string turned into a text block", () => {
    const loop = [
      { role: "user", content: "start" },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "a", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "42" }] },
    ];
    const r = applyPromptCaching({ system: "s", tools, messages: loop });
    expect(r.messages[2].content).toEqual([{ type: "tool_result", tool_use_id: "t1", content: "42", cache_control: EPH }]);
    expect(r.messages[0]).toBe(loop[0]);
    expect(r.breakpoints).toBe(3);

    const chat = [{ role: "user", content: "one" }, { role: "assistant", content: "two" }, { role: "user", content: "three" }];
    expect(applyPromptCaching({ messages: chat }).messages[2].content).toEqual([{ type: "text", text: "three", cache_control: EPH }]);
  });

  it("never uses more breakpoints than the API allows", () => {
    const r = applyPromptCaching({ system: "s", tools, messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }] });
    expect(r.breakpoints).toBeLessThanOrEqual(MAX_CACHE_BREAKPOINTS);
    expect(r.breakpoints).toBe(3);
  });

  it("skips a tail block that cannot carry one: thinking, a server-tool result, or an empty text block", () => {
    const base = [{ role: "user", content: "q" }];
    for (const block of [{ type: "thinking", thinking: "x", signature: "s" }, { type: "web_search_tool_result", tool_use_id: "x", content: [] }, { type: "text", text: "  " }]) {
      const msgs = [...base, { role: "assistant", content: [block] }];
      const r = applyPromptCaching({ messages: msgs });
      expect(r.messages).toBe(msgs);
      expect(r.breakpoints).toBe(0);
    }
    const emptyTail = [{ role: "user", content: "q" }, { role: "assistant", content: "a" }, { role: "user", content: "   " }];
    expect(applyPromptCaching({ messages: emptyTail }).messages).toBe(emptyTail);
  });

  it("does not edit what it was given", () => {
    const input = deepFreeze({
      system: "s",
      tools: [{ name: "a", description: "d", input_schema: { type: "object" } }],
      messages: [{ role: "user", content: "a" }, { role: "assistant", content: [{ type: "text", text: "b" }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: "y" }] }],
    });
    expect(() => applyPromptCaching(input as any)).not.toThrow();
    expect(JSON.stringify(input)).not.toContain("cache_control");
  });
});

// ── what a call used and cost ───────────────────────────────────────────────────────────────────────────────────

describe("readAnthropicUsage", () => {
  it("without cache fields it is the plain reading", () => {
    expect(readAnthropicUsage({ input_tokens: 100, output_tokens: 50 })).toEqual({ promptTokens: 100, completionTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0, billedPromptTokens: 100 });
  });

  it("counts cached tokens in the prompt, and bills a read at a tenth and a write at 125%", () => {
    const u = readAnthropicUsage({ input_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 500, output_tokens: 50 });
    expect(u.promptTokens).toBe(1600);
    expect(u.cacheReadTokens).toBe(1000);
    expect(u.cacheCreationTokens).toBe(500);
    expect(u.billedPromptTokens).toBeCloseTo(100 + 1000 * CACHE_READ_MULTIPLIER + 500 * CACHE_WRITE_MULTIPLIER, 6);
    expect(u.billedPromptTokens).toBeCloseTo(825, 6);
  });

  it("reads garbage as zero", () => {
    expect(readAnthropicUsage(undefined).promptTokens).toBe(0);
    expect(readAnthropicUsage({ input_tokens: "12", cache_read_input_tokens: -5, output_tokens: NaN })).toMatchObject({ promptTokens: 0, completionTokens: 0, cacheReadTokens: 0 });
  });

  it("adds cache fields to a result only when the call touched the cache", () => {
    expect(cacheResultFields(0, 0)).toEqual({});
    expect(cacheResultFields(10, 0)).toEqual({ cacheReadTokens: 10, cacheCreationTokens: 0 });
  });

  it("the price table says what the multipliers are, under a new version", () => {
    const t = getPriceTable() as any;
    expect(t.anthropicCacheMultipliers).toEqual({ read: 0.1, write5m: 1.25 });
    expect(t.version).toBe("2026-10-19");
  });
});

// ── whether to use it ───────────────────────────────────────────────────────────────────────────────────────────

describe("the setting and the Bedrock gate", () => {
  beforeEach(() => { resetPromptCachingSettingCache(); setting.value = "off"; setting.throws = false; bedrock.on = false; });

  it("is on only for the value 'on', in any case and with spaces", async () => {
    setting.value = " ON "; expect(await promptCachingSettingOn(1)).toBe(true);
    resetPromptCachingSettingCache(); setting.value = "off"; expect(await promptCachingSettingOn(1)).toBe(false);
    resetPromptCachingSettingCache(); setting.value = undefined; expect(await promptCachingSettingOn(1)).toBe(false);
    resetPromptCachingSettingCache(); setting.value = "true"; expect(await promptCachingSettingOn(1)).toBe(false);
  });

  it("an unreadable setting means off, and the answer is held for thirty seconds", async () => {
    setting.throws = true;
    expect(await promptCachingSettingOn(1000)).toBe(false);
    setting.throws = false; setting.value = "on";
    expect(await promptCachingSettingOn(1000 + 29_000)).toBe(false);
    expect(await promptCachingSettingOn(1000 + 31_000)).toBe(true);
  });

  it("is never active when Claude is answered by Bedrock", async () => {
    setting.value = "on";
    expect(await promptCachingActive(async () => false)).toBe(true);
    resetPromptCachingSettingCache();
    expect(await promptCachingActive(async () => true)).toBe(false);
    resetPromptCachingSettingCache();
    expect(await promptCachingActive(async () => { throw new Error("config unreadable"); })).toBe(false);
  });

  it("names the setting the seed declares", () => {
    expect(PROMPT_CACHING_SETTING).toBe("ANTHROPIC_PROMPT_CACHING");
  });
});

// ── the provider ────────────────────────────────────────────────────────────────────────────────────────────────

function fakeStream(message: any) {
  return { on: () => undefined, abort: () => undefined, finalMessage: async () => message, async *[Symbol.asyncIterator]() { /* no deltas */ } };
}
const reply = (usage: Record<string, number>, over: Record<string, unknown> = {}) => ({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage, ...over });
const MODEL = "claude-sonnet-4-5";
const rates = () => (getPriceTable() as any).providers.anthropic.models.find((m: any) => m.id === MODEL);
const lastRequest = () => streamMock.mock.calls[streamMock.mock.calls.length - 1][0];
const TOOL = { name: "lookup", description: "look it up", parameters: { properties: { q: { type: "string" } } } };

describe("AnthropicProvider with prompt caching", () => {
  beforeEach(() => { streamMock.mockReset(); resetPromptCachingSettingCache(); resetCacheStats(); setting.value = "off"; setting.throws = false; bedrock.on = false; });

  it("with the setting off a request is exactly what it was: a plain system string, no breakpoints", async () => {
    streamMock.mockImplementation(() => fakeStream(reply({ input_tokens: 100, output_tokens: 50 })));
    const r = await getProvider("anthropic").complete([{ role: "system", content: "Be brief." }, { role: "user", content: "hi" }], { model: MODEL, tools: [TOOL] });
    const req = lastRequest();
    expect(req.system).toBe("Be brief.");
    expect(JSON.stringify(req)).not.toContain("cache_control");
    expect(r.cacheReadTokens).toBeUndefined();
    expect(r.tokensUsed).toEqual({ prompt: 100, completion: 50, total: 150 });
    expect(r.costUsd).toBeCloseTo((100 / 1000) * rates().costPer1kInput + (50 / 1000) * rates().costPer1kOutput, 9);
  });

  it("with the setting on, the system prompt and the last custom tool carry breakpoints", async () => {
    setting.value = "on";
    streamMock.mockImplementation(() => fakeStream(reply({ input_tokens: 100, output_tokens: 50 })));
    await getProvider("anthropic").complete([{ role: "system", content: "Be brief." }, { role: "user", content: "hi" }], { model: MODEL, tools: [TOOL], anthropicServerTools: [{ type: "web_search_20250305", name: "web_search" }] });
    const req = lastRequest();
    expect(req.system).toEqual([{ type: "text", text: "Be brief.", cache_control: EPH }]);
    expect(req.tools[0]).toMatchObject({ name: "lookup", cache_control: EPH });
    expect(req.tools[1]).toEqual({ type: "web_search_20250305", name: "web_search" });
    expect(req.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("counts cached tokens in the prompt and prices them at their own rates", async () => {
    setting.value = "on";
    streamMock.mockImplementation(() => fakeStream(reply({ input_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 500, output_tokens: 50 })));
    const r = await getProvider("anthropic").complete([{ role: "system", content: "s" }, { role: "user", content: "hi" }], { model: MODEL });
    expect(r.tokensUsed).toEqual({ prompt: 1600, completion: 50, total: 1650 });
    expect(r.cacheReadTokens).toBe(1000);
    expect(r.cacheCreationTokens).toBe(500);
    expect(r.costUsd).toBeCloseTo((825 / 1000) * rates().costPer1kInput + (50 / 1000) * rates().costPer1kOutput, 9);
    expect(r.costUsd).toBeLessThan((1600 / 1000) * rates().costPer1kInput + (50 / 1000) * rates().costPer1kOutput);
    expect(cacheStats()).toMatchObject({ calls: 1, callsThatReadCache: 1, callsThatWroteCache: 1, cacheReadTokens: 1000, cacheCreationTokens: 500, uncachedInputTokens: 100 });
  });

  it("reads cached tokens right even with the setting off: what Anthropic reports is what was billed", async () => {
    streamMock.mockImplementation(() => fakeStream(reply({ input_tokens: 10, cache_read_input_tokens: 990, output_tokens: 5 })));
    const r = await getProvider("anthropic").complete([{ role: "user", content: "hi" }], { model: MODEL });
    expect(r.tokensUsed.prompt).toBe(1000);
    expect(r.costUsd).toBeCloseTo(((10 + 99) / 1000) * rates().costPer1kInput + (5 / 1000) * rates().costPer1kOutput, 9);
  });

  it("inside a tool loop the conversation ends on a breakpoint, and a paused turn's continuation moves it forward", async () => {
    setting.value = "on";
    streamMock
      .mockImplementationOnce(() => fakeStream(reply({ input_tokens: 10, output_tokens: 5 }, { stop_reason: "pause_turn" })))
      .mockImplementationOnce(() => fakeStream(reply({ input_tokens: 10, output_tokens: 5 })));
    await getProvider("anthropic").complete(
      [{ role: "system", content: "s" }, { role: "user", content: "q" }, { role: "assistant", content: "", tool_calls: [{ id: "t1", name: "lookup", arguments: {} }] } as any, { role: "tool", content: "42", tool_call_id: "t1" } as any],
      { model: MODEL, tools: [TOOL] },
    );
    const first = streamMock.mock.calls[0][0];
    const second = streamMock.mock.calls[1][0];
    const tailOf = (req: any) => req.messages[req.messages.length - 1].content[0];
    expect(tailOf(first)).toMatchObject({ type: "tool_result", cache_control: EPH });
    expect(second.messages.length).toBe(first.messages.length + 1);
    expect(tailOf(second)).toMatchObject({ type: "text", cache_control: EPH });
    const stamped = (req: any) => JSON.stringify(req).split("cache_control").length - 1;
    expect(stamped(first)).toBe(3);
    expect(stamped(second)).toBe(3);
  });

  it("is not used when Claude is answered by Bedrock", async () => {
    setting.value = "on"; bedrock.on = true;
    streamMock.mockImplementation(() => fakeStream(reply({ input_tokens: 100, output_tokens: 50 })));
    await getProvider("anthropic").complete([{ role: "system", content: "s" }, { role: "user", content: "hi" }], { model: MODEL, tools: [TOOL] });
    expect(JSON.stringify(lastRequest())).not.toContain("cache_control");
    expect(lastRequest().system).toBe("s");
  });

  it("the streaming path sends the same breakpoints and prices the same way", async () => {
    setting.value = "on";
    streamMock.mockImplementation(() => fakeStream(reply({ input_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 500, output_tokens: 50 })));
    const chunks: string[] = [];
    const r = await getProvider("anthropic").streamComplete([{ role: "system", content: "s" }, { role: "user", content: "hi" }], { model: MODEL, tools: [TOOL] }, (c) => chunks.push(c));
    const req = lastRequest();
    expect(req.system).toEqual([{ type: "text", text: "s", cache_control: EPH }]);
    expect(req.tools[0]).toMatchObject({ cache_control: EPH });
    expect(r.tokensUsed.prompt).toBe(1600);
    expect(r.cacheReadTokens).toBe(1000);
    expect(r.costUsd).toBeCloseTo((825 / 1000) * rates().costPer1kInput + (50 / 1000) * rates().costPer1kOutput, 9);
  });

  it("the streaming path with the setting off sends a plain system string", async () => {
    streamMock.mockImplementation(() => fakeStream(reply({ input_tokens: 100, output_tokens: 50 })));
    await getProvider("anthropic").streamComplete([{ role: "system", content: "s" }, { role: "user", content: "hi" }], { model: MODEL }, () => undefined);
    expect(lastRequest().system).toBe("s");
    expect(JSON.stringify(lastRequest())).not.toContain("cache_control");
  });
});

describe("counters", () => {
  it("count calls, reads and writes, and the share of input that came from the cache", () => {
    resetCacheStats();
    recordCacheUsage(readAnthropicUsage({ input_tokens: 100, cache_read_input_tokens: 300, output_tokens: 1 }));
    recordCacheUsage(readAnthropicUsage({ input_tokens: 100, output_tokens: 1 }));
    const s = cacheStats();
    expect(s).toMatchObject({ calls: 2, callsThatReadCache: 1, callsThatWroteCache: 0, uncachedInputTokens: 200, cacheReadTokens: 300 });
    expect(s.hitRatio).toBeCloseTo(300 / 500, 9);
    resetCacheStats();
    expect(cacheStats()).toMatchObject({ calls: 0, hitRatio: 0 });
  });
});

// ── where the pieces are wired ──────────────────────────────────────────────────────────────────────────────────

describe("wiring", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

  it("both Anthropic paths build the cached request per leg, from the same helper, and price the call from the usage helper", () => {
    const src = read("server/llm-provider.ts");
    const at = src.indexOf("class AnthropicProvider");
    const cls = src.slice(at);
    expect((cls.match(/const cachedReq = cacheOn \? applyPromptCaching\(/g) ?? []).length).toBe(2);
    expect((cls.match(/system: \(cachedReq\?\.system \?\? systemPrompt\) as any/g) ?? []).length).toBe(2);
    expect((cls.match(/messages: \(cachedReq\?\.messages \?\? anthropicMessages\) as Anthropic\.MessageParam\[\]/g) ?? []).length).toBe(2);
    expect((cls.match(/tools: \(cachedReq\?\.tools \?\? anthropicTools\) as Anthropic\.Tool\[\]/g) ?? []).length).toBe(2);
    expect((cls.match(/const cacheOn = await promptCachingActive\(\);/g) ?? []).length).toBe(2);
    expect((cls.match(/estimateCost\(legUsage\.billedPromptTokens, legCompletion, ANTHROPIC_MODELS, model\)/g) ?? []).length).toBe(2);
    expect((cls.match(/recordCacheUsage\(legUsage\)/g) ?? []).length).toBe(2);
    expect((cls.match(/\.\.\.cacheResultFields\(cacheReadTokens, cacheCreationTokens\),/g) ?? []).length).toBe(2);
    // the old reading of input_tokens alone is gone from the Anthropic class
    expect(cls).not.toMatch(/const legPrompt = (response|finalMsg)\??\.usage\??\.input_tokens/);
    // the request is rebuilt inside the continuation loop, so a paused turn's longer conversation gets its own tail
    const loop1 = cls.indexOf("for (let attempt = 0; ; attempt++) {");
    expect(cls.indexOf("const cachedReq", loop1)).toBeGreaterThan(loop1);
  });

  it("the setting is seeded off inside the default settings list, and the stats route is an administrator's", () => {
    const seed = read("server/seed.ts");
    const k = seed.indexOf('key: "ANTHROPIC_PROMPT_CACHING"');
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(seed.indexOf("const missingSettings"));
    expect(seed).toMatch(/key: "ANTHROPIC_PROMPT_CACHING",\s*value: "off"/);
    expect(read("server/routes/llm-providers.ts")).toMatch(/router\.get\("\/api\/llm-providers\/cache-stats", (platformOnly\()?checkPermission\("manage_security"\)/);
  });
});
