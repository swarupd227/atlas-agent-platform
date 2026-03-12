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

export interface AqueraConnector {
  app: string;
  appOwner: string;
  source: string;
  scimEndpoint: string;
  entitlement: string;
  synthStatus: "Not Registered" | "Registered";
  registeredAt: string;
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
  aquera: AqueraConnector[];
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
      requestedBy: "Rachel Torres, Head of Portfolio Implementation",
      department: "Multi-Asset Strategies",
      type: "New Synthetic Worker",
      priority: "High",
      justification:
        "Our team executes 1,200+ daily rebalancing events across 280+ model portfolios. Each event requires manual coordination across Aladdin OMS, Charles River, and Bloomberg — order staging, compliance pre-checks, and post-trade reconciliation — consuming 5–6 analyst hours per day. A Synthetic Worker will automate routine compliance validation, order staging, and settlement reconciliation, reducing analyst intervention to exception handling only.",
      approvalChain: [
        { role: "IT Security Review", person: "Sarah Kim, CISO Office", status: "approved", date: "Mar 5" },
        { role: "AI Risk Operating Committee", person: "AI ROC Board", status: "pending", date: "Pending" },
        { role: "AIM Team Acceptance", person: "Michael Yoder", status: "waiting", date: "Waiting" },
      ],
      status: "approved_partial",
      processed: false,
      targetApps: [
        { app: "Aladdin OMS", access: "Portfolio_Rebalancer role", risk: "Medium" },
        { app: "Charles River IMS", access: "Compliance_Checker role", risk: "Medium" },
        { app: "Bloomberg Terminal", access: "Market_Data_Reader role", risk: "Low" },
        { app: "ServiceNow", access: "Workflow_Initiator role", risk: "Low" },
      ],
      governance: {
        owner: "Jennifer Walsh, BMSA Operations Lead",
        sponsor: "Mark Chen, Managing Director, Multi-Asset Strategies",
        authMethod: "X.509 Certificate (90-day rotation)",
        platform: "Atlas Agent Orchestrator",
      },
      riskAssessment: {
        dataSensitivity: "Medium (MNPI via Aladdin)",
        regulatoryImpact: "SOX, MiFID II",
        overallTier: "Tier 2",
      },
    },
    aquera: [
      { app: "Aladdin OMS", appOwner: "Portfolio Management Tech", source: "AIM Notify - Aladdin", scimEndpoint: "https://aquera.blk.com/scim/aladdin", entitlement: "Portfolio_Rebalancer", synthStatus: "Not Registered", registeredAt: "—" },
      { app: "Charles River IMS", appOwner: "Trading Technology", source: "CRD IMS - BMSA", scimEndpoint: "https://aquera.blk.com/scim/crd", entitlement: "Compliance_Checker", synthStatus: "Not Registered", registeredAt: "—" },
      { app: "Bloomberg Terminal", appOwner: "Market Data Services", source: "Bloomberg SCIM", scimEndpoint: "https://aquera.blk.com/scim/bbg", entitlement: "Market_Data_Reader", synthStatus: "Not Registered", registeredAt: "—" },
      { app: "ServiceNow", appOwner: "IT Operations", source: "ServiceNow - ITSM", scimEndpoint: "https://aquera.blk.com/scim/snow", entitlement: "Workflow_Initiator", synthStatus: "Not Registered", registeredAt: "—" },
    ],
    sailpoint: [
      { app: "Aladdin OMS", acct: "bmsa-synth-001@aladdin", status: "Pending", role: "Portfolio_Rebalancer", provisioned: "—", lastUsed: "—" },
      { app: "Charles River IMS", acct: "bmsa-synth-001@charlesriver", status: "Pending", role: "Compliance_Checker", provisioned: "—", lastUsed: "—" },
      { app: "Bloomberg Terminal", acct: "bmsa-synth-001@bloomberg", status: "Pending", role: "Market_Data_Reader", provisioned: "—", lastUsed: "—" },
      { app: "ServiceNow", acct: "bmsa-synth-001@servicenow", status: "Pending", role: "Workflow_Initiator", provisioned: "—", lastUsed: "—" },
    ],
    brainwave: {
      campaign: "Q2 2026 BMSA Access Recertification",
      due: "April 30, 2026",
      identities: [
        { name: "Sarah Chen", type: "Employee", apps: 6, ents: 24, certifier: "Tom Walsh", status: "Certified", risk: "Low" },
        { name: "John Park", type: "Employee", apps: 5, ents: 19, certifier: "Tom Walsh", status: "Certified", risk: "Low" },
        { name: "Lisa Wang", type: "Employee", apps: 4, ents: 15, certifier: "Jennifer Walsh", status: "Certified", risk: "Low" },
        { name: "David Kim", type: "Employee", apps: 7, ents: 31, certifier: "Jennifer Walsh", status: "Pending", risk: "Medium" },
        { name: "Emily Zhang", type: "Employee", apps: 3, ents: 11, certifier: "Jennifer Walsh", status: "Certified", risk: "Low" },
        { name: "BMSA-SYNTH-001", type: "Synthetic Worker", apps: 4, ents: 12, certifier: "Jennifer Walsh", status: "Pending", risk: "Low" },
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
  const now = new Date().toISOString();
  for (const connector of state.aquera) {
    connector.synthStatus = "Registered";
    connector.registeredAt = now;
  }
  return { success: true, message: `${identityId} registered in all Aquera SCIM connectors — identity profiles pushed to SailPoint` };
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
    (i) => i.name === identityId
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
