/** Pure helpers for comparing outcome names. */

const words = (text: string) => new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));

/** Existing outcomes whose names share most of their significant words with this one (or match it exactly). */
export function similarOutcomeNames<T extends { id: string; name: string; status: string }>(name: string, outcomes: T[]) {
  const mine = words(name);
  const exact = name.trim().toLowerCase();
  return outcomes
    .map((o) => {
      const theirs = words(o.name);
      const shared = Array.from(mine).filter((w) => theirs.has(w)).length;
      const union = new Set([...Array.from(mine), ...Array.from(theirs)]).size;
      return { outcome: o, score: o.name.trim().toLowerCase() === exact ? 1 : union ? shared / union : 0 };
    })
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => ({ id: x.outcome.id, name: x.outcome.name, status: x.outcome.status }));
}
