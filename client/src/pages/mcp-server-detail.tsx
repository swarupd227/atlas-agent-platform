import { useState, useMemo, useEffect } from "react";
import { useRoute, useSearch, useLocation, Link } from "wouter";
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
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  ArrowLeft, Server, Shield, Activity, CheckCircle2, AlertCircle,
  Globe, Terminal, Wrench, FileText, MessageSquare, Lock,
  RefreshCw, Clock, Zap, Play, Plus, Brain, XCircle, Tag,
  BookOpen, AlertTriangle, Loader2, Link2, Search, Pencil, Save,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { McpServer, McpServerTool, McpServerResource, McpServerPrompt, McpServerAuth, AuditEvent, OntologyConcept, McpParameterMatch } from "@shared/schema";

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
  const [tab, setTab] = useState("overview");
  const search = useSearch();
  const [, navigate] = useLocation();

  useEffect(() => {
    const qs = new URLSearchParams(search);
    const success = qs.get("oauth_success");
    const error = qs.get("oauth_error");
    if (success) {
      toast({ title: "Connected", description: "OAuth connection established." });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id, "auth"] });
    } else if (error) {
      toast({ title: "OAuth connection failed", description: error, variant: "destructive" });
    }
    if (success || error) {
      navigate(`/integrations/mcp-servers/${id}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

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
  const { data: allOntologyConcepts } = useQuery<OntologyConcept[]>({
    queryKey: ["/api/ontology-concepts/all"],
  });

  const { data: parameterMatches, isLoading: matchesLoading } = useQuery<McpParameterMatch[]>({
    queryKey: ["/api/ontology/parameter-matches", id],
    enabled: !!id,
  });

  const runOntologyMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ontology/match-parameters", { serverId: id });
      return res.json();
    },
    onSuccess: (data: { matched: number; unmatched: number; totalParameters: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ontology/parameter-matches", id] });
      toast({
        title: "Ontology matching complete",
        description: `${data.matched} matched, ${data.unmatched} unmatched out of ${data.totalParameters} parameters`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Matching failed", description: err.message, variant: "destructive" });
    },
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
      // The list page (mcp-servers.tsx) reads the unscoped ["/api/mcp-servers"]
      // query -- without invalidating it too, the freshly-Healthy status
      // here kept showing as stale "Unknown" back on the list until a
      // manual page reload forced a refetch.
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers"] });
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
  const [authAccessToken, setAuthAccessToken] = useState("");

  const { data: oauthProvider } = useQuery<{ provider: string | null; providerName?: string; configured?: boolean; scopes?: string[] }>({
    queryKey: ["/api/mcp-servers", id, "oauth", "provider"],
    enabled: !!id,
  });

  const saveAuthMutation = useMutation({
    mutationFn: () => {
      let config: Record<string, string> = {};
      if (authType === "bearer_token") config = { token: authToken };
      else if (authType === "api_key") config = { keyName: authKeyName, keyValue: authKeyValue };
      else if (authType === "oauth2") config = { accessToken: authAccessToken };
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

  const [addToolOpen, setAddToolOpen] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [newToolDescription, setNewToolDescription] = useState("");
  const [newToolInputSchema, setNewToolInputSchema] = useState('{\n  "type": "object",\n  "properties": {},\n  "required": []\n}');
  const [newToolRisk, setNewToolRisk] = useState("low");
  const [newToolOwner, setNewToolOwner] = useState("");
  const [newToolSchemaError, setNewToolSchemaError] = useState<string | null>(null);

  const [editToolId, setEditToolId] = useState<string | null>(null);
  const [editToolName, setEditToolName] = useState("");
  const [editToolDescription, setEditToolDescription] = useState("");
  const [editToolInputSchema, setEditToolInputSchema] = useState("");
  const [editToolRisk, setEditToolRisk] = useState("low");
  const [editToolOwner, setEditToolOwner] = useState("");
  const [editToolSaving, setEditToolSaving] = useState(false);

  function openEditTool(tool: McpServerTool) {
    setEditToolId(tool.id);
    setEditToolName(tool.name);
    setEditToolDescription(tool.description || "");
    setEditToolInputSchema(tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}');
    setEditToolRisk(tool.riskClassification || "low");
    setEditToolOwner(tool.owner || "");
  }

  async function handleSaveEditTool() {
    if (!editToolId) return;
    setEditToolSaving(true);
    try {
      let parsedSchema: Record<string, unknown> | undefined;
      if (editToolInputSchema.trim()) {
        try {
          parsedSchema = JSON.parse(editToolInputSchema);
        } catch {
          toast({ title: "Invalid JSON in input schema", variant: "destructive" });
          setEditToolSaving(false);
          return;
        }
      }
      await apiRequest("PATCH", `/api/tool-catalog/${editToolId}`, {
        name: editToolName,
        description: editToolDescription,
        riskClassification: editToolRisk,
        owner: editToolOwner || undefined,
        inputSchema: parsedSchema,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id, "tools"] });
      toast({ title: "Tool updated" });
      setEditToolId(null);
    } catch (err: any) {
      toast({ title: "Failed to update tool", description: err.message, variant: "destructive" });
    } finally {
      setEditToolSaving(false);
    }
  }

  const addToolMutation = useMutation({
    mutationFn: async () => {
      let parsedSchema: Record<string, unknown> | null = null;
      if (newToolInputSchema.trim()) {
        try {
          parsedSchema = JSON.parse(newToolInputSchema);
        } catch {
          throw new Error("Invalid JSON in input schema");
        }
      }
      return apiRequest("POST", `/api/mcp-servers/${id}/tools`, {
        name: newToolName,
        description: newToolDescription || undefined,
        inputSchema: parsedSchema,
        riskClassification: newToolRisk,
        owner: newToolOwner || undefined,
        enabled: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id, "tools"] });
      setAddToolOpen(false);
      setNewToolName("");
      setNewToolDescription("");
      setNewToolInputSchema('{\n  "type": "object",\n  "properties": {},\n  "required": []\n}');
      setNewToolRisk("low");
      setNewToolOwner("");
      setNewToolSchemaError(null);
      toast({ title: "Tool added", description: "The tool has been added to this MCP server." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add tool", description: err.message, variant: "destructive" });
    },
  });

  const [addResourceOpen, setAddResourceOpen] = useState(false);
  const [newResName, setNewResName] = useState("");
  const [newResUri, setNewResUri] = useState("");
  const [newResDescription, setNewResDescription] = useState("");
  const [newResMimeType, setNewResMimeType] = useState("");
  const [newResSensitivity, setNewResSensitivity] = useState("public");
  const [newResContentType, setNewResContentType] = useState("text");
  const [newResOwner, setNewResOwner] = useState("");

  const addResourceMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/mcp-servers/${id}/resources`, {
        name: newResName,
        uri: newResUri,
        description: newResDescription || undefined,
        mimeType: newResMimeType || undefined,
        sensitivityLevel: newResSensitivity,
        contentType: newResContentType,
        owner: newResOwner || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id, "resources"] });
      setAddResourceOpen(false);
      setNewResName("");
      setNewResUri("");
      setNewResDescription("");
      setNewResMimeType("");
      setNewResSensitivity("public");
      setNewResContentType("text");
      setNewResOwner("");
      toast({ title: "Resource added", description: "The resource has been registered on this MCP server." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add resource", description: err.message, variant: "destructive" });
    },
  });

  const [addPromptOpen, setAddPromptOpen] = useState(false);
  const [newPromptName, setNewPromptName] = useState("");
  const [newPromptDescription, setNewPromptDescription] = useState("");
  const [newPromptArgs, setNewPromptArgs] = useState('[]');
  const [newPromptArgsError, setNewPromptArgsError] = useState<string | null>(null);
  const [newPromptOwner, setNewPromptOwner] = useState("");

  const addPromptMutation = useMutation({
    mutationFn: async () => {
      let parsedArgs: unknown[] | null = null;
      if (newPromptArgs.trim()) {
        try {
          parsedArgs = JSON.parse(newPromptArgs);
          if (!Array.isArray(parsedArgs)) throw new Error("Arguments must be an array");
        } catch {
          throw new Error("Invalid JSON for arguments");
        }
      }
      return apiRequest("POST", `/api/mcp-servers/${id}/prompts`, {
        name: newPromptName,
        description: newPromptDescription || undefined,
        arguments: parsedArgs,
        owner: newPromptOwner || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id, "prompts"] });
      setAddPromptOpen(false);
      setNewPromptName("");
      setNewPromptDescription("");
      setNewPromptArgs('[]');
      setNewPromptArgsError(null);
      setNewPromptOwner("");
      toast({ title: "Prompt added", description: "The prompt template has been registered on this MCP server." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add prompt", description: err.message, variant: "destructive" });
    },
  });

  const [addCapOpen, setAddCapOpen] = useState(false);
  const [newCapName, setNewCapName] = useState("");
  const [newCapConfig, setNewCapConfig] = useState('{}');
  const [newCapConfigError, setNewCapConfigError] = useState<string | null>(null);

  const addCapMutation = useMutation({
    mutationFn: async () => {
      let parsedConfig: Record<string, unknown> = {};
      if (newCapConfig.trim()) {
        try {
          parsedConfig = JSON.parse(newCapConfig);
        } catch {
          throw new Error("Invalid JSON for capability configuration");
        }
      }
      return apiRequest("PATCH", `/api/mcp-servers/${id}/capabilities`, {
        [newCapName]: parsedConfig,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id] });
      setAddCapOpen(false);
      setNewCapName("");
      setNewCapConfig('{}');
      setNewCapConfigError(null);
      toast({ title: "Capability added", description: "The capability has been registered on this MCP server." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add capability", description: err.message, variant: "destructive" });
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

  const health = server.healthStatus || "unknown";
  const statusText: Record<string, string> = {
    registered: "Registered, not yet verified",
    verified: "Verified, not yet in production",
    "production-enabled": "In production",
  };
  const risk = (server.riskTier || "").toLowerCase();
  const enabledTools = (tools || []).filter((t) => !!t.enabled);
  const unmatchedVocabulary = (parameterMatches || []).filter((m) => m.matchStatus === "unmatched").length;
  const protocolOk = !!server.negotiatedProtocolVersion && (!server.expectedProtocolVersion || server.negotiatedProtocolVersion === server.expectedProtocolVersion);
  const when = (d: string | Date | null | undefined) => {
    if (!d) return "never";
    const t = new Date(d);
    const today = new Date().toDateString() === t.toDateString();
    return today ? `today ${t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : t.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };
  const tabClass = "rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-[13px] text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";
  const kv = "grid grid-cols-[150px_1fr] items-baseline gap-x-4 gap-y-2 text-[13px]";

  return (
    <div className="astra-scope flex min-h-full flex-col gap-5 bg-background p-6 font-sans text-foreground">
      <div className="flex flex-col gap-3">
        <Link href="/integrations/mcp-servers" data-testid="link-back-mcp-servers" className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Connections · MCP servers
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[260px]">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">MCP server · {server.transportType}</span>
            <h1 className="font-[family-name:var(--astra-display)] text-2xl font-semibold tracking-tight" data-testid="text-mcp-server-name">
              {server.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5">
                <span className={`h-2 w-2 rounded-full ${HEALTH_COLOR[health]}`} data-testid="indicator-health" />
                <span className="capitalize" data-testid="text-health-status">{health}</span>
                <span className="text-muted-foreground">· checked {when(server.lastHealthCheck)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5" data-testid="badge-status">
                {server.status === "production-enabled" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Shield className="h-3.5 w-3.5 text-muted-foreground" />}
                {statusText[server.status] || server.status}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${risk === "critical" || risk === "high" ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400" : "bg-card"}`}
                data-testid="badge-risk-tier"
              >
                {risk ? `${risk.charAt(0).toUpperCase()}${risk.slice(1)} risk` : "Risk not set"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => initializeMutation.mutate()}
              disabled={initializeMutation.isPending}
              title="Reconnect and re-read what the server offers"
              data-testid="button-initialize"
            >
              {initializeMutation.isPending ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
              Initialize
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              title="Refresh the tools, resources and prompts from the server"
              data-testid="button-sync-catalogs"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              Sync catalogs
            </Button>
            <Button
              size="sm"
              variant={server.status === "production-enabled" ? "outline" : "default"}
              onClick={() => enableProdMutation.mutate()}
              disabled={enableProdMutation.isPending || server.status === "production-enabled"}
              data-testid="button-enable-production"
            >
              {enableProdMutation.isPending ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
              {server.status === "production-enabled" ? "In production" : "Enable production"}
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b bg-transparent p-0">
          <TabsTrigger value="overview" className={tabClass} data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="tools" className={tabClass} data-testid="tab-tools">
            Tools
            {tools && tools.length > 0 && <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{tools.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="resources" className={tabClass} data-testid="tab-resources">
            Resources
            {resources && resources.length > 0 && <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{resources.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="prompts" className={tabClass} data-testid="tab-prompts">
            Prompts
            {prompts && prompts.length > 0 && <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{prompts.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="capabilities" className={tabClass} data-testid="tab-capabilities">Capabilities</TabsTrigger>
          <TabsTrigger value="auth" className={tabClass} data-testid="tab-auth">Access</TabsTrigger>
          <TabsTrigger value="vocabulary" className={tabClass} data-testid="tab-vocabulary">
            Vocabulary
            {unmatchedVocabulary > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 font-mono text-[11px] text-amber-700 dark:text-amber-400" title="Tool parameters not yet matched to a business concept">
                {unmatchedVocabulary} unmatched
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="audit" className={tabClass} data-testid="tab-audit">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 flex flex-col gap-6">
          {/* The four facts that say whether agents can rely on it. */}
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card lg:grid-cols-4" data-testid="card-health">
            <div className="border-b border-r p-4 lg:border-b-0">
              <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Health</p>
              <p className="mt-1 flex items-center gap-2 font-[family-name:var(--astra-display)] text-xl font-semibold capitalize">
                <span className={`h-2.5 w-2.5 rounded-full ${HEALTH_COLOR[health]}`} />
                <span data-testid="text-health-detail">{health}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground" data-testid="text-last-health-check">
                Checked {when(server.lastHealthCheck)}{server.healthCheckPath ? ", every 5 minutes" : ""}
              </p>
              {server.healthDetail && health !== "healthy" && (
                <p className="mt-1 text-xs text-red-700 dark:text-red-400" data-testid="text-health-reason">{server.healthDetail}</p>
              )}
            </div>
            <div className="border-b p-4 lg:border-b-0 lg:border-r">
              <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Tools for agents</p>
              <p className="mt-1 font-[family-name:var(--astra-display)] text-xl font-semibold">{tools ? tools.length : "—"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {resources?.length || 0} resource{(resources?.length || 0) !== 1 ? "s" : ""} · {prompts?.length || 0} prompt{(prompts?.length || 0) !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="border-r p-4" data-testid="card-server-info">
              <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Server reports</p>
              <p className="mt-1 truncate text-[15px] font-medium" data-testid="text-server-info-name" title={(serverInfo.name as string) || undefined}>
                {(serverInfo.name as string) || "Not reported"}
              </p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                version <span data-testid="text-server-info-version">{(serverInfo.version as string) || "n/a"}</span>
              </p>
            </div>
            <div className="p-4">
              <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Protocol</p>
              <p className="mt-1 font-mono text-[15px]" data-testid="text-server-info-protocol">
                {server.negotiatedProtocolVersion || (serverInfo.protocolVersion as string) || "Not negotiated"}
              </p>
              <p className={`mt-0.5 text-xs ${protocolOk ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
                {protocolOk ? "Matches what the platform expects" : server.negotiatedProtocolVersion ? `Expected ${server.expectedProtocolVersion}` : "Initialize to negotiate"}
              </p>
            </div>
          </div>

          {/* What it actually lets agents do. */}
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">What agents can do with it</h2>
              {tools && tools.length > 8 && (
                <button type="button" onClick={() => setTab("tools")} className="text-xs underline underline-offset-2" data-testid="button-see-all-tools">
                  See all {tools.length} tools
                </button>
              )}
            </div>
            {!tools ? (
              <Skeleton className="h-24 w-full" />
            ) : tools.length === 0 ? (
              <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                No tools yet. Initialize the server, or Sync catalogs, to read what it offers.
              </p>
            ) : (
              <div className="grid grid-cols-1 overflow-hidden rounded-xl border bg-card md:grid-cols-2">
                {tools.slice(0, 8).map((t, i) => (
                  <div key={t.id} className={`flex min-w-0 gap-3 px-4 py-2.5 ${i % 2 === 0 ? "md:border-r" : ""} ${i >= 2 ? "border-t" : i === 1 ? "border-t md:border-t-0" : ""}`} data-testid={`overview-tool-${t.name}`}>
                    <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[12.5px]">
                        {t.name}
                        {!t.enabled && <span className="ml-1.5 font-sans text-[11px] text-muted-foreground">(off)</span>}
                      </p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{t.description || "No description from the server."}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tools && tools.length > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {enabledTools.length} of {tools.length} enabled for agents. Every call goes through the platform's policy checks and is recorded in the audit trail.
              </p>
            )}
          </section>

          {/* How the platform reaches it. */}
          <section data-testid="card-connection-info">
            <h2 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Connection</h2>
            <div className={`${kv} rounded-xl border bg-card p-4`}>
              <span className="text-muted-foreground">Transport</span>
              <span className="inline-flex items-center gap-1.5" data-testid="text-transport-type">
                {server.transportType === "stdio" ? <Terminal className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                {server.transportType}
              </span>
              {server.url && (
                <>
                  <span className="text-muted-foreground">Address</span>
                  <span className="break-all font-mono text-[12.5px]" data-testid="text-url">{server.url}</span>
                </>
              )}
              {server.command && (
                <>
                  <span className="text-muted-foreground">Command</span>
                  <span className="break-all font-mono text-[12.5px]" data-testid="text-command">{server.command} {(server.args || []).join(" ")}</span>
                </>
              )}
              {server.healthCheckPath && (
                <>
                  <span className="text-muted-foreground">Health check</span>
                  <span className="font-mono text-[12.5px]" data-testid="text-health-check-path">{server.healthCheckPath} <span className="font-sans text-muted-foreground">every 5 minutes</span></span>
                </>
              )}
              <span className="text-muted-foreground">Protocol</span>
              <span className="font-mono text-[12.5px]">
                <span data-testid="text-negotiated-protocol">{server.negotiatedProtocolVersion || "not yet negotiated"}</span>
                <span className="font-sans text-muted-foreground"> negotiated · expected </span>
                <span data-testid="text-expected-protocol">{server.expectedProtocolVersion || "n/a"}</span>
              </span>
              <span className="text-muted-foreground">Capabilities</span>
              <span className="flex flex-wrap gap-1.5" data-testid="card-capabilities-summary">
                {Object.keys(capabilities).length > 0 ? (
                  Object.keys(capabilities).map((cap) => (
                    <span key={cap} className="rounded-full bg-muted px-2 py-0.5 text-xs" data-testid={`badge-capability-${cap}`}>{cap}</span>
                  ))
                ) : (
                  <span className="text-muted-foreground" data-testid="text-no-capabilities">None negotiated yet</span>
                )}
              </span>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="capabilities" className="flex flex-col gap-4 mt-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Server Capabilities</span>
              {Object.keys(capabilities).length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{Object.keys(capabilities).length}</Badge>
              )}
            </div>
            <Dialog open={addCapOpen} onOpenChange={setAddCapOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-capability">
                  <Plus className="w-4 h-4 mr-1.5" /> Add Capability
                </Button>
              </DialogTrigger>
              <DialogContent className="astra-scope font-sans max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Capability</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label>Capability Name *</Label>
                    <Select value={newCapName} onValueChange={setNewCapName}>
                      <SelectTrigger data-testid="select-capability-name">
                        <SelectValue placeholder="Select a capability" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tools">tools</SelectItem>
                        <SelectItem value="resources">resources</SelectItem>
                        <SelectItem value="prompts">prompts</SelectItem>
                        <SelectItem value="logging">logging</SelectItem>
                        <SelectItem value="experimental">experimental</SelectItem>
                        <SelectItem value="sampling">sampling</SelectItem>
                        <SelectItem value="roots">roots</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Configuration (JSON)</Label>
                    <Textarea
                      className="font-mono text-xs"
                      value={newCapConfig}
                      onChange={(e) => {
                        setNewCapConfig(e.target.value);
                        try {
                          JSON.parse(e.target.value);
                          setNewCapConfigError(null);
                        } catch {
                          setNewCapConfigError("Invalid JSON");
                        }
                      }}
                      rows={5}
                      data-testid="input-capability-config"
                    />
                    {newCapConfigError && (
                      <span className="text-[11px] text-red-500" data-testid="text-cap-config-error">{newCapConfigError}</span>
                    )}
                  </div>
                  <Button
                    onClick={() => addCapMutation.mutate()}
                    disabled={!newCapName || !!newCapConfigError || addCapMutation.isPending}
                    data-testid="button-submit-capability"
                  >
                    {addCapMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-1.5" />
                    )}
                    Add Capability
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {Object.keys(capabilities).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Zap className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-capabilities-detail">
                  No capabilities configured. Add capabilities to define what this server supports.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(capabilities).map(([name, props]) => (
                <Card key={name} data-testid={`card-capability-${name}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-sm font-medium">{name}</CardTitle>
                      <Badge variant="default" className="text-[10px]">
                        <CheckCircle2 className="w-3 h-3 mr-0.5" /> Active
                      </Badge>
                    </div>
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
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Registered Tools</span>
              {tools && tools.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{tools.length}</Badge>
              )}
            </div>
            <Dialog open={addToolOpen} onOpenChange={setAddToolOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-tool">
                  <Plus className="w-4 h-4 mr-1.5" /> Add Tool
                </Button>
              </DialogTrigger>
              <DialogContent className="astra-scope font-sans max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Tool to MCP Server</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label>Tool Name *</Label>
                    <Input
                      placeholder="e.g. search_documents"
                      value={newToolName}
                      onChange={(e) => setNewToolName(e.target.value)}
                      data-testid="input-tool-name"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Description</Label>
                    <Textarea
                      placeholder="What does this tool do?"
                      value={newToolDescription}
                      onChange={(e) => setNewToolDescription(e.target.value)}
                      rows={2}
                      data-testid="input-tool-description"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Input Schema (JSON)</Label>
                    <Textarea
                      className="font-mono text-xs"
                      value={newToolInputSchema}
                      onChange={(e) => {
                        setNewToolInputSchema(e.target.value);
                        try {
                          JSON.parse(e.target.value);
                          setNewToolSchemaError(null);
                        } catch (err) {
                          setNewToolSchemaError("Invalid JSON");
                        }
                      }}
                      rows={6}
                      data-testid="input-tool-schema"
                    />
                    {newToolSchemaError && (
                      <span className="text-[11px] text-red-500" data-testid="text-schema-error">{newToolSchemaError}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label>Risk Classification</Label>
                      <Select value={newToolRisk} onValueChange={setNewToolRisk}>
                        <SelectTrigger data-testid="select-tool-risk">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {/* Owner is required server-side. It used to look optional
                          here, so submitting without it surfaced a raw backend
                          validation error about a null field. Mark it, and gate
                          the submit on it. */}
                      <Label>Owner <span className="text-destructive">*</span></Label>
                      <Input
                        placeholder="e.g. platform-team"
                        required
                        aria-required="true"
                        value={newToolOwner}
                        onChange={(e) => setNewToolOwner(e.target.value)}
                        data-testid="input-tool-owner"
                      />
                      {!newToolOwner.trim() && (
                        <p className="text-xs text-muted-foreground">Required — the team or person accountable for this tool.</p>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => addToolMutation.mutate()}
                    disabled={!newToolName.trim() || !newToolOwner.trim() || !!newToolSchemaError || addToolMutation.isPending}
                    data-testid="button-submit-tool"
                  >
                    {addToolMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-1.5" />
                    )}
                    Add Tool
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {!tools || tools.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <Wrench className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-tools">
                  No tools discovered. Sync catalogs or add tools manually.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {tools.map((tool) => (
                <Card key={tool.id} data-testid={`card-tool-${tool.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-sm font-bold" data-testid={`text-tool-name-${tool.id}`}>
                        {tool.name}
                      </CardTitle>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {tool.riskClassification && (
                          <Badge
                            variant={tool.riskClassification === "critical" || tool.riskClassification === "high" ? "destructive" : "outline"}
                            className="text-[10px]"
                            data-testid={`badge-tool-risk-${tool.id}`}
                          >
                            <Shield className="w-3 h-3 mr-0.5" />
                            {tool.riskClassification}
                          </Badge>
                        )}
                        <Badge variant={tool.enabled ? "default" : "secondary"} className="text-[10px]" data-testid={`badge-tool-enabled-${tool.id}`}>
                          {tool.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openEditTool(tool)}
                          data-testid={`button-edit-tool-${tool.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {tool.description && (
                      <p className="text-xs text-muted-foreground" data-testid={`text-tool-description-${tool.id}`}>
                        {tool.description}
                      </p>
                    )}
                    {tool.owner && (
                      <span className="text-[11px] text-muted-foreground">Owner: {tool.owner}</span>
                    )}
                    {tool.inputSchema ? (
                      <pre className="text-xs font-mono bg-muted/30 rounded-md p-3 overflow-auto max-h-[200px]">
                        <code>{JSON.stringify(tool.inputSchema as Record<string, unknown>, null, 2)}</code>
                      </pre>
                    ) : null}
                    {(() => {
                      const toolTags = (tool.ontologyTags as Array<{ conceptId: string; label: string; category?: string }>) || [];
                      const taggedIds = new Set(toolTags.map(t => t.conceptId));
                      const available = (allOntologyConcepts || []).filter(c => !taggedIds.has(c.id)).slice(0, 10);
                      return (
                        <div className="flex flex-col gap-1.5 pt-2 border-t" data-testid={`tool-ontology-section-${tool.id}`}>
                          <div className="flex items-center gap-1.5">
                            <Brain className="w-3 h-3 text-purple-500" />
                            <span className="text-[11px] font-medium text-muted-foreground">Ontology Tags</span>
                          </div>
                          {toolTags.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {toolTags.map((t, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="text-[9px] text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700 cursor-pointer"
                                  data-testid={`badge-tool-ontology-${tool.id}-${t.conceptId}`}
                                  onClick={async () => {
                                    const updated = toolTags.filter(x => x.conceptId !== t.conceptId);
                                    try {
                                      await apiRequest("PATCH", `/api/mcp-tools/${tool.id}/ontology-tags`, { ontologyTags: updated });
                                      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id, "tools"] });
                                      toast({ title: `Removed "${t.label}"` });
                                    } catch { toast({ title: "Failed to remove tag", variant: "destructive" }); }
                                  }}
                                >
                                  {t.label} <XCircle className="w-2.5 h-2.5 ml-0.5" />
                                </Badge>
                              ))}
                            </div>
                          )}
                          {available.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {available.map(c => (
                                <Badge
                                  key={c.id}
                                  variant="outline"
                                  className="text-[9px] cursor-pointer hover-elevate"
                                  data-testid={`badge-add-tool-ontology-${tool.id}-${c.id}`}
                                  onClick={async () => {
                                    const updated = [...toolTags, { conceptId: c.id, label: c.label, category: c.category }];
                                    try {
                                      await apiRequest("PATCH", `/api/mcp-tools/${tool.id}/ontology-tags`, { ontologyTags: updated });
                                      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers", id, "tools"] });
                                      toast({ title: `Tagged with "${c.label}"` });
                                    } catch { toast({ title: "Failed to add tag", variant: "destructive" }); }
                                  }}
                                >
                                  <Plus className="w-2.5 h-2.5 mr-0.5" /> {c.label}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Dialog open={editToolId !== null} onOpenChange={(open) => { if (!open) setEditToolId(null); }}>
            <DialogContent data-testid="dialog-edit-tool">
              <DialogHeader>
                <DialogTitle>Edit Tool</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-tool-name">Name</Label>
                  <Input
                    id="edit-tool-name"
                    value={editToolName}
                    onChange={(e) => setEditToolName(e.target.value)}
                    data-testid="input-edit-tool-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-tool-description">Description</Label>
                  <Textarea
                    id="edit-tool-description"
                    value={editToolDescription}
                    onChange={(e) => setEditToolDescription(e.target.value)}
                    rows={3}
                    data-testid="input-edit-tool-description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Risk Classification</Label>
                    <Select value={editToolRisk} onValueChange={setEditToolRisk}>
                      <SelectTrigger data-testid="select-edit-tool-risk">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-tool-owner">Owner</Label>
                    <Input
                      id="edit-tool-owner"
                      value={editToolOwner}
                      onChange={(e) => setEditToolOwner(e.target.value)}
                      placeholder="e.g. platform-team"
                      data-testid="input-edit-tool-owner"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-tool-schema">Input Schema (JSON)</Label>
                  <Textarea
                    id="edit-tool-schema"
                    value={editToolInputSchema}
                    onChange={(e) => setEditToolInputSchema(e.target.value)}
                    rows={8}
                    className="font-mono text-xs"
                    data-testid="input-edit-tool-schema"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setEditToolId(null)} data-testid="button-cancel-edit-tool">
                    Cancel
                  </Button>
                  <Button onClick={handleSaveEditTool} disabled={editToolSaving || !editToolName.trim()} data-testid="button-save-edit-tool">
                    {editToolSaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                    Save Changes
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="resources" className="flex flex-col gap-4 mt-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Registered Resources</span>
              {resources && resources.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{resources.length}</Badge>
              )}
            </div>
            <Dialog open={addResourceOpen} onOpenChange={setAddResourceOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-resource">
                  <Plus className="w-4 h-4 mr-1.5" /> Add Resource
                </Button>
              </DialogTrigger>
              <DialogContent className="astra-scope font-sans max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Resource to MCP Server</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label>Resource Name *</Label>
                      <Input
                        placeholder="e.g. customer_database"
                        value={newResName}
                        onChange={(e) => setNewResName(e.target.value)}
                        data-testid="input-resource-name"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>URI *</Label>
                      <Input
                        placeholder="e.g. file:///data/customers.db"
                        value={newResUri}
                        onChange={(e) => setNewResUri(e.target.value)}
                        data-testid="input-resource-uri"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Description</Label>
                    <Textarea
                      placeholder="What data or knowledge does this resource provide?"
                      value={newResDescription}
                      onChange={(e) => setNewResDescription(e.target.value)}
                      rows={2}
                      data-testid="input-resource-description"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label>MIME Type</Label>
                      <Input
                        placeholder="e.g. application/json"
                        value={newResMimeType}
                        onChange={(e) => setNewResMimeType(e.target.value)}
                        data-testid="input-resource-mimetype"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Sensitivity Level</Label>
                      <Select value={newResSensitivity} onValueChange={setNewResSensitivity}>
                        <SelectTrigger data-testid="select-resource-sensitivity">
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
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label>Content Type</Label>
                      <Select value={newResContentType} onValueChange={setNewResContentType}>
                        <SelectTrigger data-testid="select-resource-contenttype">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="binary">Binary</SelectItem>
                          <SelectItem value="structured">Structured</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Owner</Label>
                      <Input
                        placeholder="e.g. data-team"
                        value={newResOwner}
                        onChange={(e) => setNewResOwner(e.target.value)}
                        data-testid="input-resource-owner"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={() => addResourceMutation.mutate()}
                    disabled={!newResName.trim() || !newResUri.trim() || addResourceMutation.isPending}
                    data-testid="button-submit-resource"
                  >
                    {addResourceMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-1.5" />
                    )}
                    Add Resource
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {!resources || resources.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <FileText className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-resources">
                  No resources registered. Add resources to define data sources for agents.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {resources.map((resource) => (
                <Card key={resource.id} data-testid={`card-resource-${resource.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-sm font-medium" data-testid={`text-resource-name-${resource.id}`}>
                        {resource.name}
                      </CardTitle>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {resource.sensitivityLevel && resource.sensitivityLevel !== "public" && (
                          <Badge
                            variant={resource.sensitivityLevel === "restricted" || resource.sensitivityLevel === "confidential" ? "destructive" : "outline"}
                            className="text-[10px]"
                            data-testid={`badge-sensitivity-${resource.id}`}
                          >
                            <Lock className="w-3 h-3 mr-0.5" />
                            {resource.sensitivityLevel}
                          </Badge>
                        )}
                        {resource.freshnessStatus && (
                          <Badge variant={resource.freshnessStatus === "fresh" ? "default" : "secondary"} className="text-[10px]" data-testid={`badge-freshness-${resource.id}`}>
                            {resource.freshnessStatus}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <span className="text-xs font-mono text-muted-foreground" data-testid={`text-resource-uri-${resource.id}`}>
                      {resource.uri}
                    </span>
                    {resource.description && (
                      <p className="text-xs text-muted-foreground">{resource.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {resource.mimeType && (
                        <Badge variant="outline" className="text-[10px]" data-testid={`badge-mimetype-${resource.id}`}>
                          {resource.mimeType}
                        </Badge>
                      )}
                      {resource.contentType && (
                        <Badge variant="outline" className="text-[10px]">{resource.contentType}</Badge>
                      )}
                      {resource.owner && (
                        <span className="text-[11px] text-muted-foreground">Owner: {resource.owner}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="prompts" className="flex flex-col gap-4 mt-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Prompt Templates</span>
              {prompts && prompts.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{prompts.length}</Badge>
              )}
            </div>
            <Dialog open={addPromptOpen} onOpenChange={setAddPromptOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-prompt">
                  <Plus className="w-4 h-4 mr-1.5" /> Add Prompt
                </Button>
              </DialogTrigger>
              <DialogContent className="astra-scope font-sans max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Prompt Template</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label>Prompt Name *</Label>
                    <Input
                      placeholder="e.g. summarize_document"
                      value={newPromptName}
                      onChange={(e) => setNewPromptName(e.target.value)}
                      data-testid="input-prompt-name"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Description</Label>
                    <Textarea
                      placeholder="What does this prompt template do?"
                      value={newPromptDescription}
                      onChange={(e) => setNewPromptDescription(e.target.value)}
                      rows={2}
                      data-testid="input-prompt-description"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Arguments (JSON Array)</Label>
                    <Textarea
                      className="font-mono text-xs"
                      placeholder='[{"name": "document", "description": "The document to summarize"}]'
                      value={newPromptArgs}
                      onChange={(e) => {
                        setNewPromptArgs(e.target.value);
                        try {
                          const parsed = JSON.parse(e.target.value);
                          if (!Array.isArray(parsed)) {
                            setNewPromptArgsError("Must be a JSON array");
                          } else {
                            setNewPromptArgsError(null);
                          }
                        } catch {
                          setNewPromptArgsError("Invalid JSON");
                        }
                      }}
                      rows={4}
                      data-testid="input-prompt-arguments"
                    />
                    {newPromptArgsError && (
                      <span className="text-[11px] text-red-500" data-testid="text-prompt-args-error">{newPromptArgsError}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Owner</Label>
                    <Input
                      placeholder="e.g. ai-team"
                      value={newPromptOwner}
                      onChange={(e) => setNewPromptOwner(e.target.value)}
                      data-testid="input-prompt-owner"
                    />
                  </div>
                  <Button
                    onClick={() => addPromptMutation.mutate()}
                    disabled={!newPromptName.trim() || !!newPromptArgsError || addPromptMutation.isPending}
                    data-testid="button-submit-prompt"
                  >
                    {addPromptMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-1.5" />
                    )}
                    Add Prompt
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {!prompts || prompts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <MessageSquare className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-prompts">
                  No prompt templates registered. Add prompts to define reusable instruction templates.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {prompts.map((prompt) => (
                <Card key={prompt.id} data-testid={`card-prompt-${prompt.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-sm font-medium" data-testid={`text-prompt-name-${prompt.id}`}>
                        {prompt.name}
                      </CardTitle>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {prompt.publishedStatus && (
                          <Badge variant={prompt.publishedStatus === "published" ? "default" : "secondary"} className="text-[10px]" data-testid={`badge-prompt-status-${prompt.id}`}>
                            {prompt.publishedStatus}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {prompt.description && (
                      <p className="text-xs text-muted-foreground">{prompt.description}</p>
                    )}
                    {prompt.owner && (
                      <span className="text-[11px] text-muted-foreground">Owner: {prompt.owner}</span>
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

                {authType === "oauth2" && oauthProvider?.provider && (
                  <div className="flex flex-col gap-2 rounded-md border p-3">
                    <div className="text-sm">
                      Detected provider: <span className="font-medium">{oauthProvider.providerName ?? oauthProvider.provider}</span>
                    </div>
                    {oauthProvider.scopes && oauthProvider.scopes.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Requested scopes: {oauthProvider.scopes.join(", ")}
                      </div>
                    )}
                    {oauthProvider.configured ? (
                      <Button
                        variant="secondary"
                        onClick={() => { window.location.href = `/api/mcp-servers/${id}/oauth/start`; }}
                        data-testid="button-connect-oauth"
                      >
                        Connect via {oauthProvider.providerName ?? oauthProvider.provider} OAuth
                      </Button>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <Button variant="secondary" disabled data-testid="button-connect-oauth-disabled">
                          Connect via {oauthProvider.providerName ?? oauthProvider.provider} OAuth
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Not yet configured — this app is waiting on {oauthProvider.providerName ?? oauthProvider.provider}'s
                          MCP client approval. Once granted, set the client credentials as environment variables to enable this.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {authType === "oauth2" && !oauthProvider?.provider && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="auth-access-token">Access Token</Label>
                    <Input
                      id="auth-access-token"
                      type="password"
                      value={authAccessToken}
                      onChange={(e) => setAuthAccessToken(e.target.value)}
                      placeholder="Pre-obtained OAuth access token"
                      data-testid="input-auth-access-token"
                    />
                    <p className="text-xs text-muted-foreground">
                      No known OAuth provider for this server's URL — paste an access token obtained out-of-band.
                    </p>
                  </div>
                )}

                {!(authType === "oauth2" && oauthProvider?.provider) && (
                  <Button
                    onClick={() => saveAuthMutation.mutate()}
                    disabled={saveAuthMutation.isPending}
                    data-testid="button-save-auth"
                  >
                    {saveAuthMutation.isPending ? "Saving..." : "Save Auth Configuration"}
                  </Button>
                )}
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

        <TabsContent value="vocabulary" className="flex flex-col gap-4 mt-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Domain Vocabulary Match</span>
              <span className="text-xs text-muted-foreground">
                Cross-reference tool parameters and resource names against ontology concepts
              </span>
            </div>
            <Button
              size="sm"
              onClick={() => runOntologyMatchMutation.mutate()}
              disabled={runOntologyMatchMutation.isPending}
              data-testid="button-run-ontology-match"
            >
              {runOntologyMatchMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-1.5" />
              )}
              Run Ontology Match
            </Button>
          </div>

          {parameterMatches && parameterMatches.length > 0 && (() => {
            const matched = parameterMatches.filter(m => m.matchStatus === "matched");
            const unmatched = parameterMatches.filter(m => m.matchStatus === "unmatched");
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card data-testid="card-match-total">
                  <CardContent className="p-4 flex items-center gap-3">
                    <BookOpen className="w-5 h-5 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="text-lg font-bold" data-testid="text-match-total">{parameterMatches.length}</span>
                      <span className="text-xs text-muted-foreground">Total Parameters</span>
                    </div>
                  </CardContent>
                </Card>
                <Card data-testid="card-match-matched">
                  <CardContent className="p-4 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <div className="flex flex-col">
                      <span className="text-lg font-bold" data-testid="text-match-matched">{matched.length}</span>
                      <span className="text-xs text-muted-foreground">In Domain Vocabulary</span>
                    </div>
                  </CardContent>
                </Card>
                <Card data-testid="card-match-unmatched">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    <div className="flex flex-col">
                      <span className="text-lg font-bold" data-testid="text-match-unmatched">{unmatched.length}</span>
                      <span className="text-xs text-muted-foreground">Not in Domain Vocabulary</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          {matchesLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !parameterMatches || parameterMatches.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <BookOpen className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-matches">
                  No vocabulary analysis yet. Click "Run Ontology Match" to analyze tool parameters against your domain ontology.
                </p>
              </CardContent>
            </Card>
          ) : (() => {
            const toolGroups = new Map<string, McpParameterMatch[]>();
            for (const m of parameterMatches) {
              const key = m.toolName;
              if (!toolGroups.has(key)) toolGroups.set(key, []);
              toolGroups.get(key)!.push(m);
            }
            return (
              <div className="flex flex-col gap-4">
                {Array.from(toolGroups.entries()).map(([toolName, matches]) => {
                  const unmatchedCount = matches.filter(m => m.matchStatus === "unmatched").length;
                  const safeToolName = toolName.replace(/[^a-zA-Z0-9_-]/g, "_");
                  return (
                    <Card key={toolName} data-testid={`card-vocab-tool-${safeToolName}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            {toolName.startsWith("resource:") ? (
                              <FileText className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <Wrench className="w-4 h-4 text-muted-foreground" />
                            )}
                            <CardTitle className="text-sm font-bold" data-testid={`text-vocab-tool-name-${safeToolName}`}>
                              {toolName}
                            </CardTitle>
                          </div>
                          {unmatchedCount > 0 && (
                            <Badge variant="destructive" className="text-[10px]" data-testid={`badge-vocab-unmatched-count-${safeToolName}`}>
                              <AlertTriangle className="w-3 h-3 mr-0.5" />
                              {unmatchedCount} unmatched
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col gap-1.5">
                          {matches.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md bg-muted/30 flex-wrap"
                              data-testid={`row-param-match-${m.id}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <code className="text-xs font-mono truncate" data-testid={`text-param-name-${m.id}`}>
                                  {m.parameterName}
                                </code>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {m.matchStatus === "matched" ? (
                                  <>
                                    <Badge variant="outline" className="text-[10px] text-green-600 border-green-300 dark:text-green-400 dark:border-green-700" data-testid={`badge-match-status-${m.id}`}>
                                      <Link2 className="w-3 h-3 mr-0.5" />
                                      {m.matchedConceptLabel}
                                    </Badge>
                                    {m.matchMethod && (
                                      <Badge variant="secondary" className="text-[9px]" data-testid={`badge-match-method-${m.id}`}>
                                        {m.matchMethod}
                                      </Badge>
                                    )}
                                    {m.confidence != null && m.confidence > 0 && (
                                      <span className="text-[10px] text-muted-foreground" data-testid={`text-match-confidence-${m.id}`}>
                                        {Math.round(m.confidence * 100)}%
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <Badge variant="destructive" className="text-[10px]" data-testid={`badge-unmatched-${m.id}`}>
                                    <AlertTriangle className="w-3 h-3 mr-0.5" />
                                    Not in domain vocabulary
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}