import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Shield,
  Plus,
  Search,
  FileCode,
  Lock,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Filter,
  Calendar,
  BarChart2,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  FileText,
  Target,
  XCircle,
  ChevronDown,
  ChevronRight,
  Users,
  Ban,
  Scale,
  Sparkles,
  BookOpen,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { useEvidenceDrawer } from "@/components/evidence-drawer";
import { usePermission, PermissionGate } from "@/components/role-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Policy, AuditEvent, Approval, Agent, PolicyException, ComplianceReport } from "@shared/schema";

const domainIcons: Record<string, typeof Shield> = {
  data_handling: Lock,
  tool_permissions: FileCode,
  logging: Eye,
  allowed_actions: CheckCircle,
  content_boundaries: AlertTriangle,
};

function getEventDotColor(action: string): string {
  const a = action.toLowerCase();
  if (a.includes("violation") || a.includes("blocked")) return "bg-red-500";
  if (a.includes("delete") || a.includes("remove")) return "bg-red-500";
  if (a.includes("create")) return "bg-emerald-500";
  if (a.includes("update") || a.includes("modify")) return "bg-blue-500";
  return "bg-muted-foreground";
}

const frameworkColors: Record<string, string> = {
  SOC2: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  EU_AI_ACT: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20",
  GDPR: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

const toolAccessTiers = [
  {
    tier: "OPEN",
    color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    description: "Unrestricted access to low-risk, read-only tools. No approval needed.",
    tools: ["Web Search", "Documentation Lookup", "Public API Read", "Log Viewer", "Status Check"],
  },
  {
    tier: "STANDARD",
    color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
    description: "Access to general-purpose tools with basic audit logging. Standard approval flow.",
    tools: ["Database Read", "File Upload", "Email Send", "Notification Dispatch", "Report Generation"],
  },
  {
    tier: "RESTRICTED",
    color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
    description: "Elevated access requiring explicit approval. All actions are logged and reviewed.",
    tools: ["Database Write", "User Data Access", "Payment Processing", "External API Write", "Config Modify"],
  },
  {
    tier: "CRITICAL",
    color: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
    description: "Highest-risk tools with mandatory human-in-the-loop approval for every invocation.",
    tools: ["Data Deletion", "Production Deploy", "Secret Rotation", "Access Revocation", "Schema Migration"],
  },
];

interface EthicalRule {
  id: string;
  name: string;
  description: string;
  severity: "critical" | "high" | "medium";
  enabled: boolean;
}

interface EthicalCategory {
  name: string;
  icon: typeof Shield;
  rules: EthicalRule[];
}

const initialEthicalBoundaries: EthicalCategory[] = [
  {
    name: "Content Boundaries",
    icon: Ban,
    rules: [
      { id: "cb-1", name: "Hate Speech Prevention", description: "Prohibit generation of content targeting protected groups", severity: "critical", enabled: true },
      { id: "cb-2", name: "Violence Restriction", description: "Block generation of violent or harmful content", severity: "critical", enabled: true },
      { id: "cb-3", name: "Personal Data Exposure", description: "Prevent leaking PII in agent outputs", severity: "critical", enabled: true },
      { id: "cb-4", name: "Misinformation Guard", description: "Flag and prevent generation of verifiably false claims", severity: "high", enabled: true },
    ],
  },
  {
    name: "Bias Detection",
    icon: Scale,
    rules: [
      { id: "bd-1", name: "Demographic Fairness", description: "Ensure equal treatment across demographic groups", severity: "critical", enabled: true },
      { id: "bd-2", name: "Representation Balance", description: "Monitor output diversity and representation metrics", severity: "high", enabled: true },
      { id: "bd-3", name: "Stereotyping Prevention", description: "Detect and block stereotypical associations in outputs", severity: "high", enabled: true },
      { id: "bd-4", name: "Language Neutrality", description: "Use inclusive and neutral language in all responses", severity: "medium", enabled: true },
    ],
  },
  {
    name: "Transparency Requirements",
    icon: Eye,
    rules: [
      { id: "tr-1", name: "AI Disclosure", description: "Agents must identify themselves as AI when asked", severity: "critical", enabled: true },
      { id: "tr-2", name: "Reasoning Provision", description: "Provide clear reasoning for decisions and recommendations", severity: "high", enabled: true },
      { id: "tr-3", name: "Source Citation", description: "Cite sources when making factual claims", severity: "medium", enabled: true },
      { id: "tr-4", name: "Confidence Indication", description: "Indicate confidence levels for uncertain outputs", severity: "medium", enabled: false },
    ],
  },
  {
    name: "Fairness Constraints",
    icon: Users,
    rules: [
      { id: "fc-1", name: "Equal Treatment", description: "Apply consistent standards regardless of user attributes", severity: "critical", enabled: true },
      { id: "fc-2", name: "Protected Attribute Handling", description: "Never use protected attributes for differential treatment", severity: "critical", enabled: true },
      { id: "fc-3", name: "Outcome Equity", description: "Monitor and ensure equitable outcomes across user groups", severity: "high", enabled: true },
    ],
  },
];

export default function Governance() {
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [auditObjectFilter, setAuditObjectFilter] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState<string | null>(null);
  const [auditDateFilter, setAuditDateFilter] = useState("all");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [expandedFindings, setExpandedFindings] = useState<Record<string, boolean>>({});
  const [expandedEvidence, setExpandedEvidence] = useState<Record<string, boolean>>({});
  const [ethicalBoundaries, setEthicalBoundaries] = useState(initialEthicalBoundaries);
  const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>({});
  const [exportBundleOpen, setExportBundleOpen] = useState(false);
  const [exportType, setExportType] = useState("all_events");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportIncludeHashes, setExportIncludeHashes] = useState(false);
  const { toast } = useToast();
  const evidenceDrawer = useEvidenceDrawer();
  const policyPerm = usePermission("create_modify_policies");

  const { data: policies, isLoading } = useQuery<Policy[]>({
    queryKey: ["/api/policies"],
  });
  const { data: auditEvents } = useQuery<AuditEvent[]>({
    queryKey: ["/api/audit-events"],
  });
  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });
  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: integrityCheck, refetch: refetchIntegrity } = useQuery<{
    valid: boolean;
    totalEvents: number;
    verifiedEvents: number;
    brokenAt?: number;
  }>({
    queryKey: ["/api/audit-events", "verify-integrity"],
  });
  const { data: complianceReports } = useQuery<ComplianceReport[]>({
    queryKey: ["/api/compliance-reports"],
  });
  const { data: policyExceptions } = useQuery<PolicyException[]>({
    queryKey: ["/api/policy-exceptions"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/policies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      setCreateOpen(false);
      toast({ title: "Policy created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create policy", description: err.message, variant: "destructive" });
    },
  });

  const createExceptionMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/policy-exceptions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-exceptions"] });
      setExceptionOpen(false);
      toast({ title: "Exception request submitted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create exception", description: err.message, variant: "destructive" });
    },
  });

  const updateExceptionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/policy-exceptions/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-exceptions"] });
      toast({ title: "Exception updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update exception", description: err.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    let result = policies || [];
    if (search) {
      result = result.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    }
    if (domainFilter !== "all") {
      result = result.filter((p) => p.domain === domainFilter);
    }
    return result;
  }, [policies, search, domainFilter]);

  const domainGroups = useMemo(() => {
    const groups: Record<string, Policy[]> = {};
    const domainOrder = ["data_handling", "tool_permissions", "logging", "allowed_actions", "content_boundaries"];
    domainOrder.forEach(d => { groups[d] = []; });
    filtered?.forEach((p) => {
      const domain = p.domain || "data_handling";
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push(p);
    });
    return Object.entries(groups).filter(([_, policies]) => policies.length > 0);
  }, [filtered]);

  const domainLabels: Record<string, string> = {
    data_handling: "Data Handling",
    tool_permissions: "Tool Permissions",
    logging: "Logging & Redaction",
    allowed_actions: "Allowed Actions",
    content_boundaries: "Regulated Content Boundaries",
  };

  const violationCount = useMemo(() => {
    if (!auditEvents) return 0;
    return auditEvents.filter((e) => {
      const a = e.action.toLowerCase();
      return a.includes("violation") || a.includes("blocked");
    }).length;
  }, [auditEvents]);

  const approvalCompliance = useMemo(() => {
    if (!approvals) return 0;
    const decided = approvals.filter((a) => a.status === "approved" || a.status === "rejected");
    if (decided.length === 0) return 100;
    const approved = decided.filter((a) => a.status === "approved").length;
    return Math.round((approved / decided.length) * 100);
  }, [approvals]);

  const actionTypes = useMemo(() => {
    if (!auditEvents) return [];
    const counts: Record<string, number> = {};
    auditEvents.forEach((e) => {
      counts[e.action] = (counts[e.action] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([action]) => action);
  }, [auditEvents]);

  const filteredAuditEvents = useMemo(() => {
    if (!auditEvents) return [];
    let events = [...auditEvents];

    if (auditObjectFilter) {
      const q = auditObjectFilter.toLowerCase();
      events = events.filter(
        (e) =>
          (e.objectType && e.objectType.toLowerCase().includes(q)) ||
          (e.objectId && e.objectId.toLowerCase().includes(q))
      );
    }

    if (auditActionFilter) {
      events = events.filter((e) => e.action === auditActionFilter);
    }

    if (auditDateFilter !== "all") {
      const now = new Date();
      events = events.filter((e) => {
        if (!e.createdAt) return false;
        const eventDate = new Date(e.createdAt);
        if (auditDateFilter === "today") {
          return (
            eventDate.getFullYear() === now.getFullYear() &&
            eventDate.getMonth() === now.getMonth() &&
            eventDate.getDate() === now.getDate()
          );
        }
        if (auditDateFilter === "7days") {
          const diff = now.getTime() - eventDate.getTime();
          return diff <= 7 * 24 * 60 * 60 * 1000;
        }
        if (auditDateFilter === "30days") {
          const diff = now.getTime() - eventDate.getTime();
          return diff <= 30 * 24 * 60 * 60 * 1000;
        }
        return true;
      });
    }

    return events;
  }, [auditEvents, auditObjectFilter, auditActionFilter, auditDateFilter]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (auditObjectFilter) count++;
    if (auditActionFilter) count++;
    if (auditDateFilter !== "all") count++;
    return count;
  }, [auditObjectFilter, auditActionFilter, auditDateFilter]);

  const enforcementData = useMemo(() => {
    if (!policies || !auditEvents) return [];
    return policies.map((policy) => {
      const matchCount = auditEvents.filter((e) => {
        const detailsMatch = e.details && e.details.toLowerCase().includes(policy.id.toLowerCase());
        const objectMatch = e.objectId && e.objectId.toLowerCase() === policy.id.toLowerCase();
        const nameMatch = e.action.toLowerCase().includes(policy.name.toLowerCase());
        const domainMatch = e.objectType === "policy";
        return detailsMatch || objectMatch || nameMatch || domainMatch;
      }).length;
      return { policy, matchCount };
    });
  }, [policies, auditEvents]);

  const maxEnforcement = useMemo(() => {
    return Math.max(1, ...enforcementData.map((d) => d.matchCount));
  }, [enforcementData]);

  const complianceStats = useMemo(() => {
    if (!complianceReports) return { total: 0, avgScore: 0, frameworks: 0, issueFindings: 0 };
    const total = complianceReports.length;
    const avgScore = total > 0 ? Math.round(complianceReports.reduce((sum, r) => sum + (r.overallScore || 0), 0) / total) : 0;
    const frameworks = new Set(complianceReports.map((r) => r.framework)).size;
    let issueFindings = 0;
    complianceReports.forEach((r) => {
      const findings = r.findings as Array<{ status: string }> | null;
      if (findings) {
        issueFindings += findings.filter((f) => f.status === "warning" || f.status === "fail").length;
      }
    });
    return { total, avgScore, frameworks, issueFindings };
  }, [complianceReports]);

  const exceptionStats = useMemo(() => {
    if (!policyExceptions) return { total: 0, pending: 0, approved: 0, expired: 0 };
    const total = policyExceptions.length;
    const pending = policyExceptions.filter((e) => e.status === "pending").length;
    const approved = policyExceptions.filter((e) => e.status === "approved").length;
    const expired = policyExceptions.filter((e) => {
      if (e.status !== "approved") return false;
      if (!e.expiresAt) return false;
      return new Date(e.expiresAt) < new Date();
    }).length;
    return { total, pending, approved, expired };
  }, [policyExceptions]);

  const policyMap = useMemo(() => {
    const map: Record<string, string> = {};
    policies?.forEach((p) => { map[p.id] = p.name; });
    return map;
  }, [policies]);

  const agentMap = useMemo(() => {
    const map: Record<string, string> = {};
    agents?.forEach((a) => { map[a.id] = a.name; });
    return map;
  }, [agents]);

  const agentsByTier = useMemo(() => {
    const grouped: Record<string, Agent[]> = { open: [], standard: [], restricted: [], critical: [] };
    agents?.forEach((a) => {
      const tier = (a.toolAccessClass || "standard").toLowerCase();
      if (grouped[tier]) grouped[tier].push(a);
      else grouped.standard.push(a);
    });
    return grouped;
  }, [agents]);

  const ethicalSummary = useMemo(() => {
    let total = 0;
    let enabled = 0;
    ethicalBoundaries.forEach((cat) => {
      cat.rules.forEach((r) => {
        total++;
        if (r.enabled) enabled++;
      });
    });
    return { total, enabled, disabled: total - enabled, coverage: total > 0 ? Math.round((enabled / total) * 100) : 0 };
  }, [ethicalBoundaries]);

  const toggleEthicalRule = (categoryIndex: number, ruleId: string) => {
    setEthicalBoundaries((prev) =>
      prev.map((cat, ci) => {
        if (ci !== categoryIndex) return cat;
        return {
          ...cat,
          rules: cat.rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)),
        };
      })
    );
  };

  const handleExportCsv = () => {
    const headers = ["Date", "Action", "Actor Type", "Actor ID", "Object Type", "Object ID", "Details"];
    const rows = filteredAuditEvents.map((e) => [
      e.createdAt ? new Date(e.createdAt).toISOString() : "",
      e.action,
      e.actorType,
      e.actorId || "",
      e.objectType,
      e.objectId || "",
      (e.details || "").replace(/"/g, '""'),
    ]);
    const csvString = [
      headers.join(","),
      ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvString], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-events.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getTimeRemaining = (expiresAt: string | Date) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
  };

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

  const activePolicies = policies?.filter((p) => p.status === "active")?.length || 0;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-governance">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Governance</h1>
          <p className="text-sm text-muted-foreground">
            Policy-as-code, compliance controls, and audit trail
          </p>
        </div>
        {!policyPerm.allowed ? (
          <Button disabled title="You do not have permission to create policies" data-testid="button-create-policy">
            <Plus className="w-4 h-4 mr-1.5" /> New Policy
          </Button>
        ) : (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-policy">
              <Plus className="w-4 h-4 mr-1.5" /> New Policy
              {policyPerm.permission.access === "conditional" && policyPerm.permission.annotation && (
                <Badge variant="secondary" className="text-[10px] ml-1">{policyPerm.permission.annotation}</Badge>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Policy</DialogTitle>
            </DialogHeader>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                createMutation.mutate({
                  name: fd.get("name") as string,
                  domain: fd.get("domain") as string,
                  description: fd.get("description") as string,
                  scopeType: fd.get("scopeType") as string,
                });
              }}
            >
              <div className="flex flex-col gap-2">
                <Label>Policy Name</Label>
                <Input name="name" required placeholder="e.g., No PII in Response" data-testid="input-policy-name" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Description</Label>
                <Textarea name="description" placeholder="What does this policy enforce?" data-testid="input-policy-description" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Domain</Label>
                  <select name="domain" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="data_handling">
                    <option value="data_handling">Data Handling</option>
                    <option value="tool_permissions">Tool Permissions</option>
                    <option value="logging">Logging/Redaction</option>
                    <option value="allowed_actions">Allowed Actions</option>
                    <option value="content_boundaries">Content Boundaries</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Scope</Label>
                  <select name="scopeType" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="org">
                    <option value="org">Organization</option>
                    <option value="outcome">Outcome</option>
                    <option value="agent">Agent</option>
                    <option value="env">Environment</option>
                  </select>
                </div>
              </div>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-policy">
                {createMutation.isPending ? "Creating..." : "Create Policy"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Active Policies" value={activePolicies} icon={Shield} variant="default" testId="stat-active-policies" />
        <StatCard title="Audit Events" value={auditEvents?.length || 0} icon={Eye} variant="default" testId="stat-audit-events" />
        <StatCard title="Policy Violations" value={violationCount} icon={AlertTriangle} variant={violationCount > 0 ? "danger" : "default"} testId="stat-violations" />
        <StatCard title="Approval Compliance" value={`${approvalCompliance}%`} icon={CheckCircle} variant="success" testId="stat-compliance" />
      </div>

      <Tabs defaultValue="policies" className="flex flex-col gap-4">
        <TabsList className="w-fit flex-wrap">
          <TabsTrigger value="policies" data-testid="tab-policies">Policy Library</TabsTrigger>
          <TabsTrigger value="enforcement" data-testid="tab-enforcement">Enforcement</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit Trail</TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">Compliance Reports</TabsTrigger>
          <TabsTrigger value="exceptions" data-testid="tab-exceptions">Policy Exceptions</TabsTrigger>
          <TabsTrigger value="tool-access" data-testid="tab-tool-access">Tool Access</TabsTrigger>
          <TabsTrigger value="ethics" data-testid="tab-ethics">Ethical Boundaries</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="mt-0 flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search policies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-policies"
              />
            </div>
            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="w-[220px]" data-testid="select-domain-filter">
                <SelectValue placeholder="All Domains" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                <SelectItem value="data_handling">Data Handling</SelectItem>
                <SelectItem value="tool_permissions">Tool Permissions</SelectItem>
                <SelectItem value="logging">Logging & Redaction</SelectItem>
                <SelectItem value="allowed_actions">Allowed Actions</SelectItem>
                <SelectItem value="content_boundaries">Content Boundaries</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {domainGroups.map(([domain, domainPolicies]) => {
            const DomainIcon = domainIcons[domain] || Shield;
            return (
              <div key={domain} className="flex flex-col gap-3">
                <div className="flex items-center gap-2 pt-2">
                  <DomainIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{domainLabels[domain] || domain.replace(/_/g, " ")}</span>
                  <Badge variant="secondary" className="text-[10px]">{(domainPolicies as Policy[]).length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(domainPolicies as Policy[]).map((policy) => {
                    const DIcon = domainIcons[policy.domain] || Shield;
                    return (
                      <Card key={policy.id} className="hover-elevate" data-testid={`card-policy-${policy.id}`}>
                        <CardContent className="p-4 flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                                <DIcon className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-semibold truncate">{policy.name}</span>
                                <span className="text-[11px] text-muted-foreground capitalize">{policy.domain.replace(/_/g, " ")} | v{policy.version}</span>
                              </div>
                            </div>
                            <StatusBadge status={policy.status} />
                          </div>
                          {policy.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{policy.description}</p>
                          )}
                          <div className="flex items-center gap-2 pt-1 border-t flex-wrap">
                            <Badge variant="outline" className="text-[10px] capitalize">{policy.scopeType}</Badge>
                            {(policy as any).versionHistory && Array.isArray((policy as any).versionHistory) && (
                              <Badge variant="secondary" className="text-[10px]">{((policy as any).versionHistory as any[]).length} prior versions</Badge>
                            )}
                          </div>
                          {(policy as any).versionHistory && Array.isArray((policy as any).versionHistory) && ((policy as any).versionHistory as any[]).length > 0 && (
                            <div className="flex flex-col gap-1">
                              <button
                                className="text-[11px] text-muted-foreground underline cursor-pointer text-left"
                                onClick={() => setExpandedVersions(prev => ({...prev, [policy.id]: !prev[policy.id]}))}
                                data-testid={`button-version-history-${policy.id}`}
                              >
                                {expandedVersions[policy.id] ? "Hide version history" : `Show ${((policy as any).versionHistory as any[]).length} prior versions`}
                              </button>
                              {expandedVersions[policy.id] && (
                                <div className="flex flex-col gap-1 pl-2 border-l-2 border-muted mt-1">
                                  {((policy as any).versionHistory as any[]).map((vh: any, i: number) => (
                                    <div key={i} className="text-[11px] text-muted-foreground">
                                      <span className="font-medium">v{vh.version}</span> - {vh.changedBy || "system"} - {vh.changedAt ? new Date(vh.changedAt).toLocaleDateString() : "N/A"}
                                      {vh.summary && <span className="ml-1">({vh.summary})</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filtered?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Shield className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No policies found</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="enforcement" className="mt-0 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Per-Policy Enforcement Statistics</span>
          </div>

          <div className="flex flex-col gap-3">
            {enforcementData.map(({ policy, matchCount }) => {
              const DomainIcon = domainIcons[policy.domain] || Shield;
              const barWidth = maxEnforcement > 0 ? (matchCount / maxEnforcement) * 100 : 0;
              return (
                <Card key={policy.id} className="hover-elevate" data-testid={`enforcement-card-${policy.id}`}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <DomainIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-semibold truncate">{policy.name}</span>
                          <span className="text-[11px] text-muted-foreground capitalize">{policy.domain.replace(/_/g, " ")}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">hard_block</Badge>
                        <StatusBadge status={policy.status} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Enforcement events</span>
                        <span className="text-xs font-medium">{matchCount}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-blue-500 dark:bg-blue-400 transition-all"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {enforcementData.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <BarChart2 className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No enforcement data available</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit" className="mt-0 flex flex-col gap-4">
          {integrityCheck && (
            <Card data-testid="card-integrity-status">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    {integrityCheck.valid ? (
                      <div className="w-10 h-10 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-5 h-5 text-emerald-500" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-red-500/10 flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-5 h-5 text-red-500" />
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold" data-testid="text-integrity-status">
                        {integrityCheck.valid ? "Chain Verified" : "Chain Broken"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {integrityCheck.totalEvents} total events, {integrityCheck.verifiedEvents} verified
                      </span>
                      {auditEvents && auditEvents.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {auditEvents[0]?.eventHash && (
                            <span className="text-[10px] text-muted-foreground font-mono" data-testid="text-first-hash">
                              First: {auditEvents[0].eventHash.slice(0, 12)}
                            </span>
                          )}
                          {auditEvents[auditEvents.length - 1]?.eventHash && (
                            <span className="text-[10px] text-muted-foreground font-mono" data-testid="text-last-hash">
                              Last: {auditEvents[auditEvents.length - 1].eventHash?.slice(0, 12)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchIntegrity()}
                    data-testid="button-verify-now"
                  >
                    <RefreshCw className="w-4 h-4 mr-1.5" /> Verify Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Filters</span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="text-[10px]" data-testid="badge-active-filters">
                  {activeFilterCount} active
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleExportCsv} data-testid="button-export-csv">
                <Download className="w-4 h-4 mr-1.5" /> Export CSV
              </Button>
              <Dialog open={exportBundleOpen} onOpenChange={setExportBundleOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-export-bundle">
                    <Layers className="w-4 h-4 mr-1.5" /> Export Bundle
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Export Audit Bundle</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label>Export Type</Label>
                      <Select value={exportType} onValueChange={setExportType}>
                        <SelectTrigger data-testid="select-export-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all_events">All Events</SelectItem>
                          <SelectItem value="runs">All Runs for Time Window</SelectItem>
                          <SelectItem value="approvals">All Approvals</SelectItem>
                          <SelectItem value="policy_changes">All Policy Changes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-2">
                        <Label>Start Date</Label>
                        <Input type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} data-testid="input-export-start" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>End Date</Label>
                        <Input type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} data-testid="input-export-end" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={exportIncludeHashes} onCheckedChange={setExportIncludeHashes} data-testid="switch-include-hashes" />
                      <Label className="text-sm">Include cryptographic integrity (hash chain)</Label>
                    </div>
                    <Button
                      onClick={async () => {
                        const params = new URLSearchParams();
                        params.set("type", exportType);
                        if (exportStartDate) params.set("startDate", exportStartDate);
                        if (exportEndDate) params.set("endDate", exportEndDate);
                        if (exportIncludeHashes) params.set("includeHashes", "true");
                        try {
                          const res = await fetch(`/api/audit-events/export-bundle?${params.toString()}`);
                          const bundle = await res.json();
                          const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `audit-bundle-${exportType}-${new Date().toISOString().split("T")[0]}.json`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                          setExportBundleOpen(false);
                          toast({ title: "Bundle exported", description: `${bundle.totalRecords} records exported` });
                        } catch (err) {
                          toast({ title: "Export failed", variant: "destructive" });
                        }
                      }}
                      data-testid="button-download-bundle"
                    >
                      <Download className="w-4 h-4 mr-1.5" /> Download Bundle
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <div className="relative max-w-xs flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Filter by object..."
                value={auditObjectFilter}
                onChange={(e) => setAuditObjectFilter(e.target.value)}
                className="pl-9"
                data-testid="input-filter-audit-object"
              />
            </div>
            <Select value={auditDateFilter} onValueChange={setAuditDateFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-audit-date">
                <Calendar className="w-4 h-4 mr-1.5 text-muted-foreground shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="select-date-all">All Time</SelectItem>
                <SelectItem value="today" data-testid="select-date-today">Today</SelectItem>
                <SelectItem value="7days" data-testid="select-date-7days">Last 7 Days</SelectItem>
                <SelectItem value="30days" data-testid="select-date-30days">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {actionTypes.map((action) => (
              <Badge
                key={action}
                variant={auditActionFilter === action ? "default" : "outline"}
                className={`cursor-pointer text-[11px] toggle-elevate ${auditActionFilter === action ? "toggle-elevated" : ""}`}
                onClick={() => setAuditActionFilter(auditActionFilter === action ? null : action)}
                data-testid={`filter-action-${action}`}
              >
                {action}
              </Badge>
            ))}
          </div>

          <Card>
            <CardContent className="p-4">
              {filteredAuditEvents.length > 0 ? (
                <div className="flex flex-col">
                  {filteredAuditEvents.map((event, index) => {
                    const isLast = index === filteredAuditEvents.length - 1;
                    const isExpanded = expandedEvent === event.id;
                    return (
                      <div
                        key={event.id}
                        className="flex gap-3"
                        data-testid={`audit-event-${event.id}`}
                      >
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${getEventDotColor(event.action)}`} />
                          {!isLast && <div className="flex-1 border-l border-border ml-px mt-1" />}
                        </div>
                        <div
                          className="flex flex-col gap-1 pb-4 min-w-0 flex-1 cursor-pointer hover-elevate rounded-md p-2 -ml-1"
                          onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium">{event.action}</span>
                              {event.eventHash && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Lock className="w-3 h-3 text-muted-foreground cursor-help" data-testid={`icon-hash-${event.id}`} />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <span className="font-mono text-xs">{event.eventHash.slice(0, 8)}</span>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground shrink-0">
                              {event.createdAt ? new Date(event.createdAt).toLocaleString() : ""}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {event.actorType}:{event.actorId} on {event.objectType}:{event.objectId}
                          </span>
                          {event.details && !isExpanded && (
                            <p className="text-[11px] text-muted-foreground/70 truncate">
                              {event.details.length > 100 ? event.details.slice(0, 100) + "..." : event.details}
                            </p>
                          )}
                          {event.details && isExpanded && (
                            <div className="flex flex-col gap-2 mt-1">
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                {event.details}
                              </p>
                              <div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    evidenceDrawer.open({
                                      type: "audit",
                                      title: event.action,
                                      subtitle: `${event.objectType}:${event.objectId}`,
                                      audit: {
                                        eventId: event.id,
                                        eventType: event.action,
                                        actor: `${event.actorType}:${event.actorId}`,
                                        timestamp: event.createdAt ? new Date(event.createdAt).toISOString() : "",
                                        description: event.details || undefined,
                                        hashChain: event.eventHash || undefined,
                                      },
                                    });
                                  }}
                                  data-testid={`button-view-audit-${event.id}`}
                                >
                                  <Eye className="w-3.5 h-3.5 mr-1" />
                                  View Details
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No audit events found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="mt-0 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Reports" value={complianceStats.total} icon={FileText} variant="default" testId="stat-total-reports" />
            <StatCard title="Average Score" value={`${complianceStats.avgScore}%`} icon={Target} variant={complianceStats.avgScore >= 80 ? "success" : complianceStats.avgScore >= 60 ? "warning" : "danger"} testId="stat-avg-score" />
            <StatCard title="Frameworks Covered" value={complianceStats.frameworks} icon={Layers} variant="default" testId="stat-frameworks" />
            <StatCard title="Findings with Issues" value={complianceStats.issueFindings} icon={AlertTriangle} variant={complianceStats.issueFindings > 0 ? "warning" : "default"} testId="stat-issue-findings" />
          </div>

          <div className="flex flex-col gap-4">
            {complianceReports?.map((report) => {
              const findings = (report.findings as Array<{ control: string; title: string; status: string; evidence: string }>) || [];
              const evidencePackage = report.evidencePackage as Record<string, any> | null;
              const isExpanded = expandedFindings[report.id] || false;
              return (
                <Card key={report.id} data-testid={`card-report-${report.id}`}>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-medium border ${frameworkColors[report.framework] || "bg-muted text-muted-foreground"}`}
                        data-testid={`badge-framework-${report.id}`}
                      >
                        {report.framework.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-sm font-semibold truncate">{report.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <StatusBadge status={report.status} />
                      <div className="flex items-center gap-1.5">
                        <div className="relative w-8 h-8">
                          <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
                            <circle
                              cx="18" cy="18" r="14" fill="none"
                              strokeWidth="3"
                              strokeDasharray={`${(report.overallScore || 0) * 0.88} 88`}
                              strokeLinecap="round"
                              className={
                                (report.overallScore || 0) >= 80
                                  ? "text-emerald-500"
                                  : (report.overallScore || 0) >= 60
                                  ? "text-amber-500"
                                  : "text-red-500"
                              }
                              stroke="currentColor"
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold" data-testid={`text-score-${report.id}`}>
                            {report.overallScore || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex flex-col gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit"
                      onClick={() => setExpandedFindings((prev) => ({ ...prev, [report.id]: !prev[report.id] }))}
                      data-testid={`button-toggle-findings-${report.id}`}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                      {findings.length} Findings
                    </Button>
                    {isExpanded && (
                      <div className="flex flex-col gap-2 ml-2">
                        {findings.map((finding, fi) => {
                          const evidenceKey = `${report.id}-${fi}`;
                          const showEvidence = expandedEvidence[evidenceKey] || false;
                          return (
                            <div key={fi} className="flex flex-col gap-1 p-2 rounded-md bg-muted/30" data-testid={`finding-${report.id}-${fi}`}>
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] font-mono">{finding.control}</Badge>
                                  <span className="text-xs font-medium">{finding.title}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  {finding.status === "pass" && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                                  {finding.status === "warning" && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                                  {finding.status === "fail" && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                                  <span className={`text-[11px] font-medium ${
                                    finding.status === "pass" ? "text-emerald-600 dark:text-emerald-400" :
                                    finding.status === "warning" ? "text-amber-600 dark:text-amber-400" :
                                    "text-red-600 dark:text-red-400"
                                  }`}>
                                    {finding.status}
                                  </span>
                                </div>
                              </div>
                              {finding.evidence && (
                                <div>
                                  <button
                                    className="text-[11px] text-muted-foreground underline cursor-pointer"
                                    onClick={() => setExpandedEvidence((prev) => ({ ...prev, [evidenceKey]: !prev[evidenceKey] }))}
                                    data-testid={`button-evidence-${report.id}-${fi}`}
                                  >
                                    {showEvidence ? "Hide evidence" : "Show evidence"}
                                  </button>
                                  {showEvidence && (
                                    <p className="text-[11px] text-muted-foreground mt-1">{finding.evidence}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex items-center justify-between gap-2 p-4 pt-0 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {evidencePackage && (
                        <span className="text-[11px] text-muted-foreground">
                          Evidence: {Object.keys(evidencePackage).length} items collected
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        Generated by {report.generatedBy} on {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : "N/A"}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" data-testid={`button-export-report-${report.id}`}>
                      <Download className="w-4 h-4 mr-1.5" /> Export Report
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          {(!complianceReports || complianceReports.length === 0) && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <FileText className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No compliance reports found</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="exceptions" className="mt-0 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Exceptions" value={exceptionStats.total} icon={FileCode} variant="default" testId="stat-total-exceptions" />
            <StatCard title="Pending" value={exceptionStats.pending} icon={Clock} variant={exceptionStats.pending > 0 ? "warning" : "default"} testId="stat-pending-exceptions" />
            <StatCard title="Approved (Active)" value={exceptionStats.approved} icon={CheckCircle} variant="success" testId="stat-approved-exceptions" />
            <StatCard title="Expired" value={exceptionStats.expired} icon={AlertTriangle} variant={exceptionStats.expired > 0 ? "danger" : "default"} testId="stat-expired-exceptions" />
          </div>

          <div className="flex justify-end">
            <Dialog open={exceptionOpen} onOpenChange={setExceptionOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-request-exception">
                  <Plus className="w-4 h-4 mr-1.5" /> Request Exception
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request Policy Exception</DialogTitle>
                </DialogHeader>
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    createExceptionMutation.mutate({
                      policyId: fd.get("policyId") as string,
                      agentId: (fd.get("agentId") as string) || undefined,
                      requestedBy: "current-user",
                      reason: fd.get("reason") as string,
                      justification: (fd.get("justification") as string) || undefined,
                      compensatingControls: (fd.get("compensatingControls") as string) || undefined,
                      scope: fd.get("scope") as string,
                      expiresAt: fd.get("expiresAt") ? new Date(fd.get("expiresAt") as string).toISOString() : undefined,
                    });
                  }}
                >
                  <div className="flex flex-col gap-2">
                    <Label>Policy</Label>
                    <select name="policyId" required className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" data-testid="select-exception-policy">
                      <option value="">Select a policy</option>
                      {policies?.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Agent (optional)</Label>
                    <select name="agentId" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" data-testid="select-exception-agent">
                      <option value="">None</option>
                      {agents?.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Reason</Label>
                    <Textarea name="reason" required placeholder="Why is this exception needed?" data-testid="input-exception-reason" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Justification</Label>
                    <Textarea name="justification" placeholder="Business justification for this exception" data-testid="input-exception-justification" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Compensating Controls</Label>
                    <Textarea name="compensatingControls" placeholder="What compensating controls will be in place?" data-testid="input-exception-compensating" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label>Scope</Label>
                      <select name="scope" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="agent" data-testid="select-exception-scope">
                        <option value="agent">Agent</option>
                        <option value="org">Organization</option>
                        <option value="env">Environment</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Expiry Date</Label>
                      <Input type="date" name="expiresAt" data-testid="input-exception-expiry" />
                    </div>
                  </div>
                  <Button type="submit" disabled={createExceptionMutation.isPending} data-testid="button-submit-exception">
                    {createExceptionMutation.isPending ? "Submitting..." : "Submit Request"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {policyExceptions?.map((exception) => {
              const isExpired = exception.status === "approved" && exception.expiresAt && new Date(exception.expiresAt) < new Date();
              return (
                <Card key={exception.id} className="hover-elevate" data-testid={`card-exception-${exception.id}`}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col min-w-0 gap-0.5">
                        <span className="text-sm font-semibold truncate" data-testid={`text-exception-policy-${exception.id}`}>
                          {policyMap[exception.policyId] || exception.policyId}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px] capitalize">{exception.scope}</Badge>
                          {isExpired ? (
                            <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20">Expired</Badge>
                          ) : (
                            <StatusBadge status={exception.status} />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-muted-foreground">
                        Requested by: {exception.requestedBy}
                      </span>
                      <p className="text-xs text-muted-foreground">{exception.reason}</p>
                      {exception.agentId && (
                        <span className="text-[11px] text-muted-foreground">
                          Agent: {agentMap[exception.agentId] || exception.agentId}
                        </span>
                      )}
                    </div>
                    {exception.status === "pending" && (
                      <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                        <Button
                          size="sm"
                          onClick={() => updateExceptionMutation.mutate({ id: exception.id, data: { status: "approved", approvedBy: "current-user" } })}
                          disabled={updateExceptionMutation.isPending}
                          data-testid={`button-approve-${exception.id}`}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateExceptionMutation.mutate({ id: exception.id, data: { status: "rejected" } })}
                          disabled={updateExceptionMutation.isPending}
                          data-testid={`button-reject-${exception.id}`}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                    {exception.status === "approved" && exception.expiresAt && (
                      <div className="flex items-center gap-1.5 pt-2 border-t flex-wrap">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground" data-testid={`text-expiry-${exception.id}`}>
                          {isExpired
                            ? `Expired on ${new Date(exception.expiresAt).toLocaleDateString()}`
                            : getTimeRemaining(exception.expiresAt)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {(!policyExceptions || policyExceptions.length === 0) && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <FileCode className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No policy exceptions found</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tool-access" className="mt-0 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {toolAccessTiers.map((tier) => {
              const tierAgents = agentsByTier[tier.tier.toLowerCase()] || [];
              return (
                <Card key={tier.tier} className="hover-elevate" data-testid={`card-tier-${tier.tier.toLowerCase()}`}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className={`text-[11px] font-semibold border ${tier.color}`} data-testid={`badge-tier-${tier.tier.toLowerCase()}`}>
                        {tier.tier}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{tierAgents.length} agents</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{tier.description}</p>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-medium text-muted-foreground">Example Tools:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {tier.tools.map((tool) => (
                          <Badge key={tool} variant="outline" className="text-[10px]">{tool}</Badge>
                        ))}
                      </div>
                    </div>
                    {tierAgents.length > 0 && (
                      <div className="flex flex-col gap-1.5 pt-2 border-t">
                        <span className="text-[11px] font-medium text-muted-foreground">Assigned Agents:</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {tierAgents.map((agent) => (
                            <Badge key={agent.id} variant="secondary" className="text-[10px]" data-testid={`badge-agent-tier-${agent.id}`}>
                              {agent.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card data-testid="card-access-matrix">
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <Layers className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Access Control Matrix</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 overflow-x-auto">
              {agents && agents.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Agent</TableHead>
                      <TableHead className="text-xs">Tool Access</TableHead>
                      <TableHead className="text-xs">Autonomy Mode</TableHead>
                      <TableHead className="text-xs">Risk Tier</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agents.map((agent) => (
                      <TableRow key={agent.id} data-testid={`row-agent-${agent.id}`}>
                        <TableCell className="text-xs font-medium">{agent.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] border ${
                              toolAccessTiers.find((t) => t.tier.toLowerCase() === (agent.toolAccessClass || "standard").toLowerCase())?.color || ""
                            }`}
                          >
                            {(agent.toolAccessClass || "standard").toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={agent.autonomyMode} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={agent.riskTier} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">No agents found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ethics" className="mt-0 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ethicalBoundaries.map((category, ci) => {
              const CategoryIcon = category.icon;
              return (
                <Card key={category.name} data-testid={`card-ethics-${ci}`}>
                  <CardHeader className="flex flex-row items-center gap-2 pb-3">
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <CategoryIcon className="w-4 h-4 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-semibold">{category.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex flex-col gap-3">
                    {category.rules.map((rule) => (
                      <div key={rule.id} className="flex items-start justify-between gap-3" data-testid={`rule-${rule.id}`}>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium">{rule.name}</span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] border ${
                                rule.severity === "critical"
                                  ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                                  : rule.severity === "high"
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                  : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20"
                              }`}
                            >
                              {rule.severity}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{rule.description}</p>
                        </div>
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={() => toggleEthicalRule(ci, rule.id)}
                          data-testid={`switch-${rule.id}`}
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card data-testid="card-ethics-summary">
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Boundary Compliance Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">Total Rules</span>
                  <span className="text-lg font-semibold" data-testid="text-total-rules">{ethicalSummary.total}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">Enabled</span>
                  <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400" data-testid="text-enabled-rules">{ethicalSummary.enabled}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">Disabled</span>
                  <span className="text-lg font-semibold text-muted-foreground" data-testid="text-disabled-rules">{ethicalSummary.disabled}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Coverage Score</span>
                  <span className="text-xs font-semibold" data-testid="text-coverage-score">{ethicalSummary.coverage}%</span>
                </div>
                <Progress value={ethicalSummary.coverage} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
