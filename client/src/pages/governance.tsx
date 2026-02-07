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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Policy, AuditEvent, Approval } from "@shared/schema";

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

export default function Governance() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [auditObjectFilter, setAuditObjectFilter] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState<string | null>(null);
  const [auditDateFilter, setAuditDateFilter] = useState("all");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: policies, isLoading } = useQuery<Policy[]>({
    queryKey: ["/api/policies"],
  });
  const { data: auditEvents } = useQuery<AuditEvent[]>({
    queryKey: ["/api/audit-events"],
  });
  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
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

  const filtered = policies?.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

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
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-policy">
              <Plus className="w-4 h-4 mr-1.5" /> New Policy
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Active Policies" value={activePolicies} icon={Shield} variant="default" testId="stat-active-policies" />
        <StatCard title="Audit Events" value={auditEvents?.length || 0} icon={Eye} variant="default" testId="stat-audit-events" />
        <StatCard title="Policy Violations" value={violationCount} icon={AlertTriangle} variant={violationCount > 0 ? "danger" : "default"} testId="stat-violations" />
        <StatCard title="Approval Compliance" value={`${approvalCompliance}%`} icon={CheckCircle} variant="success" testId="stat-compliance" />
      </div>

      <Tabs defaultValue="policies" className="flex flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="policies" data-testid="tab-policies">Policy Library</TabsTrigger>
          <TabsTrigger value="enforcement" data-testid="tab-enforcement">Enforcement</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="mt-0 flex flex-col gap-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search policies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-policies"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered?.map((policy) => {
              const DomainIcon = domainIcons[policy.domain] || Shield;
              return (
                <Card key={policy.id} className="hover-elevate" data-testid={`card-policy-${policy.id}`}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <DomainIcon className="w-4 h-4 text-primary" />
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
                      <Badge variant="outline" className="text-[10px] capitalize">{policy.domain.replace(/_/g, " ")}</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

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
            <Button variant="outline" size="sm" onClick={handleExportCsv} data-testid="button-export-csv">
              <Download className="w-4 h-4 mr-1.5" /> Export CSV
            </Button>
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
                            <span className="text-xs font-medium">{event.action}</span>
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
                            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                              {event.details}
                            </p>
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
      </Tabs>
    </div>
  );
}
