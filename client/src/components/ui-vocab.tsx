/**
 * Shared UI vocabulary — canonical renderings for the platform's recurring
 * concepts. UX-audit remediation:
 *   F-1  <MetricValue>  — no-data grammar (— + "No data yet", no fake trends)
 *   F-2  <QueryBoundary>, <EmptyState> — loading / error / empty coverage
 *   F-9  <RiskBadge>, <StatusChip> — one implementation instead of 14 copies
 */

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, RefreshCw, Inbox, TrendingUp, TrendingDown } from "lucide-react";
import { humanizeEnum } from "@/lib/format";

// ─── RiskBadge ────────────────────────────────────────────────────────────────

const RISK_STYLES: Record<string, string> = {
  LOW: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800",
  CRITICAL: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
};

/** Canonical risk-tier badge. Case-insensitive input ("HIGH", "high", "High"). */
export function RiskBadge({ tier, className = "" }: { tier: string | null | undefined; className?: string }) {
  const key = String(tier ?? "").toUpperCase();
  const style = RISK_STYLES[key] ?? "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={`${style} ${className}`} data-testid="badge-risk-tier">
      {key ? humanizeEnum(key.toLowerCase()) : "—"} Risk
    </Badge>
  );
}

// ─── StatusChip ───────────────────────────────────────────────────────────────

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default", deployed: "default", completed: "default", approved: "default", published: "default",
  pending: "outline", pending_review: "outline", awaiting_agent_plan: "outline", draft: "secondary",
  running: "secondary", paused: "secondary",
  failed: "destructive", error: "destructive", denied: "destructive", deprecated: "destructive",
};

/** Canonical status chip — humanizes raw enums so `pending_review` never reaches the user. */
export function StatusChip({ status, className = "" }: { status: string | null | undefined; className?: string }) {
  const key = String(status ?? "").toLowerCase();
  return (
    <Badge variant={STATUS_VARIANTS[key] ?? "outline"} className={className} data-testid={`chip-status-${key || "none"}`}>
      {humanizeEnum(status)}
    </Badge>
  );
}

// ─── MetricValue — the no-data grammar ───────────────────────────────────────

interface MetricValueProps {
  /** The aggregate value (e.g. success rate). */
  value: number | null | undefined;
  /** Whether underlying source data exists (e.g. totalRuns > 0). Gates EVERYTHING. */
  hasData: boolean;
  unit?: string;
  decimals?: number;
  /** Period-over-period delta — rendered ONLY when hasData and delta != null. */
  delta?: number | null;
  className?: string;
}

/**
 * A metric with no underlying data renders as a muted em-dash with "No data
 * yet" — never 0%, never a trend arrow, never a filled chart. This is the
 * audit's F-1 rule: a number and its adornments must come from the same data.
 */
export function MetricValue({ value, hasData, unit = "", decimals, delta, className = "" }: MetricValueProps) {
  if (!hasData || value == null || isNaN(value)) {
    return (
      <div className={className} data-testid="metric-no-data">
        <span className="text-2xl font-semibold text-muted-foreground/60">—</span>
        <span className="block text-[11px] text-muted-foreground mt-0.5">No data yet</span>
      </div>
    );
  }
  const d = decimals ?? (Number.isInteger(value) ? 0 : 1);
  const showDelta = delta != null && !isNaN(delta);
  return (
    <div className={className} data-testid="metric-value">
      <span className="text-2xl font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value.toFixed(d)}{unit}
      </span>
      {showDelta && (
        <span
          className={`ml-2 inline-flex items-center gap-0.5 text-xs font-medium ${delta! >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
          data-testid="metric-delta"
        >
          {delta! >= 0 ? <TrendingUp className="w-3 h-3" aria-hidden="true" /> : <TrendingDown className="w-3 h-3" aria-hidden="true" />}
          {delta! >= 0 ? "+" : ""}{delta!.toFixed(1)}{unit}
        </span>
      )}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  cta?: { label: string; onClick: () => void };
  className?: string;
}

/** Designed empty state with an actionable next step (audit F-2). */
export function EmptyState({ icon, title, description, cta, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 px-6 text-center ${className}`} data-testid="empty-state">
      <div className="text-muted-foreground">{icon ?? <Inbox className="w-8 h-8" aria-hidden="true" />}</div>
      <div className="flex flex-col gap-1 max-w-sm">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {cta && (
        <Button size="sm" onClick={cta.onClick} data-testid="empty-state-cta">
          {cta.label}
        </Button>
      )}
    </div>
  );
}

// ─── QueryBoundary ────────────────────────────────────────────────────────────

interface QueryBoundaryProps {
  isLoading: boolean;
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Skeleton shown while loading; defaults to a generic block. */
  skeleton?: ReactNode;
  children: ReactNode;
}

/**
 * Wraps a query-backed region with loading and error coverage (audit F-2).
 *   <QueryBoundary isLoading={q.isLoading} isError={q.isError} onRetry={q.refetch}>
 *     …content…
 *   </QueryBoundary>
 */
export function QueryBoundary({ isLoading, isError, error, onRetry, skeleton, children }: QueryBoundaryProps) {
  if (isLoading) {
    return <>{skeleton ?? (
      <div className="flex flex-col gap-3 py-4" data-testid="query-loading">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    )}</>;
  }
  if (isError) {
    const message = error instanceof Error ? error.message : "The request failed.";
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 px-6 text-center" data-testid="query-error">
        <AlertTriangle className="w-7 h-7 text-destructive" aria-hidden="true" />
        <div className="flex flex-col gap-1 max-w-sm">
          <p className="text-sm font-medium">Couldn't load this section</p>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} data-testid="query-retry">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            Retry
          </Button>
        )}
      </div>
    );
  }
  return <>{children}</>;
}
