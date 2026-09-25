/**
 * A branch condition an author wrote, as a rule the engine can evaluate itself.
 *
 * A conditional edge with no rule falls back to `evaluationMode: "ai"`, which
 * spends a model call per run deciding where to go -- including for conditions
 * like "amount > 50000", where a comparison is all that was ever meant. The
 * proposer is asked to supply a `branchRule` for those, but it only does so when
 * it recognises the shape, and a human authoring a flow on the canvas has no
 * rule field at all.
 *
 * So: parse the condition. When it is plainly a comparison against a field, the
 * edge becomes deterministic and auditable. When it is genuine judgement
 * ("the customer seems dissatisfied"), this returns null and the model keeps the
 * decision, which is correct.
 *
 * Deliberately conservative. A wrong rule would route real work down the wrong
 * branch silently, which is far worse than paying for a model call, so anything
 * ambiguous is left alone.
 */

import type { RuleGroup, RuleOperator } from "./schema";

/** Word forms authors actually write, mapped to the operators the engine has. */
const PHRASE_OPERATORS: Array<[RegExp, RuleOperator]> = [
  [/\s+(?:is\s+)?(?:greater\s+than\s+or\s+equal\s+to|at\s+least|no\s+less\s+than)\s+/i, ">="],
  [/\s+(?:is\s+)?(?:less\s+than\s+or\s+equal\s+to|at\s+most|no\s+more\s+than)\s+/i, "<="],
  [/\s+(?:is\s+)?(?:greater\s+than|more\s+than|above|over|exceeds)\s+/i, ">"],
  [/\s+(?:is\s+)?(?:less\s+than|fewer\s+than|below|under)\s+/i, "<"],
  [/\s+(?:is\s+)?not\s+equal\s+to\s+/i, "!="],
  [/\s+(?:does\s+not\s+contain|doesn't\s+contain)\s+/i, "not_contains"],
  [/\s+contains\s+/i, "contains"],
  [/\s+(?:is\s+not|isn't|!=)\s+/i, "!="],
  [/\s+(?:is|equals|equal\s+to|==|=)\s+/i, "=="],
];

/** Symbolic forms, longest first so ">=" is never read as ">". */
const SYMBOL_OPERATORS: Array<[string, RuleOperator]> = [
  [">=", ">="], ["<=", "<="], ["!=", "!="], ["==", "=="], [">", ">"], ["<", "<"], ["=", "=="],
];

/** A bare field reference: `amount`, `invoice_total`, `risk.score`, `state.approved`. */
const FIELD = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function normalizeField(raw: string): string | null {
  // Strip the framing authors put around a field name: "the invoice amount is",
  // quotes, and a trailing possessive. What must survive is an identifier.
  let field = raw.trim()
    .replace(/^(?:if|when|where|the)\s+/i, "")
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
  if (FIELD.test(field)) return field;
  // "invoice amount" -> "invoiceAmount": authors write prose, output schemas
  // declare camelCase. Only for two or three plain words, never a sentence.
  const words = field.split(/\s+/);
  if (words.length >= 2 && words.length <= 3 && words.every((w) => /^[A-Za-z][A-Za-z0-9]*$/.test(w))) {
    return words[0].toLowerCase() + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
  }
  return null;
}

function normalizeValue(raw: string): string | number | boolean | null {
  let value = raw.trim().replace(/[.;,]+$/, "").trim();
  if (!value) return null;
  const quoted = /^(["'`])(.*)\1$/.exec(value);
  if (quoted) return quoted[2];
  if (/^(?:true|yes)$/i.test(value)) return true;
  if (/^(?:false|no)$/i.test(value)) return false;
  // Money and thousands separators as written: "$50,000" and "50000" are one number.
  const numeric = value.replace(/^[$£€]/, "").replace(/,/g, "").replace(/%$/, "");
  if (/^-?\d+(?:\.\d+)?$/.test(numeric)) return Number(numeric);
  // A bare word or two is a legitimate string value ("Retired", "High risk").
  if (/^[A-Za-z][A-Za-z0-9 _-]{0,40}$/.test(value)) return value;
  return null;
}

/**
 * The comparison a condition states, or null when it is not one.
 *
 * Null is the normal answer for real judgement, and the caller should leave such
 * an edge to the model rather than guessing.
 */
export function parseConditionToRule(condition: string | null | undefined): RuleGroup | null {
  const text = String(condition ?? "").trim();
  if (!text) return null;
  // More than one clause joined by and/or: not attempted. A partial rule would
  // route on half a condition, which is the one outcome worse than a model call.
  if (/\s+(?:and|or)\s+/i.test(text)) return null;
  // Strip a leading connective the author used to read naturally.
  const body = text.replace(/^(?:if|when|where|only\s+if)\s+/i, "").trim();

  for (const [pattern, operator] of PHRASE_OPERATORS) {
    const match = pattern.exec(body);
    if (!match || match.index === 0) continue;
    const field = normalizeField(body.slice(0, match.index));
    const value = normalizeValue(body.slice(match.index + match[0].length));
    if (field && value !== null) return { combinator: "AND", conditions: [{ field, operator, value }] };
  }

  for (const [symbol, operator] of SYMBOL_OPERATORS) {
    const at = body.indexOf(symbol);
    if (at <= 0) continue;
    const field = normalizeField(body.slice(0, at));
    const value = normalizeValue(body.slice(at + symbol.length));
    if (field && value !== null) return { combinator: "AND", conditions: [{ field, operator, value }] };
  }

  // A bare word on its own, as a boolean field. Only for names that really are
  // booleans: a branch called "Rejected" would otherwise become
  // `Rejected == true`, a field no step writes, so the branch would quietly
  // never fire -- worse than paying for the model call.
  const BOOLEAN_FIELD = /^(?:approved|is[A-Z][A-Za-z0-9]*|has[A-Z][A-Za-z0-9]*|was[A-Z][A-Za-z0-9]*)$/;
  const negated = /^(?:not|no)\s+([A-Za-z_][A-Za-z0-9_]*)$/i.exec(body);
  if (negated && BOOLEAN_FIELD.test(negated[1])) {
    return { combinator: "AND", conditions: [{ field: negated[1], operator: "==", value: false }] };
  }
  if (BOOLEAN_FIELD.test(body)) return { combinator: "AND", conditions: [{ field: body, operator: "==", value: true }] };

  return null;
}
