/**
 * Prompt caching for Claude on the Anthropic API.
 *
 * An agent's request starts with the same long prefix every time: its tool definitions, then its
 * system prompt, then (inside a tool loop) the conversation so far. Anthropic can keep that prefix
 * for five minutes and charge a tenth of the input price to read it back, at the price of 25% more
 * to write it the first time. This module is the three pieces that make using it safe:
 *
 *  - where the breakpoints go (`applyPromptCaching`, a pure transform that never edits its input);
 *  - what a call really costs once some of its input came from the cache (`readAnthropicUsage`):
 *    Anthropic reports cached tokens in fields of their own and `input_tokens` excludes them, so a
 *    caller that only reads `input_tokens` would under-report cost the moment caching is on, and a
 *    per-run budget would trust the wrong number;
 *  - whether to use it at all (`promptCachingActive`): the ANTHROPIC_PROMPT_CACHING platform
 *    setting, and never when Claude is answered by Amazon Bedrock, whose acceptance of these
 *    fields is not something this platform has verified.
 *
 * Nothing here runs unless the setting is "on", and with it off a request and its accounting are
 * exactly what they were before.
 */
import { storage } from "./storage";

export const PROMPT_CACHING_SETTING = "ANTHROPIC_PROMPT_CACHING";

/** Reading cached input costs a tenth of the input price. */
export const CACHE_READ_MULTIPLIER = 0.1;
/** Writing the five-minute cache costs 25% over the input price. The one-hour cache (double) is not used. */
export const CACHE_WRITE_MULTIPLIER = 1.25;
/** Anthropic allows four breakpoints in a request; this module never uses more than three. */
export const MAX_CACHE_BREAKPOINTS = 4;

const EPHEMERAL = { type: "ephemeral" } as const;
type Block = Record<string, any>;

export interface CacheableMessage { role: string; content: string | Block[] }
export interface CacheableRequest {
  system?: string;
  tools?: Array<Record<string, any>>;
  messages: CacheableMessage[];
}
export interface CachedRequest {
  system?: Block[];
  tools?: Array<Record<string, any>>;
  messages: CacheableMessage[];
  /** How many breakpoints were placed. */
  breakpoints: number;
}

/** Block types that can carry a breakpoint. Thinking blocks and server-tool results cannot, and an empty text block is refused by the API. */
const CACHEABLE_BLOCKS = new Set(["text", "image", "document", "tool_use", "tool_result"]);

/** A custom tool has no `type` (or "custom"); a server tool (web search, code execution) names its type. */
const isCustomTool = (t: Record<string, any>) => t.type === undefined || t.type === "custom";

/**
 * The request with breakpoints placed. Three, at most:
 *
 *  1. the last custom tool: the tool list is the first thing in the prefix and the most stable;
 *  2. the system prompt;
 *  3. the end of the conversation, but only once it holds an earlier assistant turn. A first call
 *     has nothing to reuse yet, and a write costs 25% over a plain read of the same tokens, so
 *     caching its tail would be paying a premium for nothing. From the second turn of a tool loop
 *     on, the next call's prefix is exactly this one, so the breakpoint moves forward with it.
 *
 * A prefix shorter than the model's minimum (1,024 tokens for Sonnet and Opus, more for Haiku) is
 * accepted and simply not cached.
 */
export function applyPromptCaching(req: CacheableRequest): CachedRequest {
  let breakpoints = 0;

  let tools = req.tools;
  if (tools && tools.length > 0) {
    let at = -1;
    for (let i = tools.length - 1; i >= 0; i--) if (isCustomTool(tools[i])) { at = i; break; }
    if (at >= 0) {
      tools = tools.map((t, i) => (i === at ? { ...t, cache_control: EPHEMERAL } : t));
      breakpoints++;
    }
  }

  let system: Block[] | undefined;
  if (req.system && req.system.trim()) {
    system = [{ type: "text", text: req.system, cache_control: EPHEMERAL }];
    breakpoints++;
  }

  let messages = req.messages;
  if (messages.length > 0 && messages.some((m) => m.role === "assistant")) {
    const last = messages[messages.length - 1];
    const blocks: Block[] | null = typeof last.content === "string"
      ? (last.content.trim() ? [{ type: "text", text: last.content }] : null)
      : last.content.map((b) => ({ ...b }));
    const tail = blocks && blocks.length > 0 ? blocks[blocks.length - 1] : undefined;
    if (blocks && tail && CACHEABLE_BLOCKS.has(tail.type) && !(tail.type === "text" && !String(tail.text ?? "").trim())) {
      blocks[blocks.length - 1] = { ...tail, cache_control: EPHEMERAL };
      messages = [...messages.slice(0, -1), { ...last, content: blocks }];
      breakpoints++;
    }
  }

  return { ...(system ? { system } : {}), ...(tools ? { tools } : {}), messages, breakpoints };
}

// ── what a call used and what it cost ───────────────────────────────────────────────────────────────────────────

export interface AnthropicUsageParts {
  /** Everything the model read: uncached input, tokens read from the cache and tokens written to it. */
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** The input as billed, in plain-input-token equivalents: uncached + 0.1 x read + 1.25 x written. Price this with the model's input rate. */
  billedPromptTokens: number;
}

const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/** The usage block of an Anthropic response (or a final streamed message). Without cache fields it equals the plain reading. */
export function readAnthropicUsage(usage: unknown): AnthropicUsageParts {
  const u = (usage ?? {}) as Record<string, unknown>;
  const input = count(u.input_tokens);
  const read = count(u.cache_read_input_tokens);
  const written = count(u.cache_creation_input_tokens);
  return {
    promptTokens: input + read + written,
    completionTokens: count(u.output_tokens),
    cacheReadTokens: read,
    cacheCreationTokens: written,
    billedPromptTokens: input + read * CACHE_READ_MULTIPLIER + written * CACHE_WRITE_MULTIPLIER,
  };
}

/** The cache fields to add to a completion result, only when the call touched the cache. */
export function cacheResultFields(read: number, written: number): { cacheReadTokens?: number; cacheCreationTokens?: number } {
  return read > 0 || written > 0 ? { cacheReadTokens: read, cacheCreationTokens: written } : {};
}

// ── whether to use it ───────────────────────────────────────────────────────────────────────────────────────────

const SETTING_TTL_MS = 30_000;
let settingCache: { on: boolean; at: number } | null = null;

/** The platform setting, held for thirty seconds so a call does not read the database. Unreadable means off. */
export async function promptCachingSettingOn(now: number = Date.now()): Promise<boolean> {
  if (settingCache && now - settingCache.at < SETTING_TTL_MS) return settingCache.on;
  let on = false;
  try {
    const row = await storage.getPlatformSetting(PROMPT_CACHING_SETTING);
    on = String(row?.value ?? "").trim().toLowerCase() === "on";
  } catch { on = false; }
  settingCache = { on, at: now };
  return on;
}

export function resetPromptCachingSettingCache(): void { settingCache = null; }

/**
 * Use caching for this call? The setting must be on, and Claude must be answered by the Anthropic API:
 * when chat is switched to Amazon Bedrock the same request is sent on to Bedrock, and these fields are
 * left out rather than assumed.
 */
export async function promptCachingActive(onBedrock: () => Promise<boolean> = defaultOnBedrock): Promise<boolean> {
  if (!(await promptCachingSettingOn())) return false;
  try { return !(await onBedrock()); } catch { return false; }
}

async function defaultOnBedrock(): Promise<boolean> {
  const { getBedrockChatClient } = await import("./bedrock-anthropic");
  return !!(await getBedrockChatClient());
}

// ── counters, for an administrator ─────────────────────────────────────────────────────────────────────────────

const counters = { since: new Date().toISOString(), calls: 0, callsThatReadCache: 0, callsThatWroteCache: 0, uncachedInputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

/** Count one model call. In memory, per process: a restart or a second instance starts its own. */
export function recordCacheUsage(u: AnthropicUsageParts): void {
  counters.calls++;
  if (u.cacheReadTokens > 0) counters.callsThatReadCache++;
  if (u.cacheCreationTokens > 0) counters.callsThatWroteCache++;
  counters.uncachedInputTokens += u.promptTokens - u.cacheReadTokens - u.cacheCreationTokens;
  counters.cacheReadTokens += u.cacheReadTokens;
  counters.cacheCreationTokens += u.cacheCreationTokens;
}

export function cacheStats() {
  const input = counters.uncachedInputTokens + counters.cacheReadTokens + counters.cacheCreationTokens;
  return {
    ...counters,
    /** Share of all input tokens that came from the cache. */
    hitRatio: input > 0 ? counters.cacheReadTokens / input : 0,
    note: "In memory for this process only; a restart or another instance counts separately.",
  };
}

export function resetCacheStats(): void {
  counters.since = new Date().toISOString();
  counters.calls = counters.callsThatReadCache = counters.callsThatWroteCache = 0;
  counters.uncachedInputTokens = counters.cacheReadTokens = counters.cacheCreationTokens = 0;
}
