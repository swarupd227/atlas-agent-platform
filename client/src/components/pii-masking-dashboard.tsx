import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, ShieldCheck, RefreshCcw, Clock, FileText, AlertTriangle } from "lucide-react";

interface PiiRun {
  id: string;
  pipelineRunId: string;
  engineUsed: string;
  artifactCount: number;
  totalReplacements: number;
  entityBreakdown: Record<string, number>;
  durationMs: number;
  artifactReports: Array<{
    artifactId: string;
    entitiesFound: Record<string, number>;
    totalReplacements: number;
    maskedAt: string;
    durationMs: number;
  }>;
  rehydrationApplied: boolean;
  rehydrationTokens: number;
  rehydrationFields: string[];
  status: string;
  error?: string;
}

const ENTITY_COLORS: Record<string, string> = {
  EMAIL_ADDRESS: "bg-blue-500",
  PHONE_NUMBER: "bg-green-500",
  US_SSN: "bg-red-500",
  CREDIT_CARD: "bg-amber-500",
  IP_ADDRESS: "bg-purple-500",
  URL: "bg-sky-500",
};

export function PiiMaskingDashboard({ pipelineRunId }: { pipelineRunId: string }) {
  const { data: runs = [], isLoading } = useQuery<PiiRun[]>({
    queryKey: ["/api/pipeline-runs", pipelineRunId, "pii-masking"],
    queryFn: async () => {
      const res = await fetch(`/api/pipeline-runs/${pipelineRunId}/pii-masking`);
      if (!res.ok) throw new Error("Failed to fetch PII masking data");
      return res.json();
    },
    enabled: !!pipelineRunId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 mt-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!runs.length) return null;

  const latest = runs[runs.length - 1];
  const totalEntities = Object.values(latest.entityBreakdown || {}).reduce((a, b) => a + b, 0);
  const maxCount = Math.max(...Object.values(latest.entityBreakdown || {}), 1);

  return (
    <div className="mt-3 space-y-3" data-testid="pii-masking-dashboard">
      {/* Summary row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Shield className="w-3.5 h-3.5" />
          PII Masking
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">{latest.engineUsed}</Badge>
        {latest.status === "completed" ? (
          <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300">completed</Badge>
        ) : (
          <Badge className="text-[10px] bg-red-100 text-red-700 border-red-300">{latest.status}</Badge>
        )}
        {latest.rehydrationApplied && (
          <Badge variant="outline" className="text-[10px] gap-1 text-purple-700 border-purple-300">
            <RefreshCcw className="w-2.5 h-2.5" />
            rehydrated
          </Badge>
        )}
      </div>

      {/* Error */}
      {latest.error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {latest.error}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Artifacts", value: latest.artifactCount, icon: <FileText className="w-3 h-3" /> },
          { label: "Replacements", value: latest.totalReplacements, icon: <Shield className="w-3 h-3" /> },
          { label: "Duration", value: `${latest.durationMs}ms`, icon: <Clock className="w-3 h-3" /> },
        ].map(({ label, value, icon }) => (
          <Card key={label} className="border-border/60">
            <CardContent className="p-2.5 flex flex-col gap-0.5">
              <div className="flex items-center gap-1 text-muted-foreground">{icon}<span className="text-[10px]">{label}</span></div>
              <span className="text-sm font-semibold" data-testid={`pii-stat-${label.toLowerCase()}`}>{value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Entity breakdown */}
      {totalEntities > 0 && (
        <div>
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Entity Breakdown</span>
          <div className="mt-1.5 space-y-1.5">
            {Object.entries(latest.entityBreakdown).sort(([, a], [, b]) => b - a).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2">
                <span className="w-28 text-[10px] font-mono text-muted-foreground truncate">{type}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${ENTITY_COLORS[type] || "bg-primary"}`}
                    style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium w-5 text-right" data-testid={`pii-entity-count-${type}`}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rehydration detail */}
      {latest.rehydrationApplied && latest.rehydrationFields?.length > 0 && (
        <div className="rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
            <span className="text-xs font-medium text-purple-700 dark:text-purple-400">Rehydration Applied</span>
            <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-700">{latest.rehydrationTokens} tokens</Badge>
          </div>
          <div className="flex flex-wrap gap-1">
            {latest.rehydrationFields.map(f => (
              <code key={f} className="text-[10px] font-mono bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 rounded px-1.5 py-0.5">{f}</code>
            ))}
          </div>
        </div>
      )}

      {/* Per-artifact reports (collapsible) */}
      {latest.artifactReports?.length > 0 && (
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
            {latest.artifactReports.length} artifact report{latest.artifactReports.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-2 space-y-1.5">
            {latest.artifactReports.map((r, idx) => (
              <div key={idx} className="rounded border bg-muted/30 p-2 text-xs">
                <div className="flex items-center justify-between">
                  <code className="font-mono text-[10px] text-muted-foreground">{r.artifactId}</code>
                  <span className="text-[10px] text-muted-foreground">{r.totalReplacements} replacements · {Math.round(r.durationMs)}ms</span>
                </div>
                {Object.keys(r.entitiesFound).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(r.entitiesFound).map(([type, count]) => (
                      <Badge key={type} variant="outline" className="text-[9px] gap-0.5">
                        <span className="font-mono">{type}</span>
                        <span>×{count}</span>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
