import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  AlertTriangle,
  Eye,
  Search,
  FlaskConical,
  TrendingDown,
  ShieldAlert,
  Activity,
  FileText,
  Award,
  Target,
  ArrowRight,
  Rocket,
  Filter,
  X,
  CalendarClock,
  User,
  Bot,
  MessageSquare,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Inbox,
  Info,
  SlidersHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { PermissionGate, usePermission } from "@/components/role-provider";
import { ConfigDiff } from "@/components/config-diff";
import { BlastRadius } from "@/components/blast-radius";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import type { Approval, EvalSuite, EvalRun, Agent, OutcomeContract } from "@shared/schema";

const TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  outcome_certification: { label: "Outcome Certification", icon: Award, color: "text-blue-500" },
  outcome_review:        { label: "Outcome Review",        icon: Target, color: "text-blue-500" },
  launch_readiness:      { label: "Launch Readiness",      icon: Rocket, color: "text-emerald-500" },
  blueprint_review:      { label: "Blueprint Review",      icon: FileText, color: "text-violet-500" },
  anomaly_review:        { label: "Anomaly Review",        icon: AlertTriangle, color: "text-amber-500" },
  config_change:         { label: "Config Change",         icon: Shield, color: "text-amber-500" },
};

function getTypeMeta(type: string) {
  return TYPE_META[type] ?? { label: type.replace(/_/g, " "), icon: Shield, color: "text-amber-500" };
}

function riskLevel(score: number | null | undefined) {
  const s = score ?? 0;
  return s > 7 ? "high" : s > 4 ? "medium" : "low";
}

function riskColors(level: string) {
  return level === "high" ? "bg-red-500/10 text-red-600 dark:text-red-400"
       : level === "medium" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
       : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
}

function SlaChip({ dueDate }: { dueDate: string | null | undefined }) {
  if (!dueDate) return null;
  const hoursLeft = (new Date(dueDate).getTime() - Date.now()) / 3600000;
  const overdue = hoursLeft <= 0;
  const soon    = !overdue && hoursLeft <= 24;
  return (
    <Badge
      variant="outline"
      className={`text-[9px] gap-0.5 ${overdue ? "text-red-600 dark:text-red-400 border-red-500/30" : soon ? "text-amber-600 dark:text-amber-400 border-amber-500/30" : "text-muted-foreground"}`}
    >
      <CalendarClock className="w-2.5 h-2.5" />
      {overdue ? "Overdue" : soon ? `${Math.round(hoursLeft)}h` : `${Math.round(hoursLeft / 24)}d`}
    </Badge>
  );
}

function evidenceCompleteness(approval: Approval) {
  const ev = approval.evidenceJson as any;
  let s = 0;
  if (approval.diffSummary || ev?.configDiff) s++;
  if (ev?.evalResults || ev?.kpiAttainment) s++;
  if (ev?.shadowReplayResults) s++;
  if (ev?.blastRadius || ev?.affectedOutcomes) s++;
  if (approval.riskScore != null) s++;
  return Math.round((s / 5) * 100);
}

export default function Approvals() {
  const [search, setSearch] = useState("");
  const [riskTierFilter, setRiskTierFilter] = useState("all");
  const [objectTypeFilter, setObjectTypeFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [requesterFilter, setRequesterFilter] = useState("all");
  const [dueDateFilter, setDueDateFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestChangesComment, setRequestChangesComment] = useState("");
  const [showRequestChanges, setShowRequestChanges] = useState(false);
  const { toast } = useToast();
  const approvalPerm = usePermission("approve_changes");

  const { data: approvals, isLoading } = useQuery<Approval[]>({ queryKey: ["/api/approvals"] });
  const { data: evalSuites } = useQuery<EvalSuite[]>({ queryKey: ["/api/evals"] });
  const { data: agents } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const { data: outcomes } = useQuery<OutcomeContract[]>({ queryKey: ["/api/outcomes"] });
  const { data: driftSignals } = useQuery<Array<{
    id: string; agentId: string; agentName: string; suiteName: string;
    metric: string; driftPercent: number; severity: string; status: string;
  }>>({ queryKey: ["/api/drift-signals"] });

  const decideMutation = useMutation({
    mutationFn: async ({ id, status, constraintsJson }: { id: string; status: string; constraintsJson?: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/approvals/${id}`, { status, decidedBy: "Expert Validator", constraintsJson });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: "Approval updated" });
      setShowRequestChanges(false);
      setRequestChangesComment("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update approval", description: err.message, variant: "destructive" });
    },
  });

  const hasActiveFilters = riskTierFilter !== "all" || objectTypeFilter !== "all" || outcomeFilter !== "all" || agentFilter !== "all" || requesterFilter !== "all" || dueDateFilter !== "all";

  const clearFilters = () => {
    setRiskTierFilter("all"); setObjectTypeFilter("all"); setOutcomeFilter("all");
    setAgentFilter("all"); setRequesterFilter("all"); setDueDateFilter("all"); setSearch("");
  };

  const filtered = (approvals ?? []).filter((a) => {
    if (search && !(a.objectName || a.type || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (riskTierFilter !== "all") {
      if (riskLevel(a.riskScore) !== riskTierFilter) return false;
    }
    if (objectTypeFilter !== "all" && a.objectType !== objectTypeFilter) return false;
    if (outcomeFilter !== "all" && a.outcomeId !== outcomeFilter && a.objectId !== outcomeFilter) return false;
    if (agentFilter !== "all" && a.agentId !== agentFilter && a.objectId !== agentFilter) return false;
    if (requesterFilter !== "all") {
      const isAuto = a.requesterType === "system" || a.requesterType === "auto" || (a.requestedBy ?? "").toLowerCase().includes("system");
      if (requesterFilter === "human" && isAuto) return false;
      if (requesterFilter === "auto" && !isAuto) return false;
    }
    if (dueDateFilter !== "all") {
      if (!a.dueDate && (dueDateFilter === "overdue" || dueDateFilter === "due_soon")) return false;
      if (a.dueDate) {
        const h = (new Date(a.dueDate).getTime() - Date.now()) / 3600000;
        if (dueDateFilter === "overdue" && h > 0) return false;
        if (dueDateFilter === "due_soon" && (h <= 0 || h > 24)) return false;
        if (dueDateFilter === "on_track" && h <= 24) return false;
      }
    }
    return true;
  });

  const pending   = (approvals ?? []).filter(a => a.status === "pending").length;
  const approved  = (approvals ?? []).filter(a => a.status === "approved").length;
  const rejected  = (approvals ?? []).filter(a => a.status === "rejected").length;

  const selected = approvals?.find(a => a.id === selectedId) ?? null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-3">
          {[0,1,2].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
        <div className="flex gap-4 h-[calc(100vh-220px)]">
          <Skeleton className="w-80 h-full rounded-lg" />
          <Skeleton className="flex-1 h-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" data-testid="page-approvals">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-3 border-b shrink-0 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">Approval Queue</h1>
          <p className="text-xs text-muted-foreground">Expert validation console — the 20% supervision layer</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />{pending} pending</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{approved} approved</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{rejected} rejected</span>
          </div>
          <Separator orientation="vertical" className="h-4" />
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(v => !v)}
            data-testid="button-toggle-filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
            Filters
            {hasActiveFilters && <Badge className="ml-1.5 px-1 py-0 text-[9px] h-4">{[riskTierFilter,objectTypeFilter,outcomeFilter,agentFilter,requesterFilter,dueDateFilter,search].filter(v=>v&&v!=="all").length}</Badge>}
          </Button>
          <Link href="/approvals/gates">
            <Button variant="outline" size="sm" data-testid="button-approval-gates">
              <Shield className="w-3.5 h-3.5 mr-1.5" /> Gates
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Filter bar (collapsible) ── */}
      {showFilters && (
        <div className="flex items-center gap-2 px-6 py-2.5 border-b bg-muted/20 flex-wrap shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-7 h-7 text-xs w-40" data-testid="input-search-approvals" />
          </div>
          {[
            { value: riskTierFilter, onChange: setRiskTierFilter, label: "Risk", w: "w-32", tid: "select-risk-tier", items: [["all","All Risk"],["high","High"],["medium","Medium"],["low","Low"]] },
            { value: objectTypeFilter, onChange: setObjectTypeFilter, label: "Type", w: "w-32", tid: "select-object-type", items: [["all","All Types"],["agent","Agent"],["agent_version","Version"],["policy","Policy"],["policy_exception","Exception"],["deployment","Deployment"],["outcome","Outcome"],["patch","Patch"]] },
            { value: outcomeFilter, onChange: setOutcomeFilter, label: "Outcome", w: "w-36", tid: "select-outcome", items: [["all","All Outcomes"], ...(outcomes ?? []).map(o => [o.id, o.name] as [string,string])] },
            { value: agentFilter, onChange: setAgentFilter, label: "Agent", w: "w-36", tid: "select-agent", items: [["all","All Agents"], ...(agents ?? []).map(a => [a.id, a.name] as [string,string])] },
            { value: requesterFilter, onChange: setRequesterFilter, label: "By", w: "w-28", tid: "select-requester", items: [["all","All"],["human","Human"],["auto","Auto"]] },
            { value: dueDateFilter, onChange: setDueDateFilter, label: "SLA", w: "w-32", tid: "select-due-date", items: [["all","All SLA"],["overdue","Overdue"],["due_soon","Due Soon"],["on_track","On Track"]] },
          ].map(f => (
            <Select key={f.tid} value={f.value} onValueChange={f.onChange}>
              <SelectTrigger className={`${f.w} h-7 text-xs`} data-testid={f.tid}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {f.items.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          ))}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={clearFilters} data-testid="button-clear-filters">
              <X className="w-3 h-3 mr-1" /> Clear
            </Button>
          )}
        </div>
      )}

      {/* ── Body: tabs + split panel ── */}
      <Tabs defaultValue="pending" className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center px-6 pt-3 pb-0 border-b shrink-0">
          <TabsList className="h-8">
            <TabsTrigger value="pending" className="text-xs h-7" data-testid="tab-pending">
              Pending {pending > 0 && <Badge variant="outline" className="ml-1 text-[9px] px-1">{pending}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs h-7" data-testid="tab-all">All</TabsTrigger>
          </TabsList>
        </div>

        {/* ── PENDING tab ── */}
        <TabsContent value="pending" className="flex-1 min-h-0 mt-0 flex">
          {/* List panel */}
          <div className="w-80 border-r flex flex-col min-h-0 shrink-0">
            <ScrollArea className="flex-1">
              <div className="flex flex-col divide-y">
                {filtered.filter(a => a.status === "pending").length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 px-6">
                    <CheckCircle className="w-8 h-8 text-emerald-500/40" />
                    <p className="text-xs text-muted-foreground text-center">All clear — no pending approvals</p>
                  </div>
                ) : filtered.filter(a => a.status === "pending").map(approval => {
                  const meta = getTypeMeta(approval.type);
                  const Icon = meta.icon;
                  const rl = riskLevel(approval.riskScore);
                  const comp = evidenceCompleteness(approval);
                  const isSelected = selectedId === approval.id;
                  return (
                    <button
                      key={approval.id}
                      onClick={() => { setSelectedId(approval.id); setShowRequestChanges(false); setRequestChangesComment(""); }}
                      className={`flex flex-col gap-1.5 p-3 text-left w-full transition-colors hover:bg-muted/40 ${isSelected ? "bg-muted/60 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
                      data-testid={`list-item-${approval.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${rl === "high" ? "bg-red-500/10" : rl === "medium" ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                            <Icon className={`w-3 h-3 ${meta.color}`} />
                          </div>
                          <span className="text-xs font-medium truncate leading-tight">{approval.objectName || meta.label}</span>
                        </div>
                        <SlaChip dueDate={approval.dueDate} />
                      </div>
                      <div className="flex items-center gap-1.5 pl-8 flex-wrap">
                        <Badge variant="outline" className="text-[9px] px-1">{approval.objectType?.replace(/_/g," ") || "unknown"}</Badge>
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${rl === "high" ? "bg-red-500/10 text-red-600 dark:text-red-400" : rl === "medium" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
                          Risk {approval.riskScore}/10
                        </span>
                        {approval.requesterType === "system" || approval.requesterType === "auto"
                          ? <Badge variant="outline" className="text-[9px] px-1"><Bot className="w-2 h-2 mr-0.5" />Auto</Badge>
                          : <Badge variant="outline" className="text-[9px] px-1"><User className="w-2 h-2 mr-0.5" />Human</Badge>
                        }
                      </div>
                      <div className="flex items-center gap-1.5 pl-8">
                        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${comp >= 80 ? "bg-emerald-500" : comp >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${comp}%` }} />
                        </div>
                        <span className="text-[9px] text-muted-foreground shrink-0">{comp}% evidence</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Detail panel */}
          <div className="flex-1 min-h-0 min-w-0">
            {selected && selected.status === "pending" ? (
              <ApprovalDetail
                approval={selected}
                evalSuites={evalSuites}
                driftSignals={driftSignals}
                outcomes={outcomes}
                decideMutation={decideMutation}
                approvalPerm={approvalPerm}
                showRequestChanges={showRequestChanges}
                setShowRequestChanges={setShowRequestChanges}
                requestChangesComment={requestChangesComment}
                setRequestChangesComment={setRequestChangesComment}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Inbox className="w-10 h-10 opacity-25" />
                <p className="text-sm">Select a pending approval to review</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── ALL tab ── */}
        <TabsContent value="all" className="flex-1 min-h-0 mt-0 flex">
          {/* List panel */}
          <div className="w-80 border-r flex flex-col min-h-0 shrink-0">
            <ScrollArea className="flex-1">
              <div className="flex flex-col divide-y">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 px-6">
                    <Inbox className="w-8 h-8 opacity-25" />
                    <p className="text-xs text-muted-foreground text-center">No approvals match your filters</p>
                  </div>
                ) : filtered.map(approval => {
                  const meta = getTypeMeta(approval.type);
                  const Icon = meta.icon;
                  const rl = riskLevel(approval.riskScore);
                  const comp = evidenceCompleteness(approval);
                  const isSelected = selectedId === approval.id;
                  return (
                    <button
                      key={approval.id}
                      onClick={() => { setSelectedId(approval.id); setShowRequestChanges(false); setRequestChangesComment(""); }}
                      className={`flex flex-col gap-1.5 p-3 text-left w-full transition-colors hover:bg-muted/40 ${isSelected ? "bg-muted/60 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
                      data-testid={`list-item-all-${approval.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${rl === "high" ? "bg-red-500/10" : rl === "medium" ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                            <Icon className={`w-3 h-3 ${meta.color}`} />
                          </div>
                          <span className="text-xs font-medium truncate leading-tight">{approval.objectName || meta.label}</span>
                        </div>
                        <StatusBadge status={approval.status} />
                      </div>
                      <div className="flex items-center gap-1.5 pl-8 flex-wrap">
                        <Badge variant="outline" className="text-[9px] px-1">{approval.objectType?.replace(/_/g," ") || "unknown"}</Badge>
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${rl === "high" ? "bg-red-500/10 text-red-600 dark:text-red-400" : rl === "medium" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
                          Risk {approval.riskScore}/10
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 pl-8">
                        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${comp >= 80 ? "bg-emerald-500" : comp >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${comp}%` }} />
                        </div>
                        <span className="text-[9px] text-muted-foreground shrink-0">{comp}% evidence</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Detail panel */}
          <div className="flex-1 min-h-0 min-w-0">
            {selected ? (
              <ApprovalDetail
                approval={selected}
                evalSuites={evalSuites}
                driftSignals={driftSignals}
                outcomes={outcomes}
                decideMutation={decideMutation}
                approvalPerm={approvalPerm}
                showRequestChanges={showRequestChanges}
                setShowRequestChanges={setShowRequestChanges}
                requestChangesComment={requestChangesComment}
                setRequestChangesComment={setRequestChangesComment}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Inbox className="w-10 h-10 opacity-25" />
                <p className="text-sm">Select an approval to inspect</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   DETAIL PANEL
   ───────────────────────────────────────────────────────── */
interface DetailProps {
  approval: Approval;
  evalSuites?: EvalSuite[];
  driftSignals?: Array<{ id: string; agentId: string; agentName: string; suiteName: string; metric: string; driftPercent: number; severity: string; status: string }>;
  outcomes?: OutcomeContract[];
  decideMutation: ReturnType<typeof useMutation<any, Error, { id: string; status: string; constraintsJson?: Record<string, unknown> }>>;
  approvalPerm: { allowed: boolean };
  showRequestChanges: boolean;
  setShowRequestChanges: (v: boolean) => void;
  requestChangesComment: string;
  setRequestChangesComment: (v: string) => void;
}

function ApprovalDetail({ approval, evalSuites, driftSignals, outcomes, decideMutation, approvalPerm, showRequestChanges, setShowRequestChanges, requestChangesComment, setRequestChangesComment }: DetailProps) {
  const ev = approval.evidenceJson as any;
  const meta = getTypeMeta(approval.type);
  const Icon = meta.icon;
  const rl = riskLevel(approval.riskScore);
  const comp = evidenceCompleteness(approval);
  const agentSuites = (evalSuites ?? []).filter(s => s.agentId === approval.objectId);
  const agentDrift  = (driftSignals ?? []).filter(d => d.agentId === approval.objectId);
  const critDrift   = agentDrift.filter(d => d.severity === "critical" || d.severity === "high");

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-0">
        {/* ── Detail header ── */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b bg-muted/10">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${rl === "high" ? "bg-red-500/10" : rl === "medium" ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
              <Icon className={`w-5 h-5 ${meta.color}`} />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-base font-semibold leading-tight" data-testid={`detail-name-${approval.id}`}>{approval.objectName || meta.label}</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[9px]">{approval.objectType?.replace(/_/g," ") || "unknown"}</Badge>
                <Badge variant="outline" className="text-[9px]">{meta.label}</Badge>
                {approval.environment && <Badge variant="outline" className="text-[9px]">{approval.environment}</Badge>}
                {approval.requesterType === "system" || approval.requesterType === "auto"
                  ? <Badge variant="outline" className="text-[9px]"><Bot className="w-2 h-2 mr-0.5" />Auto</Badge>
                  : <Badge variant="outline" className="text-[9px]"><User className="w-2 h-2 mr-0.5" />Human</Badge>
                }
                <SlaChip dueDate={approval.dueDate} />
              </div>
              {approval.requestedBy && <span className="text-[11px] text-muted-foreground">Requested by {approval.requestedBy}</span>}
            </div>
          </div>
          <StatusBadge status={approval.status} />
        </div>

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-4 divide-x border-b">
          {[
            { label: "Risk Score", value: `${approval.riskScore ?? "—"}/10`, color: rl === "high" ? "text-red-600 dark:text-red-400" : rl === "medium" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400" },
            { label: "Evidence", value: `${comp}%`, color: comp >= 80 ? "text-emerald-600 dark:text-emerald-400" : comp >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400" },
            { label: "Eval Suites", value: agentSuites.length.toString(), color: "text-foreground" },
            { label: "Drift Signals", value: agentDrift.length === 0 ? "Clear" : `${agentDrift.length} (${critDrift.length} crit)`, color: agentDrift.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400" },
          ].map(kpi => (
            <div key={kpi.label} className="flex flex-col gap-0.5 px-4 py-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</span>
              <span className={`text-sm font-semibold ${kpi.color}`}>{kpi.value}</span>
            </div>
          ))}
        </div>

        {/* ── Body content ── */}
        <div className="flex flex-col gap-4 px-6 py-4">

          {/* Description / diff summary */}
          {(approval.description || approval.diffSummary) && (
            <div className="flex flex-col gap-2">
              {approval.description && <p className="text-sm text-muted-foreground">{approval.description}</p>}
              {approval.diffSummary && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-muted/30 border">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-xs text-muted-foreground">{approval.diffSummary}</span>
                </div>
              )}
            </div>
          )}

          {approval.recommendedAction && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs" data-testid={`badge-recommended-${approval.id}`}>
                Recommended: {approval.recommendedAction.replace(/_/g, " ")}
              </Badge>
            </div>
          )}

          {/* ── Evidence sections ── */}
          <EvidenceSection approval={approval} agentSuites={agentSuites} agentDrift={agentDrift} critDrift={critDrift} />

          {/* Config diff */}
          {ev?.configDiff && (
            <ConfigDiff changes={ev.configDiff.changes || []} version={ev.configDiff.version} summary={ev.configDiff.summary} testIdPrefix={`diff-${approval.id}`} />
          )}

          {/* Blast radius */}
          {ev?.blastRadius && (
            <BlastRadius data={ev.blastRadius} testIdPrefix={`blast-${approval.id}`} />
          )}

          {/* Eval suites from live data */}
          {agentSuites.length > 0 && (
            <SectionBlock icon={FlaskConical} title="Eval Suites">
              <div className="flex flex-col gap-1">
                {agentSuites.map(suite => (
                  <div key={suite.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/20 hover:bg-muted/30 transition-colors">
                    <Link href={`/evals/${suite.id}`}>
                      <span className="text-xs font-medium underline decoration-muted-foreground/30" data-testid={`link-eval-suite-${suite.id}`}>{suite.name}</span>
                    </Link>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${(suite.passRate ?? 0) > 0.9 ? "bg-emerald-500" : (suite.passRate ?? 0) > 0.75 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${((suite.passRate ?? 0) * 100).toFixed(0)}%` }} />
                      </div>
                      <span className={`text-xs font-semibold ${(suite.passRate ?? 0) > 0.9 ? "text-emerald-600 dark:text-emerald-400" : (suite.passRate ?? 0) > 0.75 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                        {((suite.passRate ?? 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionBlock>
          )}

          {/* Drift signals */}
          {agentDrift.length > 0 && (
            <SectionBlock icon={Activity} title="Drift Signals">
              <div className="flex flex-col gap-1">
                {agentDrift.map(d => (
                  <div key={d.id} className={`flex items-center justify-between gap-2 p-2 rounded-md ${d.severity === "critical" || d.severity === "high" ? "bg-red-500/5 border border-red-500/10" : "bg-muted/20"}`}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium">{d.suiteName}</span>
                      <span className="text-[10px] text-muted-foreground">{d.metric}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${d.severity === "critical" || d.severity === "high" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                        {Math.abs(d.driftPercent).toFixed(1)}% drift
                      </span>
                      <Badge variant={d.severity === "critical" ? "destructive" : "outline"} className="text-[9px]">{d.severity}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </SectionBlock>
          )}
        </div>

        {/* ── Action bar ── */}
        {approval.status === "pending" && (
          <div className="sticky bottom-0 flex flex-col gap-2 px-6 py-3 border-t bg-background/95 backdrop-blur">
            {showRequestChanges && (
              <div className="flex flex-col gap-2 p-3 rounded-md bg-muted/30 border" data-testid={`request-changes-form-${approval.id}`}>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Request Changes</span>
                </div>
                <Textarea
                  placeholder="Describe what changes are needed…"
                  value={requestChangesComment}
                  onChange={e => setRequestChangesComment(e.target.value)}
                  className="text-sm min-h-[80px]"
                  data-testid={`textarea-request-changes-${approval.id}`}
                />
                <div className="flex items-center gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setShowRequestChanges(false); setRequestChangesComment(""); }} data-testid={`button-cancel-request-changes-${approval.id}`}>Cancel</Button>
                  <Button variant="outline" size="sm"
                    disabled={decideMutation.isPending || !requestChangesComment.trim()}
                    onClick={() => decideMutation.mutate({ id: approval.id, status: "changes_requested", constraintsJson: { requestedChanges: requestChangesComment, requestedBy: "Expert Validator" } })}
                    data-testid={`button-submit-request-changes-${approval.id}`}
                  >Submit Feedback</Button>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Navigate links */}
              {approval.type === "outcome_review" && approval.objectId && outcomes?.some(o => o.id === approval.objectId) && (
                <Link href={`/outcomes/${approval.objectId}`}>
                  <Button size="sm" variant="ghost" className="text-xs" data-testid={`button-view-outcome-${approval.id}`}><ArrowRight className="w-3.5 h-3.5 mr-1" />View Outcome</Button>
                </Link>
              )}
              {approval.type === "blueprint_review" && approval.objectId && (
                <Link href={`/agents/${approval.objectId}`}>
                  <Button size="sm" variant="ghost" className="text-xs" data-testid={`button-view-agent-${approval.id}`}><ArrowRight className="w-3.5 h-3.5 mr-1" />View Agent</Button>
                </Link>
              )}
              {approval.type === "launch_readiness" && approval.objectId && (
                <Link href={`/deployments/${approval.objectId}`}>
                  <Button size="sm" variant="ghost" className="text-xs" data-testid={`button-view-deployment-${approval.id}`}><ArrowRight className="w-3.5 h-3.5 mr-1" />View Deployment</Button>
                </Link>
              )}
              <Link href={`/approvals/${approval.id}`}>
                <Button size="sm" variant="outline" className="text-xs" data-testid={`button-view-details-${approval.id}`}><Eye className="w-3.5 h-3.5 mr-1" />Full Details</Button>
              </Link>
              <div className="flex-1" />
              <Button variant="outline" size="sm" className="text-xs"
                onClick={() => decideMutation.mutate({ id: approval.id, status: "rejected" })}
                disabled={decideMutation.isPending || !approvalPerm.allowed}
                data-testid={`button-reject-${approval.id}`}
              ><XCircle className="w-3.5 h-3.5 mr-1" />Reject</Button>
              <Button variant="outline" size="sm" className="text-xs"
                disabled={!approvalPerm.allowed}
                onClick={() => setShowRequestChanges(!showRequestChanges)}
                data-testid={`button-request-changes-${approval.id}`}
              ><MessageSquare className="w-3.5 h-3.5 mr-1" />Request Changes</Button>
              <Button size="sm" className="text-xs"
                onClick={() => decideMutation.mutate({ id: approval.id, status: "approved" })}
                disabled={decideMutation.isPending || !approvalPerm.allowed}
                data-testid={`button-approve-${approval.id}`}
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                {approval.type === "outcome_certification" ? "Certify" : approval.type === "outcome_review" ? "Validate" : approval.type === "blueprint_review" ? "Validate Blueprint" : approval.type === "launch_readiness" ? "Clear for Launch" : "Approve"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function SectionBlock({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col gap-2 border rounded-lg overflow-hidden">
      <button className="flex items-center justify-between gap-2 px-3 py-2.5 bg-muted/20 hover:bg-muted/30 transition-colors text-left" onClick={() => setOpen(v => !v)}>
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{title}</span>
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

/* ── Evidence section dispatcher ── */
function EvidenceSection({ approval, agentSuites, agentDrift, critDrift }: {
  approval: Approval;
  agentSuites: EvalSuite[];
  agentDrift: Array<{ id: string; agentId: string; agentName: string; suiteName: string; metric: string; driftPercent: number; severity: string; status: string }>;
  critDrift: typeof agentDrift;
}) {
  const ev = approval.evidenceJson as any;
  if (!ev) return null;

  if (approval.type === "outcome_review" && ev?.proposedKpis) {
    return (
      <SectionBlock icon={Target} title="Outcome Review — Evidence">
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Proposed KPIs ({ev.proposedKpis.length})</span>
            <div className="grid grid-cols-2 gap-2">
              {(ev.proposedKpis as Array<{name: string; target: number; unit: string; measurement: string}>).map((kpi, i) => (
                <div key={i} className="flex flex-col gap-0.5 p-2.5 rounded-md bg-muted/20" data-testid={`review-kpi-${approval.id}-${i}`}>
                  <span className="text-xs font-medium">{kpi.name}</span>
                  <span className="text-[10px] text-muted-foreground">Target: {kpi.target}{kpi.unit}</span>
                  <span className="text-[10px] text-muted-foreground">{kpi.measurement}</span>
                </div>
              ))}
            </div>
          </div>
          {ev.proposedAgents?.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Proposed Agents</span>
              <div className="flex flex-wrap gap-1.5">
                {(ev.proposedAgents as Array<{name: string; role: string; autonomyMode: string}>).map((a, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]" data-testid={`review-agent-${approval.id}-${i}`}>{a.name} ({a.autonomyMode})</Badge>
                ))}
              </div>
            </div>
          )}
          {ev.validationChecklist?.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Validation Required</span>
              {(ev.validationChecklist as string[]).map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs"><div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />{item}</div>
              ))}
            </div>
          )}
        </div>
      </SectionBlock>
    );
  }

  if (approval.type === "outcome_certification" && ev?.kpiAttainment) {
    return (
      <SectionBlock icon={Award} title={`Outcome Certification${ev.overallAttainment ? ` — ${ev.overallAttainment}% attainment` : ""}`}>
        <div className="flex flex-col gap-3 pt-1">
          <div className="grid grid-cols-3 gap-2">
            {(ev.kpiAttainment as Array<{name: string; target: number; current: number; attainment: number; status: string}>).map((kpi, i) => (
              <div key={i} className="flex flex-col gap-1 p-2.5 rounded-md bg-muted/20" data-testid={`kpi-card-${approval.id}-${i}`}>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{kpi.name}</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-semibold">{kpi.current}</span>
                  <span className="text-[10px] text-muted-foreground">/ {kpi.target}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${kpi.attainment >= 100 ? "bg-emerald-500" : kpi.attainment >= 80 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${Math.min(100, kpi.attainment)}%` }} />
                  </div>
                  <span className={`text-[10px] font-medium ${kpi.attainment >= 100 ? "text-emerald-600 dark:text-emerald-400" : kpi.attainment >= 80 ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`}>{kpi.attainment.toFixed(0)}%</span>
                </div>
                <Badge variant="outline" className={`text-[9px] w-fit ${kpi.status === "exceeded" ? "text-emerald-600" : kpi.status === "met" ? "text-blue-600" : "text-amber-600"}`}>{kpi.status.replace(/_/g," ")}</Badge>
              </div>
            ))}
          </div>
          {ev.billingImpact && (
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/20 text-xs" data-testid={`billing-impact-${approval.id}`}>
              <span className="text-muted-foreground">Billing Impact</span><span className="font-medium">{ev.billingImpact}</span>
            </div>
          )}
          {ev.recommendation && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/5 border border-blue-500/10 text-xs" data-testid={`certification-recommendation-${approval.id}`}>
              <span className="text-muted-foreground">Recommendation:</span><span className="font-medium">{ev.recommendation}</span>
            </div>
          )}
        </div>
      </SectionBlock>
    );
  }

  if (approval.type === "blueprint_review" && ev?.blueprintSummary) {
    return (
      <SectionBlock icon={FileText} title="Blueprint Review — Evidence">
        <div className="flex flex-col gap-3 pt-1" data-testid={`blueprint-review-${approval.id}`}>
          <div className="grid grid-cols-4 gap-2">
            {[
              ["Model", `${ev.blueprintSummary.modelProvider}/${ev.blueprintSummary.modelName}`],
              ["Tools", `${ev.blueprintSummary.toolCount} configured`],
              ["Workflow Nodes", String(ev.blueprintSummary.workflowNodeCount)],
              ["Eval Tests", `${ev.blueprintSummary.evalTestCaseCount} auto`],
            ].map(([label, val]) => (
              <div key={label} className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
                <span className="text-xs font-medium">{val}</span>
              </div>
            ))}
          </div>
          {ev.validationChecklist && (
            <div className="flex flex-col gap-2">
              {["domain","regulatory","escalation"].map(cat => {
                const items = (ev.validationChecklist as Array<{item: string; validated: boolean; category: string}>).filter(c => c.category === cat);
                if (!items.length) return null;
                const labels: Record<string,string> = { domain: "Domain Assumptions", regulatory: "Regulatory Constraints", escalation: "Escalation Paths" };
                return (
                  <div key={cat} className="flex flex-col gap-1" data-testid={`checklist-${cat}-${approval.id}`}>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{labels[cat]}</span>
                    {items.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 pl-2">
                        <div className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${item.validated ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground/30"}`}>
                          {item.validated && <CheckCircle className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{item.item}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SectionBlock>
    );
  }

  if (approval.type === "launch_readiness" && ev) {
    return (
      <SectionBlock icon={Rocket} title="Launch Readiness — Evidence">
        <div className="flex flex-col gap-3 pt-1" data-testid={`launch-readiness-${approval.id}`}>
          {ev.canaryMetrics && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Canary Metrics</span>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(ev.canaryMetrics as Record<string, string|number>).map(([k,v]) => (
                  <div key={k} className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20">
                    <span className="text-[10px] text-muted-foreground capitalize">{k.replace(/([A-Z])/g," $1").trim()}</span>
                    <span className="text-xs font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {ev.evalResults?.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Eval Results</span>
              <div className="grid grid-cols-2 gap-1.5">
                {(ev.evalResults as Array<{name: string; passRate: number; totalCases: number}>).map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/20">
                    <span className="text-xs font-medium truncate">{s.name}</span>
                    <span className={`text-xs font-semibold ${(s.passRate ?? 0) >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>{(s.passRate ?? 0).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SectionBlock>
    );
  }

  if (approval.type === "anomaly_review" && ev) {
    return (
      <SectionBlock icon={AlertTriangle} title={`Anomaly Review — ${ev.severity ?? "unknown"} severity`}>
        <div className="flex flex-col gap-3 pt-1" data-testid={`anomaly-review-${approval.id}`}>
          <div className="grid grid-cols-4 gap-2">
            {[
              ["Metric", ev.metric === "pass_rate" ? "Pass Rate" : ev.metric === "hallucination" ? "Faithfulness" : ev.metric === "avg_latency" ? "Avg Latency" : ev.metric],
              ["Drift", `${Math.abs(ev.driftPercent ?? 0).toFixed(1)}%`],
              ["Baseline", ev.metric === "avg_latency" ? `${ev.baseline}ms` : `${(ev.baseline * 100).toFixed(1)}%`],
              ["Current", ev.metric === "avg_latency" ? `${ev.current}ms` : `${(ev.current * 100).toFixed(1)}%`],
            ].map(([label, val]) => (
              <div key={label} className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
                <span className="text-xs font-medium">{val}</span>
              </div>
            ))}
          </div>
          {ev.agentName && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/20 text-xs">
              <Activity className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">Agent:</span><span className="font-medium">{ev.agentName}</span>
              {ev.suiteName && <><span className="text-muted-foreground">| Suite:</span><span className="font-medium">{ev.suiteName}</span></>}
            </div>
          )}
          {ev.affectedOutcomes?.length > 0 && (
            <div className="flex flex-col gap-1.5" data-testid={`anomaly-affected-outcomes-${approval.id}`}>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Affected Outcomes</span>
              <div className="flex flex-wrap gap-1.5">
                {(ev.affectedOutcomes as string[]).map((name, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">{name}</Badge>
                ))}
              </div>
            </div>
          )}
          {ev.suggestedRemediation && (
            <div className="flex flex-col gap-1 p-2.5 rounded-md bg-muted/20" data-testid={`anomaly-remediation-${approval.id}`}>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Suggested Remediation</span>
              <p className="text-xs">{ev.suggestedRemediation}</p>
            </div>
          )}
        </div>
      </SectionBlock>
    );
  }

  return null;
}
