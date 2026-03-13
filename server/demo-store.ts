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
  synthStatus: "Not Registered" | "Registered" | "Policy Blocked";
  registeredAt: string;
  sodBlock?: {
    conflictingRole: string;
    violationType: string;
    regulation: string;
  };
}

export interface SailPointAccount {
  app: string;
  acct: string;
  status: "Active" | "Pending" | "Suspended";
  role: string;
  provisioned: string;
  lastUsed: string;
}

export interface PrivEscState {
  active: boolean;
  detectedAt: string | null;
  anomalyEndpoint: string;
  entitlementGranted: string;
  incidentId: string | null;
  severity: string;
  regulation: string;
  reviewPath: "revoke_reissue" | "forensic" | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
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

export interface SodViolationState {
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

export interface DemoState {
  servicenow: ServiceNowRequest;
  aquera: AqueraConnector[];
  sailpoint: SailPointAccount[];
  brainwave: BrainwaveCertification;
  auditLog: AuditEntry[];
  sodViolation: SodViolationState;
  privEscViolation: PrivEscState;
}

let auditCounter = 0;
let sodPending = false;
let privEscPending = false;

export function getSodPending(): boolean {
  return sodPending;
}

export function setSodPending(value: boolean): void {
  sodPending = value;
}

export function getPrivEscPending(): boolean {
  return privEscPending;
}

export function setPrivEscPending(value: boolean): void {
  privEscPending = value;
}

function createInitialPrivEscState(): PrivEscState {
  return {
    active: false,
    detectedAt: null,
    anomalyEndpoint: "/trading/execute",
    entitlementGranted: "Market_Data_Reader",
    incidentId: null,
    severity: "CRITICAL",
    regulation: "IOSCO SR 11-7",
    reviewPath: null,
    resolvedAt: null,
    resolvedBy: null,
  };
}

function createInitialSodState(): SodViolationState {
  return {
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
}

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
        { role: "AI Risk Operating Committee", person: "AI ROC Board", status: "approved", date: "Mar 6" },
        { role: "AIM Team Acceptance", person: "Michael Yoder", status: "approved", date: "Mar 7" },
      ],
      status: "approved",
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
    sailpoint: [],
    brainwave: {
      campaign: "Q2 2026 BMSA Access Recertification",
      due: "April 30, 2026",
      identities: [
        { name: "Sarah Chen", type: "Employee", apps: 6, ents: 24, certifier: "Tom Walsh", status: "Certified", risk: "Low" },
        { name: "John Park", type: "Employee", apps: 5, ents: 19, certifier: "Tom Walsh", status: "Certified", risk: "Low" },
        { name: "Lisa Wang", type: "Employee", apps: 4, ents: 15, certifier: "Jennifer Walsh", status: "Certified", risk: "Low" },
        { name: "David Kim", type: "Employee", apps: 7, ents: 31, certifier: "Jennifer Walsh", status: "Pending", risk: "Medium" },
        { name: "Emily Zhang", type: "Employee", apps: 3, ents: 11, certifier: "Jennifer Walsh", status: "Certified", risk: "Low" },
      ],
    },
    auditLog: [],
    sodViolation: createInitialSodState(),
    privEscViolation: createInitialPrivEscState(),
  };
}

let state: DemoState = createInitialState();

export function getState(): DemoState {
  return state;
}

export function getSodViolation(): SodViolationState {
  return state.sodViolation;
}

export function triggerSodViolation(): { success: boolean; sodViolation: SodViolationState } {
  const now = new Date().toISOString();
  state.sodViolation = {
    ...createInitialSodState(),
    active: true,
    conflictDetectedAt: now,
  };

  const aladdin = state.aquera.find((c) => c.app === "Aladdin OMS");
  if (aladdin) {
    aladdin.synthStatus = "Policy Blocked";
    aladdin.sodBlock = {
      conflictingRole: "Order_Approver",
      violationType: "SoD Conflict",
      regulation: "SOX §404",
    };
  }

  auditCounter++;
  state.auditLog.push({ id: auditCounter, timestamp: now, action: "SoD_VIOLATION", system: "Aquera", details: "SoD_VIOLATION | SOX_S404 | Compliance pre-check detected conflict: Portfolio_Rebalancer (requested) + Order_Approver (existing manual grant) violates SOX §404 Separation of Duties. Provisioning suspended pending remediation." });
  auditCounter++;
  state.auditLog.push({ id: auditCounter, timestamp: new Date().toISOString(), action: "POLICY_BLOCKED", system: "Aquera", details: "Aladdin OMS connector marked Policy Blocked. BMSA-SYNTH-001 provisioning halted. Orchestrator routing to human review queue — SailPoint step bypassed." });
  auditCounter++;
  state.auditLog.push({ id: auditCounter, timestamp: new Date().toISOString(), action: "HUMAN_REVIEW_QUEUED", system: "ATLAS Orchestrator", details: "Violation incident INC-SOD-20260313 created. Routed to Jennifer Walsh (BMSA Operations Lead) for remediation decision. Dual sign-off required for exception path." });

  return { success: true, sodViolation: state.sodViolation };
}

export function resolveSodViolation(path: "revoke" | "exception", resolvedBy?: string): { success: boolean; sodViolation: SodViolationState } {
  if (!state.sodViolation.active) {
    return { success: false, sodViolation: state.sodViolation };
  }

  const now = new Date().toISOString();
  const resolver = resolvedBy || "Jennifer Walsh";
  state.sodViolation.resolutionPath = path;
  state.sodViolation.resolvedAt = now;
  state.sodViolation.resolvedBy = resolver;

  const aladdin = state.aquera.find((c) => c.app === "Aladdin OMS");

  if (path === "revoke") {
    if (aladdin) {
      aladdin.synthStatus = "Not Registered";
      delete aladdin.sodBlock;
    }
    auditCounter++;
    state.auditLog.push({ id: auditCounter, timestamp: now, action: "SOD_RESOLVED_REVOKE", system: "SailPoint", details: `Resolution path A selected by ${resolver}: Legacy role Order_Approver revoked from BMSA-SYNTH-001 in Aladdin OMS. SoD conflict cleared. Provisioning pipeline may now resume.` });
    auditCounter++;
    state.auditLog.push({ id: auditCounter, timestamp: new Date().toISOString(), action: "AUDIT_SOX_S404", system: "Brainwave", details: "SOX §404 audit record updated: SoD violation remediated via role revocation. Incident INC-SOD-20260313 closed. Compliance posture restored." });
  } else {
    if (aladdin) {
      aladdin.synthStatus = "Not Registered";
      delete aladdin.sodBlock;
    }
    auditCounter++;
    state.auditLog.push({ id: auditCounter, timestamp: now, action: "SOD_RESOLVED_EXCEPTION", system: "ATLAS Orchestrator", details: `Resolution path B selected: Exception approved with dual sign-off — ${resolver} + Mark Chen (Managing Director). Compensating controls: enhanced monitoring, 30-day review cycle, Brainwave alert threshold lowered to HIGH.` });
    auditCounter++;
    state.auditLog.push({ id: auditCounter, timestamp: new Date().toISOString(), action: "AUDIT_SOX_S404", system: "Brainwave", details: "SOX §404 audit record updated: SoD exception granted with dual-approver sign-off. Compensating control package attached. Incident INC-SOD-20260313 closed — exception tracked." });
  }

  return { success: true, sodViolation: state.sodViolation };
}

export function getPrivEscViolation(): PrivEscState {
  return state.privEscViolation;
}

export function triggerPrivEsc(): { success: boolean; privEscViolation: PrivEscState } {
  const now = new Date().toISOString();
  const incidentId = `INC-PRIV-${Date.now()}`;
  state.privEscViolation = {
    ...createInitialPrivEscState(),
    active: true,
    detectedAt: now,
    incidentId,
  };

  for (const c of state.aquera) {
    (c as any).synthStatus = "Suspended_Pending_Review";
  }
  for (const s of state.sailpoint) {
    s.status = "Suspended";
  }

  auditCounter++;
  state.auditLog.push({ id: auditCounter, timestamp: now, action: "ANOMALY_DETECTED", system: "Brainwave", details: `ANOMALY_DETECTED | CRITICAL | BMSA-SYNTH-001 invoked Bloomberg Terminal endpoint /trading/execute — outside granted Market_Data_Reader entitlement scope. Risk score: 98/100. Possible credential misuse or privilege escalation attempt.` });
  auditCounter++;
  state.auditLog.push({ id: auditCounter, timestamp: new Date().toISOString(), action: "INCIDENT_ESCALATED", system: "Brainwave", details: `INCIDENT_ESCALATED | ${incidentId} | Severity: CRITICAL | Regulation: IOSCO SR 11-7. AI Risk Operating Committee notified. Certificate BMSA-SYNTH-001-X509 flagged for forensic review.` });
  auditCounter++;
  state.auditLog.push({ id: auditCounter, timestamp: new Date().toISOString(), action: "SESSION_SUSPENDED", system: "RadiantOne", details: `SESSION_SUSPENDED | BMSA-SYNTH-001 active sessions terminated across all 4 applications: Aladdin OMS, Charles River IMS, Bloomberg Terminal, ServiceNow. Status: Suspended_Pending_Review.` });
  auditCounter++;
  state.auditLog.push({ id: auditCounter, timestamp: new Date().toISOString(), action: "IOSCO_SR11-7_FLAGGED", system: "Brainwave", details: `IOSCO_SR11-7_FLAGGED | Model risk incident report initiated under IOSCO SR 11-7. Audit package frozen. Full credential forensic trace enabled. Incident ${incidentId} queued for AI ROC review.` });

  return { success: true, privEscViolation: state.privEscViolation };
}

export function resolvePrivEsc(path: "revoke_reissue" | "forensic", resolvedBy?: string): { success: boolean; privEscViolation: PrivEscState } {
  if (!state.privEscViolation.active) {
    return { success: false, privEscViolation: state.privEscViolation };
  }

  const now = new Date().toISOString();
  const resolver = resolvedBy || "Jennifer Walsh";
  state.privEscViolation.reviewPath = path;
  state.privEscViolation.resolvedAt = now;
  state.privEscViolation.resolvedBy = resolver;

  auditCounter++;
  if (path === "revoke_reissue") {
    state.auditLog.push({ id: auditCounter, timestamp: now, action: "CERT_REVOKED_REISSUED", system: "ATLAS Orchestrator", details: `CERT_REVOKED_REISSUED | X.509 certificate BMSA-SYNTH-001-X509 revoked by ${resolver}. New certificate issued with tighter scope (Market_Data_Reader only, Bloomberg read-only endpoint whitelist). Enhanced monitoring enabled. Incident ${state.privEscViolation.incidentId} resolved.` });
  } else {
    state.auditLog.push({ id: auditCounter, timestamp: now, action: "FORENSIC_INVESTIGATION", system: "ATLAS Orchestrator", details: `FORENSIC_INVESTIGATION | Full audit freeze initiated by ${resolver}. Credential forensics package sent to AI Risk Operating Committee. BMSA-SYNTH-001 remains Suspended_Pending_Review. Incident ${state.privEscViolation.incidentId} under active investigation.` });
  }

  return { success: true, privEscViolation: state.privEscViolation };
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
    if (connector.synthStatus !== "Policy Blocked") {
      connector.synthStatus = "Registered";
      connector.registeredAt = now;
    }
  }
  return { success: true, message: `${identityId} registered in all Aquera SCIM connectors — identity profiles pushed to SailPoint` };
}

export function provisionAccount(identityId: string, app: string, role: string): { success: boolean; message: string } {
  const now = new Date();
  const provisionedDate = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const existing = state.sailpoint.find((a) => a.app === app);
  if (existing) {
    existing.status = "Active";
    existing.role = role;
    existing.provisioned = provisionedDate;
    existing.lastUsed = "Just now";
  } else {
    const slug = app.toLowerCase().replace(/[^a-z0-9]/g, "");
    state.sailpoint.push({
      app,
      acct: `bmsa-synth-001@${slug}`,
      status: "Active",
      role,
      provisioned: provisionedDate,
      lastUsed: "Just now",
    });
  }
  return { success: true, message: `${app} account provisioned for ${identityId} with role ${role}` };
}

export function certifyIdentity(identityId: string): { success: boolean; message: string } {
  const identity = state.brainwave.identities.find((i) => i.name === identityId);
  if (identity) {
    identity.status = "Certified";
  } else {
    state.brainwave.identities.push({
      name: identityId,
      type: "Synthetic Worker",
      apps: Math.max(state.sailpoint.length, 4),
      ents: Math.max(state.sailpoint.length * 3, 12),
      certifier: "Jennifer Walsh",
      status: "Certified",
      risk: "Low",
    });
  }
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
  sodPending = false;
  privEscPending = false;
  state = createInitialState();
}
