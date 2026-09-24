/**
 * Agents — one registry: agents, teams and remote agents as views of one
 * list, with the selected one summarised beside it.
 *
 * Truthfulness: everything here is counted. The agents table's healthScore,
 * successRate, totalRuns, monthlyRevenue and monthlyCost are seed data that
 * no runtime path updates (one agent claims 18,432 runs), and the old page's
 * "eval coverage" (bindings × 25), safety ring and ROI were built on them.
 * Runs, failures, the last run and connector counts come from
 * /api/agents/activity, which counts rows.
 *
 * Configuring an agent has no conversational equivalent, so the full agent
 * page keeps that; this is the way in.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowUpRight, Bot, Inbox, Network, PlayCircle, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/ui-vocab";
import { formatDateTime } from "@/lib/format";
import type { Agent, OutcomeContract } from "@shared/schema";

export interface AgentActivity {
  runs: number;
  failed: number;
  lastRunAt: string | null;
  connectors: number;
}

export type ActivityMap = Record<string, AgentActivity>;

// ── Pure helpers (tests/agents-home.test.ts) ────────────────────────────────

export type RegistryView = "agents" | "teams" | "remote";

/** Which view an agent belongs to. A team orchestrates others; a remote agent lives elsewhere. */
export function viewOf(agent: Pick<Agent, "agentType">): RegistryView {
  const type = String(agent.agentType ?? "single");
  if (type === "team") return "teams";
  if (type === "remote" || type === "a2a") return "remote";
  return "agents";
}

/** What an agent has done, in one line, or why there's nothing to say. */
export function activityLine(a: AgentActivity | undefined, days = 30): string {
  if (!a || a.runs === 0) return `No runs in the last ${days} days`;
  const failed = a.failed > 0 ? `, ${a.failed} failed` : "";
  return `${a.runs} ${a.runs === 1 ? "run" : "runs"}${failed} in the last ${days} days`;
}

/** Live first, then the ones that have actually run, then by name. */
export function registryOrder(a: Agent, b: Agent, activity: ActivityMap): number {
  const live = (x: Agent) => (x.status === "deployed" || x.status === "active" ? 0 : x.status === "draft" ? 2 : 1);
  const runs = (x: Agent) => activity[x.id]?.runs ?? 0;
  return live(a) - live(b) || runs(b) - runs(a) || a.name.localeCompare(b.name);
}

export function registryCounts(agents: Agent[], activity: ActivityMap) {
  const live = agents.filter((a) => a.status === "deployed" || a.status === "active");
  return {
    total: agents.length,
    live: live.length,
    ran: agents.filter((a) => (activity[a.id]?.runs ?? 0) > 0).length,
    failing: agents.filter((a) => (activity[a.id]?.failed ?? 0) > 0).length,
  };
}

const VIEW_META: Record<RegistryView, { label: string; icon: typeof Bot; empty: string }> = {
  agents: { label: "Agents", icon: Bot, empty: "No agents yet." },
  teams: { label: "Teams", icon: Users, empty: "No teams yet. Astra can propose one from an outcome." },
  remote: { label: "Remote (A2A)", icon: Network, empty: "No remote agents connected." },
};

const STATUS_CLS: Record<string, string> = {
  deployed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  draft: "bg-muted text-muted-foreground",
  retired: "bg-muted text-muted-foreground",
};

function Stat({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: "warn" | "ok" }) {
  const cls = tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "";
  return (
    <div className="flex min-w-[9rem] flex-col gap-0.5 px-4 py-3" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${cls}`}>{value}</span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </div>
  );
}

export default function AgentsHome() {
  const [view, setView] = useState<RegistryView>(() => {
    const path = typeof window === "undefined" ? "" : window.location.pathname;
    return path.endsWith("/teams") ? "teams" : path.endsWith("/remote") ? "remote" : "agents";
  });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  // The selection is state, not the address: the router reports the path only, so a
  // change to ?selected= never re-rendered this page and the panel stayed empty.
  // A ?selected=<id> link still opens on that agent, and picking one updates the
  // address so the view can be shared, without a navigation.
  const [selectedId, setSelectedId] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("selected")));
  const select = (id: string) => {
    setSelectedId(id);
    try {
      window.history.replaceState(null, "", `${window.location.pathname}?selected=${encodeURIComponent(id)}`);
    } catch {
      /* the panel still opens without the address */
    }
  };

  // The list needs a name, a status and a few counts, not every agent's blueprint.
  const agentsQ = useQuery<Agent[]>({ queryKey: ["/api/agents?summary=1"] });
  const activityQ = useQuery<{ days: number; agents: ActivityMap }>({ queryKey: ["/api/agents/activity"] });
  const outcomesQ = useQuery<OutcomeContract[]>({ queryKey: ["/api/outcomes"] });
  const agents = agentsQ.data ?? [];
  const activity = activityQ.data?.agents ?? {};
  const days = activityQ.data?.days ?? 30;
  const inView = useMemo(() => agents.filter((a) => viewOf(a) === view), [agents, view]);
  const counts = registryCounts(inView, activity);

  const rows = useMemo(
    () =>
      inView
        .filter((a) => (status === "all" ? true : a.status === status))
        .filter((a) => (query ? `${a.name} ${a.description ?? ""}`.toLowerCase().includes(query.toLowerCase()) : true))
        .sort((a, b) => registryOrder(a, b, activity)),
    [inView, status, query, activity],
  );
  const selected = agents.find((a) => a.id === selectedId) ?? null;
  const statuses = Array.from(new Set(agents.map((a) => a.status).filter(Boolean))) as string[];

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="page-agents">
      <div className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-1 pt-5">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold"><Bot className="h-4 w-4" /> Agents</h1>
            <p className="text-sm text-muted-foreground">Every agent, team and remote agent this organization has, and what each has actually done.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" asChild data-testid="link-wizard"><Link href="/agents/wizard">Design an agent</Link></Button>
            <Button variant="ghost" size="sm" asChild data-testid="link-classic"><Link href="/agents/classic">Classic view</Link></Button>
          </div>
        </div>
        <div className="flex items-stretch divide-x overflow-x-auto px-2 pb-1">
          <Stat label={VIEW_META[view].label} value={counts.total} hint="in this view" />
          <Stat label="Live" value={counts.live} hint="deployed or active" tone={counts.live ? "ok" : undefined} />
          <Stat label="Ran recently" value={counts.ran} hint={`had a run in ${days} days`} />
          <Stat label="With failures" value={counts.failing} hint={`failed at least once in ${days} days`} tone={counts.failing ? "warn" : undefined} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-80 shrink-0 flex-col border-r">
          <div className="flex flex-col gap-2 border-b p-3">
            <div className="grid grid-cols-3 rounded-md border p-0.5 text-xs" role="radiogroup" aria-label="Show">
              {(Object.keys(VIEW_META) as RegistryView[]).map((v) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={`rounded px-2 py-1 transition-colors ${view === v ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  data-testid={`view-${v}`}
                >
                  {VIEW_META[v].label} · {agents.filter((a) => viewOf(a) === v).length}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or description" className="h-8 pl-7 text-xs" data-testid="input-search-agents" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {statuses.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <QueryBoundary isLoading={agentsQ.isLoading} isError={agentsQ.isError} error={agentsQ.error as Error | null} onRetry={() => agentsQ.refetch()}>
            <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
              <div className="flex flex-col divide-y">
                {rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 px-6 py-16">
                    <Inbox className="h-8 w-8 opacity-25" />
                    <p className="text-center text-xs text-muted-foreground">{query || status !== "all" ? "Nothing matches." : VIEW_META[view].empty}</p>
                  </div>
                ) : rows.map((a) => {
                  const act = activity[a.id];
                  return (
                    <button
                      key={a.id}
                      onClick={() => select(a.id)}
                      className={`flex w-full flex-col gap-1.5 p-3 text-left transition-colors hover:bg-muted/40 ${selectedId === a.id ? "border-l-2 border-l-primary bg-muted/60" : "border-l-2 border-l-transparent"}`}
                      data-testid={`agent-row-${a.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate text-xs font-medium leading-tight">{a.name}</span>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${STATUS_CLS[a.status] ?? "bg-muted text-muted-foreground"}`}>{a.status}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 font-mono text-[10px] text-muted-foreground">
                        <span>{activityLine(act, days)}</span>
                        {act?.connectors ? <span>{act.connectors} {act.connectors === 1 ? "connector" : "connectors"}</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </QueryBoundary>
        </div>

        <div className="min-h-0 min-w-0 flex-1">
          {selected ? (
            <AgentSummary agent={selected} activity={activity[selected.id]} days={days} outcomes={outcomesQ.data ?? []} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <Bot className="h-10 w-10 opacity-25" />
              <p className="text-sm">Select one to see what it does and what it has run</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentSummary({ agent, activity, days, outcomes }: { agent: Agent; activity: AgentActivity | undefined; days: number; outcomes: OutcomeContract[] }) {
  const outcome = outcomes.find((o) => o.id === agent.outcomeId);
  const bindings = Array.isArray(agent.policyBindings) ? (agent.policyBindings as unknown[]) : [];
  const skills = Array.isArray(agent.preloadedSkills) ? (agent.preloadedSkills as unknown[]) : [];
  const view = viewOf(agent);

  return (
    <ScrollArea className="h-full">
      <div className="flex max-w-3xl flex-col gap-6 p-6" data-testid={`agent-summary-${agent.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">{agent.name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[VIEW_META[view].label.replace(/s$/, ""), agent.status, agent.environment, agent.modelName].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" asChild data-testid="open-agent"><Link href={`/agents/${agent.id}`}>Open<ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
            <Button size="sm" variant="outline" asChild data-testid="open-playground"><Link href={`/agents/${agent.id}/playground`}><PlayCircle className="mr-1 h-3.5 w-3.5" />Try it</Link></Button>
          </div>
        </div>

        {agent.description && <p className="text-sm leading-relaxed text-muted-foreground">{agent.description}</p>}

        <section>
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">What it has done</h3>
          <div className="rounded border p-3 text-sm">
            <p>{activityLine(activity, days)}</p>
            {activity?.lastRunAt && <p className="mt-0.5 text-xs text-muted-foreground">Last run {formatDateTime(activity.lastRunAt)}</p>}
            <p className="mt-1 text-[11px] text-muted-foreground">Counted from this agent's runs. The registry's old health score, success rate and run total were seed values that nothing updated.</p>
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">What it's set up with</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {[
              ["Connectors", activity?.connectors ?? 0, `/agents/${agent.id}?tab=mcp`],
              ["Policies bound", bindings.length, "/governance"],
              ["Skills preloaded", skills.length, `/agents/${agent.id}?tab=skills`],
              ["Risk tier", agent.riskTier ?? "—", null],
            ].map(([label, value, href]) => (
              <li key={String(label)} className="rounded border px-3 py-2 text-sm">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
                <div className="flex items-center justify-between gap-2">
                  <span className="tabular-nums">{String(value)}</span>
                  {href ? <Link href={String(href)} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">open</Link> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {outcome && (
          <section>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Outcome it serves</h3>
            <Link href={`/outcomes/${outcome.id}`} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm hover:bg-muted/50">
              {outcome.name}<ArrowUpRight className="h-3 w-3" />
            </Link>
          </section>
        )}

        <section>
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Elsewhere</h3>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["Runs and traces", `/agents/${agent.id}?tab=traces`],
              ["Evals", `/evals`],
              ["Deployments", `/deployments`],
              ["Export code", `/agents/${agent.id}/export`],
            ].map(([label, href]) => (
              <Link key={label} href={href} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted/50">
                {label}<ArrowUpRight className="h-3 w-3" />
              </Link>
            ))}
            {agent.status === "draft" && <Badge variant="outline" className="text-[10px]">Draft: it hasn't been deployed</Badge>}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
