import { useEffect, useMemo, useRef } from "react";
import { Marked } from "marked";
import DOMPurify from "dompurify";
import { copyText } from "./copy-button";

// Its own instance: marked's global options are changed elsewhere in the app.
const md = new Marked({ gfm: true, breaks: true });

/** The tick shown after a code block is copied, before it offers again. */
const COPIED_FOR_MS = 1600;

/**
 * Model-written markdown, sanitized. Links open in a new tab.
 *
 * Code blocks get a copy button. It is attached after render rather than
 * written into the HTML, because the HTML goes through DOMPurify and a button
 * with a handler wouldn't survive that -- and shouldn't: nothing the model
 * writes should be able to add a control to the page.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const raw = md.parse(text ?? "", { async: false }) as string;
    const clean = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
    return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
  }, [text]);

  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const blocks = Array.from(el.querySelectorAll("pre"));
    for (const pre of blocks) {
      if (pre.querySelector("[data-code-copy]")) continue;
      // Read the code before the button is appended: the button's own text
      // would otherwise end up inside pre.textContent and get copied with it.
      const source = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
      pre.classList.add("group/code", "relative");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.codeCopy = "true";
      button.textContent = "Copy";
      button.setAttribute("aria-label", "Copy this code");
      button.className =
        "absolute right-1.5 top-1.5 rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover/code:opacity-100";
      button.addEventListener("click", async () => {
        const ok = await copyText(source);
        button.textContent = ok ? "Copied" : "Press Ctrl+C";
        timers.push(setTimeout(() => { button.textContent = "Copy"; }, COPIED_FOR_MS));
      });
      pre.appendChild(button);
    }
    return () => timers.forEach(clearTimeout);
  }, [html]);

  return <div ref={root} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
