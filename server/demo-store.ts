export interface ApprovalStep {
  role: string;
  person: string;
  status: "approved" | "pending" | "waiting";
  date: string;
}

export interface ServiceNowRequest {
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
  governance: {
    owner: string;
    sponsor: string;
    authMethod: string;
    platform: string;
  };
  riskAssessment: {
    dataSensitivity: string;
    regulatoryImpact: string;
    overallTier: string;
  };
}

export interface RadiantOneIdentity {
  id: string;
  name: string;
  type: string;
  dept: string;
  owner: string;
  status: "Active" | "Pending";
  risk: string;
  lastAct: string;
  details?: Record<string, string>;
}

export interface SailPointAccount {
  app: string;
  acct: string;
  status: "Active" | "Pending";
  role: string;
  provisioned: string;
  lastUsed: string;
}

export interface BrainwaveCertification {
  campaign: string;
  due: string;
  identities: {
    name: string;
    type: string;
    apps: number;
    ents: number;
    certifier: string;
    status: "Certified" | "Pending";
    risk: string;
  }[];
}

export interface AuditEntry {
  id: number;
  timestamp: string;
  action: string;
  system: string;
  details: string;
}

export interface DemoState {
  servicenow: ServiceNowRequest;
  radiantone: RadiantOneIdentity[];
  sailpoint: SailPointAccount[];
  brainwave: BrainwaveCertification;
  auditLog: AuditEntry[];
}

let auditCounter = 0;

function createInitialState(): DemoState {
  return {
    servicenow: {
      id: "REQ0084721",
      title: "Synthetic Worker Access Request",
      requestedBy: "David Chen, Head of Fund Operations",
      department: "Investment Operations",
      type: "New Synthetic Worker",
      priority: "High",
      justification:
        "Our team processes 2,000+ AIM Notify provisioning tasks per quarter at 45 min each. We need a synthetic worker to automate standard provisioning, deprovisioning, and entitlement changes for our AIM Notify applications, freeing analysts for complex exception handling.",
      approvalChain: [
        { role: "IT Security Review", person: "Sarah Kim, CISO Office", status: "approved", date: "Mar 5" },
        { role: "AI Risk Operating Committee", person: "AI ROC Board", status: "pending", date: "Pending" },
        { role: "AIM Team Acceptance", person: "Michael Yoder", status: "waiting", date: "Waiting" },
      ],
      status: "approved_partial",
      processed: false,
      targetApps: [
        { app: "Aladdin OMS", access: "AIM_Notify_Processor role", risk: "Medium" },
        { app: "Charles River IMS", access: "Order_Viewer, Provision_Agent roles", risk: "Medium" },
        { app: "Bloomberg Terminal", access: "Data_Reader role", risk: "Low" },
        { app: "ServiceNow", access: "Task_Processor, Ticket_Creator roles", risk: "Low" },
      ],
      governance: {
        owner: "Michael Yoder, AIM Team Lead",
        sponsor: "Ian Hogg, VP Technology",
        authMethod: "X.509 Certificate (90-day rotation)",
        platform: "Atlas Agent Orchestrator",
      },
      riskAssessment: {
        dataSensitivity: "Medium (MNPI via Aladdin)",
        regulatoryImpact: "SOX, FINRA 3110",
        overallTier: "Tier 2",
      },
    },
    radiantone: [
      { id: "EMP-10421", name: "Sarah Chen", type: "Employee", dept: "Public Equities", owner: "Direct", status: "Active", risk: "Low", lastAct: "2 min ago" },
      { id: "EMP-10522", name: "John Park", type: "Employee", dept: "Private Credit", owner: "Direct", status: "Active", risk: "Low", lastAct: "15 min ago" },
      { id: "EMP-10893", name: "Lisa Wang", type: "Employee", dept: "AIM", owner: "Direct", status: "Active", risk: "Low", lastAct: "1 hr ago" },
      { id: "EMP-11204", name: "Michael Yoder", type: "Employee", dept: "AIM", owner: "Direct", status: "Active", risk: "Low", lastAct: "5 min ago" },
      { id: "CON-20045", name: "James Liu", type: "Contractor", dept: "IT Ops", owner: "Vendor Mgr", status: "Active", risk: "Medium", lastAct: "3 hrs ago" },
      { id: "SVC-30012", name: "Aladdin-SVC-Batch", type: "Service Acct", dept: "Technology", owner: "System", status: "Active", risk: "Medium", lastAct: "30 min ago" },
      {
        id: "AIM-SYNTH-001",
        name: "AIM-SYNTH-001",
        type: "Synthetic Worker",
        dept: "AIM",
        owner: "M. Yoder",
        status: "Pending",
        risk: "Low",
        lastAct: "—",
        details: {
          owner: "Michael Yoder",
          sponsor: "Ian Hogg",
          credential: "X.509 Certificate",
          certExpiry: "Jun 12, 2026 (92 days)",
          created: "Mar 8, 2026",
          autonomyPhase: "Guided",
          tasksProcessed: "0",
          accuracy: "N/A",
        },
      },
    ],
    sailpoint: [
      { app: "Aladdin OMS", acct: "aim-synth-001@aladdin", status: "Pending", role: "AIM_Notify_Processor", provisioned: "—", lastUsed: "—" },
      { app: "Charles River IMS", acct: "synth-proc-001", status: "Pending", role: "Order_Viewer", provisioned: "—", lastUsed: "—" },
      { app: "Bloomberg Terminal", acct: "BRK-SYNTH-001", status: "Pending", role: "Data_Reader", provisioned: "—", lastUsed: "—" },
      { app: "ServiceNow", acct: "aim.synth.001", status: "Pending", role: "Task_Processor", provisioned: "—", lastUsed: "—" },
    ],
    brainwave: {
      campaign: "Q2 2026 AIM Team Access Recertification",
      due: "April 30, 2026",
      identities: [
        { name: "Sarah Chen", type: "Employee", apps: 6, ents: 24, certifier: "Tom Walsh", status: "Certified", risk: "Low" },
        { name: "John Park", type: "Employee", apps: 5, ents: 19, certifier: "Tom Walsh", status: "Certified", risk: "Low" },
        { name: "Lisa Wang", type: "Employee", apps: 4, ents: 15, certifier: "Michael Yoder", status: "Certified", risk: "Low" },
        { name: "David Kim", type: "Employee", apps: 7, ents: 31, certifier: "Michael Yoder", status: "Pending", risk: "Medium" },
        { name: "Emily Zhang", type: "Employee", apps: 3, ents: 11, certifier: "Michael Yoder", status: "Certified", risk: "Low" },
        { name: "AIM-SYNTH-001", type: "Synthetic Worker", apps: 4, ents: 12, certifier: "Michael Yoder", status: "Pending", risk: "Low" },
      ],
    },
    auditLog: [],
  };
}

let state: DemoState = createInitialState();

export function getState(): DemoState {
  return state;
}

export function approveStep(): { success: boolean; message: string } {
  const chain = state.servicenow.approvalChain;
  const pendingIdx = chain.findIndex((s) => s.status === "pending");
  if (pendingIdx === -1) return { success: false, message: "No pending approval steps" };

  chain[pendingIdx].status = "approved";
  chain[pendingIdx].date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const waitingIdx = chain.findIndex((s) => s.status === "waiting");
  if (waitingIdx !== -1) {
    chain[waitingIdx].status = "pending";
  }

  const allApproved = chain.every((s) => s.status === "approved");
  if (allApproved) {
    state.servicenow.status = "approved";
  }

  return { success: true, message: allApproved ? "All approvals complete" : `Step ${pendingIdx + 1} approved` };
}

export function completeRequest(requestId: string): { success: boolean; message: string } {
  if (state.servicenow.id !== requestId) return { success: false, message: "Request not found" };
  state.servicenow.processed = true;
  return { success: true, message: "Request marked as processed" };
}

export function activateIdentity(identityId: string): { success: boolean; message: string } {
  const identity = state.radiantone.find((i) => i.id === identityId);
  if (!identity) return { success: false, message: "Identity not found" };
  identity.status = "Active";
  identity.lastAct = "Just now";
  if (identity.details) {
    identity.details.tasksProcessed = "0";
    identity.details.accuracy = "N/A";
  }
  return { success: true, message: `Identity ${identityId} activated` };
}

export function provisionAccount(identityId: string, app: string, role: string): { success: boolean; message: string } {
  const account = state.sailpoint.find((a) => a.app === app);
  if (!account) return { success: false, message: `Application ${app} not found` };
  account.status = "Active";
  account.role = role;
  account.provisioned = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  account.lastUsed = "Just now";
  return { success: true, message: `${app} account provisioned for ${identityId} with role ${role}` };
}

export function certifyIdentity(identityId: string): { success: boolean; message: string } {
  const identity = state.brainwave.identities.find(
    (i) => i.name === identityId || (identityId === "AIM-SYNTH-001" && i.name === "AIM-SYNTH-001")
  );
  if (!identity) return { success: false, message: "Identity not found in certification campaign" };
  identity.status = "Certified";
  return { success: true, message: `${identityId} certification scheduled` };
}

export function addAuditEntry(action: string, system: string, details: string): AuditEntry {
  auditCounter++;
  const entry: AuditEntry = {
    id: auditCounter,
    timestamp: new Date().toISOString(),
    action,
    system,
    details,
  };
  state.auditLog.push(entry);
  return entry;
}

export function resetDemo(): void {
  auditCounter = 0;
  state = createInitialState();
}
