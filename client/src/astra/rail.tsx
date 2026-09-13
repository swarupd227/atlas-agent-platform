import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Inbox, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiHeaders } from "@/lib/queryClient";
import type { ThreadSummary } from "./types";

async function getOptional<T>(url: string): Promise<T | null> {
  // The rail is secondary: a role without access to a list simply doesn't see it.
  const res = await fetch(url, { credentials: "include", headers: getApiHeaders() });
  return res.ok ? res.json() : null;
}

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

export function Rail({
  threads,
  activeId,
  onSelect,
  onNew,
  onAskAbout,
}: {
  threads: ThreadSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onAskAbout: (text: string) => void;
}) {
  const { data: approvals } = useQuery<any[] | null>({
    queryKey: ["astra-rail", "/api/approvals?status=pending"],
    queryFn: () => getOptional("/api/approvals?status=pending"),
    refetchInterval: 60_000,
  });
  const { data: agents } = useQuery<any[] | null>({
    queryKey: ["astra-rail", "/api/agents"],
    queryFn: () => getOptional("/api/agents"),
    staleTime: 60_000,
  });

  const waitingThreads = threads.filter((t) => t.status === "awaiting_confirmation").length;
  const pendingApprovals = Array.isArray(approvals) ? approvals.length : 0;
  const liveAgents = Array.isArray(agents)
    ? agents.filter((a) => a.status === "active" || a.status === "deployed").slice(0, 8)
    : [];

  return (
    <nav className="flex h-full min-h-0 flex-col bg-card/60" aria-label="Astra">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <div aria-hidden className="flex h-6 w-6 items-center justify-center rounded bg-primary font-mono text-[11px] font-bold text-primary-foreground">
          A
        </div>
        <span className="text-[15px] font-semibold tracking-tight [font-family:var(--astra-display)]">Astra</span>
        <span className="rounded border border-border px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Preview</span>
      </div>

      <div className="p-2">
        <Button onClick={onNew} variant="outline" className="h-8 w-full justify-start gap-2 text-sm" data-testid="astra-new-thread">
          <Plus className="h-4 w-4" /> New conversation
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        {(waitingThreads > 0 || pendingApprovals > 0) && (
          <Section title="Needs you">
            <ul className="space-y-0.5">
              {threads
                .filter((t) => t.status === "awaiting_confirmation")
                .map((t) => (
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
              {pendingApprovals > 0 && (
                <li>
                  <Link
                    href="~/my-actions"
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <Inbox className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex-1 truncate">Approvals elsewhere</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{pendingApprovals}</span>
                  </Link>
                </li>
              )}
            </ul>
          </Section>
        )}

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

        {liveAgents.length > 0 && (
          <Section title="Your live agents">
            <ul className="space-y-0.5">
              {liveAgents.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onAskAbout(`Tell me about the agent "${a.name}".`)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-foreground/80 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--astra-ok))]" />
                    <span className="truncate">{a.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-2">
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
