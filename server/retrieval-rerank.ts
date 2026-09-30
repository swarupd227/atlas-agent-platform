/**
 * Retrieval rerank (Phase 3, item 7): which retrieved passage best answers the
 * question, asked of the decision seam on "retrieval_rerank".
 *
 * Knowledge-base search orders passages by cosine distance to the question's
 * embedding and hands them to the prompt in that order. Embedding distance is
 * a measure of topical nearness, not of whether a passage answers the
 * question, and nothing checked the order. The one judgment worth asking is
 * the top of the list, because that is what a model reads first and what a
 * truncated context keeps: one `choice` over the passages, with cosine's own
 * first passage as the known incumbent. Agreement in the audit is top-1
 * agreement between the embedding and the decision model.
 *
 *   shadow  the order is returned untouched, at once; the question is asked
 *           afterwards for the record and not awaited.
 *   jev     the question is asked first; a confident, different pick moves to
 *           the front. Nothing is ever dropped and the rest keep cosine order.
 *   llm     the kill switch: untouched, nothing asked.
 *
 * Only a real cosine ranking is measured: the recency fallback used when
 * pgvector is unavailable has no similarity and is left alone. A seam failure
 * returns the passages as they came.
 */
import { decideMany, knownIncumbent, type DecisionQuestion } from "./decision-provider";
import { resolveDecisionRoute } from "./decision-settings";

export const RERANK_SITE = "retrieval_rerank";
/** Only the head of the list is asked about; a longer tail keeps its order behind it. */
export const RERANK_MAX_PASSAGES = 12;
const PASSAGE_CHARS = 500;
const QUESTION_CHARS = 4_000;

export interface RetrievedChunk { id: string; content: string; similarity: number | null }

const key = (i: number) => `p${i}`;

function setFor(question: string, head: RetrievedChunk[]): { state: Record<string, unknown>; questions: Record<string, DecisionQuestion> } {
  const criteria: Record<string, string> = {};
  head.forEach((c, i) => { criteria[key(i)] = String(c.content ?? "").replace(/\s+/g, " ").trim().slice(0, PASSAGE_CHARS); });
  return {
    state: { question: question.slice(0, QUESTION_CHARS) },
    questions: { best: { kind: "choice", instructions: "Which passage best answers the question?", criteria, subject: question.replace(/\s+/g, " ").trim().slice(0, 200) } },
  };
}

export async function rerankChunks<T extends RetrievedChunk>(question: string, chunks: T[], opts: { orgId?: string | null } = {}): Promise<T[]> {
  const q = String(question ?? "").trim();
  if (!q || !Array.isArray(chunks) || chunks.length < 2 || typeof chunks[0].similarity !== "number") return chunks;
  try {
    const route = await resolveDecisionRoute(RERANK_SITE, opts.orgId);
    if (route.mode === "llm") return chunks;
    const head = chunks.slice(0, RERANK_MAX_PASSAGES);
    const set = setFor(q, head);
    // Cosine's first passage is the incumbent's answer, already in hand.
    const incumbent = knownIncumbent({ best: key(0) }, { model: "cosine", latencyMs: 0 });
    if (route.mode === "shadow") {
      void decideMany({ site: RERANK_SITE, orgId: opts.orgId, ...set, incumbent }).catch((err: unknown) => {
        console.warn(`[rerank] measurement unavailable: ${err instanceof Error ? err.message : String(err)}`);
      });
      return chunks;
    }
    const decided = await decideMany({ site: RERANK_SITE, orgId: opts.orgId, ...set, incumbent });
    const pick = decided.best;
    if (pick?.engine !== "jev" || typeof pick.answer !== "string") return chunks;
    const i = head.findIndex((_, k) => key(k) === pick.answer);
    if (i <= 0) return chunks;
    return [chunks[i], ...chunks.slice(0, i), ...chunks.slice(i + 1)];
  } catch (err: unknown) {
    console.warn(`[rerank] unavailable, keeping cosine order: ${err instanceof Error ? err.message : String(err)}`);
    return chunks;
  }
}
