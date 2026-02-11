import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Server, Plus, Shield, Activity, CheckCircle2, AlertCircle, Globe, Terminal } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { McpServer } from "@shared/schema";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  registered: "outline",
  verified: "secondary",
  "production-enabled": "default",
};

const HEALTH_COLOR: Record<string, string> = {
  healthy: "bg-green-500",
  degraded: "bg-yellow-500",
  unhealthy: "bg-red-500",
  unknown: "bg-gray-400",
};

export default function McpServersPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [transportType, setTransportType] = useState("streamable-http");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [protocolVersion, setProtocolVersion] = useState("2025-03-26");
  const [riskTier, setRiskTier] = useState("MEDIUM");

  const { data: servers, isLoading } = useQuery<McpServer[]>({
    queryKey: ["/api/mcp-servers"],
  });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/mcp-servers", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers"] });
      toast({ title: "MCP Server created" });
      resetForm();
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create server", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setName("");
    setDescription("");
    setTransportType("streamable-http");
    setUrl("");
    setCommand("");
    setArgs("");
    setProtocolVersion("2025-03-26");
    setRiskTier("MEDIUM");
  }

  function handleSubmit() {
    const body: Record<string, unknown> = {
      name,
      description: description || undefined,
      transportType,
      expectedProtocolVersion: protocolVersion,
      riskTier,
    };
    if (transportType === "streamable-http") {
      body.url = url;
    } else {
      body.command = command;
      body.args = args ? args.split(",").map((a) => a.trim()).filter(Boolean) : [];
    }
    createMutation.mutate(body);
  }

  const stats = useMemo(() => {
    if (!servers) return { total: 0, healthy: 0, verified: 0, production: 0 };
    return {
      total: servers.length,
      healthy: servers.filter((s) => s.healthStatus === "healthy").length,
      verified: servers.filter((s) => s.status === "verified" || s.status === "production-enabled").length,
      production: servers.filter((s) => s.status === "production-enabled").length,
    };
  }, [servers]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">MCP Servers</h1>
          <p className="text-sm text-muted-foreground">Manage Model Context Protocol servers for agent tool access</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-add-mcp-server">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Server
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="stat-total">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Servers</span>
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <span className="text-xl font-semibold">{stats.total}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-healthy">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Healthy</span>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-500" />
              <span className="text-xl font-semibold">{stats.healthy}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-verified">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Verified</span>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-500" />
              <span className="text-xl font-semibold">{stats.verified}</span>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-production">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Production Enabled</span>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet-500" />
              <span className="text-xl font-semibold">{stats.production}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {(!servers || servers.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Server className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-servers">
              No MCP servers registered yet
            </p>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-add-mcp-server-empty">
              <Plus className="w-4 h-4 mr-1.5" />
              Add Server
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servers.map((server) => (
            <Link key={server.id} href={`/integrations/mcp-servers/${server.id}`}>
              <Card className="hover-elevate cursor-pointer" data-testid={`card-mcp-server-${server.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
                      {server.transportType === "stdio" ? (
                        <Terminal className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Globe className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <CardTitle className="text-sm font-medium" data-testid={`text-mcp-name-${server.id}`}>
                        {server.name}
                      </CardTitle>
                      {server.description && (
                        <span className="text-[11px] text-muted-foreground">{server.description}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className={`w-2 h-2 rounded-full ${HEALTH_COLOR[server.healthStatus || "unknown"]}`} />
                    <span className="text-[10px] text-muted-foreground">{server.healthStatus || "unknown"}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]" data-testid={`badge-transport-${server.id}`}>
                      {server.transportType === "stdio" ? (
                        <Terminal className="w-3 h-3 mr-1" />
                      ) : (
                        <Globe className="w-3 h-3 mr-1" />
                      )}
                      {server.transportType}
                    </Badge>
                    <Badge variant={STATUS_VARIANT[server.status] || "outline"} className="text-[10px]" data-testid={`badge-status-${server.id}`}>
                      {server.status}
                    </Badge>
                    <Badge
                      variant={server.riskTier === "CRITICAL" ? "destructive" : server.riskTier === "HIGH" ? "destructive" : "outline"}
                      className="text-[10px]"
                      data-testid={`badge-risk-${server.id}`}
                    >
                      <Shield className="w-3 h-3 mr-1" />
                      {server.riskTier}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-muted-foreground">
                      Protocol: {server.negotiatedProtocolVersion || server.expectedProtocolVersion || "N/A"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-add-mcp-server">
          <DialogHeader>
            <DialogTitle>Add MCP Server</DialogTitle>
            <DialogDescription>Register a new Model Context Protocol server</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mcp-name">Name *</Label>
              <Input
                id="mcp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My MCP Server"
                data-testid="input-mcp-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mcp-description">Description</Label>
              <Textarea
                id="mcp-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this server provide?"
                data-testid="input-mcp-description"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Transport Type</Label>
              <Select value={transportType} onValueChange={setTransportType}>
                <SelectTrigger data-testid="select-transport-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="streamable-http">streamable-http</SelectItem>
                  <SelectItem value="stdio">stdio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {transportType === "streamable-http" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mcp-url">URL</Label>
                <Input
                  id="mcp-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/mcp"
                  data-testid="input-mcp-url"
                />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mcp-command">Command</Label>
                  <Input
                    id="mcp-command"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="npx"
                    data-testid="input-mcp-command"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mcp-args">Args (comma-separated)</Label>
                  <Input
                    id="mcp-args"
                    value={args}
                    onChange={(e) => setArgs(e.target.value)}
                    placeholder="--server, --port, 3000"
                    data-testid="input-mcp-args"
                  />
                </div>
              </>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mcp-protocol">Expected Protocol Version</Label>
              <Input
                id="mcp-protocol"
                value={protocolVersion}
                onChange={(e) => setProtocolVersion(e.target.value)}
                data-testid="input-mcp-protocol"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Risk Tier</Label>
              <Select value={riskTier} onValueChange={setRiskTier}>
                <SelectTrigger data-testid="select-risk-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">LOW</SelectItem>
                  <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                  <SelectItem value="HIGH">HIGH</SelectItem>
                  <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleSubmit}
              disabled={!name || createMutation.isPending}
              data-testid="button-submit-mcp-server"
            >
              {createMutation.isPending ? "Creating..." : "Add Server"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
