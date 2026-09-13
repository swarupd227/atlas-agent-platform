import { useMemo } from "react";
import { Marked } from "marked";
import DOMPurify from "dompurify";

// Its own instance: marked's global options are changed elsewhere in the app.
const md = new Marked({ gfm: true, breaks: true });

/** Model-written markdown, sanitized. Links open in a new tab. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const raw = md.parse(text ?? "", { async: false }) as string;
    const clean = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
    return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
  }, [text]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
