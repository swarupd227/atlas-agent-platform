import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Clock, Zap, Database, ShieldCheck, RefreshCw } from "lucide-react";

interface HealingData {
  healingEvent: {
    id: string;
    triggeredAt: string;
    resolvedAt: string;
    totalResolutionMinutes: number;
    source: string;
    issueType: string;
    rootCause: string;
    impact: string;
    affectedSegments: string[];
    affectedRegion: string;
  };
  stages: {
    stage: string;
    status: string;
    timestamp: string;
    detail: string;
    durationSec: number;
  }[];
  withoutAlmp: {
    estimatedOutageMinutes: number;
    affectedValuations: number;
    detectionMethod: string;
  };
}

const STAGE_ICONS: Record<string, any> = {
  Detect: AlertTriangle,
  Diagnose: Database,
  Remediate: Zap,
  Backfill: RefreshCw,
  Validate: ShieldCheck,
};

const STAGE_COLORS: Record<string, string> = {
  Detect: "text-red-400 bg-red-500/10 border-red-500/20",
  Diagnose: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  Remediate: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  Backfill: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  Validate: "text-green-400 bg-green-500/10 border-green-500/20",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function BBScreen5SelfHealing() {
  const { data, isLoading } = useQuery<HealingData>({
    queryKey: ["/demo-api/blackbook/self-healing"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const d = data!;
  const totalDuration = d.stages.reduce((sum, s) => sum + s.durationSec, 0);

  return (
    <div className="space-y-4">
      {/* Incident banner */}
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4" data-testid="bb-healing-banner">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">RESOLVED</span>
              <span className="text-[10px] text-muted-foreground font-mono">{d.healingEvent.id}</span>
            </div>
            <h2 className="text-sm font-bold">{d.healingEvent.source} data feed offline — self-healed in {d.healingEvent.totalResolutionMinutes} minutes</h2>
            <p className="text-[11px] text-muted-foreground mt-1">{d.healingEvent.rootCause}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1 text-muted-foreground justify-end mb-0.5">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[10px]">Resolution time</span>
            </div>
            <p className="text-2xl font-bold text-green-400">{d.healingEvent.totalResolutionMinutes} min</p>
            <p className="text-[10px] text-muted-foreground">fully automated</p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-green-500/20">
          <div>
            <p className="text-[10px] text-muted-foreground">Triggered</p>
            <p className="text-[11px] font-mono">{formatTime(d.healingEvent.triggeredAt)}</p>
          </div>
          <span className="text-muted-foreground">→</span>
          <div>
            <p className="text-[10px] text-muted-foreground">Resolved</p>
            <p className="text-[11px] font-mono">{formatTime(d.healingEvent.resolvedAt)}</p>
          </div>
          <div className="ml-auto flex gap-2 flex-wrap justify-end">
            {d.healingEvent.affectedSegments.map(s => (
              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">{s}</span>
            ))}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">{d.healingEvent.affectedRegion} Region</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Healing pipeline stages */}
        <div className="col-span-2 space-y-2">
          <h3 className="text-xs font-semibold">Healing Pipeline</h3>
          {d.stages.map((stage, i) => {
            const Icon = STAGE_ICONS[stage.stage] || Zap;
            const colorClass = STAGE_COLORS[stage.stage] || "text-muted-foreground bg-muted/10 border-border/50";
            const widthPct = Math.round((stage.durationSec / totalDuration) * 100);
            return (
              <div key={stage.stage} className={`rounded-xl border p-4 ${colorClass}`} data-testid={`bb-healing-stage-${stage.stage.toLowerCase()}`}>
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border ${colorClass}`}>
                      {i + 1}
                    </div>
                    {i < d.stages.length - 1 && <div className="w-px h-4 bg-current opacity-20" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-semibold">{stage.stage}</span>
                        <CheckCircle2 className="w-3 h-3" />
                      </div>
                      <div className="flex items-center gap-2 text-[9px] opacity-70">
                        <span className="font-mono">{formatTime(stage.timestamp)}</span>
                        <span>{stage.durationSec}s</span>
                      </div>
                    </div>
                    <p className="text-[10px] leading-relaxed opacity-90">{stage.detail}</p>
                    <div className="mt-2 h-1 rounded-full bg-current opacity-20">
                      <div className="h-full rounded-full bg-current opacity-80" style={{ width: `${widthPct}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Without ALMP comparison */}
        <div className="space-y-3">
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4" data-testid="bb-without-almp">
            <h3 className="text-xs font-semibold text-red-400 mb-3">Without ATLAS</h3>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-muted-foreground">Estimated outage duration</p>
                <p className="text-xl font-bold text-red-400">{d.withoutAlmp.estimatedOutageMinutes} min</p>
                <p className="text-[10px] text-muted-foreground">vs {d.healingEvent.totalResolutionMinutes} min with ATLAS</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Affected valuations</p>
                <p className="text-xl font-bold text-red-400">{d.withoutAlmp.affectedValuations.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">valuations silently corrupted</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Detection method</p>
                <p className="text-[10px] text-red-400">{d.withoutAlmp.detectionMethod}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-xs font-semibold mb-3">Impact Avoided</h3>
            <div className="space-y-2">
              {[
                { label: "Time saved", value: `${d.withoutAlmp.estimatedOutageMinutes - d.healingEvent.totalResolutionMinutes} min` },
                { label: "Valuations protected", value: "8,200 transactions" },
                { label: "Client exposure", value: "Zero — resolved before customers noticed" },
                { label: "Analyst intervention", value: "None required" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                  <span className="text-[10px] font-semibold text-green-400">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-xs font-semibold mb-2">Data Feed Health</h3>
            {[
              { source: "Manheim (national)", status: 100 },
              { source: "Adesa", status: 100 },
              { source: "Manheim SE", status: 99 },
              { source: "Dealer-Direct", status: 100 },
              { source: "Independent", status: 100 },
            ].map(f => (
              <div key={f.source} className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-muted-foreground">{f.source}</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1 rounded-full bg-muted/30">
                    <div className="h-full rounded-full bg-green-400" style={{ width: `${f.status}%` }} />
                  </div>
                  <span className="text-[10px] text-green-400 font-mono">{f.status}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
