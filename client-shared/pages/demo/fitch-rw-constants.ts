export const FITCH_RW_COLOR = "#1B5FAA";
export const FITCH_RW_ACCENT = "#F59E0B";

export const TARGET_ISSUER = "Boeing Co.";
export const TARGET_ID = "BA-001";
export const TARGET_RATING = "BBB-";
export const TARGET_ACTION = "Rating Watch Negative";

export interface FitchRWIssuer {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  rating: string;
  cdsBps: number;
  cdsDelta7d: number;
  equityDrawdown: number;
  newsSentiment: number;
  status: "stable" | "watch" | "flagged";
}

export const FITCH_RW_ISSUERS: FitchRWIssuer[] = [
  {
    id: "BA-001",
    ticker: "BA",
    name: "Boeing Co.",
    sector: "Aerospace & Defense",
    rating: "BBB-",
    cdsBps: 187,
    cdsDelta7d: +42,
    equityDrawdown: -18.4,
    newsSentiment: -0.61,
    status: "flagged",
  },
  {
    id: "RTX-001",
    ticker: "RTX",
    name: "RTX Corporation",
    sector: "Aerospace & Defense",
    rating: "BBB+",
    cdsBps: 64,
    cdsDelta7d: +5,
    equityDrawdown: -2.1,
    newsSentiment: +0.12,
    status: "stable",
  },
  {
    id: "LMT-001",
    ticker: "LMT",
    name: "Lockheed Martin",
    sector: "Aerospace & Defense",
    rating: "A-",
    cdsBps: 41,
    cdsDelta7d: -2,
    equityDrawdown: +0.8,
    newsSentiment: +0.27,
    status: "stable",
  },
  {
    id: "GE-001",
    ticker: "GE",
    name: "GE Aerospace",
    sector: "Industrials",
    rating: "BBB",
    cdsBps: 78,
    cdsDelta7d: +18,
    equityDrawdown: -7.3,
    newsSentiment: -0.34,
    status: "watch",
  },
  {
    id: "HON-001",
    ticker: "HON",
    name: "Honeywell International",
    sector: "Industrials",
    rating: "A",
    cdsBps: 38,
    cdsDelta7d: +1,
    equityDrawdown: -1.2,
    newsSentiment: +0.08,
    status: "stable",
  },
  {
    id: "SPX-001",
    ticker: "SPX",
    name: "SPX Technologies",
    sector: "Industrials",
    rating: "BB+",
    cdsBps: 142,
    cdsDelta7d: +31,
    equityDrawdown: -14.6,
    newsSentiment: -0.52,
    status: "flagged",
  },
  {
    id: "CAT-001",
    ticker: "CAT",
    name: "Caterpillar Inc.",
    sector: "Heavy Equipment",
    rating: "A",
    cdsBps: 35,
    cdsDelta7d: -3,
    equityDrawdown: -0.5,
    newsSentiment: +0.21,
    status: "stable",
  },
  {
    id: "MMM-001",
    ticker: "MMM",
    name: "3M Company",
    sector: "Diversified Industrials",
    rating: "BBB-",
    cdsBps: 91,
    cdsDelta7d: +9,
    equityDrawdown: -4.1,
    newsSentiment: -0.18,
    status: "stable",
  },
];

export interface FitchRWAgent {
  key: string;
  name: string;
  step: number;
  role: string;
  model: string;
  tools: string[];
  color: string;
  bgColor: string;
}

export const FITCH_RW_AGENTS: FitchRWAgent[] = [
  {
    key: "marketSignalScanner",
    name: "FITCH-RW-001 Market Signal Scanner",
    step: 1,
    role: "CDS Spread & Market Signal Analysis",
    model: "gpt-4.1",
    tools: ["get_cds_spreads", "get_equity_prices", "get_news_sentiment", "get_credit_watch_signals"],
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    key: "filingIntelligenceAgent",
    name: "FITCH-RW-002 Filing Intelligence Agent",
    step: 2,
    role: "SEC Filing Comprehension & Covenant Analysis",
    model: "gpt-4.1",
    tools: ["get_filing_extracts", "get_financial_ratios", "get_risk_factors", "get_management_discussion"],
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
  },
  {
    key: "peerBenchmarkingAgent",
    name: "FITCH-RW-003 Peer Benchmarking Agent",
    step: 3,
    role: "Peer Group Analysis & Ratio Benchmarking",
    model: "gpt-4.1",
    tools: ["get_peer_cohort", "get_ratio_benchmarks", "get_rating_distribution", "compute_relative_position"],
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
  {
    key: "ratingActionMemoAgent",
    name: "FITCH-RW-004 Rating Action Memo Agent",
    step: 4,
    role: "Fitch Methodology Application & Report Generation",
    model: "gpt-4.1",
    tools: ["get_validator_queue", "submit_rating_memo", "get_committee_decision", "log_regulatory_disclosure"],
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
];

export const FITCH_RW_KPI_DATA = [
  { id: "monitored",       label: "Issuers Monitored",   value: "847",    unit: "",      sub: "IG Corporate universe" },
  { id: "flagged",         label: "Flagged Today",        value: "2",      unit: "",      sub: "CDS breach + fundamentals" },
  { id: "memos-pending",   label: "Memos Pending",        value: "1",      unit: "",      sub: "Awaiting committee review" },
  { id: "avg-processing",  label: "Avg Processing Time",  value: "3.8",    unit: "min",   sub: "4-agent sequential pipeline" },
];
