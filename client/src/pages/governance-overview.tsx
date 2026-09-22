/**
 * Governance — one page, no tabs.
 *
 * Replaces the six-tab Governance page (Coverage, Live Feed, Control Points,
 * Exceptions, Policy Rules, Audit Log). Policies are the spine: the header
 * states what is in force and what needs a person, the list is every policy,
 * and a policy's detail carries its rules, where it applies, its exceptions
 * and its tests. The list can switch to Regulations: the shared regulation
 * catalogue, each with the policies you took from it, the rules you can
 * still adopt and the requirements it lists. The old Policy Engine's editor
 * and change tracker are not carried over; admins edit the catalogue there.
 *
 * Truthfulness: every figure here is counted from real rows (policies,
 * bindings, exceptions, the audit chain verifier). No compliance score is
 * shown, because the ones the platform computes today are not measured.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Shield, ShieldAlert, ShieldCheck, Search, Link2, FlaskConical, ArrowUpRight,
  CalendarClock, Inbox, CheckCircle2, XCircle, AlertTriangle, ScrollText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary, EmptyState } from "@/components/ui-vocab";
import { usePermission, useRole } from "@/components/role-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/format";
import type { Agent, Policy, PolicyException, Approval, Regulation, RegulatoryPolicy, ComplianceControl } from "@shared/schema";

interface ChainResult {
  valid: boolean;
  totalEvents: number;
  chainedEvents: number;
  signatureValid?: boolean;
  message?: string;
}

const DOMAIN_LABEL: Record<string, string> = {
  data_handling: "Data handling",
  tool_use: "Tool use",
  disclosure: "Disclosure",
  retention: "Retention",
  escalation: "Escalation",
  financial: "Financial",
};

const domainLabel = (d?: string | null) => DOMAIN_LABEL[d ?? ""] ?? ((d ?? "").replace(/_/g, " ") || "General");

/**
 * The same rule the runtime applies (resolvePolicyBundle in
 * server/routes/helpers.ts): a policy blocks only when its own enforcement
 * says hard/strict/block; anything else is monitored, and a per-agent binding
 * can raise a monitored policy to hard for that agent alone.
 */
export function enforcementOf(policy: Policy): "blocks" | "monitors" {
  const json = (policy.policyJson ?? {}) as Record<string, any>;
  const enforcement = String(json.enforcement ?? json.enforcement_mode ?? "monitor");
  return ["hard", "strict", "block"].includes(enforcement) ? "blocks" : "monitors";
}

/** Tools this policy names, and whether it actually stops them. */
export function toolsTouched(policy: Policy): { blocked: string[]; allowlist: string[] } {
  const json = (policy.policyJson ?? {}) as Record<string, any>;
  return {
    blocked: Array.isArray(json.blockedTools) ? json.blockedTools.map(String) : [],
    allowlist: Array.isArray(json.toolAllowlist) ? json.toolAllowlist.map(String) : [],
  };
}

function ruleCount(policy: Policy): number {
  const json = (policy.policyJson ?? {}) as Record<string, any>;
  return Array.isArray(json.rules) ? json.rules.length : 0;
}

/** Agents that name this policy in their bindings. */
export function boundAgents(agents: Agent[], policy: Policy): Agent[] {
  return agents.filter((a) => {
    const bindings = a.policyBindings as any;
    const list: any[] = Array.isArray(bindings) ? bindings : Array.isArray(bindings?.policies) ? bindings.policies : [];
    return list.some((b) => (typeof b === "string" ? b === policy.name : b?.policyId === policy.id || b?.policyName === policy.name || b?.name === policy.name));
  });
}

const isExpired = (e: PolicyException) => !!e.expiresAt && new Date(e.expiresAt).getTime() < Date.now();

function Stat({ label, value, tone, to, hint }: { label: string; value: string; tone?: "ok" | "warn" | "bad"; to?: string; hint?: string }) {
  const toneClass = tone === "bad" ? "text-red-600 dark:text-red-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "";
  const body = (
    <div className="flex flex-col gap-0.5 px-4 py-3 min-w-[9rem]">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
  return to ? (
    <Link href={to} className="group rounded-md hover:bg-muted/50 transition-colors" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="relative">{body}<ArrowUpRight className="w-3 h-3 absolute right-2 top-3 opacity-0 group-hover:opacity-60" /></div>
    </Link>
  ) : (
    <div data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{body}</div>
  );
}

export function policyFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get("policy");
  return id && id.trim() ? id.trim() : null;
}

export function regulationFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get("regulation");
  return id && id.trim() ? id.trim() : null;
}

/** Rules a policy was made from, as "push to governance" records them. */
function sourceRules(policy: Policy): Array<{ sourceRegulationId?: string; sourcePolicyId?: string }> {
  const rules = ((policy.policyJson ?? {}) as Record<string, any>).rules;
  return Array.isArray(rules) ? rules : [];
}

/** The organization's policies that were taken from this regulation. */
export function policiesFromRegulation(policies: Policy[], regulationId: string): Policy[] {
  return policies.filter((p) => sourceRules(p).some((r) => r?.sourceRegulationId === regulationId));
}

/** Catalogue rules the organization has already adopted, by rule id. */
export function adoptedRuleIds(policies: Policy[]): Set<string> {
  const ids = new Set<string>();
  for (const p of policies) for (const r of sourceRules(p)) if (r?.sourcePolicyId) ids.add(String(r.sourcePolicyId));
  return ids;
}

export function coverageCounts(controls: Array<{ coverageStatus: string }>): { full: number; partial: number; gap: number } {
  return {
    full: controls.filter((c) => c.coverageStatus === "full").length,
    partial: controls.filter((c) => c.coverageStatus === "partial").length,
    gap: controls.filter((c) => c.coverageStatus === "gap").length,
  };
}

const industryLabel = (i?: string | null) => (i ?? "").replace(/_/g, " ") || "any industry";

export default function GovernanceOverview() {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("all");
  // ?policy=<id> opens that policy: Astra's cards and the Library link straight to it.
  const [selectedId, setSelectedId] = useState<string | null>(() => policyFromSearch(typeof window === "undefined" ? "" : window.location.search));
  // ?regulation=<id> opens the Regulations list on that regulation.
  const [selectedRegId, setSelectedRegId] = useState<string | null>(() => regulationFromSearch(typeof window === "undefined" ? "" : window.location.search));
  const [view, setView] = useState<"policies" | "regulations">(() =>
    selectedRegId || (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "regulations") ? "regulations" : "policies",
  );
  const { toast } = useToast();
  const canExportAudit = usePermission("export_audit_bundle").allowed;
  // Editing the shared catalogue is admin-only on the server (manage_platform_settings); this only hides the link.
  const canEditCatalogue = useRole().role.id === "admin";

  const policiesQ = useQuery<Policy[]>({ queryKey: ["/api/policies"] });
  const agentsQ = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const exceptionsQ = useQuery<PolicyException[]>({ queryKey: ["/api/policy-exceptions"] });
  const approvalsQ = useQuery<Approval[]>({ queryKey: ["/api/approvals"] });
  const chainQ = useQuery<ChainResult>({ queryKey: ["/api/audit-events/verify-chain"], enabled: canExportAudit, retry: false });
  const regulationsQ = useQuery<Regulation[]>({ queryKey: ["/api/regulations"] });

  const policies = policiesQ.data ?? [];
  // Opened from a link: bring that policy's row into view once the list has loaded.
  const linkedId = useRef(selectedId);
  useEffect(() => {
    if (!linkedId.current || policies.length === 0) return;
    document.querySelector(`[data-testid="policy-row-${CSS.escape(linkedId.current)}"]`)?.scrollIntoView({ block: "center" });
    linkedId.current = null;
  }, [policies.length]);
  const agents = agentsQ.data ?? [];
  const exceptions = exceptionsQ.data ?? [];
  const approvals = approvalsQ.data ?? [];

  const active = policies.filter((p) => p.status === "active");
  const blocking = active.filter((p) => enforcementOf(p) === "blocks").length;
  const governedAgents = useMemo(
    () => agents.filter((a) => active.some((p) => boundAgents([a], p).length > 0)).length,
    [agents, policies],
  );
  const liveExceptions = exceptions.filter((e) => e.status === "approved" && !isExpired(e));
  const pendingExceptions = exceptions.filter((e) => e.status === "pending");
  const expiredExceptions = exceptions.filter((e) => e.status === "approved" && isExpired(e));
  const pendingApprovals = approvals.filter((a) => a.status === "pending");

  const filtered = policies
    .filter((p) => (domain === "all" ? true : p.domain === domain))
    .filter((p) => (query ? `${p.name} ${p.description ?? ""}`.toLowerCase().includes(query.toLowerCase()) : true))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selected = policies.find((p) => p.id === selectedId) ?? null;
  const regulations = regulationsQ.data ?? [];
  const regulationRows = regulations
    .map((r) => ({ reg: r, yours: policiesFromRegulation(policies, r.id).length }))
    .filter(({ reg }) => (query ? `${reg.name} ${reg.fullName} ${reg.jurisdiction} ${reg.industry}`.toLowerCase().includes(query.toLowerCase()) : true))
    // The ones your policies come from first, then by name.
    .sort((a, b) => Number(b.yours > 0) - Number(a.yours > 0) || a.reg.name.localeCompare(b.reg.name));
  const selectedReg = regulations.find((r) => r.id === selectedRegId) ?? null;
  const openPolicy = (id: string) => {
    setView("policies");
    setSelectedId(id);
    setTimeout(() => document.querySelector(`[data-testid="policy-row-${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center" }), 50);
  };
  const domains = Array.from(new Set(policies.map((p) => p.domain).filter(Boolean))) as string[];

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="page-governance">
      {/* ── What is in force ── */}
      <div className="border-b">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-1 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2"><Shield className="w-4 h-4" /> Governance</h1>
            <p className="text-sm text-muted-foreground">What your agents are held to, who is exempt, and whether the record holds.</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="outline" size="sm" asChild data-testid="link-audit-trail"><Link href="/audit-trail"><ScrollText className="w-3.5 h-3.5 mr-1.5" />Audit trail</Link></Button>
            {canEditCatalogue && <Button variant="ghost" size="sm" asChild data-testid="link-policy-engine"><Link href="/governance/policy-engine">Edit regulation catalogue</Link></Button>}
            <Button variant="ghost" size="sm" asChild data-testid="link-classic"><Link href="/governance/classic">Classic view</Link></Button>
          </div>
        </div>
        <div className="flex items-stretch divide-x px-2 pb-1 overflow-x-auto">
          <Stat label="In force" value={`${active.length}`} hint={`${blocking} block calls, ${active.length - blocking} monitor only`} />
          <Stat label="Agents covered" value={`${governedAgents} of ${agents.length}`} hint={agents.length && governedAgents < agents.length ? `${agents.length - governedAgents} with no policy bound` : "every agent bound"} tone={agents.length && governedAgents < agents.length ? "warn" : "ok"} />
          <Stat label="Exceptions" value={`${liveExceptions.length}`} hint={expiredExceptions.length ? `${expiredExceptions.length} past expiry` : pendingExceptions.length ? `${pendingExceptions.length} awaiting a decision` : "none expired"} tone={expiredExceptions.length ? "bad" : undefined} />
          <Stat label="Waiting on you" value={`${pendingApprovals.length}`} hint="approvals across the platform" to="/approvals" tone={pendingApprovals.length ? "warn" : "ok"} />
          <Stat
            label="Audit chain"
            value={!canExportAudit ? "—" : chainQ.isLoading ? "checking" : chainQ.isError ? "not checked" : chainQ.data?.chainedEvents === 0 ? "no events" : chainQ.data?.valid ? "verified" : "broken"}
            tone={!canExportAudit || chainQ.isLoading || chainQ.isError ? undefined : chainQ.data?.valid ? "ok" : "bad"}
            hint={!canExportAudit ? "needs the audit export permission" : chainQ.data ? `${chainQ.data.chainedEvents.toLocaleString()} events${chainQ.data.signatureValid === false ? " · signature mismatch" : ""}` : undefined}
          />
        </div>
      </div>

      {/* ── Needs a person ── */}
      {(pendingExceptions.length > 0 || expiredExceptions.length > 0) && (
        <div className="px-6 py-2 border-b bg-amber-500/5 flex items-center gap-2 flex-wrap text-sm">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          {expiredExceptions.length > 0 && <span><strong>{expiredExceptions.length}</strong> exception{expiredExceptions.length === 1 ? "" : "s"} past expiry still recorded as approved.</span>}
          {pendingExceptions.length > 0 && <span><strong>{pendingExceptions.length}</strong> exception{pendingExceptions.length === 1 ? "" : "s"} awaiting a decision.</span>}
          <Link href="/my-actions" className="ml-auto text-xs underline underline-offset-2">Open My Actions</Link>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        {/* ── Policy list ── */}
        <div className="w-80 border-r flex flex-col min-h-0 shrink-0">
          <div className="p-3 flex flex-col gap-2 border-b">
            <div className="grid grid-cols-2 rounded-md border p-0.5 text-xs" role="radiogroup" aria-label="Show">
              {(["policies", "regulations"] as const).map((v) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={`rounded px-2 py-1 transition-colors ${view === v ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  data-testid={`view-${v}`}
                >
                  {v === "policies" ? `Your policies · ${policies.length}` : `Regulations · ${regulations.length}`}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={view === "policies" ? "Search policies" : "Search regulations"} className="h-8 pl-7 text-xs" data-testid="input-search-policies" />
            </div>
            {view === "policies" && <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-domain"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All domains</SelectItem>
                {domains.map((d) => <SelectItem key={d} value={d}>{domainLabel(d)}</SelectItem>)}
              </SelectContent>
            </Select>}
          </div>
          {view === "regulations" ? (
            <QueryBoundary isLoading={regulationsQ.isLoading} isError={regulationsQ.isError} error={regulationsQ.error as Error | null} onRetry={() => regulationsQ.refetch()}>
              <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
                <div className="flex flex-col divide-y">
                  {regulationRows.length === 0 ? (
                    <p className="py-16 px-6 text-xs text-muted-foreground text-center">{regulations.length === 0 ? "The regulation catalogue is empty" : "No regulation matches your search"}</p>
                  ) : regulationRows.map(({ reg, yours }) => (
                    <button
                      key={reg.id}
                      onClick={() => setSelectedRegId(reg.id)}
                      className={`flex flex-col gap-1.5 p-3 text-left w-full transition-colors hover:bg-muted/40 ${selectedRegId === reg.id ? "bg-muted/60 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
                      data-testid={`regulation-row-${reg.id}`}
                    >
                      <span className="text-xs font-medium truncate leading-tight">{reg.name}</span>
                      <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px] text-muted-foreground">
                        <span>{reg.jurisdiction}</span>
                        <span>{industryLabel(reg.industry)}</span>
                        {yours > 0 ? <span className="text-emerald-600 dark:text-emerald-400">{yours} of your policies</span> : <span>none adopted</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </QueryBoundary>
          ) : (
          <QueryBoundary isLoading={policiesQ.isLoading} isError={policiesQ.isError} error={policiesQ.error as Error | null} onRetry={() => policiesQ.refetch()}>
            {/* Radix wraps the viewport content in display:table, which grows to the widest row
                and defeats truncation; block layout keeps rows to the panel width. */}
            <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
              <div className="flex flex-col divide-y">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 px-6">
                    <Inbox className="w-8 h-8 opacity-25" />
                    <p className="text-xs text-muted-foreground text-center">{policies.length === 0 ? "No policies yet" : "No policy matches your filters"}</p>
                  </div>
                ) : filtered.map((p) => {
                  const enforcement = enforcementOf(p);
                  const exceptionCount = exceptions.filter((e) => e.policyId === p.id && e.status === "approved" && !isExpired(e)).length;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`flex flex-col gap-1.5 p-3 text-left w-full transition-colors hover:bg-muted/40 ${selectedId === p.id ? "bg-muted/60 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
                      data-testid={`policy-row-${p.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium truncate leading-tight">{p.name}</span>
                        {p.status !== "active" && <Badge variant="outline" className="text-[9px] px-1 shrink-0">{p.status}</Badge>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px] text-muted-foreground">
                        <span>{domainLabel(p.domain)}</span>
                        <span className={enforcement === "blocks" ? "text-red-600 dark:text-red-400" : ""}>{enforcement}</span>
                        <span>v{p.version}</span>
                        {exceptionCount > 0 && <span className="text-amber-600 dark:text-amber-400">{exceptionCount} exempt</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </QueryBoundary>
          )}
        </div>

        {/* ── Detail ── */}
        <div className="flex-1 min-h-0 min-w-0">
          {view === "regulations" ? (
            selectedReg ? (
              <RegulationDetail regulation={selectedReg} policies={policies} onOpenPolicy={openPolicy} toast={toast} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <ScrollText className="w-10 h-10 opacity-25" />
                <p className="text-sm">Select a regulation to see what it asks for and which of your policies come from it</p>
              </div>
            )
          ) : selected ? (
            <PolicyDetail policy={selected} agents={agents} exceptions={exceptions.filter((e) => e.policyId === selected.id)} toast={toast} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <ShieldCheck className="w-10 h-10 opacity-25" />
              <p className="text-sm">Select a policy to see what it enforces</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PolicyDetail({ policy, agents, exceptions, toast }: { policy: Policy; agents: Agent[]; exceptions: PolicyException[]; toast: ReturnType<typeof useToast>["toast"] }) {
  const bound = boundAgents(agents, policy);
  const json = (policy.policyJson ?? {}) as Record<string, any>;
  const rules: any[] = Array.isArray(json.rules) ? json.rules : [];
  const enforcement = enforcementOf(policy);
  const tools = toolsTouched(policy);
  const testsQ = useQuery<any[]>({ queryKey: ["/api/policies", policy.id, "test-cases"] });
  const tests = testsQ.data ?? [];

  const runTest = useMutation({
    mutationFn: async (testId: string) => (await apiRequest("POST", `/api/policies/${policy.id}/test-cases/${testId}/run`, {})).json(),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies", policy.id, "test-cases"] });
      toast({ title: result?.passed ? "Test passed" : "Test failed", description: result?.passed ? "The policy behaved as the test expects." : "The policy did not behave as the test expects." });
    },
    onError: (e: any) => toast({ title: "Couldn't run the test", description: e?.message, variant: "destructive" }),
  });

  return (
    <ScrollArea className="h-full">
      <div className="p-6 flex flex-col gap-6 max-w-3xl">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold">{policy.name}</h2>
            <Badge variant="outline" className="text-[10px]">{domainLabel(policy.domain)}</Badge>
            <Badge variant="outline" className="text-[10px]">v{policy.version}</Badge>
            {policy.status !== "active" && <Badge variant="outline" className="text-[10px]">{policy.status}</Badge>}
          </div>
          {policy.description && <p className="text-sm text-muted-foreground mt-1">{policy.description}</p>}
        </div>

        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">What it does at run time</h3>
          <div className="rounded border p-3 text-sm flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              {enforcement === "blocks"
                ? <><XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" /><span>Blocks the call when a rule matches.</span></>
                : <><AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" /><span>Records a violation but lets the call through.</span></>}
            </div>
            {tools.blocked.length > 0 && (
              <div className="font-mono text-[11px] text-muted-foreground">
                {enforcement === "blocks" ? "Blocked tools" : "Watched tools"}: {tools.blocked.join(", ")}
              </div>
            )}
            {tools.allowlist.length > 0 && (
              <div className="font-mono text-[11px] text-muted-foreground">
                {enforcement === "blocks" ? `Only these tools allowed: ${tools.allowlist.join(", ")}` : `Allow-list written but not enforced while this policy only monitors: ${tools.allowlist.join(", ")}`}
              </div>
            )}
            {tools.blocked.length === 0 && tools.allowlist.length === 0 && (
              <div className="text-[11px] text-muted-foreground">No tools named, so nothing is stopped at dispatch; the rules below are shown to the agent as its instructions.</div>
            )}
            <div className="text-[11px] text-muted-foreground">An agent's binding can raise a monitoring policy to blocking for that agent alone.</div>
          </div>
        </section>

        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Rules the agent is given</h3>
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rules written yet.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded border">
              {rules.map((r, i) => (
                <li key={i} className="p-2.5 text-sm">
                  <div className="font-medium">{r?.name || `Rule ${i + 1}`}</div>
                  {(r?.description || r?.condition) && <div className="text-muted-foreground">{r?.description || r?.condition}</div>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Where it applies</h3>
          <div className="text-sm">
            <span className="text-muted-foreground">Scope: </span>{policy.scopeType === "org" || !policy.scopeType ? "the whole organization" : `${policy.scopeType}${policy.scopeId ? ` · ${policy.scopeId}` : ""}`}
          </div>
          {bound.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {bound.map((a) => (
                <li key={a.id}>
                  <Link href={`/agents/${a.id}`} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted/50" data-testid={`bound-agent-${a.id}`}>
                    <Link2 className="w-3 h-3" />{a.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">No agent names this policy in its bindings{policy.scopeType === "org" || !policy.scopeType ? ", so it applies through the organization scope only" : ""}.</p>
          )}
        </section>

        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Exceptions</h3>
          {exceptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody is exempt from this policy.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded border">
              {exceptions.map((e) => {
                const expired = isExpired(e);
                const agent = agents.find((a) => a.id === e.agentId);
                return (
                  <li key={e.id} className="flex items-start gap-2 p-2.5 text-sm" data-testid={`exception-${e.id}`}>
                    {expired ? <CalendarClock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-500" /> : e.status === "approved" ? <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" /> : <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{agent ? agent.name : e.scope === "org" ? "Whole organization" : "Unnamed agent"} — {e.reason}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {[e.status, e.requestedBy && `asked by ${e.requestedBy}`, e.expiresAt ? `${expired ? "expired" : "expires"} ${formatDateTime(e.expiresAt)}` : "no expiry"].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">An approved exception is recorded here; it does not yet change what the runtime enforces.</p>
        </section>

        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Tests</h3>
          {tests.length === 0 ? (
            <EmptyState icon={<FlaskConical className="w-6 h-6" aria-hidden="true" />} title="No tests yet" description="A test states a scenario and whether this policy should block it, so a rule change can't quietly stop working." />
          ) : (
            <ul className="flex flex-col divide-y rounded border">
              {tests.map((t) => (
                <li key={t.id} className="flex items-center gap-2 p-2.5 text-sm" data-testid={`test-${t.id}`}>
                  <span className="min-w-0 flex-1 truncate">{t.name || t.description || "Unnamed test"}</span>
                  {t.lastResult && <Badge variant="outline" className={`text-[10px] ${t.lastResult === "pass" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{t.lastResult}</Badge>}
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={runTest.isPending} onClick={() => runTest.mutate(t.id)} data-testid={`run-test-${t.id}`}>Run</Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}

/**
 * One regulation: which of your policies came from it, the catalogue's rules
 * you can still adopt, and the requirements it lists. The catalogue's own
 * "encoded policy count" isn't shown: it doesn't match the rules it holds.
 */
function RegulationDetail({ regulation, policies, onOpenPolicy, toast }: { regulation: Regulation; policies: Policy[]; onOpenPolicy: (id: string) => void; toast: ReturnType<typeof useToast>["toast"] }) {
  const canAdopt = usePermission("create_modify_policies").allowed;
  const rulesQ = useQuery<RegulatoryPolicy[]>({ queryKey: [`/api/regulations/${regulation.id}/policies`] });
  const controlsQ = useQuery<ComplianceControl[]>({ queryKey: [`/api/regulations/${regulation.id}/compliance-controls`] });
  const rules = rulesQ.data ?? [];
  const controls = controlsQ.data ?? [];
  const yours = policiesFromRegulation(policies, regulation.id);
  const adopted = adoptedRuleIds(policies);
  const coverage = coverageCounts(controls);

  const adopt = useMutation({
    mutationFn: async (ruleId: string) => (await apiRequest("POST", `/api/regulatory-policies/${ruleId}/push-to-governance`, {})).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      toast({ title: "Added to your policies", description: "It starts as a monitoring policy: violations are recorded, calls aren't stopped." });
    },
    onError: (e: any) => toast({ title: "Couldn't add the rule", description: e?.message, variant: "destructive" }),
  });

  return (
    <ScrollArea className="h-full">
      <div className="p-6 flex flex-col gap-6 max-w-3xl" data-testid={`regulation-detail-${regulation.id}`}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold">{regulation.name}</h2>
            <Badge variant="outline" className="text-[10px]">{regulation.jurisdiction}</Badge>
            <Badge variant="outline" className="text-[10px]">{industryLabel(regulation.industry)}</Badge>
            {regulation.enforcementStatus !== "active" && <Badge variant="outline" className="text-[10px]">{regulation.enforcementStatus}</Badge>}
          </div>
          <p className="text-sm mt-0.5">{regulation.fullName}</p>
          {regulation.description && <p className="text-sm text-muted-foreground mt-1">{regulation.description}</p>}
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
            {regulation.effectiveDate && <span>In effect since {formatDateTime(regulation.effectiveDate)}</span>}
            {regulation.sourceUrl && <a href={regulation.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 inline-flex items-center gap-0.5">Source text <ArrowUpRight className="w-3 h-3" /></a>}
          </div>
        </div>

        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Your policies from it</h3>
          {yours.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet. Adopt a rule below to hold your agents to it.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded border">
              {yours.map((p) => (
                <li key={p.id}>
                  <button onClick={() => onOpenPolicy(p.id)} className="w-full flex items-center gap-2 p-2.5 text-left text-sm hover:bg-muted/40" data-testid={`regulation-policy-${p.id}`}>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className={`font-mono text-[10px] ${enforcementOf(p) === "blocks" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{enforcementOf(p)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Rules you can adopt</h3>
          {rulesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">The catalogue has no encodable rules for this regulation yet.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded border">
              {rules.map((r) => {
                const isAdopted = adopted.has(r.id);
                return (
                  <li key={r.id} className="p-2.5 text-sm flex items-start gap-3" data-testid={`regulatory-rule-${r.id}`}>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{r.title} <span className="font-mono text-[10px] text-muted-foreground">{r.articleRef}</span></div>
                      <div className="text-muted-foreground">{r.naturalLanguage}</div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">on violation: {r.violationAction} · {r.severity} severity</div>
                    </div>
                    {isAdopted ? (
                      <span className="shrink-0 text-[11px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />In your policies</span>
                    ) : canAdopt ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" disabled={adopt.isPending} onClick={() => adopt.mutate(r.id)} data-testid={`adopt-rule-${r.id}`}>Add to your policies</Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">What it requires</h3>
          {controlsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : controls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requirements listed in the catalogue for this regulation.</p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground mb-2">
                {coverage.full} covered, {coverage.partial} partly covered and {coverage.gap} not covered by a platform control, as recorded in the catalogue. This isn't checked against your agents.
              </p>
              <ul className="flex flex-col divide-y rounded border">
                {controls.map((c) => (
                  <li key={c.id} className="p-2.5 text-sm" data-testid={`control-${c.id}`}>
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1"><span className="font-mono text-[10px] text-muted-foreground mr-1.5">{c.requirementRef}</span>{c.requirementTitle}</span>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${c.coverageStatus === "gap" ? "text-red-600 dark:text-red-400" : c.coverageStatus === "partial" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>{c.coverageStatus === "gap" ? "not covered" : c.coverageStatus === "partial" ? "partly" : "covered"}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{c.almpControl} · evidence: {c.evidenceArtifact}</div>
                    {c.coverageStatus !== "full" && (c.gapDescription || c.customerActionRequired) && (
                      <div className="text-[11px] mt-0.5">{[c.gapDescription, c.customerActionRequired && `You need to: ${c.customerActionRequired}`].filter(Boolean).join(" ")}</div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
