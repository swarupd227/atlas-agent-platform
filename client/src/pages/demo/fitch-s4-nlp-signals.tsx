import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, FileText, Newspaper, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useFitchPipeline, FITCH_AGENTS } from "./fitch-constants";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, Cell,
} from "recharts";

const SENTIMENT_TREND = [
  { quarter: "2022-Q1", earnings: 0.12, filings: 0.08, news: 0.05 },
  { quarter: "2022-Q2", earnings: -0.04, filings: -0.08, news: -0.12 },
  { quarter: "2022-Q3", earnings: -0.18, filings: -0.22, news: -0.28 },
  { quarter: "2022-Q4", earnings: -0.31, filings: -0.38, news: -0.41 },
  { quarter: "2023-Q1", earnings: -0.44, filings: -0.52, news: -0.58 },
];

const SVB_PHRASES = [
  { phrase: "deposit outflows", count: 28, signal: "HIGH" },
  { phrase: "HTM securities",   count: 24, signal: "HIGH" },
  { phrase: "unrealized losses",count: 19, signal: "HIGH" },
  { phrase: "liquidity pressure",count: 16, signal: "HIGH" },
  { phrase: "wholesale funding", count: 12, signal: "MEDIUM" },
  { phrase: "capital raise",    count: 9,  signal: "MEDIUM" },
  { phrase: "VC clients",       count: 8,  signal: "MEDIUM" },
];

const TRANSCRIPT_SAMPLES = [
  {
    bank: "Silicon Valley Bank",
    quarter: "2022-Q3",
    sentiment: -0.31,
    tone: "Defensive",
    excerpt: "We remain well-capitalized. The HTM portfolio, while carrying unrealized losses, will be held to maturity and does not impact regulatory capital.",
    riskPhrases: ["HTM portfolio","unrealized losses","deposit outflows"],
    flag: true,
  },
  {
    bank: "Silicon Valley Bank",
    quarter: "2022-Q4",
    sentiment: -0.44,
    tone: "Defensive",
    excerpt: "We are taking proactive steps to diversify our deposit base and reduce reliance on the venture capital ecosystem. Liquidity remains adequate.",
    riskPhrases: ["diversify deposit base","venture capital ecosystem","liquidity"],
    flag: true,
  },
  {
    bank: "Pacific Western Bank",
    quarter: "2024-Q3",
    sentiment: -0.22,
    tone: "Cautious",
    excerpt: "We are conducting additional stress tests on our CRE office portfolio given remote work trends affecting property values.",
    riskPhrases: ["stress tests","CRE office","remote work"],
    flag: false,
  },
];

const SIGNAL_COLORS: Record<string, string> = {
  HIGH: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  MEDIUM: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  LOW: "bg-green-500/20 text-green-400 border-green-500/30",
};

export default function FitchS4NlpSignals() {
  const { state } = useFitchPipeline();
  const transcriptAgent = FITCH_AGENTS.find(a => a.role === "transcript_analyst")!;
  const newsAgent = FITCH_AGENTS.find(a => a.role === "news_processor")!;

  const transcriptResult = state.results.find(r => r.role === "transcript_analyst");
  const newsResult = state.results.find(r => r.role === "news_processor");
  const liveTranscript = transcriptResult?.resultSummary;
  const liveNews = newsResult?.resultSummary;

  const { data } = useQuery<any>({
    queryKey: ["/demo-api/fitch/nlp-signals"],
    refetchInterval: 120_000,
  });

  const transcriptsAnalyzed = liveTranscript?.transcriptsAnalyzed ?? 312;
  const filingsProcessed = liveTranscript?.filingsProcessed ?? 847;
  const negativeShifts = liveTranscript?.negativeShifts ?? 28;
  const materialWeakness = liveTranscript?.materialWeaknessFlags ?? 3;
  const articlesScanned = liveNews?.articlesScanned ?? 2840;
  const highImpactEvents = liveNews?.highImpactEvents ?? 7;
  const avgSentiment = liveTranscript?.avgSentimentScore ?? -0.12;

  const topRiskPhrases: string[] = liveTranscript?.topRiskPhrases ?? [];
  const leadingIndicators: any[] = liveNews?.leadingIndicators ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Agent headers */}
      <div className="grid grid-cols-2 gap-3">
        {[transcriptAgent, newsAgent].map(agent => {
          const result = state.results.find(r => r.role === agent.role);
          const isCurrent = state.currentRole === agent.role;
          return (
            <Card key={agent.role} className={`${agent.borderColor} ${agent.bgColor}`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className={`w-4 h-4 ${agent.color}`} />
                  <span className={`text-[11px] font-semibold ${agent.color}`}>{agent.name}</span>
                  {isCurrent && <Badge className="ml-auto bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse text-[9px]">Running…</Badge>}
                  {result && !isCurrent && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 ml-auto" />}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{agent.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {agent.tools.map(t => <span key={t} className="text-[9px] font-mono bg-muted/30 text-muted-foreground/60 px-1 py-0.5 rounded">{t}</span>)}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Transcripts Analyzed</p>
            <p className="text-2xl font-bold">{transcriptsAnalyzed.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">Earnings calls this quarter</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Negative Tone Shifts</p>
            <p className="text-2xl font-bold text-amber-400">{negativeShifts}</p>
            <p className="text-[11px] text-muted-foreground">Defensive tone detected</p>
          </CardContent>
        </Card>
        <Card className="border-rose-500/30">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Material Weakness Flags</p>
            <p className="text-2xl font-bold text-rose-400">{materialWeakness}</p>
            <p className="text-[11px] text-muted-foreground">From 10-K/10-Q filings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">High-Impact News</p>
            <p className="text-2xl font-bold text-amber-400">{highImpactEvents}</p>
            <p className="text-[11px] text-muted-foreground">Credit-relevant events</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        {/* Sentiment trend */}
        <Card className="flex-[6]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">NLP Sentiment Trend — SVB (2022-Q1 to 2023-Q1)</CardTitle>
            <p className="text-[11px] text-muted-foreground">Earnings calls, SEC filings, and news — sentiment deterioration 2 quarters before failure</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={SENTIMENT_TREND} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
                <XAxis dataKey="quarter" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[-0.8, 0.3]} />
                <Tooltip formatter={(v: any) => [v.toFixed(3), ""]} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="earnings" name="Earnings Call" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} />
                <Area type="monotone" dataKey="filings"  name="SEC Filings"  stroke="#ef4444" fill="#ef4444"  fillOpacity={0.15} />
                <Area type="monotone" dataKey="news"     name="News"          stroke="#f59e0b" fill="#f59e0b"  fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Risk phrase frequency */}
        <Card className="flex-[4]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Risk Phrase Frequency</CardTitle>
            <p className="text-[11px] text-muted-foreground">SVB transcripts & filings 2022-Q3 to 2023-Q1</p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1.5 mt-1">
              {SVB_PHRASES.map(p => (
                <div key={p.phrase} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/80 w-36 truncate">{p.phrase}</span>
                  <div className="flex-1 bg-muted/30 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-rose-400" style={{ width: `${(p.count / 30) * 100}%` }} />
                  </div>
                  <span className="text-[10px] w-5 text-right text-rose-400">{p.count}</span>
                  <span className={`text-[9px] px-1 py-0.5 rounded border ${SIGNAL_COLORS[p.signal]}`}>{p.signal}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transcript samples */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            <CardTitle className="text-sm font-medium">Earnings Call Transcript Excerpts — NLP Flagged</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {TRANSCRIPT_SAMPLES.map((ts, i) => (
              <div key={i} className={`rounded-lg border p-3 ${ts.flag ? "border-rose-500/30 bg-rose-500/[0.03]" : "border-border/30"}`}>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold">{ts.bank}</span>
                  <Badge variant="secondary" className="text-[9px]">{ts.quarter}</Badge>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ts.tone === "Defensive" ? SIGNAL_COLORS.HIGH : SIGNAL_COLORS.MEDIUM}`}>{ts.tone}</span>
                  <span className={`text-[10px] font-mono ml-auto ${ts.sentiment < -0.3 ? "text-rose-400" : ts.sentiment < -0.1 ? "text-amber-400" : "text-green-400"}`}>
                    sentiment: {ts.sentiment.toFixed(2)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground/80 italic leading-relaxed mb-2">"{ts.excerpt}"</p>
                <div className="flex flex-wrap gap-1">
                  {ts.riskPhrases.map(p => (
                    <span key={p} className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/20">{p}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Leading indicators */}
      {leadingIndicators.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-amber-400" />
              <CardTitle className="text-sm font-medium">Leading Indicators — News Signal Processor</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {leadingIndicators.map((ind: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <p className="text-[11px]">{ind.signal}</p>
                  <Badge variant="secondary" className="ml-auto text-[9px]">{ind.banks_affected} banks · {ind.lead_time_quarters}Q lead</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
