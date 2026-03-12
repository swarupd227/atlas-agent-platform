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
    { id: "orchestrator", label: "Atlas Orchestrator", done: false, isOrchestrator: true },
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
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
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
              ["Lifecycle State", accounts.some((a) => a.status === "Active") ? "Active" : "Pending"],
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
              {accounts.map((a, i) => (
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
              ))}
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

  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/demo-api/reset"),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/demo-api") });
      toast({ title: "Demo reset", description: "All state restored to initial values" });
    },
  });

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
          <p className="text-sm text-muted-foreground">Atlas Orchestrated | Same Pipeline, Governed Automation</p>
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
    </div>
  );
}
