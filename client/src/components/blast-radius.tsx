import { Zap, Info } from "lucide-react";

/**
 * What a deployment change touches, as counted on the server
 * (server/blast-radius.ts). Older approvals carry the previous shape, whose
 * "users affected" and "runs per day" were projections with nothing behind
 * them, so those fields are read but labelled as the estimates they were.
 */
export interface BlastRadiusData {
  environment?: string;
  /** Runs actually recorded in the last 24 hours. */
  runsLast24h?: number;
  runsBasis?: "last_24h" | "not_enough_history";
  traceHistoryHours?: number | null;
  revenueExposure?: string | null;
  downstreamAgents?: number | null;
  rollbackTimeEstimate?: string | null;
  boundOutcomes?: string[];
  /** What the server could not measure, and why. */
  notMeasured?: string[];
  riskSummary?: string;
  /** Present only on records written before this was counted. */
  affectedUsers?: number;
  affectedRunsPerDay?: number;
  totalUsersAffected?: number;
}

interface BlastRadiusProps {
  data: BlastRadiusData;
  testIdPrefix?: string;
}

export function BlastRadius({ data, testIdPrefix = "blast" }: BlastRadiusProps) {
  const legacyUsers = data.totalUsersAffected ?? data.affectedUsers;
  const tiles: Array<{ key: string; label: string; value: string; hint?: string }> = [];

  if (data.environment) tiles.push({ key: "environment", label: "Environment", value: data.environment });
  if (data.runsBasis === "last_24h") {
    tiles.push({ key: "runs", label: "Runs, last 24h", value: Number(data.runsLast24h ?? 0).toLocaleString() });
  } else if (data.runsBasis === "not_enough_history") {
    tiles.push({
      key: "runs",
      label: "Runs, last 24h",
      value: Number(data.runsLast24h ?? 0).toLocaleString(),
      hint: data.traceHistoryHours == null ? "no runs recorded yet" : `only ${data.traceHistoryHours}h of history`,
    });
  } else if (data.affectedRunsPerDay != null) {
    tiles.push({ key: "runs", label: "Runs / day", value: Number(data.affectedRunsPerDay).toLocaleString(), hint: "estimated, from an older record" });
  }
  if (data.revenueExposure) tiles.push({ key: "revenue", label: "Revenue exposure", value: data.revenueExposure });
  if (data.downstreamAgents != null) tiles.push({ key: "downstream", label: "Downstream agents", value: String(data.downstreamAgents) });
  if (data.rollbackTimeEstimate) tiles.push({ key: "rollback", label: "Rollback window", value: data.rollbackTimeEstimate });
  if (legacyUsers != null) tiles.push({ key: "users", label: "People affected", value: Number(legacyUsers).toLocaleString(), hint: "estimated, from an older record" });

  if (tiles.length === 0 && !data.notMeasured?.length) return null;

  return (
    <div className="flex flex-col gap-2" data-testid={`${testIdPrefix}-blast-radius`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Zap className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Blast radius</span>
      </div>
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {tiles.map((t) => (
            <div key={t.key} className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20" data-testid={`${testIdPrefix}-${t.key}`}>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t.label}</span>
              <span className={`text-sm font-semibold ${t.key === "environment" ? "capitalize" : ""}`}>{t.value}</span>
              {t.hint && <span className="text-[10px] text-muted-foreground">{t.hint}</span>}
            </div>
          ))}
        </div>
      )}
      {data.boundOutcomes && data.boundOutcomes.length > 0 && (
        <div className="text-[11px] text-muted-foreground" data-testid={`${testIdPrefix}-outcomes`}>
          Outcomes bound: {data.boundOutcomes.join(", ")}
        </div>
      )}
      {data.notMeasured && data.notMeasured.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground" data-testid={`${testIdPrefix}-not-measured`}>
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          <span>Not measured: {data.notMeasured.join("; ")}.</span>
        </div>
      )}
    </div>
  );
}
