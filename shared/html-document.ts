/**
 * The last complete HTML document in an agent's output (a fenced ```html block, or a bare
 * document), for steps that build web pages or emails. Null when there is none.
 * Shared by the run view (whether to offer a preview) and the preview route (what to serve).
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
