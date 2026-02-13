import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useIndustry } from "@/components/industry-provider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Shield, Zap, Clock, Brain, Loader2, Plus, Search, Trash2,
  AlertTriangle, ArrowRight, ArrowUp, ArrowDown, Minus,
  CheckCircle, Eye, Bell, UserCheck, Lock, TrendingUp, TrendingDown,
  Calendar, Sparkles, BarChart3, Target, Gauge, Settings,
  ChevronRight, Info,
} from "lucide-react";

const AUTONOMY_LEVELS = [
  { value: "full_auto", label: "Full Auto", icon: Zap, color: "text-green-600 dark:text-green-400", description: "Agent acts independently without any human involvement" },
  { value: "log_only", label: "Log Only", icon: Eye, color: "text-blue-600 dark:text-blue-400", description: "Agent acts and logs the action for review after the fact" },
  { value: "notify_after", label: "Notify After", icon: Bell, color: "text-yellow-600 dark:text-yellow-400", description: "Agent acts and sends a notification after execution" },
  { value: "confirm_before", label: "Confirm Before", icon: UserCheck, color: "text-orange-600 dark:text-orange-400", description: "Agent requests confirmation before acting" },
  { value: "expert_approval", label: "Expert Approval", icon: Lock, color: "text-red-600 dark:text-red-400", description: "Requires expert review and explicit approval" },
];

const INDUSTRY_RISK_DIMENSIONS: Record<string, Array<{ id: string; name: string; description: string; category: string }>> = {
  financial_services: [
    { id: "transaction_value", name: "Transaction Value", description: "Dollar amount thresholds for financial transactions", category: "Financial" },
    { id: "counterparty_risk", name: "Counterparty Risk Rating", description: "Risk rating of the counterparty involved", category: "Financial" },
    { id: "regulatory_class", name: "Regulatory Classification", description: "MiFID II suitability and regulatory category", category: "Regulatory" },
    { id: "market_hours", name: "Market Hours Sensitivity", description: "Whether action occurs during market hours", category: "Temporal" },
    { id: "aml_flag", name: "AML Flag Level", description: "Anti-money laundering risk indicators", category: "Compliance" },
    { id: "data_sensitivity", name: "Data Sensitivity", description: "PII/PCI data exposure level", category: "Data" },
  ],
  healthcare: [
    { id: "clinical_impact", name: "Clinical Impact Level", description: "Informational vs diagnostic vs treatment decisions", category: "Clinical" },
    { id: "patient_acuity", name: "Patient Acuity", description: "Severity level of the patient's condition", category: "Clinical" },
    { id: "phi_exposure", name: "PHI Exposure Scope", description: "Volume and sensitivity of protected health information", category: "Privacy" },
    { id: "off_formulary", name: "Off-Formulary Medication", description: "Whether medications are outside approved formulary", category: "Clinical" },
    { id: "hipaa_category", name: "HIPAA Category", description: "HIPAA compliance risk classification", category: "Regulatory" },
    { id: "consent_status", name: "Consent Status", description: "Patient consent verification level", category: "Privacy" },
  ],
  manufacturing: [
    { id: "safety_critical", name: "Safety Criticality", description: "Impact on worker and product safety", category: "Safety" },
    { id: "production_impact", name: "Production Impact", description: "Effect on production line throughput", category: "Operations" },
    { id: "quality_gate", name: "Quality Gate Level", description: "ISO 9001 quality control checkpoint", category: "Quality" },
    { id: "equipment_value", name: "Equipment Value at Risk", description: "Value of equipment potentially affected", category: "Financial" },
    { id: "environmental", name: "Environmental Impact", description: "Environmental compliance and emissions risk", category: "Compliance" },
    { id: "supply_chain", name: "Supply Chain Disruption", description: "Potential impact on supply chain continuity", category: "Operations" },
  ],
  insurance: [
    { id: "claim_value", name: "Claim Value", description: "Dollar amount of insurance claim", category: "Financial" },
    { id: "fraud_score", name: "Fraud Risk Score", description: "Likelihood of fraudulent claim", category: "Risk" },
    { id: "coverage_type", name: "Coverage Type Complexity", description: "Complexity of coverage being evaluated", category: "Operations" },
    { id: "regulatory_filing", name: "Regulatory Filing Impact", description: "Impact on regulatory filings and reporting", category: "Regulatory" },
    { id: "policyholder_risk", name: "Policyholder Risk Tier", description: "Risk tier of the policyholder", category: "Risk" },
    { id: "reinsurance", name: "Reinsurance Threshold", description: "Whether action triggers reinsurance obligations", category: "Financial" },
  ],
  retail: [
    { id: "order_value", name: "Order Value", description: "Dollar amount of customer order", category: "Financial" },
    { id: "customer_tier", name: "Customer Tier", description: "VIP/loyalty tier of the customer", category: "Customer" },
    { id: "inventory_impact", name: "Inventory Impact", description: "Effect on inventory levels and availability", category: "Operations" },
    { id: "pci_scope", name: "PCI Scope", description: "Payment card data handling requirements", category: "Compliance" },
    { id: "promotion_risk", name: "Promotion Risk", description: "Financial risk from pricing and promotions", category: "Financial" },
    { id: "return_fraud", name: "Return Fraud Score", description: "Likelihood of fraudulent return", category: "Risk" },
  ],
};

const DEFAULT_ACTION_TYPES = [
  { id: "data_enrichment", name: "Data Enrichment", category: "Data Operations" },
  { id: "entity_resolution", name: "Entity Resolution", category: "Data Operations" },
  { id: "report_generation", name: "Report Generation", category: "Analytics" },
  { id: "model_retraining", name: "Model Retraining", category: "ML Operations" },
  { id: "alert_escalation", name: "Alert Escalation", category: "Monitoring" },
  { id: "policy_enforcement", name: "Policy Enforcement", category: "Governance" },
  { id: "deployment_rollout", name: "Deployment Rollout", category: "Operations" },
  { id: "customer_response", name: "Customer Response", category: "Customer Ops" },
  { id: "compliance_check", name: "Compliance Check", category: "Governance" },
  { id: "resource_scaling", name: "Resource Scaling", category: "Infrastructure" },
];

type RiskDimension = {
  id: string;
  name: string;
  description: string;
  category: string;
  weight: number;
  thresholds: { low: number; medium: number; high: number; critical: number };
  oversightLevel: string;
};

type AutonomyLevel = {
  actionType: string;
  actionName: string;
  category: string;
  level: number;
  levelName: string;
  baseLevel: number;
  riskAdjusted: boolean;
};

type OverrideRule = {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  condition: string;
  overrideLevel: string;
  affectedActions: string[];
  active: boolean;
};

type AutonomyProfile = {
  id: string;
  name: string;
  industry: string;
  description: string | null;
  riskDimensions: RiskDimension[];
  autonomyLevels: AutonomyLevel[];
  overrideRules: OverrideRule[];
  learningData: any;
  status: string;
  createdAt: string;
};

function LevelIndicator({ level, size = "sm" }: { level: number; size?: "sm" | "lg" }) {
  const levelDef = AUTONOMY_LEVELS[level] || AUTONOMY_LEVELS[0];
  const Icon = levelDef.icon;
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`${size === "lg" ? "w-5 h-5" : "w-4 h-4"} ${levelDef.color}`} />
      <span className={`${size === "lg" ? "text-sm font-medium" : "text-xs"} ${levelDef.color}`}>{levelDef.label}</span>
    </div>
  );
}

function AutonomySlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const colors = ["bg-green-500", "bg-blue-500", "bg-yellow-500", "bg-orange-500", "bg-red-500"];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Slider
          value={[value]}
          onValueChange={([v]) => onChange(v)}
          min={0}
          max={4}
          step={1}
          disabled={disabled}
          className="flex-1"
          data-testid="slider-autonomy-level"
        />
      </div>
      <div className="flex justify-between">
        {AUTONOMY_LEVELS.map((l, i) => (
          <button
            key={l.value}
            onClick={() => !disabled && onChange(i)}
            className={`text-[10px] transition-opacity ${value === i ? "opacity-100 font-semibold" : "opacity-40"} ${l.color}`}
            data-testid={`button-level-${l.value}`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AutonomyEngine() {
  const { toast } = useToast();
  const { industry } = useIndustry();
  const industryId = industry?.id || "financial_services";

  const [activeTab, setActiveTab] = useState("risk-matrix");
  const [showCreateProfile, setShowCreateProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileDesc, setNewProfileDesc] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddOverride, setShowAddOverride] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<any>(null);
  const [showEnhancePreview, setShowEnhancePreview] = useState(false);
  const [enhanceResult, setEnhanceResult] = useState<any>(null);

  const [newOverride, setNewOverride] = useState<Partial<OverrideRule>>({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
    condition: "",
    overrideLevel: "confirm_before",
    affectedActions: [],
    active: true,
  });

  const { data: profiles = [], isLoading } = useQuery<AutonomyProfile[]>({
    queryKey: ["/api/autonomy-profiles"],
  });

  const createProfileMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/autonomy-profiles", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autonomy-profiles"] });
      setShowCreateProfile(false);
      setNewProfileName("");
      setNewProfileDesc("");
      toast({ title: "Autonomy profile created" });
    },
    onError: (e: any) => toast({ title: "Failed to create profile", description: e.message, variant: "destructive" }),
  });

  const updateProfileMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/autonomy-profiles/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autonomy-profiles"] });
      toast({ title: "Profile updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update", description: e.message, variant: "destructive" }),
  });

  const deleteProfileMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/autonomy-profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autonomy-profiles"] });
      setSelectedProfileId(null);
      toast({ title: "Profile deleted" });
    },
    onError: (e: any) => toast({ title: "Failed to delete", description: e.message, variant: "destructive" }),
  });

  const aiRecMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/autonomy-recommendations", data);
      return res.json();
    },
    onSuccess: (data) => {
      setAiRecommendations(data);
      toast({ title: "AI recommendations generated" });
    },
    onError: (e: any) => toast({ title: "AI analysis failed", description: e.message, variant: "destructive" }),
  });

  const aiGenerateMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/generate-autonomy-profile", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (selectedProfile) {
        updateProfileMut.mutate({
          id: selectedProfile.id,
          data: {
            riskDimensions: data.riskDimensions || [],
            autonomyLevels: data.autonomyLevels || [],
            overrideRules: data.overrideRules || [],
          },
        });
        toast({ title: "AI-generated profile applied", description: data.summary || "Risk dimensions, autonomy levels, and override rules generated" });
      }
    },
    onError: (e: any) => toast({ title: "AI generation failed", description: e.message, variant: "destructive" }),
  });

  const aiEnhanceMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/enhance-autonomy-profile", data);
      return res.json();
    },
    onSuccess: (data) => {
      setEnhanceResult(data);
      setShowEnhancePreview(true);
      toast({ title: "AI enhancement analysis complete" });
    },
    onError: (e: any) => toast({ title: "AI enhancement failed", description: e.message, variant: "destructive" }),
  });

  function handleAiGenerate() {
    if (!selectedProfile) return;
    aiGenerateMut.mutate({
      industry: industryId,
      profileName: selectedProfile.name,
      description: selectedProfile.description || "",
    });
  }

  function handleAiEnhance() {
    if (!selectedProfile) return;
    aiEnhanceMut.mutate({
      industry: industryId,
      riskDimensions,
      autonomyLevels,
      overrideRules,
    });
  }

  function handleApplyEnhancement() {
    if (!selectedProfile || !enhanceResult) return;
    updateProfileMut.mutate({
      id: selectedProfile.id,
      data: {
        riskDimensions: enhanceResult.enhancedRiskDimensions || riskDimensions,
        autonomyLevels: enhanceResult.enhancedAutonomyLevels || autonomyLevels,
        overrideRules: enhanceResult.enhancedOverrideRules || overrideRules,
      },
    });
    setShowEnhancePreview(false);
    setEnhanceResult(null);
    toast({ title: "AI enhancements applied to profile" });
  }

  const selectedProfile = useMemo(() => {
    return profiles.find((p) => p.id === selectedProfileId) || null;
  }, [profiles, selectedProfileId]);

  const riskDimensions = useMemo(() => {
    if (selectedProfile?.riskDimensions?.length) return selectedProfile.riskDimensions;
    const dims = INDUSTRY_RISK_DIMENSIONS[industryId] || INDUSTRY_RISK_DIMENSIONS.financial_services;
    return dims.map((d) => ({
      ...d,
      weight: 50,
      thresholds: { low: 25, medium: 50, high: 75, critical: 90 },
      oversightLevel: "confirm_before",
    }));
  }, [selectedProfile, industryId]);

  const autonomyLevels = useMemo(() => {
    if (selectedProfile?.autonomyLevels?.length) return selectedProfile.autonomyLevels;
    return DEFAULT_ACTION_TYPES.map((a, i) => ({
      actionType: a.id,
      actionName: a.name,
      category: a.category,
      level: i % 3 === 0 ? 0 : i % 3 === 1 ? 2 : 3,
      levelName: AUTONOMY_LEVELS[i % 3 === 0 ? 0 : i % 3 === 1 ? 2 : 3].label,
      baseLevel: i % 3 === 0 ? 0 : i % 3 === 1 ? 2 : 3,
      riskAdjusted: false,
    }));
  }, [selectedProfile]);

  const overrideRules = useMemo(() => {
    if (selectedProfile?.overrideRules?.length) return selectedProfile.overrideRules;
    return [
      {
        id: "qe_close",
        name: "Quarter-End Close",
        description: "During quarter-end close (last 5 business days), all financial agent actions above $10K require CFO approval.",
        startDate: "2026-03-27",
        endDate: "2026-03-31",
        condition: "Transaction value > $10,000",
        overrideLevel: "expert_approval",
        affectedActions: ["data_enrichment", "report_generation", "deployment_rollout"],
        active: true,
      },
      {
        id: "audit_window",
        name: "Annual Audit Window",
        description: "During external audit period, all compliance and governance actions require dual sign-off.",
        startDate: "2026-04-01",
        endDate: "2026-04-15",
        condition: "Compliance or governance category actions",
        overrideLevel: "expert_approval",
        affectedActions: ["compliance_check", "policy_enforcement"],
        active: true,
      },
      {
        id: "weekend_ops",
        name: "Weekend Operations",
        description: "During weekends, reduce autonomous actions to log-only for non-critical operations.",
        startDate: "2026-02-14",
        endDate: "2026-02-15",
        condition: "Non-critical actions on weekends",
        overrideLevel: "log_only",
        affectedActions: ["resource_scaling", "data_enrichment", "model_retraining"],
        active: false,
      },
    ];
  }, [selectedProfile]);

  function handleCreateProfile() {
    const dims = INDUSTRY_RISK_DIMENSIONS[industryId] || INDUSTRY_RISK_DIMENSIONS.financial_services;
    const riskDims = dims.map((d) => ({
      ...d,
      weight: 50,
      thresholds: { low: 25, medium: 50, high: 75, critical: 90 },
      oversightLevel: "confirm_before",
    }));
    const levels = DEFAULT_ACTION_TYPES.map((a, i) => ({
      actionType: a.id,
      actionName: a.name,
      category: a.category,
      level: 2,
      levelName: AUTONOMY_LEVELS[2].label,
      baseLevel: 2,
      riskAdjusted: false,
    }));
    createProfileMut.mutate({
      name: newProfileName,
      industry: industryId,
      description: newProfileDesc || null,
      riskDimensions: riskDims,
      autonomyLevels: levels,
      overrideRules: [],
      learningData: {},
    });
  }

  function handleUpdateDimensionWeight(dimId: string, weight: number) {
    if (!selectedProfile) return;
    const updated = riskDimensions.map((d) =>
      d.id === dimId ? { ...d, weight } : d
    );
    updateProfileMut.mutate({
      id: selectedProfile.id,
      data: { riskDimensions: updated },
    });
  }

  function handleUpdateDimensionOversight(dimId: string, level: string) {
    if (!selectedProfile) return;
    const updated = riskDimensions.map((d) =>
      d.id === dimId ? { ...d, oversightLevel: level } : d
    );
    updateProfileMut.mutate({
      id: selectedProfile.id,
      data: { riskDimensions: updated },
    });
  }

  function handleUpdateAutonomyLevel(actionType: string, level: number) {
    if (!selectedProfile) return;
    const updated = autonomyLevels.map((a) =>
      a.actionType === actionType
        ? { ...a, level, levelName: AUTONOMY_LEVELS[level].label }
        : a
    );
    updateProfileMut.mutate({
      id: selectedProfile.id,
      data: { autonomyLevels: updated },
    });
  }

  function handleAddOverride() {
    if (!selectedProfile || !newOverride.name) return;
    const rule: OverrideRule = {
      id: `override_${Date.now()}`,
      name: newOverride.name || "",
      description: newOverride.description || "",
      startDate: newOverride.startDate || "",
      endDate: newOverride.endDate || "",
      condition: newOverride.condition || "",
      overrideLevel: newOverride.overrideLevel || "confirm_before",
      affectedActions: newOverride.affectedActions || [],
      active: true,
    };
    const updated = [...overrideRules, rule];
    updateProfileMut.mutate({
      id: selectedProfile.id,
      data: { overrideRules: updated },
    });
    setShowAddOverride(false);
    setNewOverride({ name: "", description: "", startDate: "", endDate: "", condition: "", overrideLevel: "confirm_before", affectedActions: [], active: true });
  }

  function handleToggleOverride(ruleId: string) {
    if (!selectedProfile) return;
    const updated = overrideRules.map((r) =>
      r.id === ruleId ? { ...r, active: !r.active } : r
    );
    updateProfileMut.mutate({
      id: selectedProfile.id,
      data: { overrideRules: updated },
    });
  }

  function handleDeleteOverride(ruleId: string) {
    if (!selectedProfile) return;
    const updated = overrideRules.filter((r) => r.id !== ruleId);
    updateProfileMut.mutate({
      id: selectedProfile.id,
      data: { overrideRules: updated },
    });
  }

  function handleRequestAiRecommendations() {
    aiRecMut.mutate({
      industry: industryId,
      riskDimensions,
      autonomyLevels,
      approvalHistory: {
        totalDecisions: 250,
        approvedRate: 87,
        avgReviewTime: "4.2 hours",
        topActions: autonomyLevels.map((a) => a.actionType).slice(0, 5),
      },
    });
  }

  const filteredProfiles = profiles.filter(
    (p) => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    AUTONOMY_LEVELS.forEach((l) => { counts[l.value] = 0; });
    autonomyLevels.forEach((a) => {
      const lv = AUTONOMY_LEVELS[a.level];
      if (lv) counts[lv.value]++;
    });
    return counts;
  }, [autonomyLevels]);

  const activeOverrides = overrideRules.filter((r) => r.active).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-autonomy-engine">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Adaptive Autonomy Engine</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dynamic, context-aware human oversight replacing static ratios
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1">
            <Shield className="w-3 h-3" />Risk-calibrated oversight
          </Badge>
          <Button onClick={() => setShowCreateProfile(true)} data-testid="button-create-profile">
            <Plus className="w-4 h-4 mr-1.5" />New Profile
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {AUTONOMY_LEVELS.map((l) => {
          const Icon = l.icon;
          const count = levelCounts[l.value] || 0;
          return (
            <Card key={l.value} data-testid={`card-level-count-${l.value}`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${l.color}`} />
                  <span className="text-xs text-muted-foreground">{l.label}</span>
                </div>
                <p className="text-xl font-bold mt-1">{count}</p>
                <p className="text-[10px] text-muted-foreground">action types</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Autonomy Profiles</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search profiles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-profiles"
                />
              </div>
              <ScrollArea className="h-[calc(100vh-420px)]">
                <div className="space-y-1.5">
                  {filteredProfiles.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      No profiles yet. Create one to get started.
                    </p>
                  )}
                  {filteredProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => setSelectedProfileId(profile.id)}
                      className={`w-full text-left p-3 rounded-md border transition-colors ${
                        selectedProfileId === profile.id
                          ? "border-primary bg-primary/5"
                          : "hover-elevate"
                      }`}
                      data-testid={`button-profile-${profile.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{profile.name}</span>
                        <Badge variant={profile.status === "active" ? "default" : "secondary"} className="text-[10px] shrink-0">
                          {profile.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {profile.description || profile.industry}
                      </p>
                      <div className="flex items-center gap-1 mt-1.5">
                        {((profile.autonomyLevels as AutonomyLevel[]) || []).slice(0, 5).map((a, i) => {
                          const def = AUTONOMY_LEVELS[a.level] || AUTONOMY_LEVELS[0];
                          return (
                            <div
                              key={i}
                              className={`w-2 h-2 rounded-full ${
                                a.level === 0 ? "bg-green-500" :
                                a.level === 1 ? "bg-blue-500" :
                                a.level === 2 ? "bg-yellow-500" :
                                a.level === 3 ? "bg-orange-500" : "bg-red-500"
                              }`}
                              title={`${a.actionName}: ${def.label}`}
                            />
                          );
                        })}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-9">
          {!selectedProfile ? (
            <Card className="h-full">
              <CardContent className="flex flex-col items-center justify-center h-96 text-center">
                <Gauge className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Select or Create a Profile</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Autonomy profiles define how much independence AI agents get for different action types. 
                  Risk dimensions calibrate oversight to actual risk instead of static ratios.
                </p>
                <Button className="mt-4" onClick={() => setShowCreateProfile(true)} data-testid="button-create-profile-empty">
                  <Plus className="w-4 h-4 mr-1.5" />Create Profile
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-lg font-semibold" data-testid="text-profile-name">{selectedProfile.name}</h2>
                      <p className="text-sm text-muted-foreground">{selectedProfile.description || "No description"}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{selectedProfile.industry.replace(/_/g, " ")}</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAiGenerate}
                        disabled={aiGenerateMut.isPending}
                        data-testid="button-ai-generate"
                      >
                        {aiGenerateMut.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        AI Generate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAiEnhance}
                        disabled={aiEnhanceMut.isPending}
                        data-testid="button-ai-enhance"
                      >
                        {aiEnhanceMut.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        AI Enhance
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          if (confirm("Delete this profile?")) deleteProfileMut.mutate(selectedProfile.id);
                        }}
                        data-testid="button-delete-profile"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="risk-matrix" data-testid="tab-risk-matrix">
                    <Target className="w-4 h-4 mr-1.5" />Risk Matrix
                  </TabsTrigger>
                  <TabsTrigger value="autonomy-spectrum" data-testid="tab-autonomy-spectrum">
                    <Gauge className="w-4 h-4 mr-1.5" />Autonomy Spectrum
                  </TabsTrigger>
                  <TabsTrigger value="override-calendar" data-testid="tab-override-calendar">
                    <Calendar className="w-4 h-4 mr-1.5" />Override Calendar
                  </TabsTrigger>
                  <TabsTrigger value="learning-dashboard" data-testid="tab-learning-dashboard">
                    <Brain className="w-4 h-4 mr-1.5" />Learning Dashboard
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="risk-matrix" className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Target className="w-5 h-5" />Risk Dimension Matrix
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            Configure oversight levels across industry-specific risk dimensions
                          </p>
                        </div>
                        <Badge variant="secondary">{riskDimensions.length} dimensions</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[calc(100vh-520px)]">
                        <div className="space-y-3">
                          {riskDimensions.map((dim) => {
                            return (
                              <Card key={dim.id} data-testid={`card-dimension-${dim.id}`}>
                                <CardContent className="p-4">
                                  <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium">{dim.name}</span>
                                        <Badge variant="outline" className="text-[10px]">{dim.category}</Badge>
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1">{dim.description}</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                      <div className="text-right">
                                        <p className="text-xs text-muted-foreground">Weight</p>
                                        <p className="text-sm font-bold">{dim.weight}%</p>
                                      </div>
                                      <Select
                                        value={dim.oversightLevel}
                                        onValueChange={(v) => handleUpdateDimensionOversight(dim.id, v)}
                                      >
                                        <SelectTrigger className="w-[160px]" data-testid={`select-oversight-${dim.id}`}>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {AUTONOMY_LEVELS.map((l) => (
                                            <SelectItem key={l.value} value={l.value}>
                                              <div className="flex items-center gap-1.5">
                                                <l.icon className={`w-3 h-3 ${l.color}`} />
                                                {l.label}
                                              </div>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                  <div className="mt-3">
                                    <Slider
                                      value={[dim.weight]}
                                      onValueChange={([v]) => handleUpdateDimensionWeight(dim.id, v)}
                                      min={0}
                                      max={100}
                                      step={5}
                                      data-testid={`slider-weight-${dim.id}`}
                                    />
                                    <div className="flex justify-between mt-1">
                                      <span className="text-[10px] text-muted-foreground">Low priority</span>
                                      <span className="text-[10px] text-muted-foreground">Critical</span>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="autonomy-spectrum" className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Gauge className="w-5 h-5" />Autonomy Spectrum
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            Set the autonomy level for each action type on a 5-level spectrum
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {AUTONOMY_LEVELS.map((l) => (
                            <Badge key={l.value} variant="outline" className="text-[10px] gap-1">
                              <l.icon className={`w-3 h-3 ${l.color}`} />
                              {l.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[calc(100vh-520px)]">
                        <div className="space-y-4">
                          {Object.entries(
                            autonomyLevels.reduce<Record<string, AutonomyLevel[]>>((acc, a) => {
                              (acc[a.category] = acc[a.category] || []).push(a);
                              return acc;
                            }, {})
                          ).map(([category, actions]) => (
                            <div key={category}>
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="text-sm font-medium">{category}</h4>
                                <Badge variant="secondary" className="text-[10px]">{actions.length} actions</Badge>
                              </div>
                              <div className="space-y-3">
                                {actions.map((action) => (
                                  <Card key={action.actionType} data-testid={`card-action-${action.actionType}`}>
                                    <CardContent className="p-4">
                                      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium">{action.actionName}</span>
                                          {action.riskAdjusted && (
                                            <Badge variant="outline" className="text-[10px] gap-1">
                                              <AlertTriangle className="w-3 h-3" />Risk-adjusted
                                            </Badge>
                                          )}
                                        </div>
                                        <LevelIndicator level={action.level} size="lg" />
                                      </div>
                                      <AutonomySlider
                                        value={action.level}
                                        onChange={(v) => handleUpdateAutonomyLevel(action.actionType, v)}
                                      />
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="override-calendar" className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Calendar className="w-5 h-5" />Override Calendar
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            Time-based autonomy overrides for special periods
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary">{activeOverrides} active</Badge>
                          <Button onClick={() => setShowAddOverride(true)} data-testid="button-add-override">
                            <Plus className="w-4 h-4 mr-1.5" />Add Override
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[calc(100vh-520px)]">
                        <div className="space-y-3">
                          {overrideRules.length === 0 && (
                            <div className="text-center py-8">
                              <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                              <p className="text-sm text-muted-foreground">No override rules configured</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Add time-based rules to adjust autonomy during special periods
                              </p>
                            </div>
                          )}
                          {overrideRules.map((rule) => {
                            const levelDef = AUTONOMY_LEVELS.find((l) => l.value === rule.overrideLevel) || AUTONOMY_LEVELS[3];
                            const LevelIcon = levelDef.icon;
                            const isActive = rule.active;
                            const now = new Date();
                            const start = new Date(rule.startDate);
                            const end = new Date(rule.endDate);
                            const isCurrent = now >= start && now <= end;
                            return (
                              <Card
                                key={rule.id}
                                className={!isActive ? "opacity-60" : ""}
                                data-testid={`card-override-${rule.id}`}
                              >
                                <CardContent className="p-4">
                                  <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium">{rule.name}</span>
                                        {isCurrent && isActive && (
                                          <Badge variant="default" className="text-[10px]">Active Now</Badge>
                                        )}
                                        {!isActive && (
                                          <Badge variant="secondary" className="text-[10px]">Disabled</Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
                                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                          <Clock className="w-3 h-3" />
                                          {rule.startDate} to {rule.endDate}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <LevelIcon className={`w-3 h-3 ${levelDef.color}`} />
                                          <span className={`text-xs ${levelDef.color}`}>{levelDef.label}</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                                        {rule.affectedActions.map((a) => (
                                          <Badge key={a} variant="outline" className="text-[10px]">
                                            {DEFAULT_ACTION_TYPES.find((at) => at.id === a)?.name || a}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => handleToggleOverride(rule.id)}
                                        data-testid={`button-toggle-override-${rule.id}`}
                                      >
                                        {isActive ? <Eye className="w-4 h-4" /> : <Eye className="w-4 h-4 opacity-40" />}
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => handleDeleteOverride(rule.id)}
                                        data-testid={`button-delete-override-${rule.id}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="learning-dashboard" className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Brain className="w-5 h-5" />Learning Dashboard
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            AI-analyzed approval patterns and autonomy evolution recommendations
                          </p>
                        </div>
                        <Button
                          onClick={handleRequestAiRecommendations}
                          disabled={aiRecMut.isPending}
                          data-testid="button-ai-recommendations"
                        >
                          {aiRecMut.isPending ? (
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4 mr-1.5" />
                          )}
                          Generate AI Recommendations
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!aiRecommendations && !aiRecMut.isPending && (
                        <div className="text-center py-12">
                          <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <h3 className="text-sm font-medium mb-2">No recommendations yet</h3>
                          <p className="text-xs text-muted-foreground max-w-md mx-auto">
                            Click "Generate AI Recommendations" to analyze approval patterns and get 
                            suggestions for how your autonomy profile should evolve.
                          </p>
                        </div>
                      )}

                      {aiRecMut.isPending && (
                        <div className="flex items-center justify-center gap-2 py-12">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">AI is analyzing approval patterns...</span>
                        </div>
                      )}

                      {aiRecommendations && (
                        <ScrollArea className="h-[calc(100vh-520px)]">
                          <div className="space-y-4 pr-4" data-testid="ai-recommendations-results">
                            {aiRecommendations.overallAssessment && (
                              <div className="p-3 rounded-md border" data-testid="text-overall-assessment">
                                <p className="text-xs text-muted-foreground mb-1">Overall Assessment</p>
                                <p className="text-sm">{aiRecommendations.overallAssessment}</p>
                              </div>
                            )}

                            {aiRecommendations.efficiencyGains && (
                              <div className="grid grid-cols-3 gap-3">
                                <Card>
                                  <CardContent className="p-3">
                                    <p className="text-xs text-muted-foreground">Time Savings</p>
                                    <p className="text-lg font-bold mt-1">{aiRecommendations.efficiencyGains.estimatedTimesSaved || "N/A"}</p>
                                  </CardContent>
                                </Card>
                                <Card>
                                  <CardContent className="p-3">
                                    <p className="text-xs text-muted-foreground">Reduced Approvals</p>
                                    <p className="text-lg font-bold mt-1">{aiRecommendations.efficiencyGains.reducedApprovals || 0}</p>
                                  </CardContent>
                                </Card>
                                <Card>
                                  <CardContent className="p-3">
                                    <p className="text-xs text-muted-foreground">Bottlenecks</p>
                                    <p className="text-lg font-bold mt-1">{(aiRecommendations.efficiencyGains.currentBottlenecks || []).length}</p>
                                  </CardContent>
                                </Card>
                              </div>
                            )}

                            {aiRecommendations.riskAlerts?.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                                  <AlertTriangle className="w-4 h-4" />Risk Alerts
                                </h4>
                                <div className="space-y-2">
                                  {aiRecommendations.riskAlerts.map((alert: any, i: number) => (
                                    <div key={i} className="p-2.5 rounded-md border">
                                      <div className="flex items-center gap-2 mb-1">
                                        <Badge variant={alert.severity === "high" ? "destructive" : alert.severity === "medium" ? "secondary" : "outline"} className="text-xs">
                                          {alert.severity}
                                        </Badge>
                                        <span className="text-sm">{alert.message}</span>
                                      </div>
                                      <div className="flex items-center gap-1 flex-wrap">
                                        {(alert.affectedActions || []).map((a: string, j: number) => (
                                          <Badge key={j} variant="outline" className="text-[10px]">{a}</Badge>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {aiRecommendations.recommendations?.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                                  <TrendingUp className="w-4 h-4" />Autonomy Recommendations ({aiRecommendations.recommendations.length})
                                </h4>
                                <div className="space-y-2">
                                  {aiRecommendations.recommendations.map((rec: any, i: number) => {
                                    const dirIcon = rec.direction === "increase" ? ArrowUp : rec.direction === "decrease" ? ArrowDown : Minus;
                                    const DirIcon = dirIcon;
                                    const currentDef = AUTONOMY_LEVELS.find((l) => l.value === rec.currentLevel);
                                    const recDef = AUTONOMY_LEVELS.find((l) => l.value === rec.recommendedLevel);
                                    return (
                                      <Card key={i} data-testid={`card-recommendation-${i}`}>
                                        <CardContent className="p-4">
                                          <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
                                            <div className="flex items-center gap-2">
                                              <DirIcon className={`w-4 h-4 ${
                                                rec.direction === "increase" ? "text-green-500" :
                                                rec.direction === "decrease" ? "text-red-500" : "text-muted-foreground"
                                              }`} />
                                              <span className="text-sm font-medium">{rec.actionType.replace(/_/g, " ")}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Badge variant="secondary" className="text-xs">
                                                {Math.round((rec.confidence || 0) * 100)}% confidence
                                              </Badge>
                                              <Badge variant="outline" className="text-xs">
                                                {rec.approvalRate || 0}% approval rate
                                              </Badge>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                                            {currentDef && (
                                              <Badge variant="outline" className="text-xs gap-1">
                                                <currentDef.icon className={`w-3 h-3 ${currentDef.color}`} />
                                                {currentDef.label}
                                              </Badge>
                                            )}
                                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                            {recDef && (
                                              <Badge variant="default" className="text-xs gap-1">
                                                <recDef.icon className="w-3 h-3" />
                                                {recDef.label}
                                              </Badge>
                                            )}
                                          </div>

                                          <p className="text-xs text-muted-foreground">{rec.reasoning}</p>

                                          {rec.riskFactors?.length > 0 && (
                                            <div className="flex items-center gap-1 mt-2 flex-wrap">
                                              <AlertTriangle className="w-3 h-3 text-muted-foreground" />
                                              {rec.riskFactors.map((f: string, j: number) => (
                                                <Badge key={j} variant="outline" className="text-[10px]">{f}</Badge>
                                              ))}
                                            </div>
                                          )}

                                          <div className="flex items-center justify-end gap-2 mt-3">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => {
                                                if (recDef) {
                                                  const levelIdx = AUTONOMY_LEVELS.indexOf(recDef);
                                                  if (levelIdx >= 0) handleUpdateAutonomyLevel(rec.actionType, levelIdx);
                                                }
                                              }}
                                              data-testid={`button-apply-rec-${i}`}
                                            >
                                              <CheckCircle className="w-3 h-3 mr-1" />Apply
                                            </Button>
                                          </div>
                                        </CardContent>
                                      </Card>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showCreateProfile} onOpenChange={setShowCreateProfile}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Autonomy Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Profile Name</Label>
              <Input
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="e.g., Production - High Risk"
                data-testid="input-profile-name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={newProfileDesc}
                onChange={(e) => setNewProfileDesc(e.target.value)}
                placeholder="Describe the purpose of this autonomy profile..."
                data-testid="input-profile-description"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="w-4 h-4" />
              <span>Industry: {industryId.replace(/_/g, " ")}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateProfile(false)}>Cancel</Button>
            <Button
              onClick={handleCreateProfile}
              disabled={!newProfileName.trim() || createProfileMut.isPending}
              data-testid="button-confirm-create-profile"
            >
              {createProfileMut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddOverride} onOpenChange={setShowAddOverride}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Override Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rule Name</Label>
              <Input
                value={newOverride.name || ""}
                onChange={(e) => setNewOverride({ ...newOverride, name: e.target.value })}
                placeholder="e.g., Quarter-End Close"
                data-testid="input-override-name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={newOverride.description || ""}
                onChange={(e) => setNewOverride({ ...newOverride, description: e.target.value })}
                placeholder="Describe when and why this override applies..."
                data-testid="input-override-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={newOverride.startDate || ""}
                  onChange={(e) => setNewOverride({ ...newOverride, startDate: e.target.value })}
                  data-testid="input-override-start"
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={newOverride.endDate || ""}
                  onChange={(e) => setNewOverride({ ...newOverride, endDate: e.target.value })}
                  data-testid="input-override-end"
                />
              </div>
            </div>
            <div>
              <Label>Condition</Label>
              <Input
                value={newOverride.condition || ""}
                onChange={(e) => setNewOverride({ ...newOverride, condition: e.target.value })}
                placeholder="e.g., Transaction value > $10,000"
                data-testid="input-override-condition"
              />
            </div>
            <div>
              <Label>Override Autonomy Level</Label>
              <Select
                value={newOverride.overrideLevel || "confirm_before"}
                onValueChange={(v) => setNewOverride({ ...newOverride, overrideLevel: v })}
              >
                <SelectTrigger data-testid="select-override-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTONOMY_LEVELS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      <div className="flex items-center gap-1.5">
                        <l.icon className={`w-3 h-3 ${l.color}`} />
                        {l.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Affected Action Types</Label>
              <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                {DEFAULT_ACTION_TYPES.map((a) => {
                  const selected = (newOverride.affectedActions || []).includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => {
                        const actions = newOverride.affectedActions || [];
                        setNewOverride({
                          ...newOverride,
                          affectedActions: selected
                            ? actions.filter((x) => x !== a.id)
                            : [...actions, a.id],
                        });
                      }}
                      className={`text-left p-2 rounded-md border text-xs transition-colors ${
                        selected ? "border-primary bg-primary/5" : ""
                      }`}
                      data-testid={`button-action-${a.id}`}
                    >
                      <div className="flex items-center gap-1.5">
                        {selected ? <CheckCircle className="w-3 h-3 text-primary" /> : <div className="w-3 h-3 rounded-full border" />}
                        {a.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddOverride(false)}>Cancel</Button>
            <Button
              onClick={handleAddOverride}
              disabled={!newOverride.name?.trim()}
              data-testid="button-confirm-add-override"
            >
              <Plus className="w-4 h-4 mr-1.5" />Add Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEnhancePreview} onOpenChange={setShowEnhancePreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />AI Enhancement Preview
            </DialogTitle>
          </DialogHeader>
          {enhanceResult && (
            <div className="space-y-4">
              {enhanceResult.summary && (
                <div className="p-3 rounded-md border" data-testid="text-enhance-summary">
                  <p className="text-xs text-muted-foreground mb-1">Enhancement Summary</p>
                  <p className="text-sm">{enhanceResult.summary}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {enhanceResult.coverageScore && (
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs text-muted-foreground">Coverage Score</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-lg font-bold">{enhanceResult.coverageScore.before}%</span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        <span className="text-lg font-bold text-green-600 dark:text-green-400">{enhanceResult.coverageScore.after}%</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {enhanceResult.riskScore && (
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs text-muted-foreground">Risk Score</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-lg font-bold">{enhanceResult.riskScore.before}%</span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        <span className="text-lg font-bold text-green-600 dark:text-green-400">{enhanceResult.riskScore.after}%</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {enhanceResult.improvements?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" />Improvements ({enhanceResult.improvements.length})
                  </h4>
                  <div className="space-y-2">
                    {enhanceResult.improvements.map((imp: any, i: number) => (
                      <div key={i} className="p-2.5 rounded-md border" data-testid={`card-improvement-${i}`}>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant={imp.impact === "high" ? "destructive" : imp.impact === "medium" ? "secondary" : "outline"} className="text-xs">
                            {imp.impact}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{(imp.area || "").replace(/_/g, " ")}</Badge>
                        </div>
                        <p className="text-sm font-medium">{imp.change}</p>
                        <p className="text-xs text-muted-foreground mt-1">{imp.reasoning}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEnhancePreview(false); setEnhanceResult(null); }}>
              Dismiss
            </Button>
            <Button onClick={handleApplyEnhancement} data-testid="button-apply-enhancement">
              <CheckCircle className="w-4 h-4 mr-1.5" />Apply Enhancements
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
