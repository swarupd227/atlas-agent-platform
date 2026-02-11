import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Target,
  Bot,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  CheckCircle,
  Clock,
  ArrowRight,
  Sparkles,
  Shield,
  Server,
  Wifi,
  WifiOff,
  FlaskConical,
  CircleAlert,
  Minus,
  Wrench,
  Gauge,
  ArrowUpDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { ErrorState } from "@/components/error-state";
import { Link } from "wouter";
import { useRole, type RoleId } from "@/components/role-provider";
import {
  PortfolioSummaryBar,
  OutcomePortfolioCard,
  WaterfallChart,
  RiskExposurePanel,
} from "@/components/outcome-cockpit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface KpiSummary {
  id: string;
  name: string;
  unit: string;
  current: number;
  target: number;
  progress: number;
  slaThreshold: number | null;
  breachLevel: string | null;
  trend: string | null;
}

interface OutcomeHealth {
  id: string;
  name: string;
  status: string;
  riskTier: string;
  confidence: number;
  slaStatus: string;
  kpis: KpiSummary[];
}

interface AgentAtRisk {
  id: string;
  name: string;
  environment: string | null;
  riskTier: string;
  healthScore: number | null;
  lastDrift: { driftPercent: number; detectedAt: string } | null;
  openIncidents: number;
  p95Latency: number;
  costPerRun: number;
}

interface ApprovalItem {
  id: string;
  type: string;
  objectName: string | null;
  objectType: string;
  riskScore: number | null;
  requestedBy: string | null;
  dueDate: string | null;
  createdAt: string | null;
  agentId: string | null;
  outcomeId: string | null;
  environment: string | null;
}

interface OutcomePortfolioItem {
  id: string;
  name: string;
  status: string;
  riskTier: string;
  confidence: number;
  confidenceTrajectory: number[];
  kpis: Array<{ id: string; name: string; current: number; target: number; unit: string; trend: string }>;
  valueDelivered: number;
  valueCommitted: number;
  agentCount: number;
}

interface RiskExposureItem {
  category: string;
  count: number;
  severity: string;
  items: Array<{ name: string; detail: string }>;
}

interface OverviewData {
  outcomeHealth: OutcomeHealth[];
  agentsAtRisk: AgentAtRisk[];
  approvalQueue: {
    items: ApprovalItem[];
    totalPending: number;
  };
  financialSnapshot: {
    billed: number;
    pending: number;
    disputed: number;
    totalRevenue30d: number;
  };
  systemStatus: {
    toolErrorRate: number;
    queueDepth: number;
    evalBacklog: number;
    connectorHealth: number;
    activeAgents: number;
    totalAgents: number;
  };
  portfolio?: {
    committedValue: number;
    valueDelivered: number;
    valueAtRisk: number;
    projectedGap: number;
  };
  outcomePortfolio?: OutcomePortfolioItem[];
  waterfall?: {
    grossEvents: number;
    exclusions: number;
    netBillable: number;
    revenueRecognized: number;
  };
  riskExposure?: RiskExposureItem[];
}

interface PolicyViolation {
  id: string;
  agentId: string;
  agentName: string;
  policyName: string;
  rule: string;
  severity: string;
  traceId: string;
  timestamp: string;
  action: string;
}

interface RoleWidgetConfig {
  title: string;
  description: string;
  showOutcomeCockpit: boolean;
  showOutcomeHealth: boolean;
  showAgentsAtRisk: boolean;
  showApprovalQueue: boolean;
  showFinancialSnapshot: boolean;
  showSystemStatus: boolean;
  showPolicyViolations: boolean;
  outcomeCompact: boolean;
  approvalProminent: boolean;
  financialProminent: boolean;
  systemProminent: boolean;
}

const ROLE_WIDGETS: Record<RoleId, RoleWidgetConfig> = {
  admin: {
    title: "Outcome Portfolio",
    description: "Agent commitments, value delivery, and business impact",
    showOutcomeCockpit: true,
    showOutcomeHealth: false,
    showAgentsAtRisk: true,
    showApprovalQueue: true,
    showFinancialSnapshot: false,
    showSystemStatus: true,
    showPolicyViolations: false,
    outcomeCompact: false,
    approvalProminent: false,
    financialProminent: false,
    systemProminent: false,
  },
  outcome_owner: {
    title: "Outcome Portfolio",
    description: "Agent commitments, value delivery, and business impact",
    showOutcomeCockpit: true,
    showOutcomeHealth: false,
    showAgentsAtRisk: false,
    showApprovalQueue: true,
    showFinancialSnapshot: false,
    showSystemStatus: false,
    showPolicyViolations: false,
    outcomeCompact: false,
    approvalProminent: false,
    financialProminent: false,
    systemProminent: false,
  },
  agent_engineer: {
    title: "Agent Engineer Dashboard",
    description: "Agent performance and development",
    showOutcomeCockpit: false,
    showOutcomeHealth: true,
    showAgentsAtRisk: true,
    showApprovalQueue: false,
    showFinancialSnapshot: false,
    showSystemStatus: true,
    showPolicyViolations: false,
    outcomeCompact: true,
    approvalProminent: false,
    financialProminent: false,
    systemProminent: false,
  },
  ops_sre: {
    title: "Ops / SRE Dashboard",
    description: "Operations, reliability, and incidents",
    showOutcomeCockpit: false,
    showOutcomeHealth: false,
    showAgentsAtRisk: true,
    showApprovalQueue: true,
    showFinancialSnapshot: false,
    showSystemStatus: true,
    showPolicyViolations: false,
    outcomeCompact: false,
    approvalProminent: false,
    financialProminent: false,
    systemProminent: true,
  },
  compliance_security: {
    title: "Compliance / Security Dashboard",
    description: "Policy enforcement and compliance",
    showOutcomeCockpit: false,
    showOutcomeHealth: false,
    showAgentsAtRisk: false,
    showApprovalQueue: true,
    showFinancialSnapshot: false,
    showSystemStatus: true,
    showPolicyViolations: true,
    outcomeCompact: false,
    approvalProminent: false,
    financialProminent: false,
    systemProminent: false,
  },
  expert_validator: {
    title: "Expert Validator Dashboard",
    description: "Pending approvals and high-risk changes",
    showOutcomeCockpit: false,
    showOutcomeHealth: false,
    showAgentsAtRisk: true,
    showApprovalQueue: true,
    showFinancialSnapshot: false,
    showSystemStatus: false,
    showPolicyViolations: false,
    outcomeCompact: false,
    approvalProminent: true,
    financialProminent: false,
    systemProminent: false,
  },
  finance: {
    title: "Outcome Portfolio",
    description: "Value delivery, financial attribution, and revenue tracking",
    showOutcomeCockpit: true,
    showOutcomeHealth: false,
    showAgentsAtRisk: false,
    showApprovalQueue: false,
    showFinancialSnapshot: false,
    showSystemStatus: false,
    showPolicyViolations: false,
    outcomeCompact: false,
    approvalProminent: false,
    financialProminent: true,
    systemProminent: false,
  },
};

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" data-testid="overview-skeleton">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-5"><Skeleton className="h-28 w-full" /></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2"><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
        <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-36 w-full" /></CardContent></Card>
        ))}
      </div>
    </div>
  );
}

function formatCurrency(amount: number) {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function dueIn(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return "Overdue";
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `${Math.floor(diff / 60000)}m left`;
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "up") return <TrendingUp className="w-3 h-3 text-emerald-500" />;
  if (trend === "down") return <TrendingDown className="w-3 h-3 text-red-500" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

const RISK_CATEGORY_ICONS: Record<string, typeof AlertTriangle> = {
  "Agent Drift": Activity,
  "Tool Failures": Wrench,
  "SLA Pressure": Clock,
  "Cost Overruns": DollarSign,
};

function OutcomeCockpitView({ data, isFinanceRole }: { data: OverviewData; isFinanceRole: boolean }) {
  const [sortBy, setSortBy] = useState<"confidence" | "risk" | "value">("confidence");

  const portfolio = data.portfolio || { committedValue: 0, valueDelivered: 0, valueAtRisk: 0, projectedGap: 0 };
  const outcomes = data.outcomePortfolio || [];
  const waterfall = data.waterfall || { grossEvents: 0, exclusions: 0, netBillable: 0, revenueRecognized: 0 };
  const riskExposure = data.riskExposure || [];

  const riskOrder: Record<string, number> = { CRITICAL: 0, critical: 0, HIGH: 1, high: 1, MEDIUM: 2, medium: 2, LOW: 3, low: 3 };

  const sortedOutcomes = [...outcomes].sort((a, b) => {
    if (sortBy === "confidence") return a.confidence - b.confidence;
    if (sortBy === "risk") return (riskOrder[a.riskTier] ?? 99) - (riskOrder[b.riskTier] ?? 99);
    if (sortBy === "value") return b.valueDelivered - a.valueDelivered;
    return 0;
  });

  const riskCategories = riskExposure.map((r) => ({
    category: r.category,
    icon: RISK_CATEGORY_ICONS[r.category] || AlertTriangle,
    count: r.count,
    severity: r.severity as "low" | "medium" | "high" | "critical",
    items: r.items,
  }));

  const waterfallSteps = [
    { label: "Gross Events", value: waterfall.grossEvents, type: "gross" as const },
    { label: "Exclusions", value: waterfall.exclusions, type: "deduction" as const },
    { label: "Net Billable", value: waterfall.netBillable, type: "net" as const },
    { label: "Revenue", value: waterfall.revenueRecognized, type: "net" as const },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PortfolioSummaryBar
        committedValue={portfolio.committedValue}
        valueDelivered={portfolio.valueDelivered}
        valueAtRisk={portfolio.valueAtRisk}
        projectedGap={portfolio.projectedGap}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-medium text-muted-foreground" data-testid="text-outcome-portfolio-heading">
            Agent Outcome Contracts
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-sort-outcomes">
                <ArrowUpDown className="w-3 h-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confidence">By Confidence</SelectItem>
                <SelectItem value="risk">By Risk</SelectItem>
                <SelectItem value="value">By Value</SelectItem>
              </SelectContent>
            </Select>
            <Link href="/outcomes">
              <Button variant="ghost" size="sm" data-testid="link-view-all-outcomes">
                View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
        {sortedOutcomes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="grid-outcome-portfolio">
            {sortedOutcomes.map((outcome) => (
              <Link key={outcome.id} href={`/outcomes/${outcome.id}`}>
                <OutcomePortfolioCard outcome={outcome} />
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 flex flex-col items-center justify-center gap-3">
              <Target className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                No outcome contracts yet. Create your first to start tracking agent commitments.
              </p>
              <Link href="/outcomes/discover">
                <Button size="sm" data-testid="button-create-first-outcome-cockpit">
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  Create Outcome
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-financial-waterfall">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium">Financial Attribution</CardTitle>
              <Link href="/billing">
                <Button variant="ghost" size="sm" data-testid="link-waterfall-billing">
                  View Billing <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <WaterfallChart steps={waterfallSteps} />
          </CardContent>
        </Card>

        {riskCategories.length > 0 ? (
          <RiskExposurePanel risks={riskCategories} />
        ) : (
          <Card data-testid="card-no-risk">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-medium">Risk Exposure</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="flex items-center gap-3 p-4 rounded-md bg-emerald-500/5">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-xs text-muted-foreground">No significant risk exposure detected</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function PolicyViolationsSection({ violations, isLoading }: { violations: PolicyViolation[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card data-testid="card-policy-violations">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-sm font-medium">Recent Policy Violations</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-policy-violations">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium">Recent Policy Violations</CardTitle>
          {violations.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{violations.length}</Badge>
          )}
        </div>
        <Link href="/governance">
          <Button variant="ghost" size="sm" data-testid="link-view-governance">
            View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {violations.length > 0 ? (
          violations.slice(0, 5).map((violation) => (
            <Link key={violation.id} href={`/agents/${violation.agentId}`}>
              <div
                className="flex flex-col gap-1.5 p-2.5 rounded-md hover-elevate cursor-pointer"
                data-testid={`violation-preview-${violation.id}`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-medium truncate">{violation.policyName}</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                  >
                    <CircleAlert className="w-2.5 h-2.5 mr-0.5" />
                    {violation.severity}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-muted-foreground truncate">{violation.rule}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{violation.agentName}</Badge>
                  <Badge variant="outline" className="text-[10px]">{violation.action}</Badge>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(violation.timestamp)}</span>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-md bg-emerald-500/5">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs text-muted-foreground">No recent policy violations</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OutcomeHealthSection({ outcomes, compact }: { outcomes: OutcomeHealth[]; compact: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-medium text-muted-foreground">Outcome Health</h2>
        <Link href="/outcomes">
          <Button variant="ghost" size="sm" data-testid="link-view-outcomes">
            View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </Link>
      </div>
      <div className={`grid gap-4 ${compact ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"}`} data-testid="grid-outcome-health">
        {outcomes.map((outcome) => (
          <Link key={outcome.id} href={`/outcomes/${outcome.id}`}>
            <Card className="hover-elevate cursor-pointer h-full" data-testid={`tile-outcome-${outcome.id}`}>
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium truncate">{outcome.name}</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge status={outcome.status} />
                      {!compact && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            outcome.slaStatus === "breach"
                              ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                              : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          }`}
                          data-testid={`sla-status-${outcome.id}`}
                        >
                          SLA: {outcome.slaStatus === "breach" ? "Breach" : "Healthy"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className="text-lg font-semibold">{Math.round(outcome.confidence * 100)}%</span>
                    <span className="text-[10px] text-muted-foreground">confidence</span>
                  </div>
                </div>
                {!compact && outcome.kpis.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {outcome.kpis.slice(0, 3).map((kpi) => (
                      <div key={kpi.id} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 min-w-0">
                            <TrendIcon trend={kpi.trend} />
                            <span className="text-[11px] text-muted-foreground truncate">{kpi.name}</span>
                          </div>
                          <span className="text-[11px] font-medium shrink-0">
                            {kpi.current.toLocaleString()} / {kpi.target.toLocaleString()} {kpi.unit}
                          </span>
                        </div>
                        <Progress value={kpi.progress} className="h-1" />
                      </div>
                    ))}
                  </div>
                )}
                {compact && outcome.kpis.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {outcome.kpis.slice(0, 3).map((kpi) => (
                      <div key={kpi.id} className="flex items-center gap-1">
                        <TrendIcon trend={kpi.trend} />
                        <span className="text-[11px] text-muted-foreground">{kpi.name}:</span>
                        <span className="text-[11px] font-medium">{kpi.current.toLocaleString()}/{kpi.target.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
                {outcome.kpis.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No KPIs configured</p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function AgentsAtRiskSection({ agents }: { agents: AgentAtRisk[] }) {
  return (
    <Card className="lg:col-span-2" data-testid="card-agents-at-risk">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-sm font-medium">Agents At Risk</CardTitle>
        <Link href="/agents">
          <Button variant="ghost" size="sm" data-testid="link-view-agents">
            View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {agents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="table-agents-at-risk">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Agent</th>
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Env</th>
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Risk</th>
                  <th className="text-right py-2 pr-3 font-medium text-muted-foreground">Drift</th>
                  <th className="text-right py-2 pr-3 font-medium text-muted-foreground">Incidents</th>
                  <th className="text-right py-2 pr-3 font-medium text-muted-foreground">p95 Lat</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Cost/Run</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <Link href={`/agents/${agent.id}`}>
                        <span className="font-medium hover:underline cursor-pointer" data-testid={`link-agent-${agent.id}`}>
                          {agent.name}
                        </span>
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className="text-[10px]">{agent.environment || "staging"}</Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={agent.riskTier} />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {agent.lastDrift ? (
                        <span className={agent.lastDrift.driftPercent < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
                          {agent.lastDrift.driftPercent > 0 ? "+" : ""}{agent.lastDrift.driftPercent}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {agent.openIncidents > 0 ? (
                        <span className="text-red-600 dark:text-red-400 font-medium">{agent.openIncidents}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">{agent.p95Latency}ms</td>
                    <td className="py-2 text-right">{formatCurrency(agent.costPerRun)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-md bg-emerald-500/5">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs text-muted-foreground">All agents are operating within safe parameters</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApprovalQueueSection({ approvalQueue, prominent }: { approvalQueue: OverviewData["approvalQueue"]; prominent: boolean }) {
  return (
    <Card className={prominent ? "lg:col-span-2" : ""} data-testid="card-approval-queue">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium">Approval Queue</CardTitle>
          {approvalQueue.totalPending > 0 && (
            <Badge variant="secondary" className="text-[10px]">{approvalQueue.totalPending}</Badge>
          )}
        </div>
        <Link href="/approvals">
          <Button variant="ghost" size="sm" data-testid="link-view-approvals">
            View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {approvalQueue.items.length > 0 ? (
          (prominent ? approvalQueue.items : approvalQueue.items).map((approval) => (
            <Link key={approval.id} href={`/approvals/${approval.id}`}>
              <div
                className="flex flex-col gap-1.5 p-2.5 rounded-md hover-elevate cursor-pointer"
                data-testid={`approval-preview-${approval.id}`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-medium truncate">{approval.objectName || approval.type}</span>
                  {approval.dueDate && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        new Date(approval.dueDate).getTime() < Date.now()
                          ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                      }`}
                    >
                      <Clock className="w-2.5 h-2.5 mr-0.5" />
                      {dueIn(approval.dueDate)}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{approval.type.replace(/_/g, " ")}</Badge>
                  {approval.environment && (
                    <Badge variant="outline" className="text-[10px]">{approval.environment}</Badge>
                  )}
                  {approval.createdAt && (
                    <span className="text-[10px] text-muted-foreground">{timeAgo(approval.createdAt)}</span>
                  )}
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-md bg-emerald-500/5">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs text-muted-foreground">No pending approvals</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FinancialSnapshotSection({ financialSnapshot, prominent }: { financialSnapshot: OverviewData["financialSnapshot"]; prominent: boolean }) {
  return (
    <Card className={prominent ? "lg:col-span-2" : ""} data-testid="card-financial-snapshot">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-sm font-medium">Financial Snapshot</CardTitle>
        <Link href="/billing">
          <Button variant="ghost" size="sm" data-testid="link-view-billing">
            View Billing <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <p className="text-[11px] text-muted-foreground">Last 30 days</p>
          <div className={`grid gap-3 ${prominent ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"}`}>
            <div className="flex flex-col gap-1 p-3 rounded-md bg-emerald-500/5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Billed</span>
              <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400" data-testid="text-billed-amount">
                {formatCurrency(financialSnapshot.billed)}
              </span>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-md bg-amber-500/5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending</span>
              <span className="text-lg font-semibold text-amber-600 dark:text-amber-400" data-testid="text-pending-amount">
                {formatCurrency(financialSnapshot.pending)}
              </span>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-md bg-red-500/5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Disputed</span>
              <span className="text-lg font-semibold text-red-600 dark:text-red-400" data-testid="text-disputed-amount">
                {formatCurrency(financialSnapshot.disputed)}
              </span>
            </div>
            {prominent && (
              <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/50">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Revenue (30d)</span>
                <span className="text-lg font-semibold" data-testid="text-total-revenue-30d-prominent">
                  {formatCurrency(financialSnapshot.totalRevenue30d)}
                </span>
              </div>
            )}
          </div>
          {!prominent && financialSnapshot.totalRevenue30d > 0 && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Total Revenue (30d)</span>
              <span className="text-sm font-medium" data-testid="text-total-revenue-30d">
                {formatCurrency(financialSnapshot.totalRevenue30d)}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SystemStatusSection({ systemStatus, prominent }: { systemStatus: OverviewData["systemStatus"]; prominent: boolean }) {
  return (
    <Card className={prominent ? "lg:col-span-2" : ""} data-testid="card-system-status">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-sm font-medium">System Status</CardTitle>
        <Link href="/monitor">
          <Button variant="ghost" size="sm" data-testid="link-view-monitor">
            View Monitor <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className={`grid gap-3 ${prominent ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2"}`}>
          <div className="flex flex-col gap-1.5 p-3 rounded-md bg-muted/50" data-testid="status-tool-error-rate">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Error Rate</span>
            </div>
            <span className={`text-lg font-semibold ${systemStatus.toolErrorRate > 5 ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
              {systemStatus.toolErrorRate}%
            </span>
          </div>
          <div className="flex flex-col gap-1.5 p-3 rounded-md bg-muted/50" data-testid="status-queue-depth">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Queue Depth</span>
            </div>
            <span className={`text-lg font-semibold ${systemStatus.queueDepth > 10 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
              {systemStatus.queueDepth}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 p-3 rounded-md bg-muted/50" data-testid="status-eval-backlog">
            <div className="flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Eval Backlog</span>
            </div>
            <span className={`text-lg font-semibold ${systemStatus.evalBacklog > 5 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
              {systemStatus.evalBacklog}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 p-3 rounded-md bg-muted/50" data-testid="status-connector-health">
            <div className="flex items-center gap-1.5">
              {systemStatus.connectorHealth >= 80 ? (
                <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-red-500" />
              )}
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Connectors</span>
            </div>
            <span className={`text-lg font-semibold ${systemStatus.connectorHealth < 80 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {systemStatus.connectorHealth}%
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t">
          <span className="text-xs text-muted-foreground">Active Agents</span>
          <span className="text-xs font-medium">
            {systemStatus.activeAgents} / {systemStatus.totalAgents}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Overview() {
  const { role } = useRole();
  const config = ROLE_WIDGETS[role.id];

  const { data, isLoading, error, refetch } = useQuery<OverviewData>({
    queryKey: ["/api/overview"],
  });

  const { data: violations, isLoading: violationsLoading } = useQuery<PolicyViolation[]>({
    queryKey: ["/api/alerts/critical-violations"],
    enabled: config.showPolicyViolations,
  });

  if (isLoading) return <OverviewSkeleton />;
  if (error || !data) {
    return (
      <div className="p-6">
        <ErrorState message="Failed to load platform overview" onRetry={() => refetch()} />
      </div>
    );
  }

  const hasOutcomes = data.outcomeHealth.length > 0 || (data.outcomePortfolio && data.outcomePortfolio.length > 0);

  if (!hasOutcomes && data.agentsAtRisk.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-6" data-testid="page-overview">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Platform Overview</h1>
          <p className="text-sm text-muted-foreground">
            Are we delivering outcomes safely, right now?
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 gap-4" data-testid="empty-state">
          <div className="flex items-center justify-center w-14 h-14 rounded-md bg-primary/10">
            <Target className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center flex flex-col gap-1">
            <p className="text-base font-medium">Create your first Outcome Contract</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Define business outcomes, bind agents, and start tracking KPI delivery with outcome-driven billing.
            </p>
          </div>
          <Link href="/outcomes/discover">
            <Button data-testid="button-create-first-outcome">
              <Sparkles className="w-4 h-4 mr-1.5" />
              Outcome Builder
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const showAgentsAndApprovalRow = config.showAgentsAtRisk || config.showApprovalQueue;
  const showFinancialAndSystemRow = config.showFinancialSnapshot || config.showSystemStatus;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-overview">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-dashboard-title">{config.title}</h1>
            <Badge variant="outline" className="text-[10px]" data-testid="badge-role-label">{role.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="text-dashboard-description">
            {config.description}
          </p>
        </div>
        <Link href="/outcomes/discover">
          <Button data-testid="button-discover-cta">
            <Sparkles className="w-4 h-4 mr-1.5" />
            Outcome Builder
          </Button>
        </Link>
      </div>

      {config.showOutcomeCockpit && (
        <OutcomeCockpitView data={data} isFinanceRole={role.id === "finance"} />
      )}

      {config.showOutcomeHealth && (
        <OutcomeHealthSection outcomes={data.outcomeHealth} compact={config.outcomeCompact} />
      )}

      {showAgentsAndApprovalRow && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {config.showAgentsAtRisk && (
            <AgentsAtRiskSection agents={data.agentsAtRisk} />
          )}
          {config.showApprovalQueue && !config.approvalProminent && (
            <ApprovalQueueSection approvalQueue={data.approvalQueue} prominent={false} />
          )}
        </div>
      )}

      {config.approvalProminent && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ApprovalQueueSection approvalQueue={data.approvalQueue} prominent={true} />
        </div>
      )}

      {config.showPolicyViolations && (
        <PolicyViolationsSection violations={violations || []} isLoading={violationsLoading} />
      )}

      {config.financialProminent && !config.showOutcomeCockpit && (
        <div className="grid grid-cols-1 gap-4">
          <FinancialSnapshotSection financialSnapshot={data.financialSnapshot} prominent={true} />
        </div>
      )}

      {showFinancialAndSystemRow && !config.financialProminent && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {config.showFinancialSnapshot && (
            <FinancialSnapshotSection financialSnapshot={data.financialSnapshot} prominent={false} />
          )}
          {config.showSystemStatus && (
            <SystemStatusSection systemStatus={data.systemStatus} prominent={config.systemProminent} />
          )}
        </div>
      )}

      {config.showSystemStatus && !showFinancialAndSystemRow && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SystemStatusSection systemStatus={data.systemStatus} prominent={config.systemProminent} />
        </div>
      )}
    </div>
  );
}
