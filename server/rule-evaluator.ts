import type { RuleLeaf, RuleGroup } from "@shared/schema";

export interface RuleEvalTrace {
  result: boolean;
  reason: string;
  inputs: Record<string, unknown>;
}

function resolveField(state: Record<string, any>, path: string): unknown {
  return path.split(".").reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), state);
}

function formatValue(v: unknown): string {
  if (typeof v === "string") return `"${v}"`;
  if (v === undefined) return "undefined";
  return JSON.stringify(v);
}

function compare(actual: unknown, operator: RuleLeaf["operator"], expected: unknown): boolean {
  switch (operator) {
    case ">": return Number(actual) > Number(expected);
    case "<": return Number(actual) < Number(expected);
    case ">=": return Number(actual) >= Number(expected);
    case "<=": return Number(actual) <= Number(expected);
    case "==": return actual === expected || String(actual) === String(expected);
    case "!=": return !(actual === expected || String(actual) === String(expected));
    case "contains":
      if (typeof actual === "string") return actual.toLowerCase().includes(String(expected).toLowerCase());
      if (Array.isArray(actual)) return actual.some(x => x === expected || String(x) === String(expected));
      return false;
    case "not_contains":
      return !compare(actual, "contains", expected);
    default:
      return false;
  }
}

function isLeaf(node: RuleLeaf | RuleGroup): node is RuleLeaf {
  return "field" in node;
}

/**
 * Evaluates a compound AND/OR rule tree against pipeline state -- plain
 * comparison logic against a fixed operator whitelist, no LLM call and no
 * arbitrary code execution (unlike a JS `eval`/Function-constructor
 * approach). Returns a human-readable `reason` trail alongside the boolean
 * result so a monitoring view can explain *why* a workflow branched the way
 * it did (e.g. `invoiceAmount ("12500") > 10000 → true`), not just that it
 * did -- the LLM-based evaluateCondition() this replaces logs nothing at
 * all when the result is true, and only a generic message when false.
 */
export function evaluateRule(rule: RuleGroup, state: Record<string, any>): RuleEvalTrace {
  const inputs: Record<string, unknown> = {};

  function evalNode(node: RuleLeaf | RuleGroup): { result: boolean; reason: string } {
    if (isLeaf(node)) {
      const actual = resolveField(state, node.field);
      inputs[node.field] = actual;
      const result = compare(actual, node.operator, node.value);
      const reason = `${node.field} (${formatValue(actual)}) ${node.operator} ${formatValue(node.value)} → ${result}`;
      return { result, reason };
    }
    const childResults = node.conditions.map(evalNode);
    const result = node.combinator === "AND"
      ? childResults.every(c => c.result)
      : childResults.some(c => c.result);
    const reason = `(${childResults.map(c => c.reason).join(` ${node.combinator} `)}) → ${result}`;
    return { result, reason };
  }

  const { result, reason } = evalNode(rule);
  return { result, reason, inputs };
}
