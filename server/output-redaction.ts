// Applies a policy's `redactPatterns` (regex source strings) to an agent's OUTPUT.
// Tool-call arguments were already redacted by the dispatcher; this closes the
// other half so a policy that says "never emit X" holds for what the agent says.
//
// JSON-safe by construction: it walks parsed output and rewrites string LEAF
// values only -- never keys, never a serialized document -- so downstream
// output contracts and edge rules still parse. Run it AFTER contract enforcement.

export const REDACTION_TOKEN = "[REDACTED]";

// Contract metadata and internal bookkeeping fields are not agent prose.
const SKIP_KEY = /^(_|contract)/;

export interface RedactionResult<T> {
  value: T;
  matches: number;
}

export function compileRedactPatterns(patterns: string[] | undefined | null): RegExp[] {
  const out: RegExp[] = [];
  for (const p of patterns ?? []) {
    try { out.push(new RegExp(p, "gi")); } catch { /* invalid pattern: skip, same as tool-arg redaction */ }
  }
  return out;
}

export function redactText(text: string, res: RegExp[]): RedactionResult<string> {
  let matches = 0;
  let value = text;
  for (const re of res) {
    value = value.replace(re, () => { matches++; return REDACTION_TOKEN; });
  }
  return { value, matches };
}

export function redactStringLeaves<T>(input: T, res: RegExp[]): RedactionResult<T> {
  if (res.length === 0) return { value: input, matches: 0 };
  let matches = 0;
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === "string") {
      if (key && SKIP_KEY.test(key)) return v;
      const r = redactText(v, res);
      matches += r.matches;
      return r.value;
    }
    if (Array.isArray(v)) return v.map(x => walk(x));
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = walk(x, k);
      return o;
    }
    return v;
  };
  return { value: walk(input) as T, matches };
}
