/**
 * The one place the platform's own code reaches OpenAI from, and the rule for AWS-only deployments.
 *
 * When an administrator switches on "AWS only" (Model Providers, Amazon Bedrock), no request may leave for OpenAI or for
 * Anthropic's own API. Chat requests that asked for an OpenAI model are answered by the Claude model on Bedrock instead, and said so
 * in the result; what has no Bedrock equivalent here (speech-to-text, text-to-speech, image generation, OpenAI's web search) is
 * refused in words rather than sent.
 *
 * Modules never build an OpenAI client of their own (a test enforces it): they ask for `createGuardedOpenAi()`, which builds the
 * real client on first use, so a server with no OpenAI key at all still starts. server/llm-provider.ts and server/claude.ts hold
 * the only other SDK clients, and apply the same rule inside themselves.
 */
import OpenAI from "openai";
import { loadBedrockConfig } from "./bedrock-config";
import { resolveProviderKey } from "./llm-provider-keys";

export { toFile } from "openai";

/** Refused because the deployment is AWS only. A plain message for the person who asked, and a status routes can pass on. */
export class AwsOnlyBlockedError extends Error {
  readonly status = 409;
  readonly code = "aws_only";
  constructor(what: string) {
    super(`${what} is not available while AWS-only mode is on: it would send data to OpenAI or Anthropic, outside your AWS account. An administrator can change this under Model Providers, Amazon Bedrock.`);
    this.name = "AwsOnlyBlockedError";
  }
}

/** Whether nothing may leave for OpenAI or Anthropic's own API. */
export async function awsOnlyActive(): Promise<boolean> {
  const { config } = await loadBedrockConfig();
  return config.enabled && config.awsOnly;
}

export async function assertNotAwsOnly(what: string): Promise<void> {
  if (await awsOnlyActive()) throw new AwsOnlyBlockedError(what);
}

// ── the OpenAI client, built on first use ────────────────────────────────────────────────────────────────────────

let real: { key: string; client: OpenAI } | null = null;

async function realClient(): Promise<OpenAI> {
  const resolved = await resolveProviderKey("openai");
  if (!resolved.apiKey) throw new Error("OpenAI is not set up on this server (no API key), so this feature is unavailable.");
  const key = `${resolved.apiKey}::${resolved.baseUrl ?? ""}`;
  if (!real || real.key !== key) real = { key, client: new OpenAI({ apiKey: resolved.apiKey, baseURL: resolved.baseUrl || undefined }) };
  return real.client;
}

/** Whether the AI-assist features can answer: OpenAI has a key, or AWS only is on (Claude on Bedrock answers instead). */
export async function aiAssistAvailable(): Promise<boolean> {
  if (await awsOnlyActive()) return true;
  return !!(await resolveProviderKey("openai")).apiKey;
}

/** A client for one key an administrator is trying out (the "test this key" buttons). Refused when AWS only. */
export async function openAiClientForKey(what: string, apiKey: string, baseURL?: string): Promise<OpenAI> {
  await assertNotAwsOnly(what);
  return new OpenAI({ apiKey, baseURL: baseURL || undefined });
}

/** The OpenAI client for code that needs the real object (embeddings). Refused when AWS only. */
export async function openAiClient(what: string): Promise<OpenAI> {
  await assertNotAwsOnly(what);
  return realClient();
}

const FEATURE_BY_NAMESPACE: Record<string, string> = {
  audio: "Speech-to-text and text-to-speech",
  images: "Image generation",
  responses: "OpenAI's web search",
  embeddings: "Embeddings through OpenAI",
  chat: "Chat through OpenAI",
  files: "File storage at OpenAI",
  beta: "OpenAI's assistants",
};

type ChatParams = {
  model?: string; messages: Array<{ role: string; content: unknown }>; max_tokens?: number; max_completion_tokens?: number;
  temperature?: number; response_format?: { type?: string }; stream?: boolean; [k: string]: unknown;
};

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p: any) => {
      if (typeof p === "string") return p;
      if (p?.type === "text") return String(p.text ?? "");
      throw new AwsOnlyBlockedError("A chat message with an image or file attached for OpenAI");
    }).join("\n");
  }
  return String(content ?? "");
}

/**
 * AWS only: an OpenAI chat request, answered by Claude on Bedrock, and handed back in OpenAI's shape so the caller does not change.
 * Only what the platform's own calls use is carried (system/user/assistant text, a token limit, a temperature, JSON mode).
 */
async function chatOnBedrock(params: ChatParams): Promise<unknown> {
  if (params.stream || params.tools || params.functions) throw new AwsOnlyBlockedError("A streamed or tool-using request made directly to OpenAI");
  const { getProvider } = await import("./llm-provider");
  const result = await getProvider("openai").complete(
    params.messages.map((m) => ({ role: m.role === "developer" ? "system" : (m.role as "system" | "user" | "assistant"), content: textOf(m.content) })),
    {
      model: params.model,
      maxTokens: params.max_tokens ?? params.max_completion_tokens,
      temperature: params.temperature,
      responseFormat: params.response_format?.type === "json_object" ? "json" : undefined,
    },
  );
  return {
    id: "aws-only-chat", object: "chat.completion", created: Math.floor(Date.now() / 1000), model: result.actualModel ?? params.model,
    choices: [{ index: 0, message: { role: "assistant", content: result.content, refusal: null }, finish_reason: "stop", logprobs: null }],
    usage: { prompt_tokens: result.tokensUsed.prompt, completion_tokens: result.tokensUsed.completion, total_tokens: result.tokensUsed.total },
  };
}

/**
 * An object that looks like the OpenAI SDK client (`client.chat.completions.create(...)`, `client.audio.transcriptions.create(...)`)
 * and applies the AWS-only rule on every call. Nothing is built, and no key is needed, until a call is made.
 */
export function createGuardedOpenAi(feature?: string): OpenAI {
  const call = async (path: string[], args: unknown[]) => {
    if (await awsOnlyActive()) {
      if (path.join(".") === "chat.completions.create") return chatOnBedrock(args[0] as ChatParams);
      throw new AwsOnlyBlockedError(feature ?? FEATURE_BY_NAMESPACE[path[0]] ?? "This feature");
    }
    const client = await realClient();
    let owner: any = client;
    for (const part of path.slice(0, -1)) owner = owner[part];
    return owner[path[path.length - 1]](...args);
  };
  const node = (path: string[]): any => new Proxy(function () { /* callable target */ }, {
    get(_t, prop) { return prop === "then" || typeof prop === "symbol" ? undefined : node([...path, prop]); },
    apply(_t, _this, args) { return call(path, args); },
  });
  return new Proxy({}, {
    get(_t, prop) { return prop === "then" || typeof prop === "symbol" ? undefined : node([prop as string]); },
  }) as OpenAI;
}
