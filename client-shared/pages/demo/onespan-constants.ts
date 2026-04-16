export const ONESPAN_COLOR  = "#00538C";
export const ONESPAN_ACCENT = "#00A9E0";

export const TARGET_TXN_ID  = "TXN-2026-00847";
export const TARGET_CLIENT  = "Meridian Capital Partners";
export const TARGET_AMOUNT  = "$1.2M";
export const TARGET_PRODUCT = "Commercial Loan";

export interface OnespanTransaction {
  id: string;
  client: string;
  product: string;
  amount: number;
  status: "declined" | "stalled" | "completed" | "pending" | "in_review";
  priority: "vip" | "high" | "normal";
  docVersion: string;
  requiredVersion: string;
  stallHours: number;
  signerCount: number;
}

export const ONESPAN_TRANSACTIONS: OnespanTransaction[] = [
  { id: "TXN-2026-00847", client: "Meridian Capital Partners", product: "Commercial Loan",  amount: 1200000, status: "declined",  priority: "vip",    docVersion: "v1.2", requiredVersion: "v1.4", stallHours: 52, signerCount: 2 },
  { id: "TXN-2026-00831", client: "Apex Realty Group",         product: "Mortgage",          amount: 850000,  status: "stalled",   priority: "high",   docVersion: "v2.1", requiredVersion: "v2.1", stallHours: 72, signerCount: 3 },
  { id: "TXN-2026-00819", client: "Sunrise Logistics LLC",     product: "Credit Facility",   amount: 500000,  status: "stalled",   priority: "normal", docVersion: "v3.0", requiredVersion: "v3.0", stallHours: 48, signerCount: 1 },
  { id: "TXN-2026-00802", client: "Harbor Financial Corp",     product: "Term Loan",         amount: 2100000, status: "completed", priority: "high",   docVersion: "v1.4", requiredVersion: "v1.4", stallHours: 0,  signerCount: 4 },
  { id: "TXN-2026-00798", client: "Clearview Ventures",        product: "Line of Credit",    amount: 350000,  status: "pending",   priority: "normal", docVersion: "v2.0", requiredVersion: "v2.0", stallHours: 0,  signerCount: 2 },
  { id: "TXN-2026-00791", client: "Pacific Meridian Bank",     product: "Mortgage",          amount: 980000,  status: "in_review", priority: "high",   docVersion: "v1.4", requiredVersion: "v1.4", stallHours: 0,  signerCount: 3 },
  { id: "TXN-2026-00784", client: "TechGrowth Capital",        product: "Credit Facility",   amount: 650000,  status: "stalled",   priority: "normal", docVersion: "v2.1", requiredVersion: "v2.1", stallHours: 36, signerCount: 2 },
  { id: "TXN-2026-00777", client: "National Bridge Corp",      product: "Term Loan",         amount: 4500000, status: "completed", priority: "vip",    docVersion: "v1.4", requiredVersion: "v1.4", stallHours: 0,  signerCount: 5 },
];

export interface OnespanAgent {
  key: string;
  name: string;
  step: number;
  role: string;
  model: string;
  tools: string[];
  color: string;
  bgColor: string;
  mcpServers: string[];
}

export const ONESPAN_AGENTS: OnespanAgent[] = [
  {
    key:        "transactionHealthMonitor",
    name:       "AGR-001 Transaction Health Monitor",
    step:       1,
    role:       "Portfolio Health & VIP Decline Detection",
    model:      "gpt-4.1",
    tools:      ["get_portfolio_health", "get_stall_analysis", "get_completion_funnel", "get_decline_summary"],
    color:      "text-blue-400",
    bgColor:    "bg-blue-500/10",
    mcpServers: ["OneSpan — Sender UI API"],
  },
  {
    key:        "exceptionClassifier",
    name:       "AGR-002 Exception Classifier",
    step:       2,
    role:       "Decline Root Cause & Correctability Classification",
    model:      "gpt-4.1",
    tools:      ["get_transaction_detail", "get_signer_session", "get_document_versions", "classify_decline_reason"],
    color:      "text-violet-400",
    bgColor:    "bg-violet-500/10",
    mcpServers: ["OneSpan — Signer UI Event API"],
  },
  {
    key:        "interventionOrchestrator",
    name:       "AGR-003 Intervention Orchestrator",
    step:       3,
    role:       "Corrective Resend, CRM Update & RM Escalation",
    model:      "gpt-4.1",
    tools:      ["resend_envelope", "update_crm_record", "notify_relationship_manager", "log_helpdesk_ticket"],
    color:      "text-amber-400",
    bgColor:    "bg-amber-500/10",
    mcpServers: ["OneSpan — Sender UI API", "OneSpan — CRM", "OneSpan — IT Helpdesk"],
  },
  {
    key:        "agreementOpsIntelligence",
    name:       "AGR-004 Agreement Ops Intelligence",
    step:       4,
    role:       "Analytics, Benchmarks & Ops Report Generation",
    model:      "gpt-4.1",
    tools:      ["get_analytics_dashboard", "get_peer_completion_benchmarks", "get_policy_compliance_status", "generate_ops_report"],
    color:      "text-emerald-400",
    bgColor:    "bg-emerald-500/10",
    mcpServers: ["OneSpan — Analytics API"],
  },
];

export const ONESPAN_KPI_DATA = [
  { id: "completion",    label: "Completion Rate",     value: "88.3",  unit: "%",   sub: "vs 92.5% peer benchmark", alert: true },
  { id: "declines",     label: "Decline Rate",         value: "4.2",   unit: "%",   sub: "vs 1.8% benchmark",       alert: true },
  { id: "stalls",       label: "Active Stalls",        value: "7",     unit: "",    sub: "vs benchmark of 2",       alert: true },
  { id: "revenue-risk", label: "Revenue at Risk",      value: "$340K", unit: "",    sub: "stalled + declined deals", alert: true },
];
