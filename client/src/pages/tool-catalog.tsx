import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wrench, Shield, Server, CheckCircle2, AlertTriangle, Search } from "lucide-react";
import { Link } from "wouter";

interface ToolCatalogItem {
  id: string;
  serverId: string;
  name: string;
  description: string | null;
  inputSchema: unknown;
  outputSchema: unknown;
  annotations: unknown;
  fingerprintHash: string | null;
  riskClassification: "low" | "medium" | "high" | "critical";
  owner: string | null;
  enabled: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  lastDriftAt: string | null;
  driftStatus: string | null;
  syncedAt: string | null;
  serverName: string;
  serverStatus: string;
}

const RISK_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  low: "default",
  medium: "secondary",
  high: "destructive",
  critical: "destructive",
};

export default function ToolCatalogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [enabledFilter, setEnabledFilter] = useState("all");

  const { data: tools, isLoading } = useQuery<ToolCatalogItem[]>({
    queryKey: ["/api/tool-catalog"],
  });

  const serverNames = useMemo(() => {
    if (!tools) return [];
    const names = new Set(tools.map((t) => t.serverName));
    return Array.from(names).sort();
  }, [tools]);

  const filteredTools = useMemo(() => {
    if (!tools) return [];
    return tools.filter((t) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !(t.description || "").toLowerCase().includes(q)) {
          return false;
        }
      }
      if (serverFilter !== "all" && t.serverName !== serverFilter) return false;
      if (riskFilter !== "all" && t.riskClassification !== riskFilter) return false;
      if (enabledFilter === "enabled" && !t.enabled) return false;
      if (enabledFilter === "disabled" && t.enabled) return false;
      return true;
    });
  }, [tools, searchQuery, serverFilter, riskFilter, enabledFilter]);

  const stats = useMemo(() => {
    if (!tools) return { total: 0, enabled: 0, highCritical: 0, servers: 0 };
    const serverIds = new Set(tools.map((t) => t.serverId));
    return {
      total: tools.length,
      enabled: tools.filter((t) => t.enabled).length,
      highCritical: tools.filter((t) => t.riskClassification === "high" || t.riskClassification === "critical").length,
      servers: serverIds.size,
    };
  }, [tools]);

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
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">MCP Tool Registry</h1>
        <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">Governed inventory of tools synced from MCP servers</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="stat-total-tools">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Tools</span>
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-muted-foreground" />
              <span className="text-xl font-semibold">{stats.total}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-enabled">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Enabled</span>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xl font-semibold">{stats.enabled}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-high-critical">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">High / Critical Risk</span>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-xl font-semibold">{stats.highCritical}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-servers">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Servers</span>
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <span className="text-xl font-semibold">{stats.servers}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tools by name or description..."
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
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-risk-filter">
            <SelectValue placeholder="Risk Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risks</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={enabledFilter} onValueChange={setEnabledFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-enabled-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="enabled">Enabled</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredTools.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Wrench className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-tools">
              No tools found matching filters
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table data-testid="table-tool-catalog">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Drift</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Last Synced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTools.map((tool) => (
                  <TableRow key={tool.id} className="cursor-pointer" data-testid={`row-tool-${tool.id}`}>
                    <TableCell>
                      <Link href={`/integrations/tool-catalog/${tool.id}`}>
                        <span className="font-medium text-sm hover:underline" data-testid={`text-tool-name-${tool.id}`}>
                          {tool.name}
                        </span>
                      </Link>
                      {tool.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tool.description}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground" data-testid={`text-tool-server-${tool.id}`}>
                        {tool.serverName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={RISK_VARIANT[tool.riskClassification] || "default"}
                        className="text-[10px]"
                        data-testid={`badge-risk-${tool.id}`}
                      >
                        <Shield className="w-3 h-3 mr-1" />
                        {tool.riskClassification}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={tool.enabled ? "default" : "outline"}
                        className="text-[10px]"
                        data-testid={`badge-enabled-${tool.id}`}
                      >
                        {tool.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={tool.driftStatus === "drifted" ? "destructive" : "default"}
                        className="text-[10px]"
                        data-testid={`badge-drift-${tool.id}`}
                      >
                        {tool.driftStatus || "stable"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground" data-testid={`text-tool-owner-${tool.id}`}>
                        {tool.owner || "Unassigned"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs" data-testid={`text-tool-usage-${tool.id}`}>
                        {tool.usageCount}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground" data-testid={`text-tool-synced-${tool.id}`}>
                        {tool.syncedAt ? new Date(tool.syncedAt).toLocaleDateString() : "Never"}
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
