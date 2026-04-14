import { CheckCircle2, MapPin, Truck, Package, Leaf, Star, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  WAREHOUSES, FULFILLMENT_OPTIONS, ORDER_CONTEXT,
  type OrderPipelineState,
} from "./otc-order-constants";

interface Props {
  pipelineState: OrderPipelineState;
}

const SKU_ROWS = [
  { sku: "TX-7250-A", desc: "Turbine Assembly X-7250 Series A", qty: 8,  chi: 8,  atl: 4  },
  { sku: "TX-7250-B", desc: "Turbine Assembly X-7250 Series B", qty: 4,  chi: 4,  atl: 3  },
  { sku: "TX-7300-HD","desc":"Turbine Assembly X-7300 HD",      qty: 1,  chi: 2,  atl: 0  },
  { sku: "CE-CX450-ENH","desc":"CX-450 Enhanced Controller",    qty: 2,  chi: 3,  atl: 0  },
  { sku: "CE-PLC-SAFE","desc":"PLC Safety Controller",          qty: 2,  chi: 4,  atl: 0  },
  { sku: "TX-LUB-SYS","desc":"Lubrication System Module",       qty: 4,  chi: 5,  atl: 2  },
];

export default function OtcOrderS2Inventory({ pipelineState }: Props) {
  const { status, resolvedChecks } = pipelineState;
  const isRunning    = status === "running";
  const isComplete   = status === "complete";
  const inventoryOK  = resolvedChecks.includes("VAL-003") || isComplete;
  const selectedOpt  = inventoryOK ? "OPT-A" : null;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">

      {/* ── TOP 40%: Warehouse network + SKU table ─────────────────────────── */}
      <div className="flex min-h-0 border-b border-border/40" style={{ flex: "0 0 42%" }}>

        {/* Left: Warehouse map */}
        <div className="w-[52%] border-r border-border/40 px-4 py-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[11px] font-bold">Warehouse Network</h2>
              <p className="text-[9px] text-muted-foreground mt-0.5">Chicago · Atlanta · Dallas — for {ORDER_CONTEXT.orderId}</p>
            </div>
            {inventoryOK && (
              <Badge className="text-[9px] bg-green-500/15 text-green-400 border-green-500/20">
                VAL-003 Cleared ✓
              </Badge>
            )}
            {isRunning && !inventoryOK && (
              <Badge className="text-[9px] animate-pulse" style={{ background: "rgba(255,107,53,0.12)", color: "#FF6B35", borderColor: "rgba(255,107,53,0.25)" }}>
                OTC-AGT-004 resolving…
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {WAREHOUSES.map(wh => {
              const sel     = inventoryOK && wh.recommended;
              const hasUnits = wh.txUnits > 0;
              return (
                <div
                  key={wh.id}
                  data-testid={`warehouse-card-${wh.id}`}
                  className={`rounded-lg border p-2.5 transition-all ${
                    sel      ? "border-green-500/40 bg-green-500/6"
                    : hasUnits ? "border-border/40 bg-muted/10"
                    : "border-border/20 bg-muted/5 opacity-40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <MapPin className={`w-2.5 h-2.5 ${sel ? "text-green-400" : "text-muted-foreground/50"}`} />
                      <span className={`text-[10px] font-semibold ${sel ? "text-green-300" : ""}`}>{wh.name}</span>
                    </div>
                    {sel && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                  </div>
                  <p className="text-[9px] text-muted-foreground mb-1.5">{wh.city}, {wh.state}</p>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-muted-foreground/60">Units</span>
                      <span className={`font-mono font-bold ${hasUnits ? "text-foreground" : "text-muted-foreground/30"}`}>{wh.txUnits}</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-muted-foreground/60">Transit</span>
                      <span className={`font-mono ${wh.transit === "1 day" ? "text-green-400" : "text-muted-foreground/60"}`}>{wh.transit}</span>
                    </div>
                  </div>
                  {sel && (
                    <div className="mt-1.5 px-1 py-0.5 rounded bg-green-500/10 border border-green-500/15">
                      <p className="text-[8px] text-green-400 text-center font-medium">All units here</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: SKU inventory table */}
        <div className="flex-1 min-w-0 px-4 py-3 overflow-y-auto">
          <h3 className="text-[11px] font-bold mb-2">SKU Availability</h3>
          <div className="border border-border/30 rounded-lg overflow-hidden">
            <div className="grid grid-cols-5 bg-muted/20 border-b border-border/30 px-2 py-1">
              {["SKU", "Description", "Req'd", "CHI", "ATL"].map(h => (
                <span key={h} className="text-[8px] font-semibold text-muted-foreground uppercase">{h}</span>
              ))}
            </div>
            {SKU_ROWS.map((row, i) => {
              const chiCovers = row.chi >= row.qty;
              return (
                <div
                  key={row.sku}
                  data-testid={`inventory-row-${row.sku}`}
                  className={`grid grid-cols-5 px-2 py-1.5 border-b border-border/20 last:border-0 ${i % 2 === 0 ? "" : "bg-muted/5"}`}
                >
                  <span className="text-[9px] font-mono text-muted-foreground/80">{row.sku}</span>
                  <span className="text-[9px] text-foreground/70 truncate pr-1">{row.desc}</span>
                  <span className="text-[9px] font-mono font-bold">{row.qty}</span>
                  <div className="flex items-center gap-0.5">
                    <span className={`text-[9px] font-mono font-bold ${chiCovers ? "text-green-400" : ""}`}>{row.chi}</span>
                    {chiCovers && inventoryOK && <CheckCircle2 className="w-2 h-2 text-green-400" />}
                  </div>
                  <span className={`text-[9px] font-mono ${row.atl > 0 ? "text-muted-foreground/60" : "text-muted-foreground/25"}`}>
                    {row.atl > 0 ? row.atl : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── MIDDLE 35%: Three fulfillment option cards ──────────────────────── */}
      <div className="px-4 py-3 border-b border-border/40" style={{ flex: "0 0 37%" }}>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[11px] font-bold">Fulfillment Options</h3>
          {inventoryOK && (
            <span className="text-[9px] text-green-400">OTC-AGT-004 recommends Option A</span>
          )}
          {isRunning && !inventoryOK && (
            <span className="text-[9px] text-orange-400 animate-pulse">Evaluating options…</span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 h-[calc(100%-28px)]">
          {FULFILLMENT_OPTIONS.map(opt => {
            const isSelected = selectedOpt === opt.id;
            return (
              <div
                key={opt.id}
                data-testid={`fulfillment-option-${opt.id}`}
                className={`rounded-xl border p-3 flex flex-col transition-all ${
                  isSelected
                    ? "border-green-500/50 bg-green-500/6 ring-1 ring-green-500/20"
                    : "border-border/30 bg-muted/8 opacity-75"
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-medium ${opt.badgeClass}`}>{opt.sublabel}</span>
                      {isSelected && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                    </div>
                    <p className="text-[10px] font-semibold text-foreground leading-snug">{opt.label}</p>
                  </div>
                  <p className="text-[13px] font-bold text-foreground tabular-nums">{opt.costLabel}</p>
                </div>

                {/* Key metrics */}
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-1.5 text-[9px]">
                    <Truck className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
                    <span className="text-foreground/70">Delivery: <span className="font-medium text-foreground">{opt.deliveryDate}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px]">
                    <Package className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
                    <span className="text-foreground/70">{opt.coverage} · {opt.transitDays}-day</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px]">
                    <Leaf className="w-2.5 h-2.5 text-emerald-400/60 shrink-0" />
                    <span className={`font-medium ${opt.carbonKg <= 130 ? "text-emerald-400" : opt.carbonKg <= 150 ? "text-yellow-400" : "text-red-400"}`}>
                      {opt.carbonKg} kg CO₂
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px]">
                    <Star className="w-2.5 h-2.5 text-yellow-400/60 shrink-0" />
                    <span className="text-foreground/70">CSAT: <span className="font-medium text-yellow-300">{opt.csatPct}%</span></span>
                  </div>
                </div>

                {/* Notes */}
                <p className="text-[8px] text-muted-foreground/55 mt-1.5 leading-relaxed border-t border-border/20 pt-1.5">
                  {opt.notes}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── BOTTOM 25%: Customer preference + Send Delivery Promise CTA ─────── */}
      <div className="flex items-center gap-4 px-4 py-3 flex-1 min-h-0">

        {/* Customer preference panel */}
        <div className="flex-1 min-w-0 p-3 rounded-xl border border-border/30 bg-muted/10 h-full flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-semibold text-foreground mb-1">Customer Preference Profile</p>
            <p className="text-[9px] text-muted-foreground/70 mb-2">
              Meridian Manufacturing · CUST-00892 · 7-year relationship
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="px-2 py-1.5 rounded-lg bg-muted/15 border border-border/25">
                <p className="text-[8px] text-muted-foreground/60">Split-Ship Acceptance</p>
                <p className="text-[13px] font-bold text-green-400">87%</p>
                <p className="text-[8px] text-muted-foreground/50">last 24 orders</p>
              </div>
              <div className="px-2 py-1.5 rounded-lg bg-muted/15 border border-border/25">
                <p className="text-[8px] text-muted-foreground/60">Avg CSAT Score</p>
                <p className="text-[13px] font-bold text-yellow-400">4.6</p>
                <p className="text-[8px] text-muted-foreground/50">/ 5.0 rating</p>
              </div>
              <div className="px-2 py-1.5 rounded-lg bg-muted/15 border border-border/25">
                <p className="text-[8px] text-muted-foreground/60">Carbon Pref.</p>
                <p className="text-[13px] font-bold text-emerald-400">Low</p>
                <p className="text-[8px] text-muted-foreground/50">ESG policy</p>
              </div>
            </div>
          </div>
          <p className="text-[8px] text-muted-foreground/50 mt-2">
            MSA §6.2 — RUSH orders prioritise delivery speed. Option A matches both SLA and customer split-ship preference.
          </p>
        </div>

        {/* Notification preview + CTA */}
        <div className="w-[240px] shrink-0 h-full flex flex-col justify-between">
          <div className="p-3 rounded-xl border border-border/30 bg-muted/10 flex-1 mb-2">
            <p className="text-[9px] font-semibold text-muted-foreground mb-1.5">Auto-Generated Notification Preview</p>
            <div className="bg-background/50 rounded-lg border border-border/30 p-2">
              <p className="text-[8px] text-muted-foreground/60 mb-0.5">To: j.davis@meridian-mfg.com</p>
              <p className="text-[8px] text-foreground/80 leading-relaxed">
                Your order <span className="font-mono font-bold text-foreground">{ORDER_CONTEXT.orderId}</span> ({ORDER_CONTEXT.poNumber}) is confirmed.
                Delivery in 2 waves: Wave 1 Apr 21, Wave 2 Apr 22.
                Shipping: $1,840 ground. Track at NovaTech portal.
              </p>
            </div>
          </div>

          <Button
            data-testid="button-send-delivery-promise"
            disabled={!inventoryOK}
            className="w-full text-[11px] font-semibold"
            style={inventoryOK ? { background: "#FF6B35", color: "white" } : {}}
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            {inventoryOK ? "Send Delivery Promise" : "Awaiting Resolution…"}
          </Button>
        </div>
      </div>
    </div>
  );
}
