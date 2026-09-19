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
