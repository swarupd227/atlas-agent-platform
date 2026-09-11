/**
 * What an agent run returns as its result: the platform's structured analysis,
 * or the model's own final answer (agents.runtimeConfig.outputMode).
 *
 * After a run uses tools, the runtime has always made one more model call --
 * "analyze the tool results, respond in JSON with summary, severity,
 * riskFactors, findings, recommendedActions" -- and returned THAT as the
 * result. Right for a monitoring or triage agent whose output feeds a
 * dashboard. Wrong for an agent whose job is a deliverable: a team step
 * writing an outline, a reviewer writing its verdict, a report in a set
 * format. The model's own answer, written exactly as its instructions asked,
 * was thrown away and replaced by a generic summary of it -- so a downstream
 * step received the summary instead of the outline, and a reviewer's
 * "FAIL" line vanished into a severity field.
 *
 * "answer" keeps the model's final answer as the result. It is opt-in per
 * agent, so every existing agent keeps the behaviour it was built against.
 */

export type OutputMode = "analysis" | "answer";

export function resolveOutputMode(runtimeConfig?: Record<string, any> | null): OutputMode {
  return runtimeConfig?.outputMode === "answer" ? "answer" : "analysis";
}

/**
 * In "answer" mode, the model's final text stands as the result -- provided
 * the tool loop actually ended with an answer, not with tool calls still
 * pending (iteration or cost limit reached). Undefined means "fall back to the
 * analysis call": analysis mode, or a model that never got to answer.
 */
export function ownFinalAnswer(
  mode: OutputMode,
  pendingToolCalls: readonly unknown[],
  content: string | null | undefined,
): string | undefined {
  if (mode !== "answer" || pendingToolCalls.length > 0) return undefined;
  return content && content.trim().length > 0 ? content : undefined;
}

/**
 * Output-token ceiling for the calls that continue a tool loop. In "answer"
 * mode the deliverable itself is written by one of them, so it gets the same
 * room the planning call gets for a large input; otherwise the old 4k, which
 * only ever had to hold a decision about the next tool call.
 */
export function continuationMaxTokens(mode: OutputMode): number {
  return mode === "answer" ? 16384 : 4096;
}
