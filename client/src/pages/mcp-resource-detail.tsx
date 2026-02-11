import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, Shield, FileText, AlertCircle, RefreshCw,
  Clock, Activity, CheckCircle2, XCircle, Eye, Link as LinkIcon,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface McpResourceDetail {
  id: string;
  serverId: string;
  uri: string;
  name: string;
  description: string | null;
  mimeType: string | null;
  size: number | null;
  sensitivityLevel: "public" | "internal" | "confidential" | "restricted";
  approvalStatus: "auto_approved" | "pending" | "approved" | "denied";
  approvedBy: string | null;
  approvedAt: string | null;
  freshnessStatus: "fresh" | "stale" | "unknown";
  lastCheckedAt: string | null;
  subscribed: boolean;
  contentType: "text" | "blob";
  owner: string | null;
  syncedAt: string | null;
  annotations: Record<string, unknown> | null;
  serverName: string;
  serverStatus: string;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "\u2014";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

const SENSITIVITY_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  public: "default",
  internal: "secondary",
  confidential: "destructive",
  restricted: "destructive",
};

const APPROVAL_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  auto_approved: "default",
  approved: "default",
  pending: "outline",
  denied: "destructive",
};

export default function McpResourceDetailPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/integrations/mcp-resources/:id");
  const id = params?.id || "";

  const { data: resource, isLoading } = useQuery<McpResourceDetail>({
    queryKey: ["/api/mcp-resources", id],
    enabled: !!id,
  });

  const [editOwner, setEditOwner] = useState<string | null>(null);
  const [editSensitivity, setEditSensitivity] = useState<string | null>(null);

  const owner = editOwner ?? resource?.owner ?? "";
  const sensitivityLevel = editSensitivity ?? resource?.sensitivityLevel ?? "public";

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/mcp-resources/${id}`, {
        sensitivityLevel,
        owner: owner || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-resources", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-resources"] });
      toast({ title: "Governance settings saved" });
      setEditOwner(null);
      setEditSensitivity(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const requestApprovalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mcp-resources/${id}/request-approval`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-resources", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-resources"] });
      toast({ title: "Approval requested" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to request approval", description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (action: "approve" | "deny") => {
      const res = await apiRequest("POST", `/api/mcp-resources/${id}/approve`, { action });
      return res.json();
    },
    onSuccess: (_data: unknown, action: "approve" | "deny") => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-resources", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-resources"] });
      toast({ title: action === "approve" ? "Resource approved" : "Resource denied" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to process approval", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Link href="/integrations/mcp-resources" data-testid="link-back-mcp-resources">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to MCP Resources
          </Button>
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <AlertCircle className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-resource-not-found">Resource not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const annotations = (resource.annotations || {}) as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4">
        <Link href="/integrations/mcp-resources" data-testid="link-back-mcp-resources">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to MCP Resources
          </Button>
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-resource-name">
              {resource.name}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant={SENSITIVITY_VARIANT[resource.sensitivityLevel] || "default"}
                data-testid="badge-sensitivity"
              >
                <Shield className="w-3 h-3 mr-1" />
                {resource.sensitivityLevel}
              </Badge>
              <Badge
                variant={APPROVAL_VARIANT[resource.approvalStatus] || "outline"}
                data-testid="badge-approval"
              >
                {resource.approvalStatus === "approved" || resource.approvalStatus === "auto_approved" ? (
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                ) : resource.approvalStatus === "denied" ? (
                  <XCircle className="w-3 h-3 mr-1" />
                ) : (
                  <Clock className="w-3 h-3 mr-1" />
                )}
                {resource.approvalStatus.replace("_", " ")}
              </Badge>
              <Badge
                variant={resource.freshnessStatus === "fresh" ? "default" : resource.freshnessStatus === "stale" ? "destructive" : "secondary"}
                data-testid="badge-freshness"
              >
                <Activity className="w-3 h-3 mr-1" />
                {resource.freshnessStatus}
              </Badge>
              <Badge
                variant={resource.subscribed ? "default" : "outline"}
                data-testid="badge-subscribed"
              >
                <Eye className="w-3 h-3 mr-1" />
                {resource.subscribed ? "Subscribed" : "Not Subscribed"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="annotations" data-testid="tab-annotations">
            <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
            Annotations
          </TabsTrigger>
          <TabsTrigger value="governance" data-testid="tab-governance">
            <Shield className="w-3.5 h-3.5 mr-1.5" />
            Governance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="card-resource-info">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  Resource Info
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">URI</span>
                  <span className="text-xs font-mono" data-testid="text-uri">{resource.uri}</span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">MIME Type</span>
                  <span className="text-xs" data-testid="text-mime-type">{resource.mimeType || "\u2014"}</span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Size</span>
                  <span className="text-xs" data-testid="text-size">{formatSize(resource.size)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Content Type</span>
                  <span className="text-xs" data-testid="text-content-type">{resource.contentType}</span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Server</span>
                  <span className="text-xs" data-testid="text-server-name">{resource.serverName}</span>
                </div>
                {resource.description && (
                  <div className="flex flex-col gap-1 mt-2">
                    <span className="text-xs text-muted-foreground">Description</span>
                    <p className="text-xs" data-testid="text-description">{resource.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-freshness">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Activity className="w-4 h-4" />
                  Freshness
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Freshness Status</span>
                  <Badge
                    variant={resource.freshnessStatus === "fresh" ? "default" : resource.freshnessStatus === "stale" ? "destructive" : "secondary"}
                    className="text-[10px]"
                    data-testid="badge-freshness-detail"
                  >
                    {resource.freshnessStatus}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Last Checked At</span>
                  <span className="text-xs" data-testid="text-last-checked">
                    {resource.lastCheckedAt ? new Date(resource.lastCheckedAt).toLocaleString() : "Never"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Subscribed</span>
                  <Badge
                    variant={resource.subscribed ? "default" : "outline"}
                    className="text-[10px]"
                    data-testid="badge-subscribed-detail"
                  >
                    {resource.subscribed ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Synced At</span>
                  <span className="text-xs" data-testid="text-synced-at">
                    {resource.syncedAt ? new Date(resource.syncedAt).toLocaleString() : "Never"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="annotations" className="flex flex-col gap-4 mt-4">
          <Card data-testid="card-annotations">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <LinkIcon className="w-4 h-4" />
                Annotations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(annotations).length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-annotations">No annotations</p>
              ) : (
                <Table data-testid="table-annotations">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(annotations).map(([key, value]) => (
                      <TableRow key={key} data-testid={`annotation-row-${key}`}>
                        <TableCell className="text-xs font-medium">{key}</TableCell>
                        <TableCell className="text-xs">{String(value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="governance" className="flex flex-col gap-4 mt-4">
          <Card data-testid="card-governance">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                Governance
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Sensitivity Level</Label>
                <Select value={sensitivityLevel} onValueChange={(v) => setEditSensitivity(v)}>
                  <SelectTrigger data-testid="select-sensitivity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="confidential">Confidential</SelectItem>
                    <SelectItem value="restricted">Restricted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="owner-input">Owner</Label>
                <Input
                  id="owner-input"
                  value={owner}
                  onChange={(e) => setEditOwner(e.target.value)}
                  placeholder="Assign an owner"
                  data-testid="input-owner"
                />
              </div>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                data-testid="button-save-governance"
              >
                {saveMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                ) : null}
                {saveMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>

          <Card data-testid="card-approval">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Approval
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Status</span>
                <Badge
                  variant={APPROVAL_VARIANT[resource.approvalStatus] || "outline"}
                  className="text-[10px]"
                  data-testid="badge-approval-detail"
                >
                  {resource.approvalStatus.replace("_", " ")}
                </Badge>
              </div>

              {resource.approvalStatus === "pending" && (
                <div className="flex flex-col gap-1" data-testid="section-pending-approval">
                  <span className="text-xs text-muted-foreground">Pending Approval</span>
                  <span className="text-xs">Awaiting review from a Security Admin</span>
                </div>
              )}

              {resource.approvalStatus === "approved" && (
                <div className="flex flex-col gap-1" data-testid="section-approved">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Approved By</span>
                    <span className="text-xs" data-testid="text-approved-by">{resource.approvedBy || "\u2014"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Approved At</span>
                    <span className="text-xs" data-testid="text-approved-at">
                      {resource.approvedAt ? new Date(resource.approvedAt).toLocaleString() : "\u2014"}
                    </span>
                  </div>
                </div>
              )}

              {resource.approvalStatus === "denied" && (
                <div className="flex flex-col gap-1" data-testid="section-denied">
                  <span className="text-xs text-muted-foreground">This resource has been denied</span>
                </div>
              )}

              {resource.approvalStatus === "auto_approved" && (
                <div className="flex flex-col gap-1" data-testid="section-auto-approved">
                  <span className="text-xs text-muted-foreground">This resource was automatically approved</span>
                </div>
              )}

              {resource.approvalStatus !== "approved" && resource.approvalStatus !== "auto_approved" && (
                <Button
                  variant="outline"
                  onClick={() => requestApprovalMutation.mutate()}
                  disabled={requestApprovalMutation.isPending}
                  data-testid="button-request-approval"
                >
                  {requestApprovalMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Clock className="w-4 h-4 mr-1.5" />
                  )}
                  Request Approval
                </Button>
              )}

              <div className="flex flex-col gap-2 mt-2 border-t pt-3">
                <span className="text-xs text-muted-foreground">Security Admin Actions</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="default"
                    onClick={() => approveMutation.mutate("approve")}
                    disabled={approveMutation.isPending}
                    data-testid="button-approve"
                  >
                    {approveMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    )}
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => approveMutation.mutate("deny")}
                    disabled={approveMutation.isPending}
                    data-testid="button-deny"
                  >
                    {approveMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4 mr-1.5" />
                    )}
                    Deny
                  </Button>
                </div>
                <span className="text-[10px] text-muted-foreground">These actions are only available for users with the Security Admin role.</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}