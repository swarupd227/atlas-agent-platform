import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
  RotateCcw,
  Clock,
  CheckCircle2,
  Loader2,
  ExternalLink,
  ArrowRight,
  XCircle,
  AlertTriangle,
  Undo2,
  FileText,
  MapPin,
  Building2,
  Shield,
  Bell,
  Play,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { KINECTIVE_AGENT, KINECTIVE_MCP_SERVERS, KINECTIVE_SKILLS, KINECTIVE_CONFIG } from "./kinective-constants";

type Scenario = "happy" | "invalid_address" | "system_failure";

interface AuditEntry {
  id: number;
  timestamp: string;
  action: string;
  system: string;
  details: string;
}

interface SystemUpdate {
  system: string;
  status: "success" | "failed" | "rolled_back" | "pending" | "skipped";
  confirmationId: string | null;
  error: string | null;
  rolledBackAt: string | null;
}

const POLL_INTERVAL = 3000;

const SCENARIO_LABELS: Record<Scenario, { label: string; description: string; color: string }> = {
  happy: {
    label: "Happy Path",
    description: "All 11 systems updated successfully",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  invalid_address: {
    label: "Invalid Address",
    description: "USPS validation fails \u2192 human review",
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  system_failure: {
    label: "System Failure + Rollback",
    description: "Card timeout \u2192 automated rollback",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
  },
};

const SYSTEM_COLORS: Record<string, string> = {
  SignPlus: "bg-indigo-600",
  USPS: "bg-blue-600",
  "Kinective Gateway": "bg-emerald-600",
  "Digital Banking": "bg-cyan-600",
  "Statement Vendor": "bg-teal-600",
  "Card Management": "bg-orange-600",
  "Loan Origination": "bg-amber-600",
  CRM: "bg-violet-600",
  "Bill Pay": "bg-sky-600",
  "Fraud Detection": "bg-rose-600",
  Compliance: "bg-purple-600",
  ATLAS: "bg-orange-500",
};

function PipelineBanner({ scenario, running }: { scenario: Scenario; running: boolean }) {
  const nodes = [
    { label: "SignPlus", icon: FileText },
    { label: "ATLAS Engine", icon: Play, isEngine: true },
    { label: "USPS Validation", icon: MapPin },
    { label: "System Updates", icon: Building2 },
    { label: "Compliance", icon: Shield },
    { label: "Notification", icon: Bell },
  ];

  return (
    <div className="flex items-center justify-center gap-1 py-3 px-4" data-testid="kinective-pipeline-banner">
      {nodes.map((node, i) => {
        const Icon = node.icon;
        return (
          <div key={node.label} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                node.isEngine
                  ? "bg-orange-500/20 border-orange-500 text-orange-400"
                  : "bg-zinc-800/80 border-zinc-700 text-zinc-300"
              }`}
            >
              {running && node.isEngine ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Icon className="w-3 h-3" />
              )}
              {node.label}
            </div>
            {i < nodes.length - 1 && <ArrowRight className="w-3 h-3 text-zinc-600" />}
          </div>
        );
      })}
    </div>
  );
}

function SignedFormPanel({ scenario }: { scenario: Scenario }) {
  const formData = scenario === "invalid_address"
    ? {
        form_id: "COA-2026-00412",
        member: "Sarah Mitchell",
        dob: "1982-04-15",
        old: "420 Elm St, Springfield, IL 62701",
        new_addr: "1847 Lakewod Drve, Austin TX",
        status: "SIGNED",
        note: "Typo in street name, missing ZIP code",
      }
    : {
        form_id: "COA-2026-00412",
        member: "Sarah Mitchell",
        dob: "1982-04-15",
        old: "420 Elm St, Springfield, IL 62701",
        new_addr: "1847 Lakewood Drive, Austin, TX 78701",
        status: "SIGNED",
        note: null,
      };

  return (
    <Card className="bg-zinc-900 border-zinc-800" data-testid="signed-form-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-400" />
          SignPlus — Signed COA Form
          <Badge variant="outline" className="ml-auto bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
            {formData.status} ✓
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-zinc-500">Form ID:</span>{" "}
            <span className="text-zinc-200 font-mono">{formData.form_id}</span>
          </div>
          <div>
            <span className="text-zinc-500">Member:</span>{" "}
            <span className="text-zinc-200">{formData.member}</span>
          </div>
          <div>
            <span className="text-zinc-500">DOB:</span>{" "}
            <span className="text-zinc-200">{formData.dob}</span>
          </div>
          <div>
            <span className="text-zinc-500">Member ID:</span>{" "}
            <span className="text-zinc-200 font-mono">MBR-2026-84291</span>
          </div>
        </div>
        <div className="border-t border-zinc-800 pt-2">
          <div className="mb-1">
            <span className="text-zinc-500">Old Address:</span>{" "}
            <span className="text-zinc-400">{formData.old}</span>
          </div>
          <div>
            <span className="text-zinc-500">New Address:</span>{" "}
            <span className={formData.note ? "text-yellow-400" : "text-zinc-200"}>{formData.new_addr}</span>
          </div>
          {formData.note && (
            <div className="mt-1 text-yellow-500/80 text-[10px] flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {formData.note}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ValidationPanel({ scenario }: { scenario: Scenario }) {
  if (scenario === "invalid_address") {
    return (
      <Card className="bg-zinc-900 border-yellow-500/30" data-testid="validation-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-yellow-400" />
            USPS Address Validation
            <Badge variant="outline" className="ml-auto bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
              NOT FOUND
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400">
            <div className="font-semibold mb-1">Address could not be verified</div>
            <div className="text-red-400/80">
              Street name "Lakewod Drve" could not be matched. Missing ZIP code. Routed to human review queue.
            </div>
          </div>
          <div className="text-zinc-500">No downstream system updates will be performed.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800" data-testid="validation-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-400" />
          USPS Address Validation
          <Badge variant="outline" className="ml-auto bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
            VERIFIED ✓
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-green-400">
          <div className="font-semibold mb-1">Address Standardized</div>
          <div className="font-mono">1847 LAKEWOOD DR, AUSTIN TX 78701-3847</div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-zinc-400">
          <div><span className="text-zinc-500">ZIP+4:</span> 78701-3847</div>
          <div><span className="text-zinc-500">Deliverable:</span> Yes</div>
        </div>
      </CardContent>
    </Card>
  );
}

function SystemUpdatesPanel({ scenario, updates }: { scenario: Scenario; updates: SystemUpdate[] }) {
  const statusIcon = (s: SystemUpdate["status"]) => {
    switch (s) {
      case "success": return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
      case "failed": return <XCircle className="w-3.5 h-3.5 text-red-400" />;
      case "rolled_back": return <Undo2 className="w-3.5 h-3.5 text-yellow-400" />;
      case "skipped": return <AlertTriangle className="w-3.5 h-3.5 text-zinc-500" />;
      default: return <Clock className="w-3.5 h-3.5 text-zinc-500" />;
    }
  };

  const statusBadge = (s: SystemUpdate["status"]) => {
    const colors: Record<string, string> = {
      success: "bg-green-500/20 text-green-400 border-green-500/30",
      failed: "bg-red-500/20 text-red-400 border-red-500/30",
      rolled_back: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      skipped: "bg-zinc-500/20 text-zinc-500 border-zinc-500/30",
      pending: "bg-zinc-500/20 text-zinc-500 border-zinc-500/30",
    };
    const labels: Record<string, string> = {
      success: "UPDATED ✓",
      failed: "FAILED ✗",
      rolled_back: "ROLLED BACK ↩",
      skipped: "SKIPPED",
      pending: "PENDING",
    };
    return (
      <Badge variant="outline" className={`${colors[s]} text-[10px]`}>
        {labels[s]}
      </Badge>
    );
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800" data-testid="system-updates-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="w-4 h-4 text-emerald-400" />
          System Updates
          {scenario === "happy" && (
            <Badge variant="outline" className="ml-auto bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
              11/11 COMPLETE
            </Badge>
          )}
          {scenario === "invalid_address" && (
            <Badge variant="outline" className="ml-auto bg-zinc-500/20 text-zinc-500 border-zinc-500/30 text-[10px]">
              BLOCKED — USPS GATE
            </Badge>
          )}
          {scenario === "system_failure" && (
            <Badge variant="outline" className="ml-auto bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">
              PARTIAL — ROLLBACK
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {updates.map((u, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 px-2 rounded text-xs hover:bg-zinc-800/50"
              data-testid={`system-update-${i}`}
            >
              <div className="flex items-center gap-2">
                {statusIcon(u.status)}
                <span className="text-zinc-300">{u.system}</span>
              </div>
              <div className="flex items-center gap-2">
                {u.confirmationId && (
                  <span className="text-zinc-500 font-mono text-[10px]">{u.confirmationId}</span>
                )}
                {u.error && (
                  <span className="text-red-400/70 text-[10px] max-w-[200px] truncate">{u.error}</span>
                )}
                {statusBadge(u.status)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RollbackPanel({ entries }: { entries: { system: string; status: string; rolledBackAt: string }[] }) {
  if (entries.length === 0) return null;

  return (
    <Card className="bg-zinc-900 border-yellow-500/20" data-testid="rollback-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Undo2 className="w-4 h-4 text-yellow-400" />
          Rollback Log
          <Badge variant="outline" className="ml-auto bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">
            {entries.length} ROLLED BACK
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded text-xs bg-yellow-500/5">
              <div className="flex items-center gap-2">
                <Undo2 className="w-3 h-3 text-yellow-400" />
                <span className="text-zinc-300">{e.system}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-[10px]">
                  {new Date(e.rolledBackAt).toLocaleTimeString()}
                </span>
                <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">
                  RESTORED ✓
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationPanel({ scenario }: { scenario: Scenario }) {
  const notifications: Record<Scenario, { type: string; message: string; color: string }[]> = {
    happy: [
      { type: "Member Email", message: "Address change confirmation sent to sarah.mitchell@email.com", color: "text-green-400" },
      { type: "Member SMS", message: "SMS confirmation sent to (217) 555-0148", color: "text-green-400" },
      { type: "Ops Log", message: "COA-2026-00412 completed. All 11 systems updated.", color: "text-blue-400" },
    ],
    invalid_address: [
      { type: "Ops Alert", message: "COA-2026-00412: USPS validation failed. Manual review required.", color: "text-yellow-400" },
      { type: "Member Callback", message: "Callback link sent: Please verify your new address", color: "text-yellow-400" },
      { type: "Review Ticket", message: "Ticket #TKT-84291 opened in ops queue", color: "text-orange-400" },
    ],
    system_failure: [
      { type: "Member Notice", message: "Address change partially complete. Card update delayed.", color: "text-yellow-400" },
      { type: "Retry Scheduled", message: "Card management retry: next maintenance window (02:00 UTC)", color: "text-orange-400" },
      { type: "Ops Ticket", message: "Ticket #TKT-84292: PSCU timeout. Partial rollback executed.", color: "text-red-400" },
    ],
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800" data-testid="notification-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Bell className="w-4 h-4 text-sky-400" />
          Notifications
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {notifications[scenario].map((n, i) => (
            <div key={i} className="flex items-start gap-2 text-xs py-1">
              <Badge variant="outline" className="text-[10px] bg-zinc-800 border-zinc-700 text-zinc-400 shrink-0">
                {n.type}
              </Badge>
              <span className={n.color}>{n.message}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityFeed({ entries }: { entries: AuditEntry[] }) {
  return (
    <Card className="bg-zinc-900 border-zinc-800" data-testid="activity-feed">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-400" />
          Live Activity Feed
          <Badge variant="outline" className="ml-auto bg-zinc-800 border-zinc-700 text-zinc-400 text-[10px]">
            {entries.length} events
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {entries.length === 0 && (
            <div className="text-zinc-500 text-xs py-4 text-center">
              No activity yet. Run a scenario to see live agent traces.
            </div>
          )}
          {[...entries].reverse().map((entry) => {
            const sysColor = Object.entries(SYSTEM_COLORS).find(([k]) =>
              entry.system.toLowerCase().includes(k.toLowerCase())
            )?.[1] || "bg-zinc-600";

            return (
              <div
                key={entry.id}
                className="flex items-start gap-2 py-1.5 px-2 rounded text-xs hover:bg-zinc-800/50"
                data-testid={`audit-entry-${entry.id}`}
              >
                <span className="text-zinc-500 font-mono text-[10px] shrink-0 mt-0.5">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <Badge className={`${sysColor} text-white text-[10px] shrink-0`}>
                  {entry.system}
                </Badge>
                <span className="text-zinc-300">{entry.details}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function KinectiveDemo() {
  const [scenario, setScenario] = useState<Scenario>("happy");
  const [running, setRunning] = useState(false);
  const [agentTeamOpen, setAgentTeamOpen] = useState(false);
  const { toast } = useToast();

  const auditQuery = useQuery<{ entries: AuditEntry[] }>({
    queryKey: ["/demo-api/kinective/audit-log"],
    refetchInterval: running ? POLL_INTERVAL : false,
  });

  const traceQuery = useQuery<{ traceId: string | null; running: boolean }>({
    queryKey: ["/demo-api/kinective/trace-id"],
    refetchInterval: running ? POLL_INTERVAL : false,
  });

  const systemUpdatesQuery = useQuery<{ updates: SystemUpdate[] }>({
    queryKey: ["/demo-api/kinective/system-updates"],
    refetchInterval: running ? POLL_INTERVAL : false,
  });

  const rollbackQuery = useQuery<{ entries: { system: string; status: string; rolledBackAt: string }[] }>({
    queryKey: ["/demo-api/kinective/rollback-log"],
    refetchInterval: running ? POLL_INTERVAL : false,
  });

  if (traceQuery.data && traceQuery.data.traceId && running) {
    setRunning(false);
  }

  const runPipeline = useMutation({
    mutationFn: async (s: Scenario) => {
      const res = await apiRequest("POST", "/demo-api/kinective/run-pipeline", { scenario: s });
      return res.json();
    },
    onSuccess: () => {
      setRunning(true);
      queryClient.invalidateQueries({ queryKey: ["/demo-api/kinective/audit-log"] });
      queryClient.invalidateQueries({ queryKey: ["/demo-api/kinective/trace-id"] });
      queryClient.invalidateQueries({ queryKey: ["/demo-api/kinective/system-updates"] });
      queryClient.invalidateQueries({ queryKey: ["/demo-api/kinective/rollback-log"] });
      toast({ title: "Pipeline Started", description: `Running scenario: ${SCENARIO_LABELS[scenario].label}` });
    },
    onError: (err: any) => {
      toast({ title: "Pipeline Error", description: err.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/demo-api/kinective/reset", { scenario });
      return res.json();
    },
    onSuccess: () => {
      setRunning(false);
      queryClient.invalidateQueries({ queryKey: ["/demo-api/kinective/audit-log"] });
      queryClient.invalidateQueries({ queryKey: ["/demo-api/kinective/trace-id"] });
      queryClient.invalidateQueries({ queryKey: ["/demo-api/kinective/system-updates"] });
      queryClient.invalidateQueries({ queryKey: ["/demo-api/kinective/rollback-log"] });
    },
  });

  const entries = auditQuery.data?.entries || [];
  const systemUpdates = systemUpdatesQuery.data?.updates || [];
  const rollbackEntries = rollbackQuery.data?.entries || [];
  const traceId = traceQuery.data?.traceId;

  const mcpServerList = Object.values(KINECTIVE_MCP_SERVERS);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-zinc-800 bg-zinc-950">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold" data-testid="kinective-demo-title">
                  Kinective — Change of Address
                </h1>
                <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  Credit Union
                </Badge>
              </div>
              <p className="text-sm text-zinc-400 mt-1">
                Automated COA processing: SignPlus intake → USPS validation → 11-system orchestration → compliance
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => resetMutation.mutate()}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                data-testid="reset-demo-button"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Reset
              </Button>
              <Link href={`/agents/${KINECTIVE_AGENT.id}`}>
                <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" data-testid="view-agent-button">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  View Agent
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-zinc-800 bg-zinc-950/50">
        <PipelineBanner scenario={scenario} running={running} />
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-sm text-zinc-400 font-medium">Scenario:</span>
          {(Object.keys(SCENARIO_LABELS) as Scenario[]).map((s) => (
            <Button
              key={s}
              variant={scenario === s ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setScenario(s);
                resetMutation.mutate();
              }}
              className={
                scenario === s
                  ? "bg-zinc-700 text-white border-zinc-600"
                  : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
              }
              disabled={running}
              data-testid={`scenario-${s}`}
            >
              {SCENARIO_LABELS[s].label}
            </Button>
          ))}

          <div className="ml-auto flex items-center gap-3">
            {traceId && !running && (
              <Link href={`/traces/${traceId}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  data-testid="view-trace-button"
                >
                  View Live Trace <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            )}
            <Button
              onClick={() => runPipeline.mutate(scenario)}
              disabled={running || runPipeline.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="run-scenario-button"
            >
              {running || runPipeline.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Scenario
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-7 space-y-4">
            <SignedFormPanel scenario={scenario} />
            <ValidationPanel scenario={scenario} />
            <SystemUpdatesPanel scenario={scenario} updates={systemUpdates} />
            {scenario === "system_failure" && <RollbackPanel entries={rollbackEntries} />}
            <NotificationPanel scenario={scenario} />
          </div>

          <div className="col-span-5 space-y-4">
            <ActivityFeed entries={entries} />

            <Collapsible open={agentTeamOpen} onOpenChange={setAgentTeamOpen}>
              <Card className="bg-zinc-900 border-zinc-800">
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      {agentTeamOpen ? (
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      )}
                      Agent Configuration
                      <Badge variant="outline" className="ml-auto bg-zinc-800 border-zinc-700 text-zinc-400 text-[10px]">
                        1 agent · {mcpServerList.length} MCP servers · {KINECTIVE_SKILLS.length} skills
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-3 pt-0">
                    <div className="bg-zinc-800/50 rounded-lg p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <Link href={`/agents/${KINECTIVE_AGENT.id}`}>
                          <span className="text-blue-400 hover:underline cursor-pointer font-medium">
                            {KINECTIVE_AGENT.name}
                          </span>
                        </Link>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30">
                            {KINECTIVE_CONFIG.riskTier}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">
                            autonomous
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {KINECTIVE_CONFIG.complianceTags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[9px] bg-zinc-700/50 text-zinc-400 border-zinc-600">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-500 mb-2 font-medium">MCP Servers ({mcpServerList.length})</div>
                      <div className="space-y-1">
                        {mcpServerList.map((srv) => (
                          <div key={srv.id} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-zinc-800/50">
                            <span className="text-zinc-300">{srv.name}</span>
                            <span className="text-zinc-500 text-[10px]">{srv.tools.length} tools</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-500 mb-2 font-medium">Skills ({KINECTIVE_SKILLS.length})</div>
                      <div className="flex flex-wrap gap-1">
                        {KINECTIVE_SKILLS.map((sk) => (
                          <Badge key={sk.id} variant="outline" className="text-[10px] bg-zinc-800 border-zinc-700 text-zinc-400">
                            {sk.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>
        </div>
      </div>
    </div>
  );
}
