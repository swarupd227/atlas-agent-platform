import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  Building2,
  UserX,
  MapPin,
  FileText,
  Mail,
  Shield,
  Scale,
  Search,
  BookOpen,
  Play,
  ArrowRight,
  Layers,
  Clock,
  Tag,
  HeadsetIcon,
  BarChart2,
  Factory,
  HeartPulse,
  CreditCard,
  ShoppingCart,
  Zap,
  Umbrella,
  TrendingDown,
  FileSignature,
  Newspaper,
} from "lucide-react";

interface Demo {
  id: string;
  title: string;
  client: string;
  description: string;
  industry: string;
  industryId: string;
  stage?: string;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  duration: string;
  screens: number;
  tags: string[];
  badge?: string;
}

const DEMOS: Demo[] = [
  {
    id: "blackrock-synthetic-worker",
    title: "Synthetic Worker Lifecycle",
    client: "AIM",
    description:
      "End-to-end agentic workflow for onboarding, managing, and offboarding synthetic (AI) workers within a financial services enterprise. Covers provisioning, compliance checks, and audit trails.",
    industry: "Financial Services",
    industryId: "financial_services",
    route: "/demo/blackrock",
    icon: Building2,
    iconColor: "hsl(220 70% 50%)",
    duration: "12 min",
    screens: 4,
    tags: ["Onboarding", "Compliance", "Lifecycle Management"],
  },
  {
    id: "blackrock-portal-offboarding",
    title: "Partner Portal Offboarding",
    client: "AIM",
    description:
      "Automated partner offboarding workflow including access revocation, data sanitisation, and regulatory notification. Demonstrates multi-step orchestration across IAM and compliance systems.",
    industry: "Financial Services",
    industryId: "financial_services",
    route: "/demo/blackrock2",
    icon: UserX,
    iconColor: "hsl(220 70% 50%)",
    duration: "10 min",
    screens: 4,
    tags: ["Offboarding", "Access Management", "IAM"],
  },
  {
    id: "kinective-change-of-address",
    title: "Change of Address Workflow",
    client: "XNective",
    description:
      "Intelligent address-change processing for financial accounts. Agent validates identity, cross-references fraud signals, updates downstream systems, and dispatches confirmation — all autonomously.",
    industry: "Financial Services",
    industryId: "financial_services",
    route: "/demo/kinective-coa",
    icon: MapPin,
    iconColor: "hsl(220 70% 50%)",
    duration: "8 min",
    screens: 4,
    tags: ["Customer Service", "Fraud Prevention", "Data Orchestration"],
  },
  {
    id: "moodys-credit-assessment",
    title: "Credit Assessment Package",
    client: "Moody's",
    description:
      "Automated assembly of structured credit assessment packages from raw analyst inputs. Includes data ingestion, model scoring, committee memo drafting, and regulatory submission.",
    industry: "Financial Services",
    industryId: "financial_services",
    route: "/demo/moodys",
    icon: FileText,
    iconColor: "hsl(220 70% 50%)",
    duration: "15 min",
    screens: 5,
    tags: ["Credit Rating", "Analytics", "Document Generation"],
  },
  {
    id: "hearst-nba-email",
    title: "NBA Email Orchestration",
    client: "XYZ",
    description:
      "Next Best Action engine for personalised email campaign orchestration. Analyses reader engagement signals, selects optimal content, and triggers delivery — with human review gates for brand safety.",
    industry: "Media & Entertainment",
    industryId: "media_entertainment",
    route: "/demo/hearst",
    icon: Mail,
    iconColor: "hsl(280 60% 50%)",
    duration: "10 min",
    screens: 4,
    tags: ["Marketing Automation", "Personalisation", "NBA"],
  },
  {
    id: "fitch-asset-quality",
    title: "Asset Quality Early Warning",
    client: "ABC",
    description:
      "Real-time asset quality monitoring pipeline that ingests portfolio signals, runs early-warning models, generates analyst alerts, and drafts escalation memos before conditions deteriorate.",
    industry: "Financial Services",
    industryId: "financial_services",
    route: "/demo/fitch",
    icon: Shield,
    iconColor: "hsl(220 70% 50%)",
    duration: "12 min",
    screens: 4,
    tags: ["Risk Monitoring", "Early Warning", "Portfolio Analytics"],
  },
  {
    id: "fitch-rw-rating-watch",
    title: "Automated Rating Watch Intelligence Pipeline",
    client: "Fitch Ratings",
    description:
      "SCN-1.1: Four live AI agents screen 847 IG corporate issuers in real time, flag Boeing Co. (BA) for CDS spread widening (+42 bps) and fundamental deterioration, and autonomously draft a BBB- Rating Watch Negative committee memo — from market signal to approval queue in under 4 minutes.",
    industry: "Financial Services",
    industryId: "financial_services",
    route: "/demo/fitch-rw",
    icon: TrendingDown,
    iconColor: "#1B5FAA",
    duration: "8 min",
    screens: 4,
    tags: ["Rating Watch", "CDS Monitoring", "SEC Filings", "Memo Generation"],
    badge: "Rating Intelligence",
  },
  {
    id: "blackbook-valuation",
    title: "Valuation Intelligence Platform",
    client: "Black Book",
    description:
      "Four live AI agents protect and accelerate Black Book's vehicle valuation pipeline: anomaly detection across 142K+ daily auction transactions, 2–4 week early market shift signals, competitive intelligence vs KBB and NADA, and 85% automated Wholesale Insights report generation.",
    industry: "Automotive Data",
    industryId: "automotive",
    route: "/demo/blackbook",
    icon: BarChart2,
    iconColor: "#E8640A",
    duration: "15 min",
    screens: 5,
    tags: ["Vehicle Valuations", "Anomaly Detection", "Market Intelligence"],
  },
  {
    id: "littler-compliance-engine",
    title: "Multi-State Compliance Engine",
    client: "Littler Mendelson",
    description:
      "AI-powered compliance gap analysis across 50-state employment law. Identifies jurisdiction-specific obligations, cross-references ATLAS policy rules, and produces actionable remediation plans.",
    industry: "Legal Services",
    industryId: "legal_services",
    route: "/demo/littler",
    icon: Scale,
    iconColor: "hsl(220 35% 40%)",
    duration: "14 min",
    screens: 4,
    tags: ["Employment Law", "Compliance", "Multi-Jurisdiction"],
  },
  {
    id: "otc-quote",
    title: "Intelligent Quote & Configuration",
    client: "NovaTech Industries",
    description:
      "Pre-Order stage of the Order-to-Cash cycle. Two Atlas agents run in parallel — OTC-AGT-001 (Quote & Configuration) and OTC-AGT-011 (Contract & Pricing Compliance) — to parse a 47-SKU RFQ, apply compatibility substitutions (X-7200→X-7250), run waterfall pricing, route for VP approval, and generate Quote Q-78432 in under 90 seconds.",
    industry: "Manufacturing",
    industryId: "manufacturing",
    stage: "Pre-Order",
    route: "/demo/otc-quote",
    icon: Factory,
    iconColor: "#FF6B35",
    duration: "8 min",
    screens: 4,
    tags: ["Order-to-Cash", "Pre-Order", "CPQ", "B2B Manufacturing"],
  },
  {
    id: "otc-order",
    title: "Order Validation & Promise Engine",
    client: "NovaTech Industries",
    description:
      "Order Processing stage of the Order-to-Cash cycle. Meridian Manufacturing submits RUSH order ORD-2026-78432 ($429K). Three Atlas agents run in parallel — OTC-AGT-002 (Order Validation), OTC-AGT-003 (Credit & Risk), OTC-AGT-004 (Inventory Promise) — to resolve credit exposure at 92%, inventory split across Chicago & Atlanta, and ship-to address mismatch. Order released in under 4 minutes.",
    industry: "Manufacturing",
    industryId: "manufacturing",
    stage: "Order Processing",
    route: "/demo/otc-order",
    icon: Factory,
    iconColor: "#FF6B35",
    duration: "6 min",
    screens: 3,
    tags: ["Order-to-Cash", "Order Processing", "Credit", "Inventory"],
    badge: "New",
  },
  {
    id: "otc-fulfillment",
    title: "Fulfillment Exception Command Center",
    client: "NovaTech Industries",
    description:
      "Fulfillment stage of the Order-to-Cash cycle. Winter Storm Stella hits the Midwest, suspending outbound operations at Chicago DC, Indianapolis DC, and St. Louis DC — 847 shipments affected. Three Atlas agents run sequentially: OTC-AGT-005 (Fulfillment & Exception) detects the disruption, assesses 312 priority SLA-committed shipments, and executes Smart Reroute ($47.2K) to Dallas, Atlanta, and Philadelphia DCs. OTC-AGT-007 (Delivery Tracking) confirms carrier signals, updates routing records, and validates 289 of 312 SLA-compliant ETAs. OTC-AGT-012 (Customer Comms) notifies all 847 customers with tier-personalised messages before a single one calls. 92.6% SLA protection in under 8 minutes.",
    industry: "Manufacturing",
    industryId: "manufacturing",
    stage: "Fulfillment",
    route: "/demo/otc-fulfillment",
    icon: Factory,
    iconColor: "#E85D26",
    duration: "8 min",
    screens: 3,
    tags: ["Order-to-Cash", "Fulfillment", "DC Rerouting", "Crisis Response", "Customer Comms"],
    badge: "New",
  },
  {
    id: "otc-cash",
    title: "AI-Powered Cash Application",
    client: "NovaTech Industries",
    description:
      "Financial stage of the Order-to-Cash cycle. Month-end: $42.3M in payments received across 387 transactions. OTC-AGT-009 (Cash Application) runs first — ingests all channels (wire/ACH/check/EDI 820), achieves 94.1% auto-match rate, and identifies 14 exceptions. Top exception: GlobalTech Corp's $2.3M wire covering 47 invoices with 3 deductions and a $38.1K overpayment. In Step 2, OTC-AGT-009 parses the EDI 820 remittance, matches all 47 invoices at 99.2% confidence, validates the freight claim and early pay discount, and flags the quantity short for investigation. OTC-AGT-006 (Billing & Collections) then validates deduction policy, posts journal entries, issues credit memo CM-2026-0328-GT, closes all 47 invoices, and reduces GlobalTech's AR balance from $3.1M to $0.73M. Exception sub-scenarios include Vertex Systems ACH reference mismatch (auto-resolved) and Regional Supply Co no-remittance check. Traditional processing time: 4–6 hours. Atlas: under 2 minutes.",
    industry: "Manufacturing",
    industryId: "manufacturing",
    stage: "Cash Application",
    route: "/demo/otc-cash",
    icon: CreditCard,
    iconColor: "#10B981",
    duration: "2 min",
    screens: 2,
    tags: ["Order-to-Cash", "Cash Application", "AR Posting", "Deduction Management", "Month-End Close"],
    badge: "New",
  },
  {
    id: "otc-dispute",
    title: "Dispute Resolution Intelligence",
    client: "NovaTech Industries",
    description:
      "Apex Industries disputes $380K across 12 invoices in 45 days — a 400% spike above historical baseline. OTC-AGT-008 (Dispute Resolution — new agent) detects the pattern, traces the root cause to a pricing error: contract MSA-2025-1104 (Feb 12, 2026) introduced new Category C rates, but ERP price list PL-2024-C was never replaced by PL-2025-C-APEX, causing a 4.7% systematic overcharge. OTC-AGT-011 (Contract & Pricing Compliance) scans the full customer portfolio and finds 3 more affected customers — Meridian Manufacturing, Cascade Dynamics, and Stonebridge Industries — totalling $165K systemic exposure across 123 invoices. OTC-AGT-006 (Billing & Collections) issues bulk credits, submits ERP change request CR-2026-PL-0047, and notifies all 4 customers proactively. Exception sub-scenarios: legal hold on invoice CRN-2026-AX-0005 (REF-LEGAL-2026-047), and ERP price list validation failure blocking the switch due to 8 open orders.",
    industry: "Manufacturing",
    industryId: "manufacturing",
    stage: "Dispute Resolution",
    route: "/demo/otc-dispute",
    icon: Scale,
    iconColor: "#EF4444",
    duration: "4 min",
    screens: 2,
    tags: ["Order-to-Cash", "Dispute Resolution", "Pricing Compliance", "ERP Correction", "Systemic Risk"],
    badge: "New",
  },
  {
    id: "advantive-pkg-sched",
    title: "Predictive Production Scheduling",
    client: "Advantive",
    description:
      "Westfield Packaging corrugated plant — Day Shift (07:00–15:00), 47 orders, 8 machines, 3 RUSH orders at delivery risk, B-Flute roll stock at 62%. PKG-001 (Order Intelligence) + PKG-002 (Capacity Mapper) analyse in parallel → PKG-003 generates 3 schedule alternatives → Alternative A: OEE +11.2pp (71→82.2%), OTIF +4 orders, changeovers -3, all RUSH orders covered. PKG-004 formats the Gantt proposal, publishes for plant planner approval, and commits Kiwiplan Schedule ID: KWP-SCHED-2026-0415-D.",
    industry: "Manufacturing",
    industryId: "manufacturing",
    stage: "Production Planning",
    route: "/demo/pkg-sched",
    icon: Factory,
    iconColor: "#00838F",
    duration: "8 min",
    screens: 3,
    tags: ["Scheduling", "OEE", "OTIF", "Kiwiplan", "Corrugated Packaging", "Capacity Optimization"],
    badge: "New",
  },
  {
    id: "onespan-agreements",
    title: "Digital Agreements Intelligence",
    client: "OneSpan",
    description:
      "VIP deal TXN-2026-00847 — Meridian Capital Partners $1.2M Commercial Loan — declined by signer Sarah Keating (VP Treasury) due to document version mismatch (v1.2 sent vs v1.4 required, AML attestation gap). 4 ATLAS agents run sequentially: AGR-001 detects VIP decline from portfolio health scan → AGR-002 classifies exception as CORRECTABLE (98% confidence) → AGR-003 resends envelope with v1.4, updates CRM, notifies RM David Okafor → AGR-004 generates ops report with peer benchmarks and systemic recommendations.",
    industry: "Financial Services / Legal Tech",
    industryId: "financial_services",
    stage: "Agreement Operations",
    route: "/demo/onespan",
    icon: FileSignature,
    iconColor: "#00538C",
    duration: "6 min",
    screens: 4,
    tags: ["Digital Agreements", "eSignature", "Decline Recovery", "VIP Client", "AML Compliance"],
    badge: "Digital Agreements",
  },
  {
    id: "sh-healthcare",
    title: "Clinical Data Integrity Self-Healing",
    client: "SH-HEALTH-001",
    description:
      "FHIR R4 EHR feed drops the MedicationStatement resource type, silently breaking drug-interaction validation for 847 inpatient records. Atlas detects the schema drift, re-routes flagged records, and restores HIPAA-compliant validation — all before a single pharmacist is notified.",
    industry: "Healthcare",
    industryId: "self_healing",
    route: "/demo/sh-healthcare",
    icon: HeartPulse,
    iconColor: "hsl(199 89% 42%)",
    duration: "6 min",
    screens: 3,
    tags: ["Self-Healing", "FHIR R4", "HIPAA", "Drug Safety", "Platform Intelligence"],
    badge: "Self-Healing",
  },
  {
    id: "sh-financial",
    title: "Fraud Model Recovery Agent",
    client: "SH-FIN-001",
    description:
      "BNPL merchant-category population shift causes fraud model precision to collapse from 94.2% to 71.8%, generating 340 false positives in 6 hours. Atlas detects the drift, activates a shadow challenger model, validates with 30-day hold-out data, and executes a zero-downtime model swap — all within SR 11-7 guardrails.",
    industry: "Financial Services",
    industryId: "self_healing",
    route: "/demo/sh-financial",
    icon: CreditCard,
    iconColor: "hsl(220 70% 50%)",
    duration: "7 min",
    screens: 3,
    tags: ["Self-Healing", "Model Drift", "SR 11-7", "FCRA", "Platform Intelligence"],
    badge: "Self-Healing",
  },
  {
    id: "sh-manufacturing",
    title: "Factory Floor Anomaly Recovery",
    client: "SH-MFG-001",
    description:
      "CNC Mill #7 bearing vibration crosses ISO 10816-3 Zone C at 14.7 mm/s RMS — a 340% surge from baseline — indicating imminent bearing failure. Atlas predicts 4-hour MTBF window, pre-stages spare parts, schedules an emergency 90-minute maintenance window, and reroutes production orders to preserve $2.1M weekly output.",
    industry: "Manufacturing",
    industryId: "self_healing",
    route: "/demo/sh-manufacturing",
    icon: Factory,
    iconColor: "hsl(25 95% 53%)",
    duration: "6 min",
    screens: 3,
    tags: ["Self-Healing", "Predictive Maintenance", "ISO 55001", "OSHA", "Platform Intelligence"],
    badge: "Self-Healing",
  },
  {
    id: "sh-retail",
    title: "Order Fulfillment Recovery Agent",
    client: "SH-RETAIL-001",
    description:
      "Primary WMS API goes down during peak shopping, error rate hitting 87% with 1,847 orders queued including 312 same-day delivery commitments — $340K SLA exposure. Atlas detects in 4 minutes, preserves every order, reroutes to 3 alternates, and notifies 312 customers in 22 minutes.",
    industry: "Retail / E-Commerce",
    industryId: "self_healing",
    route: "/demo/sh-retail",
    icon: ShoppingCart,
    iconColor: "hsl(142 71% 45%)",
    duration: "6 min",
    screens: 3,
    tags: ["Self-Healing", "WMS", "Order Routing", "PCI-DSS", "Platform Intelligence"],
    badge: "Self-Healing",
  },
  {
    id: "sh-energy",
    title: "Grid Operations Stability Agent",
    client: "SH-ENERGY-001",
    description:
      "Offshore-Alpha wind farm trips offline — 847 MW generation shortfall creates grid frequency deviation of −0.38 Hz against a NERC CIP-014 limit of ±0.5 Hz. Atlas redispatches 892 MW across 4 gas peakers in 8 minutes, preventing cascading failure across 3 balancing areas.",
    industry: "Energy / Utilities",
    industryId: "self_healing",
    route: "/demo/sh-energy",
    icon: Zap,
    iconColor: "hsl(262 80% 58%)",
    duration: "6 min",
    screens: 3,
    tags: ["Self-Healing", "NERC CIP", "Grid Stability", "FERC", "Platform Intelligence"],
    badge: "Self-Healing",
  },
  {
    id: "sh-insurance",
    title: "Claims Workflow Recovery Agent",
    client: "SH-INS-001",
    description:
      "Claims fraud triage model FPR spikes from 3.2% to 22.7% after biased retrain — 620 claims misclassified, 47 vulnerable claimants with delayed payouts, 12 state regulators triggered. Atlas isolates the model, routes claims to human review, and prepares state filings in 5 hours.",
    industry: "Insurance",
    industryId: "self_healing",
    route: "/demo/sh-insurance",
    icon: Umbrella,
    iconColor: "hsl(330 80% 50%)",
    duration: "7 min",
    screens: 3,
    tags: ["Self-Healing", "Model Bias", "NAIC", "GDPR Art. 22", "Platform Intelligence"],
    badge: "Self-Healing",
  },
  {
    id: "hnp-govt",
    title: "Government Beat Intelligence",
    client: "Hearst Newspapers",
    description:
      "SCN-HNP-1 — Hurricane Mara 36-hour landfall. Four live agents on real Claude process 47 Houston transcripts (90 days) and surface the $340M drainage bond / 34% delivered story (Allied Hydro contractor, Mayor Whitmire, Council Pollard/Huffman). HNP-GOVT-01 (Meeting Corpus Analyst) → HNP-GOVT-02 (Investigation Angle Detector) → reporter approval at the Review Brief gate → HNP-GOVT-03 (Story Draft) + HNP-GOVT-04 (FOIA Request Generator) running in parallel. 4 mock MCP servers (Hearst Assembly, Knowledge Base, TX Public Records portal, CMS) with 16 tools. Editorial governance enforced by 4 policies — Human Reporter Gate, Source Attribution Requirement, Publication Boundary, FOIA Accuracy Gate. Happy path + 2 exception sub-scenarios (source-attribution block, FOIA routing failure).",
    industry: "Media & Entertainment",
    industryId: "media_entertainment",
    stage: "Investigative Journalism",
    route: "/demo/hnp-govt",
    icon: Newspaper,
    iconColor: "#6B21A8",
    duration: "12 min",
    screens: 1,
    tags: ["Government Accountability", "Investigative Journalism", "Houston", "FOIA", "Source Attribution"],
    badge: "New",
  },
  {
    id: "mcg-kb",
    title: "Knowledge Base Onboarding",
    client: "MCG Health",
    description:
      "SCN-MCG-1 — One live agent (MCG-KB-INGEST-001) on real Claude ingests the MCG Brand Style Guide + Clinical Dictionary via 7 sequential extraction nodes (extract_brand_policy → extract_language_policy → extract_segment_lexicon → extract_naming_aliases → extract_dictionary_index → extract_theme_tokens → derive_qa_rules). Produces a 12-artifact typed JSON bundle via Atlas Bundle Store. QA gate enforces prohibited-term detection (hard block) and missing-hash warnings. Human promotion gate required before any proposal agent can be bound. Happy path (97.4 QA score) + 2 exception sub-scenarios: prohibited term 'Milliman Care Guidelines' blocks bundle; missing SHA-256 hashes trigger QA_WARN at 71.2.",
    industry: "Healthcare",
    industryId: "healthcare",
    stage: "Knowledge Management",
    route: "/demo/mcg-kb",
    icon: BookOpen,
    iconColor: "#003087",
    duration: "6 min",
    screens: 1,
    tags: ["Knowledge Base", "Brand Governance", "QA Validation", "Human-in-the-Loop", "Healthcare"],
    badge: "New",
  },
  {
    id: "hnp-sub",
    title: "Subscriber Intelligence & Churn Prevention",
    client: "Hearst Newspapers",
    description:
      "SCN-HNP-2 — Hurricane Mara landfall +24 hours. 280,000 Houston Chronicle digital subscribers; 64,400 in storm-affected zip codes. HNP-SUB-01 (Signal Monitor) classifies green / amber / red cohorts using live engagement signals and FEMA flood-zone data → HNP-SUB-02 (Churn Prediction Engine) applies Harvey-calibrated model across 23,400 at-risk subscribers → Audience Editor gate → HNP-SUB-03 (Content Generator) + HNP-SUB-04 (Outcome Tracker) in parallel. 4 mock MCP servers (Subscriber Platform, Churn Model, Geo Intelligence, Content API) with 15 tools. Governance: Audience Editor Approval Gate, Offer Authority Boundary, No Dark Pattern Policy. Happy path + 2 exceptions: editor modifies cohort-b to add flood links; offer-boundary-breach blocks 30% discount activation.",
    industry: "Media & Entertainment",
    industryId: "media_entertainment",
    stage: "Subscriber Retention",
    route: "/demo/hnp-sub",
    icon: TrendingDown,
    iconColor: "#6B21A8",
    duration: "10 min",
    screens: 1,
    tags: ["Churn Prevention", "Subscriber Intelligence", "Hurricane Mara", "Houston Chronicle", "Audience Editor"],
    badge: "New",
  },
  {
    id: "advantive-support",
    title: "AI-First Tier 1 Support Intelligence",
    client: "Advantive ONE",
    description:
      "Cascade Polymers Inc. (Enterprise, $248K ACV) reports InfinityQS v9.3 SQL timeout IQS-SQL-TMO-7891 — 47 Xbar-R control charts blocked with ISO 9001 audit 26 hours away. 4 Atlas agents run sequentially: SUP-001 (Triage) classifies P1 technical_troubleshooting (0.97 confidence) → SUP-002 (Knowledge) searches 18,400 tickets, confidence 0.58 — below gate, routes to Diagnostic → SUP-003 (Diagnostic) queries Product Log Intelligence, confirms IQS-BUG-930-0042 (migration script silently skipped), builds 5-step resolution path → SUP-004 (Escalation) auto-creates Salesforce Case #00074821 with 18 fields pre-populated, routes to Marcus Chen (InfinityQS DB Team), notifies AM James Whitfield — ISO audit fully covered.",
    industry: "Technology / SaaS",
    industryId: "technology_saas",
    stage: "Customer Support Operations",
    route: "/demo/advantive-support",
    icon: HeadsetIcon,
    iconColor: "#C62A47",
    duration: "7 min",
    screens: 4,
    tags: ["T1 Support", "InfinityQS", "Diagnostic Reasoning", "Escalation", "Salesforce", "ISO 9001"],
    badge: "New",
  },
];

const INDUSTRY_FILTERS = [
  { id: "all", label: "All Industries" },
  { id: "self_healing", label: "Self-Healing" },
  { id: "financial_services", label: "Financial Services" },
  { id: "media_entertainment", label: "Media & Entertainment" },
  { id: "automotive", label: "Automotive Data" },
  { id: "legal_services", label: "Legal Services" },
  { id: "manufacturing", label: "Manufacturing" },
  { id: "technology_saas", label: "Technology / SaaS" },
];

const industryBadgeStyle: Record<string, string> = {
  financial_services:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  legal_services:
    "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  media_entertainment:
    "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  automotive:
    "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  manufacturing:
    "bg-orange-50 text-orange-800 border-orange-300 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800/50",
  self_healing:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  technology_saas:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
};

export default function DemoCenter() {
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return DEMOS.filter((d) => {
      const matchesIndustry =
        industryFilter === "all" || d.industryId === industryFilter;
      const matchesSearch =
        !q ||
        d.title.toLowerCase().includes(q) ||
        d.client.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)) ||
        d.industry.toLowerCase().includes(q);
      return matchesIndustry && matchesSearch;
    });
  }, [search, industryFilter]);

  return (
    <div className="flex flex-col min-h-full">
      <div className="border-b bg-background px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-semibold tracking-tight" data-testid="heading-demo-center">
                Demo Center
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Interactive agentic workflow demonstrations across industries and use cases.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Layers className="w-3.5 h-3.5" />
              <span>{DEMOS.length} demos available</span>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search demos, clients, tags…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 h-12 !text-base bg-background border-2 focus-visible:ring-2 focus-visible:ring-primary"
                data-testid="input-demo-search"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {INDUSTRY_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setIndustryFilter(f.id)}
                  data-testid={`filter-industry-${f.id}`}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    industryFilter === f.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-6">
        <div className="max-w-5xl mx-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Search className="w-8 h-8 text-muted-foreground mb-3 opacity-40" />
              <p className="text-sm font-medium text-muted-foreground">No demos match your search</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different keyword or clear the filter</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-xs"
                onClick={() => { setSearch(""); setIndustryFilter("all"); }}
                data-testid="button-clear-demo-filters"
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((demo) => {
                const Icon = demo.icon;
                return (
                  <Card
                    key={demo.id}
                    className="flex flex-col group hover:shadow-md transition-shadow border"
                    data-testid={`card-demo-${demo.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${demo.iconColor}18`, border: `1px solid ${demo.iconColor}30` }}
                        >
                          <Icon className="w-4.5 h-4.5" style={{ color: demo.iconColor }} />
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {demo.badge && (
                            <Badge
                              variant="outline"
                              className="text-[10px] shrink-0 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800"
                              data-testid={`badge-demo-type-${demo.id}`}
                            >
                              ⚡ {demo.badge}
                            </Badge>
                          )}
                          {demo.industryId === "self_healing" && (
                            <Badge
                              variant="outline"
                              className="text-[10px] shrink-0 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                              data-testid={`badge-platform-intelligence-${demo.id}`}
                            >
                              Platform Intelligence
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-[10px] shrink-0 ${
                              demo.industryId === "self_healing"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                                : (industryBadgeStyle[demo.industryId] || "")
                            }`}
                            data-testid={`badge-demo-industry-${demo.id}`}
                          >
                            {demo.industry}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-2">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {demo.client}
                        </p>
                        <h3 className="text-sm font-semibold leading-snug mt-0.5" data-testid={`title-demo-${demo.id}`}>
                          {demo.title}
                        </h3>
                      </div>
                    </CardHeader>

                    <CardContent className="pb-3 flex-1">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {demo.description}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {demo.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"
                          >
                            <Tag className="w-2.5 h-2.5" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </CardContent>

                    <CardFooter className="pt-0 pb-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {demo.duration}
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          {demo.screens} screens
                        </span>
                      </div>
                      <Link href={demo.route}>
                        <Button
                          size="sm"
                          className="h-7 px-3 text-xs gap-1.5"
                          data-testid={`button-launch-demo-${demo.id}`}
                        >
                          <Play className="w-3 h-3" />
                          Launch
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
