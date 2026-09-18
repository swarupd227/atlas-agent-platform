/**
 * The final answer of a tool-using agent run, written once.
 *
 * After the tool loop the runtime used to make one more model call -- "now
 * analyze the tool results above, respond in JSON with summary, severity,
 * riskFactors, findings, recommendedActions" -- and return that as the result.
 * But the loop's own last turn had already written a complete answer, which
 * was thrown away: every tool-using step generated its deliverable twice, and
 * the second call re-sent the whole conversation to do it. Measured across the
 * account journeys' 73 steps, that second generation was a third to nearly
 * half of a tool-using step's time.
 *
 * Now the format the result must take is stated up front, in the user turn,
 * so the loop's last turn can be the result. The separate analysis call stays
 * as the fallback for a turn that did not produce a usable answer.
 *
 * Dependency-free so it can be unit-tested without the runtime's data layer.
 */

export const ANALYSIS_FIELDS =
  "summary (string), severity (low/medium/high), riskFactors (array of strings), findings (array of key observations), recommendedActions (array of strings)";

// This prompt names its own fields, and a model follows the latest
// instruction: a team step told (in its input) to emit routing fields such as
// resolutionDecision dropped them once it had called a tool, so every branch
// after it was skipped. Fields the instructions require are kept alongside.
export const REQUIRED_FIELDS_NOTE =
  " Also include, as top-level keys with the values your findings support, every field the instructions earlier in this conversation require in your output (for example the fields listed under ROUTING FIELDS).";

// Guards against a fact noticed at one tool-calling step (e.g. "some records
// have no matching related data") going unreconciled against a contradictory
// conclusion drawn at another (e.g. "none qualify").
export const RECONCILIATION_NOTE =
  " Before finalizing your answer, check it against everything observed earlier in this conversation -- if an earlier step noted a fact (e.g. some records have no matching related data) that would contradict your conclusion (e.g. \"none qualify\"), resolve the contradiction or explain it rather than reporting a conclusion that contradicts an earlier observation.";

// A step's time tracks the size of its answer (r = 0.96 across the measured
// steps), and a step fed a long upstream context tended to retell it. The
// answer is asked to be specific, not exhaustive.
export const CONCISENESS_NOTE =
  " Be specific and concise: one sentence per finding, risk factor or action, and do not restate the upstream context -- report what this step established.";

export interface RecordListSchema {
  type?: string;
  description?: string;
  fields?: Array<{ name: string; type: string; description?: string }>;
}

export function hasRecordListSchema(schema: unknown): schema is RecordListSchema {
  const s = schema as RecordListSchema | null | undefined;
  return !!s && s.type === "record_list" && Array.isArray(s.fields) && s.fields.length > 0;
}

/**
 * The processedRecords instruction: from the agent's record_list schema when
 * it has one, otherwise the generic form -- conditional in its own wording --
 * for data that turns out to hold many records.
 */
export function structuredOutputInstructions(outputSchema: unknown, hasRecordData: boolean): string {
  if (hasRecordListSchema(outputSchema)) {
    const fieldDescs = outputSchema.fields!.map((f) => `${f.name} (${f.type}): ${f.description ?? ""}`).join("; ");
    return ` IMPORTANT: You MUST also include a "processedRecords" field as a JSON array where each element represents one ${outputSchema.description || "processed record"} with these fields: ${fieldDescs}. Process EVERY record from the data — do not skip or summarize them into fewer entries.`;
  }
  if (hasRecordData) {
    return ` If the tool results contain multiple data records (e.g. leads, items, transactions), also include a "processedRecords" field as a JSON array where each element has: id, name (string identifier), score (number 0-100 if applicable), decision (string classification/action), reasoning (1-2 sentence explanation). Process every record from the data.`;
  }
  return "";
}

// Stated in the user turn before the tool loop starts. The first version
// opened with the format, and a model read that as "answer now": a screening
// agent replied in the planning call with a complete JSON "screening" it had
// never run -- no tool called, every check reported clear. The work comes
// first, in so many words, and the format applies only once it is done.
export const WORK_FIRST_NOTE =
  "Do the work first: call the tools the task needs and wait for their results. Do not answer before you have them, and never report a check, lookup or record you did not actually perform through a tool.";

export function finalAnswerInstructions(outputSchema: unknown): string {
  return [
    "## FINAL ANSWER FORMAT (only after your tool calls are done)",
    `${WORK_FIRST_NOTE} Once the tool calls are done, reply with only a JSON object -- no prose before or after it -- with fields: ${ANALYSIS_FIELDS}.${structuredOutputInstructions(outputSchema, true)}${REQUIRED_FIELDS_NOTE}${RECONCILIATION_NOTE}${CONCISENESS_NOTE}`,
  ].join("\n");
}

/** The fallback call's prompt, when the loop's last turn was not a usable answer. */
export function analysisCallPrompt(outputSchema: unknown, hasRecordData: boolean): string {
  return `Now analyze the tool results above. Respond in JSON format with fields: ${ANALYSIS_FIELDS}.${structuredOutputInstructions(outputSchema, hasRecordData)}${REQUIRED_FIELDS_NOTE}${RECONCILIATION_NOTE}${CONCISENESS_NOTE}`;
}

/**
 * The loop's last turn as the result, when it is one: no tool call still
 * pending, and a JSON object carrying a summary. Returns the turn's text
 * (the contract enforcement and parsing downstream read it as they would the
 * analysis call's), or undefined to fall back to that call.
 */
export function finalAnswerFromTurn(
  pendingToolCalls: readonly unknown[],
  content: string | null | undefined,
  parse: (text: string) => Record<string, unknown> | null,
): string | undefined {
  if (pendingToolCalls.length > 0 || !content || content.trim().length === 0) return undefined;
  const summary = parse(content)?.summary;
  return typeof summary === "string" && summary.trim().length > 0 ? content : undefined;
}
