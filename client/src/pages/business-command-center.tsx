import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Target,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Plus,
  ChevronRight,
  Zap,
  DollarSign,
  ThumbsUp,
  ThumbsDown,
  Activity,
  Sparkles,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useRole } from "@/components/role-provider";

interface KpiSummary {
  id: string;
  name: string;
  unit: string;
  current: number;
  target: number;
  progress: number;
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

interface ApprovalItem {
  id: string;
  type: string;
  objectName: string | null;
  objectType: string;
  riskScore: number | null;
  requestedBy: string | null;
  dueDate: string | null;
  createdAt: string | null;
}

interface AuditEvent {
  id: string;
  action: string;
  actorType: string;
  actorId: string;
  objectType: string;
  objectId: string | null;
  details: string | null;
  createdAt: string;
}

interface AuditEventDetails {
  agentName?: string;
  agentId?: string;
  toolCount?: number;
  kbRetrievalCount?: number;
}

function parseDetails(details: string | null): AuditEventDetails {
  if (!details) return {};
  try { return JSON.parse(details); } catch { return {}; }
}

function activityMessage(event: AuditEvent): string | null {
  const d = parseDetails(event.details);
  const workerName = d.agentName ? `"${d.agentName}"` : "A Digital Worker";
  const action = event.action;
  if (action === "provenance.captured" && event.objectType === "run_trace") {
    const toolCount = d.toolCount ?? 0;
    return `${workerName} completed a task${toolCount > 0 ? ` using ${toolCount} tool${toolCount !== 1 ? "s" : ""}` : ""}`;
  }
  if (action.startsWith("approval.") && action.includes("approved")) return "An action you reviewed was approved";
  if (action.startsWith("approval.") && action.includes("rejected")) return "An action was declined";
  if (action.startsWith("approval.") && action.includes("submitted")) return "A new item needs your review";
  if (action === "agent.created" || action === "agent.updated") return `${workerName} was updated`;
  if (action === "blueprint.created") return "A new improvement plan was created";
  if (action === "kpi.updated" || action === "kpi.created") return "A goal metric was updated";
  if (action === "outcome.created" || action === "outcome.updated") return "An AI initiative was updated";
  return null;
}

const WINDOW_24H = 24 * 60 * 60 * 1000;
const WINDOW_7D = 7 * 24 * 60 * 60 * 1000;

function buildActivityFeed(events: AuditEvent[]): { messages: string[]; windowLabel: string } {
  const now = Date.now();
  const last24h = events.filter((e) => now - new Date(e.createdAt).getTime() <= WINDOW_24H);
  const pool = last24h.length >= 2 ? last24h : events.filter((e) => now - new Date(e.createdAt).getTime() <= WINDOW_7D);
  const windowLabel = last24h.length >= 2 ? "in the last 24 hours" : "in the last 7 days";
  const messages = pool
    .map((e) => activityMessage(e))
    .filter((m): m is string => m !== null)
    .slice(0, 5);
  return { messages, windowLabel };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface OverviewData {
  outcomeHealth: OutcomeHealth[];
  agentsAtRisk: Array<{
    id: string;
    name: string;
    openIncidents: number;
    healthScore: number | null;
  }>;
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
    activeAgents: number;
    totalAgents: number;
    pendingApprovals: number;
  };
}

function outcomeBusinessStatus(o: OutcomeHealth): "on-track" | "at-risk" | "needs-review" {
  const hasAtRiskKpi = o.kpis.some((k) => k.progress < 75);
  if (hasAtRiskKpi) return "at-risk";
  if (o.riskTier === "high" || o.slaStatus === "breached") return "needs-review";
  return "on-track";
}

function outcomeProgress(o: OutcomeHealth): number {
  if (o.kpis.length === 0) return 100;
  return Math.round(o.kpis.reduce((s, k) => s + Math.min(k.progress, 100), 0) / o.kpis.length);
}

const STATUS_CONFIG = {
  "on-track": { label: "On Track", pillCls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20", barCls: "bg-emerald-500", borderCls: "border-border" },
  "at-risk": { label: "At Risk", pillCls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20", barCls: "bg-amber-500", borderCls: "border-amber-500/40" },
  "needs-review": { label: "Needs Review", pillCls: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/20", barCls: "bg-violet-500", borderCls: "border-border" },
};

function friendlyApprovalLabel(item: ApprovalItem): string {
  const name = item.objectName || "action";
  const type = item.type.replace(/_/g, " ").toLowerCase();
  if (type.includes("deploy")) return `Review go-live for "${name}"`;
  if (type.includes("policy")) return `Review safety rule change for "${name}"`;
  if (type.includes("blueprint")) return `Approve improvement plan for "${name}"`;
  if (type.includes("agent")) return `Your Digital Worker "${name}" needs a decision`;
  return `Review: ${name}`;
}

function friendlyApprovalDetail(item: ApprovalItem): string {
  const type = item.type.replace(/_/g, " ").toLowerCase();
  if (type.includes("deploy")) return "A change is ready to go live and needs your sign-off";
  if (type.includes("policy")) return "A safety rule has been updated — confirm it matches your expectations";
  if (type.includes("blueprint")) return "An improvement has been proposed — review and approve to activate it";
  return "Something needs your approval before it can continue";
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate).getTime() < Date.now();
}

function MetricTile({ label, value, sub, icon: Icon, colorCls, bgCls, href, testId }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Target;
  colorCls: string;
  bgCls: string;
  href: string;
  testId: string;
}) {
  const [, navigate] = useLocation();
  return (
    <div
      onClick={() => navigate(href)}
      className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-accent/30 cursor-pointer transition-colors"
      data-testid={testId}
    >
      <div className={`flex items-center justify-center w-9 h-9 rounded-md shrink-0 ${bgCls}`}>
        <Icon className={`w-4 h-4 ${colorCls}`} />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-xs text-muted-foreground leading-none mb-0.5">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-xl font-semibold leading-tight ${colorCls}`}>{value}</span>
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

function OutcomeCard({ o }: { o: OutcomeHealth }) {
  const status = outcomeBusinessStatus(o);
  const progress = outcomeProgress(o);
  const cfg = STATUS_CONFIG[status];
  const topKpi = o.kpis[0];

  return (
    <Link href={`/outcomes/${o.id}`}>
      <div
        className={`rounded-lg border bg-card px-4 py-3 hover:bg-accent/20 cursor-pointer transition-colors ${cfg.borderCls}`}
        data-testid={`card-outcome-business-${o.id}`}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="text-sm font-semibold text-foreground truncate">{o.name}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.pillCls}`}>{cfg.label}</span>
            </div>
            {topKpi && (
              <p className="text-xs text-muted-foreground">
                Goal: {topKpi.name} — currently at{" "}
                <span className="font-medium text-foreground">{topKpi.current.toLocaleString()} {topKpi.unit}</span>
                {" "}(target: {topKpi.target.toLocaleString()})
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <span className={`text-lg font-bold ${status === "at-risk" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {progress}%
            </span>
            <p className="text-[10px] text-muted-foreground">to target</p>
          </div>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-1.5 rounded-full transition-all ${cfg.barCls}`} style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
        {o.kpis.length > 1 && (
          <div className="flex items-center gap-3 mt-2 pt-2 border-t">
            {o.kpis.slice(0, 3).map((k) => (
              <div key={k.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                {k.progress >= 80
                  ? <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />
                  : <TrendingDown className="w-3 h-3 text-amber-500 shrink-0" />}
                <span className="truncate max-w-[120px]">{k.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

function ActionCard({ item }: { item: ApprovalItem }) {
  const overdue = isOverdue(item.dueDate);
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-3"
      data-testid={`card-action-business-${item.id}`}
    >
      <div className="flex items-start gap-2">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${overdue ? "bg-red-500/15" : "bg-amber-500/15"}`}>
          <AlertTriangle className={`w-3 h-3 ${overdue ? "text-red-500" : "text-amber-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            {overdue && <span className="text-[10px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full">Overdue</span>}
            <span className="text-xs font-semibold text-foreground">{friendlyApprovalLabel(item)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{friendlyApprovalDetail(item)}</p>
        </div>
      </div>
      <div className="flex gap-2 pl-7">
        <Link href={`/approvals/${item.id}`}>
          <button
            className="flex items-center gap-1 text-xs bg-primary hover:bg-primary/90 text-primary-foreground px-2.5 py-1 rounded-md transition-colors"
            data-testid={`button-approve-${item.id}`}
          >
            <ThumbsUp className="w-3 h-3" />
            Review
          </button>
        </Link>
        <Link href="/my-actions">
          <button
            className="flex items-center gap-1 text-xs border hover:bg-accent px-2.5 py-1 rounded-md transition-colors text-muted-foreground"
            data-testid={`button-skip-${item.id}`}
          >
            <ThumbsDown className="w-3 h-3" />
            Skip
          </button>
        </Link>
      </div>
    </div>
  );
}

function CommandCenterSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6" data-testid="business-command-center-skeleton">
      <Skeleton className="h-7 w-64" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 flex flex-col gap-3">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <div className="lg:col-span-2 flex flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          {[0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      </div>
    </div>
  );
}

export default function BusinessCommandCenter() {
  const { role } = useRole();
  const [, navigate] = useLocation();

  const { data: overviewData, isLoading: overviewLoading } = useQuery<OverviewData>({
    queryKey: ["/api/overview"],
  });

  const { data: auditEvents = [] } = useQuery<AuditEvent[]>({
    queryKey: ["/api/audit-events"],
    staleTime: 120000,
  });

  if (overviewLoading || !overviewData) {
    return <CommandCenterSkeleton />;
  }

  const { outcomeHealth, approvalQueue, financialSnapshot, systemStatus } = overviewData;

  const activeOutcomes = outcomeHealth.filter((o) => o.status === "active" || o.status === "agents_assigned");
  const atRiskOutcomes = outcomeHealth.filter((o) => outcomeBusinessStatus(o) === "at-risk");
  const onTrackOutcomes = outcomeHealth.filter((o) => outcomeBusinessStatus(o) === "on-track");

  const valueThisMonth = financialSnapshot.totalRevenue30d;
  const actionsWaiting = approvalQueue.totalPending;
  const digitalWorkersRunning = systemStatus.activeAgents;

  const urgentActions = approvalQueue.items.filter((a) => isOverdue(a.dueDate));
  const otherActions = approvalQueue.items.filter((a) => !isOverdue(a.dueDate));
  const visibleActions = [...urgentActions, ...otherActions].slice(0, 3);

  const { messages: activityMessages, windowLabel } = buildActivityFeed(auditEvents);

  const today = new Date();
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = today.toLocaleDateString("en-US", { month: "long", day: "numeric" });

  return (
    <div className="flex flex-col gap-5 p-6" data-testid="page-business-command-center">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-business-greeting">
            {dayName}, {monthDay}
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeOutcomes.length} AI initiative{activeOutcomes.length !== 1 ? "s" : ""} running
            {atRiskOutcomes.length > 0 && (
              <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-medium">
                · {atRiskOutcomes.length} need{atRiskOutcomes.length === 1 ? "s" : ""} attention
              </span>
            )}
          </p>
        </div>
        <Button
          onClick={() => navigate("/outcomes/discover")}
          className="gap-2"
          data-testid="button-start-new-outcome"
        >
          <Plus className="w-4 h-4" />
          Start a new outcome
        </Button>
      </div>

      {/* Metric strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3" data-testid="section-business-metrics">
        <MetricTile
          label="AI Initiatives running"
          value={activeOutcomes.length}
          sub={`/ ${outcomeHealth.length} total`}
          icon={Target}
          colorCls="text-primary"
          bgCls="bg-primary/10"
          href="/outcomes"
          testId="metric-initiatives-running"
        />
        <MetricTile
          label="Value generated this month"
          value={valueThisMonth > 0 ? `$${(valueThisMonth / 1000).toFixed(0)}K` : "—"}
          sub={valueThisMonth > 0 ? "from your initiatives" : "tracking"}
          icon={DollarSign}
          colorCls="text-emerald-600 dark:text-emerald-400"
          bgCls="bg-emerald-500/10"
          href="/outcomes"
          testId="metric-value-generated"
        />
        <MetricTile
          label="Actions waiting for you"
          value={actionsWaiting}
          sub={actionsWaiting > 0 ? (urgentActions.length > 0 ? `${urgentActions.length} overdue` : "to review") : "all clear"}
          icon={CheckCircle2}
          colorCls={actionsWaiting > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}
          bgCls={actionsWaiting > 0 ? "bg-amber-500/10" : "bg-emerald-500/10"}
          href="/my-actions"
          testId="metric-actions-waiting"
        />
        <MetricTile
          label="Digital Workers active"
          value={digitalWorkersRunning}
          sub={`/ ${systemStatus.totalAgents} total`}
          icon={Zap}
          colorCls="text-primary"
          bgCls="bg-primary/10"
          href="/outcomes"
          testId="metric-workers-active"
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: Your AI Initiatives */}
        <div className="lg:col-span-3 flex flex-col gap-3" data-testid="section-business-outcomes">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Your AI Initiatives</h2>
            <Link href="/outcomes">
              <span className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                View all <ChevronRight className="w-3 h-3" />
              </span>
            </Link>
          </div>

          {outcomeHealth.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 rounded-lg border border-dashed bg-muted/30" data-testid="empty-outcomes-business">
              <Target className="w-8 h-8 text-muted-foreground/40" />
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">No AI initiatives yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Start by defining an outcome — what business goal should AI help you achieve?</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate("/outcomes/discover")} data-testid="button-discover-outcomes">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Start a new outcome
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* At-risk first */}
              {atRiskOutcomes.map((o) => <OutcomeCard key={o.id} o={o} />)}
              {/* Then on-track */}
              {onTrackOutcomes.map((o) => <OutcomeCard key={o.id} o={o} />)}
              {/* Needs review last */}
              {outcomeHealth
                .filter((o) => outcomeBusinessStatus(o) === "needs-review")
                .map((o) => <OutcomeCard key={o.id} o={o} />)}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Actions needing attention */}
          <div className="flex flex-col gap-3" data-testid="section-business-actions">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Needs your attention
                {actionsWaiting > 0 && (
                  <span className="ml-2 text-[10px] font-bold bg-amber-500 text-white rounded-full px-1.5 py-0.5">
                    {actionsWaiting > 99 ? "99+" : actionsWaiting}
                  </span>
                )}
              </h2>
              {actionsWaiting > 3 && (
                <Link href="/my-actions">
                  <span className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                    View all <ChevronRight className="w-3 h-3" />
                  </span>
                </Link>
              )}
            </div>

            {visibleActions.length === 0 ? (
              <div className="flex items-center gap-2.5 px-3 py-3 rounded-lg border bg-emerald-500/5 border-emerald-500/20" data-testid="all-clear-actions">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-sm text-muted-foreground">All clear — nothing needs your review right now</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {visibleActions.map((item) => <ActionCard key={item.id} item={item} />)}
              </div>
            )}
          </div>

          {/* Recent accomplishments */}
          <div className="flex flex-col gap-3" data-testid="section-business-activity">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                What got done
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">{windowLabel}</span>
              </h2>
            </div>
            <div className="rounded-lg border bg-card divide-y" data-testid="list-activity-feed">
              {activityMessages.length === 0 ? (
                <div className="flex items-center gap-2.5 px-4 py-3">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                  <p className="text-xs text-muted-foreground">Your Digital Workers haven't logged activity recently</p>
                </div>
              ) : (
                activityMessages.map((msg, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 px-4 py-2.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary/60 shrink-0 mt-0.5" />
                    <p className="text-xs text-foreground/80">{msg}</p>
                  </div>
                ))
              )}
              {digitalWorkersRunning > 0 && (
                <div className="flex items-center gap-2.5 px-4 py-2.5 bg-emerald-500/5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">{digitalWorkersRunning}</span> Digital Worker{digitalWorkersRunning !== 1 ? "s" : ""} currently active
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick CTA */}
          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-4 flex flex-col items-center gap-2 text-center" data-testid="cta-new-outcome">
            <Plus className="w-5 h-5 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">Have a new business goal you'd like AI to help with?</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/outcomes/discover")} data-testid="button-discover-outcomes-cta">
              Start a new outcome
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
