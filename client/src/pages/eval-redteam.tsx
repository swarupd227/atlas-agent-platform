import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, Bot, ChevronRight, ExternalLink, Filter, Play, RefreshCw,
  Shield, ShieldAlert, ShieldCheck, ShieldOff, Siren, Skull, Target, Zap,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AttackTemplate {
  id: string;
  category: string;
  severityHint: string;
  name: string;
  description: string | null;
  promptTemplate: string;
  industryTags: string[];
}

interface RedteamRun {
  id: string;
  agentId: string;
  status: string;
  categories: string[];
  probesPerCategory: number | null;
  totalProbes: number | null;
  completedProbes: number | null;
  vulnerabilitiesFound: number | null;
  postureScore: number | null;
  startedAt: string;
  completedAt: string | null;
}

interface RedteamResult {
  id: string;
  category: string;
  attackInput: string;
  agentResponse: string | null;
  vulnerabilityDetected: boolean | null;
  severity: string | null;
  reasoning: string | null;
  latencyMs: number | null;
}

interface Agent { id: string; name: string; }

const CATEGORY_META: Record<string, { label: string; icon: typeof Shield; color: string; description: string }> = {
  prompt_injection: { label: "Prompt Injection", icon: Zap, color: "text-yellow-600", description: "Attempts to override or hijack system instructions" },
  jailbreak: { label: "Jailbreaks", icon: ShieldOff, color: "text-red-600", description: "Techniques to bypass safety and content policies" },
  pii_extraction: { label: "PII Extraction", icon: Target, color: "text-purple-600", description: "Probes attempting to elicit private user data" },
  bias_probe: { label: "Bias Probes", icon: AlertTriangle, color: "text-orange-600", description: "Tests for discriminatory or biased decision-making" },
  harmful_content: { label: "Harmful Content", icon: Skull, color: "text-rose-600", description: "Requests for dangerous or policy-violating content" },
  role_violation: { label: "Role Violation", icon: Shield, color: "text-amber-600", description: "Attempts to make agent act outside its defined role" },
  indirect_injection: { label: "Indirect Injection", icon: Siren, color: "text-cyan-600", description: "Injections embedded in external data or documents" },
  misinformation: { label: "Misinformation", icon: ShieldAlert, color: "text-pink-600", description: "Requests to generate false authoritative claims" },
};

function severityColor(s: string | null) {
  if (s === "critical") return "bg-red-500/15 text-red-600 border-red-500/30";
  if (s === "high") return "bg-orange-500/15 text-orange-600 border-orange-500/30";
  if (s === "medium") return "bg-yellow-500/15 text-yellow-600 border-yellow-500/30";
  return "bg-blue-500/15 text-blue-600 border-blue-500/30";
}

function postureScoreColor(s: number | null) {
  if (s === null) return "text-muted-foreground";
  if (s >= 80) return "text-green-600";
  if (s >= 60) return "text-amber-600";
  return "text-red-600";
}

export default function EvalRedteam() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["prompt_injection", "jailbreak", "pii_extraction", "bias_probe"]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [probesPerCategory, setProbesPerCategory] = useState(5);
  const [severityThreshold, setSeverityThreshold] = useState("medium");
  const [attackModel, setAttackModel] = useState("claude-sonnet-4-5");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [tab, setTab] = useState("config");
  const [catFilter, setCatFilter] = useState<string>("all");

  const { data: agents = [] } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const { data: catalog } = useQuery<{ templates: AttackTemplate[]; grouped: Record<string, AttackTemplate[]> }>({
    queryKey: ["/api/eval/attack-templates"],
  });
  const { data: runs = [], isLoading: runsLoading } = useQuery<RedteamRun[]>({
    queryKey: ["/api/eval/redteam/runs"],
    refetchInterval: activeRunId ? 4000 : false,
  });

  const activeRunData = useQuery<{ run: RedteamRun; results: RedteamResult[] }>({
    queryKey: ["/api/eval/redteam/runs", activeRunId],
    queryFn: () => activeRunId ? apiRequest("GET", `/api/eval/redteam/runs/${activeRunId}`).then(r => r.json()) : Promise.resolve(null),
    enabled: !!activeRunId,
    refetchInterval: activeRunId ? 3000 : false,
  });

  const { data: posture = [] } = useQuery<any[]>({
    queryKey: ["/api/eval/redteam/posture"],
  });

  const startRun = useMutation({
    mutationFn: () => apiRequest("POST", "/api/eval/redteam/runs", {
      agentId: selectedAgent, categories: selectedCategories, probesPerCategory, severityThreshold, attackModel,
    }).then(r => r.json()),
    onSuccess: (run: RedteamRun) => {
      setActiveRunId(run.id);
      setTab("live");
      qc.invalidateQueries({ queryKey: ["/api/eval/redteam/runs"] });
      toast({ title: "Red team run started", description: `${run.totalProbes} probes queued` });
    },
    onError: (e: any) => toast({ title: "Failed to start run", description: e.message, variant: "destructive" }),
  });

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const allCategories = Object.keys(CATEGORY_META);
  const grouped = catalog?.grouped ?? {};
  const templates = catalog?.templates ?? [];
  const activeRun = activeRunData.data?.run;
  const results = activeRunData.data?.results ?? [];
  const progress = activeRun ? ((activeRun.completedProbes ?? 0) / Math.max(activeRun.totalProbes ?? 1, 1)) * 100 : 0;

  const filteredResults = catFilter === "all" ? results : results.filter(r => r.category === catFilter);
  const vulnResults = results.filter(r => r.vulnerabilityDetected);

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden" data-testid="page-eval-redteam">
      {/* Left Rail — Attack Catalog */}
      <div className="w-64 border-r flex flex-col shrink-0 bg-muted/10" data-testid="rail-attack-catalog">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="w-4 h-4 text-primary" />
            Attack Catalog
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{templates.length} templates</p>
        </div>
        <ScrollArea className="flex-1">
          <Accordion type="multiple" defaultValue={["prompt_injection", "jailbreak"]} className="px-2 py-2">
            {allCategories.map(cat => {
              const meta = CATEGORY_META[cat];
              const catTemplates = grouped[cat] ?? [];
              const Icon = meta.icon;
              const isSelected = selectedCategories.includes(cat);
              return (
                <AccordionItem key={cat} value={cat} className="border-b-0 mb-1">
                  <AccordionTrigger className="py-2 px-2 hover:no-underline rounded-md hover:bg-muted/50 text-xs font-medium" data-testid={`accordion-cat-${cat}`}>
                    <div className="flex items-center gap-2 w-full mr-2">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleCategory(cat)} onClick={e => e.stopPropagation()} className="shrink-0" data-testid={`check-cat-${cat}`} />
                      <Icon className={`w-3.5 h-3.5 ${meta.color} shrink-0`} />
                      <span className="flex-1 text-left truncate">{meta.label}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{catTemplates.length}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-1">
                    <div className="pl-7 flex flex-col gap-0.5">
                      {catTemplates.slice(0, 5).map(t => (
                        <div key={t.id} className="text-[11px] text-muted-foreground py-0.5 flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.severityHint === "critical" ? "bg-red-500" : t.severityHint === "high" ? "bg-orange-500" : "bg-yellow-500"}`} />
                          <span className="truncate">{t.name}</span>
                        </div>
                      ))}
                      {catTemplates.length > 5 && <p className="text-[10px] text-muted-foreground/60 pl-3.5">+{catTemplates.length - 5} more</p>}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {/* Industry packs */}
          <div className="px-3 pb-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Industry Packs</p>
            {["healthcare", "finance", "insurance"].map(ind => {
              const count = templates.filter(t => t.industryTags?.includes(ind)).length;
              return (
                <div key={ind} className="flex items-center justify-between py-1.5 px-1 text-xs" data-testid={`row-industry-${ind}`}>
                  <span className="capitalize text-muted-foreground">{ind}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5">{count}</Badge>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/evals"><span className="hover:text-foreground cursor-pointer">Evals</span></Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground font-medium flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-primary" /> Red Team Console</span>
          </div>
          <div className="flex items-center gap-2">
            {activeRun && activeRun.status === "running" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {activeRun.completedProbes ?? 0}/{activeRun.totalProbes ?? 0} probes
              </div>
            )}
            <Button
              size="sm"
              onClick={() => startRun.mutate()}
              disabled={!selectedAgent || selectedCategories.length === 0 || startRun.isPending}
              data-testid="button-start-redteam-run"
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              {startRun.isPending ? "Starting…" : "Start Run"}
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-4 w-fit shrink-0">
            <TabsTrigger value="config" data-testid="tab-config">Configuration</TabsTrigger>
            <TabsTrigger value="live" disabled={!activeRunId} data-testid="tab-live">
              Live Execution
              {activeRun?.status === "running" && <span className="ml-1.5 w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />}
            </TabsTrigger>
            <TabsTrigger value="report" disabled={!activeRunId} data-testid="tab-report">
              Vulnerability Report
              {vulnResults.length > 0 && <Badge variant="destructive" className="ml-1.5 text-[10px] px-1 py-0 h-4">{vulnResults.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="posture" data-testid="tab-posture">Posture Dashboard</TabsTrigger>
          </TabsList>

          {/* Configuration Tab */}
          <TabsContent value="config" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
              <Card data-testid="card-run-config">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Run Configuration</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Target Agent</Label>
                    <Select value={selectedAgent} onValueChange={setSelectedAgent} data-testid="select-target-agent">
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select agent…" /></SelectTrigger>
                      <SelectContent>
                        {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs text-muted-foreground">Probes per Category: {probesPerCategory}</Label>
                    <Slider min={1} max={20} step={1} value={[probesPerCategory]} onValueChange={([v]) => setProbesPerCategory(v)} data-testid="slider-probes-per-cat" />
                    <p className="text-[10px] text-muted-foreground">Total probes: {selectedCategories.length * probesPerCategory} (max 20/category)</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Severity Threshold</Label>
                    <Select value={severityThreshold} onValueChange={setSeverityThreshold} data-testid="select-severity-threshold">
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low — flag all vulnerabilities</SelectItem>
                        <SelectItem value="medium">Medium — flag medium+ only</SelectItem>
                        <SelectItem value="high">High — flag high/critical only</SelectItem>
                        <SelectItem value="critical">Critical — flag critical only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Attack Generation Model</Label>
                    <Select value={attackModel} onValueChange={setAttackModel} data-testid="select-attack-model">
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claude-sonnet-4-5">Claude Sonnet 4.5</SelectItem>
                        <SelectItem value="claude-opus-4-5">Claude Opus 4.5</SelectItem>
                        <SelectItem value="gpt-4.1">GPT-4.1</SelectItem>
                        <SelectItem value="gpt-4.1-mini">GPT-4.1 Mini</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-selected-categories">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Selected Attack Categories ({selectedCategories.length})</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {allCategories.map(cat => {
                    const meta = CATEGORY_META[cat];
                    const Icon = meta.icon;
                    const sel = selectedCategories.includes(cat);
                    return (
                      <div key={cat} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${sel ? "bg-primary/5 border-primary/30" : "border-transparent hover:bg-muted/30"}`} onClick={() => toggleCategory(cat)} data-testid={`row-cat-${cat}`}>
                        <Checkbox checked={sel} onCheckedChange={() => toggleCategory(cat)} onClick={e => e.stopPropagation()} />
                        <Icon className={`w-4 h-4 ${meta.color} shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{meta.label}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{meta.description}</p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] shrink-0">{(grouped[cat] ?? []).length}</Badge>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            {/* Recent runs */}
            <div className="mt-6 max-w-2xl">
              <h3 className="text-sm font-medium mb-3">Recent Runs</h3>
              {runsLoading ? <Skeleton className="h-20 w-full" /> : runs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No runs yet. Configure and start your first red team run above.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {runs.slice(0, 5).map(run => {
                    const agent = agents.find(a => a.id === run.agentId);
                    return (
                      <div key={run.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/20 ${activeRunId === run.id ? "border-primary/40 bg-primary/5" : ""}`} onClick={() => { setActiveRunId(run.id); setTab("live"); }} data-testid={`row-run-${run.id}`}>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${run.status === "running" ? "bg-green-500 animate-pulse" : run.status === "completed" ? "bg-blue-500" : "bg-red-500"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{agent?.name ?? run.agentId}</p>
                          <p className="text-[10px] text-muted-foreground">{run.categories?.join(", ") ?? ""} · {new Date(run.startedAt).toLocaleString()}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-xs font-semibold ${postureScoreColor(run.postureScore)}`}>{run.postureScore != null ? `${run.postureScore}/100` : "—"}</p>
                          <p className="text-[10px] text-muted-foreground">{run.vulnerabilitiesFound ?? 0} vulns</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${run.status === "running" ? "text-green-600 border-green-500/30" : run.status === "completed" ? "text-blue-600 border-blue-500/30" : "text-red-600 border-red-500/30"}`}>{run.status}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Live Execution Tab */}
          <TabsContent value="live" className="flex-1 overflow-hidden flex flex-col px-6 pb-6 mt-4">
            {!activeRunId ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <ShieldAlert className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <p className="text-sm font-medium text-muted-foreground">No active run</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Start a run from the Configuration tab</p>
              </div>
            ) : (
              <>
                {/* Run progress header */}
                {activeRun && (
                  <div className="mb-4 flex flex-col gap-2 shrink-0">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${activeRun.status === "running" ? "bg-green-500 animate-pulse" : activeRun.status === "completed" ? "bg-blue-500" : "bg-red-500"}`} />
                        <span className="font-medium capitalize">{activeRun.status}</span>
                        <span className="text-muted-foreground">— {activeRun.completedProbes ?? 0}/{activeRun.totalProbes ?? 0} probes</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="text-red-600 font-semibold">{activeRun.vulnerabilitiesFound ?? 0} vulnerabilities found</span>
                        {activeRun.postureScore != null && (
                          <span className={`font-semibold ${postureScoreColor(activeRun.postureScore)}`}>Score: {activeRun.postureScore}/100</span>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => qc.invalidateQueries({ queryKey: ["/api/eval/redteam/runs", activeRunId] })} data-testid="button-refresh-results">
                          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
                        </Button>
                      </div>
                    </div>
                    <Progress value={progress} className="h-1.5" data-testid="progress-run" />
                  </div>
                )}

                {/* Filter */}
                <div className="flex items-center gap-2 mb-3 shrink-0">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  <Select value={catFilter} onValueChange={setCatFilter} data-testid="select-cat-filter">
                    <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {Object.entries(CATEGORY_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">{filteredResults.length} results</span>
                </div>

                {/* Results table */}
                <div className="flex-1 overflow-y-auto rounded-lg border">
                  {filteredResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-center">
                      {activeRun?.status === "running" ? (
                        <>
                          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
                          <p className="text-xs text-muted-foreground">Running probes…</p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">No results yet</p>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Table header */}
                      <div className="grid grid-cols-[120px_1fr_1fr_80px_80px] gap-3 px-4 py-2 border-b bg-muted/20 text-xs font-medium text-muted-foreground sticky top-0">
                        <span>Category</span>
                        <span>Attack Input</span>
                        <span>Agent Response</span>
                        <span className="text-center">Vulnerable</span>
                        <span className="text-center">Severity</span>
                      </div>
                      <div className="divide-y">
                        {filteredResults.map(r => (
                          <div key={r.id} className={`grid grid-cols-[120px_1fr_1fr_80px_80px] gap-3 px-4 py-2.5 items-start text-xs ${r.vulnerabilityDetected ? "bg-red-500/5" : ""}`} data-testid={`row-result-${r.id}`}>
                            <div>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">{r.category.replace(/_/g, " ")}</Badge>
                            </div>
                            <div className="text-muted-foreground line-clamp-2 leading-relaxed">{r.attackInput}</div>
                            <div className="text-muted-foreground line-clamp-2 leading-relaxed">{r.agentResponse ?? "—"}</div>
                            <div className="flex justify-center">
                              {r.vulnerabilityDetected
                                ? <ShieldOff className="w-4 h-4 text-red-500" />
                                : <ShieldCheck className="w-4 h-4 text-green-500" />}
                            </div>
                            <div className="flex justify-center">
                              {r.severity
                                ? <Badge variant="outline" className={`${severityColor(r.severity)} text-[10px] px-1.5 py-0`}>{r.severity}</Badge>
                                : <span className="text-muted-foreground/50">—</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* Vulnerability Report Tab */}
          <TabsContent value="report" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
            {vulnResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <ShieldCheck className="w-10 h-10 text-green-500/50 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No vulnerabilities found</p>
                <p className="text-xs text-muted-foreground/70">The agent passed all attack probes in the current run</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold">{vulnResults.length} Vulnerabilities Detected</h3>
                  {activeRun?.postureScore != null && (
                    <span className={`text-sm font-bold ${postureScoreColor(activeRun.postureScore)}`}>Posture Score: {activeRun.postureScore}/100</span>
                  )}
                </div>
                {["critical", "high", "medium", "low"].map(sev => {
                  const sevVulns = vulnResults.filter(r => r.severity === sev);
                  if (sevVulns.length === 0) return null;
                  return (
                    <div key={sev} data-testid={`section-vuln-${sev}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className={`${severityColor(sev)} text-xs capitalize`}>{sev}</Badge>
                        <span className="text-xs text-muted-foreground">{sevVulns.length} finding{sevVulns.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {sevVulns.map(r => (
                          <div key={r.id} className="rounded-lg border p-4 bg-muted/10" data-testid={`vuln-${r.id}`}>
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px] capitalize">{r.category.replace(/_/g, " ")}</Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">{r.latencyMs != null ? `${r.latencyMs}ms` : ""}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div>
                                <p className="text-muted-foreground font-medium mb-1">Attack Input</p>
                                <p className="text-foreground line-clamp-3 leading-relaxed">{r.attackInput}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground font-medium mb-1">Agent Response</p>
                                <p className="text-foreground line-clamp-3 leading-relaxed">{r.agentResponse ?? "—"}</p>
                              </div>
                            </div>
                            {r.reasoning && (
                              <div className="mt-2 pt-2 border-t text-xs">
                                <span className="text-muted-foreground font-medium">Reasoning: </span>
                                <span className="text-muted-foreground/80">{r.reasoning}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Posture Dashboard Tab */}
          <TabsContent value="posture" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
            {posture.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <Shield className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No posture data yet</p>
                <p className="text-xs text-muted-foreground/70">Complete a red team run to see your security posture</p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Posture score tiles */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {posture.slice(-4).map((p, i) => {
                    const agent = agents.find(a => a.id === p.agentId);
                    return (
                      <Card key={i} data-testid={`tile-posture-${p.runId}`}>
                        <CardContent className="pt-4 pb-4 text-center">
                          <p className="text-xs text-muted-foreground mb-1 truncate">{agent?.name ?? p.agentId}</p>
                          <p className={`text-3xl font-bold ${postureScoreColor(p.postureScore)}`}>{p.postureScore}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Posture score</p>
                          <p className="text-xs text-red-600 mt-1 font-medium">{p.vulnerabilitiesFound} vulns</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Vulnerability breakdown by category */}
                <Card data-testid="card-vuln-breakdown">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Vulnerability Breakdown by Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {posture.slice(-1).map((p, _i) => (
                      <div key={p.runId} className="flex flex-col gap-3">
                        {Object.entries(CATEGORY_META).map(([cat, meta]) => {
                          const count = p.byCat?.[cat] ?? 0;
                          const Icon = meta.icon;
                          return (
                            <div key={cat} className="flex items-center gap-3" data-testid={`row-breakdown-${cat}`}>
                              <Icon className={`w-4 h-4 ${meta.color} shrink-0`} />
                              <span className="text-xs w-36 truncate">{meta.label}</span>
                              <div className="flex-1">
                                <Progress value={count > 0 ? Math.min(count * 20, 100) : 0} className="h-1.5" />
                              </div>
                              <span className="text-xs tabular-nums w-8 text-right font-medium">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Historical posture trend */}
                {posture.length > 1 && (
                  <Card data-testid="card-posture-trend">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">Posture Score Trend</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-20">
                        <svg viewBox={`0 0 400 64`} className="w-full h-full" preserveAspectRatio="none">
                          {(() => {
                            const scores = posture.map(p => p.postureScore ?? 50);
                            const pts = scores.map((s, i) => {
                              const x = (i / (scores.length - 1)) * 390 + 5;
                              const y = (1 - s / 100) * 54 + 5;
                              return `${x},${y}`;
                            }).join(" ");
                            return (
                              <>
                                <line x1="5" y1={5 + 54 * 0.2} x2="395" y2={5 + 54 * 0.2} stroke="#22c55e" strokeWidth={0.5} strokeDasharray="3 2" opacity={0.5} />
                                <polyline points={pts} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" />
                              </>
                            );
                          })()}
                        </svg>
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                        <span>Oldest run</span>
                        <span className="text-green-500">— 80 target</span>
                        <span>Latest run</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
