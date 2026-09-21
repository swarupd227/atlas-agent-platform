/**
 * Deployments — one page: what is live, what is waiting on a person, and what
 * is mid-rollout.
 *
 * The old page stacked three environment cards, a freeze panel and a release
 * list, so the same deployment appeared in several places and nothing said
 * which one needed attention first. Here the list is every deployment, the
 * ones that need a decision first, and the detail carries the environment,
 * the rollout, the pending approval and what a promotion would touch.
 *
 * Truthfulness: statuses and counts come from the deployment rows; the blast
 * radius is whatever the server counted, including what it could not measure
 * (server/blast-radius.ts).
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Rocket, Search, ArrowUpRight, Inbox, Snowflake, AlertTriangle, Plus,
  ShieldCheck, Undo2, Play, Square,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/ui-vocab";
import { BlastRadius, type BlastRadiusData } from "@/components/blast-radius";
import { usePermission } from "@/components/role-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/format";
import { CreateReleaseWizard, FreezeCenter } from "@/pages/deployments";
import type { Agent, Approval, Deployment, EvalSuite } from "@shared/schema";

interface FreezeStatus { frozen: boolean; scope?: string; reason?: string; frozenBy?: string; frozenAt?: string }

const ENV_LABEL: Record<string, string> = { staging: "Staging", pilot: "Pilot", prod: "Production" };
/** Rows record production as both "prod" and "production"; they are the same place. */
export const normEnv = (e?: string | null) => (e === "production" ? "prod" : e ?? "");
const envLabel = (e?: string | null) => ENV_LABEL[normEnv(e)] ?? (e || "unknown");

/**
 * A deployment's display name: the name stored on it, else its agent's current
 * name, else a plain statement that the agent is gone -- never a raw id.
 */
export function deploymentName(d: { agentName?: string | null; agentId: string }, agentNames: Map<string, string>): string {
  return d.agentName || agentNames.get(d.agentId) || "Agent no longer exists";
}

/** Sort order: what needs a person, then what is moving, then what is live. */
const STATUS_RANK: Record<string, number> = { pending: 0, canary: 1, deployed: 2, active: 2, promoted: 3, inactive: 4, rolled_back: 5, failed: 5 };
const rankOf = (d: Deployment) => STATUS_RANK[d.status ?? ""] ?? 6;

const statusTone = (status?: string | null) =>
  status === "pending" ? "text-amber-600 dark:text-amber-400"
  : status === "canary" ? "text-primary"
  : status === "deployed" || status === "active" ? "text-emerald-600 dark:text-emerald-400"
  : status === "rolled_back" || status === "failed" ? "text-red-600 dark:text-red-400"
  : "text-muted-foreground";

function Stat({ label, value, hint, tone, to }: { label: string; value: string; hint?: string; tone?: string; to?: string }) {
  const body = (
    <div className="flex flex-col gap-0.5 px-4 py-3 min-w-[9rem]">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${tone ?? ""}`}>{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
  return to ? (
    <Link href={to} className="group rounded-md hover:bg-muted/50 transition-colors" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="relative">{body}<ArrowUpRight className="w-3 h-3 absolute right-2 top-3 opacity-0 group-hover:opacity-60" /></div>
    </Link>
  ) : <div data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{body}</div>;
}

export default function DeploymentsOverview() {
  const [query, setQuery] = useState("");
  const [env, setEnv] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [showFreeze, setShowFreeze] = useState(false);
  const { toast } = useToast();
  const stagingPerm = usePermission("deploy_staging_pilot");

  const deploymentsQ = useQuery<Deployment[]>({ queryKey: ["/api/deployments"] });
  const agentsQ = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const approvalsQ = useQuery<Approval[]>({ queryKey: ["/api/approvals"] });
  const evalSuitesQ = useQuery<EvalSuite[]>({ queryKey: ["/api/eval-suites"] });
  const freezeQ = useQuery<Record<string, FreezeStatus>>({ queryKey: ["/api/deployments/freeze-status"] });

  const deployments = deploymentsQ.data ?? [];
  const agents = agentsQ.data ?? [];
  const approvals = approvalsQ.data ?? [];
  const freezes = freezeQ.data ?? {};

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => (await apiRequest("POST", "/api/deployments", data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      setCreateOpen(false);
      toast({ title: "Release created" });
    },
    onError: (err: Error) => toast({ title: "Couldn't create the release", description: err.message, variant: "destructive" }),
  });

  const live = deployments.filter((d) => d.status === "deployed" || d.status === "active");
  const pending = deployments.filter((d) => d.status === "pending");
  const canaries = deployments.filter((d) => d.status === "canary");
  const frozenScopes = Object.entries(freezes).filter(([, v]) => v?.frozen);
  const lastDeployAt = deployments.reduce<string | null>((latest, d) => {
    const at = (d.deployedAt ?? d.createdAt) as unknown as string | null;
    return at && (!latest || new Date(at) > new Date(latest)) ? at : latest;
  }, null);

  const agentNames = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);

  const pendingApprovalFor = useMemo(() => {
    const byObject = new Map<string, Approval>();
    for (const a of approvals) {
      if (a.status === "pending" && a.objectId) byObject.set(a.objectId, a);
    }
    return byObject;
  }, [approvals]);

  const filtered = deployments
    .filter((d) => (env === "all" ? true : normEnv(d.environment) === env))
    .filter((d) => (query ? `${deploymentName(d, agentNames)} ${d.version ?? ""}`.toLowerCase().includes(query.toLowerCase()) : true))
    .sort((a, b) => rankOf(a) - rankOf(b) || deploymentName(a, agentNames).localeCompare(deploymentName(b, agentNames)));

  const selected = deployments.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="page-deployments">
      <div className="border-b">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-1 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2"><Rocket className="w-4 h-4" /> Deployments</h1>
            <p className="text-sm text-muted-foreground">What is live, what is waiting on a person, and what is mid-rollout.</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button size="sm" disabled={!stagingPerm.allowed} onClick={() => setCreateOpen(true)} title={stagingPerm.allowed ? undefined : "You do not have permission to create deployments"} data-testid="button-create-deployment">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> New release
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowFreeze((v) => !v)} data-testid="button-freeze-center">
              <Snowflake className="w-3.5 h-3.5 mr-1.5" /> Freezes
            </Button>
            <Button variant="ghost" size="sm" asChild data-testid="link-classic"><Link href="/deployments/classic">Classic view</Link></Button>
          </div>
        </div>
        <div className="flex items-stretch divide-x px-2 pb-1 overflow-x-auto">
          <Stat label="Live" value={`${live.length}`} hint={`across ${new Set(live.map((d) => normEnv(d.environment))).size} environment${new Set(live.map((d) => normEnv(d.environment))).size === 1 ? "" : "s"}`} />
          <Stat label="Waiting on you" value={`${pending.length}`} tone={pending.length ? "text-amber-600 dark:text-amber-400" : ""} hint="pending a decision" to="/approvals" />
          <Stat label="Rolling out" value={`${canaries.length}`} tone={canaries.length ? "text-primary" : ""} hint="canary in progress" />
          <Stat label="Frozen" value={`${frozenScopes.length}`} tone={frozenScopes.length ? "text-primary" : ""} hint={frozenScopes.length ? frozenScopes.map(([k]) => k).join(", ") : "nothing frozen"} />
          <Stat label="Last release" value={lastDeployAt ? formatDateTime(lastDeployAt) : "never"} hint={`${deployments.length} in total`} />
        </div>
      </div>

      {showFreeze && (
        <div className="border-b px-6 py-4 bg-muted/20" data-testid="freeze-panel">
          <FreezeCenter agents={agents} deployments={deployments} />
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <div className="w-80 border-r flex flex-col min-h-0 shrink-0">
          <div className="p-3 flex flex-col gap-2 border-b">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by agent or version" className="h-8 pl-7 text-xs" data-testid="input-search-deployments" />
            </div>
            <Select value={env} onValueChange={setEnv}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-environment"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All environments</SelectItem>
                {["staging", "pilot", "prod"].map((e) => <SelectItem key={e} value={e}>{envLabel(e)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <QueryBoundary isLoading={deploymentsQ.isLoading} isError={deploymentsQ.isError} error={deploymentsQ.error as Error | null} onRetry={() => deploymentsQ.refetch()}>
            {/* Radix wraps the viewport content in display:table, which grows to the widest row
                and defeats truncation; block layout keeps rows to the panel width. */}
            <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
              <div className="flex flex-col divide-y">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 px-6">
                    <Inbox className="w-8 h-8 opacity-25" />
                    <p className="text-xs text-muted-foreground text-center">{deployments.length === 0 ? "No deployments yet" : "No deployment matches your filters"}</p>
                  </div>
                ) : filtered.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedId(d.id)}
                    className={`flex flex-col gap-1.5 p-3 text-left w-full transition-colors hover:bg-muted/40 ${selectedId === d.id ? "bg-muted/60 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
                    data-testid={`deployment-row-${d.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`min-w-0 text-xs font-medium truncate leading-tight ${agentNames.has(d.agentId) || d.agentName ? "" : "text-muted-foreground italic"}`}>{deploymentName(d, agentNames)}</span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{envLabel(d.environment)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px] text-muted-foreground">
                      <span className={statusTone(d.status)}>{(d.status ?? "unknown").replace(/_/g, " ")}</span>
                      {d.version && <span>v{d.version}</span>}
                      {(d.canaryPercent ?? 0) > 0 && <span className="text-primary">canary {d.canaryPercent}%</span>}
                      {pendingApprovalFor.has(d.id) && <span className="text-amber-600 dark:text-amber-400">approval waiting</span>}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </QueryBoundary>
        </div>

        <div className="flex-1 min-h-0 min-w-0">
          {selected ? (
            <DeploymentDetail deployment={selected} name={deploymentName(selected, agentNames)} agentExists={agentNames.has(selected.agentId)} approval={pendingApprovalFor.get(selected.id)} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Rocket className="w-10 h-10 opacity-25" />
              <p className="text-sm">Select a deployment to see where it stands</p>
            </div>
          )}
        </div>
      </div>

      <CreateReleaseWizard
        open={createOpen}
        onOpenChange={setCreateOpen}
        agents={agents}
        approvals={approvals}
        evalSuites={evalSuitesQ.data ?? []}
        onSubmit={(data: Record<string, any>) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />
    </div>
  );
}

interface Readiness {
  checks?: Array<{ name: string; status: string; detail?: string; value?: string }>;
  overallStatus?: string;
  blastRadius?: BlastRadiusData;
}

function DeploymentDetail({ deployment, name, agentExists, approval }: { deployment: Deployment; name: string; agentExists: boolean; approval?: Approval }) {
  const { toast } = useToast();
  const stagingPerm = usePermission("deploy_staging_pilot");
  const prodPerm = usePermission("deploy_prod");
  const readinessQ = useQuery<Readiness>({ queryKey: [`/api/deployments/${deployment.id}/readiness`], retry: false });
  const readiness = readinessQ.data;

  const here = normEnv(deployment.environment);
  const nextEnv = here === "staging" ? "pilot" : here === "pilot" ? "prod" : null;
  const canPromote = nextEnv === "prod" ? prodPerm.allowed : stagingPerm.allowed;

  const act = useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: Record<string, unknown> }) =>
      (await apiRequest("POST", `/api/deployments/${deployment.id}/${path}`, body ?? {})).json(),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      queryClient.invalidateQueries({ queryKey: [`/api/deployments/${deployment.id}/readiness`] });
      toast({ title: vars.path === "promote" ? "Promotion requested" : vars.path === "rollback" ? "Rolled back" : "Done" });
    },
    onError: (err: Error) => toast({ title: "That didn't go through", description: err.message, variant: "destructive" }),
  });

  return (
    <ScrollArea className="h-full">
      <div className="p-6 flex flex-col gap-6 max-w-3xl">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold">{name}</h2>
            <Badge variant="outline" className="text-[10px]">{envLabel(deployment.environment)}</Badge>
            {deployment.version && <Badge variant="outline" className="text-[10px]">v{deployment.version}</Badge>}
            <span className={`text-xs ${statusTone(deployment.status)}`}>{(deployment.status ?? "unknown").replace(/_/g, " ")}</span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
            {[
              deployment.deployedAt ? `deployed ${formatDateTime(deployment.deployedAt as unknown as string)}` : null,
              (deployment.canaryPercent ?? 0) > 0 ? `canary at ${deployment.canaryPercent}%` : null,
              deployment.shadowEnabled ? "shadow on" : null,
              deployment.approvedBy ? `approved by ${deployment.approvedBy}` : null,
            ].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-2 flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs" asChild data-testid="link-release-detail"><Link href={`/deployments/${deployment.id}`}>Open release</Link></Button>
            {agentExists && <Button size="sm" variant="outline" className="h-7 text-xs" asChild data-testid="link-agent"><Link href={`/agents/${deployment.agentId}`}>Open agent</Link></Button>}
          </div>
          {!agentExists && (
            <p className="mt-2 text-xs text-muted-foreground" data-testid="orphan-note">
              The agent this deployment was for no longer exists in your organization, so it can't be promoted or run. Rolling it back clears it from the list of pending deployments.
            </p>
          )}
        </div>

        {approval && (
          <section className="rounded border border-amber-500/30 bg-amber-500/5 p-3" data-testid="pending-approval">
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
              <div>
                <div>{(approval.type ?? "approval").replace(/_/g, " ")} is waiting on a decision.</div>
                <div className="font-mono text-[11px] text-muted-foreground">{approval.description?.slice(0, 160)}</div>
                <Link href="/approvals" className="text-xs underline underline-offset-2" data-testid="link-approvals">Decide it in Approvals</Link>
              </div>
            </div>
          </section>
        )}

        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Readiness</h3>
          {readinessQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Checking…</p>
          ) : readinessQ.isError || !readiness?.checks?.length ? (
            <p className="text-sm text-muted-foreground">No readiness checks are available for this deployment.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded border">
              {readiness.checks.map((c, i) => (
                <li key={i} className="flex items-start gap-2 p-2.5 text-sm" data-testid={`check-${i}`}>
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${c.status === "pass" ? "bg-emerald-500" : c.status === "fail" ? "bg-red-500" : "bg-amber-500"}`} />
                  <div className="min-w-0">
                    <div>{c.name}</div>
                    {(c.detail || c.value) && <div className="font-mono text-[10px] text-muted-foreground">{[c.value, c.detail].filter(Boolean).join(" · ")}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {readiness?.overallStatus && (
            <p className="mt-2 text-[11px] text-muted-foreground">Overall: {readiness.overallStatus.replace(/_/g, " ")}</p>
          )}
        </section>

        {readiness?.blastRadius && (
          <section>
            <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">If this changes</h3>
            <BlastRadius data={readiness.blastRadius} testIdPrefix="deployment" />
          </section>
        )}

        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Actions</h3>
          <div className="flex gap-2 flex-wrap">
            {nextEnv && agentExists && (
              <Button
                size="sm" variant="outline" className="h-7 text-xs"
                disabled={!canPromote || act.isPending}
                title={canPromote ? undefined : `You do not have permission to promote into ${envLabel(nextEnv)}`}
                onClick={() => act.mutate({ path: "promote" })}
                data-testid="button-promote"
              >
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Promote to {envLabel(nextEnv)}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!stagingPerm.allowed || act.isPending} onClick={() => act.mutate({ path: "rollback", body: { reason: "Rolled back from the deployments page" } })} data-testid="button-rollback">
              <Undo2 className="w-3.5 h-3.5 mr-1.5" /> Roll back
            </Button>
            {!agentExists ? null : deployment.status === "deployed" || deployment.status === "active" ? (
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!stagingPerm.allowed || act.isPending} onClick={() => act.mutate({ path: "stop-runtime" })} data-testid="button-stop-runtime">
                <Square className="w-3.5 h-3.5 mr-1.5" /> Stop runtime
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!stagingPerm.allowed || act.isPending} onClick={() => act.mutate({ path: "start-runtime" })} data-testid="button-start-runtime">
                <Play className="w-3.5 h-3.5 mr-1.5" /> Start runtime
              </Button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Promotion runs the gates and files an approval; it does not move the deployment by itself. Reaching production needs the production-deploy permission.
          </p>
        </section>
      </div>
    </ScrollArea>
  );
}
