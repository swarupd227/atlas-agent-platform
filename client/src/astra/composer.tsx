import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyMention, duplicateNames, findMentionQuery, isCompletedMention, rankMentionables, type Mentionable } from "./mention";

/** Text to add to the composer from elsewhere (a rail row); a new nonce inserts it again. */
export interface ComposerInsert {
  text: string;
  nonce: number;
}

export function Composer({
  disabled,
  onSend,
  placeholder,
  mentionables = [],
  insert = null,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
  placeholder: string;
  mentionables?: Mentionable[];
  insert?: ComposerInsert | null;
}) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  // The "@" position the user closed the menu for with Escape.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || pendingCaret.current === null) return;
    el.focus();
    el.setSelectionRange(pendingCaret.current, pendingCaret.current);
    setCaret(pendingCaret.current);
    pendingCaret.current = null;
  }, [text]);

  useEffect(() => {
    if (!insert) return;
    setText((current) => {
      const next = current && !/\s$/.test(current) ? `${current} ${insert.text}` : `${current}${insert.text}`;
      pendingCaret.current = next.length;
      return next;
    });
  }, [insert]);

  const mention = findMentionQuery(text, caret);
  const matches = useMemo(() => (mention ? rankMentionables(mentionables, mention.query) : []), [mention?.query, mention?.start, mentionables]);
  const dupes = useMemo(() => duplicateNames(mentionables), [mentionables]);
  const menuOpen = !!mention && matches.length > 0 && dismissedAt !== mention.start && !isCompletedMention(mention.query, mentionables);

  useEffect(() => setHighlight(0), [mention?.query, mention?.start]);
  // Escape closes the menu for that one mention; once it's gone, a new @ opens it again.
  useEffect(() => {
    if (!mention) setDismissedAt(null);
  }, [mention?.start]);

  const choose = (agent: Mentionable) => {
    if (!mention) return;
    const next = applyMention(text, mention, caret, agent.name);
    pendingCaret.current = next.caret;
    setText(next.text);
  };

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
    setDismissedAt(null);
  };

  const syncCaret = (el: HTMLTextAreaElement) => setCaret(el.selectionStart ?? el.value.length);

  return (
    <form
      className="relative flex items-end gap-2 rounded-md border border-input bg-card p-2 focus-within:border-ring"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {menuOpen && (
        <ul
          id="astra-mention-menu"
          role="listbox"
          aria-label="Your agents and teams"
          className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-full max-w-sm overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          data-testid="astra-mention-menu"
        >
          {matches.map((a, i) => (
            <li
              key={a.id}
              id={`astra-mention-${a.id}`}
              role="option"
              aria-selected={i === highlight}
              // mousedown, so the textarea keeps focus and the caret
              onMouseDown={(e) => {
                e.preventDefault();
                choose(a);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`cursor-pointer rounded px-2 py-1.5 text-sm ${i === highlight ? "bg-accent text-accent-foreground" : ""}`}
              data-testid="astra-mention-option"
            >
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="truncate">{a.name}</span>
                {a.kind === "team" && <span className="shrink-0 rounded border px-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground" data-testid="astra-mention-team">Team</span>}
                {dupes.has(a.name.toLowerCase()) && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{a.id.slice(0, 8)}</span>}
              </div>
              {a.description && <div className="truncate text-xs text-muted-foreground">{a.description}</div>}
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          syncCaret(e.target);
        }}
        onSelect={(e) => syncCaret(e.currentTarget)}
        onKeyDown={(e) => {
          if (menuOpen) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setHighlight((h) => (h + step + matches.length) % matches.length);
              return;
            }
            // Enter and Tab pick the agent; they never send while the menu is open.
            if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              choose(matches[Math.min(highlight, matches.length - 1)]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setDismissedAt(mention!.start);
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        aria-label="Message Astra"
        aria-autocomplete="list"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? "astra-mention-menu" : undefined}
        aria-activedescendant={menuOpen && matches[highlight] ? `astra-mention-${matches[highlight].id}` : undefined}
        className="max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        data-testid="astra-composer"
      />
      <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={disabled || !text.trim()} aria-label="Send">
        <ArrowUp className="h-4 w-4" />
      </Button>
    </form>
  );
}
