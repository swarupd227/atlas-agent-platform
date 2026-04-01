import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText, Download, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronRight, Shield, User, Calendar, Scale,
} from "lucide-react";
import { COMPLIANCE_GAPS, MEGARETAIL_CLIENT, useLittlerPipeline } from "./littler-constants";

interface Props {
  onScreenChange: (screen: number) => void;
}

const MEMO_SECTIONS = [
  {
    id: "exec-summary",
    label: "Executive Summary",
    level: "h1",
    content: `Three states in MegaRetail Corp's 38-state footprint have enacted new paid family leave laws requiring immediate compliance action. Most critically, Illinois' Paid Leave for All Workers Act (820 ILCS 192) has been in effect since January 1, 2024 — MegaRetail is currently non-compliant and accumulating daily exposure across its Illinois workforce.

Minnesota's Paid Family and Medical Leave Act (Minn. Stat. §268B) becomes effective January 1, 2026, and Maine's Paid Family and Medical Leave law (Me. Stat. tit. 26 §844) becomes effective May 1, 2026.

Our analysis of MegaRetail Employee Handbook v4.2 identified 7 specific compliance gaps. Combined estimated legal exposure if unaddressed: $1.2M+ annually. Immediate action is required.`,
    urgent: true,
  },
  {
    id: "il-section",
    label: "Illinois — Immediate Action Required",
    level: "h2",
    stateCode: "IL",
    content: `CURRENT STATUS: Non-Compliant (since January 1, 2024)

The Illinois Paid Leave for All Workers Act (PLAWA) (820 ILCS 192) is already in effect. MegaRetail's handbook contains no PLAWA language. Two gaps identified:

Gap IL-001 (Critical): Section 3.7 Paid Leave does not address Illinois employees' entitlement to 40 hours (5 days) of paid leave per 12-month period for any reason. Estimated exposure: $500–$2,500 per Illinois employee per year.

Gap IL-002 (High): Section 4.2 Medical Leave limits job protection to leaves of 12+ weeks under FMLA. The PLAWA provides job protection for all leave regardless of duration. Estimated exposure: $5,000–$15,000 per claim.

RECOMMENDED POLICY ADDITION — Section 3.7 (Illinois):
Illinois employees accrue one hour of paid leave for every 40 hours worked, up to 40 hours (5 days) per 12-month period under the Illinois Paid Leave for All Workers Act (PLAWA). This leave may be used for any reason without requiring documentation or explanation. Leave may be taken in minimum increments of 4 hours. Accrued but unused leave carries over to the following year up to a 40-hour cap.

IMMEDIATE ACTIONS REQUIRED:
1. Update handbook Section 3.7 within 30 days
2. Issue PLAWA notice to all Illinois employees
3. Begin accrual tracking in payroll system
4. Consult Littler attorney re: retroactive exposure since January 2024`,
    urgent: true,
  },
  {
    id: "mn-section",
    label: "Minnesota — Effective January 1, 2026",
    level: "h2",
    stateCode: "MN",
    content: `CURRENT STATUS: Action Required (effective January 1, 2026)

The Minnesota Paid Family and Medical Leave Act (Minn. Stat. §268B) becomes effective January 1, 2026. Three gaps identified:

Gap MN-001 (Critical): Section 3.7 Paid Leave contains no Minnesota-specific leave entitlement language. Required: 12 weeks family leave + 12 weeks medical leave per benefit year, 90% of wages up to the SAWW cap.

Gap MN-002 (High): No disclosure of mandatory payroll contributions. Employee contribution: 0.35%; employer contribution: 0.35% of covered wages.

Gap MN-003 (High): Section 5.1 Notice Requirements specifies only a 5-business-day advance notice. Minnesota PFML requires 30 calendar days for foreseeable leave.

RECOMMENDED POLICY ADDITION — Section 3.7 (Minnesota):
Minnesota employees are entitled to up to 12 weeks of paid family leave and 12 weeks of paid medical leave per benefit year under the Minnesota Paid Family and Medical Leave Act (MN PFML), effective January 1, 2026. Benefits are paid at 90% of wages up to 50% of the state average weekly wage (~$1,450/week maximum). MN PFML leave runs concurrently with FMLA leave for the same qualifying reason. Beginning January 1, 2026, a payroll deduction of 0.35% of gross wages will be withheld for MN PFML contributions; the Company contributes an equal amount.

IMPLEMENTATION TIMELINE:
Q4 2025: Register with MN DEED; implement payroll systems; issue employee notice 30 days before January 1, 2026.`,
    urgent: false,
  },
  {
    id: "me-section",
    label: "Maine — Effective May 1, 2026",
    level: "h2",
    stateCode: "ME",
    content: `CURRENT STATUS: Plan Required (effective May 1, 2026)

The Maine Paid Family and Medical Leave law (Me. Stat. tit. 26 §844) becomes effective May 1, 2026 for employers with 15 or more employees. MegaRetail qualifies. Two gaps identified:

Gap ME-001 (Critical): Section 3.7 Paid Leave contains no Maine-specific provisions. Required: 10 weeks of paid leave per year at 90% of wages.

Gap ME-002 (Medium): Section 1.2 does not state the 15-employee threshold for Maine PFML. Required: clarify employer size threshold and job protection rights.

RECOMMENDED POLICY ADDITION — Section 3.7 (Maine):
Maine employees of MegaRetail Corp are entitled to up to 10 weeks of paid family and medical leave per year under the Maine Paid Family and Medical Leave program, effective May 1, 2026. Benefits are paid at 90% of wages. Leave may be taken for the employee's own serious health condition, care of a family member, or bonding with a new child. An employee payroll contribution of 0.5% applies; the Company contributes an equal amount.

IMPLEMENTATION TIMELINE:
Q1 2026: Register with Maine DOL; implement payroll contributions; complete handbook update.`,
    urgent: false,
  },
  {
    id: "attorney-review",
    label: "Attorney Review Flags",
    level: "h2",
    content: `The following items require attorney review before client distribution:

⚑ IL Retroactive Exposure: Littler should assess MegaRetail's exposure for the period January 1, 2024 through present. PLAWA allows employees to bring civil actions within 3 years. Recommend calculating potential liability based on Illinois headcount × estimated uncredited leave.

⚑ MN PFML Concurrent Running: Verify MegaRetail's FMLA designation procedures accommodate concurrent MN PFML designation. Employees taking FMLA leave for qualifying MN PFML reasons must be simultaneously designated for both.

⚑ ME Size Threshold Verification: Confirm MegaRetail's Maine employee count (15+ threshold). If MegaRetail operates in Maine with fewer than 15 employees at a location, confirm whether the count is statewide or location-specific.

⚑ IL Job Protection Scope: Review any pending Illinois PLAWA administrative guidance on the scope of the anti-retaliation provision for short-duration leaves.`,
    urgent: false,
    flag: true,
  },
];

function DocSection({ section, isExpanded, onToggle }: { section: typeof MEMO_SECTIONS[number]; isExpanded: boolean; onToggle: () => void }) {
  const isH1 = section.level === "h1";
  return (
    <div className={`border-b border-border/20 last:border-b-0`}>
      <button
        data-testid={`section-toggle-${section.id}`}
        onClick={onToggle}
        className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-muted/10 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1">
          {section.urgent && <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
          {section.flag && !section.urgent && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
          {!section.urgent && !section.flag && <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20 shrink-0" />}
          <span className={`${isH1 ? "text-sm font-bold" : "text-xs font-semibold"} text-foreground/90`}>{section.label}</span>
          {section.stateCode && (
            <Badge className={`text-[8px] ml-1 ${section.stateCode === "IL" ? "bg-red-500/15 text-red-400 border-red-500/20" : section.stateCode === "MN" ? "bg-blue-500/15 text-blue-400 border-blue-500/20" : "bg-violet-500/15 text-violet-400 border-violet-500/20"}`}>
              {section.stateCode}
            </Badge>
          )}
          {section.urgent && <Badge className="text-[8px] bg-red-500/15 text-red-400 border-red-500/20">Urgent</Badge>}
          {section.flag && <Badge className="text-[8px] bg-amber-500/15 text-amber-400 border-amber-500/20">⚑ Review</Badge>}
        </div>
        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 text-[11px] text-muted-foreground/80 leading-relaxed whitespace-pre-line font-mono border-t border-border/10 pt-3 bg-muted/5">
          {section.content}
        </div>
      )}
    </div>
  );
}

export default function LittlerS4Deliverable({ onScreenChange }: Props) {
  const { state } = useLittlerPipeline();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["exec-summary", "il-section"]));
  const [exported, setExported] = useState(false);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    setExported(true);
    setTimeout(() => setExported(false), 3000);
  };

  const criticalGaps = COMPLIANCE_GAPS.filter(g => g.riskLevel === "Critical").length;
  const totalGaps = COMPLIANCE_GAPS.length;

  return (
    <div className="flex gap-4 h-full min-h-0">

      {/* ── Document Preview ────────────────────────── */}
      <div className="flex-1 flex flex-col gap-2 min-h-0 min-w-0">

        {/* Document header */}
        <Card className="border-border/40 bg-background/40 shrink-0">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-10 bg-amber-500/15 rounded border border-amber-500/25 flex items-center justify-center shrink-0">
                <Scale className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider">PRIVILEGED & CONFIDENTIAL — ATTORNEY-CLIENT COMMUNICATION</p>
                <p className="text-sm font-bold text-foreground">Multi-State Paid Family Leave Compliance Memo</p>
                <p className="text-[11px] text-muted-foreground">Prepared for: {MEGARETAIL_CLIENT.generalCounsel}, {MEGARETAIL_CLIENT.name}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                    <User className="w-2.5 h-2.5" />
                    <span>Prepared by: Littler Mendelson P.C. via ATLAS LIT-AGT-001/010</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                    <Calendar className="w-2.5 h-2.5" />
                    <span>{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                    <FileText className="w-2.5 h-2.5" />
                    <span>Matter {MEGARETAIL_CLIENT.matter}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge className="text-[9px] bg-red-500/15 text-red-400 border-red-500/20">{criticalGaps} Critical Gaps</Badge>
                <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/20">{totalGaps} Total Findings</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Document body */}
        <Card className="border-border/40 bg-background/40 flex-1 overflow-hidden flex flex-col">
          <CardContent className="p-0 flex-1 overflow-y-auto">
            {MEMO_SECTIONS.map(section => (
              <DocSection
                key={section.id}
                section={section}
                isExpanded={expandedSections.has(section.id)}
                onToggle={() => toggleSection(section.id)}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Right: Export Panel ──────────────────────── */}
      <div className="w-[220px] shrink-0 flex flex-col gap-3">

        {/* Status */}
        <Card className="border-green-500/25 bg-green-500/[0.03]">
          <CardContent className="py-3 px-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
              <span className="text-xs font-semibold">Analysis Complete</span>
            </div>
            <div className="space-y-1.5">
              {[
                { icon: Shield, label: "Gaps Identified", value: `${totalGaps} (${criticalCount()} critical)` },
                { icon: FileText, label: "States Analyzed", value: "MN · ME · IL" },
                { icon: Clock, label: "Elapsed", value: state.elapsedSeconds > 0 ? `${Math.floor(state.elapsedSeconds / 60)}m ${state.elapsedSeconds % 60}s` : "—" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-2.5 h-2.5 text-muted-foreground/40" />
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                  <span className="text-[10px] font-semibold text-foreground/80">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Export */}
        <Card className="border-border/40 bg-background/40">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs">Export Deliverable</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3 pb-3 flex flex-col gap-2">
            {[
              { label: "Word Document (.docx)", desc: "Full memo with tracked changes", primary: true },
              { label: "PDF Report", desc: "Formatted for client distribution", primary: false },
              { label: "Compliance Checklist", desc: "Action items with deadlines", primary: false },
              { label: "Redlined Handbook", desc: "Section-by-section markup", primary: false },
            ].map((item, i) => (
              <button
                key={i}
                data-testid={`export-${i}`}
                onClick={handleExport}
                className={`w-full text-left rounded-lg border p-2.5 transition-all hover:brightness-110 ${
                  item.primary
                    ? "border-amber-500/30 bg-amber-500/10"
                    : "border-border/20 bg-background/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Download className={`w-3 h-3 shrink-0 ${item.primary ? "text-amber-400" : "text-muted-foreground/50"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[10px] font-semibold ${item.primary ? "text-amber-300" : "text-foreground/70"}`}>{item.label}</p>
                    <p className="text-[9px] text-muted-foreground/50">{item.desc}</p>
                  </div>
                </div>
              </button>
            ))}

            {exported && (
              <div className="flex items-center gap-1.5 text-[10px] text-green-400 mt-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Export prepared — queued for delivery</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attorney flags */}
        <Card className="border-amber-500/25 bg-amber-500/[0.03]">
          <CardContent className="py-3 px-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span className="text-xs font-semibold">Review Required</span>
            </div>
            <p className="text-[9px] text-muted-foreground leading-relaxed">
              4 items flagged for attorney review before client distribution. IL retroactive exposure assessment is highest priority.
            </p>
            <Button
              data-testid="button-schedule-review"
              size="sm" variant="outline"
              className="w-full text-[10px] h-7 mt-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            >
              Schedule Attorney Review
            </Button>
          </CardContent>
        </Card>

        {/* Start over */}
        <Button
          data-testid="button-start-over"
          size="sm" variant="outline"
          onClick={() => onScreenChange(1)}
          className="w-full text-[10px] h-8 border-border/30 text-muted-foreground hover:text-foreground"
        >
          ← Back to Dashboard
        </Button>
      </div>
    </div>
  );
}

function criticalCount() { return COMPLIANCE_GAPS.filter(g => g.riskLevel === "Critical").length; }
