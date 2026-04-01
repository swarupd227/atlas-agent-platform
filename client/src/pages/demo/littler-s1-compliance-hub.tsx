import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, CheckCircle2, Clock, Shield, MapPin, FileText,
  TrendingUp, X, ChevronRight, Building2, Users, Globe,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  REGULATORY_ALERTS, MEGARETAIL_STATES, MEGARETAIL_CLIENT,
  useLittlerPipeline, type ComplianceStatus,
} from "./littler-constants";

interface Props {
  onScreenChange: (screen: number) => void;
}

const STATUS_COLORS: Record<ComplianceStatus, string> = {
  compliant: "bg-green-500",
  "needs-review": "bg-amber-500",
  "non-compliant": "bg-red-500",
};
const STATUS_BADGE: Record<ComplianceStatus, string> = {
  compliant: "bg-green-500/10 text-green-400 border-green-500/20",
  "needs-review": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "non-compliant": "bg-red-500/10 text-red-400 border-red-500/20",
};
const STATUS_LABEL: Record<ComplianceStatus, string> = {
  compliant: "Compliant",
  "needs-review": "Needs Review",
  "non-compliant": "Non-Compliant",
};
const SEVERITY_BADGE: Record<string, string> = {
  High: "bg-red-500/10 text-red-400 border-red-500/20",
  Medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Low: "bg-blue-500/10 text-blue-300 border-blue-500/20",
};

const compliantCount = MEGARETAIL_STATES.filter(s => s.status === "compliant").length;
const reviewCount = MEGARETAIL_STATES.filter(s => s.status === "needs-review").length;
const nonCompliantCount = MEGARETAIL_STATES.filter(s => s.status === "non-compliant").length;
const PIE_DATA = [
  { name: "Compliant", value: compliantCount, color: "#22c55e" },
  { name: "Needs Review", value: reviewCount, color: "#f59e0b" },
  { name: "Non-Compliant", value: nonCompliantCount, color: "#ef4444" },
];

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs shadow-lg">
      <span className="font-medium">{payload[0].name}</span>
      <span className="ml-2 text-muted-foreground">{payload[0].value} states</span>
    </div>
  );
}

export default function LittlerS1ComplianceHub({ onScreenChange }: Props) {
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const { trigger } = useLittlerPipeline();

  const selectedAlert = REGULATORY_ALERTS.find(a => a.id === selectedAlertId);
  const highAlerts = REGULATORY_ALERTS.filter(a => a.severity === "High");
  const otherAlerts = REGULATORY_ALERTS.filter(a => a.severity !== "High");

  const handleAnalyzeImpact = () => {
    trigger();
    onScreenChange(2);
  };

  return (
    <div className="flex gap-4 h-full min-h-0">

      {/* ── Left: Regulatory Alerts ─────────────────────── */}
      <div className="w-[260px] shrink-0 flex flex-col gap-3">
        <Card className="border-border/40 bg-background/40 flex-1 overflow-hidden">
          <CardHeader className="pb-2 pt-3 px-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <CardTitle className="text-xs font-semibold">Regulatory Alerts</CardTitle>
              <Badge className="ml-auto text-[9px] bg-red-500/15 text-red-400 border-red-500/25">{highAlerts.length} High</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">Live feed — updated daily via Littler Regulatory Monitor</p>
          </CardHeader>
          <CardContent className="pt-0 px-3 pb-3 flex flex-col gap-2 overflow-y-auto">
            <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mt-1">Action Required</p>
            {highAlerts.map(alert => (
              <button
                key={alert.id}
                data-testid={`alert-${alert.id}`}
                onClick={() => setSelectedAlertId(alert.id === selectedAlertId ? null : alert.id)}
                className={`w-full text-left rounded-lg border p-2.5 transition-all hover:border-amber-500/40 ${
                  selectedAlertId === alert.id
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-border/30 bg-background/20"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] font-bold text-muted-foreground/60">{alert.stateCode}</span>
                  <Badge className={`text-[8px] ${SEVERITY_BADGE[alert.severity]}`}>{alert.severity}</Badge>
                  <span className="ml-auto text-[8px] text-muted-foreground/40">{alert.effectiveDate}</span>
                </div>
                <p className="text-[10px] font-semibold leading-tight text-foreground/90">{alert.lawName}</p>
                <p className="text-[9px] text-muted-foreground/70 mt-0.5 leading-tight">{alert.description}</p>
                <div className="flex items-center gap-1 mt-1.5">
                  <Users className="w-2.5 h-2.5 text-muted-foreground/40" />
                  <span className="text-[9px] text-muted-foreground/50">{alert.clientsAffected} clients affected</span>
                </div>
              </button>
            ))}

            <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mt-2">Monitor</p>
            {otherAlerts.map(alert => (
              <div key={alert.id} className="rounded-lg border border-border/20 p-2 bg-background/10">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] font-bold text-muted-foreground/50">{alert.stateCode}</span>
                  <Badge className={`text-[8px] ${SEVERITY_BADGE[alert.severity]}`}>{alert.severity}</Badge>
                  <span className="ml-auto text-[8px] text-muted-foreground/40">{alert.effectiveDate}</span>
                </div>
                <p className="text-[9px] text-muted-foreground/70 leading-tight">{alert.lawName}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Center: Scorecard + Map ──────────────────────── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">

        {/* Client banner */}
        <Card className="border-amber-500/20 bg-amber-500/[0.03] shrink-0">
          <CardContent className="py-2.5 px-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Building2 className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-sm font-semibold text-foreground">{MEGARETAIL_CLIENT.name}</span>
                <span className="text-[11px] text-muted-foreground ml-2">Matter {MEGARETAIL_CLIENT.matter}</span>
              </div>
              <div className="flex items-center gap-1.5 ml-2">
                <Globe className="w-3 h-3 text-muted-foreground/50" />
                <span className="text-[11px] text-muted-foreground">{MEGARETAIL_CLIENT.stateCount} States</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FileText className="w-3 h-3 text-muted-foreground/50" />
                <span className="text-[11px] text-muted-foreground">Handbook {MEGARETAIL_CLIENT.handbookVersion}</span>
              </div>
              <Badge className="ml-auto text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/25">
                3 Non-Compliant States
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Donut + State list */}
        <div className="flex gap-3 flex-1 min-h-0">

          {/* Donut chart */}
          <Card className="border-border/40 bg-background/40 w-[220px] shrink-0 flex flex-col">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs font-semibold">Compliance Scorecard</CardTitle>
              <p className="text-[10px] text-muted-foreground">{MEGARETAIL_CLIENT.stateCount} active states</p>
            </CardHeader>
            <CardContent className="pt-0 px-3 pb-3 flex-1 flex flex-col items-center">
              <div className="relative w-full h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={PIE_DATA} cx="50%" cy="50%" innerRadius={42} outerRadius={60}
                      dataKey="value" strokeWidth={2} stroke="hsl(var(--background))">
                      {PIE_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-bold text-foreground">{nonCompliantCount + reviewCount}</span>
                  <span className="text-[9px] text-muted-foreground">issues</span>
                </div>
              </div>
              <div className="w-full flex flex-col gap-1.5 mt-2">
                {PIE_DATA.map(d => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-[10px] text-muted-foreground flex-1">{d.name}</span>
                    <span className="text-[10px] font-semibold text-foreground">{d.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* State list */}
          <Card className="border-border/40 bg-background/40 flex-1 overflow-hidden flex flex-col">
            <CardHeader className="pb-1 pt-3 px-3 shrink-0">
              <CardTitle className="text-xs font-semibold flex items-center gap-2">
                <MapPin className="w-3 h-3 text-muted-foreground/60" />
                38-State Compliance Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-3 pb-3 overflow-y-auto flex-1">
              <div className="space-y-1">
                {/* Non-compliant first */}
                {MEGARETAIL_STATES.filter(s => s.status === "non-compliant").map(state => (
                  <div key={state.code} className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-red-500/5 border border-red-500/15">
                    <div className="w-2 h-2 rounded-full shrink-0 bg-red-500" />
                    <span className="text-[10px] font-semibold w-7 text-red-400">{state.code}</span>
                    <span className="text-[10px] text-muted-foreground flex-1 truncate">{state.primaryIssue}</span>
                    <Badge className="text-[8px] bg-red-500/10 text-red-400 border-red-500/20">{state.openIssues} gap{state.openIssues !== 1 ? "s" : ""}</Badge>
                    <span className="text-[9px] text-muted-foreground/40">{state.lastReviewed}</span>
                  </div>
                ))}
                {/* Needs review */}
                {MEGARETAIL_STATES.filter(s => s.status === "needs-review").map(state => (
                  <div key={state.code} className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-amber-500/5 border border-amber-500/15">
                    <div className="w-2 h-2 rounded-full shrink-0 bg-amber-500" />
                    <span className="text-[10px] font-semibold w-7 text-amber-400">{state.code}</span>
                    <span className="text-[10px] text-muted-foreground flex-1 truncate">{state.primaryIssue}</span>
                    <Badge className="text-[8px] bg-amber-500/10 text-amber-400 border-amber-500/20">{state.openIssues} issue</Badge>
                    <span className="text-[9px] text-muted-foreground/40">{state.lastReviewed}</span>
                  </div>
                ))}
                {/* Compliant (sample — show first 15) */}
                {MEGARETAIL_STATES.filter(s => s.status === "compliant").slice(0, 15).map(state => (
                  <div key={state.code} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0 bg-green-500/60" />
                    <span className="text-[10px] font-semibold w-7 text-green-400/80">{state.code}</span>
                    <span className="text-[10px] text-muted-foreground/60 flex-1">{state.name}</span>
                    <CheckCircle2 className="w-3 h-3 text-green-500/50" />
                    <span className="text-[9px] text-muted-foreground/40">{state.lastReviewed}</span>
                  </div>
                ))}
                <div className="text-center py-1">
                  <span className="text-[9px] text-muted-foreground/40">+{MEGARETAIL_STATES.filter(s => s.status === "compliant").length - 15} more compliant states</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Right: Quick Actions + Slide-over ──────────────── */}
      <div className="w-[220px] shrink-0 flex flex-col gap-3">

        {/* CTA / Run analysis */}
        <Card className="border-amber-500/30 bg-amber-500/[0.05]">
          <CardContent className="py-3 px-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-semibold">Run Compliance Analysis</span>
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">
              Deploy LIT-AGT-001 and LIT-AGT-010 to analyze MN, ME, and IL regulatory gaps against MegaRetail's handbook.
            </p>
            <Button
              data-testid="button-run-analysis"
              size="sm"
              onClick={handleAnalyzeImpact}
              className="w-full text-xs bg-amber-500 hover:bg-amber-600 text-black font-semibold h-8"
            >
              ▶ Analyze All 3 States
            </Button>
          </CardContent>
        </Card>

        {/* Stats */}
        <Card className="border-border/40 bg-background/40">
          <CardContent className="py-3 px-3 flex flex-col gap-2">
            <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Client Overview</p>
            {[
              { label: "Active States", value: "38", icon: Globe },
              { label: "Handbook Version", value: "v4.2", icon: FileText },
              { label: "Last Full Audit", value: "Sep 2024", icon: Clock },
              { label: "Open Matters", value: "3", icon: Shield },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon className="w-2.5 h-2.5 text-muted-foreground/40" />
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
                <span className="text-[10px] font-semibold text-foreground/80">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Alert detail slide-over */}
        {selectedAlert && (
          <Card className="border-amber-500/30 bg-amber-500/[0.04] flex-1">
            <CardHeader className="pb-1 pt-3 px-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-xs flex-1">{selectedAlert.stateCode} Alert Detail</CardTitle>
                <button onClick={() => setSelectedAlertId(null)} className="text-muted-foreground/50 hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-0 px-3 pb-3 flex flex-col gap-2">
              <p className="text-[10px] font-semibold text-amber-300">{selectedAlert.lawName}</p>
              <p className="text-[9px] text-muted-foreground leading-relaxed">{selectedAlert.description}</p>
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-muted-foreground/50">Effective</span>
                <span className="font-medium text-foreground/70">{selectedAlert.effectiveDate}</span>
              </div>
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-muted-foreground/50">Clients Impacted</span>
                <span className="font-medium text-foreground/70">{selectedAlert.clientsAffected}</span>
              </div>
              <Button
                data-testid={`button-analyze-${selectedAlert.id}`}
                size="sm"
                onClick={handleAnalyzeImpact}
                className="w-full text-[10px] bg-amber-500 hover:bg-amber-600 text-black font-semibold h-7 mt-1"
              >
                Analyze Impact <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        {!selectedAlert && (
          <Card className="border-border/40 bg-background/40 flex-1">
            <CardContent className="py-3 px-3 flex flex-col gap-2">
              <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Recent Activity</p>
              {[
                { action: "Handbook audit completed", state: "CA", time: "2h ago" },
                { action: "NY PFL notice issued", state: "NY", time: "1d ago" },
                { action: "CO FAMLI rate updated", state: "CO", time: "3d ago" },
                { action: "WA PFML premium filed", state: "WA", time: "5d ago" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 mt-1 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] text-muted-foreground leading-tight">{item.action}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[8px] text-muted-foreground/40">{item.state}</span>
                      <span className="text-[8px] text-muted-foreground/30">·</span>
                      <span className="text-[8px] text-muted-foreground/40">{item.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
