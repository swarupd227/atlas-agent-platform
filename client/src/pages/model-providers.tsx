import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { SiOpenai, SiGoogle } from "react-icons/si";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  DollarSign,
  RefreshCw,
  Server,
  Zap,
  ExternalLink,
  Info,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ProviderModel {
  id: string;
  name: string;
  contextWindow: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  supportsToolCalling: boolean;
  supportsJson: boolean;
  supportsEmbeddings?: boolean;
}

interface EmbeddingModel {
  id: string;
  name: string;
  dimensions: number;
  costPer1kTokens: number;
}

interface ProviderInfo {
  name: string;
  displayName: string;
  configured: boolean;
  models: ProviderModel[];
  embeddingModels?: EmbeddingModel[];
}

interface HealthResult {
  provider: string;
  displayName: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

interface UsageData {
  [provider: string]: {
    totalTokens: number;
    totalCost: number;
    totalRuns: number;
  };
}

const PROVIDER_ICONS: Record<string, typeof SiOpenai> = {
  openai: SiOpenai,
  google: SiGoogle,
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: "text-green-600 dark:text-green-400",
  anthropic: "text-orange-600 dark:text-orange-400",
  google: "text-blue-600 dark:text-blue-400",
  azure_openai: "text-sky-600 dark:text-sky-400",
  self_hosted: "text-purple-600 dark:text-purple-400",
};

const PROVIDER_ENV_VARS: Record<string, string> = {
  openai: "OPENAI_API_KEY (or AI_INTEGRATIONS_OPENAI_API_KEY via Replit Integrations)",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  azure_openai: "AZURE_OPENAI_API_KEY",
  self_hosted: "SELF_HOSTED_LLM_URL",
};

const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  openai: "Industry-leading models with best-in-class tool calling and structured output support.",
  anthropic: "Known for safety and reliability. Excellent at complex reasoning and analysis tasks.",
  google: "Massive context windows (1M tokens) at competitive pricing. Strong multimodal capabilities.",
  azure_openai: "Enterprise-grade OpenAI models with Azure compliance, VNet integration, and data residency.",
  self_hosted: "Run open-weight models on your own infrastructure using vLLM, Ollama, or compatible endpoints.",
};

function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
  return `${tokens}`;
}

function formatCost(cost: number): string {
  if (cost < 0.001) return `$${(cost * 10000).toFixed(1)}e-4`;
  return `$${cost.toFixed(4)}`;
}

export default function ModelProviders() {
  const { toast } = useToast();
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null);

  const { data: providers, isLoading: providersLoading } = useQuery<ProviderInfo[]>({
    queryKey: ["/api/llm-providers"],
  });

  const { data: usage } = useQuery<UsageData>({
    queryKey: ["/api/llm-providers/usage"],
  });

  const healthMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/llm-providers/health");
      if (!res.ok) throw new Error("Health check failed");
      return res.json() as Promise<HealthResult[]>;
    },
    onSuccess: (results) => {
      const ok = results.filter((r) => r.ok).length;
      const total = results.length;
      toast({
        title: "Health Check Complete",
        description: `${ok}/${total} providers healthy`,
      });
    },
    onError: () => {
      toast({
        title: "Health Check Failed",
        description: "Unable to reach provider endpoints",
        variant: "destructive",
      });
    },
  });

  const configuredCount = providers?.filter((p) => p.configured).length || 0;
  const totalModels = providers?.reduce((acc, p) => acc + p.models.length, 0) || 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Model Providers</h1>
          <p className="text-muted-foreground mt-1">
            Multi-provider LLM abstraction layer — configure providers, compare models, and monitor usage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => healthMutation.mutate()}
            disabled={healthMutation.isPending}
            data-testid="button-health-check"
          >
            {healthMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Activity className="h-4 w-4 mr-1" />
            )}
            Health Check
          </Button>
          <Link href="/context-studio">
            <Button variant="outline" size="sm" data-testid="link-context-economics">
              <DollarSign className="h-4 w-4 mr-1" />
              Context Economics
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold" data-testid="text-configured-count">{configuredCount}</div>
            <p className="text-xs text-muted-foreground">Providers Configured</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold" data-testid="text-total-models">{totalModels}</div>
            <p className="text-xs text-muted-foreground">Models Available</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold" data-testid="text-total-runs">
              {usage ? Object.values(usage).reduce((a, b) => a + b.totalRuns, 0).toLocaleString() : "—"}
            </div>
            <p className="text-xs text-muted-foreground">Total Runs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold" data-testid="text-total-cost">
              {usage
                ? `$${Object.values(usage)
                    .reduce((a, b) => a + b.totalCost, 0)
                    .toFixed(2)}`
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground">Total Cost (All Time)</p>
          </CardContent>
        </Card>
      </div>

      {healthMutation.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Health Check Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {healthMutation.data.map((result) => (
                <div
                  key={result.provider}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    result.ok ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20" : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                  }`}
                  data-testid={`health-result-${result.provider}`}
                >
                  <div className="flex items-center gap-2">
                    {result.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className="font-medium text-sm">{result.displayName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {result.latencyMs}ms
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {providersLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-3/4 mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))
        ) : (
          providers?.map((provider) => {
            const IconComponent = PROVIDER_ICONS[provider.name];
            const colorClass = PROVIDER_COLORS[provider.name] || "text-gray-600";
            const providerUsage = usage?.[provider.name];
            const isComingSoon = provider.name === "azure_openai" || provider.name === "self_hosted";

            return (
              <Card
                key={provider.name}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  provider.configured ? "border-green-200 dark:border-green-800" : ""
                } ${isComingSoon ? "opacity-60" : ""}`}
                onClick={() => !isComingSoon && setSelectedProvider(provider)}
                data-testid={`card-provider-${provider.name}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {IconComponent ? (
                        <IconComponent className={`h-6 w-6 ${colorClass}`} />
                      ) : (
                        <Cpu className={`h-6 w-6 ${colorClass}`} />
                      )}
                      <CardTitle className="text-lg">{provider.displayName}</CardTitle>
                    </div>
                    {isComingSoon ? (
                      <Badge variant="outline" className="text-xs">Coming Soon</Badge>
                    ) : provider.configured ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid={`badge-configured-${provider.name}`}>
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs" data-testid={`badge-not-configured-${provider.name}`}>
                        Not Configured
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs mt-1">
                    {PROVIDER_DESCRIPTIONS[provider.name]}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Models</span>
                    <span className="font-medium">{provider.models.length}</span>
                  </div>
                  {provider.embeddingModels && provider.embeddingModels.length > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Embedding Models</span>
                      <span className="font-medium">{provider.embeddingModels.length}</span>
                    </div>
                  )}
                  {providerUsage && (
                    <>
                      <Separator />
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Runs</div>
                          <div className="font-medium">{providerUsage.totalRuns.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Cost</div>
                          <div className="font-medium">${providerUsage.totalCost.toFixed(2)}</div>
                        </div>
                      </div>
                    </>
                  )}
                  {!provider.configured && !isComingSoon && (
                    <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Set <code className="font-mono text-[10px]">{PROVIDER_ENV_VARS[provider.name]}</code> to configure</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Architecture Overview
          </CardTitle>
          <CardDescription>
            How the LLM Provider Abstraction Layer works
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                Uniform Interface
              </h4>
              <p className="text-xs text-muted-foreground">
                All providers implement the same <code>complete()</code>, <code>completeWithTools()</code>, and <code>embed()</code>
                methods. Switching providers requires zero code changes.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Server className="h-4 w-4 text-blue-500" />
                Per-Agent Selection
              </h4>
              <p className="text-xs text-muted-foreground">
                Each agent can specify its own <code>modelProvider</code> and <code>modelName</code>. 
                Configure this in the Agent Wizard's "Define Agent" step.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-500" />
                Cost-Aware Routing
              </h4>
              <p className="text-xs text-muted-foreground">
                Cost estimation per model is built into each provider. Combined with Context Window Economics 
                for ROI-optimized model selection.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedProvider} onOpenChange={() => setSelectedProvider(null)}>
        {selectedProvider && (
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {PROVIDER_ICONS[selectedProvider.name] ? (
                  (() => {
                    const Icon = PROVIDER_ICONS[selectedProvider.name];
                    return <Icon className={`h-5 w-5 ${PROVIDER_COLORS[selectedProvider.name]}`} />;
                  })()
                ) : (
                  <Cpu className={`h-5 w-5 ${PROVIDER_COLORS[selectedProvider.name]}`} />
                )}
                {selectedProvider.displayName} — Model Catalog
              </DialogTitle>
              <DialogDescription>
                {selectedProvider.configured
                  ? "This provider is configured and ready for use."
                  : `Set the ${PROVIDER_ENV_VARS[selectedProvider.name]} environment variable to enable this provider.`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div>
                <h4 className="font-medium text-sm mb-2">Completion Models</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-center">Context</TableHead>
                      <TableHead className="text-right">Input $/1K</TableHead>
                      <TableHead className="text-right">Output $/1K</TableHead>
                      <TableHead className="text-center">Tools</TableHead>
                      <TableHead className="text-center">JSON</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProvider.models.map((model) => (
                      <TableRow key={model.id} data-testid={`row-model-${model.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">{model.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{model.id}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm">{formatContextWindow(model.contextWindow)}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{formatCost(model.costPer1kInput)}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{formatCost(model.costPer1kOutput)}</TableCell>
                        <TableCell className="text-center">
                          {model.supportsToolCalling ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-400 mx-auto" />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {model.supportsJson ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-400 mx-auto" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {selectedProvider.embeddingModels && selectedProvider.embeddingModels.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Embedding Models</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead className="text-center">Dimensions</TableHead>
                        <TableHead className="text-right">Cost $/1K tokens</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProvider.embeddingModels.map((model) => (
                        <TableRow key={model.id} data-testid={`row-embedding-${model.id}`}>
                          <TableCell>
                            <div>
                              <div className="font-medium text-sm">{model.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">{model.id}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm">{model.dimensions.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm font-mono">{formatCost(model.costPer1kTokens)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
