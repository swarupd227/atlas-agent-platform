import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  ThumbsUp,
  ThumbsDown,
  ChevronRight,
  Bell,
  ArrowRight,
  CheckCheck,
  CircleX,
  Filter,
  ShieldAlert,
  Zap,
} from "lucide-react";
import type { OutcomeContract } from "@shared/schema";

type ItemCategory = "approval" | "alert" | "recommendation" | "autonomy_escalation" | "governance";

interface ActionItem {
  id: string;
  source: "approval" | "alert" | "recommendation";
  category: ItemCategory;
  sourceId: string;
  title: string;
  context: string;
  urgency: "urgent" | "today" | "this_week";
  businessImpact: string | null;
  agentAttribution: string | null;
  agentId: string | null;
  outcomeId: string | null;
  createdAt: string | null;
}

interface CompletedItem extends ActionItem {
  decidedAt: string | null;
  decision: "approved" | "dismissed";
}

interface MyActionsData {
  needsDecisionCount: number;
  fyiCount: number;
  completedTodayCount: number;
  needsDecision: ActionItem[];
  fyi: ActionItem[];
  completedToday: CompletedItem[];
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const urgencyConfig = {
  urgent: {
    label: "Urgent",
    className: "bg-red-500/10 text-red-600 dark:text-red-400",
    dot: "bg-red-500",
  },
  today: {
    label: "Today",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  this_week: {
    label: "This week",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
  },
};

const categoryConfig: Record<ItemCategory, { label: string; icon: typeof ShieldAlert; className: string }> = {
  autonomy_escalation: {
    label: "Digital Worker request",
    icon: Zap,
    className: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  governance: {
    label: "Policy",
    icon: ShieldAlert,
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  approval: {
    label: "Review needed",
    icon: CheckCircle2,
    className: "bg-muted text-muted-foreground",
  },
  alert: {
    label: "Alert",
    icon: AlertTriangle,
    className: "bg-muted text-muted-foreground",
  },
  recommendation: {
    label: "Suggestion",
    icon: Info,
    className: "bg-muted text-muted-foreground",
  },
};

function actionLink(item: ActionItem): string {
  if (item.source === "approval") return `/approvals/${item.sourceId}`;
  if (item.source === "alert") return `/observability`;
  return `/improvements`;
}

function NeedsDecisionCard({ item }: { item: ActionItem }) {
  const { toast } = useToast();
  const cfg = urgencyConfig[item.urgency];
  const cat = categoryConfig[item.category];

  const approveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/my-actions/decide", {
        source: item.source,
        sourceId: item.sourceId,
        decision: "approved",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-actions"] });
      toast({ title: "Done", description: "Your decision has been saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/my-actions/decide", {
        source: item.source,
        sourceId: item.sourceId,
        decision: item.source === "approval" ? "rejected" : "dismissed",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-actions"] });
      toast({ title: "Dismissed", description: "Item marked as not needed." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't dismiss", description: err.message, variant: "destructive" });
    },
  });

  const isPending = approveMutation.isPending || dismissMutation.isPending;

  return (
    <Card
      className="px-4 py-3.5 flex flex-col gap-2.5 hover:shadow-sm transition-shadow"
      data-testid={`card-needs-decision-${item.id}`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
          item.urgency === "urgent" ? "bg-red-500/10" : "bg-amber-500/10"
        }`}>
          <AlertTriangle className={`w-3.5 h-3.5 ${
            item.urgency === "urgent" ? "text-red-500" : "text-amber-500"
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${cfg.className}`}
              data-testid={`badge-urgency-${item.id}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
            {(item.category === "autonomy_escalation" || item.category === "governance") && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1 ${cat.className}`}
                data-testid={`badge-category-${item.id}`}
              >
                <cat.icon className="w-2.5 h-2.5" />
                {cat.label}
              </span>
            )}
            {item.agentAttribution && (
              <span className="text-[10px] text-muted-foreground">
                {item.source === "approval" ? "Needs your review" : `from ${item.agentAttribution}`}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground leading-snug mb-0.5" data-testid={`text-title-${item.id}`}>
            {item.title}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed" data-testid={`text-context-${item.id}`}>
            {item.context}
          </p>
          {item.businessImpact && (
            <p className="text-xs font-medium text-foreground/70 mt-1 flex items-center gap-1" data-testid={`text-impact-${item.id}`}>
              <span className="w-1 h-1 rounded-full bg-current shrink-0" />
              {item.businessImpact}
            </p>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0 mt-1">{timeAgo(item.createdAt)}</span>
      </div>

      <div className="flex items-center gap-2 pl-10">
        {item.source === "approval" ? (
          <>
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => approveMutation.mutate()}
              disabled={isPending}
              data-testid={`button-approve-${item.id}`}
            >
              <ThumbsUp className="w-3 h-3 mr-1.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-3"
              onClick={() => dismissMutation.mutate()}
              disabled={isPending}
              data-testid={`button-reject-${item.id}`}
            >
              <ThumbsDown className="w-3 h-3 mr-1.5" />
              Reject
            </Button>
            <Link href={actionLink(item)}>
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
                data-testid={`link-view-${item.id}`}
              >
                Details
                <ChevronRight className="w-3 h-3" />
              </button>
            </Link>
          </>
        ) : item.source === "recommendation" ? (
          <>
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => approveMutation.mutate()}
              disabled={isPending}
              data-testid={`button-apply-${item.id}`}
            >
              <CheckCircle2 className="w-3 h-3 mr-1.5" />
              Apply fix
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-3"
              onClick={() => dismissMutation.mutate()}
              disabled={isPending}
              data-testid={`button-skip-${item.id}`}
            >
              Skip for now
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => approveMutation.mutate()}
              disabled={isPending}
              data-testid={`button-acknowledge-${item.id}`}
            >
              <CheckCircle2 className="w-3 h-3 mr-1.5" />
              Got it
            </Button>
            <Link href={actionLink(item)}>
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid={`link-view-alert-${item.id}`}
              >
                Details
                <ChevronRight className="w-3 h-3" />
              </button>
            </Link>
          </>
        )}
      </div>
    </Card>
  );
}

function FyiCard({ item }: { item: ActionItem }) {
  const { toast } = useToast();
  const cfg = urgencyConfig[item.urgency];

  const dismissMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/my-actions/decide", {
        source: item.source,
        sourceId: item.sourceId,
        decision: "dismissed",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-actions"] });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't dismiss", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card
      className="px-4 py-3 flex items-start gap-3 hover:shadow-sm transition-shadow"
      data-testid={`card-fyi-${item.id}`}
    >
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 bg-blue-500/10">
        <Info className="w-3.5 h-3.5 text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.className}`}>
            {cfg.label}
          </span>
          {item.agentAttribution && (
            <span className="text-[10px] text-muted-foreground">{item.agentAttribution}</span>
          )}
        </div>
        <p className="text-sm font-medium text-foreground leading-snug" data-testid={`text-fyi-title-${item.id}`}>
          {item.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-fyi-context-${item.id}`}>
          {item.context}
        </p>
        {item.businessImpact && (
          <p className="text-xs font-medium text-foreground/70 mt-1 flex items-center gap-1" data-testid={`text-fyi-impact-${item.id}`}>
            <span className="w-1 h-1 rounded-full bg-current shrink-0" />
            {item.businessImpact}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        <span className="text-[10px] text-muted-foreground">{timeAgo(item.createdAt)}</span>
        <button
          onClick={() => dismissMutation.mutate()}
          disabled={dismissMutation.isPending}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Dismiss"
          data-testid={`button-fyi-dismiss-${item.id}`}
        >
          <CircleX className="w-3.5 h-3.5" />
        </button>
      </div>
    </Card>
  );
}

function CompletedCard({ item }: { item: CompletedItem }) {
  const approved = item.decision === "approved";
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-muted/30 border border-dashed"
      data-testid={`card-completed-${item.id}`}
    >
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
        approved ? "bg-emerald-500/15" : "bg-muted"
      }`}>
        {approved ? (
          <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
        ) : (
          <ThumbsDown className="w-3 h-3 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground truncate" data-testid={`text-completed-title-${item.id}`}>
          {item.title}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[10px] font-medium ${approved ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
          {approved ? "Approved" : "Dismissed"}
        </span>
        <span className="text-[10px] text-muted-foreground">{timeAgo(item.decidedAt)}</span>
      </div>
    </div>
  );
}

function SectionHeader({ label, count, icon: Icon, color }: {
  label: string;
  count: number;
  icon: typeof AlertTriangle;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={`w-5 h-5 rounded flex items-center justify-center ${color}`}>
        <Icon className="w-3 h-3" />
      </div>
      <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{label}</span>
      {count > 0 && (
        <span className="text-[10px] font-bold bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
          {count}
        </span>
      )}
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

type UrgencyFilter = "all" | "urgent" | "today" | "this_week";

export default function MyActions() {
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");

  const { data, isLoading } = useQuery<MyActionsData>({
    queryKey: ["/api/my-actions"],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: outcomes } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
    staleTime: 120000,
  });

  const allNeedsDecision = data?.needsDecision ?? [];
  const allFyi = data?.fyi ?? [];
  const completedToday = data?.completedToday ?? [];
  const needsDecisionCount = data?.needsDecisionCount ?? 0;

  const filterItem = (item: ActionItem) => {
    if (urgencyFilter !== "all" && item.urgency !== urgencyFilter) return false;
    if (outcomeFilter !== "all" && item.outcomeId !== outcomeFilter) return false;
    return true;
  };

  const needsDecision = allNeedsDecision.filter(filterItem);
  const fyi = allFyi.filter(filterItem);

  const hasAnything = allNeedsDecision.length > 0 || allFyi.length > 0 || completedToday.length > 0;
  const hasFiltered = needsDecision.length > 0 || fyi.length > 0 || completedToday.length > 0;
  const isFiltering = urgencyFilter !== "all" || outcomeFilter !== "all";

  const outcomeOptions = outcomes ?? [];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl" data-testid="page-my-actions">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-my-actions-title">
            My Actions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-my-actions-subtitle">
            {isLoading
              ? "Loading…"
              : needsDecisionCount > 0
              ? `${needsDecisionCount} item${needsDecisionCount !== 1 ? "s" : ""} waiting for your decision`
              : "Nothing needs your decision right now"}
          </p>
        </div>
        {!isLoading && needsDecisionCount > 0 && (
          <span
            className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1.5 rounded-full"
            data-testid="badge-needs-decision-count"
          >
            <Bell className="w-3 h-3" />
            {needsDecisionCount} pending
          </span>
        )}
      </div>

      {!isLoading && hasAnything && (
        <div className="flex items-center gap-2 flex-wrap" data-testid="filter-bar">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Select
            value={urgencyFilter}
            onValueChange={(v) => setUrgencyFilter(v as UrgencyFilter)}
          >
            <SelectTrigger className="h-7 w-32 text-xs" data-testid="select-urgency-filter">
              <SelectValue placeholder="Urgency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All urgency</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this_week">This week</SelectItem>
            </SelectContent>
          </Select>
          {outcomeOptions.length > 0 && (
            <Select
              value={outcomeFilter}
              onValueChange={(v) => setOutcomeFilter(v)}
            >
              <SelectTrigger className="h-7 w-44 text-xs" data-testid="select-outcome-filter">
                <SelectValue placeholder="All goals" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All goals</SelectItem>
                {outcomeOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isFiltering && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
              onClick={() => { setUrgencyFilter("all"); setOutcomeFilter("all"); }}
              data-testid="button-clear-filters"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : !hasAnything ? (
        <div
          className="flex flex-col items-center justify-center gap-3 py-16 rounded-xl border border-dashed bg-muted/20"
          data-testid="empty-my-actions"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">You're all caught up</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your Digital Workers will notify you when something needs attention.
            </p>
          </div>
        </div>
      ) : !hasFiltered ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 rounded-xl border border-dashed bg-muted/10" data-testid="empty-filtered">
          <p className="text-sm text-muted-foreground">No items match these filters.</p>
          <button
            className="text-xs underline text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => { setUrgencyFilter("all"); setOutcomeFilter("all"); }}
            data-testid="button-clear-filter"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {needsDecision.length > 0 && (
            <section data-testid="section-needs-decision">
              <SectionHeader
                label="Needs Your Decision"
                count={needsDecision.length}
                icon={AlertTriangle}
                color="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              />
              <div className="flex flex-col gap-3">
                {needsDecision.map((item) => (
                  <NeedsDecisionCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          {fyi.length > 0 && (
            <section data-testid="section-fyi">
              <SectionHeader
                label="Just So You Know"
                count={fyi.length}
                icon={Info}
                color="bg-blue-500/10 text-blue-600 dark:text-blue-400"
              />
              <div className="flex flex-col gap-2">
                {fyi.map((item) => (
                  <FyiCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          {completedToday.length > 0 && (
            <section data-testid="section-completed-today">
              <SectionHeader
                label="Completed Today"
                count={completedToday.length}
                icon={CheckCheck}
                color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              />
              <div className="flex flex-col gap-2">
                {completedToday.map((item) => (
                  <CompletedCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-muted-foreground">Need more detail?</span>
            <div className="flex items-center gap-3">
              <Link href="/approvals">
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-all-approvals"
                >
                  All approvals
                  <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
              <Link href="/observability">
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-all-alerts"
                >
                  All alerts
                  <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
