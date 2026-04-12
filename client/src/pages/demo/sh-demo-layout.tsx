import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Shield,
  Wrench,
  Zap,
  Brain,
  RefreshCw,
  ChevronRight,
  BookOpen,
  Lock,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SHScenarioConfig {
  scenario: string;
  title: string;
  subtitle: string;
  domain: string;
  agentCode: string;
  pipelineId: string;
  agentId: string;
  accentColor: string;
  complianceFrameworks: string[];
}

type Screen = "incident" | "healing" | "resolution";

interface SHEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  ts: number;
}

interface PhaseState {
  key: string;
  label: string;
  status: "pending" | "active" | "complete";
}

interface RunStartPayload {
  incidentTitle: string;
  incidentSeverity: string;
  incidentType: string;
  incidentSummary: string;
  agentName: string;
  agentCode: string;
  industry: string;
  triggerMetric: { label: string; before: string; after: string; unit: string };
}

interface RunCompletePayload {
  headline: string;
  autonomousActions: string[];
  metricsRestored: Array<{ label: string; value: string }>;
}

interface LiveRunState {
  status: "idle" | "connecting" | "running" | "complete" | "error";
  screen: Screen;
  events: SHEvent[];
  phases: PhaseState[];
  runStart: RunStartPayload | null;
  runComplete: RunCompletePayload | null;
  errorMessage: string | null;
}

const PHASE_ORDER = ["detect", "diagnose", "remediate", "validate"];

const PHASE_DEFAULTS: PhaseState[] = PHASE_ORDER.map(k => ({
  key: k,
  label: k.charAt(0).toUpperCase() + k.slice(1),
  status: "pending",
}));

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useSHLiveRun(scenario: string) {
  const [state, setState] = useState<LiveRunState>({
    status: "idle",
    screen: "incident",
    events: [],
    phases: PHASE_DEFAULTS,
    runStart: null,
    runComplete: null,
    errorMessage: null,
  });

  const esRef = useRef<EventSource | null>(null);
  const counterRef = useRef(0);

  const trigger = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    setState({
      status: "connecting",
      screen: "healing",
      events: [],
      phases: PHASE_DEFAULTS,
      runStart: null,
      runComplete: null,
      errorMessage: null,
    });

    const es = new EventSource(`/demo-api/sh-healing/stream?scenario=${encodeURIComponent(scenario)}`);
    esRef.current = es;

    const addEvent = (type: string, payload: Record<string, unknown>) => {
      setState(prev => ({
        ...prev,
        events: [...prev.events, { id: String(counterRef.current++), type, payload, ts: Date.now() }],
      }));
    };

    const updatePhase = (phaseKey: string, newStatus: PhaseState["status"]) => {
      setState(prev => ({
        ...prev,
        phases: prev.phases.map(p => {
          if (p.key === phaseKey) return { ...p, status: newStatus };
          if (newStatus === "active" && PHASE_ORDER.indexOf(p.key) < PHASE_ORDER.indexOf(phaseKey)) {
            return { ...p, status: "complete" };
          }
          return p;
        }),
      }));
    };

    es.addEventListener("run_start", e => {
      const payload = JSON.parse((e as MessageEvent).data);
      setState(prev => ({ ...prev, status: "running", runStart: payload as RunStartPayload }));
      addEvent("run_start", payload);
    });

    es.addEventListener("setup", e => {
      addEvent("setup", JSON.parse((e as MessageEvent).data));
    });

    es.addEventListener("phase_start", e => {
      const payload = JSON.parse((e as MessageEvent).data);
      updatePhase(payload.phase, "active");
      addEvent("phase_start", payload);
    });

    es.addEventListener("skill_invoked", e => {
      addEvent("skill_invoked", JSON.parse((e as MessageEvent).data));
    });

    es.addEventListener("runbook_triggered", e => {
      addEvent("runbook_triggered", JSON.parse((e as MessageEvent).data));
    });

    es.addEventListener("policy_checked", e => {
      addEvent("policy_checked", JSON.parse((e as MessageEvent).data));
    });

    es.addEventListener("phase_complete", e => {
      const payload = JSON.parse((e as MessageEvent).data);
      updatePhase(payload.phase, "complete");
      addEvent("phase_complete", payload);
    });

    es.addEventListener("run_complete", e => {
      const payload = JSON.parse((e as MessageEvent).data);
      es.close();
      esRef.current = null;
      setState(prev => ({
        ...prev,
        status: "complete",
        screen: "resolution",
        runComplete: payload as RunCompletePayload,
        phases: prev.phases.map(p => ({ ...p, status: "complete" })),
      }));
      addEvent("run_complete", payload);
    });

    es.addEventListener("error", e => {
      const payload = (e as MessageEvent).data ? JSON.parse((e as MessageEvent).data) : { message: "Connection error" };
      es.close();
      esRef.current = null;
      setState(prev => ({
        ...prev,
        status: "error",
        errorMessage: payload.message || "Self-healing pipeline error",
      }));
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setState(prev => {
          if (prev.status === "complete") return prev;
          return { ...prev, status: "error", errorMessage: "Connection to self-healing pipeline lost" };
        });
      }
    };
  }, [scenario]);

  const reset = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setState({
      status: "idle",
      screen: "incident",
      events: [],
      phases: PHASE_DEFAULTS,
      runStart: null,
      runComplete: null,
      errorMessage: null,
    });
  }, []);

  useEffect(() => () => { esRef.current?.close(); }, []);

  return { state, trigger, reset };
}

// ─── Phase Icons ──────────────────────────────────────────────────────────────

const PHASE_ICONS: Record<string, React.ReactNode> = {
  detect: <Activity className="h-4 w-4" />,
  diagnose: <Brain className="h-4 w-4" />,
  remediate: <Wrench className="h-4 w-4" />,
  validate: <Shield className="h-4 w-4" />,
};

// ─── Event Row ────────────────────────────────────────────────────────────────

function EventRow({ ev }: { ev: SHEvent }) {
  if (ev.type === "setup") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
        <span>{ev.payload.message as string}</span>
      </div>
    );
  }

  if (ev.type === "phase_start") {
    const phaseKey = ev.payload.phase as string;
    return (
      <div className="flex items-center gap-2 px-3 py-2 mt-2 bg-muted/50 rounded-md border border-border">
        <div className="text-primary shrink-0">{PHASE_ICONS[phaseKey] || <Activity className="h-4 w-4" />}</div>
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          Phase: {ev.payload.label as string}
        </span>
        <div className="ml-auto">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (ev.type === "skill_invoked") {
    return (
      <div className="px-3 py-2 border-l-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20 ml-2 rounded-r-md">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Zap className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">Skill</span>
          <span className="text-[11px] font-medium text-amber-800 dark:text-amber-200 ml-1">{ev.payload.skillName as string}</span>
          {ev.payload.duration && (
            <span className="ml-auto text-[10px] text-amber-600/70 dark:text-amber-400/70">{ev.payload.duration as string}</span>
          )}
        </div>
        <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">{ev.payload.finding as string}</p>
      </div>
    );
  }

  if (ev.type === "runbook_triggered") {
    return (
      <div className="px-3 py-2 border-l-2 border-purple-400 bg-purple-50 dark:bg-purple-950/20 ml-2 rounded-r-md">
        <div className="flex items-center gap-1.5 mb-0.5">
          <BookOpen className="h-3 w-3 text-purple-600 dark:text-purple-400 shrink-0" />
          <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">Runbook</span>
          <span className="text-[11px] font-medium text-purple-800 dark:text-purple-200 ml-1">{ev.payload.runbookName as string}</span>
        </div>
        <p className="text-[11px] text-purple-800 dark:text-purple-200 leading-relaxed">{ev.payload.result as string}</p>
      </div>
    );
  }

  if (ev.type === "policy_checked") {
    const outcome = (ev.payload.outcome as string) || "";
    const isOk = outcome.toLowerCase().startsWith("compliant") || outcome.toLowerCase().startsWith("on track");
    return (
      <div className={`px-3 py-2 border-l-2 ml-2 rounded-r-md ${isOk ? "border-green-400 bg-green-50 dark:bg-green-950/20" : "border-red-400 bg-red-50 dark:bg-red-950/20"}`}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <Lock className={`h-3 w-3 shrink-0 ${isOk ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} />
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${isOk ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>Policy</span>
          <span className={`text-[11px] font-medium ml-1 ${isOk ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"}`}>{ev.payload.policyName as string}</span>
        </div>
        <p className={`text-[11px] leading-relaxed ${isOk ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"}`}>{outcome}</p>
      </div>
    );
  }

  if (ev.type === "phase_complete") {
    return (
      <div className="px-3 py-2 bg-green-50 dark:bg-green-950/30 rounded-md border border-green-200 dark:border-green-800">
        <div className="flex items-center gap-1.5 mb-1">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
          <span className="text-[11px] font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
            {ev.payload.label as string} — Complete
          </span>
        </div>
        {ev.payload.analysis && (
          <p className="text-[11px] text-green-800 dark:text-green-200 leading-relaxed">{ev.payload.analysis as string}</p>
        )}
      </div>
    );
  }

  return null;
}

// ─── Phase Progress Bar ───────────────────────────────────────────────────────

function PhaseProgressBar({ phases }: { phases: PhaseState[] }) {
  return (
    <div className="flex items-center gap-0 w-full">
      {phases.map((phase, idx) => {
        const isComplete = phase.status === "complete";
        const isActive = phase.status === "active";
        const isPending = phase.status === "pending";
        return (
          <div key={phase.key} className="flex items-center flex-1 min-w-0">
            <div className={`flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
              isComplete ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300" :
              isActive ? "bg-primary/10 text-primary animate-pulse" :
              "bg-muted/40 text-muted-foreground"
            }`}>
              <span className="shrink-0">{
                isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                isActive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                PHASE_ICONS[phase.key]
              }</span>
              <span className="truncate capitalize">{phase.label}</span>
            </div>
            {idx < phases.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mx-0.5" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Screen 1: Incident ───────────────────────────────────────────────────────

function IncidentScreen({
  config,
  onTrigger,
}: {
  config: SHScenarioConfig;
  onTrigger: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6">
      {/* Alert header */}
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0 mt-0.5 rounded-lg bg-red-100 dark:bg-red-900/50 p-2.5">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge className="bg-red-600 text-white border-0 text-[10px] uppercase tracking-wide px-2">Critical</Badge>
              <Badge variant="outline" className="text-[10px] border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">{config.domain}</Badge>
              <span className="text-xs text-muted-foreground font-mono">{config.agentCode}</span>
            </div>
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-1">{config.title}</h2>
            <p className="text-sm text-muted-foreground">{config.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Incident details */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">Incident Briefing</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Atlas has detected an active incident in your {config.domain.toLowerCase()} environment.
            The self-healing agent <strong className="text-foreground">{config.agentCode}</strong> is
            standing by to autonomously diagnose, remediate, and validate the issue — with a full compliance
            audit trail.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Agent</p>
            <p className="text-xs font-semibold font-mono">{config.agentCode}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Industry</p>
            <p className="text-xs font-semibold">{config.domain}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Phases</p>
            <p className="text-xs font-semibold">4 — Detect → Validate</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Mode</p>
            <p className="text-xs font-semibold text-green-600 dark:text-green-400">Autonomous</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Compliance Frameworks</p>
          <div className="flex flex-wrap gap-1.5">
            {config.complianceFrameworks.map(fw => (
              <Badge key={fw} variant="outline" className="text-[10px] font-medium">{fw}</Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Healing phases preview */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">Self-Healing Pipeline</h3>
        <div className="space-y-2">
          {["Detect Anomaly", "Diagnose Root Cause", "Execute Remediation", "Validate & Close"].map((label, idx) => (
            <div key={label} className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
                {idx + 1}
              </div>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <Button
        data-testid="button-trigger-healing"
        size="lg"
        className="w-full text-base font-semibold py-6"
        onClick={onTrigger}
      >
        <Activity className="h-5 w-5 mr-2" />
        Trigger Atlas Self-Healing
      </Button>
    </div>
  );
}

// ─── Screen 2: Live Healing ───────────────────────────────────────────────────

function HealingScreen({
  state,
  config,
}: {
  state: LiveRunState;
  config: SHScenarioConfig;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  const { runStart, events, phases, status } = state;

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const filteredEvents = events.filter(e =>
    ["setup", "phase_start", "skill_invoked", "runbook_triggered", "policy_checked", "phase_complete"].includes(e.type)
  );

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Phase progress */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Self-Healing Progress</span>
          {status === "running" && (
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Live</span>
            </div>
          )}
        </div>
        <PhaseProgressBar phases={phases} />
      </div>

      {/* Incident snapshot */}
      {runStart && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 flex items-center gap-4">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-900 dark:text-red-100 truncate">{runStart.incidentTitle}</p>
            <p className="text-xs text-red-700 dark:text-red-300">{runStart.incidentType} · {runStart.industry}</p>
          </div>
          {runStart.triggerMetric && (
            <div className="shrink-0 text-right hidden sm:block">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{runStart.triggerMetric.label}</p>
              <div className="flex items-center gap-1 justify-end text-xs font-semibold">
                <span className="text-muted-foreground line-through">{runStart.triggerMetric.before}</span>
                <TrendingDown className="h-3 w-3 text-red-500" />
                <span className="text-red-600 dark:text-red-400">{runStart.triggerMetric.after}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live event feed */}
      <div
        ref={feedRef}
        data-testid="sh-event-feed"
        className="flex-1 overflow-y-auto rounded-xl border border-border bg-card p-3 space-y-2 min-h-0 max-h-[420px]"
      >
        {filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-muted-foreground text-xs">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Connecting to self-healing pipeline…
          </div>
        ) : (
          filteredEvents.map(ev => <EventRow key={ev.id} ev={ev} />)
        )}
      </div>

      {/* Agent identity */}
      <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Shield className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{config.title}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{config.agentCode}</p>
        </div>
        <div className="flex flex-wrap gap-1 justify-end">
          {config.complianceFrameworks.slice(0, 2).map(fw => (
            <Badge key={fw} variant="outline" className="text-[9px] font-medium">{fw}</Badge>
          ))}
        </div>
      </div>

      {state.status === "error" && state.errorMessage && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">
          <strong>Error:</strong> {state.errorMessage}
        </div>
      )}
    </div>
  );
}

// ─── Screen 3: Resolution ─────────────────────────────────────────────────────

function ResolutionScreen({
  state,
  config,
  onReset,
}: {
  state: LiveRunState;
  config: SHScenarioConfig;
  onReset: () => void;
}) {
  const { runComplete } = state;
  if (!runComplete) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-5 py-6">
      {/* Headline */}
      <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-lg bg-green-100 dark:bg-green-900/50 p-2.5">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-green-600 text-white border-0 text-[10px] uppercase tracking-wide px-2">Resolved</Badge>
              <span className="text-xs text-muted-foreground font-mono">{config.agentCode}</span>
            </div>
            <h2 className="text-lg font-semibold text-green-900 dark:text-green-100">{runComplete.headline}</h2>
          </div>
        </div>
      </div>

      {/* Metrics restored */}
      {runComplete.metricsRestored?.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Metrics Restored</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {runComplete.metricsRestored.map(m => (
              <div key={m.label} className="rounded-lg bg-muted/40 p-3 flex items-start gap-3">
                <TrendingUp className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{m.label}</p>
                  <p className="text-xs font-semibold text-foreground">{m.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Autonomous actions */}
      {runComplete.autonomousActions?.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Autonomous Actions Taken</h3>
          <ul className="space-y-2">
            {runComplete.autonomousActions.map((action, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Platform intelligence callout */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-start gap-3">
          <Zap className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold mb-1">Atlas Platform Intelligence</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This healing run was fully autonomous — no human intervention required.
              Atlas's industry-aware agent network diagnosed and resolved the {config.domain.toLowerCase()} incident
              while maintaining compliance with {config.complianceFrameworks.slice(0, 2).join(", ")}.
              All events were captured in an immutable audit trail.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          data-testid="button-run-again"
          variant="outline"
          className="flex-1"
          onClick={onReset}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Run Again
        </Button>
        <Link href="/demo" className="flex-1">
          <Button data-testid="button-back-to-demo-center" variant="default" className="w-full">
            All Demos
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function SHDemoLayout({ config }: { config: SHScenarioConfig }) {
  const { state, trigger, reset } = useSHLiveRun(config.scenario);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/demo">
            <Button data-testid="button-back" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <ArrowLeft className="h-4 w-4" />
              Demo Center
            </Button>
          </Link>
          <div className="h-4 w-px bg-border" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate">{config.title}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">Self-Healing</Badge>
              <Badge variant="outline" className="text-[10px] shrink-0 hidden sm:inline-flex">{config.domain}</Badge>
            </div>
          </div>
          {state.screen !== "incident" && (
            <div className="flex items-center gap-2">
              {state.status === "running" && (
                <div className="flex items-center gap-1.5 text-xs text-primary">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="hidden sm:inline">Live</span>
                </div>
              )}
              {state.status === "complete" && (
                <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Resolved</span>
                </div>
              )}
              <Button
                data-testid="button-reset"
                variant="ghost"
                size="sm"
                onClick={reset}
                className="text-xs gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
        {state.screen === "incident" && (
          <IncidentScreen config={config} onTrigger={trigger} />
        )}
        {state.screen === "healing" && (
          <HealingScreen state={state} config={config} />
        )}
        {state.screen === "resolution" && (
          <ResolutionScreen state={state} config={config} onReset={reset} />
        )}
      </div>
    </div>
  );
}
