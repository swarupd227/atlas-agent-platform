import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from "react";
import {
  Landmark,
  HeartPulse,
  Factory,
  ShoppingCart,
  Settings2,
  type LucideIcon,
} from "lucide-react";

export type IndustryId =
  | "financial_services"
  | "healthcare"
  | "manufacturing"
  | "retail"
  | "custom";

export interface IndustryProfile {
  id: IndustryId;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  color: string;
  ontology: string;
  agentSkills: number;
  regulatoryFrameworks: string[];
  goldenTemplates: number;
  subVerticals: string[];
  jurisdictions: string[];
}

export const INDUSTRIES: IndustryProfile[] = [
  {
    id: "financial_services",
    label: "Financial Services",
    shortLabel: "FinServ",
    description: "Banking, insurance, capital markets, and wealth management with pre-loaded FIBO ontology and regulatory frameworks",
    icon: Landmark,
    color: "hsl(220 70% 50%)",
    ontology: "FIBO (Financial Industry Business Ontology)",
    agentSkills: 142,
    regulatoryFrameworks: ["EU AI Act", "MiFID II", "PSD2", "GDPR", "Basel III", "SOX"],
    goldenTemplates: 28,
    subVerticals: ["Retail Banking", "Capital Markets", "Insurance", "Wealth Management", "Payments"],
    jurisdictions: ["US", "EU", "UK", "APAC", "Global"],
  },
  {
    id: "healthcare",
    label: "Healthcare & Life Sciences",
    shortLabel: "Health",
    description: "Clinical operations, pharmaceutical, and life sciences with SNOMED CT ontology and HIPAA compliance",
    icon: HeartPulse,
    color: "hsl(150 60% 40%)",
    ontology: "SNOMED CT (Clinical Terms)",
    agentSkills: 118,
    regulatoryFrameworks: ["HIPAA", "FDA AI/ML Guidance", "21 CFR Part 11", "HITECH", "GxP"],
    goldenTemplates: 22,
    subVerticals: ["Hospital Systems", "Pharmaceuticals", "Medical Devices", "Clinical Research", "Payer/Insurance"],
    jurisdictions: ["US", "EU", "UK", "APAC", "Global"],
  },
  {
    id: "manufacturing",
    label: "Manufacturing & Supply Chain",
    shortLabel: "Mfg",
    description: "Production optimization, supply chain, and quality management with ISA-95 ontology",
    icon: Factory,
    color: "hsl(30 70% 50%)",
    ontology: "ISA-95 (Enterprise-Control Integration)",
    agentSkills: 96,
    regulatoryFrameworks: ["ISO 9001", "ISO 27001", "REACH", "RoHS", "ITAR"],
    goldenTemplates: 18,
    subVerticals: ["Discrete Manufacturing", "Process Manufacturing", "Automotive", "Aerospace & Defense", "Electronics"],
    jurisdictions: ["US", "EU", "UK", "APAC", "Global"],
  },
  {
    id: "retail",
    label: "Retail & E-Commerce",
    shortLabel: "Retail",
    description: "Customer experience, inventory, and commerce with GS1 standards and PCI compliance",
    icon: ShoppingCart,
    color: "hsl(280 60% 50%)",
    ontology: "GS1 (Global Standards)",
    agentSkills: 108,
    regulatoryFrameworks: ["PCI DSS", "CCPA/CPRA", "GDPR", "FTC Guidelines", "ADA Compliance"],
    goldenTemplates: 24,
    subVerticals: ["Omnichannel Retail", "D2C E-Commerce", "Grocery & FMCG", "Luxury & Fashion", "Marketplace"],
    jurisdictions: ["US", "EU", "UK", "APAC", "Global"],
  },
  {
    id: "custom",
    label: "Custom",
    shortLabel: "Custom",
    description: "Start from scratch with a blank workspace and configure your own ontology, policies, and templates",
    icon: Settings2,
    color: "hsl(0 0% 50%)",
    ontology: "None (build your own)",
    agentSkills: 0,
    regulatoryFrameworks: [],
    goldenTemplates: 0,
    subVerticals: [],
    jurisdictions: ["US", "EU", "UK", "APAC", "Global"],
  },
];

type TermKey =
  | "outcomes"
  | "outcome"
  | "agents"
  | "agent"
  | "kpis"
  | "kpi"
  | "blueprints"
  | "blueprint"
  | "deployments"
  | "deployment"
  | "monitor"
  | "governance"
  | "approvals"
  | "billing"
  | "templates"
  | "template"
  | "incidents"
  | "incident"
  | "evaluation"
  | "evaluations"
  | "outcome_owner"
  | "sla"
  | "drift"
  | "remediation";

type TerminologyMap = Record<TermKey, string>;

const DEFAULT_TERMS: TerminologyMap = {
  outcomes: "Outcomes",
  outcome: "Outcome",
  agents: "Agents",
  agent: "Agent",
  kpis: "KPIs",
  kpi: "KPI",
  blueprints: "Blueprints",
  blueprint: "Blueprint",
  deployments: "Deployments",
  deployment: "Deployment",
  monitor: "Monitor",
  governance: "Governance",
  approvals: "Approvals",
  billing: "Billing",
  templates: "Templates",
  template: "Template",
  incidents: "Incidents",
  incident: "Incident",
  evaluation: "Evaluation",
  evaluations: "Evaluations",
  outcome_owner: "Outcome Owner",
  sla: "SLA",
  drift: "Drift",
  remediation: "Remediation",
};

const INDUSTRY_TERMS: Record<IndustryId, Partial<TerminologyMap>> = {
  financial_services: {
    outcomes: "Service Commitments",
    outcome: "Service Commitment",
    kpis: "Performance Covenants",
    kpi: "Performance Covenant",
    incidents: "Risk Events",
    incident: "Risk Event",
    outcome_owner: "Portfolio Manager",
    sla: "Service Covenant",
    drift: "Variance",
    remediation: "Corrective Action",
    evaluation: "Compliance Check",
    evaluations: "Compliance Checks",
  },
  healthcare: {
    outcomes: "Patient Throughput Targets",
    outcome: "Patient Throughput Target",
    kpis: "Clinical Metrics",
    kpi: "Clinical Metric",
    incidents: "Care Events",
    incident: "Care Event",
    outcome_owner: "Clinical Lead",
    sla: "Care Standard",
    drift: "Protocol Deviation",
    remediation: "Corrective Protocol",
    evaluation: "Clinical Validation",
    evaluations: "Clinical Validations",
  },
  manufacturing: {
    outcomes: "Production Targets",
    outcome: "Production Target",
    kpis: "OEE Metrics",
    kpi: "OEE Metric",
    incidents: "Downtime Events",
    incident: "Downtime Event",
    outcome_owner: "Plant Manager",
    sla: "Production Standard",
    drift: "Process Deviation",
    remediation: "Corrective Maintenance",
    evaluation: "Quality Inspection",
    evaluations: "Quality Inspections",
  },
  retail: {
    outcomes: "Revenue Targets",
    outcome: "Revenue Target",
    kpis: "Commerce Metrics",
    kpi: "Commerce Metric",
    incidents: "Fulfillment Issues",
    incident: "Fulfillment Issue",
    outcome_owner: "Category Manager",
    sla: "Service Promise",
    drift: "Forecast Deviation",
    remediation: "Recovery Action",
    evaluation: "Conversion Audit",
    evaluations: "Conversion Audits",
  },
  custom: {},
};

interface IndustryContextType {
  industry: IndustryProfile | null;
  setIndustry: (id: IndustryId) => void;
  clearIndustry: () => void;
  isSelected: boolean;
  term: (key: TermKey) => string;
  allIndustries: IndustryProfile[];
}

const IndustryContext = createContext<IndustryContextType | null>(null);

export function IndustryProvider({ children }: { children: ReactNode }) {
  const [industryId, setIndustryId] = useState<IndustryId | null>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("almp-industry") as IndustryId) || null;
    }
    return null;
  });

  const industry = useMemo(
    () => (industryId ? INDUSTRIES.find((i) => i.id === industryId) || null : null),
    [industryId],
  );

  const setIndustry = useCallback((id: IndustryId) => {
    setIndustryId(id);
    localStorage.setItem("almp-industry", id);
  }, []);

  const clearIndustry = useCallback(() => {
    setIndustryId(null);
    localStorage.removeItem("almp-industry");
  }, []);

  const term = useCallback(
    (key: TermKey): string => {
      if (!industryId) return DEFAULT_TERMS[key];
      return INDUSTRY_TERMS[industryId]?.[key] || DEFAULT_TERMS[key];
    },
    [industryId],
  );

  return (
    <IndustryContext.Provider
      value={{
        industry,
        setIndustry,
        clearIndustry,
        isSelected: industryId !== null,
        term,
        allIndustries: INDUSTRIES,
      }}
    >
      {children}
    </IndustryContext.Provider>
  );
}

export function useIndustry() {
  const ctx = useContext(IndustryContext);
  if (!ctx) throw new Error("useIndustry must be used within an IndustryProvider");
  return ctx;
}

export function useTerm(key: TermKey): string {
  const { term } = useIndustry();
  return term(key);
}
