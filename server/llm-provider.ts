import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: CanonicalToolCall[];
}

export interface CanonicalToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface CanonicalToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface LLMCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
  tools?: CanonicalToolDefinition[];
}

export interface LLMCompletionResult {
  content: string;
  toolCalls: CanonicalToolCall[];
  tokensUsed: { prompt: number; completion: number; total: number };
  costUsd: number;
  rawAssistantMessage?: any;
}

export interface LLMEmbeddingResult {
  embeddings: number[][];
  tokensUsed: number;
  costUsd: number;
}

export interface LLMProviderInfo {
  name: string;
  displayName: string;
  configured: boolean;
  models: Array<{
    id: string;
    name: string;
    contextWindow: number;
    costPer1kInput: number;
    costPer1kOutput: number;
    supportsToolCalling: boolean;
    supportsJson: boolean;
    supportsEmbeddings?: boolean;
  }>;
  embeddingModels?: Array<{
    id: string;
    name: string;
    dimensions: number;
    costPer1kTokens: number;
  }>;
}

const OPENAI_MODELS: LLMProviderInfo["models"] = [
  { id: "gpt-4.1", name: "GPT-4.1", contextWindow: 1047576, costPer1kInput: 0.002, costPer1kOutput: 0.008, supportsToolCalling: true, supportsJson: true },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", contextWindow: 1047576, costPer1kInput: 0.0004, costPer1kOutput: 0.0016, supportsToolCalling: true, supportsJson: true },
  { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", contextWindow: 1047576, costPer1kInput: 0.0001, costPer1kOutput: 0.0004, supportsToolCalling: true, supportsJson: true },
  { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, costPer1kInput: 0.0025, costPer1kOutput: 0.01, supportsToolCalling: true, supportsJson: true },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000, costPer1kInput: 0.00015, costPer1kOutput: 0.0006, supportsToolCalling: true, supportsJson: true },
  { id: "o3-mini", name: "o3-mini", contextWindow: 200000, costPer1kInput: 0.0011, costPer1kOutput: 0.0044, supportsToolCalling: true, supportsJson: true },
];

const OPENAI_EMBEDDING_MODELS: LLMProviderInfo["embeddingModels"] = [
  { id: "text-embedding-3-small", name: "Embedding 3 Small", dimensions: 1536, costPer1kTokens: 0.00002 },
  { id: "text-embedding-3-large", name: "Embedding 3 Large", dimensions: 3072, costPer1kTokens: 0.00013 },
];

const ANTHROPIC_MODELS: LLMProviderInfo["models"] = [
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4", contextWindow: 200000, costPer1kInput: 0.003, costPer1kOutput: 0.015, supportsToolCalling: true, supportsJson: true },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", contextWindow: 200000, costPer1kInput: 0.003, costPer1kOutput: 0.015, supportsToolCalling: true, supportsJson: true },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", contextWindow: 200000, costPer1kInput: 0.0008, costPer1kOutput: 0.004, supportsToolCalling: true, supportsJson: true },
  { id: "claude-3-opus-20240229", name: "Claude 3 Opus", contextWindow: 200000, costPer1kInput: 0.015, costPer1kOutput: 0.075, supportsToolCalling: true, supportsJson: true },
];

const GOOGLE_MODELS: LLMProviderInfo["models"] = [
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", contextWindow: 1048576, costPer1kInput: 0.00125, costPer1kOutput: 0.01, supportsToolCalling: true, supportsJson: true },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", contextWindow: 1048576, costPer1kInput: 0.00015, costPer1kOutput: 0.0006, supportsToolCalling: true, supportsJson: true },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextWindow: 1048576, costPer1kInput: 0.0001, costPer1kOutput: 0.0004, supportsToolCalling: true, supportsJson: true },
];

function estimateCost(
  promptTokens: number,
  completionTokens: number,
  models: LLMProviderInfo["models"],
  modelId: string
): number {
  const model = models.find((m) => m.id === modelId);
  if (!model) return 0;
  return (promptTokens / 1000) * model.costPer1kInput + (completionTokens / 1000) * model.costPer1kOutput;
}

// ---------------------------------------------------------------------------
// Retry + exponential backoff
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED"]);

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as Error & { status?: number; code?: string; constructor: { name: string } };
  if (e.status !== undefined && RETRYABLE_STATUS_CODES.has(e.status)) return true;
  if (e.code !== undefined && RETRYABLE_ERROR_CODES.has(e.code)) return true;
  if (e.constructor.name === "RateLimitError") return true;
  if (e.constructor.name === "APIConnectionError") return true;
  if (e.constructor.name === "APIConnectionTimeoutError") return true;
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, providerName: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_RETRIES || !isRetryable(err)) {
        throw err;
      }
      const baseDelay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      const jitter = Math.random() * baseDelay;
      const delayMs = Math.floor(jitter);
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[llm-provider] ${providerName} transient error (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delayMs}ms: ${msg}`);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

const CB_FAILURE_THRESHOLD = 5;
const CB_WINDOW_MS = 60_000;
const CB_OPEN_DURATION_MS = 30_000;

interface CircuitState {
  failures: number[];
  openUntil: number;
  halfOpen: boolean;
}

const circuitStates: Record<string, CircuitState> = {};

function getCircuit(providerName: string): CircuitState {
  if (!circuitStates[providerName]) {
    circuitStates[providerName] = { failures: [], openUntil: 0, halfOpen: false };
  }
  return circuitStates[providerName];
}

function cbCheck(providerName: string): void {
  const now = Date.now();
  const circuit = getCircuit(providerName);
  if (circuit.openUntil > 0) {
    if (now >= circuit.openUntil) {
      circuit.halfOpen = true;
      circuit.openUntil = 0;
      console.info(`[llm-provider] Circuit HALF-OPEN for "${providerName}", allowing probe request`);
    } else {
      throw new Error(
        `[llm-provider] Circuit breaker OPEN for provider "${providerName}". ` +
        `Too many failures. Will retry after ${new Date(circuit.openUntil).toISOString()}.`
      );
    }
  }
}

function cbRecordSuccess(providerName: string): void {
  const circuit = getCircuit(providerName);
  if (circuit.halfOpen || circuit.failures.length > 0) {
    console.info(`[llm-provider] Circuit CLOSED for "${providerName}" after successful probe`);
  }
  circuit.failures = [];
  circuit.openUntil = 0;
  circuit.halfOpen = false;
}

function cbRecordFailure(providerName: string): void {
  const now = Date.now();
  const circuit = getCircuit(providerName);
  circuit.failures = circuit.failures.filter((t) => now - t < CB_WINDOW_MS);
  circuit.failures.push(now);
  if (circuit.halfOpen || circuit.failures.length >= CB_FAILURE_THRESHOLD) {
    circuit.openUntil = now + CB_OPEN_DURATION_MS;
    circuit.halfOpen = false;
    console.warn(
      `[llm-provider] Circuit OPENED for "${providerName}" (${circuit.failures.length} failures in ${CB_WINDOW_MS / 1000}s window). ` +
      `Blocking calls until ${new Date(circuit.openUntil).toISOString()}.`
    );
  }
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface LLMProvider {
  readonly providerName: string;
  complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMCompletionResult>;
  embed?(texts: string[], model?: string): Promise<LLMEmbeddingResult>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
  getInfo(): LLMProviderInfo;
}

// ---------------------------------------------------------------------------
// OpenAI provider
// ---------------------------------------------------------------------------

class OpenAIProvider implements LLMProvider {
  readonly providerName = "openai";
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
    });
  }

  async complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const model = options?.model || "gpt-4.1";

    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = messages.map((m) => {
      if (m.role === "tool") {
        return { role: "tool" as const, content: m.content, tool_call_id: m.tool_call_id || "" };
      }
      if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
        return {
          role: "assistant" as const,
          content: m.content || null,
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
      }
      return { role: m.role as "system" | "user" | "assistant", content: m.content };
    });

    const openaiTools: OpenAI.ChatCompletionTool[] | undefined =
      options?.tools && options.tools.length > 0
        ? options.tools.map((t) => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description,
              parameters:
                t.parameters && Object.keys(t.parameters).length > 0
                  ? t.parameters
                  : { type: "object", properties: {}, additionalProperties: true },
            },
          }))
        : undefined;

    cbCheck(this.providerName);

    let response: OpenAI.ChatCompletion;
    try {
      response = await withRetry(
        () =>
          this.client.chat.completions.create({
            model,
            messages: openaiMessages,
            tools: openaiTools,
            max_completion_tokens: options?.maxTokens || 4096,
            ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(options?.responseFormat === "json" ? { response_format: { type: "json_object" as const } } : {}),
          }),
        this.providerName,
      );
      cbRecordSuccess(this.providerName);
    } catch (err) {
      cbRecordFailure(this.providerName);
      throw err;
    }

    const choice = response.choices[0];
    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;
    const totalTokens = response.usage?.total_tokens || 0;

    const toolCalls: CanonicalToolCall[] = (choice?.message?.tool_calls || [])
      .filter((tc: any) => tc.type === "function")
      .map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: (() => {
          try {
            return JSON.parse(tc.function.arguments || "{}");
          } catch {
            return {};
          }
        })(),
      }));

    return {
      content: choice?.message?.content || "",
      toolCalls,
      tokensUsed: { prompt: promptTokens, completion: completionTokens, total: totalTokens },
      costUsd: estimateCost(promptTokens, completionTokens, OPENAI_MODELS, model),
      rawAssistantMessage: choice?.message,
    };
  }

  async embed(texts: string[], model?: string): Promise<LLMEmbeddingResult> {
    const embeddingModel = model || "text-embedding-3-small";
    const batchSize = 100;
    const allEmbeddings: number[][] = [];
    let totalTokens = 0;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.client.embeddings.create({
        model: embeddingModel,
        input: batch,
      });
      allEmbeddings.push(...response.data.map((d) => d.embedding));
      totalTokens += response.usage?.total_tokens || 0;
    }

    const embModel = OPENAI_EMBEDDING_MODELS?.find((m) => m.id === embeddingModel);
    const costUsd = embModel ? (totalTokens / 1000) * embModel.costPer1kTokens : 0;

    return { embeddings: allEmbeddings, tokensUsed: totalTokens, costUsd };
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "ping" }],
        max_completion_tokens: 5,
      });
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message };
    }
  }

  getInfo(): LLMProviderInfo {
    return {
      name: "openai",
      displayName: "OpenAI",
      configured: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
      models: OPENAI_MODELS,
      embeddingModels: OPENAI_EMBEDDING_MODELS,
    };
  }
}

// ---------------------------------------------------------------------------
// Anthropic provider
// ---------------------------------------------------------------------------

class AnthropicProvider implements LLMProvider {
  readonly providerName = "anthropic";
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || "not-configured",
    });
  }

  async complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const model = options?.model || "claude-sonnet-4-5";

    let systemPrompt = "";
    const anthropicMessages: Anthropic.MessageParam[] = [];

    for (const m of messages) {
      if (m.role === "system") {
        systemPrompt += (systemPrompt ? "\n\n" : "") + m.content;
        continue;
      }

      if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
        const contentBlocks: Anthropic.ContentBlockParam[] = [];
        if (m.content) {
          contentBlocks.push({ type: "text", text: m.content });
        }
        for (const tc of m.tool_calls) {
          contentBlocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
        anthropicMessages.push({ role: "assistant", content: contentBlocks });
        continue;
      }

      if (m.role === "tool") {
        anthropicMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.tool_call_id || "",
              content: m.content,
            },
          ],
        });
        continue;
      }

      anthropicMessages.push({ role: m.role as "user" | "assistant", content: m.content });
    }

    if (anthropicMessages.length === 0) {
      anthropicMessages.push({ role: "user", content: "Hello" });
    }

    const anthropicTools: Anthropic.Tool[] | undefined =
      options?.tools && options.tools.length > 0
        ? options.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: {
              type: "object" as const,
              ...(t.parameters && typeof t.parameters === "object" ? t.parameters : {}),
            },
          }))
        : undefined;

    if (options?.responseFormat === "json" && systemPrompt) {
      systemPrompt += "\n\nIMPORTANT: You must respond with valid JSON only. Do not include any text outside the JSON object.";
    }

    cbCheck(this.providerName);

    let response: Anthropic.Message;
    try {
      response = await withRetry(
        () =>
          this.client.messages.create({
            model,
            max_tokens: options?.maxTokens || 4096,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: anthropicMessages,
            ...(anthropicTools ? { tools: anthropicTools } : {}),
            ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
          }),
        this.providerName,
      );
      cbRecordSuccess(this.providerName);
    } catch (err) {
      cbRecordFailure(this.providerName);
      throw err;
    }

    let textContent = "";
    const toolCalls: CanonicalToolCall[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textContent += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: (block.input as Record<string, any>) || {},
        });
      }
    }

    const promptTokens = response.usage?.input_tokens || 0;
    const completionTokens = response.usage?.output_tokens || 0;

    return {
      content: textContent,
      toolCalls,
      tokensUsed: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
      costUsd: estimateCost(promptTokens, completionTokens, ANTHROPIC_MODELS, model),
      rawAssistantMessage: {
        content: textContent,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      },
    };
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.client.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 5,
        messages: [{ role: "user", content: "ping" }],
      });
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message };
    }
  }

  getInfo(): LLMProviderInfo {
    return {
      name: "anthropic",
      displayName: "Anthropic",
      configured: !!process.env.ANTHROPIC_API_KEY,
      models: ANTHROPIC_MODELS,
    };
  }
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

const providerInstances: Record<string, LLMProvider> = {};

export function getProvider(providerName: string): LLMProvider {
  const resolvedName = providerName || "openai";
  if (!providerInstances[resolvedName]) {
    switch (resolvedName) {
      case "openai":
        providerInstances[resolvedName] = new OpenAIProvider();
        break;
      case "anthropic":
        providerInstances[resolvedName] = new AnthropicProvider();
        break;
      case "google":
      case "azure_openai":
      case "self_hosted":
        console.warn(`[llm-provider] Provider "${resolvedName}" is not yet implemented, falling back to OpenAI`);
        if (!providerInstances["openai"]) {
          providerInstances["openai"] = new OpenAIProvider();
        }
        return providerInstances["openai"];
      default:
        console.warn(`[llm-provider] Unknown provider "${resolvedName}", falling back to OpenAI`);
        if (!providerInstances["openai"]) {
          providerInstances["openai"] = new OpenAIProvider();
        }
        return providerInstances["openai"];
    }
  }
  return providerInstances[resolvedName];
}

export function getDefaultProvider(): LLMProvider {
  const defaultName = process.env.DEFAULT_LLM_PROVIDER || "openai";
  return getProvider(defaultName);
}

/**
 * Attempt to complete a request using providers in order.
 * If the first provider fails (circuit open, all retries exhausted), the next
 * provider in the list is tried. Logs each cascade step.
 *
 * @param messages   Chat messages
 * @param options    Completion options (model, temperature, etc.)
 * @param providers  Ordered list of providers to try. Defaults to the
 *                   configured default provider followed by the other available
 *                   provider (OpenAI ↔ Anthropic).
 */
export async function completeWithFallback(
  messages: LLMMessage[],
  options?: LLMCompletionOptions,
  providers?: LLMProvider[],
): Promise<LLMCompletionResult> {
  let providerList: LLMProvider[];
  if (providers && providers.length > 0) {
    providerList = providers;
  } else {
    const primary = getDefaultProvider();
    const fallbackName = primary.providerName === "openai" ? "anthropic" : "openai";
    providerList = [primary, getProvider(fallbackName)];
  }

  const errors: string[] = [];
  for (let i = 0; i < providerList.length; i++) {
    const provider = providerList[i];
    // For fallback providers (not the primary), strip the model so each provider
    // uses its own default rather than a model ID that belongs to a different provider.
    const effectiveOptions: LLMCompletionOptions | undefined =
      i === 0 ? options : (options ? { ...options, model: undefined } : undefined);
    try {
      const result = await provider.complete(messages, effectiveOptions);
      return result;
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider.providerName}: ${msg}`);
      console.warn(
        `[llm-provider] completeWithFallback: provider "${provider.providerName}" failed` +
          (i < providerList.length - 1 ? ", cascading to next provider" : "") +
          `. Error: ${msg}`
      );
    }
  }

  throw new Error(`[llm-provider] All providers failed. Errors: ${errors.join(" | ")}`);
}

export function getAvailableProviders(): LLMProviderInfo[] {
  const providers: LLMProviderInfo[] = [
    getProvider("openai").getInfo(),
    getProvider("anthropic").getInfo(),
    {
      name: "google",
      displayName: "Google AI (Gemini)",
      configured: !!process.env.GOOGLE_AI_API_KEY,
      models: GOOGLE_MODELS,
    },
    {
      name: "azure_openai",
      displayName: "Azure OpenAI",
      configured: !!process.env.AZURE_OPENAI_API_KEY,
      models: [],
    },
    {
      name: "self_hosted",
      displayName: "Self-Hosted (vLLM/Ollama)",
      configured: !!process.env.SELF_HOSTED_LLM_URL,
      models: [],
    },
  ];
  return providers;
}

export function buildCanonicalTools(
  availableTools: Array<{
    serverId: string;
    serverName: string;
    toolName: string;
    toolDescription: string;
    toolInputSchema: Record<string, any>;
  }>
): CanonicalToolDefinition[] {
  return availableTools.map((t, idx) => ({
    name: `mcp_${idx}_${t.toolName.replace(/[^a-zA-Z0-9_]/g, "_")}`,
    description: `[MCP Server: ${t.serverName}] ${t.toolDescription || t.toolName}`,
    parameters:
      t.toolInputSchema && typeof t.toolInputSchema === "object" && Object.keys(t.toolInputSchema).length > 0
        ? t.toolInputSchema
        : { type: "object", properties: {}, additionalProperties: true },
  }));
}
