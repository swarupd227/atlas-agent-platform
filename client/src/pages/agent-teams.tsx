import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Users,
  Plus,
  Search,
  ArrowRight,
  Bot,
  Globe,
  X,
  UserPlus,
  Crown,
  Eye,
  Trash2,
  Workflow,
  ShieldCheck,
  Lock,
  GitBranch,
  ChevronRight,
  FileCheck,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/stat-card";
import { ErrorState } from "@/components/error-state";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIndustry } from "@/components/industry-provider";
import type { Agent, AgentTeam } from "@shared/schema";
import type { IndustryId } from "@/components/industry-provider";

interface WorkflowTemplateAgent {
  name: string;
  role: string;
  skills: string[];
}

interface WorkflowTemplate {
  id: string;
  name: string;
  industry: IndustryId;
  description: string;
  agents: WorkflowTemplateAgent[];
  handoffPattern: "sequential" | "parallel" | "conditional";
  riskTier: string;
}

interface GovernanceRule {
  name: string;
  description: string;
  enforcement: "STRICT" | "MODERATE" | "ADVISORY";
  regulation: string;
}

interface DataFlowGovernance {
  industryId: IndustryId;
  rules: GovernanceRule[];
}

interface FederationRequirement {
  name: string;
  description: string;
  status: "required" | "recommended" | "optional";
  documentType: string;
}

interface A2AFederationTrust {
  industryId: IndustryId;
  trustTier: "CERTIFIED" | "VERIFIED" | "STANDARD";
  requirements: FederationRequirement[];
}

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "healthcare-care-coordination",
    name: "Care Coordination Team",
    industry: "healthcare",
    description: "End-to-end patient care coordination from intake through follow-up gap identification.",
    agents: [
      { name: "Triage Agent", role: "intake", skills: ["patient-assessment", "priority-classification", "symptom-analysis"] },
      { name: "Clinical Documentation Agent", role: "documentation", skills: ["medical-coding", "note-generation", "ehr-integration"] },
      { name: "Prior Auth Agent", role: "authorization", skills: ["insurance-verification", "prior-auth-submission", "approval-tracking"] },
      { name: "Care Gap Agent", role: "follow-up", skills: ["gap-detection", "patient-outreach", "care-plan-monitoring"] },
    ],
    handoffPattern: "sequential",
    riskTier: "HIGH",
  },
  {
    id: "financial-services-client-onboarding",
    name: "Client Onboarding Team",
    industry: "financial_services",
    description: "Regulated client onboarding from identity verification through compliance sign-off.",
    agents: [
      { name: "KYC Agent", role: "verification", skills: ["identity-verification", "document-validation", "sanctions-screening"] },
      { name: "Suitability Agent", role: "assessment", skills: ["risk-profiling", "investment-suitability", "client-classification"] },
      { name: "Account Setup Agent", role: "provisioning", skills: ["account-creation", "product-assignment", "access-provisioning"] },
      { name: "Compliance Review Agent", role: "compliance", skills: ["regulatory-check", "audit-trail", "approval-workflow"] },
    ],
    handoffPattern: "sequential",
    riskTier: "HIGH",
  },
  {
    id: "manufacturing-quality-assurance",
    name: "Quality Assurance Team",
    industry: "manufacturing",
    description: "Closed-loop quality management from defect detection through corrective action verification.",
    agents: [
      { name: "Inspection Agent", role: "detection", skills: ["visual-inspection", "measurement-analysis", "defect-classification"] },
      { name: "Root Cause Agent", role: "analysis", skills: ["root-cause-analysis", "failure-mode-analysis", "trend-detection"] },
      { name: "Corrective Action Agent", role: "remediation", skills: ["capa-generation", "process-adjustment", "verification-testing"] },
    ],
    handoffPattern: "sequential",
    riskTier: "MEDIUM",
  },
  {
    id: "insurance-claims-processing",
    name: "Claims Processing Team",
    industry: "insurance",
    description: "Automated claims lifecycle from first notice through fraud screening and settlement.",
    agents: [
      { name: "FNOL Agent", role: "intake", skills: ["claim-registration", "loss-documentation", "coverage-lookup"] },
      { name: "Coverage Verification Agent", role: "verification", skills: ["policy-validation", "coverage-determination", "exclusion-check"] },
      { name: "Adjudication Agent", role: "assessment", skills: ["damage-assessment", "reserve-setting", "settlement-calculation"] },
      { name: "Fraud Screening Agent", role: "fraud-detection", skills: ["pattern-detection", "anomaly-scoring", "siu-referral"] },
    ],
    handoffPattern: "sequential",
    riskTier: "HIGH",
  },
  {
    id: "retail-order-fulfillment",
    name: "Order Fulfillment Team",
    industry: "retail",
    description: "End-to-end order processing from validation through customer communication.",
    agents: [
      { name: "Order Validation Agent", role: "validation", skills: ["order-verification", "payment-validation", "inventory-check"] },
      { name: "Inventory Agent", role: "inventory", skills: ["stock-allocation", "warehouse-routing", "backorder-management"] },
      { name: "Fulfillment Agent", role: "fulfillment", skills: ["pick-pack", "shipping-optimization", "carrier-selection"] },
      { name: "Customer Notification Agent", role: "communication", skills: ["order-updates", "delivery-tracking", "satisfaction-survey"] },
    ],
    handoffPattern: "sequential",
    riskTier: "LOW",
  },
];

const DATA_FLOW_GOVERNANCE: DataFlowGovernance[] = [
  {
    industryId: "healthcare",
    rules: [
      { name: "PHI Minimization", description: "Each agent receives only the PHI it needs to perform its specific function", enforcement: "STRICT", regulation: "HIPAA Privacy Rule" },
      { name: "Minimum Necessary Standard", description: "Data shared between agents is limited to the minimum necessary for the intended purpose", enforcement: "STRICT", regulation: "HIPAA Privacy Rule" },
      { name: "De-identification Between Non-Clinical Agents", description: "PHI is de-identified when passed to agents that do not require clinical context", enforcement: "STRICT", regulation: "HIPAA Privacy Rule" },
      { name: "Audit Trail for All PHI Access", description: "Complete audit log maintained for every agent access to protected health information", enforcement: "STRICT", regulation: "HIPAA Privacy Rule" },
    ],
  },
  {
    industryId: "financial_services",
    rules: [
      { name: "Chinese Wall Enforcement", description: "Strict information barriers between advisory and trading agents to prevent conflicts of interest", enforcement: "STRICT", regulation: "SEC/FINRA" },
      { name: "Need-to-Know Data Compartmentalization", description: "Agent data access restricted to information required for assigned tasks only", enforcement: "STRICT", regulation: "SEC/FINRA" },
      { name: "MNPI Barriers", description: "Material non-public information barriers enforced across all agent communications", enforcement: "STRICT", regulation: "SEC/FINRA" },
      { name: "Client Data Segregation", description: "Complete segregation of client data between agents serving different clients", enforcement: "STRICT", regulation: "SEC/FINRA" },
    ],
  },
  {
    industryId: "manufacturing",
    rules: [
      { name: "OT/IT Data Boundary Enforcement", description: "Operational technology data separated from IT systems with controlled interfaces", enforcement: "MODERATE", regulation: "IEC 62443 / ITAR" },
      { name: "Safety-Critical Data Isolation", description: "Safety-critical data isolated from general analytics to prevent unauthorized access", enforcement: "MODERATE", regulation: "IEC 62443 / ITAR" },
      { name: "IP Protection for Process Parameters", description: "Intellectual property and proprietary process parameters encrypted and access-controlled", enforcement: "MODERATE", regulation: "IEC 62443 / ITAR" },
      { name: "Air-Gap Compliance for Classified Data", description: "Classified manufacturing data maintained in air-gapped environments with no external agent access", enforcement: "MODERATE", regulation: "IEC 62443 / ITAR" },
    ],
  },
  {
    industryId: "insurance",
    rules: [
      { name: "Claims Data Isolation from Underwriting", description: "Claims processing data strictly separated from underwriting decision agents", enforcement: "STRICT", regulation: "State Insurance Laws" },
      { name: "Anti-Fraud Data Segregation", description: "Fraud detection data and signals segregated from standard claims processing", enforcement: "STRICT", regulation: "State Insurance Laws" },
      { name: "Policyholder PII Minimization", description: "Policyholder personally identifiable information minimized across agent handoffs", enforcement: "STRICT", regulation: "State Insurance Laws" },
      { name: "Reinsurance Data Boundaries", description: "Reinsurance data boundaries enforced to prevent data leakage between cedant and reinsurer agents", enforcement: "STRICT", regulation: "State Insurance Laws" },
    ],
  },
  {
    industryId: "retail",
    rules: [
      { name: "PCI Data Scope Minimization", description: "Payment card data scope minimized across agent pipeline to reduce PCI compliance surface", enforcement: "MODERATE", regulation: "PCI DSS / CCPA" },
      { name: "Customer Behavioral Data Compartmentalization", description: "Customer behavioral and browsing data compartmentalized from transaction processing agents", enforcement: "MODERATE", regulation: "PCI DSS / CCPA" },
      { name: "Pricing Data Isolation", description: "Internal pricing and margin data isolated from customer-facing agents", enforcement: "MODERATE", regulation: "PCI DSS / CCPA" },
      { name: "Inventory Data Freshness Enforcement", description: "Inventory data freshness enforced with maximum staleness thresholds between agents", enforcement: "MODERATE", regulation: "PCI DSS / CCPA" },
    ],
  },
];

const A2A_FEDERATION_TRUST: A2AFederationTrust[] = [
  {
    industryId: "healthcare",
    trustTier: "VERIFIED",
    requirements: [
      { name: "Business Associate Agreement (BAA)", description: "Legally binding BAA required before any PHI data exchange with external agents", status: "required", documentType: "Legal Agreement" },
      { name: "HITRUST Certification", description: "HITRUST CSF certification preferred for external agent providers", status: "recommended", documentType: "Certification" },
      { name: "PHI Data Handling Attestation", description: "Formal attestation of PHI handling practices and safeguards", status: "required", documentType: "Attestation" },
      { name: "Breach Notification SLA (72h)", description: "72-hour breach notification SLA for any PHI exposure incidents", status: "required", documentType: "SLA" },
    ],
  },
  {
    industryId: "financial_services",
    trustTier: "CERTIFIED",
    requirements: [
      { name: "Data Processing Agreement", description: "Comprehensive data processing agreement covering all financial data types", status: "required", documentType: "Legal Agreement" },
      { name: "SOC 2 Type II Certification", description: "SOC 2 Type II audit report required for external agent infrastructure", status: "required", documentType: "Certification" },
      { name: "Regulatory Reporting Capability", description: "External agents must support regulatory reporting requirements", status: "recommended", documentType: "Technical Specification" },
      { name: "Financial Data Residency", description: "Financial data residency requirements for cross-border agent federation", status: "required", documentType: "Compliance Document" },
    ],
  },
  {
    industryId: "manufacturing",
    trustTier: "VERIFIED",
    requirements: [
      { name: "IP Protection Agreement", description: "Intellectual property protection agreement for manufacturing process data", status: "required", documentType: "Legal Agreement" },
      { name: "Export Control Compliance (ITAR/EAR)", description: "Compliance with ITAR and EAR export control regulations", status: "required", documentType: "Compliance Document" },
      { name: "On-Premise Deployment Option", description: "On-premise deployment option required for classified manufacturing work", status: "recommended", documentType: "Technical Specification" },
      { name: "Supply Chain Security Attestation", description: "Supply chain security attestation for hardware and software components", status: "optional", documentType: "Attestation" },
    ],
  },
  {
    industryId: "insurance",
    trustTier: "VERIFIED",
    requirements: [
      { name: "Data Processing Agreement", description: "Data processing agreement covering policyholder and claims data", status: "required", documentType: "Legal Agreement" },
      { name: "Actuarial Model Validation", description: "External actuarial models must be validated against industry standards", status: "recommended", documentType: "Validation Report" },
      { name: "Claims Data Handling Certification", description: "Certification for proper handling and storage of claims data", status: "required", documentType: "Certification" },
      { name: "State Regulatory Compliance Attestation", description: "Attestation of compliance with applicable state insurance regulations", status: "required", documentType: "Attestation" },
    ],
  },
  {
    industryId: "retail",
    trustTier: "STANDARD",
    requirements: [
      { name: "Data Processing Agreement", description: "Standard data processing agreement for customer and transaction data", status: "required", documentType: "Legal Agreement" },
      { name: "PCI Compliance Attestation", description: "PCI DSS compliance attestation for any payment data handling", status: "required", documentType: "Attestation" },
      { name: "CCPA/GDPR Data Handling Agreement", description: "Data handling agreement covering consumer privacy regulations", status: "recommended", documentType: "Legal Agreement" },
      { name: "API Rate Limiting SLA", description: "Service level agreement for API rate limiting and availability", status: "optional", documentType: "SLA" },
    ],
  },
];

const ROLE_CONFIG: Record<string, { label: string; icon: typeof Crown }> = {
  lead: { label: "Lead", icon: Crown },
  member: { label: "Member", icon: Users },
  observer: { label: "Observer", icon: Eye },
};

function EnforcementBadge({ level }: { level: "STRICT" | "MODERATE" | "ADVISORY" }) {
  const styles = {
    STRICT: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    MODERATE: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    ADVISORY: "",
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${styles[level]}`} data-testid={`badge-enforcement-${level.toLowerCase()}`}>
      {level}
    </Badge>
  );
}

function TrustTierBadge({ tier }: { tier: "CERTIFIED" | "VERIFIED" | "STANDARD" }) {
  const styles = {
    CERTIFIED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    VERIFIED: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    STANDARD: "",
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${styles[tier]}`} data-testid={`badge-trust-tier-${tier.toLowerCase()}`}>
      {tier}
    </Badge>
  );
}

function StatusDot({ status }: { status: "required" | "recommended" | "optional" }) {
  const colors = {
    required: "bg-red-500",
    recommended: "bg-amber-500",
    optional: "bg-emerald-500",
  };
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${colors[status]}`} />;
}

export default function AgentTeams() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showManage, setShowManage] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [addMemberId, setAddMemberId] = useState("");
  const [addMemberRole, setAddMemberRole] = useState("member");

  const { toast } = useToast();
  const { industry, isSelected } = useIndustry();

  const { data: agents, isLoading, error, refetch } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const teamAgents = agents?.filter(a => a.agentType === "team") || [];
  const nonTeamAgents = agents?.filter(a => a.agentType !== "team") || [];

  const { data: teamMembers, refetch: refetchMembers } = useQuery<AgentTeam[]>({
    queryKey: ["/api/agent-teams", showManage, "members"],
    queryFn: async () => {
      if (!showManage) return [];
      const res = await fetch(`/api/agent-teams/${showManage}/members`);
      return res.json();
    },
    enabled: !!showManage,
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; riskTier?: string }) => {
      return apiRequest("POST", "/api/agents", {
        name: data.name,
        description: data.description,
        agentType: "team",
        status: "active",
        riskTier: data.riskTier || "MEDIUM",
        autonomyMode: "assisted",
      });
    },
    onSuccess: () => {
      toast({ title: "Team created", description: "The agent team has been added to the registry." });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setShowCreate(false);
      setFormName("");
      setFormDescription("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create team", description: err.message, variant: "destructive" });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async (data: { teamAgentId: string; memberAgentId: string; role: string }) => {
      return apiRequest("POST", "/api/agent-teams/members", data);
    },
    onSuccess: () => {
      toast({ title: "Member added" });
      refetchMembers();
      setAddMemberId("");
      setAddMemberRole("member");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add member", description: err.message, variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/agent-teams/members/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Member removed" });
      refetchMembers();
    },
  });

  const filtered = teamAgents.filter(a => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const industryTemplates = isSelected && industry
    ? WORKFLOW_TEMPLATES.filter(t => t.industry === industry.id)
    : [];

  const industryGovernance = isSelected && industry
    ? DATA_FLOW_GOVERNANCE.find(g => g.industryId === industry.id)
    : null;

  const industryFederation = isSelected && industry
    ? A2A_FEDERATION_TRUST.find(f => f.industryId === industry.id)
    : null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message="Failed to load agents" onRetry={() => refetch()} />;

  const managedTeam = teamAgents.find(a => a.id === showManage);

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-agent-teams">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agent Registry</h1>
          <p className="text-sm text-muted-foreground">
            Agent teams for multi-agent orchestration
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-team">
          <Plus className="w-4 h-4 mr-1.5" /> Create Team
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Teams" value={teamAgents.length} icon={Users} variant="default" testId="stat-teams-total" />
        <StatCard title="Single Agents" value={agents?.filter(a => a.agentType === "single")?.length || 0} icon={Bot} variant="default" testId="stat-single" />
        <StatCard title="Remote (A2A)" value={agents?.filter(a => a.agentType === "remote")?.length || 0} icon={Globe} variant="default" testId="stat-remote" />
        <StatCard title="All Agents" value={agents?.length || 0} icon={Bot} variant="default" testId="stat-all" />
      </div>

      <div className="flex items-center gap-1 border-b" data-testid="registry-tabs">
        <Link href="/agents">
          <Button variant="ghost" size="sm" className="rounded-none border-b-2 border-transparent text-muted-foreground" data-testid="tab-agents">
            <Bot className="w-3.5 h-3.5 mr-1.5" /> All Agents
          </Button>
        </Link>
        <Link href="/agents/teams">
          <Button variant="ghost" size="sm" className="rounded-none border-b-2 border-primary" data-testid="tab-teams">
            <Users className="w-3.5 h-3.5 mr-1.5" /> Teams
          </Button>
        </Link>
        <Link href="/agents/remote">
          <Button variant="ghost" size="sm" className="rounded-none border-b-2 border-transparent text-muted-foreground" data-testid="tab-remote">
            <Globe className="w-3.5 h-3.5 mr-1.5" /> Remote Agents (A2A)
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-teams"
          />
        </div>
      </div>

      {isSelected && industry && industryTemplates.length > 0 && (
        <div className="flex flex-col gap-4 overflow-x-hidden" data-testid="section-workflow-templates">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Workflow className="w-5 h-5" style={{ color: industry.color }} />
              <h2 className="text-lg font-semibold tracking-tight" data-testid="heading-workflow-templates">Industry Workflow Templates</h2>
            </div>
            <p className="text-sm text-muted-foreground">{industry.label}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {industryTemplates.map((template) => (
              <Card key={template.id} data-testid={`card-workflow-template-${template.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{template.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <Badge variant="outline" className="text-[10px]" data-testid={`badge-handoff-${template.id}`}>
                      <GitBranch className="w-3 h-3 mr-0.5" />
                      {template.handoffPattern}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]" data-testid={`badge-risk-${template.id}`}>
                      {template.riskTier}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center gap-1 flex-wrap" data-testid={`pipeline-${template.id}`}>
                    {template.agents.map((agent, idx) => (
                      <div key={agent.name} className="flex items-center gap-1">
                        <Badge
                          variant="outline"
                          className="text-[10px] whitespace-nowrap"
                          style={{ borderColor: `${industry.color}40`, color: industry.color }}
                        >
                          {agent.name}
                        </Badge>
                        {idx < template.agents.length - 1 && (
                          <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => createTeamMutation.mutate({ name: template.name, description: template.description, riskTier: template.riskTier })}
                    disabled={createTeamMutation.isPending}
                    data-testid={`button-deploy-template-${template.id}`}
                  >
                    <ChevronRight className="w-3.5 h-3.5 mr-1" />
                    Deploy Team
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {isSelected && industry && industryGovernance && (
        <div className="flex flex-col gap-4 overflow-x-hidden" data-testid="section-data-flow-governance">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" style={{ color: industry.color }} />
              <h2 className="text-lg font-semibold tracking-tight" data-testid="heading-data-flow-governance">Inter-Agent Data Flow Governance</h2>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-governance-subtitle">Rules governing data passed between agents in {industry.label} teams</p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {industryGovernance.rules.map((rule, idx) => (
              <Card key={idx} data-testid={`card-governance-rule-${idx}`}>
                <CardContent className="flex items-start justify-between gap-4 p-4">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium" data-testid={`text-rule-name-${idx}`}>{rule.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground" data-testid={`text-rule-description-${idx}`}>{rule.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <EnforcementBadge level={rule.enforcement} />
                    <Badge variant="outline" className="text-[10px]" data-testid={`badge-regulation-${idx}`}>
                      {rule.regulation}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {isSelected && industry && industryFederation && (
        <div className="flex flex-col gap-4 overflow-x-hidden" data-testid="section-a2a-federation-trust">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5" style={{ color: industry.color }} />
              <h2 className="text-lg font-semibold tracking-tight" data-testid="heading-a2a-federation">A2A Federation Trust Requirements</h2>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-federation-subtitle">Trust requirements for federating with external agents in {industry.label}</p>
          </div>
          <Card data-testid="card-federation-trust">
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <CardTitle className="text-base">Trust Tier</CardTitle>
              <TrustTierBadge tier={industryFederation.trustTier} />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {industryFederation.requirements.map((req, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-md border" data-testid={`requirement-${idx}`}>
                  <StatusDot status={req.status} />
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" data-testid={`text-req-name-${idx}`}>{req.name}</span>
                      <Badge variant="outline" className="text-[10px]" data-testid={`badge-status-${idx}`}>
                        {req.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]" data-testid={`badge-doctype-${idx}`}>
                        <FileCheck className="w-3 h-3 mr-0.5" />
                        {req.documentType}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{req.description}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Manage</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((team) => (
                <TableRow key={team.id} data-testid={`row-team-${team.id}`}>
                  <TableCell>
                    <Link href={`/agents/${team.id}`}>
                      <div className="flex items-center gap-2.5 cursor-pointer" data-testid={`link-team-${team.id}`}>
                        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-500/10 shrink-0">
                          <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium hover:underline">{team.name}</span>
                          <span className="text-[11px] text-muted-foreground">{team.description?.substring(0, 50) || "No description"}</span>
                        </div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                      {team.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[11px]">v{team.currentVersion}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{team.riskTier}</span>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => setShowManage(team.id)} data-testid={`button-manage-team-${team.id}`}>
                      <UserPlus className="w-3.5 h-3.5 mr-1" /> Members
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Link href={`/agents/${team.id}`}>
                      <Button variant="ghost" size="icon" data-testid={`button-view-team-${team.id}`}>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Users className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No teams created yet</p>
              <Button variant="outline" size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-team-empty">
                <Plus className="w-3.5 h-3.5 mr-1" /> Create your first team
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-create-team">Create Agent Team</DialogTitle>
            <DialogDescription>
              Create a team agent that orchestrates multiple member agents for multi-agent workflows.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Team Name *</Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Customer Service Team"
                data-testid="input-team-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="What does this team do?"
                className="resize-none"
                data-testid="input-team-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} data-testid="button-cancel-create-team">Cancel</Button>
            <Button
              onClick={() => {
                if (!formName.trim()) {
                  toast({ title: "Name required", variant: "destructive" });
                  return;
                }
                createTeamMutation.mutate({ name: formName, description: formDescription });
              }}
              disabled={createTeamMutation.isPending}
              data-testid="button-confirm-create-team"
            >
              {createTeamMutation.isPending ? "Creating..." : "Create Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showManage !== null} onOpenChange={(open) => { if (!open) setShowManage(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-manage-members">
              Manage Members: {managedTeam?.name}
            </DialogTitle>
            <DialogDescription>
              Add or remove agents from this team and assign roles.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Current Members</Label>
              {(!teamMembers || teamMembers.length === 0) && (
                <span className="text-sm text-muted-foreground">No members yet</span>
              )}
              {teamMembers?.map(m => {
                const memberAgent = agents?.find(a => a.id === m.memberAgentId);
                const roleConf = ROLE_CONFIG[m.role || "member"];
                const RoleIcon = roleConf?.icon || Users;
                return (
                  <div key={m.id} className="flex items-center justify-between gap-2 p-2 rounded-md border" data-testid={`member-${m.id}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 shrink-0">
                        {memberAgent?.agentType === "remote" ? <Globe className="w-3 h-3 text-primary" /> : <Bot className="w-3 h-3 text-primary" />}
                      </div>
                      <span className="text-sm">{memberAgent?.name || m.memberAgentId}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        <RoleIcon className="w-2.5 h-2.5 mr-0.5" />
                        {roleConf?.label || m.role}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMemberMutation.mutate(m.id)}
                      disabled={removeMemberMutation.isPending}
                      data-testid={`button-remove-member-${m.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="border-t pt-3 flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Add Member</Label>
              <div className="flex items-center gap-2">
                <Select value={addMemberId} onValueChange={setAddMemberId}>
                  <SelectTrigger className="flex-1" data-testid="select-add-member">
                    <SelectValue placeholder="Select agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {nonTeamAgents
                      .filter(a => !teamMembers?.some(m => m.memberAgentId === a.id))
                      .map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.agentType === "remote" ? "[A2A] " : ""}{a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select value={addMemberRole} onValueChange={setAddMemberRole}>
                  <SelectTrigger className="w-[110px]" data-testid="select-member-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="observer">Observer</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!addMemberId || !showManage) return;
                    addMemberMutation.mutate({
                      teamAgentId: showManage,
                      memberAgentId: addMemberId,
                      role: addMemberRole,
                    });
                  }}
                  disabled={!addMemberId || addMemberMutation.isPending}
                  data-testid="button-add-member"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1" /> Add
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManage(null)} data-testid="button-close-manage">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
