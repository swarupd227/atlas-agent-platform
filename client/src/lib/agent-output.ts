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
 * The last complete HTML document in an agent's output (a fenced ```html block, or a bare
 * document), for steps that build web pages or emails. Null when there is none.
 */
export function extractHtmlDocument(text: string): string | null {
  const fenced = Array.from(text.matchAll(/```(?:html|htm)?\s*\n([\s\S]*?)```/gi)).map((m) => m[1].trim());
  const candidates = fenced.length ? fenced : [text];
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i];
    const start = c.search(/<!doctype html|<html[\s>]/i);
    const end = c.toLowerCase().lastIndexOf("</html>");
    if (start >= 0 && end > start) return c.slice(start, end + "</html>".length);
  }
  return null;
}

/** Open an HTML document in a new browser tab, rendered as the page itself. */
export function openHtmlInBrowser(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  window.open(url, "_blank", "noopener");
  // The new tab has already read it by the time this fires.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
