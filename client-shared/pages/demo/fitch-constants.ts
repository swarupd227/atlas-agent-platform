import { useState, useCallback, useEffect } from "react";

export const FITCH_DEMO_BANK_ID = "RSSD-0000010";
export const FITCH_DEMO_BANK_NAME = "RegionalBank-West";

export const FITCH_BANKS = [
  { id: "RSSD-0000001", name: "JPMorgan Chase",   tier: "G-SIB"    },
  { id: "RSSD-0000002", name: "Bank of America",  tier: "G-SIB"    },
  { id: "RSSD-0000003", name: "Wells Fargo",      tier: "G-SIB"    },
  { id: "RSSD-0000004", name: "Citigroup",        tier: "G-SIB"    },
  { id: "RSSD-0000005", name: "Goldman Sachs",    tier: "G-SIB"    },
  { id: "RSSD-0000006", name: "Morgan Stanley",   tier: "G-SIB"    },
  { id: "RSSD-0000007", name: "U.S. Bancorp",     tier: "Regional" },
  { id: "RSSD-0000008", name: "Truist Financial", tier: "Regional" },
  { id: "RSSD-0000009", name: "PNC Financial",    tier: "Regional" },
  { id: "RSSD-0000010", name: "RegionalBank-West",tier: "Community"},
] as const;

export const FITCH_RATIO_DEFS = [
  { id: "npl_ratio",               name: "NPL Ratio",                     threshold: 1.5,   unit: "%",  schedule: "RC-N" },
  { id: "nco_rate",                name: "Net Charge-Off Rate",            threshold: 0.5,   unit: "%",  schedule: "RI-B" },
  { id: "allowance_to_loans",      name: "Allowance / Loans",             threshold: 0.8,   unit: "%",  schedule: "RC-C" },
  { id: "cet1_ratio",              name: "CET1 Capital Ratio",             threshold: 8.0,   unit: "%",  schedule: "RC-R" },
  { id: "tier1_leverage",          name: "Tier 1 Leverage Ratio",          threshold: 5.0,   unit: "%",  schedule: "RC-R" },
  { id: "rwa_density",             name: "RWA Density",                    threshold: 0.8,   unit: "x",  schedule: "RC-R" },
  { id: "roa",                     name: "Return on Assets",               threshold: 0.5,   unit: "%",  schedule: "RI"   },
  { id: "roe",                     name: "Return on Equity",               threshold: 5.0,   unit: "%",  schedule: "RI"   },
  { id: "nim",                     name: "Net Interest Margin",            threshold: 1.5,   unit: "%",  schedule: "RI"   },
  { id: "efficiency_ratio",        name: "Efficiency Ratio",               threshold: 75.0,  unit: "%",  schedule: "RI"   },
  { id: "loan_deposit_ratio",      name: "Loan / Deposit Ratio",          threshold: 90.0,  unit: "%",  schedule: "RC"   },
  { id: "liquid_assets_to_total",  name: "Liquid Assets / Total",         threshold: 10.0,  unit: "%",  schedule: "RC"   },
  { id: "cre_to_total_loans",      name: "CRE / Total Loans",             threshold: 35.0,  unit: "%",  schedule: "RC-C" },
  { id: "commercial_concentration",name: "Commercial Concentration",       threshold: 50.0,  unit: "%",  schedule: "RC-C" },
  { id: "provision_to_avg_loans",  name: "Provision / Avg Loans",         threshold: 0.5,   unit: "%",  schedule: "RI-B" },
  { id: "accruing_past_due_90_pct",name: "Accruing Past Due 90+ %",       threshold: 0.2,   unit: "%",  schedule: "RC-N" },
  { id: "classified_to_tier1",     name: "Classified Assets / Tier 1",    threshold: 25.0,  unit: "%",  schedule: "RC-N" },
  { id: "net_stable_funding_ratio",name: "Net Stable Funding Ratio",       threshold: 100.0, unit: "%",  schedule: "RC-R" },
] as const;

export const FITCH_RISK_TIER_COLORS = {
  Green:        { text: "text-emerald-400",  bg: "bg-emerald-500/10", border: "border-emerald-500/20", badge: "bg-emerald-500/20 text-emerald-300" },
  Amber:        { text: "text-amber-400",    bg: "bg-amber-500/10",   border: "border-amber-500/20",   badge: "bg-amber-500/20 text-amber-300"     },
  "Amber-High": { text: "text-orange-400",   bg: "bg-orange-500/10",  border: "border-orange-500/20",  badge: "bg-orange-500/20 text-orange-300"   },
  Red:          { text: "text-red-400",      bg: "bg-red-500/10",     border: "border-red-500/20",     badge: "bg-red-500/20 text-red-300"         },
} as const;

export const FITCH_SCORE_WEIGHT = {
  structured:  0.55,
  transcript:  0.20,
  filings:     0.10,
  news:        0.10,
  peer:        0.05,
};

export const FITCH_AGENTS = [
  {
    role: "ffiec_ingestor",
    name: "FFIEC Data Ingestor",
    description: "Ingests FFIEC RC-N/RC-C/RI-B/RC-R Call Report data for the 10-bank G-SIB cohort",
    mcpServers: ["Fitch FFIEC Data Platform"],
    tools: ["get_call_report_schedules","get_npa_schedule","get_charge_off_schedule","get_capital_adequacy"],
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    role: "ratio_engine",
    name: "Financial Ratio Engine",
    description: "Computes 18 CAMELS-derived ratios, 8-quarter trends, and threshold breach flags",
    mcpServers: ["Fitch FFIEC Data Platform","Fitch Analytics Engine"],
    tools: ["get_peer_cohort_ratios","get_ratio_trends","get_threshold_breaches"],
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/20",
  },
  {
    role: "transcript_analyst",
    name: "Transcript & Filing Analyst",
    description: "NLP analysis of earnings call sentiment and 10-K risk factor language changes",
    mcpServers: ["Fitch NLP Intelligence Engine"],
    tools: ["get_transcript_sentiment","get_filing_language_changes"],
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
  },
  {
    role: "news_processor",
    name: "News Signal Processor",
    description: "Classifies news articles (routine/emerging/material/crisis) and detects sigma-spikes",
    mcpServers: ["Fitch NLP Intelligence Engine"],
    tools: ["get_news_signals","get_news_volume_trend"],
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  {
    role: "risk_scorer",
    name: "Composite Risk Scorer",
    description: "Fuses CAMELS (55%), transcript (20%), filings (10%), news (10%), peer (5%) into 0–100 score",
    mcpServers: ["Fitch FFIEC Data Platform","Fitch Analytics Engine"],
    tools: ["get_threshold_breaches","get_ratio_trends","get_peer_cohort_ratios"],
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/20",
  },
  {
    role: "report_generator",
    name: "Assessment Report Generator",
    description: "Assembles credit packages including SVB backtest comparison and analyst recommendation",
    mcpServers: ["Fitch Report Engine","Fitch Analytics Engine"],
    tools: ["get_report_template","get_analyst_notes","get_svb_backtest_data","get_rating_history"],
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
  },
] as const;

export const FITCH_MCP_SERVERS = [
  {
    name: "Fitch FFIEC Data Platform",
    tools: 5,
    color: "text-blue-400",
    description: "Call report schedules, NPA, charge-offs, capital adequacy, peer cohort ratios",
  },
  {
    name: "Fitch NLP Intelligence Engine",
    tools: 4,
    color: "text-emerald-400",
    description: "Transcript sentiment, filing language changes, news signals, volume trends",
  },
  {
    name: "Fitch Analytics Engine",
    tools: 3,
    color: "text-rose-400",
    description: "Ratio trends, threshold breaches, SVB backtest data",
  },
  {
    name: "Fitch Report Engine",
    tools: 3,
    color: "text-cyan-400",
    description: "Report templates, analyst notes, rating history",
  },
] as const;

export interface FitchRunResult {
  role: string;
  agentName: string;
  success: boolean;
  resultSummary: Record<string, any> | null;
  completedAt: string;
  toolsCalled: string[];
}

export interface FitchPipelineState {
  status: "idle" | "running" | "complete" | "error";
  currentRole: string | null;
  results: FitchRunResult[];
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  toolEvents: FitchToolEvent[];
}

export interface FitchToolEvent {
  agentName: string;
  tool: string;
  success: boolean;
  serverName: string | null;
  recordCount: number | null;
  timestamp: string;
}

const _pipelineCache: FitchPipelineState = {
  status: "idle",
  currentRole: null,
  results: [],
  startedAt: null,
  completedAt: null,
  error: null,
  toolEvents: [],
};

export function getCachedFitchPipeline(): FitchPipelineState {
  return { ..._pipelineCache };
}

type PipelineListener = (state: FitchPipelineState) => void;
const _listeners = new Set<PipelineListener>();

function notifyListeners() {
  const snap = getCachedFitchPipeline();
  _listeners.forEach(fn => fn(snap));
}

export function useFitchPipeline(): {
  state: FitchPipelineState;
  trigger: () => void;
} {
  const [state, setState] = useState<FitchPipelineState>(() => getCachedFitchPipeline());

  useEffect(() => {
    const listener: PipelineListener = (s) => setState({ ...s });
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const trigger = useCallback(() => {
    if (_pipelineCache.status === "running") return;
    _pipelineCache.status = "running";
    _pipelineCache.currentRole = null;
    _pipelineCache.results = [];
    _pipelineCache.startedAt = new Date().toISOString();
    _pipelineCache.completedAt = null;
    _pipelineCache.error = null;
    _pipelineCache.toolEvents = [];
    notifyListeners();

    const es = new EventSource("/demo-api/fitch/live-run");

    es.addEventListener("agent_start", (e) => {
      const d = JSON.parse(e.data);
      _pipelineCache.currentRole = d.role;
      notifyListeners();
    });

    es.addEventListener("agent_event", (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "tool_call_result") {
        _pipelineCache.toolEvents.push({
          agentName:   d.agentName,
          tool:        d.data.tool,
          success:     d.success,
          serverName:  d.data.serverName,
          recordCount: d.data.recordCount,
          timestamp:   new Date().toISOString(),
        });
        notifyListeners();
      }
    });

    es.addEventListener("agent_complete", (e) => {
      const d = JSON.parse(e.data);
      const existing = _pipelineCache.results.find(r => r.role === d.role);
      if (!existing) {
        const agentTools = _pipelineCache.toolEvents
          .filter(t => t.agentName === d.agentName)
          .map(t => t.tool);
        _pipelineCache.results.push({
          role:          d.role,
          agentName:     d.agentName,
          success:       d.success,
          resultSummary: d.resultSummary ?? null,
          completedAt:   new Date().toISOString(),
          toolsCalled:   agentTools,
        });
      } else {
        if (d.resultSummary && !existing.resultSummary) {
          existing.resultSummary = d.resultSummary;
        }
      }
      notifyListeners();
    });

    es.addEventListener("run_complete", () => {
      _pipelineCache.status = "complete";
      _pipelineCache.currentRole = null;
      _pipelineCache.completedAt = new Date().toISOString();
      es.close();
      notifyListeners();
    });

    es.addEventListener("error", (e: any) => {
      let msg = "Pipeline error";
      try { msg = JSON.parse(e.data)?.message || msg; } catch {}
      _pipelineCache.status = "error";
      _pipelineCache.error = msg;
      es.close();
      notifyListeners();
    });

    es.onerror = () => {
      if (_pipelineCache.status === "running") {
        _pipelineCache.status = "error";
        _pipelineCache.error = "Connection to pipeline lost";
        notifyListeners();
      }
      es.close();
    };
  }, []);

  return { state, trigger };
}
