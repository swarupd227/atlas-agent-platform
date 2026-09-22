import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { getApiHeaders } from "@/lib/queryClient";
import { useIndustry } from "@/components/industry-provider";
import type { ActivityItem, HomeActivity as Activity, HomeBriefing as Briefing, HomeRow } from "./types";

export function useHome() {
  const { industry } = useIndustry();
  const industryId = industry?.id ?? null;
  return useQuery<Briefing | null>({
    queryKey: ["/api/astra/home", industryId],
    queryFn: async () => {
      const qs = industryId ? `?industryId=${encodeURIComponent(industryId)}` : "";
      const res = await fetch(`/api/astra/home${qs}`, { credentials: "include", headers: getApiHeaders() });
      return res.ok ? res.json() : null;
    },
    staleTime: 30_000,
  });
}

function Count({ row }: { row: HomeRow }) {
  if (row.count === null) {
    return <span className="text-muted-foreground" aria-hidden>{row.tone === "unavailable" ? "–" : ""}</span>;
  }
  return <span className={row.tone === "attention" ? "text-primary" : "text-foreground"}>{row.count}</span>;
}

/**
 * Counted rows before the first message. A number here is only a pointer:
 * choosing a row asks Astra, and the answer comes from a tool with its proof.
 */
export function HomeBriefing({ onSend }: { onSend: (text: string) => void }) {
  const { data, isLoading } = useHome();

  if (isLoading) {
    return (
      <div className="space-y-px overflow-hidden rounded-md border border-border" aria-busy="true" aria-label="Loading your briefing">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse bg-card" />
        ))}
      </div>
    );
  }
  if (!data || data.rows.length === 0) return null;

  return (
    <section aria-label="Briefing" data-testid="astra-home">
      <h2 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">At a glance</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
        {data.rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onSend(row.prompt)}
              className="group flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
              data-testid={`astra-home-row-${row.id}`}
              title={row.prompt}
            >
              <span className="w-10 shrink-0 text-right font-mono text-lg tabular-nums leading-none">
                <Count row={row} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{row.label}</span>
                {row.detail && (
                  <span className={`block truncate text-xs ${row.tone === "unavailable" ? "text-[hsl(var(--astra-fail))]" : "text-muted-foreground"}`}>
                    {row.detail}
                  </span>
                )}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {data.notShown.map((line) => (
        <p key={line} className="mt-2 text-xs text-muted-foreground">
          {line}
        </p>
      ))}
    </section>
  );
}

export function useHomeActivity() {
  return useQuery<Activity | null>({
    queryKey: ["/api/astra/home/activity"],
    queryFn: async () => {
      const res = await fetch("/api/astra/home/activity", { credentials: "include", headers: getApiHeaders() });
      return res.ok ? res.json() : null;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/** "Good morning" by the viewer's own clock. */
export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** One sentence on what is waiting and what is moving, from counted rows only. */
export function waitingLine(waiting: number | null, inProgress: number | null): string {
  const parts: string[] = [];
  if (waiting !== null) parts.push(waiting === 0 ? "Nothing is waiting on you" : `${waiting} ${waiting === 1 ? "thing is" : "things are"} waiting on you`);
  if (inProgress !== null && inProgress > 0) parts.push(`${inProgress} ${inProgress === 1 ? "run is" : "runs are"} in progress`);
  if (parts.length === 0) return "Ask for anything your agents can do.";
  return `${parts.join(", and ")}.`;
}

export function HomeGreeting() {
  const { user } = useAuth();
  const { data: home } = useHome();
  const { data: activity } = useHomeActivity();
  const now = new Date();
  const name = user?.username && user.username !== "demo" ? user.username : null;
  const needs = home?.rows.find((r) => r.id === "needs");
  return (
    <header>
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight [font-family:var(--astra-display)] text-balance" data-testid="astra-home-greeting">
        {greetingFor(now.getHours())}
        {name ? `, ${name}` : ""}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{waitingLine(needs?.count ?? null, activity ? activity.inProgress.length : null)}</p>
    </header>
  );
}

const STATUS_DOT: Record<ActivityItem["status"], string> = {
  running: "bg-[hsl(var(--astra-volt))] run-dot-live",
  waiting: "bg-[hsl(var(--astra-warn))]",
  stalled: "bg-[hsl(var(--astra-fail))]",
  completed: "bg-[hsl(var(--astra-ok))]",
  failed: "bg-[hsl(var(--astra-fail))]",
};

const STATUS_WORD: Record<ActivityItem["status"], string> = {
  running: "Running",
  waiting: "Waiting",
  stalled: "Stalled",
  completed: "Done",
  failed: "Failed",
};

export function timeAgo(at: string | null, now = Date.now()): string {
  if (!at) return "";
  const m = Math.round((now - new Date(at).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function ActivityList({ label, items, empty, testId }: { label: string; items: ActivityItem[]; empty: string; testId: string }) {
  return (
    <section aria-label={label} data-testid={testId}>
      <h2 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</h2>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
          {items.map((i) => (
            <li key={`${i.kind}:${i.id}`}>
              <Link
                href={`~${i.href}`}
                className="group flex items-center gap-3 px-3 py-2.5 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                data-testid={`astra-activity-${i.kind}-${i.id}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[i.status]}`} aria-label={STATUS_WORD[i.status]} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {i.title}
                    <span className="ml-2 text-xs text-muted-foreground">{i.kind === "team_run" ? "Team" : "Agent"}</span>
                  </span>
                  <span className={`block truncate text-xs ${i.status === "failed" || i.status === "stalled" ? "text-[hsl(var(--astra-fail))]" : "text-muted-foreground"}`}>{i.detail}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{timeAgo(i.at)}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 group-hover:text-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** In progress, recent and spend: each line a summary, each link the detail. */
export function HomeActivityPanel() {
  const { data, isLoading, isError } = useHomeActivity();
  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-md bg-card" aria-busy="true" aria-label="Loading activity" />;
  }
  if (isError || !data) {
    return <p className="text-xs text-[hsl(var(--astra-fail))]">Couldn't load what's running right now.</p>;
  }
  return (
    <div className="space-y-6">
      <ActivityList label="In progress" items={data.inProgress} empty="Nothing is running right now." testId="astra-home-in-progress" />
      <ActivityList label="Finished this week" items={data.recent} empty="No runs finished in the last 7 days." testId="astra-home-recent" />
      {data.spend && (
        <section aria-label="Spend" data-testid="astra-home-spend">
          <h2 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Model spend · last {data.spend.days} days</h2>
          <p className="text-sm">
            <span className="font-mono text-lg tabular-nums">${data.spend.costUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="ml-2 text-muted-foreground">across {data.spend.runs.toLocaleString()} {data.spend.runs === 1 ? "run" : "runs"}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{data.spend.basis}</p>
        </section>
      )}
    </div>
  );
}
