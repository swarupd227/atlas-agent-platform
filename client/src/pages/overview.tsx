import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Target,
  Bot,
  AlertTriangle,
  TrendingDown,
  CheckCircle,
  Clock,
  ArrowRight,
  Sparkles,
  Wifi,
  WifiOff,
  FlaskConical,
  CircleAlert,
  Brain,
  BookOpen,
  Trophy,
  Layers,
  Network,
  SlidersHorizontal,
  Database,
  Lock,
  Workflow,
  Plug,
  HeartPulse,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { ErrorState } from "@/components/error-state";
import { Link } from "wouter";
import { useRole, type RoleId } from "@/components/role-provider";
import { useIndustry } from "@/components/industry-provider";

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
  showNeedsAttention: boolean;
  showAgentsAtRisk: boolean;
  showApprovalQueue: boolean;
  showFinancialSnapshot: boolean;
  showSystemStatus: boolean;
  showPolicyViolations: boolean;
}

const PLATFORM_CAPABILITIES = [
  {
    title: "Industry Context Engine",
    description: "Agents reason within your industry's regulatory, operational, and domain context by default",
    icon: Brain,
    href: "/ontology",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/10",
  },
  {
    title: "Agent Skills Library",
    description: "Composable, versioned skill units organized by industry with comparison and composition tools",
    icon: BookOpen,
    href: "/skills",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    title: "Golden Repository",
    description: "Curated templates, evaluation datasets, and certified agent configurations for rapid deployment",
    icon: Trophy,
    href: "/templates",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    title: "Context Engineering Studio",
    description: "Systematic management of what agents know and when they know it with token budget optimization",
    icon: Layers,
    href: "/context-engineering",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    title: "Industry Knowledge Graph",
    description: "Domain ontologies, entity resolution, relationship extraction, and temporal knowledge versioning",
    icon: Network,
    href: "/knowledge-graph",
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10",
  },
  {
    title: "Adaptive Autonomy Engine",
    description: "Dynamic oversight calibrated to industry risk, regulatory requirements, and real-time context",
    icon: SlidersHorizontal,
    href: "/autonomy",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500/10",
  },
];

const TECHNOLOGY_STACK = [
  {
    title: "Knowledge Graph",
    description: "Industry ontologies, entity resolution, and graph-based knowledge retrieval",
    icon: Database,
    tags: ["GraphRAG", "Ontology Explorer", "Temporal Versioning"],
  },
  {
    title: "Policy-as-Code Engine",
    description: "OPA Rego and Cedar policy languages for automated compliance enforcement",
    icon: Lock,
    tags: ["OPA Rego", "Cedar", "Regulatory Detection"],
  },
  {
    title: "GraphRAG Pipeline",
    description: "Industry-aware retrieval combining vector similarity, graph traversal, and hybrid strategies",
    icon: Workflow,
    tags: ["Vector Search", "Graph Retrieval", "Hybrid Cascading"],
  },
  {
    title: "MCP + A2A + Agent Skills",
    description: "Three integration standards for tool access, agent-to-agent delegation, and skill composition",
    icon: Plug,
    tags: ["MCP Protocol", "A2A Federation", "Skill Registry"],
  },
];

const ROLE_WIDGETS: Record<RoleId, RoleWidgetConfig> = {
  admin: {
    title: "Platform Overview",
    description: "Outcomes, agents, and system health at a glance",
    showNeedsAttention: true,
    showAgentsAtRisk: true,
    showApprovalQueue: true,
    showFinancialSnapshot: false,
    showSystemStatus: true,
    showPolicyViolations: false,
  },
  outcome_owner: {
    title: "Outcome Overview",
    description: "Outcome delivery health and items needing attention",
    showNeedsAttention: true,
    showAgentsAtRisk: false,
    showApprovalQueue: true,
    showFinancialSnapshot: false,
    showSystemStatus: false,
    showPolicyViolations: false,
  },
  agent_engineer: {
    title: "Agent Engineer",
    description: "Agent performance and operational health",
    showNeedsAttention: true,
    showAgentsAtRisk: true,
    showApprovalQueue: false,
    showFinancialSnapshot: false,
    showSystemStatus: true,
    showPolicyViolations: false,
  },
  ops_sre: {
    title: "Ops / SRE",
    description: "System operations, incidents, and infrastructure health",
    showNeedsAttention: true,
    showAgentsAtRisk: true,
    showApprovalQueue: true,
    showFinancialSnapshot: false,
    showSystemStatus: true,
    showPolicyViolations: false,
  },
  compliance_security: {
    title: "Compliance / Security",
    description: "Policy enforcement, audit compliance, and regulatory adherence",
    showNeedsAttention: true,
    showAgentsAtRisk: false,
    showApprovalQueue: true,
    showFinancialSnapshot: false,
    showSystemStatus: true,
    showPolicyViolations: true,
  },
  expert_validator: {
    title: "Expert Validator",
    description: "Pending approvals and items requiring expert review",
    showNeedsAttention: true,
    showAgentsAtRisk: true,
    showApprovalQueue: true,
    showFinancialSnapshot: false,
    showSystemStatus: false,
    showPolicyViolations: false,
  },
  finance: {
    title: "Finance Overview",
    description: "Revenue, billing status, and financial performance",
    showNeedsAttention: true,
    showAgentsAtRisk: false,
    showApprovalQueue: false,
    showFinancialSnapshot: true,
    showSystemStatus: false,
    showPolicyViolations: false,
  },
};

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4" data-testid="overview-skeleton">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-3"><Skeleton className="h-12 w-full" /></CardContent></Card>
        ))}
      </div>
      <Card><CardContent className="p-3"><Skeleton className="h-24 w-full" /></CardContent></Card>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardContent className="p-3"><Skeleton className="h-32 w-full" /></CardContent></Card>
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


function PlatformPulseStrip({ data }: { data: OverviewData }) {
  const activeOutcomes = data.outcomeHealth.filter((o) => o.status === "active" || o.status === "agents_assigned").length;
  const totalOutcomes = data.outcomeHealth.length;

  const overallHealth = data.outcomeHealth.length > 0
    ? data.outcomeHealth.reduce((sum, o) => {
        if (o.kpis.length === 0) return sum + 100;
        const avg = o.kpis.reduce((s, k) => s + k.progress, 0) / o.kpis.length;
        return sum + avg;
      }, 0) / data.outcomeHealth.length
    : 0;

  const atRiskKpis = data.outcomeHealth.reduce((count, o) => {
    return count + o.kpis.filter((k) => k.progress < 80).length;
  }, 0);
  const overdueApprovals = data.approvalQueue.items.filter(
    (a) => a.dueDate && new Date(a.dueDate).getTime() < Date.now()
  ).length;
  const agentsWithIncidents = data.agentsAtRisk.filter((a) => a.openIncidents > 0).length;
  const attentionCount = atRiskKpis + overdueApprovals + agentsWithIncidents;

  const healthColor = overallHealth >= 80
    ? "text-emerald-600 dark:text-emerald-400"
    : overallHealth >= 60
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
  const healthBg = overallHealth >= 80
    ? "bg-emerald-500/10"
    : overallHealth >= 60
      ? "bg-amber-500/10"
      : "bg-red-500/10";

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3" data-testid="section-platform-pulse">
      <Link href="/outcomes">
        <Card className="hover-elevate cursor-pointer h-full" data-testid="pulse-active-outcomes">
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground">Active Outcomes</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-semibold tracking-tight">{activeOutcomes}</span>
                  <span className="text-[10px] text-muted-foreground">/ {totalOutcomes}</span>
                </div>
              </div>
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                <Target className="w-3.5 h-3.5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Card data-testid="pulse-overall-health">
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground">Overall Health</span>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-xl font-semibold tracking-tight ${healthColor}`}>
                  {overallHealth.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className={`flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${healthBg}`}>
              <HeartPulse className={`w-3.5 h-3.5 ${healthColor}`} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Link href="/agents">
        <Card className="hover-elevate cursor-pointer h-full" data-testid="pulse-agents-running">
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground">Agents Running</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-semibold tracking-tight">{data.systemStatus.activeAgents}</span>
                  <span className="text-[10px] text-muted-foreground">/ {data.systemStatus.totalAgents}</span>
                </div>
              </div>
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Card data-testid="pulse-attention-items">
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground">Needs Attention</span>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-xl font-semibold tracking-tight ${attentionCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {attentionCount}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {attentionCount === 0 ? "all clear" : "items"}
                </span>
              </div>
            </div>
            <div className={`flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${attentionCount > 0 ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
              <AlertTriangle className={`w-3.5 h-3.5 ${attentionCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface AttentionItem {
  id: string;
  type: "outcome" | "agent" | "approval";
  label: string;
  detail: string;
  severity: number;
  href: string;
  icon: typeof AlertTriangle;
  badgeLabel: string;
  badgeClass: string;
}

function NeedsAttentionSection({ data }: { data: OverviewData }) {
  const items: AttentionItem[] = [];

  data.approvalQueue.items.forEach((a) => {
    if (a.dueDate && new Date(a.dueDate).getTime() < Date.now()) {
      items.push({
        id: `approval-${a.id}`,
        type: "approval",
        label: a.objectName || a.type,
        detail: `Overdue approval — ${a.type.replace(/_/g, " ")}`,
        severity: 0,
        href: `/approvals/${a.id}`,
        icon: Clock,
        badgeLabel: "Overdue",
        badgeClass: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
      });
    }
  });

  data.outcomeHealth.forEach((o) => {
    const worstKpi = o.kpis.filter((k) => k.progress < 80).sort((a, b) => a.progress - b.progress)[0];
    if (worstKpi) {
      items.push({
        id: `outcome-${o.id}`,
        type: "outcome",
        label: o.name,
        detail: `${worstKpi.name} at ${worstKpi.progress.toFixed(0)}% (target: ${worstKpi.target} ${worstKpi.unit})`,
        severity: 1,
        href: `/outcomes/${o.id}`,
        icon: TrendingDown,
        badgeLabel: "At Risk",
        badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
      });
    }
  });

  data.agentsAtRisk.forEach((a) => {
    if (a.openIncidents > 0 || (a.lastDrift && Math.abs(a.lastDrift.driftPercent) > 10)) {
      items.push({
        id: `agent-${a.id}`,
        type: "agent",
        label: a.name,
        detail: a.openIncidents > 0
          ? `${a.openIncidents} open incident${a.openIncidents > 1 ? "s" : ""}`
          : `Drift: ${a.lastDrift!.driftPercent}%`,
        severity: 2,
        href: `/agents/${a.id}`,
        icon: Zap,
        badgeLabel: a.openIncidents > 0 ? "Incidents" : "Drifting",
        badgeClass: a.openIncidents > 0
          ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
          : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
      });
    }
  });

  items.sort((a, b) => a.severity - b.severity);
  const visible = items.slice(0, 5);

  return (
    <Card data-testid="section-needs-attention">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium">Needs Attention</span>
          {items.length > 5 && (
            <Badge variant="secondary" className="text-[10px]">{items.length} total</Badge>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {visible.length > 0 ? (
            visible.map((item) => (
              <Link key={item.id} href={item.href}>
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover-elevate cursor-pointer"
                  data-testid={`attention-item-${item.id}`}
                >
                  <item.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-medium truncate">{item.label}</span>
                  <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">{item.detail}</span>
                  <Badge variant="outline" className={`text-[9px] shrink-0 ml-auto ${item.badgeClass}`}>
                    {item.badgeLabel}
                  </Badge>
                </div>
              </Link>
            ))
          ) : (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-emerald-500/5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-[11px] text-muted-foreground">All systems healthy</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PolicyViolationsSection({ violations, isLoading }: { violations: PolicyViolation[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card data-testid="card-policy-violations" className="h-full">
        <CardContent className="p-3">
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-policy-violations" className="h-full">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">Policy Violations</span>
            {violations.length > 0 && (
              <Badge variant="secondary" className="text-[9px]">{violations.length}</Badge>
            )}
          </div>
          <Link href="/governance">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" data-testid="link-view-governance">
              View All <ArrowRight className="w-3 h-3 ml-0.5" />
            </Button>
          </Link>
        </div>
        <div className="flex flex-col gap-1">
          {violations.length > 0 ? (
            violations.slice(0, 3).map((violation) => (
              <Link key={violation.id} href={`/agents/${violation.agentId}`}>
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover-elevate cursor-pointer"
                  data-testid={`violation-preview-${violation.id}`}
                >
                  <CircleAlert className="w-3 h-3 text-red-500 shrink-0" />
                  <span className="text-[11px] font-medium truncate flex-1">{violation.policyName}</span>
                  <Badge variant="outline" className="text-[9px]">{violation.agentName}</Badge>
                </div>
              </Link>
            ))
          ) : (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-emerald-500/5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-[11px] text-muted-foreground">No violations</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AgentsAtRiskSection({ agents }: { agents: AgentAtRisk[] }) {
  return (
    <Card data-testid="card-agents-at-risk" className="h-full">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium">Agents At Risk</span>
          <Link href="/agents">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" data-testid="link-view-agents">
              View All <ArrowRight className="w-3 h-3 ml-0.5" />
            </Button>
          </Link>
        </div>
        {agents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]" data-testid="table-agents-at-risk">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-2 font-medium text-muted-foreground">Agent</th>
                  <th className="text-left py-1 pr-2 font-medium text-muted-foreground">Risk</th>
                  <th className="text-right py-1 pr-2 font-medium text-muted-foreground">Drift</th>
                  <th className="text-right py-1 font-medium text-muted-foreground">Inc.</th>
                </tr>
              </thead>
              <tbody>
                {agents.slice(0, 5).map((agent) => (
                  <tr key={agent.id} className="border-b last:border-0">
                    <td className="py-1 pr-2">
                      <Link href={`/agents/${agent.id}`}>
                        <span className="font-medium hover:underline cursor-pointer truncate block max-w-[140px]" data-testid={`link-agent-${agent.id}`}>
                          {agent.name}
                        </span>
                      </Link>
                    </td>
                    <td className="py-1 pr-2">
                      <StatusBadge status={agent.riskTier} />
                    </td>
                    <td className="py-1 pr-2 text-right">
                      {agent.lastDrift ? (
                        <span className={agent.lastDrift.driftPercent < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
                          {agent.lastDrift.driftPercent > 0 ? "+" : ""}{agent.lastDrift.driftPercent}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-1 text-right">
                      {agent.openIncidents > 0 ? (
                        <span className="text-red-600 dark:text-red-400 font-medium">{agent.openIncidents}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-emerald-500/5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-[11px] text-muted-foreground">All agents healthy</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApprovalQueueSection({ approvalQueue }: { approvalQueue: OverviewData["approvalQueue"] }) {
  return (
    <Card data-testid="card-approval-queue" className="h-full">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">Approval Queue</span>
            {approvalQueue.totalPending > 0 && (
              <Badge variant="secondary" className="text-[9px]">{approvalQueue.totalPending}</Badge>
            )}
          </div>
          <Link href="/approvals">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" data-testid="link-view-approvals">
              View All <ArrowRight className="w-3 h-3 ml-0.5" />
            </Button>
          </Link>
        </div>
        <div className="flex flex-col gap-1">
          {approvalQueue.items.length > 0 ? (
            approvalQueue.items.slice(0, 4).map((approval) => (
              <Link key={approval.id} href={`/approvals/${approval.id}`}>
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover-elevate cursor-pointer"
                  data-testid={`approval-preview-${approval.id}`}
                >
                  <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-medium truncate flex-1">{approval.objectName || approval.type}</span>
                  {approval.dueDate && (
                    <Badge
                      variant="outline"
                      className={`text-[9px] shrink-0 ${
                        new Date(approval.dueDate).getTime() < Date.now()
                          ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                      }`}
                    >
                      {dueIn(approval.dueDate)}
                    </Badge>
                  )}
                </div>
              </Link>
            ))
          ) : (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-emerald-500/5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-[11px] text-muted-foreground">No pending approvals</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FinancialSnapshotSection({ financialSnapshot }: { financialSnapshot: OverviewData["financialSnapshot"] }) {
  return (
    <Card data-testid="card-financial-snapshot" className="h-full">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium">Financial (30d)</span>
          <Link href="/billing">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" data-testid="link-view-billing">
              Billing <ArrowRight className="w-3 h-3 ml-0.5" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-0.5 p-2 rounded-md bg-emerald-500/5">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Billed</span>
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400" data-testid="text-billed-amount">
              {formatCurrency(financialSnapshot.billed)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 p-2 rounded-md bg-amber-500/5">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Pending</span>
            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400" data-testid="text-pending-amount">
              {formatCurrency(financialSnapshot.pending)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 p-2 rounded-md bg-red-500/5">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Disputed</span>
            <span className="text-sm font-semibold text-red-600 dark:text-red-400" data-testid="text-disputed-amount">
              {formatCurrency(financialSnapshot.disputed)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/50">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Revenue</span>
            <span className="text-sm font-semibold" data-testid="text-total-revenue-30d">
              {formatCurrency(financialSnapshot.totalRevenue30d)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SystemStatusSection({ systemStatus }: { systemStatus: OverviewData["systemStatus"] }) {
  return (
    <Card data-testid="card-system-status" className="h-full">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium">System Status</span>
          <Link href="/monitor">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" data-testid="link-view-monitor">
              Monitor <ArrowRight className="w-3 h-3 ml-0.5" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50" data-testid="status-tool-error-rate">
            <AlertTriangle className="w-3 h-3 text-muted-foreground shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] text-muted-foreground uppercase">Error Rate</span>
              <span className={`text-sm font-semibold ${systemStatus.toolErrorRate > 5 ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
                {systemStatus.toolErrorRate}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50" data-testid="status-queue-depth">
            <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] text-muted-foreground uppercase">Queue</span>
              <span className={`text-sm font-semibold ${systemStatus.queueDepth > 10 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                {systemStatus.queueDepth}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50" data-testid="status-eval-backlog">
            <FlaskConical className="w-3 h-3 text-muted-foreground shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] text-muted-foreground uppercase">Eval Backlog</span>
              <span className={`text-sm font-semibold ${systemStatus.evalBacklog > 5 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                {systemStatus.evalBacklog}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50" data-testid="status-connector-health">
            {systemStatus.connectorHealth >= 80 ? (
              <Wifi className="w-3 h-3 text-muted-foreground shrink-0" />
            ) : (
              <WifiOff className="w-3 h-3 text-red-500 shrink-0" />
            )}
            <div className="flex flex-col">
              <span className="text-[9px] text-muted-foreground uppercase">Connectors</span>
              <span className={`text-sm font-semibold ${systemStatus.connectorHealth < 80 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {systemStatus.connectorHealth}%
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PlatformHero({ industry, role, config }: { industry: any; role: any; config: RoleWidgetConfig }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="text-lg font-semibold tracking-tight whitespace-nowrap" data-testid="text-dashboard-title">
          {config.title}
        </h1>
        <Badge variant="outline" className="text-[10px] shrink-0" data-testid="badge-role-label">{role.label}</Badge>
        {industry && (
          <Badge variant="secondary" className="text-[10px] shrink-0" data-testid="badge-industry-label">
            {industry.shortLabel}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground hidden md:inline truncate">{config.description}</span>
      </div>
      <Link href="/outcomes/discover">
        <Button size="sm" data-testid="button-discover-cta">
          <Sparkles className="w-3.5 h-3.5 mr-1" />
          Outcome Builder
        </Button>
      </Link>
    </div>
  );
}

function KeyCapabilitiesSection() {
  return (
    <div className="flex flex-col gap-3" data-testid="section-key-capabilities">
      <h2 className="text-sm font-medium text-muted-foreground">Key Capabilities</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {PLATFORM_CAPABILITIES.map((cap) => (
          <Link key={cap.title} href={cap.href}>
            <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-capability-${cap.title.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-4 flex gap-3">
                <div className={`flex items-center justify-center w-9 h-9 rounded-md shrink-0 ${cap.bg}`}>
                  <cap.icon className={`w-5 h-5 ${cap.color}`} />
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium">{cap.title}</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">{cap.description}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function TechnologyStackSection() {
  return (
    <div className="flex flex-col gap-3" data-testid="section-technology-stack">
      <h2 className="text-sm font-medium text-muted-foreground">Technology Stack</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {TECHNOLOGY_STACK.map((tech) => (
          <Card key={tech.title} data-testid={`card-tech-${tech.title.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <tech.icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{tech.title}</span>
              </div>
              <span className="text-xs text-muted-foreground leading-relaxed">{tech.description}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {tech.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Overview() {
  const { role } = useRole();
  const { industry } = useIndustry();
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

  const hasOutcomes = data.outcomeHealth.length > 0;

  if (!hasOutcomes && data.agentsAtRisk.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-4" data-testid="page-overview">
        <PlatformHero industry={industry} role={role} config={config} />
        <KeyCapabilitiesSection />
        <TechnologyStackSection />
        <div className="flex flex-col items-center justify-center py-8 gap-3" data-testid="empty-state">
          <div className="flex items-center justify-center w-14 h-14 rounded-md bg-primary/10">
            <Target className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center flex flex-col gap-1">
            <p className="text-base font-medium">Define Your First Outcome Contract</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Bind agents to measurable business outcomes with industry-specific KPIs, adaptive autonomy, and regulatory compliance built in.
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

  const detailPanels: ReactNode[] = [];

  if (config.showAgentsAtRisk) {
    detailPanels.push(<AgentsAtRiskSection key="agents" agents={data.agentsAtRisk} />);
  }
  if (config.showApprovalQueue) {
    detailPanels.push(<ApprovalQueueSection key="approvals" approvalQueue={data.approvalQueue} />);
  }
  if (config.showPolicyViolations) {
    detailPanels.push(<PolicyViolationsSection key="violations" violations={violations || []} isLoading={violationsLoading} />);
  }
  if (config.showFinancialSnapshot) {
    detailPanels.push(<FinancialSnapshotSection key="financial" financialSnapshot={data.financialSnapshot} />);
  }
  if (config.showSystemStatus) {
    detailPanels.push(<SystemStatusSection key="system" systemStatus={data.systemStatus} />);
  }

  const gridCols = detailPanels.length >= 3
    ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
    : detailPanels.length === 2
      ? "grid-cols-1 md:grid-cols-2"
      : "grid-cols-1";

  return (
    <div className="flex flex-col gap-3 p-4" data-testid="page-overview">
      <PlatformHero industry={industry} role={role} config={config} />
      <PlatformPulseStrip data={data} />
      {config.showNeedsAttention && (
        <NeedsAttentionSection data={data} />
      )}
      {detailPanels.length > 0 && (
        <div className={`grid gap-3 ${gridCols}`}>
          {detailPanels}
        </div>
      )}
    </div>
  );
}
