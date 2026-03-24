import { useState, useCallback, useEffect } from "react";

export const FITCH_DEMO_BANK_ID = "RSSD-3511777";
export const FITCH_DEMO_BANK_NAME = "Silicon Valley Bank";

export const FITCH_AGENTS = [
  {
    role: "ffiec_ingestor",
    name: "FFIEC Data Ingestor",
    description: "Ingests FFIEC Call Report data and normalizes CAMELS sub-scores for 847 monitored banks",
    mcpServers: ["Fitch FFIEC Data Platform"],
    tools: ["get_call_report_data","get_peer_benchmark","get_cre_concentration","get_loan_tape"],
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    role: "ratio_engine",
    name: "Financial Ratio Engine",
    description: "Computes derived financial ratios, trend vectors, and anomaly flags across the portfolio",
    mcpServers: ["Fitch FFIEC Data Platform","Fitch Analytics Engine"],
    tools: ["get_call_report_data","get_cre_concentration","get_early_warning_scores"],
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/20",
  },
  {
    role: "transcript_analyst",
    name: "Transcript & Filing Analyst",
    description: "NLP analysis of earnings calls, 10-K/10-Q filings, and management tone shifts",
    mcpServers: ["Fitch NLP Intelligence Engine"],
    tools: ["get_earnings_transcripts","get_sec_filings","get_news_sentiment"],
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
  },
  {
    role: "news_processor",
    name: "News Signal Processor",
    description: "Monitors financial news for credit-relevant events with 1–3 quarter leading signal",
    mcpServers: ["Fitch NLP Intelligence Engine","Fitch Analytics Engine"],
    tools: ["get_news_sentiment","get_rating_history"],
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  {
    role: "risk_scorer",
    name: "Composite Risk Scorer",
    description: "Fuses CAMELS, NLP, and market signals into composite early warning scores; validates against SVB backtest",
    mcpServers: ["Fitch Analytics Engine"],
    tools: ["get_early_warning_scores","get_stress_test","get_svb_backtest_data"],
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/20",
  },
  {
    role: "report_generator",
    name: "Assessment Report Generator",
    description: "Assembles full 28-page credit assessment packages with rating recommendation and peer comparison",
    mcpServers: ["Fitch Report Engine","Fitch Analytics Engine"],
    tools: ["get_report_templates","get_compliance_checklist","get_historical_reports","generate_report_package"],
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
  },
] as const;

export const FITCH_MCP_SERVERS = [
  {
    name: "Fitch FFIEC Data Platform",
    tools: 4,
    color: "text-blue-400",
    description: "FFIEC Call Reports, peer benchmarks, CRE concentration, loan tape",
  },
  {
    name: "Fitch NLP Intelligence Engine",
    tools: 3,
    color: "text-emerald-400",
    description: "Earnings transcripts, SEC filings, news sentiment",
  },
  {
    name: "Fitch Analytics Engine",
    tools: 4,
    color: "text-rose-400",
    description: "Risk scores, SVB backtest, stress tests, rating history",
  },
  {
    name: "Fitch Report Engine",
    tools: 4,
    color: "text-cyan-400",
    description: "Report templates, historical reports, package generation",
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
          agentName: d.agentName,
          tool: d.data.tool,
          success: d.success,
          serverName: d.data.serverName,
          recordCount: d.data.recordCount,
          timestamp: new Date().toISOString(),
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
          role: d.role,
          agentName: d.agentName,
          success: d.success,
          resultSummary: null,
          completedAt: new Date().toISOString(),
          toolsCalled: agentTools,
        });
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
