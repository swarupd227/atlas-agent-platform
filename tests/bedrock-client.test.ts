/**
 * Talking to Amazon Bedrock (server/bedrock-client.ts) without AWS: the request and response shapes of the embedding models,
 * the connection test, the plain-language explanations, the permission policy, and the client built from the settings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/storage", () => ({ storage: {} }));

import {
  BedrockError, COHERE_MAX_TEXTS_PER_CALL, cohereInvocation, createBedrockRuntime, embedTexts, explainBedrockError, generateIamPolicy,
  parseCohereVectors, parseTitanVector, testBedrockModel, titanInvocation, type BedrockSender,
} from "../server/bedrock-client";
import { parseBedrockConfig } from "../server/bedrock-config";

const titanV2 = { modelId: "amazon.titan-embed-text-v2:0", dimensions: 1024 };
const titanV1 = { modelId: "amazon.titan-embed-text-v1" };
const cohere = { modelId: "cohere.embed-multilingual-v3", dimensions: 1024 };

const bodyOf = (cmd: any) => JSON.parse(cmd.input.body as string);
const reply = (obj: unknown) => ({ body: new TextEncoder().encode(JSON.stringify(obj)) });
const vec = (n: number, seed = 0) => Array.from({ length: n }, (_, i) => (i + seed) / 1000);

/** A fake Bedrock that answers embedding calls with vectors of the given size and records every call. */
function fakeEmbedder(dim: number) {
  const calls: any[] = [];
  let inFlight = 0, maxInFlight = 0;
  const sender: BedrockSender = {
    async send(cmd: any) {
      calls.push(cmd);
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      const body = bodyOf(cmd);
      if (body.inputText !== undefined) return reply({ embedding: vec(dim, Number(String(body.inputText).replace(/\D/g, "")) || 0), inputTextTokenCount: 3 });
      return reply({ embeddings: (body.texts as string[]).map((t) => vec(dim, Number(t.replace(/\D/g, "")) || 0)) });
    },
  };
  return { sender, calls, maxInFlight: () => maxInFlight };
}

describe("request bodies", () => {
  it("Titan: one text, and the size only when the settings name one", () => {
    expect(titanInvocation(titanV2, "hello").body).toEqual({ inputText: "hello", dimensions: 1024, normalize: true });
    expect(titanInvocation(titanV1, "hello").body).toEqual({ inputText: "hello" });
    expect(titanInvocation(titanV2, "hello").modelId).toBe("amazon.titan-embed-text-v2:0");
  });

  it("Cohere: a stored passage and a question are different kinds of input", () => {
    expect(cohereInvocation(cohere, ["a", "b"], "document").body).toEqual({ texts: ["a", "b"], input_type: "search_document", truncate: "END" });
    expect(cohereInvocation(cohere, ["q"], "query").body).toMatchObject({ input_type: "search_query" });
  });
});

describe("answers", () => {
  it("Titan: the vector, and a clear error when it is missing", () => {
    expect(parseTitanVector({ embedding: [0.1, 0.2] })).toEqual([0.1, 0.2]);
    expect(() => parseTitanVector({})).toThrow(/no embedding/);
    expect(() => parseTitanVector({ embedding: [] })).toThrow(/no embedding/);
  });

  it("Cohere: a plain list of vectors, or the typed form", () => {
    expect(parseCohereVectors({ embeddings: [[1, 2], [3, 4]] })).toEqual([[1, 2], [3, 4]]);
    expect(parseCohereVectors({ embeddings: { float: [[1, 2]] } })).toEqual([[1, 2]]);
    expect(() => parseCohereVectors({ embeddings: [] })).toThrow(/no embeddings/);
    expect(() => parseCohereVectors({})).toThrow(/no embeddings/);
  });
});

describe("embedTexts", () => {
  it("Titan makes one call per text, keeps the order, and never runs more at once than allowed", async () => {
    const f = fakeEmbedder(1024);
    const texts = Array.from({ length: 10 }, (_, i) => `text ${i}`);
    const { vectors, dimensions } = await embedTexts(f.sender, titanV2, texts, "document", { maxConcurrent: 3 });
    expect(f.calls).toHaveLength(10);
    expect(vectors).toHaveLength(10);
    expect(dimensions).toBe(1024);
    vectors.forEach((v, i) => expect(v[0]).toBe(i / 1000));
    expect(f.maxInFlight()).toBeLessThanOrEqual(3);
    expect(f.maxInFlight()).toBeGreaterThan(1);
  });

  it("Cohere sends up to 96 texts a call, and joins the answers in order", async () => {
    const f = fakeEmbedder(1024);
    const texts = Array.from({ length: COHERE_MAX_TEXTS_PER_CALL + 4 }, (_, i) => `t${i}`);
    const { vectors } = await embedTexts(f.sender, cohere, texts, "document", { maxConcurrent: 2 });
    expect(f.calls.map((c) => bodyOf(c).texts.length)).toEqual([96, 4]);
    expect(vectors).toHaveLength(100);
    vectors.forEach((v, i) => expect(v[0]).toBe(i / 1000));
  });

  it("Cohere is told when the text is a question", async () => {
    const f = fakeEmbedder(1024);
    await embedTexts(f.sender, cohere, ["what is x"], "query", { maxConcurrent: 1 });
    expect(bodyOf(f.calls[0]).input_type).toBe("search_query");
  });

  it("returns nothing for nothing, without calling Bedrock", async () => {
    const f = fakeEmbedder(1024);
    expect((await embedTexts(f.sender, titanV2, [], "document", { maxConcurrent: 1 })).vectors).toEqual([]);
    expect(f.calls).toHaveLength(0);
  });

  it("says so when the model returns a different size than the settings expect", async () => {
    const f = fakeEmbedder(512);
    await expect(embedTexts(f.sender, titanV2, ["x"], "document", { maxConcurrent: 1 })).rejects.toMatchObject({ problem: { code: "dimension_mismatch" } });
  });

  it("detects the size when the settings leave it out", async () => {
    const f = fakeEmbedder(1536);
    expect((await embedTexts(f.sender, titanV1, ["x"], "document", { maxConcurrent: 1 })).dimensions).toBe(1536);
  });

  it("refuses a model of a kind it cannot talk to", async () => {
    await expect(embedTexts(fakeEmbedder(8).sender, { modelId: "vendor.other-v1" }, ["x"], "document", { maxConcurrent: 1 })).rejects.toBeInstanceOf(BedrockError);
  });
});

describe("the connection test", () => {
  const config = parseBedrockConfig({ enabled: true, region: "eu-central-1", models: { embedding: titanV2, chat: { modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0" } } });

  it("embedding: reports the size of the vectors the model really returns", async () => {
    const r = await testBedrockModel(fakeEmbedder(1024).sender, config, "embedding");
    expect(r).toMatchObject({ ok: true, purpose: "embedding", modelId: "amazon.titan-embed-text-v2:0", dimensions: 1024 });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("chat: asks for one word and reports the answer", async () => {
    const sent: any[] = [];
    const sender: BedrockSender = { async send(cmd: any) { sent.push(cmd); return { output: { message: { content: [{ text: "OK" }] } } }; } };
    const r = await testBedrockModel(sender, config, "chat");
    expect(r).toMatchObject({ ok: true, reply: "OK" });
    expect(sent[0].input).toMatchObject({ modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0", inferenceConfig: { maxTokens: 16 } });
  });

  it("never throws: a failure is a result with words an administrator can act on", async () => {
    const err = Object.assign(new Error("You don't have access to the model with the specified model ID."), { name: "AccessDeniedException" });
    const r = await testBedrockModel({ async send() { throw err; } }, config, "embedding");
    expect(r.ok).toBe(false);
    expect(r.problem?.code).toBe("model_access");
    expect(r.problem?.hint).toContain("eu-central-1");
    expect(r.problem?.hint).toContain("amazon.titan-embed-text-v2:0");
  });

  it("says plainly when the job has no model", async () => {
    const r = await testBedrockModel(fakeEmbedder(8).sender, config, "fast");
    expect(r).toMatchObject({ ok: false, problem: { code: "no_model" } });
  });
});

describe("explaining errors", () => {
  const ctx = { modelId: "m-1", region: "eu-central-1" };
  const named = (name: string, message = "", status?: number) => Object.assign(new Error(message), { name, ...(status ? { $metadata: { httpStatusCode: status } } : {}) });
  const code = (e: unknown) => explainBedrockError(e, ctx).code;

  it("tells a model that is not switched on from a missing permission", () => {
    expect(code(named("AccessDeniedException", "You don't have access to the model with the specified model ID."))).toBe("model_access");
    expect(code(named("AccessDeniedException", "User: arn:aws:sts::1:assumed-role/x is not authorized to perform: bedrock:InvokeModel on resource: arn:aws:bedrock:eu-central-1::foundation-model/m-1"))).toBe("permission");
  });

  it("covers the other things that go wrong", () => {
    expect(code(named("ValidationException", "Invocation of model ID m-1 with on-demand throughput isn't supported. Retry your request with the ID or ARN of an inference profile"))).toBe("needs_profile");
    expect(code(named("ValidationException", "The provided model identifier is invalid."))).toBe("bad_model_id");
    expect(code(named("ValidationException", "something else"))).toBe("bad_request");
    expect(code(named("ResourceNotFoundException", "Could not resolve the foundation model"))).toBe("model_not_found");
    expect(code(named("ThrottlingException", "Too many requests"))).toBe("throttled");
    expect(code(named("ServiceUnavailableException"))).toBe("unavailable");
    expect(code(named("Whatever", "boom", 503))).toBe("unavailable");
    expect(code(named("CredentialsProviderError", "Could not load credentials from any providers"))).toBe("no_credentials");
    expect(code(named("UnrecognizedClientException", "The security token included in the request is invalid."))).toBe("bad_credentials");
    expect(code(Object.assign(new Error("getaddrinfo ENOTFOUND bedrock-runtime.x.amazonaws.com"), { code: "ENOTFOUND" }))).toBe("unreachable");
    expect(code(new Error("something odd"))).toBe("error");
  });

  it("always gives both a message and a hint", () => {
    for (const e of [named("AccessDeniedException"), named("ThrottlingException"), new Error("something unexpected happened"), "a string of text"]) {
      const p = explainBedrockError(e, ctx);
      expect(p.message.length).toBeGreaterThan(5);
      expect(p.hint.length).toBeGreaterThan(5);
    }
  });

  it("passes on a problem that is already in words", () => {
    const p = { code: "no_region", message: "m", hint: "h" };
    expect(explainBedrockError(new BedrockError(p), ctx)).toBe(p);
  });
});

describe("the permission policy", () => {
  const policyOf = (c: object) => generateIamPolicy(parseBedrockConfig(c)).Statement[0] as { Action: string[]; Resource: string[] };

  it("allows calling exactly the configured models, in the configured region", () => {
    const s = policyOf({ region: "eu-central-1", models: { embedding: titanV2, fast: { modelId: "amazon.nova-micro-v1:0" } } });
    expect(s.Action).toEqual(["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]);
    expect(s.Resource).toEqual([
      "arn:aws:bedrock:eu-central-1::foundation-model/amazon.nova-micro-v1:0",
      "arn:aws:bedrock:eu-central-1::foundation-model/amazon.titan-embed-text-v2:0",
    ]);
  });

  it("for an inference profile, names the profile and the model behind it in every region it may route to", () => {
    const s = policyOf({ region: "us-east-1", models: { chat: { modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0" } } });
    expect(s.Resource).toContain("arn:aws:bedrock:us-east-1:*:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0");
    expect(s.Resource).toContain("arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0");
  });

  it("uses the right partition for government and China regions, and passes an ARN through", () => {
    expect(policyOf({ region: "us-gov-west-1", models: { embedding: titanV2 } }).Resource[0]).toMatch(/^arn:aws-us-gov:/);
    expect(policyOf({ region: "cn-north-1", models: { embedding: titanV2 } }).Resource[0]).toMatch(/^arn:aws-cn:/);
    const arn = "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.amazon.nova-pro-v1:0";
    expect(policyOf({ region: "us-east-1", models: { chat: { modelId: arn } } }).Resource).toEqual([arn]);
  });

  it("lists each resource once, and none when there are no models", () => {
    expect(policyOf({ region: "eu-west-1", models: { embedding: titanV2, fast: { modelId: titanV2.modelId } } }).Resource).toHaveLength(1);
    expect(policyOf({ region: "eu-west-1" }).Resource).toEqual([]);
  });
});

describe("the client built from the settings", () => {
  const saved = { AWS_REGION: process.env.AWS_REGION, AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION };
  beforeEach(() => { delete process.env.AWS_REGION; delete process.env.AWS_DEFAULT_REGION; });
  afterEach(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete (process.env as any)[k]; else (process.env as any)[k] = v; } });
  const creds = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" };

  it("needs a region, from the settings or from the server", () => {
    expect(() => createBedrockRuntime(parseBedrockConfig({}), null)).toThrow(BedrockError);
    process.env.AWS_REGION = "eu-west-1";
    expect(() => createBedrockRuntime(parseBedrockConfig({}), null)).not.toThrow();
  });

  it("needs the keys when told to use keys", () => {
    try { createBedrockRuntime(parseBedrockConfig({ region: "eu-west-1", credentialMode: "keys" }), null); expect.unreachable(); }
    catch (e) { expect((e as BedrockError).problem.code).toBe("no_credentials"); }
  });

  it("uses the saved keys, and the region and private address it was given", async () => {
    const client = createBedrockRuntime(parseBedrockConfig({ region: "eu-west-1", credentialMode: "keys", endpoint: "https://bedrock-runtime.eu-west-1.amazonaws.com" }), creds);
    expect(await client.config.region()).toBe("eu-west-1");
    expect(await client.config.credentials()).toMatchObject(creds);
    const ep = await client.config.endpoint!();
    expect(ep.hostname).toBe("bedrock-runtime.eu-west-1.amazonaws.com");
  });

  it("ignores saved keys when told to use the server's role", async () => {
    const client = createBedrockRuntime(parseBedrockConfig({ region: "eu-west-1", credentialMode: "role" }), creds);
    // The default chain, not the saved keys.
    const resolved = await client.config.credentials().catch(() => null);
    expect(resolved?.accessKeyId).not.toBe(creds.accessKeyId);
    expect(await client.config.region()).toBe("eu-west-1");
  });
});
