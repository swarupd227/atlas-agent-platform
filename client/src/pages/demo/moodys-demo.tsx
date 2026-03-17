import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Circle,
  Loader2,
  RotateCcw,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  BarChart3,
  Users,
  ClipboardList,
  ShieldAlert,
  Edit3,
  ChevronRight,
  Activity,
  Zap,
} from "lucide-react";

const POLL = 2500;

const AGENTS = [
  { key: "financialDataCollector", label: "Financial Data Collector & Spreader",    number: 1, color: "blue",   tools: "get_edgar_filings · spread_to_chart_of_accounts · compute_credit_metrics",    duration: "2 min 14 sec" },
  { key: "earningsAnalyzer",       label: "Earnings & Management Signal Analyzer",  number: 2, color: "violet", tools: "get_earnings_transcripts · get_investor_presentations",                       duration: "1 min 48 sec" },
  { key: "peerComparisonBuilder",  label: "Peer Comparison Builder",                number: 3, color: "cyan",   tools: "get_peer_group · get_peer_financials",                                        duration: "1 min 22 sec" },
  { key: "esgProfileAgent",        label: "ESG & Sustainability Profile Agent",     number: 4, color: "green",  tools: "get_esg_ips_scores · get_cis_score · scan_credit_news",                      duration: "1 min 35 sec" },
  { key: "newsEventScanner",       label: "News & Event Scanner",                   number: 5, color: "orange", tools: "scan_credit_news · get_legal_database · get_market_data",                    duration: "0 min 58 sec" },
  { key: "scorecardPrePopulation", label: "Scorecard Pre-Population Agent",         number: 6, color: "purple", tools: "get_rating_scorecard_template · get_current_rating · get_moody_financials",  duration: "0 min 41 sec" },
] as const;

const COLOR_MAP: Record<string, string> = {
  blue:   "bg-blue-500/15 border-blue-500/40 text-blue-300",
  violet: "bg-violet-500/15 border-violet-500/40 text-violet-300",
  cyan:   "bg-cyan-500/15 border-cyan-500/40 text-cyan-300",
  green:  "bg-green-500/15 border-green-500/40 text-green-300",
  orange: "bg-orange-500/15 border-orange-500/40 text-orange-300",
  purple: "bg-purple-500/15 border-purple-500/40 text-purple-300",
};

const METRICS = [
  { name: "Debt/EBITDA", value: "3.2x", trend: "down",   prior: "3.8x", category: "Leverage",     scorecard: "Ba"  },
  { name: "EBIT/Interest", value: "4.1x", trend: "up",   prior: "3.5x", category: "Coverage",     scorecard: "Baa" },
  { name: "FCF/Debt", value: "12.4%", trend: "stable", prior: "12.1%", category: "Cash Flow",    scorecard: "Baa" },
  { name: "FFO/Debt", value: "18.2%", trend: "up",     prior: "16.4%", category: "Cash Flow",    scorecard: "Baa" },
  { name: "Revenue Growth YoY", value: "+4.2%", trend: "up", prior: "+1.8%", category: "Scale",  scorecard: "—"   },
  { name: "EBITDA Margin", value: "8.8%", trend: "up",   prior: "7.9%", category: "Profitability",scorecard: "Ba"  },
  { name: "Revenue", value: "$178B", trend: "up",       prior: "$176.2B", category: "Scale",      scorecard: "Aaa" },
  { name: "EBITDA", value: "$15.7B", trend: "up",       prior: "$13.9B", category: "Profitability",scorecard: "Ba"  },
  { name: "Adjusted Debt", value: "$50.3B", trend: "down", prior: "$53.2B", category: "Leverage", scorecard: "—"   },
  { name: "Cash & Equiv.", value: "$29.0B", trend: "up", prior: "$25.8B", category: "Liquidity",  scorecard: "—"   },
  { name: "Capex/Revenue", value: "4.8%", trend: "up",   prior: "4.2%", category: "Investment",   scorecard: "—"   },
  { name: "Gross Margin", value: "11.2%", trend: "stable",prior: "11.5%", category: "Profitability",scorecard: "—" },
];

const PEER_METRICS = [
  { metric: "Debt/EBITDA (x)",  ford: "3.2", gm: "2.1", stellantis: "1.8", toyota: "1.2", vw: "2.4", hyundai: "1.9", fordRank: 5, median: "2.1", higherBetter: false },
  { metric: "EBIT/Interest (x)",ford: "4.1", gm: "5.8", stellantis: "6.2", toyota: "8.4", vw: "4.4", hyundai: "5.1", fordRank: 5, median: "5.5", higherBetter: true  },
  { metric: "EBITDA Margin (%)",ford: "8.8", gm: "10.4",stellantis: "11.2",toyota: "13.1",vw: "9.8", hyundai: "10.2",fordRank: 6, median: "10.3",higherBetter: true  },
  { metric: "FCF/Debt (%)",     ford: "12.4",gm: "10.2",stellantis: "14.8",toyota: "22.1",vw: "8.4", hyundai: "11.8",fordRank: 3, median: "11.0",higherBetter: true  },
  { metric: "Revenue ($B)",     ford: "178", gm: "187", stellantis: "189", toyota: "274", vw: "298", hyundai: "112", fordRank: 4, median: "187",  higherBetter: true  },
  { metric: "Current Rating",   ford: "Ba1", gm: "Baa3",stellantis: "Ba1", toyota: "A1",  vw: "A3",  hyundai: "Baa1",fordRank: 5, median: "Baa3", higherBetter: true  },
];

const SCORECARD_Q = [
  { factor: "Scale (Revenue)",            value: "$178B",  scorecardCategory: "Aaa", weight: "10%" },
  { factor: "Profitability (EBITDA Margin)", value: "8.8%",  scorecardCategory: "Ba",  weight: "20%" },
  { factor: "Leverage (Debt/EBITDA)",     value: "3.2x",   scorecardCategory: "Ba",  weight: "20%" },
  { factor: "Coverage (EBIT/Interest)",   value: "4.1x",   scorecardCategory: "Baa", weight: "20%" },
  { factor: "Cash Flow (FCF/Debt)",       value: "12.4%",  scorecardCategory: "Baa", weight: "15%" },
];

const INITIAL_QUALITATIVE = [
  { factor: "Business Profile",    agentSuggestion: "Baa", agentRationale: "Global scale and brand strength offset by high EV transition risk and below-peer EBITDA margin.", confidence: 72, weight: "5%" },
  { factor: "Competitive Position",agentSuggestion: "Ba",  agentRationale: "Ford EV market share ~4% vs. BYD 20% and Tesla 18% globally. ICE strength in F-150 and Super Duty is significant but structural.", confidence: 81, weight: "5%" },
  { factor: "Financial Policy",    agentSuggestion: "Baa", agentRationale: "Management reaffirmed 2.5–3.0x leverage target. Capital allocation discipline improving post-restructuring.", confidence: 68, weight: "3%" },
  { factor: "Management Quality",  agentSuggestion: "Baa", agentRationale: "CFO demonstrated clear leverage target discipline; EV restructuring reflects pragmatic strategic pivot.", confidence: 65, weight: "2%" },
];

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-green-400" />;
  if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-green-400" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function categoryColor(cat: string) {
  const m: Record<string, string> = { Aaa: "text-green-400", Aa: "text-green-400", A: "text-emerald-400", Baa: "text-yellow-400", Ba: "text-orange-400", B: "text-red-400" };
  return m[cat] ?? "text-muted-foreground";
}

function AgentCard({ agent, status }: { agent: typeof AGENTS[number]; status: string }) {
  const col = COLOR_MAP[agent.color];
  const isRunning  = status === "running";
  const isComplete = status === "complete";
  const isError    = status === "error";

  return (
    <div className={`border rounded-lg p-3 transition-all duration-500 ${col} ${isComplete ? "opacity-100" : isRunning ? "opacity-100" : "opacity-50"}`} data-testid={`agent-card-${agent.key}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-5 h-5 rounded-full bg-black/30 flex items-center justify-center text-[10px] font-bold shrink-0">{agent.number}</div>
        {isRunning  && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
        {isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />}
        {isError    && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
        {status === "pending" && <Circle className="w-3.5 h-3.5 opacity-40 shrink-0" />}
        <span className="text-xs font-semibold truncate">{agent.label}</span>
        {isComplete && <span className="ml-auto text-[10px] text-green-400 shrink-0">{agent.duration}</span>}
        {isRunning  && <span className="ml-auto text-[10px] animate-pulse shrink-0">running…</span>}
      </div>
      <p className="text-[10px] opacity-60 pl-7 leading-relaxed">{agent.tools}</p>
    </div>
  );
}

export default function MoodysDemo() {
  const { toast } = useToast();
  const [view, setView] = useState<"trigger" | "review" | "analyst">("trigger");
  const [editingFactor, setEditingFactor] = useState<string | null>(null);
  const [qualitative, setQualitative] = useState(INITIAL_QUALITATIVE.map(q => ({ ...q, analystValue: q.agentSuggestion as string, note: "", status: "pending" as "pending" | "confirmed" | "overridden" })));
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideValue, setOverrideValue] = useState("");

  const { data: state } = useQuery<any>({
    queryKey: ["/demo-api/moodys/state"],
    refetchInterval: POLL,
  });

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/demo-api/moodys/run"),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/demo-api/moodys") });
      toast({ title: "Pipeline started", description: "6 agents activated — retrieving data in parallel." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/demo-api/moodys/reset"),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/demo-api/moodys") });
      setView("trigger");
      setQualitative(INITIAL_QUALITATIVE.map(q => ({ ...q, analystValue: q.agentSuggestion as string, note: "", status: "pending" })));
      setEditingFactor(null);
      toast({ title: "Demo reset", description: "State restored to initial values." });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/demo-api/moodys/override", body),
    onSuccess: () => queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/demo-api/moodys") }),
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/demo-api/moodys/confirm"),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/demo-api/moodys") });
      toast({ title: "Package confirmed", description: "Assessment package released for rating committee review." });
    },
  });

  const pipelineStatus = state?.status ?? "idle";
  const agentStates    = state?.agents ?? {};
  const overrides      = state?.overrides ?? [];
  const packageConfirmed = state?.packageConfirmed ?? false;

  const allComplete = AGENTS.every(a => agentStates[a.key]?.status === "complete" || agentStates[a.key]?.status === "error");
  const completedCount = AGENTS.filter(a => agentStates[a.key]?.status === "complete").length;

  function handleSaveOverride(factorName: string) {
    const idx = qualitative.findIndex(q => q.factor === factorName);
    if (idx === -1) return;
    const prev = qualitative[idx];
    const isConfirmed = !overrideValue || overrideValue === prev.agentSuggestion;
    const finalValue  = overrideValue || prev.agentSuggestion;

    setQualitative(q => q.map((item, i) => i === idx ? { ...item, analystValue: finalValue, note: overrideNote, status: isConfirmed ? "confirmed" : "overridden" } : item));

    overrideMutation.mutate({
      field: factorName,
      agentValue: prev.agentSuggestion,
      analystValue: finalValue,
      note: overrideNote,
      type: isConfirmed ? "confirmed" : "overridden",
    });

    setEditingFactor(null);
    setOverrideNote("");
    setOverrideValue("");
    toast({ title: isConfirmed ? "Assessment confirmed" : "Override logged", description: `${factorName} — ${isConfirmed ? "AI suggestion accepted" : `changed to ${finalValue}`}. Logged per governance policy.` });
  }

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto" data-testid="page-moodys-demo">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-demo-title">Credit Assessment Package Assembly</h1>
          <p className="text-sm text-muted-foreground">Automated Assessment Pipeline · Ford Motor Company · Annual Review</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pipelineStatus === "complete" && !packageConfirmed && view === "trigger" && (
            <Button variant="outline" size="sm" onClick={() => setView("review")} data-testid="button-review-package">
              Review Package <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          )}
          {view === "review" && (
            <Button variant="outline" size="sm" onClick={() => setView("analyst")} data-testid="button-analyst-review">
              Analyst Review <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending} data-testid="button-reset">
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset Demo
          </Button>
        </div>
      </div>

      {/* ─── Step breadcrumb ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <button onClick={() => setView("trigger")} className={`hover:text-foreground transition-colors ${view === "trigger" ? "text-foreground font-medium" : ""}`}>1. Trigger</button>
        <ChevronRight className="w-3 h-3" />
        <button onClick={() => pipelineStatus === "complete" && setView("review")} className={`hover:text-foreground transition-colors ${view === "review" ? "text-foreground font-medium" : ""} ${pipelineStatus !== "complete" ? "opacity-30 cursor-default" : ""}`}>2. Review Package</button>
        <ChevronRight className="w-3 h-3" />
        <button onClick={() => pipelineStatus === "complete" && setView("analyst")} className={`hover:text-foreground transition-colors ${view === "analyst" ? "text-foreground font-medium" : ""} ${pipelineStatus !== "complete" ? "opacity-30 cursor-default" : ""}`}>3. Analyst Review</button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STEP 1 — TRIGGER                                                 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {view === "trigger" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Request form */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" /> New Assessment Package Request
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                { label: "Issuer", value: "Ford Motor Company" },
                { label: "Ticker", value: "F" },
                { label: "Assessment Type", value: "Annual Review" },
                { label: "Methodology", value: "Automobile Manufacturer Methodology (v2.1, March 2024)" },
                { label: "Peer Group", value: "GM, Stellantis, Toyota, VW, Hyundai" },
                { label: "Requested By", value: "Senior Analyst, North America Corporates" },
                { label: "Current Rating", value: "Ba1, Outlook: Stable" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start gap-2">
                  <span className="text-muted-foreground w-36 shrink-0">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}

              <div className="pt-2 border-t border-border/40">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 text-xs text-amber-300 flex items-start gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span><strong>P4 — Information Barrier:</strong> This package uses public information only. Confidential issuer information must be incorporated during analyst review.</span>
                </div>
              </div>

              {pipelineStatus === "idle" && (
                <Button className="w-full mt-2" onClick={() => runMutation.mutate()} disabled={runMutation.isPending} data-testid="button-generate-package">
                  {runMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Starting…</> : <><Zap className="w-3.5 h-3.5 mr-2" />Generate Assessment Package</>}
                </Button>
              )}
              {pipelineStatus === "running" && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <Activity className="w-3.5 h-3.5 animate-pulse text-blue-400" />
                  <span>Pipeline running — {completedCount}/6 agents complete</span>
                </div>
              )}
              {pipelineStatus === "complete" && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2 text-xs text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>All 6 agents complete — assessment package ready</span>
                  </div>
                  <Button
                    className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold"
                    onClick={() => setView("review")}
                    data-testid="button-review-package-form"
                  >
                    View Assessment Package <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pipeline execution view */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                Pipeline Execution
                {pipelineStatus === "running" && <Badge className="text-[10px] bg-blue-500/20 text-blue-300 border-blue-500/30 ml-auto">Running</Badge>}
                {pipelineStatus === "complete" && <Badge className="text-[10px] bg-green-500/20 text-green-300 border-green-500/30 ml-auto">Complete</Badge>}
                {pipelineStatus === "idle" && <Badge className="text-[10px] bg-muted/30 text-muted-foreground ml-auto">Idle</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {AGENTS.map(agent => (
                <AgentCard key={agent.key} agent={agent} status={agentStates[agent.key]?.status ?? "pending"} />
              ))}

              {pipelineStatus === "complete" && (
                <div className="mt-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-300 text-center space-y-3">
                  <div>
                    <CheckCircle2 className="w-5 h-5 mx-auto mb-1" />
                    <p className="font-semibold text-sm">Assembly complete in ~3 min 47 sec</p>
                    <p className="text-green-400/70 text-xs mt-0.5">vs. 4–5 hours manually — 94% time reduction</p>
                  </div>
                  <Button
                    className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold"
                    onClick={() => setView("review")}
                    data-testid="button-review-package-inline"
                  >
                    View Assessment Package <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              )}

              {/* Live tool call feed */}
              {(state?.toolCallLog?.length > 0) && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Live Activity</p>
                  {[...state.toolCallLog].reverse().map((entry: any, i: number) => (
                    <div key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
                      <span>{entry.summary}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STEP 2 — REVIEW PACKAGE                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {view === "review" && (
        <Tabs defaultValue="financial">
          <TabsList className="mb-4">
            <TabsTrigger value="financial" data-testid="tab-financial"><BarChart3 className="w-3.5 h-3.5 mr-1.5" />Financial Summary</TabsTrigger>
            <TabsTrigger value="earnings" data-testid="tab-earnings"><Activity className="w-3.5 h-3.5 mr-1.5" />Earnings Intelligence</TabsTrigger>
            <TabsTrigger value="peers" data-testid="tab-peers"><Users className="w-3.5 h-3.5 mr-1.5" />Peer Comparison</TabsTrigger>
            <TabsTrigger value="scorecard" data-testid="tab-scorecard"><ClipboardList className="w-3.5 h-3.5 mr-1.5" />Pre-Populated Scorecard</TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Financial Summary ─────────────────────────────────────── */}
          <TabsContent value="financial" className="space-y-4">
            <div className="bg-blue-800/20 border border-blue-700/40 rounded-lg px-4 py-2 flex items-center gap-3 text-sm">
              <span className="font-bold text-blue-300">Financial Data Collector & Spreader</span>
              <span className="text-blue-300/60">· Agent 1 ·</span>
              <Badge className="text-[10px] bg-blue-500/20 text-blue-300 border-blue-500/30">247 line items · 8 quarters · US-GAAP</Badge>
              <span className="ml-auto text-xs text-blue-300/60">2 min 14 sec</span>
            </div>

            {/* Anomaly flags */}
            <div className="space-y-2">
              {[
                "⚠ Non-recurring restructuring charge of $1.2B in Q4 2024 (EV segment right-sizing). Excluded from adjusted EBITDA. Analyst review required.",
                "⚠ Ford Pro segment reclassified in Q1 2025; prior periods restated for comparability.",
              ].map((msg, i) => (
                <div key={i} className="bg-yellow-500/10 border border-yellow-500/30 rounded-md px-3 py-2 text-xs text-yellow-300 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{msg}</span>
                </div>
              ))}
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {METRICS.map(m => (
                <div key={m.name} className="border border-border/50 rounded-lg p-3 bg-card/40" data-testid={`metric-${m.name.replace(/\s+/g,"-").toLowerCase()}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{m.name}</span>
                    <Badge variant="outline" className="text-[10px]">{m.category}</Badge>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-xl font-bold">{m.value}</span>
                    <div className="flex items-center gap-1 mb-0.5">
                      <TrendIcon trend={m.trend} />
                      <span className="text-xs text-muted-foreground">from {m.prior}</span>
                    </div>
                  </div>
                  {m.scorecard !== "—" && (
                    <div className="mt-1.5 text-[10px]">
                      Scorecard: <span className={`font-semibold ${categoryColor(m.scorecard)}`}>{m.scorecard} category</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground italic">
              Source: SEC EDGAR 10-K (FY2025), 10-Q (Q3/Q2-2025) · Internal financial spreading · All figures adjusted per sector methodology.
            </p>
          </TabsContent>

          {/* ── Tab 2: Earnings Intelligence ─────────────────────────────── */}
          <TabsContent value="earnings" className="space-y-4">
            <div className="bg-violet-800/20 border border-violet-700/40 rounded-lg px-4 py-2 flex items-center gap-3 text-sm">
              <span className="font-bold text-violet-300">Earnings & Management Signal Analyzer</span>
              <span className="text-violet-300/60">· Agent 2 ·</span>
              <Badge className="text-[10px] bg-violet-500/20 text-violet-300 border-violet-500/30">Q3 & Q4 2025 earnings calls</Badge>
              <span className="ml-auto text-xs text-violet-300/60">1 min 48 sec</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-border/50 rounded-lg p-4 bg-card/40 text-center">
                <p className="text-xs text-muted-foreground mb-1">Overall Credit Sentiment</p>
                <p className="text-3xl font-bold text-green-400">+0.3</p>
                <p className="text-xs text-muted-foreground mt-1">Slightly positive · Stable QoQ</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Scale: −1.0 (very negative) to +1.0 (very positive)</p>
              </div>
              <div className="border border-border/50 rounded-lg p-4 bg-card/40 col-span-2">
                <p className="text-xs text-muted-foreground mb-3">Management Tone by Credit Topic</p>
                <div className="space-y-2.5">
                  {[
                    { topic: "Leverage targets",    score: +0.6, label: "Positive" },
                    { topic: "EV investment",        score:  0.0, label: "Neutral" },
                    { topic: "Liquidity",            score: +0.5, label: "Positive" },
                    { topic: "ICE profitability",    score: +0.4, label: "Positive" },
                  ].map(({ topic, score, label }) => (
                    <div key={topic} className="flex items-center gap-3">
                      <span className="text-xs w-36 shrink-0">{topic}</span>
                      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${score > 0 ? "bg-green-500" : score < 0 ? "bg-red-500" : "bg-muted"}`} style={{ width: `${Math.abs(score) * 100}%`, marginLeft: score < 0 ? undefined : "50%", transform: score < 0 ? "none" : undefined }} />
                      </div>
                      <span className={`text-xs w-16 text-right shrink-0 ${score > 0.3 ? "text-green-400" : score < -0.3 ? "text-red-400" : "text-muted-foreground"}`}>{score > 0 ? "+" : ""}{score.toFixed(1)} {label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border border-violet-500/30 bg-violet-500/5 rounded-lg p-4">
              <p className="text-xs font-semibold text-violet-300 mb-2">Key Analyst-Relevant Quote (CFO — Q4 2025 Earnings Call)</p>
              <blockquote className="text-sm italic text-muted-foreground border-l-2 border-violet-400/50 pl-3">
                "We expect Ford's EBITDA margin to improve modestly in 2026, supported by Ford Pro growth and ICE pricing strength, partially offset by ongoing EV investment losses."
              </blockquote>
              <p className="text-[10px] text-muted-foreground mt-2">Credit relevance: <span className="text-amber-400 font-medium">HIGH</span> · Confirms management's forward-looking margin trajectory expectations.</p>
            </div>

            <div className="space-y-2">
              {[
                { quote: `"We remain firmly committed to our 2.5–3.0x net leverage target. Q4 free cash flow was strong."`, speaker: "CFO", topic: "Leverage", tag: "Positive (+0.6)" },
                { quote: `"We're right-sizing our EV capacity investment. The $1.2B restructuring reflects disciplined capital allocation, not a retreat."`, speaker: "CEO", topic: "EV Investment", tag: "Neutral (0.0)" },
                { quote: `"Cash and liquidity position of $29B provides significant buffer. No near-term debt maturities of concern."`, speaker: "CFO", topic: "Liquidity", tag: "Positive (+0.5)" },
              ].map(({ quote, speaker, topic, tag }) => (
                <div key={topic} className="border border-border/40 rounded-lg p-3 bg-card/20">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge variant="outline" className="text-[10px]">{topic}</Badge>
                    <span className="text-[10px] text-muted-foreground">{speaker}</span>
                    <span className="ml-auto text-[10px] text-green-400">{tag}</span>
                  </div>
                  <p className="text-xs italic text-muted-foreground">"{quote}"</p>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Tab 3: Peer Comparison ───────────────────────────────────── */}
          <TabsContent value="peers" className="space-y-4">
            <div className="bg-cyan-800/20 border border-cyan-700/40 rounded-lg px-4 py-2 flex items-center gap-3 text-sm">
              <span className="font-bold text-cyan-300">Peer Comparison Builder</span>
              <span className="text-cyan-300/60">· Agent 3 ·</span>
              <Badge className="text-[10px] bg-cyan-500/20 text-cyan-300 border-cyan-500/30">Automobile Manufacturer v2.1 · 5 peers · 6 metrics</Badge>
              <span className="ml-auto text-xs text-cyan-300/60">1 min 22 sec</span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/20">
                    <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">Metric</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-foreground bg-blue-500/10">Ford (F)</th>
                    <th className="px-3 py-2.5 text-center text-muted-foreground">GM</th>
                    <th className="px-3 py-2.5 text-center text-muted-foreground">Stellantis</th>
                    <th className="px-3 py-2.5 text-center text-muted-foreground">Toyota</th>
                    <th className="px-3 py-2.5 text-center text-muted-foreground">VW</th>
                    <th className="px-3 py-2.5 text-center text-muted-foreground">Hyundai</th>
                    <th className="px-3 py-2.5 text-center text-muted-foreground">Peer Median</th>
                    <th className="px-3 py-2.5 text-center text-muted-foreground">Ford Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {PEER_METRICS.map((row, i) => {
                    const isWeak = (row.fordRank ?? 0) >= 5;
                    return (
                      <tr key={i} className={`border-b border-border/30 ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                        <td className="px-3 py-2.5 text-muted-foreground">{row.metric}</td>
                        <td className={`px-3 py-2.5 text-center font-semibold bg-blue-500/5 ${isWeak ? "text-orange-400" : "text-green-400"}`}>{row.ford}</td>
                        <td className="px-3 py-2.5 text-center">{row.gm}</td>
                        <td className="px-3 py-2.5 text-center">{row.stellantis}</td>
                        <td className="px-3 py-2.5 text-center">{row.toyota}</td>
                        <td className="px-3 py-2.5 text-center">{row.vw}</td>
                        <td className="px-3 py-2.5 text-center">{row.hyundai}</td>
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{row.median}</td>
                        <td className={`px-3 py-2.5 text-center font-medium ${isWeak ? "text-orange-400" : "text-green-400"}`}>{row.fordRank} / 6</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Outlier Flags</p>
              {[
                "Ford EBITDA margin (8.8%) is 140bps below peer median (10.2%) and 320bps below Toyota.",
                "Ford FCF/Debt (12.4%) is above peer median — strong cash conversion despite margin headwinds.",
                "Ford is the only issuer in the peer group with EV segment losses exceeding $2B annually.",
              ].map((flag, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-orange-300 bg-orange-500/5 border border-orange-500/20 rounded-md px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{flag}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Tab 4: Pre-Populated Scorecard ──────────────────────────── */}
          <TabsContent value="scorecard" className="space-y-4">
            <div className="bg-purple-800/20 border border-purple-700/40 rounded-lg px-4 py-2 flex items-center gap-3 text-sm">
              <span className="font-bold text-purple-300">Scorecard Pre-Population Agent</span>
              <span className="text-purple-300/60">· Agent 6 ·</span>
              <Badge className="text-[10px] bg-purple-500/20 text-purple-300 border-purple-500/30">Automobile Manufacturer v2.1</Badge>
              <span className="ml-auto text-xs text-purple-300/60">0 min 41 sec</span>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 text-xs text-amber-300 flex items-start gap-2">
              <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span><strong>P1 — Model-Indicated Disclaimer:</strong> All scorecard outputs are model-indicated only. Indicated outcomes do not constitute and must not be construed as a rating opinion. Ratings are assigned exclusively by rating committees.</span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Quantitative */}
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Quantitative Factors — Pre-Populated (Agent 1 Data)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {SCORECARD_Q.map(q => (
                    <div key={q.factor} className="flex items-center justify-between text-sm border-b border-border/30 pb-2">
                      <div>
                        <p className="font-medium text-sm">{q.factor}</p>
                        <p className="text-xs text-muted-foreground">{q.source ?? "Agent 1"} · Weight {q.weight}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold">{q.value}</span>
                        <div className="text-xs">
                          <span className={`font-bold ${categoryColor(q.scorecardCategory)}`}>{q.scorecardCategory}</span>
                          <span className="text-muted-foreground ml-1">category</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Qualitative */}
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Qualitative Factors — AI-Suggested ⚠️ Analyst Review Required</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {qualitative.map(q => (
                    <div key={q.factor} className="border border-border/30 rounded-md p-2.5 bg-muted/5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{q.factor}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{q.agentRationale}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-sm font-bold ${categoryColor(q.analystValue)}`}>{q.analystValue}</div>
                          {q.status === "confirmed" && <div className="text-[10px] text-green-400">Confirmed ✓</div>}
                          {q.status === "overridden" && <div className="text-[10px] text-orange-400">Overridden →{q.analystValue}</div>}
                          {q.status === "pending"   && <div className="text-[10px] text-muted-foreground">Pending review</div>}
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-muted/30 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-400 rounded-full" style={{ width: `${q.confidence}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{q.confidence}% confidence</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Gap analysis */}
            <Card className="border-orange-500/30 bg-orange-500/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Model-Indicated</p>
                    <p className="text-2xl font-bold text-orange-400">Baa3</p>
                    <p className="text-[10px] text-muted-foreground">scorecard output</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Current Rating</p>
                    <p className="text-2xl font-bold">Ba1</p>
                    <p className="text-[10px] text-muted-foreground">Outlook: Stable</p>
                  </div>
                  <div className="flex-1 min-w-48">
                    <p className="text-xs font-medium text-orange-300 mb-1">Gap Analysis — 1 notch</p>
                    <p className="text-xs text-muted-foreground">Model indicates one notch above current assigned rating. Gap likely explained by EV loss trajectory uncertainty and below-peer margins — both require analyst qualitative judgment.</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-3 italic">Model-indicated outcome only — not a rating opinion. Rating assigned exclusively by rating committee.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STEP 3 — ANALYST REVIEW                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {view === "analyst" && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Qualitative overrides */}
          <div className="xl:col-span-2 space-y-3">
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-muted-foreground" /> Scorecard — Qualitative Factor Review
                  <Badge variant="outline" className="text-[10px] ml-auto">P5 — Override Authority</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-md px-3 py-2 text-xs text-blue-300">
                  Review each AI-suggested qualitative factor. Confirm, modify, or override. All actions are logged for quality review but justification is not required (P5 — Analyst Independence Preserved).
                </div>

                {qualitative.map((q, idx) => (
                  <div key={q.factor} className={`border rounded-lg p-3 transition-all ${q.status === "confirmed" ? "border-green-500/30 bg-green-500/5" : q.status === "overridden" ? "border-orange-500/30 bg-orange-500/5" : "border-border/50"}`} data-testid={`factor-card-${idx}`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="text-sm font-semibold">{q.factor}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{q.agentRationale}</p>
                        {q.note && <p className="text-xs text-blue-300 mt-1 italic">Note: {q.note}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-lg font-bold ${categoryColor(q.analystValue)}`}>{q.analystValue}</div>
                        {q.status === "pending"   && <Badge variant="outline" className="text-[10px] text-muted-foreground">Pending</Badge>}
                        {q.status === "confirmed" && <Badge className="text-[10px] bg-green-500/20 text-green-300 border-green-500/30">Confirmed ✓</Badge>}
                        {q.status === "overridden" && <Badge className="text-[10px] bg-orange-500/20 text-orange-300 border-orange-500/30">Overridden</Badge>}
                      </div>
                    </div>

                    {editingFactor === q.factor ? (
                      <div className="space-y-2 pt-2 border-t border-border/30">
                        <div className="flex gap-2 flex-wrap">
                          {["Aaa","Aa","A","Baa","Ba","B","Caa"].map(cat => (
                            <button key={cat} onClick={() => setOverrideValue(cat)} className={`text-xs px-2 py-1 rounded border transition-colors ${overrideValue === cat ? `border-current ${categoryColor(cat)} bg-current/10` : "border-border/40 text-muted-foreground hover:border-border"}`} data-testid={`rating-btn-${cat}`}>{cat}</button>
                          ))}
                        </div>
                        <Textarea placeholder="Analyst note (optional — no justification required)" value={overrideNote} onChange={e => setOverrideNote(e.target.value)} className="text-xs h-16 resize-none" data-testid="input-analyst-note" />
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setOverrideValue(""); setOverrideNote(""); handleSaveOverride(q.factor); }} data-testid="button-confirm-ai">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-400" /> Confirm AI Suggestion
                          </Button>
                          <Button size="sm" onClick={() => handleSaveOverride(q.factor)} disabled={!overrideValue} data-testid="button-save-override">
                            Save Override
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingFactor(null); setOverrideNote(""); setOverrideValue(""); }}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" className="text-xs h-7 px-2" onClick={() => { setEditingFactor(q.factor); setOverrideValue(q.analystValue); setOverrideNote(q.note); }} data-testid={`button-edit-${idx}`} disabled={q.status !== "pending"}>
                        <Edit3 className="w-3 h-3 mr-1" /> {q.status === "pending" ? "Review" : "Reviewed"}
                      </Button>
                    )}
                  </div>
                ))}

                {/* Confirm package */}
                <div className="pt-2 border-t border-border/40">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 text-xs text-amber-300 mb-3">
                    <strong>P3 — Methodology:</strong> Automobile Manufacturer Methodology v2.1 (March 2024) applied. No pending methodology reviews.<br />
                    <strong className="mt-1 block">P4 — Information Barrier:</strong> Package based on public information only. Confirm before releasing for committee review.
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => confirmMutation.mutate()}
                    disabled={confirmMutation.isPending || packageConfirmed || qualitative.some(q => q.status === "pending")}
                    data-testid="button-confirm-package"
                  >
                    {packageConfirmed
                      ? <><CheckCircle2 className="w-4 h-4 mr-2 text-green-400" />Package Confirmed — Released for Committee Review</>
                      : qualitative.some(q => q.status === "pending")
                      ? "Review all qualitative factors before confirming"
                      : <><FileText className="w-4 h-4 mr-2" />Confirm & Release Assessment Package</>}
                  </Button>
                  {packageConfirmed && (
                    <p className="text-xs text-green-400 text-center mt-2">Confirmed at {state?.confirmedAt ? new Date(state.confirmedAt).toLocaleTimeString() : "—"}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Override log + stats */}
          <div className="space-y-3">
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Override Log (P5)</CardTitle>
              </CardHeader>
              <CardContent>
                {overrides.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No overrides logged yet.</p>
                ) : (
                  <div className="space-y-2">
                    {overrides.map((o: any) => (
                      <div key={o.id} className={`border rounded-md p-2 text-xs ${o.type === "confirmed" ? "border-green-500/20 bg-green-500/5" : "border-orange-500/20 bg-orange-500/5"}`} data-testid={`override-entry-${o.id}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{o.field}</span>
                          <Badge className={`text-[10px] ${o.type === "confirmed" ? "bg-green-500/20 text-green-300 border-green-500/30" : "bg-orange-500/20 text-orange-300 border-orange-500/30"}`}>
                            {o.type === "confirmed" ? "Confirmed" : "Overridden"}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground">
                          AI: <span className="font-mono">{o.agentValue}</span>
                          {o.type === "overridden" && <> → Analyst: <span className="font-mono text-orange-300">{o.analystValue}</span></>}
                        </div>
                        {o.note && <p className="text-muted-foreground/80 mt-1 italic">"{o.note}"</p>}
                        <p className="text-muted-foreground/50 mt-1">{new Date(o.timestamp).toLocaleTimeString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Package Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Issuer</span><span className="font-medium">Ford Motor Company</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Current Rating</span><span className="font-medium">Ba1 / Stable</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Model-Indicated</span><span className="font-semibold text-orange-400">Baa3</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Gap</span><span className="font-medium text-orange-300">+1 notch</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Confirmed</span><span className={overrides.filter((o:any)=>o.type==="confirmed").length > 0 ? "text-green-400" : "text-muted-foreground"}>{overrides.filter((o:any)=>o.type==="confirmed").length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Overridden</span><span className={overrides.filter((o:any)=>o.type==="overridden").length > 0 ? "text-orange-400" : "text-muted-foreground"}>{overrides.filter((o:any)=>o.type==="overridden").length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Package Status</span><span className={packageConfirmed ? "text-green-400 font-medium" : "text-muted-foreground"}>{packageConfirmed ? "Released ✓" : "Draft"}</span></div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
