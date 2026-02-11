import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Store, Search, Download, Star, Shield, CheckCircle2, Globe, Terminal,
  Package, ArrowRight, Filter, TrendingUp, Wrench, Brain, Database,
  MessageSquare, BookOpen, AlertTriangle, ShieldCheck, Users,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MarketplaceServer, RegistrySource, TrustedPublisher, MarketplaceInstallRequest } from "@shared/schema";

const CATEGORY_ICONS: Record<string, typeof Wrench> = {
  "developer-tools": Wrench,
  "ai-ml": Brain,
  "data": Database,
  "communication": MessageSquare,
  "search": Search,
  "business": TrendingUp,
  "knowledge": BookOpen,
  "general": Package,
};

const RISK_VARIANT: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  LOW: "secondary",
  MEDIUM: "outline",
  HIGH: "destructive",
  CRITICAL: "destructive",
};

function formatDownloads(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function MarketplacePage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [publisherFilter, setPublisherFilter] = useState("all");
  const [tab, setTab] = useState("browse");

  const { data: servers, isLoading: loadingServers } = useQuery<MarketplaceServer[]>({
    queryKey: ["/api/marketplace/servers"],
  });

  const { data: registrySources, isLoading: loadingRegistries } = useQuery<RegistrySource[]>({
    queryKey: ["/api/marketplace/registry-sources"],
  });

  const { data: trustedPubs, isLoading: loadingPubs } = useQuery<TrustedPublisher[]>({
    queryKey: ["/api/marketplace/trusted-publishers"],
  });

  const { data: installRequests } = useQuery<MarketplaceInstallRequest[]>({
    queryKey: ["/api/marketplace/install-requests"],
  });

  const installMutation = useMutation({
    mutationFn: async (serverId: string) => {
      const res = await apiRequest("POST", `/api/marketplace/servers/${serverId}/install`, { requestedBy: "current_user" });
      return res.json();
    },
    onSuccess: (data: { autoApproved?: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/servers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/install-requests"] });
      toast({
        title: data.autoApproved ? "Server installed" : "Install request submitted",
        description: data.autoApproved ? "Server auto-approved and ready to use" : "Awaiting Security Admin approval",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Install failed", description: err.message, variant: "destructive" });
    },
  });

  const categories = useMemo(() => {
    if (!servers) return [];
    const cats = new Set(servers.map((s) => s.category || "general"));
    return Array.from(cats).sort();
  }, [servers]);

  const publishers = useMemo(() => {
    if (!servers) return [];
    const pubs = new Set(servers.map((s) => s.publisher || "Unknown"));
    return Array.from(pubs).sort();
  }, [servers]);

  const filteredServers = useMemo(() => {
    if (!servers) return [];
    return servers.filter((s) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = (s.displayName || s.name).toLowerCase().includes(q)
          || (s.description || "").toLowerCase().includes(q)
          || (s.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
      if (publisherFilter !== "all" && s.publisher !== publisherFilter) return false;
      return true;
    });
  }, [servers, searchQuery, categoryFilter, publisherFilter]);

  const stats = useMemo(() => {
    if (!servers) return { total: 0, installed: 0, available: 0, categories: 0 };
    return {
      total: servers.length,
      installed: servers.filter((s) => s.installStatus === "installed").length,
      available: servers.filter((s) => s.installStatus === "available").length,
      categories: new Set(servers.map((s) => s.category)).size,
    };
  }, [servers]);

  const pendingRequests = installRequests?.filter((r) => r.status === "pending") || [];

  const isLoading = loadingServers || loadingRegistries || loadingPubs;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-marketplace-title">MCP Marketplace</h1>
          <p className="text-sm text-muted-foreground">Discover, install, and manage MCP servers from curated registries</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/integrations/marketplace/publishers">
            <Button variant="outline" data-testid="button-trusted-publishers">
              <ShieldCheck className="w-4 h-4 mr-1.5" />
              Trusted Publishers
            </Button>
          </Link>
          {pendingRequests.length > 0 && (
            <Badge variant="secondary" data-testid="badge-pending-installs">
              {pendingRequests.length} pending
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="stat-total-servers">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Available Servers</span>
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-muted-foreground" />
              <span className="text-xl font-semibold">{stats.total}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-installed">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Installed</span>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xl font-semibold">{stats.installed}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-registries">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Registries</span>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-500" />
              <span className="text-xl font-semibold">{registrySources?.length || 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-publishers">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Trusted Publishers</span>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-500" />
              <span className="text-xl font-semibold">{trustedPubs?.length || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="tabs-marketplace">
          <TabsTrigger value="browse" data-testid="tab-browse">Browse</TabsTrigger>
          <TabsTrigger value="registries" data-testid="tab-registries">Registries</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-requests">
            Install Requests
            {pendingRequests.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px]">{pendingRequests.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="flex flex-col gap-4 mt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search servers by name, description, or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-marketplace-search"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-category-filter">
                <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="option-category-all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c} data-testid={`option-category-${c}`}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={publisherFilter} onValueChange={setPublisherFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-publisher-filter">
                <SelectValue placeholder="Publisher" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="option-publisher-all">All Publishers</SelectItem>
                {publishers.map((p) => (
                  <SelectItem key={p} value={p} data-testid={`option-publisher-${p.replace(/\s+/g, "-").toLowerCase()}`}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredServers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Store className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-results">No servers match your search criteria</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredServers.map((server) => {
                const CategoryIcon = CATEGORY_ICONS[server.category || "general"] || Package;
                return (
                  <Card key={server.id} className="hover-elevate cursor-pointer flex flex-col" data-testid={`card-marketplace-server-${server.id}`}>
                    <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
                          <CategoryIcon className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <Link href={`/integrations/marketplace/${server.id}`}>
                            <CardTitle className="text-sm font-medium truncate" data-testid={`text-server-name-${server.id}`}>
                              {server.displayName || server.name}
                            </CardTitle>
                          </Link>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground truncate">{server.publisher}</span>
                            {server.publisherVerified && (
                              <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                            )}
                          </div>
                        </div>
                      </div>
                      {server.installStatus === "installed" && (
                        <Badge variant="default" className="text-[10px] shrink-0" data-testid={`badge-installed-${server.id}`}>
                          Installed
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 flex-1">
                      <p className="text-[11px] text-muted-foreground line-clamp-2" data-testid={`text-server-desc-${server.id}`}>
                        {server.description}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {server.transportType === "stdio" ? (
                            <Terminal className="w-3 h-3 mr-1" />
                          ) : (
                            <Globe className="w-3 h-3 mr-1" />
                          )}
                          {server.transportType}
                        </Badge>
                        <Badge variant={RISK_VARIANT[server.riskTier || "MEDIUM"]} className="text-[10px]">
                          <Shield className="w-3 h-3 mr-1" />
                          {server.riskTier}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">v{server.version}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground mt-auto">
                        {server.toolCount != null && server.toolCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Wrench className="w-3 h-3" />
                            {server.toolCount} tools
                          </span>
                        )}
                        {server.resourceCount != null && server.resourceCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Database className="w-3 h-3" />
                            {server.resourceCount} resources
                          </span>
                        )}
                        {server.downloads != null && (
                          <span className="flex items-center gap-1">
                            <Download className="w-3 h-3" />
                            {formatDownloads(server.downloads)}
                          </span>
                        )}
                        {server.rating != null && (
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                            {server.rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Link href={`/integrations/marketplace/${server.id}`} className="flex-1">
                          <Button variant="outline" size="sm" className="w-full" data-testid={`button-view-${server.id}`}>
                            Details
                            <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </Link>
                        {server.installStatus !== "installed" && (
                          <Button
                            size="sm"
                            disabled={installMutation.isPending || server.installStatus === "pending"}
                            onClick={(e) => {
                              e.stopPropagation();
                              installMutation.mutate(server.id);
                            }}
                            data-testid={`button-install-${server.id}`}
                          >
                            <Download className="w-3.5 h-3.5 mr-1" />
                            Install
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="registries" className="flex flex-col gap-4 mt-4">
          {(!registrySources || registrySources.length === 0) ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Globe className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No registry sources configured</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {registrySources.map((reg) => (
                <Card key={reg.id} data-testid={`card-registry-${reg.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <CardTitle className="text-sm font-medium" data-testid={`text-registry-name-${reg.id}`}>{reg.name}</CardTitle>
                        {reg.description && (
                          <span className="text-[11px] text-muted-foreground">{reg.description}</span>
                        )}
                      </div>
                    </div>
                    <Badge variant={reg.enabled ? "default" : "outline"} className="text-[10px] shrink-0">
                      {reg.enabled ? "Active" : "Disabled"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                      <span>API: {reg.apiUrl}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                      <span>Auth: {reg.authType}</span>
                      <span>Sync: every {reg.syncIntervalMinutes}m</span>
                      <span>Status: {reg.lastSyncStatus}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{reg.apiType}</Badge>
                      <Badge variant="outline" className="text-[10px]">{reg.serverCount} servers</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="requests" className="flex flex-col gap-4 mt-4">
          <InstallRequestsList requests={installRequests || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InstallRequestsList({ requests }: { requests: MarketplaceInstallRequest[] }) {
  const { toast } = useToast();

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/marketplace/install-requests/${id}/approve`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/install-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/servers"] });
      toast({ title: "Install request approved" });
    },
    onError: (err: Error) => {
      toast({ title: "Approval failed", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/marketplace/install-requests/${id}/reject`, { reason: "Rejected by admin" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/install-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/servers"] });
      toast({ title: "Install request rejected" });
    },
    onError: (err: Error) => {
      toast({ title: "Rejection failed", description: err.message, variant: "destructive" });
    },
  });

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <Package className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground" data-testid="text-no-install-requests">No install requests</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((req) => (
        <Card key={req.id} data-testid={`card-install-request-${req.id}`}>
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" data-testid={`text-request-name-${req.id}`}>{req.serverName}</span>
                <Badge variant={req.status === "pending" ? "outline" : req.status === "approved" ? "default" : "destructive"} className="text-[10px]">
                  {req.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                <span>Namespace: {req.namespace}</span>
                <span>Publisher: {req.publisher}</span>
                <span>Requested by: {req.requestedBy}</span>
              </div>
            </div>
            {req.status === "pending" && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => rejectMutation.mutate(req.id)}
                  disabled={rejectMutation.isPending}
                  data-testid={`button-reject-${req.id}`}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => approveMutation.mutate(req.id)}
                  disabled={approveMutation.isPending}
                  data-testid={`button-approve-${req.id}`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Approve
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
