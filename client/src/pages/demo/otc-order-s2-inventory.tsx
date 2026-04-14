import { CheckCircle2, MapPin, Truck, Package, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  const { status, resolvedChecks, results } = pipelineState;
  const isRunning = status === "running";
  const isComplete = status === "complete";
  const inventoryCleared = resolvedChecks.includes("VAL-003") || isComplete;
  const inventoryResult = results.find(r => r.role === "inventory_validation");
  const selectedOption = inventoryCleared ? "OPT-A" : null;

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ── Left column — warehouse map + inventory table ────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4 border-r border-border/40">

        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold">Inventory Availability</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {ORDER_CONTEXT.orderId} · {ORDER_CONTEXT.customer} · 12 turbine units requested
            </p>
          </div>
          {inventoryCleared && (
            <Badge className="text-[9px] bg-green-500/15 text-green-400 border-green-500/20">
              VAL-003 Cleared ✓
            </Badge>
          )}
          {isRunning && !inventoryCleared && (
            <Badge className="text-[9px] animate-pulse" style={{ background: "rgba(255,107,53,0.12)", color: "#FF6B35", borderColor: "rgba(255,107,53,0.25)" }}>
              OTC-AGT-004 resolving…
            </Badge>
          )}
        </div>

        {/* Warehouse cards — visual "map" */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {WAREHOUSES.map(wh => {
            const isSelected = inventoryCleared && wh.recommended;
            const hasUnits = wh.txUnits > 0;
            return (
              <div
                key={wh.id}
                data-testid={`warehouse-card-${wh.id}`}
                className={`rounded-lg border p-3 transition-all ${
                  isSelected ? "border-green-500/30 bg-green-500/5"
                  : hasUnits  ? "border-border/40 bg-muted/10"
                  : "border-border/20 bg-muted/5 opacity-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <MapPin className={`w-3 h-3 shrink-0 ${isSelected ? "text-green-400" : "text-muted-foreground/60"}`} />
                    <span className={`text-[11px] font-semibold ${isSelected ? "text-green-300" : "text-foreground"}`}>{wh.name}</span>
                  </div>
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">{wh.city}, {wh.state}</p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-muted-foreground/60">Turbine units</span>
                    <span className={`font-mono font-bold ${hasUnits ? "text-foreground" : "text-muted-foreground/40"}`}>{wh.txUnits}</span>
                  </div>
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-muted-foreground/60">ATP date</span>
                    <span className="font-mono text-foreground/70">{wh.atpDate}</span>
                  </div>
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-muted-foreground/60">Transit</span>
                    <span className={`font-mono ${wh.transit === "1 day" ? "text-green-400" : "text-muted-foreground/70"}`}>{wh.transit}</span>
                  </div>
                </div>
                {isSelected && (
                  <div className="mt-2 px-1.5 py-1 rounded bg-green-500/10 border border-green-500/15">
                    <p className="text-[9px] text-green-400 text-center font-medium">Selected — all units here</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* SKU-level inventory table */}
        <div className="border border-border/30 rounded-lg overflow-hidden">
          <div className="grid grid-cols-5 gap-0 bg-muted/20 border-b border-border/30 px-3 py-1.5">
            {["SKU", "Description", "Requested", "Chicago", "Atlanta"].map(h => (
              <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
            ))}
          </div>
          {SKU_ROWS.map((row, i) => {
            const chiCovers = row.chi >= row.qty;
            return (
              <div
                key={row.sku}
                data-testid={`inventory-row-${row.sku}`}
                className={`grid grid-cols-5 gap-0 px-3 py-2 border-b border-border/20 last:border-0 transition-all ${
                  inventoryCleared && chiCovers ? "bg-green-500/3" : ""
                } ${i % 2 === 0 ? "" : "bg-muted/5"}`}
              >
                <span className="text-[10px] font-mono text-muted-foreground/80">{row.sku}</span>
                <span className="text-[10px] text-foreground/70 truncate pr-2">{row.desc}</span>
                <span className="text-[10px] font-mono text-foreground font-semibold">{row.qty}</span>
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] font-mono font-semibold ${chiCovers ? "text-green-400" : "text-foreground"}`}>{row.chi}</span>
                  {chiCovers && inventoryCleared && <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />}
                </div>
                <span className={`text-[10px] font-mono ${row.atl > 0 ? "text-foreground/60" : "text-muted-foreground/30"}`}>{row.atl > 0 ? row.atl : "—"}</span>
              </div>
            );
          })}
        </div>

        {inventoryResult?.message && (
          <div className="mt-3 px-3 py-2 rounded-lg border border-green-500/20 bg-green-500/5">
            <p className="text-[10px] text-green-300/80 leading-relaxed">{inventoryResult.message.slice(0, 300)}</p>
          </div>
        )}
      </div>

      {/* ── Right column — fulfillment options + customer preference ──────── */}
      <div className="w-[280px] shrink-0 overflow-y-auto px-4 py-4">

        <h3 className="text-[11px] font-semibold mb-3">Fulfillment Options</h3>

        <div className="space-y-3 mb-5">
          {FULFILLMENT_OPTIONS.map(opt => {
            const isSelected = selectedOption === opt.id;
            return (
              <div
                key={opt.id}
                data-testid={`fulfillment-option-${opt.id}`}
                className={`rounded-lg border p-3 transition-all ${
                  isSelected ? "border-green-500/30 bg-green-500/5"
                  : opt.recommended ? "border-orange-500/20 bg-orange-500/5"
                  : "border-border/30 bg-muted/10 opacity-70"
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                      {opt.recommended && !isSelected && (
                        <span className="text-[8px] px-1 rounded bg-orange-500/15 text-orange-400 border border-orange-500/20">RECOMMENDED</span>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold text-foreground mt-0.5">{opt.label}</p>
                  </div>
                  {isSelected && (
                    <Badge className="text-[9px] bg-green-500/15 text-green-400 border-green-500/20 shrink-0">Selected</Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <Package className="w-3 h-3 text-muted-foreground/60" />
                    <span className="text-foreground/70">{opt.coverage}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <Truck className="w-3 h-3 text-muted-foreground/60" />
                    <span className="text-foreground/70">Ship {opt.shipDate} · {opt.transitDays}-day transit</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <DollarSign className="w-3 h-3 text-muted-foreground/60" />
                    <span className={opt.recommended ? "text-green-400" : "text-muted-foreground/60"}>{opt.cost}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Customer preference */}
        <div className="mb-4 px-3 py-2.5 rounded-lg border border-border/30 bg-muted/10">
          <p className="text-[10px] font-semibold text-muted-foreground mb-1">Customer Preference</p>
          <p className="text-[11px] text-foreground/80">Earliest delivery</p>
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">MSA §6.2 — RUSH orders prioritise delivery speed</p>
        </div>

        {/* Savings callout */}
        {inventoryCleared && (
          <div className="px-3 py-2.5 rounded-lg border border-green-500/20 bg-green-500/8">
            <p className="text-[10px] font-semibold text-green-400 mb-1">Split-Ship Avoided</p>
            <p className="text-[11px] text-green-300/90">$840 surcharge saved</p>
            <p className="text-[9px] text-green-400/60 mt-0.5">Chicago DC covers all 12 units. Single pick ticket.</p>
          </div>
        )}

        {!inventoryCleared && !isRunning && (
          <div className="px-3 py-2.5 rounded-lg border border-border/30 bg-muted/10">
            <p className="text-[10px] text-muted-foreground/60 italic">Run validation to resolve inventory split and select fulfillment option.</p>
          </div>
        )}

        {isRunning && !inventoryCleared && (
          <div className="px-3 py-2.5 rounded-lg border border-orange-500/20 bg-orange-500/8 animate-pulse">
            <p className="text-[10px] text-orange-400">OTC-AGT-004 evaluating fulfillment options…</p>
          </div>
        )}
      </div>
    </div>
  );
}
