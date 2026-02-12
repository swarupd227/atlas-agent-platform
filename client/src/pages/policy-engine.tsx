import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect } from "react";
import {
  Shield,
  Search,
  FileCode,
  AlertTriangle,
  CheckCircle,
  Filter,
  Globe,
  BookOpen,
  Layers,
  Play,
  Code,
  Scale,
  Gavel,
  Building2,
  ShieldCheck,
  Zap,
  CircleDot,
  XCircle,
  RefreshCw,
  Copy,
  BarChart3,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Send,
  Loader2,
  Lightbulb,
  Target,
  Link2,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { StatCard } from "@/components/stat-card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  Regulation,
  RegulatoryPolicy,
  ComplianceControl,
  RegulatoryChange,
} from "@shared/schema";

function severityColor(severity: string): string {
  switch (severity) {
    case "critical": return "text-red-600 dark:text-red-400";
    case "high": return "text-orange-600 dark:text-orange-400";
    case "medium": return "text-yellow-600 dark:text-yellow-400";
    case "low": return "text-green-600 dark:text-green-400";
    default: return "text-muted-foreground";
  }
}

function severityBadge(severity: string) {
  const variants: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
    critical: "destructive",
    high: "default",
    medium: "secondary",
    low: "outline",
  };
  return <Badge variant={variants[severity] || "outline"} className="text-[10px]">{severity}</Badge>;
}

function actionBadge(action: string) {
  const colors: Record<string, string> = {
    block: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    warn: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    escalate: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    log: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  };
  return (
    <Badge variant="outline" className={`text-[10px] border-0 ${colors[action] || ""}`}>
      {action}
    </Badge>
  );
}

function jurisdictionBadge(jurisdiction: string) {
  return (
    <Badge variant="outline" className="text-[10px] gap-1">
      <Globe className="w-3 h-3" />
      {jurisdiction}
    </Badge>
  );
}

function coverageBadge(status: string) {
  if (status === "full") return <Badge variant="default" className="text-[10px] bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />Full</Badge>;
  if (status === "partial") return <Badge variant="secondary" className="text-[10px]"><AlertTriangle className="w-3 h-3 mr-1" />Partial</Badge>;
  return <Badge variant="destructive" className="text-[10px]"><XCircle className="w-3 h-3 mr-1" />Gap</Badge>;
}

function changeTypeBadge(type: string) {
  const config: Record<string, { icon: typeof AlertTriangle; label: string }> = {
    enforcement_phase: { icon: Gavel, label: "Enforcement" },
    amendment: { icon: FileCode, label: "Amendment" },
    guidance_update: { icon: BookOpen, label: "Guidance" },
    proposed_rule: { icon: Scale, label: "Proposed" },
    new_regulation: { icon: Shield, label: "New" },
  };
  const c = config[type] || { icon: FileCode, label: type };
  const Icon = c.icon;
  return (
    <Badge variant="outline" className="text-[10px] gap-1">
      <Icon className="w-3 h-3" />
      {c.label}
    </Badge>
  );
}

function impactBadge(level: string) {
  if (level === "critical") return <Badge variant="destructive" className="text-[10px]">Critical</Badge>;
  if (level === "high") return <Badge variant="default" className="text-[10px]">High</Badge>;
  if (level === "medium") return <Badge variant="secondary" className="text-[10px]">Medium</Badge>;
  return <Badge variant="outline" className="text-[10px]">Low</Badge>;
}

function statusBadge(status: string) {
  const config: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    pending_review: { variant: "secondary", label: "Pending Review" },
    in_progress: { variant: "default", label: "In Progress" },
    completed: { variant: "outline", label: "Completed" },
    dismissed: { variant: "outline", label: "Dismissed" },
  };
  const c = config[status] || { variant: "outline", label: status };
  return <Badge variant={c.variant} className="text-[10px]">{c.label}</Badge>;
}

export default function PolicyEngine() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("regulations");
  const [searchFilter, setSearchFilter] = useState("");
  const [jurisdictionFilter, setJurisdictionFilter] = useState("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [selectedRegulation, setSelectedRegulation] = useState<Regulation | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<RegulatoryPolicy | null>(null);
  const [changeStatusFilter, setChangeStatusFilter] = useState("all");

  const { data: regulations = [], isLoading: regsLoading } = useQuery<Regulation[]>({
    queryKey: ["/api/regulations"],
  });

  const { data: allPolicies = [], isLoading: policiesLoading } = useQuery<RegulatoryPolicy[]>({
    queryKey: ["/api/regulatory-policies"],
  });

  const { data: allControls = [], isLoading: controlsLoading } = useQuery<ComplianceControl[]>({
    queryKey: ["/api/compliance-controls"],
  });

  const { data: allChanges = [], isLoading: changesLoading } = useQuery<RegulatoryChange[]>({
    queryKey: ["/api/regulatory-changes"],
  });

  const [initializingLibrary, setInitializingLibrary] = useState(false);

  async function handleInitializeLibrary() {
    setInitializingLibrary(true);
    try {
      const res = await apiRequest("POST", "/api/regulations/seed");
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/regulations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/regulatory-policies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance-controls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/regulatory-changes"] });
      toast({
        title: "Regulation Library Initialized",
        description: `Loaded ${data.regulations || 10} regulations, ${data.policies || 7} policies, ${data.controls || 14} compliance controls, and ${data.changes || 4} regulatory changes.`,
      });
    } catch (e: any) {
      toast({ title: "Initialization failed", description: e.message, variant: "destructive" });
    } finally {
      setInitializingLibrary(false);
    }
  }

  const [aiGenerating, setAiGenerating] = useState<string | null>(null);
  const [aiEnhancing, setAiEnhancing] = useState(false);
  const [aiEnhanceResult, setAiEnhanceResult] = useState<any>(null);
  const [aiGapResult, setAiGapResult] = useState<any>(null);
  const [aiGapLoading, setAiGapLoading] = useState(false);
  const [aiImpactResults, setAiImpactResults] = useState<Record<string, any>>({});
  const [aiImpactLoading, setAiImpactLoading] = useState<string | null>(null);
  const [pushingPolicy, setPushingPolicy] = useState<string | null>(null);
  const [aiControlsLoading, setAiControlsLoading] = useState(false);
  const [aiEnhancingReg, setAiEnhancingReg] = useState<string | null>(null);
  const [aiRegEnhanceResult, setAiRegEnhanceResult] = useState<{ regId: string; regName: string; enriched: any } | null>(null);
  const regEnhanceRef = useRef<HTMLDivElement>(null);

  async function handleAiGenerateControls(reg: Regulation) {
    setAiControlsLoading(true);
    try {
      const regPolicies = allPolicies.filter((p) => p.regulationId === reg.id);
      const res = await apiRequest("POST", "/api/ai/generate-compliance-controls", {
        regulationId: reg.id,
        regulationName: reg.name,
        regulationDescription: reg.description,
        jurisdiction: reg.jurisdiction,
        industry: reg.industry,
        existingPolicies: regPolicies.map((p) => ({ title: p.title, articleRef: p.articleRef })),
      });
      const data = await res.json();
      if (data.controls && Array.isArray(data.controls)) {
        let created = 0;
        for (const c of data.controls) {
          try {
            await apiRequest("POST", "/api/compliance-controls", {
              regulationId: reg.id,
              requirementRef: c.requirementRef || "General",
              requirementTitle: c.requirementTitle,
              almpControl: c.almpControl,
              controlModule: c.controlModule || "Governance",
              evidenceArtifact: c.evidenceArtifact,
              coverageStatus: c.coverageStatus || "partial",
              gapDescription: c.gapDescription || null,
              customerActionRequired: c.customerActionRequired || null,
            });
            created++;
          } catch { /* skip duplicates */ }
        }
        queryClient.invalidateQueries({ queryKey: ["/api/compliance-controls"] });
        toast({ title: `Generated ${created} compliance controls for ${reg.name}` });
      }
    } catch (e: any) {
      toast({ title: "AI generation failed", description: e.message, variant: "destructive" });
    } finally {
      setAiControlsLoading(false);
    }
  }

  const togglePolicyMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await apiRequest("PATCH", `/api/regulatory-policies/${id}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/regulatory-policies"] });
      toast({ title: "Policy updated" });
    },
  });

  const updateChangeMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/regulatory-changes/${id}`, { status, reviewedBy: "current_user" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/regulatory-changes"] });
      toast({ title: "Change status updated" });
    },
  });

  async function handleAiEnhanceRegulation(reg: Regulation) {
    setAiEnhancingReg(reg.id);
    try {
      const res = await apiRequest("POST", "/api/ai/enhance-regulation", {
        regulationName: reg.name,
        industry: reg.industry,
        jurisdictions: [reg.jurisdiction],
        requirements: [],
      });
      const data = await res.json();
      setAiRegEnhanceResult({ regId: reg.id, regName: reg.name, enriched: data.enriched });
      toast({ title: `AI Enhancement ready for ${reg.name}`, description: "Scroll down to see the full analysis" });
      setTimeout(() => {
        regEnhanceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (e: any) {
      toast({ title: "AI enhancement failed", description: e.message, variant: "destructive" });
    } finally {
      setAiEnhancingReg(null);
    }
  }

  async function handleAiGeneratePolicies(reg: Regulation) {
    setAiGenerating(reg.id);
    try {
      const res = await apiRequest("POST", "/api/ai/generate-regulatory-policy", {
        regulationId: reg.id,
        regulationName: reg.name,
        regulationDescription: reg.description,
        jurisdiction: reg.jurisdiction,
        industry: reg.industry,
      });
      const data = await res.json();
      if (data.policies && Array.isArray(data.policies)) {
        let created = 0;
        let failed = 0;
        for (const p of data.policies) {
          try {
            await apiRequest("POST", "/api/regulatory-policies", {
              regulationId: reg.id,
              title: p.title,
              articleRef: p.articleRef || "General",
              naturalLanguage: p.naturalLanguage,
              policyLanguage: p.policyLanguage || "opa",
              policyCode: p.policyCode,
              severity: p.severity || "medium",
              violationAction: p.violationAction || "warn",
              enforcementPoint: p.enforcementPoint || "runtime",
              evidenceRequired: p.evidenceRequired || [],
              enabled: true,
            });
            created++;
          } catch {
            failed++;
          }
        }
        queryClient.invalidateQueries({ queryKey: ["/api/regulatory-policies"] });
        if (failed > 0) {
          toast({ title: `Generated ${created} policies for ${reg.name}`, description: `${failed} failed to save`, variant: "destructive" });
        } else {
          toast({ title: `Generated ${created} policies for ${reg.name}` });
        }
        setSelectedRegulation(reg);
        setActiveTab("policies");
      }
    } catch (e: any) {
      toast({ title: "AI generation failed", description: e.message, variant: "destructive" });
    } finally {
      setAiGenerating(null);
    }
  }

  async function handleAiEnhancePolicy(policy: RegulatoryPolicy) {
    const reg = regulations.find((r) => r.id === policy.regulationId);
    setAiEnhancing(true);
    setAiEnhanceResult(null);
    try {
      const res = await apiRequest("POST", "/api/ai/enhance-regulatory-policy", {
        title: policy.title,
        naturalLanguage: policy.naturalLanguage,
        policyLanguage: policy.policyLanguage,
        policyCode: policy.policyCode,
        severity: policy.severity,
        regulationName: reg?.name,
      });
      const data = await res.json();
      setAiEnhanceResult(data);
    } catch (e: any) {
      toast({ title: "AI enhancement failed", description: e.message, variant: "destructive" });
    } finally {
      setAiEnhancing(false);
    }
  }

  async function applyEnhancement(policy: RegulatoryPolicy, enhancement: any) {
    try {
      const updatedFields = {
        policyCode: enhancement.enhancedCode || policy.policyCode,
        naturalLanguage: enhancement.enhancedNaturalLanguage || policy.naturalLanguage,
        severity: enhancement.suggestedSeverity || policy.severity,
        violationAction: enhancement.suggestedViolationAction || policy.violationAction,
      };
      await apiRequest("PATCH", `/api/regulatory-policies/${policy.id}`, updatedFields);
      queryClient.invalidateQueries({ queryKey: ["/api/regulatory-policies"] });
      setAiEnhanceResult(null);
      setSelectedPolicy({ ...policy, ...updatedFields });
      toast({ title: "Enhancement applied successfully" });
    } catch (e: any) {
      toast({ title: "Failed to apply enhancement", description: e.message, variant: "destructive" });
    }
  }

  async function handleAnalyzeGaps() {
    setAiGapLoading(true);
    setAiGapResult(null);
    try {
      const regName = selectedRegulation?.name;
      const res = await apiRequest("POST", "/api/ai/analyze-compliance-gaps", {
        controls: filteredControls,
        regulationName: regName,
      });
      const data = await res.json();
      setAiGapResult(data);
    } catch (e: any) {
      toast({ title: "Gap analysis failed", description: e.message, variant: "destructive" });
    } finally {
      setAiGapLoading(false);
    }
  }

  async function handleAssessImpact(change: RegulatoryChange) {
    const reg = regulations.find((r) => r.id === change.regulationId);
    setAiImpactLoading(change.id);
    try {
      const changePolicies = allPolicies.filter((p) => p.regulationId === change.regulationId);
      const changeControls = allControls.filter((c) => c.regulationId === change.regulationId);
      const res = await apiRequest("POST", "/api/ai/assess-change-impact", {
        changeTitle: change.changeTitle,
        changeDescription: change.changeDescription,
        changeType: change.changeType,
        regulationName: reg?.name,
        existingPolicies: changePolicies,
        existingControls: changeControls,
      });
      const data = await res.json();
      setAiImpactResults((prev) => ({ ...prev, [change.id]: data }));
    } catch (e: any) {
      toast({ title: "Impact analysis failed", description: e.message, variant: "destructive" });
    } finally {
      setAiImpactLoading(null);
    }
  }

  async function handlePushToGovernance(policy: RegulatoryPolicy) {
    setPushingPolicy(policy.id);
    try {
      await apiRequest("POST", `/api/regulatory-policies/${policy.id}/push-to-governance`);
      toast({ title: "Policy pushed to Governance", description: "Created as operational policy in Governance > Policies tab" });
    } catch (e: any) {
      toast({ title: "Push failed", description: e.message, variant: "destructive" });
    } finally {
      setPushingPolicy(null);
    }
  }

  const filteredRegulations = useMemo(() => {
    return regulations.filter((r) => {
      if (searchFilter && !r.name.toLowerCase().includes(searchFilter.toLowerCase()) && !r.fullName.toLowerCase().includes(searchFilter.toLowerCase())) return false;
      if (jurisdictionFilter !== "all" && r.jurisdiction !== jurisdictionFilter) return false;
      if (industryFilter !== "all" && r.industry !== industryFilter) return false;
      return true;
    });
  }, [regulations, searchFilter, jurisdictionFilter, industryFilter]);

  const filteredPolicies = useMemo(() => {
    let policies = allPolicies;
    if (selectedRegulation) {
      policies = policies.filter((p) => p.regulationId === selectedRegulation.id);
    }
    if (searchFilter) {
      policies = policies.filter((p) =>
        p.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
        p.articleRef.toLowerCase().includes(searchFilter.toLowerCase())
      );
    }
    return policies;
  }, [allPolicies, selectedRegulation, searchFilter]);

  const filteredControls = useMemo(() => {
    let controls = allControls;
    if (selectedRegulation) {
      controls = controls.filter((c) => c.regulationId === selectedRegulation.id);
    }
    return controls;
  }, [allControls, selectedRegulation]);

  const filteredChanges = useMemo(() => {
    let changes = allChanges;
    if (selectedRegulation) {
      changes = changes.filter((c) => c.regulationId === selectedRegulation.id);
    }
    if (changeStatusFilter !== "all") {
      changes = changes.filter((c) => c.status === changeStatusFilter);
    }
    return changes;
  }, [allChanges, selectedRegulation, changeStatusFilter]);

  const stats = useMemo(() => {
    const totalPolicies = allPolicies.length;
    const enabledPolicies = allPolicies.filter((p) => p.enabled).length;
    const criticalPolicies = allPolicies.filter((p) => p.severity === "critical").length;
    const fullCoverage = allControls.filter((c) => c.coverageStatus === "full").length;
    const totalControls = allControls.length;
    const coveragePercent = totalControls > 0 ? Math.round((fullCoverage / totalControls) * 100) : 0;
    const pendingChanges = allChanges.filter((c) => c.status === "pending_review").length;
    return { totalPolicies, enabledPolicies, criticalPolicies, fullCoverage, totalControls, coveragePercent, pendingChanges };
  }, [allPolicies, allControls, allChanges]);

  const isLoading = regsLoading || policiesLoading || controlsLoading || changesLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (regulations.length === 0) {
    return (
      <div className="p-6 space-y-4" data-testid="page-policy-engine-empty">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gavel className="w-6 h-6" />
            Regulatory Policy-as-Code Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Encode regulatory requirements as machine-executable policies with OPA Rego and Cedar
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted">
              <Sparkles className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-center space-y-2 max-w-lg">
              <h2 className="text-lg font-semibold">No Regulations Loaded</h2>
              <p className="text-sm text-muted-foreground">
                Your regulation library is empty. Initialize it with a curated set of 10 major regulations
                (EU AI Act, GDPR, HIPAA, SOX, PCI DSS, ISO 42001, NIST AI RMF, MiFID II, FDA AI/ML, ISA 62443),
                7 executable policies with OPA Rego and Cedar code, 14 compliance controls, and 4 regulatory change trackers.
              </p>
            </div>
            <Button
              size="lg"
              onClick={handleInitializeLibrary}
              disabled={initializingLibrary}
              data-testid="button-ai-initialize-library"
            >
              {initializingLibrary ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Initializing Library...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" />AI Initialize Regulation Library</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4" data-testid="page-policy-engine">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Gavel className="w-6 h-6" />
            Regulatory Policy-as-Code Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Encode regulatory requirements as machine-executable policies with OPA Rego and Cedar
          </p>
        </div>
        {selectedRegulation && (
          <Button variant="outline" size="sm" onClick={() => setSelectedRegulation(null)} data-testid="button-clear-filter">
            <XCircle className="w-3.5 h-3.5 mr-1.5" />
            Clear: {selectedRegulation.name}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Total Regulations"
          value={regulations.length}
          icon={Scale}
          subtitle={`${regulations.filter((r) => r.enforcementStatus === "active").length} active`}
        />
        <StatCard
          title="Encoded Policies"
          value={stats.totalPolicies}
          icon={FileCode}
          subtitle={`${stats.enabledPolicies} enabled, ${stats.criticalPolicies} critical`}
        />
        <StatCard
          title="Compliance Coverage"
          value={`${stats.coveragePercent}%`}
          icon={ShieldCheck}
          subtitle={`${stats.fullCoverage}/${stats.totalControls} controls fully mapped`}
        />
        <StatCard
          title="Pending Changes"
          value={stats.pendingChanges}
          icon={AlertTriangle}
          subtitle={`${allChanges.length} total tracked`}
        />
      </div>

      <Tabs value={activeTab} onValueChange={(tab) => {
        setActiveTab(tab);
        setSelectedPolicy(null);
        setAiEnhanceResult(null);
        setAiGapResult(null);
        setAiRegEnhanceResult(null);
      }}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="regulations" data-testid="tab-regulations">
            <Scale className="w-3.5 h-3.5 mr-1.5" />
            Regulation Library
          </TabsTrigger>
          <TabsTrigger value="policies" data-testid="tab-policies-code">
            <Code className="w-3.5 h-3.5 mr-1.5" />
            Policy Editor
          </TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance-matrix">
            <Layers className="w-3.5 h-3.5 mr-1.5" />
            Compliance Matrix
          </TabsTrigger>
          <TabsTrigger value="changes" data-testid="tab-change-tracker">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Change Tracker
          </TabsTrigger>
        </TabsList>

        <TabsContent value="regulations" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search regulations..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-9"
                data-testid="input-search-regulations"
              />
            </div>
            <Select value={jurisdictionFilter} onValueChange={setJurisdictionFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-jurisdiction">
                <Globe className="w-3.5 h-3.5 mr-1.5 text-muted-foreground shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jurisdictions</SelectItem>
                <SelectItem value="EU">EU</SelectItem>
                <SelectItem value="US">US</SelectItem>
                <SelectItem value="Global">Global</SelectItem>
              </SelectContent>
            </Select>
            <Select value={industryFilter} onValueChange={setIndustryFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-industry">
                <Building2 className="w-3.5 h-3.5 mr-1.5 text-muted-foreground shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Industries</SelectItem>
                <SelectItem value="cross_industry">Cross-Industry</SelectItem>
                <SelectItem value="healthcare">Healthcare</SelectItem>
                <SelectItem value="financial_services">Financial Services</SelectItem>
                <SelectItem value="manufacturing">Manufacturing</SelectItem>
                <SelectItem value="retail">Retail</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredRegulations.map((reg) => {
              const regPolicies = allPolicies.filter((p) => p.regulationId === reg.id);
              const regControls = allControls.filter((c) => c.regulationId === reg.id);
              const regChanges = allChanges.filter((c) => c.regulationId === reg.id);
              const isSelected = selectedRegulation?.id === reg.id;
              return (
                <Card
                  key={reg.id}
                  className={`cursor-pointer hover-elevate ${isSelected ? "ring-2 ring-primary" : ""}`}
                  onClick={() => {
                    setSelectedRegulation(isSelected ? null : reg);
                    if (!isSelected) setActiveTab("policies");
                  }}
                  data-testid={`card-regulation-${reg.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-semibold leading-tight">{reg.name}</CardTitle>
                      <Badge
                        variant={reg.enforcementStatus === "active" ? "default" : "secondary"}
                        className="text-[10px] shrink-0"
                      >
                        {reg.enforcementStatus}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{reg.fullName}</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground line-clamp-2">{reg.description}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {jurisdictionBadge(reg.jurisdiction)}
                      <Badge variant="outline" className="text-[10px]">
                        <Building2 className="w-3 h-3 mr-1" />
                        {reg.industry.replace(/_/g, " ")}
                      </Badge>
                      {reg.effectiveDate && (
                        <Badge variant="outline" className="text-[10px]">
                          {new Date(reg.effectiveDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        v{reg.version}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <FileCode className="w-3 h-3" />
                          {regPolicies.length} policies
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          {regControls.length} controls
                        </span>
                      </div>
                      {regChanges.length > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          {regChanges.filter((c) => c.status === "pending_review").length} changes
                        </Badge>
                      )}
                    </div>
                    {reg.modulesAffected && (reg.modulesAffected as string[]).length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {(reg.modulesAffected as string[]).slice(0, 4).map((m) => (
                          <Badge key={m} variant="outline" className="text-[9px] px-1.5 py-0">{m}</Badge>
                        ))}
                        {(reg.modulesAffected as string[]).length > 4 && (
                          <span className="text-[10px] text-muted-foreground">+{(reg.modulesAffected as string[]).length - 4}</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled={aiEnhancingReg === reg.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAiEnhanceRegulation(reg);
                        }}
                        data-testid={`button-ai-enhance-reg-${reg.id}`}
                      >
                        {aiEnhancingReg === reg.id ? (
                          <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Enhancing...</>
                        ) : (
                          <><Sparkles className="w-3 h-3 mr-1.5" />AI Enhance</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled={aiGenerating === reg.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAiGeneratePolicies(reg);
                        }}
                        data-testid={`button-ai-generate-${reg.id}`}
                      >
                        {aiGenerating === reg.id ? (
                          <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Generating...</>
                        ) : (
                          <><Sparkles className="w-3 h-3 mr-1.5" />{regPolicies.length > 0 ? "Generate More" : "Generate Policies"}</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredRegulations.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Scale className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">No regulations match your filters</p>
              </CardContent>
            </Card>
          )}

          {aiRegEnhanceResult && (
            <Card ref={regEnhanceRef} className="border-primary/30" data-testid="panel-reg-enhancement">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    AI Enhancement: {aiRegEnhanceResult.regName}
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAiRegEnhanceResult(null)}
                    data-testid="button-close-reg-enhancement"
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {aiRegEnhanceResult.enriched.overview && (
                  <div>
                    <h4 className="font-medium text-xs text-muted-foreground mb-1">Overview</h4>
                    <p className="text-sm leading-relaxed">{aiRegEnhanceResult.enriched.overview}</p>
                  </div>
                )}

                {aiRegEnhanceResult.enriched.keyRequirements?.length > 0 && (
                  <div>
                    <h4 className="font-medium text-xs text-muted-foreground mb-2">Key Requirements</h4>
                    <div className="space-y-2">
                      {aiRegEnhanceResult.enriched.keyRequirements.map((req: any, i: number) => (
                        <div key={i} className="border rounded-md p-2.5 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-xs">{req.title}</span>
                            {severityBadge(req.severity)}
                          </div>
                          <p className="text-xs text-muted-foreground">{req.description}</p>
                          {req.implementationSteps?.length > 0 && (
                            <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                              {req.implementationSteps.map((step: string, j: number) => (
                                <li key={j} className="flex items-start gap-1.5">
                                  <ArrowRight className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                                  {step}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiRegEnhanceResult.enriched.aiAgentImplications?.length > 0 && (
                  <div>
                    <h4 className="font-medium text-xs text-muted-foreground mb-1">AI Agent Implications</h4>
                    <ul className="space-y-1">
                      {aiRegEnhanceResult.enriched.aiAgentImplications.map((imp: string, i: number) => (
                        <li key={i} className="text-xs flex items-start gap-1.5">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-yellow-500" />
                          {imp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiRegEnhanceResult.enriched.complianceChecklist?.length > 0 && (
                  <div>
                    <h4 className="font-medium text-xs text-muted-foreground mb-2">Compliance Checklist</h4>
                    <div className="space-y-1">
                      {aiRegEnhanceResult.enriched.complianceChecklist.map((item: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Badge
                            variant={item.priority === "must" ? "default" : item.priority === "should" ? "secondary" : "outline"}
                            className="text-[10px] shrink-0"
                          >
                            {item.priority}
                          </Badge>
                          <span>{item.item}</span>
                          <span className="text-muted-foreground ml-auto shrink-0">{item.category}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiRegEnhanceResult.enriched.penaltiesAndRisks && (
                  <div>
                    <h4 className="font-medium text-xs text-muted-foreground mb-1">Penalties & Risks</h4>
                    <p className="text-xs text-muted-foreground">{aiRegEnhanceResult.enriched.penaltiesAndRisks}</p>
                  </div>
                )}

                {aiRegEnhanceResult.enriched.automationOpportunities?.length > 0 && (
                  <div>
                    <h4 className="font-medium text-xs text-muted-foreground mb-1">Automation Opportunities</h4>
                    <ul className="space-y-1">
                      {aiRegEnhanceResult.enriched.automationOpportunities.map((opp: string, i: number) => (
                        <li key={i} className="text-xs flex items-start gap-1.5">
                          <Zap className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                          {opp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="policies" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search policies by title or article..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-9"
                data-testid="input-search-policies"
              />
            </div>
            {selectedRegulation && (
              <Badge variant="secondary" className="text-xs">
                Filtered: {selectedRegulation.name}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground px-1">
                Policies ({filteredPolicies.length})
              </h3>
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
                {filteredPolicies.map((policy) => {
                  const reg = regulations.find((r) => r.id === policy.regulationId);
                  const isActive = selectedPolicy?.id === policy.id;
                  return (
                    <Card
                      key={policy.id}
                      className={`cursor-pointer hover-elevate ${isActive ? "ring-2 ring-primary" : ""}`}
                      onClick={() => setSelectedPolicy(policy)}
                      data-testid={`card-policy-${policy.id}`}
                    >
                      <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate">{policy.title}</p>
                            <p className="text-[10px] text-muted-foreground">{policy.articleRef}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {severityBadge(policy.severity)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {reg && (
                            <Badge variant="outline" className="text-[9px]">{reg.name}</Badge>
                          )}
                          <Badge variant="outline" className="text-[9px] gap-0.5">
                            <Code className="w-2.5 h-2.5" />
                            {policy.policyLanguage}
                          </Badge>
                          {actionBadge(policy.violationAction)}
                          {!policy.enabled && (
                            <Badge variant="outline" className="text-[9px] opacity-50">disabled</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {filteredPolicies.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <FileCode className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No policies found</p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-2">
              {selectedPolicy ? (
                <Card data-testid="panel-policy-detail">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base">{selectedPolicy.title}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">{selectedPolicy.articleRef}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">
                                {selectedPolicy.enabled ? "Enabled" : "Disabled"}
                              </span>
                              <Switch
                                checked={selectedPolicy.enabled ?? false}
                                onCheckedChange={(checked) => {
                                  togglePolicyMutation.mutate({ id: selectedPolicy.id, enabled: checked });
                                  setSelectedPolicy({ ...selectedPolicy, enabled: checked });
                                }}
                                data-testid="switch-policy-enabled"
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Toggle policy enforcement</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">Natural Language Rule</h4>
                      <p className="text-sm leading-relaxed bg-muted/50 rounded-md p-3">
                        {selectedPolicy.naturalLanguage}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {severityBadge(selectedPolicy.severity)}
                      {actionBadge(selectedPolicy.violationAction)}
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Code className="w-3 h-3" />
                        {selectedPolicy.policyLanguage.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Zap className="w-3 h-3" />
                        {selectedPolicy.enforcementPoint}
                      </Badge>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <h4 className="text-xs font-medium text-muted-foreground">
                          Policy Code ({selectedPolicy.policyLanguage.toUpperCase()})
                        </h4>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedPolicy.policyCode);
                            toast({ title: "Copied to clipboard" });
                          }}
                          data-testid="button-copy-code"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <pre className="text-[11px] bg-muted rounded-md p-3 overflow-x-auto max-h-[300px] overflow-y-auto font-mono leading-relaxed" data-testid="code-policy">
                        {selectedPolicy.policyCode}
                      </pre>
                    </div>

                    {selectedPolicy.evidenceRequired && (selectedPolicy.evidenceRequired as string[]).length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-1.5">Evidence Required</h4>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(selectedPolicy.evidenceRequired as string[]).map((ev) => (
                            <Badge key={ev} variant="outline" className="text-[10px]">
                              <BookOpen className="w-3 h-3 mr-1" />
                              {ev.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={aiEnhancing}
                        onClick={() => handleAiEnhancePolicy(selectedPolicy)}
                        data-testid="button-ai-enhance-policy"
                      >
                        {aiEnhancing ? (
                          <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Enhancing...</>
                        ) : (
                          <><Sparkles className="w-3 h-3 mr-1.5" />AI Enhance</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pushingPolicy === selectedPolicy.id}
                        onClick={() => handlePushToGovernance(selectedPolicy)}
                        data-testid="button-push-governance"
                      >
                        {pushingPolicy === selectedPolicy.id ? (
                          <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Pushing...</>
                        ) : (
                          <><Send className="w-3 h-3 mr-1.5" />Push to Governance</>
                        )}
                      </Button>
                    </div>

                    {aiEnhanceResult && (
                      <div className="border rounded-md p-3 space-y-3 bg-muted/30">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-semibold flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-primary" />
                            AI Enhancement Preview
                          </h4>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              onClick={() => applyEnhancement(selectedPolicy, aiEnhanceResult)}
                              data-testid="button-apply-enhancement"
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Apply
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAiEnhanceResult(null)}
                              data-testid="button-dismiss-enhancement"
                            >
                              Dismiss
                            </Button>
                          </div>
                        </div>

                        {aiEnhanceResult.improvementNotes && (
                          <div>
                            <h5 className="text-[11px] font-medium text-muted-foreground mb-1">Improvements</h5>
                            <ul className="space-y-1">
                              {(aiEnhanceResult.improvementNotes as string[]).map((note: string, i: number) => (
                                <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                                  <Lightbulb className="w-3 h-3 shrink-0 mt-0.5 text-yellow-500" />
                                  {note}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {aiEnhanceResult.enhancedCode && (
                          <div>
                            <h5 className="text-[11px] font-medium text-muted-foreground mb-1">Enhanced Code</h5>
                            <pre className="text-[11px] bg-muted rounded-md p-3 overflow-x-auto max-h-[200px] overflow-y-auto font-mono leading-relaxed" data-testid="code-enhanced-policy">
                              {aiEnhanceResult.enhancedCode}
                            </pre>
                          </div>
                        )}

                        {aiEnhanceResult.suggestedSeverity && (
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="text-muted-foreground">Suggested severity:</span>
                            {severityBadge(aiEnhanceResult.suggestedSeverity)}
                            {aiEnhanceResult.suggestedViolationAction && (
                              <>{actionBadge(aiEnhanceResult.suggestedViolationAction)}</>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Code className="w-10 h-10 mb-3 opacity-40" />
                    <p className="text-sm font-medium">Select a policy to view details</p>
                    <p className="text-xs mt-1">Click any policy from the list to see its code and configuration</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">Compliance Control Matrix</h3>
              {selectedRegulation && (
                <Badge variant="secondary" className="text-xs">
                  {selectedRegulation.name}
                </Badge>
              )}
              {selectedRegulation && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={aiControlsLoading}
                  onClick={() => handleAiGenerateControls(selectedRegulation)}
                  data-testid="button-ai-generate-controls-header"
                >
                  {aiControlsLoading ? (
                    <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Generating...</>
                  ) : (
                    <><Sparkles className="w-3 h-3 mr-1.5" />AI Generate Controls</>
                  )}
                </Button>
              )}
              {filteredControls.some((c) => c.coverageStatus === "partial" || c.coverageStatus === "gap") && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={aiGapLoading}
                  onClick={handleAnalyzeGaps}
                  data-testid="button-ai-analyze-gaps"
                >
                  {aiGapLoading ? (
                    <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Analyzing...</>
                  ) : (
                    <><Sparkles className="w-3 h-3 mr-1.5" />AI Analyze Gaps</>
                  )}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-green-500" />
                Full: {filteredControls.filter((c) => c.coverageStatus === "full").length}
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-yellow-500" />
                Partial: {filteredControls.filter((c) => c.coverageStatus === "partial").length}
              </span>
              <span className="flex items-center gap-1">
                <XCircle className="w-3 h-3 text-red-500" />
                Gap: {filteredControls.filter((c) => c.coverageStatus === "gap").length}
              </span>
            </div>
          </div>

          {filteredControls.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground">Overall Coverage</span>
                <span className="text-xs font-medium">
                  {Math.round((filteredControls.filter((c) => c.coverageStatus === "full").length / filteredControls.length) * 100)}%
                </span>
              </div>
              <Progress
                value={(filteredControls.filter((c) => c.coverageStatus === "full").length / filteredControls.length) * 100}
                className="h-2"
              />
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-[100px]">Ref</TableHead>
                    <TableHead className="text-xs">Requirement</TableHead>
                    <TableHead className="text-xs">ALMP Control</TableHead>
                    <TableHead className="text-xs w-[110px]">Module</TableHead>
                    <TableHead className="text-xs">Evidence Artifact</TableHead>
                    <TableHead className="text-xs w-[90px]">Coverage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredControls.map((control) => {
                    const reg = regulations.find((r) => r.id === control.regulationId);
                    return (
                      <TableRow key={control.id} data-testid={`row-control-${control.id}`}>
                        <TableCell className="text-xs font-mono">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">{control.requirementRef}</span>
                            </TooltipTrigger>
                            <TooltipContent>{reg?.name}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-medium">{control.requirementTitle}</p>
                          {control.gapDescription && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">{control.gapDescription}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{control.almpControl}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{control.controlModule}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{control.evidenceArtifact}</TableCell>
                        <TableCell>{coverageBadge(control.coverageStatus)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {filteredControls.length === 0 && (
                <div className="flex flex-col items-center text-center py-12 text-muted-foreground gap-3">
                  <Layers className="w-8 h-8 opacity-40" />
                  <div>
                    <p className="text-sm font-medium">No compliance controls found</p>
                    <p className="text-xs mt-1">
                      {selectedRegulation
                        ? `No controls mapped for ${selectedRegulation.name} yet.`
                        : "Select a regulation first, then generate compliance controls."}
                    </p>
                  </div>
                  {selectedRegulation && (
                    <Button
                      size="sm"
                      disabled={aiControlsLoading}
                      onClick={() => handleAiGenerateControls(selectedRegulation)}
                      data-testid="button-ai-generate-controls"
                    >
                      {aiControlsLoading ? (
                        <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Generating Controls...</>
                      ) : (
                        <><Sparkles className="w-3 h-3 mr-1.5" />AI Generate Compliance Controls</>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {filteredControls.some((c) => c.customerActionRequired) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  Customer Actions Required
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {filteredControls
                  .filter((c) => c.customerActionRequired)
                  .map((c) => (
                    <div key={c.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                      <CircleDot className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium">{c.requirementRef} — {c.requirementTitle}</p>
                        <p className="text-[11px] text-muted-foreground">{c.customerActionRequired}</p>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          {aiGapResult && (
            <Card data-testid="card-ai-gap-analysis">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    AI Gap Analysis & Remediation
                  </CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => setAiGapResult(null)} data-testid="button-dismiss-gap-analysis">
                    <XCircle className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {aiGapResult.summary && (
                  <p className="text-xs text-muted-foreground mt-1">{aiGapResult.summary}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {(aiGapResult.remediations || []).map((rem: any, i: number) => (
                  <div key={i} className="border rounded-md p-3 space-y-2" data-testid={`gap-remediation-${i}`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-xs font-semibold">{rem.controlRef} — {rem.controlTitle}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {coverageBadge(rem.currentStatus)}
                          <Badge variant="outline" className="text-[10px]">
                            <Target className="w-3 h-3 mr-1" />
                            {rem.priority} priority
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            <Wrench className="w-3 h-3 mr-1" />
                            {rem.estimatedEffort} effort
                          </Badge>
                        </div>
                      </div>
                    </div>
                    {rem.gapAnalysis && (
                      <p className="text-[11px] text-muted-foreground">{rem.gapAnalysis}</p>
                    )}
                    {rem.suggestedActions && rem.suggestedActions.length > 0 && (
                      <div>
                        <h5 className="text-[11px] font-medium mb-1 flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" />
                          Suggested Actions
                        </h5>
                        <ul className="space-y-1">
                          {rem.suggestedActions.map((action: string, j: number) => (
                            <li key={j} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                              <CircleDot className="w-3 h-3 shrink-0 mt-0.5 text-primary" />
                              {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {rem.platformModules && rem.platformModules.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">Modules:</span>
                        {rem.platformModules.map((m: string) => (
                          <Badge key={m} variant="outline" className="text-[9px]">{m}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="changes" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-medium">Regulatory Change Tracker</h3>
            {selectedRegulation && (
              <Badge variant="secondary" className="text-xs">
                {selectedRegulation.name}
              </Badge>
            )}
            <div className="flex-1" />
            <Select value={changeStatusFilter} onValueChange={setChangeStatusFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-change-status">
                <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {filteredChanges.map((change) => {
              const reg = regulations.find((r) => r.id === change.regulationId);
              const recs = change.recommendedUpdates as { actions?: string[] } | null;
              return (
                <Card key={change.id} data-testid={`card-change-${change.id}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold">{change.changeTitle}</h4>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {reg && <Badge variant="outline" className="text-[10px]">{reg.name}</Badge>}
                          {changeTypeBadge(change.changeType)}
                          {impactBadge(change.impactLevel)}
                          {statusBadge(change.status)}
                        </div>
                      </div>
                      {change.effectiveDate && (
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-muted-foreground">Effective</p>
                          <p className="text-xs font-medium">
                            {new Date(change.effectiveDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {change.changeDescription}
                    </p>

                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        {change.affectedAgentCount} agents affected
                      </span>
                      <span className="flex items-center gap-1">
                        <BarChart3 className="w-3 h-3" />
                        {change.affectedOutcomeCount} outcomes affected
                      </span>
                    </div>

                    {recs?.actions && recs.actions.length > 0 && (
                      <div className="bg-muted/50 rounded-md p-3">
                        <h5 className="text-[11px] font-medium mb-1.5 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          Recommended Actions
                        </h5>
                        <ul className="space-y-1">
                          {recs.actions.map((action, i) => (
                            <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                              <CircleDot className="w-3 h-3 shrink-0 mt-0.5" />
                              {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={aiImpactLoading === change.id}
                        onClick={() => handleAssessImpact(change)}
                        data-testid={`button-ai-impact-${change.id}`}
                      >
                        {aiImpactLoading === change.id ? (
                          <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Analyzing...</>
                        ) : (
                          <><Sparkles className="w-3 h-3 mr-1.5" />AI Impact Analysis</>
                        )}
                      </Button>
                      {change.status === "pending_review" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => updateChangeMutation.mutate({ id: change.id, status: "in_progress" })}
                            data-testid={`button-acknowledge-${change.id}`}
                          >
                            <Play className="w-3 h-3 mr-1" />
                            Acknowledge
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateChangeMutation.mutate({ id: change.id, status: "dismissed" })}
                            data-testid={`button-dismiss-${change.id}`}
                          >
                            Dismiss
                          </Button>
                        </>
                      )}
                      {change.status === "in_progress" && (
                        <Button
                          size="sm"
                          onClick={() => updateChangeMutation.mutate({ id: change.id, status: "completed" })}
                          data-testid={`button-complete-${change.id}`}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Mark Complete
                        </Button>
                      )}
                    </div>

                    {aiImpactResults[change.id] && (
                      <div className="border rounded-md p-3 space-y-3 bg-muted/30" data-testid={`card-ai-impact-${change.id}`}>
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="text-xs font-semibold flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-primary" />
                            AI Impact Analysis
                          </h5>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAiImpactResults((prev) => {
                              const next = { ...prev };
                              delete next[change.id];
                              return next;
                            })}
                            data-testid={`button-dismiss-impact-${change.id}`}
                          >
                            <XCircle className="w-3 h-3" />
                          </Button>
                        </div>

                        {aiImpactResults[change.id].impactSummary && (
                          <p className="text-[11px] text-muted-foreground">{aiImpactResults[change.id].impactSummary}</p>
                        )}

                        {aiImpactResults[change.id].riskAssessment && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">Risk:</span>
                            {impactBadge(aiImpactResults[change.id].riskAssessment.overallRisk)}
                            <Badge variant="outline" className="text-[10px]">
                              <Wrench className="w-3 h-3 mr-1" />
                              {aiImpactResults[change.id].estimatedEffort} effort
                            </Badge>
                          </div>
                        )}

                        {aiImpactResults[change.id].affectedPolicies?.length > 0 && (
                          <div>
                            <h6 className="text-[11px] font-medium mb-1 flex items-center gap-1">
                              <FileCode className="w-3 h-3" />
                              Affected Policies ({aiImpactResults[change.id].affectedPolicies.length})
                            </h6>
                            <ul className="space-y-1">
                              {aiImpactResults[change.id].affectedPolicies.map((p: any, j: number) => (
                                <li key={j} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                                  <CircleDot className="w-3 h-3 shrink-0 mt-0.5" />
                                  <span><span className="font-medium">{p.policyTitle}:</span> {p.impactDescription}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {aiImpactResults[change.id].recommendedTimeline && (
                          <div className="space-y-2">
                            {aiImpactResults[change.id].recommendedTimeline.immediateActions?.length > 0 && (
                              <div>
                                <h6 className="text-[11px] font-medium mb-1 text-red-600 dark:text-red-400">Immediate Actions</h6>
                                <ul className="space-y-1">
                                  {aiImpactResults[change.id].recommendedTimeline.immediateActions.map((a: string, j: number) => (
                                    <li key={j} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                                      <ArrowRight className="w-3 h-3 shrink-0 mt-0.5 text-red-500" />
                                      {a}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {aiImpactResults[change.id].recommendedTimeline.shortTermActions?.length > 0 && (
                              <div>
                                <h6 className="text-[11px] font-medium mb-1 text-yellow-600 dark:text-yellow-400">Short-Term (30 days)</h6>
                                <ul className="space-y-1">
                                  {aiImpactResults[change.id].recommendedTimeline.shortTermActions.map((a: string, j: number) => (
                                    <li key={j} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                                      <ArrowRight className="w-3 h-3 shrink-0 mt-0.5 text-yellow-500" />
                                      {a}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {aiImpactResults[change.id].newPoliciesNeeded?.length > 0 && (
                          <div>
                            <h6 className="text-[11px] font-medium mb-1 flex items-center gap-1">
                              <Lightbulb className="w-3 h-3 text-yellow-500" />
                              New Policies Recommended
                            </h6>
                            <ul className="space-y-1">
                              {aiImpactResults[change.id].newPoliciesNeeded.map((p: any, j: number) => (
                                <li key={j} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                                  <CircleDot className="w-3 h-3 shrink-0 mt-0.5 text-primary" />
                                  <span><span className="font-medium">{p.title}:</span> {p.description}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredChanges.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <RefreshCw className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">No regulatory changes match your filters</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
