import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import type { GoldenDataset } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Database, Search, TrendingUp, BarChart3, Trophy, ArrowRight, Tag, Calendar, Users, Target, Layers, Sparkles, Filter, Plus, Loader2, Wand2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

const industryOptions = [
  { label: "All", value: "all" },
  { label: "Financial Services", value: "financial_services" },
  { label: "Healthcare", value: "healthcare" },
  { label: "Manufacturing", value: "manufacturing" },
  { label: "Retail", value: "retail" },
];

const industryLabels: Record<string, string> = {
  financial_services: "Financial Services",
  healthcare: "Healthcare",
  manufacturing: "Manufacturing",
  retail: "Retail",
};

const scenarioCategoryColors: Record<string, string> = {
  happyPath: "text-emerald-600 dark:text-emerald-400",
  edgeCases: "text-amber-600 dark:text-amber-400",
  adversarial: "text-purple-600 dark:text-purple-400",
  complianceCritical: "text-red-600 dark:text-red-400",
};

const scenarioCategoryLabels: Record<string, string> = {
  happyPath: "Happy Path",
  edgeCases: "Edge Case",
  adversarial: "Adversarial",
  complianceCritical: "Compliance",
};

const rankColors = [
  "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "bg-slate-300/20 text-slate-600 dark:text-slate-300 border-slate-400/30",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
];

export default function GoldenDatasetsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("browser");
  const [createOpen, setCreateOpen] = useState(false);
  const [aiGenerateOpen, setAiGenerateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIndustry, setNewIndustry] = useState("financial_services");
  const [newUseCase, setNewUseCase] = useState("");
  const [aiIndustry, setAiIndustry] = useState("financial_services");
  const [aiUseCase, setAiUseCase] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const { toast } = useToast();

  const { data: datasets = [], isLoading } = useQuery<GoldenDataset[]>({ queryKey: ["/api/golden-datasets"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/golden-datasets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets"] });
      toast({ title: "Dataset created" });
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      setNewUseCase("");
    },
  });

  const aiGenerateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ai/generate-golden-dataset", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets"] });
      toast({ title: "Dataset generated with AI test cases" });
      setAiGenerateOpen(false);
      setAiUseCase("");
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/golden-datasets/seed"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/golden-datasets"] });
      toast({ title: "Sample datasets loaded" });
    },
  });

  const filtered = useMemo(() => {
    return datasets.filter((d) => {
      if (searchQuery && !d.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (industryFilter !== "all" && d.industry !== industryFilter) return false;
      return true;
    });
  }, [datasets, searchQuery, industryFilter]);

  const stats = useMemo(() => {
    const totalDatasets = datasets.length;
    const totalTestCases = datasets.reduce((sum, d) => sum + (d.testCaseCount || 0), 0);
    const withCoverage = datasets.filter((d) => d.qualityCoverage !== null && d.qualityCoverage !== undefined);
    const avgCoverage = withCoverage.length > 0 ? withCoverage.reduce((sum, d) => sum + (d.qualityCoverage || 0), 0) / withCoverage.length : 0;
    const withBenchmark = datasets.filter((d) => d.benchmarkAvg !== null && d.benchmarkAvg !== undefined);
    const avgBenchmark = withBenchmark.length > 0 ? withBenchmark.reduce((sum, d) => sum + (d.benchmarkAvg || 0), 0) / withBenchmark.length : 0;
    return { totalDatasets, totalTestCases, avgCoverage, avgBenchmark };
  }, [datasets]);

  const leaderboard = useMemo(() => {
    return [...datasets].sort((a, b) => (b.benchmarkAvg || 0) - (a.benchmarkAvg || 0));
  }, [datasets]);

  const topContributors = useMemo(() => {
    const contributorMap = new Map<string, { name: string; count: number }>();
    datasets.forEach((d) => {
      const contribs = d.contributors as Array<{ name?: string; org?: string; count?: number }> | null;
      if (Array.isArray(contribs)) {
        contribs.forEach((c) => {
          const name = c.name || c.org || "Unknown";
          const existing = contributorMap.get(name);
          if (existing) {
            existing.count += (c.count || 1);
          } else {
            contributorMap.set(name, { name, count: c.count || 1 });
          }
        });
      }
    });
    return Array.from(contributorMap.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [datasets]);

  const maxTestCaseCount = useMemo(() => {
    return Math.max(...datasets.map((d) => d.testCaseCount || 0), 1);
  }, [datasets]);

  if (isLoading) return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-golden-datasets-loading">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-golden-datasets">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <Database className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Golden Datasets</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">Industry-specific evaluation datasets & benchmarks</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Dialog open={aiGenerateOpen} onOpenChange={setAiGenerateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-ai-generate-dataset">
                <Sparkles className="w-4 h-4 mr-1.5" />
                AI Generate Dataset
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>AI Generate Dataset with Test Cases</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Industry</Label>
                  <Select value={aiIndustry} onValueChange={setAiIndustry}>
                    <SelectTrigger data-testid="select-ai-industry">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {industryOptions.filter(o => o.value !== "all").map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Use Case</Label>
                  <Input
                    placeholder="e.g., Customer Support Automation, Fraud Detection..."
                    value={aiUseCase}
                    onChange={(e) => setAiUseCase(e.target.value)}
                    data-testid="input-ai-usecase"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Number of Test Cases</Label>
                  <Select value={String(aiCount)} onValueChange={(v) => setAiCount(Number(v))}>
                    <SelectTrigger data-testid="select-ai-count">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 test cases</SelectItem>
                      <SelectItem value="5">5 test cases</SelectItem>
                      <SelectItem value="8">8 test cases</SelectItem>
                      <SelectItem value="10">10 test cases</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => aiGenerateMutation.mutate({ industry: aiIndustry, useCase: aiUseCase, count: aiCount })}
                  disabled={!aiUseCase.trim() || aiGenerateMutation.isPending}
                  data-testid="button-submit-ai-generate"
                >
                  {aiGenerateMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                  {aiGenerateMutation.isPending ? "Generating..." : "Generate Dataset"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-dataset">
                <Plus className="w-4 h-4 mr-1.5" />
                Create Dataset
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Golden Dataset</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="Dataset name..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    data-testid="input-create-name"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Describe the evaluation dataset..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    data-testid="input-create-description"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Industry</Label>
                  <Select value={newIndustry} onValueChange={setNewIndustry}>
                    <SelectTrigger data-testid="select-create-industry">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {industryOptions.filter(o => o.value !== "all").map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Use Case</Label>
                  <Input
                    placeholder="e.g., Customer Support, Risk Assessment..."
                    value={newUseCase}
                    onChange={(e) => setNewUseCase(e.target.value)}
                    data-testid="input-create-usecase"
                  />
                </div>
                <Button
                  onClick={() => createMutation.mutate({
                    name: newName,
                    description: newDescription,
                    industry: newIndustry,
                    useCase: newUseCase,
                    version: "1.0.0",
                    status: "active",
                  })}
                  disabled={!newName.trim() || !newUseCase.trim() || createMutation.isPending}
                  data-testid="button-submit-create"
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
                  {createMutation.isPending ? "Creating..." : "Create Dataset"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
        <TabsList className="h-auto gap-1 flex-wrap" data-testid="golden-datasets-tabs">
          <TabsTrigger value="browser" data-testid="tab-browser" className="gap-1.5">
            <Database className="w-3.5 h-3.5" />
            Dataset Browser
          </TabsTrigger>
          <TabsTrigger value="evolution" data-testid="tab-evolution" className="gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Evolution Dashboard
          </TabsTrigger>
          <TabsTrigger value="leaderboard" data-testid="tab-leaderboard" className="gap-1.5">
            <Trophy className="w-3.5 h-3.5" />
            Benchmark Leaderboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browser" className="mt-0">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3 flex-wrap" data-testid="filter-bar">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search datasets..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-datasets"
                />
              </div>
              <Select value={industryFilter} onValueChange={setIndustryFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-industry-filter">
                  <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Industry" />
                </SelectTrigger>
                <SelectContent>
                  {industryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filtered.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
                  <Database className="w-10 h-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground" data-testid="text-empty-state">No datasets found</p>
                  {datasets.length === 0 && !searchQuery && industryFilter === "all" && (
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-xs text-muted-foreground">Get started by loading sample datasets or creating your own</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          onClick={() => seedMutation.mutate()}
                          disabled={seedMutation.isPending}
                          data-testid="button-load-samples"
                        >
                          {seedMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Database className="w-4 h-4 mr-1.5" />}
                          {seedMutation.isPending ? "Loading..." : "Load Sample Datasets"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setAiGenerateOpen(true)}
                          data-testid="button-empty-ai-generate"
                        >
                          <Sparkles className="w-4 h-4 mr-1.5" />
                          AI Generate Dataset
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((dataset) => {
                  const scenarios = dataset.scenarioCategories as Record<string, number> | null;
                  const coveragePercent = (dataset.qualityCoverage || 0) * 100;
                  return (
                    <Link key={dataset.id} href={`/golden-datasets/${dataset.id}`}>
                      <Card className="hover-elevate cursor-pointer" data-testid={`card-dataset-${dataset.id}`}>
                        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium truncate" data-testid={`text-dataset-name-${dataset.id}`}>
                            {dataset.name}
                          </CardTitle>
                          <Badge variant="outline" className="text-[10px] shrink-0" data-testid={`badge-version-${dataset.id}`}>
                            v{dataset.version}
                          </Badge>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                          <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-dataset-desc-${dataset.id}`}>
                            {dataset.description}
                          </p>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" data-testid={`badge-industry-${dataset.id}`}>
                              {industryLabels[dataset.industry] || dataset.industry}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" data-testid={`badge-usecase-${dataset.id}`}>
                              {dataset.useCase}
                            </Badge>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Layers className="w-3 h-3" />
                              <span data-testid={`text-test-count-${dataset.id}`}>{dataset.testCaseCount} test cases</span>
                            </div>
                            {scenarios && (
                              <div className="flex items-center gap-2 flex-wrap">
                                {Object.entries(scenarioCategoryLabels).map(([key, label]) => {
                                  const count = scenarios[key] || 0;
                                  if (count === 0) return null;
                                  return (
                                    <span key={key} className={`text-[10px] font-medium ${scenarioCategoryColors[key]}`}>
                                      {count} {label}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-muted-foreground">Quality Coverage</span>
                              <span className="text-[10px] font-medium" data-testid={`text-coverage-${dataset.id}`}>{coveragePercent.toFixed(0)}%</span>
                            </div>
                            <Progress value={coveragePercent} className="h-1.5" data-testid={`progress-coverage-${dataset.id}`} />
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Target className="w-3 h-3" />
                              <span data-testid={`text-benchmark-${dataset.id}`}>Benchmark: {((dataset.benchmarkAvg || 0) * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="w-3 h-3" />
                              <span data-testid={`text-contributors-${dataset.id}`}>{dataset.contributorCount}</span>
                            </div>
                          </div>

                          {dataset.tags && dataset.tags.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap" data-testid={`tags-${dataset.id}`}>
                              <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
                              {dataset.tags.map((tag) => (
                                <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-end">
                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="evolution" className="mt-0">
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="evolution-stats">
              <Card><CardContent className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Total Datasets</span>
                <span className="text-2xl font-semibold" data-testid="stat-total-datasets">{stats.totalDatasets}</span>
              </CardContent></Card>
              <Card><CardContent className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Total Test Cases</span>
                <span className="text-2xl font-semibold" data-testid="stat-total-test-cases">{stats.totalTestCases}</span>
              </CardContent></Card>
              <Card><CardContent className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Avg Quality Coverage</span>
                <span className="text-2xl font-semibold" data-testid="stat-avg-coverage">{(stats.avgCoverage * 100).toFixed(1)}%</span>
              </CardContent></Card>
              <Card><CardContent className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Avg Benchmark Score</span>
                <span className="text-2xl font-semibold" data-testid="stat-avg-benchmark">{(stats.avgBenchmark * 100).toFixed(1)}%</span>
              </CardContent></Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Dataset Sizes</CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px]">{datasets.length} datasets</Badge>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  {datasets.map((d) => (
                    <div key={d.id} className="flex items-center gap-3" data-testid={`growth-bar-${d.id}`}>
                      <span className="text-xs text-muted-foreground w-32 truncate shrink-0">{d.name}</span>
                      <div className="flex-1 h-5 rounded-md bg-muted/50 relative">
                        <div
                          className="h-full rounded-md bg-chart-2"
                          style={{ width: `${((d.testCaseCount || 0) / maxTestCaseCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium w-12 text-right shrink-0">{d.testCaseCount}</span>
                    </div>
                  ))}
                  {datasets.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">No datasets available</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Top Contributors</CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px]">{topContributors.length} contributors</Badge>
              </CardHeader>
              <CardContent>
                {topContributors.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No contributor data available</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {topContributors.map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border" data-testid={`contributor-${i}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-muted-foreground w-5 text-right">{i + 1}.</span>
                          <span className="text-sm font-medium">{c.name}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{c.count} contributions</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Trophy className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Benchmark Leaderboard</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px]">{leaderboard.length} datasets</Badge>
            </CardHeader>
            <CardContent>
              {leaderboard.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Trophy className="w-10 h-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No datasets to rank</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {leaderboard.map((dataset, i) => {
                    const rank = i + 1;
                    const rankColor = rank <= 3 ? rankColors[rank - 1] : "bg-muted/50 text-muted-foreground border-border";
                    return (
                      <Link key={dataset.id} href={`/golden-datasets/${dataset.id}`}>
                        <div className="flex items-center gap-3 p-3 rounded-md border border-border hover-elevate cursor-pointer" data-testid={`leaderboard-row-${dataset.id}`}>
                          <Badge variant="outline" className={`text-xs font-bold w-8 justify-center shrink-0 ${rankColor}`}>
                            {rank}
                          </Badge>
                          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <span className="text-sm font-medium truncate" data-testid={`leaderboard-name-${dataset.id}`}>{dataset.name}</span>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">{industryLabels[dataset.industry] || dataset.industry}</Badge>
                              <span className="text-xs text-muted-foreground">{dataset.testCaseCount} cases</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0 flex-wrap">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-xs text-muted-foreground">Benchmark</span>
                              <span className="text-sm font-semibold" data-testid={`leaderboard-benchmark-${dataset.id}`}>
                                {((dataset.benchmarkAvg || 0) * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-xs text-muted-foreground">Coverage</span>
                              <span className="text-sm font-medium" data-testid={`leaderboard-coverage-${dataset.id}`}>
                                {((dataset.qualityCoverage || 0) * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
