import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, Link, useLocation } from "wouter";
import {
  ArrowLeft,
  Target,
  DollarSign,
  Shield,
  AlertTriangle,
  BarChart3,
  Scale,
  GitBranch,
  CheckCircle,
  XCircle,
  Gauge,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  Lock,
  Layers,
  Zap,
  Activity,
  Bot,
  Sparkles,
  Loader2,
  ChevronRight,
  Workflow,
  ArrowRight,
  Clock,
  FileText,
  Eye,
  ShieldCheck,
  History,
  Filter,
  Database,
  CircleDot,
  Download,
  RefreshCw,
  Pencil,
  ExternalLink,
  Package,
  Brain,
  FileCode,
  Settings,
  Calendar,
  ChevronDown,
  Hash,
  Users,
  Gavel,
  Search,
  Flame,
  Wrench,
  Play,
  Archive,
  FileCheck,
  LayoutGrid,
  Network,
  Receipt,
  Banknote,
  AlertOctagon,
  Lightbulb,
  FlaskConical,
  IterationCw,
  GripVertical,
  Undo2,
  Redo2,
  MessageSquare,
  ChevronUp,
  Copy,
  Rocket,
  Table2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { ProgressRing } from "@/components/outcome-cockpit";
import { useIndustry } from "@/components/industry-provider";
import { usePermission } from "@/components/role-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { OutcomeContract, KpiDefinition, Approval, OutcomeEvent, Agent, Policy, Skill, OntologyConcept } from "@shared/schema";
import { PolicyImpactGraph } from "@/components/policy-impact-graph";

function getIndustryBenchmark(industry: string, kpiName: string, kpiUnit: string): { benchmark: number; unit: string; source: string; comparison: string } | null {
  const nameLower = kpiName.toLowerCase();
  const universalBenchmarks: Array<{ keywords: string[]; data: { benchmark: number; unit: string; source: string } }> = [
    { keywords: ["autonomous resolution", "resolution rate", "resolutions"], data: { benchmark: 85, unit: "percent", source: "Industry avg (Gartner 2024)" } },
    { keywords: ["customer satisfaction", "csat", "satisfaction"], data: { benchmark: 78, unit: "score", source: "Industry avg (ACSI)" } },
    { keywords: ["response time", "avg response", "latency"], data: { benchmark: 120, unit: "seconds", source: "Industry avg (McKinsey)" } },
    { keywords: ["conversion rate", "conversion"], data: { benchmark: 3.5, unit: "percent", source: "Industry avg (Monetate)" } },
    { keywords: ["extraction accuracy", "accuracy"], data: { benchmark: 95, unit: "percent", source: "Industry benchmark" } },
    { keywords: ["leads qualified", "lead qualification"], data: { benchmark: 250, unit: "count", source: "Industry avg (HubSpot)" } },
    { keywords: ["items moderated", "moderation", "content moderation"], data: { benchmark: 10000, unit: "count", source: "Industry avg (Trust & Safety)" } },
    { keywords: ["invoices processed", "invoice processing"], data: { benchmark: 500, unit: "count", source: "Industry avg (Ardent Partners)" } },
    { keywords: ["processing time"], data: { benchmark: 120, unit: "seconds", source: "Industry avg (McKinsey)" } },
    { keywords: ["compliance score"], data: { benchmark: 92, unit: "percent", source: "Regulatory benchmark" } },
    { keywords: ["fraud detection"], data: { benchmark: 78, unit: "percent", source: "Industry avg (Nilson Report)" } },
  ];

  const industryOverrides: Record<string, Array<{ keywords: string[]; data: { benchmark: number; unit: string; source: string } }>> = {
    financial_services: [
      { keywords: ["autonomous resolution", "resolutions"], data: { benchmark: 82, unit: "percent", source: "FinServ avg (Gartner 2024)" } },
      { keywords: ["customer satisfaction", "satisfaction"], data: { benchmark: 76, unit: "score", source: "J.D. Power Banking" } },
      { keywords: ["response time", "avg response"], data: { benchmark: 90, unit: "seconds", source: "FCA benchmark" } },
      { keywords: ["compliance score"], data: { benchmark: 94, unit: "percent", source: "SOX/Basel III standard" } },
    ],
    healthcare: [
      { keywords: ["autonomous resolution", "resolutions"], data: { benchmark: 88, unit: "percent", source: "HEDIS measure" } },
      { keywords: ["customer satisfaction", "patient satisfaction", "satisfaction"], data: { benchmark: 82, unit: "score", source: "CAHPS benchmark" } },
      { keywords: ["response time", "avg response"], data: { benchmark: 180, unit: "seconds", source: "CMS guideline" } },
      { keywords: ["accuracy", "extraction accuracy"], data: { benchmark: 97, unit: "percent", source: "FDA AI/ML guidance" } },
    ],
    insurance: [
      { keywords: ["autonomous resolution", "resolutions"], data: { benchmark: 90, unit: "percent", source: "ACORD benchmark" } },
      { keywords: ["customer satisfaction", "satisfaction"], data: { benchmark: 80, unit: "score", source: "J.D. Power Insurance" } },
      { keywords: ["invoices processed", "claims"], data: { benchmark: 400, unit: "count", source: "Industry avg (Novarica)" } },
    ],
    manufacturing: [
      { keywords: ["accuracy", "extraction accuracy"], data: { benchmark: 99, unit: "percent", source: "ISO 9001 standard" } },
      { keywords: ["customer satisfaction", "satisfaction"], data: { benchmark: 75, unit: "score", source: "IndustryWeek avg" } },
    ],
    retail: [
      { keywords: ["conversion rate", "conversion"], data: { benchmark: 3.2, unit: "percent", source: "Industry avg (Monetate)" } },
      { keywords: ["customer satisfaction", "satisfaction"], data: { benchmark: 80, unit: "score", source: "ACSI Retail" } },
      { keywords: ["items moderated", "moderation"], data: { benchmark: 15000, unit: "count", source: "Trust & Safety avg" } },
    ],
  };

  const overrides = industryOverrides[industry] || [];
  for (const entry of overrides) {
    if (entry.keywords.some(kw => nameLower.includes(kw))) {
      return { ...entry.data, comparison: "" };
    }
  }
  for (const entry of universalBenchmarks) {
    if (entry.keywords.some(kw => nameLower.includes(kw))) {
      return { ...entry.data, comparison: "" };
    }
  }
  return null;
}

function Sparkline({
  points,
  target,
  slaThreshold,
  width = 120,
  height = 32,
  className,
}: {
  points: Array<{ date: string; value: number }>;
  target?: number;
  slaThreshold?: number | null;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!points || points.length < 2) return null;
  const values = points.map((p) => p.value);
  const allVals = [...values];
  if (target != null) allVals.push(target);
  if (slaThreshold != null) allVals.push(slaThreshold);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const pathPoints = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * w;
    const y = pad + h - ((p.value - min) / range) * h;
    return `${x},${y}`;
  });
  const d = `M${pathPoints.join(" L")}`;

  const targetY =
    target != null ? pad + h - ((target - min) / range) * h : null;
  const slaY =
    slaThreshold != null ? pad + h - ((slaThreshold - min) / range) * h : null;

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
    >
      {targetY != null && (
        <line
          x1={pad}
          y1={targetY}
          x2={width - pad}
          y2={targetY}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3,3"
          className="text-muted-foreground/40"
        />
      )}
      {slaY != null && (
        <line
          x1={pad}
          y1={slaY}
          x2={width - pad}
          y2={slaY}
          stroke="#ef4444"
          strokeWidth="1.5"
          strokeDasharray="4,2"
        />
      )}
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-emerald-500"
      />
    </svg>
  );
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth} month${diffMonth === 1 ? "" : "s"} ago`;
}

function KpiGaugeRing({
  value,
  target,
  size = 64,
  strokeWidth = 5,
}: {
  value: number;
  target: number;
  size?: number;
  strokeWidth?: number;
}) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 90 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="inline-flex items-center justify-center" data-testid="kpi-gauge-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted-foreground/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-current text-xs font-semibold"
          style={{ fill: color }}
        >
          {Math.round(pct)}%
        </text>
      </svg>
    </div>
  );
}

function OutcomeProgressStepper({ outcome, hasAgentPlan, hasDeployedAgents }: { outcome: OutcomeContract; hasAgentPlan: boolean; hasDeployedAgents: boolean }) {
  const steps = [
    {
      label: "Define Outcome",
      description: "Contract & KPIs",
      icon: Target,
      complete: true,
    },
    {
      label: "Agent Plan",
      description: "Generate & select agents",
      icon: Bot,
      complete: hasAgentPlan,
      active: outcome.status === "awaiting_agent_plan" && !hasAgentPlan,
    },
    {
      label: "Deploy Agents",
      description: "Create & activate",
      icon: Zap,
      complete: hasDeployedAgents,
      active: hasAgentPlan && !hasDeployedAgents,
    },
  ];

  return (
    <div className="flex items-center gap-2 w-full" data-testid="stepper-outcome-progress">
      {steps.map((step, i) => {
        const StepIcon = step.icon;
        const isActive = step.active && !step.complete;
        const isComplete = step.complete;
        return (
          <div key={i} className="flex items-center gap-2 flex-1 min-w-0">
            {i > 0 && (
              <div className={`h-px flex-shrink-0 w-6 ${isComplete || isActive ? "bg-primary/40" : "bg-border"}`} />
            )}
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 flex-1 min-w-0 border transition-colors ${
              isActive ? "border-primary/30 bg-primary/5" : isComplete ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-muted/30"
            }`} data-testid={`step-${step.label.toLowerCase().replace(/\s/g, "-")}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                isComplete ? "bg-emerald-500/20" : isActive ? "bg-primary/20" : "bg-muted"
              }`}>
                {isComplete ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                ) : (
                  <StepIcon className={`w-3.5 h-3.5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className={`text-xs font-medium truncate ${isActive ? "text-primary" : isComplete ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{step.label}</span>
                <span className="text-[10px] text-muted-foreground truncate">{step.description}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const statusTooltips: Record<string, { label: string; description: string }> = {
  draft: { label: "Draft", description: "This outcome is still being defined. KPIs and targets can be adjusted before activation." },
  active: { label: "Active", description: "This outcome is live and being tracked, but no agents have been assigned to work on it yet." },
  awaiting_agent_plan: { label: "Awaiting Agent Plan", description: "The outcome is active and waiting for an agent development plan to be generated or approved." },
  agents_assigned: { label: "Agents Assigned", description: "One or more agents have been created and linked to this outcome — they are actively executing work toward the KPIs." },
  completed: { label: "Completed", description: "All KPI targets have been met and the outcome contract has been fulfilled." },
  paused: { label: "Paused", description: "Tracking and agent execution are temporarily suspended. No progress is being made." },
  failed: { label: "Failed", description: "The outcome could not be achieved within the defined constraints or SLA thresholds." },
  superseded: { label: "Superseded", description: "This outcome has been replaced by a newer version or a different contract." },
};

const riskTierTooltips: Record<string, { label: string; description: string }> = {
  LOW: { label: "Low Risk", description: "Minimal oversight required. Agents can operate with high autonomy and fewer approval gates." },
  MEDIUM: { label: "Medium Risk", description: "Standard review gates with balanced human-AI collaboration. Suitable for most business workflows." },
  HIGH: { label: "High Risk", description: "Strict governance enforced — more approval gates, tighter policy controls, and reduced agent autonomy." },
  CRITICAL: { label: "Critical Risk", description: "Maximum oversight. Every agent action may require human approval. Used for regulated or high-stakes operations." },
};

export default function OutcomeDetail() {
  const [, params] = useRoute("/outcomes/:id");
  const outcomeId = params?.id;
  const { toast } = useToast();
  const { industry } = useIndustry();
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialTab = searchParams?.get("tab") === "agent-map" ? "agent-map" : "kpi-delivery";
  const initialTemplateId = searchParams?.get("template") || null;
  const [activeTab, setActiveTab] = useState(initialTab);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [reportPeriod, setReportPeriod] = useState("Last 30 days");
  const [createKpiOpen, setCreateKpiOpen] = useState(false);
  const [editContractOpen, setEditContractOpen] = useState(false);
  const [editContractData, setEditContractData] = useState<Record<string, any>>({});
  const [editingKpiId, setEditingKpiId] = useState<string | null>(null);
  const [editKpiData, setEditKpiData] = useState<Record<string, any>>({});
  const [evidenceWindow, setEvidenceWindow] = useState("7d");
  const [impactNetworkOpen, setImpactNetworkOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [processAnalysisOpen, setProcessAnalysisOpen] = useState(false);
  const [, setLocation] = useLocation();

  const deleteOutcomeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/outcomes/${outcomeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      toast({ title: "Outcome deleted" });
      setLocation("/outcomes");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete outcome", description: err.message, variant: "destructive" });
    },
  });

  const { data: outcome, isLoading } = useQuery<OutcomeContract>({
    queryKey: ["/api/outcomes", outcomeId],
    enabled: !!outcomeId,
  });

  const { data: kpis } = useQuery<KpiDefinition[]>({
    queryKey: ["/api/outcomes", outcomeId, "kpis"],
    enabled: !!outcomeId,
  });

  const { data: evidence, dataUpdatedAt: evidenceUpdatedAt } = useQuery<{
    kpiTimeSeries: Array<{
      kpiId: string;
      kpiName: string;
      unit: string;
      target: number;
      baseline: number;
      points: Array<{ date: string; value: number }>;
    }>;
    correlatedMetrics: {
      successRate: number;
      avgLatency: number;
      totalRuns: number;
      failedRuns: number;
      latencyTrend: Array<{ date: string; value: number }>;
      agentCount: number;
      policyChecks24h: number;
    };
    dataQuality: {
      totalEvents: number;
      billableEvents: number;
      missingFieldRate: number;
      schemaConformance: number;
      lastEventAt: string | null;
    };
  }>({
    queryKey: ["/api/outcomes", outcomeId, "evidence"],
    enabled: !!outcomeId,
  });

  const { data: outcomeEvents } = useQuery<OutcomeEvent[]>({
    queryKey: ["/api/outcomes", outcomeId, "events"],
    enabled: !!outcomeId,
  });

  const { data: auditData } = useQuery<{
    auditEvents: Array<{
      id: string;
      objectType: string;
      objectId: string;
      action: string;
      actorId: string;
      details: any;
      timestamp: string;
      createdAt?: string;
    }>;
    approvals: Array<{
      id: string;
      type: string;
      status: string;
      objectName: string;
      decidedBy: string;
      decidedAt: string;
      riskScore: number;
      createdAt?: string;
    }>;
  }>({
    queryKey: ["/api/outcomes", outcomeId, "audit"],
    enabled: !!outcomeId,
  });

  const { data: snapshots } = useQuery<{
    snapshots: Array<{
      date: string;
      kpiValues: Array<{ kpiId: string; kpiName: string; value: number; confidence: number }>;
      topAgents: Array<{ agentId: string; agentName: string; contribution: number }>;
      eventCount: number;
      billableCount: number;
    }>;
  }>({
    queryKey: [`/api/outcomes/${outcomeId}/snapshots?window=${evidenceWindow}`],
    enabled: !!outcomeId,
  });

  const { data: governancePolicies } = useQuery<Policy[]>({
    queryKey: ["/api/policies"],
  });

  const { data: invoices } = useQuery<Array<{id: string; status: string; totalAmount: number; periodStart: string; periodEnd: string; lineItems: any[]}>>({
    queryKey: ["/api/billing/invoices"],
  });

  const { data: allApprovals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });

  const { data: allAgents, dataUpdatedAt: agentsUpdatedAt } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: allSkills } = useQuery<Skill[]>({
    queryKey: ["/api/skills"],
  });

  const { data: allOntologyConcepts } = useQuery<OntologyConcept[]>({
    queryKey: ["/api/ontology-concepts/all"],
  });

  const { data: downstreamImpact } = useQuery<{
    outcomeId: string;
    outcomeName: string;
    outcomeRiskTier: string;
    boundAgentCount: number;
    nonCompliantCount: number;
    agents: Array<{
      agentId: string;
      agentName: string;
      agentRiskTier: string;
      agentStatus: string;
      violations: Array<{ constraint: string; current: string; required: string; severity: string }>;
      needsReview: boolean;
      lastFlagged: string | null;
    }>;
    recentSlaChanges: Array<{
      id: string;
      timestamp: string;
      details: any;
    }>;
  }>({
    queryKey: ["/api/outcomes", outcomeId, "downstream-impact"],
    enabled: !!outcomeId,
  });

  const { data: pageProposalData } = useQuery<any>({
    queryKey: ["/api/agent-proposals", outcomeId],
    queryFn: async () => {
      const res = await fetch(`/api/agent-proposals/${outcomeId}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: !!outcomeId,
  });

  const { data: agentContributions } = useQuery<{
    contributions: Array<{
      agentId: string;
      agentName: string;
      agentType: string;
      status: string;
      valueShare: number;
      deliveredValue: number;
      costToServe: number;
      healthScore: number;
      successRate: number;
      avgLatency: number;
      totalRuns: number;
      failedRuns: number;
      capabilities: Array<{ name: string; contribution: number }>;
      isUnderperforming: boolean;
    }>;
    summary: {
      totalAgents: number;
      totalRevenue: number;
      underperformingCount: number;
      avgHealthScore: number;
    };
  }>({
    queryKey: ["/api/outcomes", outcomeId, "agent-contributions"],
    enabled: !!outcomeId,
  });

  const { data: remediation } = useQuery<{
    risks: Array<{
      id: string;
      severity: string;
      category: string;
      title: string;
      description: string;
      affectedAgents: string[];
      affectedKpis: string[];
      detectedAt: string;
      recommendation: {
        type: string;
        title: string;
        description: string;
        linkedPatchId: string | null;
        linkedExperimentId: string | null;
        estimatedImpact: string;
        effort: string;
      };
    }>;
    activeIncidents: Array<{
      id: string;
      title: string;
      severity: string;
      status: string;
      agentId: string;
      agentName: string;
      detectedAt: string;
      resolvedAt: string | null;
      description: string;
    }>;
    recentPatches: Array<{
      id: string;
      description: string;
      status: string;
      agentId: string;
      agentName: string;
      changeType: string;
      createdAt: string;
      riskScore: number;
    }>;
  }>({
    queryKey: ["/api/outcomes", outcomeId, "remediation"],
    enabled: !!outcomeId,
  });

  const { data: killChainAlerts } = useQuery<{
    alerts: Array<{
      alertId: string;
      severity: string;
      agentId: string;
      agentName: string;
      driftMetric: string;
      driftPercent: number;
      driftSeverity: string;
      suiteName: string;
      threatenedKpis: Array<{
        kpiName: string;
        currentValue: number;
        slaThreshold: number;
        headroom: number;
        unit: string;
      }>;
      recommendedAction: string;
      detectedAt: string;
      healingPipelineId?: string;
    }>;
    summary: { critical: number; warning: number; watch: number; total: number };
  }>({
    queryKey: ["/api/outcomes", outcomeId, "kill-chain-alerts"],
    enabled: !!outcomeId,
    refetchInterval: 60000,
  });

  const { data: financialLedger } = useQuery<{
    pipeline: Array<{
      stage: string;
      label: string;
      count: number;
      amount: number;
    }>;
    invoices: Array<{
      id: string;
      status: string;
      totalAmount: number;
      periodStart: string;
      periodEnd: string;
      lineItemCount: number;
    }>;
    recentEvents: Array<{
      id: string;
      type: string;
      amount: number;
      agentId: string;
      agentName: string;
      createdAt: string;
      billable: boolean;
    }>;
    summary: {
      totalCaptured: number;
      totalMetered: number;
      totalInvoiced: number;
      totalCollected: number;
      totalDisputed: number;
      collectionRate: number;
    };
  }>({
    queryKey: ["/api/outcomes", outcomeId, "financial-ledger"],
    enabled: !!outcomeId,
  });

  const updateContractMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/outcomes/${outcomeId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcomeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      setEditContractOpen(false);
      toast({ title: "Contract updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update contract", description: err.message, variant: "destructive" });
    },
  });

  const [recomputing, setRecomputing] = useState(false);
  const recomputeKpis = async () => {
    if (!outcomeId) return;
    setRecomputing(true);
    try {
      const res = await apiRequest("POST", `/api/outcomes/${outcomeId}/recompute`);
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcomeId, "kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcomeId, "evidence"] });
      queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] as string)?.includes?.(`/api/outcomes/${outcomeId}/snapshots`) });
      if (data.message) {
        toast({ title: "No data to recompute", description: data.message });
      } else if (data.updated > 0) {
        const changeSummary = data.changes?.slice(0, 3).map((c: any) => `${c.name}: ${c.oldValue} → ${c.newValue}`).join(", ");
        toast({ title: `${data.updated} KPI${data.updated > 1 ? "s" : ""} updated`, description: `From ${data.totalRuns} runs, ${data.totalEvents} events. ${changeSummary || ""}` });
      } else {
        toast({ title: "KPIs are current", description: `Verified against ${data.totalRuns} runs — no changes needed.` });
      }
    } catch (err) {
      toast({ title: "Recompute failed", description: "Could not recalculate KPIs. Please try again.", variant: "destructive" });
    } finally {
      setRecomputing(false);
    }
  };

  const [regeneratingGraph, setRegeneratingGraph] = useState(false);
  const regenerateConstraintGraph = async () => {
    if (!outcomeId) return;
    setRegeneratingGraph(true);
    try {
      await apiRequest("PATCH", `/api/outcomes/${outcomeId}`, {});
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcomeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      toast({ title: "Constraint graph updated", description: "Regenerated from current KPIs and outcome configuration." });
    } catch {
      toast({ title: "Regeneration failed", variant: "destructive" });
    } finally {
      setRegeneratingGraph(false);
    }
  };

  const exportAuditBundle = async () => {
    try {
      const res = await apiRequest("POST", `/api/exports/outcome/${outcomeId}/audit`);
      const bundle = await res.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-bundle-${outcomeId?.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Audit bundle exported", description: `${bundle.totalAuditEvents} events, ${bundle.totalApprovals} approvals included.` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const createKpiMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/kpis", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcomeId, "kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      setCreateKpiOpen(false);
      toast({ title: "KPI created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create KPI", description: err.message, variant: "destructive" });
    },
  });

  const deleteKpiMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/kpis/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcomeId, "kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      toast({ title: "KPI deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete KPI", description: err.message, variant: "destructive" });
    },
  });

  const updateKpiMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/kpis/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcomeId, "kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      setEditingKpiId(null);
      toast({ title: "KPI updated successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update KPI", description: err.message, variant: "destructive" });
    },
  });

  const startEditKpi = (kpi: KpiDefinition) => {
    setEditingKpiId(kpi.id);
    setEditKpiData({
      baseline: kpi.baseline ?? 0,
      target: kpi.target,
      weight: kpi.weight ?? 1,
      slaThreshold: kpi.slaThreshold ?? "",
      breachLevel: kpi.breachLevel ?? "warning",
      targetOperator: kpi.targetOperator ?? ">=",
    });
  };

  const saveEditKpi = (id: string) => {
    updateKpiMutation.mutate({
      id,
      data: {
        baseline: parseFloat(editKpiData.baseline) || 0,
        target: parseFloat(editKpiData.target) || 0,
        weight: parseFloat(editKpiData.weight) || 1,
        slaThreshold: editKpiData.slaThreshold !== "" ? parseFloat(editKpiData.slaThreshold) : null,
        breachLevel: editKpiData.breachLevel,
        targetOperator: editKpiData.targetOperator,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!outcome) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <Target className="w-12 h-12 text-muted-foreground/50" />
        <p className="text-muted-foreground">Outcome contract not found</p>
        <Link href="/outcomes">
          <Button variant="outline" data-testid="button-back-outcomes">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Outcomes
          </Button>
        </Link>
      </div>
    );
  }

  const hasAgentPlan = !!pageProposalData?.orchestrator || (pageProposalData?.workers?.length > 0);
  const boundAgents = allAgents?.filter(a => a.outcomeId === outcomeId) || [];
  const hasDeployedAgents = boundAgents.length > 0;

  const sla = (outcome.slaConfig || {}) as Record<string, any>;
  const attribution = (outcome.attributionRules || {}) as Record<string, any>;
  const gates = (outcome.approvalGates || []) as Array<Record<string, any>>;
  const tiers = (outcome.pricingTiers || []) as Array<Record<string, any>>;
  const kpiProgress = (k: { currentValue?: number | null; target?: number | null; targetOperator?: string | null; name?: string | null }): number => {
    const current = k.currentValue ?? 0;
    const target = k.target;
    if (target == null) return 0;
    const op = k.targetOperator || ">=";
    const isInverse = op === "<=" || op === "<" || /time|latency|incident|error|fail/i.test(k.name || "");
    if (target === 0) return current === 0 ? 100 : Math.max(0, 100 - current * 10);
    if (isInverse) return Math.min(100, Math.max(0, (target / Math.max(current, 0.001)) * 100));
    return Math.min(100, Math.max(0, (current / target) * 100));
  };
  const avgProgress = kpis?.length
    ? kpis.reduce((sum, k) => sum + kpiProgress(k), 0) / kpis.length
    : 0;
  const weightedProgress = kpis?.length
    ? kpis.reduce((sum, k) => sum + kpiProgress(k) * (k.weight || 1), 0) /
      kpis.reduce((sum, k) => sum + (k.weight || 1), 0)
    : 0;

  const breachCount = kpis?.filter(k => {
    if (!k.slaThreshold || !k.currentValue) return false;
    if (k.name.includes("Time") || k.name.includes("Latency")) return k.currentValue > k.slaThreshold;
    return k.currentValue < k.slaThreshold;
  }).length || 0;

  const trendIcon = (trend: string | null) => {
    if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
    if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
    return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  const boundAgentIds = new Set((allAgents?.filter(a => a.outcomeId === outcomeId) || []).map(a => a.id));
  const outcomeApprovals = allApprovals?.filter(a =>
    a.objectId === outcomeId || (a.agentId && boundAgentIds.has(a.agentId))
  ) || [];
  const pendingApprovals = outcomeApprovals.filter(a => a.status === "pending");

  const totalEventsCount = outcomeEvents?.length || 0;
  const billableEventsCount = outcomeEvents?.filter(e => e.billable).length || 0;
  const estimatedRevenue = billableEventsCount * (outcome.pricePerUnit || 0);

  const hasReportData = boundAgents.length > 0 || totalEventsCount > 0 || (evidence?.correlatedMetrics?.totalRuns || 0) > 0;

  async function generateCustomerReport() {
    if (!outcome) return;
    setReportGenerating(true);
    try {
      const metrics = evidence?.correlatedMetrics;
      const dq = evidence?.dataQuality;
      const executionStats = metrics ? {
        totalRuns: metrics.totalRuns || 0,
        successfulRuns: (metrics.totalRuns || 0) - (metrics.failedRuns || 0),
        failedRuns: metrics.failedRuns || 0,
        avgLatencyMs: Math.round(metrics.avgLatency || 0),
        totalEvents: dq?.totalEvents || totalEventsCount,
        billableEvents: dq?.billableEvents || billableEventsCount,
        totalCost: boundAgents.reduce((sum, a) => sum + (a.costPerRun || 0) * (a.totalRuns || 0), 0),
      } : undefined;

      const res = await apiRequest("POST", "/api/ai/customer-value-report", {
        outcomeName: outcome.name,
        outcomeDescription: outcome.description,
        industryLabel: industry?.label || "General",
        reportDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        reportPeriod,
        kpis: (kpis || []).map(k => ({
          name: k.name,
          unit: k.unit,
          currentValue: k.currentValue,
          target: k.target,
          baseline: k.baseline,
          trend: k.trend,
          confidence: k.confidence,
          benchmark: getIndustryBenchmark(industry?.id || "", k.name, k.unit),
        })),
        agents: boundAgents.map(a => ({
          name: a.name,
          type: a.agentType,
          successRate: a.successRate,
          healthScore: a.healthScore,
          totalRuns: a.totalRuns || 0,
        })),
        executionStats,
        revenue: {
          pricePerUnit: outcome.pricePerUnit,
          billingModel: (outcome as any).billingModel || outcome.pricingModel,
          estimatedRevenue,
        },
        regulatoryFrameworks: industry?.regulatoryFrameworks || [],
      });
      const data = await res.json();
      setReportContent(data.report || "Report generation failed. Please try again.");
    } catch (err) {
      toast({ title: "Failed to generate report", description: "Please try again.", variant: "destructive" });
    } finally {
      setReportGenerating(false);
    }
  }

  function downloadReport() {
    if (!reportContent || !outcome) return;
    const header = `${outcome.name} — Customer Value Report\nGenerated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}\nPeriod: ${reportPeriod}\nIndustry: ${industry?.label || "General"}\n${"=".repeat(60)}\n\n`;
    const blob = new Blob([header + reportContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${outcome.name.replace(/\s+/g, "-")}-value-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Report downloaded" });
  }

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-outcome-detail">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Link href="/outcomes">
            <Button variant="ghost" size="icon" data-testid="button-back-outcomes">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            <h1 className="text-xl font-semibold tracking-tight" data-testid="text-outcome-name">{outcome.name}</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <span data-testid="badge-status"><StatusBadge status={outcome.status} /></span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <p className="font-semibold mb-1">Status: {statusTooltips[outcome.status]?.label || outcome.status}</p>
                <p>{statusTooltips[outcome.status]?.description || "Current lifecycle stage of this outcome contract."}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span data-testid="badge-risk-tier"><StatusBadge status={outcome.riskTier} /></span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <p className="font-semibold mb-1">Risk: {riskTierTooltips[outcome.riskTier]?.label || outcome.riskTier}</p>
                <p>{riskTierTooltips[outcome.riskTier]?.description || "Determines the level of oversight and governance applied."}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span data-testid="badge-version"><Badge variant="outline" className="text-[10px]">v{outcome.version}</Badge></span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                <p className="font-semibold mb-1">Version {outcome.version}</p>
                <p>Contract version increments each time the outcome is edited (KPIs, SLA, pricing, risk tier, etc.), creating an immutable audit trail for regulatory compliance.</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setReportOpen(true)} data-testid="button-open-customer-report">
              <FileText className="w-3.5 h-3.5 mr-1.5" /> Customer Report
            </Button>
          <Dialog open={editContractOpen} onOpenChange={(open) => {
            setEditContractOpen(open);
            if (open) {
              setEditContractData({
                name: outcome.name || "",
                description: outcome.description || "",
                riskTier: outcome.riskTier || "MEDIUM",
                status: outcome.status || "active",
                pricingModel: outcome.pricingModel || "PER_OUTCOME_EVENT",
                pricePerUnit: outcome.pricePerUnit ?? 0,
                currency: outcome.currency || "USD",
                volumeCap: outcome.volumeCap ?? "",
                riskThreshold: outcome.riskThreshold ?? 0.8,
                maxDriftPercent: outcome.maxDriftPercent ?? 10,
              });
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-edit-contract">
                <Pencil className="w-4 h-4 mr-1.5" /> Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit Outcome Contract</DialogTitle>
              </DialogHeader>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateContractMutation.mutate({
                    name: editContractData.name,
                    description: editContractData.description,
                    riskTier: editContractData.riskTier,
                    status: editContractData.status,
                    pricingModel: editContractData.pricingModel,
                    pricePerUnit: parseFloat(editContractData.pricePerUnit) || 0,
                    currency: editContractData.currency,
                    volumeCap: editContractData.volumeCap ? parseInt(editContractData.volumeCap) : null,
                    riskThreshold: parseFloat(editContractData.riskThreshold) || 0.8,
                    maxDriftPercent: parseFloat(editContractData.maxDriftPercent) || 10,
                  });
                }}
              >
                <div className="flex flex-col gap-2">
                  <Label>Name</Label>
                  <Input value={editContractData.name || ""} onChange={(e) => setEditContractData({ ...editContractData, name: e.target.value })} data-testid="input-edit-name" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Description</Label>
                  <Textarea value={editContractData.description || ""} onChange={(e) => setEditContractData({ ...editContractData, description: e.target.value })} className="resize-none" data-testid="input-edit-description" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label>Risk Tier</Label>
                    <select value={editContractData.riskTier || "MEDIUM"} onChange={(e) => setEditContractData({ ...editContractData, riskTier: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" data-testid="select-edit-risk-tier">
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Status</Label>
                    <select value={editContractData.status || "active"} onChange={(e) => setEditContractData({ ...editContractData, status: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" data-testid="select-edit-status">
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="paused">Paused</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label>Price / Unit</Label>
                    <Input type="number" step="0.01" value={editContractData.pricePerUnit ?? 0} onChange={(e) => setEditContractData({ ...editContractData, pricePerUnit: e.target.value })} data-testid="input-edit-price" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Currency</Label>
                    <Input value={editContractData.currency || "USD"} onChange={(e) => setEditContractData({ ...editContractData, currency: e.target.value })} data-testid="input-edit-currency" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Volume Cap</Label>
                    <Input type="number" value={editContractData.volumeCap ?? ""} onChange={(e) => setEditContractData({ ...editContractData, volumeCap: e.target.value })} placeholder="No cap" data-testid="input-edit-volume-cap" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label>Risk Threshold</Label>
                    <Input type="number" step="0.01" min="0" max="1" value={editContractData.riskThreshold ?? 0.8} onChange={(e) => setEditContractData({ ...editContractData, riskThreshold: e.target.value })} data-testid="input-edit-risk-threshold" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Max Drift %</Label>
                    <Input type="number" step="0.1" value={editContractData.maxDriftPercent ?? 10} onChange={(e) => setEditContractData({ ...editContractData, maxDriftPercent: e.target.value })} data-testid="input-edit-max-drift" />
                  </div>
                </div>
                <Button type="submit" disabled={updateContractMutation.isPending} data-testid="button-submit-edit-contract">
                  {updateContractMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={recomputeKpis} disabled={recomputing} data-testid="button-recompute-now">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${recomputing ? "animate-spin" : ""}`} />
            {recomputing ? "Recomputing..." : "Recompute"}
          </Button>
          <Button variant="outline" onClick={exportAuditBundle} data-testid="button-export-audit-bundle">
            <Download className="w-4 h-4 mr-1.5" /> Export Audit
          </Button>
          <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-200 dark:border-red-800" data-testid="button-delete-outcome">
                <Trash2 className="w-4 h-4 mr-1.5" /> Delete
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm" data-testid="dialog-delete-outcome-detail">
              <DialogHeader>
                <DialogTitle className="text-base">Delete Outcome Contract</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete <span className="font-medium text-foreground">{outcome.name}</span>? This will also remove all associated KPIs, events, and invoices. Linked agents will be unlinked but not deleted.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDeleteConfirmOpen(false)} data-testid="button-cancel-delete-detail">
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteOutcomeMutation.isPending}
                    onClick={() => deleteOutcomeMutation.mutate()}
                    data-testid="button-confirm-delete-detail"
                  >
                    {deleteOutcomeMutation.isPending ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {outcome.description && (
          <p className="text-sm text-muted-foreground ml-11">{outcome.description}</p>
        )}
        {sla.slaDescription && (
          <p className="text-xs text-muted-foreground ml-11 flex items-center gap-1.5 mt-0.5" data-testid="text-sla-description">
            <FileCheck className="w-3.5 h-3.5 shrink-0 text-primary/60" />
            <span><span className="font-medium text-foreground/70">SLA: </span>{sla.slaDescription}</span>
          </p>
        )}
        {(() => {
          const roi = outcome.roiEstimate as { annualizedSavingsMin: number; annualizedSavingsMax: number; paybackPeriodMonths: number | null; assumptionsSummary: string } | null | undefined;
          if (!roi || roi.annualizedSavingsMin == null || roi.annualizedSavingsMax == null) return null;
          const fmtK = (n: number) => n >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`;
          return (
            <div className="ml-11 mt-1 flex items-center gap-3 flex-wrap" data-testid="roi-estimate-summary">
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <TrendingUp className="w-3.5 h-3.5" />
                <span data-testid="text-roi-detail-range">{fmtK(roi.annualizedSavingsMin)} – {fmtK(roi.annualizedSavingsMax)} / yr estimated</span>
              </span>
              {roi.paybackPeriodMonths != null && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="text-roi-detail-payback">
                  <Clock className="w-3 h-3" />{roi.paybackPeriodMonths}mo payback
                </span>
              )}
            </div>
          );
        })()}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Weighted Progress"
          value={`${Math.round(weightedProgress)}%`}
          icon={Target}
          subtitle={weightedProgress === 0 ? "Add KPI targets to track" : undefined}
          variant={weightedProgress >= 80 ? "success" : weightedProgress >= 50 ? "warning" : "danger"}
          testId="stat-weighted-progress"
          tooltip="Aggregate progress across all KPIs, weighted by importance. Set KPI targets to see progress."
        />
        <StatCard
          title="KPIs Tracked"
          value={kpis?.length || 0}
          icon={BarChart3}
          subtitle={!kpis?.length ? "Define KPIs below" : (() => {
            const driftThreatenedCount = killChainAlerts?.alerts ? new Set(killChainAlerts.alerts.flatMap(a => a.threatenedKpis.map(t => t.kpiName))).size : 0;
            const parts: string[] = [];
            if (breachCount > 0) parts.push(`${breachCount} breaching SLA`);
            if (driftThreatenedCount > 0) parts.push(`${driftThreatenedCount} threatened by drift`);
            return parts.length > 0 ? parts.join(", ") : "All within SLA";
          })()}
          variant={breachCount > 0 ? "danger" : (killChainAlerts?.summary?.critical || 0) > 0 ? "danger" : (killChainAlerts?.summary?.warning || 0) > 0 ? "warning" : "default"}
          testId="stat-kpis-count"
          tooltip="Number of Key Performance Indicators being monitored for this outcome."
        />
        <StatCard
          title="Bound Agents"
          value={boundAgents.length}
          icon={Bot}
          subtitle={boundAgents.length === 0 ? "Assign agents via Create Agent" : (() => {
            const driftingCount = killChainAlerts?.alerts ? new Set(killChainAlerts.alerts.map(a => a.agentId)).size : 0;
            if (driftingCount > 0) return `${driftingCount} drifting`;
            if (agentContributions?.summary?.underperformingCount) return `${agentContributions.summary.underperformingCount} underperforming`;
            return "All healthy";
          })()}
          variant={boundAgents.length === 0 ? "default" : (killChainAlerts?.summary?.critical || 0) > 0 ? "danger" : (killChainAlerts?.summary?.warning || 0) > 0 ? "warning" : agentContributions?.summary?.underperformingCount ? "warning" : "success"}
          testId="stat-bound-agents"
          tooltip="Agents assigned to deliver this outcome. Use the Agent Development Plan to create a team."
        />
        <StatCard
          title="Estimated Revenue"
          value={`${outcome.currency || "USD"} ${estimatedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={DollarSign}
          subtitle={billableEventsCount === 0 ? "Tracked from agent events" : `${billableEventsCount} billable events`}
          variant="default"
          testId="stat-estimated-revenue"
          tooltip="Revenue estimate based on billable agent events and the outcome's pricing model."
        />
        <StatCard
          title="Risk Threshold"
          value={`${((outcome.riskThreshold || 0) * 100).toFixed(0)}%`}
          icon={Shield}
          subtitle={outcome.autoPauseTrigger ? "Auto-pause ON" : "Auto-pause OFF"}
          variant={outcome.autoPauseTrigger ? "warning" : "default"}
          testId="stat-risk-threshold"
          tooltip="Maximum acceptable risk level. Agents auto-pause if risk exceeds this threshold."
        />
      </div>

      {killChainAlerts && killChainAlerts.alerts.length > 0 && killChainAlerts.alerts.some(a => a.severity === "critical" || a.severity === "warning") && (
        <Card
          className={`border ${killChainAlerts.summary.critical > 0 ? "border-destructive/50 bg-destructive/5" : "border-amber-500/50 bg-amber-500/5"}`}
          data-testid="banner-kill-chain-alerts"
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${killChainAlerts.summary.critical > 0 ? "bg-destructive/10" : "bg-amber-500/10"}`}>
                  <Zap className={`w-4 h-4 ${killChainAlerts.summary.critical > 0 ? "text-destructive" : "text-amber-500"}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold flex items-center gap-2" data-testid="text-kill-chain-title">
                    Kill-Chain Alerts
                    {killChainAlerts.summary.critical > 0 && (
                      <Badge variant="destructive" className="text-[9px]" data-testid="badge-critical-count">{killChainAlerts.summary.critical} critical</Badge>
                    )}
                    {killChainAlerts.summary.warning > 0 && (
                      <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-600" data-testid="badge-warning-count">{killChainAlerts.summary.warning} warning</Badge>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Agent drift detected that threatens outcome SLA — immediate attention recommended</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("risk-remediation")}
                data-testid="button-investigate-alerts"
              >
                <Search className="w-3 h-3 mr-1" /> Investigate
              </Button>
            </div>

            <div className="space-y-2">
              {killChainAlerts.alerts
                .filter(a => a.severity === "critical" || a.severity === "warning")
                .map((alert) => (
                <div
                  key={alert.alertId}
                  className={`flex items-start gap-3 p-2.5 rounded-md border ${alert.severity === "critical" ? "border-destructive/30 bg-destructive/5" : "border-amber-500/20 bg-amber-500/5"}`}
                  data-testid={`alert-row-${alert.alertId}`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${alert.severity === "critical" ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-600"}`}>
                    <AlertTriangle className="w-3 h-3" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/agents/${alert.agentId}`} data-testid={`link-agent-${alert.agentId}`}>
                        <span className="text-xs font-medium text-primary hover:underline cursor-pointer">
                          {alert.agentName}
                        </span>
                      </Link>
                      <Badge variant="outline" className="text-[9px]">
                        {alert.driftMetric === "pass_rate" ? "Pass Rate" : alert.driftMetric === "avg_latency" ? "Latency" : "Hallucination"} ↓{alert.driftPercent}%
                      </Badge>
                      <Badge variant={alert.severity === "critical" ? "destructive" : "outline"} className="text-[9px]">
                        {alert.severity}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {alert.threatenedKpis.map((tk) => (
                        <span key={tk.kpiName} className="text-[10px] text-muted-foreground">
                          <span className="font-medium text-foreground">{tk.kpiName}</span>: {tk.currentValue}{tk.unit === "percent" || tk.unit === "%" ? "%" : ` ${tk.unit}`} → SLA {tk.slaThreshold}{tk.unit === "percent" || tk.unit === "%" ? "%" : ` ${tk.unit}`}
                          <span className={`ml-0.5 font-medium ${tk.headroom <= 0 ? "text-destructive" : tk.headroom < 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                            ({tk.headroom <= 0 ? "BREACHED" : `${tk.headroom.toFixed(1)} headroom`})
                          </span>
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">{alert.recommendedAction}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {alert.healingPipelineId && (
                      <Link href="/healing-operations" data-testid={`link-healing-${alert.alertId}`}>
                        <Button variant="outline" size="sm" className="w-full" data-testid={`button-healing-${alert.alertId}`}>
                          <Wrench className="w-3 h-3 mr-1" /> Healing Pipeline
                        </Button>
                      </Link>
                    )}
                    <Link href={`/agents/${alert.agentId}`} data-testid={`link-view-agent-${alert.agentId}`}>
                      <Button variant="ghost" size="sm" className="shrink-0" data-testid={`button-view-agent-${alert.agentId}`}>
                        View Agent <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {downstreamImpact && downstreamImpact.nonCompliantCount > 0 && (
        <Card
          className="border border-amber-500/50 bg-amber-500/5"
          data-testid="banner-downstream-impact"
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-amber-500/10">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold flex items-center gap-2" data-testid="text-downstream-impact-title">
                    Downstream Impact
                    <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-600" data-testid="badge-noncompliant-count">
                      {downstreamImpact.nonCompliantCount} agent{downstreamImpact.nonCompliantCount !== 1 ? "s" : ""} need review
                    </Badge>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    SLA changes affect bound agents — {downstreamImpact.nonCompliantCount} of {downstreamImpact.boundAgentCount} agent{downstreamImpact.boundAgentCount !== 1 ? "s" : ""} no longer meet updated constraints
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 ml-10">
              {downstreamImpact.agents.filter(a => a.needsReview).map((agent) => (
                <div
                  key={agent.agentId}
                  className="flex items-start gap-3 p-2.5 rounded-md border border-amber-500/20 bg-amber-500/5"
                  data-testid={`downstream-agent-${agent.agentId}`}
                >
                  <Bot className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/agents/${agent.agentId}`} data-testid={`link-downstream-agent-${agent.agentId}`}>
                        <span className="text-xs font-medium text-primary hover:underline cursor-pointer">{agent.agentName}</span>
                      </Link>
                      <Badge variant="outline" className="text-[9px]">{agent.agentRiskTier}</Badge>
                      <Badge variant="outline" className="text-[9px]">{agent.agentStatus}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {agent.violations.map((v, i) => (
                        <div key={i} className="flex items-center gap-1 text-[10px]">
                          <Badge
                            variant={v.severity === "critical" ? "destructive" : "outline"}
                            className="text-[9px]"
                            data-testid={`badge-downstream-violation-${agent.agentId}-${i}`}
                          >
                            {v.severity}
                          </Badge>
                          <span className="font-medium">{v.constraint}:</span>
                          <span className="text-muted-foreground">{v.current}</span>
                          <ArrowRight className="w-2.5 h-2.5 text-muted-foreground" />
                          <span>{v.required}</span>
                        </div>
                      ))}
                    </div>
                    {agent.lastFlagged && (
                      <p className="text-[10px] text-muted-foreground">Flagged {relativeTime(agent.lastFlagged)}</p>
                    )}
                  </div>
                  <Link href={`/agents/${agent.agentId}`}>
                    <Button variant="outline" size="sm" data-testid={`button-review-agent-${agent.agentId}`}>
                      Review <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
            {downstreamImpact.recentSlaChanges.length > 0 && (
              <div className="ml-10 mt-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Recent SLA Changes</p>
                <div className="flex flex-col gap-1">
                  {downstreamImpact.recentSlaChanges.slice(0, 3).map((change) => (
                    <div key={change.id} className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <History className="w-3 h-3 shrink-0" />
                      <span>{relativeTime(change.timestamp)}</span>
                      {change.details?.changedFields && (
                        <span>— {(change.details.changedFields as string[]).join(", ")}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <OutcomeProgressStepper outcome={outcome} hasAgentPlan={hasAgentPlan} hasDeployedAgents={hasDeployedAgents} />

      <Dialog open={impactNetworkOpen} onOpenChange={setImpactNetworkOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col" data-testid="dialog-impact-network">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Network className="w-5 h-5 text-violet-500" />
              Policy Impact Network
              <Badge variant="outline" className="text-[10px] ml-2">
                {(governancePolicies || []).filter(p => p.status === "active").length} policies
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Showing how governance policies connect to skills, ontology terms, and agents bound to this outcome. Click any node to highlight its blast radius.
          </p>
          <div className="flex-1 min-h-0 overflow-hidden">
            <PolicyImpactGraph
              policies={(governancePolicies || []).filter(p => p.status === "active").map(p => ({
                id: p.id,
                name: p.name,
                domain: p.domain,
                status: p.status,
                description: p.description || undefined,
                policyJson: p.policyJson as Record<string, unknown> | null,
                ontologyRefs: (p as any).ontologyRefs || [],
              }))}
              skills={(allSkills || []).map(s => ({
                id: s.id,
                name: s.name,
                industry: s.industry,
                domain: s.domain,
                description: s.description,
                tags: s.tags || [],
                industryContextId: s.industryContextId || undefined,
              }))}
              agents={boundAgents.map(a => ({
                id: a.id,
                name: a.name,
                agentType: a.agentType || undefined,
                outcomeId: a.outcomeId || undefined,
                policyBindings: a.policyBindings,
                complianceTags: a.complianceTags || [],
                ontologyTags: a.ontologyTags,
              }))}
              ontologyConcepts={(allOntologyConcepts || []).map(o => ({
                id: o.id,
                label: o.label,
                category: o.category,
                industryId: o.industryId,
              }))}
              fillContainer
            />
          </div>
        </DialogContent>
      </Dialog>

      {outcome.status === "awaiting_agent_plan" && !hasAgentPlan && (
        <Card className="border-blue-500/30 bg-blue-500/5" data-testid="banner-awaiting-agent-plan">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-blue-500" />
            </div>
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <p className="text-sm font-medium" data-testid="text-awaiting-plan-title">Next step: Create agents for this outcome</p>
              <p className="text-xs text-muted-foreground">
                Use AI to generate a full multi-agent plan, or manually create a single agent with outcome constraints pre-loaded.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => setActiveTab("agent-map")}
                data-testid="button-go-to-agent-proposals"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Use AI Plan
              </Button>
              <Link href={`/agents/wizard?outcomeId=${outcomeId}&outcomeName=${encodeURIComponent(outcome.name)}&riskTier=${encodeURIComponent(outcome.riskTier)}${(outcome as any).industryId ? `&industryId=${encodeURIComponent((outcome as any).industryId)}` : ""}&fromOutcome=true&description=${encodeURIComponent(`Agent created for outcome: ${outcome.name}. ${outcome.description || ""}`.trim())}`}>
                <Button size="sm" variant="outline" data-testid="button-create-agent-for-outcome">
                  <Bot className="w-3.5 h-3.5 mr-1.5" /> Create Manually
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform Intelligence Strip — always visible */}
      {(() => {
        const avgHealth = boundAgents.length > 0
          ? Math.round(boundAgents.reduce((s, a) => s + (a.healthScore || 0), 0) / boundAgents.length)
          : null;
        const maxDrift = outcome.maxDriftPercent ?? 10;
        const driftingKpis = (kpis || []).filter(k => {
          if (!k.target || k.currentValue === null || k.currentValue === undefined) return false;
          const pct = Math.abs((k.currentValue - k.target) / Math.max(Math.abs(k.target), 1)) * 100;
          return pct > maxDrift;
        });
        const policyChecks24h = evidence?.correlatedMetrics?.policyChecks24h ?? null;
        const boundAgentPolicyIds = new Set(boundAgents.flatMap(a => {
          const pb = a.policyBindings as { policies?: Array<{ id?: string; policyId?: string }> } | null;
          return (pb?.policies || []).map((p: { id?: string; policyId?: string }) => p.id ?? p.policyId).filter(Boolean);
        }));
        const allActive = (governancePolicies || []).filter(p => p.status === "active");
        const activePoliciesCount = boundAgentPolicyIds.size > 0
          ? allActive.filter(p => boundAgentPolicyIds.has(p.id)).length
          : allActive.length;
        const pendingCount = pendingApprovals.length;
        const healthBg = avgHealth === null ? "bg-muted/30" : avgHealth >= 80 ? "bg-emerald-500/5" : avgHealth >= 60 ? "bg-amber-500/5" : "bg-red-500/5";

        const latestUpdate = Math.max(agentsUpdatedAt || 0, evidenceUpdatedAt || 0);
        const refreshedAt = latestUpdate > 0 ? new Date(latestUpdate) : new Date();
        const minsAgo = Math.floor((Date.now() - refreshedAt.getTime()) / 60000);
        return (
          <div className="flex flex-col gap-1.5" data-testid="platform-intelligence-strip">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Tile 1: Agent Health Pulse — ProgressRing visualization */}
            <button
              type="button"
              onClick={() => setActiveTab("agent-map")}
              className={`flex items-center gap-3 p-3 rounded-lg border ${healthBg} hover:opacity-80 transition-opacity text-left`}
              data-testid="strip-agent-health"
            >
              {avgHealth !== null ? (
                <ProgressRing value={avgHealth} size={40} strokeWidth={3} />
              ) : (
                <div className="flex flex-col items-center justify-center w-10 h-10 rounded-full bg-background border shrink-0">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Agent Health</span>
                {avgHealth !== null ? (
                  <span className="text-xs text-muted-foreground">avg across {boundAgents.length} agent{boundAgents.length !== 1 ? "s" : ""}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">No agents assigned</span>
                )}
              </div>
            </button>

            {/* Tile 2: Drift Status — KPIs outside maxDriftPercent */}
            <button
              type="button"
              onClick={() => setActiveTab("kpi-delivery")}
              className={`flex items-center gap-3 p-3 rounded-lg border ${driftingKpis.length > 0 ? "bg-amber-500/5" : "bg-muted/30"} hover:opacity-80 transition-opacity text-left`}
              data-testid="strip-drift-status"
            >
              <div className="flex flex-col items-center justify-center w-10 h-10 rounded-full bg-background border shrink-0">
                <TrendingDown className={`w-4 h-4 ${driftingKpis.length > 0 ? "text-amber-500 dark:text-amber-400" : "text-muted-foreground"}`} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Drift Status</span>
                <span className={`text-lg font-bold tabular-nums leading-tight ${driftingKpis.length > 0 ? "text-amber-500 dark:text-amber-400" : "text-emerald-500 dark:text-emerald-400"}`}>
                  {driftingKpis.length}
                  <span className="text-xs font-normal ml-0.5">KPI{driftingKpis.length !== 1 ? "s" : ""}</span>
                </span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {driftingKpis.length === 0 ? "All within threshold" : `outside ${maxDrift}% threshold`}
                </span>
              </div>
            </button>

            {/* Tile 3: Policy Activity — checks fired in last 24h (from traces) + active policy count */}
            <button
              type="button"
              onClick={() => setActiveTab("governance")}
              className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 hover:opacity-80 transition-opacity text-left"
              data-testid="strip-policy-activity"
            >
              <div className="flex flex-col items-center justify-center w-10 h-10 rounded-full bg-background border shrink-0">
                <ShieldCheck className={`w-4 h-4 ${activePoliciesCount > 0 ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Policy Activity</span>
                {policyChecks24h !== null ? (
                  <>
                    <span className="text-lg font-bold tabular-nums leading-tight text-primary">{policyChecks24h}</span>
                    <span className="text-[10px] text-muted-foreground truncate">checks last 24h · {activePoliciesCount} active</span>
                  </>
                ) : (
                  <>
                    <span className="text-lg font-bold tabular-nums leading-tight text-primary">{activePoliciesCount}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{activePoliciesCount === 0 ? "No policies bound" : "auto-enforced"}</span>
                  </>
                )}
              </div>
            </button>

            {/* Tile 4: Approval Queue — pending approvals for outcome + bound agents */}
            <button
              type="button"
              onClick={() => setActiveTab("governance")}
              className={`flex items-center gap-3 p-3 rounded-lg border ${pendingCount > 0 ? "bg-amber-500/5" : "bg-muted/30"} hover:opacity-80 transition-opacity text-left`}
              data-testid="strip-approval-queue"
            >
              <div className="flex flex-col items-center justify-center w-10 h-10 rounded-full bg-background border shrink-0">
                <Clock className={`w-4 h-4 ${pendingCount > 0 ? "text-amber-500 dark:text-amber-400" : "text-muted-foreground"}`} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Approval Queue</span>
                <span className={`text-lg font-bold tabular-nums leading-tight ${pendingCount > 0 ? "text-amber-500 dark:text-amber-400" : "text-emerald-500 dark:text-emerald-400"}`}>
                  {pendingCount}
                </span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {pendingCount === 0 ? "All resolved" : "pending review"}
                </span>
              </div>
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground text-right" data-testid="strip-refresh-label">
            Refreshed {minsAgo === 0 ? "just now" : `${minsAgo}m ago`} · {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          </div>
        );
      })()}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="kpi-delivery" data-testid="tab-kpi-delivery">KPI Delivery</TabsTrigger>
          <TabsTrigger value="agent-map" data-testid="tab-agent-map">Agent Plan</TabsTrigger>
          <TabsTrigger value="governance" data-testid="tab-governance">
            <Gavel className="w-3.5 h-3.5 mr-1.5" />
            Governance
            {governancePolicies && governancePolicies.filter(p => p.status === "active").length > 0 && (
              <Badge variant="secondary" className="text-[9px] ml-1.5 h-4 px-1">{governancePolicies.filter(p => p.status === "active").length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="financial-ledger" data-testid="tab-financial-ledger">Financial Ledger</TabsTrigger>
          <TabsTrigger value="evidence-vault" data-testid="tab-evidence-vault">Evidence Vault</TabsTrigger>
          <TabsTrigger value="risk-remediation" data-testid="tab-risk-remediation">Risk & Remediation</TabsTrigger>
          <TabsTrigger value="constraint-graph" data-testid="tab-constraint-graph">
            <Network className="w-3.5 h-3.5 mr-1.5" />
            Constraint Graph
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: KPI Delivery */}
        <TabsContent value="kpi-delivery" className="space-y-6" data-testid="tabcontent-kpi-delivery">
          {(() => {
            const processFlow = sla.processFlow as Array<{ description: string; actor: string; timeMins: number; painPoints?: string; improvementIdeas?: string }> | undefined;
            if (!processFlow || processFlow.length === 0) return null;
            const totalMins = processFlow.reduce((s, step) => s + (step.timeMins || 0), 0);
            return (
              <Card data-testid="card-process-analysis">
                <CardHeader className="pb-2">
                  <button
                    className="flex items-center justify-between w-full text-left"
                    onClick={() => setProcessAnalysisOpen(v => !v)}
                    data-testid="button-toggle-process-analysis"
                    type="button"
                  >
                    <div className="flex items-center gap-2">
                      <Workflow className="w-4 h-4 text-primary/70" />
                      <CardTitle className="text-sm font-semibold">Process Analysis</CardTitle>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{processFlow.length} steps</Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />{totalMins} min total
                      </span>
                    </div>
                    {processAnalysisOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </CardHeader>
                {processAnalysisOpen && (
                  <CardContent className="pt-0">
                    <div className="flex flex-col gap-3" data-testid="list-process-steps">
                      {processFlow.map((step, i) => (
                        <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/40 border border-border/50" data-testid={`process-step-${i}`}>
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0 mt-0.5">{i + 1}</div>
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">{step.description}</p>
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              {step.actor && (
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />{step.actor}
                                </span>
                              )}
                              {step.timeMins != null && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />{step.timeMins} min
                                </span>
                              )}
                            </div>
                            {step.painPoints && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-0.5">
                                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{step.painPoints}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })()}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">KPI Delivery</h2>
              <p className="text-sm text-muted-foreground">Live gauges, trend lines with SLA thresholds, and predicted trajectory</p>
            </div>
            <Dialog open={createKpiOpen} onOpenChange={setCreateKpiOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-kpi">
                  <Plus className="w-4 h-4 mr-1.5" /> Add KPI
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add KPI Definition</DialogTitle>
                </DialogHeader>
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    createKpiMutation.mutate({
                      outcomeId: outcomeId,
                      name: fd.get("name") as string,
                      unit: fd.get("unit") as string,
                      baseline: parseFloat(fd.get("baseline") as string) || 0,
                      target: parseFloat(fd.get("target") as string) || 0,
                      targetOperator: fd.get("targetOperator") as string || ">=",
                      weight: parseFloat(fd.get("weight") as string) || 1,
                      slaThreshold: parseFloat(fd.get("slaThreshold") as string) || null,
                      breachLevel: fd.get("breachLevel") as string,
                      expression: fd.get("expression") as string,
                    });
                  }}
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="kpi-name">Name</Label>
                      <Input id="kpi-name" name="name" required placeholder="e.g., Resolution Rate" data-testid="input-kpi-name" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="kpi-unit">Unit</Label>
                      <select name="unit" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="count" data-testid="select-kpi-unit">
                        <option value="count">Count</option>
                        <option value="percent">Percent</option>
                        <option value="score">Score</option>
                        <option value="seconds">Seconds</option>
                        <option value="milliseconds">Milliseconds</option>
                        <option value="dollars">Dollars</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="kpi-baseline">Baseline</Label>
                      <Input id="kpi-baseline" name="baseline" type="number" step="any" placeholder="0" data-testid="input-kpi-baseline" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Operator</Label>
                      <select name="targetOperator" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue=">=" data-testid="select-kpi-operator">
                        <option value=">">&gt; Greater than</option>
                        <option value=">=">&gt;= Greater or equal</option>
                        <option value="<">&lt; Less than</option>
                        <option value="<=">&lt;= Less or equal</option>
                        <option value="=">=  Equal to</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="kpi-target">Target</Label>
                      <Input id="kpi-target" name="target" type="number" step="any" required placeholder="100" data-testid="input-kpi-target" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="kpi-weight">Weight</Label>
                      <Input id="kpi-weight" name="weight" type="number" step="0.01" defaultValue="1" placeholder="1.0" data-testid="input-kpi-weight" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="kpi-sla">SLA Threshold</Label>
                      <Input id="kpi-sla" name="slaThreshold" type="number" step="any" placeholder="Minimum acceptable" data-testid="input-kpi-sla" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Breach Level</Label>
                      <select name="breachLevel" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="warning" data-testid="select-kpi-breach">
                        <option value="warning">Warning</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="kpi-expression">Expression</Label>
                    <Input id="kpi-expression" name="expression" placeholder="e.g., count(events WHERE status='success')" data-testid="input-kpi-expression" />
                  </div>
                  <Button type="submit" disabled={createKpiMutation.isPending} data-testid="button-submit-kpi">
                    {createKpiMutation.isPending ? "Creating..." : "Add KPI"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {kpis?.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <BarChart3 className="w-10 h-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No KPIs defined yet</p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {kpis?.map((kpi) => {
              const progress = kpiProgress(kpi);
              const op = kpi.targetOperator || ">=";
              const isInverse = op === "<" || op === "<=" || /time|latency|incident|error|fail/i.test(kpi.name || "");
              const isBreaching = kpi.slaThreshold != null && kpi.currentValue != null && (
                isInverse ? kpi.currentValue > kpi.slaThreshold : kpi.currentValue < kpi.slaThreshold
              );
              const kpiTs = evidence?.kpiTimeSeries?.find(ts => ts.kpiId === kpi.id);
              const contributingAgents = agentContributions?.contributions?.slice(0, 3) || [];

              const lastPt = kpiTs?.points?.[kpiTs.points.length - 1];
              const firstPt = kpiTs?.points?.[0];
              const currentVal = kpi.currentValue || 0;
              const projectedDailyRate = kpiTs && kpiTs.points.length >= 2
                ? (lastPt!.value - firstPt!.value) / (kpiTs.points.length - 1)
                : 0;
              const projected30d = currentVal + projectedDailyRate * 30;

              return (
                <Card key={kpi.id} data-testid={`card-kpi-${kpi.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4 min-w-0">
                          <KpiGaugeRing value={kpi.currentValue || 0} target={kpi.target} size={64} strokeWidth={5} />
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold">{kpi.name}</span>
                              {isBreaching && (
                                <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20">
                                  {kpi.breachLevel === "critical" ? "SLA BREACH" : "SLA WARNING"}
                                </Badge>
                              )}
                              {trendIcon(kpi.trend)}
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              Weight: {((kpi.weight || 1) * 100).toFixed(0)}% | Unit: {kpi.unit}
                            </span>
                            {kpi.measurement && (
                              <span className="text-[11px] text-muted-foreground/80 italic" data-testid={`text-measurement-${kpi.id}`}>
                                Measured by: {kpi.measurement}
                              </span>
                            )}
                            <div className="flex items-center gap-4 mt-1 flex-wrap">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Current</span>
                                <span className="text-sm font-semibold" data-testid={`text-current-${kpi.id}`}>{kpi.currentValue ?? 0} {kpi.unit}</span>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Target</span>
                                <span className="text-sm font-medium" data-testid={`text-target-${kpi.id}`}>{kpi.targetOperator || ">="} {kpi.target} {kpi.unit}</span>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">SLA</span>
                                <span className="text-sm font-medium" data-testid={`text-sla-${kpi.id}`}>{kpi.slaThreshold ?? "N/A"}</span>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">30d Projected</span>
                                <span className={`text-sm font-medium ${(isInverse ? projected30d <= (kpi.target || 0) : projected30d >= (kpi.target || 0)) ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`} data-testid={`text-projected-${kpi.id}`}>
                                  {projected30d.toFixed(1)} {kpi.unit}
                                </span>
                              </div>
                              {(() => {
                                const bm = getIndustryBenchmark(industry?.id || "", kpi.name, kpi.unit);
                                if (!bm) return null;
                                const currentVal = kpi.currentValue || 0;
                                const isInverse = (kpi.targetOperator === "<" || kpi.targetOperator === "<=");
                                const isBetter = isInverse ? currentVal < bm.benchmark : currentVal > bm.benchmark;
                                return (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Industry Benchmark</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-medium" data-testid={`text-benchmark-${kpi.id}`}>{bm.benchmark} {bm.unit}</span>
                                      <Badge variant="outline" className={`text-[9px] ${isBetter ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"}`}>
                                        {isBetter ? "Above avg" : "Below avg"}
                                      </Badge>
                                    </div>
                                    <span className="text-[9px] text-muted-foreground">{bm.source}</span>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {editingKpiId === kpi.id ? (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => saveEditKpi(kpi.id)} disabled={updateKpiMutation.isPending} data-testid={`button-save-kpi-${kpi.id}`}>
                                <Save className="w-3.5 h-3.5 text-emerald-500" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setEditingKpiId(null)} data-testid={`button-cancel-kpi-${kpi.id}`}>
                                <X className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => startEditKpi(kpi)} data-testid={`button-edit-kpi-${kpi.id}`}>
                                <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteKpiMutation.mutate(kpi.id)} data-testid={`button-delete-kpi-${kpi.id}`}>
                                <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {editingKpiId === kpi.id && (
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Baseline</span>
                            <Input type="number" step="any" value={editKpiData.baseline} onChange={(e) => setEditKpiData({ ...editKpiData, baseline: e.target.value })} data-testid={`input-edit-baseline-${kpi.id}`} />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Operator</span>
                            <select value={editKpiData.targetOperator} onChange={(e) => setEditKpiData({ ...editKpiData, targetOperator: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm" data-testid={`select-edit-operator-${kpi.id}`}>
                              <option value=">">&gt; Greater than</option>
                              <option value=">=">&ge; Greater or equal</option>
                              <option value="<">&lt; Less than</option>
                              <option value="<=">&le; Less or equal</option>
                              <option value="=">=  Equal to</option>
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Target</span>
                            <Input type="number" step="any" value={editKpiData.target} onChange={(e) => setEditKpiData({ ...editKpiData, target: e.target.value })} data-testid={`input-edit-target-${kpi.id}`} />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Weight</span>
                            <Input type="number" step="0.01" value={editKpiData.weight} onChange={(e) => setEditKpiData({ ...editKpiData, weight: e.target.value })} data-testid={`input-edit-weight-${kpi.id}`} />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">SLA Threshold</span>
                            <Input type="number" step="any" value={editKpiData.slaThreshold} onChange={(e) => setEditKpiData({ ...editKpiData, slaThreshold: e.target.value })} data-testid={`input-edit-sla-${kpi.id}`} />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Breach Level</span>
                            <select value={editKpiData.breachLevel} onChange={(e) => setEditKpiData({ ...editKpiData, breachLevel: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm" data-testid={`select-edit-breach-${kpi.id}`}>
                              <option value="warning">Warning</option>
                              <option value="critical">Critical</option>
                            </select>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-6 flex-wrap">
                        {kpiTs && kpiTs.points && kpiTs.points.length >= 2 && (
                          <div className="flex flex-col items-center gap-1" data-testid={`kpi-sparkline-${kpi.id}`}>
                            <Sparkline
                              points={kpiTs.points}
                              target={kpiTs.target}
                              slaThreshold={kpi.slaThreshold}
                              width={180}
                              height={48}
                            />
                            <span className="text-[10px] text-muted-foreground">
                              {(() => {
                                const last = kpiTs.points[kpiTs.points.length - 1];
                                const first = kpiTs.points[0];
                                return last.value > first.value ? "Trending up" : last.value < first.value ? "Trending down" : "Stable";
                              })()}
                            </span>
                          </div>
                        )}

                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">Progress to Target</span>
                            <span className="text-xs font-medium">{Math.min(Math.round(progress), 100)}%</span>
                          </div>
                          <Progress value={Math.min(progress, 100)} className="h-2" />
                          <span className="text-[10px] text-muted-foreground">Confidence: {((kpi.confidence || 0) * 100).toFixed(0)}%</span>
                        </div>
                      </div>

                      {contributingAgents.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Contributing agents:</span>
                          {contributingAgents.map((agent) => (
                            <Link key={agent.agentId} href={`/agents/${agent.agentId}`}>
                              <Badge variant="outline" className="text-[10px] cursor-pointer" data-testid={`badge-contributing-agent-${agent.agentId}`}>
                                <Bot className="w-3 h-3 mr-1" />
                                {agent.agentName} ({agent.valueShare}%)
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {(() => {
            const reEvalEvents = (auditData?.auditEvents || [])
              .filter(e => e.action === "agent.config_changed" || e.action === "kpi.auto_reeval")
              .sort((a, b) => new Date(b.timestamp || b.createdAt || 0).getTime() - new Date(a.timestamp || a.createdAt || 0).getTime())
              .slice(0, 8);
            if (reEvalEvents.length === 0) return null;
            return (
              <Card data-testid="card-recent-reevaluations">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Recent Re-Evaluations</CardTitle>
                    <Badge variant="secondary" className="text-[10px] ml-auto">{reEvalEvents.length}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Agent configuration changes that triggered automatic KPI re-evaluation</p>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    {reEvalEvents.map((evt) => {
                      let details: any = {};
                      try { details = typeof evt.details === "string" ? JSON.parse(evt.details) : (evt.details || {}); } catch { details = {}; }
                      const isReEval = evt.action === "kpi.auto_reeval";
                      const changes = details.changes || [];
                      const breachCount = changes.filter((c: any) => c.breached).length;
                      const changedFields = details.changedFields || [];
                      const agentName = details.agentName || evt.objectId;
                      const ts = evt.timestamp || evt.createdAt;
                      return (
                        <div key={evt.id} className="flex items-start gap-3 p-2.5 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors" data-testid={`reeval-event-${evt.id}`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isReEval ? (breachCount > 0 ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-600") : "bg-blue-500/10 text-blue-600"}`}>
                            {isReEval ? <Gauge className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium">{isReEval ? "KPI Re-Evaluation" : "Config Changed"}</span>
                              {agentName && (
                                <Link href={`/agents/${isReEval ? (details.agentId || evt.objectId) : evt.objectId}`}>
                                  <Badge variant="outline" className="text-[10px] cursor-pointer" data-testid={`link-agent-${isReEval ? (details.agentId || evt.objectId) : evt.objectId}`}>
                                    <Bot className="w-2.5 h-2.5 mr-0.5" /> {agentName}
                                  </Badge>
                                </Link>
                              )}
                              {breachCount > 0 && (
                                <Badge variant="destructive" className="text-[9px]">{breachCount} breach(es)</Badge>
                              )}
                            </div>
                            {changedFields.length > 0 && (
                              <span className="text-[11px] text-muted-foreground">
                                Fields: {changedFields.join(", ")}
                              </span>
                            )}
                            {changes.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {changes.slice(0, 3).map((c: any, i: number) => (
                                  <Badge key={i} variant={c.breached ? "destructive" : "secondary"} className="text-[9px] font-normal">
                                    {c.kpiName}: {c.oldValue} → {c.newValue}
                                  </Badge>
                                ))}
                                {changes.length > 3 && (
                                  <Badge variant="secondary" className="text-[9px]">+{changes.length - 3} more</Badge>
                                )}
                              </div>
                            )}
                            {ts && (
                              <span className="text-[10px] text-muted-foreground mt-0.5">
                                <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                                {new Date(ts).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        {/* Tab 2: Agent Plan & Contributions */}
        <TabsContent value="agent-map" className="space-y-6" data-testid="tabcontent-agent-map">
          <AgentProposalsTab outcome={outcome} kpis={kpis || []} initialTemplateId={initialTemplateId} />

          {!agentContributions ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : agentContributions.contributions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Bot className="w-10 h-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No agents bound to this outcome yet</p>
                <p className="text-xs text-muted-foreground">Generate agent proposals above to get started</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Total Agents"
                  value={agentContributions.summary.totalAgents}
                  icon={Bot}
                  testId="stat-contribution-total-agents"
                  tooltip="Total number of agents contributing to this outcome"
                />
                <StatCard
                  title="Total Revenue"
                  value={`$${agentContributions.summary.totalRevenue.toLocaleString()}`}
                  icon={DollarSign}
                  testId="stat-contribution-total-revenue"
                  tooltip="Combined revenue generated by all contributing agents"
                />
                <StatCard
                  title="Avg Health Score"
                  value={agentContributions.summary.avgHealthScore}
                  icon={Activity}
                  variant={agentContributions.summary.avgHealthScore >= 80 ? "success" : agentContributions.summary.avgHealthScore >= 60 ? "warning" : "danger"}
                  testId="stat-contribution-avg-health"
                  tooltip="Average health score across all bound agents, based on uptime and error rates"
                />
                <StatCard
                  title="Underperforming"
                  value={agentContributions.summary.underperformingCount}
                  icon={AlertTriangle}
                  variant={agentContributions.summary.underperformingCount > 0 ? "danger" : "success"}
                  testId="stat-contribution-underperforming"
                  tooltip="Agents falling below expected performance thresholds"
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Value Share Distribution</h3>
                <div className="flex items-center gap-1 h-6 rounded-md overflow-hidden" data-testid="bar-value-share-distribution">
                  {agentContributions.contributions.map((agent, i) => {
                    const colors = [
                      "bg-blue-500 dark:bg-blue-400",
                      "bg-emerald-500 dark:bg-emerald-400",
                      "bg-purple-500 dark:bg-purple-400",
                      "bg-amber-500 dark:bg-amber-400",
                      "bg-pink-500 dark:bg-pink-400",
                      "bg-cyan-500 dark:bg-cyan-400",
                    ];
                    return (
                      <Tooltip key={agent.agentId}>
                        <TooltipTrigger asChild>
                          <div
                            className={`h-full ${colors[i % colors.length]} transition-all`}
                            style={{ width: `${agent.valueShare}%` }}
                            data-testid={`bar-segment-${agent.agentId}`}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">{agent.agentName}: {agent.valueShare}% (${agent.deliveredValue.toLocaleString()})</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  {agentContributions.contributions.map((agent, i) => {
                    const dotColors = [
                      "bg-blue-500",
                      "bg-emerald-500",
                      "bg-purple-500",
                      "bg-amber-500",
                      "bg-pink-500",
                      "bg-cyan-500",
                    ];
                    return (
                      <div key={agent.agentId} className="flex items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${dotColors[i % dotColors.length]}`} />
                        <span className="text-xs text-muted-foreground">{agent.agentName} ({agent.valueShare}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                {agentContributions.contributions.map((agent) => (
                  <Card
                    key={agent.agentId}
                    className={agent.isUnderperforming ? "border-red-500/30" : ""}
                    data-testid={`card-agent-contribution-${agent.agentId}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-4">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-3 min-w-0">
                            <ProgressRing value={agent.healthScore} size={44} strokeWidth={3.5} />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link href={`/agents/${agent.agentId}`}>
                                  <span className="text-sm font-semibold cursor-pointer" data-testid={`text-agent-name-${agent.agentId}`}>{agent.agentName}</span>
                                </Link>
                                <StatusBadge status={agent.status} />
                                {agent.isUnderperforming && (
                                  <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20">
                                    Underperforming
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[11px] text-muted-foreground">{agent.agentType} | {agent.totalRuns} runs | {agent.successRate}% success</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0 flex-wrap">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Value Share</span>
                              <span className="text-sm font-semibold" data-testid={`text-value-share-${agent.agentId}`}>{agent.valueShare}%</span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Delivered</span>
                              <span className="text-sm font-semibold" data-testid={`text-delivered-value-${agent.agentId}`}>${agent.deliveredValue.toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost-to-Serve</span>
                              <span className="text-sm font-semibold" data-testid={`text-cost-${agent.agentId}`}>${agent.costToServe.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Capability Breakdown</span>
                          <div className="flex flex-col gap-1.5">
                            {agent.capabilities.map((cap, ci) => (
                              <div key={ci} className="flex items-center gap-3" data-testid={`capability-${agent.agentId}-${ci}`}>
                                <span className="text-xs text-muted-foreground w-40 shrink-0 truncate">{cap.name}</span>
                                <div className="flex-1 h-2 rounded-sm bg-muted/50">
                                  <div
                                    className="h-full rounded-sm bg-primary/60"
                                    style={{ width: `${cap.contribution}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{cap.contribution}%</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">Avg Latency: {agent.avgLatency}ms</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <XCircle className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">Failed: {agent.failedRuns}/{agent.totalRuns}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex justify-end">
                <Link href={`/agents/wizard?outcomeId=${outcomeId}&outcomeName=${encodeURIComponent(outcome.name)}&riskTier=${encodeURIComponent(outcome.riskTier)}${(outcome as any).industryId ? `&industryId=${encodeURIComponent((outcome as any).industryId)}` : ""}&fromOutcome=true&description=${encodeURIComponent(`Agent created for outcome: ${outcome.name}. ${outcome.description || ""}`.trim())}`}>
                  <Button variant="ghost" size="sm" className="text-muted-foreground" data-testid="button-create-agent-from-outcome">
                    <Bot className="w-3.5 h-3.5 mr-1" /> Add Agent Manually
                  </Button>
                </Link>
              </div>

            </>
          )}
        </TabsContent>

        {/* Tab 3: Financial Ledger */}
        <TabsContent value="governance" className="space-y-6" data-testid="tabcontent-governance">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Governance Policies</h2>
              <p className="text-sm text-muted-foreground">Active policies constraining agents bound to this outcome</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(governancePolicies || []).filter(p => p.status === "active").length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setImpactNetworkOpen(true)} data-testid="button-view-impact-network">
                  <Network className="w-3.5 h-3.5 mr-1.5" /> Impact Network
                </Button>
              )}
              <Link href="/governance">
                <Button variant="outline" size="sm" data-testid="link-compliance-matrix">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Compliance Matrix
                </Button>
              </Link>
            </div>
          </div>
          {(() => {
            const boundAgentIds = new Set(boundAgents.map(a => a.id));
            const activePolicies = (governancePolicies || []).filter(p => {
              if (p.status !== "active") return false;
              const st = p.scopeType;
              if (!st || st === "org" || st === "global") return true;
              if (st === "outcome" && p.scopeId === outcomeId) return true;
              if (st === "agent" && p.scopeId && boundAgentIds.has(p.scopeId)) return true;
              return false;
            });
            const domainGroups = activePolicies.reduce<Record<string, Policy[]>>((acc, p) => {
              const d = p.domain || "general";
              if (!acc[d]) acc[d] = [];
              acc[d].push(p);
              return acc;
            }, {});
            const domainLabels: Record<string, string> = {
              data_handling: "Data Handling",
              tool_permissions: "Tool Permissions",
              access_control: "Access Control",
              audit: "Audit & Logging",
              compliance: "Compliance",
              general: "General",
            };
            return activePolicies.length > 0 ? (
              <div className="space-y-4">
                {Object.entries(domainGroups).map(([domain, policies]) => (
                  <Card key={domain}>
                    <CardContent className="p-4">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{domainLabels[domain] || domain}</span>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {policies.map(p => (
                          <Badge key={p.id} variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20" data-testid={`policy-badge-${p.id}`}>
                            <Shield className="w-3 h-3 mr-1" />
                            {p.name}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-6 text-center">
                  <Gavel className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No active policies configured.</p>
                  <Link href="/governance">
                    <Button variant="ghost" size="sm" className="text-violet-500 mt-1">Create policies in Governance</Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })()}
          {boundAgents.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Constrained Agents</span>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {boundAgents.map(agent => (
                    <Link key={agent.id} href={`/agents/${agent.id}`}>
                      <Badge variant="secondary" className="text-[10px] cursor-pointer" data-testid={`constrained-agent-${agent.id}`}>
                        <Bot className="w-3 h-3 mr-1" />
                        {agent.name}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="financial-ledger" className="space-y-6" data-testid="tabcontent-financial-ledger">
          <div>
            <h2 className="text-lg font-semibold">Financial Ledger</h2>
            <p className="text-sm text-muted-foreground">Revenue lifecycle pipeline with drill-down to agent runs</p>
          </div>

          {!financialLedger || !financialLedger.summary ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <>
              <Card data-testid="card-pipeline-visualization">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3">
                    <span className="text-sm font-semibold">Revenue Pipeline</span>
                    <div className="flex items-center gap-2 flex-wrap justify-center" data-testid="pipeline-flow">
                      {financialLedger.pipeline.map((stage, i) => (
                        <div key={stage.stage} className="flex items-center gap-2">
                          <div className="flex flex-col items-center gap-1 p-3 rounded-md bg-muted/50 min-w-[100px]" data-testid={`pipeline-stage-${stage.stage}`}>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{stage.label}</span>
                            <span className="text-lg font-semibold">${stage.amount.toLocaleString()}</span>
                            <span className="text-[10px] text-muted-foreground">{stage.count} items</span>
                          </div>
                          {i < financialLedger.pipeline.length - 1 && (
                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard title="Captured" value={`$${financialLedger.summary.totalCaptured.toLocaleString()}`} icon={Receipt} testId="stat-captured" tooltip="Total revenue captured from billable agent events" />
                <StatCard title="Metered" value={`$${financialLedger.summary.totalMetered.toLocaleString()}`} icon={Gauge} testId="stat-metered" tooltip="Usage-based charges metered but not yet invoiced" />
                <StatCard title="Invoiced" value={`$${financialLedger.summary.totalInvoiced.toLocaleString()}`} icon={FileText} testId="stat-invoiced" tooltip="Total amount invoiced to customers" />
                <StatCard title="Collected" value={`$${financialLedger.summary.totalCollected.toLocaleString()}`} icon={Banknote} testId="stat-collected" variant="success" tooltip="Payments successfully collected" />
                <StatCard title="Disputed" value={`$${financialLedger.summary.totalDisputed.toLocaleString()}`} icon={Gavel} testId="stat-disputed" variant={financialLedger.summary.totalDisputed > 0 ? "danger" : "default"} tooltip="Amount under dispute or chargeback" />
                <StatCard title="Collection Rate" value={`${financialLedger.summary.collectionRate.toFixed(1)}%`} icon={TrendingUp} testId="stat-collection-rate" variant={financialLedger.summary.collectionRate >= 90 ? "success" : "warning"} tooltip="Percentage of invoiced amount successfully collected" />
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Invoices</h3>
                {financialLedger.invoices.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
                      <FileText className="w-8 h-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground" data-testid="text-no-invoices">No invoices generated</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {financialLedger.invoices.map((inv) => (
                          <div key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap" data-testid={`row-invoice-${inv.id}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium truncate">Invoice {inv.id.slice(0, 8)}</span>
                                <span className="text-xs text-muted-foreground">{inv.periodStart} - {inv.periodEnd}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 flex-wrap">
                              <StatusBadge status={inv.status} />
                              <span className="text-sm font-semibold">${inv.totalAmount.toFixed(2)}</span>
                              <Badge variant="outline" className="text-[10px]">{inv.lineItemCount} line items</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Recent Revenue Events</h3>
                {financialLedger.recentEvents.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
                      <Database className="w-8 h-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No recent revenue events</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {financialLedger.recentEvents.map((evt) => (
                          <div key={evt.id} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap" data-testid={`row-revenue-event-${evt.id}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <CircleDot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium truncate">{evt.type}</span>
                                <span className="text-xs text-muted-foreground truncate">Agent: {evt.agentName || (evt.agentId ? evt.agentId.slice(0, 8) + "..." : "N/A")}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              <span className="text-sm font-medium">${evt.amount.toFixed(2)}</span>
                              {evt.billable ? (
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Billable</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20">Excluded</Badge>
                              )}
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{relativeTime(evt.createdAt)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </TabsContent>

        {/* Tab 4: Evidence Vault */}
        <TabsContent value="evidence-vault" className="space-y-6" data-testid="tabcontent-evidence-vault">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Evidence Vault</h2>
              <p className="text-sm text-muted-foreground">KPI snapshots, audit events, compliance attestations, version history</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={evidenceWindow} onValueChange={setEvidenceWindow}>
                <SelectTrigger className="w-24" data-testid="select-evidence-window">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="14d">14 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                  <SelectItem value="90d">90 days</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={exportAuditBundle} data-testid="button-export-evidence-bundle">
                <Download className="w-4 h-4 mr-1.5" /> Export Bundle
              </Button>
            </div>
          </div>

          {!evidence ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">KPI Snapshots</h3>
                {evidence.kpiTimeSeries.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {evidence.kpiTimeSeries.map((kpiTs) => {
                      const lastPoint = kpiTs.points[kpiTs.points.length - 1];
                      const firstPoint = kpiTs.points[0];
                      const trendDir = lastPoint && firstPoint
                        ? lastPoint.value > firstPoint.value ? "up" : lastPoint.value < firstPoint.value ? "down" : "stable"
                        : "stable";
                      const matchingKpi = kpis?.find(k => k.id === kpiTs.kpiId);
                      return (
                        <Card key={kpiTs.kpiId} data-testid={`card-evidence-kpi-${kpiTs.kpiId}`}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-sm font-semibold truncate">{kpiTs.kpiName}</span>
                                <span className="text-xs text-muted-foreground">
                                  Current: {lastPoint?.value ?? "N/A"} {kpiTs.unit} | Target: {kpiTs.target} {kpiTs.unit}
                                </span>
                                <div className="flex items-center gap-1 mt-0.5">
                                  {trendDir === "up" && <TrendingUp className="w-3 h-3 text-emerald-500" />}
                                  {trendDir === "down" && <TrendingDown className="w-3 h-3 text-red-500" />}
                                  {trendDir === "stable" && <Minus className="w-3 h-3 text-muted-foreground" />}
                                  <span className="text-[10px] text-muted-foreground">{evidenceWindow} trend</span>
                                </div>
                              </div>
                              <Sparkline
                                points={kpiTs.points}
                                target={kpiTs.target}
                                slaThreshold={matchingKpi?.slaThreshold}
                                width={140}
                                height={40}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
                      <BarChart3 className="w-8 h-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No KPI snapshot data available</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              <CollapsibleSection title="Data Quality" icon={<Database className="w-3 h-3" />} defaultOpen={false} testId="section-evidence-data-quality">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
                  <Card data-testid="card-dq-total-events">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Events</span>
                      <p className="text-lg font-semibold mt-1">{evidence.dataQuality.totalEvents}</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-dq-billable-events">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Billable Events</span>
                      <p className="text-lg font-semibold mt-1">{evidence.dataQuality.billableEvents}</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-dq-missing-field-rate">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Missing Field Rate</span>
                      <p className="text-lg font-semibold mt-1">{evidence.dataQuality.missingFieldRate}%</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-dq-schema-conformance">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Schema Conformance</span>
                      <p className="text-lg font-semibold mt-1">{evidence.dataQuality.schemaConformance}%</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-dq-last-event">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Event</span>
                      <p className="text-sm font-semibold mt-1">{relativeTime(evidence.dataQuality.lastEventAt)}</p>
                    </CardContent>
                  </Card>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Correlated Agent Metrics" icon={<Activity className="w-3 h-3" />} defaultOpen={false} testId="section-evidence-agent-metrics">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <Card data-testid="card-metric-success-rate">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Success Rate</span>
                      <p className="text-lg font-semibold mt-1">{evidence.correlatedMetrics.successRate}%</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-metric-avg-latency">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Latency</span>
                      <p className="text-lg font-semibold mt-1">{evidence.correlatedMetrics.avgLatency}ms</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-metric-total-runs">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Runs</span>
                      <p className="text-lg font-semibold mt-1">{evidence.correlatedMetrics.totalRuns}</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-metric-failed-runs">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Failed Runs</span>
                      <p className="text-lg font-semibold mt-1">{evidence.correlatedMetrics.failedRuns}</p>
                    </CardContent>
                  </Card>
                </div>
              </CollapsibleSection>
            </>
          )}

          <AuditTab outcomeId={outcomeId!} outcome={outcome} auditData={auditData} gates={gates} />

          {snapshots?.snapshots && snapshots.snapshots.length > 0 && (
            <CollapsibleSection title="Snapshot Timeline" icon={<Calendar className="w-3 h-3" />} defaultOpen={false} count={Math.min(snapshots.snapshots.length, 7)} testId="section-snapshot-timeline">
              <div className="flex items-center justify-end gap-1 pt-2 pb-1 flex-wrap">
                {["7d", "30d", "90d"].map((w) => (
                  <Button
                    key={w}
                    variant={evidenceWindow === w ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEvidenceWindow(w)}
                    data-testid={`button-window-${w}`}
                  >
                    {w}
                  </Button>
                ))}
              </div>
              <div className="space-y-0">
                {[...snapshots.snapshots].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 7).map((snap, i, arr) => (
                  <div key={snap.date} className="flex gap-3" data-testid={`timeline-entry-${snap.date}`}>
                    <div className="flex flex-col items-center shrink-0">
                      <div className={`w-3 h-3 rounded-full border-2 ${i === 0 ? "bg-primary border-primary" : "bg-background border-muted-foreground/30"}`} />
                      {i < arr.length - 1 && <div className="w-0.5 flex-1 bg-muted-foreground/20 min-h-[2rem]" />}
                    </div>
                    <div className="flex-1 mb-3 p-3 rounded-md bg-muted/30">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm font-semibold">{snap.date}</span>
                            {i === 0 && <Badge variant="outline" className="text-[9px] bg-primary/15 text-primary border-primary/20">Latest</Badge>}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[9px]">{snap.eventCount} events</Badge>
                            <Badge variant="outline" className="text-[9px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">{snap.billableCount} billable</Badge>
                          </div>
                        </div>
                        {snap.kpiValues.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                            {snap.kpiValues.map((kv) => (
                              <div key={kv.kpiId} className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/50">
                                <span className="text-[10px] text-muted-foreground truncate">{kv.kpiName}</span>
                                <span className="text-sm font-semibold">{kv.value}</span>
                                <Badge variant="outline" className={`text-[8px] w-fit ${
                                  (kv.confidence || 0) >= 0.8 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                  : (kv.confidence || 0) >= 0.5 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                  : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                                }`}>
                                  {((kv.confidence || 0) * 100).toFixed(0)}% conf
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}
        </TabsContent>

        {/* Tab 5: Risk & Remediation */}
        <TabsContent value="risk-remediation" className="space-y-6" data-testid="tabcontent-risk-remediation">
          <div>
            <h2 className="text-lg font-semibold">Risk & Remediation</h2>
            <p className="text-sm text-muted-foreground">Active risks, AI-generated recommendations, incidents, and pending approvals</p>
          </div>

          {!remediation ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Active Risks ({remediation.risks.length})</h3>
                {remediation.risks.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
                      <CheckCircle className="w-8 h-8 text-emerald-500/50" />
                      <p className="text-sm text-muted-foreground">No active risks detected</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {remediation.risks.map((risk) => {
                      const severityColors: Record<string, string> = {
                        critical: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
                        high: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
                        medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
                        low: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                      };
                      return (
                        <Card key={risk.id} data-testid={`card-risk-${risk.id}`}>
                          <CardContent className="p-4">
                            <div className="flex flex-col gap-4">
                              <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="flex items-start gap-3 min-w-0">
                                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-red-500/10 shrink-0 mt-0.5">
                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-semibold">{risk.title}</span>
                                      <Badge variant="outline" className={`text-[10px] ${severityColors[risk.severity] || severityColors.medium}`}>
                                        {risk.severity.charAt(0).toUpperCase() + risk.severity.slice(1)}
                                      </Badge>
                                      <Badge variant="outline" className="text-[10px]">{risk.category}</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">{risk.description}</p>
                                  </div>
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{relativeTime(risk.detectedAt)}</span>
                              </div>

                              {risk.affectedAgents.length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] text-muted-foreground">Affected agents:</span>
                                  {risk.affectedAgents.map((a, i) => (
                                    <Badge key={i} variant="outline" className="text-[10px]">{a}</Badge>
                                  ))}
                                </div>
                              )}

                              {risk.affectedKpis.length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] text-muted-foreground">Affected KPIs:</span>
                                  {risk.affectedKpis.map((k, i) => (
                                    <Badge key={i} variant="outline" className="text-[10px]">{k}</Badge>
                                  ))}
                                </div>
                              )}

                              <div className="rounded-md bg-primary/5 border border-primary/10 p-3" data-testid={`remediation-${risk.id}`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <Lightbulb className="w-3.5 h-3.5 text-primary" />
                                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">AI Recommendation</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                  <span className="text-sm font-medium">{risk.recommendation.title}</span>
                                  <p className="text-xs text-muted-foreground">{risk.recommendation.description}</p>
                                  <div className="flex items-center gap-4 flex-wrap">
                                    <div className="flex items-center gap-1.5">
                                      <TrendingUp className="w-3 h-3 text-emerald-500" />
                                      <span className="text-[10px] text-muted-foreground">{risk.recommendation.estimatedImpact}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Clock className="w-3 h-3 text-muted-foreground" />
                                      <span className="text-[10px] text-muted-foreground">Effort: {risk.recommendation.effort}</span>
                                    </div>
                                    <Badge variant="outline" className="text-[10px]">{risk.recommendation.type}</Badge>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap mt-1">
                                    {risk.recommendation.linkedPatchId && (
                                      <Link href={`/agents`}>
                                        <Button variant="outline" size="sm" data-testid={`button-view-patch-${risk.id}`}>
                                          <Wrench className="w-3.5 h-3.5 mr-1" /> View Patch
                                        </Button>
                                      </Link>
                                    )}
                                    {risk.recommendation.linkedExperimentId && (
                                      <Link href={`/improvements`}>
                                        <Button variant="outline" size="sm" data-testid={`button-view-experiment-${risk.id}`}>
                                          <FlaskConical className="w-3.5 h-3.5 mr-1" /> View Experiment
                                        </Button>
                                      </Link>
                                    )}
                                    <Button variant="outline" size="sm" data-testid={`button-approve-remediation-${risk.id}`}>
                                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

              {remediation.activeIncidents.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Active Incidents ({remediation.activeIncidents.length})</h3>
                  <div className="space-y-2">
                    {remediation.activeIncidents.map((incident) => (
                      <Card key={incident.id} data-testid={`card-incident-${incident.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3 min-w-0">
                              <Flame className="w-4 h-4 text-red-500 shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium truncate">{incident.title}</span>
                                  <Badge variant="outline" className={`text-[10px] ${
                                    incident.severity === "critical" ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                  }`}>{incident.severity}</Badge>
                                  <StatusBadge status={incident.status} />
                                </div>
                                <span className="text-xs text-muted-foreground">Agent: {incident.agentName}</span>
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{relativeTime(incident.detectedAt)}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {remediation.recentPatches.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Linked Patches ({remediation.recentPatches.length})</h3>
                  <div className="space-y-2">
                    {remediation.recentPatches.map((patch) => (
                      <Card key={patch.id} data-testid={`card-patch-${patch.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3 min-w-0">
                              <Wrench className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium truncate">{patch.description}</span>
                                <span className="text-xs text-muted-foreground">Agent: {patch.agentName} | Type: {patch.changeType}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              <StatusBadge status={patch.status} />
                              {patch.riskScore > 0 && (
                                <Badge variant="outline" className="text-[10px]">Risk: {(patch.riskScore * 100).toFixed(0)}%</Badge>
                              )}
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{relativeTime(patch.createdAt)}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {pendingApprovals.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Pending Approvals</h3>
                  <div className="space-y-2">
                    {pendingApprovals.map((approval) => (
                      <Card key={approval.id} data-testid={`card-pending-approval-${approval.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium truncate">{approval.objectName || approval.type}</span>
                                <span className="text-xs text-muted-foreground">{approval.description || approval.type.replace(/_/g, " ")}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <StatusBadge status={approval.status} />
                              {approval.riskScore != null && (
                                <Badge variant="outline" className="text-[10px]">Risk: {((approval.riskScore || 0) * 100).toFixed(0)}%</Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="constraint-graph" className="space-y-6" data-testid="tabcontent-constraint-graph">
          {(() => {
            const cg = outcome?.constraintGraph as any;
            const propagationTargetLabels: Record<string, { label: string; icon: typeof Target }> = {
              agent_design: { label: "Agent Design", icon: Bot },
              eval_studio: { label: "Eval Studio", icon: FlaskConical },
              deployment: { label: "Deployment", icon: Rocket },
              self_healing: { label: "Self-Healing", icon: Wrench },
            };
            const categories = [
              {
                key: "performanceConstraints",
                label: "Performance Constraints",
                icon: Gauge,
                color: "text-emerald-500",
                bgColor: "bg-emerald-500/10",
                borderColor: "border-emerald-500/20",
                description: "KPIs with percentage, accuracy, or quality targets",
                items: cg?.performanceConstraints || [],
              },
              {
                key: "latencyConstraints",
                label: "Latency Constraints",
                icon: Clock,
                color: "text-blue-500",
                bgColor: "bg-blue-500/10",
                borderColor: "border-blue-500/20",
                description: "Time-based metrics and response time SLAs",
                items: cg?.latencyConstraints || [],
              },
              {
                key: "complianceConstraints",
                label: "Compliance Constraints",
                icon: Shield,
                color: "text-amber-500",
                bgColor: "bg-amber-500/10",
                borderColor: "border-amber-500/20",
                description: "Risk tier, approval gates, and regulatory requirements",
                items: cg?.complianceConstraints || [],
              },
              {
                key: "commercialConstraints",
                label: "Commercial Constraints",
                icon: DollarSign,
                color: "text-violet-500",
                bgColor: "bg-violet-500/10",
                borderColor: "border-violet-500/20",
                description: "Pricing model, unit economics, and billing tiers",
                items: cg?.commercialConstraints || [],
              },
            ];

            return (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-lg font-semibold" data-testid="text-constraint-graph-title">Constraint Graph</h2>
                    <p className="text-sm text-muted-foreground">
                      Typed constraint decomposition showing how outcome requirements propagate to downstream systems
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {cg?.generatedAt && (
                      <Badge variant="outline" data-testid="badge-constraint-graph-generated">
                        <Clock className="w-3 h-3 mr-1" />
                        Generated {relativeTime(cg.generatedAt)}
                      </Badge>
                    )}
                    <Button variant="outline" size="sm" onClick={regenerateConstraintGraph} disabled={regeneratingGraph} data-testid="button-regenerate-constraint-graph">
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${regeneratingGraph ? "animate-spin" : ""}`} />
                      {regeneratingGraph ? "Generating..." : cg ? "Regenerate" : "Generate"}
                    </Button>
                  </div>
                </div>

                {cg?.summary && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {categories.map((cat) => {
                      const CatIcon = cat.icon;
                      return (
                        <Card key={cat.key} data-testid={`card-constraint-summary-${cat.key}`}>
                          <CardContent className="flex items-center gap-3 p-4">
                            <div className={`w-9 h-9 rounded-md flex items-center justify-center ${cat.bgColor}`}>
                              <CatIcon className={`w-4.5 h-4.5 ${cat.color}`} />
                            </div>
                            <div>
                              <p className="text-2xl font-bold">{cat.items.length}</p>
                              <p className="text-xs text-muted-foreground">{cat.label.replace(" Constraints", "")}</p>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {!cg ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                      <Network className="w-10 h-10 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No constraint graph generated yet</p>
                      <p className="text-xs text-muted-foreground">Click Generate to derive constraints from current KPIs and outcome configuration.</p>
                      <Button variant="outline" onClick={regenerateConstraintGraph} disabled={regeneratingGraph} data-testid="button-generate-constraint-graph-empty">
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${regeneratingGraph ? "animate-spin" : ""}`} />
                        {regeneratingGraph ? "Generating..." : "Generate Constraint Graph"}
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {categories.map((cat) => {
                      const CatIcon = cat.icon;
                      return (
                        <Card key={cat.key} data-testid={`card-constraint-category-${cat.key}`}>
                          <CardHeader className="flex flex-row items-center gap-2 pb-3">
                            <div className={`w-8 h-8 rounded-md flex items-center justify-center ${cat.bgColor}`}>
                              <CatIcon className={`w-4 h-4 ${cat.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-sm font-semibold">{cat.label}</CardTitle>
                              <p className="text-xs text-muted-foreground">{cat.description}</p>
                            </div>
                            <Badge variant="secondary" className="text-[10px]">{cat.items.length}</Badge>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {cat.items.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2">No constraints in this category</p>
                            ) : (
                              cat.items.map((item: any, idx: number) => (
                                <div key={idx} className={`rounded-md border p-3 space-y-2 ${cat.borderColor}`} data-testid={`constraint-item-${cat.key}-${idx}`}>
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-sm font-medium">
                                      {item.kpiName || item.metric || item.riskTier || item.pricingModel || item.source}
                                    </span>
                                    <Badge variant="outline" className="text-[10px]">{item.source}</Badge>
                                  </div>
                                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                                    {item.target != null && <span>Target: <strong className="text-foreground">{item.target}{item.unit === "percent" || item.unit === "%" ? "%" : ` ${item.unit || ""}`}</strong></span>}
                                    {item.slaThreshold != null && <span>SLA: <strong className="text-foreground">{item.slaThreshold}{item.unit === "percent" || item.unit === "%" ? "%" : ` ${item.unit || ""}`}</strong></span>}
                                    {item.value != null && <span>Value: <strong className="text-foreground">{item.value} {item.unit || ""}</strong></span>}
                                    {item.riskTier && <span>Risk: <strong className="text-foreground">{item.riskTier}</strong></span>}
                                    {item.maxDriftPercent != null && <span>Max Drift: <strong className="text-foreground">{item.maxDriftPercent}%</strong></span>}
                                    {item.threshold != null && <span>Threshold: <strong className="text-foreground">{item.threshold}</strong></span>}
                                    {item.pricingModel && <span>Model: <strong className="text-foreground">{item.pricingModel}</strong></span>}
                                    {item.pricePerUnit != null && <span>Unit Price: <strong className="text-foreground">${item.pricePerUnit}</strong></span>}
                                  </div>
                                  {item.propagatesTo && item.propagatesTo.length > 0 && (
                                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                      {item.propagatesTo.map((target: string) => {
                                        const info = propagationTargetLabels[target];
                                        if (!info) return null;
                                        const TargetIcon = info.icon;
                                        return (
                                          <Badge key={target} variant="secondary" className="text-[10px] gap-1" data-testid={`badge-propagation-${target}`}>
                                            <TargetIcon className="w-3 h-3" />
                                            {info.label}
                                          </Badge>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </TabsContent>
      </Tabs>

      <Dialog open={reportOpen} onOpenChange={(open) => { setReportOpen(open); if (!open) setReportContent(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Customer Value Report
            </DialogTitle>
          </DialogHeader>
          {!reportContent ? (
            <div className="flex flex-col items-center justify-center py-8 gap-5">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <div className="text-center flex flex-col gap-1">
                <h3 className="text-base font-semibold">Generate Value Report</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  AI-generated business report using real execution data, KPI performance, and agent metrics for {industry?.label || "your industry"}.
                </p>
              </div>
              <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                <div className="flex flex-col gap-1.5 w-full">
                  <label className="text-xs font-medium text-muted-foreground">Reporting Period</label>
                  <select
                    value={reportPeriod}
                    onChange={(e) => setReportPeriod(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    data-testid="select-report-period"
                  >
                    <option value="Last 7 days">Last 7 days</option>
                    <option value="Last 30 days">Last 30 days</option>
                    <option value="Last 90 days">Last 90 days</option>
                    <option value="All time">All time</option>
                  </select>
                </div>
                {!hasReportData ? (
                  <div className="text-center p-3 rounded-md bg-muted/50 w-full">
                    <p className="text-xs text-muted-foreground">
                      Not enough data to generate a report. Deploy agents and run them to start collecting execution data.
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground text-center space-y-0.5">
                    <p>{boundAgents.length} agent{boundAgents.length !== 1 ? "s" : ""} · {totalEventsCount} event{totalEventsCount !== 1 ? "s" : ""} · {evidence?.correlatedMetrics?.totalRuns || 0} run{(evidence?.correlatedMetrics?.totalRuns || 0) !== 1 ? "s" : ""}</p>
                  </div>
                )}
                <Button onClick={generateCustomerReport} disabled={reportGenerating || !hasReportData} className="w-full" data-testid="button-generate-report">
                  {reportGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      Generating report...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-1.5" />
                      Generate Report
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 text-xs text-muted-foreground border-b pb-3">
                <span className="font-medium text-foreground">{outcome.name}</span>
                <span>·</span>
                <span>{new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
                <span>·</span>
                <span>{reportPeriod}</span>
                {industry?.label && (
                  <>
                    <span>·</span>
                    <Badge variant="outline" className="text-[10px] h-4">{industry.label}</Badge>
                  </>
                )}
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="report-content">
                {reportContent.split("\n").map((line: string, i: number) => {
                  if (line.startsWith("# ")) return <h2 key={i} className="text-lg font-semibold mt-4 mb-2">{line.slice(2)}</h2>;
                  if (line.startsWith("## ")) return <h3 key={i} className="text-base font-semibold mt-3 mb-1">{line.slice(3)}</h3>;
                  if (line.startsWith("### ")) return <h4 key={i} className="text-sm font-semibold mt-2 mb-1">{line.slice(4)}</h4>;
                  if (line.startsWith("- ")) {
                    const rendered = line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                    return <li key={i} className="text-sm text-muted-foreground ml-4" dangerouslySetInnerHTML={{ __html: rendered }} />;
                  }
                  if (/^\d+\.\s/.test(line)) {
                    const rendered = line.replace(/^\d+\.\s/, "").replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                    return <li key={i} className="text-sm text-muted-foreground ml-4 list-decimal" dangerouslySetInnerHTML={{ __html: rendered }} />;
                  }
                  if (line.trim() === "") return <div key={i} className="h-2" />;
                  const rendered = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                  return <p key={i} className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: rendered }} />;
                })}
              </div>
              <div className="flex items-center gap-2 flex-wrap border-t pt-4">
                <Button variant="outline" size="sm" onClick={downloadReport} data-testid="button-download-report">
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Download Report
                </Button>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(reportContent); toast({ title: "Report copied to clipboard" }); }} data-testid="button-copy-report">
                  Copy to Clipboard
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setReportContent(null); }} data-testid="button-regenerate-report">
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Regenerate
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditTab({
  outcomeId,
  outcome,
  auditData,
  gates,
}: {
  outcomeId: string;
  outcome: OutcomeContract;
  auditData: {
    auditEvents: Array<{
      id: string;
      objectType: string;
      objectId: string;
      action: string;
      actorId: string;
      details: any;
      timestamp: string;
      createdAt?: string;
    }>;
    approvals: Array<{
      id: string;
      type: string;
      status: string;
      objectName: string;
      decidedBy: string;
      decidedAt: string;
      riskScore: number;
      createdAt?: string;
    }>;
  } | undefined;
  gates: Array<Record<string, any>>;
}) {
  const [auditFilter, setAuditFilter] = useState<"all" | "changes" | "approvals">("all");

  const timelineEntries: Array<{
    id: string;
    kind: "audit" | "approval";
    action: string;
    actor: string;
    timestamp: string;
    details?: any;
    status?: string;
    riskScore?: number;
  }> = [];

  if (auditData) {
    for (const evt of auditData.auditEvents) {
      timelineEntries.push({
        id: evt.id,
        kind: "audit",
        action: evt.action,
        actor: evt.actorId || "system",
        timestamp: evt.timestamp || evt.createdAt || "",
        details: evt.details,
      });
    }
    for (const appr of auditData.approvals) {
      timelineEntries.push({
        id: appr.id,
        kind: "approval",
        action: `${appr.type} - ${appr.status}`,
        actor: appr.decidedBy || "pending",
        timestamp: appr.decidedAt || appr.createdAt || "",
        status: appr.status,
        riskScore: appr.riskScore,
      });
    }
  }

  timelineEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredEntries =
    auditFilter === "all"
      ? timelineEntries
      : auditFilter === "changes"
        ? timelineEntries.filter((e) => e.kind === "audit")
        : timelineEntries.filter((e) => e.kind === "approval");

  const actionIcon = (action: string, kind: string) => {
    if (kind === "approval") return <ShieldCheck className="w-4 h-4 text-primary" />;
    if (action.includes("create")) return <Plus className="w-4 h-4 text-emerald-500" />;
    if (action.includes("update") || action.includes("edit")) return <Edit3 className="w-4 h-4 text-amber-500" />;
    if (action.includes("delete")) return <Trash2 className="w-4 h-4 text-red-500" />;
    return <FileText className="w-4 h-4 text-muted-foreground" />;
  };

  const { data: versions } = useQuery<Array<{
    version: number;
    changedAt: string;
    changedBy: string;
    summary: string;
    diff: Record<string, { from: any; to: any }>;
  }>>({
    queryKey: ["/api/outcomes", outcomeId, "versions"],
  });

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Audit Trail</h3>
          <p className="text-xs text-muted-foreground">Contract versions, changes, and approval decisions</p>
        </div>
        <Badge variant="outline" className="text-[10px]" data-testid="badge-version">v{outcome.version}</Badge>
      </div>

      {versions && versions.length > 0 && (
        <div className="space-y-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contract Version History</span>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {versions.map((ver, i) => (
                  <div key={ver.version} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`row-version-${ver.version}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full ${i === 0 ? "bg-primary" : "bg-muted-foreground/30"}`} />
                        {i < versions.length - 1 && <div className="w-0.5 h-4 bg-muted-foreground/20" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">v{ver.version}</span>
                          {i === 0 && <Badge variant="outline" className="text-[9px] bg-primary/15 text-primary border-primary/20">Current</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{ver.summary}</span>
                        <span className="text-[10px] text-muted-foreground">by {ver.changedBy}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {Object.keys(ver.diff || {}).length > 0 && (
                        <Badge variant="outline" className="text-[9px]">{Object.keys(ver.diff).length} fields</Badge>
                      )}
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{relativeTime(ver.changedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={auditFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setAuditFilter("all")}
          data-testid="button-filter-all"
        >
          All
        </Button>
        <Button
          variant={auditFilter === "changes" ? "default" : "outline"}
          size="sm"
          onClick={() => setAuditFilter("changes")}
          data-testid="button-filter-changes"
        >
          Changes
        </Button>
        <Button
          variant={auditFilter === "approvals" ? "default" : "outline"}
          size="sm"
          onClick={() => setAuditFilter("approvals")}
          data-testid="button-filter-approvals"
        >
          Approvals
        </Button>
      </div>

      {!auditData ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : filteredEntries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <History className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No audit events recorded</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredEntries.map((entry) => (
            <Card key={entry.id} data-testid={`card-audit-${entry.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    {actionIcon(entry.action, entry.kind)}
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{entry.action.replace(/_/g, " ")}</span>
                      <span className="text-xs text-muted-foreground">by {entry.actor}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {entry.kind === "approval" && entry.status === "approved" && (
                      <Badge variant="outline" className="text-[9px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" data-testid={`badge-signed-${entry.id}`}>
                        <CheckCircle className="w-3 h-3 mr-0.5" /> Signed
                      </Badge>
                    )}
                    {entry.status && <StatusBadge status={entry.status} />}
                    {entry.riskScore != null && entry.riskScore > 0 && (
                      <Badge variant="outline" className="text-[10px]">Risk: {(entry.riskScore * 100).toFixed(0)}%</Badge>
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap" data-testid={`text-audit-time-${entry.id}`}>
                      {relativeTime(entry.timestamp)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {gates.length > 0 && (
        <>
          <Separator />
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configured Gates</span>
            <p className="text-[10px] text-muted-foreground">Lifecycle stages requiring expert validation</p>
          </div>
          <div className="space-y-2">
            {gates.map((gate, i) => (
              <Card key={i} data-testid={`card-gate-${i}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 shrink-0">
                        <Lock className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold capitalize">{gate.stage?.replace(/_/g, " ")}</span>
                        <span className="text-xs text-muted-foreground capitalize">Approver: {gate.approverRole?.replace(/_/g, " ")}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className={gate.required
                      ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                      : "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20"
                    }>
                      {gate.required ? "Required" : "Optional"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

    </>
  );
}

interface AgentProposal {
  name: string;
  description: string;
  role: string;
  riskTier: string;
  autonomyMode: string;
  modelProvider: string;
  modelName: string;
  workflowSteps: string[];
  tools: Array<{ name: string; description: string }>;
  kpiBindings: string[];
  estimatedImpact: string;
  templateMatch: string | null;
  systemPrompt?: string;
  complianceTags?: string[];
  matchedSkills?: string[];
  matchedOntologyConcepts?: string[];
  policyConstraints?: string[];
  mcpToolBindings?: Array<{ server: string; tool: string }>;
  suggestedRagPipeline?: string | null;
  suggestedKnowledgeBases?: Array<{ id: string; name: string }>;
  suggestedPatternType?: string;
  suggestedBlueprintId?: string | null;
  suggestedBlueprintName?: string | null;
}

interface PipelineEdge {
  from: string;
  to: string;
  label: string;
  type: string;
}

interface AgentDependencyEntry {
  agent: string;
  inputs: string[];
  outputs: string[];
  dependsOn: string[];
}

interface SystemExtracted {
  name: string;
  systemRole?: "orchestration_system" | "target_system";
  purpose: string;
  mcpCoverage: "covered" | "partial" | "missing" | "not_applicable";
  existingMcpServer: string | null;
  requiredCapabilities: string[];
  source?: string;
  quote?: string;
}

interface McpGap {
  system: string;
  purpose: string;
  missingCapabilities: string[];
  suggestedMcpServerName: string;
  priority: "critical" | "high" | "medium";
}

interface PipelineDefinition {
  pattern: string;
  description: string;
  edges: PipelineEdge[];
  errorHandling: string;
  handoffRules: string;
  patternReasoning?: string;
  systemsExtracted?: SystemExtracted[];
  mcpGaps?: McpGap[];
  agentDependencyMatrix?: AgentDependencyEntry[];
  parallelGroups?: string[][];
  executionGraph?: Array<{ stage: number; agents: string[]; waitForAll: boolean }>;
}

const PATTERN_LABELS: Record<string, { label: string; icon: string; description: string }> = {
  sequential: { label: "Sequential Pipeline", icon: "→", description: "Agents execute in order, each passing results to the next" },
  parallel: { label: "Parallel Execution", icon: "⇉", description: "Agents execute concurrently, results aggregated by orchestrator" },
  fan_out_fan_in: { label: "Fan-Out / Fan-In", icon: "⤨", description: "Orchestrator distributes work, then collects and merges results" },
  supervisor: { label: "Supervisor / Delegator", icon: "⊛", description: "Orchestrator dynamically delegates tasks based on context" },
};

function ExecutionGraphPreview({ orchestrator, agents, pipeline }: {
  orchestrator: AgentProposal;
  agents: AgentProposal[];
  pipeline: PipelineDefinition;
}) {
  const tiers = pipeline.executionGraph && pipeline.executionGraph.length > 0
    ? pipeline.executionGraph
    : pipeline.parallelGroups && pipeline.parallelGroups.length > 0
      ? pipeline.parallelGroups.map((group, i) => ({ stage: i, agents: group, waitForAll: true }))
      : null;

  if (!tiers || tiers.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-0 w-full" data-testid="execution-graph-preview">
      {tiers.map((tier, tierIdx) => {
        const isParallel = tier.agents.length > 1;
        return (
          <div key={tierIdx} className="flex flex-col items-center gap-0 w-full">
            {tierIdx > 0 && (
              <>
                <div className="w-px h-3 bg-gradient-to-b from-primary/30 to-muted-foreground/20" />
                <ChevronDown className="w-3.5 h-3.5 text-primary/40 -mt-1 -mb-1" />
                <div className="w-px h-2 bg-muted-foreground/20" />
                {tier.waitForAll && tierIdx > 0 && (
                  <span className="text-[8px] text-muted-foreground/60 mb-1">wait for all</span>
                )}
              </>
            )}
            {isParallel ? (
              <div className="relative w-full max-w-2xl">
                <div className="border border-dashed border-primary/20 rounded-lg p-3 bg-primary/[0.02]">
                  <div className="flex items-center justify-center gap-1 mb-2">
                    <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 text-primary border-primary/20" data-testid={`badge-parallel-tier-${tierIdx}`}>
                      Stage {tierIdx + 1} · Parallel
                    </Badge>
                  </div>
                  <div className="flex items-start justify-center gap-3 flex-wrap">
                    {tier.agents.map((agentRole, aIdx) => {
                      const matchedAgent = agents.find(a => a.role === agentRole || a.name === agentRole);
                      return (
                        <div key={aIdx} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card shadow-sm" data-testid={`exec-graph-node-${tierIdx}-${aIdx}`}>
                          <div className="w-5 h-5 rounded-md bg-violet-500/10 flex items-center justify-center">
                            <Bot className="w-3 h-3 text-violet-500" />
                          </div>
                          <span className="text-[11px] font-medium">{matchedAgent?.name || agentRole}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card shadow-sm" data-testid={`exec-graph-node-${tierIdx}-0`}>
                <div className="w-5 h-5 rounded-md bg-violet-500/10 flex items-center justify-center">
                  <Bot className="w-3 h-3 text-violet-500" />
                </div>
                <span className="text-[11px] font-medium">
                  {(() => {
                    const agentRole = tier.agents[0];
                    const matchedAgent = agents.find(a => a.role === agentRole || a.name === agentRole);
                    return matchedAgent?.name || agentRole;
                  })()}
                </span>
                <Badge variant="secondary" className="text-[8px] px-1.5">Stage {tierIdx + 1}</Badge>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PipelineVisualization({ orchestrator, agents, pipeline }: {
  orchestrator: AgentProposal;
  agents: AgentProposal[];
  pipeline: PipelineDefinition | null;
}) {
  const patternInfo = PATTERN_LABELS[pipeline?.pattern || "supervisor"] || PATTERN_LABELS.supervisor;
  const totalTools = agents.reduce((sum, a) => sum + (a.tools?.length || 0) + (a.mcpToolBindings?.length || 0), 0) + (orchestrator.tools?.length || 0) + (orchestrator.mcpToolBindings?.length || 0);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [dependencyMatrixOpen, setDependencyMatrixOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);

  const hasExecutionTiers = pipeline && (
    (pipeline.executionGraph && pipeline.executionGraph.length > 0) ||
    (pipeline.parallelGroups && pipeline.parallelGroups.length > 0)
  );

  return (
    <Card className="border-primary/20 overflow-hidden" data-testid="card-pipeline-visualization">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-violet-500/[0.02]" />
        <CardContent className="relative p-5 flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Network className="w-4 h-4 text-primary" />
              </div>
              <div>
                <span className="text-sm font-semibold">Orchestration Pipeline</span>
                <p className="text-[11px] text-muted-foreground">{pipeline?.description || patternInfo.description}</p>
              </div>
            </div>
            <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20 px-2.5 py-0.5" variant="outline" data-testid="badge-pipeline-pattern">
              {patternInfo.label}
            </Badge>
          </div>

          {pipeline?.patternReasoning && (
            <div className="rounded-lg border border-border/60 bg-muted/20" data-testid="section-pattern-reasoning">
              <button
                type="button"
                onClick={() => setReasoningOpen(!reasoningOpen)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors rounded-lg"
                data-testid="button-toggle-pattern-reasoning"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-[11px] font-medium flex-1">Why this pattern?</span>
                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${reasoningOpen ? "rotate-180" : ""}`} />
              </button>
              {reasoningOpen && (
                <div className="px-3 pb-3 pt-0">
                  <p className="text-[11px] text-muted-foreground leading-relaxed" data-testid="text-pattern-reasoning">
                    {pipeline.patternReasoning}
                  </p>
                </div>
              )}
            </div>
          )}

          {pipeline?.agentDependencyMatrix && pipeline.agentDependencyMatrix.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-muted/20" data-testid="section-dependency-matrix">
              <button
                type="button"
                onClick={() => setDependencyMatrixOpen(!dependencyMatrixOpen)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors rounded-lg"
                data-testid="button-toggle-dependency-matrix"
              >
                <GitBranch className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="text-[11px] font-medium flex-1">Agent Dependency Matrix</span>
                <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-blue-500/20 text-blue-500">{pipeline.agentDependencyMatrix.length} agents</Badge>
                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${dependencyMatrixOpen ? "rotate-180" : ""}`} />
              </button>
              {dependencyMatrixOpen && (
                <div className="px-3 pb-3 pt-0 space-y-2">
                  {pipeline.agentDependencyMatrix.map((entry, idx) => (
                    <div key={idx} className="rounded-md border border-border/40 bg-background/50 p-2.5" data-testid={`dependency-entry-${idx}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Bot className="w-3 h-3 text-violet-500 shrink-0" />
                        <span className="text-[11px] font-semibold">{entry.agent}</span>
                        {entry.dependsOn.length > 0 && (
                          <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-amber-500/20 text-amber-500">
                            depends on {entry.dependsOn.length}
                          </Badge>
                        )}
                        {entry.dependsOn.length === 0 && (
                          <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-emerald-500/20 text-emerald-500">
                            independent
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 ml-5">
                        <div>
                          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Inputs</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {entry.inputs.map((inp, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">{inp}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Outputs</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {entry.outputs.map((out, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">{out}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      {entry.dependsOn.length > 0 && (
                        <div className="ml-5 mt-1.5">
                          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Depends On</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {entry.dependsOn.map((dep, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">{dep}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {pipeline?.systemsExtracted && pipeline.systemsExtracted.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-muted/20" data-testid="section-required-integrations">
              <button
                type="button"
                onClick={() => setIntegrationsOpen(!integrationsOpen)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors rounded-lg"
                data-testid="button-toggle-integrations"
              >
                <Database className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                <span className="text-[11px] font-medium flex-1">System Integrations</span>
                {(() => {
                  const orchestrationSystems = pipeline.systemsExtracted.filter(s => !s.systemRole || s.systemRole === "orchestration_system");
                  const gaps = pipeline.mcpGaps?.length || 0;
                  const covered = orchestrationSystems.filter(s => s.mcpCoverage === "covered").length;
                  const targetCount = pipeline.systemsExtracted.filter(s => s.systemRole === "target_system").length;
                  return (
                    <div className="flex items-center gap-1.5">
                      {covered > 0 && (
                        <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-emerald-500/20 text-emerald-500">{covered} covered</Badge>
                      )}
                      {gaps > 0 && (
                        <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-red-500/20 text-red-500">{gaps} need MCP</Badge>
                      )}
                      {targetCount > 0 && (
                        <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-slate-400/20 text-slate-400">{targetCount} targets</Badge>
                      )}
                    </div>
                  );
                })()}
                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${integrationsOpen ? "rotate-180" : ""}`} />
              </button>
              {integrationsOpen && (
                <div className="px-3 pb-3 pt-0 space-y-1.5">
                  {pipeline.systemsExtracted.filter(s => !s.systemRole || s.systemRole === "orchestration_system").map((sys, idx) => {
                    const gap = pipeline.mcpGaps?.find(g => g.system === sys.name);
                    const isTarget = false;
                    return (
                      <div key={idx} className="rounded-md border p-2.5 border-border/40 bg-background/50" data-testid={`integration-entry-${idx}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Database className={`w-3 h-3 shrink-0 ${isTarget ? "text-muted-foreground" : "text-cyan-500"}`} />
                          <span className={`text-[11px] font-semibold flex-1 ${isTarget ? "text-muted-foreground" : ""}`}>{sys.name}</span>
                          {isTarget && (
                            <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-slate-400/20 text-slate-400">Target Resource</Badge>
                          )}
                          {!isTarget && sys.mcpCoverage === "covered" && (
                            <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-emerald-500/20 text-emerald-500">
                              <CheckCircle className="w-2.5 h-2.5 mr-0.5" /> Covered
                            </Badge>
                          )}
                          {!isTarget && sys.mcpCoverage === "partial" && (
                            <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-amber-500/20 text-amber-500">
                              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> Partial
                            </Badge>
                          )}
                          {!isTarget && sys.mcpCoverage === "missing" && (
                            <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-red-500/20 text-red-500">
                              <AlertOctagon className="w-2.5 h-2.5 mr-0.5" /> MCP Required
                            </Badge>
                          )}
                          {!isTarget && gap?.priority && (
                            <Badge variant="outline" className={`text-[8px] px-1.5 py-0 h-4 ${gap.priority === "critical" ? "border-red-500/20 text-red-500" : gap.priority === "high" ? "border-amber-500/20 text-amber-500" : "border-blue-500/20 text-blue-500"}`}>
                              {gap.priority}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground ml-5 mb-1">{sys.purpose}</p>
                        {!isTarget && sys.existingMcpServer && (
                          <div className="ml-5 mb-1">
                            <span className="text-[9px] text-muted-foreground">MCP Server: </span>
                            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">{sys.existingMcpServer}</span>
                          </div>
                        )}
                        {!isTarget && sys.requiredCapabilities.length > 0 && (
                          <div className="ml-5 mt-1">
                            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Required Capabilities</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {sys.requiredCapabilities.map((cap, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">{cap}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {!isTarget && gap && gap.missingCapabilities.length > 0 && (
                          <div className="ml-5 mt-1.5 rounded bg-red-500/5 border border-red-500/10 p-2">
                            <span className="text-[9px] text-red-500 uppercase tracking-wider font-medium">Missing — New MCP Server Needed</span>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              Suggested: <span className="font-medium text-foreground">{gap.suggestedMcpServerName}</span>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {gap.missingCapabilities.map((mc, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400">{mc}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col items-center gap-0 py-2" data-testid="pipeline-flow-diagram">
            <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl border-2 border-primary/30 bg-gradient-to-r from-primary/[0.08] to-violet-500/5 shadow-sm shadow-primary/5" data-testid="pipeline-node-orchestrator">
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                <Network className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-primary leading-tight">{orchestrator.name}</span>
                <span className="text-[9px] text-primary/60">Team Agent · Coordinator</span>
              </div>
            </div>

            <div className="w-px h-4 bg-gradient-to-b from-primary/30 to-muted-foreground/20" />
            <ChevronDown className="w-3.5 h-3.5 text-primary/40 -mt-1 -mb-1" />
            <div className="w-px h-2 bg-muted-foreground/20" />

            {hasExecutionTiers ? (
              <ExecutionGraphPreview orchestrator={orchestrator} agents={agents} pipeline={pipeline!} />
            ) : pipeline?.pattern === "sequential" ? (
              <div className="flex flex-col items-center gap-0">
                {agents.map((agent, i) => (
                  <div key={i} className="flex flex-col items-center gap-0">
                    {i > 0 && (
                      <>
                        <div className="w-px h-4 bg-gradient-to-b from-primary/30 to-muted-foreground/20" />
                        <ChevronDown className="w-3.5 h-3.5 text-primary/40 -mt-1 -mb-1" />
                        <div className="w-px h-2 bg-muted-foreground/20" />
                      </>
                    )}
                    {pipeline!.edges.find(e => e.to === agent.name)?.label && (
                      <span className="text-[9px] text-muted-foreground italic mb-1 hidden sm:block">
                        {pipeline!.edges.find(e => e.to === agent.name)?.label}
                      </span>
                    )}
                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:border-primary/20 transition-colors shadow-sm" data-testid={`pipeline-node-worker-${i}`}>
                      <div className="w-6 h-6 rounded-md bg-violet-500/10 flex items-center justify-center">
                        <Bot className="w-3 h-3 text-violet-500" />
                      </div>
                      <span className="text-xs font-medium">{agent.name}</span>
                      <Badge variant="secondary" className="text-[8px] px-1.5">Step {i + 1}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-0 w-full">
                <div className="relative w-full max-w-2xl">
                  <div className="absolute left-1/2 -translate-x-1/2 top-0 w-[80%] h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                  <div className="flex items-start justify-center gap-3 flex-wrap px-4 pt-3">
                    {agents.map((agent, i) => {
                      const edgeLabel = pipeline?.edges.find(e => e.to === agent.name)?.label;
                      return (
                        <div key={i} className="flex flex-col items-center gap-1.5">
                          <div className="w-px h-2 bg-primary/15" />
                          {edgeLabel && (
                            <span className="text-[9px] text-muted-foreground italic text-center max-w-[120px] truncate hidden sm:block">{edgeLabel}</span>
                          )}
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:border-primary/20 transition-colors shadow-sm" data-testid={`pipeline-node-worker-${i}`}>
                            <div className="w-6 h-6 rounded-md bg-violet-500/10 flex items-center justify-center">
                              <Bot className="w-3 h-3 text-violet-500" />
                            </div>
                            <span className="text-xs font-medium">{agent.name}</span>
                            <Badge variant="secondary" className="text-[8px] px-1.5">W{i + 1}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {(pipeline?.pattern === "fan_out_fan_in") && (
                  <div className="flex flex-col items-center gap-0 mt-3">
                    <div className="w-px h-3 bg-muted-foreground/20" />
                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg border border-dashed border-primary/30 bg-primary/5">
                      <ArrowRight className="w-3 h-3 text-primary" />
                      <span className="text-[10px] text-primary font-medium">Aggregate Results</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/50">
              <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground">Agents</span>
                <span className="text-xs font-semibold">{agents.length + 1}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/50">
              <Wrench className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground">Tools</span>
                <span className="text-xs font-semibold">{totalTools}</span>
              </div>
            </div>
            {pipeline && (
              <>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/50">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] text-muted-foreground">Errors</span>
                    <span className="text-[11px] font-medium truncate">{pipeline.errorHandling}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/50">
                  <Workflow className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] text-muted-foreground">Handoff</span>
                    <span className="text-[11px] font-medium truncate">{pipeline.handoffRules}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

function CollapsibleSection({ title, icon, defaultOpen = false, count, testId, children }: {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
  testId?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-md overflow-hidden" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
        data-testid={testId ? `${testId}-toggle` : undefined}
      >
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex-1">{title}</span>
        {count !== undefined && count > 0 && (
          <Badge variant="secondary" className="text-[9px] h-4 px-1">{count}</Badge>
        )}
        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1">
          {children}
        </div>
      )}
    </div>
  );
}

function KnowledgeBaseSelector({ selectedKbs, onChange, testIdPrefix }: {
  selectedKbs: Array<{ id: string; name: string }>;
  onChange: (kbs: Array<{ id: string; name: string }>) => void;
  testIdPrefix: string;
}) {
  const { data: allKbs } = useQuery<Array<{ id: number; name: string; description: string }>>({
    queryKey: ["/api/knowledge-bases"],
  });
  const [showDropdown, setShowDropdown] = useState(false);
  const [kbSearch, setKbSearch] = useState("");

  const availableKbs = (allKbs || []).filter(
    kb => !selectedKbs.some(s => String(s.id) === String(kb.id))
  );
  const filteredKbs = availableKbs.filter(
    kb => kb.name.toLowerCase().includes(kbSearch.toLowerCase()) ||
      (kb.description || "").toLowerCase().includes(kbSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[10px]">Knowledge Bases</Label>
      <div className="flex flex-wrap gap-1">
        {selectedKbs.map((kb, j) => (
          <Badge key={j} variant="outline" className="text-[9px] text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 flex items-center gap-1" data-testid={`badge-kb-${testIdPrefix}-${j}`}>
            <Database className="w-2.5 h-2.5" />
            {kb.name}
            <button onClick={() => onChange(selectedKbs.filter((_, i) => i !== j))} className="hover:text-destructive" data-testid={`button-remove-kb-${testIdPrefix}-${j}`}><X className="w-2.5 h-2.5" /></button>
          </Badge>
        ))}
        {selectedKbs.length === 0 && (
          <span className="text-[10px] text-muted-foreground italic">No knowledge bases linked</span>
        )}
      </div>
      <div className="relative">
        <div className="flex items-center gap-1">
          <Input
            value={kbSearch}
            onChange={e => { setKbSearch(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Search knowledge bases..."
            className="h-7 text-xs flex-1"
            data-testid={`input-kb-search-${testIdPrefix}`}
          />
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowDropdown(!showDropdown)} data-testid={`button-toggle-kb-${testIdPrefix}`}>
            <Database className="w-3 h-3 mr-1" />Add
          </Button>
        </div>
        {showDropdown && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-32 overflow-y-auto">
            {filteredKbs.length === 0 ? (
              <div className="p-2 text-[10px] text-muted-foreground text-center">
                {availableKbs.length === 0 ? "All knowledge bases already added" : "No matches"}
              </div>
            ) : (
              filteredKbs.map(kb => (
                <button
                  key={kb.id}
                  className="w-full text-left px-2 py-1.5 hover:bg-accent flex items-center gap-2 text-xs"
                  data-testid={`kb-option-${testIdPrefix}-${kb.id}`}
                  onClick={() => {
                    onChange([...selectedKbs, { id: String(kb.id), name: kb.name }]);
                    setKbSearch("");
                    setShowDropdown(false);
                  }}
                >
                  <Database className="w-3 h-3 text-purple-500 flex-shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{kb.name}</span>
                    {kb.description && <span className="text-[9px] text-muted-foreground truncate">{kb.description}</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BlueprintOverridePicker({ currentBlueprintId, currentBlueprintName, patternType, onSelect, testIdSuffix }: {
  currentBlueprintId: string | null;
  currentBlueprintName: string | null;
  patternType: string | null;
  onSelect: (bpId: string | null, bpName: string | null) => void;
  testIdSuffix: string;
}) {
  const { data: blueprints } = useQuery<any[]>({ queryKey: ["/api/blueprints"] });
  const [open, setOpen] = useState(false);

  const available = (blueprints || []).filter(
    (bp: any) => bp.isShared || bp.status === "signed" || bp.status === "compiled"
  );

  if (available.length === 0 && !currentBlueprintName) return null;

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border border-blue-500/20 bg-blue-500/5 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        data-testid={`button-blueprint-override-${testIdSuffix}`}
      >
        <Layers className="w-2.5 h-2.5" />
        {currentBlueprintName ? `BP: ${currentBlueprintName}` : "Assign Blueprint"}
        <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-1 w-56 rounded-md border bg-popover shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-1 max-h-48 overflow-y-auto">
            <button
              className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted ${!currentBlueprintId ? "bg-muted font-medium" : ""}`}
              onClick={() => { onSelect(null, null); setOpen(false); }}
              data-testid={`option-blueprint-none-${testIdSuffix}`}
            >
              No blueprint (auto-generate)
            </button>
            {available.map((bp: any) => (
              <button
                key={bp.id}
                className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted ${currentBlueprintId === bp.id ? "bg-muted font-medium" : ""}`}
                onClick={() => { onSelect(bp.id, bp.name); setOpen(false); }}
                data-testid={`option-blueprint-${bp.id}-${testIdSuffix}`}
              >
                {bp.name}
                {bp.patternType && <span className="text-muted-foreground ml-1">({bp.patternType.replace(/_/g, " ")})</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentProposalCard({ agent, index, isOrchestrator, isSelected, onToggle, isCreating, onEdit, onDelete, onDuplicate, isDragging, onDragStart, onDragOver, onDrop }: {
  agent: AgentProposal;
  index: number;
  isOrchestrator: boolean;
  isSelected: boolean;
  onToggle: () => void;
  isCreating: boolean;
  onEdit?: (updated: AgentProposal) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editData, setEditData] = useState<AgentProposal>({ ...agent });
  const [newToolName, setNewToolName] = useState("");
  const [newToolDesc, setNewToolDesc] = useState("");
  const [newStep, setNewStep] = useState("");
  const [newKpi, setNewKpi] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setEditData({ ...agent });
  }, [agent]);

  function saveEdit() {
    if (onEdit) onEdit(editData);
    setExpanded(false);
  }

  function cancelEdit() {
    setEditData({ ...agent });
    setExpanded(false);
  }

  function addTool() {
    if (!newToolName.trim()) return;
    setEditData(prev => ({
      ...prev,
      tools: [...prev.tools, { name: newToolName.trim(), description: newToolDesc.trim() || newToolName.trim() }]
    }));
    setNewToolName("");
    setNewToolDesc("");
  }

  function removeTool(idx: number) {
    setEditData(prev => ({ ...prev, tools: prev.tools.filter((_, i) => i !== idx) }));
  }

  function addStep() {
    if (!newStep.trim()) return;
    setEditData(prev => ({ ...prev, workflowSteps: [...prev.workflowSteps, newStep.trim()] }));
    setNewStep("");
  }

  function removeStep(idx: number) {
    setEditData(prev => ({ ...prev, workflowSteps: prev.workflowSteps.filter((_, i) => i !== idx) }));
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= editData.workflowSteps.length) return;
    const steps = [...editData.workflowSteps];
    [steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]];
    setEditData(prev => ({ ...prev, workflowSteps: steps }));
  }

  function addKpiBinding() {
    if (!newKpi.trim()) return;
    setEditData(prev => ({ ...prev, kpiBindings: [...prev.kpiBindings, newKpi.trim()] }));
    setNewKpi("");
  }

  function removeKpiBinding(idx: number) {
    setEditData(prev => ({ ...prev, kpiBindings: prev.kpiBindings.filter((_, i) => i !== idx) }));
  }

  const riskColors = {
    LOW: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20", icon: "text-emerald-500" },
    MEDIUM: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20", icon: "text-amber-500" },
    HIGH: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/20", icon: "text-red-500" },
  };
  const risk = riskColors[agent.riskTier as keyof typeof riskColors] || riskColors.MEDIUM;

  return (
    <Card
      className={`transition-all duration-200 ${isOrchestrator ? "border-primary/25" : ""} ${isSelected ? "ring-1 ring-primary/40 shadow-sm" : "opacity-60"} ${isDragging ? "opacity-30 scale-95" : ""} hover:shadow-md`}
      data-testid={isOrchestrator ? "card-orchestrator-proposal" : `card-agent-proposal-${index}`}
      draggable={!isOrchestrator && !!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
          {!isOrchestrator && onDragStart && (
            <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab shrink-0" data-testid={`drag-handle-${index}`} />
          )}
          <button
            type="button"
            onClick={onToggle}
            className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
              isSelected
                ? "bg-primary border-primary text-primary-foreground"
                : "border-muted-foreground/30 bg-background hover:border-primary/50"
            }`}
            data-testid={isOrchestrator ? "checkbox-orchestrator" : `checkbox-agent-${index}`}
          >
            {isSelected && <CheckCircle className="w-3.5 h-3.5" />}
          </button>
          <div className={`w-7 h-7 rounded-lg ${isOrchestrator ? "bg-primary/10" : risk.bg} flex items-center justify-center shrink-0`}>
            {isOrchestrator ? <Network className="w-3.5 h-3.5 text-primary" /> : <Bot className={`w-3.5 h-3.5 ${risk.icon}`} />}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="truncate text-sm font-semibold leading-tight">{agent.name}</span>
            <span className="text-[10px] text-muted-foreground truncate">{agent.role}</span>
          </div>
          {isOrchestrator && (
            <Badge className="text-[9px] bg-primary/15 text-primary border-primary/20" variant="outline">Team Agent</Badge>
          )}
          {!isOrchestrator && (
            <Badge variant="secondary" className="text-[9px]">Worker {index + 1}</Badge>
          )}
          <div className="flex items-center gap-0.5 ml-auto">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpanded(!expanded)} data-testid={`button-edit-agent-${isOrchestrator ? "orch" : index}`}>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            </Button>
            {onDuplicate && (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onDuplicate} data-testid={`button-duplicate-agent-${index}`}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)} data-testid={`button-delete-agent-${isOrchestrator ? "orch" : index}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex flex-col gap-2.5">
        {!expanded ? (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed">{agent.description}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className={`text-[10px] ${risk.text} ${risk.border}`}>{agent.riskTier} Risk</Badge>
              <Badge variant="outline" className="text-[10px]">{agent.autonomyMode}</Badge>
              <Badge variant="outline" className="text-[10px] text-muted-foreground">{agent.modelProvider}/{agent.modelName}</Badge>
              {agent.templateMatch && (
                <Badge variant="secondary" className="text-[10px]">Template: {agent.templateMatch}</Badge>
              )}
              {agent.suggestedPatternType && (
                <Badge variant="outline" className="text-[10px] text-violet-600 dark:text-violet-400 border-violet-500/20 bg-violet-500/5" data-testid={`badge-pattern-${isOrchestrator ? "orch" : index}`}>
                  <Layers className="w-2.5 h-2.5 mr-0.5" />
                  {agent.suggestedPatternType.replace(/_/g, " ")}
                </Badge>
              )}
              {(agent.suggestedBlueprintName || agent.suggestedPatternType) && (
                <BlueprintOverridePicker
                  currentBlueprintId={agent.suggestedBlueprintId || null}
                  currentBlueprintName={agent.suggestedBlueprintName || null}
                  patternType={agent.suggestedPatternType || null}
                  onSelect={(bpId, bpName) => {
                    if (onEdit) {
                      onEdit({ ...agent, suggestedBlueprintId: bpId, suggestedBlueprintName: bpName });
                    }
                  }}
                  testIdSuffix={isOrchestrator ? "orch" : String(index)}
                />
              )}
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-500/5 to-green-500/5 border border-emerald-500/15" data-testid={`estimated-impact-${isOrchestrator ? "orch" : index}`}>
              <div className="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-3 h-3 text-emerald-500" />
              </div>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-snug">{agent.estimatedImpact}</span>
            </div>
            <CollapsibleSection title="Role & Workflow" icon={<Workflow className="w-3 h-3" />} defaultOpen={false} count={agent.workflowSteps?.length || 0} testId={`section-workflow-${isOrchestrator ? "orch" : index}`}>
              <div className="flex flex-col gap-2">
                <span className="text-xs">{agent.role}</span>
                <div className="flex items-center gap-1 flex-wrap">
                  {(agent.workflowSteps || []).map((step, j) => (
                    <span key={j} className="flex items-center gap-0.5">
                      {j > 0 && <ChevronRight className="w-2.5 h-2.5 text-muted-foreground" />}
                      <Badge variant="secondary" className="text-[9px]">{step}</Badge>
                    </span>
                  ))}
                </div>
              </div>
            </CollapsibleSection>
            {((agent.tools?.length || 0) > 0 || (agent.mcpToolBindings && agent.mcpToolBindings.length > 0)) && (
              <CollapsibleSection title="Tools & MCP Bindings" icon={<Wrench className="w-3 h-3" />} defaultOpen={false} count={(agent.tools?.length || 0) + (agent.mcpToolBindings?.length || 0)} testId={`section-tools-${isOrchestrator ? "orch" : index}`}>
                <div className="flex flex-col gap-2">
                  {(agent.tools?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {agent.tools.map((tool, j) => (
                        <Badge key={j} variant="outline" className="text-[9px]">{tool.name}</Badge>
                      ))}
                    </div>
                  )}
                  {(agent.mcpToolBindings && agent.mcpToolBindings.length > 0) && (
                    <div className="flex flex-wrap gap-1" data-testid={`enrichment-mcp-${isOrchestrator ? "orch" : index}`}>
                      {agent.mcpToolBindings.map((binding, j) => (
                        <Badge key={j} variant="outline" className="text-[9px] text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800">{binding.server}: {binding.tool}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            )}
            {(agent.kpiBindings?.length || 0) > 0 && (
              <CollapsibleSection title="KPI Bindings" icon={<BarChart3 className="w-3 h-3" />} defaultOpen={false} count={agent.kpiBindings?.length || 0} testId={`section-kpi-${isOrchestrator ? "orch" : index}`}>
                <div className="flex flex-wrap gap-1">
                  {(agent.kpiBindings || []).map((kpi, j) => (
                    <Badge key={j} variant="outline" className="text-[9px] text-green-600 dark:text-green-400 border-green-200 dark:border-green-800">{kpi}</Badge>
                  ))}
                </div>
              </CollapsibleSection>
            )}
            {((agent.matchedSkills && agent.matchedSkills.length > 0) || (agent.matchedOntologyConcepts && agent.matchedOntologyConcepts.length > 0) || (agent.policyConstraints && agent.policyConstraints.length > 0) || (agent.complianceTags && agent.complianceTags.length > 0) || agent.suggestedRagPipeline || (agent.suggestedKnowledgeBases && agent.suggestedKnowledgeBases.length > 0)) && (
              <CollapsibleSection title="Platform Intelligence" icon={<Brain className="w-3 h-3" />} defaultOpen={false} count={(agent.matchedSkills?.length || 0) + (agent.matchedOntologyConcepts?.length || 0) + (agent.policyConstraints?.length || 0) + (agent.complianceTags?.length || 0) + (agent.suggestedRagPipeline ? 1 : 0) + (agent.suggestedKnowledgeBases?.length || 0)} testId={`section-intelligence-${isOrchestrator ? "orch" : index}`}>
                <div className="flex flex-col gap-2">
                  {(agent.matchedSkills && agent.matchedSkills.length > 0) && (
                    <div className="flex flex-col gap-1" data-testid={`enrichment-skills-${isOrchestrator ? "orch" : index}`}>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Skills</span>
                      <div className="flex flex-wrap gap-1">
                        {agent.matchedSkills.map((skill, j) => (
                          <Badge key={j} variant="outline" className="text-[9px] text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800">{skill}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {(agent.matchedOntologyConcepts && agent.matchedOntologyConcepts.length > 0) && (
                    <div className="flex flex-col gap-1" data-testid={`enrichment-ontology-${isOrchestrator ? "orch" : index}`}>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Ontology Concepts</span>
                      <div className="flex flex-wrap gap-1">
                        {agent.matchedOntologyConcepts.map((concept, j) => (
                          <Badge key={j} variant="outline" className="text-[9px] text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800">{concept}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {(agent.policyConstraints && agent.policyConstraints.length > 0) && (
                    <div className="flex flex-col gap-1" data-testid={`enrichment-policies-${isOrchestrator ? "orch" : index}`}>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Policy Constraints</span>
                      <div className="flex flex-wrap gap-1">
                        {agent.policyConstraints.map((policy, j) => (
                          <Badge key={j} variant="outline" className="text-[9px] text-red-600 dark:text-red-400 border-red-200 dark:border-red-800">{policy}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {(agent.complianceTags && agent.complianceTags.length > 0) && (
                    <div className="flex flex-col gap-1" data-testid={`enrichment-compliance-${isOrchestrator ? "orch" : index}`}>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Compliance</span>
                      <div className="flex flex-wrap gap-1">
                        {agent.complianceTags.map((tag, j) => (
                          <Badge key={j} variant="outline" className="text-[9px] text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {agent.suggestedRagPipeline && (
                    <div className="flex flex-col gap-1" data-testid={`enrichment-rag-${isOrchestrator ? "orch" : index}`}>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">RAG Pipeline</span>
                      <Badge variant="outline" className="text-[9px] text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 w-fit">{agent.suggestedRagPipeline}</Badge>
                    </div>
                  )}
                  {agent.suggestedKnowledgeBases && agent.suggestedKnowledgeBases.length > 0 && (
                    <div className="flex flex-col gap-1" data-testid={`enrichment-kb-${isOrchestrator ? "orch" : index}`}>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Knowledge Bases</span>
                      <div className="flex flex-wrap gap-1">
                        {agent.suggestedKnowledgeBases.map((kb, j) => (
                          <Badge key={j} variant="outline" className="text-[9px] text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">{kb.name}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            )}
            {(agent as any).outputSchema && (agent as any).outputSchema.type === "record_list" && (
              <CollapsibleSection title="Structured Output Schema" icon={<Table2 className="w-3 h-3" />} defaultOpen={false} count={(agent as any).outputSchema.fields?.length || 0} testId={`section-output-schema-${isOrchestrator ? "orch" : index}`}>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20">{(agent as any).outputSchema.type}</Badge>
                    <span className="text-[10px] text-muted-foreground">{(agent as any).outputSchema.description}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Output Fields</span>
                    <div className="flex flex-wrap gap-1">
                      {((agent as any).outputSchema.fields || []).map((f: any, j: number) => (
                        <Badge key={j} variant="outline" className="text-[9px]" title={`${f.type}: ${f.description}`}>
                          {f.name} <span className="text-muted-foreground ml-0.5">({f.type})</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">The runtime will render per-record results as an interactive data table in the trace viewer.</p>
                </div>
              </CollapsibleSection>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3 border-t pt-3" data-testid={`edit-panel-agent-${isOrchestrator ? "orch" : index}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px]">Name</Label>
                <Input value={editData.name} onChange={e => setEditData(prev => ({ ...prev, name: e.target.value }))} className="h-8 text-xs" data-testid="input-agent-name" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px]">Role</Label>
                <Input value={editData.role} onChange={e => setEditData(prev => ({ ...prev, role: e.target.value }))} className="h-8 text-xs" data-testid="input-agent-role" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px]">Description</Label>
              <Textarea value={editData.description} onChange={e => setEditData(prev => ({ ...prev, description: e.target.value }))} className="text-xs min-h-[60px]" data-testid="input-agent-description" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px]">Risk Tier</Label>
                <Select value={editData.riskTier} onValueChange={v => setEditData(prev => ({ ...prev, riskTier: v }))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-risk-tier"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">LOW</SelectItem>
                    <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                    <SelectItem value="HIGH">HIGH</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px]">Autonomy</Label>
                <Select value={editData.autonomyMode} onValueChange={v => setEditData(prev => ({ ...prev, autonomyMode: v }))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-autonomy"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="assisted">Assisted</SelectItem>
                    <SelectItem value="autonomous">Autonomous</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px]">Provider</Label>
                <Select value={editData.modelProvider} onValueChange={v => setEditData(prev => ({ ...prev, modelProvider: v }))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-model-provider"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px]">Model</Label>
                <Input value={editData.modelName} onChange={e => setEditData(prev => ({ ...prev, modelName: e.target.value }))} className="h-8 text-xs" data-testid="input-model-name" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px]">Estimated Impact</Label>
              <Input value={editData.estimatedImpact} onChange={e => setEditData(prev => ({ ...prev, estimatedImpact: e.target.value }))} className="h-8 text-xs" data-testid="input-estimated-impact" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px]">Workflow Steps</Label>
              <div className="flex flex-col gap-1">
                {editData.workflowSteps.map((step, j) => (
                  <div key={j} className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground w-4 text-center">{j + 1}</span>
                    <Badge variant="secondary" className="text-[9px] flex-1">{step}</Badge>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => moveStep(j, -1)} disabled={j === 0}><ChevronUp className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => moveStep(j, 1)} disabled={j === editData.workflowSteps.length - 1}><ChevronDown className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive" onClick={() => removeStep(j)}><X className="w-3 h-3" /></Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Input value={newStep} onChange={e => setNewStep(e.target.value)} placeholder="Add workflow step..." className="h-7 text-xs flex-1" onKeyDown={e => e.key === "Enter" && addStep()} data-testid="input-add-step" />
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addStep} data-testid="button-add-step"><Plus className="w-3 h-3 mr-1" />Add</Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px]">Tools</Label>
              <div className="flex flex-wrap gap-1">
                {editData.tools.map((tool, j) => (
                  <Badge key={j} variant="outline" className="text-[9px] flex items-center gap-1">
                    {tool.name}
                    <button onClick={() => removeTool(j)} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Input value={newToolName} onChange={e => setNewToolName(e.target.value)} placeholder="Tool name" className="h-7 text-xs flex-1" data-testid="input-tool-name" />
                <Input value={newToolDesc} onChange={e => setNewToolDesc(e.target.value)} placeholder="Description" className="h-7 text-xs flex-1" data-testid="input-tool-desc" />
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addTool} data-testid="button-add-tool"><Plus className="w-3 h-3 mr-1" />Add</Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px]">KPI Bindings</Label>
              <div className="flex flex-wrap gap-1">
                {editData.kpiBindings.map((kpi, j) => (
                  <Badge key={j} variant="outline" className="text-[9px] text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 flex items-center gap-1">
                    {kpi}
                    <button onClick={() => removeKpiBinding(j)} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Input value={newKpi} onChange={e => setNewKpi(e.target.value)} placeholder="KPI name" className="h-7 text-xs flex-1" onKeyDown={e => e.key === "Enter" && addKpiBinding()} data-testid="input-add-kpi" />
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addKpiBinding} data-testid="button-add-kpi"><Plus className="w-3 h-3 mr-1" />Add</Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px]">System Prompt</Label>
              <Textarea
                value={editData.systemPrompt || ""}
                onChange={e => setEditData(prev => ({ ...prev, systemPrompt: e.target.value }))}
                placeholder="Custom system prompt for this agent (optional — auto-generated if left empty)"
                className="text-xs min-h-[60px]"
                data-testid="input-agent-system-prompt"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px]">Compliance Tags</Label>
              <div className="flex flex-wrap gap-1">
                {(editData.complianceTags || []).map((tag, j) => (
                  <Badge key={j} variant="outline" className="text-[9px] text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 flex items-center gap-1">
                    {tag}
                    <button onClick={() => setEditData(prev => ({ ...prev, complianceTags: (prev.complianceTags || []).filter((_, i) => i !== j) }))} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Input
                  placeholder="Add compliance tag..."
                  className="h-7 text-xs flex-1"
                  data-testid="input-add-compliance-tag"
                  onKeyDown={e => {
                    if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                      const val = (e.target as HTMLInputElement).value.trim();
                      setEditData(prev => ({ ...prev, complianceTags: [...(prev.complianceTags || []), val] }));
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
              </div>
            </div>

            <KnowledgeBaseSelector
              selectedKbs={editData.suggestedKnowledgeBases || []}
              onChange={(kbs) => setEditData(prev => ({ ...prev, suggestedKnowledgeBases: kbs }))}
              testIdPrefix={isOrchestrator ? "orch" : `worker-${index}`}
            />

            <div className="flex items-center gap-2 justify-end pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={cancelEdit} data-testid="button-cancel-edit">Cancel</Button>
              <Button size="sm" onClick={saveEdit} data-testid="button-save-edit"><Save className="w-3.5 h-3.5 mr-1.5" />Save Changes</Button>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Delete {agent.name}?</DialogTitle>
            <DialogDescription className="text-xs">This will remove this agent from the development plan. This action can be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={() => { setConfirmDelete(false); onDelete?.(); }} data-testid="button-confirm-delete">Delete Agent</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AddCustomAgentForm({ onAdd, onCancel }: { onAdd: (agent: AgentProposal) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [role, setRole] = useState("");
  const [riskTier, setRiskTier] = useState("MEDIUM");
  const [autonomyMode, setAutonomyMode] = useState("assisted");
  const [modelProvider, setModelProvider] = useState("openai");
  const [modelName, setModelName] = useState("gpt-4.1-mini");
  const [estimatedImpact, setEstimatedImpact] = useState("");

  function handleSubmit() {
    if (!name.trim() || !description.trim()) return;
    onAdd({
      name: name.trim(),
      description: description.trim(),
      role: role.trim() || name.trim(),
      riskTier,
      autonomyMode,
      modelProvider,
      modelName,
      workflowSteps: [],
      tools: [],
      kpiBindings: [],
      estimatedImpact: estimatedImpact.trim() || "Custom agent — impact to be determined",
      templateMatch: null,
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="form-add-custom-agent">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px]">Agent Name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Data Validator Agent" className="h-8 text-xs" data-testid="input-new-agent-name" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px]">Role</Label>
          <Input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Validates incoming data" className="h-8 text-xs" data-testid="input-new-agent-role" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-[10px]">Description *</Label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this agent do?" className="text-xs min-h-[60px]" data-testid="input-new-agent-description" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px]">Risk Tier</Label>
          <Select value={riskTier} onValueChange={setRiskTier}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="LOW">LOW</SelectItem>
              <SelectItem value="MEDIUM">MEDIUM</SelectItem>
              <SelectItem value="HIGH">HIGH</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px]">Autonomy</Label>
          <Select value={autonomyMode} onValueChange={setAutonomyMode}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="assisted">Assisted</SelectItem>
              <SelectItem value="autonomous">Autonomous</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px]">Provider</Label>
          <Select value={modelProvider} onValueChange={setModelProvider}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="google">Google</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px]">Model</Label>
          <Input value={modelName} onChange={e => setModelName(e.target.value)} className="h-8 text-xs" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-[10px]">Estimated Impact</Label>
        <Input value={estimatedImpact} onChange={e => setEstimatedImpact(e.target.value)} placeholder="e.g. Reduces data errors by 30%" className="h-8 text-xs" data-testid="input-new-agent-impact" />
      </div>
      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleSubmit} disabled={!name.trim() || !description.trim()} data-testid="button-submit-add-agent">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add to Plan
        </Button>
      </DialogFooter>
    </div>
  );
}

interface UndoState {
  proposals: AgentProposal[];
  orchestrator: AgentProposal | null;
  pipeline: PipelineDefinition | null;
  selectedIndices: number[];
  orchestratorSelected: boolean;
  label: string;
}

function AgentProposalsTab({ outcome, kpis, initialTemplateId }: { outcome: OutcomeContract; kpis: KpiDefinition[]; initialTemplateId?: string | null }) {
  const { toast } = useToast();
  const { industry, workspaceConfig, activeFrameworks, activeDepartments } = useIndustry();
  const agentPerm = usePermission("create_modify_blueprints");
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(initialTemplateId ?? null);
  const [proposals, setProposals] = useState<AgentProposal[]>([]);
  const [orchestrator, setOrchestrator] = useState<AgentProposal | null>(null);
  const [pipeline, setPipeline] = useState<PipelineDefinition | null>(null);
  const [generatingFresh, setGeneratingFresh] = useState(false);
  const [generatingWithFeedback, setGeneratingWithFeedback] = useState(false);
  const generating = generatingFresh || generatingWithFeedback;
  const [generated, setGenerated] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [orchestratorSelected, setOrchestratorSelected] = useState(true);
  const [creating, setCreating] = useState(false);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [undoStack, setUndoStack] = useState<UndoState[]>([]);
  const [redoStack, setRedoStack] = useState<UndoState[]>([]);

  function deepCloneAgent(p: AgentProposal): AgentProposal {
    return {
      ...p,
      tools: p.tools.map(t => ({ ...t })),
      workflowSteps: [...p.workflowSteps],
      kpiBindings: [...p.kpiBindings],
      complianceTags: [...(p.complianceTags || [])],
      matchedSkills: [...(p.matchedSkills || [])],
      matchedOntologyConcepts: [...(p.matchedOntologyConcepts || [])],
      policyConstraints: [...(p.policyConstraints || [])],
      mcpToolBindings: (p.mcpToolBindings || []).map(b => ({ ...b })),
      suggestedRagPipeline: p.suggestedRagPipeline || null,
      suggestedKnowledgeBases: (p.suggestedKnowledgeBases || []).map(kb => ({ ...kb })),
      systemPrompt: p.systemPrompt || "",
    };
  }

  const pushUndo = useCallback((label: string) => {
    setUndoStack(prev => [...prev.slice(-19), {
      proposals: proposals.map(deepCloneAgent),
      orchestrator: orchestrator ? deepCloneAgent(orchestrator) : null,
      pipeline: pipeline ? { ...pipeline, edges: pipeline.edges.map(e => ({ ...e })) } : null,
      selectedIndices: Array.from(selectedIndices),
      orchestratorSelected,
      label,
    }]);
    setRedoStack([]);
  }, [proposals, orchestrator, pipeline, selectedIndices, orchestratorSelected]);

  function undo() {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, {
      proposals: proposals.map(deepCloneAgent),
      orchestrator: orchestrator ? deepCloneAgent(orchestrator) : null,
      pipeline: pipeline ? { ...pipeline, edges: pipeline.edges.map(e => ({ ...e })) } : null,
      selectedIndices: Array.from(selectedIndices),
      orchestratorSelected,
      label: "redo",
    }]);
    setProposals(prev.proposals);
    setOrchestrator(prev.orchestrator);
    setPipeline(prev.pipeline);
    setSelectedIndices(new Set(prev.selectedIndices));
    setOrchestratorSelected(prev.orchestratorSelected);
    setUndoStack(s => s.slice(0, -1));
    setDirty(true);
    toast({ title: `Undid: ${prev.label}` });
  }

  function redo() {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(s => [...s, {
      proposals: proposals.map(deepCloneAgent),
      orchestrator: orchestrator ? deepCloneAgent(orchestrator) : null,
      pipeline: pipeline ? { ...pipeline, edges: pipeline.edges.map(e => ({ ...e })) } : null,
      selectedIndices: Array.from(selectedIndices),
      orchestratorSelected,
      label: "undo",
    }]);
    setProposals(next.proposals);
    setOrchestrator(next.orchestrator);
    setPipeline(next.pipeline);
    setSelectedIndices(new Set(next.selectedIndices));
    setOrchestratorSelected(next.orchestratorSelected);
    setRedoStack(s => s.slice(0, -1));
    setDirty(true);
    toast({ title: "Redo applied" });
  }

  function rebuildPipeline(workers: AgentProposal[], orch: AgentProposal | null, currentPipeline: PipelineDefinition | null) {
    if (!orch || !currentPipeline) return currentPipeline;
    const edges: PipelineEdge[] = [];
    if (currentPipeline.pattern === "sequential") {
      for (let i = 0; i < workers.length; i++) {
        edges.push({
          from: i === 0 ? orch.name : workers[i - 1].name,
          to: workers[i].name,
          label: i === 0 ? "dispatch" : "handoff",
          type: "sequential",
        });
      }
    } else {
      for (const w of workers) {
        edges.push({
          from: orch.name,
          to: w.name,
          label: "delegate",
          type: currentPipeline.pattern === "parallel" ? "parallel" : "conditional",
        });
      }
    }
    return { ...currentPipeline, edges };
  }

  const { data: savedProposal, isLoading: loadingSaved } = useQuery<any>({
    queryKey: ["/api/agent-proposals", outcome.id],
    queryFn: async () => {
      const res = await fetch(`/api/agent-proposals/${outcome.id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    loadedRef.current = null;
    setGenerated(false);
    setProposals([]);
    setOrchestrator(null);
    setPipeline(null);
    setProposalId(null);
    setLastSaved(null);
    setDirty(false);
    setUndoStack([]);
    setRedoStack([]);
  }, [outcome.id]);

  useEffect(() => {
    if (savedProposal && loadedRef.current !== savedProposal.id) {
      loadedRef.current = savedProposal.id;
      setProposals(savedProposal.workers || []);
      setOrchestrator(savedProposal.orchestrator || null);
      setPipeline(savedProposal.pipeline || null);
      setGenerated(true);
      setProposalId(savedProposal.id);
      setLastSaved(savedProposal.updatedAt || savedProposal.createdAt);
      const savedIndices = savedProposal.selectedIndices;
      if (Array.isArray(savedIndices)) {
        setSelectedIndices(new Set(savedIndices));
      } else {
        setSelectedIndices(new Set((savedProposal.workers || []).map((_: any, i: number) => i)));
      }
      setOrchestratorSelected(savedProposal.orchestratorSelected !== false);
      setDirty(false);
    }
  }, [savedProposal]);

  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });
  const outcomeReview = approvals?.find(
    (a) => a.type === "outcome_review" && a.objectId === outcome.id
  );
  const isPendingValidation = outcomeReview?.status === "pending";
  const isValidated = outcomeReview?.status === "approved";

  const isAwaitingPlan = outcome.status === "awaiting_agent_plan";

  const totalSelected = (orchestratorSelected && orchestrator ? 1 : 0) + selectedIndices.size;

  function toggleWorker(index: number) {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
        if (next.size === 0) {
          setOrchestratorSelected(false);
        }
      } else {
        next.add(index);
        if (orchestrator) {
          setOrchestratorSelected(true);
        }
      }
      return next;
    });
    setDirty(true);
  }

  function toggleOrchestrator() {
    if (orchestratorSelected && selectedIndices.size > 0) {
      return;
    }
    setOrchestratorSelected(!orchestratorSelected);
    setDirty(true);
  }

  function selectAll() {
    const all = new Set(proposals.map((_, i) => i));
    setSelectedIndices(all);
    if (orchestrator) setOrchestratorSelected(true);
    setDirty(true);
  }

  function deselectAll() {
    setSelectedIndices(new Set());
    setOrchestratorSelected(false);
    setDirty(true);
  }

  function editWorker(index: number, updated: AgentProposal) {
    pushUndo(`Edit ${proposals[index].name}`);
    const newProposals = [...proposals];
    newProposals[index] = updated;
    setProposals(newProposals);
    const newPipeline = rebuildPipeline(newProposals, orchestrator, pipeline);
    if (newPipeline) setPipeline(newPipeline);
    setDirty(true);
  }

  function editOrchestrator(updated: AgentProposal) {
    pushUndo(`Edit ${orchestrator?.name || "orchestrator"}`);
    setOrchestrator(updated);
    const newPipeline = rebuildPipeline(proposals, updated, pipeline);
    if (newPipeline) setPipeline(newPipeline);
    setDirty(true);
  }

  function deleteWorker(index: number) {
    pushUndo(`Delete ${proposals[index].name}`);
    const newProposals = proposals.filter((_, i) => i !== index);
    setProposals(newProposals);
    const newSelected = new Set<number>();
    selectedIndices.forEach(i => {
      if (i < index) newSelected.add(i);
      else if (i > index) newSelected.add(i - 1);
    });
    setSelectedIndices(newSelected);
    if (newSelected.size === 0) setOrchestratorSelected(false);
    const newPipeline = rebuildPipeline(newProposals, orchestrator, pipeline);
    if (newPipeline) setPipeline(newPipeline);
    setDirty(true);
    toast({ title: "Agent removed from plan" });
  }

  function deleteOrchestrator() {
    pushUndo(`Delete orchestrator ${orchestrator?.name || ""}`);
    setOrchestrator(null);
    setOrchestratorSelected(false);
    setPipeline(null);
    setDirty(true);
    toast({ title: "Orchestrator removed from plan" });
  }

  function duplicateWorker(index: number) {
    pushUndo(`Duplicate ${proposals[index].name}`);
    const source = proposals[index];
    const copy: AgentProposal = {
      ...source,
      name: `${source.name} (Copy)`,
      tools: [...source.tools],
      workflowSteps: [...source.workflowSteps],
      kpiBindings: [...source.kpiBindings],
    };
    const newProposals = [...proposals];
    newProposals.splice(index + 1, 0, copy);
    setProposals(newProposals);
    const newSelected = new Set<number>();
    selectedIndices.forEach(i => {
      if (i <= index) newSelected.add(i);
      else newSelected.add(i + 1);
    });
    newSelected.add(index + 1);
    setSelectedIndices(newSelected);
    const newPipeline = rebuildPipeline(newProposals, orchestrator, pipeline);
    if (newPipeline) setPipeline(newPipeline);
    setDirty(true);
    toast({ title: `Duplicated ${source.name}` });
  }

  function addCustomAgent(agent: AgentProposal) {
    pushUndo("Add custom agent");
    const newProposals = [...proposals, agent];
    setProposals(newProposals);
    const newSelected = new Set(selectedIndices);
    newSelected.add(newProposals.length - 1);
    setSelectedIndices(newSelected);
    if (orchestrator) setOrchestratorSelected(true);
    const newPipeline = rebuildPipeline(newProposals, orchestrator, pipeline);
    if (newPipeline) setPipeline(newPipeline);
    setDirty(true);
    setShowAddAgent(false);
    toast({ title: `Added ${agent.name} to plan` });
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); return; }
    pushUndo(`Reorder agents`);
    const newProposals = [...proposals];
    const [dragged] = newProposals.splice(dragIndex, 1);
    newProposals.splice(targetIndex, 0, dragged);
    const newSelected = new Set<number>();
    const oldArr = Array.from(selectedIndices);
    for (const oldIdx of oldArr) {
      let newIdx = oldIdx;
      if (oldIdx === dragIndex) {
        newIdx = targetIndex;
      } else if (dragIndex < targetIndex) {
        if (oldIdx > dragIndex && oldIdx <= targetIndex) newIdx = oldIdx - 1;
      } else {
        if (oldIdx >= targetIndex && oldIdx < dragIndex) newIdx = oldIdx + 1;
      }
      newSelected.add(newIdx);
    }
    setProposals(newProposals);
    setSelectedIndices(newSelected);
    const newPipeline = rebuildPipeline(newProposals, orchestrator, pipeline);
    if (newPipeline) setPipeline(newPipeline);
    setDirty(true);
    setDragIndex(null);
  }

  async function savePlan() {
    if (!proposalId) return;
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/agent-proposals/${proposalId}`, {
        selectedIndices: Array.from(selectedIndices),
        orchestratorSelected,
        workers: proposals,
        orchestrator,
        pipeline,
      });
      setLastSaved(new Date().toISOString());
      setDirty(false);
      toast({ title: "Plan saved", description: "Your agent development plan has been saved." });
    } catch {
      toast({ title: "Failed to save plan", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function generateProposalsWithFeedback() {
    if (!feedbackText.trim()) {
      toast({ title: "Please provide feedback", description: "Tell us what to change about the plan.", variant: "destructive" });
      return;
    }
    setGeneratingWithFeedback(true);
    setShowFeedback(false);
    try {
      const feedbackPayload: Record<string, unknown> = {
        outcomeContract: outcome,
        kpis,
        feedback: feedbackText.trim(),
        previousPlan: {
          orchestrator,
          workers: proposals,
          pipeline,
        },
        industryContext: industryContextPayload,
      };
      if (pendingTemplateId) feedbackPayload.templateId = pendingTemplateId;
      const res = await apiRequest("POST", "/api/ai/propose-agents", feedbackPayload);
      const data = await res.json();
      pushUndo("Regenerate with feedback");
      setProposals(data.agents || []);
      setOrchestrator(data.orchestrator || null);
      setPipeline(data.pipeline || null);
      setGenerated(true);
      const allIndices = new Set<number>((data.agents || []).map((_: any, i: number) => i));
      setSelectedIndices(allIndices);
      setOrchestratorSelected(!!data.orchestrator);
      if (data.proposalId) {
        setProposalId(data.proposalId);
        setLastSaved(new Date().toISOString());
        loadedRef.current = data.proposalId;
      }
      setDirty(false);
      setFeedbackText("");
      queryClient.invalidateQueries({ queryKey: ["/api/agent-proposals", outcome.id] });
      toast({ title: "Plan regenerated with feedback", description: "The plan has been updated based on your feedback." });
    } catch (err) {
      toast({ title: "Failed to regenerate", description: "Please try again.", variant: "destructive" });
    } finally {
      setGeneratingWithFeedback(false);
    }
  }

  async function createSelectedAgents() {
    setCreating(true);
    try {
      const selectedWorkers = proposals.filter((_, i) => selectedIndices.has(i));

      if (orchestratorSelected && orchestrator && selectedWorkers.length > 0) {
        const res = await apiRequest("POST", "/api/ai/create-team-from-proposals", {
          outcomeId: outcome.id,
          industry: industry?.id || "general",
          orchestrator: { ...orchestrator, suggestedKnowledgeBases: orchestrator.suggestedKnowledgeBases || [] },
          workers: selectedWorkers.map(w => ({ ...w, suggestedKnowledgeBases: w.suggestedKnowledgeBases || [] })),
          pipeline,
        });
        const data = await res.json();

        queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
        queryClient.invalidateQueries({ queryKey: ["/api/agent-teams"] });
        queryClient.invalidateQueries({ queryKey: ["/api/blueprints"] });
        queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcome.id] });

        if (proposalId) {
          try { await apiRequest("PATCH", `/api/agent-proposals/${proposalId}`, { status: "created" }); } catch {}
        }

        toast({
          title: "Team Agent created",
          description: `Team "${data.teamAgent.name}" created with ${data.membershipCount} worker agent${data.membershipCount > 1 ? "s" : ""}, team blueprint, and pipeline graph.`,
        });
      } else {
        for (const worker of selectedWorkers) {
          const taskLines: string[] = [];
          taskLines.push(`Role: ${worker.role || worker.name}`);
          taskLines.push(`Goal: ${worker.description}`);
          if (worker.workflowSteps?.length) {
            taskLines.push(`\nWorkflow Steps:`);
            worker.workflowSteps.forEach((step, i) => taskLines.push(`${i + 1}. ${step}`));
          }
          if (worker.tools?.length) {
            taskLines.push(`\nAvailable Tools: ${worker.tools.map(t => t.name).join(", ")}`);
          }
          if (worker.kpiBindings?.length) {
            taskLines.push(`\nKPIs to optimize: ${worker.kpiBindings.join(", ")}`);
          }
          if (worker.estimatedImpact) {
            taskLines.push(`\nExpected Impact: ${worker.estimatedImpact}`);
          }
          const taskPrompt = taskLines.join("\n");

          let finalSystemPrompt: string;
          if (worker.systemPrompt && worker.systemPrompt.trim().length > 0) {
            finalSystemPrompt = worker.systemPrompt;
          } else {
            const industryLabel = industry?.id || "general";
            const sysLines: string[] = [];
            sysLines.push(`You are ${worker.name}, an AI agent operating within the ${industryLabel} industry.`);
            sysLines.push(`Your role: ${worker.role || worker.description}`);
            sysLines.push(`You are a worker agent contributing to the outcome "${outcome.name}".`);
            if (worker.kpiBindings?.length) {
              sysLines.push(`You are responsible for optimizing these KPIs: ${worker.kpiBindings.join(", ")}.`);
            }
            if (worker.tools?.length) {
              sysLines.push(`You have access to these tools: ${worker.tools.map(t => `${t.name} (${t.description})`).join("; ")}.`);
            }
            sysLines.push(`Risk tier: ${worker.riskTier || "MEDIUM"}. Autonomy mode: ${worker.autonomyMode || "assisted"}.`);
            sysLines.push(`Always follow compliance requirements and escalate when operating outside your autonomy boundaries.`);
            finalSystemPrompt = sysLines.join("\n");
          }

          const agentRes = await apiRequest("POST", "/api/agents", {
            name: worker.name,
            description: worker.description,
            owner: "system",
            agentType: "single",
            riskTier: worker.riskTier,
            autonomyMode: worker.autonomyMode,
            modelProvider: worker.modelProvider,
            modelName: worker.modelName,
            outcomeId: outcome.id,
            toolsConfig: worker.tools,
            systemPrompt: finalSystemPrompt,
            complianceTags: worker.complianceTags || [],
            ontologyTags: worker.matchedOntologyConcepts?.length ? { concepts: worker.matchedOntologyConcepts } : {},
            policyBindings: worker.policyConstraints?.length ? { policies: worker.policyConstraints } : {},
            blueprintId: worker.suggestedBlueprintId || undefined,
            runtimeConfig: {
              prompt: taskPrompt,
              kpiBindings: worker.kpiBindings || [],
              workflowSteps: worker.workflowSteps || [],
              estimatedImpact: worker.estimatedImpact || "",
              matchedSkills: worker.matchedSkills || [],
              suggestedRagPipeline: worker.suggestedRagPipeline || null,
              mcpToolBindings: worker.mcpToolBindings || [],
            },
            blueprintJson: worker.suggestedBlueprintId ? undefined : worker.workflowSteps?.length ? {
              type: "workflow",
              steps: worker.workflowSteps.map((step, idx) => ({
                id: `step-${idx + 1}`,
                label: step,
                order: idx + 1,
                type: idx === 0 ? "trigger" : idx === worker.workflowSteps!.length - 1 ? "output" : "process",
              })),
              edges: worker.workflowSteps.slice(0, -1).map((_, idx) => ({
                from: `step-${idx + 1}`,
                to: `step-${idx + 2}`,
                label: "next",
              })),
              tools: worker.tools || [],
              kpiBindings: worker.kpiBindings || [],
            } : undefined,
          });
          const createdAgent = await agentRes.json();
          if (createdAgent?.id) {
            if (worker.suggestedKnowledgeBases?.length) {
              for (const kb of worker.suggestedKnowledgeBases) {
                try {
                  await apiRequest("POST", `/api/agents/${createdAgent.id}/knowledge-bases`, { knowledgeBaseId: kb.id });
                } catch {}
              }
            }
            if (worker.mcpToolBindings?.length) {
              try {
                const mcpServersRes = await fetch("/api/mcp-servers");
                const mcpServers = await mcpServersRes.json();
                const serverNames = Array.from(new Set(worker.mcpToolBindings.map(b => b.server)));
                for (const serverName of serverNames) {
                  const matched = mcpServers.find((s: any) =>
                    s.name.toLowerCase().includes(serverName.toLowerCase()) ||
                    serverName.toLowerCase().includes(s.name.toLowerCase().split(" ")[0])
                  );
                  if (matched) {
                    try {
                      await apiRequest("POST", `/api/agents/${createdAgent.id}/mcp-servers`, { serverId: matched.id });
                    } catch {}
                  }
                }
              } catch {}
            }
          }
        }
        queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
        queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcome.id] });

        toast({
          title: `${selectedWorkers.length} agent${selectedWorkers.length > 1 ? "s" : ""} created`,
          description: `${selectedWorkers.length} agent${selectedWorkers.length > 1 ? "s" : ""} created and linked to this outcome.`,
        });
      }
    } catch (err: any) {
      toast({ title: "Failed to create agents", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  const industryContextPayload = {
    industryId: industry?.id || "general",
    frameworks: activeFrameworks,
    jurisdictions: workspaceConfig?.jurisdictions || [],
    departments: activeDepartments,
  };

  async function generateProposals() {
    setGeneratingFresh(true);
    try {
      const payload: Record<string, unknown> = {
        outcomeContract: outcome,
        kpis,
        industryContext: industryContextPayload,
      };
      if (pendingTemplateId) payload.templateId = pendingTemplateId;
      const res = await apiRequest("POST", "/api/ai/propose-agents", payload);
      const data = await res.json();
      setProposals(data.agents || []);
      setOrchestrator(data.orchestrator || null);
      setPipeline(data.pipeline || null);
      setGenerated(true);
      const allIndices = new Set<number>((data.agents || []).map((_: any, i: number) => i));
      setSelectedIndices(allIndices);
      setOrchestratorSelected(!!data.orchestrator);
      if (data.proposalId) {
        setProposalId(data.proposalId);
        setLastSaved(new Date().toISOString());
        setDirty(false);
        loadedRef.current = data.proposalId;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/agent-proposals", outcome.id] });
    } catch (err) {
      toast({ title: "Failed to generate proposals", description: "Please try again.", variant: "destructive" });
    } finally {
      setGeneratingFresh(false);
    }
  }

  if (agentPerm.permission.access === "denied") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Lock className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="text-center flex flex-col gap-1">
            <h3 className="text-sm font-semibold">Agent Development Plan</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Agent proposals and creation are handled by Agent Engineers. Switch to the Agent Engineer role to generate an agent development plan for this outcome.
            </p>
          </div>
          {isAwaitingPlan && (
            <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700" data-testid="badge-awaiting-plan">
              Awaiting Agent Plan
            </Badge>
          )}
        </CardContent>
      </Card>
    );
  }

  if (loadingSaved) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading saved plan...</p>
        </CardContent>
      </Card>
    );
  }

  if (!generated) {
    const featureChips = [
      { icon: Network, label: "Orchestrator", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
      { icon: Bot, label: "Worker Agents", color: "text-violet-500 bg-violet-500/10 border-violet-500/20" },
      { icon: Wrench, label: "MCP Tools", color: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
      { icon: BarChart3, label: "KPI Bindings", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
      { icon: Workflow, label: "Pipeline Graph", color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20" },
    ];

    return (
      <Card className={`overflow-hidden ${isAwaitingPlan ? "border-primary/30" : "border-border"}`}>
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-violet-500/[0.04]" />
          <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }} />
          <CardContent className="relative flex flex-col items-center justify-center py-14 gap-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 via-violet-500/20 to-cyan-500/20 blur-xl scale-150 animate-pulse" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary/15 via-violet-500/10 to-primary/15 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/5">
                <Sparkles className="w-9 h-9 text-primary" />
              </div>
            </div>
            <div className="text-center flex flex-col gap-2 max-w-xl">
              <h3 className="text-xl font-semibold tracking-tight">Generate Agent Development Plan</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                AI will analyze your outcome contract and {kpis.length} KPI{kpis.length !== 1 ? "s" : ""} to design a complete multi-agent system — orchestrator, specialized workers, tool bindings, and deployment pipeline.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center" data-testid="feature-chips">
              {featureChips.map((chip) => (
                <div key={chip.label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${chip.color}`}>
                  <chip.icon className="w-3 h-3" />
                  {chip.label}
                </div>
              ))}
            </div>
            {isPendingValidation && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/15 max-w-md flex-wrap" data-testid="notice-pending-validation">
                <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium">Pending Expert Validation</span>
                  <span className="text-[11px] text-muted-foreground">This outcome is awaiting expert review. You can still generate proposals, but agents should only be created after validation.</span>
                </div>
              </div>
            )}
            {isValidated && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/15 max-w-md flex-wrap" data-testid="notice-validated">
                <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                <span className="text-xs text-green-700 dark:text-green-300">Outcome validated by expert — ready for agent creation</span>
              </div>
            )}
            <Button
              size="lg"
              onClick={generateProposals}
              disabled={generating}
              data-testid="button-generate-proposals"
              className="px-8 shadow-lg shadow-primary/20"
            >
              {generating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2.5 animate-spin" />
                  Analyzing outcome & KPIs...
                </>
              ) : pendingTemplateId ? (
                <>
                  <Sparkles className="w-5 h-5 mr-2.5" />
                  Generate Plan from Template
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2.5" />
                  Generate Agent Development Plan
                </>
              )}
            </Button>
            {kpis.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Define KPIs first for better agent proposals</p>
            )}
          </CardContent>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {pendingTemplateId && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-4 py-3" data-testid="banner-template-preselected">
          <Sparkles className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Template pre-selected for Agent Plan</p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">Template <span className="font-mono font-semibold">{pendingTemplateId}</span> is queued. Click <strong>Generate Plan</strong> to build agents from this template.</p>
          </div>
          <button
            type="button"
            className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 transition-colors text-lg leading-none shrink-0"
            onClick={() => setPendingTemplateId(null)}
            data-testid="button-dismiss-template-banner"
            aria-label="Dismiss template selection"
          >×</button>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-violet-500/10 border border-primary/15 flex items-center justify-center shadow-sm shadow-primary/5">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight">Multi-Agent Development Plan</h3>
              <p className="text-xs text-muted-foreground">AI-generated orchestrated pipeline. Edit agents, reorder, or regenerate with feedback.</p>
              {lastSaved && (
                <div className="flex items-center gap-1.5 mt-0.5" data-testid="text-plan-saved-status">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  <span className="text-[11px] text-muted-foreground">
                    Saved {new Date(lastSaved).toLocaleDateString()} at {new Date(lastSaved).toLocaleTimeString()}
                  </span>
                  {dirty && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-amber-600 border-amber-300">Unsaved changes</Badge>}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="ghost" size="sm" onClick={undo} disabled={undoStack.length === 0} data-testid="button-undo" className="h-8 w-8 p-0">
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={redo} disabled={redoStack.length === 0} data-testid="button-redo" className="h-8 w-8 p-0">
              <Redo2 className="w-4 h-4" />
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Button variant="outline" size="sm" onClick={() => setShowAddAgent(true)} data-testid="button-add-custom-agent">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Agent
            </Button>
            {proposalId && dirty && (
              <Button variant="outline" size="sm" onClick={savePlan} disabled={saving} data-testid="button-save-plan">
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                Save Plan
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowFeedback(true)} disabled={generating} data-testid="button-regenerate-with-feedback">
              <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
              Regenerate
            </Button>
          </div>
        </div>

        {showFeedback && (
          <Card className="border-primary/20 bg-primary/[0.02]" data-testid="card-feedback-panel">
            <CardContent className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Regenerate with Feedback</span>
              </div>
              <p className="text-xs text-muted-foreground">Describe what you'd like to change about the current plan. The AI will incorporate your feedback and generate an updated plan.</p>
              <Textarea
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="e.g., 'Add a data validation step before the main processor', 'Use fewer workers', 'Include compliance checking agent', 'Change to sequential pipeline'..."
                className="min-h-[80px] text-xs"
                data-testid="textarea-feedback"
              />
              <div className="flex items-center gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => { setShowFeedback(false); setFeedbackText(""); }} data-testid="button-cancel-feedback">Cancel</Button>
                <Button variant="outline" size="sm" onClick={generateProposals} disabled={generatingFresh} data-testid="button-regenerate-fresh">
                  {generatingFresh ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  Fresh Regenerate
                </Button>
                <Button size="sm" onClick={generateProposalsWithFeedback} disabled={generatingWithFeedback || !feedbackText.trim()} data-testid="button-submit-feedback">
                  {generatingWithFeedback ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  Regenerate with Feedback
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showAddAgent} onOpenChange={setShowAddAgent}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Add Custom Agent</DialogTitle>
            <DialogDescription className="text-xs">Define a new agent to add to the development plan.</DialogDescription>
          </DialogHeader>
          <AddCustomAgentForm onAdd={addCustomAgent} onCancel={() => setShowAddAgent(false)} />
        </DialogContent>
      </Dialog>

      {isPendingValidation && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-amber-500/5 border border-amber-500/10 flex-wrap" data-testid="notice-pending-validation-proposals">
          <Shield className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-xs text-muted-foreground">This outcome is pending expert validation. Agent creation is recommended only after validation is complete.</span>
          <Link href="/approvals">
            <Button variant="outline" size="sm" data-testid="button-go-to-approvals">
              <ArrowRight className="w-3.5 h-3.5 mr-1" /> Go to Approvals
            </Button>
          </Link>
        </div>
      )}

      {proposals.length === 0 && !orchestrator ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
            <Bot className="w-8 h-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No agent proposals generated. Try regenerating.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {orchestrator && (
            <PipelineVisualization orchestrator={orchestrator} agents={proposals} pipeline={pipeline} />
          )}

          <div className="rounded-lg border border-primary/15 bg-gradient-to-r from-primary/[0.02] to-transparent p-3 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${totalSelected > 0 ? "bg-primary animate-pulse" : "bg-muted-foreground/30"}`} />
                    <span className="text-xs font-medium" data-testid="text-selected-count">
                      {totalSelected} of {(orchestrator ? 1 : 0) + proposals.length} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll} data-testid="button-select-all">
                      Select All
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={deselectAll} data-testid="button-deselect-all">
                      Deselect All
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={createSelectedAgents}
                  disabled={creating || totalSelected === 0}
                  data-testid="button-create-selected-agents"
                  className="shadow-md shadow-primary/15"
                  size="lg"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating Team Agent...
                    </>
                  ) : orchestratorSelected && orchestrator && selectedIndices.size > 0 ? (
                    <>
                      <Rocket className="w-4 h-4 mr-2" />
                      Create Team Agent ({selectedIndices.size} worker{selectedIndices.size > 1 ? "s" : ""})
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4 mr-2" />
                      Create {totalSelected} Selected Agent{totalSelected > 1 ? "s" : ""}
                    </>
                  )}
                </Button>
              </div>

              {orchestratorSelected && selectedIndices.size > 0 && orchestrator && (
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
                  <Network className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] text-muted-foreground">
                      Creates <strong className="text-foreground">{orchestrator.name}</strong> as coordinator with {selectedIndices.size} worker{selectedIndices.size > 1 ? "s" : ""}, team blueprint, and pipeline graph.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[9px] text-primary border-primary/20">
                      <Users className="w-2.5 h-2.5 mr-1" />{selectedIndices.size + 1}
                    </Badge>
                  </div>
                </div>
              )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {orchestrator && (
              <AgentProposalCard
                agent={orchestrator}
                index={-1}
                isOrchestrator={true}
                isSelected={orchestratorSelected}
                onToggle={toggleOrchestrator}
                isCreating={creating}
                onEdit={editOrchestrator}
                onDelete={deleteOrchestrator}
              />
            )}
            {proposals.map((agent, i) => (
              <AgentProposalCard
                key={`${i}-${agent.name}`}
                agent={agent}
                index={i}
                isOrchestrator={false}
                isSelected={selectedIndices.has(i)}
                onToggle={() => toggleWorker(i)}
                isCreating={creating}
                onEdit={(updated) => editWorker(i, updated)}
                onDelete={() => deleteWorker(i)}
                onDuplicate={() => duplicateWorker(i)}
                isDragging={dragIndex === i}
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
