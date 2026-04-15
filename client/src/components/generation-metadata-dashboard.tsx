import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, RefreshCw, Gauge, Database, Clock, Zap, AlertTriangle } from "lucide-react";
import type { GenerationMetadataRecord } from "@shared/schema";

interface GenerationMetadataDashboardProps {
  agentId: string;
}

interface MetadataStats {
  totalRecords: number;
  passRate: number;
  avgQualityScore: number;
  avgRepairAttempts: number;
}

const STATUS_STYLE: Record<string, string> = {
  passed: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20",
  repaired: "bg-amber-500/15 text-amber-600 border-amber-500/20",
  fallback: "bg-blue-500/15 text-blue-600 border-blue-500/20",
  failed: "bg-red-500/15 text-red-600 border-red-500/20",
};

function StatTile({ label, value, icon: Icon, color = "text-muted-foreground" }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/30 border">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function RecordRow({ record }: { record: GenerationMetadataRecord }) {
  const statusStyle = STATUS_STYLE[record.validationStatus] ?? "";
  const ts = record.createdAt ? new Date(record.createdAt).toLocaleTimeString() : "—";
  const errors = Array.isArray(record.validationErrors) ? record.validationErrors : [];

  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-lg border bg-card hover:bg-muted/20 transition-colors" data-testid={`record-metadata-${record.id}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={`text-[10px] shrink-0 ${statusStyle}`}>
          {record.validationStatus === "passed" ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
          {record.validationStatus}
        </Badge>
        <span className="text-xs font-mono text-muted-foreground">{record.promptId}@{record.promptVersion}</span>
        {record.model && (
          <span className="text-[11px] text-muted-foreground">{record.model}</span>
        )}
        {(record.repairAttempts ?? 0) > 0 && (
          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
            <RefreshCw className="w-3 h-3 mr-1" />
            {record.repairAttempts}× repair
          </Badge>
        )}
        {record.qualityScore !== null && record.qualityScore !== undefined && (
          <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 border-violet-500/20">
            <Gauge className="w-3 h-3 mr-1" />
            {(record.qualityScore * 100).toFixed(1)}%
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground/60 ml-auto">{ts}</span>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
        {record.totalTokens !== undefined && record.totalTokens !== null && (
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            {record.totalTokens.toLocaleString()} tokens
          </span>
        )}
        {record.totalLatencyMs !== null && record.totalLatencyMs !== undefined && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {Math.round(record.totalLatencyMs)}ms
          </span>
        )}
        {record.traceId && (
          <span className="font-mono">trace: {record.traceId.slice(0, 8)}</span>
        )}
      </div>

      {errors.length > 0 && (
        <div className="flex flex-col gap-0.5 mt-0.5">
          {errors.slice(0, 3).map((e, i) => (
            <p key={i} className="text-[11px] text-destructive flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              {String(e)}
            </p>
          ))}
          {errors.length > 3 && (
            <p className="text-[11px] text-muted-foreground">+ {errors.length - 3} more errors</p>
          )}
        </div>
      )}
    </div>
  );
}

export function GenerationMetadataDashboard({ agentId }: GenerationMetadataDashboardProps) {
  const { data: stats, isLoading: statsLoading } = useQuery<MetadataStats>({
    queryKey: ["/api/generation-metadata/stats", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/generation-metadata/stats/${agentId}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: records = [], isLoading: recordsLoading } = useQuery<GenerationMetadataRecord[]>({
    queryKey: ["/api/generation-metadata", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/generation-metadata?agentId=${agentId}&limit=20`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const passRatePct = stats ? (stats.passRate * 100).toFixed(1) : "—";
  const avgQualityPct = stats && stats.avgQualityScore > 0 ? (stats.avgQualityScore * 100).toFixed(1) + "%" : "—";

  return (
    <div className="flex flex-col gap-4" data-testid="generation-metadata-dashboard">
      <div className="flex items-center gap-1.5">
        <Database className="w-4 h-4 text-violet-500" />
        <h3 className="text-sm font-semibold">Generation Metadata</h3>
        <span className="text-xs text-muted-foreground ml-1">— per-call validation tracking</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)
        ) : (
          <>
            <StatTile label="Total Calls" value={stats?.totalRecords ?? 0} icon={Database} />
            <StatTile
              label="Pass Rate"
              value={`${passRatePct}%`}
              icon={CheckCircle2}
              color={parseFloat(passRatePct) >= 90 ? "text-emerald-500" : parseFloat(passRatePct) >= 70 ? "text-amber-500" : "text-red-500"}
            />
            <StatTile label="Avg Quality" value={avgQualityPct} icon={Gauge} color="text-violet-500" />
            <StatTile
              label="Avg Repairs"
              value={(stats?.avgRepairAttempts ?? 0).toFixed(2)}
              icon={RefreshCw}
              color={(stats?.avgRepairAttempts ?? 0) > 0 ? "text-amber-500" : "text-muted-foreground"}
            />
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recent Calls</p>
        {recordsLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Database className="w-6 h-6 opacity-40" />
            <p className="text-sm">No generation metadata yet</p>
            <p className="text-xs">Records appear here when agents run with an Output Contract configured</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
            {records.map(record => (
              <RecordRow key={record.id} record={record} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
