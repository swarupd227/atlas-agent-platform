import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Plug, Plus, Pencil, Trash2, Send, AlertTriangle, CheckCircle2, Clock, XCircle,
  Ticket, Users, Database, MessageSquare, Target, HardDrive, LifeBuoy, MessagesSquare,
  Shield, Eye, EyeOff, Zap, RefreshCw, Activity, AlertCircle,
  Tag, Lock, Unlock, Timer, FileText, Download, FileCode, Terminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Server, Wrench, AppWindow } from "lucide-react";
import type { LoggingIntegration, ToolConnector } from "@shared/schema";

const ICON_MAP: Record<string, LucideIcon> = {
  Ticket, Users, Database, MessageSquare, Target, HardDrive, LifeBuoy, MessagesSquare,
};

const CATEGORY_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  ticketing: { label: "Ticketing", icon: Ticket, color: "text-blue-500" },
  crm: { label: "CRM", icon: Users, color: "text-violet-500" },
  db: { label: "Database", icon: Database, color: "text-emerald-500" },
  messaging: { label: "Messaging", icon: MessageSquare, color: "text-orange-500" },
};

const STATUS_CONFIG: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: LucideIcon }> = {
  connected: { variant: "default", icon: CheckCircle2 },
  disconnected: { variant: "outline", icon: XCircle },
  error: { variant: "destructive", icon: AlertCircle },
  degraded: { variant: "secondary", icon: AlertTriangle },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;
}

function ConnectorCard({ connector, onSelect }: { connector: ToolConnector; onSelect: () => void }) {
  const IconComp = (connector.icon && ICON_MAP[connector.icon]) || Plug;
  const catMeta = CATEGORY_META[connector.category] || { label: connector.category, icon: Plug, color: "text-muted-foreground" };
  const statusCfg = getStatusConfig(connector.status);
  const StatusIcon = statusCfg.icon;
  const configuredCount = connector.configuredSecrets
    ? Object.values(connector.configuredSecrets as Record<string, boolean>).filter(Boolean).length
    : 0;
  const totalSecrets = connector.requiredSecrets?.length || 0;
  const allConfigured = configuredCount === totalSecrets && totalSecrets > 0;

  return (
    <Card className="hover-elevate cursor-pointer" onClick={onSelect} data-testid={`card-connector-${connector.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
            <IconComp className={`w-4 h-4 ${catMeta.color}`} />
          </div>
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-sm font-medium" data-testid={`text-connector-name-${connector.id}`}>
              {connector.name}
            </CardTitle>
            <span className="text-[11px] text-muted-foreground">{connector.description}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-[10px]" data-testid={`badge-category-${connector.id}`}>
            {catMeta.label}
          </Badge>
          <Badge variant={statusCfg.variant} className="text-[10px]" data-testid={`badge-status-${connector.id}`}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {connector.status}
          </Badge>
          {allConfigured ? (
            <Badge variant="outline" className="text-[10px]" data-testid={`badge-secrets-${connector.id}`}>
              <Lock className="w-3 h-3 mr-1" />
              {configuredCount}/{totalSecrets} secrets
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]" data-testid={`badge-secrets-${connector.id}`}>
              <Unlock className="w-3 h-3 mr-1" />
              {configuredCount}/{totalSecrets} secrets
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(connector.permissions || []).slice(0, 3).map((p) => (
            <Badge key={p} variant="outline" className="text-[10px] font-mono" data-testid={`badge-permission-${connector.id}-${p}`}>
              {p}
            </Badge>
          ))}
          {(connector.permissions || []).length > 3 && (
            <Badge variant="outline" className="text-[10px]">
              +{(connector.permissions || []).length - 3} more
            </Badge>
          )}
        </div>

        {(connector.dataClassificationTags || []).length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
            {(connector.dataClassificationTags || []).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className={`text-[10px] ${tag === "PII" ? "border-amber-500/40 text-amber-600 dark:text-amber-400" : tag === "Financial" ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : tag === "PHI" ? "border-red-500/40 text-red-600 dark:text-red-400" : ""}`}
                data-testid={`badge-tag-${connector.id}-${tag}`}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectorDetailDialog({ connector, open, onOpenChange }: { connector: ToolConnector | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [adapterFormat, setAdapterFormat] = useState<"typescript" | "python">("typescript");
  const [adapterCode, setAdapterCode] = useState<string | null>(null);
  const [adapterVisible, setAdapterVisible] = useState(false);

  const testMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/tool-connectors/${id}/test`),
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/tool-connectors"] });
      if (result.success) {
        toast({ title: "Connection test passed", description: `Latency: ${result.latencyMs}ms` });
      } else {
        toast({ title: "Connection test failed", description: result.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    },
  });

  const adapterMutation = useMutation({
    mutationFn: async ({ id, format }: { id: string; format: string }) => {
      const res = await apiRequest("POST", `/api/tool-connectors/${id}/generate-adapter`, { format });
      return res.json();
    },
    onSuccess: (data) => {
      setAdapterCode(data.code);
      setAdapterVisible(true);
    },
    onError: () => {
      toast({ title: "Generation failed", description: "Could not generate adapter code", variant: "destructive" });
    },
  });

  if (!connector) return null;

  const IconComp = (connector.icon && ICON_MAP[connector.icon]) || Plug;
  const catMeta = CATEGORY_META[connector.category] || { label: connector.category, icon: Plug, color: "text-muted-foreground" };
  const statusCfg = getStatusConfig(connector.status);
  const StatusIcon = statusCfg.icon;
  const retryPolicy = connector.retryPolicy as { maxRetries?: number; backoffMs?: number; backoffMultiplier?: number } | null;
  const configuredSecrets = (connector.configuredSecrets || {}) as Record<string, boolean>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-connector-detail">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted shrink-0">
              <IconComp className={`w-5 h-5 ${catMeta.color}`} />
            </div>
            <div>
              <DialogTitle data-testid="text-detail-name">{connector.name}</DialogTitle>
              <DialogDescription>{connector.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-5 mt-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px]">{catMeta.label}</Badge>
            <Badge variant={statusCfg.variant} className="text-[10px]" data-testid="badge-detail-status">
              <StatusIcon className="w-3 h-3 mr-1" />
              {connector.status}
            </Badge>
            {connector.lastTestedAt && (
              <span className="text-[11px] text-muted-foreground" data-testid="text-last-tested">
                Last tested: {new Date(connector.lastTestedAt).toLocaleString()}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-medium flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                Secrets Configuration
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testMutation.mutate(connector.id)}
                disabled={testMutation.isPending}
                data-testid="button-test-connection"
              >
                {testMutation.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5 mr-1.5" />
                )}
                {testMutation.isPending ? "Testing..." : "Test Connection"}
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              {(connector.requiredSecrets || []).map((secretKey) => {
                const isConfigured = configuredSecrets[secretKey] === true;
                const isVisible = showSecrets[secretKey];
                return (
                  <div key={secretKey} className="flex items-center gap-3 flex-wrap" data-testid={`row-secret-${secretKey}`}>
                    <div className="flex items-center gap-2 min-w-[200px]">
                      {isConfigured ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                      )}
                      <span className="text-xs font-mono">{secretKey}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-1">
                      <Input
                        readOnly
                        value={isConfigured ? (isVisible ? "sk-abc123...xyz789" : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022") : ""}
                        placeholder={isConfigured ? "" : "Not configured"}
                        className="text-xs font-mono"
                        data-testid={`input-secret-${secretKey}`}
                      />
                      {isConfigured && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setShowSecrets((prev) => ({ ...prev, [secretKey]: !prev[secretKey] }))}
                          data-testid={`button-toggle-secret-${secretKey}`}
                        >
                          {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium flex items-center gap-1.5">
              <Timer className="w-4 h-4" />
              Rate Limits & Retry Policy
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-3 flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Rate Limit</span>
                  <span className="text-sm font-medium" data-testid="text-rate-limit">
                    {connector.rateLimitRequests ?? "N/A"} requests / {connector.rateLimitWindow ?? "N/A"}
                  </span>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Retry Policy</span>
                  {retryPolicy ? (
                    <div className="flex flex-col gap-0.5" data-testid="text-retry-policy">
                      <span className="text-sm font-medium">
                        {retryPolicy.maxRetries ?? 0} retries
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {retryPolicy.backoffMs ?? 0}ms backoff, {retryPolicy.backoffMultiplier ?? 1}x multiplier
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">None configured</span>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium flex items-center gap-1.5">
              <Lock className="w-4 h-4" />
              Permissions
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(connector.permissions || []).map((perm) => (
                <Badge key={perm} variant="outline" className="text-[10px] font-mono" data-testid={`badge-detail-permission-${perm}`}>
                  {perm}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium flex items-center gap-1.5">
              <Tag className="w-4 h-4" />
              Data Classification
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(connector.dataClassificationTags || []).length === 0 ? (
                <span className="text-xs text-muted-foreground">No classification tags</span>
              ) : (
                (connector.dataClassificationTags || []).map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className={`text-[10px] ${tag === "PII" ? "border-amber-500/40 text-amber-600 dark:text-amber-400" : tag === "Financial" ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : tag === "PHI" ? "border-red-500/40 text-red-600 dark:text-red-400" : ""}`}
                    data-testid={`badge-detail-tag-${tag}`}
                  >
                    {tag}
                  </Badge>
                ))
              )}
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-medium flex items-center gap-1.5">
                <FileCode className="w-4 h-4" />
                Generate Adapter Code
              </h3>
              <div className="flex items-center gap-2">
                <Select value={adapterFormat} onValueChange={(v) => setAdapterFormat(v as "typescript" | "python")}>
                  <SelectTrigger className="w-[130px]" data-testid="select-adapter-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="typescript">TypeScript</SelectItem>
                    <SelectItem value="python">Python</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => adapterMutation.mutate({ id: connector.id, format: adapterFormat })}
                  disabled={adapterMutation.isPending}
                  data-testid="button-generate-adapter"
                >
                  {adapterMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Terminal className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {adapterMutation.isPending ? "Generating..." : "Generate"}
                </Button>
              </div>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Generate a standalone adapter stub for this tool, ready to integrate into exported agent code packages.
            </span>
            {adapterVisible && adapterCode && (
              <div className="flex flex-col gap-2" data-testid="adapter-code-preview">
                <div className="overflow-auto max-h-[300px] rounded-md bg-muted/30 border">
                  <pre className="text-xs font-mono p-3 whitespace-pre-wrap">
                    <code>{adapterCode}</code>
                  </pre>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(adapterCode);
                      toast({ title: "Copied to clipboard" });
                    }}
                    data-testid="button-copy-adapter"
                  >
                    Copy Code
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const ext = adapterFormat === "typescript" ? "ts" : "py";
                      const blob = new Blob([adapterCode], { type: "text/plain" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${(connector.name || "tool").replace(/[^a-zA-Z0-9_]/g, "_")}_adapter.${ext}`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      toast({ title: "Adapter downloaded" });
                    }}
                    data-testid="button-download-adapter"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToolCatalogSection() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedConnector, setSelectedConnector] = useState<ToolConnector | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: connectors, isLoading } = useQuery<ToolConnector[]>({
    queryKey: ["/api/tool-connectors"],
  });

  const filteredConnectors = useMemo(() => {
    if (!connectors) return [];
    if (selectedCategory === "all") return connectors;
    return connectors.filter((c) => c.category === selectedCategory);
  }, [connectors, selectedCategory]);

  const categoryCounts = useMemo(() => {
    if (!connectors) return {};
    const counts: Record<string, number> = {};
    for (const c of connectors) {
      counts[c.category] = (counts[c.category] || 0) + 1;
    }
    return counts;
  }, [connectors]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-24" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant={selectedCategory === "all" ? "default" : "outline"}
            onClick={() => setSelectedCategory("all")}
            data-testid="filter-all"
          >
            All ({connectors?.length || 0})
          </Button>
          {Object.entries(CATEGORY_META).map(([key, meta]) => {
            const CatIcon = meta.icon;
            return (
              <Button
                key={key}
                size="sm"
                variant={selectedCategory === key ? "default" : "outline"}
                onClick={() => setSelectedCategory(key)}
                data-testid={`filter-${key}`}
              >
                <CatIcon className="w-3.5 h-3.5 mr-1.5" />
                {meta.label} ({categoryCounts[key] || 0})
              </Button>
            );
          })}
        </div>
        <Badge variant="outline" className="text-xs" data-testid="badge-total-connectors">
          {filteredConnectors.length} connector{filteredConnectors.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {filteredConnectors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Plug className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-connectors">
              No connectors found in this category
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredConnectors.map((c) => (
            <ConnectorCard
              key={c.id}
              connector={c}
              onSelect={() => { setSelectedConnector(c); setDetailOpen(true); }}
            />
          ))}
        </div>
      )}

      <ConnectorDetailDialog
        connector={selectedConnector}
        open={detailOpen}
        onOpenChange={(open) => { setDetailOpen(open); if (!open) setSelectedConnector(null); }}
      />
    </div>
  );
}

interface SchemaChange { date: string; description: string; breaking: boolean }

function ConnectorHealthSection() {
  const { data: connectors, isLoading } = useQuery<ToolConnector[]>({
    queryKey: ["/api/tool-connectors"],
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const healthConnectors = (connectors || []).filter((c) => c.status !== "disconnected" || c.uptimePercent != null);

  if (healthConnectors.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <Activity className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground" data-testid="text-no-health-data">
            No connector health data available. Connect a tool to start monitoring.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground" data-testid="text-health-description">
        Real-time health metrics for connected tool integrations
      </p>

      <div className="grid grid-cols-1 gap-4">
        {healthConnectors.map((c) => {
          const IconComp = (c.icon && ICON_MAP[c.icon]) || Plug;
          const catMeta = CATEGORY_META[c.category] || { label: c.category, icon: Plug, color: "text-muted-foreground" };
          const statusCfg = getStatusConfig(c.status);
          const StatusIcon = statusCfg.icon;
          const uptimePct = c.uptimePercent ?? 0;
          const errorPct = c.errorRate ?? 0;
          const schemaChanges = (c.recentSchemaChanges || []) as SchemaChange[];

          return (
            <Card key={c.id} data-testid={`card-health-${c.id}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
                    <IconComp className={`w-4 h-4 ${catMeta.color}`} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <CardTitle className="text-sm font-medium" data-testid={`text-health-name-${c.id}`}>
                      {c.name}
                    </CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">{catMeta.label}</Badge>
                      <Badge variant={statusCfg.variant} className="text-[10px]" data-testid={`badge-health-status-${c.id}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Uptime</span>
                    <div className="flex flex-col gap-1">
                      <span
                        className={`text-lg font-semibold ${uptimePct >= 99.5 ? "text-green-600 dark:text-green-400" : uptimePct >= 95 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}
                        data-testid={`text-uptime-${c.id}`}
                      >
                        {uptimePct != null ? `${uptimePct.toFixed(1)}%` : "N/A"}
                      </span>
                      {uptimePct != null && (
                        <Progress
                          value={uptimePct}
                          className="h-1.5"
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Error Rate</span>
                    <span
                      className={`text-lg font-semibold ${errorPct <= 1 ? "text-green-600 dark:text-green-400" : errorPct <= 5 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}
                      data-testid={`text-error-rate-${c.id}`}
                    >
                      {errorPct != null ? `${errorPct.toFixed(1)}%` : "N/A"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">P50 Latency</span>
                    <span className="text-lg font-semibold" data-testid={`text-p50-${c.id}`}>
                      {c.latencyP50 != null ? `${c.latencyP50}ms` : "N/A"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">P95 Latency</span>
                    <span className="text-lg font-semibold" data-testid={`text-p95-${c.id}`}>
                      {c.latencyP95 != null ? `${c.latencyP95}ms` : "N/A"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">P99 Latency</span>
                    <span className="text-lg font-semibold" data-testid={`text-p99-${c.id}`}>
                      {c.latencyP99 != null ? `${c.latencyP99}ms` : "N/A"}
                    </span>
                  </div>
                </div>

                {schemaChanges.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      Recent Schema Changes
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {schemaChanges.map((change, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs" data-testid={`row-schema-change-${c.id}-${idx}`}>
                          <span className="text-muted-foreground whitespace-nowrap shrink-0">{change.date}</span>
                          {change.breaking && (
                            <Badge variant="destructive" className="text-[9px] shrink-0">BREAKING</Badge>
                          )}
                          <span className="text-muted-foreground">{change.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const PROVIDERS = ["datadog", "splunk", "elastic", "webhook", "syslog"] as const;
const EVENT_TYPES = ["audit_events", "traces", "agent_actions", "policy_violations", "deployments", "eval_results"] as const;

interface LoggingFormData {
  name: string;
  provider: string;
  endpointUrl: string;
  eventTypes: string[];
}

const emptyForm: LoggingFormData = {
  name: "",
  provider: "",
  endpointUrl: "",
  eventTypes: [],
};

function maskUrl(url: string | null): string {
  if (!url) return "\u2014";
  try {
    const u = new URL(url);
    const masked = u.hostname.length > 20 ? u.hostname.slice(0, 20) + "..." : u.hostname;
    return `${u.protocol}//${masked}`;
  } catch {
    return url.length > 30 ? url.slice(0, 30) + "..." : url;
  }
}

function formatTime(date: Date | string | null): string {
  if (!date) return "Never";
  return new Date(date).toLocaleString();
}

function LoggingSection() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<LoggingFormData>(emptyForm);

  const { data: integrations, isLoading } = useQuery<LoggingIntegration[]>({
    queryKey: ["/api/logging-integrations"],
  });

  const createMutation = useMutation({
    mutationFn: (data: LoggingFormData) => apiRequest("POST", "/api/logging-integrations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logging-integrations"] });
      toast({ title: "Integration created" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create integration", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: LoggingFormData }) => apiRequest("PATCH", `/api/logging-integrations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logging-integrations"] });
      toast({ title: "Integration updated" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update integration", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/logging-integrations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logging-integrations"] });
      toast({ title: "Integration deleted" });
      setDeleteDialogOpen(false);
      setDeletingId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete integration", description: err.message, variant: "destructive" });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(integration: LoggingIntegration) {
    setForm({
      name: integration.name,
      provider: integration.provider,
      endpointUrl: integration.endpointUrl || "",
      eventTypes: integration.eventTypes || [],
    });
    setEditingId(integration.id);
    setDialogOpen(true);
  }

  function openDelete(id: string) {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name || !form.provider || form.eventTypes.length === 0) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function toggleEventType(eventType: string) {
    setForm((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(eventType)
        ? prev.eventTypes.filter((e) => e !== eventType)
        : [...prev.eventTypes, eventType],
    }));
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent><Skeleton className="h-20 w-full" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground" data-testid="text-logging-description">
          Configure external logging services to forward platform events
        </p>
        <Button size="sm" onClick={openCreate} data-testid="button-add-logging-integration">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Integration
        </Button>
      </div>

      {(!integrations || integrations.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Send className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-logging-integrations">
              No logging integrations configured yet
            </p>
            <Button size="sm" variant="outline" onClick={openCreate} data-testid="button-add-first-logging">
              <Plus className="w-4 h-4 mr-1.5" />
              Add your first integration
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map((integration) => (
            <Card key={integration.id} data-testid={`card-logging-integration-${integration.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="flex flex-col gap-1.5">
                  <CardTitle className="text-sm font-medium" data-testid={`text-logging-name-${integration.id}`}>
                    {integration.name}
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]" data-testid={`badge-provider-${integration.id}`}>
                      {integration.provider}
                    </Badge>
                    <Badge
                      variant={integration.status === "active" ? "default" : "outline"}
                      className="text-[10px]"
                      data-testid={`badge-logging-status-${integration.id}`}
                    >
                      {integration.status === "active" ? (
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                      ) : (
                        <Clock className="w-3 h-3 mr-1" />
                      )}
                      {integration.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(integration)}
                    data-testid={`button-edit-logging-${integration.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openDelete(integration.id)}
                    data-testid={`button-delete-logging-${integration.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Endpoint</span>
                  <span className="text-xs font-mono text-muted-foreground" data-testid={`text-endpoint-${integration.id}`}>
                    {maskUrl(integration.endpointUrl)}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Event Types</span>
                  <div className="flex flex-wrap gap-1">
                    {(integration.eventTypes || []).map((et) => (
                      <Badge key={et} variant="outline" className="text-[10px]" data-testid={`badge-event-type-${integration.id}-${et}`}>
                        {et.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                  <div className="flex items-center gap-1" data-testid={`text-delivered-${integration.id}`}>
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    {integration.deliveredCount ?? 0} delivered
                  </div>
                  <div className="flex items-center gap-1" data-testid={`text-failed-${integration.id}`}>
                    <XCircle className="w-3 h-3 text-destructive" />
                    {integration.failedCount ?? 0} failed
                  </div>
                  {integration.lastDeliveryAt && (
                    <div className="flex items-center gap-1" data-testid={`text-last-delivery-${integration.id}`}>
                      <Clock className="w-3 h-3" />
                      {formatTime(integration.lastDeliveryAt)}
                      {integration.lastDeliveryStatus && (
                        <Badge
                          variant={integration.lastDeliveryStatus === "success" ? "default" : "destructive"}
                          className="text-[10px] ml-1"
                        >
                          {integration.lastDeliveryStatus}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent data-testid="dialog-logging-form">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingId ? "Edit Logging Integration" : "Add Logging Integration"}
            </DialogTitle>
            <DialogDescription>
              {editingId ? "Update the logging integration configuration." : "Configure a new external logging service."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="logging-name">Name</Label>
              <Input
                id="logging-name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="My Datadog Integration"
                data-testid="input-logging-name"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="logging-provider">Provider</Label>
              <Select value={form.provider} onValueChange={(v) => setForm((p) => ({ ...p, provider: v }))}>
                <SelectTrigger data-testid="select-logging-provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p} data-testid={`option-provider-${p}`}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="logging-endpoint">Endpoint URL</Label>
              <Input
                id="logging-endpoint"
                value={form.endpointUrl}
                onChange={(e) => setForm((p) => ({ ...p, endpointUrl: e.target.value }))}
                placeholder="https://logs.example.com/v1/intake"
                data-testid="input-logging-endpoint"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Event Types</Label>
              <div className="grid grid-cols-2 gap-2">
                {EVENT_TYPES.map((et) => (
                  <div key={et} className="flex items-center gap-2">
                    <Checkbox
                      id={`event-${et}`}
                      checked={form.eventTypes.includes(et)}
                      onCheckedChange={() => toggleEventType(et)}
                      data-testid={`checkbox-event-${et}`}
                    />
                    <Label htmlFor={`event-${et}`} className="text-sm font-normal cursor-pointer">
                      {et.replace(/_/g, " ")}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-logging">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving} data-testid="button-save-logging">
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open) { setDeleteDialogOpen(false); setDeletingId(null); } }}>
        <DialogContent data-testid="dialog-delete-confirmation">
          <DialogHeader>
            <DialogTitle>Delete Integration</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this logging integration? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 py-4">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <p className="text-sm text-muted-foreground">All delivery history will be lost.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeletingId(null); }} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Integrations() {
  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-integrations">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <Plug className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
              Integrations
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
              Connect external tools, APIs, and services to your agent platform
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 mb-4">
        <Card className="hover-elevate" data-testid="card-mcp-servers-link">
          <Link href="/integrations/mcp-servers">
            <CardContent className="flex items-center gap-4 py-4 cursor-pointer">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted shrink-0">
                <Server className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-sm font-medium">MCP Servers</span>
                <span className="text-xs text-muted-foreground">Manage Model Context Protocol server connections, validate capabilities, and assign risk tiers</span>
              </div>
              <Badge variant="secondary" className="text-[10px]">MCP</Badge>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover-elevate" data-testid="card-tool-catalog-link">
          <Link href="/integrations/tool-catalog">
            <CardContent className="flex items-center gap-4 py-4 cursor-pointer">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted shrink-0">
                <Wrench className="w-5 h-5 text-orange-500" />
              </div>
              <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-sm font-medium">MCP Tool Registry</span>
                <span className="text-xs text-muted-foreground">Governed inventory of tools synced from MCP servers — risk classification, ownership, and drift detection</span>
              </div>
              <Badge variant="secondary" className="text-[10px]">Governance</Badge>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover-elevate" data-testid="card-mcp-resources-link">
          <Link href="/integrations/mcp-resources">
            <CardContent className="flex items-center gap-4 py-4 cursor-pointer">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted shrink-0">
                <FileText className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-sm font-medium">MCP Resources</span>
                <span className="text-xs text-muted-foreground">Governed knowledge connectors — document stores, repos, DB exports with sensitivity classification and approval gates</span>
              </div>
              <Badge variant="secondary" className="text-[10px]">Knowledge</Badge>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover-elevate" data-testid="card-mcp-prompts-link">
          <Link href="/integrations/mcp-prompts">
            <CardContent className="flex items-center gap-4 py-4 cursor-pointer">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted shrink-0">
                <MessagesSquare className="w-5 h-5 text-purple-500" />
              </div>
              <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-sm font-medium">MCP Prompts</span>
                <span className="text-xs text-muted-foreground">Prompt library — reusable workflow templates, playbooks, and structured prompts from MCP servers</span>
              </div>
              <Badge variant="secondary" className="text-[10px]">Prompts</Badge>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover-elevate" data-testid="card-mcp-apps-link">
          <Link href="/integrations/mcp-apps">
            <CardContent className="flex items-center gap-4 py-4 cursor-pointer">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted shrink-0">
                <AppWindow className="w-5 h-5 text-cyan-500" />
              </div>
              <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-sm font-medium">MCP Apps</span>
                <span className="text-xs text-muted-foreground">Interactive HTML dashboards rendered inline in run and approval screens — sandboxed with trust validation</span>
              </div>
              <Badge variant="secondary" className="text-[10px]">Apps</Badge>
            </CardContent>
          </Link>
        </Card>

        <Card className="hover-elevate" data-testid="card-marketplace-link">
          <Link href="/integrations/marketplace">
            <CardContent className="flex items-center gap-4 py-4 cursor-pointer">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted shrink-0">
                <Tag className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-sm font-medium">Marketplace</span>
                <span className="text-xs text-muted-foreground">Browse and install community-contributed agents, skills, and integration packages</span>
              </div>
              <Badge variant="secondary" className="text-[10px]">Store</Badge>
            </CardContent>
          </Link>
        </Card>
      </div>

      <Tabs defaultValue="catalog" data-testid="tabs-integrations">
        <TabsList data-testid="tabs-list-integrations">
          <TabsTrigger value="catalog" data-testid="tab-catalog">Connectors</TabsTrigger>
          <TabsTrigger value="health" data-testid="tab-health">Connector Health</TabsTrigger>
          <TabsTrigger value="logging" data-testid="tab-logging">Logging</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-4">
          <ToolCatalogSection />
        </TabsContent>

        <TabsContent value="health" className="mt-4">
          <ConnectorHealthSection />
        </TabsContent>

        <TabsContent value="logging" className="mt-4">
          <LoggingSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
