/**
 * What an Expression step promises to produce.
 *
 * Every check that asks "can this branch condition ever be true?" wants the
 * producing step's output schema, and measured on the live fleet 2026-09-28 NO
 * node of any team declares one — so the only evidence available was run
 * history, which needs three runs and supports "never observed" rather than
 * "cannot happen".
 *
 * For an Expression step that evidence is unnecessary: the output is a JSONata
 * object constructor, so its keys are in the source. jsonata's own parser gives
 * them exactly, which beats reading braces with a regex and means the contract
 * costs the author nothing — no schema to fill in, no run to wait for.
 *
 * The rule throughout is that an uncertain answer is null, never a partial key
 * list: a caller treats the keys as complete and would report a live branch as
 * dead if they were not. So anything that could produce a shape this cannot see
 * whole — a computed key, a conditional returning different objects, a $merge,
 * an expression that does not end in an object at all — returns null and the
 * caller falls back to what runs actually produced.
 */
import jsonata from "jsonata";

interface AstNode {
  type?: string;
  value?: unknown;
  expressions?: AstNode[];
  lhs?: unknown;
}

/** The node whose value the expression returns: the last one in a block. */
function resultNode(ast: AstNode): AstNode | null {
  if (!ast || typeof ast !== "object") return null;
  if (ast.type === "block") {
    const steps = Array.isArray(ast.expressions) ? ast.expressions : [];
    return steps.length > 0 ? (steps[steps.length - 1] as AstNode) : null;
  }
  return ast;
}

/**
 * The keys an Expression step's output object always has, or null when they
 * cannot be known with certainty.
 *
 * Note what this does NOT promise: that each key always carries a value. JSONata
 * omits a key whose value evaluates to undefined, so a key listed here can still
 * be missing from a particular run — which is a different defect, and the one
 * `conditionalOutputKeys` in the invariant check looks for.
 */
export function expressionOutputKeys(expression: string | null | undefined): string[] | null {
  const source = String(expression ?? "").trim();
  if (!source) return null;

  let ast: AstNode;
  try {
    ast = (jsonata(source) as unknown as { ast(): AstNode }).ast();
  } catch {
    return null; // Not parseable: team-build reports that separately.
  }

  const result = resultNode(ast);
  // `unary` with value "{" is jsonata's object constructor.
  if (!result || result.type !== "unary" || result.value !== "{") return null;

  const pairs = result.lhs;
  if (!Array.isArray(pairs)) return null;

  const keys: string[] = [];
  for (const pair of pairs) {
    const keyNode = Array.isArray(pair) ? (pair[0] as AstNode | undefined) : undefined;
    // A computed key means the shape is not knowable from the source.
    if (!keyNode || keyNode.type !== "string" || typeof keyNode.value !== "string") return null;
    keys.push(keyNode.value);
  }
  return keys.length > 0 ? keys : null;
}

/**
 * The same thing shaped as a JSON schema, so it drops straight into the
 * `producerSchema` the condition checks already accept.
 */
export function expressionOutputSchema(expression: string | null | undefined): { type: "object"; properties: Record<string, Record<string, never>> } | null {
  const keys = expressionOutputKeys(expression);
  if (!keys) return null;
  const properties: Record<string, Record<string, never>> = {};
  for (const key of keys) properties[key] = {};
  return { type: "object", properties };
}
