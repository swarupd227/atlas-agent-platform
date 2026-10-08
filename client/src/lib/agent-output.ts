/** Shared helpers for showing an agent's own output (run view, workflow-gate approvals). */

/**
 * Agents often narrate their tool loop before the report itself ("Perfect! Now
 * I'll count the placeholders…"), and a multi-turn run concatenates several
 * such lines. When prose like that precedes the report's first heading or
 * divider, split it off so the pane can fold it away instead of leading with it.
 */
export function splitWorkingNotes(text: string): { notes: string | null; report: string } {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^\s*(#{1,6}\s|---+\s*$|\*\*\*+\s*$)/.test(l));
  if (start <= 0) return { notes: null, report: text };
  const notes = lines.slice(0, start).join("\n").trim();
  const report = lines.slice(start).join("\n").replace(/^\s*(---+|\*\*\*+)\s*\n/, "").trim();
  // Only prose narration: no tables, lists or code before the report starts, and not most of the output.
  if (!notes || !report || /(^|\n)\s*([|>*-]|\d+\.|```)/.test(notes) || notes.length > 2500 || notes.length > report.length) {
    return { notes: null, report: text };
  }
  return { notes, report };
}

/**
 * The dispatcher's ledger, which the runtime appends to EVERY agent step's
 * output (buildVerifiedToolCallLog, server/agent-runtime.ts).
 *
 * It exists for the next agent, not for a person: it is what stops a step
 * trusting a predecessor's prose, and it caught a step reporting
 * `notificationSent: true` while dispatching nothing. But the same string is
 * also what a business user reads on the run page, and the commonest case --
 * a step that legitimately calls no tools, like an orchestrator or a notifier
 * -- produces the longest and least informative version of it. A contradiction
 * between claim and ledger is already surfaced separately by the
 * claim-versus-facts check, so nothing is lost by folding this away from the
 * reader.
 *
 * Two surfaces already stripped it with their own copy of this pattern
 * (workflow-gate-approval, server/astra/services.ts); this is that rule in one
 * place so a third surface does not have to rediscover it.
 */
const VERIFIED_LEDGER_RE = /\n-{3,}\s*\n\s*PLATFORM-VERIFIED TOOL CALL LOG[\s\S]*$/i;

/** An agent step's output with the dispatcher's ledger folded away, for a human reader. */
export function stripVerifiedLedger(text: string): string {
  return typeof text === "string" ? text.replace(VERIFIED_LEDGER_RE, "").trimEnd() : text;
}

/**
 * Is this output key the fact-capture record for a step that captured nothing?
 *
 * `<stateKey>_verified` is written on every step, carrying the captured source
 * values or, when there are none, the reason why -- deliberately, because an
 * absent key could not be told apart from a step that called nothing, results
 * too large to keep, or the code never running. That reasoning is for whoever
 * is debugging the run. When it says `captured: false`, there is nothing in it
 * for a business reader; when facts WERE captured it is real source data and
 * stays.
 */
export function isEmptyFactCapture(key: string, value: unknown): boolean {
  return key.endsWith("_verified")
    && !!value && typeof value === "object" && (value as { captured?: unknown }).captured === false;
}

export { extractHtmlDocument } from "@shared/html-document";

/**
 * Open a team-run step's HTML output as a page in a new tab. Served by the platform with the
 * document's own locked-down policy (no scripts), so its images load from wherever they live.
 */
export function openRunStepHtml(runId: string, nodeId: string, wave?: number, revision?: number): void {
  const q = new URLSearchParams({ node: nodeId });
  if (wave !== undefined) q.set("wave", String(wave));
  if (revision) q.set("revision", String(revision));
  window.open(`/api/dag-execution-runs/${encodeURIComponent(runId)}/html-preview?${q}`, "_blank", "noopener");
}
