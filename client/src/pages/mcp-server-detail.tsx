import { useState, useMemo } from "react";
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
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Server, Shield, Activity, CheckCircle2, AlertCircle,
  Globe, Terminal, Wrench, FileText, MessageSquare, Lock,
  RefreshCw, Clock, Zap, Play,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { McpServer, McpServerTool, McpServerResource, McpServerPrompt, McpServerAuth, AuditEvent } from "@shared/schema";

const HEALTH_COLOR: Record<string, string> = {
  healthy: "bg-green-500",
  degraded: "bg-yellow-500",
  unhealthy: "bg-red-500",
  unknown: "bg-gray-400",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  registered: "outline",
  verified: "secondary",
  "production-enabled": "default",
};

export default function McpServerDetail() {
  const { toast } = useToast();
  const [, params] = useRoute("/integrations/mcp-servers/:id");
  const id = params?.id || "";

  const { data: server, isLoading } = useQuery<McpServer>({
    queryKey: ["/api/mcp-servers", id],
    enabled: !!id,
  });

  const { data: tools } = useQuery<McpServerTool[]>({
    queryKey: ["/api/mcp-servers", id, "tools"],
    enabled: !!id,
  });

  const { data: resources } = useQuery<McpServerResource[]>({
    queryKey: ["/api/mcp-servers", id, "resources"],
    enabled: !!id,
  });

  const { data: prompts } = useQuery<McpServerPrompt[]>({
    queryKey: ["/api/mcp-servers", id, "prompts"],
    enabled: !!id,
  });

  const { data: auth } = useQuery<McpServerAuth>({
    queryKey: ["/api/mcp-servers", id, "auth"],
    enabled: !!id,
  });

  const { data: allAuditEvents } = useQuery<AuditEvent[]>({
    queryKey: ["/api/audit-events"],
  });

  const auditEvents = useMemo(() => {
    if (!allAuditEvents) return [];
    return allAuditEvents.filter(
      (e) => e.objectType === "mcp_server" && e.objectId === id
    );
  }, [allAuditEvents, id]);

  const initializeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/mcp-servers/${id}/initialize`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id] });
      toast({ title: "Server initialized" });
    },
    onError: (err: Error) => {
      toast({ title: "Initialization failed", description: err.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/mcp-servers/${id}/sync-catalogs`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id, "tools"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id, "resources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id, "prompts"] });
      toast({ title: "Catalogs synced" });
    },
    onError: (err: Error) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const enableProdMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/mcp-servers/${id}/enable-production`);
      return res.json();
    },
    onSuccess: (data: { approved?: boolean; approvalRequired?: boolean; approvalId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id] });
      if (data.approved) {
        toast({ title: "Production enabled", description: "Server has been enabled for production use." });
      } else if (data.approvalRequired) {
        toast({ title: "Approval required", description: "A Security Admin must approve production enablement before this server can be used in production." });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to enable production", description: err.message, variant: "destructive" });
    },
  });

  const [authType, setAuthType] = useState("none");
  const [authToken, setAuthToken] = useState("");
  const [authKeyName, setAuthKeyName] = useState("");
  const [authKeyValue, setAuthKeyValue] = useState("");
  const [authClientId, setAuthClientId] = useState("");
  const [authClientSecret, setAuthClientSecret] = useState("");
  const [authTokenUrl, setAuthTokenUrl] = useState("");

  const saveAuthMutation = useMutation({
    mutationFn: () => {
      let config: Record<string, string> = {};
      if (authType === "bearer_token") config = { token: authToken };
      else if (authType === "api_key") config = { keyName: authKeyName, keyValue: authKeyValue };
      else if (authType === "oauth2") config = { clientId: authClientId, clientSecret: authClientSecret, tokenUrl: authTokenUrl };
      return apiRequest("PUT", `/api/mcp-servers/${id}/auth`, { authType, config });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id, "auth"] });
      toast({ title: "Auth configuration saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save auth", description: err.message, variant: "destructive" });
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

  if (!server) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Link href="/integrations/mcp-servers" data-testid="link-back-mcp-servers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to MCP Servers
          </Button>
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <AlertCircle className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Server not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const capabilities = (server.capabilities || {}) as Record<string, unknown>;
  const serverInfo = (server.serverInfo || {}) as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4">
        <Link href="/integrations/mcp-servers" data-testid="link-back-mcp-servers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to MCP Servers
          </Button>
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-mcp-server-name">
              {server.name}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={STATUS_VARIANT[server.status] || "outline"} data-testid="badge-status">
                {server.status}
              </Badge>
              <Badge
                variant={server.riskTier === "CRITICAL" || server.riskTier === "HIGH" ? "destructive" : "outline"}
                data-testid="badge-risk-tier"
              >
                <Shield className="w-3 h-3 mr-1" />
                {server.riskTier}
              </Badge>
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${HEALTH_COLOR[server.healthStatus || "unknown"]}`}
                  data-testid="indicator-health"
                />
                <span className="text-xs text-muted-foreground" data-testid="text-health-status">
                  {server.healthStatus || "unknown"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => initializeMutation.mutate()}
              disabled={initializeMutation.isPending}
              data-testid="button-initialize"
            >
              {initializeMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-1.5" />
              )}
              Initialize
            </Button>
            <Button
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-catalogs"
            >
              {syncMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1.5" />
              )}
              Sync Catalogs
            </Button>
            <Button
              onClick={() => enableProdMutation.mutate()}
              disabled={enableProdMutation.isPending}
              data-testid="button-enable-production"
            >
              {enableProdMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-1.5" />
              )}
              Enable Production
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <Server className="w-3.5 h-3.5 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="capabilities" data-testid="tab-capabilities">
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            Capabilities
          </TabsTrigger>
          <TabsTrigger value="tools" data-testid="tab-tools">
            <Wrench className="w-3.5 h-3.5 mr-1.5" />
            Tools
            {tools && tools.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px]">{tools.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="resources" data-testid="tab-resources">
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Resources
          </TabsTrigger>
          <TabsTrigger value="prompts" data-testid="tab-prompts">
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            Prompts
          </TabsTrigger>
          <TabsTrigger value="auth" data-testid="tab-auth">
            <Lock className="w-3.5 h-3.5 mr-1.5" />
            Auth
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="card-connection-info">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Globe className="w-4 h-4" />
                  Connection Info
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Transport Type</span>
                  <Badge variant="outline" className="text-[10px]" data-testid="text-transport-type">
                    {server.transportType === "stdio" ? (
                      <Terminal className="w-3 h-3 mr-1" />
                    ) : (
                      <Globe className="w-3 h-3 mr-1" />
                    )}
                    {server.transportType}
                  </Badge>
                </div>
                {server.url && (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">URL</span>
                    <span className="text-xs font-mono" data-testid="text-url">{server.url}</span>
                  </div>
                )}
                {server.command && (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Command</span>
                    <span className="text-xs font-mono" data-testid="text-command">
                      {server.command} {(server.args || []).join(" ")}
                    </span>
                  </div>
                )}
                <Separator />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Expected Protocol</span>
                  <span className="text-xs font-mono" data-testid="text-expected-protocol">
                    {server.expectedProtocolVersion || "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Negotiated Protocol</span>
                  <span className="text-xs font-mono" data-testid="text-negotiated-protocol">
                    {server.negotiatedProtocolVersion || "Not yet negotiated"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-server-info">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Server className="w-4 h-4" />
                  Server Info
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Name</span>
                  <span className="text-xs" data-testid="text-server-info-name">
                    {(serverInfo.name as string) || "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Version</span>
                  <span className="text-xs" data-testid="text-server-info-version">
                    {(serverInfo.version as string) || "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Protocol Version</span>
                  <span className="text-xs" data-testid="text-server-info-protocol">
                    {(serverInfo.protocolVersion as string) || "N/A"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-health">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Activity className="w-4 h-4" />
                  Health
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${HEALTH_COLOR[server.healthStatus || "unknown"]}`} />
                  <span className="text-sm font-medium" data-testid="text-health-detail">
                    {server.healthStatus || "unknown"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Last Health Check</span>
                  <span className="text-xs" data-testid="text-last-health-check">
                    {server.lastHealthCheck
                      ? new Date(server.lastHealthCheck).toLocaleString()
                      : "Never"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-capabilities-summary">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Zap className="w-4 h-4" />
                  Capabilities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.keys(capabilities).length > 0 ? (
                    Object.keys(capabilities).map((cap) => (
                      <Badge key={cap} variant="secondary" className="text-[10px]" data-testid={`badge-capability-${cap}`}>
                        {cap}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground" data-testid="text-no-capabilities">
                      No capabilities negotiated
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="capabilities" className="flex flex-col gap-4 mt-4">
          {Object.keys(capabilities).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Zap className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-capabilities-detail">
                  Run initialization to negotiate capabilities
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(capabilities).map(([name, props]) => (
                <Card key={name} data-testid={`card-capability-${name}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs font-mono bg-muted/30 rounded-md p-3 overflow-auto">
                      <code>{JSON.stringify(props, null, 2)}</code>
                    </pre>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tools" className="flex flex-col gap-4 mt-4">
          {!tools || tools.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Wrench className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-tools">
                  No tools discovered. Sync catalogs to discover tools.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {tools.map((tool) => (
                <Card key={tool.id} data-testid={`card-tool-${tool.id}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold" data-testid={`text-tool-name-${tool.id}`}>
                      {tool.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {tool.description && (
                      <p className="text-xs text-muted-foreground" data-testid={`text-tool-description-${tool.id}`}>
                        {tool.description}
                      </p>
                    )}
                    {tool.inputSchema ? (
                      <pre className="text-xs font-mono bg-muted/30 rounded-md p-3 overflow-auto max-h-[200px]">
                        <code>{JSON.stringify(tool.inputSchema as Record<string, unknown>, null, 2)}</code>
                      </pre>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="resources" className="flex flex-col gap-4 mt-4">
          {!resources || resources.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <FileText className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-resources">
                  No resources discovered. Sync catalogs to discover resources.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {resources.map((resource) => (
                <Card key={resource.id} data-testid={`card-resource-${resource.id}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium" data-testid={`text-resource-name-${resource.id}`}>
                      {resource.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <span className="text-xs font-mono text-muted-foreground" data-testid={`text-resource-uri-${resource.id}`}>
                      {resource.uri}
                    </span>
                    {resource.description && (
                      <p className="text-xs text-muted-foreground">{resource.description}</p>
                    )}
                    {resource.mimeType && (
                      <Badge variant="outline" className="text-[10px] w-fit" data-testid={`badge-mimetype-${resource.id}`}>
                        {resource.mimeType}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="prompts" className="flex flex-col gap-4 mt-4">
          {!prompts || prompts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <MessageSquare className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-prompts">
                  No prompts discovered. Sync catalogs to discover prompts.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {prompts.map((prompt) => (
                <Card key={prompt.id} data-testid={`card-prompt-${prompt.id}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium" data-testid={`text-prompt-name-${prompt.id}`}>
                      {prompt.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {prompt.description && (
                      <p className="text-xs text-muted-foreground">{prompt.description}</p>
                    )}
                    {prompt.arguments && Array.isArray(prompt.arguments) && (prompt.arguments as Array<{ name: string; description?: string }>).length > 0 ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Arguments</span>
                        {(prompt.arguments as Array<{ name: string; description?: string }>).map((arg: { name: string; description?: string }) => (
                          <div key={arg.name} className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] font-mono">{arg.name}</Badge>
                            {arg.description && (
                              <span className="text-[11px] text-muted-foreground">{arg.description}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="auth" className="flex flex-col gap-4 mt-4">
          <Card data-testid="card-auth-config">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Lock className="w-4 h-4" />
                Authentication Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {auth && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Current auth type:</span>
                  <Badge variant="outline" className="text-[10px]" data-testid="text-current-auth-type">
                    {auth.authType}
                  </Badge>
                </div>
              )}

              <Separator />

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Auth Type</Label>
                  <Select value={authType} onValueChange={setAuthType}>
                    <SelectTrigger data-testid="select-auth-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">none</SelectItem>
                      <SelectItem value="bearer_token">bearer_token</SelectItem>
                      <SelectItem value="api_key">api_key</SelectItem>
                      <SelectItem value="oauth2">oauth2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {authType === "bearer_token" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="auth-token">Token</Label>
                    <Input
                      id="auth-token"
                      type="password"
                      value={authToken}
                      onChange={(e) => setAuthToken(e.target.value)}
                      placeholder="Bearer token"
                      data-testid="input-auth-token"
                    />
                  </div>
                )}

                {authType === "api_key" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="auth-key-name">Key Name</Label>
                      <Input
                        id="auth-key-name"
                        value={authKeyName}
                        onChange={(e) => setAuthKeyName(e.target.value)}
                        placeholder="X-API-Key"
                        data-testid="input-auth-key-name"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="auth-key-value">Key Value</Label>
                      <Input
                        id="auth-key-value"
                        type="password"
                        value={authKeyValue}
                        onChange={(e) => setAuthKeyValue(e.target.value)}
                        placeholder="API key value"
                        data-testid="input-auth-key-value"
                      />
                    </div>
                  </>
                )}

                {authType === "oauth2" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="auth-client-id">Client ID</Label>
                      <Input
                        id="auth-client-id"
                        value={authClientId}
                        onChange={(e) => setAuthClientId(e.target.value)}
                        placeholder="Client ID"
                        data-testid="input-auth-client-id"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="auth-client-secret">Client Secret</Label>
                      <Input
                        id="auth-client-secret"
                        type="password"
                        value={authClientSecret}
                        onChange={(e) => setAuthClientSecret(e.target.value)}
                        placeholder="Client Secret"
                        data-testid="input-auth-client-secret"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="auth-token-url">Token URL</Label>
                      <Input
                        id="auth-token-url"
                        value={authTokenUrl}
                        onChange={(e) => setAuthTokenUrl(e.target.value)}
                        placeholder="https://auth.example.com/token"
                        data-testid="input-auth-token-url"
                      />
                    </div>
                  </>
                )}

                <Button
                  onClick={() => saveAuthMutation.mutate()}
                  disabled={saveAuthMutation.isPending}
                  data-testid="button-save-auth"
                >
                  {saveAuthMutation.isPending ? "Saving..." : "Save Auth Configuration"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="flex flex-col gap-4 mt-4">
          {auditEvents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Clock className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-audit-events">
                  No audit events for this server
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {auditEvents.map((event) => (
                <Card key={event.id} data-testid={`card-audit-${event.id}`}>
                  <CardContent className="p-4 flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium" data-testid={`text-audit-action-${event.id}`}>
                        {event.action}
                      </span>
                      {event.details && (
                        <span className="text-xs text-muted-foreground">{event.details}</span>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        Actor: {event.actorType}{event.actorId ? ` (${event.actorId})` : ""}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0" data-testid={`text-audit-time-${event.id}`}>
                      {event.createdAt ? new Date(event.createdAt).toLocaleString() : ""}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}