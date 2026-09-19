// Clarifying questions before a described workflow is drawn as a process flow.
//
// "Describe a workflow" used to go straight to the graph, so every gap in the
// description (a threshold with no amount, "someone approves", nothing said
// about a rejection) was silently filled by a guess -- and those guesses change
// the flow's shape. This asks only about gaps like that, never about wording,
// and always lets the person skip. Pure helpers here; the route lives in
// server/routes/improvements.ts.

export const MAX_CLARIFY_QUESTIONS = 3;
const MAX_OPTIONS = 4;
const MAX_ANSWERS = 6;

export interface ClarifyQuestion {
  id: string;
  question: string;
  /** Why the answer changes the flow, in one short line. */
  why: string;
  /** Likely answers offered as one-click choices; empty when free text fits better. */
  options: string[];
}

export interface Clarification {
  question: string;
  answer: string;
}

const clip = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

export function buildClarifyPrompt(input: { description: string; sourcesText?: string; contextLine?: string }): string {
  return `You review a workflow description before it is turned into a process flow graph. The graph is built from these kinds of steps: a trigger, getting information, AI reasoning, a decision (branch), a human approval, an action, a notification, and an end.${input.contextLine || ""}

Workflow description: "${input.description || "See the attached process document(s) below."}"
${input.sourcesText ? `\n${input.sourcesText}\n` : ""}
Find ONLY missing facts that would change the SHAPE of the graph, for example:
- a decision or threshold whose condition or value is not stated
- an approval or sign-off with no approver role
- what happens when an approval is rejected or a check fails
- whether steps run side by side or one after another, when that is genuinely unclear
- what starts the process, or how it ends, when neither is stated

Do not ask about wording, tools, systems, timing, formatting, or anything the description or documents already answer. If a careful reader would draw the same graph anyway, ask nothing. Ask at most ${MAX_CLARIFY_QUESTIONS} questions, most important first, each one short and in plain business language.

Return a JSON object: {"questions": [{"question": "...", "why": "one short line on what it changes in the flow", "options": ["2 to ${MAX_OPTIONS} short likely answers, or an empty array when free text fits better"]}]}
Return {"questions": []} when nothing that matters is missing.

Respond ONLY with valid JSON, no markdown fences.`;
}

/** Turn the model's reply into at most MAX_CLARIFY_QUESTIONS well-formed
 *  questions. Anything unreadable means "no questions": clarifying must never
 *  stand between a person and their flow. */
export function parseClarifyResponse(raw: string): ClarifyQuestion[] {
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const list: any[] = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const out: ClarifyQuestion[] = [];
  for (const q of list) {
    const question = clip(q?.question, 200);
    if (!question || out.some((o) => o.question.toLowerCase() === question.toLowerCase())) continue;
    const options = Array.isArray(q?.options)
      ? Array.from(new Set(q.options.map((o: unknown) => clip(o, 60)).filter(Boolean) as string[])).slice(0, MAX_OPTIONS)
      : [];
    out.push({ id: `q${out.length + 1}`, question, why: clip(q?.why, 160), options });
    if (out.length >= MAX_CLARIFY_QUESTIONS) break;
  }
  return out;
}

/** Keep only answered, well-formed clarifications from a request body. */
export function readClarifications(raw: unknown): Clarification[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c: any) => ({ question: clip(c?.question, 200), answer: clip(c?.answer, 300) }))
    .filter((c) => c.question && c.answer)
    .slice(0, MAX_ANSWERS);
}

/** The block added to the flow-generation prompt: the person's answers, stated as facts. */
export function formatClarifications(clarifications: Clarification[]): string {
  if (!clarifications.length) return "";
  return `\nConfirmed by the person describing the workflow (treat these as facts and model them in the graph):\n${clarifications
    .map((c) => `- ${c.question} Answer: ${c.answer}`)
    .join("\n")}\n`;
}
