import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, CheckCircle2, ChevronRight, ChevronDown, Info,
  ShieldAlert, Clock, DollarSign, MapPin, FileText,
} from "lucide-react";
import {
  COMPLIANCE_GAPS, MEGARETAIL_STATES, useLittlerPipeline, type ComplianceGap,
} from "./littler-constants";

interface Props {
  onScreenChange: (screen: number) => void;
}

const RISK_BADGE: Record<string, string> = {
  Critical: "bg-red-500/15 text-red-400 border-red-500/25",
  High: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  Medium: "bg-amber-500/15 text-amber-400 border-amber-500/25",
};
const RISK_BORDER: Record<string, string> = {
  Critical: "border-red-500/30 bg-red-500/[0.03]",
  High: "border-orange-500/30 bg-orange-500/[0.03]",
  Medium: "border-amber-500/30 bg-amber-500/[0.03]",
};

const STATE_GAPS: Record<string, ComplianceGap[]> = {
  MN: COMPLIANCE_GAPS.filter(g => g.stateCode === "MN"),
  ME: COMPLIANCE_GAPS.filter(g => g.stateCode === "ME"),
  IL: COMPLIANCE_GAPS.filter(g => g.stateCode === "IL"),
};

const STATE_INFO = {
  MN: { name: "Minnesota", effectiveDate: "Jan 1, 2026", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/25", badgeColor: "bg-blue-500/15 text-blue-400 border-blue-500/25", dotColor: "bg-blue-400" },
  ME: { name: "Maine",     effectiveDate: "May 1, 2026", bgColor: "bg-violet-500/10", borderColor: "border-violet-500/25", badgeColor: "bg-violet-500/15 text-violet-400 border-violet-500/25", dotColor: "bg-violet-400" },
  IL: { name: "Illinois",  effectiveDate: "IN EFFECT Jan 2024", bgColor: "bg-red-500/10", borderColor: "border-red-500/25", badgeColor: "bg-red-500/15 text-red-400 border-red-500/25", dotColor: "bg-red-500" },
};

// Simple hex-grid state map
const MAP_GRID: Array<{ code: string; row: number; col: number }> = [
  { code: "WA", row: 0, col: 0 }, { code: "MT", row: 0, col: 2 }, { code: "ND", row: 0, col: 4 }, { code: "MN", row: 0, col: 5 }, { code: "MI", row: 0, col: 7 }, { code: "NH", row: 0, col: 10 }, { code: "ME", row: 0, col: 11 },
  { code: "OR", row: 1, col: 0 }, { code: "ID", row: 1, col: 1 }, { code: "WY", row: 1, col: 2 }, { code: "SD", row: 1, col: 4 }, { code: "WI", row: 1, col: 6 }, { code: "NY", row: 1, col: 9 }, { code: "MA", row: 1, col: 10 }, { code: "CT", row: 1, col: 11 },
  { code: "CA", row: 2, col: 0 }, { code: "NV", row: 2, col: 1 }, { code: "CO", row: 2, col: 2 }, { code: "NE", row: 2, col: 4 }, { code: "IA", row: 2, col: 5 }, { code: "IL", row: 2, col: 6 }, { code: "IN", row: 2, col: 7 }, { code: "OH", row: 2, col: 8 }, { code: "PA", row: 2, col: 9 }, { code: "NJ", row: 2, col: 10 },
  { code: "AZ", row: 3, col: 1 }, { code: "UT", row: 3, col: 2 }, { code: "NM", row: 3, col: 3 }, { code: "KS", row: 3, col: 4 }, { code: "MO", row: 3, col: 5 }, { code: "KY", row: 3, col: 7 }, { code: "WV", row: 3, col: 8 }, { code: "VA", row: 3, col: 9 }, { code: "MD", row: 3, col: 10 }, { code: "DE", row: 3, col: 11 },
  { code: "TX", row: 4, col: 3 }, { code: "OK", row: 4, col: 4 }, { code: "AR", row: 4, col: 5 }, { code: "TN", row: 4, col: 6 }, { code: "NC", row: 4, col: 8 }, { code: "SC", row: 4, col: 9 },
  { code: "LA", row: 5, col: 4 }, { code: "MS", row: 5, col: 5 }, { code: "AL", row: 5, col: 6 }, { code: "GA", row: 5, col: 7 }, { code: "FL", row: 5, col: 9 },
];

const MEGARETAIL_CODES = new Set(MEGARETAIL_STATES.map(s => s.code));
const STATE_STATUS_MAP: Record<string, string> = {};
for (const s of MEGARETAIL_STATES) { STATE_STATUS_MAP[s.code] = s.status; }

function StateMap({ selectedState, onSelectState }: { selectedState: string | null; onSelectState: (code: string) => void }) {
  const maxRow = Math.max(...MAP_GRID.map(s => s.row));
  const maxCol = Math.max(...MAP_GRID.map(s => s.col));

  const cellSize = 30;
  const gap = 2;
  const width = (maxCol + 1) * (cellSize + gap);
  const height = (maxRow + 1) * (cellSize + gap);

  return (
    <div className="relative" style={{ width, height }}>
      {MAP_GRID.map(({ code, row, col }) => {
        const inMegaretail = MEGARETAIL_CODES.has(code);
        const status = STATE_STATUS_MAP[code];
        const isSelected = selectedState === code;
        const isNonCompliant = status === "non-compliant";
        const isReview = status === "needs-review";

        const bg = !inMegaretail
          ? "bg-muted/10 text-muted-foreground/20 border-border/10"
          : isNonCompliant
          ? `bg-red-500/20 border-red-500/40 text-red-400 ${isSelected ? "ring-2 ring-red-400" : ""}`
          : isReview
          ? `bg-amber-500/20 border-amber-500/40 text-amber-400 ${isSelected ? "ring-2 ring-amber-400" : ""}`
          : `bg-green-500/10 border-green-500/25 text-green-400/70 ${isSelected ? "ring-2 ring-green-400" : ""}`;

        return (
          <div
            key={code}
            data-testid={`state-${code}`}
            onClick={() => inMegaretail && onSelectState(code)}
            style={{
              position: "absolute",
              left: col * (cellSize + gap),
              top: row * (cellSize + gap),
              width: cellSize,
              height: cellSize,
            }}
            className={`rounded border text-[8px] font-bold flex items-center justify-center transition-all
              ${bg}
              ${inMegaretail ? "cursor-pointer hover:brightness-125" : "cursor-default"}`}
          >
            {code}
          </div>
        );
      })}
    </div>
  );
}

function GapCard({ gap, isExpanded, onToggle, onApprove, onFlag }: {
  gap: ComplianceGap;
  isExpanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onFlag: () => void;
}) {
  return (
    <div className={`rounded-lg border transition-all ${RISK_BORDER[gap.riskLevel]}`}>
      <button
        data-testid={`gap-toggle-${gap.id}`}
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5 flex items-start gap-2"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Badge className={`text-[8px] shrink-0 ${RISK_BADGE[gap.riskLevel]}`}>{gap.riskLevel}</Badge>
          <span className="text-[11px] font-semibold text-foreground/90 truncate">{gap.id}</span>
          <span className="text-[10px] text-muted-foreground truncate hidden sm:block">{gap.section}</span>
          <span className="text-[10px] text-muted-foreground/70 truncate flex-1 hidden md:block">{gap.gapType}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] text-muted-foreground/50 hidden sm:block">{gap.agentConfidence}% confidence</span>
          {gap.reviewStatus === "approved" && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
          {gap.reviewStatus === "flagged" && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 border-t border-border/20 pt-2.5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">Current Language</p>
              <div className="text-[10px] text-muted-foreground/80 leading-relaxed bg-red-500/5 border border-red-500/15 rounded-md p-2 font-mono">
                {gap.currentLanguage}
              </div>
            </div>
            <div>
              <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">Required Update</p>
              <div className="text-[10px] text-muted-foreground/80 leading-relaxed bg-green-500/5 border border-green-500/15 rounded-md p-2">
                {gap.requiredUpdate}
              </div>
            </div>
          </div>
          <div>
            <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">Recommended Policy Language</p>
            <div className="text-[10px] text-foreground/80 leading-relaxed bg-blue-500/5 border border-blue-500/15 rounded-md p-2">
              {gap.recommendedLanguage}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
              <FileText className="w-2.5 h-2.5" />
              <span>{gap.citation}</span>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
              <DollarSign className="w-2.5 h-2.5" />
              <span>Exposure: {gap.exposure}</span>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
              <Info className="w-2.5 h-2.5" />
              <span>{gap.agentConfidence}% agent confidence</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                data-testid={`button-flag-${gap.id}`}
                size="sm" variant="outline"
                onClick={(e) => { e.stopPropagation(); onFlag(); }}
                className="text-[10px] h-6 px-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              >
                ⚑ Flag for Review
              </Button>
              <Button
                data-testid={`button-approve-${gap.id}`}
                size="sm"
                onClick={(e) => { e.stopPropagation(); onApprove(); }}
                className="text-[10px] h-6 px-2 bg-green-600/80 hover:bg-green-600 text-white"
              >
                ✓ Approve
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LittlerS3GapAnalysis({ onScreenChange }: Props) {
  const { state } = useLittlerPipeline();
  const [selectedState, setSelectedState] = useState<string | null>("IL");
  const [expandedGaps, setExpandedGaps] = useState<Set<string>>(new Set(["IL-001"]));
  const [gapStatuses, setGapStatuses] = useState<Record<string, ComplianceGap["reviewStatus"]>>({});

  const toggleGap = (id: string) => {
    setExpandedGaps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const approveGap = (id: string) => setGapStatuses(prev => ({ ...prev, [id]: "approved" }));
  const flagGap = (id: string) => setGapStatuses(prev => ({ ...prev, [id]: "flagged" }));

  const stateGaps = selectedState ? STATE_GAPS[selectedState as keyof typeof STATE_GAPS] || [] : COMPLIANCE_GAPS;
  const displayGaps = stateGaps.map(g => ({ ...g, reviewStatus: gapStatuses[g.id] || g.reviewStatus }));

  const criticalCount = COMPLIANCE_GAPS.filter(g => g.riskLevel === "Critical").length;
  const highCount = COMPLIANCE_GAPS.filter(g => g.riskLevel === "High").length;
  const mediumCount = COMPLIANCE_GAPS.filter(g => g.riskLevel === "Medium").length;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">

      {/* ── Summary cards ─────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        <Card className="border-red-500/20 bg-red-500/[0.03]">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Critical</p>
                <p className="text-xl font-bold text-red-400">{criticalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-500/20 bg-orange-500/[0.03]">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">High</p>
                <p className="text-xl font-bold text-orange-400">{highCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/[0.03]">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Medium</p>
                <p className="text-xl font-bold text-amber-400">{mediumCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/30 bg-background/40">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground/60" />
              <div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Est. Exposure</p>
                <p className="text-xl font-bold text-foreground/80">$1.2M+</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Map + Gap table ───────────────────────────── */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* Map panel */}
        <Card className="border-border/40 bg-background/40 w-[360px] shrink-0 flex flex-col overflow-hidden">
          <CardHeader className="pb-1 pt-3 px-3 shrink-0">
            <CardTitle className="text-xs flex items-center gap-2">
              <MapPin className="w-3 h-3 text-muted-foreground/60" />
              38-State Compliance Map
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {[
                { label: "Non-Compliant", color: "bg-red-500" },
                { label: "Needs Review", color: "bg-amber-500" },
                { label: "Compliant", color: "bg-green-500" },
              ].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-sm ${color}`} />
                  <span className="text-[9px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-3 pb-3 flex-1 flex flex-col items-center justify-center overflow-hidden">
            <StateMap selectedState={selectedState} onSelectState={setSelectedState} />
            {selectedState && STATE_INFO[selectedState as keyof typeof STATE_INFO] && (
              <div className="mt-3 w-full">
                {(() => {
                  const info = STATE_INFO[selectedState as keyof typeof STATE_INFO];
                  const gaps = STATE_GAPS[selectedState as keyof typeof STATE_GAPS] || [];
                  return (
                    <div className={`rounded-lg border p-2 ${info.borderColor} ${info.bgColor}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-bold text-foreground/80">{info.name}</span>
                        <Badge className={`text-[8px] ${info.badgeColor}`}>Non-Compliant</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                        <span>Effective: {info.effectiveDate}</span>
                        <span>{gaps.length} gaps identified</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* State filter buttons */}
            <div className="flex gap-1.5 mt-3 w-full">
              <button
                data-testid="filter-all-states"
                onClick={() => setSelectedState(null)}
                className={`flex-1 text-[9px] font-semibold rounded-md py-1 border transition-all ${
                  !selectedState ? "bg-foreground/10 border-border/50 text-foreground" : "border-border/20 text-muted-foreground hover:border-border/40"
                }`}
              >
                All ({COMPLIANCE_GAPS.length})
              </button>
              {Object.entries(STATE_INFO).map(([code, info]) => (
                <button
                  key={code}
                  data-testid={`filter-state-${code}`}
                  onClick={() => setSelectedState(code === selectedState ? null : code)}
                  className={`flex-1 text-[9px] font-semibold rounded-md py-1 border transition-all ${
                    selectedState === code
                      ? `${info.borderColor} ${info.bgColor}`
                      : "border-border/20 text-muted-foreground hover:border-border/40"
                  }`}
                >
                  {code} ({STATE_GAPS[code as keyof typeof STATE_GAPS]?.length || 0})
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Gap table */}
        <div className="flex-1 flex flex-col gap-2 overflow-y-auto min-h-0">
          <div className="flex items-center justify-between shrink-0">
            <p className="text-xs font-semibold text-foreground/80">
              {selectedState ? `${STATE_INFO[selectedState as keyof typeof STATE_INFO]?.name || selectedState} Gaps` : "All Compliance Gaps"}
              <span className="text-muted-foreground ml-2 font-normal">({displayGaps.length} identified by LIT-AGT-001 &amp; LIT-AGT-010)</span>
            </p>
          </div>

          <div className="space-y-1.5">
            {displayGaps.map(gap => (
              <GapCard
                key={gap.id}
                gap={gap}
                isExpanded={expandedGaps.has(gap.id)}
                onToggle={() => toggleGap(gap.id)}
                onApprove={() => approveGap(gap.id)}
                onFlag={() => flagGap(gap.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Action row ─────────────────────────────────── */}
      <div className="flex items-center justify-between shrink-0">
        <p className="text-[11px] text-muted-foreground">
          {Object.values(gapStatuses).filter(s => s === "approved").length} of {COMPLIANCE_GAPS.length} gaps approved for drafting
        </p>
        <Button
          data-testid="button-generate-deliverable"
          size="sm"
          onClick={() => onScreenChange(4)}
          className="text-xs bg-amber-500 hover:bg-amber-600 text-black font-semibold h-8 px-4"
        >
          Generate Client Deliverable <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
