/**
 * One agent — five sections instead of twenty-three tabs.
 *
 * Overview (what it is), Runs & tests (what it has done and how it's
 * tested), Setup (what it can use), Rules (what it's held to), Releases
 * (where it runs). Each section loads its own data when opened; the old page
 * fired about thirty queries on mount, twelve of them whole collections.
 *
 * Sections the data says almost nobody uses -- channels, event triggers, API
 * keys -- appear only when this agent actually has them. Everything else is
 * still on the classic page, linked from the header.
 *
 * Truthfulness: the old page's "policy readiness" score (100 minus arbitrary
 * deductions, never evaluating a policy), its hardcoded autonomy guardrail
 * cards rendered as live config, and the model-generated "projected" success
 * and cost on replacement proposals are not carried over. Runs, failures and
 * policy effects here are read from rows.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, ArrowUpRight, Bot, PlayCircle, Save } from "lucide-react";
import { RemoveDialog } from "@/components/remove-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QueryBoundary } from "@/components/ui-vocab";
import { usePermission } from "@/components/role-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/format";
import type { Agent, Deployment, EvalSuite, OutcomeContract, Policy, PolicyException, RunTrace } from "@shared/schema";

// ── Pure helpers (tests/agent-overview.test.ts) ─────────────────────────────

export type Section = "overview" | "runs" | "setup" | "rules" | "releases";

export const SECTIONS: Array<{ id: Section; label: string; hint: string }> = [
  { id: "overview", label: "Overview", hint: "What it is and what it's for" },
  { id: "runs", label: "Runs & tests", hint: "What it has done, and how it's tested" },
  { id: "setup", label: "Setup", hint: "Connectors, skills and knowledge it can use" },
  { id: "rules", label: "Rules", hint: "Policies it's held to, and what they block" },
  { id: "releases", label: "Releases", hint: "Where it runs, and its versions" },
];

/**
 * The section a ?section=<id> link asks for. Anything unrecognized (or absent)
 * opens on Overview, so a stale link degrades to the page's front door rather
 * than a blank panel.
 */
export function sectionFromSearch(search: string): Section {
  const asked = new URLSearchParams(search).get("section");
  return SECTIONS.some((s) => s.id === asked) ? (asked as Section) : "overview";
}

/** What a run's outcome is called, from its recorded status. */
export function runOutcome(status: string | null | undefined): { label: string; tone: "ok" | "bad" | "muted" } {
  if (status === "completed") return { label: "completed", tone: "ok" };
  if (!status) return { label: "unknown", tone: "muted" };
  if (status === "running" || status === "pending") return { label: status, tone: "muted" };
  return { label: status, tone: "bad" };
}

/** Counted from the runs on screen, never from the agent's seeded columns. */
export function runStats(traces: Array<Pick<RunTrace, "status" | "startedAt">>) {
  const failed = traces.filter((t) => t.status && t.status !== "completed" && t.status !== "running" && t.status !== "pending").length;
  const last = traces.map((t) => (t.startedAt ? new Date(t.startedAt).getTime() : 0)).sort((a, b) => b - a)[0];
  return { total: traces.length, failed, lastRunAt: last ? new Date(last).toISOString() : null };
}

/** A policy blocks a call only when its own enforcement says so; anything else is watched. */
export function policyEffect(policy: Pick<Policy, "policyJson">): "blocks" | "monitors" {
  const json = (policy.policyJson ?? {}) as Record<string, any>;
  const enforcement = String(json.enforcement ?? json.enforcement_mode ?? "monitor");
  return ["hard", "strict", "block"].includes(enforcement) ? "blocks" : "monitors";
}

interface ResolvedPolicies {
  effectivePolicies: Policy[];
  orgPolicies?: Policy[];
  outcomePolicies?: Policy[];
  agentPolicies?: Policy[];
  envPolicies?: Policy[];
  bindingPolicies?: Policy[];
  enforcement?: { blockedTools?: string[]; monitoredTools?: string[]; toolAllowlist?: string[] };
  exceptions?: unknown[];
}

/**
 * One row per policy, with the scopes it arrives through. The resolver returns
 * a policy once per scope, so an organization-wide policy that also applies
 * through the outcome was listed two or three times.
 */
export function policiesByScope(resolved: ResolvedPolicies | undefined): Array<{ policy: Policy; scopes: string[] }> {
  if (!resolved) return [];
  const scopeOf: Array<[keyof ResolvedPolicies, string]> = [
    ["orgPolicies", "organization"],
    ["outcomePolicies", "outcome"],
    ["agentPolicies", "this agent"],
    ["envPolicies", "environment"],
    ["bindingPolicies", "binding"],
  ];
  const scopes = new Map<string, string[]>();
  for (const [key, label] of scopeOf) {
    for (const p of (resolved[key] as Policy[] | undefined) ?? []) {
      scopes.set(p.id, [...(scopes.get(p.id) ?? []), label]);
    }
  }
  const seen = new Map<string, { policy: Policy; scopes: string[] }>();
  for (const p of resolved.effectivePolicies ?? []) {
    if (!seen.has(p.id)) seen.set(p.id, { policy: p, scopes: scopes.get(p.id) ?? [] });
  }
  return Array.from(seen.values());
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex min-w-[8rem] flex-col gap-0.5 px-4 py-3" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{children}</h3>;
}

export default function AgentOverview() {
  const [, params] = useRoute("/agents/:id");
  const agentId = params?.id ?? "";
  // After deleting the agent there is nothing left on this page to look at.
  const [, navigate] = useLocation();
  // A ?section= link opens on that section: the registry deep-links straight to
  // an agent's Setup or Runs, and landing on Overview instead made those links
  // look broken.
  const [section, setSection] = useState<Section>(() => sectionFromSearch(typeof window === "undefined" ? "" : window.location.search));
  const { toast } = useToast();
  const canEdit = usePermission("create_modify_blueprints").allowed;

  const agentQ = useQuery<Agent>({ queryKey: ["/api/agents", agentId], enabled: !!agentId });
  const tracesQ = useQuery<RunTrace[]>({ queryKey: [`/api/agents/${agentId}/traces?limit=50`], enabled: !!agentId });
  const agent = agentQ.data;

  const stats = runStats(tracesQ.data ?? []);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="page-agent">
      <QueryBoundary isLoading={agentQ.isLoading} isError={agentQ.isError} error={agentQ.error as Error | null} onRetry={() => agentQ.refetch()}>
        {!agent ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">That agent isn't in this organization, or no longer exists.</div>
        ) : (
          <>
            <div className="border-b">
              <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-2 pt-5">
                <div className="min-w-0">
                  <Link href="/agents" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-testid="back-to-registry">
                    <ArrowLeft className="h-3 w-3" /> All agents
                  </Link>
                  <h1 className="flex items-center gap-2 text-lg font-semibold"><Bot className="h-4 w-4" />{agent.name}</h1>
                  <p className="text-sm text-muted-foreground">
                    {[agent.agentType === "team" ? "Team" : agent.agentType === "remote" ? "Remote agent" : "Agent", agent.status, agent.environment, agent.modelName].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="outline" asChild data-testid="link-playground"><Link href={`/agents/${agent.id}/playground`}><PlayCircle className="mr-1 h-3.5 w-3.5" />Try it</Link></Button>
                  <Button size="sm" variant="ghost" asChild data-testid="link-classic"><Link href={`/agents/${agent.id}/classic`}>Everything else</Link></Button>
                  {/* Deleting an agent lived only on the classic page; it says what goes, including a team's workers. */}
                  <RemoveDialog
                    noun="agent"
                    name={agent.name}
                    planUrl={`/api/agents/${agent.id}/removal`}
                    deleteUrl={`/api/agents/${agent.id}`}
                    invalidate={["/api/agents", "/api/agents?summary=1"]}
                    onDeleted={() => navigate("/agents")}
                    testId="button-remove-agent"
                  />
                </div>
              </div>
              <div className="flex items-stretch divide-x overflow-x-auto px-2 pb-1">
                <Stat label="Runs" value={stats.total} hint="most recent 50" />
                <Stat label="Failed" value={stats.failed} hint="of those runs" />
                <Stat label="Last run" value={stats.lastRunAt ? formatDateTime(stats.lastRunAt) : "never"} />
                <Stat label="Risk tier" value={agent.riskTier ?? "—"} />
              </div>
              <div className="flex gap-1 overflow-x-auto px-4 pb-2" role="tablist" aria-label="Sections">
                {SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    role="tab"
                    aria-selected={section === s.id}
                    title={s.hint}
                    onClick={() => setSection(s.id)}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${section === s.id ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
                    data-testid={`section-${s.id}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="max-w-3xl p-6">
                {section === "overview" && <Overview agent={agent} canEdit={canEdit} toast={toast} />}
                {section === "runs" && <RunsAndTests agent={agent} traces={tracesQ.data ?? []} loading={tracesQ.isLoading} />}
                {section === "setup" && <Setup agent={agent} />}
                {section === "rules" && <Rules agent={agent} />}
                {section === "releases" && <Releases agent={agent} />}
              </div>
            </ScrollArea>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}

function Overview({ agent, canEdit, toast }: { agent: Agent; canEdit: boolean; toast: ReturnType<typeof useToast>["toast"] }) {
  const [description, setDescription] = useState(agent.description ?? "");
  const [model, setModel] = useState(agent.modelName ?? "");
  const [prompt, setPrompt] = useState(agent.systemPrompt ?? "");
  const outcomesQ = useQuery<OutcomeContract[]>({ queryKey: ["/api/outcomes"], enabled: !!agent.outcomeId });
  const outcome = (outcomesQ.data ?? []).find((o) => o.id === agent.outcomeId);
  const dirty = description !== (agent.description ?? "") || model !== (agent.modelName ?? "") || prompt !== (agent.systemPrompt ?? "");

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PATCH", `/api/agents/${agent.id}`, { description, modelName: model, systemPrompt: prompt })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents?summary=1"] });
      toast({ title: "Saved", description: "The change is recorded in the audit trail." });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionHeading>What it's for</SectionHeading>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit} className="min-h-[72px] text-sm" placeholder="What this agent is for, in a sentence." data-testid="input-description" />
      </section>

      <section>
        <SectionHeading>How it thinks</SectionHeading>
        <div className="flex flex-col gap-2">
          <label className="text-xs text-muted-foreground">Model</label>
          <Input value={model} onChange={(e) => setModel(e.target.value)} disabled={!canEdit} className="h-8 max-w-sm text-sm" data-testid="input-model" />
          <label className="mt-2 text-xs text-muted-foreground">Instructions</label>
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={!canEdit} className="min-h-[160px] font-mono text-xs" placeholder="No instructions set." data-testid="input-prompt" />
          <p className="text-[11px] text-muted-foreground">Autonomy is {String(agent.autonomyMode ?? "assisted").replace(/_/g, " ")}; change it in the classic page.</p>
        </div>
      </section>

      {canEdit && (
        <div className="sticky bottom-0 -mx-6 border-t bg-background/95 px-6 py-3 backdrop-blur">
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()} data-testid="button-save"><Save className="mr-1 h-3.5 w-3.5" />Save changes</Button>
          {dirty && <span className="ml-2 text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
      )}

      {outcome && (
        <section>
          <SectionHeading>Outcome it serves</SectionHeading>
          <Link href={`/outcomes/${outcome.id}`} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm hover:bg-muted/50">{outcome.name}<ArrowUpRight className="h-3 w-3" /></Link>
        </section>
      )}
    </div>
  );
}

function RunsAndTests({ agent, traces, loading }: { agent: Agent; traces: RunTrace[]; loading: boolean }) {
  const evalsQ = useQuery<EvalSuite[]>({ queryKey: ["/api/agents", agent.id, "evals"] });
  const suites = evalsQ.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionHeading>Its runs</SectionHeading>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : traces.length === 0 ? (
          <p className="text-sm text-muted-foreground">It hasn't run yet.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded border" data-testid="run-list">
            {traces.slice(0, 25).map((t) => {
              const outcome = runOutcome(t.status);
              return (
                <li key={t.id} className="flex items-center gap-2 p-2.5 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${outcome.tone === "ok" ? "bg-emerald-500" : outcome.tone === "bad" ? "bg-red-500" : "bg-muted-foreground/40"}`} aria-label={outcome.label} />
                  <span className="min-w-0 flex-1 truncate">{t.inputSummary || "No input recorded"}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{t.latencyMs ? `${Math.round(t.latencyMs / 100) / 10}s` : ""}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{t.startedAt ? formatDateTime(t.startedAt) : ""}</span>
                  <Link href={`/agents/${agent.id}/runs/${t.id}`} className="shrink-0 text-xs text-muted-foreground hover:text-foreground" data-testid={`run-${t.id}`}>open</Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">The 50 most recent runs recorded for this agent.</p>
      </section>

      <section>
        <SectionHeading>How it's tested</SectionHeading>
        {evalsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : suites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No eval suite covers it yet.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded border">
            {suites.map((s) => (
              <li key={s.id} className="flex items-center gap-2 p-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{s.passRate != null ? `${Math.round(s.passRate * 1000) / 10}% passed` : "not run"}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/evals" className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Eval Studio<ArrowUpRight className="h-3 w-3" /></Link>
      </section>
    </div>
  );
}

function Setup({ agent }: { agent: Agent }) {
  const connectorsQ = useQuery<Array<{ id: string; serverId: string; name?: string }>>({ queryKey: [`/api/agents/${agent.id}/mcp-servers`] });
  // The endpoint answers { links, knowledgeBases }, not an array. Typed as an
  // array, `(data ?? []).length === 0` was `undefined === 0` -- false -- so the
  // page went on to .map() an object and took the whole Setup section down with
  // the error boundary, on every agent, whether or not a base was attached.
  const knowledgeQ = useQuery<{ links: Array<{ id: string; knowledgeBaseId?: string }>; knowledgeBases: Array<{ id: string; name?: string }> }>({
    queryKey: [`/api/agents/${agent.id}/knowledge-bases`],
  });
  const knowledgeBases = knowledgeQ.data?.knowledgeBases ?? [];
  const skills = Array.isArray(agent.preloadedSkills) ? (agent.preloadedSkills as Array<Record<string, any>>) : [];
  const tags = Array.isArray(agent.ontologyTags) ? (agent.ontologyTags as Array<{ conceptLabel?: string }>) : [];

  const Block = ({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) => (
    <section>
      <SectionHeading>{title}</SectionHeading>
      {children ?? <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  );

  return (
    <div className="flex flex-col gap-6">
      <Block title="Connectors it can call" empty="None linked.">
        {(connectorsQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{connectorsQ.isLoading ? "Loading…" : "None linked. Astra can attach one."}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" data-testid="connector-list">
            {(connectorsQ.data ?? []).map((c) => (
              <li key={c.id}><Link href="/integrations" className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted/50">{c.name ?? c.serverId}<ArrowUpRight className="h-3 w-3" /></Link></li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Knowledge it can search" empty="None attached.">
        {knowledgeBases.length === 0 ? (
          <p className="text-sm text-muted-foreground">{knowledgeQ.isLoading ? "Loading…" : "None attached."}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" data-testid="knowledge-list">
            {knowledgeBases.map((k) => (
              <li key={k.id}><Link href="/knowledge-bases" className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted/50">{k.name ?? k.id}<ArrowUpRight className="h-3 w-3" /></Link></li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Skills it starts with" empty="None preloaded.">
        {skills.length === 0 ? <p className="text-sm text-muted-foreground">None preloaded.</p> : (
          <ul className="flex flex-wrap gap-1.5">
            {skills.map((s, i) => <li key={i}><Badge variant="outline" className="text-[11px]">{s.name ?? s.skillId ?? `skill ${i + 1}`}</Badge></li>)}
          </ul>
        )}
      </Block>

      <Block title="What it's about" empty="No ontology tags.">
        {tags.length === 0 ? <p className="text-sm text-muted-foreground">No ontology tags.</p> : (
          <ul className="flex flex-wrap gap-1.5">{tags.map((t, i) => <li key={i}><Badge variant="outline" className="text-[11px]">{t.conceptLabel ?? "tag"}</Badge></li>)}</ul>
        )}
      </Block>
    </div>
  );
}

function Rules({ agent }: { agent: Agent }) {
  const resolvedQ = useQuery<ResolvedPolicies>({ queryKey: [`/api/policies/resolve/${agent.id}`] });
  const exceptionsQ = useQuery<PolicyException[]>({ queryKey: [`/api/policy-exceptions/agent/${agent.id}`] });
  const policies = policiesByScope(resolvedQ.data);
  const blocked = resolvedQ.data?.enforcement?.blockedTools ?? [];
  const monitored = resolvedQ.data?.enforcement?.monitoredTools ?? [];
  const exceptions = exceptionsQ.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionHeading>Policies in force</SectionHeading>
        {resolvedQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : policies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No policy applies to it.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded border" data-testid="policy-list">
            {policies.map(({ policy: p, scopes }) => (
              <li key={p.id} className="flex items-center gap-2 p-2.5 text-sm">
                <Link href={`/governance?policy=${encodeURIComponent(p.id)}`} className="min-w-0 flex-1 truncate hover:underline">{p.name}</Link>
                {scopes.length > 0 && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">via {scopes.join(", ")}</span>}
                <span className={`shrink-0 font-mono text-[10px] ${policyEffect(p) === "blocks" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{policyEffect(p)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading>At run time</SectionHeading>
        <div className="rounded border p-3 text-sm">
          <p>{blocked.length ? <>Blocked: <span className="font-mono text-xs">{blocked.join(", ")}</span></> : "No tool is blocked for it."}</p>
          {monitored.length > 0 && <p className="mt-1 text-muted-foreground">Watched: <span className="font-mono text-xs">{monitored.join(", ")}</span></p>}
        </div>
      </section>

      <section>
        <SectionHeading>Exceptions</SectionHeading>
        {exceptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is exempt for this agent.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded border">
            {exceptions.map((e) => (
              <li key={e.id} className="p-2.5 text-sm">
                <div className="truncate">{e.reason}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{[e.status, e.expiresAt ? `expires ${formatDateTime(e.expiresAt)}` : "no expiry"].join(" · ")}</div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">An approved exception is recorded; the runtime doesn't read exceptions yet.</p>
      </section>
    </div>
  );
}

function Releases({ agent }: { agent: Agent }) {
  const deploymentsQ = useQuery<Deployment[]>({ queryKey: ["/api/deployments"] });
  const versionsQ = useQuery<any[]>({ queryKey: ["/api/agents", agent.id, "versions"] });
  const mine = useMemo(() => (deploymentsQ.data ?? []).filter((d) => d.agentId === agent.id), [deploymentsQ.data, agent.id]);
  const versions = Array.isArray(versionsQ.data) ? versionsQ.data : [];

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionHeading>Where it runs</SectionHeading>
        {deploymentsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">It isn't deployed anywhere.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded border" data-testid="deployment-list">
            {mine.map((d) => (
              <li key={d.id} className="flex items-center gap-2 p-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{d.environment}{d.version ? ` · ${d.version}` : ""}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{d.status}</span>
                <Link href="/deployments" className="shrink-0 text-xs text-muted-foreground hover:text-foreground">open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading>Versions</SectionHeading>
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No version has been cut.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {versions.slice(0, 12).map((v: any) => <li key={v.id ?? v.semver}><Badge variant="outline" className="text-[11px]">{v.semver ?? v.version}</Badge></li>)}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading>Elsewhere</SectionHeading>
        <div className="flex flex-wrap gap-1.5">
          {[
            ["Its blueprint", `/agents/${agent.id}/classic?tab=blueprint`],
            ["Export the code", `/agents/${agent.id}/export`],
            ["Runtime, channels and triggers", `/agents/${agent.id}/classic`],
          ].map(([label, href]) => (
            <Link key={label} href={href} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted/50">{label}<ArrowUpRight className="h-3 w-3" /></Link>
          ))}
        </div>
      </section>
    </div>
  );
}
