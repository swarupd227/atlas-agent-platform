/**
 * Tools an agent must actually call before its answer counts.
 *
 * A reviewer told in its prompt to "inspect the file before judging" can still
 * answer without doing so, and its verdict reads exactly like one that did.
 * Live: three Deck Studio QA passes in a row returned "QA Result: PASS" with
 * zero tool calls, on decks that inspection showed had 7-9 overflowing shapes,
 * missing speaker notes and leftover template text. Prompt rules did not stop it.
 *
 * An agent can now declare `runtimeConfig.requiredToolCalls: ["inspect_document"]`.
 * The runtime then
 *   1. forces the call through the provider's own tool_choice (at most
 *      MAX_FORCES_PER_TOOL times per tool, so a tool that keeps failing cannot
 *      burn every iteration), and
 *   2. refuses the answer when the run ends without a successful call: the run
 *      gets a failed step naming the missing tool, so a team node fails and the
 *      steps after it are told it produced nothing.
 *
 * Generic: any agent, any tool, any engine that runs agents through
 * executePromptWithMcp. Agents without the setting are unaffected.
 */

export const MAX_FORCES_PER_TOOL = 2;

/** The tool names an agent declared as required, normalised for matching. Empty when unset or malformed. */
export function resolveRequiredToolCalls(runtimeConfig: Record<string, unknown> | undefined | null): string[] {
  const raw = runtimeConfig?.requiredToolCalls;
  if (!Array.isArray(raw)) return [];
  const names = raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
  return Array.from(new Set(names));
}

/** Same naming the tool loop uses when it offers tools to the model (see buildCanonicalTools). */
export function toolFunctionName(index: number, toolName: string): string {
  return `mcp_${index}_${toolName.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

export interface ToolCallRecord {
  toolName: string;
  result?: unknown;
  error?: string;
}

/**
 * A call counts only if it ran and the tool did not report failure in its own
 * payload: dispatch errors, MCP `isError: true` and the `{ok: false}` shape the
 * built-in tools return for bad input all leave the requirement unmet.
 */
export function isSatisfyingCall(record: ToolCallRecord): boolean {
  if (record.error) return false;
  const result = record.result as Record<string, unknown> | null | undefined;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    if (result.ok === false) return false;
    if (result.isError === true) return false;
  }
  return true;
}

/** Required tools with no successful call yet, in declaration order. */
export function missingRequiredToolCalls(required: string[], calls: ToolCallRecord[]): string[] {
  const satisfied = new Set(calls.filter(isSatisfyingCall).map((c) => c.toolName.toLowerCase()));
  return required.filter((name) => !satisfied.has(name));
}

/**
 * The function name to force on the next model call, or undefined to leave the
 * model free. Picks the first required tool that is still unmet, is offered to
 * this agent, and has not already been forced MAX_FORCES_PER_TOOL times.
 * Records the force in `forced`.
 */
export function nextForcedToolChoice(
  required: string[],
  availableToolNames: string[],
  calls: ToolCallRecord[],
  forced: Map<string, number>,
): string | undefined {
  if (required.length === 0) return undefined;
  for (const name of missingRequiredToolCalls(required, calls)) {
    const index = availableToolNames.findIndex((t) => t.toLowerCase() === name);
    if (index < 0) continue;
    const count = forced.get(name) ?? 0;
    if (count >= MAX_FORCES_PER_TOOL) continue;
    forced.set(name, count + 1);
    return toolFunctionName(index, availableToolNames[index]);
  }
  return undefined;
}

/** The error recorded when a run ends with required tools unmet. */
export function requiredToolCallsError(missing: string[], availableToolNames: string[]): string {
  const available = new Set(availableToolNames.map((t) => t.toLowerCase()));
  const notOffered = missing.filter((m) => !available.has(m));
  const notCalled = missing.filter((m) => available.has(m));
  const parts: string[] = [];
  if (notCalled.length > 0) {
    parts.push(`required tool call${notCalled.length > 1 ? "s" : ""} not made successfully: ${notCalled.join(", ")}`);
  }
  if (notOffered.length > 0) {
    parts.push(`required tool${notOffered.length > 1 ? "s" : ""} not available to this agent: ${notOffered.join(", ")}`);
  }
  return (
    `${parts.join("; ")}. This agent must call ${missing.length > 1 ? "them" : "it"} before answering ` +
    `(runtimeConfig.requiredToolCalls), so its answer is not accepted.`
  );
}
