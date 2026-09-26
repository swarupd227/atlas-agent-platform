/**
 * Copy, with the one piece of feedback that matters: that it worked.
 *
 * Cowork had no way to take an answer anywhere — no copy on a message, none on
 * a code block — so getting a command or a config into a terminal or a ticket
 * meant selecting it by hand.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/** How long the tick shows before the button goes back to offering a copy. */
export const COPIED_FOR_MS = 1600;

/**
 * Put text on the clipboard. The API needs a secure context and permission,
 * so the fallback is the old selection trick rather than a silent failure.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the fallback */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  text,
  label = "Copy",
  className = "",
  testId,
}: {
  text: string;
  /** What the button says; also its accessible name. */
  label?: string;
  className?: string;
  testId?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(text);
        setState(ok ? "copied" : "failed");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState("idle"), COPIED_FOR_MS);
      }}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className}`}
      aria-label={state === "copied" ? "Copied" : label}
      data-testid={testId ?? "copy-button"}
    >
      {state === "copied" ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      {state === "copied" ? "Copied" : state === "failed" ? "Press Ctrl+C" : label}
    </button>
  );
}
