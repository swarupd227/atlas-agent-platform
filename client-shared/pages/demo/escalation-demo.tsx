import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, CheckCircle2, Circle, Clock, Mail, MessageSquare,
  Loader2, Play, RotateCcw, Calendar, Users, Ticket, User,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StepStatus = "pending" | "running" | "complete" | "error";
type Integration = "jira" | "msgraph";

interface EscalationStep {
  id: number;
  title: string;
  tool: string;
  integration: Integration;
  status: StepStatus;
  mode: "live" | "demo" | null;
  durationMs?: number;
  result?: unknown;
}

interface EscalationSummary {
  ticketKey: string;
  ticketSummary: string;
  assigneeEmail: string;
  availableSlot: string | null;
  teamsMessagePosted: boolean;
  emailSent: boolean;
  totalMs: number;
  mode: "live" | "demo";
}

interface DemoStatus {
  status: "idle" | "running" | "complete" | "error";
  startedAt: string | null;
  completedAt: string | null;
  steps: EscalationStep[];
  summary: EscalationSummary | null;
  elapsedMs: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

const INTEGRATION_LABEL: Record<Integration, string> = {
  jira:    "Jira",
  msgraph: "Microsoft Graph",
};

const INTEGRATION_COLOR: Record<Integration, string> = {
  jira:    "text-[#0052CC]",
  msgraph: "text-[#00A4EF]",
};

const INTEGRATION_BG: Record<Integration, string> = {
  jira:    "bg-[#0052CC]/10 border-[#0052CC]/20",
  msgraph: "bg-[#00A4EF]/10 border-[#00A4EF]/20",
};

const TOOL_DESCRIPTIONS: Record<string, string> = {
  jira_search:                "JQL search for Critical open tickets via Jira Cloud REST API v3",
  graph_get_user:             "Azure AD user profile lookup by email (UPN) via Microsoft Graph",
  graph_list_calendar_events: "Checking 4-hour calendar window to find first available slot",
  graph_post_teams_message:   "Posting escalation alert to Teams engineering channel",
  graph_send_email:           "Sending summary email to assignee + manager via Outlook (with attribution footer)",
};

const TOOL_ICON: Record<string, JSX.Element> = {
  jira_search:                <Ticket className="w-3.5 h-3.5" />,
  graph_get_user:             <User className="w-3.5 h-3.5" />,
  graph_list_calendar_events: <Calendar className="w-3.5 h-3.5" />,
  graph_post_teams_message:   <MessageSquare className="w-3.5 h-3.5" />,
  graph_send_email:           <Mail className="w-3.5 h-3.5" />,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function IntegrationIcon({ integration }: { integration: Integration }) {
  if (integration === "jira") return <Ticket className="w-3.5 h-3.5" />;
  return <Users className="w-3.5 h-3.5" />;
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
    <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-semibold">LIVE</span>
  );
  return (
    <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border border-slate-600/40 bg-slate-700/20 text-slate-500 font-semibold">DEMO</span>
  );
}

function ResultPanel({ result, tool }: { result: unknown; tool: string }) {
  if (!result) return null;
  const data = result as Record<string, unknown>;

  if (tool === "jira_search") {
    const issues = (data.issues as any[]) ?? [];
    const first  = issues[0];
    if (!first) return <span className="text-slate-500 text-xs italic">No critical tickets found</span>;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[#0052CC] font-bold">{first.key}</span>
          <Badge variant="destructive" className="text-[10px] px-1 py-0">Critical</Badge>
          <span className="text-[10px] text-slate-400">{first.status}</span>
        </div>
        <p className="text-xs text-slate-300 leading-snug">{(first.summary ?? "").slice(0, 120)}</p>
        {first.assignee && <p className="text-[11px] text-slate-500">Assignee: {first.assignee}</p>}
      </div>
    );
  }

  if (tool === "graph_get_user") {
    return (
      <div className="flex flex-col gap-0.5">
        <p className="text-xs text-slate-200 font-medium">{String(data.display_name ?? "—")}</p>
        <p className="text-[11px] text-slate-400">{String(data.job_title ?? "")} · {String(data.department ?? "")}</p>
        <p className="text-[11px] text-slate-500">{String(data.email ?? "")}</p>
      </div>
    );
  }

  if (tool === "graph_list_calendar_events") {
    const events = (data.events as any[]) ?? [];
    const avail  = (data.first_available as string | null) ?? null;
    return (
      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-slate-400">{events.length} event{events.length !== 1 ? "s" : ""} in next 4 hours</p>
        {avail && (
          <p className="text-xs text-emerald-400 font-medium">
            First available: {new Date(avail).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC
          </p>
        )}
        <div className="flex flex-col gap-0.5 mt-0.5">
          {events.slice(0, 3).map((e: any, i: number) => (
            <div key={i} className="text-[10px] text-slate-500 truncate">
              {new Date(e.start ?? 0).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} — {e.subject}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tool === "graph_post_teams_message") {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
        <span className="text-xs text-slate-300">Posted to Teams engineering channel</span>
        {data.id && <span className="text-[10px] text-slate-600 font-mono">{String(data.id).slice(0, 20)}…</span>}
      </div>
    );
  }

  if (tool === "graph_send_email") {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <Mail className="w-3 h-3 text-emerald-400" />
          <span className="text-xs text-slate-300">Email sent with attribution footer</span>
        </div>
        {data.subject && <p className="text-[10px] text-slate-500 truncate">{String(data.subject)}</p>}
        {data.to && <p className="text-[10px] text-slate-600">To: {Array.isArray(data.to) ? data.to.join(", ") : String(data.to)}</p>}
      </div>
    );
  }

  return null;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EscalationDemo() {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/demo/escalation/status");
      if (res.ok) setStatus(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (!status) return;
    if (status.status === "running") {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchStatus, 800);
      }
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
  }, [status?.status]);

  const handleTrigger = async () => {
    setIsTriggering(true);
    try {
      await fetch("/api/demo/escalation/trigger", { method: "POST" });
      await fetchStatus();
    } finally {
      setIsTriggering(false);
    }
  };

  const handleReset = async () => {
    await fetch("/api/demo/escalation/reset", { method: "POST" });
    setStatus(null);
    await fetchStatus();
  };

  const steps = status?.steps ?? [];
  const summary = status?.summary ?? null;
  const demoStatus = status?.status ?? "idle";
  const isRunning = demoStatus === "running";
  const isDone    = demoStatus === "complete";
  const elapsedSec = status ? (status.elapsedMs / 1000).toFixed(1) : "0.0";

  return (
    <div className="min-h-screen bg-[#0a0e17] text-slate-200 font-mono p-6">
      {/* Header */}
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-5 h-5 text-rose-400" />
              <h1 className="text-xl font-bold text-white tracking-tight">Escalation Agent</h1>
              <Badge variant="outline" className="text-[10px] border-rose-500/30 text-rose-400">Wave 3</Badge>
            </div>
            <p className="text-sm text-slate-400 leading-snug">
              Cross-system human-in-the-loop demo: Jira → Azure AD → Calendar → Teams → Email
            </p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] border-[#0052CC]/40 text-[#0052CC] bg-[#0052CC]/5">Jira Cloud</Badge>
              <Badge variant="outline" className="text-[10px] border-[#00A4EF]/40 text-[#00A4EF] bg-[#00A4EF]/5">Microsoft Graph</Badge>
              <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">Exchange</Badge>
              <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">Teams</Badge>
              <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">Azure AD</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isDone && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-slate-700 text-slate-400 hover:text-white h-8"
                onClick={handleReset}
                data-testid="button-reset-demo"
              >
                <RotateCcw className="w-3 h-3 mr-1.5" />
                Reset
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white"
              onClick={handleTrigger}
              disabled={isRunning || isTriggering}
              data-testid="button-trigger-demo"
            >
              {isRunning || isTriggering ? (
                <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Running…</>
              ) : (
                <><Play className="w-3 h-3 mr-1.5" />Run Demo</>
              )}
            </Button>
          </div>
        </div>

        {/* Status bar */}
        {demoStatus !== "idle" && (
          <div className="flex items-center gap-3 mb-4 p-2.5 rounded bg-slate-900/60 border border-slate-800/60">
            <div className={`w-2 h-2 rounded-full ${
              isRunning ? "bg-amber-400 animate-pulse" :
              isDone    ? "bg-emerald-400" :
                          "bg-rose-400"
            }`} />
            <span className="text-xs text-slate-400 capitalize">{demoStatus}</span>
            {isRunning && <span className="text-xs text-amber-400">{elapsedSec}s</span>}
            {isDone && summary && (
              <span className="text-xs text-emerald-400">{(summary.totalMs / 1000).toFixed(1)}s total</span>
            )}
            {isDone && summary && (
              <ModeBadge mode={summary.mode} />
            )}
          </div>
        )}

        {/* Steps */}
        {steps.length > 0 && (
          <div className="flex flex-col gap-3 mb-6">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`rounded border p-3.5 transition-all ${
                  step.status === "running"  ? "border-amber-500/30 bg-amber-500/5" :
                  step.status === "complete" ? "border-slate-700/60 bg-slate-900/40" :
                  step.status === "error"    ? "border-rose-500/30 bg-rose-500/5" :
                                               "border-slate-800/50 bg-slate-900/20 opacity-50"
                }`}
                data-testid={`step-${step.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    <StatusIcon status={step.status} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold text-slate-200">{step.title}</span>
                      <ModeBadge mode={step.mode} />
                      {step.durationMs !== undefined && (
                        <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />{step.durationMs}ms
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${INTEGRATION_BG[step.integration]} ${INTEGRATION_COLOR[step.integration]}`}>
                        <IntegrationIcon integration={step.integration} />
                        {INTEGRATION_LABEL[step.integration]}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                        {TOOL_ICON[step.tool] ?? null}
                        <code className="font-mono">{step.tool}</code>
                      </span>
                    </div>
                    {step.status !== "pending" && (
                      <p className="text-[11px] text-slate-500 mb-2 italic">
                        {TOOL_DESCRIPTIONS[step.tool] ?? step.tool}
                      </p>
                    )}
                    {step.status === "complete" && step.result && (
                      <div className="mt-1.5 pl-2 border-l border-slate-700/50">
                        <ResultPanel result={step.result} tool={step.tool} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Idle state */}
        {demoStatus === "idle" && (
          <div className="rounded border border-slate-800/50 bg-slate-900/20 p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-800/60 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-rose-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200 mb-1">Cross-System Escalation Agent</p>
              <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                When a critical Jira ticket is detected, this agent automatically looks up the assignee in Azure AD,
                checks their calendar, posts an alert to Teams, and sends a summary email — all in one orchestrated run.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 text-[11px] text-slate-600 mt-1">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center text-[10px] font-bold">1</span>
                <span className="font-mono">jira_search</span> — Find critical open ticket
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center text-[10px] font-bold">2</span>
                <span className="font-mono">graph_get_user</span> — Look up assignee in Azure AD
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center text-[10px] font-bold">3</span>
                <span className="font-mono">graph_list_calendar_events</span> — Check availability
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center text-[10px] font-bold">4</span>
                <span className="font-mono">graph_post_teams_message</span> — Alert engineering channel
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center text-[10px] font-bold">5</span>
                <span className="font-mono">graph_send_email</span> — Summary email with attribution
              </div>
            </div>
            <Button
              size="sm"
              className="mt-2 h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white"
              onClick={handleTrigger}
              disabled={isTriggering}
              data-testid="button-trigger-demo-idle"
            >
              <Play className="w-3 h-3 mr-1.5" />
              Run Demo
            </Button>
          </div>
        )}

        {/* Summary panel */}
        {isDone && summary && (
          <div className="mt-2 rounded border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="text-xs font-semibold text-emerald-400 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Escalation Complete — {(summary.totalMs / 1000).toFixed(1)}s · <ModeBadge mode={summary.mode} />
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
              <div>
                <span className="text-slate-500">Ticket</span>
                <p className="text-slate-200 font-semibold font-mono">{summary.ticketKey}</p>
              </div>
              <div>
                <span className="text-slate-500">Assignee</span>
                <p className="text-slate-200">{summary.assigneeEmail}</p>
              </div>
              {summary.availableSlot && (
                <div>
                  <span className="text-slate-500">First available slot</span>
                  <p className="text-emerald-400">
                    {new Date(summary.availableSlot).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC
                  </p>
                </div>
              )}
              <div>
                <span className="text-slate-500">Outbound</span>
                <div className="flex items-center gap-2 mt-0.5">
                  {summary.teamsMessagePosted && (
                    <span className="flex items-center gap-1 text-[#00A4EF]">
                      <MessageSquare className="w-3 h-3" />Teams
                    </span>
                  )}
                  {summary.emailSent && (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <Mail className="w-3 h-3" />Email
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-slate-600 leading-snug">
              {summary.mode === "live"
                ? "✓ Real API calls made against live Jira Cloud and Microsoft Graph endpoints."
                : "ℹ No credentials configured — running with representative mock data. Connect Jira and Microsoft Graph integrations to see live results."}
            </p>
          </div>
        )}

        {/* Agent attribution note */}
        <div className="mt-4 text-[10px] text-slate-700 border-t border-slate-800/50 pt-3">
          Outbound communications (Teams + Email) include an agent attribution footer:
          <span className="text-slate-600 italic"> "Sent by Escalation Agent via Atlas Agent Orchestrator"</span>
          — ensuring transparency to human recipients.
          Audit events of type <code className="font-mono">agent_communication</code> are emitted for each outbound message.
        </div>
      </div>
    </div>
  );
}
