/**
 * Word-overlap similarity, with no imports. The library curator uses it to find
 * near-copies of skills and notes (server/agent-curator.ts); ontology proposals use
 * it to show a reviewer the concepts a proposed one resembles
 * (server/agent-ontology-proposals.ts).
 */

/** The set of lower-cased words of at least two characters. */
export function wordSet(text: string): Set<string> {
  return new Set(String(text ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2));
}

/** Jaccard overlap of the two word sets: 1 for the same words, 0 for none shared. */
export function similarity(a: string, b: string): number {
  const A = wordSet(a), B = wordSet(b);
  if (A.size === 0 && B.size === 0) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}
