import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { FITCH_RW_ISSUERS, FITCH_RW_KPI_DATA, FITCH_RW_COLOR, FITCH_RW_ACCENT, type FitchRWIssuer } from "./fitch-rw-constants";

function sentimentBar(val: number) {
  const clamped = Math.max(-1, Math.min(1, val));
  const pct = Math.abs(clamped) * 50;
  const color = clamped < -0.4 ? "#EF4444" : clamped < 0 ? "#F59E0B" : "#10B981";
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative h-1.5 w-16 rounded-full bg-muted/40">
        <div
          className="absolute top-0 h-full rounded-full"
          style={{ left: "50%", width: `${pct}%`, transform: clamped < 0 ? "translateX(-100%)" : "none", backgroundColor: color }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-2 bg-border" />
      </div>
      <span className="text-[10px] tabular-nums" style={{ color }}>{val.toFixed(2)}</span>
    </div>
  );
}

function StatusPill({ status }: { status: FitchRWIssuer["status"] }) {
  if (status === "flagged")
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />Flagged</span>;
  if (status === "watch")
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Watch</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Stable</span>;
}

function IssuerRow({ issuer, highlight }: { issuer: FitchRWIssuer; highlight: boolean }) {
  const isUp = issuer.cdsDelta7d > 0;
  const DeltaIcon = isUp ? TrendingUp : issuer.cdsDelta7d < 0 ? TrendingDown : Minus;
  const deltaColor = isUp ? "text-red-400" : issuer.cdsDelta7d < 0 ? "text-emerald-400" : "text-muted-foreground";

  return (
    <tr
      className={`border-b border-border/40 transition-colors ${highlight ? "bg-red-500/5 hover:bg-red-500/8" : "hover:bg-muted/20"}`}
      data-testid={`row-issuer-${issuer.id}`}
    >
      {/* Issuer name */}
      <td className="py-2.5 pl-4 pr-2 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono font-bold text-muted-foreground w-7 shrink-0">{issuer.ticker}</span>
          <span className="text-[11px] font-semibold">{issuer.name}</span>
        </div>
      </td>
      {/* Sector — dedicated column */}
      <td className="py-2.5 px-2 whitespace-nowrap">
        <span className="text-[10px] text-muted-foreground">{issuer.sector}</span>
      </td>
      {/* Rating */}
      <td className="py-2.5 px-2 text-center">
        <span className="text-[11px] font-mono font-semibold">{issuer.rating}</span>
        {issuer.status === "flagged" && issuer.id === "BA-001" && (
          <span className="block text-[9px] text-red-400/70">RWN</span>
        )}
      </td>
      {/* CDS bps */}
      <td className="py-2.5 px-2 text-right">
        <span className="text-[11px] font-mono tabular-nums">{issuer.cdsBps}</span>
        <span className="text-[9px] text-muted-foreground ml-0.5">bps</span>
      </td>
      {/* Δ 7d */}
      <td className="py-2.5 px-2">
        <div className={`flex items-center gap-1 justify-end ${deltaColor}`}>
          <DeltaIcon className="w-3 h-3 shrink-0" />
          <span className="text-[10px] font-mono tabular-nums">{isUp ? "+" : ""}{issuer.cdsDelta7d}</span>
        </div>
      </td>
      {/* Equity drawdown */}
      <td className="py-2.5 px-2 text-right">
        <span className={`text-[11px] font-mono tabular-nums ${issuer.equityDrawdown < -10 ? "text-red-400" : issuer.equityDrawdown < -4 ? "text-amber-400" : "text-emerald-400"}`}>
          {issuer.equityDrawdown > 0 ? "+" : ""}{issuer.equityDrawdown.toFixed(1)}%
        </span>
      </td>
      {/* News sentiment */}
      <td className="py-2.5 px-3">{sentimentBar(issuer.newsSentiment)}</td>
      {/* Status */}
      <td className="py-2.5 px-3"><StatusPill status={issuer.status} /></td>
    </tr>
  );
}

export default function FitchRWS1CommandCenter({ onRunPipeline }: { onRunPipeline?: () => void }) {
  const { data: runsData } = useQuery<any>({ queryKey: ["/demo-api/fitch-rw/agent-runs"] });
  const agentRuns: any[] = runsData?.agentRuns || [];

  const flagged = FITCH_RW_ISSUERS.filter(i => i.status === "flagged");
  const watched  = FITCH_RW_ISSUERS.filter(i => i.status === "watch");

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {FITCH_RW_KPI_DATA.map(kpi => (
          <div key={kpi.id} className="rounded-xl border bg-card p-4" data-testid={`kpi-${kpi.id}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">{kpi.label}</p>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-bold tabular-nums" style={kpi.id === "flagged" ? { color: FITCH_RW_ACCENT } : {}}>{kpi.value}</span>
              {kpi.unit && <span className="text-sm text-muted-foreground mb-0.5">{kpi.unit}</span>}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Alert banners */}
      {flagged.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4" data-testid="alert-flagged-issuers">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-red-400">
                {flagged.length} issuer{flagged.length !== 1 ? "s" : ""} breached screening threshold
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                CDS spread widening &gt;30 bps in 7 days AND fundamental deterioration signals detected. Pipeline queued for Rating Watch analysis.
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {flagged.map(f => (
                  <span key={f.id} className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-300 font-medium border border-red-500/20">
                    {f.ticker} · {f.rating} · CDS +{f.cdsDelta7d}bps
                  </span>
                ))}
                {onRunPipeline && (
                  <button
                    onClick={onRunPipeline}
                    className="text-[10px] px-2.5 py-1 rounded-lg font-semibold text-white ml-auto shrink-0"
                    style={{ backgroundColor: FITCH_RW_COLOR }}
                    data-testid="btn-run-from-alert"
                  >
                    Run Analysis Pipeline →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {watched.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3" data-testid="alert-watch-issuers">
          <div className="flex items-center gap-2 text-xs text-amber-400 flex-wrap">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="font-medium">{watched.length} issuer{watched.length !== 1 ? "s" : ""} under watch</span>
            <span className="text-muted-foreground">— {watched.map(w => w.ticker).join(", ")} — CDS widening, monitoring for threshold breach</span>
          </div>
        </div>
      )}

      {/* Watchlist table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div>
            <h3 className="text-xs font-semibold">IG Corporate Issuer Watchlist</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Real-time CDS + market signal screening · {FITCH_RW_ISSUERS.length} issuers monitored</p>
          </div>
          <Badge className="text-[10px]" style={{ backgroundColor: `${FITCH_RW_COLOR}20`, color: FITCH_RW_COLOR, borderColor: `${FITCH_RW_COLOR}40` }}>
            Live
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left" data-testid="table-issuer-watchlist">
            <thead>
              <tr className="border-b border-border/30 bg-muted/10">
                <th className="py-2 pl-4 pr-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Issuer</th>
                <th className="py-2 px-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Sector</th>
                <th className="py-2 px-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground text-center">Rating</th>
                <th className="py-2 px-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground text-right">CDS (bps)</th>
                <th className="py-2 px-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Δ 7d</th>
                <th className="py-2 px-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Equity Δ</th>
                <th className="py-2 px-3 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">News Sentiment</th>
                <th className="py-2 px-3 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {FITCH_RW_ISSUERS.map(issuer => (
                <IssuerRow key={issuer.id} issuer={issuer} highlight={issuer.status === "flagged"} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agent pipeline strip */}
      {agentRuns.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-xs font-semibold mb-3">Live Pipeline — 4 Agents · Boeing Co. (BA) Analysis</h3>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
            {agentRuns.map((run: any) => (
              <div key={run.agentId || run.key} className="p-3 rounded-lg border bg-muted/20" data-testid={`agent-strip-${run.key}`}>
                <span className="text-[9px] font-mono text-muted-foreground">STEP {run.step}</span>
                {run.agentId ? (
                  <Link href={`/agents/${run.agentId}`}>
                    <p className="text-[11px] font-semibold mt-0.5 leading-tight hover:underline cursor-pointer flex items-center gap-1">
                      {run.agentName}
                      <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/50" />
                    </p>
                  </Link>
                ) : (
                  <p className="text-[11px] font-semibold mt-0.5 leading-tight">{run.agentName}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">{run.role || "Analysis agent"}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
