import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useIndustry } from "@/components/industry-provider";
import {
  Brain, Clock, Zap, Shield, Wand2, Loader2, Plus, Search, Eye,
  Trash2, Archive, AlertTriangle, Lock, FileText, Database, Server, RefreshCw,
} from "lucide-react";

type TierConfig = {
  tier: string;
  icon: string;
  color: string;
  description: string;
  capacity: number;
  capacityUnit: string;
  retention: string;
  retentionDays: number | null;
  compression: string;
  governance: string;
  usedPercent: number;
};

type IndustryRule = {
  id: string;
  name: string;
  description: string;
  tier: string;
  regulation: string;
  retentionDays: number;
  encrypted: boolean;
  accessControl: string;
  autoActions: string[];
};

type ForgettingPolicy = {
  id: string;
  name: string;
  triggerType: string;
  description: string;
  triggerConditions: string;
  action: string;
  timeline: string;
  active: boolean;
};

type MemoryEntry = {
  id: string;
  content: string;
  timestamp: string;
  accessCount: number;
  sensitivity: string;
  tier: string;
};

type MemoryProfile = {
  id: string;
  name: string;
  industry: string;
  agentId: string | null;
  tierConfigs: TierConfig[];
  industryRules: IndustryRule[];
  forgettingPolicies: ForgettingPolicy[];
  status: string;
  createdAt: string;
};

const DEFAULT_TIER_CONFIGS: TierConfig[] = [
  {
    tier: "Working Memory",
    icon: "zap",
    color: "blue",
    description: "Current session state, cleared on session end",
    capacity: 32000,
    capacityUnit: "tokens",
    retention: "Session only",
    retentionDays: null,
    compression: "None (real-time)",
    governance: "Auto-clear on disconnect",
    usedPercent: 45,
  },
  {
    tier: "Episodic Memory",
    icon: "clock",
    color: "amber",
    description: "Summaries of past interactions, retained per policy",
    capacity: 256000,
    capacityUnit: "tokens",
    retention: "Policy-based",
    retentionDays: 90,
    compression: "Summarization after 24h",
    governance: "Encrypted at rest, access-logged",
    usedPercent: 62,
  },
  {
    tier: "Semantic Memory",
    icon: "brain",
    color: "purple",
    description: "Domain knowledge synthesized from experience",
    capacity: 1000000,
    capacityUnit: "tokens",
    retention: "Indefinite (knowledge graph)",
    retentionDays: null,
    compression: "Entity extraction + dedup",
    governance: "Versioned, audit trail",
    usedPercent: 28,
  },
];

const INDUSTRY_RULES_MAP: Record<string, IndustryRule[]> = {
  healthcare: [
    {
      id: "hc-1", name: "PHI Encryption in Episodic Memory",
      description: "All Protected Health Information must be encrypted when stored in episodic memory tier",
      tier: "Episodic Memory", regulation: "HIPAA", retentionDays: 2190,
      encrypted: true, accessControl: "Role-based with audit",
      autoActions: ["encrypt-at-rest", "log-access", "mask-on-export"],
    },
    {
      id: "hc-2", name: "6-Year HIPAA Retention",
      description: "Medical records and related data must be retained for minimum 6 years per HIPAA requirements",
      tier: "Semantic Memory", regulation: "HIPAA", retentionDays: 2190,
      encrypted: true, accessControl: "Minimum necessary",
      autoActions: ["retention-lock", "archive-after-period"],
    },
    {
      id: "hc-3", name: "Minimum-Necessary Access",
      description: "Memory retrieval must follow minimum-necessary principle for PHI access",
      tier: "All Tiers", regulation: "HIPAA", retentionDays: 2190,
      encrypted: false, accessControl: "Minimum necessary",
      autoActions: ["access-filter", "scope-limit", "need-to-know-check"],
    },
  ],
  financial_services: [
    {
      id: "fs-1", name: "PCI-DSS Scope for Card Data",
      description: "Card holder data in memory must be handled within PCI-DSS scope with tokenization",
      tier: "Working Memory", regulation: "PCI-DSS", retentionDays: 0,
      encrypted: true, accessControl: "Restricted",
      autoActions: ["tokenize", "mask-pan", "session-purge"],
    },
    {
      id: "fs-2", name: "5-Year BSA/AML Retention",
      description: "Transaction records and suspicious activity reports must be retained for 5 years",
      tier: "Semantic Memory", regulation: "BSA/AML", retentionDays: 1825,
      encrypted: true, accessControl: "Compliance-only",
      autoActions: ["retention-lock", "immutable-store"],
    },
    {
      id: "fs-3", name: "Legal Hold Capability",
      description: "Memory systems must support legal hold to prevent deletion during investigations",
      tier: "All Tiers", regulation: "SOX", retentionDays: 2555,
      encrypted: false, accessControl: "Legal team",
      autoActions: ["hold-flag", "prevent-deletion", "notify-legal"],
    },
  ],
  insurance: [
    {
      id: "ins-1", name: "Claims Data Retention",
      description: "Claims data must be retained per state-specific regulations, varying by jurisdiction",
      tier: "Episodic Memory", regulation: "State Regulations", retentionDays: 2190,
      encrypted: true, accessControl: "Claims team",
      autoActions: ["jurisdiction-check", "variable-retention"],
    },
    {
      id: "ins-2", name: "ACORD Data Classification",
      description: "All memory entries must be classified according to ACORD standards for data interoperability",
      tier: "Semantic Memory", regulation: "ACORD", retentionDays: 1825,
      encrypted: false, accessControl: "Standard",
      autoActions: ["auto-classify", "tag-acord-type"],
    },
    {
      id: "ins-3", name: "Policyholder PII Encryption",
      description: "Policyholder personally identifiable information must be encrypted across all memory tiers",
      tier: "All Tiers", regulation: "NAIC Model Laws", retentionDays: 2555,
      encrypted: true, accessControl: "Role-based",
      autoActions: ["encrypt-pii", "access-log", "consent-check"],
    },
  ],
  manufacturing: [
    {
      id: "mfg-1", name: "OT/IT Data Segregation",
      description: "Operational technology data must be segregated from IT data in memory architecture",
      tier: "Working Memory", regulation: "IEC 62443", retentionDays: 365,
      encrypted: false, accessControl: "Network-segmented",
      autoActions: ["segment-ot-data", "firewall-check"],
    },
    {
      id: "mfg-2", name: "ISO 9001 Traceability",
      description: "Quality decisions stored in memory must maintain full traceability per ISO 9001",
      tier: "Semantic Memory", regulation: "ISO 9001", retentionDays: 1825,
      encrypted: false, accessControl: "Quality team",
      autoActions: ["trace-link", "version-control", "audit-trail"],
    },
    {
      id: "mfg-3", name: "Equipment Data Safety Retention",
      description: "Equipment operational data must be retained for safety compliance and incident investigation",
      tier: "Episodic Memory", regulation: "OSHA", retentionDays: 1825,
      encrypted: false, accessControl: "Safety officer",
      autoActions: ["safety-tag", "incident-link"],
    },
  ],
  retail: [
    {
      id: "ret-1", name: "PCI Payment Data Compliance",
      description: "Payment card data in agent memory must comply with PCI-DSS requirements",
      tier: "Working Memory", regulation: "PCI-DSS", retentionDays: 0,
      encrypted: true, accessControl: "Restricted",
      autoActions: ["tokenize", "session-purge", "mask-data"],
    },
    {
      id: "ret-2", name: "Customer PII Retention Limits",
      description: "Customer personally identifiable information must be purged after retention period",
      tier: "Episodic Memory", regulation: "CCPA/GDPR", retentionDays: 730,
      encrypted: true, accessControl: "Customer service",
      autoActions: ["auto-purge", "consent-verify", "anonymize"],
    },
    {
      id: "ret-3", name: "Cookie Consent Tracking",
      description: "Agent memory must respect and track cookie consent preferences for data usage",
      tier: "Working Memory", regulation: "ePrivacy", retentionDays: 365,
      encrypted: false, accessControl: "Standard",
      autoActions: ["consent-check", "preference-sync"],
    },
  ],
};

const DEFAULT_FORGETTING_POLICIES: ForgettingPolicy[] = [
  {
    id: "fp-1",
    name: "GDPR Right to Erasure",
    triggerType: "GDPR Erasure",
    description: "Erase all personal data when a data subject exercises their right to erasure under GDPR Article 17",
    triggerConditions: "Data subject submits erasure request through designated channel",
    action: "Delete",
    timeline: "Within 72 hours",
    active: true,
  },
  {
    id: "fp-2",
    name: "Data Retention Expiry",
    triggerType: "Retention Expiry",
    description: "Automatically purge memories that have exceeded their configured retention period",
    triggerConditions: "Memory entry timestamp exceeds tier retention policy duration",
    action: "Archive",
    timeline: "Within 24 hours of expiry",
    active: true,
  },
  {
    id: "fp-3",
    name: "Competitive Information Quarantine",
    triggerType: "Competitive Quarantine",
    description: "Quarantine any competitor client data to prevent cross-contamination between accounts",
    triggerConditions: "Agent switches between competing client contexts",
    action: "Quarantine",
    timeline: "Within 24 hours",
    active: true,
  },
  {
    id: "fp-4",
    name: "Stale Memory Cleanup",
    triggerType: "Manual Purge",
    description: "Archive memories that have not been accessed for an extended period to reduce noise",
    triggerConditions: "Memory entry has zero access count for 90+ consecutive days",
    action: "Archive",
    timeline: "After 90 days",
    active: false,
  },
];

const INDUSTRY_AGENTS: Record<string, string[]> = {
  healthcare: ["Clinical Decision Agent", "Patient Intake Agent", "Lab Results Processor", "Medication Review Agent"],
  financial_services: ["Trading Compliance Agent", "KYC Verification Agent", "Risk Assessment Agent", "Portfolio Advisor"],
  insurance: ["Claims Processor", "Underwriting Agent", "Customer Service Agent", "Fraud Detection Agent"],
  manufacturing: ["Quality Inspector Agent", "Supply Chain Monitor", "Maintenance Scheduler", "Production Optimizer"],
  retail: ["Product Recommender", "Order Fulfillment Agent", "Customer Support Agent", "Inventory Manager"],
};

function getMockMemoryEntries(industry: string, agentName: string): Record<string, MemoryEntry[]> {
  const now = new Date();
  return {
    "Working Memory": [
      {
        id: "wm-1", tier: "Working Memory",
        content: `Active session with ${agentName}: Processing current request with ${industry} context loaded. Session token budget: 28,400/32,000 used.`,
        timestamp: now.toISOString(), accessCount: 12, sensitivity: "Internal",
      },
      {
        id: "wm-2", tier: "Working Memory",
        content: `Current task: Analyzing incoming data against ${industry} compliance rules. Step 3 of 5 in workflow.`,
        timestamp: new Date(now.getTime() - 60000).toISOString(), accessCount: 8, sensitivity: "Confidential",
      },
      {
        id: "wm-3", tier: "Working Memory",
        content: "Tool call queue: 2 pending API calls, 1 database lookup scheduled. Priority: high.",
        timestamp: new Date(now.getTime() - 120000).toISOString(), accessCount: 3, sensitivity: "Internal",
      },
    ],
    "Episodic Memory": [
      {
        id: "em-1", tier: "Episodic Memory",
        content: `Session summary [${new Date(now.getTime() - 86400000).toLocaleDateString()}]: Processed 14 requests. Key topics: compliance review, data classification, risk assessment. Escalations: 2.`,
        timestamp: new Date(now.getTime() - 86400000).toISOString(), accessCount: 34, sensitivity: "Confidential",
      },
      {
        id: "em-2", tier: "Episodic Memory",
        content: `Session summary [${new Date(now.getTime() - 172800000).toLocaleDateString()}]: Handled regulatory inquiry. Referenced 3 policy documents. Resolution: approved with conditions.`,
        timestamp: new Date(now.getTime() - 172800000).toISOString(), accessCount: 18, sensitivity: "Restricted",
      },
      {
        id: "em-3", tier: "Episodic Memory",
        content: `Session summary [${new Date(now.getTime() - 259200000).toLocaleDateString()}]: Training data integration completed. Updated domain knowledge with 45 new entries.`,
        timestamp: new Date(now.getTime() - 259200000).toISOString(), accessCount: 7, sensitivity: "Internal",
      },
      {
        id: "em-4", tier: "Episodic Memory",
        content: `Session summary [${new Date(now.getTime() - 604800000).toLocaleDateString()}]: Quarterly review preparation. Aggregated performance metrics across 230 interactions.`,
        timestamp: new Date(now.getTime() - 604800000).toISOString(), accessCount: 52, sensitivity: "Internal",
      },
    ],
    "Semantic Memory": [
      {
        id: "sm-1", tier: "Semantic Memory",
        content: `${industry} regulatory framework: Core compliance requirements, enforcement patterns, and penalty structures synthesized from 180+ regulatory documents.`,
        timestamp: new Date(now.getTime() - 2592000000).toISOString(), accessCount: 245, sensitivity: "Internal",
      },
      {
        id: "sm-2", tier: "Semantic Memory",
        content: "Risk classification taxonomy: 4-tier risk model with 23 sub-categories. Updated based on 1,200+ historical decisions.",
        timestamp: new Date(now.getTime() - 5184000000).toISOString(), accessCount: 412, sensitivity: "Public",
      },
      {
        id: "sm-3", tier: "Semantic Memory",
        content: "Entity relationship graph: 340 domain entities with 890 relationships. Key entity types: organizations, products, regulations, processes.",
        timestamp: new Date(now.getTime() - 7776000000).toISOString(), accessCount: 178, sensitivity: "Internal",
      },
      {
        id: "sm-4", tier: "Semantic Memory",
        content: `${industry} best practices knowledge base: 56 documented procedures, 23 decision trees, 12 escalation protocols compiled from expert reviews.`,
        timestamp: new Date(now.getTime() - 10368000000).toISOString(), accessCount: 89, sensitivity: "Confidential",
      },
      {
        id: "sm-5", tier: "Semantic Memory",
        content: "Historical outcome patterns: Statistical models derived from 5,000+ past decisions. Accuracy validation: 94.2% on holdout set.",
        timestamp: new Date(now.getTime() - 15552000000).toISOString(), accessCount: 567, sensitivity: "Internal",
      },
    ],
  };
}

const TIER_ICONS: Record<string, typeof Brain> = {
  "Working Memory": Zap,
  "Episodic Memory": Clock,
  "Semantic Memory": Brain,
};

const TIER_COLORS: Record<string, string> = {
  "Working Memory": "text-blue-500",
  "Episodic Memory": "text-amber-500",
  "Semantic Memory": "text-purple-500",
};

const TIER_BG_COLORS: Record<string, string> = {
  "Working Memory": "bg-blue-500/10",
  "Episodic Memory": "bg-amber-500/10",
  "Semantic Memory": "bg-purple-500/10",
};

const TIER_PROGRESS_COLORS: Record<string, string> = {
  "Working Memory": "[&>div]:bg-blue-500",
  "Episodic Memory": "[&>div]:bg-amber-500",
  "Semantic Memory": "[&>div]:bg-purple-500",
};

const ACTION_ICONS: Record<string, typeof Trash2> = {
  Delete: Trash2,
  Archive: Archive,
  Anonymize: Lock,
  Quarantine: AlertTriangle,
};

const SENSITIVITY_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  Public: "outline",
  Internal: "secondary",
  Confidential: "default",
  Restricted: "destructive",
};

function formatCapacity(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(tokens % 1000000 === 0 ? 0 : 1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(tokens % 1000 === 0 ? 0 : 1)}K`;
  return String(tokens);
}

export default function MemoryArchitecture() {
  const [activeTab, setActiveTab] = useState("memory-tiers");
  const [tierConfigs, setTierConfigs] = useState<TierConfig[]>(DEFAULT_TIER_CONFIGS);
  const [forgettingPolicies, setForgettingPolicies] = useState<ForgettingPolicy[]>(DEFAULT_FORGETTING_POLICIES);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [addPolicyOpen, setAddPolicyOpen] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState("");
  const [newPolicyTrigger, setNewPolicyTrigger] = useState("Retention Expiry");
  const [newPolicyDesc, setNewPolicyDesc] = useState("");
  const [newPolicyConditions, setNewPolicyConditions] = useState("");
  const [newPolicyAction, setNewPolicyAction] = useState("Archive");
  const [newPolicyTimeline, setNewPolicyTimeline] = useState("After 30 days");
  const [aiGeneratedRules, setAiGeneratedRules] = useState<IndustryRule[]>([]);
  const { toast } = useToast();
  const { industry: currentIndustry } = useIndustry();

  const industryId = currentIndustry?.id || "insurance";

  const { data: profiles = [], isLoading } = useQuery<MemoryProfile[]>({
    queryKey: ["/api/memory-profiles"],
  });

  const createProfileMutation = useMutation({
    mutationFn: async (data: Partial<MemoryProfile>) => {
      const res = await apiRequest("POST", "/api/memory-profiles", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memory-profiles"] });
      toast({ title: "Memory profile created" });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<MemoryProfile> }) => {
      await apiRequest("PATCH", `/api/memory-profiles/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memory-profiles"] });
    },
  });

  const generateRulesMutation = useMutation({
    mutationFn: async (body: { industry: string; tier?: string }) => {
      const res = await apiRequest("POST", "/api/ai/suggest-memory-rules", body);
      return res.json();
    },
    onSuccess: (data) => {
      const rules = Array.isArray(data) ? data : data.rules || data.suggestions || [];
      const mapped: IndustryRule[] = rules.map((r: Record<string, unknown>, i: number) => ({
        id: `ai-${Date.now()}-${i}`,
        name: (r.name as string) || `AI Rule ${i + 1}`,
        description: (r.description as string) || "",
        tier: (r.tier as string) || "All Tiers",
        regulation: (r.regulation as string) || "AI Suggested",
        retentionDays: (r.retentionDays as number) || 365,
        encrypted: (r.encrypted as boolean) || false,
        accessControl: (r.accessControl as string) || "Standard",
        autoActions: (r.autoActions as string[]) || [],
      }));
      setAiGeneratedRules(mapped);
      toast({ title: "AI rules generated", description: `${mapped.length} rules suggested for ${industryId}` });
    },
    onError: () => {
      toast({ title: "Generation failed", description: "Could not generate AI rules. Try again later.", variant: "destructive" });
    },
  });

  const industryRules = useMemo(() => {
    return INDUSTRY_RULES_MAP[industryId] || INDUSTRY_RULES_MAP.insurance;
  }, [industryId]);

  const agentOptions = useMemo(() => {
    return INDUSTRY_AGENTS[industryId] || INDUSTRY_AGENTS.insurance;
  }, [industryId]);

  const memoryEntries = useMemo(() => {
    const agent = selectedAgent || agentOptions[0] || "Agent";
    return getMockMemoryEntries(currentIndustry?.label || "Insurance", agent);
  }, [selectedAgent, agentOptions, currentIndustry]);

  function updateTierCapacity(index: number, value: string) {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) return;
    setTierConfigs((prev) => prev.map((t, i) => i === index ? { ...t, capacity: num } : t));
  }

  function updateTierRetention(index: number, value: string) {
    const num = parseInt(value, 10);
    setTierConfigs((prev) => prev.map((t, i) => i === index ? { ...t, retentionDays: isNaN(num) ? null : num } : t));
  }

  function togglePolicyActive(policyId: string) {
    setForgettingPolicies((prev) =>
      prev.map((p) => p.id === policyId ? { ...p, active: !p.active } : p)
    );
  }

  function removePolicy(policyId: string) {
    setForgettingPolicies((prev) => prev.filter((p) => p.id !== policyId));
    toast({ title: "Policy removed" });
  }

  function addPolicy() {
    if (!newPolicyName.trim()) return;
    const policy: ForgettingPolicy = {
      id: `fp-${Date.now()}`,
      name: newPolicyName,
      triggerType: newPolicyTrigger,
      description: newPolicyDesc,
      triggerConditions: newPolicyConditions,
      action: newPolicyAction,
      timeline: newPolicyTimeline,
      active: true,
    };
    setForgettingPolicies((prev) => [...prev, policy]);
    setAddPolicyOpen(false);
    setNewPolicyName("");
    setNewPolicyDesc("");
    setNewPolicyConditions("");
    setNewPolicyTimeline("After 30 days");
    toast({ title: "Policy added" });
  }

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-memory-architecture">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-purple-500/10 shrink-0">
            <Brain className="w-4 h-4 text-purple-500" />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
                Memory Architecture Manager
              </h1>
              <Badge variant="outline" className="text-[10px]">NEW</Badge>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
              Configure how agents remember, retain, and forget information across memory tiers
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" data-testid="badge-industry">
            {currentIndustry?.label || "No Industry"}
          </Badge>
          <Badge variant="outline" data-testid="badge-ontology">
            {currentIndustry?.ontology || "N/A"}
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
        <TabsList className="h-auto gap-1 flex-wrap">
          <TabsTrigger value="memory-tiers" data-testid="tab-memory-tiers" className="gap-1.5">
            <Database className="w-3.5 h-3.5" />
            Memory Tiers
          </TabsTrigger>
          <TabsTrigger value="industry-rules" data-testid="tab-industry-rules" className="gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Industry Rules
          </TabsTrigger>
          <TabsTrigger value="inspection-console" data-testid="tab-inspection-console" className="gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Inspection Console
          </TabsTrigger>
          <TabsTrigger value="forgetting-policies" data-testid="tab-forgetting-policies" className="gap-1.5">
            <Trash2 className="w-3.5 h-3.5" />
            Forgetting Policies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="memory-tiers" className="mt-0">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-lg font-medium" data-testid="text-tiers-heading">Three-Tier Memory Architecture</h2>
              <Button
                variant="ghost"
                onClick={() => setTierConfigs(DEFAULT_TIER_CONFIGS)}
                data-testid="button-reset-tiers"
              >
                <RefreshCw className="w-4 h-4 mr-1.5" />
                Reset Defaults
              </Button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {tierConfigs.map((tier, idx) => {
                const Icon = TIER_ICONS[tier.tier] || Database;
                const colorClass = TIER_COLORS[tier.tier];
                const bgClass = TIER_BG_COLORS[tier.tier];
                const progressClass = TIER_PROGRESS_COLORS[tier.tier];
                return (
                  <Card key={tier.tier} data-testid={`card-tier-${idx}`}>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-md ${bgClass} shrink-0`}>
                          <Icon className={`w-4 h-4 ${colorClass}`} />
                        </div>
                        <CardTitle className="text-base">{tier.tier}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <p className="text-sm text-muted-foreground" data-testid={`text-tier-desc-${idx}`}>
                        {tier.description}
                      </p>

                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Capacity</span>
                          <span className="text-xs font-medium" data-testid={`text-tier-capacity-${idx}`}>
                            {formatCapacity(tier.capacity)} tokens
                          </span>
                        </div>
                        <Progress
                          value={tier.usedPercent}
                          className={`h-2 ${progressClass}`}
                          data-testid={`progress-tier-${idx}`}
                        />
                        <span className="text-xs text-muted-foreground">{tier.usedPercent}% utilized</span>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium">Capacity (tokens)</label>
                        <Input
                          type="number"
                          value={tier.capacity}
                          onChange={(e) => updateTierCapacity(idx, e.target.value)}
                          data-testid={`input-tier-capacity-${idx}`}
                        />
                      </div>

                      {tier.retentionDays !== null ? (
                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-medium">Retention (days)</label>
                          <Input
                            type="number"
                            value={tier.retentionDays ?? ""}
                            onChange={(e) => updateTierRetention(idx, e.target.value)}
                            data-testid={`input-tier-retention-${idx}`}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium">Retention</span>
                          <span className="text-sm text-muted-foreground" data-testid={`text-tier-retention-${idx}`}>
                            {tier.retention}
                          </span>
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium">Compression</span>
                        <Badge variant="secondary" data-testid={`badge-tier-compression-${idx}`}>
                          {tier.compression}
                        </Badge>
                      </div>

                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium">Governance</span>
                        <Badge variant="outline" data-testid={`badge-tier-governance-${idx}`}>
                          <Shield className="w-3 h-3 mr-1" />
                          {tier.governance}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="industry-rules" className="mt-0">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-lg font-medium" data-testid="text-rules-heading">
                  Industry Memory Rules
                </h2>
                <p className="text-sm text-muted-foreground">
                  Pre-configured governance rules for {currentIndustry?.label || "your industry"}
                </p>
              </div>
              <Button
                onClick={() => generateRulesMutation.mutate({ industry: industryId })}
                disabled={generateRulesMutation.isPending}
                data-testid="button-generate-rules"
              >
                {generateRulesMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-1.5" />
                )}
                Generate AI Rules
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              {industryRules.map((rule) => (
                <Card key={rule.id} className="hover-elevate" data-testid={`card-rule-${rule.id}`}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium" data-testid={`text-rule-name-${rule.id}`}>{rule.name}</h3>
                        <Badge variant="secondary" data-testid={`badge-rule-tier-${rule.id}`}>{rule.tier}</Badge>
                        <Badge variant="outline" data-testid={`badge-rule-regulation-${rule.id}`}>{rule.regulation}</Badge>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {rule.encrypted && (
                          <Shield className="w-4 h-4 text-green-500" data-testid={`icon-rule-encrypted-${rule.id}`} />
                        )}
                        <Badge variant="secondary" data-testid={`badge-rule-retention-${rule.id}`}>
                          {rule.retentionDays > 0 ? `${rule.retentionDays} days` : "Session only"}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground" data-testid={`text-rule-desc-${rule.id}`}>
                      {rule.description}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" data-testid={`badge-rule-access-${rule.id}`}>
                        <Lock className="w-3 h-3 mr-1" />
                        {rule.accessControl}
                      </Badge>
                      {rule.autoActions.map((action) => (
                        <Badge key={action} variant="secondary" className="text-xs" data-testid={`badge-rule-action-${rule.id}-${action}`}>
                          {action}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {aiGeneratedRules.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-base font-medium" data-testid="text-ai-rules-heading">AI-Generated Rules</h3>
                </div>
                {aiGeneratedRules.map((rule) => (
                  <Card key={rule.id} className="hover-elevate" data-testid={`card-ai-rule-${rule.id}`}>
                    <CardContent className="p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium" data-testid={`text-ai-rule-name-${rule.id}`}>{rule.name}</h3>
                          <Badge variant="secondary">{rule.tier}</Badge>
                          <Badge variant="outline">{rule.regulation}</Badge>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {rule.encrypted && <Shield className="w-4 h-4 text-green-500" />}
                          <Badge variant="secondary">
                            {rule.retentionDays > 0 ? `${rule.retentionDays} days` : "Session only"}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{rule.description}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">
                          <Lock className="w-3 h-3 mr-1" />
                          {rule.accessControl}
                        </Badge>
                        {rule.autoActions.map((action) => (
                          <Badge key={action} variant="secondary" className="text-xs">{action}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="inspection-console" className="mt-0">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-lg font-medium" data-testid="text-inspection-heading">Memory Inspection Console</h2>
              <Select
                value={selectedAgent || agentOptions[0]}
                onValueChange={setSelectedAgent}
              >
                <SelectTrigger className="w-[240px]" data-testid="select-agent">
                  <SelectValue placeholder="Select agent..." />
                </SelectTrigger>
                <SelectContent>
                  {agentOptions.map((agent) => (
                    <SelectItem key={agent} value={agent}>{agent}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-4">
              {(["Working Memory", "Episodic Memory", "Semantic Memory"] as const).map((tierName) => {
                const entries = memoryEntries[tierName] || [];
                const Icon = TIER_ICONS[tierName];
                const colorClass = TIER_COLORS[tierName];
                const bgClass = TIER_BG_COLORS[tierName];
                return (
                  <Card key={tierName} data-testid={`card-inspection-${tierName.toLowerCase().replace(" ", "-")}`}>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className={`flex items-center justify-center w-7 h-7 rounded-md ${bgClass} shrink-0`}>
                          <Icon className={`w-3.5 h-3.5 ${colorClass}`} />
                        </div>
                        <CardTitle className="text-base">{tierName}</CardTitle>
                        <Badge variant="secondary" data-testid={`badge-inspection-count-${tierName.toLowerCase().replace(" ", "-")}`}>
                          {entries.length} entries
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[200px]" data-testid={`scroll-inspection-${tierName.toLowerCase().replace(" ", "-")}`}>
                        <div className="flex flex-col gap-3">
                          {entries.map((entry) => (
                            <div
                              key={entry.id}
                              className="flex flex-col gap-2 p-3 rounded-md border hover-elevate"
                              data-testid={`entry-${entry.id}`}
                            >
                              <p className="text-sm line-clamp-2" data-testid={`text-entry-content-${entry.id}`}>
                                {entry.content}
                              </p>
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-muted-foreground" data-testid={`text-entry-time-${entry.id}`}>
                                    {new Date(entry.timestamp).toLocaleString()}
                                  </span>
                                  <Badge variant="secondary" className="text-xs" data-testid={`badge-entry-access-${entry.id}`}>
                                    {entry.accessCount} accesses
                                  </Badge>
                                  <Badge
                                    variant={SENSITIVITY_VARIANTS[entry.sensitivity] || "outline"}
                                    className="text-xs"
                                    data-testid={`badge-entry-sensitivity-${entry.id}`}
                                  >
                                    {entry.sensitivity}
                                  </Badge>
                                </div>
                                <Button variant="ghost" size="sm" data-testid={`button-inspect-${entry.id}`}>
                                  <Search className="w-3.5 h-3.5 mr-1" />
                                  Inspect
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="forgetting-policies" className="mt-0">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-lg font-medium" data-testid="text-policies-heading">Forgetting Policies</h2>
                <p className="text-sm text-muted-foreground">
                  Configure rules for when agents should forget information
                </p>
              </div>
              <Button onClick={() => setAddPolicyOpen(true)} data-testid="button-add-policy">
                <Plus className="w-4 h-4 mr-1.5" />
                Add Policy
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              {forgettingPolicies.map((policy) => {
                const ActionIcon = ACTION_ICONS[policy.action] || FileText;
                return (
                  <Card key={policy.id} className="hover-elevate" data-testid={`card-policy-${policy.id}`}>
                    <CardContent className="p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <ActionIcon className="w-4 h-4 text-muted-foreground" />
                          <h3 className="font-medium" data-testid={`text-policy-name-${policy.id}`}>{policy.name}</h3>
                          <Badge variant="secondary" data-testid={`badge-policy-trigger-${policy.id}`}>
                            {policy.triggerType}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {policy.active ? "Active" : "Inactive"}
                            </span>
                            <Switch
                              checked={policy.active}
                              onCheckedChange={() => togglePolicyActive(policy.id)}
                              data-testid={`switch-policy-${policy.id}`}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removePolicy(policy.id)}
                            data-testid={`button-remove-policy-${policy.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground" data-testid={`text-policy-desc-${policy.id}`}>
                        {policy.description}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" data-testid={`badge-policy-conditions-${policy.id}`}>
                          <FileText className="w-3 h-3 mr-1" />
                          {policy.triggerConditions}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" data-testid={`badge-policy-action-${policy.id}`}>
                          <ActionIcon className="w-3 h-3 mr-1" />
                          {policy.action}
                        </Badge>
                        <Badge variant="outline" data-testid={`badge-policy-timeline-${policy.id}`}>
                          <Clock className="w-3 h-3 mr-1" />
                          {policy.timeline}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={addPolicyOpen} onOpenChange={setAddPolicyOpen}>
        <DialogContent data-testid="dialog-add-policy">
          <DialogHeader>
            <DialogTitle>Add Forgetting Policy</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Policy Name</label>
              <Input
                value={newPolicyName}
                onChange={(e) => setNewPolicyName(e.target.value)}
                placeholder="Enter policy name"
                data-testid="input-new-policy-name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Trigger Type</label>
              <Select value={newPolicyTrigger} onValueChange={setNewPolicyTrigger}>
                <SelectTrigger data-testid="select-new-policy-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GDPR Erasure">GDPR Erasure</SelectItem>
                  <SelectItem value="Retention Expiry">Retention Expiry</SelectItem>
                  <SelectItem value="Competitive Quarantine">Competitive Quarantine</SelectItem>
                  <SelectItem value="Manual Purge">Manual Purge</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={newPolicyDesc}
                onChange={(e) => setNewPolicyDesc(e.target.value)}
                placeholder="Describe the policy"
                data-testid="input-new-policy-desc"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Trigger Conditions</label>
              <Input
                value={newPolicyConditions}
                onChange={(e) => setNewPolicyConditions(e.target.value)}
                placeholder="When should this policy trigger?"
                data-testid="input-new-policy-conditions"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Action</label>
              <Select value={newPolicyAction} onValueChange={setNewPolicyAction}>
                <SelectTrigger data-testid="select-new-policy-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Delete">Delete</SelectItem>
                  <SelectItem value="Archive">Archive</SelectItem>
                  <SelectItem value="Anonymize">Anonymize</SelectItem>
                  <SelectItem value="Quarantine">Quarantine</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Timeline</label>
              <Input
                value={newPolicyTimeline}
                onChange={(e) => setNewPolicyTimeline(e.target.value)}
                placeholder="e.g., Within 24 hours"
                data-testid="input-new-policy-timeline"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddPolicyOpen(false)} data-testid="button-cancel-policy">
              Cancel
            </Button>
            <Button onClick={addPolicy} disabled={!newPolicyName.trim()} data-testid="button-save-policy">
              Add Policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
