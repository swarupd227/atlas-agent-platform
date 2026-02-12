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

export type DataClassification = "public" | "internal" | "confidential" | "restricted";

export interface IntegrationSystem {
  id: string;
  name: string;
  category: string;
  description: string;
}

export interface WorkspaceConfig {
  subVerticals: string[];
  jurisdictions: string[];
  integrations: string[];
  departments: string[];
  dataClassificationDefault: DataClassification;
}

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
  integrationSystems: IntegrationSystem[];
  departments: string[];
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
    integrationSystems: [
      { id: "fis", name: "FIS", category: "Core Banking", description: "Core banking and payment processing platform" },
      { id: "temenos", name: "Temenos", category: "Core Banking", description: "Banking software for wealth and retail banking" },
      { id: "bloomberg", name: "Bloomberg Terminal", category: "Market Data", description: "Financial data, analytics, and trading platform" },
      { id: "refinitiv", name: "Refinitiv Eikon", category: "Market Data", description: "Financial analysis and market data platform" },
      { id: "murex", name: "Murex", category: "Trading", description: "Capital markets trading and risk management" },
      { id: "calypso", name: "Calypso", category: "Trading", description: "Cross-asset treasury and capital markets platform" },
      { id: "guidewire", name: "Guidewire", category: "Insurance", description: "Insurance core system platform" },
      { id: "duck_creek", name: "Duck Creek", category: "Insurance", description: "SaaS insurance platform" },
    ],
    departments: ["Treasury", "Risk Management", "Compliance", "Trading", "Client Services", "Finance & Accounting", "Marketing", "HR", "IT & Operations", "Legal"],
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
    integrationSystems: [
      { id: "epic", name: "Epic", category: "EHR", description: "Electronic health records and clinical workflow" },
      { id: "cerner", name: "Cerner (Oracle Health)", category: "EHR", description: "Health information technology solutions" },
      { id: "meditech", name: "MEDITECH", category: "EHR", description: "Healthcare information system" },
      { id: "veeva", name: "Veeva Systems", category: "Life Sciences", description: "Cloud solutions for life sciences" },
      { id: "iqvia", name: "IQVIA", category: "Clinical Research", description: "Clinical research and analytics platform" },
      { id: "medidata", name: "Medidata Solutions", category: "Clinical Research", description: "Clinical trial management platform" },
      { id: "labcorp", name: "LabCorp/Covance", category: "Diagnostics", description: "Laboratory diagnostics and drug development" },
      { id: "allscripts", name: "Allscripts", category: "EHR", description: "Healthcare IT solutions" },
    ],
    departments: ["Clinical Operations", "Pharmacy", "Research & Development", "Finance & Billing", "Marketing & Outreach", "Human Resources", "IT & Health Informatics", "Supply Chain", "Quality & Safety", "Legal & Compliance"],
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
    integrationSystems: [
      { id: "sap_erp", name: "SAP S/4HANA", category: "ERP", description: "Enterprise resource planning and manufacturing" },
      { id: "oracle_mfg", name: "Oracle Manufacturing Cloud", category: "ERP", description: "Cloud manufacturing management" },
      { id: "siemens_plm", name: "Siemens Teamcenter", category: "PLM", description: "Product lifecycle management platform" },
      { id: "ptc_windchill", name: "PTC Windchill", category: "PLM", description: "Product data and lifecycle management" },
      { id: "rockwell", name: "Rockwell FactoryTalk", category: "MES/SCADA", description: "Industrial automation and control" },
      { id: "aveva", name: "AVEVA", category: "MES/SCADA", description: "Industrial software for operations" },
      { id: "sap_ibp", name: "SAP IBP", category: "Supply Chain", description: "Integrated business planning for supply chain" },
      { id: "kinaxis", name: "Kinaxis RapidResponse", category: "Supply Chain", description: "Supply chain planning and analytics" },
    ],
    departments: ["Production", "Quality Assurance", "Supply Chain & Logistics", "Engineering", "Finance & Accounting", "Marketing & Sales", "HR & Safety", "IT & Automation", "Maintenance", "Legal & Compliance"],
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
    integrationSystems: [
      { id: "shopify", name: "Shopify", category: "E-Commerce", description: "E-commerce platform and POS" },
      { id: "salesforce_commerce", name: "Salesforce Commerce Cloud", category: "E-Commerce", description: "Enterprise e-commerce platform" },
      { id: "sap_cx", name: "SAP Commerce Cloud", category: "E-Commerce", description: "Enterprise commerce and CX platform" },
      { id: "oracle_retail", name: "Oracle Retail", category: "Retail Ops", description: "Retail management and merchandising" },
      { id: "manhattan", name: "Manhattan Associates", category: "Supply Chain", description: "Supply chain and omnichannel solutions" },
      { id: "blue_yonder", name: "Blue Yonder", category: "Supply Chain", description: "AI-driven supply chain management" },
      { id: "algolia", name: "Algolia", category: "Search", description: "AI-powered search and discovery" },
      { id: "stripe", name: "Stripe", category: "Payments", description: "Payment processing infrastructure" },
    ],
    departments: ["Merchandising", "E-Commerce", "Marketing & Advertising", "Customer Service", "Supply Chain & Fulfillment", "Finance & Accounting", "HR & Training", "IT & Digital", "Loss Prevention", "Legal & Compliance"],
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
    integrationSystems: [],
    departments: [],
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

const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  subVerticals: [],
  jurisdictions: [],
  integrations: [],
  departments: [],
  dataClassificationDefault: "internal",
};

interface IndustryContextType {
  industry: IndustryProfile | null;
  setIndustry: (id: IndustryId) => void;
  clearIndustry: () => void;
  isSelected: boolean;
  term: (key: TermKey) => string;
  allIndustries: IndustryProfile[];
  workspaceConfig: WorkspaceConfig;
  setWorkspaceConfig: (config: WorkspaceConfig) => void;
  activeFrameworks: string[];
  activeDepartments: string[];
}

const JURISDICTION_FRAMEWORKS: Record<string, Record<string, string[]>> = {
  financial_services: {
    US: ["SOX", "Basel III"],
    EU: ["EU AI Act", "MiFID II", "PSD2", "GDPR"],
    UK: ["FCA Regulations"],
    APAC: ["MAS Guidelines"],
    Global: [],
  },
  healthcare: {
    US: ["HIPAA", "HITECH", "FDA AI/ML Guidance"],
    EU: ["EU MDR", "GDPR", "EMA Guidelines"],
    UK: ["NHS Data Security"],
    APAC: ["PMDA Guidelines"],
    Global: ["21 CFR Part 11", "GxP"],
  },
  manufacturing: {
    US: ["ITAR", "OSHA"],
    EU: ["REACH", "RoHS", "EU Machinery Regulation"],
    UK: ["UK REACH"],
    APAC: ["CCC Certification"],
    Global: ["ISO 9001", "ISO 27001"],
  },
  retail: {
    US: ["CCPA/CPRA", "FTC Guidelines", "ADA Compliance"],
    EU: ["GDPR", "Digital Services Act"],
    UK: ["UK GDPR"],
    APAC: ["PDPA"],
    Global: ["PCI DSS"],
  },
  custom: {},
};

const DEPARTMENT_FRAMEWORKS: Record<string, Record<string, string[]>> = {
  financial_services: {
    "Treasury": ["Basel III", "SOX"],
    "Risk Management": ["Basel III", "EU AI Act"],
    "Compliance": ["SOX", "MiFID II", "FCA Regulations"],
    "Trading": ["MiFID II", "FCA Regulations"],
    "Finance & Accounting": ["SOX", "Basel III"],
    "Marketing": ["FTC Guidelines", "GDPR"],
    "Legal": ["GDPR", "EU AI Act"],
  },
  healthcare: {
    "Clinical Operations": ["HIPAA", "FDA AI/ML Guidance", "21 CFR Part 11"],
    "Pharmacy": ["FDA AI/ML Guidance", "21 CFR Part 11", "GxP"],
    "Research & Development": ["21 CFR Part 11", "GxP", "FDA AI/ML Guidance"],
    "Finance & Billing": ["SOX", "HIPAA"],
    "Marketing & Outreach": ["FDA AI/ML Guidance", "FTC Guidelines", "HIPAA"],
    "Human Resources": ["HIPAA", "GDPR"],
    "IT & Health Informatics": ["HIPAA", "HITECH", "21 CFR Part 11"],
    "Supply Chain": ["GxP", "FDA AI/ML Guidance"],
    "Quality & Safety": ["FDA AI/ML Guidance", "GxP", "21 CFR Part 11"],
    "Legal & Compliance": ["HIPAA", "HITECH", "GDPR"],
  },
  manufacturing: {
    "Production": ["ISO 9001", "OSHA", "ISA-95"],
    "Quality Assurance": ["ISO 9001", "ISO 27001"],
    "Supply Chain & Logistics": ["ITAR", "REACH", "RoHS"],
    "Engineering": ["ISA-95", "ISO 9001"],
    "Finance & Accounting": ["SOX", "ISO 27001"],
    "Marketing & Sales": ["FTC Guidelines", "GDPR"],
    "HR & Safety": ["OSHA", "GDPR"],
    "IT & Automation": ["ISO 27001", "ISA-95"],
    "Maintenance": ["OSHA", "ISO 9001"],
    "Legal & Compliance": ["ITAR", "REACH", "GDPR"],
  },
  retail: {
    "Merchandising": ["FTC Guidelines", "PCI DSS"],
    "E-Commerce": ["PCI DSS", "CCPA/CPRA", "GDPR"],
    "Marketing & Advertising": ["FTC Guidelines", "CCPA/CPRA", "GDPR"],
    "Customer Service": ["CCPA/CPRA", "GDPR", "ADA Compliance"],
    "Supply Chain & Fulfillment": ["FTC Guidelines"],
    "Finance & Accounting": ["SOX", "PCI DSS"],
    "IT & Digital": ["PCI DSS", "ISO 27001"],
    "Loss Prevention": ["PCI DSS", "CCPA/CPRA"],
    "Legal & Compliance": ["GDPR", "CCPA/CPRA", "FTC Guidelines"],
  },
  custom: {},
};

const IndustryContext = createContext<IndustryContextType | null>(null);

export function IndustryProvider({ children }: { children: ReactNode }) {
  const [industryId, setIndustryId] = useState<IndustryId | null>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("almp-industry") as IndustryId) || null;
    }
    return null;
  });

  const [workspaceConfig, setWorkspaceConfigState] = useState<WorkspaceConfig>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("almp-workspace-config");
      if (saved) {
        try { return JSON.parse(saved); } catch { /* ignore */ }
      }
    }
    return DEFAULT_WORKSPACE_CONFIG;
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
    localStorage.removeItem("almp-workspace-config");
    setWorkspaceConfigState(DEFAULT_WORKSPACE_CONFIG);
  }, []);

  const setWorkspaceConfig = useCallback((config: WorkspaceConfig) => {
    setWorkspaceConfigState(config);
    localStorage.setItem("almp-workspace-config", JSON.stringify(config));
  }, []);

  const activeFrameworks = useMemo(() => {
    if (!industryId || industryId === "custom") return [];
    const frameworkMap = JURISDICTION_FRAMEWORKS[industryId] || {};
    const frameworks = new Set<string>();
    for (const j of workspaceConfig.jurisdictions) {
      for (const fw of (frameworkMap[j] || [])) {
        frameworks.add(fw);
      }
    }
    const deptMap = DEPARTMENT_FRAMEWORKS[industryId] || {};
    for (const dept of workspaceConfig.departments || []) {
      for (const fw of (deptMap[dept] || [])) {
        frameworks.add(fw);
      }
    }
    return Array.from(frameworks);
  }, [industryId, workspaceConfig.jurisdictions, workspaceConfig.departments]);

  const activeDepartments = workspaceConfig.departments || [];

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
        workspaceConfig,
        setWorkspaceConfig,
        activeFrameworks,
        activeDepartments,
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
