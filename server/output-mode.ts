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
 * front (server/final-answer.ts). A ceiling is not free: OpenAI charges each
 * request max(max_tokens, prompt estimate) against the tokens-per-minute
 * limit, so a 16K ceiling on a 5K prompt with a 300-token answer spends 16K
 * of the minute's budget. Analysis answers are asked to be concise and run a
 * few hundred tokens; 8K leaves ample room. A deliverable in "answer" mode
 * (a report, an outline) keeps the larger ceiling it needs.
 */
export const ANALYSIS_MAX_TOKENS = 8192;
export const ANSWER_MAX_TOKENS = 16384;
export function continuationMaxTokens(mode: OutputMode): number {
  return mode === "answer" ? ANSWER_MAX_TOKENS : ANALYSIS_MAX_TOKENS;
}
