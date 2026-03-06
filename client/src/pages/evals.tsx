import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { EvalSuite, EvalRun, Agent, GoldenDataset, OntologyConcept } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FlaskConical, Search, TrendingUp, TrendingDown, Bot, BookOpen,
  ArrowRight, Calendar, Tag, BarChart3, AlertTriangle, CheckCircle,
  Clock, Loader2, Shield, ShieldAlert, Bug, Play, Factory, DollarSign, Lock, Brain,
} from "lucide-react";
import {
  industryLabels, kpiDimensions, regulatoryTemplates, industryScorers,
  computeRegressionImpact, getIndustryFromTags, type IndustryId,
} from "@/lib/industry-assurance";

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function generateSparklineData(passRate: number | null, id: string): number[] {
  if (passRate === null) return [];
  const seed = hashCode(id);
  return Array.from({ length: 5 }, (_, i) => {
    const variance = ((((seed * (i + 1) * 7) % 100) - 50) / 500);
    return Math.max(0, Math.min(1, passRate + variance));
  });
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) {
    return (
      <svg width={80} height={24} data-testid="sparkline-empty">
        {Array.from({ length: 5 }).map((_, i) => (
          <circle key={i} cx={10 + i * 15} cy={12} r={2} fill="currentColor" opacity={0.2} />
        ))}
      </svg>
    );
  }
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 76 + 2;
    const y = (1 - v) * 20 + 2;
    return `${x},${y}`;
  }).join(" ");
  const trending = data[data.length - 1] >= data[0];
  return (
    <svg width={80} height={24} data-testid="sparkline">
      <polyline
        points={points}
        fill="none"
        stroke={trending ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

const coverageTagColors: Record<string, string> = {
  safety: "border-red-500/40 text-red-600 dark:text-red-400",
  compliance: "border-blue-500/40 text-blue-600 dark:text-blue-400",
  "edge-cases": "border-amber-500/40 text-amber-600 dark:text-amber-400",
  adversarial: "border-purple-500/40 text-purple-600 dark:text-purple-400",
};

const typeColors: Record<string, string> = {
  regression: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  smoke: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  benchmark: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  adversarial: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20",
};

const coverageCategories = [
  { key: "safety", label: "Safety", icon: ShieldAlert, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", tags: ["safety", "prompt-injection", "jailbreak", "pii-extraction", "pii_extraction"] },
  { key: "compliance", label: "Compliance", icon: Shield, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", tags: ["compliance", "policy", "regulatory", "gdpr", "soc2"] },
  { key: "edge-cases", label: "Edge Cases", icon: Bug, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", tags: ["edge-cases", "edge_cases", "boundary", "corner-case", "error-handling"] },
  { key: "adversarial", label: "Adversarial", icon: AlertTriangle, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20", tags: ["adversarial", "red-team", "red_team", "attack", "security"] },
];

function formatDate(date: string | Date | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTimeAgo(date: string | Date | null) {
  if (!date) return "Unknown";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Evals() {
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [ontologyDomainFilter, setOntologyDomainFilter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const { data: suites, isLoading: suitesLoading } = useQuery<EvalSuite[]>({ queryKey: ["/api/eval-suites"] });
  const { data: agents, isLoading: agentsLoading } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const { data: allRuns } = useQuery<EvalRun[]>({ queryKey: ["/api/eval-runs"] });
  const { data: goldenDatasets } = useQuery<GoldenDataset[]>({ queryKey: ["/api/golden-datasets"] });
  const { data: ontologyConcepts } = useQuery<OntologyConcept[]>({ queryKey: ["/api/ontology-concepts/all"] });
  const isLoading = suitesLoading || agentsLoading;

  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    agents?.forEach((a) => m.set(a.id, a.name));
    return m;
  }, [agents]);

  const suiteMap = useMemo(() => {
    const m = new Map<string, EvalSuite>();
    suites?.forEach((s) => m.set(s.id, s));
    return m;
  }, [suites]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    suites?.forEach((suite) => suite.coverageTags?.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [suites]);

  const ontologyDomains = useMemo(() => {
    if (!ontologyConcepts) return [];
    const s = new Set<string>();
    ontologyConcepts.forEach((c) => { if (c.industryId) s.add(c.industryId); });
    return Array.from(s).sort();
  }, [ontologyConcepts]);

  const agentOntologyDomains = useMemo(() => {
    const m = new Map<string, Set<string>>();
    agents?.forEach((a) => {
      const tags = (a.ontologyTags as Array<{ conceptId: string; label: string; category?: string }>) || [];
      if (tags.length > 0 && ontologyConcepts) {
        const conceptIds = new Set(tags.map(t => t.conceptId));
        const domains = new Set<string>();
        ontologyConcepts.forEach(c => { if (conceptIds.has(c.id) && c.industryId) domains.add(c.industryId); });
        m.set(a.id, domains);
      }
    });
    return m;
  }, [agents, ontologyConcepts]);

  const suiteOntologyDomains = useMemo(() => {
    const m = new Map<string, Set<string>>();
    suites?.forEach(s => {
      const tags = (s.ontologyTags as Array<{ conceptId: string; label: string }>) || [];
      if (tags.length > 0 && ontologyConcepts) {
        const conceptIds = new Set(tags.map(t => t.conceptId));
        const domains = new Set<string>();
        ontologyConcepts.forEach(c => { if (conceptIds.has(c.id) && c.industryId) domains.add(c.industryId); });
        m.set(s.id, domains);
      }
    });
    return m;
  }, [suites, ontologyConcepts]);

  const filtered = useMemo(() => {
    if (!suites) return [];
    return suites.filter((s) => {
      if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (tagFilter && !(s.coverageTags || []).includes(tagFilter)) return false;
      if (ontologyDomainFilter) {
        const suiteDomains = suiteOntologyDomains.get(s.id);
        const agentDomains = s.agentId ? agentOntologyDomains.get(s.agentId) : undefined;
        const hasSuiteDomain = suiteDomains?.has(ontologyDomainFilter);
        const hasAgentDomain = agentDomains?.has(ontologyDomainFilter);
        if (!hasSuiteDomain && !hasAgentDomain) return false;
      }
      return true;
    });
  }, [suites, searchQuery, tagFilter, ontologyDomainFilter, agentOntologyDomains, suiteOntologyDomains]);

  const grouped = useMemo(() => {
    const groups = new Map<string, EvalSuite[]>();
    filtered.forEach((s) => {
      const key = s.agentId || "__unassigned__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    });
    return groups;
  }, [filtered]);

  const stats = useMemo(() => {
    if (!suites) return { total: 0, agentCount: 0, avgPass: 0, needsAttention: 0 };
    const agentIds = new Set(suites.map((s) => s.agentId).filter(Boolean));
    const withRate = suites.filter((s) => s.passRate !== null);
    const avg = withRate.length > 0 ? withRate.reduce((a, s) => a + (s.passRate || 0), 0) / withRate.length : 0;
    const attention = suites.filter((s) => s.passRate !== null && s.passRate < 0.8).length;
    return { total: suites.length, agentCount: agentIds.size, avgPass: avg, needsAttention: attention };
  }, [suites]);

  const pendingRuns = useMemo(() => {
    if (!allRuns) return [];
    return allRuns
      .filter((r) => r.status === "running" || r.status === "pending" || r.status === "queued")
      .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime());
  }, [allRuns]);

  const recentRegressions = useMemo(() => {
    if (!allRuns || !suites) return [];
    const suiteRunMap = new Map<string, EvalRun[]>();
    allRuns.forEach((r) => {
      if (!suiteRunMap.has(r.suiteId)) suiteRunMap.set(r.suiteId, []);
      suiteRunMap.get(r.suiteId)!.push(r);
    });

    const regressions: Array<{
      suite: EvalSuite;
      prevRate: number;
      currentRate: number;
      delta: number;
      latestRun: EvalRun;
    }> = [];

    suiteRunMap.forEach((runs, suiteId) => {
      const suite = suiteMap.get(suiteId);
      if (!suite) return;
      const sorted = [...runs]
        .filter((r) => r.status === "completed" && r.passRate !== null)
        .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime());
      if (sorted.length < 2) return;
      const current = sorted[0].passRate || 0;
      const prev = sorted[1].passRate || 0;
      const delta = current - prev;
      if (delta < -0.02) {
        regressions.push({ suite, prevRate: prev, currentRate: current, delta, latestRun: sorted[0] });
      }
    });

    return regressions.sort((a, b) => a.delta - b.delta).slice(0, 10);
  }, [allRuns, suites, suiteMap]);

  const coverageData = useMemo(() => {
    if (!suites) return coverageCategories.map((c) => ({ ...c, count: 0, total: 0, percentage: 0, suiteNames: [] as string[] }));
    return coverageCategories.map((cat) => {
      const matchingSuites = suites.filter((s) =>
        (s.coverageTags || []).some((tag) => cat.tags.some((ct) => tag.toLowerCase().includes(ct)))
      );
      return {
        ...cat,
        count: matchingSuites.length,
        total: suites.length,
        percentage: suites.length > 0 ? Math.round((matchingSuites.length / suites.length) * 100) : 0,
        suiteNames: matchingSuites.map((s) => s.name),
      };
    });
  }, [suites]);

  const industryAssurance = useMemo(() => {
    if (!suites) return null;

    const industries = new Map<IndustryId, number>();
    suites.forEach((s) => {
      const ind = (s as any).industry as IndustryId | null;
      const fromTags = ind || getIndustryFromTags(s.coverageTags);
      if (fromTags) industries.set(fromTags, (industries.get(fromTags) || 0) + 1);
    });
    const primaryIndustry: IndustryId | null = industries.size > 0
      ? Array.from(industries.entries()).sort((a, b) => b[1] - a[1])[0][0]
      : null;

    const linkedDatasets = goldenDatasets?.filter((gd) => {
      return suites.some((s) => (s as any).goldenDatasetId === gd.id);
    }) || [];
    const totalDatasets = goldenDatasets?.length || 0;
    const linkedPct = totalDatasets > 0 ? Math.round((linkedDatasets.length / totalDatasets) * 100) : 0;

    const allTags = new Set<string>();
    suites.forEach((s) => (s.coverageTags || []).forEach((t) => allTags.add(t.toLowerCase())));

    const industryKpis = primaryIndustry ? kpiDimensions.filter((k) => k.industry === primaryIndustry) : [];
    const coveredKpis = industryKpis.filter((k) => {
      const kLower = k.label.toLowerCase().split(" ");
      return kLower.some((word) => {
        return Array.from(allTags).some((tag) => tag.includes(word));
      });
    });
    const uncoveredKpis = industryKpis.filter((k) => !coveredKpis.includes(k));
    const kpiCovPct = industryKpis.length > 0 ? Math.round((coveredKpis.length / industryKpis.length) * 100) : 0;

    const regulatoryTemplatesForIndustry = primaryIndustry
      ? regulatoryTemplates.filter((t) => t.industry === primaryIndustry)
      : [];
    const scorersForIndustry = primaryIndustry
      ? industryScorers.filter((s) => s.industry === primaryIndustry)
      : [];

    const customCount = suites.filter((s) => {
      const ind = (s as any).industry || getIndustryFromTags(s.coverageTags);
      return !ind;
    }).length;
    const customPct = suites.length > 0 ? Math.round((customCount / suites.length) * 100) : 0;

    const industryRegressions = recentRegressions.map((reg) => {
      const ind = (reg.suite as any).industry as IndustryId | null || getIndustryFromTags(reg.suite.coverageTags);
      const impact = ind ? computeRegressionImpact(
        reg.suite.name,
        reg.suite.coverageTags,
        reg.delta,
        ind,
        reg.suite.totalCases || 0
      ) : null;
      return { ...reg, industry: ind, impact };
    }).filter((r) => r.impact);

    return {
      primaryIndustry,
      industries,
      linkedDatasets,
      totalDatasets,
      linkedPct,
      kpiCovPct,
      coveredKpis,
      uncoveredKpis,
      regulatoryTemplatesForIndustry,
      scorersForIndustry,
      customPct,
      industryRegressions,
    };
  }, [suites, goldenDatasets, recentRegressions]);

  if (isLoading) return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-evals-loading">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-evals">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <FlaskConical className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Eval Studio</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">Evaluation suites, coverage & regression tracking</p>
          </div>
        </div>
        <Link href="/evals/replay">
          <Button variant="outline" size="sm" data-testid="button-shadow-replay">
            <Play className="w-3.5 h-3.5 mr-1.5" />
            Shadow Replay
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="stats-bar">
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Total Suites</span>
          <span className="text-2xl font-semibold" data-testid="stat-total-suites">{stats.total}</span>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Agents with Evals</span>
          <span className="text-2xl font-semibold" data-testid="stat-agent-count">{stats.agentCount}</span>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Avg Pass Rate</span>
          <span className="text-2xl font-semibold" data-testid="stat-avg-pass">{(stats.avgPass * 100).toFixed(1)}%</span>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            <span className="text-xs text-muted-foreground">Needs Attention</span>
          </div>
          <span className="text-2xl font-semibold" data-testid="stat-needs-attention">{stats.needsAttention}</span>
        </CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-4">
        <TabsList className="h-auto gap-1 flex-wrap" data-testid="evals-tabs">
          <TabsTrigger value="overview" data-testid="tab-overview" className="gap-1.5">
            <FlaskConical className="w-3.5 h-3.5" />
            Suites
          </TabsTrigger>
          <TabsTrigger value="backlog" data-testid="tab-backlog" className="gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Backlog
            {pendingRuns.length > 0 && (
              <Badge variant="outline" className="text-[10px] ml-1">{pendingRuns.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="regressions" data-testid="tab-regressions" className="gap-1.5">
            <TrendingDown className="w-3.5 h-3.5" />
            Regressions
            {recentRegressions.length > 0 && (
              <Badge variant="outline" className="text-[10px] ml-1 bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20">{recentRegressions.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="coverage" data-testid="tab-coverage" className="gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Coverage Map
          </TabsTrigger>
          <TabsTrigger value="industry-assurance" data-testid="tab-industry-assurance" className="gap-1.5">
            <Factory className="w-3.5 h-3.5" />
            Industry Assurance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3 flex-wrap" data-testid="filter-bar">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search suites..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={tagFilter === null ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setTagFilter(null)}
                  data-testid="filter-tag-all"
                >
                  All
                </Badge>
                {allTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className={`cursor-pointer ${tagFilter === tag ? "ring-1 ring-ring" : ""} ${coverageTagColors[tag] || ""}`}
                    onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                    data-testid={`filter-tag-${tag}`}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              {ontologyDomains.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Brain className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  <span className="text-[11px] text-muted-foreground">Domain:</span>
                  <Badge
                    variant={ontologyDomainFilter === null ? "default" : "outline"}
                    className="cursor-pointer text-[10px]"
                    onClick={() => setOntologyDomainFilter(null)}
                    data-testid="filter-ontology-all"
                  >
                    All
                  </Badge>
                  {ontologyDomains.map((domain) => (
                    <Badge
                      key={domain}
                      variant="outline"
                      className={`cursor-pointer text-[10px] ${ontologyDomainFilter === domain ? "ring-1 ring-purple-400 text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700" : ""}`}
                      onClick={() => setOntologyDomainFilter(ontologyDomainFilter === domain ? null : domain)}
                      data-testid={`filter-ontology-${domain.replace(/[\/\s]/g, "-")}`}
                    >
                      {domain}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {industryAssurance && industryAssurance.primaryIndustry && (() => {
              const gapCount = filtered.filter(s => {
                const si = (s as any).industry as IndustryId | null || getIndustryFromTags(s.coverageTags);
                if (!si) return true;
                const scorers = industryScorers.filter(sc => sc.industry === si);
                const regs = regulatoryTemplates.filter(t => t.industry === si);
                const tags = (s.coverageTags || []).map(t => t.toLowerCase());
                const hasScorer = scorers.some(sc => tags.some(t => t.includes(sc.type.split("_")[0]) || sc.name.toLowerCase().split(" ").some(w => t.includes(w))));
                const hasRegCoverage = regs.some(r => tags.some(t => r.tags.some(rt => t.includes(rt))));
                return !hasScorer && !hasRegCoverage;
              }).length;
              const total = filtered.length;
              if (total === 0 || gapCount <= Math.floor(total * 0.5)) return null;
              return (
                <div className="flex items-start gap-2.5 p-3 rounded-md border border-amber-500/30 bg-amber-500/5" data-testid="banner-industry-assurance-gap">
                  <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium">{industryLabels[industryAssurance.primaryIndustry]} Assurance Gap</span>
                    <span className="text-[11px] text-muted-foreground">{gapCount} of {total} suites lack industry-specific test coverage — open suites with amber badges to see what's missing in the Industry Assurance tab</span>
                  </div>
                </div>
              );
            })()}

            {filtered.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                  <FlaskConical className="w-10 h-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground" data-testid="text-empty-state">No eval suites found</p>
                </CardContent>
              </Card>
            ) : (
              Array.from(grouped.entries()).map(([agentId, groupSuites]) => (
                <div key={agentId} className="flex flex-col gap-3" data-testid={`agent-group-${agentId}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Bot className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-sm font-medium" data-testid={`text-agent-name-${agentId}`}>
                      {agentId === "__unassigned__" ? "Unassigned" : agentMap.get(agentId) || agentId}
                    </h2>
                    <Badge variant="outline" className="text-[10px]">{groupSuites.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupSuites.map((suite) => {
                      const sparkData = generateSparklineData(suite.passRate, suite.id);
                      const delta = sparkData.length >= 2
                        ? ((sparkData[sparkData.length - 1] - sparkData[sparkData.length - 2]) * 100)
                        : null;
                      const suiteIndustry = (suite as any).industry as IndustryId | null || getIndustryFromTags(suite.coverageTags);
                      const suiteIndustryReady = (() => {
                        if (!suiteIndustry) return null;
                        const scorers = industryScorers.filter(s => s.industry === suiteIndustry);
                        const regs = regulatoryTemplates.filter(t => t.industry === suiteIndustry);
                        const tags = (suite.coverageTags || []).map(t => t.toLowerCase());
                        const hasScorer = scorers.some(s => tags.some(t => t.includes(s.type.split("_")[0]) || s.name.toLowerCase().split(" ").some(w => t.includes(w))));
                        const hasRegCoverage = regs.some(r => tags.some(t => r.tags.some(rt => t.includes(rt))));
                        return hasScorer || hasRegCoverage ? "ready" : "gap";
                      })();
                      return (
                        <Link key={suite.id} href={`/evals/${suite.id}`}>
                          <Card className="hover-elevate cursor-pointer" data-testid={`card-eval-suite-${suite.id}`}>
                            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                              <CardTitle className="text-sm font-medium truncate" data-testid={`text-suite-name-${suite.id}`}>
                                {suite.name}
                              </CardTitle>
                              <div className="flex items-center gap-1 shrink-0">
                                {suiteIndustryReady === "ready" && (
                                  <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-600 dark:text-green-400" data-testid={`badge-industry-ready-${suite.id}`}>
                                    <CheckCircle className="w-2.5 h-2.5 mr-0.5" />{industryLabels[suiteIndustry!]}
                                  </Badge>
                                )}
                                {suiteIndustryReady === "gap" && (
                                  <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-600 dark:text-amber-400" data-testid={`badge-industry-gap-${suite.id}`}>
                                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />{industryLabels[suiteIndustry!]}
                                  </Badge>
                                )}
                                {suite.type && (
                                  <Badge variant="outline" className={`text-[10px] shrink-0 ${typeColors[suite.type] || ""}`} data-testid={`badge-suite-type-${suite.id}`}>
                                    {suite.type}
                                  </Badge>
                                )}
                                {(() => {
                                  const agentForSuite = agents?.find(a => a.id === suite.agentId);
                                  const agentTags = (agentForSuite?.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>) || [];
                                  if (agentTags.length === 0) return null;
                                  return (
                                    <Badge variant="outline" className="text-[9px] border-purple-400/40 text-purple-600 dark:text-purple-400" data-testid={`badge-ontology-scorer-${suite.id}`}>
                                      <BookOpen className="w-2.5 h-2.5 mr-0.5" />Ontology
                                    </Badge>
                                  );
                                })()}
                              </div>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-3">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <Sparkline data={sparkData} />
                                  {suite.passRate !== null && (
                                    <span className="text-sm font-medium" data-testid={`text-pass-rate-${suite.id}`}>
                                      {(suite.passRate * 100).toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                                {delta !== null && (
                                  <div className={`flex items-center gap-0.5 text-xs font-medium ${delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`} data-testid={`text-delta-${suite.id}`}>
                                    {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
                                  </div>
                                )}
                              </div>
                              {suite.coverageTags && suite.coverageTags.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap" data-testid={`coverage-tags-${suite.id}`}>
                                  <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
                                  {suite.coverageTags.map((tag) => (
                                    <Badge key={tag} variant="outline" className={`text-[10px] ${coverageTagColors[tag] || ""}`} data-testid={`badge-tag-${tag}-${suite.id}`}>
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {(() => {
                                const sTags = (suite.ontologyTags as Array<{ conceptId: string; label: string }>) || [];
                                return sTags.length > 0 ? (
                                  <div className="flex items-center gap-1 flex-wrap" data-testid={`ontology-tags-${suite.id}`}>
                                    <Brain className="w-3 h-3 text-purple-500 shrink-0" />
                                    {sTags.slice(0, 3).map((t, i) => (
                                      <Badge key={i} variant="outline" className="text-[9px] text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700">
                                        {t.label}
                                      </Badge>
                                    ))}
                                    {sTags.length > 3 && <span className="text-[9px] text-muted-foreground">+{sTags.length - 3}</span>}
                                  </div>
                                ) : null;
                              })()}
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex flex-col gap-1">
                                  {suite.totalCases !== null && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <BarChart3 className="w-3 h-3" />
                                      <span data-testid={`text-total-cases-${suite.id}`}>{suite.totalCases} cases</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Calendar className="w-3 h-3" />
                                    <span data-testid={`text-last-run-${suite.id}`}>
                                      {suite.lastRunAt ? formatDate(suite.lastRunAt) : "No runs yet"}
                                    </span>
                                  </div>
                                </div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="backlog" className="mt-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Pending Eval Runs</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px]">{pendingRuns.length} active</Badge>
            </CardHeader>
            <CardContent>
              {pendingRuns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <CheckCircle className="w-10 h-10 text-emerald-500/50" />
                  <p className="text-sm text-muted-foreground" data-testid="text-backlog-empty">All eval runs complete. No pending work.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {pendingRuns.map((run) => {
                    const suite = suiteMap.get(run.suiteId);
                    const agentName = run.agentId ? agentMap.get(run.agentId) : null;
                    const statusColor = run.status === "running"
                      ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20";
                    return (
                      <div key={run.id} className="flex items-center gap-3 p-3 rounded-md border border-border" data-testid={`backlog-run-${run.id}`}>
                        <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-primary/10">
                          {run.status === "running" ? (
                            <Loader2 className="w-4 h-4 text-primary animate-spin" />
                          ) : (
                            <Clock className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link href={`/evals/${run.suiteId}`}>
                              <span className="text-sm font-medium hover:underline cursor-pointer" data-testid={`text-backlog-suite-${run.id}`}>
                                {suite?.name || run.suiteId}
                              </span>
                            </Link>
                            <Badge variant="outline" className={`text-[10px] ${statusColor}`}>{run.status}</Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            {agentName && (
                              <span className="flex items-center gap-1">
                                <Bot className="w-3 h-3" /> {agentName}
                              </span>
                            )}
                            {run.environment && (
                              <Badge variant="outline" className="text-[9px]">{run.environment}</Badge>
                            )}
                            <span>{run.totalCases || 0} cases</span>
                            <span>{formatTimeAgo(run.startedAt)}</span>
                          </div>
                        </div>
                        {run.status === "running" && run.passedCases !== null && run.totalCases !== null && run.totalCases > 0 && (
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-xs text-muted-foreground">{run.passedCases}/{run.totalCases}</span>
                            <Progress value={(run.passedCases / run.totalCases) * 100} className="w-24 h-1.5" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regressions" className="mt-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <CardTitle className="text-sm font-medium">Recent Regressions</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20">
                {recentRegressions.length} detected
              </Badge>
            </CardHeader>
            <CardContent>
              {recentRegressions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <CheckCircle className="w-10 h-10 text-emerald-500/50" />
                  <p className="text-sm text-muted-foreground" data-testid="text-no-regressions">No regressions detected. All suites are stable or improving.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {recentRegressions.map((reg) => {
                    const agentName = reg.suite.agentId ? agentMap.get(reg.suite.agentId) : null;
                    return (
                      <Link key={reg.suite.id} href={`/evals/${reg.suite.id}`}>
                        <div className="flex items-center gap-3 p-3 rounded-md border border-red-500/20 bg-red-500/5 hover-elevate cursor-pointer" data-testid={`regression-${reg.suite.id}`}>
                          <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-red-500/10">
                            <TrendingDown className="w-4 h-4 text-red-500" />
                          </div>
                          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium" data-testid={`text-regression-suite-${reg.suite.id}`}>
                                {reg.suite.name}
                              </span>
                              {reg.suite.type && (
                                <Badge variant="outline" className={`text-[10px] ${typeColors[reg.suite.type] || ""}`}>{reg.suite.type}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              {agentName && (
                                <span className="flex items-center gap-1">
                                  <Bot className="w-3 h-3" /> {agentName}
                                </span>
                              )}
                              <span>{formatTimeAgo(reg.latestRun.startedAt)}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            <span className="text-sm font-bold text-red-600 dark:text-red-400" data-testid={`text-regression-delta-${reg.suite.id}`}>
                              {(reg.delta * 100).toFixed(1)}%
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {(reg.prevRate * 100).toFixed(1)}% → {(reg.currentRate * 100).toFixed(1)}%
                            </span>
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

        <TabsContent value="coverage" className="mt-0">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Coverage Map</CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {coverageData.filter((c) => c.count > 0).length}/{coverageData.length} categories covered
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {coverageData.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <div key={cat.key} className={`flex flex-col gap-3 p-4 rounded-md border ${cat.count > 0 ? cat.border : "border-border"}`} data-testid={`coverage-card-${cat.key}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${cat.count > 0 ? cat.bg : "bg-muted"}`}>
                              <Icon className={`w-4 h-4 ${cat.count > 0 ? cat.color : "text-muted-foreground"}`} />
                            </div>
                            <div className="flex flex-col gap-0">
                              <span className="text-sm font-medium">{cat.label}</span>
                              <span className="text-[10px] text-muted-foreground">{cat.count} of {cat.total} suites</span>
                            </div>
                          </div>
                          <span className={`text-lg font-bold ${cat.count > 0 ? cat.color : "text-muted-foreground"}`} data-testid={`text-coverage-pct-${cat.key}`}>
                            {cat.percentage}%
                          </span>
                        </div>
                        <Progress
                          value={cat.percentage}
                          className={`h-2 ${cat.count > 0 ? `[&>div]:${cat.bg.replace("/10", "")}` : ""}`}
                        />
                        {cat.suiteNames.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {cat.suiteNames.slice(0, 4).map((name) => (
                              <Badge key={name} variant="outline" className="text-[9px]">{name}</Badge>
                            ))}
                            {cat.suiteNames.length > 4 && (
                              <Badge variant="outline" className="text-[9px]">+{cat.suiteNames.length - 4} more</Badge>
                            )}
                          </div>
                        )}
                        {cat.count === 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            No suites tagged with {cat.tags.slice(0, 3).join(", ")}. Add coverage tags to your eval suites.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Coverage by Agent</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const agentCoverage = new Map<string, Set<string>>();
                  suites?.forEach((s) => {
                    if (!s.agentId) return;
                    if (!agentCoverage.has(s.agentId)) agentCoverage.set(s.agentId, new Set());
                    (s.coverageTags || []).forEach((tag) => {
                      coverageCategories.forEach((cat) => {
                        if (cat.tags.some((ct) => tag.toLowerCase().includes(ct))) {
                          agentCoverage.get(s.agentId!)!.add(cat.key);
                        }
                      });
                    });
                  });
                  const entries = Array.from(agentCoverage.entries());
                  if (entries.length === 0) {
                    return (
                      <div className="py-8 text-center">
                        <Bot className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No agent coverage data available</p>
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-[1fr_repeat(4,60px)] gap-2 items-center text-[10px] text-muted-foreground font-medium px-2">
                        <span>Agent</span>
                        {coverageCategories.map((cat) => (
                          <span key={cat.key} className="text-center">{cat.label}</span>
                        ))}
                      </div>
                      {entries.map(([agentId, coveredKeys]) => (
                        <div key={agentId} className="grid grid-cols-[1fr_repeat(4,60px)] gap-2 items-center p-2 rounded-md border border-border" data-testid={`coverage-agent-${agentId}`}>
                          <Link href={`/agents/${agentId}`}>
                            <span className="text-sm font-medium hover:underline cursor-pointer truncate" data-testid={`text-coverage-agent-name-${agentId}`}>
                              {agentMap.get(agentId) || agentId}
                            </span>
                          </Link>
                          {coverageCategories.map((cat) => (
                            <div key={cat.key} className="flex justify-center">
                              {coveredKeys.has(cat.key) ? (
                                <CheckCircle className={`w-4 h-4 ${cat.color}`} />
                              ) : (
                                <div className="w-4 h-4 rounded-full border border-muted-foreground/20" />
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="industry-assurance" className="mt-0">
          <div className="flex flex-col gap-4">
            {!industryAssurance ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Factory className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading industry assurance data...</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="assurance-stats">
                  <Card>
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Eval Dataset Coverage</span>
                        <Badge variant="outline" className="text-[10px]">
                          {industryAssurance.linkedDatasets.length}/{industryAssurance.totalDatasets}
                        </Badge>
                      </div>
                      <span className="text-2xl font-semibold" data-testid="stat-golden-coverage">
                        {industryAssurance.linkedPct}%
                      </span>
                      <Progress value={industryAssurance.linkedPct} className="h-2" />
                      <span className="text-[10px] text-muted-foreground">
                        {industryAssurance.linkedDatasets.length} of {industryAssurance.totalDatasets} datasets linked to eval suites
                      </span>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">KPI Dimension Coverage</span>
                        <Badge variant="outline" className="text-[10px]">
                          {industryAssurance.coveredKpis.length}/{industryAssurance.coveredKpis.length + industryAssurance.uncoveredKpis.length}
                        </Badge>
                      </div>
                      <span className="text-2xl font-semibold" data-testid="stat-kpi-coverage">
                        {industryAssurance.kpiCovPct}%
                      </span>
                      <Progress value={industryAssurance.kpiCovPct} className="h-2" />
                      <span className="text-[10px] text-muted-foreground">
                        {industryAssurance.uncoveredKpis.length > 0
                          ? `${industryAssurance.uncoveredKpis.length} KPI dimension${industryAssurance.uncoveredKpis.length !== 1 ? "s" : ""} with no test coverage`
                          : "All KPI dimensions have test coverage"}
                      </span>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Custom Test Cases</span>
                        <Badge variant="outline" className="text-[10px]">
                          {industryAssurance.customPct}% custom
                        </Badge>
                      </div>
                      <span className="text-2xl font-semibold" data-testid="stat-custom-pct">
                        {industryAssurance.customPct}%
                      </span>
                      <Progress value={industryAssurance.customPct} className="h-2" />
                      <span className="text-[10px] text-muted-foreground">
                        Suites without industry-specific tagging
                      </span>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-500" />
                      <CardTitle className="text-sm font-medium">Ontology Coverage Analysis</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700">
                      {ontologyDomains.length} domain{ontologyDomains.length !== 1 ? "s" : ""}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const agentsWithTags = (agents || []).filter(a => {
                        const tags = (a.ontologyTags as Array<{ conceptId: string; label: string }>) || [];
                        return tags.length > 0;
                      });
                      const agentsWithSuites = new Set((suites || []).map(s => s.agentId).filter(Boolean));
                      const taggedWithSuites = agentsWithTags.filter(a => agentsWithSuites.has(a.id));
                      const taggedWithoutSuites = agentsWithTags.filter(a => !agentsWithSuites.has(a.id));
                      const ontologyCovPct = (agents || []).length > 0
                        ? Math.round((agentsWithTags.length / (agents || []).length) * 100)
                        : 0;
                      return (
                        <div className="flex flex-col gap-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="flex flex-col gap-1 p-2.5 rounded-md bg-muted/30">
                              <span className="text-[10px] text-muted-foreground">Agents with Ontology Tags</span>
                              <span className="text-lg font-semibold" data-testid="stat-ontology-tagged-agents">{agentsWithTags.length}/{(agents || []).length}</span>
                              <Progress value={ontologyCovPct} className="h-1.5" />
                            </div>
                            <div className="flex flex-col gap-1 p-2.5 rounded-md bg-muted/30">
                              <span className="text-[10px] text-muted-foreground">Tagged Agents with Eval Suites</span>
                              <span className="text-lg font-semibold" data-testid="stat-ontology-eval-coverage">{taggedWithSuites.length}</span>
                              <span className="text-[10px] text-muted-foreground">{taggedWithoutSuites.length > 0 ? `${taggedWithoutSuites.length} tagged agents lack eval suites` : "All tagged agents have eval coverage"}</span>
                            </div>
                            <div className="flex flex-col gap-1 p-2.5 rounded-md bg-muted/30">
                              <span className="text-[10px] text-muted-foreground">Active Ontology Domains</span>
                              <div className="flex items-center gap-1 flex-wrap">
                                {ontologyDomains.length > 0 ? ontologyDomains.map(d => (
                                  <Badge key={d} variant="outline" className="text-[9px] text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700">
                                    {d}
                                  </Badge>
                                )) : <span className="text-[10px] text-muted-foreground">No domains</span>}
                              </div>
                            </div>
                          </div>
                          {taggedWithoutSuites.length > 0 && (
                            <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span className="text-[10px] text-amber-700 dark:text-amber-300">
                                {taggedWithoutSuites.length} ontology-tagged agent{taggedWithoutSuites.length !== 1 ? "s" : ""} have no eval suites. Consider creating test coverage for: {taggedWithoutSuites.slice(0, 3).map(a => a.name).join(", ")}{taggedWithoutSuites.length > 3 ? "..." : ""}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {industryAssurance.primaryIndustry && (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">KPI Dimension Analysis</CardTitle>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {industryLabels[industryAssurance.primaryIndustry]}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col gap-3">
                        {[...industryAssurance.coveredKpis, ...industryAssurance.uncoveredKpis].map((kpi) => {
                          const covered = industryAssurance.coveredKpis.includes(kpi);
                          return (
                            <div key={kpi.id} className={`flex items-center gap-3 p-3 rounded-md border ${covered ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`} data-testid={`kpi-dim-${kpi.id}`}>
                              <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${covered ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
                                {covered ? (
                                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                                ) : (
                                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                                )}
                              </div>
                              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                <span className="text-sm font-medium" data-testid={`text-kpi-label-${kpi.id}`}>{kpi.label}</span>
                                <span className="text-[10px] text-muted-foreground">{kpi.description}</span>
                              </div>
                              <Badge variant="outline" className={`text-[10px] shrink-0 ${covered ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : "text-amber-600 dark:text-amber-400 border-amber-500/30"}`}>
                                {covered ? "Covered" : "No Coverage"}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {industryAssurance.regulatoryTemplatesForIndustry.length > 0 && (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">Mandatory Regulatory Test Cases</CardTitle>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {industryAssurance.regulatoryTemplatesForIndustry.length} templates
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col gap-2">
                        {industryAssurance.regulatoryTemplatesForIndustry.map((tmpl) => (
                          <div key={tmpl.id} className="flex items-center gap-3 p-3 rounded-md border" data-testid={`reg-template-${tmpl.id}`}>
                            <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-blue-500/10">
                              <Shield className="w-4 h-4 text-blue-500" />
                            </div>
                            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{tmpl.name}</span>
                                <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                                  {tmpl.regulation} {tmpl.section}
                                </Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{tmpl.description}</span>
                            </div>
                            <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {industryAssurance.industryRegressions.length > 0 && (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-red-500" />
                        <CardTitle className="text-sm font-medium">Regression Impact (Industry Terms)</CardTitle>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20">
                        {industryAssurance.industryRegressions.length} impactful
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col gap-3">
                        {industryAssurance.industryRegressions.map((reg, idx) => (
                          <Link key={reg.suite.id} href={`/evals/${reg.suite.id}`}>
                            <div className="flex flex-col gap-2 p-3 rounded-md border border-red-500/20 bg-red-500/5 hover-elevate cursor-pointer" data-testid={`impact-regression-${idx}`}>
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium">{reg.suite.name}</span>
                                  {reg.industry && (
                                    <Badge variant="outline" className="text-[9px]">
                                      {industryLabels[reg.industry]}
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-sm font-bold text-red-600 dark:text-red-400">
                                  {(reg.delta * 100).toFixed(1)}%
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground" data-testid={`text-impact-${idx}`}>
                                {reg.impact}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {industryAssurance.scorersForIndustry.length > 0 && (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                      <div className="flex items-center gap-2">
                        <FlaskConical className="w-4 h-4 text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">Available Industry Scorers</CardTitle>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {industryAssurance.scorersForIndustry.length} scorers
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {industryAssurance.scorersForIndustry.map((scorer) => (
                          <div key={scorer.id} className="flex items-start gap-3 p-3 rounded-md border" data-testid={`scorer-${scorer.id}`}>
                            <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-primary/10">
                              <FlaskConical className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{scorer.name}</span>
                                <Badge variant="outline" className="text-[9px]">weight: {scorer.weight}</Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{scorer.description}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!industryAssurance.primaryIndustry && (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Factory className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground" data-testid="text-no-industry">No industry context detected</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Add industry tags (healthcare, financial, manufacturing) to your eval suites or set the industry field to enable industry-specific assurance.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
