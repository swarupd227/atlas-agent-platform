import { Tag, Package, Users, ArrowRight, Clock, Shield, AlertTriangle, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SupportPipelineState } from "./adv-support-constants";
import { ADV_SUPPORT_COLOR } from "./adv-support-constants";

const ACCENT = ADV_SUPPORT_COLOR;

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

interface Props { state: SupportPipelineState; }

type ScenarioContent = {
  badge: string;
  urgency: string;
  queryText: string;
  customer: string;
  runningBadge: string;
  doneBadge: string;
  intents: { label: string; score: number; primary: boolean }[];
  products: { id: string; label: string; active: boolean }[];
  activeProductBadge: string;
  stat1: { value: string; sub: string };
  stat2: { label: string; value: string; sub: string; accent: string };
  stat3: { value: string; sub: string; accent: string };
  stat4: { label: string; value: string; sub: string; accent: string };
  complianceNote: string;
  routingText: string;
  routingDetail: string;
};

function getScenarioContent(scenario: SupportPipelineState["scenario"]): ScenarioContent {
  if (scenario === "B") return {
    badge: "INBOUND SUPPORT QUERY — AIVA PORTAL",
    urgency: "P3 MEDIUM",
    queryText: '"Our InfinityQS SPC alarm email notifications have stopped sending after the v9.3 upgrade.',
    customer: "— David Park, Meridian Manufacturing LLC | Professional | Account Manager: Sarah Chen",
    runningBadge: "SUP-001 Classifying",
    doneBadge: "Routed to KB Resolution",
    intents: [
      { label: "configuration_issue",       score: 0.93, primary: true  },
      { label: "how_to",                    score: 0.52, primary: false },
      { label: "technical_troubleshooting", score: 0.29, primary: false },
    ],
    products: [
      { id: "InfinityQS",     label: "InfinityQS SPC Pro",  active: true  },
      { id: "Kiwiplan",       label: "Kiwiplan",             active: false },
      { id: "DDI System",     label: "DDI System",           active: false },
      { id: "ParityFactory",  label: "ParityFactory",        active: false },
      { id: "Pepperi",        label: "Pepperi",              active: false },
      { id: "VeraCore",       label: "VeraCore",             active: false },
    ],
    activeProductBadge: "v9.3.0 DETECTED",
    stat1: { value: "Config",       sub: "configuration_issue"     },
    stat2: { label: "Product",      value: "InfinityQS", sub: "v9.3.0 — Alarm Engine",    accent: "#8b5cf6" },
    stat3: { value: "Professional", sub: "8h SLA · $62K ACV",      accent: "#f59e0b"   },
    stat4: { label: "Severity",     value: "MEDIUM", sub: "No compliance deadline",      accent: "#64748b" },
    complianceNote: "No compliance flag — standard Professional tier routing",
    routingText: "Routing Decision: Knowledge Base Resolution Agent (SUP-002)",
    routingDetail: "configuration_issue (0.93) + Professional tier → KB resolution attempt. No escalation pre-check needed. Standard SLA: 8h response.",
  };

  if (scenario === "C") return {
    badge: "INBOUND SUPPORT QUERY — AIVA PORTAL",
    urgency: "P0 REGULATORY",
    queryText: '"Our ParityFactory data synchronization with our FDA-validated batch record system has failed during an active 21 CFR Part 11 validation window.',
    customer: "— Rachel Kim, BioNexus Pharma Inc. | Enterprise | Account Manager: Tyler Brooks",
    runningBadge: "SUP-001 Classifying",
    doneBadge: "FDA Regulatory Hold Activated",
    intents: [
      { label: "compliance_critical",      score: 0.99, primary: true  },
      { label: "regulatory_emergency",     score: 0.94, primary: false },
      { label: "technical_troubleshooting", score: 0.41, primary: false },
    ],
    products: [
      { id: "ParityFactory",  label: "ParityFactory",       active: true  },
      { id: "InfinityQS",     label: "InfinityQS SPC Pro",  active: false },
      { id: "Kiwiplan",       label: "Kiwiplan",            active: false },
      { id: "DDI System",     label: "DDI System",          active: false },
      { id: "Pepperi",        label: "Pepperi",             active: false },
      { id: "VeraCore",       label: "VeraCore",            active: false },
    ],
    activeProductBadge: "v8.2.1 · FDA-VALIDATED",
    stat1: { value: "FDA",          sub: "compliance_critical"      },
    stat2: { label: "Product",      value: "ParityFactory", sub: "v8.2.1 — FDA Batch Sync",  accent: "#8b5cf6" },
    stat3: { value: "Enterprise",   sub: "4h SLA · $284K ACV",      accent: "#ef4444"   },
    stat4: { label: "Audit",        value: "4h",  sub: "FDA auditors on-site",             accent: "#ef4444" },
    complianceNote: "Regulatory flag: FDA 21 CFR Part 11 active validation window detected",
    routingText: "Routing Decision: Diagnostic Reasoning Agent (SUP-003)",
    routingDetail: "compliance_critical (0.99) + FDA regulatory context → P0 immediate. Diagnostic mandatory before any action. Legal hold placed on logs. Compliance team CC'd.",
  };

  // Default: Scenario A
  return {
    badge: "INBOUND SUPPORT QUERY — AIVA PORTAL",
    urgency: "P1 CRITICAL",
    queryText: '"InfinityQS SPC Pro is throwing IQS-SQL-TMO-7891 errors.',
    customer: "— Priya Nair, Cascade Polymers Inc. | Enterprise | Account Manager: James Whitfield",
    runningBadge: "SUP-001 Classifying",
    doneBadge: "Routed to KB Resolution + Diagnostic",
    intents: [
      { label: "technical_troubleshooting", score: 0.97, primary: true  },
      { label: "performance_degradation",   score: 0.71, primary: false },
      { label: "configuration_issue",       score: 0.38, primary: false },
    ],
    products: [
      { id: "InfinityQS",    label: "InfinityQS SPC Pro",  active: true  },
      { id: "Kiwiplan",      label: "Kiwiplan",             active: false },
      { id: "DDI System",    label: "DDI System",           active: false },
      { id: "ParityFactory", label: "ParityFactory",        active: false },
      { id: "Pepperi",       label: "Pepperi",              active: false },
      { id: "VeraCore",      label: "VeraCore",             active: false },
    ],
    activeProductBadge: "v9.3.0 DETECTED",
    stat1: { value: "P1",           sub: "technical_troubleshooting"           },
    stat2: { label: "Product",      value: "InfinityQS", sub: "v9.3.0 — SPC Engine", accent: "#8b5cf6" },
    stat3: { value: "Enterprise",   sub: "2h SLA · $128K ACV",         accent: "#ef4444"   },
    stat4: { label: "Audit",        value: "26h", sub: "ISO 9001 deadline",         accent: "#ef4444" },
    complianceNote: "Compliance flag: ISO 9001 audit deadline detected",
    routingText: "Routing Decision: Diagnostic Reasoning Agent (SUP-003)",
    routingDetail: "technical_troubleshooting (0.97) + Enterprise tier + ISO audit deadline → Diagnostic mandatory. KB pre-check running in parallel via SUP-002. SLA override: P1, 2h target.",
  };
}

export default function AdvSupportS1Triage({ state }: Props) {
  const agentStatus = state.agents.find(a => a.code === "SUP-001")?.status ?? "idle";
  const isIdle    = agentStatus === "idle";
  const isRunning = agentStatus === "running";
  const isDone    = agentStatus === "complete";

  const sc = getScenarioContent(state.scenario);

  const urgencyClass =
    sc.urgency.includes("REGULATORY") ? "border-rose-500/50 text-rose-300" :
    sc.urgency.includes("CRITICAL")   ? "border-rose-500/50 text-rose-400" :
    sc.urgency.includes("MEDIUM")     ? "border-amber-400/50 text-amber-400" :
                                        "border-border/50 text-muted-foreground";

  const queryId = state.scenario === "B" ? "AIVA-Q-1142" : state.scenario === "C" ? "AIVA-Q-0614" : "AIVA-Q-0831";
  const querySuffix = state.scenario === "C"
    ? "Batch records LOT089-094 missing. FDA auditors on-site in 4 hours."
    : state.scenario === "B"
    ? "12 alarms configured but no emails sending."
    : "47 control charts blocked. ISO 9001 audit tomorrow 09:00.";

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Alert Banner — always visible */}
      <div
        className="rounded-lg border px-4 py-3 flex items-start gap-3"
        style={{ background: `${ACCENT}12`, borderColor: `${ACCENT}40` }}
        data-testid="support-alert-banner"
      >
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 animate-pulse" style={{ color: ACCENT }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: ACCENT }}>{sc.badge}</span>
            <Badge variant="outline" className={`text-[10px] ${urgencyClass}`}>{sc.urgency}</Badge>
            {isRunning && <Badge variant="outline" className="text-[10px] border-amber-400/50 text-amber-400">{sc.runningBadge}</Badge>}
            {isDone    && <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400">{sc.doneBadge}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-1 italic">
            {sc.queryText}
            <span className="font-medium text-foreground"> {querySuffix}"</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">{sc.customer}</p>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">{queryId}</span>
      </div>

      {/* Gate: show intelligence panels only after SUP-001 completes */}
      {isDone && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Intent"          value={sc.stat1.value} sub={sc.stat1.sub}    accent={ACCENT}           icon={Tag}     />
            <StatCard label={sc.stat2.label}  value={sc.stat2.value} sub={sc.stat2.sub}    accent={sc.stat2.accent}  icon={Package} />
            <StatCard label="Customer"        value={sc.stat3.value} sub={sc.stat3.sub}    accent={sc.stat3.accent}  icon={Users}   />
            <StatCard label={sc.stat4.label}  value={sc.stat4.value} sub={sc.stat4.sub}    accent={sc.stat4.accent}  icon={Clock}   />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Intent Classification */}
            <div className="rounded-lg border border-border/40 bg-card/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-4 h-4" style={{ color: ACCENT }} />
                <span className="text-sm font-semibold">Intent Classification</span>
                <Badge variant="outline" className="ml-auto text-[10px] border-emerald-500/40 text-emerald-400">Complete</Badge>
              </div>
              <div className="flex flex-col gap-2" data-testid="intent-classification">
                {sc.intents.map(item => (
                  <div key={item.label} className="flex items-center gap-3" data-testid={`intent-${item.label}`}>
                    <span className={`text-xs font-mono ${item.primary ? "font-semibold" : "text-muted-foreground"}`}>{item.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-border/40 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${item.score * 100}%`, background: item.primary ? ACCENT : `${ACCENT}60` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground/70">{item.score.toFixed(2)}</span>
                    {item.primary && <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-400">PRIMARY</Badge>}
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-border/20 flex items-center gap-2">
                <Shield className="w-3 h-3" style={{ color: ACCENT }} />
                <span className="text-[10px] text-muted-foreground">
                  {sc.complianceNote.includes("No compliance") ? (
                    sc.complianceNote
                  ) : (
                    <>Compliance flag: <span className="text-amber-400 font-medium">{sc.complianceNote.replace("Compliance flag: ", "").replace("Regulatory flag: ", "")}</span></>
                  )}
                </span>
              </div>
            </div>

            {/* Product Portfolio Detection */}
            <div className="rounded-lg border border-border/40 bg-card/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4" style={{ color: ACCENT }} />
                <span className="text-sm font-semibold">Product Portfolio Detection</span>
              </div>
              <div className="flex flex-col gap-2">
                {sc.products.map(p => (
                  <div key={p.id} className="flex items-center gap-2" data-testid={`product-${p.id.toLowerCase().replace(/\s/g, "-")}`}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.active ? ACCENT : "rgb(71 85 105)" }} />
                    <span className={`text-xs ${p.active ? "font-semibold" : "text-muted-foreground"}`}>{p.label}</span>
                    {p.active && (
                      <Badge variant="outline" className="ml-auto text-[9px]" style={{ borderColor: `${ACCENT}50`, color: ACCENT }}>
                        {sc.activeProductBadge}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Routing decision */}
          <div
            className="rounded-lg border p-4 flex items-start gap-3"
            style={{ background: `${ACCENT}0A`, borderColor: `${ACCENT}30` }}
            data-testid="routing-decision"
          >
            <ArrowRight className="w-4 h-4 mt-0.5 shrink-0" style={{ color: ACCENT }} />
            <div>
              <div className="text-xs font-semibold" style={{ color: ACCENT }}>{sc.routingText}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{sc.routingDetail}</div>
            </div>
          </div>
        </>
      )}

      {/* While SUP-001 is actively running — show classifying placeholder */}
      {isRunning && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center" data-testid="triage-running-placeholder">
          <Cpu className="w-8 h-8 animate-pulse" style={{ color: `${ACCENT}80` }} />
          <div className="text-sm text-muted-foreground/60 font-medium">SUP-001 classifying…</div>
          <div className="text-xs text-muted-foreground/30">Triage intelligence will appear once classification completes</div>
        </div>
      )}

      {/* Idle — not yet started */}
      {isIdle && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center" data-testid="triage-idle-placeholder">
          <Cpu className="w-8 h-8" style={{ color: `${ACCENT}40` }} />
          <div className="text-sm text-muted-foreground/50 font-medium">SUP-001 standing by</div>
          <div className="text-xs text-muted-foreground/30">Select a scenario above to begin the triage pipeline</div>
        </div>
      )}

    </div>
  );
}
