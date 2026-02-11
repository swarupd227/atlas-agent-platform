import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  ExternalLink,
  Server,
  Wrench,
  ShieldAlert,
  Filter,
  ArrowRight,
  Activity,
  Globe,
  FileText,
  Lock,
  Unlock,
  Ban,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { PermissionGate, usePermission } from "@/components/role-provider";
import type { Approval, McpElicitation } from "@shared/schema";

interface ApprovalQueueData {
  approvals: Approval[];
  elicitations: McpElicitation[];
  totalPending: number;
}

export default function ApprovalGates() {
  const [search, setSearch] = useState("");
  const [gateFilter, setGateFilter] = useState<string>("all");
  const [modeFilter, setModeFilter] = useState<string>("all");
  const { toast } = useToast();
  const approvalPerm = usePermission("approve_changes");

  const { data: queueData, isLoading } = useQuery<ApprovalQueueData>({
    queryKey: ["/api/approval-queue"],
  });

  const { data: allElicitations } = useQuery<McpElicitation[]>({
    queryKey: ["/api/mcp-elicitations"],
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, action, decidedBy }: { id: string; action: string; decidedBy?: string }) => {
      const res = await apiRequest("PATCH", `/api/mcp-elicitations/${id}/respond`, { action, decidedBy });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-elicitations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approval-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: "Response recorded" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to respond", description: err.message, variant: "destructive" });
    },
  });

  const pendingElicitations = allElicitations?.filter(e => e.status === "pending") || [];
  const resolvedElicitations = allElicitations?.filter(e => e.status !== "pending") || [];

  const gateTypeIcon = (gt: string) => {
    switch (gt) {
      case "tool_approval": return Wrench;
      case "data_export": return FileText;
      case "scope_escalation": return ShieldAlert;
      case "url_elicitation": return Globe;
      default: return Shield;
    }
  };

  const gateTypeLabel = (gt: string) => {
    switch (gt) {
      case "tool_approval": return "Tool Approval";
      case "data_export": return "Data Export";
      case "scope_escalation": return "Scope Escalation";
      case "url_elicitation": return "URL Elicitation";
      default: return gt;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "pending": return "warning";
      case "approved": return "success";
      case "declined": return "error";
      case "cancelled": return "neutral";
      case "completed": return "success";
      default: return "neutral";
    }
  };

  const filterElicitations = (list: McpElicitation[]) => {
    return list.filter(e => {
      if (search && !(
        e.toolName?.toLowerCase().includes(search.toLowerCase()) ||
        e.serverName?.toLowerCase().includes(search.toLowerCase()) ||
        e.reason?.toLowerCase().includes(search.toLowerCase())
      )) return false;
      if (gateFilter !== "all" && e.gateType !== gateFilter) return false;
      if (modeFilter !== "all" && e.mode !== modeFilter) return false;
      return true;
    });
  };

  const filteredPending = filterElicitations(pendingElicitations);
  const filteredResolved = filterElicitations(resolvedElicitations);

  const totalByGate = {
    tool_approval: allElicitations?.filter(e => e.gateType === "tool_approval").length || 0,
    data_export: allElicitations?.filter(e => e.gateType === "data_export").length || 0,
    scope_escalation: allElicitations?.filter(e => e.gateType === "scope_escalation").length || 0,
    url_elicitation: allElicitations?.filter(e => e.mode === "url").length || 0,
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6" data-testid="loading-approval-gates">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6" data-testid="page-approval-gates">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Approval Gates</h1>
          <p className="text-sm text-muted-foreground">MCP elicitation flows and ALMP expert validation gates</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/approvals">
            <Button variant="outline" data-testid="link-legacy-approvals">
              <Shield className="w-4 h-4 mr-1.5" />
              All Approvals
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Pending Gates"
          value={String(pendingElicitations.length)}
          icon={Clock}
          variant={pendingElicitations.length > 0 ? "warning" : "success"}
          testId="stat-pending-gates"
        />
        <StatCard
          title="Tool Approvals"
          value={String(totalByGate.tool_approval)}
          icon={Wrench}
          testId="stat-tool-approvals"
        />
        <StatCard
          title="Data Export Gates"
          value={String(totalByGate.data_export)}
          icon={FileText}
          testId="stat-data-exports"
        />
        <StatCard
          title="Scope Escalations"
          value={String(totalByGate.scope_escalation)}
          icon={ShieldAlert}
          testId="stat-scope-escalations"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by tool, server, or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-gates"
          />
        </div>
        <Select value={gateFilter} onValueChange={setGateFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-gate-filter">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue placeholder="Gate type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Gates</SelectItem>
            <SelectItem value="tool_approval">Tool Approval</SelectItem>
            <SelectItem value="data_export">Data Export</SelectItem>
            <SelectItem value="scope_escalation">Scope Escalation</SelectItem>
          </SelectContent>
        </Select>
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-[130px]" data-testid="select-mode-filter">
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="form">Form</SelectItem>
            <SelectItem value="url">URL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="pending" className="flex flex-col gap-4">
        <TabsList className="w-fit flex-wrap">
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({filteredPending.length})
          </TabsTrigger>
          <TabsTrigger value="resolved" data-testid="tab-resolved">
            Resolved ({filteredResolved.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="flex flex-col gap-3 mt-0">
          {filteredPending.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="text-sm font-medium" data-testid="text-no-pending">No pending approval gates</p>
                <p className="text-xs text-muted-foreground mt-1">All elicitations and tool gates have been resolved</p>
              </CardContent>
            </Card>
          ) : (
            filteredPending.map(elicitation => (
              <ElicitationCard
                key={elicitation.id}
                elicitation={elicitation}
                gateTypeIcon={gateTypeIcon}
                gateTypeLabel={gateTypeLabel}
                statusColor={statusColor}
                onRespond={(action) => respondMutation.mutate({ id: elicitation.id, action })}
                isPending={respondMutation.isPending}
                canApprove={approvalPerm.fullAccess}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="resolved" className="flex flex-col gap-3 mt-0">
          {filteredResolved.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <p className="text-sm">No resolved gates match your filters</p>
              </CardContent>
            </Card>
          ) : (
            filteredResolved.map(elicitation => (
              <ElicitationCard
                key={elicitation.id}
                elicitation={elicitation}
                gateTypeIcon={gateTypeIcon}
                gateTypeLabel={gateTypeLabel}
                statusColor={statusColor}
                canApprove={false}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ElicitationCard({
  elicitation,
  gateTypeIcon,
  gateTypeLabel,
  statusColor,
  onRespond,
  isPending,
  canApprove,
}: {
  elicitation: McpElicitation;
  gateTypeIcon: (gt: string) => typeof Shield;
  gateTypeLabel: (gt: string) => string;
  statusColor: (s: string) => string;
  onRespond?: (action: string) => void;
  isPending?: boolean;
  canApprove: boolean;
}) {
  const GateIcon = gateTypeIcon(elicitation.gateType);
  const riskFlags = elicitation.riskFlags || [];
  const args = elicitation.proposedArgs as Record<string, unknown> | null;

  return (
    <Card data-testid={`card-elicitation-${elicitation.id}`}>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <GateIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium" data-testid={`text-tool-name-${elicitation.id}`}>
              {elicitation.toolName || "Unknown Tool"}
            </span>
            <Badge variant="secondary" data-testid={`badge-gate-type-${elicitation.id}`}>
              {gateTypeLabel(elicitation.gateType)}
            </Badge>
            <Badge variant="outline" data-testid={`badge-mode-${elicitation.id}`}>
              {elicitation.mode === "url" ? (
                <><Globe className="w-3 h-3 mr-1" />URL</>
              ) : (
                <><FileText className="w-3 h-3 mr-1" />Form</>
              )}
            </Badge>
          </div>
          <StatusBadge status={elicitation.status} />
        </div>

        {elicitation.reason && (
          <div className="flex flex-col gap-1" data-testid={`section-reason-${elicitation.id}`}>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Why Requested</span>
            <p className="text-sm">{elicitation.reason}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Server Identity</span>
            <div className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm" data-testid={`text-server-${elicitation.id}`}>
                {elicitation.serverName || elicitation.serverId || "Unknown"}
              </span>
            </div>
          </div>

          {elicitation.agentId && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Agent</span>
              <Link href={`/agents/${elicitation.agentId}`}>
                <span className="text-sm text-primary hover:underline cursor-pointer" data-testid={`link-agent-${elicitation.id}`}>
                  {elicitation.agentId}
                </span>
              </Link>
            </div>
          )}

          {elicitation.createdAt && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Requested</span>
              <span className="text-sm text-muted-foreground">
                {new Date(elicitation.createdAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {riskFlags.length > 0 && (
          <div className="flex flex-col gap-1.5" data-testid={`section-risks-${elicitation.id}`}>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Risk Flags</span>
            <div className="flex flex-wrap gap-1.5">
              {riskFlags.map((flag, i) => (
                <Badge key={i} variant="destructive" className="text-[10px]" data-testid={`badge-risk-${elicitation.id}-${i}`}>
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {flag.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {args && Object.keys(args).length > 0 && (
          <div className="flex flex-col gap-1.5" data-testid={`section-args-${elicitation.id}`}>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Proposed Arguments</span>
            <pre className="text-xs bg-muted p-2.5 rounded-md overflow-auto max-h-32">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
        )}

        {elicitation.mode === "url" && elicitation.urlTarget && elicitation.status === "pending" && (
          <div className="flex flex-col gap-1.5 p-3 rounded-md border border-dashed" data-testid={`section-url-${elicitation.id}`}>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">URL Elicitation Panel</span>
            <p className="text-xs text-muted-foreground">
              The MCP server requests interaction via an external URL. Review and complete in a new window.
            </p>
            <a
              href={elicitation.urlTarget}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5"
            >
              <Button variant="outline" data-testid={`button-open-url-${elicitation.id}`}>
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Open URL
              </Button>
            </a>
          </div>
        )}

        {elicitation.decidedBy && elicitation.status !== "pending" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
            <span>Decided by <span className="font-medium">{elicitation.decidedBy}</span></span>
            {elicitation.decidedAt && (
              <span>at {new Date(elicitation.decidedAt).toLocaleString()}</span>
            )}
          </div>
        )}

        {elicitation.status === "pending" && onRespond && (
          <PermissionGate action="approve_changes">
            <div className="flex items-center gap-2 pt-2 border-t flex-wrap" data-testid={`actions-${elicitation.id}`}>
              <Button
                onClick={() => onRespond("approve")}
                disabled={isPending}
                data-testid={`button-approve-${elicitation.id}`}
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                Approve
              </Button>
              <Button
                variant="outline"
                onClick={() => onRespond("decline")}
                disabled={isPending}
                data-testid={`button-decline-${elicitation.id}`}
              >
                <XCircle className="w-3.5 h-3.5 mr-1.5" />
                Decline
              </Button>
              <Button
                variant="ghost"
                onClick={() => onRespond("cancel")}
                disabled={isPending}
                data-testid={`button-cancel-${elicitation.id}`}
              >
                <Ban className="w-3.5 h-3.5 mr-1.5" />
                Cancel
              </Button>
            </div>
          </PermissionGate>
        )}
      </CardContent>
    </Card>
  );
}
