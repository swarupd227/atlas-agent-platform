import { Truck, CheckCircle, Clock, AlertCircle, ArrowRight, BarChart2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FulfillmentPipelineState } from "./otc-fulfillment-constants";
import { OTC_FULFILLMENT_COLOR } from "./otc-fulfillment-constants";
import { AgentJsonSummaryPanel } from "./otc-fulfillment-agent-summary";

const ACCENT = OTC_FULFILLMENT_COLOR;

const PRIORITY_CUSTOMERS = [
  { customer: "Meridian Manufacturing",  order: "ORD-78432", dc: "Chicago → Dallas",     value: "$429K", tier: "Platinum", daysLeft: 0.75, newEta: "May 5",  status: "REROUTED" },
  { customer: "Delta Precision Parts",   order: "ORD-71204", dc: "Chicago → Philadelphia", value: "$285K", tier: "Platinum", daysLeft: 0.58, newEta: "May 6",  status: "AT_RISK"  },
  { customer: "Acuity Healthcare",       order: "ORD-69871", dc: "Indianapolis → Atlanta", value: "$318K", tier: "Platinum", daysLeft: 0.92, newEta: "May 5",  status: "REROUTED" },
  { customer: "CoreTech Systems",        order: "ORD-82011", dc: "Chicago → Atlanta",      value: "$197K", tier: "Gold",     daysLeft: 1.17, newEta: "May 5",  status: "REROUTED" },
  { customer: "Vertex Industrial",       order: "ORD-77340", dc: "St. Louis → Dallas",     value: "$163K", tier: "Gold",     daysLeft: 1.29, newEta: "May 5",  status: "REROUTED" },
  { customer: "Pinnacle Aerospace",      order: "ORD-65120", dc: "Chicago → Dallas",       value: "$143K", tier: "Platinum", daysLeft: 1.42, newEta: "May 6",  status: "REROUTED" },
  { customer: "NorthStar Energy",        order: "ORD-88710", dc: "Indianapolis → Atlanta", value: "$138K", tier: "Gold",     daysLeft: 1.58, newEta: "May 6",  status: "REROUTED" },
  { customer: "Franklin Medical",        order: "ORD-73301", dc: "Chicago → Philadelphia", value: "$125K", tier: "Platinum", daysLeft: 2.0,  newEta: "May 7",  status: "REROUTED" },
];

const CARRIER_STATUS = [
  { carrier: "UPS",   zone: "Midwest Outbound", status: "DISRUPTED", outbound_clear: "Thu 06:00 CT", alternate_clear: "NORMAL" },
  { carrier: "FedEx", zone: "Midwest Outbound", status: "DISRUPTED", outbound_clear: "Wed 20:00 CT", alternate_clear: "NORMAL" },
  { carrier: "USPS",  zone: "Midwest Outbound", status: "DISRUPTED", outbound_clear: "Thu 12:00 CT", alternate_clear: "NORMAL" },
];

const DC_ASSIGNMENTS = [
  { dc: "Dallas DC",       assigned: 145, pickup: "Today 16:00 CT", carrier: "UPS Ground"   },
  { dc: "Atlanta DC",      assigned: 98,  pickup: "Today 17:30 ET", carrier: "FedEx Ground" },
  { dc: "Philadelphia DC", assigned: 69,  pickup: "Today 15:00 ET", carrier: "UPS Ground"   },
];

interface Props { state: FulfillmentPipelineState; }

function TierBadge({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    Platinum: "bg-amber-400/15 text-amber-400 border-amber-400/30",
    Gold:     "bg-yellow-400/15 text-yellow-400 border-yellow-400/30",
    Standard: "bg-slate-400/15 text-slate-400 border-slate-400/30",
  };
  return <span className={`text-[9px] font-semibold uppercase border rounded px-1 py-0.5 ${map[tier] ?? map.Standard}`}>{tier}</span>;
}

export default function OtcFulfillmentS2Rerouting({ state }: Props) {
  const agt007 = state.agents.find(a => a.code === "OTC-AGT-007");
  const isRunning = agt007?.status === "running";
  const isDone    = agt007?.status === "complete";
  const slaCompliant = isDone ? 289 : 0;
  const atRisk       = isDone ? 23  : 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Carrier signal status */}
      <div className="rounded-lg border border-border/40 bg-card/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Truck className="w-4 h-4" style={{ color: ACCENT }} />
          <span className="text-sm font-semibold">Live Carrier Signals</span>
          {isRunning && <Badge variant="outline" className="text-[10px] border-amber-400/50 text-amber-400 ml-auto animate-pulse">OTC-AGT-007 Processing</Badge>}
          {isDone    && <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400 ml-auto">Routing Updated</Badge>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {CARRIER_STATUS.map(c => (
            <div key={c.carrier} className="rounded-md border border-border/30 bg-background/30 p-3" data-testid={`carrier-${c.carrier.toLowerCase()}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">{c.carrier}</span>
                <Badge variant="outline" className="text-[9px] border-rose-500/40 text-rose-400">Disrupted</Badge>
              </div>
              <div className="text-[10px] text-muted-foreground">Outbound Midwest: <span className="text-rose-400">suspended</span></div>
              <div className="text-[10px] text-muted-foreground">Clears: <span className="text-foreground">{c.outbound_clear}</span></div>
              <div className="text-[10px] text-muted-foreground mt-1">Alternate DCs: <span className="text-emerald-400">Normal ✓</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* DC assignment execution */}
      <div className="rounded-lg border border-border/40 bg-card/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold">Rerouting Execution</span>
          <span className="ml-auto text-xs text-muted-foreground">312 shipments · $47,200 incremental</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {DC_ASSIGNMENTS.map(dc => (
            <div
              key={dc.dc}
              className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3"
              data-testid={`dc-assignment-${dc.dc.replace(/\s+/g, "-").toLowerCase()}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold">{dc.dc}</span>
              </div>
              <div className="text-xl font-bold text-emerald-400">{dc.assigned}</div>
              <div className="text-[10px] text-muted-foreground">shipments assigned</div>
              <div className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {dc.pickup}
              </div>
              <div className="text-[10px] text-muted-foreground">{dc.carrier}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ETA confirmation */}
      {isDone && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
            <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
            <div className="text-2xl font-bold text-emerald-400">{slaCompliant}</div>
            <div className="text-xs text-muted-foreground">SLA-Compliant Deliveries</div>
            <div className="text-[10px] text-emerald-400/70 mt-0.5">92.6% of priority shipments</div>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-center">
            <AlertCircle className="w-6 h-6 text-amber-400 mx-auto mb-1" />
            <div className="text-2xl font-bold text-amber-400">{atRisk}</div>
            <div className="text-xs text-muted-foreground">Remaining At-Risk</div>
            <div className="text-[10px] text-amber-400/70 mt-0.5">Remote Midwest Platinum accounts</div>
          </div>
        </div>
      )}

      {/* Priority customer queue */}
      <div className="rounded-lg border border-border/40 bg-card/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ArrowRight className="w-4 h-4" style={{ color: ACCENT }} />
          <span className="text-sm font-semibold">Priority Customer Triage Queue</span>
          <span className="ml-auto text-[10px] text-muted-foreground">Sorted by SLA urgency ↑</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="priority-queue-table">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Customer</th>
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Order</th>
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Routing</th>
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Value</th>
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Tier</th>
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium">SLA</th>
                <th className="text-left py-2 text-muted-foreground font-medium">New ETA</th>
              </tr>
            </thead>
            <tbody>
              {PRIORITY_CUSTOMERS.map((row, i) => (
                <tr
                  key={row.order}
                  className={`border-b border-border/20 transition-colors ${i === 0 ? "bg-amber-500/5" : ""}`}
                  data-testid={`queue-row-${row.order}`}
                >
                  <td className="py-2 pr-3 font-medium">{row.customer}</td>
                  <td className="py-2 pr-3 font-mono text-muted-foreground">{row.order}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{row.dc}</td>
                  <td className="py-2 pr-3 font-semibold">{row.value}</td>
                  <td className="py-2 pr-3"><TierBadge tier={row.tier} /></td>
                  <td className="py-2 pr-3">
                    <span className={`font-mono ${row.daysLeft < 1 ? "text-rose-400" : "text-amber-400"}`}>
                      {row.daysLeft < 1 ? `${Math.round(row.daysLeft * 24)}h` : `${row.daysLeft.toFixed(1)}d`}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-1.5">
                      {row.status === "REROUTED" ? (
                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                      )}
                      <span className={row.status === "REROUTED" ? "text-emerald-400" : "text-amber-400"}>{row.newEta}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground">
          Showing 8 of 312 priority shipments · Sorted by hours to SLA breach
        </div>
      </div>

      {isDone && state.agentSummaries["OTC-AGT-007"] && (
        <AgentJsonSummaryPanel
          agentCode="OTC-AGT-007"
          summary={state.agentSummaries["OTC-AGT-007"]}
          label="Carrier Signal Ingestion & Routing Update"
        />
      )}
    </div>
  );
}
