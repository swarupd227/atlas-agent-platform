import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Loader2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyMention, duplicateNames, findMentionQuery, isCompletedMention, rankMentionables, type Mentionable } from "./mention";
import { applyCommand, fillArg, findSlashQuery, rankCommands, resolveSlash, type SlashCommand } from "./slash";
import { useVoiceInput } from "./use-voice-input";
import { insertSpoken, micLabel } from "./voice";
import type { PermissionAction } from "@/components/role-provider";

/** Something waiting on the person, for /approve and /reject to pick from. */
export interface DecisionOption {
  id: string;
  title: string;
  /** How Astra is asked for it: "approval", "policy exception", "tool request"… */
  noun: string;
}

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
  decisions = [],
  canUse = () => true,
  onCommandNavigate,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
  placeholder: string;
  mentionables?: Mentionable[];
  insert?: ComposerInsert | null;
  /** Options for /approve and /reject. */
  decisions?: DecisionOption[];
  /** Whether this role can use a command's tool; commands it can't are hidden. */
  canUse?: (permission?: PermissionAction) => boolean;
  /** Where a "go" command sends the person. */
  onCommandNavigate?: (href: string) => void;
}) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  // The "@" position the user closed the menu for with Escape.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [slashError, setSlashError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  // Dictation arrives in bursts, several chunks before React re-renders, so
  // where the words go is read from a ref rather than from `caret` state.
  const caretRef = useRef(0);
  caretRef.current = caret;

  /** Spoken words land in the box at the caret. They are never sent. */
  const voice = useVoiceInput({
    onText: (spoken) =>
      setText((current) => {
        const next = insertSpoken(current, pendingCaret.current ?? caretRef.current, spoken);
        pendingCaret.current = next.caret;
        return next.text;
      }),
  });

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

  // A "/" command is only ever at the very start of the message.
  const slash = findSlashQuery(text, caret);
  const commandMatches = useMemo(() => (slash && !slash.command ? rankCommands(slash.query, canUse) : []), [slash?.query, slash?.command, canUse]);
  const argOptions: Array<{ id: string; name: string; detail: string | null; value: string }> = useMemo(() => {
    const arg = slash?.command?.arg;
    if (!arg || arg.kind === "text") return [];
    const typed = slash!.rest.trim().toLowerCase();
    if (arg.kind === "decision") {
      return decisions
        .filter((d) => !typed || d.title.toLowerCase().includes(typed))
        .slice(0, 8)
        .map((d) => ({ id: d.id, name: d.title, detail: d.noun, value: `"${d.title}" (${d.noun} ${d.id})` }));
    }
    const wanted = arg.kind === "team" ? "team" : "agent";
    // A command that opens a page needs the id; one that writes a message uses the name.
    const useId = slash!.command!.argValue === "id";
    return rankMentionables(mentionables.filter((m) => (m.kind ?? "agent") === wanted), slash!.rest)
      .map((m) => ({ id: m.id, name: m.name, detail: m.description, value: useId ? m.id : m.name }));
  }, [slash?.command?.name, slash?.rest, mentionables, decisions]);
  // Once an option has been picked the text is exactly that option, so the menu closes and Enter sends.
  const argPicked = !!slash?.command?.arg && argOptions.some((o) => o.value === slash!.rest.trim());
  const slashMenu: "commands" | "args" | null = !slash
    ? null
    : !slash.command
      ? commandMatches.length > 0 ? "commands" : null
      : argOptions.length > 0 && !argPicked ? "args" : null;

  const mention = findMentionQuery(text, caret);
  const matches = useMemo(() => (mention ? rankMentionables(mentionables, mention.query) : []), [mention?.query, mention?.start, mentionables]);
  const dupes = useMemo(() => duplicateNames(mentionables), [mentionables]);
  const menuOpen = !slashMenu && !!mention && matches.length > 0 && dismissedAt !== mention.start && !isCompletedMention(mention.query, mentionables);

  useEffect(() => setHighlight(0), [mention?.query, mention?.start, slash?.query, slash?.rest]);
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

  const chooseCommand = (command: SlashCommand) => {
    setSlashError(null);
    if (command.kind === "go") {
      setText("");
      onCommandNavigate?.(command.href!);
      return;
    }
    const next = applyCommand(command);
    pendingCaret.current = next.caret;
    setText(next.text);
  };

  const chooseArg = (value: string) => {
    if (!slash?.command) return;
    const next = `/${slash.command.name} ${value}`;
    pendingCaret.current = next.length;
    setText(next);
  };

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    // Sending ends the dictation: nobody expects the mic to stay live after
    // the message has gone.
    voice.stop();
    if (t.startsWith("/")) {
      const result = resolveSlash(t);
      if (result.action === "go") {
        setText("");
        setSlashError(null);
        onCommandNavigate?.(result.href);
        return;
      }
      if (result.action === "need_arg") {
        setSlashError(`/${result.command.name} needs ${result.command.arg!.label}.`);
        return;
      }
      if (result.action === "unknown") {
        setSlashError(`There's no /${result.typed} command.${result.suggestion ? ` Did you mean /${result.suggestion.name}?` : ""}`);
        return;
      }
      setSlashError(null);
      onSend(result.text);
      setText("");
      return;
    }
    setSlashError(null);
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
      {slashError && (
        <p className="absolute bottom-full left-0 mb-1 rounded bg-[hsl(var(--astra-fail)/0.12)] px-2 py-1 text-xs text-[hsl(var(--astra-fail))]" role="alert" data-testid="astra-slash-error">
          {slashError}
        </p>
      )}
      {!slashError && (voice.error || voice.state !== "idle") && (
        <p
          className={`absolute bottom-full left-0 mb-1 max-w-full truncate rounded px-2 py-1 text-xs ${voice.error ? "bg-[hsl(var(--astra-fail)/0.12)] text-[hsl(var(--astra-fail))]" : "bg-muted text-muted-foreground"}`}
          role="status"
          data-testid="astra-voice-status"
        >
          {voice.error
            ? voice.error
            : voice.state === "transcribing"
              ? "Transcribing what you said…"
              : `Listening. ${voice.note}`}
          {voice.interim && <span className="italic"> {voice.interim}</span>}
        </p>
      )}
      {slashMenu && (
        <ul
          id="astra-slash-menu"
          role="listbox"
          aria-label={slashMenu === "commands" ? "Commands" : slash!.command!.arg!.label}
          className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-full max-w-sm overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          data-testid="astra-slash-menu"
        >
          {slashMenu === "commands"
            ? commandMatches.map((c, i) => (
                <li
                  key={c.name}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    chooseCommand(c);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`cursor-pointer rounded px-2 py-1.5 text-sm ${i === highlight ? "bg-accent text-accent-foreground" : ""}`}
                  data-testid="astra-slash-option"
                >
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="font-mono text-xs">/{c.name}</span>
                    <span className="truncate">{c.label}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{c.hint}</div>
                </li>
              ))
            : argOptions.map((o, i) => (
                <li
                  key={o.id}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    chooseArg(o.value);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`cursor-pointer rounded px-2 py-1.5 text-sm ${i === highlight ? "bg-accent text-accent-foreground" : ""}`}
                  data-testid="astra-slash-option"
                >
                  <div className="truncate">{o.name}</div>
                  {o.detail && <div className="truncate text-xs text-muted-foreground">{o.detail}</div>}
                </li>
              ))}
        </ul>
      )}
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
          if (slashError) setSlashError(null);
        }}
        onSelect={(e) => syncCaret(e.currentTarget)}
        onKeyDown={(e) => {
          if (slashMenu) {
            const options = slashMenu === "commands" ? commandMatches : argOptions;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setHighlight((h) => (h + step + options.length) % options.length);
              return;
            }
            if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const picked = Math.min(highlight, options.length - 1);
              if (slashMenu === "commands") chooseCommand(commandMatches[picked]);
              else chooseArg(argOptions[picked].value);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setText("");
              return;
            }
          }
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
      {voice.mode !== "off" && (
        <Button
          type="button"
          size="icon"
          variant={voice.state === "listening" ? "default" : "ghost"}
          className="h-8 w-8 shrink-0"
          onClick={voice.toggle}
          disabled={disabled || voice.state === "transcribing"}
          aria-label={micLabel(voice.state)}
          aria-pressed={voice.state === "listening"}
          title={voice.note}
          data-testid="astra-mic"
        >
          {voice.state === "transcribing" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : voice.state === "listening" ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>
      )}
      <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={disabled || !text.trim()} aria-label="Send">
        <ArrowUp className="h-4 w-4" />
      </Button>
    </form>
  );
}
