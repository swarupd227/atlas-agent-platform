import { MessageSquare, Tag, Package, Users, ArrowRight, Clock, Shield, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SupportPipelineState } from "./adv-support-constants";
import { ADV_SUPPORT_COLOR } from "./adv-support-constants";

const ACCENT = ADV_SUPPORT_COLOR;

const PRODUCTS = [
  { id: "InfinityQS",     label: "InfinityQS SPC Pro",  active: true  },
  { id: "Kiwiplan",       label: "Kiwiplan",             active: false },
  { id: "DDI System",     label: "DDI System",           active: false },
  { id: "ParityFactory",  label: "ParityFactory",        active: false },
  { id: "Pepperi",        label: "Pepperi",              active: false },
  { id: "VeraCore",       label: "VeraCore",             active: false },
];

interface Props { state: SupportPipelineState; }

function StatCard({ label, value, sub, accent, icon: Icon }: {
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

export default function AdvSupportS1Triage({ state }: Props) {
  const isRunning = state.agents.find(a => a.code === "SUP-001")?.status === "running";
  const isDone    = state.agents.find(a => a.code === "SUP-001")?.status === "complete";

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Alert Banner */}
      <div
        className="rounded-lg border px-4 py-3 flex items-start gap-3"
        style={{ background: `${ACCENT}12`, borderColor: `${ACCENT}40` }}
        data-testid="support-alert-banner"
      >
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 animate-pulse" style={{ color: ACCENT }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: ACCENT }}>
              INBOUND SUPPORT QUERY — AIVA PORTAL
            </span>
            <Badge variant="outline" className="text-[10px] border-rose-500/50 text-rose-400">P1 CRITICAL</Badge>
            {isRunning && <Badge variant="outline" className="text-[10px] border-amber-400/50 text-amber-400">SUP-001 Classifying</Badge>}
            {isDone    && <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400">Routed to Diagnostic</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-1 italic">
            "Our InfinityQS SPC charts stopped updating after the v9.3 patch. Xbar-R returning IQS-SQL-TMO-7891.
            <span className="font-medium text-foreground"> 47 control charts blocked. ISO 9001 audit tomorrow 09:00."</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            — Priya Nair, Cascade Polymers Inc. | Enterprise | Account Manager: James Whitfield
          </p>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">AIVA-Q-0831</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Intent"       value="Technical"  sub="troubleshooting"        accent={ACCENT}    icon={Tag} />
        <StatCard label="Product"      value="InfinityQS" sub="v9.3.0 — 7 days old"   accent="#8b5cf6"   icon={Package} />
        <StatCard label="Customer"     value="Enterprise" sub="4h SLA · $248K ACV"    accent="#f59e0b"   icon={Users} />
        <StatCard label="Audit"        value="26h"        sub="ISO 9001 deadline"      accent="#ef4444"   icon={Clock} />
      </div>

      {/* Query classification breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border/40 bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4" style={{ color: ACCENT }} />
            <span className="text-sm font-semibold">Intent Classification</span>
            {isDone && <Badge variant="outline" className="ml-auto text-[10px] border-emerald-500/40 text-emerald-400">Complete</Badge>}
          </div>
          <div className="flex flex-col gap-2" data-testid="intent-classification">
            {[
              { label: "technical_troubleshooting", score: 0.97, primary: true  },
              { label: "bug_report",                score: 0.61, primary: false },
              { label: "configuration_issue",       score: 0.22, primary: false },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3" data-testid={`intent-${item.label}`}>
                <span className={`text-xs font-mono ${item.primary ? "font-semibold" : "text-muted-foreground"}`}>{item.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-border/40 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: isDone ? `${item.score * 100}%` : "0%", background: item.primary ? ACCENT : `${ACCENT}60` }}
                  />
                </div>
                <span className="text-xs font-mono text-muted-foreground/70">{isDone ? item.score.toFixed(2) : "--"}</span>
                {item.primary && isDone && <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-400">PRIMARY</Badge>}
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-border/20 flex items-center gap-2">
            <Shield className="w-3 h-3" style={{ color: ACCENT }} />
            <span className="text-[10px] text-muted-foreground">Compliance flag: <span className="text-amber-400 font-medium">ISO 9001 audit deadline detected</span></span>
          </div>
        </div>

        <div className="rounded-lg border border-border/40 bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4" style={{ color: ACCENT }} />
            <span className="text-sm font-semibold">Product Portfolio Detection</span>
          </div>
          <div className="flex flex-col gap-2">
            {PRODUCTS.map(p => (
              <div key={p.id} className="flex items-center gap-2" data-testid={`product-${p.id.toLowerCase().replace(/\s/g, "-")}`}>
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: p.active ? ACCENT : "rgb(71 85 105)" }}
                />
                <span className={`text-xs ${p.active ? "font-semibold" : "text-muted-foreground"}`}>{p.label}</span>
                {p.active && isDone && (
                  <Badge variant="outline" className="ml-auto text-[9px]" style={{ borderColor: `${ACCENT}50`, color: ACCENT }}>
                    v9.3.0 DETECTED
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Routing decision */}
      {isDone && (
        <div
          className="rounded-lg border p-4 flex items-start gap-3"
          style={{ background: `${ACCENT}0A`, borderColor: `${ACCENT}30` }}
          data-testid="routing-decision"
        >
          <ArrowRight className="w-4 h-4 mt-0.5 shrink-0" style={{ color: ACCENT }} />
          <div>
            <div className="text-xs font-semibold" style={{ color: ACCENT }}>Routing Decision: Diagnostic Reasoning Agent (SUP-003)</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              technical_troubleshooting (0.97) + Enterprise tier + ISO audit deadline → Diagnostic mandatory.
              KB pre-check running in parallel via SUP-002. SLA override: P1, 2h target.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
