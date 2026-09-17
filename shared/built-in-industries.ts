/**
 * What the server knows about the built-in industries: names, ontology,
 * regulatory frameworks and sub-verticals. Industries supplied by a pack live in
 * shared/industry-packs. The client's BUILT_IN_INDUSTRIES (industry-provider.tsx)
 * carries the same values plus icons and presentation; tests/industry-filter.test.ts
 * keeps the two equal.
 */

export interface BuiltInIndustryProfile {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  ontology: string;
  regulatoryFrameworks: string[];
  subVerticals: string[];
}

export const BUILT_IN_INDUSTRY_PROFILES: BuiltInIndustryProfile[] = [
  {
    "id": "financial_services",
    "label": "Financial Services",
    "shortLabel": "FinServ",
    "description": "Banking, capital markets, credit rating, and wealth management with pre-loaded FIBO ontology and regulatory frameworks",
    "ontology": "FIBO (Financial Industry Business Ontology) + Credit Rating Ontology",
    "regulatoryFrameworks": [
      "EU AI Act",
      "MiFID II",
      "PSD2",
      "GDPR",
      "Basel III",
      "SOX",
      "SEC Rule 17g (NRSRO)",
      "EU CRA Regulation",
      "IOSCO Code of Conduct",
      "Dodd-Frank Title IX"
    ],
    "subVerticals": [
      "Credit Rating",
      "Retail Banking",
      "Capital Markets",
      "Wealth Management",
      "Payments",
      "Corporate Banking"
    ]
  },
  {
    "id": "insurance",
    "label": "Insurance",
    "shortLabel": "Insurance",
    "description": "P&C, life, health, and reinsurance with ACORD standards, Solvency II compliance, and claims automation",
    "ontology": "ACORD (Association for Cooperative Operations Research and Development)",
    "regulatoryFrameworks": [
      "Solvency II",
      "IFRS 17",
      "NAIC Model Laws",
      "GDPR",
      "EU AI Act",
      "ORSA"
    ],
    "subVerticals": [
      "Property & Casualty",
      "Workers Compensation",
      "Life & Annuities",
      "Health Insurance",
      "Reinsurance",
      "InsurTech"
    ]
  },
  {
    "id": "healthcare",
    "label": "Healthcare & Life Sciences",
    "shortLabel": "Health",
    "description": "Clinical operations, pharmaceutical, and life sciences with SNOMED CT ontology and HIPAA compliance",
    "ontology": "SNOMED CT (Clinical Terms)",
    "regulatoryFrameworks": [
      "HIPAA",
      "FDA AI/ML Guidance",
      "21 CFR Part 11",
      "HITECH",
      "GxP"
    ],
    "subVerticals": [
      "Hospital Systems",
      "Pharmaceuticals",
      "Medical Devices",
      "Clinical Research",
      "Payer/Insurance"
    ]
  },
  {
    "id": "manufacturing",
    "label": "Manufacturing & Supply Chain",
    "shortLabel": "Mfg",
    "description": "Production optimization, supply chain, and quality management with ISA-95 ontology",
    "ontology": "ISA-95 (Enterprise-Control Integration)",
    "regulatoryFrameworks": [
      "ISO 9001",
      "ISO 27001",
      "REACH",
      "RoHS",
      "ITAR"
    ],
    "subVerticals": [
      "Discrete Manufacturing",
      "Process Manufacturing",
      "Automotive",
      "Aerospace & Defense",
      "Electronics"
    ]
  },
  {
    "id": "retail",
    "label": "Retail & E-Commerce",
    "shortLabel": "Retail",
    "description": "Customer experience, inventory, and commerce with GS1 standards and PCI compliance",
    "ontology": "GS1 (Global Standards)",
    "regulatoryFrameworks": [
      "PCI DSS",
      "CCPA/CPRA",
      "GDPR",
      "FTC Guidelines",
      "ADA Compliance"
    ],
    "subVerticals": [
      "Omnichannel Retail",
      "D2C E-Commerce",
      "Grocery & FMCG",
      "Luxury & Fashion",
      "Marketplace"
    ]
  },
  {
    "id": "technology_saas",
    "label": "Technology / SaaS",
    "shortLabel": "Tech",
    "description": "Software, cloud infrastructure, and SaaS platforms with SOC 2, GDPR, and CCPA compliance built in",
    "ontology": "ITIL / SRE (IT Service Management & Site Reliability)",
    "regulatoryFrameworks": [
      "SOC 2 Type II",
      "GDPR",
      "CCPA/CPRA",
      "ISO 27001",
      "HIPAA BAA",
      "FedRAMP"
    ],
    "subVerticals": [
      "B2B SaaS",
      "Developer Tools",
      "Cloud Infrastructure",
      "FinTech",
      "HealthTech",
      "Software Deployment & Patch Management"
    ]
  },
  {
    "id": "legal_services",
    "label": "Legal Services",
    "shortLabel": "Legal",
    "description": "Law firms, corporate legal departments, and compliance teams with matter management, contract lifecycle automation, and eDiscovery workflows",
    "ontology": "LKIF (Legal Knowledge Interchange Format) + SALI LMSS",
    "regulatoryFrameworks": [
      "ABA Model Rules",
      "GDPR",
      "CCPA/CPRA",
      "FCPA",
      "SOX",
      "FRCP eDiscovery",
      "EU AI Act",
      "HIPAA BAA (for health law)"
    ],
    "subVerticals": [
      "Litigation & eDiscovery",
      "Corporate M&A",
      "Contract Management",
      "Intellectual Property",
      "Employment & Labor",
      "Compliance & Regulatory"
    ]
  },
  {
    "id": "custom",
    "label": "Cross-Industry",
    "shortLabel": "Cross-Industry",
    "description": "Cross-industry workspace for agents and templates that span multiple verticals — Order-to-Cash, DevOps, HR workflows, and more. Build your own ontology, policies, and templates from scratch.",
    "ontology": "Cross-Industry Ontology",
    "regulatoryFrameworks": [],
    "subVerticals": []
  }
];

export function getBuiltInIndustry(id: string | null | undefined): BuiltInIndustryProfile | undefined {
  const v = (id ?? "").trim().toLowerCase();
  return v ? BUILT_IN_INDUSTRY_PROFILES.find((p) => p.id === v) : undefined;
}
