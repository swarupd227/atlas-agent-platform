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
import {
  ArrowLeft, Shield, Wrench, AlertCircle, RefreshCw, Zap,
  FileText, Hash, Clock, Activity, Settings, Tag,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ToolDetail {
  id: string;
  serverId: string;
  name: string;
  description: string | null;
  inputSchema: unknown;
  outputSchema: unknown;
  annotations: Record<string, unknown> | null;
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

const ANNOTATION_LABELS: Record<string, string> = {
  readOnlyHint: "Read Only Hint",
  destructiveHint: "Destructive Hint",
  idempotentHint: "Idempotent Hint",
  openWorldHint: "Open World Hint",
};

export default function ToolDetailPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/integrations/tool-catalog/:id");
  const id = params?.id || "";

  const { data: tool, isLoading } = useQuery<ToolDetail>({
    queryKey: ["/api/tool-catalog", id],
    enabled: !!id,
  });

  const [editOwner, setEditOwner] = useState<string | null>(null);
  const [editRisk, setEditRisk] = useState<string | null>(null);

  const owner = editOwner ?? tool?.owner ?? "";
  const riskClassification = editRisk ?? tool?.riskClassification ?? "low";

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/tool-catalog/${id}`, {
        owner: owner || null,
        riskClassification,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tool-catalog", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tool-catalog"] });
      toast({ title: "Governance settings saved" });
      setEditOwner(null);
      setEditRisk(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const enableMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tool-catalog/${id}/request-enablement`);
      return res.json();
    },
    onSuccess: (data: { approved?: boolean; approvalRequired?: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tool-catalog", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tool-catalog"] });
      if (data.approved) {
        toast({ title: "Tool enabled" });
      } else if (data.approvalRequired) {
        toast({ title: "Approval required - Security Admin must approve" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to request enablement", description: err.message, variant: "destructive" });
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

  if (!tool) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Link href="/integrations/tool-catalog" data-testid="link-back-tool-catalog">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Tool Catalog
          </Button>
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <AlertCircle className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-tool-not-found">Tool not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const annotations = (tool.annotations || {}) as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4">
        <Link href="/integrations/tool-catalog" data-testid="link-back-tool-catalog">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Tool Catalog
          </Button>
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-tool-name">
              {tool.name}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground" data-testid="text-server-name">
                {tool.serverName}
              </span>
              <Badge
                variant={RISK_VARIANT[tool.riskClassification] || "default"}
                data-testid="badge-risk"
              >
                <Shield className="w-3 h-3 mr-1" />
                {tool.riskClassification}
              </Badge>
              <Badge
                variant={tool.enabled ? "default" : "outline"}
                data-testid="badge-enabled"
              >
                {tool.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>

          <Button
            onClick={() => enableMutation.mutate()}
            disabled={tool.enabled || enableMutation.isPending}
            data-testid="button-enable-blueprint"
          >
            {enableMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 mr-1.5" />
            )}
            Enable for Blueprint
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <Settings className="w-3.5 h-3.5 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="input-schema" data-testid="tab-input-schema">
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Input Schema
          </TabsTrigger>
          <TabsTrigger value="output-schema" data-testid="tab-output-schema">
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Output Schema
          </TabsTrigger>
          <TabsTrigger value="annotations" data-testid="tab-annotations">
            <Tag className="w-3.5 h-3.5 mr-1.5" />
            Annotations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="card-description">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Wrench className="w-4 h-4" />
                  Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground" data-testid="text-description">
                  {tool.description || "No description available"}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-governance">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Shield className="w-4 h-4" />
                  Governance
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
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
                <div className="flex flex-col gap-1.5">
                  <Label>Risk Classification</Label>
                  <Select value={riskClassification} onValueChange={(v) => setEditRisk(v)}>
                    <SelectTrigger data-testid="select-risk-classification">
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
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Enabled</span>
                  <Badge variant={tool.enabled ? "default" : "outline"} className="text-[10px]" data-testid="text-enabled-status">
                    {tool.enabled ? "Enabled" : "Disabled"}
                  </Badge>
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

            <Card data-testid="card-usage-metrics">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Activity className="w-4 h-4" />
                  Usage Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Usage Count</span>
                  <span className="text-xs font-medium" data-testid="text-usage-count">{tool.usageCount}</span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Last Used At</span>
                  <span className="text-xs" data-testid="text-last-used">
                    {tool.lastUsedAt ? new Date(tool.lastUsedAt).toLocaleString() : "Never"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Synced At</span>
                  <span className="text-xs" data-testid="text-synced-at">
                    {tool.syncedAt ? new Date(tool.syncedAt).toLocaleString() : "Never"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Drift Status</span>
                  <Badge
                    variant={tool.driftStatus === "drifted" ? "destructive" : "default"}
                    className="text-[10px]"
                    data-testid="badge-drift-status"
                  >
                    {tool.driftStatus || "stable"}
                  </Badge>
                </div>
                {tool.lastDriftAt && (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Last Drift Detected</span>
                    <span className="text-xs" data-testid="text-last-drift">
                      {new Date(tool.lastDriftAt).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Fingerprint Hash</span>
                  <span className="text-xs font-mono" data-testid="text-fingerprint-hash">
                    {tool.fingerprintHash || "N/A"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="input-schema" className="flex flex-col gap-4 mt-4">
          <Card data-testid="card-input-schema">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                Input Schema
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tool.inputSchema ? (
                <pre className="text-xs font-mono bg-muted/30 rounded-md p-3 overflow-auto max-h-[400px]" data-testid="code-input-schema">
                  <code>{JSON.stringify(tool.inputSchema, null, 2)}</code>
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="text-no-input-schema">No input schema defined</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="output-schema" className="flex flex-col gap-4 mt-4">
          <Card data-testid="card-output-schema">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                Output Schema
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tool.outputSchema ? (
                <pre className="text-xs font-mono bg-muted/30 rounded-md p-3 overflow-auto max-h-[400px]" data-testid="code-output-schema">
                  <code>{JSON.stringify(tool.outputSchema, null, 2)}</code>
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="text-no-output-schema">No output schema defined</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="annotations" className="flex flex-col gap-4 mt-4">
          <Card data-testid="card-annotations">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Tag className="w-4 h-4" />
                Annotations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(annotations).length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-annotations">No annotations available</p>
              ) : (
                <div className="flex flex-col gap-2" data-testid="list-annotations">
                  {Object.entries(annotations).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`annotation-${key}`}>
                      <span className="text-xs font-medium">
                        {ANNOTATION_LABELS[key] || key}
                      </span>
                      <Badge
                        variant={value === true ? "default" : value === false ? "outline" : "secondary"}
                        className="text-[10px]"
                      >
                        {String(value)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
