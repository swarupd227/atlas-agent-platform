import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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

interface ApprovalQueue {
  approvalQueue: {
    items: ApprovalItem[];
    totalPending: number;
  };
}

function friendlyLabel(item: ApprovalItem): string {
  const name = item.objectName || "action";
  const type = item.type.replace(/_/g, " ").toLowerCase();
  if (type.includes("deploy")) return `Review deployment of "${name}"`;
  if (type.includes("policy")) return `Review policy change for "${name}"`;
  if (type.includes("blueprint")) return `Approve design change for "${name}"`;
  if (type.includes("agent")) return `Your Digital Worker "${name}" needs a decision`;
  return `Review: ${name}`;
}

function friendlyDetail(item: ApprovalItem): string {
  const type = item.type.replace(/_/g, " ").toLowerCase();
  if (type.includes("deploy")) return "A change is ready to go live and needs your approval";
  if (type.includes("policy")) return "A safety rule has been updated — confirm it matches your expectations";
  if (type.includes("blueprint")) return "An improvement has been proposed — review and approve to activate it";
  return "Something needs your approval before it can continue";
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate).getTime() < Date.now();
}

function ActionRow({ item }: { item: ApprovalItem }) {
  const overdue = isOverdue(item.dueDate);
  return (
    <div
      className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-accent/20 transition-colors"
      data-testid={`action-item-${item.id}`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${overdue ? "bg-red-500/10" : "bg-amber-500/10"}`}>
        <AlertTriangle className={`w-4 h-4 ${overdue ? "text-red-500" : "text-amber-500"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          {overdue && (
            <span className="text-[10px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full">Overdue</span>
          )}
          <span className="text-sm font-semibold text-foreground">{friendlyLabel(item)}</span>
        </div>
        <p className="text-xs text-muted-foreground mb-2">{friendlyDetail(item)}</p>
        <div className="flex items-center gap-2">
          <Link href={`/approvals/${item.id}`}>
            <button
              className="flex items-center gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-md transition-colors font-medium"
              data-testid={`button-review-${item.id}`}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
              Review
            </button>
          </Link>
          <button
            className="flex items-center gap-1.5 text-xs border hover:bg-accent px-3 py-1.5 rounded-md transition-colors text-muted-foreground"
            data-testid={`button-skip-action-${item.id}`}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
            Skip for now
          </button>
          <span className="text-xs text-muted-foreground ml-auto">{timeAgo(item.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

export default function MyActions() {
  const { data: overviewData, isLoading } = useQuery<ApprovalQueue>({
    queryKey: ["/api/overview"],
  });

  const items = overviewData?.approvalQueue.items ?? [];
  const totalPending = overviewData?.approvalQueue.totalPending ?? 0;

  const overdue = items.filter((i) => isOverdue(i.dueDate));
  const pending = items.filter((i) => !isOverdue(i.dueDate));

  return (
    <div className="flex flex-col gap-5 p-6" data-testid="page-my-actions">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-my-actions-title">My Actions</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : totalPending > 0
              ? `${totalPending} item${totalPending !== 1 ? "s" : ""} waiting for your review`
              : "Nothing needs your attention right now"}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 rounded-lg border border-dashed bg-muted/30" data-testid="empty-my-actions">
          <CheckCircle2 className="w-10 h-10 text-emerald-500/50" />
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">You're all caught up</p>
            <p className="text-xs text-muted-foreground mt-0.5">Your Digital Workers will let you know when something needs attention</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 max-w-2xl">
          {overdue.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Overdue</span>
                <div className="flex-1 h-px bg-red-500/20" />
              </div>
              <div className="flex flex-col gap-2">
                {overdue.map((item) => <ActionRow key={item.id} item={item} />)}
              </div>
            </div>
          )}
          {pending.length > 0 && (
            <div>
              {overdue.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">To review</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                {pending.map((item) => <ActionRow key={item.id} item={item} />)}
              </div>
            </div>
          )}
          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground">
              The full action inbox with Learning Mode controls is coming in the next update.{" "}
              <Link href="/approvals">
                <span className="underline hover:text-foreground transition-colors">View all approvals</span>
              </Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
