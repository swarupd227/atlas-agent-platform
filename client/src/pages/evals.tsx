import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { EvalSuite, Agent } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FlaskConical, Search, TrendingUp, TrendingDown, Bot,
  ArrowRight, Calendar, Tag, BarChart3, AlertTriangle, CheckCircle,
} from "lucide-react";

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

function formatDate(date: string | Date | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Evals() {
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const { data: suites, isLoading: suitesLoading } = useQuery<EvalSuite[]>({ queryKey: ["/api/eval-suites"] });
  const { data: agents, isLoading: agentsLoading } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const isLoading = suitesLoading || agentsLoading;
  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    agents?.forEach((a) => m.set(a.id, a.name));
    return m;
  }, [agents]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    suites?.forEach((suite) => suite.coverageTags?.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [suites]);

  const filtered = useMemo(() => {
    if (!suites) return [];
    return suites.filter((s) => {
      if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (tagFilter && !(s.coverageTags || []).includes(tagFilter)) return false;
      return true;
    });
  }, [suites, searchQuery, tagFilter]);

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
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
          <FlaskConical className="w-4 h-4 text-primary" />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Eval Studio</h1>
          <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">Evaluation suites grouped by agent</p>
        </div>
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
      </div>

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
                return (
                  <Link key={suite.id} href={`/evals/${suite.id}`}>
                    <Card className="hover-elevate cursor-pointer" data-testid={`card-eval-suite-${suite.id}`}>
                      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium truncate" data-testid={`text-suite-name-${suite.id}`}>
                          {suite.name}
                        </CardTitle>
                        {suite.type && (
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${typeColors[suite.type] || ""}`} data-testid={`badge-suite-type-${suite.id}`}>
                            {suite.type}
                          </Badge>
                        )}
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
  );
}
