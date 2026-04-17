import { AlertTriangle, MapPin, Package, TrendingDown, Users, DollarSign, Clock, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FulfillmentPipelineState } from "./otc-fulfillment-constants";
import { OTC_FULFILLMENT_COLOR } from "./otc-fulfillment-constants";

const ACCENT = OTC_FULFILLMENT_COLOR;

const AFFECTED_DCS = [
  { id: "WH-CHI-001", name: "Chicago DC",      state: "IL", affected: 523, pct: 62 },
  { id: "WH-IND-001", name: "Indianapolis DC", state: "IN", affected: 198, pct: 23 },
  { id: "WH-STL-001", name: "St. Louis DC",    state: "MO", affected: 126, pct: 15 },
];

const ALTERNATE_DCS = [
  { id: "WH-DAL-001", name: "Dallas DC",       state: "TX", capacity: 245, load: 61, assigned: 145 },
  { id: "WH-ATL-001", name: "Atlanta DC",      state: "GA", capacity: 178, load: 74, assigned: 98  },
  { id: "WH-PHL-001", name: "Philadelphia DC", state: "PA", capacity: 89,  load: 82, assigned: 69  },
];

const TIER_DATA = [
  { tier: "Platinum", count: 87,  revenue: "$2.1M",  color: "text-amber-400",   bg: "bg-amber-400/10",  border: "border-amber-400/30"  },
  { tier: "Gold",     count: 225, revenue: "$2.7M",  color: "text-yellow-400",  bg: "bg-yellow-400/10", border: "border-yellow-400/30" },
  { tier: "Standard", count: 535, revenue: "$1.4M",  color: "text-slate-400",   bg: "bg-slate-400/10",  border: "border-slate-400/30"  },
];

interface Props {
  state: FulfillmentPipelineState;
}

function MetricCard({ label, value, sub, accent, icon: Icon }: {
  label: string; value: string; sub?: string; accent: string; icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/50 p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <span className="text-2xl font-bold" style={{ color: accent }}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

export default function OtcFulfillmentS1Disruption({ state }: Props) {
  const isRunning = state.agents.find(a => a.code === "OTC-AGT-005")?.status === "running";
  const isDone    = state.agents.find(a => a.code === "OTC-AGT-005")?.status === "complete";
  const rerouted  = state.metrics.priority_rerouted;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Alert Banner */}
      <div
        className="rounded-lg border px-4 py-3 flex items-start gap-3"
        style={{ background: `${ACCENT}15`, borderColor: `${ACCENT}40` }}
        data-testid="disruption-alert-banner"
      >
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 animate-pulse" style={{ color: ACCENT }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: ACCENT }}>
              FULFILLMENT DISRUPTION DETECTED
            </span>
            <Badge variant="outline" className="text-[10px] border-rose-500/50 text-rose-400">CRITICAL</Badge>
            {isRunning && <Badge variant="outline" className="text-[10px] border-amber-400/50 text-amber-400">OTC-AGT-005 Active</Badge>}
            {isDone    && <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400">Rerouting Executed</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Winter Storm Stella — Chicago DC, Indianapolis DC, St. Louis DC outbound suspended (48–72h).
            <span className="font-medium text-foreground"> 847 shipments affected.</span>
          </p>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">DSRP-2026-WS-0312</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Affected"   value="847"  sub="across 3 DCs"         accent="#ef4444" icon={Package} />
        <MetricCard label="Priority / SLA"   value="312"  sub="Platinum + Gold"       accent={ACCENT}  icon={Shield} />
        <MetricCard label="Standard"         value="489"  sub="held for DC recovery"  accent="#f59e0b" icon={Package} />
        <MetricCard label="Revenue at Risk"  value="$4.8M" sub="top-50 customers"     accent="#ef4444" icon={DollarSign} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Affected DCs */}
        <div className="rounded-lg border border-border/40 bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4" style={{ color: ACCENT }} />
            <span className="text-sm font-semibold">Disrupted Facilities</span>
            <Badge variant="outline" className="ml-auto text-[10px] border-rose-500/40 text-rose-400">Outbound Suspended</Badge>
          </div>
          <div className="flex flex-col gap-2">
            {AFFECTED_DCS.map(dc => (
              <div key={dc.id} className="flex items-center gap-3" data-testid={`dc-affected-${dc.id}`}>
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{dc.name}</span>
                    <span className="text-xs text-rose-400 font-mono">{dc.affected.toLocaleString()}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-border/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-rose-500/70 transition-all duration-1000"
                      style={{ width: `${dc.pct}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alternate DCs */}
        <div className="rounded-lg border border-border/40 bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold">Alternate Facilities</span>
            <Badge variant="outline" className="ml-auto text-[10px] border-emerald-500/40 text-emerald-400">Operational</Badge>
          </div>
          <div className="flex flex-col gap-2">
            {ALTERNATE_DCS.map(dc => (
              <div key={dc.id} className="flex items-center gap-3" data-testid={`dc-alternate-${dc.id}`}>
                <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{dc.name}</span>
                    <div className="flex items-center gap-2">
                      {rerouted > 0 && (
                        <span className="text-[10px] font-mono text-emerald-400">+{dc.assigned} assigned</span>
                      )}
                      <span className="text-xs font-mono text-muted-foreground">{dc.capacity - Math.round(dc.capacity * dc.load / 100)} slots</span>
                    </div>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-border/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-400/60 transition-all duration-1000"
                      style={{ width: `${dc.load}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Customer tier breakdown */}
      <div className="rounded-lg border border-border/40 bg-card/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4" style={{ color: ACCENT }} />
          <span className="text-sm font-semibold">Affected Customers by Tier</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {TIER_DATA.map(t => (
            <div
              key={t.tier}
              className={`rounded-md border p-3 ${t.bg} ${t.border}`}
              data-testid={`tier-card-${t.tier.toLowerCase()}`}
            >
              <div className={`text-xs font-semibold uppercase tracking-wider ${t.color}`}>{t.tier}</div>
              <div className="text-xl font-bold mt-1">{t.count}</div>
              <div className="text-[10px] text-muted-foreground">{t.revenue} at risk</div>
            </div>
          ))}
        </div>
      </div>

      {/* OTC-AGT-005 status */}
      <div
        className="rounded-lg border p-3 flex items-center gap-3"
        style={{ borderColor: isRunning ? `${ACCENT}50` : isDone ? "#10b98150" : "transparent", background: isRunning ? `${ACCENT}08` : "transparent" }}
        data-testid="agt005-status"
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isRunning ? "animate-pulse" : ""}`}
            style={{ background: isRunning ? ACCENT : isDone ? "#10b981" : "#64748b" }}
          />
          <span className="text-xs font-mono" style={{ color: isRunning ? ACCENT : isDone ? "#10b981" : "#64748b" }}>
            OTC-AGT-005
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {isRunning ? "Detecting disruption → Assessing shipments → Evaluating alternate DCs → Proposing strategy → Executing reroute…" :
           isDone    ? `Smart Reroute executed — ${rerouted} priority shipments assigned to alternate DCs` :
                       "Fulfillment & Exception Agent — awaiting pipeline start"}
        </span>
        {(isRunning || isDone) && (
          <div className="ml-auto flex items-center gap-1">
            <Clock className="w-3 h-3 text-muted-foreground/50" />
            <span className="text-[10px] font-mono text-muted-foreground/50">{state.metrics.elapsed_secs}s</span>
          </div>
        )}
      </div>

      {rerouted > 0 && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-emerald-400">Smart Reroute Executed</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              312 priority shipments assigned — Dallas DC (145), Atlanta DC (98), Philadelphia DC (69).
              Incremental cost <strong className="text-foreground">$47,200</strong>.
              Estimated SLA protection <strong className="text-emerald-400">92.6%</strong>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
