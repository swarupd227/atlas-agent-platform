import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Zap,
  Shield,
  ShieldAlert,
  RefreshCcw,
  Wrench,
  Brain,
  Users,
  ArrowUpRight,
  Target,
  Database,
  GitCompareArrows,
  Plug,
  CircleDot,
  Eye,
  Ban,
  X,
  Stethoscope,
  Bell,
  Gauge,
  FileWarning,
  Loader2,
} from "lucide-react";
import { useIndustry } from "@/components/industry-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/stat-card";
import { OutcomeKpiStrip } from "@/components/outcome-kpi-strip";
import { formatMs } from "@/components/shared-utils";
import { StatusBadge } from "@/components/status-badge";
import { PolicyViolationDialog } from "@/components/policy-violation-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { Agent, RunTrace, Approval } from "@shared/schema";

interface ToolConnector {
  name: string;
  status: string;
  totalCalls: number;
  errorCount: number;
  errorRate: number;
  avgLatencyMs: number;
  lastSeen: string;
}

interface PolicyViolation {
  id: string;
  traceId: string;
  agentId: string;
  agentName: string;
  policyName: string;
  rule: string;
  severity: string;
  timestamp: string;
  action: string;
  blocked: boolean;
}

interface DriftSignal {
  id: string;
  agentId: string;
  agentName: string;
  suiteName: string;
  suiteType: string;
  metric: "pass_rate" | "avg_latency" | "hallucination";
  baseline: number;
  current: number;
  driftPercent: number;
  severity: string;
  status: string;
  detectedAt: string;
}

interface OutcomeImpact {
  id: string;
  name: string;
  status: string;
  riskTier: string;
  overallStatus: "at_risk" | "on_track" | "needs_attention";
  weightedProgress: number;
  breachedKpis: number;
  totalKpis: number;
  maxDriftPercent: number;
  autoPause: boolean;
  pendingApprovals: number;
  kpis: Array<{
    id: string;
    name: string;
    unit: string;
    baseline: number;
    current: number;
    target: number;
    slaThreshold: number;
    attainment: number;
    breachStatus: "exceeded" | "healthy" | "breached";
    trend: string;
    weight: number;
    confidence?: number;
  }>;
  agents: Array<{
    id: string;
    name: string;
    status: string;
    healthScore: number;
    successRate: number;
    avgLatencyMs: number;
    autonomyMode: string;
    recentFailures: number;
    costPerRun: number;
  }>;
}

const INDUSTRY_KPI_MONITORING: Record<string, Array<{ name: string; value: number; target: number; unit: string; trend: "up" | "down" | "stable"; trendValue: string; status: "healthy" | "warning" | "critical"; description: string }>> = {
  healthcare: [
    { name: "Clinical Accuracy Trend", value: 97.8, target: 98, unit: "%", trend: "up", trendValue: "+0.4%", status: "warning", description: "Trending toward target; minor gaps in rare condition classification" },
    { name: "Guideline Adherence Rate", value: 95.1, target: 95, unit: "%", trend: "stable", trendValue: "+0.1%", status: "healthy", description: "Meeting target across all active clinical pathways" },
    { name: "Patient Satisfaction Proxy", value: 4.4, target: 4.5, unit: "/5", trend: "up", trendValue: "+0.1", status: "warning", description: "Slightly below target; response quality improvements in progress" },
    { name: "Escalation Rate", value: 6.7, target: 8, unit: "%", trend: "down", trendValue: "-0.5%", status: "healthy", description: "Well within threshold; fewer cases requiring human clinician review" },
    { name: "PHI Access Patterns", value: 12, target: 15, unit: "accesses/hr", trend: "stable", trendValue: "+0", status: "healthy", description: "Access frequency within HIPAA-compliant bounds" },
  ],
  financial_services: [
    { name: "Transaction Accuracy", value: 99.8, target: 99.9, unit: "%", trend: "stable", trendValue: "+0.0%", status: "warning", description: "Slightly below target; edge cases in cross-border FX transactions" },
    { name: "Compliance Violation Rate", value: 0.1, target: 0.5, unit: "%", trend: "down", trendValue: "-0.05%", status: "healthy", description: "Well below threshold; strong regulatory adherence" },
    { name: "False Positive Rate", value: 3.2, target: 5, unit: "%", trend: "down", trendValue: "-0.3%", status: "healthy", description: "AML screening false positives declining with model tuning" },
    { name: "Customer Suitability Score", value: 94.1, target: 92, unit: "%", trend: "up", trendValue: "+1.2%", status: "healthy", description: "Exceeding target; improved risk profiling accuracy" },
    { name: "Regulatory Reporting Timeliness", value: 98.5, target: 99, unit: "%", trend: "up", trendValue: "+0.3%", status: "warning", description: "Approaching target; minor delays in quarterly CCAR submissions" },
  ],
  manufacturing: [
    { name: "OEE Contribution", value: 87.3, target: 85, unit: "%", trend: "up", trendValue: "+1.1%", status: "healthy", description: "Exceeding target; agent-driven scheduling optimizations improving throughput" },
    { name: "Defect Detection Rate", value: 98.3, target: 97, unit: "%", trend: "up", trendValue: "+0.5%", status: "healthy", description: "Vision model catching micro-defects missed by prior version" },
    { name: "False Alarm Rate", value: 2.1, target: 3, unit: "%", trend: "down", trendValue: "-0.4%", status: "healthy", description: "Below threshold; reduced nuisance alerts on assembly line" },
    { name: "Mean Time to Detection", value: 3.2, target: 5, unit: "min", trend: "down", trendValue: "-0.3 min", status: "healthy", description: "Faster anomaly detection with updated sensor fusion model" },
    { name: "Predictive Maintenance Accuracy", value: 91.5, target: 90, unit: "%", trend: "up", trendValue: "+0.8%", status: "healthy", description: "Exceeding target; vibration analysis model improved" },
  ],
  insurance: [
    { name: "Claims Processing Accuracy", value: 96.2, target: 95, unit: "%", trend: "up", trendValue: "+0.6%", status: "healthy", description: "Above target; improved document extraction for auto claims" },
    { name: "Fraud Detection Rate", value: 91.5, target: 90, unit: "%", trend: "up", trendValue: "+1.0%", status: "healthy", description: "Exceeding target; new behavioral pattern matching active" },
    { name: "Underwriting Accuracy", value: 94.8, target: 93, unit: "%", trend: "stable", trendValue: "+0.2%", status: "healthy", description: "Strong performance across all lines of business" },
    { name: "Policy Pricing Precision", value: 97.1, target: 96, unit: "%", trend: "up", trendValue: "+0.4%", status: "healthy", description: "Actuarial model alignment exceeding expectations" },
    { name: "Loss Ratio Impact", value: -2.3, target: 0, unit: "%", trend: "down", trendValue: "-0.3%", status: "healthy", description: "Favorable impact; agent interventions reducing loss ratios" },
  ],
  retail: [
    { name: "Recommendation Accuracy", value: 82.1, target: 80, unit: "%", trend: "up", trendValue: "+1.5%", status: "healthy", description: "Exceeding target; collaborative filtering improvements live" },
    { name: "Cart Abandonment Reduction", value: -3.7, target: -5, unit: "%", trend: "down", trendValue: "-0.4%", status: "warning", description: "Progressing toward target; checkout flow optimization ongoing" },
    { name: "Search Relevance Score", value: 88.3, target: 85, unit: "%", trend: "up", trendValue: "+1.2%", status: "healthy", description: "Exceeding target; semantic search model reranking improved" },
    { name: "Inventory Prediction Accuracy", value: 95.9, target: 94, unit: "%", trend: "up", trendValue: "+0.7%", status: "healthy", description: "Strong demand forecasting across seasonal categories" },
    { name: "Customer Lifetime Value Impact", value: 12.40, target: 10, unit: "$", trend: "up", trendValue: "+$1.20", status: "healthy", description: "Exceeding target; personalization driving repeat purchases" },
  ],
  technology_saas: [
    { name: "API Uptime", value: 99.96, target: 99.9, unit: "%", trend: "stable", trendValue: "+0.01%", status: "healthy", description: "Exceeding SLO; zero unplanned outages this period" },
    { name: "P99 Latency", value: 380, target: 500, unit: "ms", trend: "down", trendValue: "-15ms", status: "healthy", description: "Well within budget; edge caching improvements active" },
    { name: "Error Rate", value: 0.4, target: 1, unit: "%", trend: "down", trendValue: "-0.1%", status: "healthy", description: "Below threshold; retry logic and circuit breakers effective" },
    { name: "Throughput", value: 13200, target: 10000, unit: "rps", trend: "up", trendValue: "+800 rps", status: "healthy", description: "Exceeding capacity target; horizontal scaling performing well" },
    { name: "Incident MTTR", value: 14, target: 20, unit: "min", trend: "down", trendValue: "-2 min", status: "healthy", description: "Below threshold; automated runbooks reducing resolution time" },
  ],
};

const INDUSTRY_DRIFT_DIAGNOSIS: Record<string, Array<{ agentName: string; metric: string; driftDescription: string; probableCauses: string[]; severity: "critical" | "high" | "medium"; detectedAt: string }>> = {
  healthcare: [
    { agentName: "Clinical Decision Support Agent", metric: "Guideline Adherence", driftDescription: "4.2% decrease in guideline adherence since Feb 10. Clinical pathway recommendations drifting from latest AMA standards.", probableCauses: ["AMA updated CPT billing codes on Feb 8 affecting 23 procedure mappings", "New FDA drug interaction warnings added to formulary requiring updated contraindication checks"], severity: "high", detectedAt: "2026-02-10T14:30:00Z" },
    { agentName: "Patient Triage Agent", metric: "Escalation Rate", driftDescription: "3.1% increase in unnecessary escalations since Feb 12. More cases being routed to specialists unnecessarily.", probableCauses: ["Updated CDC screening guidelines lowered thresholds for 4 symptom categories", "Seasonal flu surge changed baseline symptom distribution patterns"], severity: "medium", detectedAt: "2026-02-12T09:15:00Z" },
  ],
  financial_services: [
    { agentName: "KYC Verification Agent", metric: "False Positive Rate", driftDescription: "12% increase in false positives since Jan 15. Legitimate customers flagged for enhanced due diligence unnecessarily.", probableCauses: ["OFAC sanctions list update on Jan 14 added 340 new entries with common name patterns", "Customer demographic mix shift in Q1 onboarding cohort skewing risk scores"], severity: "critical", detectedAt: "2026-01-15T08:00:00Z" },
    { agentName: "Trade Surveillance Agent", metric: "Alert Accuracy", driftDescription: "5.8% decline in alert precision since Feb 1. More benign trading patterns triggering compliance reviews.", probableCauses: ["Volatile market conditions in Q1 generating unusual but legitimate trading patterns", "MiFID II reporting format changes on Jan 28 affecting transaction classification"], severity: "high", detectedAt: "2026-02-01T11:30:00Z" },
  ],
  manufacturing: [
    { agentName: "Quality Inspector Agent", metric: "False Alarm Rate", driftDescription: "8% increase in false alarms since Feb 1. Production line stoppages increasing due to phantom defect detections.", probableCauses: ["New raw material supplier introduced variance in component tolerances beyond training distribution", "Seasonal temperature changes affecting sensor calibration in zones 3-7"], severity: "high", detectedAt: "2026-02-01T06:00:00Z" },
    { agentName: "Predictive Maintenance Agent", metric: "Prediction Accuracy", driftDescription: "4.5% decline in maintenance prediction accuracy since Feb 8. Unnecessary maintenance cycles being triggered.", probableCauses: ["Firmware update on CNC machines changed vibration signature baselines", "New lubricant supplier altered wear pattern characteristics"], severity: "medium", detectedAt: "2026-02-08T10:45:00Z" },
  ],
  insurance: [
    { agentName: "Claims Adjuster Agent", metric: "Processing Accuracy", driftDescription: "5% decline in processing accuracy since Feb 5. Auto liability claims being misclassified at higher rates.", probableCauses: ["State insurance commissioner updated auto liability coverage minimums effective Feb 1", "New ICD-11 medical coding update affecting injury classification in bodily injury claims"], severity: "high", detectedAt: "2026-02-05T13:20:00Z" },
    { agentName: "Fraud Detection Agent", metric: "Detection Rate", driftDescription: "3.2% decrease in fraud detection since Feb 10. New fraud patterns emerging in digital claims submissions.", probableCauses: ["Organized fraud ring using AI-generated documentation bypassing existing checks", "Policy change allowing photo-based claims introduced new attack vectors"], severity: "critical", detectedAt: "2026-02-10T16:00:00Z" },
  ],
  retail: [
    { agentName: "Product Recommender Agent", metric: "Recommendation Accuracy", driftDescription: "6% drop in recommendation accuracy since Feb 3. Click-through rates on recommendations declining across channels.", probableCauses: ["Valentine's Day seasonal shift in purchase patterns diverging from historical baselines", "New product catalog import with 450 missing category tags causing misclassification"], severity: "high", detectedAt: "2026-02-03T07:30:00Z" },
    { agentName: "Dynamic Pricing Agent", metric: "Price Optimization", driftDescription: "4.1% decrease in pricing effectiveness since Feb 7. Competitor price matching becoming less responsive.", probableCauses: ["Three major competitors changed pricing APIs requiring updated scraping patterns", "Supply chain disruptions causing inventory volatility not captured in pricing model"], severity: "medium", detectedAt: "2026-02-07T15:45:00Z" },
  ],
  technology_saas: [
    { agentName: "Incident Triage Agent", metric: "MTTR", driftDescription: "15% increase in MTTR since Feb 8. Incident classification accuracy degrading for new service categories.", probableCauses: ["Kubernetes v1.29 upgrade changed pod scheduling behavior introducing new failure modes", "New microservices added 12 previously unknown error patterns not in training data"], severity: "critical", detectedAt: "2026-02-08T03:15:00Z" },
    { agentName: "Customer Support Agent", metric: "Resolution Rate", driftDescription: "7.3% decline in first-contact resolution since Feb 11. More tickets being escalated to Tier 2.", probableCauses: ["New product feature release introduced 8 undocumented edge cases", "Knowledge base articles not yet updated for v4.2 API breaking changes"], severity: "high", detectedAt: "2026-02-11T12:00:00Z" },
  ],
};

const REGULATORY_ALERTS: Record<string, Array<{ id: string; title: string; body: string; urgency: "critical" | "high" | "medium" | "info"; affectedAgents: number; actionRequired: string; deadline: string; regulation: string; issuedAt: string }>> = {
  healthcare: [
    { id: "reg-hc-1", title: "FDA: Updated AI/ML-Based SaMD Guidance", body: "FDA issued updated guidance on AI/ML-based Software as a Medical Device (SaMD) on Feb 5, 2026. Agents providing clinical decision support may require updated conformity assessments under the new predetermined change control plan requirements.", urgency: "critical", affectedAgents: 3, actionRequired: "Submit updated conformity assessments for clinical AI agents", deadline: "March 15, 2026", regulation: "FDA AI/ML SaMD Framework", issuedAt: "2026-02-05T00:00:00Z" },
    { id: "reg-hc-2", title: "HHS: HIPAA Security Rule Update", body: "HHS published final rule updating HIPAA Security Rule requirements for AI systems processing PHI. New encryption and access logging requirements for automated decision-making systems effective April 1, 2026.", urgency: "high", affectedAgents: 5, actionRequired: "Audit PHI access patterns and update encryption protocols", deadline: "April 1, 2026", regulation: "HIPAA Security Rule", issuedAt: "2026-01-20T00:00:00Z" },
    { id: "reg-hc-3", title: "CMS: AI Transparency in Medicare Decisions", body: "CMS issued guidance requiring transparency documentation for AI systems used in Medicare coverage determinations. Explainability reports must accompany all automated prior authorization decisions.", urgency: "medium", affectedAgents: 2, actionRequired: "Generate explainability documentation for coverage agents", deadline: "May 1, 2026", regulation: "CMS AI Transparency Guidance", issuedAt: "2026-02-10T00:00:00Z" },
  ],
  financial_services: [
    { id: "reg-fs-1", title: "FINRA: Revised Algorithmic Trading Supervision", body: "FINRA released revised algorithmic trading supervision requirements effective March 1, 2026. All AI-driven trading agents must maintain enhanced audit trails with decision-level explainability and real-time risk limit monitoring.", urgency: "critical", affectedAgents: 2, actionRequired: "Update audit trail systems and add decision explainability", deadline: "March 1, 2026", regulation: "FINRA Rule 3110(b)", issuedAt: "2026-01-15T00:00:00Z" },
    { id: "reg-fs-2", title: "OCC: Model Risk Management Update", body: "OCC updated SR 11-7 guidance on model risk management to include specific requirements for foundation models and LLM-based agents. Quarterly model validation now required for all Tier 1 agents.", urgency: "high", affectedAgents: 4, actionRequired: "Schedule quarterly model validations for all production agents", deadline: "March 31, 2026", regulation: "OCC SR 11-7", issuedAt: "2026-02-01T00:00:00Z" },
    { id: "reg-fs-3", title: "SEC: AI-Driven Advisory Disclosure Requirements", body: "SEC adopted amendments requiring registered advisors to disclose use of AI in investment recommendations. Client-facing agents must include AI disclosure statements in all communications.", urgency: "medium", affectedAgents: 3, actionRequired: "Add AI disclosure statements to advisory agent outputs", deadline: "April 15, 2026", regulation: "SEC Investment Advisers Act", issuedAt: "2026-02-08T00:00:00Z" },
  ],
  manufacturing: [
    { id: "reg-mf-1", title: "OSHA: Workplace AI Safety Guidelines Update", body: "OSHA updated workplace AI safety guidelines on Feb 1, 2026. Agents operating near safety-critical equipment must undergo updated risk assessments including human-AI collaboration protocols and emergency stop integration testing.", urgency: "critical", affectedAgents: 4, actionRequired: "Complete updated risk assessments for safety-critical agents", deadline: "March 15, 2026", regulation: "OSHA AI Safety Guidelines", issuedAt: "2026-02-01T00:00:00Z" },
    { id: "reg-mf-2", title: "ISO: Updated AI Quality Management Standards", body: "ISO published updated 42001 standards for AI management systems in manufacturing. New requirements for continuous monitoring of AI agent performance in quality-critical processes.", urgency: "high", affectedAgents: 3, actionRequired: "Align quality agents with ISO 42001 monitoring requirements", deadline: "April 30, 2026", regulation: "ISO 42001:2026", issuedAt: "2026-01-25T00:00:00Z" },
    { id: "reg-mf-3", title: "EU: AI Act Annex III High-Risk Classification", body: "EU AI Act Annex III updated to include AI systems in predictive maintenance for critical infrastructure. Affected agents require conformity assessments and CE marking by Q3 2026.", urgency: "medium", affectedAgents: 2, actionRequired: "Begin conformity assessment process for predictive maintenance agents", deadline: "September 1, 2026", regulation: "EU AI Act Annex III", issuedAt: "2026-02-12T00:00:00Z" },
  ],
  insurance: [
    { id: "reg-in-1", title: "NAIC: Model Bulletin on AI in Insurance", body: "NAIC adopted Model Bulletin on the Use of Artificial Intelligence in Insurance effective Feb 10, 2026. All AI agents involved in underwriting, claims, and pricing must have updated fairness testing documentation and bias audit reports.", urgency: "critical", affectedAgents: 5, actionRequired: "Complete fairness testing and bias audits for all insurance agents", deadline: "March 10, 2026", regulation: "NAIC AI Model Bulletin", issuedAt: "2026-02-10T00:00:00Z" },
    { id: "reg-in-2", title: "State DOI: AI Underwriting Transparency", body: "Multiple state Departments of Insurance issued coordinated requirements for AI underwriting transparency. Agents must provide adverse action explanations compliant with state-specific formats.", urgency: "high", affectedAgents: 3, actionRequired: "Implement state-specific adverse action explanation templates", deadline: "April 1, 2026", regulation: "State Insurance Regulations", issuedAt: "2026-01-28T00:00:00Z" },
    { id: "reg-in-3", title: "EU: IFRS 17 AI Actuarial Model Requirements", body: "IASB issued supplementary guidance on AI models used for IFRS 17 insurance contract valuations. Actuarial agents must maintain model validation logs and assumption documentation.", urgency: "medium", affectedAgents: 2, actionRequired: "Update actuarial agent documentation for IFRS 17 compliance", deadline: "June 30, 2026", regulation: "IFRS 17 Supplementary Guidance", issuedAt: "2026-02-05T00:00:00Z" },
    { id: "reg-in-4", title: "IRDAI: AI Claims Processing Standards", body: "IRDAI published draft standards for AI-assisted claims processing in India market. Comments due by March 20, and implementation expected by Q3 2026.", urgency: "info", affectedAgents: 1, actionRequired: "Review draft standards and prepare compliance roadmap", deadline: "March 20, 2026", regulation: "IRDAI AI Standards (Draft)", issuedAt: "2026-02-14T00:00:00Z" },
  ],
  retail: [
    { id: "reg-rt-1", title: "FTC: AI-Powered Pricing Algorithm Enforcement", body: "FTC issued enforcement guidance on AI-powered pricing algorithms on Jan 28, 2026. Dynamic pricing agents must demonstrate non-discriminatory pricing practices and maintain audit trails for all price adjustments.", urgency: "critical", affectedAgents: 2, actionRequired: "Conduct pricing fairness audit and implement transparency logging", deadline: "March 1, 2026", regulation: "FTC AI Pricing Guidelines", issuedAt: "2026-01-28T00:00:00Z" },
    { id: "reg-rt-2", title: "CCPA/CPRA: Automated Decision-Making Update", body: "California Privacy Protection Agency updated regulations on automated decision-making affecting consumers. Recommendation agents must provide opt-out mechanisms and decision explanations upon request.", urgency: "high", affectedAgents: 3, actionRequired: "Implement opt-out and explanation endpoints for recommendation agents", deadline: "April 1, 2026", regulation: "CCPA/CPRA Automated Decision Rules", issuedAt: "2026-02-03T00:00:00Z" },
    { id: "reg-rt-3", title: "EU: Digital Services Act AI Transparency", body: "DSA implementing regulations require transparency for AI-driven content recommendations in online marketplaces. Product recommendation agents serving EU users need compliance updates.", urgency: "medium", affectedAgents: 2, actionRequired: "Add DSA-compliant transparency notices to recommendation outputs", deadline: "May 15, 2026", regulation: "EU Digital Services Act", issuedAt: "2026-02-10T00:00:00Z" },
  ],
  technology_saas: [
    { id: "reg-ts-1", title: "EU AI Act: Article 6 High-Risk Classification", body: "EU AI Act Article 6 high-risk classification guidance updated Feb 12, 2026. Customer-facing agents that influence significant decisions require risk assessments, conformity declarations, and ongoing monitoring documentation.", urgency: "critical", affectedAgents: 3, actionRequired: "Complete risk assessments and prepare conformity declarations", deadline: "March 31, 2026", regulation: "EU AI Act Article 6", issuedAt: "2026-02-12T00:00:00Z" },
    { id: "reg-ts-2", title: "GDPR DPA: Automated Decision-Making Guidelines", body: "European Data Protection Authorities issued coordinated guidelines on automated decision-making by AI agents. Requires DPIA updates for all agents processing personal data with automated outcomes.", urgency: "high", affectedAgents: 4, actionRequired: "Update DPIAs and implement Article 22 safeguards", deadline: "April 15, 2026", regulation: "GDPR Article 22", issuedAt: "2026-02-08T00:00:00Z" },
    { id: "reg-ts-3", title: "SOC 2: AI System Control Criteria Update", body: "AICPA updated SOC 2 Trust Services Criteria to include specific control objectives for AI and ML systems. Next audit cycle must include AI-specific controls for system availability and processing integrity.", urgency: "medium", affectedAgents: 6, actionRequired: "Map AI controls to updated TSC and prepare audit evidence", deadline: "June 1, 2026", regulation: "SOC 2 Type II (AI Update)", issuedAt: "2026-01-30T00:00:00Z" },
    { id: "reg-ts-4", title: "FedRAMP: AI Agent Authorization Requirements", body: "FedRAMP PMO released supplemental guidance for AI agent authorization in government cloud environments. Agents serving federal customers need updated security packages.", urgency: "info", affectedAgents: 2, actionRequired: "Review supplemental guidance and update security documentation", deadline: "July 1, 2026", regulation: "FedRAMP AI Supplement", issuedAt: "2026-02-14T00:00:00Z" },
  ],
};

function generateTimeSeriesData(days: number, baseValue: number, variance: number, trend: "up" | "down" | "stable" = "stable") {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    const trendFactor = trend === "up" ? i * 0.5 : trend === "down" ? -i * 0.3 : 0;
    const value = Math.max(0, baseValue + trendFactor + (Math.random() - 0.5) * variance);
    return {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: Math.round(value * 100) / 100,
    };
  });
}

function RunDetailPanel({ run }: { run: any }) {
  const steps = run.stepsJson || [];
  const summary = run.resultSummary || {};
  const analysis = summary.analysis || {};

  return (
    <div className="ml-6 mt-1 mb-2 p-4 rounded-lg border bg-muted/10 flex flex-col gap-4" data-testid={`run-detail-${run.id}`}>
      {analysis.summary && (
        <div className="flex flex-col gap-1.5" data-testid="run-analysis-summary">
          <div className="flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-xs font-semibold">AI Analysis</span>
            {analysis.severity && (
              <Badge variant={analysis.severity === "low" ? "outline" : "destructive"} className="text-[9px] px-1.5 py-0">
                {analysis.severity}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{analysis.summary}</p>
        </div>
      )}

      {analysis.findings && analysis.findings.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="run-findings">
          <span className="text-xs font-semibold flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-blue-500" /> Key Findings
          </span>
          <div className="flex flex-col gap-1">
            {analysis.findings.map((finding: string, i: number) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <span className="text-blue-500 mt-0.5 shrink-0">&#8226;</span>
                <span>{finding}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.riskFactors && analysis.riskFactors.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="run-risk-factors">
          <span className="text-xs font-semibold flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> Risk Factors
          </span>
          <div className="flex flex-wrap gap-1.5">
            {analysis.riskFactors.map((rf: string, i: number) => (
              <Badge key={i} variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10">{rf}</Badge>
            ))}
          </div>
        </div>
      )}

      {analysis.recommendedActions && analysis.recommendedActions.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="run-recommendations">
          <span className="text-xs font-semibold flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Recommended Actions
          </span>
          <div className="flex flex-col gap-1">
            {analysis.recommendedActions.map((action: string, i: number) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <span className="text-emerald-500 mt-0.5 shrink-0">&#8226;</span>
                <span>{action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {steps.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="run-steps-timeline">
          <span className="text-xs font-semibold flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" /> Execution Steps
          </span>
          <div className="flex flex-col gap-1">
            {steps.map((step: any, i: number) => {
              const isLast = i === steps.length - 1;
              return (
                <div key={step.id} className="flex items-start gap-2" data-testid={`run-step-${step.id}`}>
                  <div className="flex flex-col items-center shrink-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${step.status === "completed" ? "bg-emerald-500" : step.status === "running" ? "bg-blue-500 animate-pulse" : "bg-red-500"}`} />
                    {!isLast && <div className="w-px h-5 bg-border" />}
                  </div>
                  <div className="flex flex-col min-w-0 pb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium">{step.name}</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{step.type}</Badge>
                      {step.mcpServer && (
                        <Badge variant="outline" className="text-[9px] text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1 py-0">{step.mcpServer}</Badge>
                      )}
                    </div>
                    {step.output && step.type === "api_call" && (() => {
                      const o = step.output;
                      const currentData = o.data?.current || {};
                      const temp = o.temperature ?? currentData.temperature_2m;
                      const wind = o.windSpeed ?? currentData.wind_speed_10m;
                      const humid = o.humidity ?? currentData.relative_humidity_2m;
                      const hasKnownFields = temp !== undefined || wind !== undefined || humid !== undefined;
                      if (hasKnownFields) {
                        return (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            {temp !== undefined && <span className="text-[10px] text-muted-foreground">Temp: {temp}°C</span>}
                            {wind !== undefined && <span className="text-[10px] text-muted-foreground">Wind: {wind} km/h</span>}
                            {humid !== undefined && <span className="text-[10px] text-muted-foreground">Humidity: {humid}%</span>}
                          </div>
                        );
                      }
                      const dataKeys = Object.keys(o.data || o).filter(k => !["source", "mcpTool", "mcpServer"].includes(k));
                      if (dataKeys.length > 0) {
                        const preview = dataKeys.slice(0, 4).map(k => {
                          const val = (o.data || o)[k];
                          const display = typeof val === "object" ? JSON.stringify(val).slice(0, 40) : String(val);
                          return `${k}: ${display}`;
                        }).join(" | ");
                        return <span className="text-[10px] text-muted-foreground mt-0.5">{preview}{dataKeys.length > 4 ? ` +${dataKeys.length - 4} more` : ""}</span>;
                      }
                      return null;
                    })()}
                    {step.error && (
                      <span className="text-[10px] text-red-500 mt-0.5">{step.error}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!analysis.summary && !steps.length && run.errorMessage && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
          <span className="text-[11px] text-red-600 dark:text-red-400">{run.errorMessage}</span>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t text-[10px] text-muted-foreground">
        <span>Run ID: {(run.id || "").slice(0, 8)}...</span>
        {run.latencyMs > 0 && <span>Latency: {formatMs(run.latencyMs)}</span>}
        {run.startedAt && <span>Started: {new Date(run.startedAt).toLocaleString()}</span>}
        {run.completedAt && <span>Completed: {new Date(run.completedAt).toLocaleString()}</span>}
      </div>
    </div>
  );
}

function AgentRuntimeTab() {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const { data: activeRuntimes } = useQuery<Array<{ deploymentId: string; agentId: string; agentName: string; intervalMs: number }>>({
    queryKey: ["/api/agent-runtime/active"],
    refetchInterval: 10000,
  });
  const { data: runtimeRuns } = useQuery<any[]>({
    queryKey: ["/api/agent-runtime/runs"],
    refetchInterval: 10000,
  });

  const runs = runtimeRuns || [];
  const actives = activeRuntimes || [];

  return (
    <div className="flex flex-col gap-4">
      <Card data-testid="section-active-runtimes">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Active Agent Runtimes</CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px]" data-testid="badge-active-count">
              {actives.length} running
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {actives.length === 0 ? (
            <div className="text-center py-6">
              <span className="text-xs text-muted-foreground">No agents currently running. Deploy an agent to start its runtime.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {actives.map((rt) => (
                <div key={rt.deploymentId} className="flex items-center justify-between gap-3 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/10" data-testid={`active-runtime-${rt.deploymentId}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-medium">{rt.agentName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{rt.intervalMs > 0 ? `Every ${Math.round(rt.intervalMs / 60000)}min` : "On-demand"}</Badge>
                    <Link href={`/deployments/${rt.deploymentId}`}>
                      <Button variant="outline" size="sm" data-testid={`button-view-runtime-${rt.deploymentId}`}>
                        <Eye className="w-3 h-3 mr-1" /> View
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="section-runtime-history">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Execution History</CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px]">{runs.length} runs</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="text-center py-6">
              <span className="text-xs text-muted-foreground">No execution history yet.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {runs.slice(0, 20).map((run: any) => {
                const summary = run.resultSummary || {};
                const severity = summary.severity || "unknown";
                const sevColor = severity === "critical" ? "text-red-600 dark:text-red-400" : severity === "high" ? "text-amber-600 dark:text-amber-400" : severity === "medium" ? "text-yellow-600 dark:text-yellow-400" : "text-emerald-600 dark:text-emerald-400";
                const isExpanded = expandedRunId === run.id;
                return (
                  <div key={run.id}>
                    <div
                      className={`flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30 cursor-pointer hover-elevate ${isExpanded ? "ring-1 ring-primary/30" : ""}`}
                      onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                      data-testid={`runtime-history-${run.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {run.status === "completed" ? (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        ) : run.status === "running" ? (
                          <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-medium">{summary.promptSummary || summary.city || "Agent Run"}</span>
                            <span className={`text-[10px] font-medium ${sevColor}`}>{severity}</span>
                            {summary.toolsUsed?.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">{summary.toolsUsed.length} tool{summary.toolsUsed.length > 1 ? "s" : ""}</span>
                            )}
                            {summary.passedSteps > 0 && (
                              <span className="text-[10px] text-muted-foreground">{summary.passedSteps}/{summary.totalSteps} steps</span>
                            )}
                            {summary.source === "mcp_integration" && (
                              <Badge variant="outline" className="text-[9px] text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1 py-0">MCP</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">
                              {run.startedAt ? new Date(run.startedAt).toLocaleString() : ""}
                            </span>
                            {run.latencyMs > 0 && (
                              <span className="text-[10px] text-muted-foreground">{formatMs(run.latencyMs)}</span>
                            )}
                            <Badge variant="outline" className="text-[9px] px-1 py-0">
                              {run.triggerType === "manual" ? "Manual" : "Scheduled"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Eye className={`w-3.5 h-3.5 shrink-0 transition-colors ${isExpanded ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    {isExpanded && <RunDetailPanel run={run} />}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Monitor() {
  const { industry } = useIndustry();
  const industryId = industry?.id || "financial_services";
  const [, navigate] = useLocation();
  const [policyCheckResult, setPolicyCheckResult] = useState<{
    signal: DriftSignal;
    allowed: boolean;
    violations: Array<{ policyName: string; rule: string; severity: string; message: string }>;
    sandboxAvailable: boolean;
  } | null>(null);

  const [envFilter, setEnvFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [toolFilter, setToolFilter] = useState("all");
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: traces } = useQuery<RunTrace[]>({
    queryKey: ["/api/traces"],
  });
  const { data: driftSignals } = useQuery<DriftSignal[]>({
    queryKey: ["/api/drift-signals"],
  });
  const { data: impactData } = useQuery<OutcomeImpact[]>({
    queryKey: ["/api/monitor/impact"],
  });
  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });
  const { data: toolConnectors } = useQuery<ToolConnector[]>({
    queryKey: ["/api/monitor/tool-health"],
  });
  const { data: policyViolations } = useQuery<PolicyViolation[]>({
    queryKey: ["/api/monitor/policy-violations"],
  });
  const { data: healingPipelines } = useQuery<any[]>({
    queryKey: ["/api/healing-pipelines"],
  });

  const { toast } = useToast();

  const remediateMutation = useMutation({
    mutationFn: async (signal: DriftSignal) => {
      await apiRequest("POST", "/api/recommendations", {
        agentId: signal.agentId,
        source: "drift",
        type: signal.metric === "pass_rate" ? "retrain" : "workflow_optimization",
        title: `Auto-remediate: ${signal.agentName} ${signal.suiteName} ${signal.metric} drift`,
        description: `${signal.metric === "pass_rate" ? "Pass rate" : signal.metric === "hallucination" ? "Faithfulness" : "Avg latency"} drifted by ${Math.abs(signal.driftPercent).toFixed(1)}% (${signal.severity} severity). Baseline: ${signal.baseline}, Current: ${signal.current}.`,
        severity: signal.severity,
        status: "pending",
        impact: signal.metric === "pass_rate"
          ? `Restore pass rate from ${(signal.current * 100).toFixed(1)}% back to ${(signal.baseline * 100).toFixed(1)}% baseline`
          : signal.metric === "hallucination"
          ? `Restore faithfulness from ${(signal.current * 100).toFixed(1)}% back to ${(signal.baseline * 100).toFixed(1)}% baseline`
          : `Reduce latency from ${signal.current}ms back to ${signal.baseline}ms baseline`,
        suggestedChanges: {
          action: signal.metric === "pass_rate" ? "retrain" : "optimize_latency",
          driftSignalId: signal.id,
          metric: signal.metric,
          baseline: signal.baseline,
          current: signal.current,
          severity: signal.severity,
        },
      });
    },
    onSuccess: () => {
      toast({ title: "Remediation created", description: "An improvement recommendation has been created from this drift signal." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create remediation", description: err.message, variant: "destructive" });
    },
  });

  const policyCheckMutation = useMutation({
    mutationFn: async (signal: DriftSignal) => {
      const res = await apiRequest("POST", "/api/policy-check", {
        agentId: signal.agentId,
        actionType: signal.metric === "pass_rate" ? "retrain" : "workflow_optimization",
        changes: {
          action: signal.metric === "pass_rate" ? "retrain" : "optimize_latency",
          driftSignalId: signal.id,
          metric: signal.metric,
          baseline: signal.baseline,
          current: signal.current,
          severity: signal.severity,
        },
      });
      return res.json();
    },
  });

  const requestApprovalFromDriftMutation = useMutation({
    mutationFn: async (signal: DriftSignal) => {
      await apiRequest("POST", "/api/approvals", {
        type: "auto_patch",
        objectType: "drift_signal",
        objectId: signal.id,
        objectName: `Remediate: ${signal.agentName} ${signal.metric} drift`,
        riskScore: signal.severity === "critical" ? 0.9 : signal.severity === "high" ? 0.7 : 0.5,
        status: "pending",
        requestedBy: "system",
        description: `Policy guardrail blocked auto-remediation for ${signal.agentName}. ${signal.metric === "pass_rate" ? "Pass rate" : signal.metric === "hallucination" ? "Faithfulness" : "Avg latency"} drifted by ${Math.abs(signal.driftPercent).toFixed(1)}%. Requires expert validation.`,
        evidenceJson: {
          driftSignalId: signal.id,
          metric: signal.metric,
          baseline: signal.baseline,
          current: signal.current,
          driftPercent: signal.driftPercent,
          severity: signal.severity,
        },
      });
    },
    onSuccess: () => {
      toast({ title: "Approval requested", description: "This remediation has been escalated for expert review." });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to request approval", description: err.message, variant: "destructive" });
    },
  });

  const escalateMutation = useMutation({
    mutationFn: async (payload: { signal: DriftSignal; affectedOutcomes: string[] }) => {
      const { signal, affectedOutcomes } = payload;
      const riskScore = signal.severity === "critical" ? 0.95 : signal.severity === "high" ? 0.75 : signal.severity === "medium" ? 0.5 : 0.3;
      const metricLabel = signal.metric === "pass_rate" ? "pass_rate" : signal.metric === "hallucination" ? "hallucination" : "avg_latency";
      await apiRequest("POST", "/api/approvals", {
        type: "anomaly_review",
        objectType: "drift_signal",
        objectId: signal.id,
        objectName: `Anomaly Review: ${signal.agentName} ${metricLabel} drift`,
        riskScore,
        status: "pending",
        requestedBy: "monitoring_system",
        description: `Anomaly detected: ${metricLabel} drifted by ${signal.driftPercent}% for ${signal.agentName}. Requires expert root-cause analysis and remediation approval.`,
        evidenceJson: {
          driftSignalId: signal.id,
          metric: signal.metric,
          baseline: signal.baseline,
          current: signal.current,
          driftPercent: signal.driftPercent,
          severity: signal.severity,
          agentName: signal.agentName,
          suiteName: signal.suiteName,
          affectedOutcomes,
          suggestedRemediation: getRemediationSuggestion(signal),
          detectedAt: signal.detectedAt,
        },
      });
    },
    onSuccess: () => {
      toast({ title: "Escalated to expert", description: "An anomaly review approval has been created for expert analysis." });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to escalate", description: err.message, variant: "destructive" });
    },
  });

  const triggerHealingMutation = useMutation({
    mutationFn: async (signal: DriftSignal) => {
      const res = await apiRequest("POST", "/api/healing-pipelines/auto-detect", {
        agentName: signal.agentName,
        agentId: signal.agentId,
        industry: industryId,
        issueType: "drift",
        severity: signal.severity,
        metric: signal.metric,
        baseline: signal.baseline,
        current: signal.current,
        driftPercent: signal.driftPercent,
        suiteName: signal.suiteName,
        description: `${signal.metric === "pass_rate" ? "Pass rate" : signal.metric === "hallucination" ? "Faithfulness" : "Avg latency"} drifted by ${Math.abs(signal.driftPercent).toFixed(1)}% (${signal.severity} severity). Baseline: ${signal.baseline}, Current: ${signal.current}.`,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Healing pipeline created", description: "Auto-detection triggered \u2014 navigating to Healing Operations Center." });
      queryClient.invalidateQueries({ queryKey: ["/api/healing-pipelines"] });
      navigate("/healing-operations");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to trigger healing", description: err.message, variant: "destructive" });
    },
  });

  function handleRemediate(signal: DriftSignal) {
    policyCheckMutation.mutate(signal, {
      onSuccess: (result: any) => {
        if (result.allowed) {
          remediateMutation.mutate(signal);
        } else {
          setPolicyCheckResult({ signal, ...result });
        }
      },
    });
  }

  function getRemediationSuggestion(signal: DriftSignal): string {
    if (signal.metric === "pass_rate") {
      if (signal.severity === "critical") {
        return "Suggested: Rollback to previous version or retrain on recent data";
      }
      return "Suggested: Review failing test cases and adjust configuration";
    }
    if (signal.metric === "avg_latency") {
      if (signal.severity === "critical") {
        return "Suggested: Scale resources or optimize workflow pipeline";
      }
      return "Suggested: Enable response caching or reduce token budget";
    }
    if (signal.metric === "hallucination") {
      if (signal.severity === "critical") {
        return "Suggested: Switch to grounded model or add retrieval-augmented generation";
      }
      return "Suggested: Tighten system prompt constraints and add factual guardrails";
    }
    return "Suggested: Investigate root cause and update agent configuration";
  }

  function getMetricLabel(metric: string): string {
    if (metric === "pass_rate") return "Pass rate";
    if (metric === "hallucination") return "Faithfulness";
    return "Avg latency";
  }

  function getAffectedOutcomes(agentId: string): OutcomeImpact[] {
    if (!impactData) return [];
    return impactData.filter(outcome =>
      outcome.agents.some(a => a.id === agentId)
    );
  }

  function isEscalated(signalId: string): boolean {
    if (!approvals) return false;
    return approvals.some(
      a => a.objectId === signalId && a.type === "anomaly_review" && a.status === "pending"
    );
  }

  function generateTraceEvents(trace: RunTrace) {
    const events: Array<{ type: string; label: string; detail: string; timestamp: string }> = [];
    const startTime = trace.startedAt ? new Date(trace.startedAt) : new Date();

    events.push({
      type: "run_started",
      label: "Run Started",
      detail: `Environment: ${trace.environment} | Model: ${trace.modelId || "default"} | Input: ${trace.inputSummary || "N/A"}`,
      timestamp: startTime.toLocaleTimeString(),
    });

    const tools = (trace.toolCalls as any[] | null) || [];
    tools.forEach((tc: any, i: number) => {
      const t = new Date(startTime.getTime() + (i + 1) * 150);
      events.push({
        type: "tool_called",
        label: `Tool: ${tc.tool || tc.name || tc.type || "unknown"}`,
        detail: `Args: ${JSON.stringify(tc.args || tc.input || {}).slice(0, 100)} | Status: ${tc.status || "ok"}`,
        timestamp: t.toLocaleTimeString(),
      });
    });

    const policyResults = (trace.policyChecks as any[] | null) || [];
    policyResults.forEach((pc: any) => {
      events.push({
        type: pc.blocked ? "policy_blocked" : "policy_passed",
        label: pc.blocked ? "Policy Blocked" : "Policy Passed",
        detail: `Policy: ${pc.policyName || pc.name || "unknown"} | Rule: ${pc.rule || "N/A"}`,
        timestamp: startTime.toLocaleTimeString(),
      });
    });

    events.push({
      type: "run_completed",
      label: trace.status === "completed" ? "Run Completed" : trace.status === "failed" ? "Run Failed" : "Run Blocked",
      detail: `Latency: ${formatMs(trace.latencyMs)} | Cost: $${(trace.costUsd || 0).toFixed(4)} | Output: ${(trace.outputSummary || "N/A").slice(0, 80)}`,
      timestamp: trace.endedAt ? new Date(trace.endedAt).toLocaleTimeString() : "\u2014",
    });

    return events;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const allTraces = traces || [];
  const successfulRuns = allTraces.filter((t) => t.status === "completed").length;
  const failedRuns = allTraces.filter((t) => t.status === "failed").length;
  const totalRuns = allTraces.length;
  const successRate = totalRuns > 0 ? ((successfulRuns / totalRuns) * 100).toFixed(1) : "0";
  const avgLatency = totalRuns > 0
    ? Math.round(allTraces.reduce((sum, t) => sum + (t.latencyMs || 0), 0) / totalRuns)
    : 0;
  const totalCost = allTraces.reduce((sum, t) => sum + (t.costUsd || 0), 0);
  const policyViolationCount = allTraces.filter((t) => t.status === "blocked").length;

  const customerImpactCount = impactData
    ? impactData.filter(o => o.breachedKpis > 0).length
    : 0;

  const filteredTraces = allTraces.filter(t => {
    if (envFilter !== "all" && t.environment !== envFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (toolFilter !== "all") {
      const tools = t.toolCalls as any[] | null;
      if (!tools || !tools.some((tc: any) => tc.type === toolFilter || tc.tool === toolFilter)) return false;
    }
    return true;
  });

  const overallStatusColors: Record<string, string> = {
    at_risk: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
    on_track: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    needs_attention: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  };

  const overallStatusLabels: Record<string, string> = {
    at_risk: "At Risk",
    on_track: "On Track",
    needs_attention: "Needs Attention",
  };

  const chartDefinitions = [
    { id: "success-rate", title: "Success Rate", currentValue: `${successRate}%`, color: "#10b981", type: "area" as const, data: generateTimeSeriesData(7, 95, 3, "stable") },
    { id: "p95-latency", title: "P95 Latency", currentValue: formatMs(avgLatency || 800), color: "#3b82f6", type: "line" as const, data: generateTimeSeriesData(7, 800, 200, "stable") },
    { id: "cost-per-run", title: "Cost per Run", currentValue: `$0.12`, color: "#8b5cf6", type: "bar" as const, data: generateTimeSeriesData(7, 0.12, 0.05) },
    { id: "policy-violations", title: "Policy Violations", currentValue: `${policyViolationCount}`, color: "#ef4444", type: "area" as const, data: generateTimeSeriesData(7, 3, 2) },
    { id: "drift-score", title: "Hallucination/Drift Score", currentValue: "92%", color: "#f59e0b", type: "line" as const, data: generateTimeSeriesData(7, 92, 5, "down") },
    { id: "kpi-confidence", title: "KPI Confidence", currentValue: "87%", color: "#10b981", type: "area" as const, data: generateTimeSeriesData(7, 87, 8, "up") },
  ];

  const changeSignals = (() => {
    const signals: Array<{
      icon: any;
      iconColor: string;
      title: string;
      category: string;
      description: string;
      actions: Array<{ label: string; icon?: any }>;
    }> = [];

    const degradedDrift = driftSignals?.filter(s => s.status === "degraded") || [];

    if (degradedDrift.some(s => s.metric === "pass_rate" && s.severity === "critical")) {
      signals.push({
        icon: Brain,
        iconColor: "text-red-500",
        title: "Model Performance Regression",
        category: "Model Version",
        description: "Critical pass rate drop detected across eval suites \u2014 possible model version change or training data drift",
        actions: [
          { label: "Run Targeted Eval", icon: Zap },
          { label: "Compare Versions", icon: GitCompareArrows },
        ],
      });
    }

    if (degradedDrift.some(s => s.metric === "avg_latency" && Math.abs(s.driftPercent) > 30)) {
      signals.push({
        icon: Wrench,
        iconColor: "text-amber-500",
        title: "Tool Schema / API Change",
        category: "Tool Drift",
        description: "Significant latency shift detected \u2014 possible tool schema change, API version update, or upstream dependency modification",
        actions: [
          { label: "Check Tool Health", icon: Wrench },
          { label: "View Error Rates" },
        ],
      });
    }

    if (degradedDrift.some(s => s.metric === "hallucination")) {
      signals.push({
        icon: Database,
        iconColor: "text-violet-500",
        title: "Knowledge Base Freshness Drop",
        category: "Knowledge Drift",
        description: "Hallucination/faithfulness scores degraded \u2014 knowledge base may be stale, missing coverage, or failing citations",
        actions: [
          { label: "Patch Retrieval Settings", icon: RefreshCcw },
          { label: "Re-index Knowledge Base", icon: Database },
        ],
      });
    }

    if (degradedDrift.length > 3) {
      signals.push({
        icon: BarChart3,
        iconColor: "text-blue-500",
        title: "Input Distribution Shift",
        category: "Input Drift",
        description: `${degradedDrift.length} degradation signals across multiple agents \u2014 possible shift in input patterns or user segments`,
        actions: [
          { label: "Analyze Distribution", icon: BarChart3 },
          { label: "Re-train / Re-index", icon: RefreshCcw },
        ],
      });
    }

    return signals;
  })();

  const autonomyActions = (() => {
    const criticalDrift = driftSignals?.filter(s => s.severity === "critical" && s.status === "degraded") || [];
    const highDrift = driftSignals?.filter(s => (s.severity === "critical" || s.severity === "high") && s.status === "degraded") || [];

    return [
      {
        icon: AlertTriangle,
        title: "Auto-Create Incident",
        description: criticalDrift.length > 0
          ? `${criticalDrift.length} critical threshold violations detected \u2014 incidents auto-created for affected agents`
          : "Monitors SLO thresholds and auto-creates incidents when violated",
        triggered: criticalDrift.length > 0,
      },
      {
        icon: RefreshCcw,
        title: "Auto-Start Replay + Eval",
        description: highDrift.length > 0
          ? `Shadow replay initiated for ${highDrift.length} agents to isolate regression source`
          : "Automatically replays recent traces against current version to detect behavioral divergence",
        triggered: highDrift.length > 0,
      },
      {
        icon: ShieldAlert,
        title: "Auto-Suggest Rollback",
        description: criticalDrift.length > 0
          ? `Rollback recommended for ${criticalDrift.length} agents with critical degradation \u2014 evidence bundle prepared`
          : "Prepares rollback evidence bundles when critical regressions are confirmed",
        triggered: criticalDrift.length > 0,
      },
      {
        icon: Stethoscope,
        title: "Auto-Trigger Self-Healing",
        description: criticalDrift.length > 0
          ? `${criticalDrift.length} critical issues detected \u2014 healing pipelines auto-created with industry-aware diagnosis`
          : "Automatically creates healing pipelines when critical agent issues are detected, with AI-powered diagnosis and industry guardrails",
        triggered: criticalDrift.length > 0,
      },
    ];
  })();

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-monitor">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">Operations Dashboard</h1>
            {industry && (
              <Badge variant="outline" className="text-[10px] gap-1" data-testid="badge-industry-context">
                {(() => { const Icon = industry.icon; return <Icon className="w-3 h-3" />; })()}
                {industry.label}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Industry-contextualized monitoring, outcome assurance & regulatory compliance
          </p>
        </div>
        <Button variant="outline" size="sm" data-testid="button-refresh-monitor">
          <RefreshCcw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="Success Rate" value={`${successRate}%`} icon={CheckCircle} variant="success" trend="up" trendValue="0.3%" testId="stat-success-rate" />
        <StatCard title="Avg Latency" value={formatMs(avgLatency)} icon={Clock} variant="default" trend="down" trendValue="12ms" testId="stat-avg-latency" />
        <StatCard title="Total Cost" value={`$${totalCost.toFixed(2)}`} icon={BarChart3} variant="default" testId="stat-total-cost" />
        <StatCard title="Policy Violations" value={policyViolationCount} icon={Shield} variant={policyViolationCount > 0 ? "danger" : "success"} testId="stat-policy-violations" />
        <StatCard title="Customer Impact" value={customerImpactCount} icon={Users} variant={customerImpactCount > 0 ? "warning" : "success"} subtitle="outcomes with breached KPIs" testId="stat-customer-impact" />
      </div>

      <OutcomeKpiStrip compact />

      <Tabs defaultValue="outcome-sla" className="flex flex-col gap-4">
        <TabsList className="w-fit flex-wrap h-auto">
          <TabsTrigger value="outcome-sla" data-testid="tab-outcome-sla">Outcome SLA Dashboard</TabsTrigger>
          <TabsTrigger value="agent-runtime" data-testid="tab-agent-runtime">Agent Runtime</TabsTrigger>
          <TabsTrigger value="slo-heatmap" data-testid="tab-slo-heatmap">SLO Heatmap</TabsTrigger>
          <TabsTrigger value="violations" data-testid="tab-violations">Policy Violations</TabsTrigger>
          <TabsTrigger value="tool-health" data-testid="tab-tool-health">Tool Health</TabsTrigger>
          <TabsTrigger value="live" data-testid="tab-live">Trace Explorer</TabsTrigger>
          <TabsTrigger value="drift" data-testid="tab-drift">Drift Detection</TabsTrigger>
          <TabsTrigger value="agent-health" data-testid="tab-agent-health">Agent Health</TabsTrigger>
          <TabsTrigger value="industry-kpis" data-testid="tab-industry-kpis">Industry KPIs</TabsTrigger>
          <TabsTrigger value="regulatory-alerts" data-testid="tab-regulatory-alerts">Regulatory Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="outcome-sla" className="mt-0">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {chartDefinitions.map((chart) => (
                <Card key={chart.id} data-testid={`chart-${chart.id}`}>
                  <CardContent className="p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-medium">{chart.title}</span>
                      <span className="text-lg font-semibold">{chart.currentValue}</span>
                    </div>
                    <div className="h-[120px]">
                      <ResponsiveContainer width="100%" height="100%">
                        {chart.type === "area" ? (
                          <AreaChart data={chart.data}>
                            <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
                            <XAxis dataKey="date" hide />
                            <YAxis hide />
                            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(value: number) => [value, chart.title]} />
                            <Area type="monotone" dataKey="value" stroke={chart.color} fill={chart.color} fillOpacity={0.15} strokeWidth={2} />
                          </AreaChart>
                        ) : chart.type === "line" ? (
                          <LineChart data={chart.data}>
                            <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
                            <XAxis dataKey="date" hide />
                            <YAxis hide />
                            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(value: number) => [value, chart.title]} />
                            <Line type="monotone" dataKey="value" stroke={chart.color} strokeWidth={2} dot={false} />
                          </LineChart>
                        ) : (
                          <BarChart data={chart.data}>
                            <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
                            <XAxis dataKey="date" hide />
                            <YAxis hide />
                            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(value: number) => [value, chart.title]} />
                            <Bar dataKey="value" fill={chart.color} radius={[2, 2, 0, 0]} />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {impactData?.map((outcome) => (
                <Card key={outcome.id} data-testid={`outcome-sla-card-${outcome.id}`}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Target className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">{outcome.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-medium border ${overallStatusColors[outcome.overallStatus] || ""}`}
                        >
                          {overallStatusLabels[outcome.overallStatus] || outcome.overallStatus}
                        </Badge>
                        <StatusBadge status={outcome.riskTier} />
                        <span className="text-xs font-semibold text-muted-foreground">{outcome.weightedProgress.toFixed(1)}%</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {outcome.kpis.map((kpi) => {
                        const progressPercent = kpi.target > 0 ? Math.min(100, (kpi.current / kpi.target) * 100) : 0;
                        const slaPercent = kpi.target > 0 ? Math.min(100, (kpi.slaThreshold / kpi.target) * 100) : 0;

                        return (
                          <div key={kpi.id} className="flex flex-col gap-1 p-2 rounded-md bg-muted/30" data-testid={`kpi-row-${kpi.id}`}>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-xs font-medium">{kpi.name} <span className="text-muted-foreground">({kpi.unit})</span></span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-muted-foreground">{kpi.current} / {kpi.target}</span>
                                <Badge
                                  variant={kpi.breachStatus === "breached" ? "destructive" : "outline"}
                                  className={`text-[9px] ${kpi.breachStatus === "exceeded" ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : ""}`}
                                  data-testid={`badge-breach-${kpi.id}`}
                                >
                                  {kpi.breachStatus}
                                </Badge>
                                <span className="text-[9px] text-muted-foreground" title="KPI delivery confidence" data-testid={`kpi-confidence-${kpi.id}`}>
                                  {Math.round((kpi as any).confidence ?? 85)}% conf
                                </span>
                              </div>
                            </div>
                            <div className="relative">
                              <Progress value={progressPercent} className="h-1.5" />
                              {slaPercent > 0 && slaPercent <= 100 && (
                                <div
                                  className="absolute top-0 h-full w-[2px] bg-foreground/40"
                                  style={{ left: `${slaPercent}%` }}
                                  title={`SLA Threshold: ${kpi.slaThreshold}`}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-dashed flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {outcome.agents.map((agent) => (
                          <Badge key={agent.id} variant="outline" className="text-[9px] gap-1">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${agent.recentFailures > 2 || agent.healthScore < 60 ? "bg-red-500" : "bg-emerald-500"}`} />
                            {agent.name}
                          </Badge>
                        ))}
                      </div>
                      <a
                        href={`/outcomes/${outcome.id}`}
                        className="text-[10px] text-muted-foreground hover:underline flex items-center gap-0.5"
                        data-testid={`link-outcome-${outcome.id}`}
                      >
                        Details <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {(!impactData || impactData.length === 0) && (
                <p className="text-sm text-muted-foreground py-8 text-center col-span-2">No outcome data available</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="slo-heatmap" className="mt-0">
          <Card data-testid="slo-heatmap-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-sm font-medium">SLO Heatmap by Agent</CardTitle>
                <span className="text-[10px] text-muted-foreground">Click any agent row for deep view</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="slo-heatmap-table">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Agent</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Status</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Success Rate</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">P95 Latency</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Health Score</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Cost / Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents?.map((agent) => {
                      const sr = (agent.successRate || 0) * 100;
                      const lat = agent.avgLatencyMs || 0;
                      const hs = agent.healthScore || 0;
                      const cpr = agent.costPerRun || 0;

                      const srColor = sr >= 95 ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : sr >= 85 ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-red-500/20 text-red-700 dark:text-red-300";
                      const latColor = lat <= 500 ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : lat <= 1500 ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-red-500/20 text-red-700 dark:text-red-300";
                      const hsColor = hs >= 80 ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : hs >= 60 ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-red-500/20 text-red-700 dark:text-red-300";
                      const cprColor = cpr <= 0.10 ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : cpr <= 0.30 ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-red-500/20 text-red-700 dark:text-red-300";

                      return (
                        <tr
                          key={agent.id}
                          className="border-b last:border-b-0 cursor-pointer hover-elevate"
                          onClick={() => setSelectedAgentId(agent.id)}
                          data-testid={`heatmap-row-${agent.id}`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                                <Activity className="w-3 h-3 text-primary" />
                              </div>
                              <span className="font-medium">{agent.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <StatusBadge status={agent.status} />
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded-md text-[11px] font-semibold ${srColor}`}>
                              {sr.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded-md text-[11px] font-semibold ${latColor}`}>
                              {lat}ms
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded-md text-[11px] font-semibold ${hsColor}`}>
                              {hs}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded-md text-[11px] font-semibold ${cprColor}`}>
                              ${cpr.toFixed(3)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(!agents || agents.length === 0) && (
                  <p className="text-sm text-muted-foreground py-8 text-center">No agents available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="violations" className="mt-0">
          <Card data-testid="policy-violation-stream">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Policy Violation Stream</CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {policyViolations?.length || 0} violations
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {policyViolations && policyViolations.length > 0 ? (
                policyViolations.map((v) => {
                  const severityColors: Record<string, string> = {
                    critical: "bg-red-500/10 border-red-500/20",
                    high: "bg-amber-500/10 border-amber-500/20",
                    medium: "bg-blue-500/10 border-blue-500/20",
                    low: "bg-muted/30 border-transparent",
                  };
                  const severityIconColors: Record<string, string> = {
                    critical: "text-red-500",
                    high: "text-amber-500",
                    medium: "text-blue-500",
                    low: "text-muted-foreground",
                  };
                  const timeAgo = (() => {
                    const diff = Date.now() - new Date(v.timestamp).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 60) return `${mins}m ago`;
                    const hours = Math.floor(mins / 60);
                    if (hours < 24) return `${hours}h ago`;
                    return `${Math.floor(hours / 24)}d ago`;
                  })();

                  return (
                    <div
                      key={v.id}
                      className={`flex items-start gap-3 p-3 rounded-md border ${severityColors[v.severity] || "bg-muted/30"}`}
                      data-testid={`violation-${v.id}`}
                    >
                      {v.blocked ? (
                        <Ban className={`w-4 h-4 shrink-0 mt-0.5 ${severityIconColors[v.severity] || "text-muted-foreground"}`} />
                      ) : (
                        <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${severityIconColors[v.severity] || "text-muted-foreground"}`} />
                      )}
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium">{v.agentName}</span>
                          <Badge variant="outline" className="text-[9px]">{v.policyName}</Badge>
                          <Badge variant={v.severity === "critical" ? "destructive" : "outline"} className="text-[9px]">{v.severity}</Badge>
                          {v.blocked && <Badge variant="destructive" className="text-[9px]">Blocked</Badge>}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{v.rule}</span>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
                            <Badge variant="outline" className="text-[9px]">{v.action}</Badge>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-[10px]"
                            onClick={() => {
                              setExpandedTraceId(v.traceId);
                              const tabEl = document.querySelector('[value="live"]') as HTMLElement;
                              tabEl?.click();
                            }}
                            data-testid={`button-view-trace-${v.id}`}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View Trace {v.traceId.slice(0, 8)}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-xs text-muted-foreground">No policy violations detected</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tool-health" className="mt-0">
          <Card data-testid="tool-connector-health">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Plug className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Tool Connector Health</CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {toolConnectors?.filter(c => c.status === "healthy").length || 0}/{toolConnectors?.length || 0} healthy
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {toolConnectors?.map((connector) => {
                  const statusColor = connector.status === "healthy"
                    ? "bg-emerald-500"
                    : connector.status === "degraded"
                      ? "bg-amber-500"
                      : "bg-red-500";
                  const statusBgColor = connector.status === "healthy"
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : connector.status === "degraded"
                      ? "bg-amber-500/5 border-amber-500/20"
                      : "bg-red-500/5 border-red-500/20";
                  const toolLabel = connector.name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
                  const toolIcon = connector.name === "llm_call" ? Brain
                    : connector.name === "retrieval" ? Database
                    : connector.name === "api_call" ? Plug
                    : connector.name === "code_exec" ? Zap
                    : connector.name === "database" ? Database
                    : Wrench;
                  const ToolIcon = toolIcon;

                  return (
                    <div
                      key={connector.name}
                      className={`flex flex-col gap-3 p-4 rounded-md border ${statusBgColor}`}
                      data-testid={`tool-connector-${connector.name}`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <ToolIcon className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs font-medium">{toolLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                          <span className="text-[10px] text-muted-foreground capitalize">{connector.status}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Calls</span>
                          <span className="text-sm font-semibold">{connector.totalCalls}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Error Rate</span>
                          <span className={`text-sm font-semibold ${connector.errorRate > 10 ? "text-red-600 dark:text-red-400" : connector.errorRate > 5 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                            {connector.errorRate}%
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Avg Latency</span>
                          <span className="text-sm font-semibold">{formatMs(connector.avgLatencyMs)}</span>
                        </div>
                      </div>
                      {connector.errorCount > 0 && (
                        <div className="flex items-center gap-1.5 pt-1 border-t border-dashed">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          <span className="text-[10px] text-muted-foreground">{connector.errorCount} errors in last 7 days</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {(!toolConnectors || toolConnectors.length === 0) && (
                  <p className="text-sm text-muted-foreground py-8 text-center col-span-3">No tool connector data available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="live" className="mt-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Recent Run Stream</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap pb-3 border-b mb-3">
                <Select value={envFilter} onValueChange={setEnvFilter}>
                  <SelectTrigger className="w-[130px]" data-testid="select-env-filter">
                    <SelectValue placeholder="Environment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Environments</SelectItem>
                    <SelectItem value="prod">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="pilot">Pilot</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={toolFilter} onValueChange={setToolFilter}>
                  <SelectTrigger className="w-[130px]" data-testid="select-tool-filter">
                    <SelectValue placeholder="Tool" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tools</SelectItem>
                    <SelectItem value="llm_call">LLM Call</SelectItem>
                    <SelectItem value="retrieval">Retrieval</SelectItem>
                    <SelectItem value="api_call">API Call</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="text-[10px]" data-testid="badge-filtered-count">
                  {filteredTraces.length} runs
                </Badge>
              </div>
              {filteredTraces.slice(0, 20).map((trace) => (
                <div key={trace.id}>
                  <div
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/30 hover-elevate cursor-pointer ${expandedTraceId === trace.id ? "ring-1 ring-primary/30" : ""}`}
                    onClick={() => setExpandedTraceId(expandedTraceId === trace.id ? null : trace.id)}
                    data-testid={`live-trace-${trace.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex items-center justify-center w-2 h-2 rounded-full shrink-0 ${trace.status === "completed" ? "bg-emerald-500" : trace.status === "failed" ? "bg-red-500" : "bg-amber-500"}`} />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium truncate">{trace.inputSummary || "Run execution"}</span>
                        <span className="text-[11px] text-muted-foreground">{trace.environment} | {formatMs(trace.latencyMs)} | ${trace.costUsd?.toFixed(4)}</span>
                      </div>
                    </div>
                    <StatusBadge status={trace.status} />
                  </div>
                  {expandedTraceId === trace.id && (
                    <div className="ml-4 mt-1 mb-2 p-3 rounded-md border bg-muted/10 flex flex-col gap-2" data-testid={`flight-recorder-${trace.id}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[9px]">Flight Recorder</Badge>
                          <span className="text-[10px] text-muted-foreground">Trace: {trace.id.slice(0, 8)}...</span>
                        </div>
                        <Link href={`/runtime/runs/${trace.id}`}>
                          <Button variant="outline" size="sm" data-testid={`button-view-run-${trace.id}`}>
                            <Eye className="w-3 h-3 mr-1" />
                            Run Details
                          </Button>
                        </Link>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {generateTraceEvents(trace).map((event, idx) => (
                          <div key={idx} className="flex items-start gap-2 p-2 rounded-md bg-muted/20" data-testid={`trace-event-${idx}`}>
                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${event.type === "run_started" ? "bg-blue-500" : event.type === "tool_called" ? "bg-violet-500" : event.type === "policy_blocked" ? "bg-red-500" : "bg-emerald-500"}`} />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] font-medium">{event.label}</span>
                                <span className="text-[10px] text-muted-foreground">{event.timestamp}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{event.detail}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {filteredTraces.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">No runs recorded yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drift" className="mt-0">
          <div className="flex flex-col gap-4">
            <Card data-testid="what-changed-panel">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-medium">What Changed?</CardTitle>
                  <Badge variant="outline" className="text-[10px]">{changeSignals.length} changes</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {changeSignals.map((change, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`change-signal-${idx}`}>
                    <change.icon className={`w-4 h-4 shrink-0 mt-0.5 ${change.iconColor}`} />
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium">{change.title}</span>
                        <Badge variant="outline" className="text-[9px]">{change.category}</Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{change.description}</span>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {change.actions.map((action, aidx) => (
                          <Button key={aidx} variant="outline" size="sm" data-testid={`button-change-action-${idx}-${aidx}`}>
                            {action.icon && <action.icon className="w-3 h-3 mr-1" />}
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                {changeSignals.length === 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-xs text-muted-foreground">No recent changes detected</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="industry-drift-diagnosis-panel">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-medium">Industry-Contextualized Drift Diagnosis</CardTitle>
                  <Badge variant="outline" className="text-[10px]">{industry?.label || "Financial Services"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {(INDUSTRY_DRIFT_DIAGNOSIS[industryId] || []).map((diagnosis, idx) => {
                  const severityColors: Record<string, string> = {
                    critical: "bg-red-500/5 border-red-500/20",
                    high: "bg-amber-500/5 border-amber-500/20",
                    medium: "bg-blue-500/5 border-blue-500/20",
                  };
                  const severityIconColors: Record<string, string> = {
                    critical: "text-red-500",
                    high: "text-amber-500",
                    medium: "text-blue-500",
                  };
                  return (
                    <div key={idx} className={`flex items-start gap-3 p-3 rounded-md border ${severityColors[diagnosis.severity] || ""}`} data-testid={`drift-diagnosis-${idx}`}>
                      <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${severityIconColors[diagnosis.severity] || "text-muted-foreground"}`} />
                      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium">{diagnosis.agentName}</span>
                          <Badge variant="outline" className="text-[9px]">{diagnosis.metric}</Badge>
                          <Badge variant={diagnosis.severity === "critical" ? "destructive" : "outline"} className="text-[9px]">{diagnosis.severity}</Badge>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{diagnosis.driftDescription}</span>
                        <div className="flex flex-col gap-1 mt-1 p-2 rounded-md bg-muted/30">
                          <span className="text-[10px] font-medium text-muted-foreground">Probable Causes:</span>
                          {diagnosis.probableCauses.map((cause, cidx) => (
                            <span key={cidx} className="text-[10px] text-muted-foreground">
                              {cidx + 1}. {cause}
                            </span>
                          ))}
                        </div>
                        <span className="text-[10px] text-muted-foreground">Detected: {new Date(diagnosis.detectedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })}
                {(!INDUSTRY_DRIFT_DIAGNOSIS[industryId] || INDUSTRY_DRIFT_DIAGNOSIS[industryId].length === 0) && (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-xs text-muted-foreground">No industry-specific drift diagnoses detected</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-medium">Drift & Change Detection</CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {driftSignals?.length || 0} signals detected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {driftSignals && driftSignals.length > 0 && (
                  <div className="flex items-center gap-4 px-1 flex-wrap" data-testid="drift-summary">
                    <span className="text-xs text-muted-foreground">
                      {driftSignals.filter(s => s.status === "degraded").length} degraded
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {driftSignals.filter(s => s.status === "improved").length} improved
                    </span>
                  </div>
                )}
                {!driftSignals || driftSignals.length === 0 ? (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium">All Clear</span>
                      <span className="text-[11px] text-muted-foreground">No significant drift detected across all eval suites</span>
                    </div>
                  </div>
                ) : (
                  driftSignals.map((signal: DriftSignal) => {
                    const isImproved = signal.status === "improved";
                    const isDegraded = signal.status === "degraded";
                    const severityColors: Record<string, string> = {
                      critical: "bg-red-500/5 border-red-500/20",
                      high: "bg-amber-500/5 border-amber-500/20",
                      medium: "bg-blue-500/5 border-blue-500/20",
                      low: "bg-emerald-500/5 border-emerald-500/20",
                    };
                    const severityIconColors: Record<string, string> = {
                      critical: "text-red-500",
                      high: "text-amber-500",
                      medium: "text-blue-500",
                      low: "text-emerald-500",
                    };
                    const affected = getAffectedOutcomes(signal.agentId);
                    const alreadyEscalated = isEscalated(signal.id);

                    const SignalIcon = signal.metric === "hallucination"
                      ? Brain
                      : (signal.severity === "critical" || signal.severity === "high")
                        ? AlertTriangle
                        : isImproved
                          ? TrendingUp
                          : Activity;

                    const signalIconColor = signal.metric === "hallucination"
                      ? (severityIconColors[signal.severity] || "text-muted-foreground")
                      : isImproved
                        ? "text-emerald-500"
                        : (severityIconColors[signal.severity] || "text-muted-foreground");

                    return (
                      <div key={signal.id} className={`flex items-start gap-3 p-3 rounded-md border ${severityColors[signal.severity] || ""}`} data-testid={`drift-signal-${signal.id}`}>
                        <SignalIcon className={`w-4 h-4 shrink-0 mt-0.5 ${signalIconColor}`} />
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium">{signal.agentName}</span>
                            <Badge variant="outline" className="text-[9px]">{signal.suiteName}</Badge>
                            <Badge variant={signal.severity === "critical" ? "destructive" : "outline"} className="text-[9px]">{signal.severity}</Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {getMetricLabel(signal.metric)} {isImproved ? "improved" : "degraded"} by{" "}
                            <span className="font-medium">{Math.abs(signal.driftPercent)}%</span>
                            {" "}(baseline: {signal.metric === "avg_latency" ? `${signal.baseline}ms` : `${(signal.baseline * 100).toFixed(1)}%`}
                            {" "}&rarr; current: {signal.metric === "avg_latency" ? `${signal.current}ms` : `${(signal.current * 100).toFixed(1)}%`})
                          </span>
                          <span className="text-[10px] text-muted-foreground">Detected: {new Date(signal.detectedAt).toLocaleString()}</span>

                          {isDegraded && affected.length > 0 && (
                            <div className="flex flex-col gap-1 mt-1 p-2 rounded-md bg-muted/30" data-testid={`drift-impact-${signal.id}`}>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Users className="w-3 h-3 text-muted-foreground" />
                                <span className="text-[10px] font-medium text-muted-foreground">Customer Impact</span>
                              </div>
                              {affected.map(o => (
                                <div key={o.id} className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px]">{o.name}</span>
                                  {o.breachedKpis > 0 && (
                                    <Badge variant="outline" className="text-[9px] text-red-600 dark:text-red-400">{o.breachedKpis} KPI{o.breachedKpis > 1 ? "s" : ""} breached</Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {isDegraded && (
                            <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-dashed flex-wrap" data-testid={`drift-remediation-${signal.id}`}>
                              <span className="text-[10px] text-muted-foreground">
                                {getRemediationSuggestion(signal)}
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRemediate(signal)}
                                  disabled={remediateMutation.isPending || policyCheckMutation.isPending || requestApprovalFromDriftMutation.isPending}
                                  data-testid={`button-remediate-${signal.id}`}
                                >
                                  <Wrench className="w-3 h-3 mr-1" />
                                  Remediate
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => triggerHealingMutation.mutate(signal)}
                                  disabled={triggerHealingMutation.isPending}
                                  data-testid={`button-trigger-healing-${signal.id}`}
                                >
                                  <Stethoscope className="w-3 h-3 mr-1" />
                                  Self-Heal
                                </Button>
                                {alreadyEscalated ? (
                                  <Badge variant="outline" className="text-[9px] text-amber-600 dark:text-amber-400 border-amber-500/20" data-testid={`badge-escalated-${signal.id}`}>
                                    Escalated
                                  </Badge>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const affectedNames = affected.map(o => o.name);
                                      escalateMutation.mutate({ signal, affectedOutcomes: affectedNames });
                                    }}
                                    disabled={escalateMutation.isPending}
                                    data-testid={`button-escalate-${signal.id}`}
                                  >
                                    <ArrowUpRight className="w-3 h-3 mr-1" />
                                    Escalate
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card data-testid="autonomy-hooks-panel">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-medium">Autonomy Hooks</CardTitle>
                  <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Active</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {autonomyActions.map((action, idx) => (
                  <div key={idx} className={`flex items-start gap-3 p-2.5 rounded-md border ${action.triggered ? "bg-amber-500/5 border-amber-500/20" : "bg-muted/20 border-transparent"}`} data-testid={`autonomy-action-${idx}`}>
                    <action.icon className={`w-4 h-4 shrink-0 mt-0.5 ${action.triggered ? "text-amber-500" : "text-muted-foreground"}`} />
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium">{action.title}</span>
                        <Badge variant={action.triggered ? "default" : "outline"} className="text-[9px]">
                          {action.triggered ? "Triggered" : "Standby"}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{action.description}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="agent-health" className="mt-0">
          <div className="flex flex-col gap-4">
            {(() => {
              const activePipelines = healingPipelines?.filter(hp => hp.stage !== "resolved") || [];
              if (activePipelines.length > 0) {
                const stageCounts: Record<string, number> = {};
                activePipelines.forEach(hp => {
                  stageCounts[hp.stage] = (stageCounts[hp.stage] || 0) + 1;
                });
                return (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-amber-500/5 border border-amber-500/20 flex-wrap" data-testid="healing-summary-strip">
                    <Stethoscope className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-xs font-medium">{activePipelines.length} active healing pipeline{activePipelines.length > 1 ? "s" : ""}</span>
                    <span className="text-[10px] text-muted-foreground">|</span>
                    {Object.entries(stageCounts).map(([stage, count]) => (
                      <Badge key={stage} variant="outline" className="text-[9px] text-amber-600 dark:text-amber-400 border-amber-500/20">
                        {count} {stage}
                      </Badge>
                    ))}
                    <Link href="/healing-operations">
                      <Button variant="outline" size="sm" data-testid="button-view-healing-center">
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                        Healing Center
                      </Button>
                    </Link>
                  </div>
                );
              }
              return null;
            })()}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {agents?.map((agent) => {
                const agentPipelines = healingPipelines?.filter(hp => hp.agentName === agent.name && hp.stage !== "resolved") || [];
                return (
                  <Card key={agent.id} className="cursor-pointer hover-elevate" onClick={() => setSelectedAgentId(agent.id)} data-testid={`sla-card-${agent.id}`}>
                    <CardContent className="p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                            <Activity className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <span className="text-sm font-medium">{agent.name}</span>
                        </div>
                        <StatusBadge status={agent.status} />
                        {agentPipelines.length > 0 && (
                          <Badge variant="outline" className="text-[9px] text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1" data-testid={`badge-healing-active-${agent.id}`}>
                            <Stethoscope className="w-2.5 h-2.5" />
                            Healing
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Success</span>
                          <span className="text-sm font-semibold">{((agent.successRate || 0) * 100).toFixed(1)}%</span>
                          <Progress value={(agent.successRate || 0) * 100} className="h-1" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">P95 Latency</span>
                          <span className="text-sm font-semibold">{formatMs(agent.avgLatencyMs)}</span>
                          <Progress value={Math.max(0, 100 - ((agent.avgLatencyMs || 0) / 200))} className="h-1" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Health</span>
                          <span className="text-sm font-semibold">{agent.healthScore}%</span>
                          <Progress value={agent.healthScore || 0} className="h-1" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost/Run</span>
                          <span className="text-sm font-semibold">${(agent.costPerRun || 0.08).toFixed(3)}</span>
                        </div>
                      </div>
                      {agentPipelines.length > 0 && (
                        <div className="flex flex-col gap-2 mt-1 p-3 rounded-md bg-amber-500/5 border border-amber-500/20" data-testid={`healing-inline-${agent.id}`} onClick={(e) => e.stopPropagation()}>
                          {agentPipelines.map((hp: any) => {
                            const stageProgress: Record<string, number> = { detecting: 20, diagnosing: 40, remediating: 65, validating: 85, resolved: 100 };
                            return (
                              <div key={hp.id} className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
                                    <span className="text-[11px] font-medium capitalize">{hp.stage}</span>
                                    <Badge variant={hp.severity === "critical" ? "destructive" : "outline"} className="text-[9px]">{hp.severity}</Badge>
                                  </div>
                                  <Link href="/healing-operations">
                                    <Button variant="outline" size="sm" className="text-[10px]" data-testid={`button-healing-detail-${hp.id}`}>
                                      <ArrowUpRight className="w-3 h-3 mr-1" />
                                      Details
                                    </Button>
                                  </Link>
                                </div>
                                <Progress value={stageProgress[hp.stage] || 0} className="h-1" />
                                {hp.diagnosis?.rootCause && (
                                  <span className="text-[10px] text-muted-foreground">{hp.diagnosis.rootCause}</span>
                                )}
                                {hp.description && !hp.diagnosis?.rootCause && (
                                  <span className="text-[10px] text-muted-foreground">{hp.description}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="industry-kpis" className="mt-0">
          <Card data-testid="industry-kpis-panel">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Industry KPI Monitoring</CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px]">{industry?.label || "Financial Services"}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(INDUSTRY_KPI_MONITORING[industryId] || []).map((kpi, idx) => {
                  const statusColors: Record<string, string> = {
                    healthy: "bg-emerald-500/5 border-emerald-500/20",
                    warning: "bg-amber-500/5 border-amber-500/20",
                    critical: "bg-red-500/5 border-red-500/20",
                  };
                  const statusBadgeColors: Record<string, string> = {
                    healthy: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                    warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
                    critical: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
                  };
                  const TrendIcon = kpi.trend === "up" ? TrendingUp : kpi.trend === "down" ? TrendingDown : Minus;
                  const trendColor = kpi.status === "healthy"
                    ? "text-emerald-500"
                    : kpi.status === "warning"
                      ? "text-amber-500"
                      : "text-red-500";
                  const progressValue = kpi.target > 0
                    ? Math.min(100, Math.abs(kpi.value / kpi.target) * 100)
                    : 50;

                  return (
                    <div key={idx} className={`flex flex-col gap-2.5 p-4 rounded-md border ${statusColors[kpi.status] || ""}`} data-testid={`industry-kpi-${idx}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-medium">{kpi.name}</span>
                        <Badge variant="outline" className={`text-[9px] border ${statusBadgeColors[kpi.status] || ""}`}>
                          {kpi.status}
                        </Badge>
                      </div>
                      <div className="flex items-end justify-between gap-2 flex-wrap">
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl font-semibold">{kpi.value}</span>
                          <span className="text-xs text-muted-foreground">{kpi.unit}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
                          <span className={`text-[11px] font-medium ${trendColor}`}>{kpi.trendValue}</span>
                        </div>
                      </div>
                      <Progress value={progressValue} className="h-1.5" />
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">Target: {kpi.target}{kpi.unit}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{kpi.description}</span>
                    </div>
                  );
                })}
              </div>
              {(!INDUSTRY_KPI_MONITORING[industryId] || INDUSTRY_KPI_MONITORING[industryId].length === 0) && (
                <p className="text-sm text-muted-foreground py-8 text-center">No industry KPI data available for this industry</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regulatory-alerts" className="mt-0">
          <Card data-testid="regulatory-alerts-panel">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <FileWarning className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Regulatory Alert Feed</CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {(REGULATORY_ALERTS[industryId] || []).length} alerts
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {(REGULATORY_ALERTS[industryId] || []).map((alert) => {
                const urgencyColors: Record<string, string> = {
                  critical: "bg-red-500/5 border-red-500/20",
                  high: "bg-amber-500/5 border-amber-500/20",
                  medium: "bg-blue-500/5 border-blue-500/20",
                  info: "bg-emerald-500/5 border-emerald-500/20",
                };
                const urgencyIconColors: Record<string, string> = {
                  critical: "text-red-500",
                  high: "text-amber-500",
                  medium: "text-blue-500",
                  info: "text-emerald-500",
                };
                const urgencyBadgeColors: Record<string, string> = {
                  critical: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
                  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
                  medium: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
                  info: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                };

                return (
                  <div key={alert.id} className={`flex items-start gap-3 p-4 rounded-md border ${urgencyColors[alert.urgency] || ""}`} data-testid={`regulatory-alert-${alert.id}`}>
                    <Bell className={`w-4 h-4 shrink-0 mt-0.5 ${urgencyIconColors[alert.urgency] || "text-muted-foreground"}`} />
                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{alert.title}</span>
                        <Badge variant="outline" className={`text-[9px] border ${urgencyBadgeColors[alert.urgency] || ""}`}>
                          {alert.urgency}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{alert.body}</span>
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge variant="outline" className="text-[9px] gap-1">
                          <Users className="w-2.5 h-2.5" />
                          {alert.affectedAgents} agent{alert.affectedAgents > 1 ? "s" : ""} affected
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">Deadline: {alert.deadline}</span>
                        <Badge variant="outline" className="text-[9px]">{alert.regulation}</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1 pt-2 border-t border-dashed flex-wrap">
                        <span className="text-[10px] text-muted-foreground">{alert.actionRequired}</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Button variant="outline" size="sm" data-testid={`button-review-alert-${alert.id}`}>
                            <Eye className="w-3 h-3 mr-1" />
                            Review
                          </Button>
                          <Button variant="outline" size="sm" data-testid={`button-action-alert-${alert.id}`}>
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Take Action
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {(!REGULATORY_ALERTS[industryId] || REGULATORY_ALERTS[industryId].length === 0) && (
                <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-xs text-muted-foreground">No regulatory alerts for this industry</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agent-runtime" className="mt-0">
          <AgentRuntimeTab />
        </TabsContent>
      </Tabs>

      <PolicyViolationDialog
        open={policyCheckResult !== null}
        onClose={() => setPolicyCheckResult(null)}
        violations={policyCheckResult?.violations || []}
        sandboxAvailable={policyCheckResult?.sandboxAvailable}
        onRequestApproval={() => {
          if (policyCheckResult) {
            requestApprovalFromDriftMutation.mutate(policyCheckResult.signal);
          }
        }}
        requestApprovalPending={requestApprovalFromDriftMutation.isPending}
        testIdPrefix="monitor-policy"
      />

      <Dialog open={selectedAgentId !== null} onOpenChange={() => setSelectedAgentId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="agent-deep-view-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Agent Monitor Deep View
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const agent = agents?.find(a => a.id === selectedAgentId);
            if (!agent) return <p className="text-sm text-muted-foreground">Agent not found</p>;

            const agentTraces = allTraces.filter(t => t.agentId === agent.id).slice(0, 10);
            const agentDrift = driftSignals?.filter(s => s.agentId === agent.id) || [];
            const agentViolations = policyViolations?.filter(v => v.agentId === agent.id) || [];
            const agentOutcomes = getAffectedOutcomes(agent.id);
            const sr = (agent.successRate || 0) * 100;
            const hs = agent.healthScore || 0;

            const rootCauses: Array<{ category: string; icon: any; iconColor: string; description: string; confidence: number }> = [];
            const passDrift = agentDrift.filter(s => s.metric === "pass_rate" && s.status === "degraded");
            const latDrift = agentDrift.filter(s => s.metric === "avg_latency" && s.status === "degraded");
            const hallDrift = agentDrift.filter(s => s.metric === "hallucination" && s.status === "degraded");

            if (passDrift.length > 0) {
              rootCauses.push({
                category: "Model Drift",
                icon: Brain,
                iconColor: "text-red-500",
                description: `Pass rate degraded by ${passDrift.map(s => Math.abs(s.driftPercent).toFixed(1) + "%").join(", ")} across ${passDrift.length} suite(s). Likely cause: model version change or training data shift.`,
                confidence: passDrift.some(s => s.severity === "critical") ? 92 : 75,
              });
            }
            if (latDrift.length > 0) {
              rootCauses.push({
                category: "Tool Errors",
                icon: Wrench,
                iconColor: "text-amber-500",
                description: `Latency spiked by ${latDrift.map(s => Math.abs(s.driftPercent).toFixed(1) + "%").join(", ")}. Likely cause: upstream API degradation or tool schema changes.`,
                confidence: latDrift.some(s => Math.abs(s.driftPercent) > 30) ? 85 : 65,
              });
            }
            if (hallDrift.length > 0) {
              rootCauses.push({
                category: "Knowledge Staleness",
                icon: Database,
                iconColor: "text-violet-500",
                description: `Faithfulness scores dropped by ${hallDrift.map(s => Math.abs(s.driftPercent).toFixed(1) + "%").join(", ")}. Likely cause: knowledge base is stale or missing recent data.`,
                confidence: hallDrift.some(s => s.severity === "critical") ? 88 : 70,
              });
            }
            if (rootCauses.length === 0) {
              rootCauses.push({
                category: "No Issues",
                icon: CheckCircle,
                iconColor: "text-emerald-500",
                description: "No significant degradation detected. All metrics within acceptable thresholds.",
                confidence: 95,
              });
            }

            return (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Activity className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{agent.name}</span>
                    <span className="text-[11px] text-muted-foreground">v{agent.currentVersion} | {agent.environment} | {agent.modelName}</span>
                  </div>
                  <StatusBadge status={agent.status} />
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Success Rate</span>
                    <span className={`text-lg font-bold ${sr >= 95 ? "text-emerald-600 dark:text-emerald-400" : sr >= 85 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{sr.toFixed(1)}%</span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Health Score</span>
                    <span className={`text-lg font-bold ${hs >= 80 ? "text-emerald-600 dark:text-emerald-400" : hs >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{hs}%</span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Latency</span>
                    <span className="text-lg font-bold">{formatMs(agent.avgLatencyMs)}</span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost / Run</span>
                    <span className="text-lg font-bold">${(agent.costPerRun || 0).toFixed(3)}</span>
                  </div>
                </div>

                {agentOutcomes.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> KPI Impact Estimate</span>
                    {agentOutcomes.map(outcome => (
                      <div key={outcome.id} className="p-2.5 rounded-md bg-muted/30 flex flex-col gap-1.5" data-testid={`deep-view-outcome-${outcome.id}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-medium">{outcome.name}</span>
                          <Badge variant="outline" className={`text-[9px] ${outcome.overallStatus === "at_risk" ? "text-red-600 dark:text-red-400" : outcome.overallStatus === "on_track" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                            {outcome.overallStatus === "at_risk" ? "At Risk" : outcome.overallStatus === "on_track" ? "On Track" : "Needs Attention"}
                          </Badge>
                        </div>
                        {outcome.kpis.slice(0, 3).map(kpi => (
                          <div key={kpi.id} className="flex items-center justify-between gap-2 px-1 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">{kpi.name}</span>
                            <span className="text-[10px]">{kpi.current}/{kpi.target} {kpi.unit}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" /> Root Cause Suggestions</span>
                  {rootCauses.map((rc, idx) => {
                    const RcIcon = rc.icon;
                    return (
                      <div key={idx} className="flex items-start gap-3 p-2.5 rounded-md bg-muted/30" data-testid={`root-cause-${idx}`}>
                        <RcIcon className={`w-4 h-4 shrink-0 mt-0.5 ${rc.iconColor}`} />
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium">{rc.category}</span>
                            <Badge variant="outline" className="text-[9px]">{rc.confidence}% confidence</Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground">{rc.description}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {agentDrift.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Active Drift Signals ({agentDrift.length})</span>
                    {agentDrift.map(signal => (
                      <div key={signal.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 flex-wrap" data-testid={`deep-view-drift-${signal.id}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={signal.severity === "critical" ? "destructive" : "outline"} className="text-[9px]">{signal.severity}</Badge>
                          <span className="text-[11px]">{signal.suiteName}</span>
                          <span className="text-[10px] text-muted-foreground">{getMetricLabel(signal.metric)} {signal.status === "improved" ? "+" : "-"}{Math.abs(signal.driftPercent).toFixed(1)}%</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{new Date(signal.detectedAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {agentViolations.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Recent Policy Violations ({agentViolations.length})</span>
                    {agentViolations.slice(0, 5).map(v => (
                      <div key={v.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 flex-wrap" data-testid={`deep-view-violation-${v.id}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={v.severity === "critical" ? "destructive" : "outline"} className="text-[9px]">{v.severity}</Badge>
                          <span className="text-[11px]">{v.policyName}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{v.rule.slice(0, 50)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium flex items-center gap-1.5"><CircleDot className="w-3.5 h-3.5" /> Recent Traces ({agentTraces.length})</span>
                  {agentTraces.map(trace => (
                    <div key={trace.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 flex-wrap" data-testid={`deep-view-trace-${trace.id}`}>
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${trace.status === "completed" ? "bg-emerald-500" : trace.status === "failed" ? "bg-red-500" : "bg-amber-500"}`} />
                        <span className="text-[11px] truncate">{trace.inputSummary || "Run"}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">{formatMs(trace.latencyMs)}</span>
                        <span className="text-[10px] text-muted-foreground">${(trace.costUsd || 0).toFixed(4)}</span>
                        <StatusBadge status={trace.status} />
                      </div>
                    </div>
                  ))}
                  {agentTraces.length === 0 && (
                    <p className="text-[11px] text-muted-foreground py-2 text-center">No traces recorded</p>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
