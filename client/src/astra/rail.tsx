import { Link } from "wouter";
import { decidePrompt } from "./decide-prompt";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, House, Library as LibraryIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiHeaders } from "@/lib/queryClient";
import type { NeedsYou, NeedsYouItem, ThreadSummary } from "./types";
import type { Mentionable } from "./mention";

const NEEDS_YOU_SHOWN = 6;

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <div className="flex h-6 items-center justify-between px-2">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const URGENCY_DOT: Record<string, string> = {
  urgent: "bg-[hsl(var(--astra-fail))]",
  today: "bg-primary",
  this_week: "bg-muted-foreground/50",
};


/** Decide here when Astra can finish it; otherwise say where it's decided and why. */
function NeedsYouRow({ item, onAskAbout }: { item: NeedsYouItem; onAskAbout: (text: string) => void }) {
  return (
    <li className="rounded px-2 py-1.5 hover:bg-accent/40" data-testid="astra-needs-you-item">
      <div className="flex items-start gap-2">
        <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${URGENCY_DOT[item.urgency] ?? URGENCY_DOT.this_week}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm" title={item.title}>{item.title}</div>
          {item.canDecideHere ? (
            <button
              type="button"
              onClick={() => onAskAbout(decidePrompt(item))}
              className="mt-0.5 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="astra-needs-you-decide"
            >
              Decide here
            </button>
          ) : item.elsewhere ? (
            <Link
              href={`~${item.elsewhere.href}`}
              className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="astra-needs-you-elsewhere"
            >
              <span className="min-w-0">
                Open in {item.elsewhere.page}
                <span className="block text-muted-foreground/80">{item.elsewhere.reason}</span>
              </span>
              <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function Rail({
  threads,
  activeId,
  onSelect,
  onNew,
  onAskAbout,
  agents,
  onMention,
  view,
  onLibrary,
}: {
  threads: ThreadSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Home: the briefing and a new conversation. */
  onNew: () => void;
  /** Which of the rail's destinations is showing. */
  view: "home" | "thread" | "library";
  onLibrary: () => void;
  onAskAbout: (text: string) => void;
  /** The agents the user can run (the @ menu's list). */
  agents: Mentionable[];
  /** Put "@Name " in the composer. */
  onMention: (name: string) => void;
}) {
  const { data: needsYou, isError: needsYouFailed } = useQuery<NeedsYou | null>({
    queryKey: ["/api/astra/needs-you"],
    queryFn: async () => {
      const res = await fetch("/api/astra/needs-you", { credentials: "include", headers: getApiHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    refetchInterval: 60_000,
    retry: false,
  });

  const waitingThreads = threads.filter((t) => t.status === "awaiting_confirmation");
  const items = needsYou?.needsDecision ?? [];
  const needsYouTotal = waitingThreads.length + (needsYou?.needsDecisionCount ?? 0);

  return (
    <nav className="flex h-full min-h-0 flex-col bg-card/60" aria-label="Astra">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <div aria-hidden className="flex h-6 w-6 items-center justify-center rounded bg-primary font-mono text-[11px] font-bold text-primary-foreground">
          A
        </div>
        <span className="text-[15px] font-semibold tracking-tight [font-family:var(--astra-display)]">Astra</span>
        <span className="rounded border border-border px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Preview</span>
      </div>

      <div className="flex items-center gap-1 p-2">
        <button
          type="button"
          onClick={onNew}
          aria-current={view === "home" ? "page" : undefined}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${view === "home" ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/60"}`}
          data-testid="astra-nav-home"
        >
          <House className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> Home
        </button>
        <Button onClick={onNew} variant="outline" size="icon" className="h-8 w-8 shrink-0" aria-label="New conversation" title="New conversation" data-testid="astra-new-thread">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        <Section
          title="Needs you"
          action={<span className="font-mono text-[11px] tabular-nums text-muted-foreground" data-testid="astra-needs-you-count">{needsYouTotal}</span>}
        >
          {needsYouTotal === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">{needsYouFailed ? "Couldn't load approvals and alerts." : "Nothing waiting on you."}</p>
          ) : (
            <ul className="space-y-0.5" data-testid="astra-needs-you">
              {waitingThreads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(t.id)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span className="truncate">{t.pendingAction?.summary ?? t.title}</span>
                    </button>
                  </li>
                ))}
              {items.slice(0, NEEDS_YOU_SHOWN).map((item) => (
                <NeedsYouRow key={item.id} item={item} onAskAbout={onAskAbout} />
              ))}
              {(needsYou?.needsDecisionCount ?? 0) > NEEDS_YOU_SHOWN && (
                <li>
                  <Link
                    href="~/my-actions"
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    All {needsYou!.needsDecisionCount} in My Actions <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Section>

        <Section title="Conversations">
          {threads.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">None yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(t.id)}
                    aria-current={t.id === activeId ? "page" : undefined}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      t.id === activeId ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/60"
                    }`}
                    data-testid="astra-thread-item"
                  >
                    <span className="truncate">{t.title}</span>
                    {t.status === "failed" && <span className="ml-auto shrink-0 font-mono text-[10px] text-[hsl(var(--astra-fail))]">failed</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Your agents">
          {agents.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">No agents you can run yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {agents.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onMention(a.name)}
                    title={`Mention @${a.name} in your message`}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-foreground/80 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--astra-ok))]" />
                    <span className="truncate">{a.name}</span>
                  </button>
                </li>
              ))}
              {agents.length > 8 && (
                <li>
                  <button type="button" onClick={onLibrary} className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    All {agents.length} in the Library
                  </button>
                </li>
              )}
            </ul>
          )}
        </Section>
      </div>

      <div className="shrink-0 space-y-1 border-t border-border p-2">
        <button
          type="button"
          onClick={onLibrary}
          aria-current={view === "library" ? "page" : undefined}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${view === "library" ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/60"}`}
          data-testid="astra-nav-library"
        >
          <LibraryIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> Library
          <kbd className="ml-auto font-mono text-[10px] text-muted-foreground" title="Ask Astra or go to anything">{/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K"}</kbd>
        </button>
        <Link
          href="~/dashboard"
          className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to the classic app
        </Link>
      </div>
    </nav>
  );
}
