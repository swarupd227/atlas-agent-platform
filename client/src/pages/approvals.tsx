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
  ChevronDown,
  ChevronUp,
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { PermissionGate, usePermission } from "@/components/role-provider";
import { ConfigDiff } from "@/components/config-diff";
import { BlastRadius } from "@/components/blast-radius";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import type { Approval, EvalSuite, EvalRun, Agent, OutcomeContract } from "@shared/schema";

export default function Approvals() {
  const [search, setSearch] = useState("");
  const [riskTierFilter, setRiskTierFilter] = useState<string>("all");
  const [objectTypeFilter, setObjectTypeFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [requesterFilter, setRequesterFilter] = useState<string>("all");
  const [dueDateFilter, setDueDateFilter] = useState<string>("all");
  const [requestChangesId, setRequestChangesId] = useState<string | null>(null);
  const [requestChangesComment, setRequestChangesComment] = useState("");
  const { toast } = useToast();
  const approvalPerm = usePermission("approve_changes");

  const { data: approvals, isLoading } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });

  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null);

  const { data: evalSuites } = useQuery<EvalSuite[]>({
    queryKey: ["/api/evals"],
  });
  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: outcomes } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
  });
  const { data: driftSignals } = useQuery<Array<{
    id: string;
    agentId: string;
    agentName: string;
    suiteName: string;
    metric: string;
    driftPercent: number;
    severity: string;
    status: string;
  }>>({
    queryKey: ["/api/drift-signals"],
  });

  const decideMutation = useMutation({
    mutationFn: async ({ id, status, constraintsJson }: { id: string; status: string; constraintsJson?: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/approvals/${id}`, { status, decidedBy: "Expert Validator", constraintsJson });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: "Approval updated" });
      setRequestChangesId(null);
      setRequestChangesComment("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update approval", description: err.message, variant: "destructive" });
    },
  });

  const computeEvidenceCompleteness = (approval: Approval): number => {
    const evidence = approval.evidenceJson as Record<string, unknown> | null;
    let score = 0;
    let total = 5;
    if (approval.diffSummary || (evidence as any)?.configDiff) score++;
    if ((evidence as any)?.evalResults || (evidence as any)?.kpiAttainment) score++;
    if ((evidence as any)?.shadowReplayResults) score++;
    if ((evidence as any)?.blastRadius || (evidence as any)?.affectedOutcomes) score++;
    if (approval.riskScore !== null && approval.riskScore !== undefined) score++;
    return Math.round((score / total) * 100);
  };

  const renderEvidencePackage = (approval: Approval) => {
    const evidenceData = approval.evidenceJson as Record<string, unknown> | null;
    const agentSuites = evalSuites?.filter(s => s.agentId === approval.objectId) || [];
    const agentDriftSignals = driftSignals?.filter(d => d.agentId === approval.objectId) || [];
    const criticalDrift = agentDriftSignals.filter(d => d.severity === "critical" || d.severity === "high");
    
    return (
      <div className="flex flex-col gap-3 pt-3 border-t" data-testid={`evidence-package-${approval.id}`}>
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Evidence Package</span>
        </div>
        
        {approval.type === "outcome_review" && (evidenceData as any)?.proposedKpis && (
          <div className="flex flex-col gap-2" data-testid={`outcome-review-${approval.id}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <Target className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-medium">Outcome Review</span>
              <Badge variant="outline" className="text-[10px] text-blue-600 dark:text-blue-400">Requires Validation</Badge>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Proposed KPIs ({((evidenceData as any).proposedKpis as any[]).length})</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {((evidenceData as any).proposedKpis as Array<{name: string; target: number; unit: string; measurement: string}>).map((kpi, idx) => (
                  <div key={idx} className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/30" data-testid={`review-kpi-${approval.id}-${idx}`}>
                    <span className="text-[11px] font-medium">{kpi.name}</span>
                    <span className="text-[10px] text-muted-foreground">Target: {kpi.target}{kpi.unit}</span>
                    <span className="text-[10px] text-muted-foreground">{kpi.measurement}</span>
                  </div>
                ))}
              </div>
            </div>
            {(evidenceData as any).proposedAgents?.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Proposed Agents ({((evidenceData as any).proposedAgents as any[]).length})</span>
                <div className="flex flex-wrap gap-1.5">
                  {((evidenceData as any).proposedAgents as Array<{name: string; role: string; autonomyMode: string}>).map((agent, idx) => (
                    <Badge key={idx} variant="outline" className="text-[10px]" data-testid={`review-agent-${approval.id}-${idx}`}>
                      {agent.name} ({agent.autonomyMode})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {(evidenceData as any).validationChecklist?.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Expert Validation Required</span>
                {((evidenceData as any).validationChecklist as string[]).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[11px]">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {approval.type === "outcome_certification" && (evidenceData as any)?.kpiAttainment && (
          <div className="flex flex-col gap-2" data-testid={`certification-kpis-${approval.id}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Award className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-medium">Outcome Certification</span>
              </div>
              {(evidenceData as any).overallAttainment && (
                <Badge variant="outline" className="text-[10px]" data-testid={`badge-overall-attainment-${approval.id}`}>
                  {(evidenceData as any).overallAttainment}% overall attainment
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {((evidenceData as any).kpiAttainment as Array<{name: string; target: number; current: number; attainment: number; status: string}>).map((kpi, idx) => (
                <div key={idx} className="flex flex-col gap-1 p-2.5 rounded-md bg-muted/30" data-testid={`kpi-card-${approval.id}-${idx}`}>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.name}</span>
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold">{kpi.current}</span>
                    <span className="text-[10px] text-muted-foreground">/ {kpi.target} target</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${kpi.attainment >= 100 ? "bg-emerald-500" : kpi.attainment >= 80 ? "bg-blue-500" : "bg-amber-500"}`}
                        style={{ width: `${Math.min(100, kpi.attainment)}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-medium ${kpi.attainment >= 100 ? "text-emerald-600 dark:text-emerald-400" : kpi.attainment >= 80 ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {kpi.attainment.toFixed(1)}%
                    </span>
                  </div>
                  <Badge variant="outline" className={`text-[9px] w-fit ${kpi.status === "exceeded" ? "text-emerald-600 dark:text-emerald-400" : kpi.status === "met" || kpi.status === "on_track" ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {kpi.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
            </div>
            {(evidenceData as any).billingImpact && (
              <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/20 flex-wrap" data-testid={`billing-impact-${approval.id}`}>
                <span className="text-[11px] text-muted-foreground">Billing Impact</span>
                <span className="text-[11px] font-medium">{(evidenceData as any).billingImpact}</span>
              </div>
            )}
            {(evidenceData as any).recommendation && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/5 border border-blue-500/10 flex-wrap" data-testid={`certification-recommendation-${approval.id}`}>
                <span className="text-[11px] text-muted-foreground">Recommendation:</span>
                <span className="text-[11px] font-medium">{(evidenceData as any).recommendation}</span>
              </div>
            )}
          </div>
        )}

        {approval.type === "blueprint_review" && (evidenceData as any)?.blueprintSummary && (
          <div className="flex flex-col gap-3" data-testid={`blueprint-review-${approval.id}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-medium">Blueprint Review</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(evidenceData as any).riskTier && (
                  <Badge
                    variant={(evidenceData as any).riskTier === "HIGH" ? "destructive" : "secondary"}
                    className="text-[10px]"
                    data-testid={`badge-risk-tier-${approval.id}`}
                  >
                    {(evidenceData as any).riskTier} Risk
                  </Badge>
                )}
                {(evidenceData as any).autonomyMode && (
                  <Badge variant="outline" className="text-[10px]" data-testid={`badge-autonomy-${approval.id}`}>
                    {(evidenceData as any).autonomyMode}
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Model</span>
                <span className="text-xs font-medium">{(evidenceData as any).blueprintSummary.modelProvider}/{(evidenceData as any).blueprintSummary.modelName}</span>
              </div>
              <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tools</span>
                <span className="text-xs font-medium">{(evidenceData as any).blueprintSummary.toolCount} configured</span>
              </div>
              <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Workflow Nodes</span>
                <span className="text-xs font-medium">{(evidenceData as any).blueprintSummary.workflowNodeCount}</span>
              </div>
              <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Eval Tests</span>
                <span className="text-xs font-medium">{(evidenceData as any).blueprintSummary.evalTestCaseCount} auto-generated</span>
              </div>
            </div>

            {(evidenceData as any).validationChecklist && (
              <div className="flex flex-col gap-2">
                {["domain", "regulatory", "escalation"].map((category) => {
                  const items = ((evidenceData as any).validationChecklist as Array<{item: string; validated: boolean; category: string}>)
                    .filter((c: any) => c.category === category);
                  if (items.length === 0) return null;
                  const categoryLabels: Record<string, string> = {
                    domain: "Domain Assumptions",
                    regulatory: "Regulatory Constraints",
                    escalation: "Escalation Paths",
                  };
                  const categoryIcons: Record<string, typeof Shield> = {
                    domain: Target,
                    regulatory: Shield,
                    escalation: Activity,
                  };
                  const CategoryIcon = categoryIcons[category] || Shield;
                  return (
                    <div key={category} className="flex flex-col gap-1.5" data-testid={`checklist-${category}-${approval.id}`}>
                      <div className="flex items-center gap-1.5">
                        <CategoryIcon className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{categoryLabels[category]}</span>
                      </div>
                      {items.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 pl-4">
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
        )}

        {approval.type === "launch_readiness" && evidenceData && (
          <div className="flex flex-col gap-3" data-testid={`launch-readiness-${approval.id}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Rocket className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-medium">Launch Readiness Review</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(evidenceData as any).riskTier && (
                  <Badge
                    variant={(evidenceData as any).riskTier === "HIGH" ? "destructive" : "secondary"}
                    className="text-[10px]"
                  >
                    {(evidenceData as any).riskTier} Risk
                  </Badge>
                )}
                {(evidenceData as any).autonomyMode && (
                  <Badge variant="outline" className="text-[10px]">
                    {(evidenceData as any).autonomyMode}
                  </Badge>
                )}
              </div>
            </div>

            {(evidenceData as any).canaryMetrics && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Canary Metrics</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries((evidenceData as any).canaryMetrics as Record<string, string | number>).map(([key, val]) => (
                    <div key={key} className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20">
                      <span className="text-[10px] text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                      <span className="text-xs font-medium">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(evidenceData as any).evalResults && (evidenceData as any).evalResults.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Eval Results</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {((evidenceData as any).evalResults as Array<{name: string; passRate: number; totalCases: number}>).map((suite, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30">
                      <span className="text-[11px] font-medium truncate">{suite.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[11px] font-semibold ${(suite.passRate || 0) >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                          {(suite.passRate || 0).toFixed(0)}%
                        </span>
                        <span className="text-[10px] text-muted-foreground">({suite.totalCases} cases)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {approval.type === "anomaly_review" && evidenceData && (
          <div className="flex flex-col gap-3" data-testid={`anomaly-review-${approval.id}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-medium">Anomaly Review</span>
              </div>
              <Badge variant={(evidenceData as any).severity === "critical" ? "destructive" : "outline"} className="text-[10px]" data-testid={`badge-anomaly-severity-${approval.id}`}>
                {(evidenceData as any).severity || "unknown"} severity
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20" data-testid={`anomaly-metric-${approval.id}`}>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Metric</span>
                <span className="text-xs font-medium">
                  {(evidenceData as any).metric === "pass_rate" ? "Pass Rate" : (evidenceData as any).metric === "hallucination" ? "Faithfulness" : (evidenceData as any).metric === "avg_latency" ? "Avg Latency" : (evidenceData as any).metric}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Drift</span>
                <span className={`text-xs font-semibold ${Math.abs((evidenceData as any).driftPercent || 0) > 10 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {Math.abs((evidenceData as any).driftPercent || 0).toFixed(1)}%
                </span>
              </div>
              <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Baseline</span>
                <span className="text-xs font-medium">
                  {(evidenceData as any).metric === "avg_latency" ? `${(evidenceData as any).baseline}ms` : `${((evidenceData as any).baseline * 100).toFixed(1)}%`}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Current</span>
                <span className="text-xs font-medium">
                  {(evidenceData as any).metric === "avg_latency" ? `${(evidenceData as any).current}ms` : `${((evidenceData as any).current * 100).toFixed(1)}%`}
                </span>
              </div>
            </div>

            {(evidenceData as any).agentName && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/20">
                <Activity className="w-3 h-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Agent:</span>
                <span className="text-[11px] font-medium">{(evidenceData as any).agentName}</span>
                {(evidenceData as any).suiteName && (
                  <>
                    <span className="text-[11px] text-muted-foreground">| Suite:</span>
                    <span className="text-[11px] font-medium">{(evidenceData as any).suiteName}</span>
                  </>
                )}
              </div>
            )}

            {(evidenceData as any).affectedOutcomes && (evidenceData as any).affectedOutcomes.length > 0 && (
              <div className="flex flex-col gap-1.5" data-testid={`anomaly-affected-outcomes-${approval.id}`}>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Affected Outcomes</span>
                <div className="flex flex-wrap gap-1.5">
                  {((evidenceData as any).affectedOutcomes as string[]).map((name, idx) => (
                    <Badge key={idx} variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {(evidenceData as any).suggestedRemediation && (
              <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/10" data-testid={`anomaly-remediation-${approval.id}`}>
                <TrendingDown className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Suggested Remediation</span>
                  <span className="text-[11px] font-medium">{(evidenceData as any).suggestedRemediation}</span>
                </div>
              </div>
            )}

            {(evidenceData as any).detectedAt && (
              <span className="text-[10px] text-muted-foreground">Detected: {new Date((evidenceData as any).detectedAt).toLocaleString()}</span>
            )}
          </div>
        )}

        {(evidenceData as any)?.configDiff && (
          <ConfigDiff
            changes={(evidenceData as any).configDiff.changes || []}
            version={(evidenceData as any).configDiff.version}
            summary={(evidenceData as any).configDiff.summary}
            testIdPrefix={`diff-${approval.id}`}
          />
        )}

        {(evidenceData as any)?.blastRadius && (
          <BlastRadius
            data={(evidenceData as any).blastRadius}
            testIdPrefix={`blast-${approval.id}`}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5 p-2.5 rounded-md bg-muted/30">
            <div className="flex items-center gap-1.5">
              <FlaskConical className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Eval Results</span>
            </div>
            {agentSuites.length === 0 ? (
              <span className="text-xs text-muted-foreground">No eval suites found</span>
            ) : (
              <div className="flex flex-col gap-1">
                {agentSuites.slice(0, 3).map(suite => (
                  <div key={suite.id} className="flex items-center justify-between gap-2">
                    <Link href={`/evals/${suite.id}`}>
                      <span className="text-[11px] font-medium truncate underline decoration-muted-foreground/30" data-testid={`link-eval-suite-${suite.id}`}>{suite.name}</span>
                    </Link>
                    <span className={`text-[11px] font-medium ${(suite.passRate || 0) > 0.9 ? "text-emerald-600 dark:text-emerald-400" : (suite.passRate || 0) > 0.75 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                      {((suite.passRate || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
                {agentSuites.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{agentSuites.length - 3} more suites</span>
                )}
              </div>
            )}
          </div>
          
          <div className="flex flex-col gap-1.5 p-2.5 rounded-md bg-muted/30">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Drift Status</span>
            </div>
            {agentDriftSignals.length === 0 ? (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs text-emerald-600 dark:text-emerald-400">No drift detected</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {criticalDrift.length > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-[11px] text-red-600 dark:text-red-400 font-medium">
                      {criticalDrift.length} critical/high signal{criticalDrift.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                {agentDriftSignals.filter(d => d.severity === "medium" || d.severity === "low").length > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-[11px] text-muted-foreground">
                      {agentDriftSignals.filter(d => d.severity === "medium" || d.severity === "low").length} medium/low signal{agentDriftSignals.filter(d => d.severity === "medium" || d.severity === "low").length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="flex flex-col gap-1.5 p-2.5 rounded-md bg-muted/30">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Assessment</span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">Risk Score</span>
                <span className={`text-[11px] font-medium ${(approval.riskScore || 0) > 7 ? "text-red-600 dark:text-red-400" : (approval.riskScore || 0) > 4 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`} data-testid={`text-risk-score-${approval.id}`}>
                  {approval.riskScore}/10
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">Eval Coverage</span>
                <span className="text-[11px] font-medium" data-testid={`text-eval-coverage-${approval.id}`}>{agentSuites.length} suite{agentSuites.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">Active Drift</span>
                <span className={`text-[11px] font-medium ${agentDriftSignals.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`} data-testid={`text-drift-status-${approval.id}`}>
                  {agentDriftSignals.length > 0 ? `${agentDriftSignals.length} signals` : "Clear"}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {evidenceData && (
          <div className="p-2.5 rounded-md bg-muted/30">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Attached Evidence Data</span>
            <pre className="text-[11px] text-muted-foreground mt-1 font-mono overflow-x-auto">
              {JSON.stringify(evidenceData, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  };

  const hasActiveFilters = riskTierFilter !== "all" || objectTypeFilter !== "all" || outcomeFilter !== "all" || agentFilter !== "all" || requesterFilter !== "all" || dueDateFilter !== "all";

  const clearAllFilters = () => {
    setRiskTierFilter("all");
    setObjectTypeFilter("all");
    setOutcomeFilter("all");
    setAgentFilter("all");
    setRequesterFilter("all");
    setDueDateFilter("all");
    setSearch("");
  };

  const filtered = approvals?.filter((a) => {
    if (search && !(a.objectName || a.type || "").toLowerCase().includes(search.toLowerCase())) return false;

    if (riskTierFilter !== "all") {
      const riskLevel = (a.riskScore || 0) > 7 ? "high" : (a.riskScore || 0) > 4 ? "medium" : "low";
      if (riskLevel !== riskTierFilter) return false;
    }

    if (objectTypeFilter !== "all") {
      if (a.objectType !== objectTypeFilter) return false;
    }

    if (outcomeFilter !== "all") {
      if (a.outcomeId !== outcomeFilter && a.objectId !== outcomeFilter) return false;
    }

    if (agentFilter !== "all") {
      if (a.agentId !== agentFilter && a.objectId !== agentFilter) return false;
    }

    if (requesterFilter !== "all") {
      const isAuto = (a.requesterType === "system" || a.requesterType === "auto" || (a.requestedBy || "").toLowerCase().includes("system") || (a.requestedBy || "").toLowerCase().includes("auto"));
      if (requesterFilter === "human" && isAuto) return false;
      if (requesterFilter === "auto" && !isAuto) return false;
    }

    if (dueDateFilter !== "all" && a.dueDate) {
      const now = new Date();
      const due = new Date(a.dueDate);
      const hoursLeft = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (dueDateFilter === "overdue" && hoursLeft > 0) return false;
      if (dueDateFilter === "due_soon" && (hoursLeft <= 0 || hoursLeft > 24)) return false;
      if (dueDateFilter === "on_track" && hoursLeft <= 24) return false;
    } else if (dueDateFilter !== "all" && !a.dueDate) {
      if (dueDateFilter === "overdue" || dueDateFilter === "due_soon") return false;
    }

    return true;
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const pending = approvals?.filter((a) => a.status === "pending")?.length || 0;
  const approved = approvals?.filter((a) => a.status === "approved")?.length || 0;
  const rejected = approvals?.filter((a) => a.status === "rejected")?.length || 0;

  const riskColors: Record<string, string> = {
    low: "bg-emerald-500/10",
    medium: "bg-amber-500/10",
    high: "bg-red-500/10",
  };

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-approvals">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Approval Queue</h1>
          <p className="text-sm text-muted-foreground">
            Expert validation console - the 20% supervision layer
          </p>
        </div>
        <Link href="/approvals/gates">
          <Button variant="outline" data-testid="button-approval-gates">
            <Shield className="w-4 h-4 mr-1.5" /> Approval Gates
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Pending" value={pending} icon={Clock} variant="warning" testId="stat-pending-approvals" />
        <StatCard title="Approved" value={approved} icon={CheckCircle} variant="success" testId="stat-approved" />
        <StatCard title="Rejected" value={rejected} icon={XCircle} variant="danger" testId="stat-rejected" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filters</span>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters} data-testid="button-clear-filters">
              <X className="w-3 h-3 mr-1" /> Clear all
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-approvals"
            />
          </div>
          <Select value={riskTierFilter} onValueChange={setRiskTierFilter}>
            <SelectTrigger className="w-36" data-testid="select-risk-tier">
              <SelectValue placeholder="Risk Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk Tiers</SelectItem>
              <SelectItem value="high">High Risk</SelectItem>
              <SelectItem value="medium">Medium Risk</SelectItem>
              <SelectItem value="low">Low Risk</SelectItem>
            </SelectContent>
          </Select>
          <Select value={objectTypeFilter} onValueChange={setObjectTypeFilter}>
            <SelectTrigger className="w-40" data-testid="select-object-type">
              <SelectValue placeholder="Object Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="agent_version">Version</SelectItem>
              <SelectItem value="policy">Policy</SelectItem>
              <SelectItem value="policy_exception">Exception</SelectItem>
              <SelectItem value="deployment">Deployment</SelectItem>
              <SelectItem value="outcome">Outcome</SelectItem>
              <SelectItem value="patch">Patch</SelectItem>
            </SelectContent>
          </Select>
          <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
            <SelectTrigger className="w-44" data-testid="select-outcome">
              <SelectValue placeholder="Outcome" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Outcomes</SelectItem>
              {outcomes?.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-44" data-testid="select-agent">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agents?.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={requesterFilter} onValueChange={setRequesterFilter}>
            <SelectTrigger className="w-40" data-testid="select-requester">
              <SelectValue placeholder="Requester" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Requesters</SelectItem>
              <SelectItem value="human">Human</SelectItem>
              <SelectItem value="auto">Automated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dueDateFilter} onValueChange={setDueDateFilter}>
            <SelectTrigger className="w-36" data-testid="select-due-date">
              <SelectValue placeholder="Due Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Due Dates</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="due_soon">Due Soon (24h)</SelectItem>
              <SelectItem value="on_track">On Track</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="pending" className="flex flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending {pending > 0 && <Badge variant="outline" className="ml-1.5 text-[10px]">{pending}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-0 flex flex-col gap-3">
          {filtered?.filter((a) => a.status === "pending").map((approval) => {
            const riskLevel = (approval.riskScore || 0) > 7 ? "high" : (approval.riskScore || 0) > 4 ? "medium" : "low";
            const completeness = computeEvidenceCompleteness(approval);
            const completenessColor = completeness >= 80 ? "bg-emerald-500" : completeness >= 50 ? "bg-amber-500" : "bg-red-500";
            return (
              <Card key={approval.id} data-testid={`card-approval-${approval.id}`}>
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex items-center justify-center w-9 h-9 rounded-md shrink-0 ${riskColors[riskLevel]}`}>
                        {approval.type === "outcome_certification" ? (
                          <Award className="w-4 h-4 text-blue-500" />
                        ) : approval.type === "outcome_review" ? (
                          <Target className="w-4 h-4 text-blue-500" />
                        ) : approval.type === "launch_readiness" ? (
                          <Rocket className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Shield className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="text-sm font-semibold truncate">{approval.objectName || approval.type}</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[9px]">{approval.objectType?.replace(/_/g, " ") || "unknown"}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {approval.type === "outcome_certification" ? "Outcome Certification" : approval.type === "outcome_review" ? "Outcome Review" : approval.type === "launch_readiness" ? "Launch Readiness" : approval.type.replace(/_/g, " ")} | Risk: {approval.riskScore}/10
                          </span>
                          {approval.requesterType === "system" || approval.requesterType === "auto" ? (
                            <Badge variant="outline" className="text-[9px]"><Bot className="w-2.5 h-2.5 mr-0.5" />Auto</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px]"><User className="w-2.5 h-2.5 mr-0.5" />Human</Badge>
                          )}
                          {approval.environment && (
                            <Badge variant="outline" className="text-[9px]">{approval.environment}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2" data-testid={`evidence-meter-${approval.id}`}>
                          <span className="text-[10px] text-muted-foreground shrink-0">Evidence</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[120px]">
                            <div
                              className={`h-full rounded-full ${completenessColor} transition-all`}
                              style={{ width: `${completeness}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-medium ${completeness >= 80 ? "text-emerald-600 dark:text-emerald-400" : completeness >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                            {completeness}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {approval.dueDate && (() => {
                        const hoursLeft = (new Date(approval.dueDate).getTime() - Date.now()) / (1000 * 60 * 60);
                        return (
                          <Badge variant="outline" className={`text-[9px] ${hoursLeft <= 0 ? "text-red-600 dark:text-red-400 border-red-500/30" : hoursLeft <= 24 ? "text-amber-600 dark:text-amber-400 border-amber-500/30" : "text-muted-foreground"}`} data-testid={`badge-sla-${approval.id}`}>
                            <CalendarClock className="w-2.5 h-2.5 mr-0.5" />
                            {hoursLeft <= 0 ? "Overdue" : hoursLeft <= 24 ? `${Math.round(hoursLeft)}h left` : `${Math.round(hoursLeft / 24)}d left`}
                          </Badge>
                        );
                      })()}
                      <StatusBadge status={approval.status} />
                    </div>
                  </div>
                  {approval.diffSummary && (
                    <div className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
                      <FileText className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                      <span className="text-[11px] text-muted-foreground">{approval.diffSummary}</span>
                    </div>
                  )}
                  {approval.description && (
                    <p className="text-xs text-muted-foreground">{approval.description}</p>
                  )}
                  {approval.recommendedAction && (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]" data-testid={`badge-recommended-${approval.id}`}>
                        Recommended: {approval.recommendedAction.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                    <span className="text-[11px] text-muted-foreground">Requested by {approval.requestedBy || "System"}</span>
                    <div className="flex-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedEvidence(expandedEvidence === approval.id ? null : approval.id)}
                      data-testid={`button-evidence-${approval.id}`}
                    >
                      {expandedEvidence === approval.id ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
                      Evidence
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => decideMutation.mutate({ id: approval.id, status: "rejected" })}
                      disabled={decideMutation.isPending || !approvalPerm.allowed}
                      title={!approvalPerm.allowed ? "You do not have permission to reject changes" : undefined}
                      data-testid={`button-reject-${approval.id}`}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRequestChangesId(requestChangesId === approval.id ? null : approval.id)}
                      disabled={!approvalPerm.allowed}
                      title={!approvalPerm.allowed ? "You do not have permission" : undefined}
                      data-testid={`button-request-changes-${approval.id}`}
                    >
                      <MessageSquare className="w-3.5 h-3.5 mr-1" /> Request Changes
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => decideMutation.mutate({ id: approval.id, status: "approved" })}
                      disabled={decideMutation.isPending || !approvalPerm.allowed}
                      title={!approvalPerm.allowed ? "You do not have permission to approve changes" : undefined}
                      data-testid={`button-approve-${approval.id}`}
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> {approval.type === "outcome_certification" ? "Certify" : approval.type === "outcome_review" ? "Validate" : approval.type === "blueprint_review" ? "Validate Blueprint" : approval.type === "launch_readiness" ? "Clear for Launch" : "Approve"}
                    </Button>
                    <Link href={`/approvals/${approval.id}`}>
                      <Button size="sm" variant="outline" data-testid={`button-view-details-${approval.id}`}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> View Details
                      </Button>
                    </Link>
                    {approval.type === "outcome_review" && approval.objectId && (
                      <Link href={`/outcomes/${approval.objectId}`}>
                        <Button size="sm" variant="outline" data-testid={`button-view-outcome-${approval.id}`}>
                          <ArrowRight className="w-3.5 h-3.5 mr-1" /> View Outcome
                        </Button>
                      </Link>
                    )}
                    {approval.type === "blueprint_review" && approval.objectId && (
                      <Link href={`/agents/${approval.objectId}`}>
                        <Button size="sm" variant="outline" data-testid={`button-view-agent-${approval.id}`}>
                          <ArrowRight className="w-3.5 h-3.5 mr-1" /> View Agent
                        </Button>
                      </Link>
                    )}
                    {approval.type === "launch_readiness" && approval.objectId && (
                      <Link href={`/deployments/${approval.objectId}`}>
                        <Button size="sm" variant="outline" data-testid={`button-view-deployment-${approval.id}`}>
                          <ArrowRight className="w-3.5 h-3.5 mr-1" /> View Deployment
                        </Button>
                      </Link>
                    )}
                  </div>
                  {requestChangesId === approval.id && (
                    <div className="flex flex-col gap-2 p-3 rounded-md bg-muted/30 border" data-testid={`request-changes-form-${approval.id}`}>
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">Request Changes</span>
                      </div>
                      <Textarea
                        placeholder="Describe what changes are needed before this can be approved..."
                        value={requestChangesComment}
                        onChange={(e) => setRequestChangesComment(e.target.value)}
                        className="text-sm"
                        data-testid={`textarea-request-changes-${approval.id}`}
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setRequestChangesId(null); setRequestChangesComment(""); }}
                          data-testid={`button-cancel-request-changes-${approval.id}`}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => decideMutation.mutate({
                            id: approval.id,
                            status: "changes_requested",
                            constraintsJson: { requestedChanges: requestChangesComment, requestedBy: "Expert Validator" },
                          })}
                          disabled={decideMutation.isPending || !requestChangesComment.trim()}
                          data-testid={`button-submit-request-changes-${approval.id}`}
                        >
                          Submit Feedback
                        </Button>
                      </div>
                    </div>
                  )}
                  {expandedEvidence === approval.id && renderEvidencePackage(approval)}
                </CardContent>
              </Card>
            );
          })}
          {filtered?.filter((a) => a.status === "pending").length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <CheckCircle className="w-10 h-10 text-emerald-500/50" />
              <p className="text-sm text-muted-foreground">All clear - no pending approvals</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-0 flex flex-col gap-2">
          {filtered?.map((approval) => {
            const allCompleteness = computeEvidenceCompleteness(approval);
            const allCompColor = allCompleteness >= 80 ? "bg-emerald-500" : allCompleteness >= 50 ? "bg-amber-500" : "bg-red-500";
            return (
            <div key={approval.id} className="flex flex-col gap-0 rounded-md bg-muted/30 hover-elevate" data-testid={`approval-all-row-${approval.id}`}>
              <div className="flex items-center justify-between gap-3 p-3 cursor-pointer" onClick={() => setExpandedEvidence(expandedEvidence === approval.id ? null : approval.id)}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium truncate">{approval.objectName || approval.type}</span>
                      <Badge variant="outline" className="text-[9px]">{approval.objectType?.replace(/_/g, " ") || "unknown"}</Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{approval.type === "outcome_certification" ? "Outcome Certification" : approval.type === "outcome_review" ? "Outcome Review" : approval.type === "launch_readiness" ? "Launch Readiness" : approval.type.replace(/_/g, " ")} | Risk: {approval.riskScore}/10</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-1.5" data-testid={`evidence-meter-all-${approval.id}`}>
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${allCompColor}`} style={{ width: `${allCompleteness}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{allCompleteness}%</span>
                  </div>
                  {approval.decidedBy && (
                    <span className="text-[11px] text-muted-foreground">by {approval.decidedBy}</span>
                  )}
                  <StatusBadge status={approval.status} />
                </div>
              </div>
              {expandedEvidence === approval.id && (
                <div className="px-3 pb-3">
                  {renderEvidencePackage(approval)}
                </div>
              )}
            </div>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
