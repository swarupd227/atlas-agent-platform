import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, XCircle, RefreshCw, Gauge, Database,
  Clock, Zap, AlertTriangle, DollarSign, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import type { GenerationMetadataRecord } from "@shared/schema";

interface GenerationMetadataDashboardProps {
  agentId: string;
  pipelineRunId?: string;
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

// Rough cost estimate: gpt-4o pricing
function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1000) * 0.005 + (completionTokens / 1000) * 0.015;
}

type SortKey = "createdAt" | "validationStatus" | "totalTokens" | "llmLatencyMs" | "qualityScore" | "repairAttempts";
type SortDir = "asc" | "desc";

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

function SortHeader({
  label, sortKey, current, dir, onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      data-testid={`sort-${sortKey}`}
    >
      {label}
      {active ? (dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
    </button>
  );
}

function PipelineRunTable({ records }: { records: GenerationMetadataRecord[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...records].sort((a, b) => {
    let av: string | number | null = null;
    let bv: string | number | null = null;
    if (sortKey === "createdAt") {
      av = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      bv = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    } else if (sortKey === "validationStatus") {
      av = a.validationStatus ?? "";
      bv = b.validationStatus ?? "";
    } else if (sortKey === "totalTokens") {
      av = a.totalTokens ?? 0;
      bv = b.totalTokens ?? 0;
    } else if (sortKey === "llmLatencyMs") {
      av = a.llmLatencyMs ?? 0;
      bv = b.llmLatencyMs ?? 0;
    } else if (sortKey === "qualityScore") {
      av = a.qualityScore ?? -1;
      bv = b.qualityScore ?? -1;
    } else if (sortKey === "repairAttempts") {
      av = a.repairAttempts ?? 0;
      bv = b.repairAttempts ?? 0;
    }
    if (av === null || bv === null) return 0;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <Database className="w-6 h-6 opacity-40" />
        <p className="text-sm">No generation records for this pipeline run</p>
        <p className="text-xs">Records appear when the run includes agents with Output Contracts configured</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border" data-testid="pipeline-run-table">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left px-3 py-2"><SortHeader label="Status" sortKey="validationStatus" current={sortKey} dir={sortDir} onSort={handleSort} /></th>
            <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Prompt</th>
            <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Model</th>
            <th className="text-right px-3 py-2"><SortHeader label="Tokens" sortKey="totalTokens" current={sortKey} dir={sortDir} onSort={handleSort} /></th>
            <th className="text-right px-3 py-2"><SortHeader label="Latency" sortKey="llmLatencyMs" current={sortKey} dir={sortDir} onSort={handleSort} /></th>
            <th className="text-right px-3 py-2"><SortHeader label="Quality" sortKey="qualityScore" current={sortKey} dir={sortDir} onSort={handleSort} /></th>
            <th className="text-right px-3 py-2"><SortHeader label="Repairs" sortKey="repairAttempts" current={sortKey} dir={sortDir} onSort={handleSort} /></th>
            <th className="text-right px-3 py-2"><SortHeader label="Time" sortKey="createdAt" current={sortKey} dir={sortDir} onSort={handleSort} /></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((record, idx) => {
            const statusStyle = STATUS_STYLE[record.validationStatus] ?? "";
            const ts = record.createdAt ? new Date(record.createdAt).toLocaleTimeString() : "—";
            const errors = Array.isArray(record.validationErrors) ? record.validationErrors : [];
            return (
              <tr
                key={record.id}
                className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                data-testid={`row-metadata-${record.id}`}
              >
                <td className="px-3 py-2">
                  <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${statusStyle}`}>
                    {record.validationStatus === "passed" || record.validationStatus === "repaired"
                      ? <CheckCircle2 className="w-3 h-3 mr-1" />
                      : <XCircle className="w-3 h-3 mr-1" />}
                    {record.validationStatus}
                  </Badge>
                  {errors.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="w-2.5 h-2.5 text-destructive" />
                      <span className="text-[10px] text-destructive line-clamp-1">{String(errors[0])}</span>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                  {record.promptId ?? "—"}
                  {record.promptVersion && <span className="text-[9px] ml-1 opacity-60">@{record.promptVersion}</span>}
                </td>
                <td className="px-3 py-2 text-[10px] text-muted-foreground">{record.model ?? "—"}</td>
                <td className="px-3 py-2 text-right text-[10px]">
                  {record.totalTokens != null ? record.totalTokens.toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2 text-right text-[10px]">
                  {record.llmLatencyMs != null ? `${Math.round(record.llmLatencyMs)}ms` : "—"}
                </td>
                <td className="px-3 py-2 text-right text-[10px]">
                  {record.qualityScore != null
                    ? <span className="text-violet-600">{(record.qualityScore * 100).toFixed(1)}%</span>
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right text-[10px]">
                  {(record.repairAttempts ?? 0) > 0
                    ? <span className="text-amber-600">{record.repairAttempts}</span>
                    : <span className="text-muted-foreground">0</span>}
                </td>
                <td className="px-3 py-2 text-right text-[10px] text-muted-foreground/60">{ts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AgentRecordCard({ record }: { record: GenerationMetadataRecord }) {
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
        {record.model && <span className="text-[11px] text-muted-foreground">{record.model}</span>}
        {(record.repairAttempts ?? 0) > 0 && (
          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
            <RefreshCw className="w-3 h-3 mr-1" />{record.repairAttempts}× repair
          </Badge>
        )}
        {record.qualityScore != null && (
          <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 border-violet-500/20">
            <Gauge className="w-3 h-3 mr-1" />{(record.qualityScore * 100).toFixed(1)}%
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground/60 ml-auto">{ts}</span>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
        {record.totalTokens != null && (
          <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{record.totalTokens.toLocaleString()} tokens</span>
        )}
        {record.llmLatencyMs != null && (
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{Math.round(record.llmLatencyMs)}ms</span>
        )}
        {record.traceId && <span className="font-mono">trace: {record.traceId.slice(0, 8)}</span>}
      </div>
      {errors.length > 0 && (
        <div className="flex flex-col gap-0.5 mt-0.5">
          {errors.slice(0, 3).map((e, i) => (
            <p key={i} className="text-[11px] text-destructive flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{String(e)}
            </p>
          ))}
          {errors.length > 3 && <p className="text-[11px] text-muted-foreground">+ {errors.length - 3} more errors</p>}
        </div>
      )}
    </div>
  );
}

export function GenerationMetadataDashboard({ agentId, pipelineRunId }: GenerationMetadataDashboardProps) {
  const isPipelineScoped = !!pipelineRunId;

  // Pipeline-run scoped: use pipeline run endpoint
  const { data: pipelineRecords = [], isLoading: prLoading } = useQuery<GenerationMetadataRecord[]>({
    queryKey: ["/api/pipeline-runs", pipelineRunId, "generation-metadata"],
    queryFn: async () => {
      const res = await fetch(`/api/pipeline-runs/${pipelineRunId}/generation-metadata`);
      return res.json();
    },
    enabled: isPipelineScoped,
    refetchInterval: 30000,
  });

  // Agent-level fallback
  const { data: stats, isLoading: statsLoading } = useQuery<MetadataStats>({
    queryKey: ["/api/generation-metadata/stats", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/generation-metadata/stats/${agentId}`);
      return res.json();
    },
    enabled: !isPipelineScoped,
    refetchInterval: 30000,
  });

  const { data: agentRecords = [], isLoading: agentRecordsLoading } = useQuery<GenerationMetadataRecord[]>({
    queryKey: ["/api/generation-metadata", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/generation-metadata?agentId=${agentId}&limit=20`);
      return res.json();
    },
    enabled: !isPipelineScoped,
    refetchInterval: 30000,
  });

  if (isPipelineScoped) {
    const records = pipelineRecords;
    const totalTokens = records.reduce((s, r) => s + (r.totalTokens ?? 0), 0);
    const totalPromptTokens = records.reduce((s, r) => s + (r.promptTokens ?? 0), 0);
    const totalCompletionTokens = records.reduce((s, r) => s + (r.completionTokens ?? 0), 0);
    const repairCount = records.reduce((s, r) => s + (r.repairAttempts ?? 0), 0);
    const fallbackCount = records.filter(r => r.validationStatus === "fallback").length;
    const estCost = estimateCostUsd(totalPromptTokens, totalCompletionTokens);

    return (
      <div className="flex flex-col gap-4" data-testid="generation-metadata-dashboard">
        <div className="flex items-center gap-1.5">
          <Database className="w-4 h-4 text-violet-500" />
          <h3 className="text-sm font-semibold">Execution Trace — Generation Metadata</h3>
          <span className="text-xs text-muted-foreground ml-1">pipeline run</span>
        </div>

        {prLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label="Total Tokens" value={totalTokens.toLocaleString()} icon={Zap} color="text-violet-500" />
            <StatTile label="LLM Calls" value={records.length} icon={Database} />
            <StatTile label="Repairs" value={repairCount} icon={RefreshCw} color={repairCount > 0 ? "text-amber-500" : "text-muted-foreground"} />
            <StatTile label="Fallbacks" value={fallbackCount} icon={AlertTriangle} color={fallbackCount > 0 ? "text-red-500" : "text-muted-foreground"} />
          </div>
        )}

        {!prLoading && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20 border text-xs text-muted-foreground">
            <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
            <span>Est. cost: <strong className="text-foreground">${estCost.toFixed(4)}</strong></span>
            <span className="text-[10px] opacity-60">(prompt: {totalPromptTokens.toLocaleString()} / completion: {totalCompletionTokens.toLocaleString()} tokens)</span>
          </div>
        )}

        {prLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : (
          <PipelineRunTable records={records} />
        )}
      </div>
    );
  }

  // Agent-level view (fallback when no pipelineRunId)
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
        {agentRecordsLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)
        ) : agentRecords.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Database className="w-6 h-6 opacity-40" />
            <p className="text-sm">No generation metadata yet</p>
            <p className="text-xs">Records appear here when agents run with an Output Contract configured</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
            {agentRecords.map(record => (
              <AgentRecordCard key={record.id} record={record} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
