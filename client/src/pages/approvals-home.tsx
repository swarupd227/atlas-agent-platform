/**
 * Approvals — one page: what's waiting on a person, what was decided, and why.
 *
 * Built to the approved Approval Queue redesign: a queue on the left
 * ("Needs a decision" or everything), the selected request on the right with
 * what's being asked, the evidence attached to it, its history, and a
 * decision bar. /approvals/:id opens that request here.
 *
 * Truthfulness: every figure is counted from real rows. The old page's
 * "evidence %" (how many of five fields were filled), "AI recommendation" (a
 * threshold on the requester's own risk score) and "requirements" (listed as
 * unmet whatever the evidence) are gone. A risk score is shown only as the
 * requester's own, and only when they gave one.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowUpRight, CalendarClock, CheckCircle2, Inbox, Lock, MessageSquare, Search, Shield, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/ui-vocab";
import { ApprovalDecisionBanner, ApprovalExpiredNote, isDecidable } from "@/components/approval-decision-banner";
import { ConfigDiff } from "@/components/config-diff";
import { BlastRadius } from "@/components/blast-radius";
import { usePermission, useRole } from "@/components/role-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/format";
import type { Agent, Approval, EvalSuite, OutcomeContract } from "@shared/schema";
import { EvidenceSection, getTypeMeta } from "./approvals";

// ── Pure helpers (tests/approvals-home.test.ts) ─────────────────────────────

/** Still waiting on a decision: the same rule as the server's OPEN_APPROVAL_STATUSES. */
export function isOpen(status: string): boolean {
  return status === "pending" || status === "changes_requested";
}

/** "due in 18h", "due in 3d", "overdue by 6h" -- only when a due date was set. */
export function dueLabel(dueDate: Date | string | null | undefined, now = Date.now()): { text: string; tone: "overdue" | "soon" | "later" } | null {
  if (!dueDate) return null;
  const hours = (new Date(dueDate).getTime() - now) / 3_600_000;
  if (hours <= 0) {
    const late = Math.max(1, Math.round(-hours));
    return { text: late < 48 ? `overdue by ${late}h` : `overdue by ${Math.round(late / 24)}d`, tone: "overdue" };
  }
  if (hours <= 24) return { text: `due in ${Math.max(1, Math.round(hours))}h`, tone: "soon" };
  return { text: `due in ${Math.round(hours / 24)}d`, tone: "later" };
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function approvalCounts(list: Array<Pick<Approval, "status" | "dueDate" | "decidedAt">>, now = Date.now()) {
  const open = list.filter((a) => isOpen(a.status));
  return {
    open: open.length,
    overdue: open.filter((a) => a.dueDate && new Date(a.dueDate).getTime() < now).length,
    sentBack: list.filter((a) => a.status === "changes_requested").length,
    decidedToday: list.filter((a) => (a.status === "approved" || a.status === "rejected") && a.decidedAt && sameDay(new Date(a.decidedAt), new Date(now))).length,
  };
}

/** Open first, overdue before due-soon before undated, then newest. */
export function queueOrder(a: Approval, b: Approval, now = Date.now()): number {
  const openDiff = Number(isOpen(b.status)) - Number(isOpen(a.status));
  if (openDiff) return openDiff;
  const due = (x: Approval) => (x.dueDate ? new Date(x.dueDate).getTime() : Number.POSITIVE_INFINITY);
  if (isOpen(a.status) && due(a) !== due(b)) return due(a) - due(b);
  return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
}

/** What approving is called for this kind of request. */
export function approveLabel(type: string): string {
  switch (type) {
    case "outcome_certification": return "Certify";
    case "outcome_review": return "Validate";
    case "blueprint_review": return "Validate blueprint";
    case "launch_readiness": return "Clear for launch";
    default: return "Approve";
  }
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Needs a decision", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  changes_requested: { label: "Sent back", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  approved: { label: "Approved", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  rejected: { label: "Rejected", cls: "bg-red-500/10 text-red-700 dark:text-red-300" },
  expired: { label: "Expired", cls: "bg-muted text-muted-foreground" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status.replace(/_/g, " "), cls: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{s.label}</span>;
}

function DueText({ dueDate }: { dueDate: Approval["dueDate"] }) {
  const d = dueLabel(dueDate);
  if (!d) return null;
  return <span className={`inline-flex items-center gap-1 text-[11px] ${d.tone === "overdue" ? "text-red-600 dark:text-red-400" : d.tone === "soon" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}><CalendarClock className="h-3 w-3" />{d.text}</span>;
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: "warn" | "bad" | "ok" }) {
  const cls = tone === "bad" ? "text-red-600 dark:text-red-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "";
  return (
    <div className="flex min-w-[9rem] flex-col gap-0.5 px-4 py-3" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${cls}`}>{value}</span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </div>
  );
}

export default function ApprovalsHome() {
  const [, params] = useRoute("/approvals/:id");
  const [, navigate] = useLocation();
  const [view, setView] = useState<"open" | "all">("open");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const selectedId = params?.id && params.id !== "classic" ? params.id : null;

  const approvalsQ = useQuery<Approval[]>({ queryKey: ["/api/approvals"], refetchOnMount: "always", refetchInterval: 30_000 });
  const approvals = approvalsQ.data ?? [];
  const counts = approvalCounts(approvals);
  const types = Array.from(new Set(approvals.map((a) => a.type))).sort();

  const rows = useMemo(
    () =>
      approvals
        .filter((a) => (view === "open" ? isOpen(a.status) : true))
        .filter((a) => (type === "all" ? true : a.type === type))
        .filter((a) => (query ? `${a.objectName ?? ""} ${a.requestedBy ?? ""} ${a.description ?? ""}`.toLowerCase().includes(query.toLowerCase()) : true))
        .sort((a, b) => queueOrder(a, b)),
    [approvals, view, type, query],
  );
  // A linked approval that's already decided still opens, whichever list is showing.
  const selected = approvals.find((a) => a.id === selectedId) ?? null;
  const select = (id: string) => navigate(`/approvals/${id}`, { replace: true });

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="page-approvals">
      <div className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-1 pt-5">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold"><Shield className="h-4 w-4" /> Approvals</h1>
            <p className="text-sm text-muted-foreground">What's waiting on a person, what was decided, and why.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" asChild><Link href="/approvals/gates">Tool requests</Link></Button>
            <Button variant="ghost" size="sm" asChild data-testid="link-classic"><Link href="/approvals/classic">Classic view</Link></Button>
          </div>
        </div>
        <div className="flex items-stretch divide-x overflow-x-auto px-2 pb-1">
          <Stat label="Needs a decision" value={counts.open} hint="pending or sent back" tone={counts.open ? "warn" : "ok"} />
          <Stat label="Overdue" value={counts.overdue} hint="past the due date set" tone={counts.overdue ? "bad" : undefined} />
          <Stat label="Sent back" value={counts.sentBack} hint="waiting on changes" />
          <Stat label="Decided today" value={counts.decidedToday} hint="approved or rejected" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-80 shrink-0 flex-col border-r">
          <div className="flex flex-col gap-2 border-b p-3">
            <div className="grid grid-cols-2 rounded-md border p-0.5 text-xs" role="radiogroup" aria-label="Show">
              {(["open", "all"] as const).map((v) => (
                <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)} className={`rounded px-2 py-1 transition-colors ${view === v ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`} data-testid={`view-${v}`}>
                  {v === "open" ? `Needs a decision · ${counts.open}` : `All · ${approvals.length}`}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, requester, description" className="h-8 pl-7 text-xs" data-testid="input-search-approvals" />
            </div>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                {types.map((t) => <SelectItem key={t} value={t}>{getTypeMeta(t).label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <QueryBoundary isLoading={approvalsQ.isLoading} isError={approvalsQ.isError} error={approvalsQ.error as Error | null} onRetry={() => approvalsQ.refetch()}>
            <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
              <div className="flex flex-col divide-y">
                {rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 px-6 py-16">
                    <Inbox className="h-8 w-8 opacity-25" />
                    <p className="text-center text-xs text-muted-foreground">{view === "open" && !query && type === "all" ? "Nothing is waiting on a decision." : "No approval matches."}</p>
                  </div>
                ) : rows.map((a) => {
                  const meta = getTypeMeta(a.type);
                  const Icon = meta.icon;
                  return (
                    <button key={a.id} onClick={() => select(a.id)} className={`flex w-full flex-col gap-1.5 p-3 text-left transition-colors hover:bg-muted/40 ${selectedId === a.id ? "border-l-2 border-l-primary bg-muted/60" : "border-l-2 border-l-transparent"}`} data-testid={`approval-row-${a.id}`}>
                      <div className="flex items-start gap-2">
                        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${meta.color}`} />
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{meta.label}</div>
                          <div className="truncate text-xs font-medium leading-tight">{a.objectName || meta.label}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pl-5">
                        <StatusPill status={a.status} />
                        {isOpen(a.status) && <DueText dueDate={a.dueDate} />}
                        {a.requiredReviewerRole && <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" />{a.requiredReviewerRole.replace(/_/g, " ")}</span>}
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
            <ApprovalPane key={selected.id} approval={selected} />
          ) : selectedId && !approvalsQ.isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"><p className="text-sm">That approval isn't in this organization, or no longer exists.</p></div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 opacity-25" />
              <p className="text-sm">Select a request to see what's being asked and decide it</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Pending = null | "changes" | "reject" | "limits";

function ApprovalPane({ approval }: { approval: Approval }) {
  const { toast } = useToast();
  // The server decides who may (canDecideApproval): the routed reviewer role, or approve_changes when unrouted.
  const { role } = useRole();
  const canApprove = usePermission("approve_changes").allowed;
  const canDecide = approval.requiredReviewerRole ? role.id === approval.requiredReviewerRole || role.id === "admin" : canApprove;
  const meta = getTypeMeta(approval.type);
  const Icon = meta.icon;
  const ev = approval.evidenceJson as any;
  const historyQ = useQuery<Array<{ id: string; action: string; actorId: string | null; details: string | null; createdAt: string | null }>>({ queryKey: ["/api/approvals", approval.id, "history"] });
  const { data: evalSuites } = useQuery<EvalSuite[]>({ queryKey: ["/api/evals"] });
  const { data: outcomes } = useQuery<OutcomeContract[]>({ queryKey: ["/api/outcomes"] });
  const { data: agents } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const agentSuites = (evalSuites ?? []).filter((s) => s.agentId === approval.objectId);
  const agent = (agents ?? []).find((a) => a.id === (approval.agentId ?? approval.objectId));
  const outcome = (outcomes ?? []).find((o) => o.id === (approval.outcomeId ?? approval.objectId));

  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [shadowOnly, setShadowOnly] = useState(false);
  const [maxCanary, setMaxCanary] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const rollout = approval.objectType === "deployment" || approval.objectType === "patch";

  const decide = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await apiRequest("PATCH", `/api/approvals/${approval.id}`, body)).json(),
    onSuccess: (_d, body) => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-actions"] });
      setPending(null);
      setReason("");
      setFollowUp("");
      const s = String(body.status);
      toast({ title: s === "approved" ? "Approved" : s === "rejected" ? (body.followUpTask ? "Rejected, follow-up opened" : "Rejected") : "Sent back for changes" });
    },
    onError: (e: any) => toast({ title: "Couldn't record the decision", description: e?.message, variant: "destructive" }),
  });

  const confirm = () => {
    const text = reason.trim();
    if ((pending === "changes" || pending === "reject") && !text) return setError("Add a reason before continuing.");
    setError(null);
    if (pending === "changes") decide.mutate({ status: "changes_requested", constraintsJson: { requestedChanges: text } });
    else if (pending === "reject") decide.mutate({ status: "rejected", constraintsJson: { notes: text }, ...(followUp.trim() ? { followUpTask: { reason: text, description: followUp.trim() } } : {}) });
    else if (pending === "limits") {
      decide.mutate({ status: "approved", constraintsJson: { ...(shadowOnly ? { shadowOnly: true } : { maxCanaryPercent: Math.min(100, Math.max(1, Number(maxCanary) || 10)) }), ...(text ? { notes: text } : {}) } });
    }
  };
  const sentBackNote = approval.status === "changes_requested" ? (approval.constraintsJson as any)?.requestedChanges : null;

  return (
    <ScrollArea className="h-full">
      <div className="flex max-w-3xl flex-col gap-6 p-6" data-testid={`approval-pane-${approval.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted"><Icon className={`h-4 w-4 ${meta.color}`} /></div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight">{approval.objectName || meta.label}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[meta.label, approval.requestedBy && `requested by ${approval.requestedBy}`, approval.environment, approval.createdAt && formatDateTime(approval.createdAt)].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2"><StatusPill status={approval.status} />{isOpen(approval.status) && <DueText dueDate={approval.dueDate} />}</div>
        </div>

        <ApprovalDecisionBanner approval={approval} />
        <ApprovalExpiredNote approval={approval} />
        {approval.status === "changes_requested" && (
          <div className="flex items-start gap-2 rounded-md bg-blue-500/10 px-3 py-2.5 text-sm text-blue-700 dark:text-blue-300" data-testid="sent-back-banner">
            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
            <div><b>Sent back{approval.decidedBy ? ` by ${approval.decidedBy}` : ""}</b>{sentBackNote ? `: “${sentBackNote}”` : ""}<span className="block text-xs opacity-80">Decide it once the changes are made.</span></div>
          </div>
        )}
        {approval.requiredReviewerRole && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" />Only the <b className="text-foreground">{approval.requiredReviewerRole.replace(/_/g, " ")}</b> role can decide this one.</div>
        )}

        <section>
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">What's being asked</h3>
          {approval.description ? <p className="text-sm leading-relaxed text-muted-foreground">{approval.description}</p> : <p className="text-sm text-muted-foreground">The requester gave no description.</p>}
          {approval.diffSummary && <p className="mt-2 rounded border bg-muted/30 p-2.5 text-xs text-muted-foreground">{approval.diffSummary}</p>}
          {approval.riskScore != null && <p className="mt-2 text-xs text-muted-foreground">The requester scored the risk {approval.riskScore}/10.</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {agent && <Link href={`/agents/${agent.id}`} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted/50">{agent.name}<ArrowUpRight className="h-3 w-3" /></Link>}
            {outcome && <Link href={`/outcomes/${outcome.id}`} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted/50">{outcome.name}<ArrowUpRight className="h-3 w-3" /></Link>}
            {approval.objectType === "deployment" && approval.objectId && <Link href={`/deployments/${approval.objectId}`} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted/50">Deployment<ArrowUpRight className="h-3 w-3" /></Link>}
            {ev?.runId && <Link href={`/dag-runs/${ev.runId}`} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted/50">Team run<ArrowUpRight className="h-3 w-3" /></Link>}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Evidence</h3>
          <div className="flex flex-col gap-3">
            <EvidenceSection approval={approval} agentSuites={agentSuites} agentDrift={[]} critDrift={[]} />
            {ev?.configDiff && <ConfigDiff changes={ev.configDiff.changes || []} version={ev.configDiff.version} summary={ev.configDiff.summary} testIdPrefix={`diff-${approval.id}`} />}
            {ev?.blastRadius && <BlastRadius data={ev.blastRadius} testIdPrefix={`blast-${approval.id}`} />}
            {!ev && !approval.diffSummary && <p className="text-sm text-muted-foreground">No evidence was attached to this request.</p>}
            <Link href={`/approvals/${approval.id}/classic`} className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Export package, shadow replay and baseline diffs (classic detail)<ArrowUpRight className="h-3 w-3" /></Link>
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">History</h3>
          {historyQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (historyQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded about it yet.</p>
          ) : (
            <ol className="flex flex-col" data-testid="approval-history">
              {(historyQ.data ?? []).map((h) => (
                <li key={h.id} className="flex gap-3 border-t py-2 first:border-t-0">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
                  <div className="min-w-0 text-xs">
                    <span className="font-medium">{h.action.replace(/_/g, " ")}</span>
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">{h.createdAt ? formatDateTime(h.createdAt) : ""}{h.actorId ? ` · ${h.actorId}` : ""}</span>
                    {h.details && <div className="mt-0.5 text-muted-foreground">{h.details}</div>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {isDecidable(approval.status) && canDecide && (
          <div className="sticky bottom-0 -mx-6 border-t bg-background/95 px-6 py-3 backdrop-blur" data-testid="decision-bar">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => decide.mutate({ status: "approved" })} disabled={decide.isPending} data-testid="button-approve"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />{approveLabel(approval.type)}</Button>
              {rollout && <Button size="sm" variant="outline" onClick={() => { setPending("limits"); setError(null); }} data-testid="button-approve-limits">Approve with limits</Button>}
              <Button size="sm" variant="outline" onClick={() => { setPending("changes"); setError(null); }} data-testid="button-request-changes"><MessageSquare className="mr-1 h-3.5 w-3.5" />Request changes</Button>
              <Button size="sm" variant="outline" className="text-red-600 dark:text-red-400" onClick={() => { setPending("reject"); setError(null); }} data-testid="button-reject"><XCircle className="mr-1 h-3.5 w-3.5" />Reject</Button>
            </div>
            {pending && (
              <div className="mt-3 flex flex-col gap-2" data-testid={`decision-form-${pending}`}>
                {pending === "limits" && (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={shadowOnly} onChange={(e) => setShadowOnly(e.target.checked)} />Shadow only (serves no traffic)</label>
                    {!shadowOnly && <label className="flex items-center gap-2">Largest canary share <Input type="number" min={1} max={100} value={maxCanary} onChange={(e) => setMaxCanary(e.target.value)} className="h-7 w-20 text-xs" />%</label>}
                  </div>
                )}
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={pending === "changes" ? "Say what needs to change." : pending === "reject" ? "Say why this is rejected." : "Notes (optional)"} className="min-h-[64px] text-sm" data-testid="textarea-reason" />
                {pending === "reject" && <Textarea value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="Optional: what still has to be done. Opens a follow-up task on the same thing." className="min-h-[48px] text-sm" data-testid="textarea-follow-up" />}
                {error && <p className="text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={confirm} disabled={decide.isPending} data-testid="button-confirm-decision">{pending === "changes" ? "Send back" : pending === "reject" ? "Reject" : "Approve with these limits"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
