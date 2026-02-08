import { Zap } from "lucide-react";

export interface BlastRadiusData {
  affectedUsers?: number;
  affectedRunsPerDay?: number;
  revenueExposure?: string;
  environment?: string;
  downstreamAgents?: number;
  rollbackTimeEstimate?: string;
}

interface BlastRadiusProps {
  data: BlastRadiusData;
  testIdPrefix?: string;
}

const metrics: Array<{
  key: keyof BlastRadiusData;
  label: string;
  format: (val: unknown) => string;
}> = [
  { key: "affectedUsers", label: "Users Affected", format: (v) => Number(v).toLocaleString() },
  { key: "affectedRunsPerDay", label: "Runs / Day", format: (v) => Number(v).toLocaleString() },
  { key: "revenueExposure", label: "Revenue Exposure", format: (v) => String(v) },
  { key: "environment", label: "Environment", format: (v) => String(v) },
  { key: "downstreamAgents", label: "Downstream Agents", format: (v) => String(v) },
  { key: "rollbackTimeEstimate", label: "Rollback Time", format: (v) => String(v) },
];

export function BlastRadius({ data, testIdPrefix = "blast" }: BlastRadiusProps) {
  const activeMetrics = metrics.filter((m) => data[m.key] != null);

  if (activeMetrics.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" data-testid={`${testIdPrefix}-blast-radius`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Zap className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Blast Radius</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {activeMetrics.map((m) => (
          <div
            key={m.key}
            className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/20"
            data-testid={`${testIdPrefix}-${m.key}`}
          >
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</span>
            <span className={`text-sm font-semibold ${m.key === "environment" ? "capitalize" : ""}`}>
              {m.format(data[m.key])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
