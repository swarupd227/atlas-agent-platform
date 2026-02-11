import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, Shield, FileText, AlertCircle, RefreshCw,
  Clock, CheckCircle2, XCircle, MessageSquare, List, User, Bot, Monitor,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/components/role-provider";

interface McpPromptDetail {
  id: string;
  serverId: string;
  name: string;
  description: string | null;
  arguments: Array<{ name: string; description: string; required: boolean }> | null;
  messages: Array<{ role: string; content: string }> | null;
  publishedStatus: "draft" | "published";
  publishedBy: string | null;
  approvalStatus: "not_required" | "pending_approval" | "approved" | "denied";
  approvedBy: string | null;
  approvedAt: string | null;
  embeddedResourceRefs: string[] | null;
  owner: string | null;
  syncedAt: string | null;
  serverName: string;
  serverStatus: string;
}

const PUBLISHED_VARIANT: Record<string, "default" | "secondary"> = {
  published: "default",
  draft: "secondary",
};

const APPROVAL_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  not_required: "secondary",
  approved: "default",
  pending_approval: "outline",
  denied: "destructive",
};

function renderContentWithVariables(content: string) {
  const parts = content.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, i) => {
    if (/^\{\{[^}]+\}\}$/.test(part)) {
      return (
        <Badge key={i} variant="outline" className="text-[10px] mx-0.5">
          {part}
        </Badge>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function getRoleIcon(role: string) {
  switch (role) {
    case "system":
      return <Monitor className="w-3.5 h-3.5" />;
    case "user":
      return <User className="w-3.5 h-3.5" />;
    case "assistant":
      return <Bot className="w-3.5 h-3.5" />;
    default:
      return <MessageSquare className="w-3.5 h-3.5" />;
  }
}

function getRoleStyle(role: string) {
  switch (role) {
    case "system":
      return "bg-muted/50 border-muted";
    case "user":
      return "bg-card border-border";
    case "assistant":
      return "bg-muted/30 border-muted";
    default:
      return "bg-card border-border";
  }
}

export default function McpPromptDetailPage() {
  const { toast } = useToast();
  const { role } = useRole();
  const [, params] = useRoute("/integrations/mcp-prompts/:id");
  const id = params?.id || "";

  const { data: prompt, isLoading } = useQuery<McpPromptDetail>({
    queryKey: ["/api/mcp-prompts", id],
    enabled: !!id,
  });

  const publishMutation = useMutation({
    mutationFn: async (newStatus: "published" | "draft") => {
      const res = await apiRequest("PATCH", `/api/mcp-prompts/${id}`, {
        publishedStatus: newStatus,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-prompts", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-prompts"] });
      toast({ title: "Published status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update status", description: err.message, variant: "destructive" });
    },
  });

  const requestApprovalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mcp-prompts/${id}/request-approval`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-prompts", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-prompts"] });
      toast({ title: "Approval requested" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to request approval", description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (action: "approve" | "deny") => {
      const res = await apiRequest("POST", `/api/mcp-prompts/${id}/approve`, { action });
      return res.json();
    },
    onSuccess: (_data: unknown, action: "approve" | "deny") => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-prompts", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-prompts"] });
      toast({ title: action === "approve" ? "Prompt approved" : "Prompt denied" });
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

  if (!prompt) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Link href="/integrations/mcp-prompts" data-testid="link-back-mcp-prompts">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to MCP Prompts
          </Button>
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <AlertCircle className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-prompt-not-found">Prompt not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const args = prompt.arguments || [];
  const messages = prompt.messages || [];
  const embeddedRefs = prompt.embeddedResourceRefs || [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4">
        <Link href="/integrations/mcp-prompts" data-testid="link-back-mcp-prompts">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to MCP Prompts
          </Button>
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-prompt-name">
              {prompt.name}
            </h1>
            {prompt.description && (
              <p className="text-sm text-muted-foreground" data-testid="text-prompt-description">
                {prompt.description}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" data-testid="badge-server-name">
                {prompt.serverName}
              </Badge>
              <Badge
                variant={PUBLISHED_VARIANT[prompt.publishedStatus] || "secondary"}
                data-testid="badge-published"
              >
                {prompt.publishedStatus === "published" ? (
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                ) : (
                  <Clock className="w-3 h-3 mr-1" />
                )}
                {prompt.publishedStatus}
              </Badge>
              <Badge
                variant={APPROVAL_VARIANT[prompt.approvalStatus] || "outline"}
                data-testid="badge-approval"
              >
                {prompt.approvalStatus === "approved" ? (
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                ) : prompt.approvalStatus === "denied" ? (
                  <XCircle className="w-3 h-3 mr-1" />
                ) : (
                  <Clock className="w-3 h-3 mr-1" />
                )}
                {prompt.approvalStatus.replace("_", " ")}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="arguments">
        <TabsList className="flex-wrap">
          <TabsTrigger value="arguments" data-testid="tab-arguments">
            <List className="w-3.5 h-3.5 mr-1.5" />
            Arguments
          </TabsTrigger>
          <TabsTrigger value="messages" data-testid="tab-messages">
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            Message Preview
          </TabsTrigger>
          <TabsTrigger value="governance" data-testid="tab-governance">
            <Shield className="w-3.5 h-3.5 mr-1.5" />
            Governance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="arguments" className="flex flex-col gap-4 mt-4">
          <Card data-testid="card-arguments">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <List className="w-4 h-4" />
                Prompt Arguments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {args.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground" data-testid="text-no-arguments">No arguments defined</p>
                </div>
              ) : (
                <Table data-testid="table-arguments">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Required</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {args.map((arg, index) => (
                      <TableRow key={arg.name} data-testid={`row-argument-${index}`}>
                        <TableCell className="text-xs font-medium font-mono">{arg.name}</TableCell>
                        <TableCell className="text-xs">{arg.description}</TableCell>
                        <TableCell>
                          <Badge
                            variant={arg.required ? "default" : "secondary"}
                            className="text-[10px]"
                            data-testid={`badge-required-${index}`}
                          >
                            {arg.required ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="flex flex-col gap-4 mt-4">
          <Card data-testid="card-messages">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4" />
                Message Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <MessageSquare className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground" data-testid="text-no-messages">No messages defined</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3" data-testid="list-messages">
                  {messages.map((msg, index) => (
                    <div
                      key={index}
                      className={`rounded-md border p-3 ${getRoleStyle(msg.role)}`}
                      data-testid={`message-${index}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {getRoleIcon(msg.role)}
                        <span className="text-xs font-medium capitalize" data-testid={`message-role-${index}`}>
                          {msg.role}
                        </span>
                      </div>
                      <div className="text-sm leading-relaxed" data-testid={`message-content-${index}`}>
                        {renderContentWithVariables(msg.content)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="governance" className="flex flex-col gap-4 mt-4">
          <Card data-testid="card-publish">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                Published Status
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Status</span>
                <Badge
                  variant={PUBLISHED_VARIANT[prompt.publishedStatus] || "secondary"}
                  className="text-[10px]"
                  data-testid="badge-published-detail"
                >
                  {prompt.publishedStatus}
                </Badge>
              </div>
              {prompt.publishedBy && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Published By</span>
                  <span className="text-xs" data-testid="text-published-by">{prompt.publishedBy}</span>
                </div>
              )}
              <Button
                variant={prompt.publishedStatus === "published" ? "outline" : "default"}
                onClick={() =>
                  publishMutation.mutate(
                    prompt.publishedStatus === "published" ? "draft" : "published"
                  )
                }
                disabled={publishMutation.isPending}
                data-testid="button-toggle-publish"
              >
                {publishMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                ) : prompt.publishedStatus === "published" ? (
                  <XCircle className="w-4 h-4 mr-1.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                )}
                {prompt.publishedStatus === "published" ? "Unpublish" : "Publish"}
              </Button>
            </CardContent>
          </Card>

          {prompt.owner && (
            <Card data-testid="card-owner">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <User className="w-4 h-4" />
                  Owner
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-xs" data-testid="text-owner">{prompt.owner}</span>
              </CardContent>
            </Card>
          )}

          {embeddedRefs.length > 0 && (
            <Card data-testid="card-embedded-refs">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  Embedded Resource Refs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1.5">
                  {embeddedRefs.map((ref, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]" data-testid={`badge-ref-${index}`}>
                        {ref}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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
                  variant={APPROVAL_VARIANT[prompt.approvalStatus] || "outline"}
                  className="text-[10px]"
                  data-testid="badge-approval-detail"
                >
                  {prompt.approvalStatus.replace("_", " ")}
                </Badge>
              </div>

              {prompt.approvalStatus === "approved" && (
                <div className="flex flex-col gap-1" data-testid="section-approved">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Approved By</span>
                    <span className="text-xs" data-testid="text-approved-by">{prompt.approvedBy || "\u2014"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Approved At</span>
                    <span className="text-xs" data-testid="text-approved-at">
                      {prompt.approvedAt ? new Date(prompt.approvedAt).toLocaleString() : "\u2014"}
                    </span>
                  </div>
                </div>
              )}

              {prompt.approvalStatus === "pending_approval" && (
                <div className="flex flex-col gap-1" data-testid="section-pending-approval">
                  <span className="text-xs text-muted-foreground">Pending Approval</span>
                  <span className="text-xs">Awaiting review</span>
                </div>
              )}

              {prompt.approvalStatus === "denied" && (
                <div className="flex flex-col gap-1" data-testid="section-denied">
                  <span className="text-xs text-muted-foreground">This prompt has been denied</span>
                </div>
              )}

              {prompt.approvalStatus === "not_required" && embeddedRefs.length > 0 && (
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

              {prompt.approvalStatus === "pending_approval" && (
                <div className="flex flex-col gap-2 mt-2 border-t pt-3">
                  <span className="text-xs text-muted-foreground">Admin Actions</span>
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
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
