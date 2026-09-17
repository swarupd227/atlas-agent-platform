import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CornerDownLeft, MessageSquare, Sparkles } from "lucide-react";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { getApiHeaders } from "@/lib/queryClient";
import { buildPaletteRows, type PaletteRow } from "./palette";
import { STARTERS } from "./prompts";
import type { Library, ThreadSummary } from "./types";

const GROUPS: Array<{ kind: PaletteRow["kind"]; heading: string | undefined }> = [
  { kind: "ask", heading: undefined },
  { kind: "conversation", heading: "Conversations" },
  { kind: "item", heading: "Go to" },
  { kind: "prompt", heading: "Suggested" },
];

/**
 * ⌘K / Ctrl+K inside /astra. Loads the library index only while open; the
 * first row always sends what you typed as a message.
 */
export function AstraCommandPalette({
  threads,
  onSend,
  onNavigate,
}: {
  threads: ThreadSummary[];
  onSend: (text: string) => void;
  /** An Astra path ("/t/…", "/library") or, with inShell false, a classic page. */
  onNavigate: (href: string, inShell: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const { data: library } = useQuery<Library>({
    queryKey: ["/api/astra/library", ""],
    queryFn: async () => {
      const res = await fetch("/api/astra/library", { credentials: "include", headers: getApiHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });

  const rows = useMemo(
    () =>
      buildPaletteRows(query, {
        threads,
        library: library ? library.sections.map((s) => ({ id: s.id, label: s.label, items: s.items })) : null,
        prompts: STARTERS,
      }),
    [query, threads, library],
  );

  const run = (row: PaletteRow) => {
    setOpen(false);
    if (row.kind === "ask" || row.kind === "prompt") onSend(row.text);
    else if (row.kind === "conversation") onNavigate(row.href, true);
    else onNavigate(row.href, row.inShell);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg [&>button]:hidden" data-testid="astra-command-palette">
        <VisuallyHidden.Root>
          <DialogTitle>Ask Astra or go to</DialogTitle>
        </VisuallyHidden.Root>
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input]]:h-12">
          <CommandInput value={query} onValueChange={setQuery} placeholder="Ask Astra, or find a conversation, agent or outcome" data-testid="astra-palette-input" />
          <CommandList className="max-h-[min(60vh,420px)]">
            <CommandEmpty>Type a question to ask Astra.</CommandEmpty>
            {GROUPS.map(({ kind, heading }) => {
              const group = rows.filter((r) => r.kind === kind);
              if (group.length === 0) return null;
              return (
                <CommandGroup key={kind} heading={heading}>
                  {group.map((row) => (
                    <CommandItem key={row.key} value={row.key} onSelect={() => run(row)} className="gap-2" data-testid={`astra-palette-${row.kind}`}>
                      {row.kind === "ask" ? (
                        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      ) : row.kind === "item" && !row.inShell ? (
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      ) : (
                        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate">{row.label}</span>
                      {row.kind === "item" && <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{row.section}</span>}
                      {row.kind === "conversation" && row.detail && <span className="shrink-0 text-xs text-primary">{row.detail}</span>}
                      {row.kind === "ask" && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
