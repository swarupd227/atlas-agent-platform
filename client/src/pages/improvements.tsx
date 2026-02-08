import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { OutcomeKpiStrip } from "@/components/outcome-kpi-strip";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lightbulb, Check, X, Undo2, ChevronDown, ChevronRight, AlertTriangle, TrendingUp, FlaskConical, Shield, ShieldAlert, Clock, RefreshCcw, DollarSign } from "lucide-react";
import { Link } from "wouter";
import type { ImprovementRecommendation, Agent } from "@shared/schema";

function formatDate(date: string | Date | null | undefined) {
  if (!date) return "\u2014";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const severityConfig: Record<string, { color: string; variant: "default" | "success" | "warning" | "danger" }> = {
  critical: { color: "bg-red-500/10 text-red-600 dark:text-red-400", variant: "danger" },
  high: { color: "bg-orange-500/10 text-orange-600 dark:text-orange-400", variant: "warning" },
  medium: { color: "bg-amber-500/10 text-amber-600 dark:text-amber-400", variant: "warning" },
  low: { color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", variant: "success" },
};

const sourceIcons: Record<string, typeof FlaskConical> = {
  eval: FlaskConical,
  trace: TrendingUp,
  drift: AlertTriangle,
  policy: Shield,
  cost: DollarSign,
};

const statusFilters = ["all", "pending", "applied", "dismissed"] as const;
const sourceFilters = ["all", "eval", "trace", "drift", "policy", "cost"] as const;
const severityFilters = ["all", "critical", "high", "medium", "low"] as const;

export default function Improvements() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [policyCheckResult, setPolicyCheckResult] = useState<{
    recommendationId: string;
    allowed: boolean;
    violations: Array<{ policyName: string; rule: string; severity: string; message: string }>;
    sandboxAvailable: boolean;
  } | null>(null);

  const { data: recommendations, isLoading } = useQuery<ImprovementRecommendation[]>({
    queryKey: ["/api/recommendations"],
  });

  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/recommendations/generate");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
      const count = data?.generated ?? 0;
      toast({ title: "Recommendations generated", description: `${count} new recommendation${count !== 1 ? "s" : ""} generated.` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to generate", description: err.message, variant: "destructive" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/recommendations/${id}`, {
        status: "applied",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
      toast({ title: "Recommendation applied", description: "The recommendation has been applied successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to apply", description: err.message, variant: "destructive" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/recommendations/${id}`, {
        status: "dismissed",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
      toast({ title: "Recommendation dismissed", description: "The recommendation has been dismissed." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to dismiss", description: err.message, variant: "destructive" });
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/recommendations/${id}`, {
        status: "pending",
        appliedAt: null,
        dismissedAt: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
      toast({ title: "Action undone", description: "The recommendation has been reverted to pending." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to undo", description: err.message, variant: "destructive" });
    },
  });

  const policyCheckMutation = useMutation({
    mutationFn: async (rec: ImprovementRecommendation) => {
      const res = await apiRequest("POST", "/api/policy-check", {
        agentId: rec.agentId,
        actionType: rec.type,
        changes: rec.suggestedChanges,
      });
      return res.json();
    },
  });

  const requestApprovalMutation = useMutation({
    mutationFn: async (recommendationId: string) => {
      const rec = recommendations?.find(r => r.id === recommendationId);
      const agent = agents?.find(a => a.id === rec?.agentId);
      await apiRequest("POST", "/api/approvals", {
        type: "auto_patch",
        objectType: "recommendation",
        objectId: recommendationId,
        objectName: rec?.title || "Auto-patch",
        riskScore: rec?.severity === "critical" ? 0.9 : rec?.severity === "high" ? 0.7 : 0.5,
        status: "pending",
        requestedBy: "system",
        description: `Policy guardrail blocked auto-apply: ${rec?.title}. Agent: ${agent?.name || rec?.agentId}. Requires expert validation.`,
        evidenceJson: {
          recommendationType: rec?.type,
          severity: rec?.severity,
          source: rec?.source,
          suggestedChanges: rec?.suggestedChanges,
          impact: rec?.impact,
        },
      });
    },
    onSuccess: () => {
      toast({ title: "Approval requested", description: "This change has been escalated for expert review." });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to request approval", description: err.message, variant: "destructive" });
    },
  });

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const all = recommendations || [];
  const pendingCount = all.filter((r) => r.status === "pending").length;
  const appliedCount = all.filter((r) => r.status === "applied").length;
  const dismissedCount = all.filter((r) => r.status === "dismissed").length;
  const costRecs = all.filter((r) => r.source === "cost" && r.status !== "dismissed").length;
  const estimatedSavings = costRecs * 950;

  const filtered = all.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
    if (severityFilter !== "all" && r.severity !== severityFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-improvements">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-amber-500/10 shrink-0">
            <Lightbulb className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
              Auto-Improvement Loop
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="text-page-description">
              AI-generated recommendations from traces, evaluations, and drift detection
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="button-generate-recommendations"
        >
          <RefreshCcw className={`w-3.5 h-3.5 mr-1 ${generateMutation.isPending ? "animate-spin" : ""}`} />
          Generate Recommendations
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Recommendations"
          value={all.length}
          icon={Lightbulb}
          variant="default"
          testId="stat-total-recommendations"
        />
        <StatCard
          title="Pending"
          value={pendingCount}
          icon={Clock}
          variant="warning"
          testId="stat-pending"
        />
        <StatCard
          title="Applied"
          value={appliedCount}
          icon={Check}
          variant="success"
          testId="stat-applied"
        />
        <StatCard
          title="Dismissed"
          value={dismissedCount}
          icon={X}
          variant="danger"
          testId="stat-dismissed"
        />
        <StatCard
          title="Est. Monthly Savings"
          value={`$${estimatedSavings.toLocaleString()}`}
          icon={DollarSign}
          variant="success"
          testId="stat-estimated-savings"
        />
      </div>

      <OutcomeKpiStrip compact />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Status:</span>
            {statusFilters.map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
                data-testid={`filter-status-${s}`}
                className="toggle-elevate"
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Source:</span>
            {sourceFilters.map((s) => (
              <Button
                key={s}
                variant={sourceFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setSourceFilter(s)}
                data-testid={`filter-source-${s}`}
                className="toggle-elevate"
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Severity:</span>
            {severityFilters.map((s) => (
              <Button
                key={s}
                variant={severityFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setSeverityFilter(s)}
                data-testid={`filter-severity-${s}`}
                className="toggle-elevate"
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3" data-testid="empty-state">
            <Lightbulb className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No recommendations match your filters</p>
          </div>
        )}

        {filtered.map((rec) => {
          const SourceIcon = sourceIcons[rec.source] || Lightbulb;
          const sevConfig = severityConfig[rec.severity] || severityConfig.low;
          const isExpanded = expandedIds.has(rec.id);
          const isPending = rec.status === "pending";

          return (
            <Card key={rec.id} data-testid={`card-recommendation-${rec.id}`}>
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" data-testid={`text-title-${rec.id}`}>
                        {rec.title}
                      </span>
                      <Badge variant="outline" className="text-[11px]" data-testid={`badge-source-${rec.id}`}>
                        <SourceIcon className="w-3 h-3 mr-1" />
                        {rec.source}
                      </Badge>
                      <Badge variant="outline" className="text-[11px]" data-testid={`badge-type-${rec.id}`}>
                        {rec.type.replace(/_/g, " ")}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[11px] ${sevConfig.color}`}
                        data-testid={`badge-severity-${rec.id}`}
                      >
                        {rec.severity}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[11px]"
                        data-testid={`badge-status-${rec.id}`}
                      >
                        {rec.status}
                      </Badge>
                    </div>
                    {rec.description && (
                      <p className="text-xs text-muted-foreground" data-testid={`text-description-${rec.id}`}>
                        {rec.description}
                      </p>
                    )}
                    {rec.impact && (
                      <p className="text-xs text-muted-foreground" data-testid={`text-impact-${rec.id}`}>
                        <TrendingUp className="w-3 h-3 inline-block mr-1" />
                        {rec.impact}
                      </p>
                    )}
                  </div>
                </div>

                {rec.suggestedChanges != null && (
                  <div className="flex flex-col gap-1">
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer"
                      onClick={() => toggleExpanded(rec.id)}
                      data-testid={`button-toggle-changes-${rec.id}`}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                      Suggested Changes
                    </button>
                    {isExpanded && (
                      <pre
                        className="text-xs bg-muted/50 p-3 rounded-md overflow-x-auto"
                        data-testid={`text-suggested-changes-${rec.id}`}
                      >
                        {JSON.stringify(rec.suggestedChanges as Record<string, unknown>, null, 2)}
                      </pre>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-2 border-t flex-wrap">
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                    <Link href={`/agents/${rec.agentId}`}>
                      <span className="underline cursor-pointer" data-testid={`link-agent-${rec.id}`}>
                        {agents?.find((a) => a.id === rec.agentId)?.name || "Agent " + rec.agentId.substring(0, 8)}
                      </span>
                    </Link>
                    <span data-testid={`text-created-${rec.id}`}>
                      {formatDate(rec.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isPending ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => dismissMutation.mutate(rec.id)}
                          disabled={dismissMutation.isPending}
                          data-testid={`button-dismiss-${rec.id}`}
                        >
                          <X className="w-3.5 h-3.5 mr-1" />
                          Dismiss
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            policyCheckMutation.mutate(rec, {
                              onSuccess: (result: any) => {
                                if (result.allowed) {
                                  applyMutation.mutate(rec.id);
                                } else {
                                  setPolicyCheckResult({ recommendationId: rec.id, ...result });
                                }
                              },
                            });
                          }}
                          disabled={applyMutation.isPending || policyCheckMutation.isPending}
                          data-testid={`button-apply-${rec.id}`}
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          Apply
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => undoMutation.mutate(rec.id)}
                        disabled={undoMutation.isPending}
                        data-testid={`button-undo-${rec.id}`}
                      >
                        <Undo2 className="w-3.5 h-3.5 mr-1" />
                        Undo
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={policyCheckResult !== null} onOpenChange={() => setPolicyCheckResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Policy Guardrail Triggered
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              This change cannot be auto-applied because it exceeds policy bounds. Expert approval is required.
            </p>
            {policyCheckResult?.violations.map((v, idx) => (
              <div key={idx} className="flex flex-col gap-1 p-3 rounded-md bg-amber-500/5 border border-amber-500/10" data-testid={`policy-violation-${idx}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{v.policyName}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${v.severity === "high" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>{v.severity}</Badge>
                </div>
                <span className="text-xs font-medium">{v.rule}</span>
                <span className="text-[11px] text-muted-foreground">{v.message}</span>
              </div>
            ))}
            {policyCheckResult?.sandboxAvailable && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/5 border border-blue-500/10 flex-wrap" data-testid="sandbox-notice">
                <Shield className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[11px] text-muted-foreground">Sandbox testing is available for non-production environments</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
            <Button variant="outline" onClick={() => setPolicyCheckResult(null)} data-testid="button-cancel-policy">
              Cancel
            </Button>
            <Button
              onClick={() => {
                requestApprovalMutation.mutate(policyCheckResult!.recommendationId);
                setPolicyCheckResult(null);
              }}
              data-testid="button-request-approval"
            >
              <Shield className="w-4 h-4 mr-1.5" />
              Request Expert Approval
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
