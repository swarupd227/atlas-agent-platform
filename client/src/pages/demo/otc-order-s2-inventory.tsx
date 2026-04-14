import { CheckCircle2, Truck, Package, Leaf, Star, Send } from "lucide-react";
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
  { sku: "TX-7250-A",   desc: "Turbine Assembly X-7250 Series A", qty: 8, chi: 8,  atl: 4  },
  { sku: "TX-7250-B",   desc: "Turbine Assembly X-7250 Series B", qty: 4, chi: 4,  atl: 3  },
  { sku: "TX-7300-HD",  desc: "Turbine Assembly X-7300 HD",       qty: 1, chi: 2,  atl: 0  },
  { sku: "CE-CX450-ENH",desc: "CX-450 Enhanced Controller",       qty: 2, chi: 3,  atl: 0  },
  { sku: "CE-PLC-SAFE", desc: "PLC Safety Controller",            qty: 2, chi: 4,  atl: 0  },
  { sku: "TX-LUB-SYS",  desc: "Lubrication System Module",        qty: 4, chi: 5,  atl: 2  },
];

// ─── Warehouse Network SVG Map ────────────────────────────────────────────────
// Schematic US midwest layout: Chicago · Atlanta · Dallas (nodes) + Detroit (destination ★)

function WarehouseNetworkMap({ inventoryOK, isRunning }: { inventoryOK: boolean; isRunning: boolean }) {
  // Node positions (in 400×210 viewBox)
  const CHI = { x: 140, y: 90  };   // Chicago DC — recommended source
  const ATL = { x: 195, y: 165 };   // Atlanta Hub — secondary
  const DAL = { x:  65, y: 175 };   // Dallas Center — no stock
  const DET = { x: 315, y:  48 };   // Detroit, MI — destination (customer)

  const chiColor  = inventoryOK ? "#22c55e" : isRunning ? "#FF6B35" : "#6b7280";
  const chiStroke = inventoryOK ? "#22c55e" : isRunning ? "#FF6B35" : "#374151";

  return (
    <svg viewBox="0 0 400 210" width="100%" height="100%" style={{ overflow: "visible" }}>
      <defs>
        {/* Animated dash for active route */}
        <style>{`
          @keyframes dashMove {
            to { stroke-dashoffset: -24; }
          }
          .route-active {
            animation: dashMove 1.2s linear infinite;
          }
        `}</style>
        {/* Arrow markers */}
        <marker id="arrow-green" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#22c55e" opacity="0.8" />
        </marker>
        <marker id="arrow-gray" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#374151" opacity="0.4" />
        </marker>
      </defs>

      {/* ── Background: faint US map silhouette suggestion ── */}
      <rect x="0" y="0" width="400" height="210" fill="transparent" />

      {/* ── Route lines ── */}
      {/* Chicago → Detroit (primary, animated when running or resolved) */}
      <line
        x1={CHI.x} y1={CHI.y} x2={DET.x} y2={DET.y}
        stroke={inventoryOK ? "#22c55e" : isRunning ? "#FF6B35" : "#374151"}
        strokeWidth={inventoryOK || isRunning ? 1.8 : 1}
        strokeDasharray="8 4"
        strokeDashoffset="0"
        opacity={inventoryOK || isRunning ? 0.85 : 0.25}
        markerEnd={inventoryOK ? "url(#arrow-green)" : undefined}
        className={inventoryOK || isRunning ? "route-active" : ""}
      />

      {/* Atlanta → Detroit (secondary, dimmed) */}
      <line
        x1={ATL.x} y1={ATL.y} x2={DET.x} y2={DET.y}
        stroke="#4b5563"
        strokeWidth="1"
        strokeDasharray="5 5"
        opacity="0.2"
        markerEnd="url(#arrow-gray)"
      />

      {/* ── Transit annotation on CHI→DET route ── */}
      {(inventoryOK || isRunning) && (
        <g>
          <rect x="190" y="54" width="65" height="13" rx="3" fill="rgba(0,0,0,0.5)" />
          <text x="222" y="64" textAnchor="middle" fill={inventoryOK ? "#22c55e" : "#FF6B35"} fontSize="7" fontWeight="600">
            1 day · 273 mi
          </text>
        </g>
      )}

      {/* ── Dallas (no stock — very dimmed) ── */}
      <circle cx={DAL.x} cy={DAL.y} r="11" fill="rgba(55,65,81,0.3)" stroke="#374151" strokeWidth="1" opacity="0.4" />
      <text x={DAL.x} y={DAL.y + 4} textAnchor="middle" fill="#4b5563" fontSize="8" fontWeight="600" opacity="0.5">DAL</text>
      <text x={DAL.x} y={DAL.y + 20} textAnchor="middle" fill="#374151" fontSize="7" opacity="0.4">0 units</text>
      <text x={DAL.x} y={DAL.y + 29} textAnchor="middle" fill="#374151" fontSize="6.5" opacity="0.4">Dallas, TX</text>

      {/* ── Atlanta (secondary — muted) ── */}
      <circle cx={ATL.x} cy={ATL.y} r="13" fill="rgba(75,85,99,0.15)" stroke="#4b5563" strokeWidth="1" opacity="0.6" />
      <text x={ATL.x} y={ATL.y + 4} textAnchor="middle" fill="#6b7280" fontSize="8" fontWeight="600">ATL</text>
      <text x={ATL.x} y={ATL.y + 20} textAnchor="middle" fill="#4b5563" fontSize="7">4 units</text>
      <text x={ATL.x} y={ATL.y + 29} textAnchor="middle" fill="#4b5563" fontSize="6.5">Atlanta, GA</text>
      <text x={ATL.x} y={ATL.y + 37} textAnchor="middle" fill="#4b5563" fontSize="6.5">3-day transit</text>

      {/* ── Chicago (primary source — highlighted) ── */}
      {inventoryOK && (
        <circle cx={CHI.x} cy={CHI.y} r="22" fill="rgba(34,197,94,0.06)" stroke="#22c55e" strokeWidth="0.5" opacity="0.5" />
      )}
      <circle
        cx={CHI.x} cy={CHI.y} r="15"
        fill={inventoryOK ? "rgba(34,197,94,0.12)" : isRunning ? "rgba(255,107,53,0.08)" : "rgba(75,85,99,0.1)"}
        stroke={chiStroke}
        strokeWidth={inventoryOK ? "1.8" : "1.2"}
      />
      <text x={CHI.x} y={CHI.y + 4} textAnchor="middle" fill={chiColor} fontSize="8.5" fontWeight="700">CHI</text>
      {inventoryOK && (
        <text x={CHI.x} y={CHI.y - 2} textAnchor="middle" fill="#22c55e" fontSize="6" opacity="0.7">✓</text>
      )}
      <text x={CHI.x} y={CHI.y + 24} textAnchor="middle" fill={inventoryOK ? "#22c55e" : "#9ca3af"} fontSize="7.5" fontWeight="600">8 units</text>
      <text x={CHI.x} y={CHI.y + 33} textAnchor="middle" fill="#6b7280" fontSize="6.5">Chicago, IL</text>
      <text x={CHI.x} y={CHI.y + 41} textAnchor="middle" fill={inventoryOK ? "#22c55e" : "#6b7280"} fontSize="6.5">1-day transit</text>
      {inventoryOK && (
        <text x={CHI.x} y={CHI.y + 50} textAnchor="middle" fill="#22c55e" fontSize="6.5" fontWeight="600">ATP: May 2</text>
      )}

      {/* ── Detroit (destination ★) ── */}
      <text x={DET.x} y={DET.y + 6} textAnchor="middle" fill="#FF6B35" fontSize="18" opacity="0.9">★</text>
      <text x={DET.x} y={DET.y + 22} textAnchor="middle" fill="#FF6B35" fontSize="8" fontWeight="700">DETROIT</text>
      <text x={DET.x} y={DET.y + 31} textAnchor="middle" fill="#9ca3af" fontSize="6.5">Meridian Mfg</text>
      <text x={DET.x} y={DET.y + 39} textAnchor="middle" fill="#6b7280" fontSize="6">Detroit, MI</text>

      {/* ── Legend ── */}
      <g opacity="0.7">
        <text x="6" y="15" fill="#6b7280" fontSize="6.5" fontWeight="600">WAREHOUSE NETWORK</text>
        <circle cx="8" cy="22" r="3" fill="rgba(34,197,94,0.2)" stroke="#22c55e" strokeWidth="0.8" />
        <text x="14" y="25.5" fill="#6b7280" fontSize="6">Source DC</text>
        <text x="14" y="34" fill="#6b7280" fontSize="6">★ Destination</text>
      </g>
    </svg>
  );
}

export default function OtcOrderS2Inventory({ pipelineState }: Props) {
  const { status, resolvedChecks } = pipelineState;
  const isRunning    = status === "running";
  const isComplete   = status === "complete";
  const inventoryOK  = resolvedChecks.includes("VAL-003") || isComplete;
  const selectedOpt  = inventoryOK ? "OPT-A" : null;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">

      {/* ── TOP 42%: Warehouse network MAP + SKU table ─────────────────────── */}
      <div className="flex min-h-0 border-b border-border/40" style={{ flex: "0 0 42%" }}>

        {/* Left: Warehouse network MAP (SVG-based) */}
        <div className="w-[52%] border-r border-border/40 px-3 py-3 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div>
              <h2 className="text-[11px] font-bold">Warehouse Network</h2>
              <p className="text-[9px] text-muted-foreground mt-0.5">Chicago · Atlanta · Dallas → Detroit</p>
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

          {/* SVG map — takes remaining height */}
          <div className="flex-1 min-h-0" data-testid="warehouse-network-map">
            <WarehouseNetworkMap inventoryOK={inventoryOK} isRunning={isRunning} />
          </div>

          {/* Warehouse status bars below map */}
          <div className="grid grid-cols-3 gap-1.5 shrink-0 mt-1">
            {WAREHOUSES.map(wh => {
              const isSelected = inventoryOK && wh.recommended;
              return (
                <div
                  key={wh.id}
                  data-testid={`warehouse-card-${wh.id}`}
                  className={`px-1.5 py-1 rounded border text-center transition-all ${
                    isSelected    ? "border-green-500/30 bg-green-500/6"
                    : wh.txUnits > 0 ? "border-border/30 bg-muted/8"
                    : "border-border/20 bg-muted/5 opacity-40"
                  }`}
                >
                  <p className={`text-[8px] font-semibold ${isSelected ? "text-green-400" : "text-muted-foreground/60"}`}>{wh.name}</p>
                  <p className={`text-[10px] font-bold font-mono ${isSelected ? "text-green-400" : wh.txUnits > 0 ? "text-foreground" : "text-muted-foreground/30"}`}>{wh.txUnits}</p>
                  <p className={`text-[7px] ${isSelected ? "text-green-400/70" : "text-muted-foreground/40"}`}>{wh.transit}</p>
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
                    <span className={`font-medium ${opt.carbonKg <= 130 ? "text-emerald-400" : opt.carbonKg <= 200 ? "text-yellow-400" : "text-red-400"}`}>
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
                Delivery in 2 waves: Wave 1 May 2, Wave 2 May 3.
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
