/**
 * The conversation's name, editable where it is shown.
 *
 * A title was the first 60 characters of whatever you typed first and could
 * never be changed — a poor name for something you come back to, and the only
 * thing the rail and the ⌘K palette have to search by.
 */
import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

export function ConversationTitle({ title, onRename }: { title: string; onRename: (next: string) => Promise<void> | void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const input = useRef<HTMLInputElement>(null);

  // Someone else's rename, or a new conversation, wins over a stale draft.
  useEffect(() => setDraft(title), [title]);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const save = async () => {
    const next = draft.replace(/\s+/g, " ").trim();
    setEditing(false);
    if (!next || next === title) {
      setDraft(title);
      return;
    }
    await onRename(next);
  };

  if (editing) {
    return (
      <input
        ref={input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") {
            setDraft(title);
            setEditing(false);
          }
        }}
        maxLength={200}
        aria-label="Conversation name"
        className="min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-sm font-medium outline-none focus:border-ring"
        data-testid="astra-title-input"
      />
    );
  }

  return (
    <h1 className="group/title flex min-w-0 flex-1 items-center gap-1">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="min-w-0 truncate rounded text-left text-sm font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        title="Rename this conversation"
        data-testid="astra-title"
      >
        {title}
      </button>
      <Pencil
        className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100"
        aria-hidden
      />
    </h1>
  );
}
