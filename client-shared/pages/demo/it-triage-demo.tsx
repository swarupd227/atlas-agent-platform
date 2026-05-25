import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, CheckCircle2, Circle, Clock, GitBranch,
  Loader2, Play, RotateCcw, Server, Ticket, Wrench,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StepStatus = "pending" | "running" | "complete" | "error";
type Integration = "servicenow" | "github" | "jira";

interface TriageStep {
  id: number;
  title: string;
  tool: string;
  integration: Integration;
  status: StepStatus;
  mode: "live" | "demo" | null;
  durationMs?: number;
  result?: unknown;
  error?: string;
}

interface TriageSummary {
  incidentNumber: string;
  ciName: string;
  commitsFound: number;
  jiraTicketKey: string;
  workNoteAdded: boolean;
  totalMs: number;
  mode: "live" | "demo";
}

interface DemoStatus {
  status: "idle" | "running" | "complete" | "error";
  startedAt: string | null;
  completedAt: string | null;
  steps: TriageStep[];
  summary: TriageSummary | null;
  elapsedMs: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

const INTEGRATION_COLOR: Record<Integration, string> = {
  servicenow: "text-[#62D84E]",
  github:     "text-slate-300",
  jira:       "text-[#0052CC]",
};

const INTEGRATION_BG: Record<Integration, string> = {
  servicenow: "bg-[#62D84E]/10 border-[#62D84E]/20",
  github:     "bg-slate-700/30 border-slate-600/30",
  jira:       "bg-[#0052CC]/10 border-[#0052CC]/20",
};

const INTEGRATION_LABEL: Record<Integration, string> = {
  servicenow: "ServiceNow",
  github:     "GitHub",
  jira:       "Jira",
};

const TOOL_DESCRIPTIONS: Record<string, string> = {
  snow_get_incident: "Fetching incident INC0023451 from ServiceNow Table API",
  snow_get_cmdb_ci:  "Looking up affected CI in CMDB via sys_id reference",
  gh_list_commits:   "Listing recent commits on payment-service main branch",
  jira_create_issue: "Creating engineering ticket in Jira Cloud REST API v3",
  snow_add_work_note:"Adding internal work note with Jira reference back to incident",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function IntegrationIcon({ integration }: { integration: Integration }) {
  if (integration === "servicenow") return <Server className="w-3.5 h-3.5" />;
  if (integration === "github")     return <GitBranch className="w-3.5 h-3.5" />;
  return <Ticket className="w-3.5 h-3.5" />;
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "pending")  return <Circle className="w-4 h-4 text-slate-600" />;
  if (status === "running")  return <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />;
  if (status === "complete") return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  return <AlertCircle className="w-4 h-4 text-rose-400" />;
}

function ModeBadge({ mode }: { mode: "live" | "demo" | null }) {
  if (!mode) return null;
  if (mode === "live") return (
    <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-semibold">
      LIVE
    </span>
  );
  return (
    <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border border-slate-600/40 bg-slate-700/20 text-slate-500 font-semibold">
      DEMO
    </span>
  );
}

function StepCard({ step, expanded, onToggle }: {
  step: TriageStep;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusBorder: Record<StepStatus, string> = {
    pending:  "border-slate-700",
    running:  "border-amber-500/40",
    complete: "border-emerald-500/30",
    error:    "border-rose-500/40",
  };

  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${statusBorder[step.status]}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
        onClick={onToggle}
        data-testid={`step-card-${step.id}`}
      >
        <StatusIcon status={step.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-200">{step.title}</span>
            <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${INTEGRATION_BG[step.integration]} ${INTEGRATION_COLOR[step.integration]}`}>
              <IntegrationIcon integration={step.integration} />
              {INTEGRATION_LABEL[step.integration]}
            </span>
            {step.status === "complete" && <ModeBadge mode={step.mode} />}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 font-mono">{step.tool}</div>
        </div>
        {step.durationMs != null && (
          <span className="text-xs text-slate-500 shrink-0">{step.durationMs}ms</span>
        )}
      </button>

      {step.status === "running" && (
        <div className="px-4 pb-3 text-xs text-amber-400/80 animate-pulse">
          {TOOL_DESCRIPTIONS[step.tool] ?? "Calling tool…"}
        </div>
      )}

      {step.status === "complete" && expanded && step.result && (
        <div className="border-t border-slate-700/50 px-4 py-3">
          <pre className="text-xs text-slate-400 overflow-x-auto whitespace-pre-wrap max-h-64 font-mono leading-relaxed">
            {JSON.stringify(step.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ summary }: { summary: TriageSummary }) {
  const elapsed = (summary.totalMs / 1000).toFixed(1);
  const isLive = summary.mode === "live";
  return (
    <div className="border border-emerald-500/30 rounded-lg bg-emerald-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        <span className="text-sm font-semibold text-emerald-400">Triage complete — {elapsed}s end-to-end</span>
        {isLive
          ? <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold">LIVE APIS</span>
          : <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-600/40 bg-slate-700/20 text-slate-400 font-bold">DEMO DATA</span>
        }
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-slate-500">Incident</div>
          <div className="text-slate-200 font-mono">{summary.incidentNumber}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Affected CI</div>
          <div className="text-slate-200 font-mono">{summary.ciName}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Commits analyzed</div>
          <div className="text-slate-200">{summary.commitsFound} recent commits</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Jira ticket created</div>
          <div className="text-sky-400 font-mono font-semibold">{summary.jiraTicketKey}</div>
        </div>
        <div className="col-span-2">
          <div className="text-xs text-slate-500">Work note added to ServiceNow</div>
          <div className="text-emerald-400">{summary.workNoteAdded ? "✓ Incident linked to Jira ticket" : "—"}</div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ItTriageDemo() {
  const [demoStatus, setDemoStatus] = useState<DemoStatus | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/demo/it-triage/status");
      if (res.ok) {
        const data: DemoStatus = await res.json();
        setDemoStatus(data);
        if (data.status === "complete" || data.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleStart = async () => {
    try {
      const res = await fetch("/api/demo/it-triage/trigger", { method: "POST" });
      if (res.ok) {
        setExpandedStep(null);
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(fetchStatus, 500);
        fetchStatus();
      }
    } catch {
      // ignore
    }
  };

  const handleReset = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    await fetch("/api/demo/it-triage/reset", { method: "POST" });
    setDemoStatus(null);
    setExpandedStep(null);
  };

  const isRunning = demoStatus?.status === "running";
  const isComplete = demoStatus?.status === "complete";
  const steps = demoStatus?.steps ?? [];

  const completedCount = steps.filter(s => s.status === "complete").length;
  const progressPct = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#0a0c10] text-slate-100 p-6 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="w-5 h-5 text-amber-400" />
            <span className="text-xs text-amber-400 font-semibold uppercase tracking-widest">ITSM + DevOps</span>
          </div>
          <h1 className="text-2xl font-bold text-white">IT Incident Triage Agent</h1>
          <p className="text-slate-400 text-sm mt-1">
            A single agent crosses three live systems: ServiceNow (incident + CMDB), GitHub (recent commits), and Jira (ticket creation) — then writes the Jira reference back to the ServiceNow incident.
          </p>
        </div>

        {/* Integration badges */}
        <div className="flex gap-2 flex-wrap">
          {(["servicenow", "github", "jira"] as Integration[]).map(int => (
            <span
              key={int}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${INTEGRATION_BG[int]} ${INTEGRATION_COLOR[int]}`}
            >
              <IntegrationIcon integration={int} />
              {INTEGRATION_LABEL[int]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-slate-600/30 bg-slate-700/20 text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            ~7s end-to-end
          </span>
        </div>

        {/* Controls */}
        <div className="flex gap-3">
          <Button
            onClick={handleStart}
            disabled={isRunning}
            className="bg-amber-500 hover:bg-amber-400 text-black font-semibold"
            data-testid="button-start-triage"
          >
            {isRunning ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running…</>
            ) : (
              <><Play className="w-4 h-4 mr-2" />Run Triage Demo</>
            )}
          </Button>
          {(isComplete || demoStatus?.status === "error") && (
            <Button
              variant="outline"
              onClick={handleReset}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
              data-testid="button-reset-triage"
            >
              <RotateCcw className="w-4 h-4 mr-2" />Reset
            </Button>
          )}
        </div>

        {/* Progress bar */}
        {isRunning && steps.length > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Step {completedCount + 1} of {steps.length}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-500 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Steps */}
        {steps.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Execution Steps</div>
            {steps.map(step => (
              <StepCard
                key={step.id}
                step={step}
                expanded={expandedStep === step.id}
                onToggle={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
              />
            ))}
          </div>
        )}

        {/* Summary */}
        {isComplete && demoStatus?.summary && (
          <SummaryCard summary={demoStatus.summary} />
        )}

        {/* Scenario description */}
        {!demoStatus || demoStatus.status === "idle" ? (
          <div className="border border-slate-700/50 rounded-lg p-5 space-y-4 text-sm text-slate-400">
            <div className="text-slate-300 font-semibold">What this demo does</div>
            <ol className="list-decimal list-inside space-y-2 leading-relaxed">
              <li><span className="text-[#62D84E]">ServiceNow</span> — <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">snow_get_incident</code> fetches INC0023451: payment service 503 errors impacting checkout</li>
              <li><span className="text-[#62D84E]">ServiceNow CMDB</span> — <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">snow_get_cmdb_ci</code> looks up the affected <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">payment-service-prod</code> configuration item</li>
              <li><span className="text-slate-300">GitHub</span> — <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">gh_list_commits</code> finds 3 recent commits including a stripe-sdk bump with a breaking timeout API change</li>
              <li><span className="text-[#0052CC] brightness-150">Jira</span> — <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">jira_create_issue</code> opens <strong className="text-slate-300">PAY-4521</strong> for the engineering team with incident context and commit analysis</li>
              <li><span className="text-[#62D84E]">ServiceNow</span> — <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">snow_add_work_note</code> links the new Jira ticket back to the incident for the ops team</li>
            </ol>
            <div className="text-xs text-slate-500 border-t border-slate-700/50 pt-3">
              <Badge variant="outline" className="text-xs border-slate-600 text-slate-500 mr-2">Real tool calls</Badge>
              Each step invokes the actual MCP tool (snow/github/jira). Steps show <span className="text-emerald-400 font-semibold">LIVE</span> when connected credentials are present, or <span className="text-slate-400 font-semibold">DEMO</span> when falling back to representative data. Connect credentials in Integrations settings to run fully live.
            </div>
          </div>
        ) : null}

      </div>
    </div>
  );
}
