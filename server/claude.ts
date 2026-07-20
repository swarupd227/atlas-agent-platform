import Anthropic from "@anthropic-ai/sdk";

export const anthropicClient = new Anthropic({
  // Prefer the Replit AI-gateway vars when present (legacy), otherwise fall
  // back to a direct Anthropic API key. baseURL undefined => api.anthropic.com.
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined,
});

// Transient provider failures worth retrying: rate limits (429), Anthropic's
// overloaded_error (529 -- the observed cause of "AI Enhance is still
// non-functional", test finding AUT-012), gateway blips (5xx), and dropped
// connections. One immediate failure otherwise made every AI-Enhance feature
// a coin flip during provider load spikes.
function isTransientAIError(e: any): boolean {
  const status = e?.status ?? e?.response?.status;
  if (status === 429 || status === 529 || (status >= 500 && status <= 504)) return true;
  const code = e?.error?.type || e?.code;
  if (code === "overloaded_error" || code === "rate_limit_error") return true;
  if (e?.constructor?.name === "APIConnectionError" || e?.constructor?.name === "APIConnectionTimeoutError") return true;
  if (e?.message === "fetch failed") return true;
  return false;
}

export async function callClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  jsonMode?: boolean;
  model?: string;
}): Promise<string> {
  const systemPrompt = opts.jsonMode
    ? `${opts.system}\n\nReturn ONLY valid JSON with no markdown fences or prose.`
    : opts.system;
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await anthropicClient.messages.create({
        model: opts.model ?? "claude-opus-4-5",
        system: systemPrompt,
        messages: [{ role: "user", content: opts.user }],
        max_tokens: opts.maxTokens ?? 4096,
      });
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      return textBlock?.text ?? "";
    } catch (e) {
      lastErr = e;
      if (attempt === MAX_ATTEMPTS - 1 || !isTransientAIError(e)) throw e;
      const delayMs = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
      console.warn(`[callClaude] transient AI error (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying in ${delayMs}ms:`, (e as any)?.status ?? (e as any)?.message);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export function stripJsonFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const openFence = raw.match(/```(?:json)?\s*([\s\S]*)/);
  if (openFence) return openFence[1].trim();
  return raw.trim();
}

// Thrown by parseAIJsonResponse so callers can catch it specifically and
// return `error.message` (already user-safe) instead of a raw parser
// exception like "Unterminated string in JSON at position 4096".
export class AIResponseParseError extends Error {
  constructor(message: string, public readonly likelyTruncated: boolean) {
    super(message);
    this.name = "AIResponseParseError";
  }
}

// Several AI-enhance endpoints call JSON.parse directly on a model response
// with no fallback, so a response that gets cut off mid-string (a real,
// observed failure mode -- a fixed max-token budget can truncate large
// generated content, e.g. a full policy/Rego rewrite) throws a raw
// SyntaxError straight through to the user as "Unterminated string in
// JSON...". Strip fences, then on parse failure try closing any open
// braces/brackets before giving up -- same recovery strategy already used
// in improvements.ts's propose-agents endpoint, extracted here for reuse.
export function parseAIJsonResponse(raw: string, opts?: { wasTruncatedByTokenLimit?: boolean }): any {
  const stripped = stripJsonFences(raw);
  try {
    return JSON.parse(stripped);
  } catch {
    const braceStart = stripped.indexOf("{");
    if (braceStart >= 0) {
      let truncated = stripped.slice(braceStart);
      let openBraces = 0, openBrackets = 0;
      for (const ch of truncated) {
        if (ch === "{") openBraces++;
        if (ch === "}") openBraces--;
        if (ch === "[") openBrackets++;
        if (ch === "]") openBrackets--;
      }
      while (openBrackets > 0) { truncated += "]"; openBrackets--; }
      while (openBraces > 0) { truncated += "}"; openBraces--; }
      truncated = truncated.replace(/,\s*([}\]])/g, "$1");
      try {
        return JSON.parse(truncated);
      } catch {}
    }
    throw new AIResponseParseError(
      opts?.wasTruncatedByTokenLimit
        ? "The AI response was too large and got cut off. Try again, or shorten the input."
        : "The AI response couldn't be parsed. Please try again.",
      !!opts?.wasTruncatedByTokenLimit,
    );
  }
}

// Many "AI Enhance"-style routes catch(e) and do res.json({error: e.message})
// verbatim, so a transient provider failure (observed: Anthropic's own
// `529 overloaded_error`) reaches the user as raw backend/SDK error text
// instead of something they can act on. Translate the handful of known
// transient-failure shapes; anything unrecognized still gets a generic
// fallback rather than leaking the original message.
export function friendlyAIErrorMessage(e: any): string {
  const status = e?.status ?? e?.response?.status;
  const code = e?.error?.type || e?.code;
  if (status === 529 || code === "overloaded_error") {
    return "The AI service is temporarily overloaded. Please try again in a moment.";
  }
  if (status === 429 || code === "rate_limit_error") {
    return "The AI service is rate-limited right now. Please try again shortly.";
  }
  if (status === 503 || status === 502) {
    return "The AI service is temporarily unavailable. Please try again.";
  }
  if (e?.name === "AbortError" || code === "timeout") {
    return "The AI request timed out. Please try again.";
  }
  return "AI enhancement failed. Please try again.";
}
