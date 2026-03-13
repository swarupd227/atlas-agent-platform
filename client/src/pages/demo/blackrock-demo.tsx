import { useState, useEffect, useCallback } from "react";
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
  Circle,
  Loader2,
  BookOpen,
  Copy,
  Check,
  ExternalLink,
  Zap,
  ShieldX,
  AlertTriangle,
  Ban,
  Users,
  Trash2,
  FileCheck,
  ArrowRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AGENTS = {
  orchestrator: { id: "e9507c06-19cf-425f-8b59-fe58ba221121", name: "Synthetic Worker Access Orchestrator" },
  aquera:       { id: "c21b6549-e24d-4384-b667-9032619e3dd7", name: "Aquera Identity Provisioning Agent" },
  sailpoint:    { id: "dacfb0d1-9e9e-4b4f-b0be-6f2824c5c05f", name: "SailPoint Entitlement Assignment Agent" },
  radiantone:   { id: "67de43a1-c6b1-4f3a-b354-39140e6128a3", name: "RadiantOne Directory Synchronization Agent" },
  brainwave:    { id: "e57e6394-c256-46cd-b0be-86510ab0a1be", name: "Brainwave Access Audit and Compliance Agent" },
};

interface ApprovalStep {
  role: string;
  person: string;
  status: "approved" | "pending" | "waiting";
  date: string;
}

interface ServiceNowRequest {
  id: string;
  title: string;
  requestedBy: string;
  department: string;
  type: string;
  priority: string;
  justification: string;
  approvalChain: ApprovalStep[];
  status: string;
  processed: boolean;
  targetApps: { app: string; access: string; risk: string }[];
  governance: { owner: string; sponsor: string; authMethod: string; platform: string };
  riskAssessment: { dataSensitivity: string; regulatoryImpact: string; overallTier: string };
}

interface AqueraConnector {
  app: string;
  appOwner: string;
  source: string;
  scimEndpoint: string;
  entitlement: string;
  synthStatus: "Not Registered" | "Registered";
  registeredAt: string;
}

interface SailPointAccount {
  app: string;
  acct: string;
  status: "Active" | "Pending";
  role: string;
  provisioned: string;
  lastUsed: string;
}

interface BrainwaveIdentity {
  name: string;
  type: string;
  apps: number;
  ents: number;
  certifier: string;
  status: "Certified" | "Pending";
  risk: string;
}

interface BrainwaveCertification {
  campaign: string;
  due: string;
  identities: BrainwaveIdentity[];
}

interface AuditEntry {
  id: number;
  timestamp: string;
  action: string;
  system: string;
  details: string;
}

interface AuditLogResponse {
  entries: AuditEntry[];
}

interface ConnectorsResponse {
  connectors: AqueraConnector[];
}

interface AccountsResponse {
  accounts: SailPointAccount[];
}

interface SodViolationState {
  active: boolean;
  conflictDetectedAt: string | null;
  requestedRole: string;
  conflictingRole: string;
  application: string;
  violationType: string;
  regulation: string;
  regulationSection: string;
  resolutionPath: "revoke" | "exception" | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

const POLL_INTERVAL = 3000;

const SYSTEM_PROMPT = `You are the Atlas Synthetic Worker Orchestrator for BlackRock. You replace the manual analyst workflow with governed automation inside the same Aquera \u2192 SailPoint \u2192 Brainwave/RadiantOne governance pipeline.

Every time you run, execute the full 7-step Atlas pipeline:

1. TASK INTAKE: Call \`check_pending_requests\` to poll the SailPoint workflow queue. If empty, call \`log_action\` with {"action": "poll", "system": "SailPoint", "details": "No pending workflow tasks found."} and stop.

2. IDENTITY VALIDATION: Call \`log_action\` with {"action": "identity_validation", "system": "SailPoint", "details": "Dual check: RadiantOne identity data + SailPoint entitlement schema validated for BMSA-SYNTH-001."}

3. COMPLIANCE PRE-CHECK: Call \`log_action\` with {"action": "compliance_precheck", "system": "SailPoint", "details": "Dual SoD validation: RadiantOne policy engine + SailPoint compliance rules \u2014 both passed. Risk tier: Medium. Approval gate: cleared."}

4. AQUERA REGISTRATION: Call \`activate_identity\` with {"identityId": "BMSA-SYNTH-001"} to register the synthetic worker in Aquera SCIM connectors. Log each connector registration with \`log_action\` using system "Aquera".

5. EXECUTE VIA SAILPOINT: Call \`provision_account\` four times for: Aladdin OMS (role: Portfolio_Rebalancer), Charles River IMS (role: Compliance_Checker), Bloomberg Terminal (role: Market_Data_Reader), ServiceNow (role: Workflow_Initiator). Log each provisioning with \`log_action\` using system "SailPoint".

6. TRIPLE VERIFY + AUDIT: Call \`log_action\` with {"action": "triple_verify", "system": "Brainwave", "details": "Triple verification complete: SailPoint provisioning confirmed + RadiantOne identity record active + Brainwave recertification campaign scheduled. SOX audit package generated. SailPoint task closed."} Then call \`schedule_certification\` with {"identityId": "BMSA-SYNTH-001"}.

7. LIFECYCLE AGENT: Call \`complete_request\` to mark the workflow task done. Call \`log_action\` with {"action": "lifecycle_init", "system": "Brainwave", "details": "Lifecycle agent initialised: credential rotation scheduled (90-day), recertification prep queued for Q2 2026 BMSA campaign."}

Be concise. Always log every action. Never skip steps.`;

const SYSTEM_COLORS: Record<string, string> = {
  ServiceNow: "bg-green-600",
  Aquera: "bg-blue-600",
  SailPoint: "bg-blue-600",
  Brainwave: "bg-purple-800",
};

function PipelineBanner({ activeScreen, servicenowDone, aqueraDone, sailpointDone, brainwaveDone }: {
  activeScreen: string;
  servicenowDone: boolean;
  aqueraDone: boolean;
  sailpointDone: boolean;
  brainwaveDone: boolean;
}) {
  const nodes = [
    { id: "servicenow", label: "ServiceNow", done: servicenowDone },
    { id: "orchestrator", label: AGENTS.orchestrator.name, done: false, isOrchestrator: true },
    { id: "aquera", label: "Aquera", done: aqueraDone },
    { id: "sailpoint", label: "SailPoint", done: sailpointDone },
    { id: "brainwave", label: "Brainwave / RadiantOne", done: brainwaveDone },
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
  const prevLengthRef = useState({ value: auditLogLength })[0];

  useEffect(() => {
    if (auditLogLength !== prevLengthRef.value) {
      setSeconds(60);
      prevLengthRef.value = auditLogLength;
    }
  }, [auditLogLength, prevLengthRef]);

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

  const agentRows = [
    { ...AGENTS.orchestrator, type: "Orchestrator", mcp: "BlackRock Synthetic Worker MCP", badge: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    { ...AGENTS.aquera,       type: "Worker",       mcp: "Aquera SCIM MCP Server + BlackRock MCP", badge: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    { ...AGENTS.sailpoint,    type: "Worker",       mcp: "SailPoint IdentityIQ MCP + BlackRock MCP", badge: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    { ...AGENTS.radiantone,   type: "Worker",       mcp: "RadiantOne Identity MCP + BlackRock MCP", badge: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
    { ...AGENTS.brainwave,    type: "Worker",       mcp: "Brainwave Access Intelligence MCP + BlackRock MCP", badge: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  ];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-setup-guide">
          <BookOpen className="w-4 h-4" />
          Agent Team
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? "" : "-rotate-90"}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2 border-emerald-500/30 bg-emerald-500/5 absolute right-4 z-50 w-[560px]">
          <CardContent className="p-4 space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <h4 className="font-semibold text-emerald-400">Pre-configured Agent Team</h4>
            </div>
            <p className="text-xs text-muted-foreground">All agents are created, linked to their MCP servers, and ready to deploy against this outcome.</p>
            <div className="space-y-2">
              {agentRows.map((agent) => (
                <div key={agent.id} className="flex items-start gap-2 rounded-lg border border-border/40 bg-background/50 p-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold truncate">{agent.name}</span>
                      <Badge variant="outline" className={`text-[8px] px-1.5 py-0 h-4 ${agent.badge}`}>{agent.type}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{agent.mcp}</p>
                  </div>
                  <Link href={`/agents/${agent.id}`}>
                    <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-[10px] shrink-0" data-testid={`button-view-agent-${agent.id}`}>
                      View <ExternalLink className="w-3 h-3" />
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

function ActivityFeed() {
  const { data } = useQuery<AuditLogResponse>({
    queryKey: ["/demo-api/audit-log"],
    refetchInterval: POLL_INTERVAL,
  });

  const entries = data?.entries ?? [];

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
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {[...entries].reverse().map((entry) => (
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
  const { data: req, isLoading } = useQuery<ServiceNowRequest>({
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

  if (isLoading || !req) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const allApproved = req.approvalChain?.every((s) => s.status === "approved");
  const hasPending = req.approvalChain?.some((s) => s.status === "pending");

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
              {req.targetApps?.map((app, i) => (
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
              {req.approvalChain?.map((step, i) => (
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
                  Approve Next Step
                </Button>
              )}

              {allApproved && !req.processed && (
                <div className="mt-3 bg-green-500/10 border border-green-500/30 rounded p-2 text-center text-sm text-green-400 font-semibold" data-testid="text-fully-approved">
                  All Approvals Complete — Pipeline will proceed automatically
                </div>
              )}

              {req.processed && (
                <div className="mt-3 bg-blue-500/10 border border-blue-500/30 rounded p-2 text-center text-sm text-blue-400 font-semibold" data-testid="text-processed">
                  Provisioning Request Processed
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

function AqueraScreen() {
  const { data, isLoading } = useQuery<ConnectorsResponse>({
    queryKey: ["/demo-api/aquera/connectors"],
    refetchInterval: POLL_INTERVAL,
  });

  if (isLoading || !data) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const connectors = data.connectors ?? [];
  const allRegistered = connectors.every((c) => c.synthStatus === "Registered");

  return (
    <div className="space-y-4" data-testid="screen-aquera">
      <div className="bg-blue-800/20 border border-blue-700/40 rounded-lg px-4 py-2 flex items-center gap-3">
        <span className="text-lg font-bold text-blue-400">Aquera</span>
        <span className="text-blue-300/70 text-sm">Application Onboarding Gateway</span>
        <span className="ml-auto text-sm text-blue-300/70">SCIM 2.0 Connector Status for BMSA-SYNTH-001</span>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Registering BMSA-SYNTH-001 Synthetic Worker Identity</h2>
        {allRegistered && (
          <Badge className="bg-green-600 text-white">All Connectors Synced</Badge>
        )}
      </div>

      {allRegistered && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-sm text-green-400 font-semibold" data-testid="text-aquera-complete">
          &#x2713; BMSA-SYNTH-001 registered in Aquera — identity profiles pushed to SailPoint
        </div>
      )}

      <div className="space-y-3">
        {connectors.map((c, i) => (
          <Card key={i} className={`transition-all ${c.synthStatus === "Registered" ? "border-green-500/40 bg-green-500/5" : "border-border"}`} data-testid={`aquera-connector-${i}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="font-bold text-base">{c.app}</div>
                  <span className="text-sm text-muted-foreground">&middot; {c.appOwner}</span>
                </div>
                <Badge className={c.synthStatus === "Registered" ? "bg-green-600 text-white" : "bg-yellow-600 text-white"}>
                  {c.synthStatus === "Registered" ? "Registered \u2192 Syncing to SailPoint" : "Not Registered"}
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">SailPoint Source</span>
                  <div className="font-semibold">{c.source}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Entitlement</span>
                  <div><Badge variant="outline" className="text-xs">{c.entitlement}</Badge></div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">SCIM Endpoint</span>
                  <div className="font-mono text-xs text-muted-foreground truncate">{c.scimEndpoint}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Registered At</span>
                  <div className={`text-sm ${c.registeredAt !== "\u2014" ? "text-green-400" : "text-muted-foreground"}`}>
                    {c.registeredAt !== "\u2014" ? new Date(c.registeredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "\u2014"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SailPointScreen() {
  const [activeTab, setActiveTab] = useState("accounts");
  const { data, isLoading } = useQuery<AccountsResponse>({
    queryKey: ["/demo-api/sailpoint/accounts", "BMSA-SYNTH-001"],
    queryFn: () => fetch("/demo-api/sailpoint/accounts/BMSA-SYNTH-001").then((r) => r.json()),
    refetchInterval: POLL_INTERVAL,
  });

  if (isLoading || !data) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const accounts = data.accounts ?? [];
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
              <div className="font-bold text-lg">BMSA-SYNTH-001</div>
              <Badge className="bg-orange-500 text-white text-[10px]">Synthetic Worker</Badge>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {[
              ["Owner (Manager)", "Jennifer Walsh"],
              ["Executive Sponsor", "Mark Chen"],
              ["Department", "Multi-Asset Strategies"],
              ["Lifecycle State", accounts.some((a) => a.status === "Active") ? "Active" : accounts.length === 0 ? "Not Yet Provisioned" : "Pending"],
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
              {accounts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border border-dashed border-border rounded-lg bg-muted/20" data-testid="text-sailpoint-not-provisioned">
                  <span className="text-3xl mb-2">⏳</span>
                  <span className="font-semibold text-sm">No accounts provisioned yet</span>
                  <span className="text-xs mt-1">BMSA-SYNTH-001 will appear here once the pipeline runs.</span>
                </div>
              ) : (
                accounts.map((a, i) => (
                  <div key={i} className="bg-muted/30 rounded-lg p-3 flex items-center justify-between" data-testid={`sailpoint-account-${i}`}>
                    <div>
                      <div className="font-semibold">{a.app}</div>
                      <div className="text-xs text-muted-foreground">{a.acct} &middot; {a.role}</div>
                    </div>
                    <div className="text-right">
                      <Badge variant={a.status === "Active" ? "default" : "secondary"} className={a.status === "Active" ? "bg-green-600 text-white" : ""}>
                        {a.status}
                      </Badge>
                      <div className="text-xs text-muted-foreground mt-1">{a.provisioned !== "\u2014" ? `Provisioned: ${a.provisioned}` : ""}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "entitlements" && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Entitlements</h3>
              {[
                { app: "Aladdin OMS", ent: "Portfolio_Rebalancer", type: "Role", risk: "Medium" },
                { app: "Aladdin OMS", ent: "Fund_Data_Reader", type: "Permission", risk: "Low" },
                { app: "Charles River IMS", ent: "Compliance_Checker", type: "Role", risk: "Medium" },
                { app: "Bloomberg Terminal", ent: "Market_Data_Reader", type: "Role", risk: "Low" },
                { app: "ServiceNow", ent: "Workflow_Initiator", type: "Role", risk: "Low" },
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
                    <span className="font-bold text-purple-400">Q2 2026 BMSA Recertification</span>
                    <Badge className="bg-yellow-600 text-white">Scheduled</Badge>
                  </div>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <div>Certifier: <strong className="text-foreground">Jennifer Walsh</strong></div>
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
  const { data: bw, isLoading } = useQuery<BrainwaveCertification>({
    queryKey: ["/demo-api/brainwave/certifications"],
    refetchInterval: POLL_INTERVAL,
  });

  if (isLoading || !bw) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const certifiedCount = bw.identities?.filter((i) => i.status === "Certified").length ?? 0;
  const totalCount = bw.identities?.length ?? 0;
  const pct = totalCount > 0 ? Math.round((certifiedCount / totalCount) * 100) : 0;
  const synthIdentity = bw.identities?.find((i) => i.type === "Synthetic Worker");

  return (
    <div className="space-y-4" data-testid="screen-brainwave">
      <div className="bg-purple-800/20 border border-purple-700/40 rounded-lg px-4 py-2 flex items-center gap-3">
        <span className="text-lg font-bold text-purple-400">Brainwave / RadiantOne</span>
        <span className="text-purple-300/70 text-sm">Identity Analytics &middot; Access Recertification &middot; 360&deg; Visibility</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-purple-700 text-white text-[10px]">RadiantOne</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Identity data aggregation, dual SoD validation source, triple-verify input</p>
        </div>
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-purple-900 text-white text-[10px]">Brainwave</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Access recertification campaigns, risk scoring, entitlement analytics</p>
        </div>
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
            {bw.identities?.map((id, i) => (
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
                    {id.status === "Certified" ? "\u25CF" : "\u25CB"} {id.status}
                  </span>
                </td>
                <td className="p-3">
                  <span className={id.risk === "Medium" ? "text-yellow-400" : "text-green-400"}>{id.risk}</span>
                </td>
              </tr>
            ))}
            {!synthIdentity && (
              <tr className="border-t border-dashed border-border/40" data-testid="brainwave-synth-pending">
                <td colSpan={7} className="p-3 text-center text-xs text-muted-foreground italic">
                  BMSA-SYNTH-001 not yet in campaign — will be added once the pipeline certifies the identity.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {synthIdentity && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="p-4">
            <h3 className="font-bold text-orange-400 mb-2 flex items-center gap-1.5">
              <span>&#x1F916;</span> BMSA-SYNTH-001 — Synthetic Worker Certification Details
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
              Brainwave Intelligence: All 4 application entitlements actively used in the last 30 days. No excess access detected. Worker operating within defined scope. Recommendation: Certify all access.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Scenario 2: Step Progress Rail ───────────────────────────────────────────
const SOD_STEPS = [
  { id: "context",   num: 1, label: "Setup",     sublabel: "Pre-existing grant + new request" },
  { id: "aquera",    num: 2, label: "Detection",  sublabel: "Aquera halts provisioning" },
  { id: "violation", num: 3, label: "Violation",  sublabel: "SOX §404 incident card" },
  { id: "resolution",num: 4, label: "Resolution", sublabel: "Choose remediation path" },
] as const;

type SodStepId = typeof SOD_STEPS[number]["id"];

function SodStepRail({
  activeStep,
  sodActive,
  resolved,
  onStepClick,
}: {
  activeStep: SodStepId;
  sodActive: boolean;
  resolved: boolean;
  onStepClick: (id: SodStepId) => void;
}) {
  const activeIdx = SOD_STEPS.findIndex((s) => s.id === activeStep);

  function stepState(idx: number): "completed" | "active" | "locked" {
    if (idx < activeIdx) return "completed";
    if (idx === activeIdx) return (resolved && SOD_STEPS[idx].id === "resolution") ? "completed" : "active";
    const step = SOD_STEPS[idx];
    if (step.id === "context") return "active";
    if (!sodActive) return "locked";
    if (step.id === "resolution" && !sodActive) return "locked";
    return "locked";
  }

  function isClickable(idx: number): boolean {
    const st = stepState(idx);
    return st === "completed" || st === "active";
  }

  return (
    <div className="flex items-center gap-0 w-full" data-testid="sod-step-rail">
      {SOD_STEPS.map((step, idx) => {
        const state = stepState(idx);
        const clickable = isClickable(idx);
        const isLast = idx === SOD_STEPS.length - 1;

        return (
          <div key={step.id} className="flex items-center flex-1 min-w-0">
            <button
              onClick={() => clickable && onStepClick(step.id)}
              disabled={!clickable}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all w-full text-left ${
                state === "active"
                  ? "bg-background border-primary ring-1 ring-primary/30 shadow-sm"
                  : state === "completed"
                  ? "bg-green-500/5 border-green-500/30 hover:border-green-500/50 cursor-pointer"
                  : "bg-muted/20 border-border/30 opacity-40 cursor-not-allowed"
              }`}
              data-testid={`sod-step-${step.id}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold border-2 ${
                state === "completed"
                  ? "bg-green-500 border-green-400 text-white"
                  : state === "active"
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-muted border-border text-muted-foreground"
              }`}>
                {state === "completed" ? <CheckCircle2 className="w-4 h-4" /> : step.num}
              </div>
              <div className="min-w-0">
                <div className={`text-sm font-semibold leading-tight ${
                  state === "active" ? "text-foreground" : state === "completed" ? "text-green-400" : "text-muted-foreground"
                }`}>
                  {step.label}
                  {state === "completed" && <span className="ml-1.5 text-[10px] text-green-500 font-normal">✓ done</span>}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{step.sublabel}</div>
              </div>
            </button>
            {!isLast && (
              <div className={`h-0.5 w-6 shrink-0 mx-1 rounded-full ${
                state === "completed" ? "bg-green-500/50" : "bg-border/40"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Scenario 2: SoD Context View ─────────────────────────────────────────────
function SodContextView({ onTrigger, isPending }: { onTrigger: () => void; isPending: boolean }) {
  return (
    <div className="space-y-4" data-testid="screen-sod-context">

      {/* ServiceNow Ticket Header */}
      <div className="bg-green-900/20 border border-green-700/40 rounded-lg px-4 py-2 flex items-center gap-3">
        <span className="text-lg font-bold text-green-400">ServiceNow</span>
        <span className="text-green-300/70 text-sm">IT Service Management</span>
        <span className="ml-auto text-sm text-green-300/70">BlackRock Enterprise</span>
      </div>

      {/* Ticket summary */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-yellow-400 border-yellow-600">REQ0084721</Badge>
        <Badge variant="outline" className="text-purple-400 border-purple-600">AI / Synthetic Worker</Badge>
        <Badge variant="outline" className="text-blue-400 border-blue-600">New Entitlement Request</Badge>
      </div>
      <h2 className="text-xl font-bold">Synthetic Worker Access Provisioning — Aladdin OMS</h2>

      {/* Ticket detail row */}
      <div className="grid grid-cols-4 gap-3 text-sm">
        {[
          { label: "Requested By", value: "Rachel Torres" },
          { label: "Department",   value: "Portfolio Operations" },
          { label: "Priority",     value: "High" },
          { label: "Status",       value: "Awaiting Pipeline" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-muted/30 rounded-lg p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="font-semibold mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      {/* Pipeline flow banner */}
      <div className="flex items-center justify-center gap-1 py-3 px-4 bg-muted/20 rounded-xl border border-border/40" data-testid="sod-pipeline-banner">
        {[
          { label: "ServiceNow",   color: "bg-green-500/20 border-green-500 text-green-400",   icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
          { label: "Orchestrator", color: isPending ? "bg-orange-500/20 border-orange-500 text-orange-400 animate-pulse" : "bg-orange-500/20 border-orange-500 text-orange-400", icon: isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>&#x1F537;</span> },
          { label: "Aquera",       color: isPending ? "bg-primary/20 border-primary text-primary ring-1 ring-primary/50 animate-pulse" : "bg-primary/20 border-primary text-primary ring-1 ring-primary/50", icon: isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Circle className="w-3.5 h-3.5" /> },
          { label: "SailPoint",    color: "bg-muted/50 border-border text-muted-foreground opacity-40",       icon: <Circle className="w-3.5 h-3.5" /> },
          { label: "Brainwave",    color: "bg-muted/50 border-border text-muted-foreground opacity-40",       icon: <Circle className="w-3.5 h-3.5" /> },
        ].map((node, i, arr) => (
          <div key={node.label} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${node.color}`}>
              {node.icon}
              {node.label}
            </div>
            {i < arr.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        ))}
        <div className="flex items-center gap-1 ml-1">
          <ChevronRight className="w-4 h-4 text-red-400" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border bg-red-500/10 border-red-500/50 text-red-400">
            <Ban className="w-3.5 h-3.5" />
            Compliance Gate
          </div>
        </div>
      </div>

      {/* Pre-existing grant + new request side by side */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Pre-existing Grant (Invisible to IGA)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3 text-sm">
            <p className="text-muted-foreground text-xs">
              BMSA-SYNTH-001 was manually granted this role directly in Active Directory — bypassing SailPoint entirely:
            </p>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-2">
              {[
                { label: "Application",  value: "Aladdin OMS" },
                { label: "Legacy Role",  value: <Badge className="bg-amber-700 text-white font-mono text-xs">Order_Approver</Badge> },
                { label: "Granted By",   value: "Marcus Rowe (manual, Mar 1)" },
                { label: "Source",       value: <span className="text-xs text-muted-foreground">Direct AD group — bypassed SailPoint</span> },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold">{value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-300/80">
              This grant exists only in Active Directory — outside SailPoint's provisioning scope. A standard IGA review would not detect it.
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm text-blue-400 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4" /> Incoming Request — REQ0084721
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3 text-sm">
            <p className="text-muted-foreground text-xs">
              New entitlement request for BMSA-SYNTH-001 entering the provisioning pipeline:
            </p>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 space-y-2">
              {[
                { label: "Application",     value: "Aladdin OMS" },
                { label: "Requested Role",  value: <Badge className="bg-blue-700 text-white font-mono text-xs">Portfolio_Rebalancer</Badge> },
                { label: "Requested By",    value: "Rachel Torres" },
                { label: "Justification",   value: <span className="text-xs text-muted-foreground">Automated rebalancing pipeline</span> },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold">{value}</span>
                </div>
              ))}
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <ShieldX className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-red-400 text-xs">SOX §404 Wall Violation</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Holding both <span className="text-amber-300 font-mono">Order_Approver</span> and <span className="text-blue-300 font-mono">Portfolio_Rebalancer</span> on Aladdin OMS lets a single identity initiate <em>and</em> approve orders.
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Run pipeline CTA */}
      <Card className="border-orange-500/30 bg-orange-500/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-orange-400 flex items-center gap-2">
                <Zap className="w-4 h-4" /> Run Pipeline
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                REQ0084721 enters the provisioning pipeline. Aquera's compliance gate cross-references the full identity fabric — including the AD grant that SailPoint cannot see — and halts provisioning before any entitlement moves.
              </p>
            </div>
            <Button
              className="bg-orange-600 hover:bg-orange-500 text-white gap-2 shrink-0"
              onClick={onTrigger}
              disabled={isPending}
              data-testid="button-trigger-sod"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Run Pipeline
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Without ATLAS callout */}
      <Card className="border-muted/40">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">The Manual Reality — Without Governed Automation</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            {[
              { stat: "4 apps",  label: "to check manually",          color: "text-yellow-400" },
              { stat: "1,200+",  label: "daily access events",         color: "text-yellow-400" },
              { stat: "~0%",     label: "chance this gets caught",     color: "text-red-400" },
            ].map(({ stat, label, color }, i) => (
              <div key={i} className="bg-muted/30 rounded-lg p-3 text-center">
                <div className={`text-2xl font-bold ${color}`}>{stat}</div>
                <div className="text-xs text-muted-foreground mt-1">{label}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            A human analyst would need to cross-reference Aladdin OMS Active Directory groups, SailPoint entitlement records, and the SOX §404 SoD matrix — for every one of 1,200 daily events across 4 systems. The Order_Approver role was granted directly in AD, invisible to SailPoint. This conflict would never have been caught.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Scenario 2: SoD Aquera View ───────────────────────────────────────────────
function SodAqueraView({ sod, onNext }: { sod: SodViolationState; onNext: () => void }) {
  const { data, isLoading } = useQuery<ConnectorsResponse>({
    queryKey: ["/demo-api/aquera/connectors"],
    refetchInterval: POLL_INTERVAL,
  });

  if (isLoading || !data) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const connectors = data.connectors ?? [];

  return (
    <div className="space-y-4" data-testid="screen-sod-aquera">
      <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-2 flex items-center gap-3">
        <Ban className="w-5 h-5 text-red-400" />
        <span className="text-lg font-bold text-red-400">Aquera</span>
        <span className="text-red-300/70 text-sm">Compliance Pre-Check</span>
        <Badge className="ml-auto bg-red-700 text-white">Provisioning Halted</Badge>
      </div>

      <div className="bg-red-500/10 border border-red-500/40 rounded-lg px-4 py-3 flex items-start gap-3" data-testid="sod-halt-banner">
        <ShieldX className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
        <div>
          <div className="font-bold text-red-400">SoD Violation Detected — Provisioning Suspended</div>
          <div className="text-sm text-muted-foreground mt-1">
            Aquera compliance pre-check failed for BMSA-SYNTH-001. Aladdin OMS connector marked <span className="text-red-400 font-semibold">Policy Blocked</span>. Pipeline routed to human review queue. SailPoint step bypassed.
          </div>
          {sod.conflictDetectedAt && (
            <div className="text-xs text-muted-foreground mt-1">
              Detected: {new Date(sod.conflictDetectedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · Incident: INC-SOD-20260313
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {connectors.map((c, i) => {
          const isBlocked = c.synthStatus === "Policy Blocked";
          return (
            <Card
              key={i}
              className={`transition-all ${isBlocked ? "border-red-500/60 bg-red-500/10 ring-1 ring-red-500/30" : "border-border opacity-60"}`}
              data-testid={`sod-connector-${i}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {isBlocked && <Ban className="w-4 h-4 text-red-400 shrink-0" />}
                    <div className="font-bold text-base">{c.app}</div>
                    <span className="text-sm text-muted-foreground">· {c.appOwner}</span>
                  </div>
                  <Badge className={isBlocked ? "bg-red-700 text-white" : "bg-muted text-muted-foreground"}>
                    {isBlocked ? "Policy Blocked" : "Pending — Not Started"}
                  </Badge>
                </div>

                {isBlocked && (
                  <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-bold text-red-400 uppercase tracking-wider">Conflicting Role Access</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2">
                        <div className="text-xs text-muted-foreground">Requested (this request)</div>
                        <div className="font-mono font-bold text-blue-300 mt-1">Portfolio_Rebalancer</div>
                        <div className="text-xs text-muted-foreground">Initiates portfolio orders</div>
                      </div>
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2">
                        <div className="text-xs text-muted-foreground">Existing (manual AD grant)</div>
                        <div className="font-mono font-bold text-amber-300 mt-1">Order_Approver</div>
                        <div className="text-xs text-muted-foreground">Approves order execution</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span className="text-xs text-red-300">SOX §404: Same identity cannot initiate AND approve orders</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">SailPoint Source</span>
                    <div className="font-semibold">{c.source}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Entitlement Requested</span>
                    <div><Badge variant="outline" className={`text-xs ${isBlocked ? "border-red-500/50 text-red-400 line-through" : ""}`}>{c.entitlement}</Badge></div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">SCIM Endpoint</span>
                    <div className="font-mono text-xs text-muted-foreground truncate">{c.scimEndpoint}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Status</span>
                    <div className={`text-sm font-semibold ${isBlocked ? "text-red-400" : "text-muted-foreground"}`}>
                      {isBlocked ? "Blocked — not provisioned" : "Awaiting compliance gate"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <Button
          onClick={onNext}
          className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
          data-testid="button-sod-next-to-violation"
        >
          Next: View Violation Details
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Scenario 2: Policy Violation Card ────────────────────────────────────────
function SodViolationCard({ sod, onNext }: { sod: SodViolationState; onNext: () => void }) {
  return (
    <div className="space-y-4" data-testid="screen-sod-violation">
      <div className="bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-2 flex items-center gap-3">
        <ShieldX className="w-5 h-5 text-red-400" />
        <span className="text-lg font-bold text-red-400">Policy Violation</span>
        <span className="text-red-300/70 text-sm">SOX §404 — Separation of Duties</span>
        <Badge className="ml-auto bg-red-700 text-white">CRITICAL</Badge>
      </div>

      <Card className="border-red-500/50 bg-red-500/5" data-testid="sod-violation-card">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
              <ShieldX className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="font-bold text-red-400 text-lg">Separation of Duties Violation</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                SOX Section 404 — Internal Controls over Financial Reporting
              </p>
              {sod.conflictDetectedAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  Detected {new Date(sod.conflictDetectedAt).toLocaleString()} · Incident INC-SOD-20260313
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Violation Details</div>
              {[
                ["Violation Type", "Separation of Duties (SoD)"],
                ["Regulatory Framework", "SOX — Sarbanes-Oxley Act"],
                ["Specific Requirement", "Section 404 — Internal Controls"],
                ["Application", "Aladdin OMS (Portfolio Mgmt)"],
                ["Identity", "BMSA-SYNTH-001"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-semibold text-right text-xs">{v}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Conflicting Roles</div>
              <div className="space-y-2">
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <Badge className="bg-amber-700 text-white text-[10px] font-mono">Order_Approver</Badge>
                    <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-600">EXISTING</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Approves and executes portfolio orders in Aladdin OMS. Granted manually via AD group on Mar 1 — outside SailPoint.</p>
                </div>
                <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <Badge className="bg-blue-700 text-white text-[10px] font-mono">Portfolio_Rebalancer</Badge>
                    <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-600">REQUESTED</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Initiates and stages portfolio rebalancing orders in Aladdin OMS. Requested via REQ0084721.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-muted/30 rounded-lg p-3 border border-border/40">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Compliance Analysis</div>
            <p className="text-sm">
              Granting both <span className="font-mono text-amber-300">Order_Approver</span> and <span className="font-mono text-blue-300">Portfolio_Rebalancer</span> to the same identity creates a complete, unbroken approval chain under a single control point. Under SOX §404, the initiator and approver of financial transactions must be separate entities. This configuration would allow BMSA-SYNTH-001 to stage <em>and</em> approve its own trades — a direct SOX wall violation with material financial reporting risk.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Regulatory Risk", value: "CRITICAL", color: "text-red-400" },
              { label: "Financial Exposure", value: "Material", color: "text-red-400" },
              { label: "Entitlements Blocked", value: "1 of 4", color: "text-yellow-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-muted/40 rounded-lg p-3 text-center">
                <div className={`font-bold text-lg ${color}`}>{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted/40 bg-muted/5">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Audit Trail — SoD Incident</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {[
            { code: "SoD_VIOLATION", label: "SOX_S404 | Compliance pre-check failed — Portfolio_Rebalancer + Order_Approver conflict detected on Aladdin OMS", color: "bg-red-700" },
            { code: "POLICY_BLOCKED", label: "Aladdin OMS connector marked Policy Blocked. Provisioning halted.", color: "bg-red-700" },
            { code: "HUMAN_REVIEW", label: "Orchestrator routed to human review queue — SailPoint step bypassed. Incident INC-SOD-20260313 created.", color: "bg-orange-700" },
          ].map(({ code, label, color }, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <Badge className={`${color} text-white text-[9px] shrink-0 font-mono`}>{code}</Badge>
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end pt-2">
        <Button
          onClick={onNext}
          className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
          data-testid="button-sod-next-to-resolution"
        >
          Next: Choose Resolution Path
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Scenario 2: Resolution Panel ──────────────────────────────────────────────
function SodResolutionPanel({
  sod,
  onResolve,
  isPending,
}: {
  sod: SodViolationState;
  onResolve: (path: "revoke" | "exception") => void;
  isPending: boolean;
}) {
  const isResolved = !!sod.resolutionPath;

  return (
    <div className="space-y-4" data-testid="screen-sod-resolution">
      <div className="bg-orange-900/20 border border-orange-700/40 rounded-lg px-4 py-2 flex items-center gap-3">
        <FileCheck className="w-5 h-5 text-orange-400" />
        <span className="text-lg font-bold text-orange-400">Resolution Path</span>
        <span className="text-orange-300/70 text-sm">Choose remediation action to clear the SoD violation</span>
        {isResolved && <Badge className="ml-auto bg-green-700 text-white">Resolved</Badge>}
      </div>

      {isResolved ? (
        <Card className="border-green-500/40 bg-green-500/5" data-testid="sod-resolved-card">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
              <div>
                <h3 className="font-bold text-green-400">
                  {sod.resolutionPath === "revoke" ? "Resolution A: Legacy Role Revoked" : "Resolution B: Exception Approved with Dual Sign-off"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {sod.resolutionPath === "revoke"
                    ? "Order_Approver has been revoked from BMSA-SYNTH-001. The SoD conflict is cleared. Provisioning pipeline may now resume."
                    : "Exception approved with compensating controls: enhanced monitoring, 30-day review cycle, elevated Brainwave alert threshold."}
                </p>
                {sod.resolvedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Resolved {new Date(sod.resolvedAt).toLocaleTimeString()} · By: {sod.resolvedBy}
                  </p>
                )}
              </div>
            </div>
            {[
              { code: sod.resolutionPath === "revoke" ? "SOD_RESOLVED_REVOKE" : "SOD_RESOLVED_EXCEPTION", label: sod.resolutionPath === "revoke" ? "Legacy role Order_Approver revoked. SoD conflict cleared." : "Exception approved. Dual sign-off recorded. Compensating controls applied.", color: "bg-green-700" },
              { code: "AUDIT_SOX_S404", label: "SOX §404 audit record updated. Incident INC-SOD-20260313 closed.", color: "bg-purple-700" },
            ].map(({ code, label, color }, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <Badge className={`${color} text-white text-[9px] shrink-0 font-mono`}>{code}</Badge>
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-red-500/30 hover:border-red-500/60 transition-colors" data-testid="sod-path-revoke">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <div className="font-bold text-sm">Path A — Revoke Legacy Role</div>
                  <Badge variant="outline" className="text-[9px] border-red-500/40 text-red-400 mt-0.5">Recommended</Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Revoke the <span className="font-mono text-amber-300">Order_Approver</span> role from BMSA-SYNTH-001 in Aladdin OMS. The conflicting legacy grant is removed. The provisioning pipeline can then proceed cleanly.
              </p>
              <div className="space-y-1 text-xs">
                {["Conflict fully eliminated", "No ongoing compensating controls needed", "Cleanest SOX §404 audit posture", "Pipeline resumes after revocation"].map((item) => (
                  <div key={item} className="flex items-center gap-1.5 text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" /> {item}
                  </div>
                ))}
              </div>
              <Button
                className="w-full bg-red-700 hover:bg-red-600 text-white gap-2"
                onClick={() => onResolve("revoke")}
                disabled={isPending}
                data-testid="button-resolve-revoke"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Revoke Order_Approver
              </Button>
            </CardContent>
          </Card>

          <Card className="border-orange-500/30 hover:border-orange-500/60 transition-colors" data-testid="sod-path-exception">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center">
                  <Users className="w-4 h-4 text-orange-400" />
                </div>
                <div>
                  <div className="font-bold text-sm">Path B — Approve Exception</div>
                  <Badge variant="outline" className="text-[9px] border-orange-500/40 text-orange-400 mt-0.5">Dual Sign-off Required</Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Approve a SOX §404 exception with documented compensating controls. Requires dual sign-off from two named approvers. Access is granted with enhanced monitoring.
              </p>
              <div className="space-y-1 text-xs">
                {["Jennifer Walsh (Ops Lead) sign-off", "Mark Chen (MD) counter-sign", "Compensating: 30-day review cycle", "Compensating: Brainwave HIGH alert"].map((item) => (
                  <div key={item} className="flex items-center gap-1.5 text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-orange-400 shrink-0" /> {item}
                  </div>
                ))}
              </div>
              <Button
                className="w-full bg-orange-700 hover:bg-orange-600 text-white gap-2"
                onClick={() => onResolve("exception")}
                disabled={isPending}
                data-testid="button-resolve-exception"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                Approve Exception (Dual Sign-off)
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-muted/40">
        <CardContent className="p-4">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Platform Value Delivered</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="font-semibold text-green-400">Governed Pipeline</div>
              {[
                "Violation caught before any entitlement granted",
                "Zero manual analyst effort required",
                "Full audit trail auto-generated",
                "Clear resolution paths presented immediately",
                "SOX §404 posture maintained automatically",
              ].map((item) => (
                <div key={item} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0 mt-0.5" /> {item}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <div className="font-semibold text-red-400">Manual Approach</div>
              {[
                "Manual analyst checks 4 apps × 1,200 daily events",
                "AD grant invisible to SailPoint — never cross-referenced",
                "Violation undetected until SOX audit (months later)",
                "Material weakness finding in 10-K filing",
                "Potential SEC enforcement action",
              ].map((item) => (
                <div key={item} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" /> {item}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function BlackRockDemo() {
  const [activeScenario, setActiveScenario] = useState<"scenario1" | "scenario2">("scenario1");
  const [activeScreen, setActiveScreen] = useState("servicenow");
  const { toast } = useToast();

  const { data: auditData } = useQuery<AuditLogResponse>({
    queryKey: ["/demo-api/audit-log"],
    refetchInterval: POLL_INTERVAL,
  });

  const { data: snData } = useQuery<ServiceNowRequest>({
    queryKey: ["/demo-api/servicenow/requests", "REQ0084721"],
    queryFn: () => fetch("/demo-api/servicenow/requests/REQ0084721").then((r) => r.json()),
    refetchInterval: POLL_INTERVAL,
  });

  const { data: aqData } = useQuery<ConnectorsResponse>({
    queryKey: ["/demo-api/aquera/connectors"],
    refetchInterval: POLL_INTERVAL,
  });

  const { data: spData } = useQuery<AccountsResponse>({
    queryKey: ["/demo-api/sailpoint/accounts", "BMSA-SYNTH-001"],
    queryFn: () => fetch("/demo-api/sailpoint/accounts/BMSA-SYNTH-001").then((r) => r.json()),
    refetchInterval: POLL_INTERVAL,
  });

  const { data: bwData } = useQuery<BrainwaveCertification>({
    queryKey: ["/demo-api/brainwave/certifications"],
    refetchInterval: POLL_INTERVAL,
  });

  const { data: sodData } = useQuery<SodViolationState>({
    queryKey: ["/demo-api/sod-violation"],
    refetchInterval: POLL_INTERVAL,
  });

  const sod: SodViolationState = sodData ?? {
    active: false,
    conflictDetectedAt: null,
    requestedRole: "Portfolio_Rebalancer",
    conflictingRole: "Order_Approver",
    application: "Aladdin OMS",
    violationType: "Separation of Duties",
    regulation: "SOX",
    regulationSection: "Section 404",
    resolutionPath: null,
    resolvedAt: null,
    resolvedBy: null,
  };

  const [sodPipelineStarted, setSodPipelineStarted] = useState(false);

  const resolveSodMutation = useMutation({
    mutationFn: (path: "revoke" | "exception") => apiRequest("POST", "/demo-api/sod-violation/resolve", { path }),
    onSuccess: (_data, path) => {
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/demo-api") });
      toast({
        title: path === "revoke" ? "Legacy Role Revoked" : "Exception Approved",
        description: path === "revoke" ? "Order_Approver revoked. SoD conflict cleared." : "Exception approved with dual sign-off and compensating controls.",
      });
    },
  });

  const [activeSodScreen, setActiveSodScreen] = useState<"context" | "aquera" | "violation" | "resolution">("context");

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/demo-api/reset"),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/demo-api") });
      setActiveSodScreen("context");
      setSodPipelineStarted(false);
      toast({ title: "Demo reset", description: "All state restored to initial values" });
    },
  });

  const runPipelineMutation = useMutation({
    mutationFn: (opts?: { scenario?: "sod" }) =>
      apiRequest("POST", "/demo-api/run-pipeline", opts?.scenario ? { scenario: opts.scenario } : undefined),
    onSuccess: (_data, opts) => {
      if (opts?.scenario === "sod") {
        setSodPipelineStarted(true);
        toast({
          title: "Pipeline started",
          description: "The orchestrator is running the SoD compliance check pipeline. Watch the activity feed below.",
        });
      } else {
        toast({
          title: "Pipeline started",
          description: "The orchestrator agent is now running the full 7-step provisioning pipeline. Watch the activity feed below.",
        });
      }
      queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/demo-api") });
    },
    onError: (err: any) => {
      toast({ title: "Pipeline error", description: err.message || "Failed to start pipeline", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (sodPipelineStarted && sod.active && activeSodScreen === "context") {
      setActiveSodScreen("aquera");
      setSodPipelineStarted(false);
    }
  }, [sod.active, activeSodScreen, sodPipelineStarted]);

  const auditEntries = auditData?.entries ?? [];

  const servicenowDone = snData?.processed === true;
  const aqueraDone = (aqData?.connectors ?? []).every((c) => c.synthStatus === "Registered");
  const sailpointDone = (spData?.accounts ?? []).every((a) => a.status === "Active");
  const brainwaveDone = bwData?.identities?.find((i) => i.name === "BMSA-SYNTH-001")?.status === "Certified";

  const screens = [
    { id: "servicenow", label: "ServiceNow", color: "bg-green-700 hover:bg-green-600" },
    { id: "aquera", label: "Aquera", color: "bg-blue-700 hover:bg-blue-600" },
    { id: "sailpoint", label: "SailPoint IIQ", color: "bg-blue-700 hover:bg-blue-600" },
    { id: "brainwave", label: "Brainwave / RadiantOne", color: "bg-purple-800 hover:bg-purple-700" },
  ];

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto" data-testid="page-blackrock-demo">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-demo-title">BlackRock Synthetic Worker Demo</h1>
          <p className="text-sm text-muted-foreground">Governed Identity Automation | BlackRock Enterprise</p>
        </div>
        <div className="flex items-center gap-3">
          {activeScenario === "scenario1" && (
            runPipelineMutation.isPending ? (
              <div className="flex items-center gap-2 text-sm text-orange-400 font-medium animate-pulse" data-testid="pipeline-running-indicator">
                <Loader2 className="w-4 h-4 animate-spin" />
                Pipeline running…
              </div>
            ) : brainwaveDone ? (
              <div className="flex items-center gap-2 text-sm text-green-400 font-medium" data-testid="pipeline-complete-indicator">
                <CheckCircle2 className="w-4 h-4" />
                Pipeline complete
              </div>
            ) : (
              <Button
                size="sm"
                className="gap-1.5 bg-orange-600 hover:bg-orange-500 text-white"
                onClick={() => runPipelineMutation.mutate()}
                disabled={runPipelineMutation.isPending}
                data-testid="button-run-pipeline"
              >
                <Zap className="w-3.5 h-3.5" />
                Run Live Pipeline
              </Button>
            )
          )}
          {activeScenario === "scenario2" && runPipelineMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-orange-400 font-medium animate-pulse" data-testid="sod-pipeline-running-indicator">
              <Loader2 className="w-4 h-4 animate-spin" />
              Pipeline running…
            </div>
          )}
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
            Reset
          </Button>
        </div>
      </div>

      {/* Scenario Selector */}
      <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-lg border border-border/40 w-fit" data-testid="scenario-selector">
        <button
          onClick={() => setActiveScenario("scenario1")}
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
            activeScenario === "scenario1"
              ? "bg-background shadow-sm text-foreground border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="button-scenario1"
        >
          Scenario 1 — Synthetic Worker Provisioning
        </button>
        <button
          onClick={() => setActiveScenario("scenario2")}
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${
            activeScenario === "scenario2"
              ? "bg-red-900/60 shadow-sm text-red-300 border border-red-700/50"
              : "text-muted-foreground hover:text-red-400"
          }`}
          data-testid="button-scenario2"
        >
          <ShieldX className="w-3.5 h-3.5" />
          Scenario 2 — SoD Conflict: SOX Wall Violation
        </button>
      </div>

      {activeScenario === "scenario1" && (
        <>
          <PipelineBanner
            activeScreen={activeScreen}
            servicenowDone={servicenowDone}
            aqueraDone={aqueraDone}
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
              {activeScreen === "aquera" && <AqueraScreen />}
              {activeScreen === "sailpoint" && <SailPointScreen />}
              {activeScreen === "brainwave" && <BrainwaveScreen />}
            </div>
            <div>
              <ActivityFeed />
            </div>
          </div>
        </>
      )}

      {activeScenario === "scenario2" && (
        <>
          <SodStepRail
            activeStep={activeSodScreen as SodStepId}
            sodActive={sod.active}
            resolved={!!sod.resolutionPath}
            onStepClick={(id) => setActiveSodScreen(id)}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              {activeSodScreen === "context" && (
                <SodContextView
                  onTrigger={() => runPipelineMutation.mutate({ scenario: "sod" })}
                  isPending={runPipelineMutation.isPending}
                />
              )}
              {activeSodScreen === "aquera" && (
                <SodAqueraView
                  sod={sod}
                  onNext={() => setActiveSodScreen("violation")}
                />
              )}
              {activeSodScreen === "violation" && (
                <SodViolationCard
                  sod={sod}
                  onNext={() => setActiveSodScreen("resolution")}
                />
              )}
              {activeSodScreen === "resolution" && (
                <SodResolutionPanel
                  sod={sod}
                  onResolve={(path) => resolveSodMutation.mutate(path)}
                  isPending={resolveSodMutation.isPending}
                />
              )}
            </div>
            <div>
              <ActivityFeed />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
