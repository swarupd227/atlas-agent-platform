import { useState, useCallback, useEffect } from "react";

// ─── Production Agent IDs (Littler Mendelson ATLAS) ────────────────────────────
export const LITTLER_AGENT_001_NAME = "Employment Compliance & Policy Advisory Agent";
export const LITTLER_AGENT_010_NAME = "Leave & Accommodation Management Agent";

// ─── Demo Client Context ───────────────────────────────────────────────────────
export const MEGARETAIL_CLIENT = {
  name: "MegaRetail Corp",
  industry: "Retail",
  stateCount: 38,
  handbookVersion: "v4.2",
  matter: "2024-LIT-04821",
  generalCounsel: "Sarah Chen, General Counsel",
  relationship: "15-year Littler client",
};

// ─── 4-Step Pipeline ───────────────────────────────────────────────────────────
export const LITTLER_PIPELINE_STEPS = [
  {
    role: "regulatory_analysis",
    label: "Regulatory Analysis",
    agentCode: "LIT-AGT-001",
    description: "LIT-AGT-001 parsing MN HF-2024, ME LD-2080, IL PLAWA — 47 provisions identified",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    role: "leave_mapping",
    label: "Leave Law Mapping",
    agentCode: "LIT-AGT-010",
    description: "LIT-AGT-010 analyzing leave entitlement stacking with existing FMLA policy",
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/20",
  },
  {
    role: "gap_analysis",
    label: "Policy Gap Analysis",
    agentCode: "LIT-AGT-001",
    description: "LIT-AGT-001 cross-referencing MegaRetail handbook v4.2 — 7 gaps found",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  {
    role: "draft_recommendations",
    label: "Draft Recommendations",
    agentCode: "LIT-AGT-001",
    description: "LIT-AGT-001 generating policy language and client compliance memo",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
  },
] as const;

// ─── Regulatory Alerts (Screen 2.1 left panel) ────────────────────────────────
export const REGULATORY_ALERTS = [
  {
    id: "MN-HF2024",
    state: "Minnesota",
    stateCode: "MN",
    lawName: "MN HF-2024 Paid Family & Medical Leave",
    effectiveDate: "Jan 1, 2026",
    severity: "High",
    clientsAffected: 12,
    description: "New PFML law: 12 wks family + 12 wks medical, 90% wages, mandatory payroll contributions",
  },
  {
    id: "ME-LD2080",
    state: "Maine",
    stateCode: "ME",
    lawName: "ME LD 2080 Paid Family & Medical Leave",
    effectiveDate: "May 1, 2026",
    severity: "High",
    clientsAffected: 8,
    description: "New PFML for employers 15+: 10 weeks at 90% wages, 1% contribution split",
  },
  {
    id: "IL-PLAWA",
    state: "Illinois",
    stateCode: "IL",
    lawName: "IL Paid Leave for All Workers Act",
    effectiveDate: "In Effect Jan 1, 2024",
    severity: "High",
    clientsAffected: 24,
    description: "ALERT: Already in effect. 40 hours paid leave for any purpose. Non-compliance exposure accruing.",
  },
  {
    id: "CO-FAMLI-2025",
    state: "Colorado",
    stateCode: "CO",
    lawName: "CO FAMLI 2025 Rate Update",
    effectiveDate: "Jan 1, 2025",
    severity: "Medium",
    clientsAffected: 6,
    description: "Contribution rate update: 0.9% total split 50/50 employer/employee",
  },
  {
    id: "NY-PFL-2025",
    state: "New York",
    stateCode: "NY",
    lawName: "NY PFL 2025 Benefit Update",
    effectiveDate: "Jan 1, 2025",
    severity: "Low",
    clientsAffected: 31,
    description: "Max weekly benefit increased to $1,177.32. Premium rate updated to 0.388%.",
  },
  {
    id: "WA-PFML-2025",
    state: "Washington",
    stateCode: "WA",
    lawName: "WA PFML Premium Rate Update",
    effectiveDate: "Jan 1, 2025",
    severity: "Low",
    clientsAffected: 7,
    description: "New total premium: 0.92% of wages. Max weekly benefit: $1,542.",
  },
];

// ─── MegaRetail 38-State Compliance Map ───────────────────────────────────────
export type ComplianceStatus = "compliant" | "needs-review" | "non-compliant";

export const MEGARETAIL_STATES: Array<{
  code: string;
  name: string;
  status: ComplianceStatus;
  lastReviewed: string;
  openIssues: number;
  primaryIssue?: string;
  row: number;
  col: number;
}> = [
  // Non-compliant (red): MN, ME, IL
  { code: "MN", name: "Minnesota",      status: "non-compliant",  lastReviewed: "Nov 2024", openIssues: 3, primaryIssue: "MN PFML not in handbook", row: 2, col: 6 },
  { code: "ME", name: "Maine",          status: "non-compliant",  lastReviewed: "Nov 2024", openIssues: 2, primaryIssue: "ME PFML not in handbook", row: 1, col: 10 },
  { code: "IL", name: "Illinois",       status: "non-compliant",  lastReviewed: "Sep 2024", openIssues: 2, primaryIssue: "IL PLAWA: in effect, no policy", row: 3, col: 6 },
  // Needs review (amber): CO, CT, OR, WI
  { code: "CO", name: "Colorado",       status: "needs-review",   lastReviewed: "Dec 2024", openIssues: 1, primaryIssue: "CO FAMLI rate update", row: 4, col: 3 },
  { code: "CT", name: "Connecticut",    status: "needs-review",   lastReviewed: "Nov 2024", openIssues: 1, primaryIssue: "CT PFML annual benefit update", row: 3, col: 10 },
  { code: "OR", name: "Oregon",         status: "needs-review",   lastReviewed: "Oct 2024", openIssues: 1, primaryIssue: "OR Paid Leave rate update", row: 2, col: 1 },
  { code: "WI", name: "Wisconsin",      status: "needs-review",   lastReviewed: "Nov 2024", openIssues: 1, primaryIssue: "Local ordinance changes", row: 2, col: 7 },
  // Compliant (green): remaining 31 states
  { code: "WA", name: "Washington",     status: "compliant", lastReviewed: "Jan 2025", openIssues: 0, row: 1, col: 1 },
  { code: "ID", name: "Idaho",          status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 2, col: 2 },
  { code: "MT", name: "Montana",        status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 1, col: 3 },
  { code: "ND", name: "North Dakota",   status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 1, col: 5 },
  { code: "SD", name: "South Dakota",   status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 2, col: 5 },
  { code: "NE", name: "Nebraska",       status: "compliant", lastReviewed: "Jan 2025", openIssues: 0, row: 3, col: 5 },
  { code: "KS", name: "Kansas",         status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 4, col: 5 },
  { code: "MO", name: "Missouri",       status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 4, col: 6 },
  { code: "IA", name: "Iowa",           status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 3, col: 7 },
  { code: "IN", name: "Indiana",        status: "compliant", lastReviewed: "Jan 2025", openIssues: 0, row: 3, col: 8 },
  { code: "MI", name: "Michigan",       status: "compliant", lastReviewed: "Jan 2025", openIssues: 0, row: 2, col: 8 },
  { code: "OH", name: "Ohio",           status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 3, col: 9 },
  { code: "KY", name: "Kentucky",       status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 4, col: 8 },
  { code: "TN", name: "Tennessee",      status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 4, col: 7 },
  { code: "AR", name: "Arkansas",       status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 5, col: 6 },
  { code: "LA", name: "Louisiana",      status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 5, col: 7 },
  { code: "TX", name: "Texas",          status: "compliant", lastReviewed: "Jan 2025", openIssues: 0, row: 5, col: 5 },
  { code: "OK", name: "Oklahoma",       status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 5, col: 4 },
  { code: "NM", name: "New Mexico",     status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 5, col: 3 },
  { code: "AZ", name: "Arizona",        status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 4, col: 2 },
  { code: "CA", name: "California",     status: "compliant", lastReviewed: "Jan 2025", openIssues: 0, row: 3, col: 1 },
  { code: "NV", name: "Nevada",         status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 3, col: 2 },
  { code: "UT", name: "Utah",           status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 3, col: 3 },
  { code: "GA", name: "Georgia",        status: "compliant", lastReviewed: "Jan 2025", openIssues: 0, row: 5, col: 9 },
  { code: "SC", name: "South Carolina", status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 5, col: 10 },
  { code: "NC", name: "North Carolina", status: "compliant", lastReviewed: "Jan 2025", openIssues: 0, row: 4, col: 10 },
  { code: "VA", name: "Virginia",       status: "compliant", lastReviewed: "Jan 2025", openIssues: 0, row: 4, col: 9 },
  { code: "MD", name: "Maryland",       status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 3, col: 11 },
  { code: "DE", name: "Delaware",       status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 4, col: 11 },
  { code: "NJ", name: "New Jersey",     status: "compliant", lastReviewed: "Jan 2025", openIssues: 0, row: 3, col: 12 },
  { code: "NY", name: "New York",       status: "compliant", lastReviewed: "Jan 2025", openIssues: 0, row: 2, col: 12 },
  { code: "PA", name: "Pennsylvania",   status: "compliant", lastReviewed: "Jan 2025", openIssues: 0, row: 3, col: 11 },
  { code: "MA", name: "Massachusetts",  status: "compliant", lastReviewed: "Jan 2025", openIssues: 0, row: 2, col: 11 },
  { code: "NH", name: "New Hampshire",  status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 1, col: 11 },
  { code: "FL", name: "Florida",        status: "compliant", lastReviewed: "Jan 2025", openIssues: 0, row: 5, col: 11 },
  { code: "AL", name: "Alabama",        status: "compliant", lastReviewed: "Dec 2024", openIssues: 0, row: 5, col: 8 },
];

// ─── Compliance Gap Data ──────────────────────────────────────────────────────
export interface ComplianceGap {
  id: string;
  state: string;
  stateCode: string;
  section: string;
  gapType: string;
  currentLanguage: string;
  requiredUpdate: string;
  riskLevel: "Critical" | "High" | "Medium";
  exposure: string;
  agentConfidence: number;
  citation: string;
  recommendedLanguage: string;
  reviewStatus: "pending" | "approved" | "modified" | "flagged";
}

export const COMPLIANCE_GAPS: ComplianceGap[] = [
  {
    id: "MN-001", state: "Minnesota", stateCode: "MN",
    section: "Section 3.7 — Paid Leave",
    gapType: "Missing Entitlement Language",
    currentLanguage: "Employees may be eligible for unpaid leave under the federal Family and Medical Leave Act (FMLA) for qualifying family and medical reasons.",
    requiredUpdate: "Add MN PFML: 12 weeks family + 12 weeks medical leave per benefit year. Benefits at 90% wages up to 50% SAWW (~$1,450/wk max). Concurrent running with FMLA.",
    riskLevel: "Critical", exposure: "$10K–$50K per violation", agentConfidence: 96,
    citation: "Minn. Stat. §268B.001 et seq. (effective Jan 1, 2026)",
    recommendedLanguage: "Minnesota employees are entitled to up to 12 weeks of paid family leave and 12 weeks of paid medical leave per benefit year under the Minnesota Paid Family and Medical Leave Act (MN PFML), effective January 1, 2026. Benefits are paid at 90% of wages up to 50% of the state average weekly wage. MN PFML leave runs concurrently with FMLA for the same qualifying reason.",
    reviewStatus: "pending",
  },
  {
    id: "MN-002", state: "Minnesota", stateCode: "MN",
    section: "Section 3.7 — Paid Leave",
    gapType: "Missing Contribution Disclosure",
    currentLanguage: "[No payroll deduction disclosure for state leave programs]",
    requiredUpdate: "Disclose 0.35% employee payroll deduction for MN PFML. Employer matches 0.35%. Total 0.70% of covered wages beginning Jan 1, 2026.",
    riskLevel: "High", exposure: "$5K–$25K per payroll violation", agentConfidence: 94,
    citation: "Minn. Stat. §268B.14 — Contribution requirements",
    recommendedLanguage: "Beginning January 1, 2026, a payroll deduction of 0.35% of gross wages will be withheld for Minnesota Paid Family and Medical Leave contributions. The Company contributes an equal amount. Contributions fund the state-administered benefit program through the Minnesota Department of Employment and Economic Development (DEED).",
    reviewStatus: "pending",
  },
  {
    id: "MN-003", state: "Minnesota", stateCode: "MN",
    section: "Section 5.1 — Notice Requirements",
    gapType: "Incorrect Notice Period",
    currentLanguage: "Employees must provide at least 5 business days' advance notice of any need for leave.",
    requiredUpdate: "Update to 30 calendar days advance notice for foreseeable MN PFML leave (or as soon as practicable for unforeseeable). Current 5-day rule insufficient.",
    riskLevel: "High", exposure: "$5,000 per violation", agentConfidence: 91,
    citation: "Minn. Stat. §268B.10 — Notice requirements",
    recommendedLanguage: "For foreseeable leave under MN PFML, employees must provide at least 30 calendar days' advance written notice. For unforeseeable leave, notice must be provided as soon as practicable (within 1–2 business days of learning of the need for leave).",
    reviewStatus: "pending",
  },
  {
    id: "ME-001", state: "Maine", stateCode: "ME",
    section: "Section 3.7 — Paid Leave",
    gapType: "Missing State PFL Program",
    currentLanguage: "[No Maine-specific leave provision exists in current handbook]",
    requiredUpdate: "Add Maine PFML: 10 weeks paid leave at 90% wages for employers with 15+ employees. Effective May 1, 2026. Employer contributions begin Jan 1, 2026.",
    riskLevel: "Critical", exposure: "$1,000/day non-compliance", agentConfidence: 93,
    citation: "Me. Stat. tit. 26 §844 et seq. (LD 2080, effective May 1, 2026)",
    recommendedLanguage: "Maine employees of MegaRetail Corp are entitled to up to 10 weeks of paid family and medical leave per year under the Maine Paid Family and Medical Leave program, effective May 1, 2026. Benefits are paid at 90% of wages.",
    reviewStatus: "pending",
  },
  {
    id: "ME-002", state: "Maine", stateCode: "ME",
    section: "Section 1.2 — Policy Application",
    gapType: "Employer Threshold Not Stated",
    currentLanguage: "This Employee Handbook applies to all MegaRetail employees in all locations.",
    requiredUpdate: "Clarify Maine PFML applies to employers with 15+ employees. MegaRetail qualifies. Distinguish job protection rights from benefit entitlement for smaller employers.",
    riskLevel: "Medium", exposure: "$2,500–$10,000 per claim", agentConfidence: 88,
    citation: "Me. Stat. tit. 26 §844(4) — Employer coverage",
    recommendedLanguage: "The Maine Paid Family and Medical Leave program applies to MegaRetail Corp as an employer with 15 or more employees. Maine employees are entitled to both leave entitlements and full job protection rights under this program.",
    reviewStatus: "pending",
  },
  {
    id: "IL-001", state: "Illinois", stateCode: "IL",
    section: "Section 3.7 — Paid Leave",
    gapType: "⚠ CURRENTLY NON-COMPLIANT — Missing IL PLAWA",
    currentLanguage: "[No Illinois Paid Leave for All Workers Act provision — law IN EFFECT since Jan 1, 2024]",
    requiredUpdate: "IMMEDIATE: Add IL PLAWA section. 40 hours (5 days) paid leave for any purpose per 12-month period. Accrual: 1 hr per 40 hrs worked. All Illinois employees covered.",
    riskLevel: "Critical", exposure: "$500–$2,500 per employee/year (currently accruing)", agentConfidence: 98,
    citation: "820 ILCS 192 (Illinois Paid Leave for All Workers Act, effective Jan 1, 2024)",
    recommendedLanguage: "Illinois employees accrue one hour of paid leave for every 40 hours worked, up to 40 hours (5 days) per 12-month period under the Illinois Paid Leave for All Workers Act (PLAWA). This leave may be used for any reason without documentation. Leave may be taken in minimum increments of 4 hours. Accrued but unused leave carries over up to a 40-hour cap.",
    reviewStatus: "pending",
  },
  {
    id: "IL-002", state: "Illinois", stateCode: "IL",
    section: "Section 4.2 — Medical Leave",
    gapType: "Insufficient Job Protection Scope",
    currentLanguage: "Job protection and reinstatement rights apply to employees taking leave of 12 or more weeks under FMLA.",
    requiredUpdate: "Update to reflect IL PLAWA's broader job protection for any IL PLAWA leave regardless of duration. Current 12-week minimum violates IL PLAWA for short-duration leaves.",
    riskLevel: "High", exposure: "$5,000–$15,000 per claim + attorney fees", agentConfidence: 90,
    citation: "820 ILCS 192/25 — Retaliation prohibition; 820 ILCS 192/30 — Remedies",
    recommendedLanguage: "Employees in Illinois are protected from retaliation for taking leave under the Illinois Paid Leave for All Workers Act, regardless of the duration of leave. Upon return from any PLAWA leave, employees are entitled to reinstatement to the same or equivalent position.",
    reviewStatus: "pending",
  },
];

// ─── Pipeline state (module-level singleton shared across screens) ─────────────
export interface LittlerRunResult {
  role: string;
  agentName: string;
  success: boolean;
  message: string | null;
  completedAt: string;
}

export interface LittlerLogEntry {
  timestamp: string;
  agentCode: string;
  agentName: string;
  message: string;
  type: "info" | "progress" | "complete" | "error";
}

export interface LittlerPipelineState {
  status: "idle" | "running" | "complete" | "error";
  currentRole: string | null;
  currentStep: number;
  results: LittlerRunResult[];
  logEntries: LittlerLogEntry[];
  startedAt: string | null;
  completedAt: string | null;
  elapsedSeconds: number;
  gapCount: number;
  error: string | null;
}

const _cache: LittlerPipelineState = {
  status: "idle",
  currentRole: null,
  currentStep: 0,
  results: [],
  logEntries: [],
  startedAt: null,
  completedAt: null,
  elapsedSeconds: 0,
  gapCount: 0,
  error: null,
};

export function getCachedLittlerPipeline(): LittlerPipelineState {
  return { ..._cache, results: [..._cache.results], logEntries: [..._cache.logEntries] };
}

type Listener = (state: LittlerPipelineState) => void;
const _listeners = new Set<Listener>();
function notify() { const s = getCachedLittlerPipeline(); _listeners.forEach(fn => fn(s)); }

let _timerInterval: ReturnType<typeof setInterval> | null = null;

export function useLittlerPipeline(): { state: LittlerPipelineState; trigger: () => void } {
  const [state, setState] = useState<LittlerPipelineState>(() => getCachedLittlerPipeline());

  useEffect(() => {
    const listener: Listener = (s) => setState({ ...s });
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const trigger = useCallback(() => {
    if (_cache.status === "running") return;

    _cache.status = "running";
    _cache.currentRole = null;
    _cache.currentStep = 0;
    _cache.results = [];
    _cache.logEntries = [];
    _cache.startedAt = new Date().toISOString();
    _cache.completedAt = null;
    _cache.elapsedSeconds = 0;
    _cache.gapCount = 0;
    _cache.error = null;
    notify();

    const startTime = Date.now();
    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = setInterval(() => {
      if (_cache.status !== "running") {
        clearInterval(_timerInterval!);
        return;
      }
      _cache.elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      notify();
    }, 1000);

    const addLog = (agentCode: string, agentName: string, message: string, type: LittlerLogEntry["type"] = "info") => {
      _cache.logEntries.push({
        timestamp: new Date().toISOString(),
        agentCode,
        agentName,
        message,
        type,
      });
      notify();
    };

    const es = new EventSource("/demo-api/littler/compliance-run");

    es.addEventListener("run_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addLog("SYSTEM", "Atlas Orchestrator", d.message, "info");
    });

    es.addEventListener("setup", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addLog("SYSTEM", "Atlas Orchestrator", d.message, "info");
    });

    es.addEventListener("agent_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      _cache.currentRole = d.role;
      const stepIdx = LITTLER_PIPELINE_STEPS.findIndex(s => s.role === d.role);
      _cache.currentStep = stepIdx >= 0 ? stepIdx + 1 : _cache.currentStep;
      addLog(d.agentName?.includes("Leave") ? "LIT-AGT-010" : "LIT-AGT-001", d.agentName, `Starting ${d.label || d.role}…`, "info");
      notify();
    });

    es.addEventListener("agent_event", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      const agentCode = d.agentName?.includes("Leave") ? "LIT-AGT-010" : "LIT-AGT-001";
      let msg = "";
      if (d.type === "tool_call_result") {
        msg = `${d.data?.tool || "kb_retrieve"} → ${d.data?.success ? "retrieved" : "error"}`;
      } else if (d.type === "analysis_step") {
        msg = `Processing analysis step…`;
      } else {
        msg = `Processing…`;
      }
      addLog(agentCode, d.agentName, msg, "progress");
    });

    es.addEventListener("agent_complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      const existing = _cache.results.find(r => r.role === d.role);
      if (!existing) {
        _cache.results.push({
          role: d.role,
          agentName: d.agentName,
          success: d.success,
          message: d.message || null,
          completedAt: new Date().toISOString(),
        });
      }
      const agentCode = d.agentName?.includes("Leave") ? "LIT-AGT-010" : "LIT-AGT-001";
      addLog(agentCode, d.agentName, `${d.role.replace(/_/g, " ")} complete — ${d.success ? "✓" : "✗"}`, d.success ? "complete" : "error");
      notify();
    });

    es.addEventListener("run_complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      _cache.status = "complete";
      _cache.currentRole = null;
      _cache.completedAt = new Date().toISOString();
      _cache.gapCount = d.gapCount || 7;
      if (_timerInterval) clearInterval(_timerInterval);
      addLog("SYSTEM", "Atlas Orchestrator", `Analysis complete — ${d.gapCount || 7} compliance gaps identified across MN, ME, IL`, "complete");
      es.close();
      notify();
    });

    es.addEventListener("error", (e: MessageEvent) => {
      let msg = "Analysis error";
      try { msg = JSON.parse(e.data)?.message || msg; } catch {}
      _cache.status = "error";
      _cache.error = msg;
      if (_timerInterval) clearInterval(_timerInterval);
      addLog("SYSTEM", "Atlas Orchestrator", `Error: ${msg}`, "error");
      es.close();
      notify();
    });

    es.onerror = () => {
      if (_cache.status === "running") {
        _cache.status = "error";
        _cache.error = "Connection to Atlas agents lost";
        if (_timerInterval) clearInterval(_timerInterval);
        notify();
      }
      es.close();
    };
  }, []);

  return { state, trigger };
}
