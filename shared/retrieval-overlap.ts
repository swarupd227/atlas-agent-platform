/**
 * Two steps that retrieved the same passages.
 *
 * Scope is partitioned once, in the proposal prompt, and never checked again. At
 * run time two parallel researchers can retrieve the same documents and nothing
 * notices: the work is paid for twice, and the synthesis step downstream reads
 * one passage under two labels, which makes a claim look better supported than it
 * is.
 *
 * This only became checkable once each retrieving step started recording the
 * sources behind its passages (`<stateKey>_sources`). Before that there was
 * nothing to compare.
 *
 * It reports pairs and never a verdict. Two steps citing the same policy clause
 * can be exactly right -- whether an overlap is waste or corroboration is the
 * author's call, so this says what was shared and stops there.
 */

import type { CitedSource } from "./retrieval-citations";

export interface RetrievalOverlap {
  /** The two steps, by the state key each wrote its sources under. */
  a: string;
  b: string;
  /** The passages both used, by chunk id. */
  sharedChunkIds: string[];
  /** The documents those passages came from, for a message a person can read. */
  sharedTitles: string[];
  /** How much of the smaller set is shared, 0..1 -- a two-of-two overlap matters more than two-of-forty. */
  ratio: number;
}

/** Below this, a shared passage or two between large sets is not worth a word. */
const DEFAULT_MIN_RATIO = 0.5;

const idsOf = (sources: CitedSource[]): Map<string, string> => {
  // Keyed by chunk id, because two passages from ONE document are legitimately
  // different evidence; only the same passage twice is duplicated work.
  const byId = new Map<string, string>();
  for (const s of sources) {
    const id = typeof s?.chunkId === "string" ? s.chunkId : "";
    if (id) byId.set(id, typeof s?.title === "string" ? s.title : "");
  }
  return byId;
};

/**
 * Which pairs of steps retrieved the same passages, worst first.
 *
 * `sourcesByStep` maps a step's state key to the sources it recorded. A step with
 * no chunk ids (an older run, or a retrieval that returned nothing) takes part in
 * no pair rather than matching everything.
 */
export function findRetrievalOverlaps(
  sourcesByStep: Record<string, CitedSource[] | undefined>,
  minRatio: number = DEFAULT_MIN_RATIO,
): RetrievalOverlap[] {
  const steps = Object.entries(sourcesByStep)
    .map(([key, sources]) => ({ key, ids: idsOf(Array.isArray(sources) ? sources : []) }))
    .filter((s) => s.ids.size > 0);

  const overlaps: RetrievalOverlap[] = [];
  for (let i = 0; i < steps.length; i++) {
    for (let j = i + 1; j < steps.length; j++) {
      const [a, b] = [steps[i], steps[j]];
      // Array.from, not a spread: this project compiles to ES5, where spreading a
      // Map iterator is a type error rather than a style choice.
      const shared = Array.from(a.ids.keys()).filter((id) => b.ids.has(id));
      if (shared.length === 0) continue;
      const ratio = shared.length / Math.min(a.ids.size, b.ids.size);
      if (ratio < minRatio) continue;
      const titles = Array.from(new Set(shared.map((id) => a.ids.get(id) || b.ids.get(id) || "").filter(Boolean)));
      overlaps.push({ a: a.key, b: b.key, sharedChunkIds: shared, sharedTitles: titles, ratio });
    }
  }
  return overlaps.sort((x, y) => y.ratio - x.ratio || y.sharedChunkIds.length - x.sharedChunkIds.length);
}

/** The finding as a reviewer reads it on the run. States what was shared, concludes nothing. */
export function describeOverlap(o: RetrievalOverlap): string {
  const where = o.sharedTitles.length ? ` from ${o.sharedTitles.slice(0, 3).join(", ")}` : "";
  const passages = `${o.sharedChunkIds.length} passage${o.sharedChunkIds.length === 1 ? "" : "s"}`;
  return `"${o.a}" and "${o.b}" both used ${passages}${where} (${Math.round(o.ratio * 100)}% of the smaller set).`;
}
