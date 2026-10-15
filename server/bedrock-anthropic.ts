/**
 * Claude on Amazon Bedrock, behind the same interface the rest of the platform already uses for the Anthropic API.
 *
 * Everything that talks to Claude (the provider layer, the playground, evaluations, the AI-assist routes) calls
 * `client.messages.create(...)` or `client.messages.stream(...)` on an Anthropic SDK client. When an administrator has switched
 * chat to Bedrock, those calls get this client instead: it sends the same request through Bedrock's InvokeModel (or its
 * streaming twin), hands back the same Message, and raises errors that carry the same `status` the retry and fallback rules read.
 * Nothing above it changes, so tool use, streaming, forced tool choice and the idle watchdog all carry over.
 *
 * Why not Anthropic's own Bedrock package: it needs a much newer Anthropic SDK than this platform runs, and the AWS client is
 * already here (embeddings use it).
 */
import { InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { effectiveRegion, loadBedrockConfig, type BedrockConfig } from "./bedrock-config";
import {
  anthropicRequestBody, BedrockError, BedrockUnsupportedError, explainBedrockError, looksLikeAwsError, runtimeFor,
  type BedrockSender,
} from "./bedrock-client";

// ── when chat goes to Bedrock, and which model answers ───────────────────────────────────────────────────────────

export function chatOnBedrock(config: BedrockConfig): boolean {
  return config.enabled && config.useForChat && !!config.models.chat && !!effectiveRegion(config);
}

/**
 * The Bedrock model for a Claude call. The platform asks for Anthropic model names (claude-sonnet-4-5, claude-haiku-4-5, ...)
 * that mean nothing to Bedrock, so the administrator's choice answers: the "fast" model for the small, quick class of request
 * (any haiku), the "chat" model for the rest. An id that is already a Bedrock id is left alone.
 */
export function pickBedrockModel(config: BedrockConfig, requested: string | undefined): string {
  const asked = (requested ?? "").trim();
  const lower = asked.toLowerCase();
  if (lower.startsWith("arn:") || lower.includes("anthropic.")) return asked;
  const chat = config.models.chat;
  if (!chat) throw new BedrockUnsupportedError("Chat is switched to Amazon Bedrock but no Claude model is chosen for it.");
  if (lower.includes("haiku") && config.models.fast) return config.models.fast.modelId;
  return chat.modelId;
}

/**
 * The finished Message, labelled for the platform. `model` is the name the platform asked for, so its price table and its
 * records keep working; the Bedrock id that really answered is beside it.
 */
function decorate(message: any, requested: string | undefined, bedrockModelId: string): any {
  return { ...message, model: requested || message?.model || bedrockModelId, served_by: "aws_bedrock", bedrock_model_id: bedrockModelId };
}

// ── errors, said the way the retry rules expect ──────────────────────────────────────────────────────────────────

type ApiError = Error & { status?: number; code?: string; cause?: unknown };

const STATUS_BY_PROBLEM: Record<string, number> = {
  throttled: 429, unavailable: 503, unreachable: 503,
  bad_credentials: 401, no_credentials: 401, permission: 403, model_access: 403,
  bad_request: 400, needs_profile: 400, bad_model_id: 400, model_not_found: 404,
};

const STATUS_BY_STREAM_EXCEPTION: Record<string, number> = {
  throttlingException: 429, serviceUnavailableException: 503, modelTimeoutException: 504, internalServerException: 500,
  modelStreamErrorException: 500, validationException: 400, accessDeniedException: 403, resourceNotFoundException: 404,
};

const STATUS_BY_API_ERROR_TYPE: Record<string, number> = {
  overloaded_error: 529, rate_limit_error: 429, api_error: 500, invalid_request_error: 400, authentication_error: 401,
  permission_error: 403, not_found_error: 404,
};

/** An AWS or Bedrock failure as an Error whose message an administrator can act on and whose `status` drives retries. */
export function toApiError(err: unknown, ctx: { modelId: string; region: string }): Error {
  if (err instanceof BedrockUnsupportedError || err instanceof BedrockError) return err;
  const e = err as ApiError | undefined;
  // A caller that stopped waiting (or the idle watchdog) is not a Bedrock failure: pass it through untouched.
  if (e?.name === "AbortError") return e;
  if (!looksLikeAwsError(err)) return err instanceof Error ? err : new Error(String(err));
  const problem = explainBedrockError(err, ctx);
  const fromAws = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  const out: ApiError = new Error(`Amazon Bedrock: ${problem.message} ${problem.hint}`);
  out.name = "BedrockCallError";
  out.status = STATUS_BY_PROBLEM[problem.code] ?? fromAws ?? 500;
  out.cause = err;
  return out;
}

// ── the stream ───────────────────────────────────────────────────────────────────────────────────────────────────

interface Block { type: string; [key: string]: any }

/** Builds the final Message out of the stream's events, the way the Anthropic SDK does. */
export class MessageAccumulator {
  message: any = null;
  private json = new Map<number, string>();

  add(event: any): void {
    switch (event?.type) {
      case "message_start":
        this.message = { ...event.message, content: [] };
        break;
      case "content_block_start":
        if (this.message) this.message.content[event.index] = { ...event.content_block };
        break;
      case "content_block_delta": {
        const block: Block | undefined = this.message?.content[event.index];
        const d = event.delta;
        if (!block || !d) break;
        if (d.type === "text_delta") block.text = (block.text ?? "") + d.text;
        else if (d.type === "input_json_delta") this.json.set(event.index, (this.json.get(event.index) ?? "") + d.partial_json);
        else if (d.type === "thinking_delta") block.thinking = (block.thinking ?? "") + d.thinking;
        else if (d.type === "signature_delta") block.signature = d.signature;
        break;
      }
      case "content_block_stop": {
        const block: Block | undefined = this.message?.content[event.index];
        const raw = this.json.get(event.index);
        if (block && (block.type === "tool_use" || block.type === "server_tool_use")) {
          try { block.input = raw ? JSON.parse(raw) : (block.input ?? {}); }
          catch { throw Object.assign(new Error("Claude's answer was cut off in the middle of a tool call"), { status: 502 }); }
        }
        break;
      }
      case "message_delta":
        if (this.message) {
          if (event.delta) Object.assign(this.message, event.delta);
          if (event.usage) this.message.usage = { ...this.message.usage, ...event.usage };
        }
        break;
      default:
        break;
    }
  }

  final(): any {
    if (!this.message) throw Object.assign(new Error("Amazon Bedrock ended the answer before it began"), { status: 502 });
    return this.message;
  }
}

type Listener = (...args: any[]) => void;

/** What `client.messages.stream(...)` returns: events to iterate or listen to, an abort, and the finished Message. */
export class BedrockMessageStream {
  private listeners = new Map<string, Listener[]>();
  private events: any[] = [];
  private wake: Array<() => void> = [];
  private ended = false;
  private failure: unknown;
  private readonly acc = new MessageAccumulator();
  private readonly ac = new AbortController();
  private readonly settled: Promise<any>;
  private resolveFinal!: (m: any) => void;
  private rejectFinal!: (e: unknown) => void;

  constructor(
    private readonly sender: BedrockSender,
    private readonly modelId: string,
    private readonly body: Record<string, unknown>,
    private readonly ctx: { modelId: string; region: string },
    private readonly requestedModel: string | undefined,
    callerSignal?: AbortSignal,
  ) {
    this.settled = new Promise((res, rej) => { this.resolveFinal = res; this.rejectFinal = rej; });
    this.settled.catch(() => { /* surfaced through finalMessage() or the iterator; never as an unhandled rejection */ });
    if (callerSignal) {
      if (callerSignal.aborted) this.ac.abort();
      else callerSignal.addEventListener("abort", () => this.ac.abort(), { once: true });
    }
    // Start on the next turn of the event loop so the caller can attach listeners to the stream it was just handed.
    setTimeout(() => { void this.pump(); }, 0);
  }

  on(event: string, listener: Listener): this {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }

  private emit(event: string, ...args: any[]): void {
    for (const l of this.listeners.get(event) ?? []) {
      try { l(...args); } catch { /* a listener's failure is the listener's */ }
    }
  }

  abort(): void { this.ac.abort(); }

  finalMessage(): Promise<any> { return this.settled; }

  private wakeAll(): void { const w = this.wake; this.wake = []; for (const f of w) f(); }

  private fail(err: unknown): void {
    if (this.ended) return;
    this.failure = this.ac.signal.aborted && !(err as { status?: number })?.status
      ? Object.assign(new Error("Request aborted"), { name: "AbortError" })
      : err;
    this.ended = true;
    this.rejectFinal(this.failure);
    this.emit("error", this.failure);
    this.wakeAll();
  }

  private async pump(): Promise<void> {
    try {
      this.emit("connect");
      const out = await this.sender.send(
        new InvokeModelWithResponseStreamCommand({ modelId: this.modelId, contentType: "application/json", accept: "application/json", body: JSON.stringify(this.body) }),
        { abortSignal: this.ac.signal },
      );
      for await (const part of out.body as AsyncIterable<any>) {
        if (part?.chunk?.bytes) {
          const event = JSON.parse(new TextDecoder().decode(part.chunk.bytes as Uint8Array));
          if (event?.type === "error") {
            const type = String(event.error?.type ?? "api_error");
            throw Object.assign(new Error(String(event.error?.message ?? type)), { status: STATUS_BY_API_ERROR_TYPE[type] ?? 500, type });
          }
          this.acc.add(event);
          this.events.push(event);
          this.emit("streamEvent", event);
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta") this.emit("text", event.delta.text);
          this.wakeAll();
        } else {
          // An error AWS reports inside the stream arrives as a member named for the exception.
          const key = Object.keys(part ?? {})[0] ?? "internalServerException";
          const name = key.charAt(0).toUpperCase() + key.slice(1);
          throw Object.assign(new Error(String(part?.[key]?.message ?? name)), { name, $metadata: { httpStatusCode: STATUS_BY_STREAM_EXCEPTION[key] ?? 500 } });
        }
      }
      const message = decorate(this.acc.final(), this.requestedModel, this.modelId);
      this.ended = true;
      this.resolveFinal(message);
      this.emit("end");
      this.wakeAll();
    } catch (err) {
      this.fail(toApiError(err, this.ctx));
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<any> {
    let i = 0;
    for (;;) {
      while (i < this.events.length) yield this.events[i++];
      if (this.ended) {
        if (this.failure) throw this.failure;
        return;
      }
      await new Promise<void>((resolve) => this.wake.push(resolve));
    }
  }
}

// ── the client ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * An object shaped like the part of the Anthropic SDK client the platform uses. `sender` is the AWS client in production and a
 * stand-in in tests.
 */
export function createBedrockAnthropicClient(sender: BedrockSender, config: BedrockConfig): any {
  const region = effectiveRegion(config);
  const prepare = (params: Record<string, any>) => {
    const modelId = pickBedrockModel(config, params?.model);
    return { modelId, body: anthropicRequestBody(params), ctx: { modelId, region } };
  };
  const unsupported = (what: string) => async () => {
    throw new BedrockUnsupportedError(`${what} is an Anthropic API feature that Amazon Bedrock does not offer.`);
  };
  return {
    messages: {
      async create(params: Record<string, any>, opts?: { signal?: AbortSignal }) {
        const { modelId, body, ctx } = prepare(params);
        try {
          const out = await sender.send(
            new InvokeModelCommand({ modelId, contentType: "application/json", accept: "application/json", body: JSON.stringify(body) }),
            opts?.signal ? { abortSignal: opts.signal } : undefined,
          );
          const raw = out?.body;
          if (raw == null) throw new Error("Amazon Bedrock returned an empty answer");
          const message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw as Uint8Array));
          return decorate(message, params.model, modelId);
        } catch (err) {
          throw toApiError(err, ctx);
        }
      },
      stream(params: Record<string, any>, opts?: { signal?: AbortSignal }) {
        const { modelId, body, ctx } = prepare(params);
        return new BedrockMessageStream(sender, modelId, body, ctx, params?.model, opts?.signal);
      },
    },
    beta: {
      files: {
        retrieveMetadata: unsupported("File storage for the code-running sandbox"),
        download: unsupported("File storage for the code-running sandbox"),
        upload: unsupported("File storage for the code-running sandbox"),
      },
    },
  };
}

// ── what the rest of the platform asks ───────────────────────────────────────────────────────────────────────────

const CLIENT_TTL_MS = 60_000;
/** Chat answers are silent while a long reply or a large tool call is written: the connection must outlast that. */
const CHAT_SOCKET_TIMEOUT_MS = 10 * 60_000;
let cachedClient: { key: string; at: number; client: any } | null = null;

export function invalidateBedrockChatClient(): void { cachedClient = null; }

/** The Anthropic-shaped client when chat is on Bedrock, otherwise null (the caller uses the Anthropic API as before). */
export async function getBedrockChatClient(): Promise<{ client: any; config: BedrockConfig } | null> {
  const { config } = await loadBedrockConfig();
  if (!chatOnBedrock(config)) return null;
  const key = JSON.stringify(config);
  if (cachedClient && cachedClient.key === key && Date.now() - cachedClient.at < CLIENT_TTL_MS) return { client: cachedClient.client, config };
  const sender = await runtimeFor(config, { timeoutMs: CHAT_SOCKET_TIMEOUT_MS, maxAttempts: 1 });
  const client = createBedrockAnthropicClient(sender, config);
  cachedClient = { key, at: Date.now(), client };
  return { client, config };
}

/** Whether a Claude call that fails on Bedrock may be tried on another vendor. Never, when the administrator said AWS only. */
export async function bedrockChatBlocksFallback(): Promise<boolean> {
  const { config } = await loadBedrockConfig();
  return chatOnBedrock(config) && config.awsOnly;
}
