import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  healthy: { label: "Healthy", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  deployed: { label: "Deployed", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  completed: { label: "Completed", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  approved: { label: "Approved", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  paid: { label: "Paid", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  pending: { label: "Pending", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  warning: { label: "Warning", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  blocked: { label: "Blocked", className: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  canary: { label: "Canary", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  rolling_out: { label: "Rolling Out", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  draft: { label: "Draft", className: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20" },
  staging: { label: "Staging", className: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  pilot: { label: "Pilot", className: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" },
  prod: { label: "Production", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  failed: { label: "Failed", className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
  error: { label: "Error", className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
  rejected: { label: "Rejected", className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
  promoted: { label: "Promoted", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  rolled_back: { label: "Rolled Back", className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
  deprecated: { label: "Deprecated", className: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20" },
  overdue: { label: "Overdue", className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
  HIGH: { label: "High Risk", className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
  MEDIUM: { label: "Medium Risk", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  LOW: { label: "Low Risk", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  autonomous: { label: "Autonomous", className: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20" },
  assisted: { label: "Assisted", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  manual: { label: "Manual", className: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, className: "bg-muted text-muted-foreground" };

  return (
    <Badge
      variant="outline"
      className={cn("text-[11px] font-medium border", config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
