import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Loader2,
  BookOpen,
  ExternalLink,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  XCircle,
  Clock,
  Lock,
  UserCheck,
  Building2,
  Cpu,
  Zap,
  Terminal,
} from "lucide-react";
import { BLACKROCK2_AGENTS } from "./blackrock2-constants";

// ─── Types ────────────────────────────────────────────────────────────────────

type PortalStatus = "pending" | "removed" | "failed" | "deferred" | "held" | "approved";
type AgentNodeId = "termination_intake" | "portal_discovery" | "active_trade_check" | "access_removal" | "removal_verification" | "audit_evidence";
type ScenarioId = "happy_path" | "portal_unreachable" | "pending_trades" | "admin_access";

interface Portal {
  name: string;
  authType: "SAML SSO" | "Certificate" | "API Key" | "Token" | "Password";
  riskTier: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  role: string;
  status: PortalStatus;
  note?: string;
}

interface Employee {
  id: string;
  name: string;
  title: string;
  department: string;
  terminationDate: string;
  lastWorkingDay: string;
  manager: string;
}

interface ScenarioDef {
  id: ScenarioId;
  label: string;
  subtitle: string;
  icon: "check" | "warn" | "clock" | "lock";
  employee: Employee;
  portals: Portal[];
  finalPortals: Portal[];
}

interface LiveEvent {
  id: number;
  time: string;
  agentName: string;
  type: string;
  tool?: string;
  success?: boolean;
  message: string;
}

// ─── Agent name → node ID map ─────────────────────────────────────────────────

const AGENT_NAME_MAP: Record<string, AgentNodeId> = {
  "Termination Intake Agent":       "termination_intake",
  "Portal Discovery Agent":         "portal_discovery",
  "Active Trade Check Agent":       "active_trade_check",
  "Access Removal Executor Agent":  "access_removal",
  "Removal Verification Agent":     "removal_verification",
  "Audit & Evidence Agent":         "audit_evidence",
};

// ─── Scenario data ────────────────────────────────────────────────────────────

const EMPLOYEE_KESSLER: Employee = {
  id: "EMP-4821",
  name: "Robert Kessler",
  title: "Fixed Income Portfolio Manager",
  department: "Fixed Income Trading",
  terminationDate: "2026-03-21",
  lastWorkingDay: "2026-03-20",
  manager: "Diana Chen (MD, Fixed Income)",
};

const PORTALS_KESSLER: Portal[] = [
  { name: "DTCC (DTC)",           authType: "SAML SSO",    riskTier: "MEDIUM",   role: "Settlement_Participant", status: "pending" },
  { name: "Euroclear",            authType: "Certificate", riskTier: "HIGH",     role: "Settlement_Officer",     status: "pending" },
  { name: "Clearstream",          authType: "Certificate", riskTier: "HIGH",     role: "Custodian_Access",       status: "pending" },
  { name: "SWIFT (MyStandards)",  authType: "Token",       riskTier: "HIGH",     role: "Message_Sender",         status: "pending" },
  { name: "Bloomberg TOMS",       authType: "API Key",     riskTier: "MEDIUM",   role: "Trade_Blotter_Writer",   status: "pending" },
  { name: "ICE Connect",          authType: "SAML SSO",    riskTier: "LOW",      role: "Data_Viewer",            status: "pending" },
];
const FINAL_KESSLER: Portal[] = PORTALS_KESSLER.map(p => ({ ...p, status: "removed" as PortalStatus }));

const EMPLOYEE_NAKAMURA: Employee = {
  id: "EMP-2293",
  name: "Karen Nakamura",
  title: "Asia Pacific Equities Trader",
  department: "Equities — APAC Desk",
  terminationDate: "2026-03-21",
  lastWorkingDay: "2026-03-20",
  manager: "Oliver Park (MD, APAC Equities)",
};
const PORTALS_NAKAMURA: Portal[] = [
  { name: "DTCC (DTC)",    authType: "SAML SSO",    riskTier: "MEDIUM", role: "Settlement_Participant", status: "pending" },
  { name: "Euroclear",     authType: "Certificate", riskTier: "HIGH",   role: "Trade_Viewer",          status: "pending" },
  { name: "Bloomberg TOMS",authType: "API Key",     riskTier: "MEDIUM", role: "Trade_Blotter_Writer",  status: "pending" },
  { name: "HKEX CCASS",   authType: "Password",    riskTier: "MEDIUM", role: "Clearing_Participant",  status: "pending" },
];
const FINAL_NAKAMURA: Portal[] = [
  { ...PORTALS_NAKAMURA[0], status: "removed" },
  { ...PORTALS_NAKAMURA[1], status: "removed" },
  { ...PORTALS_NAKAMURA[2], status: "removed" },
  { ...PORTALS_NAKAMURA[3], status: "deferred", note: "Portal unreachable — retry scheduled via ServiceNow" },
];

const EMPLOYEE_THOMPSON: Employee = {
  id: "EMP-7711",
  name: "Marcus Thompson",
  title: "European Fixed Income Trader",
  department: "Fixed Income — EMEA Desk",
  terminationDate: "2026-03-21",
  lastWorkingDay: "2026-03-20",
  manager: "Sarah Liu (MD, EMEA Fixed Income)",
};
const PORTALS_THOMPSON: Portal[] = [
  { name: "DTCC (DTC)",   authType: "SAML SSO",    riskTier: "MEDIUM", role: "Settlement_Participant", status: "pending" },
  { name: "Euroclear",    authType: "Certificate", riskTier: "HIGH",   role: "Settlement_Officer",     status: "pending" },
  { name: "Clearstream",  authType: "Certificate", riskTier: "HIGH",   role: "Custodian_Access",       status: "pending" },
];
const FINAL_THOMPSON: Portal[] = [
  { ...PORTALS_THOMPSON[0], status: "removed" },
  { ...PORTALS_THOMPSON[1], status: "deferred", note: "Removal deferred — 2 pending trades settle 2026-03-23" },
  { ...PORTALS_THOMPSON[2], status: "removed" },
];

const EMPLOYEE_WHITFIELD: Employee = {
  id: "EMP-9034",
  name: "James Whitfield",
  title: "Senior Credit Risk Officer",
  department: "Credit Risk — Counterparty",
  terminationDate: "2026-03-21",
  lastWorkingDay: "2026-03-20",
  manager: "Rachel Evans (CRO, Counterparty Risk)",
};
const PORTALS_WHITFIELD: Portal[] = [
  { name: "DTCC (DTC)",          authType: "SAML SSO",    riskTier: "MEDIUM",   role: "Settlement_Participant",  status: "pending" },
  { name: "Euroclear",           authType: "Certificate", riskTier: "HIGH",     role: "Settlement_Viewer",       status: "pending" },
  { name: "Bloomberg TOMS",      authType: "API Key",     riskTier: "MEDIUM",   role: "Trade_Blotter_Writer",   status: "pending" },
  { name: "ICE Connect",         authType: "SAML SSO",    riskTier: "LOW",      role: "Data_Viewer",            status: "pending" },
  { name: "SWIFT (MyStandards)", authType: "Token",       riskTier: "CRITICAL", role: "SWIFT_Admin",            status: "pending" },
];
const FINAL_WHITFIELD: Portal[] = PORTALS_WHITFIELD.map(p => ({ ...p, status: "approved" as PortalStatus }));

const SCENARIOS: ScenarioDef[] = [
  { id: "happy_path",        label: "Happy Path",        subtitle: "6 portals, clean removal",   icon: "check", employee: EMPLOYEE_KESSLER,  portals: PORTALS_KESSLER,  finalPortals: FINAL_KESSLER  },
  { id: "portal_unreachable",label: "Portal Unreachable",subtitle: "HKEX CCASS offline",         icon: "warn",  employee: EMPLOYEE_NAKAMURA, portals: PORTALS_NAKAMURA, finalPortals: FINAL_NAKAMURA },
  { id: "pending_trades",    label: "Pending Trades",    subtitle: "Euroclear hold required",    icon: "clock", employee: EMPLOYEE_THOMPSON, portals: PORTALS_THOMPSON, finalPortals: FINAL_THOMPSON },
  { id: "admin_access",      label: "Admin Access",      subtitle: "SWIFT admin approval gate",  icon: "lock",  employee: EMPLOYEE_WHITFIELD,portals: PORTALS_WHITFIELD,finalPortals: FINAL_WHITFIELD},
];

// ─── Pipeline banner ──────────────────────────────────────────────────────────

const PIPELINE_NODES: { id: AgentNodeId; label: string; short: string }[] = [
  { id: "termination_intake",   label: "Termination Intake",      short: "Intake"    },
  { id: "portal_discovery",     label: "Portal Discovery",         short: "Discovery" },
  { id: "active_trade_check",   label: "Active Trade Check",       short: "Trade Chk" },
  { id: "access_removal",       label: "Access Removal Executor",  short: "Removal"   },
  { id: "removal_verification", label: "Removal Verification",     short: "Verify"    },
  { id: "audit_evidence",       label: "Audit & Evidence",         short: "Audit"     },
];

function PipelineBanner({ activeAgent, completedAgents }: { activeAgent: AgentNodeId | null; completedAgents: Set<AgentNodeId> }) {
  return (
    <div className="flex items-center justify-center gap-1 py-3 px-4 flex-wrap" data-testid="bk2-pipeline-banner">
      {PIPELINE_NODES.map((node, i) => {
        const isDone   = completedAgents.has(node.id);
        const isActive = activeAgent === node.id && !isDone;
        return (
          <div key={node.id} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
              isActive  ? "bg-primary/20 border-primary text-primary ring-1 ring-primary/50 animate-pulse" :
              isDone    ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" :
                          "bg-muted/50 border-border text-muted-foreground"
            }`} data-testid={`bk2-node-${node.id}`}>
              {isDone
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                : isActive
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Circle className="w-3.5 h-3.5" />
              }
              <span className="hidden sm:inline">{node.short}</span>
            </div>
            {i < PIPELINE_NODES.length - 1 && (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScenarioIcon({ icon, className }: { icon: ScenarioDef["icon"]; className?: string }) {
  if (icon === "check") return <CheckCircle2 className={className} />;
  if (icon === "warn")  return <AlertTriangle className={className} />;
  if (icon === "clock") return <Clock className={className} />;
  return <Lock className={className} />;
}

function PortalStatusBadge({ status }: { status: PortalStatus }) {
  if (status === "removed")  return <Badge variant="outline" className="text-[9px] border-emerald-500/50 text-emerald-400 bg-emerald-500/5">Removed</Badge>;
  if (status === "failed")   return <Badge variant="outline" className="text-[9px] border-red-500/50 text-red-400 bg-red-500/5">Failed</Badge>;
  if (status === "deferred") return <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-400 bg-amber-500/5">Deferred</Badge>;
  if (status === "held")     return <Badge variant="outline" className="text-[9px] border-orange-500/50 text-orange-400 bg-orange-500/5">On Hold</Badge>;
  if (status === "approved") return <Badge variant="outline" className="text-[9px] border-emerald-500/50 text-emerald-400 bg-emerald-500/5">Approved & Removed</Badge>;
  return <Badge variant="outline" className="text-[9px] border-muted-foreground/40 text-muted-foreground">Pending</Badge>;
}

function RiskTierDot({ tier }: { tier: Portal["riskTier"] }) {
  const color = tier === "CRITICAL" ? "bg-red-500" : tier === "HIGH" ? "bg-orange-500" : tier === "MEDIUM" ? "bg-amber-500" : "bg-emerald-500";
  return <div className={`w-2 h-2 rounded-full shrink-0 ${color}`} title={`Risk: ${tier}`} />;
}

function AgentTeamCard() {
  const [open, setOpen] = useState(false);
  const agentRows = [
    { ...BLACKROCK2_AGENTS.terminationIntake,     badge: "bg-blue-500/20 text-blue-400 border-blue-500/30"   },
    { ...BLACKROCK2_AGENTS.portalDiscovery,        badge: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" },
    { ...BLACKROCK2_AGENTS.activeTradeCheck,       badge: "bg-amber-500/20 text-amber-400 border-amber-500/30"   },
    { ...BLACKROCK2_AGENTS.accessRemovalExecutor,  badge: "bg-orange-500/20 text-orange-400 border-orange-500/30"},
    { ...BLACKROCK2_AGENTS.removalVerification,    badge: "bg-teal-500/20 text-teal-400 border-teal-500/30"      },
    { ...BLACKROCK2_AGENTS.auditEvidence,          badge: "bg-purple-500/20 text-purple-400 border-purple-500/30"},
  ];
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-bk2-agent-team">
          <BookOpen className="w-4 h-4" />
          Agent Team
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? "" : "-rotate-90"}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2 border-emerald-500/30 bg-emerald-500/5 absolute right-4 z-50 w-[560px] max-w-[90vw]">
          <CardContent className="p-4 space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <h4 className="font-semibold text-emerald-400">Pre-configured Offboarding Agent Team</h4>
            </div>
            <p className="text-xs text-muted-foreground">6 specialised agents — SailPoint, Partner Portal Registry, Settlement systems, Splunk, and ServiceNow.</p>
            <div className="space-y-2">
              {agentRows.map((agent) => (
                <div key={agent.id} className="flex items-start gap-2 rounded-lg border border-border/40 bg-background/50 p-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold truncate">{agent.name}</span>
                      <Badge variant="outline" className={`text-[8px] px-1.5 py-0 h-4 ${agent.badge}`}>{agent.riskTier}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{agent.description}</p>
                  </div>
                  <Link href={`/agents/${agent.id}?tab=traces`}>
                    <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-[10px] shrink-0" data-testid={`button-view-bk2-agent-${agent.id}`}>
                      Runs & Traces <ExternalLink className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function BlackRock2Demo() {
  const [selectedId, setSelectedId]           = useState<ScenarioId>("happy_path");
  const [running, setRunning]                 = useState(false);
  const [complete, setComplete]               = useState(false);
  const [portals, setPortals]                 = useState<Portal[]>([]);
  const [activeAgent, setActiveAgent]         = useState<AgentNodeId | null>(null);
  const [completedAgents, setCompletedAgents] = useState<Set<AgentNodeId>>(new Set());
  const [liveEvents, setLiveEvents]           = useState<LiveEvent[]>([]);
  const [liveAgentName, setLiveAgentName]     = useState<string | null>(null);

  const liveFeedRef = useRef<HTMLDivElement>(null);
  const esRef       = useRef<EventSource | null>(null);
  const liveEventId = useRef(0);

  const scenario = SCENARIOS.find((s) => s.id === selectedId)!;

  const removedCount  = portals.filter(p => p.status === "removed" || p.status === "approved").length;
  const deferredCount = portals.filter(p => p.status === "deferred").length;
  const failedCount   = portals.filter(p => p.status === "failed").length;
  const heldCount     = portals.filter(p => p.status === "held").length;

  const stopLiveRun = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setLiveAgentName(null);
  }, []);

  const startLiveRun = useCallback((scenarioId: string) => {
    stopLiveRun();
    setLiveEvents([]);
    liveEventId.current = 0;
    setRunning(true);
    setComplete(false);
    setActiveAgent(null);
    setCompletedAgents(new Set());

    const addEvent = (type: string, agentName: string, message: string, tool?: string, success?: boolean) => {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
      setLiveEvents(prev => [...prev, { id: liveEventId.current++, time, agentName, type, tool, success, message }]);
    };

    const es = new EventSource(`/demo-api/blackrock2/live-run?scenarioId=${scenarioId}`);
    esRef.current = es;

    es.addEventListener("run_start", (e) => {
      const d = JSON.parse(e.data);
      addEvent("run_start", "Atlas Runtime", `Live run started — scenario: ${d.scenarioId}`);
    });
    es.addEventListener("setup", (e) => {
      const d = JSON.parse(e.data);
      addEvent("setup", "Atlas Runtime", d.message);
    });
    es.addEventListener("agent_start", (e) => {
      const d = JSON.parse(e.data);
      setLiveAgentName(d.agentName);
      const nodeId = AGENT_NAME_MAP[d.agentName];
      if (nodeId) setActiveAgent(nodeId);
      addEvent("agent_start", d.agentName, `Executing ${d.agentName}...`);
    });
    es.addEventListener("agent_event", (e) => {
      const d = JSON.parse(e.data);
      const { agentName, type, data, tool, success } = d;
      if (type === "tool_call_start") {
        addEvent("tool_call_start", agentName, `→ Calling: ${data?.tool || tool}`, data?.tool || tool);
      } else if (type === "tool_call_result") {
        const t = data?.tool || tool || "tool";
        const errLabel: Record<string, string> = {
          ECONNREFUSED:                    "unreachable — deferred",
          PENDING_SETTLEMENTS_BLOCK:       "blocked — pending settlements",
          PENDING_SETTLEMENTS_FOUND:       "pending settlements detected",
          CRITICAL_TIER_APPROVAL_REQUIRED: "blocked — manager approval required",
        };
        const errText = data?.error ? (errLabel[data.error] || data.error) : "failed";
        addEvent("tool_call_result", agentName, `${success ? "✓" : "✗"} ${t}: ${success ? "success" : errText}`, t, success);
      } else if (type === "final_analysis") {
        addEvent("final_analysis", agentName, `Analysis complete — ${data?.steps ?? 0} steps`);
      }
    });
    es.addEventListener("agent_complete", (e) => {
      const d = JSON.parse(e.data);
      const nodeId = AGENT_NAME_MAP[d.agentName];
      if (nodeId) {
        setCompletedAgents(prev => new Set([...prev, nodeId]));
        setActiveAgent(null);
      }
      addEvent("agent_complete", d.agentName, `${d.success ? "✓ Complete" : "✗ Failed"}: ${d.message}`);
    });
    es.addEventListener("run_complete", (e) => {
      const d = JSON.parse(e.data);
      addEvent("run_complete", "Atlas Runtime", `All 6 agents completed — ${d.caseId} — traces available in Runs & Traces`);
      const sc = SCENARIOS.find(s => s.id === scenarioId);
      if (sc) setPortals(sc.finalPortals.map(p => ({ ...p })));
      es.close();
      esRef.current = null;
      setRunning(false);
      setComplete(true);
      setLiveAgentName(null);
      setActiveAgent(null);
    });
    es.addEventListener("error", (e: any) => {
      const d = e.data ? JSON.parse(e.data) : {};
      addEvent("error", "Atlas Runtime", `Error: ${d.message || "Connection error"}`);
      es.close();
      esRef.current = null;
      setRunning(false);
      setLiveAgentName(null);
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setRunning(false);
        esRef.current = null;
        setLiveAgentName(null);
      }
    };
  }, [stopLiveRun]);

  useEffect(() => () => { stopLiveRun(); }, [stopLiveRun]);

  useEffect(() => {
    if (liveFeedRef.current) liveFeedRef.current.scrollTop = liveFeedRef.current.scrollHeight;
  }, [liveEvents]);

  const reset = () => {
    stopLiveRun();
    setRunning(false);
    setComplete(false);
    setPortals(scenario.portals.map(p => ({ ...p })));
    setActiveAgent(null);
    setCompletedAgents(new Set());
    setLiveEvents([]);
    liveEventId.current = 0;
  };

  useEffect(() => { reset(); }, [selectedId]);

  const handleRun = () => {
    if (running) return;
    setPortals(scenario.portals.map(p => ({ ...p })));
    startLiveRun(selectedId);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b bg-background">
        {/* Title row */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-muted-foreground" />
            <div>
              <h1 className="text-sm font-bold leading-tight">AIM Portal Offboarding Suite</h1>
              <p className="text-[11px] text-muted-foreground leading-tight">BlackRock Investment Management · Atlas Agent Orchestration</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AgentTeamCard />
          </div>
        </div>

        {/* Scenario tabs */}
        <div className="flex items-center gap-0 overflow-x-auto px-5 py-2 text-sm">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id as ScenarioId)}
              disabled={running}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-xs transition-all whitespace-nowrap mr-1 ${
                selectedId === s.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              data-testid={`bk2-scenario-${s.id}`}
            >
              <ScenarioIcon icon={s.icon} className="w-3.5 h-3.5" />
              {s.label}
              <span className="text-muted-foreground font-normal hidden sm:inline">— {s.subtitle}</span>
            </button>
          ))}
        </div>

        {/* Pipeline */}
        <div className="border-t bg-muted/20">
          <PipelineBanner activeAgent={activeAgent} completedAgents={completedAgents} />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden gap-0">
        {/* Left panel: employee + portals */}
        <div className="w-72 shrink-0 flex flex-col gap-3 p-4 border-r overflow-y-auto">
          {/* Employee */}
          <Card>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                Terminated Employee
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-1.5">
              <div>
                <p className="text-sm font-semibold">{scenario.employee.name}</p>
                <p className="text-[11px] text-muted-foreground">{scenario.employee.title}</p>
                <p className="text-[11px] text-muted-foreground">{scenario.employee.department}</p>
              </div>
              <div className="border-t pt-1.5 space-y-0.5">
                <p className="text-[10px] text-muted-foreground">ID: <span className="font-mono text-foreground">{scenario.employee.id}</span></p>
                <p className="text-[10px] text-muted-foreground">Termination: <span className="text-foreground">{scenario.employee.terminationDate}</span></p>
                <p className="text-[10px] text-muted-foreground">Last day: <span className="text-foreground">{scenario.employee.lastWorkingDay}</span></p>
                <p className="text-[10px] text-muted-foreground line-clamp-2">Manager: <span className="text-foreground">{scenario.employee.manager}</span></p>
              </div>
            </CardContent>
          </Card>

          {/* Portal list */}
          <Card className="flex-1">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Partner Portals
                <span className="ml-auto text-[10px] font-normal">
                  {removedCount}/{(portals.length || scenario.portals.length)} removed
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-1.5">
              {(portals.length > 0 ? portals : scenario.portals).map((portal, i) => (
                <div key={i} className={`flex flex-col gap-0.5 p-2 rounded-md border text-[11px] ${
                  portal.status === "removed" || portal.status === "approved" ? "bg-emerald-500/5 border-emerald-500/20" :
                  portal.status === "failed"   ? "bg-red-500/5 border-red-500/20" :
                  portal.status === "deferred" ? "bg-amber-500/5 border-amber-500/20" :
                  portal.status === "held"     ? "bg-orange-500/5 border-orange-500/20" :
                                                  "bg-muted/30 border-transparent"
                }`} data-testid={`bk2-portal-${i}`}>
                  <div className="flex items-center gap-1.5">
                    <RiskTierDot tier={portal.riskTier} />
                    <span className="font-medium truncate flex-1">{portal.name}</span>
                    <PortalStatusBadge status={portal.status} />
                  </div>
                  <div className="pl-3.5 flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                    <span>{portal.authType}</span>
                    <span className="opacity-50">·</span>
                    <span className="truncate">{portal.role}</span>
                  </div>
                  {portal.note && (
                    <p className="pl-3.5 text-[10px] text-amber-400 italic">{portal.note}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Summary stats */}
          {(running || complete) && (
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex flex-col items-center p-2 rounded-md border bg-emerald-500/5 border-emerald-500/20" data-testid="bk2-stat-removed">
                <span className="text-xl font-bold text-emerald-400">{removedCount}</span>
                <span className="text-[10px] text-muted-foreground">Removed</span>
              </div>
              <div className="flex flex-col items-center p-2 rounded-md border bg-amber-500/5 border-amber-500/20" data-testid="bk2-stat-deferred">
                <span className="text-xl font-bold text-amber-400">{deferredCount + heldCount}</span>
                <span className="text-[10px] text-muted-foreground">Deferred / Held</span>
              </div>
              {failedCount > 0 && (
                <div className="col-span-2 flex flex-col items-center p-2 rounded-md border bg-red-500/5 border-red-500/20" data-testid="bk2-stat-failed">
                  <span className="text-xl font-bold text-red-400">{failedCount}</span>
                  <span className="text-[10px] text-muted-foreground">Unreachable</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right panel: Live Atlas Runtime */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Controls bar */}
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b bg-background shrink-0">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Live Atlas Runtime</span>
              {running && (
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  <Badge variant="outline" className="text-[10px] border-primary/40 text-primary animate-pulse">
                    Running
                  </Badge>
                  {liveAgentName && (
                    <span className="text-[10px] text-muted-foreground font-mono">{liveAgentName}</span>
                  )}
                </div>
              )}
              {complete && (
                <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400">
                  Complete
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">Claude Sonnet · MCP · AIM Offboarding Suite</span>
              {complete && (
                <Button size="sm" variant="outline" onClick={reset} className="gap-1.5" data-testid="button-bk2-rerun">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Run Again
                </Button>
              )}
              {!running && !complete && (
                <Button size="sm" onClick={handleRun} className="gap-1.5" data-testid="button-bk2-run">
                  Run Scenario
                </Button>
              )}
            </div>
          </div>

          {/* Empty state */}
          {liveEvents.length === 0 && !running && !complete && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center px-8" data-testid="bk2-empty-state">
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
                <Terminal className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">{scenario.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{scenario.subtitle}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {scenario.portals.length} portal{scenario.portals.length !== 1 ? "s" : ""} · {scenario.employee.name} ({scenario.employee.id})
                </p>
              </div>
              <p className="text-xs text-muted-foreground max-w-sm">
                6 Claude-powered agents will execute via the AIM Offboarding Suite MCP server. Real tool calls, real traces.
              </p>
              <Button size="sm" className="mt-2" onClick={handleRun} data-testid="button-bk2-run-center">
                Run Scenario
              </Button>
            </div>
          )}

          {/* Live event feed */}
          {(liveEvents.length > 0 || running) && (
            <div
              ref={liveFeedRef}
              className="flex-1 overflow-y-auto px-5 py-4 space-y-1 font-mono text-[11px]"
              data-testid="bk2-live-feed"
            >
              {(() => {
                // Group consecutive identical tool_call_result entries (same tool + same success)
                const grouped: Array<{ ev: LiveEvent; count: number }> = [];
                for (const ev of liveEvents) {
                  const last = grouped[grouped.length - 1];
                  if (
                    last &&
                    ev.type === "tool_call_result" &&
                    last.ev.type === "tool_call_result" &&
                    ev.tool === last.ev.tool &&
                    ev.success === last.ev.success
                  ) {
                    last.count++;
                  } else {
                    grouped.push({ ev, count: 1 });
                  }
                }
                return grouped.map(({ ev, count }) => (
                  <div key={ev.id} className="flex items-start gap-2.5" data-testid={`bk2-live-event-${ev.id}`}>
                    <span className="text-muted-foreground/60 shrink-0 pt-0.5 w-16">{ev.time}</span>
                    <span className={`leading-relaxed flex items-center gap-1.5 ${
                      ev.type === "run_start" || ev.type === "setup"     ? "text-muted-foreground" :
                      ev.type === "agent_start"                          ? "text-primary font-semibold" :
                      ev.type === "tool_call_start"                      ? "text-blue-400" :
                      ev.type === "tool_call_result" && ev.success       ? "text-emerald-400" :
                      ev.type === "tool_call_result" && !ev.success      ? "text-red-400" :
                      ev.type === "agent_complete" && ev.message.startsWith("✓") ? "text-emerald-400" :
                      ev.type === "agent_complete"                       ? "text-amber-400" :
                      ev.type === "run_complete"                         ? "text-primary font-semibold" :
                      ev.type === "final_analysis"                       ? "text-muted-foreground" :
                      ev.type === "error"                                ? "text-red-400" :
                      "text-foreground"
                    }`}>
                      {ev.type === "tool_call_start"                            && <Zap         className="inline w-3 h-3 mr-0.5 text-blue-400 shrink-0" />}
                      {ev.type === "tool_call_result" && ev.success             && <CheckCircle2 className="inline w-3 h-3 mr-0.5 text-emerald-400 shrink-0" />}
                      {ev.type === "tool_call_result" && ev.success === false   && <XCircle      className="inline w-3 h-3 mr-0.5 text-red-400 shrink-0" />}
                      {ev.type === "agent_start"                                && <Cpu         className="inline w-3 h-3 mr-0.5 text-primary shrink-0" />}
                      {ev.type === "run_complete"                               && <CheckCircle2 className="inline w-3 h-3 mr-0.5 text-emerald-400 shrink-0" />}
                      {ev.type === "error"                                      && <XCircle      className="inline w-3 h-3 mr-0.5 text-red-400 shrink-0" />}
                      {ev.type === "agent_complete" && ev.message.startsWith("✓") && <CheckCircle2 className="inline w-3 h-3 mr-0.5 text-emerald-400 shrink-0" />}
                      {ev.type === "agent_complete" && !ev.message.startsWith("✓") && <AlertTriangle className="inline w-3 h-3 mr-0.5 text-amber-400 shrink-0" />}
                      <span>{ev.message}</span>
                      {count > 1 && (
                        <span className="ml-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-muted border border-border text-muted-foreground shrink-0">
                          ×{count}
                        </span>
                      )}
                    </span>
                  </div>
                ));
              })()}

              {running && liveEvents.length === 0 && (
                <div className="flex items-center gap-2.5 text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Initializing agents…</span>
                </div>
              )}

              {running && liveEvents.length > 0 && (
                <div className="flex items-center gap-2.5 text-muted-foreground mt-1" data-testid="bk2-running-indicator">
                  <span className="w-16 shrink-0" />
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="italic">Agent working…</span>
                </div>
              )}

              {complete && (
                <div className="flex items-center gap-2.5 mt-3 pt-3 border-t" data-testid="bk2-complete-banner">
                  <span className="w-16 shrink-0" />
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-emerald-400 font-semibold">
                    {failedCount > 0 || deferredCount > 0
                      ? `Offboarding complete with exceptions — ${removedCount} portals removed, ${deferredCount + failedCount} deferred/unreachable`
                      : `Offboarding complete — ${removedCount}/${portals.length} portals removed. SOX audit package filed.`}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
