/**
 * A second opinion on a knowledge source's sensitivity (Phase 3, item 8).
 *
 * The scan in server/kb-routes.ts assigns a level from keyword counts: two
 * terms of a regulated class make a source restricted, two PII terms make it
 * confidential, anything else is public. It cannot see a medical record that
 * never says "patient", and it never says "internal". The decision seam is
 * asked the same question on "kb_sensitivity", one choice over the four
 * levels, with the keyword level as the known incumbent.
 *
 * The second opinion can raise a level and never lower it. A retrieval
 * permission filter reads this level, so a wrong "higher" costs someone an
 * extra request for access, and a wrong "lower" leaks; only the first is
 * acceptable from a model that is being measured. A lower answer is a row in
 * the audit and nothing more.
 *
 *   shadow  the keyword level stands; the model is asked for the record.
 *   jev     a confident, higher answer becomes the level.
 *   llm     the kill switch: the keyword level, nothing asked.
 */
import { decideMany, knownIncumbent } from "./decision-provider";

export const KB_SENSITIVITY_SITE = "kb_sensitivity";
export const SENSITIVITY_LEVELS = ["public", "internal", "confidential", "restricted"] as const;
export type SensitivityLevel = (typeof SENSITIVITY_LEVELS)[number];

/** What the model is shown of a source; its state cap is far above this, and a class shows early. */
const CONTENT_CHARS = 12_000;
const rank = (level: string) => (SENSITIVITY_LEVELS as readonly string[]).indexOf(level);

export interface SensitivityOpinion {
  /** The level to store: the keyword level, or a higher one the decision model was confident of. */
  level: SensitivityLevel;
  /** Set only when the level was raised: what the keywords said. */
  raisedFrom?: SensitivityLevel;
  model?: string;
  confidence?: number | null;
}

export async function sensitivitySecondOpinion(args: { text: string; keywordLevel: SensitivityLevel; orgId?: string | null; subject?: string }): Promise<SensitivityOpinion> {
  const { text, keywordLevel } = args;
  // Nothing sits above restricted, and an empty source has nothing to judge.
  if (keywordLevel === "restricted" || !String(text ?? "").trim()) return { level: keywordLevel };
  try {
    const decided = await decideMany({
      site: KB_SENSITIVITY_SITE,
      state: { content: text.slice(0, CONTENT_CHARS) },
      orgId: args.orgId,
      questions: {
        level: {
          kind: "choice",
          instructions: "How sensitive is this content?",
          criteria: {
            public: "Nothing a member of the public could not be shown",
            internal: "Ordinary internal business material: not secret, not for publication",
            confidential: "Personal data about identifiable people, or commercially confidential terms",
            restricted: "Regulated data: health records, payment card data, or restricted financial records",
          },
          subject: (args.subject ?? "knowledge source").slice(0, 500),
        },
      },
      incumbent: knownIncumbent({ level: keywordLevel }, { model: "keyword-scan", latencyMs: 0 }),
    });
    const d = decided.level;
    if (d?.engine === "jev" && typeof d.answer === "string" && rank(d.answer) > rank(keywordLevel)) {
      return { level: d.answer as SensitivityLevel, raisedFrom: keywordLevel, model: d.model, confidence: d.confidence };
    }
  } catch (err: unknown) {
    console.warn(`[kb] sensitivity second opinion unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { level: keywordLevel };
}
