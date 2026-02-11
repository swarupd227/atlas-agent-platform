import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, ShieldAlert, CheckCircle2, XCircle, Clock, Search, Server } from "lucide-react";
import { Link } from "wouter";

interface McpResourceItem {
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
  annotations: unknown;
  serverName: string;
  serverStatus: string;
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
  pending: "secondary",
  denied: "destructive",
};

const FRESHNESS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  fresh: "default",
  stale: "destructive",
  unknown: "secondary",
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

export default function McpResourcesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [sensitivityFilter, setSensitivityFilter] = useState("all");
  const [approvalFilter, setApprovalFilter] = useState("all");

  const { data: resources, isLoading } = useQuery<McpResourceItem[]>({
    queryKey: ["/api/mcp-resources"],
  });

  const serverNames = useMemo(() => {
    if (!resources) return [];
    const names = new Set(resources.map((r) => r.serverName));
    return Array.from(names).sort();
  }, [resources]);

  const filteredResources = useMemo(() => {
    if (!resources) return [];
    return resources.filter((r) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !r.name.toLowerCase().includes(q) &&
          !r.uri.toLowerCase().includes(q) &&
          !(r.description || "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (serverFilter !== "all" && r.serverName !== serverFilter) return false;
      if (sensitivityFilter !== "all" && r.sensitivityLevel !== sensitivityFilter) return false;
      if (approvalFilter !== "all" && r.approvalStatus !== approvalFilter) return false;
      return true;
    });
  }, [resources, searchQuery, serverFilter, sensitivityFilter, approvalFilter]);

  const stats = useMemo(() => {
    if (!resources) return { total: 0, approved: 0, pending: 0, sensitive: 0 };
    return {
      total: resources.length,
      approved: resources.filter((r) => r.approvalStatus === "approved" || r.approvalStatus === "auto_approved").length,
      pending: resources.filter((r) => r.approvalStatus === "pending").length,
      sensitive: resources.filter((r) => r.sensitivityLevel === "confidential" || r.sensitivityLevel === "restricted").length,
    };
  }, [resources]);

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
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">MCP Resources</h1>
        <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">Governed inventory of resources synced from MCP servers</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="stat-total-resources">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Resources</span>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-xl font-semibold">{stats.total}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-approved">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Approved</span>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xl font-semibold">{stats.approved}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-pending">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending Approval</span>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-xl font-semibold">{stats.pending}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-sensitive">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Sensitive</span>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive" />
              <span className="text-xl font-semibold">{stats.sensitive}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, URI, or description..."
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
        <Select value={sensitivityFilter} onValueChange={setSensitivityFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-sensitivity-filter">
            <SelectValue placeholder="Sensitivity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
            <SelectItem value="confidential">Confidential</SelectItem>
            <SelectItem value="restricted">Restricted</SelectItem>
          </SelectContent>
        </Select>
        <Select value={approvalFilter} onValueChange={setApprovalFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-approval-filter">
            <SelectValue placeholder="Approval" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="auto_approved">Auto Approved</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredResources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <FileText className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-resources">
              No resources found matching filters
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table data-testid="table-mcp-resources">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Sensitivity</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Freshness</TableHead>
                  <TableHead>Subscribed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResources.map((resource) => (
                  <TableRow key={resource.id} className="cursor-pointer" data-testid={`row-resource-${resource.id}`}>
                    <TableCell>
                      <Link href={`/integrations/mcp-resources/${resource.id}`}>
                        <span className="font-medium text-sm hover:underline" data-testid={`text-resource-name-${resource.id}`}>
                          {resource.name}
                        </span>
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-resource-uri-${resource.id}`}>
                        {resource.uri}
                      </p>
                      {resource.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1" data-testid={`text-resource-description-${resource.id}`}>
                          {resource.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground" data-testid={`text-resource-server-${resource.id}`}>
                        {resource.serverName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-[10px]"
                        data-testid={`badge-type-${resource.id}`}
                      >
                        {resource.mimeType || "Unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs" data-testid={`text-resource-size-${resource.id}`}>
                        {formatSize(resource.size)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={SENSITIVITY_VARIANT[resource.sensitivityLevel] || "default"}
                        className="text-[10px]"
                        data-testid={`badge-sensitivity-${resource.id}`}
                      >
                        {resource.sensitivityLevel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={APPROVAL_VARIANT[resource.approvalStatus] || "default"}
                        className="text-[10px]"
                        data-testid={`badge-approval-${resource.id}`}
                      >
                        {resource.approvalStatus === "auto_approved" ? "Auto Approved" : resource.approvalStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={FRESHNESS_VARIANT[resource.freshnessStatus] || "default"}
                        className="text-[10px]"
                        data-testid={`badge-freshness-${resource.id}`}
                      >
                        {resource.freshnessStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center" data-testid={`div-subscribed-${resource.id}`}>
                        {resource.subscribed ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" data-testid={`icon-subscribed-${resource.id}`} />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted-foreground" data-testid={`icon-not-subscribed-${resource.id}`} />
                        )}
                      </div>
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
