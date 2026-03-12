import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  Circle,
  Loader2,
  BookOpen,
  Copy,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const POLL_INTERVAL = 3000;

const SYSTEM_PROMPT = `You are the Atlas Synthetic Worker Orchestrator for BlackRock. Every time you run, call \`check_pending_requests\`. If the result is empty, call \`log_action\` with \`{"action": "poll", "system": "ServiceNow", "details": "No pending requests found."}\` and stop. If you find approved requests, process each one in sequence: (1) call \`log_action\` to record discovery, (2) call \`activate_identity\` with \`{"identityId": "AIM-SYNTH-001"}\`, (3) call \`provision_account\` four times for apps: Aladdin OMS (role: AIM_Notify_Processor), Charles River IMS (role: Order_Viewer), Bloomberg Terminal (role: Data_Reader), ServiceNow (role: Task_Processor), logging each with \`log_action\`, (4) call \`schedule_certification\` with \`{"identityId": "AIM-SYNTH-001"}\`, (5) call \`complete_request\` to mark the request done, (6) call \`log_action\` with a completion summary. Be concise. Always log every action.`;

const SYSTEM_COLORS: Record<string, string> = {
  ServiceNow: "bg-green-600",
  RadiantOne: "bg-purple-600",
  SailPoint: "bg-blue-600",
  Brainwave: "bg-purple-800",
};

function PipelineBanner({ activeScreen, servicenowDone, radiantoneDone, sailpointDone, brainwaveDone }: {
  activeScreen: string;
  servicenowDone: boolean;
  radiantoneDone: boolean;
  sailpointDone: boolean;
  brainwaveDone: boolean;
}) {
  const nodes = [
    { id: "servicenow", label: "ServiceNow", done: servicenowDone },
    { id: "orchestrator", label: "Atlas Orchestrator", done: false, isOrchestrator: true },
    { id: "radiantone", label: "RadiantOne", done: radiantoneDone },
    { id: "sailpoint", label: "SailPoint", done: sailpointDone },
    { id: "brainwave", label: "Brainwave", done: brainwaveDone },
  ];

  return (
    <div className="flex items-center justify-center gap-1 py-3 px-4" data-testid="pipeline-banner">
      {nodes.map((node, i) => (
        <div key={node.id} className="flex items-center gap-1">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              node.isOrchestrator
                ? "bg-orange-500/20 border-orange-500 text-orange-400"
                : activeScreen === node.id
                ? "bg-primary/20 border-primary text-primary ring-1 ring-primary/50"
                : node.done
                ? "bg-green-500/10 border-green-500/50 text-green-400"
                : "bg-muted/50 border-border text-muted-foreground"
            }`}
          >
            {node.done && !node.isOrchestrator ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
            ) : node.isOrchestrator ? (
              <span>&#x1F537;</span>
            ) : (
              <Circle className="w-3.5 h-3.5" />
            )}
            {node.label}
          </div>
          {i < nodes.length - 1 && (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  );
}

function PollCountdown({ auditLogLength }: { auditLogLength: number }) {
  const [seconds, setSeconds] = useState(60);
  const prevLength = useState(auditLogLength)[0];

  useEffect(() => {
    if (auditLogLength > 0 && auditLogLength !== prevLength) {
      setSeconds(60);
    }
  }, [auditLogLength, prevLength]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((s) => (s <= 1 ? 60 : s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="poll-countdown">
      <Clock className="w-4 h-4" />
      <span>Agent polls in: <span className="font-mono font-semibold text-foreground">{seconds}s</span></span>
    </div>
  );
}

function SetupGuide() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyPrompt = useCallback(() => {
    navigator.clipboard.writeText(SYSTEM_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-setup-guide">
          <BookOpen className="w-4 h-4" />
          Demo Setup Guide
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? "" : "-rotate-90"}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2 border-orange-500/30 bg-orange-500/5 absolute right-4 z-50 w-[520px]">
          <CardContent className="p-4 space-y-3 text-sm">
            <h4 className="font-semibold text-orange-400">Setup Steps (before demo)</h4>
            <ol className="list-decimal pl-4 space-y-1.5 text-muted-foreground">
              <li>Go to <strong>Agents &rarr; New Agent</strong></li>
              <li>Name: <code className="text-xs bg-muted px-1 py-0.5 rounded">BlackRock Synthetic Worker Agent</code></li>
              <li>Industry: <strong>Financial Services</strong></li>
              <li>Link the <strong>"BlackRock Synthetic Worker MCP"</strong> integration (already seeded)</li>
              <li>Set schedule interval to <strong>1 minute</strong></li>
              <li>Paste the system prompt below</li>
              <li>Deploy the agent</li>
            </ol>
            <div className="relative">
              <div className="bg-muted rounded-lg p-3 text-xs font-mono max-h-32 overflow-y-auto text-muted-foreground leading-relaxed">
                {SYSTEM_PROMPT}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-1 right-1 h-7 w-7 p-0"
                onClick={copyPrompt}
                data-testid="button-copy-prompt"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ActivityFeed() {
  const { data } = useQuery({
    queryKey: ["/demo-api/audit-log"],
    refetchInterval: POLL_INTERVAL,
  });

  const entries = (data as any)?.entries || [];

  return (
    <Card data-testid="activity-feed">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${entries.length > 0 ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
          Live Agent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {entries.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4" data-testid="text-waiting-activity">
            Waiting for agent activity...
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {[...entries].reverse().map((entry: any) => (
              <div key={entry.id} className="flex items-start gap-2 text-xs" data-testid={`audit-entry-${entry.id}`}>
                <span className="text-muted-foreground font-mono w-16 shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <Badge variant="secondary" className={`text-white text-[10px] px-1.5 shrink-0 ${SYSTEM_COLORS[entry.system] || "bg-gray-600"}`}>
                  {entry.system}
                </Badge>
                <span className="text-foreground">{entry.details || entry.action}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ServiceNowScreen() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["/demo-api/servicenow/requests", "REQ0084721"],
    queryFn: () => fetch("/demo-api/servicenow/requests/REQ0084721").then((r) => r.json()),
    refetchInterval: POLL_INTERVAL,
  });

  const approveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/demo-api/servicenow/requests/REQ0084721/approve-step"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/demo-api/servicenow/requests"] });
      toast({ title: "Approval step advanced" });
    },
  });

  if (isLoading || !data) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const req = data;
  const allApproved = req.approvalChain?.every((s: any) => s.status === "approved");
  const hasPending = req.approvalChain?.some((s: any) => s.status === "pending");

  return (
    <div className="space-y-4" data-testid="screen-servicenow">
      <div className="bg-green-800/20 border border-green-700/40 rounded-lg px-4 py-2 flex items-center gap-3">
        <span className="text-lg font-bold text-green-400">ServiceNow</span>
        <span className="text-green-300/70 text-sm">IT Service Management</span>
        <span className="ml-auto text-sm text-green-300/70">BlackRock Enterprise</span>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-yellow-400 border-yellow-600">{req.id}</Badge>
        <Badge variant="outline" className="text-purple-400 border-purple-600">AI / Synthetic Worker</Badge>
      </div>
      <h2 className="text-xl font-bold">{req.title}</h2>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm text-green-400 uppercase tracking-wider">Request Details</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Requested By:</span><br/><span className="font-semibold">{req.requestedBy}</span></div>
                <div><span className="text-muted-foreground">Department:</span><br/><span className="font-semibold">{req.department}</span></div>
                <div><span className="text-muted-foreground">Request Type:</span><br/><span className="font-semibold text-orange-400">{req.type}</span></div>
                <div><span className="text-muted-foreground">Priority:</span><br/><span className="font-semibold text-yellow-400">{req.priority}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Business Justification:</span><br/><span className="text-sm">"{req.justification}"</span></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm text-blue-400 uppercase tracking-wider">Target Applications</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {req.targetApps?.map((app: any, i: number) => (
                <div key={i} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                  <div>
                    <div className="font-semibold text-sm">{app.app}</div>
                    <div className="text-xs text-muted-foreground">{app.access}</div>
                  </div>
                  <Badge variant={app.risk === "Medium" ? "default" : "secondary"} className={app.risk === "Medium" ? "bg-yellow-600" : "bg-green-600"}>
                    {app.risk} Risk
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm text-purple-400 uppercase tracking-wider">Proposed Governance</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Operational Owner:</span><br/><span className="font-semibold">{req.governance?.owner}</span></div>
                <div><span className="text-muted-foreground">Executive Sponsor:</span><br/><span className="font-semibold">{req.governance?.sponsor}</span></div>
                <div><span className="text-muted-foreground">Authentication:</span><br/><span className="font-semibold text-cyan-400">{req.governance?.authMethod}</span></div>
                <div><span className="text-muted-foreground">Orchestration:</span><br/><span className="font-semibold text-orange-400">{req.governance?.platform}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm text-yellow-400 uppercase tracking-wider">Approval Chain</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {req.approvalChain?.map((step: any, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 text-sm">
                    {step.status === "approved" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : step.status === "pending" ? <Clock className="w-4 h-4 text-yellow-400" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{step.role}</div>
                    <div className="text-xs text-muted-foreground">{step.person}</div>
                    <div className="text-xs text-muted-foreground">{step.date}</div>
                  </div>
                </div>
              ))}

              {hasPending && !allApproved && (
                <Button
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  className="w-full bg-green-600 hover:bg-green-500 mt-2"
                  data-testid="button-approve-step"
                >
                  {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Simulate: Approve Next Step
                </Button>
              )}

              {allApproved && !req.processed && (
                <div className="mt-3 bg-green-500/10 border border-green-500/30 rounded p-2 text-center text-sm text-green-400 font-semibold" data-testid="text-fully-approved">
                  All Approvals Complete — Atlas Agent will detect this on next poll
                </div>
              )}

              {req.processed && (
                <div className="mt-3 bg-blue-500/10 border border-blue-500/30 rounded p-2 text-center text-sm text-blue-400 font-semibold" data-testid="text-processed">
                  Processed by Atlas Agent
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm text-red-400 uppercase tracking-wider">Risk Assessment</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Data Sensitivity</span><span className="text-yellow-400">{req.riskAssessment?.dataSensitivity}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Regulatory Impact</span><span className="text-yellow-400">{req.riskAssessment?.regulatoryImpact}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Overall Risk Tier</span><span className="font-bold text-yellow-400">{req.riskAssessment?.overallTier}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function RadiantOneScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ["/demo-api/radiantone/identities"],
    refetchInterval: POLL_INTERVAL,
  });

  const [expanded, setExpanded] = useState<number | null>(null);

  if (isLoading || !data) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const identities = (data as any).identities || [];
  const typeColors: Record<string, string> = {
    Employee: "bg-blue-600",
    Contractor: "bg-teal-600",
    "Service Acct": "bg-gray-500",
    "Synthetic Worker": "bg-orange-500",
  };

  return (
    <div className="space-y-4" data-testid="screen-radiantone">
      <div className="bg-purple-900/20 border border-purple-700/40 rounded-lg px-4 py-2 flex items-center gap-3">
        <span className="text-lg font-bold text-purple-400">RadiantOne</span>
        <span className="text-purple-300/70 text-sm">Identity Data Platform</span>
        <span className="ml-auto text-sm text-purple-300/70">Unified Identity Fabric</span>
      </div>

      <h2 className="text-lg font-bold">All Identities</h2>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <th className="text-left p-3">Identity ID</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Department</th>
              <th className="text-left p-3">Owner</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Risk</th>
              <th className="text-left p-3">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {identities.map((id: any, i: number) => (
              <tr
                key={i}
                onClick={() => setExpanded(expanded === i ? null : i)}
                className={`border-t cursor-pointer transition-colors ${
                  id.type === "Synthetic Worker"
                    ? id.status === "Active"
                      ? "bg-orange-500/10 hover:bg-orange-500/20"
                      : "bg-muted/30 hover:bg-muted/50"
                    : "hover:bg-muted/30"
                } ${expanded === i ? "bg-muted/50" : ""}`}
                data-testid={`row-identity-${id.id}`}
              >
                <td className="p-3 font-mono text-xs">{id.id}</td>
                <td className="p-3 font-semibold">
                  <span className="flex items-center gap-1.5">
                    {id.type === "Synthetic Worker" && <span>&#x1F916;</span>}
                    {id.name}
                  </span>
                </td>
                <td className="p-3">
                  <Badge className={`${typeColors[id.type] || "bg-gray-600"} text-white text-[10px]`}>{id.type}</Badge>
                </td>
                <td className="p-3">{id.dept}</td>
                <td className="p-3">{id.owner}</td>
                <td className="p-3">
                  <span className={id.status === "Active" ? "text-green-400" : "text-muted-foreground"}>
                    {id.status === "Active" ? "●" : "○"} {id.status}
                  </span>
                </td>
                <td className="p-3">
                  <span className={id.risk === "Medium" ? "text-yellow-400" : "text-green-400"}>{id.risk}</span>
                </td>
                <td className="p-3 text-muted-foreground">{id.lastAct}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {expanded !== null && identities[expanded]?.type === "Synthetic Worker" && identities[expanded]?.details && (
          <div className="bg-orange-500/10 border-t-2 border-orange-500 p-4">
            <div className="grid grid-cols-4 gap-4 text-sm">
              {Object.entries(identities[expanded].details).map(([key, val]: [string, any]) => (
                <div key={key}>
                  <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                  <br />
                  <span className="font-semibold">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SailPointScreen() {
  const [activeTab, setActiveTab] = useState("accounts");
  const { data, isLoading } = useQuery({
    queryKey: ["/demo-api/sailpoint/accounts", "AIM-SYNTH-001"],
    queryFn: () => fetch("/demo-api/sailpoint/accounts/AIM-SYNTH-001").then((r) => r.json()),
    refetchInterval: POLL_INTERVAL,
  });

  if (isLoading || !data) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const accounts = (data as any).accounts || [];
  const tabs = ["accounts", "entitlements", "certifications", "activity"];

  return (
    <div className="space-y-4" data-testid="screen-sailpoint">
      <div className="bg-blue-800/20 border border-blue-700/40 rounded-lg px-4 py-2 flex items-center gap-3">
        <span className="text-lg font-bold text-blue-400">SailPoint IdentityIQ</span>
        <span className="text-blue-300/70 text-sm">Identity Governance</span>
        <span className="ml-auto text-sm text-blue-300/70">BlackRock Enterprise</span>
      </div>

      <div className="flex gap-6">
        <div className="w-72 bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-white text-xl">&#x1F916;</div>
            <div>
              <div className="font-bold text-lg">AIM-SYNTH-001</div>
              <Badge className="bg-orange-500 text-white text-[10px]">Synthetic Worker</Badge>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {[
              ["Owner (Manager)", "Michael Yoder"],
              ["Executive Sponsor", "Ian Hogg"],
              ["Department", "AIM"],
              ["Lifecycle State", accounts.some((a: any) => a.status === "Active") ? "Active" : "Pending"],
              ["Authentication", "X.509 Certificate"],
            ].map(([k, v], i) => (
              <div key={i} className="flex justify-between border-b border-border pb-1">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-semibold text-right">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1">
          <div className="flex border-b border-border mb-4">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-2 text-sm font-semibold capitalize ${
                  activeTab === t ? "border-b-2 border-blue-500 text-blue-400" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`tab-${t}`}
              >
                {t}
              </button>
            ))}
          </div>

          {activeTab === "accounts" && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Application Accounts ({accounts.length})</h3>
              {accounts.map((a: any, i: number) => (
                <div key={i} className="bg-muted/30 rounded-lg p-3 flex items-center justify-between" data-testid={`sailpoint-account-${i}`}>
                  <div>
                    <div className="font-semibold">{a.app}</div>
                    <div className="text-xs text-muted-foreground">{a.acct} &middot; {a.role}</div>
                  </div>
                  <div className="text-right">
                    <Badge variant={a.status === "Active" ? "default" : "secondary"} className={a.status === "Active" ? "bg-green-600 text-white" : ""}>
                      {a.status}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">{a.provisioned !== "—" ? `Provisioned: ${a.provisioned}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "entitlements" && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Entitlements</h3>
              {[
                { app: "Aladdin OMS", ent: "AIM_Notify_Processor", type: "Role", risk: "Medium" },
                { app: "Aladdin OMS", ent: "Fund_Data_Reader", type: "Permission", risk: "Low" },
                { app: "Charles River", ent: "Order_Viewer", type: "Role", risk: "Low" },
                { app: "Bloomberg", ent: "Data_Reader", type: "Role", risk: "Low" },
                { app: "ServiceNow", ent: "Task_Processor", type: "Role", risk: "Low" },
              ].map((e, i) => (
                <div key={i} className="flex items-center justify-between bg-muted/30 rounded px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-28">{e.app}</span>
                    <span className="font-semibold">{e.ent}</span>
                    <Badge variant="outline" className="text-[10px]">{e.type}</Badge>
                  </div>
                  <Badge variant={e.risk === "Medium" ? "default" : "secondary"} className={e.risk === "Medium" ? "bg-yellow-600 text-white" : ""}>
                    {e.risk}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {activeTab === "certifications" && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Certification Status</h3>
              <Card className="border-purple-500/30 bg-purple-500/5">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-purple-400">Q2 2026 AIM Team Recertification</span>
                    <Badge className="bg-yellow-600 text-white">Scheduled</Badge>
                  </div>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <div>Certifier: <strong className="text-foreground">Michael Yoder</strong></div>
                    <div>Campaign Due: <strong className="text-foreground">April 30, 2026</strong></div>
                    <div>Items to Certify: <strong className="text-foreground">4 applications, 12 entitlements</strong></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "activity" && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Recent Activity</h3>
              {[
                { time: "2 min ago", action: "Provisioned account for new hire J. Martinez", app: "Aladdin OMS" },
                { time: "8 min ago", action: "Modified entitlements for role change K. Patel", app: "Charles River" },
                { time: "22 min ago", action: "Deactivated account for termination R. Singh", app: "Bloomberg" },
              ].map((a, i) => (
                <div key={i} className="bg-muted/30 rounded px-3 py-2 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">{a.time}</span>
                    <span>{a.action}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{a.app}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BrainwaveScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ["/demo-api/brainwave/certifications"],
    refetchInterval: POLL_INTERVAL,
  });

  if (isLoading || !data) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const bw = data as any;
  const certifiedCount = bw.identities?.filter((i: any) => i.status === "Certified").length || 0;
  const totalCount = bw.identities?.length || 0;
  const pct = totalCount > 0 ? Math.round((certifiedCount / totalCount) * 100) : 0;
  const synthIdentity = bw.identities?.find((i: any) => i.type === "Synthetic Worker");

  return (
    <div className="space-y-4" data-testid="screen-brainwave">
      <div className="bg-purple-800/20 border border-purple-700/40 rounded-lg px-4 py-2 flex items-center gap-3">
        <span className="text-lg font-bold text-purple-400">Brainwave</span>
        <span className="text-purple-300/70 text-sm">/ RadiantOne Identity Analytics</span>
        <span className="ml-auto text-sm text-purple-300/70">Access Recertification</span>
      </div>

      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{bw.campaign}</h2>
            <div className="text-sm text-muted-foreground mt-1">
              Campaign Due: {bw.due} &middot; {totalCount} identities &middot; {certifiedCount} of {totalCount} certified
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-bold text-green-400">{pct}%</div>
              <div className="text-xs text-muted-foreground">Complete</div>
            </div>
            <Badge className={pct === 100 ? "bg-green-600 text-white" : "bg-yellow-600 text-white"}>
              {pct === 100 ? "Completed" : "In Progress"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <th className="text-left p-3">Identity</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Apps</th>
              <th className="text-left p-3">Entitlements</th>
              <th className="text-left p-3">Certifier</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Risk</th>
            </tr>
          </thead>
          <tbody>
            {bw.identities?.map((id: any, i: number) => (
              <tr
                key={i}
                className={`border-t ${id.type === "Synthetic Worker" ? "bg-orange-500/10" : ""}`}
                data-testid={`brainwave-row-${i}`}
              >
                <td className="p-3 font-semibold flex items-center gap-1.5">
                  {id.type === "Synthetic Worker" && <span>&#x1F916;</span>}
                  {id.name}
                </td>
                <td className="p-3">
                  <Badge className={`${id.type === "Synthetic Worker" ? "bg-orange-500" : "bg-blue-600"} text-white text-[10px]`}>{id.type}</Badge>
                </td>
                <td className="p-3">{id.apps}</td>
                <td className="p-3">{id.ents}</td>
                <td className="p-3">{id.certifier}</td>
                <td className="p-3">
                  <span className={id.status === "Certified" ? "text-green-400" : "text-yellow-400"}>
                    {id.status === "Certified" ? "●" : "○"} {id.status}
                  </span>
                </td>
                <td className="p-3">
                  <span className={id.risk === "Medium" ? "text-yellow-400" : "text-green-400"}>{id.risk}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {synthIdentity && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="p-4">
            <h3 className="font-bold text-orange-400 mb-2 flex items-center gap-1.5">
              <span>&#x1F916;</span> AIM-SYNTH-001 — Synthetic Worker Certification Details
            </h3>
            <div className="grid grid-cols-4 gap-4 text-sm mb-3">
              {[
                ["2,147", "Tasks Processed", "text-green-400"],
                ["99.72%", "Accuracy", "text-green-400"],
                ["1.8 min", "Avg Processing Time", "text-cyan-400"],
                ["0", "Security Incidents", "text-green-400"],
              ].map(([val, label, color], i) => (
                <div key={i} className="bg-muted/50 rounded p-2 text-center">
                  <div className={`text-2xl font-bold ${color}`}>{val}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-orange-300/80">
              Atlas-provided insight: All 4 application entitlements actively used in the last 30 days. No excess access detected. Worker operating in Guided Autonomy phase. Recommend: Certify all access.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function BlackRockDemo() {
  const [activeScreen, setActiveScreen] = useState("servicenow");
  const { toast } = useToast();

  const { data: auditData } = useQuery({
    queryKey: ["/demo-api/audit-log"],
    refetchInterval: POLL_INTERVAL,
  });

  const { data: snData } = useQuery({
    queryKey: ["/demo-api/servicenow/requests", "REQ0084721"],
    queryFn: () => fetch("/demo-api/servicenow/requests/REQ0084721").then((r) => r.json()),
    refetchInterval: POLL_INTERVAL,
  });

  const { data: riData } = useQuery({
    queryKey: ["/demo-api/radiantone/identities"],
    refetchInterval: POLL_INTERVAL,
  });

  const { data: spData } = useQuery({
    queryKey: ["/demo-api/sailpoint/accounts", "AIM-SYNTH-001"],
    queryFn: () => fetch("/demo-api/sailpoint/accounts/AIM-SYNTH-001").then((r) => r.json()),
    refetchInterval: POLL_INTERVAL,
  });

  const { data: bwData } = useQuery({
    queryKey: ["/demo-api/brainwave/certifications"],
    refetchInterval: POLL_INTERVAL,
  });

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/demo-api/reset"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/demo-api"] });
      toast({ title: "Demo reset", description: "All state restored to initial values" });
    },
  });

  const auditEntries = (auditData as any)?.entries || [];

  const servicenowDone = snData?.processed === true;
  const radiantoneDone = (riData as any)?.identities?.find((i: any) => i.id === "AIM-SYNTH-001")?.status === "Active";
  const sailpointDone = ((spData as any)?.accounts || []).every((a: any) => a.status === "Active");
  const brainwaveDone = (bwData as any)?.identities?.find((i: any) => i.name === "AIM-SYNTH-001")?.status === "Certified";

  const screens = [
    { id: "servicenow", label: "ServiceNow", color: "bg-green-700 hover:bg-green-600" },
    { id: "radiantone", label: "RadiantOne", color: "bg-purple-700 hover:bg-purple-600" },
    { id: "sailpoint", label: "SailPoint", color: "bg-blue-700 hover:bg-blue-600" },
    { id: "brainwave", label: "Brainwave", color: "bg-purple-800 hover:bg-purple-700" },
  ];

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto" data-testid="page-blackrock-demo">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-demo-title">BlackRock Synthetic Worker Demo</h1>
          <p className="text-sm text-muted-foreground">Live orchestration — ServiceNow &rarr; RadiantOne &rarr; SailPoint &rarr; Brainwave</p>
        </div>
        <div className="flex items-center gap-3">
          <PollCountdown auditLogLength={auditEntries.length} />
          <SetupGuide />
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="gap-1.5"
            data-testid="button-reset-demo"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Demo
          </Button>
        </div>
      </div>

      <PipelineBanner
        activeScreen={activeScreen}
        servicenowDone={servicenowDone}
        radiantoneDone={radiantoneDone}
        sailpointDone={sailpointDone}
        brainwaveDone={brainwaveDone}
      />

      <div className="flex items-center gap-2">
        {screens.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant={activeScreen === s.id ? "default" : "outline"}
            className={activeScreen === s.id ? `${s.color} text-white border-0` : ""}
            onClick={() => setActiveScreen(s.id)}
            data-testid={`button-screen-${s.id}`}
          >
            {s.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {activeScreen === "servicenow" && <ServiceNowScreen />}
          {activeScreen === "radiantone" && <RadiantOneScreen />}
          {activeScreen === "sailpoint" && <SailPointScreen />}
          {activeScreen === "brainwave" && <BrainwaveScreen />}
        </div>
        <div>
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
