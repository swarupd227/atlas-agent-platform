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
 * Output-token ceiling for the calls that continue a tool loop. The
 * deliverable itself is written by one of them in either mode -- in "answer"
 * mode by design, in "analysis" mode since the result format is asked for up
 * front (server/final-answer.ts) -- so both get the room the planning call
 * gets for a large input. A ceiling only caps; it costs nothing unless reached.
 */
export function continuationMaxTokens(_mode: OutputMode): number {
  return 16384;
}
