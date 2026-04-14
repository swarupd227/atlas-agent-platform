import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertTriangle, Bot, Activity, Settings2, ChevronDown, ChevronRight,
  ArrowRight, Terminal, Package,
} from "lucide-react";
import {
  LINE_ITEMS, COMPATIBILITY_RULES, OTC_PIPELINE_STEPS,
  useOtcQuotePipeline, type OtcPipelineState, type LineItem,
} from "./otc-quote-constants";

interface Props {
  onScreenChange: (screen: number) => void;
}

const FAMILY_META = {
  turbine:    { label: "Turbine Assemblies",  color: "text-blue-400",   bg: "bg-blue-500/8",   border: "border-blue-500/20",   dot: "bg-blue-400",   icon: "⚙️" },
  filtration: { label: "Filtration Systems",  color: "text-green-400",  bg: "bg-green-500/8",  border: "border-green-500/20",  dot: "bg-green-400",  icon: "🔄" },
  control:    { label: "Control Electronics", color: "text-violet-400", bg: "bg-violet-500/8", border: "border-violet-500/20", dot: "bg-violet-400", icon: "🖥️" },
};

function SkuCard({ item }: { item: LineItem }) {
  const meta = FAMILY_META[item.family];
  return (
    <div className={`relative rounded-lg border p-2 text-[10px] ${meta.border} ${meta.bg} ${item.substituted ? "ring-1 ring-amber-500/30" : ""} ${item.addedByAi ? "ring-1 ring-green-500/30" : ""}`}>
      {item.substituted && (
        <Badge className="absolute -top-1.5 -right-1.5 text-[7px] px-1 py-0 bg-amber-500/15 text-amber-300 border-amber-500/30">
          SUBSTITUTED
        </Badge>
      )}
      {item.addedByAi && (
        <Badge className="absolute -top-1.5 -right-1.5 text-[7px] px-1 py-0 bg-green-500/15 text-green-400 border-green-500/20">
          AI ADDED
        </Badge>
      )}
      <div className={`font-mono font-bold ${meta.color}`}>{item.sku}</div>
      <div className="text-muted-foreground/80 leading-tight mt-0.5 line-clamp-2">{item.description}</div>
      <div className="flex justify-between mt-1">
        <span className="text-muted-foreground">Qty: {item.qty}</span>
        <span className="font-semibold text-foreground">${item.unitListPrice.toLocaleString()}</span>
      </div>
      {item.leadTimeAlert && (
        <div className="flex items-center gap-1 mt-1 text-amber-400">
          <AlertTriangle className="w-2.5 h-2.5" />
          <span className="text-[8px]">{item.leadTimeWeeks}wk lead</span>
        </div>
      )}
    </div>
  );
}

function FamilyGroup({ family, expanded, onToggle }: {
  family: "turbine" | "filtration" | "control";
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = FAMILY_META[family];
  const items = LINE_ITEMS.filter(i => i.family === family);
  const totalExt = items.reduce((s, i) => s + i.extendedListPrice, 0);
  const showItems = expanded ? items : items.slice(0, 4);

  return (
    <div className={`rounded-xl border ${meta.border} overflow-hidden`}>
      <button
        data-testid={`group-toggle-${family}`}
        onClick={onToggle}
        className={`w-full flex items-center gap-2 p-2.5 ${meta.bg} text-left`}
      >
        <span className="text-base">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <span className={`text-[11px] font-bold ${meta.color}`}>{meta.label}</span>
          <span className="text-[9px] text-muted-foreground ml-2">{items.length} SKUs · ${totalExt.toLocaleString()}</span>
        </div>
        {expanded ? <ChevronDown className={`w-3.5 h-3.5 ${meta.color}`} /> : <ChevronRight className={`w-3.5 h-3.5 ${meta.color}`} />}
      </button>
      {expanded && (
        <div className="p-2 grid grid-cols-2 gap-1.5">
          {showItems.map(item => <SkuCard key={item.sku} item={item} />)}
          {!expanded && items.length > 4 && (
            <div className={`rounded-lg border ${meta.border} ${meta.bg} p-2 flex items-center justify-center`}>
              <span className={`text-[10px] ${meta.color}`}>+{items.length - 4} more…</span>
            </div>
          )}
        </div>
      )}
      {!expanded && (
        <div className="px-2 pb-2 grid grid-cols-2 gap-1.5">
          {showItems.map(item => <SkuCard key={item.sku} item={item} />)}
          {items.length > 4 && (
            <button onClick={onToggle} className={`rounded-lg border ${meta.border} ${meta.bg} p-2 flex items-center justify-center cursor-pointer hover:opacity-80`}>
              <span className={`text-[10px] ${meta.color}`}>+{items.length - 4} more…</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PipelineNode({ step, index, state, isLast }: {
  step: typeof OTC_PIPELINE_STEPS[number];
  index: number;
  state: OtcPipelineState;
  isLast: boolean;
}) {
  const isDone = state.results.some(r => r.role === step.role);
  const isCurrent = state.currentRole === step.role;
  const ICONS = [Bot, Settings2, Activity, CheckCircle2];
  const Icon = ICONS[index];

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <div className={`flex-1 rounded-xl border p-2.5 transition-all min-w-0 ${
        isDone ? "border-green-500/30 bg-green-500/5" :
        isCurrent ? `${step.borderColor} ${step.bgColor} ring-1 ${step.borderColor}` :
        "border-border/20 opacity-40"}`}>
        <div className="flex items-center gap-2 mb-1.5">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isDone ? "bg-green-500/15" : isCurrent ? step.bgColor : "bg-muted/20"}`}>
            {isDone ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Icon className={`w-3.5 h-3.5 ${isCurrent ? step.color : "text-muted-foreground/40"}`} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className={`text-[9px] font-bold ${isDone ? "text-green-400" : isCurrent ? step.color : "text-muted-foreground/50"}`}>{step.agentCode}</span>
              {isCurrent && [0,1,2].map(i => <span key={i} className="w-1 h-1 rounded-full bg-orange-400" style={{ animation: `pulse 1s ${i*0.15}s infinite` }} />)}
            </div>
            <p className="text-[10px] font-semibold text-foreground/80 leading-tight truncate">{step.label}</p>
          </div>
        </div>
        <p className="text-[9px] text-muted-foreground/70 leading-tight line-clamp-2">{step.description}</p>
        {isDone && (
          <div className="mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />
            <span className="text-[9px] text-green-400/80">Complete</span>
          </div>
        )}
        {isCurrent && (
          <div className="mt-1.5">
            <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: "60%", background: "#FF6B35", opacity: 0.7, animation: "progressPulse 1.5s ease-in-out infinite" }} />
            </div>
          </div>
        )}
      </div>
      {!isLast && <ArrowRight className="w-3 h-3 text-border/40 shrink-0" />}
    </div>
  );
}

export default function OtcQuoteS2Configuration({ onScreenChange }: Props) {
  const { state } = useOtcQuotePipeline();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ turbine: true, filtration: false, control: false });
  const [subsAccepted, setSubsAccepted] = useState<Record<string, boolean>>({ "CE-CX450-ENH": false });
  const [spareAdded, setSpareAdded] = useState(false);

  const totalSKUs = LINE_ITEMS.length + (spareAdded ? 1 : 0);
  const totalList = LINE_ITEMS.reduce((s, i) => s + i.extendedListPrice, 0);

  const isComplete = state.status === "complete";
  const hasPricing = state.results.some(r => r.role === "pricing_optimisation" || r.role === "quote_generation");

  return (
    <div className="flex h-full min-h-0 gap-4 px-6 py-4">

      {/* ── Main: Configuration Canvas ──────────────────────────────── */}
      <div className="flex flex-col gap-3 flex-1 min-h-0 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[9px] border-orange-500/30 text-orange-400 bg-orange-500/5">OTC-AGT-001</Badge>
          <span className="text-xs font-semibold text-foreground">Product Configuration Canvas</span>
          <Badge className="ml-auto text-[8px] bg-blue-500/10 text-blue-400 border-blue-500/20">47 SKUs · 3 Families</Badge>
        </div>

        {/* Pipeline nodes */}
        <div className="flex items-stretch gap-1 shrink-0">
          {OTC_PIPELINE_STEPS.map((step, i) => (
            <PipelineNode key={step.role} step={step} index={i} state={state} isLast={i === OTC_PIPELINE_STEPS.length - 1} />
          ))}
        </div>

        {/* Family groups */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          {(["turbine", "filtration", "control"] as const).map(fam => (
            <FamilyGroup
              key={fam}
              family={fam}
              expanded={expanded[fam] ?? false}
              onToggle={() => setExpanded(p => ({ ...p, [fam]: !p[fam] }))}
            />
          ))}
        </div>

        {/* Tally bar */}
        <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/10 px-3 py-2 shrink-0 text-[10px]">
          <Package className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{totalSKUs} SKUs configured</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold text-foreground">${totalList.toLocaleString()} list</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-orange-400">Est. 90 sec total</span>
          {hasPricing && (
            <Button size="sm" onClick={() => onScreenChange(3)} className="ml-auto h-6 text-[9px] px-2 text-white" style={{ background: "#FF6B35" }}>
              View Pricing →
            </Button>
          )}
        </div>
      </div>

      {/* ── Right: Rules & Optimisation ─────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">
        {/* Rules applied */}
        <Card className="border-border/30 shrink-0">
          <CardHeader className="py-2 px-3 border-b border-border/20">
            <CardTitle className="text-[11px]">Configuration Rules</CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {COMPATIBILITY_RULES.map(rule => (
              <div key={rule.id} className={`rounded-lg border p-2 ${rule.severity === "green" ? "border-green-500/20 bg-green-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  {rule.severity === "green"
                    ? <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                    : <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />}
                  <span className={`text-[10px] font-semibold ${rule.severity === "green" ? "text-green-300" : "text-amber-300"}`}>{rule.title}</span>
                </div>
                <p className="text-[9px] text-muted-foreground leading-tight">{rule.detail}</p>
                {rule.status === "substitution" && (
                  <div className="flex gap-1 mt-1.5">
                    <Button
                      data-testid="button-accept-substitution"
                      size="sm"
                      onClick={() => setSubsAccepted(p => ({ ...p, "CE-CX450-ENH": true }))}
                      disabled={subsAccepted["CE-CX450-ENH"]}
                      className="h-5 text-[8px] px-2 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border-0"
                    >
                      {subsAccepted["CE-CX450-ENH"] ? "✓ Accepted" : "Accept"}
                    </Button>
                    <Button size="sm" className="h-5 text-[8px] px-2 bg-muted/20 text-muted-foreground border-0">
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* AI Recommendation */}
        <Card className="border-green-500/20 bg-green-500/5 shrink-0">
          <CardHeader className="py-2 px-3 border-b border-green-500/10">
            <CardTitle className="text-[11px] text-green-300">AI Recommendation</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">
              Add <span className="text-green-300 font-semibold">10× FK-ACS-SPR Filter Cartridge Spare Set</span> ($950) to increase contract value and reduce future re-order friction.
            </p>
            <Button
              data-testid="button-add-spare"
              size="sm"
              onClick={() => setSpareAdded(true)}
              disabled={spareAdded}
              className="w-full h-6 text-[9px] bg-green-500/20 text-green-300 hover:bg-green-500/30 border-0"
            >
              {spareAdded ? "✓ Added to Quote" : "+ Add Spares ($950)"}
            </Button>
          </CardContent>
        </Card>

        {/* Generate Pricing CTA */}
        <Button
          data-testid="button-generate-pricing"
          onClick={() => onScreenChange(3)}
          disabled={!hasPricing && state.status !== "running"}
          className="w-full h-8 text-[11px] font-semibold text-white shrink-0"
          style={{ background: "#FF6B35" }}
        >
          {hasPricing ? "View Pricing →" : state.status === "running" ? "Pricing in progress…" : "Generate Pricing"}
        </Button>

        {/* SSE Trace panel */}
        <Card className="flex-1 min-h-0 border-border/30 flex flex-col shrink-0" style={{ minHeight: "180px" }}>
          <CardHeader className="py-2 px-3 border-b border-border/20 shrink-0">
            <div className="flex items-center gap-1.5">
              <Terminal className="w-3 h-3 text-muted-foreground" />
              <CardTitle className="text-[10px]">Agent Trace</CardTitle>
              {state.status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 ml-auto animate-pulse" />}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-2 font-mono">
            {state.logEntries.length === 0 && (
              <p className="text-[9px] text-muted-foreground/50 italic">Waiting for Atlas…</p>
            )}
            {state.logEntries.map((log, i) => (
              <div key={i} className={`text-[9px] leading-relaxed ${
                log.type === "complete" ? "text-green-400" :
                log.type === "error"    ? "text-red-400"   :
                log.type === "progress" ? "text-orange-300/70" :
                "text-muted-foreground/70"}`}>
                <span className="text-orange-400/60 mr-1">[{log.agentCode}]</span>
                {log.message}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
