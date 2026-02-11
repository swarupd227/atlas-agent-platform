import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageSquare, Server, Search, CheckCircle2, XCircle, Clock, FileText } from "lucide-react";
import { Link } from "wouter";

interface McpPromptItem {
  id: string;
  serverId: string;
  name: string;
  description: string | null;
  arguments: Array<{name: string; description: string; required: boolean}> | null;
  messages: Array<{role: string; content: string}> | null;
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

const APPROVAL_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  not_required: "default",
  approved: "default",
  pending_approval: "secondary",
  denied: "destructive",
};

export default function McpPromptsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [publishedFilter, setPublishedFilter] = useState("all");
  const [approvalFilter, setApprovalFilter] = useState("all");

  const { data: prompts, isLoading } = useQuery<McpPromptItem[]>({
    queryKey: ["/api/mcp-prompts"],
  });

  const serverNames = useMemo(() => {
    if (!prompts) return [];
    const names = new Set(prompts.map((p) => p.serverName));
    return Array.from(names).sort();
  }, [prompts]);

  const filteredPrompts = useMemo(() => {
    if (!prompts) return [];
    return prompts.filter((p) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!p.name.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (serverFilter !== "all" && p.serverName !== serverFilter) return false;
      if (publishedFilter !== "all" && p.publishedStatus !== publishedFilter) return false;
      if (approvalFilter !== "all" && p.approvalStatus !== approvalFilter) return false;
      return true;
    });
  }, [prompts, searchQuery, serverFilter, publishedFilter, approvalFilter]);

  const stats = useMemo(() => {
    if (!prompts) return { total: 0, published: 0, draft: 0, pendingApproval: 0 };
    return {
      total: prompts.length,
      published: prompts.filter((p) => p.publishedStatus === "published").length,
      draft: prompts.filter((p) => p.publishedStatus === "draft").length,
      pendingApproval: prompts.filter((p) => p.approvalStatus === "pending_approval").length,
    };
  }, [prompts]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <Card><CardContent className="p-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">MCP Prompts</h1>
        <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">Governed catalog of prompts synced from MCP servers</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="stat-total-prompts">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Prompts</span>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <span className="text-xl font-semibold">{stats.total}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-published">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Published</span>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xl font-semibold">{stats.published}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-draft">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Draft</span>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-xl font-semibold">{stats.draft}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-pending-approval">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending Approval</span>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-xl font-semibold">{stats.pendingApproval}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Select value={serverFilter} onValueChange={setServerFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-server-filter">
            <SelectValue placeholder="Server" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Servers</SelectItem>
            {serverNames.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={publishedFilter} onValueChange={setPublishedFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-published-filter">
            <SelectValue placeholder="Published" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>
        <Select value={approvalFilter} onValueChange={setApprovalFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-approval-filter">
            <SelectValue placeholder="Approval" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="not_required">Not Required</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredPrompts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <MessageSquare className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-prompts">
              No prompts found matching filters
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table data-testid="table-mcp-prompts">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Arguments</TableHead>
                  <TableHead>Owner</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPrompts.map((prompt) => (
                  <TableRow key={prompt.id} className="cursor-pointer" data-testid={`row-prompt-${prompt.id}`}>
                    <TableCell>
                      <Link href={`/integrations/mcp-prompts/${prompt.id}`}>
                        <span className="font-medium text-sm hover:underline" data-testid={`text-prompt-name-${prompt.id}`}>
                          {prompt.name}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground" data-testid={`text-prompt-server-${prompt.id}`}>
                        {prompt.serverName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]" data-testid={`text-prompt-description-${prompt.id}`}>
                        {prompt.description || "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={PUBLISHED_VARIANT[prompt.publishedStatus] || "default"}
                        className="text-[10px]"
                        data-testid={`badge-published-${prompt.id}`}
                      >
                        {prompt.publishedStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={APPROVAL_VARIANT[prompt.approvalStatus] || "default"}
                        className="text-[10px]"
                        data-testid={`badge-approval-${prompt.id}`}
                      >
                        {prompt.approvalStatus.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs" data-testid={`text-prompt-args-${prompt.id}`}>
                        {prompt.arguments ? prompt.arguments.length : 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground" data-testid={`text-prompt-owner-${prompt.id}`}>
                        {prompt.owner || "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
