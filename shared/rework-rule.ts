import type { RuleGroup } from "./schema";

/**
 * When a reviewing step has asked for the work to be redone.
 *
 * decideRevision (server/dag-execution-engine.ts) evaluates this against the
 * reviewer's structured output as well as its raw text, so it has to cover the
 * vocabularies a reviewer actually uses, not one word. Live 2026-09-24: a
 * contract-certainty step emitted {"accepted":false,"escalate":false,"redraft":true}
 * -- asking for a redraft in as many words -- and the old rule, which matched
 * only the text "fail", did not fire. Neither outgoing branch matched either, so
 * the six steps after it were skipped and the run still reported success.
 *
 * A field that is absent reads as "undefined" and matches none of these, so a
 * reviewer that approves (or says nothing about rework) never triggers a loop.
 *
 * It lives in shared/ because both paths that turn a flow's loop into a revision
 * rule need it: the build (server/team-build.ts) and the flow sync
 * (server/process-flow-sync.ts). Two copies would drift, and a loop written with
 * a weaker rule is a loop that silently never fires.
 */
/**
 * Is this stored matcher the current one?
 *
 * Asked by the flow sync before it decides a loop is already correct. A rule
 * written before 2026-09-24 tests only the text "fail", and that rule did not
 * fire on {"accepted":false,"escalate":false,"redraft":true} -- a reviewer asking
 * for a redraft in as many words. Such a loop points at the right step for the
 * right number of rounds and still never fires, so matching on target and rounds
 * alone let a stale matcher survive every re-sync (found by a peer session's
 * measurement of af9a6f18, 2026-09-27, before it reached a run).
 *
 * Compared by content rather than by identity, and insensitive to the order the
 * conditions happen to be stored in, because this reads rows written months apart.
 */
export function isCurrentReworkRule(when: unknown): boolean {
  const canonical = (rule: unknown): string => {
    const group = rule as { combinator?: unknown; conditions?: unknown } | null;
    if (!group || typeof group !== "object" || !Array.isArray(group.conditions)) return "";
    const conditions = group.conditions
      .map((c) => {
        const leaf = c as { field?: unknown; operator?: unknown; value?: unknown };
        return `${String(leaf?.field)}|${String(leaf?.operator)}|${JSON.stringify(leaf?.value)}`;
      })
      .sort()
      .join(";");
    return `${String(group.combinator)}:${conditions}`;
  };
  return canonical(when) === canonical(REWORK_REQUESTED_RULE);
}

/**
 * The words a review step pronounces its verdict in. Shared with the engine's
 * VERDICT_RE (server/dag-execution-engine.ts), which reads the same line for the
 * verdict-versus-facts check; a test asserts the two agree, because a word in one
 * list and not the other is a verdict that routes one way and is audited another.
 */
export const VERDICT_WORDS = ["PASS", "FAIL", "BLOCKED", "APPROVED", "REJECTED"] as const;

/**
 * The verdict a reviewer pronounced, or undefined if it did not pronounce one.
 *
 * Read from a verdict HEADING ("## QA: FAIL") or from a line that opens with the
 * word ("FAIL - three defects"), never from the middle of a sentence. That
 * distinction is the whole point: the rule below used to fire on `output contains
 * "fail"`, so a reviewer passing the work with "no gaps found, nothing failed"
 * sent the run back to its planning step and re-ran every approval gate on the way
 * -- for the word "failed" in a sentence saying the opposite.
 */
export function verdictFrom(text: unknown): string | undefined {
  if (typeof text !== "string" || !text) return undefined;
  const words = VERDICT_WORDS.join("|");
  const heading = new RegExp(`^##?\\s*[\\w :/&-]{0,40}?(${words})\\b`, "im").exec(text);
  if (heading) return heading[1].toUpperCase();
  const opener = new RegExp(`^\\s*\\**(${words})\\**\\s*[:.\\-—]`, "im").exec(text);
  return opener ? opener[1].toUpperCase() : undefined;
}

export const REWORK_REQUESTED_RULE: RuleGroup = {
  combinator: "OR",
  conditions: [
    // The verdict as pronounced, not the word wherever it appears. decideRevision
    // computes `verdict` with verdictFrom above.
    { field: "verdict", operator: "==", value: "FAIL" },
    { field: "verdict", operator: "==", value: "BLOCKED" },
    { field: "verdict", operator: "==", value: "REJECTED" },
    { field: "accepted", operator: "==", value: false },
    { field: "approved", operator: "==", value: false },
    { field: "redraft", operator: "==", value: true },
    { field: "rejected", operator: "==", value: true },
    { field: "requiresRevision", operator: "==", value: true },
  ],
};
