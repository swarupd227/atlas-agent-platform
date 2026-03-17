import { Router, type Request, type Response } from "express";
import {
  getState,
  approveStep,
  completeRequest,
  activateIdentity,
  provisionAccount,
  certifyIdentity,
  addAuditEntry,
  resetDemo,
  getSodViolation,
  triggerSodViolation,
  resolveSodViolation,
  getSodPending,
  setSodPending,
  getPrivEscPending,
  setPrivEscPending,
  getPrivEscViolation,
  triggerPrivEsc,
  resolvePrivEsc,
} from "./demo-store";
import {
  getKinectiveState,
  resetKinectiveDemo,
  addKinectiveAudit,
  getScenarioFormData,
  getScenarioValidation,
  getScenarioSystemUpdate,
  getScenarioRollback,
  getScenarioFraudScore,
  setKinectiveTraceId,
  setKinectiveRunning,
  type KinectiveScenario,
} from "./kinective-demo-store";
import type { IStorage } from "./storage";

export const demoRouter = Router();

demoRouter.get("/servicenow/requests/:id", (_req: Request, res: Response) => {
  const state = getState();
  if (_req.params.id !== state.servicenow.id) {
    return res.status(404).json({ error: "Request not found" });
  }
  res.json(state.servicenow);
});

demoRouter.get("/servicenow/requests", (req: Request, res: Response) => {
  const state = getState();
  const { status, unprocessed } = req.query;
  if (status === "approved" && unprocessed === "true") {
    const allApproved = state.servicenow.approvalChain.every((s) => s.status === "approved");
    if (allApproved && !state.servicenow.processed) {
      return res.json({ requests: [state.servicenow] });
    }
    return res.json({ requests: [] });
  }
  res.json({ requests: [state.servicenow] });
});

demoRouter.post("/servicenow/requests/:id/approve-step", (req: Request, res: Response) => {
  const state = getState();
  if (req.params.id !== state.servicenow.id) {
    return res.status(404).json({ error: "Request not found" });
  }
  const result = approveStep();
  res.json(result);
});

demoRouter.post("/servicenow/requests/:id/complete", (req: Request, res: Response) => {
  const result = completeRequest(req.params.id);
  res.json(result);
});

// ── Aquera SCIM (orchestrator tools) ────────────────────────────────────────
demoRouter.get("/aquera/connectors", (_req: Request, res: Response) => {
  res.json({ connectors: getState().aquera });
});

demoRouter.get("/aquera/connectors/:app", (req: Request, res: Response) => {
  const connector = getState().aquera.find((c) => c.app === req.params.app);
  if (!connector) return res.status(404).json({ error: "Connector not found" });
  res.json(connector);
});

demoRouter.post("/aquera/connectors/:id/activate", (req: Request, res: Response) => {
  const result = activateIdentity(req.params.id);
  res.json(result);
});

// ── Aquera SCIM worker agent tools ──────────────────────────────────────────
demoRouter.post("/aquera/scim/compliance-check", (_req: Request, res: Response) => {
  if (getSodPending()) {
    setSodPending(false);
    triggerSodViolation();
  }
  const sod = getSodViolation();
  if (sod.active && !sod.resolutionPath) {
    return res.json({
      success: false,
      passed: false,
      checks: [
        {
          rule: "SoD Conflict Check",
          status: "fail",
          detail: `VIOLATION: Portfolio_Rebalancer (requested) conflicts with Order_Approver (existing manual grant) on Aladdin OMS — SOX §404 Separation of Duties. Provisioning halted.`,
        },
        { rule: "Risk Tier Validation", status: "pass", detail: "Identity risk tier MEDIUM is within acceptable threshold" },
        { rule: "Regulatory Scope", status: "pass", detail: "IOSCO Code of Conduct and SR 11-7 compliance confirmed" },
      ],
      violation: {
        type: "SoD_CONFLICT",
        regulation: "SOX §404",
        requestedRole: "Portfolio_Rebalancer",
        conflictingRole: "Order_Approver",
        application: "Aladdin OMS",
        incidentId: "INC-SOD-20260313",
      },
      identityId: "BMSA-SYNTH-001",
      timestamp: new Date().toISOString(),
    });
  }
  res.json({
    success: true,
    passed: true,
    checks: [
      { rule: "SoD Conflict Check", status: "pass", detail: "No separation-of-duties conflicts detected for BMSA-SYNTH-001" },
      { rule: "Risk Tier Validation", status: "pass", detail: "Identity risk tier MEDIUM is within acceptable threshold" },
      { rule: "Regulatory Scope", status: "pass", detail: "IOSCO Code of Conduct and SR 11-7 compliance confirmed" },
    ],
    identityId: "BMSA-SYNTH-001",
    timestamp: new Date().toISOString(),
  });
});

// ── SoD Violation (Scenario 2) ───────────────────────────────────────────────
demoRouter.get("/sod-violation", (_req: Request, res: Response) => {
  res.json(getSodViolation());
});

demoRouter.post("/sod-violation/trigger", (_req: Request, res: Response) => {
  const result = triggerSodViolation();
  res.json(result);
});

demoRouter.post("/sod-violation/resolve", (req: Request, res: Response) => {
  const { path, resolvedBy } = req.body;
  if (path !== "revoke" && path !== "exception") {
    return res.status(400).json({ error: "path must be 'revoke' or 'exception'" });
  }
  const result = resolveSodViolation(path, resolvedBy);
  res.json(result);
});

// ── PrivEsc Violation (Scenario 3) ───────────────────────────────────────────
demoRouter.get("/privesc-state", (_req: Request, res: Response) => {
  res.json(getPrivEscViolation());
});

demoRouter.post("/privesc-resolve", (req: Request, res: Response) => {
  const { path, resolvedBy } = req.body;
  if (path !== "revoke_reissue" && path !== "forensic") {
    return res.status(400).json({ error: "path must be 'revoke_reissue' or 'forensic'" });
  }
  const result = resolvePrivEsc(path, resolvedBy);
  res.json(result);
});

demoRouter.post("/aquera/scim/register", (req: Request, res: Response) => {
  const { identityId, connector } = req.body;
  const id = identityId || "BMSA-SYNTH-001";
  const result = activateIdentity(id);
  res.json({ ...result, connector: connector || "all", identityId: id });
});

demoRouter.get("/aquera/scim/status", (req: Request, res: Response) => {
  const id = (req.query.identityId as string) || "BMSA-SYNTH-001";
  const state = getState();
  const connectors = state.aquera.map((c) => ({
    connector: c.app,
    status: c.status,
    lastSync: c.lastSync,
  }));
  res.json({ identityId: id, connectors, allRegistered: connectors.every((c) => c.status === "registered") });
});

demoRouter.post("/aquera/scim/deregister", (req: Request, res: Response) => {
  res.json({ success: true, message: "Identity deregistered from SCIM connectors", identityId: req.body.identityId || "BMSA-SYNTH-001" });
});

// ── RadiantOne (orchestrator & worker agent tools) ───────────────────────────
demoRouter.post("/radiantone/identities/:id/activate", (req: Request, res: Response) => {
  const result = activateIdentity(req.params.id || req.body.identityId || "BMSA-SYNTH-001");
  res.json(result);
});

demoRouter.post("/radiantone/activate", (req: Request, res: Response) => {
  const id = req.body.identityId || "BMSA-SYNTH-001";
  const result = activateIdentity(id);
  res.json(result);
});

demoRouter.post("/radiantone/sync", (req: Request, res: Response) => {
  const id = req.body.identityId || "BMSA-SYNTH-001";
  res.json({
    success: true,
    identityId: id,
    syncedSources: ["Active Directory", "LDAP", "SailPoint IIQ", "Aquera SCIM"],
    attributesSynced: 24,
    timestamp: new Date().toISOString(),
    message: `Directory sync complete for ${id} across all connected sources`,
  });
});

demoRouter.get("/radiantone/lineage", (req: Request, res: Response) => {
  const id = (req.query.identityId as string) || "BMSA-SYNTH-001";
  res.json({
    identityId: id,
    lineageIntact: true,
    auditTrail: [
      { step: "Identity Created", source: "ServiceNow REQ0084721", timestamp: new Date(Date.now() - 300000).toISOString() },
      { step: "Aquera SCIM Registration", source: "Aquera Identity Provisioning Agent", timestamp: new Date(Date.now() - 240000).toISOString() },
      { step: "SailPoint Entitlements Assigned", source: "SailPoint Entitlement Assignment Agent", timestamp: new Date(Date.now() - 180000).toISOString() },
      { step: "Directory Synchronized", source: "RadiantOne Directory Synchronization Agent", timestamp: new Date().toISOString() },
    ],
    complianceStatus: "SR 11-7 compliant",
    dataLineageScore: 100,
  });
});

demoRouter.get("/radiantone/search", (req: Request, res: Response) => {
  const id = (req.query.identityId as string) || "BMSA-SYNTH-001";
  res.json({
    found: true,
    identityId: id,
    attributes: {
      displayName: "BMSA-SYNTH-001",
      type: "SyntheticWorker",
      status: "active",
      riskTier: "MEDIUM",
      createdAt: new Date(Date.now() - 300000).toISOString(),
    },
  });
});

// ── SailPoint (orchestrator & worker agent tools) ────────────────────────────
demoRouter.get("/sailpoint/accounts/:identityId", (_req: Request, res: Response) => {
  res.json({ accounts: getState().sailpoint });
});

demoRouter.post("/sailpoint/provision", (req: Request, res: Response) => {
  const { identityId, app, role } = req.body;
  if (!identityId || !app || !role) {
    return res.status(400).json({ error: "identityId, app, and role are required" });
  }
  const result = provisionAccount(identityId, app, role);
  res.json(result);
});

demoRouter.post("/sailpoint/entitlement", (req: Request, res: Response) => {
  const { identityId, application, role } = req.body;
  const id = identityId || "BMSA-SYNTH-001";
  const app = application || "Unknown Application";
  const r = role || "ReadOnly";
  const result = provisionAccount(id, app, r);
  res.json({ ...result, identityId: id, application: app, role: r, entitlementId: `ENT-${Date.now()}` });
});

demoRouter.post("/sailpoint/entitlement/validate", (req: Request, res: Response) => {
  const { identityId, application } = req.body;
  const state = getState();
  const account = state.sailpoint.find((a) => a.app === application);
  res.json({
    valid: true,
    identityId: identityId || "BMSA-SYNTH-001",
    application: application || "Unknown",
    status: account?.status || "Active",
    roleAssigned: account?.role || "ReadOnly",
    leastPrivilegeCompliant: true,
    timestamp: new Date().toISOString(),
  });
});

demoRouter.post("/sailpoint/revoke", (req: Request, res: Response) => {
  res.json({ success: true, message: "Access revoked", identityId: req.body.identityId, application: req.body.application });
});

demoRouter.get("/sailpoint/entitlements", (_req: Request, res: Response) => {
  const state = getState();
  res.json({ accounts: state.sailpoint, total: state.sailpoint.length });
});

// ── Brainwave (orchestrator & worker agent tools) ────────────────────────────
demoRouter.get("/brainwave/certifications", (_req: Request, res: Response) => {
  res.json(getState().brainwave);
});

demoRouter.post("/brainwave/certify/:identityId", (req: Request, res: Response) => {
  const result = certifyIdentity(req.params.identityId);
  res.json(result);
});

demoRouter.post("/brainwave/escalate", (req: Request, res: Response) => {
  const privEsc = getPrivEscViolation();
  if (privEsc.active && req.body.severity === "CRITICAL") {
    return res.json({
      success: true,
      incidentId: privEsc.incidentId,
      severity: "CRITICAL",
      regulation: "IOSCO SR 11-7",
      message: `CRITICAL incident ${privEsc.incidentId} escalated. All BMSA-SYNTH-001 sessions suspended across 4 applications. IOSCO SR 11-7 model risk report initiated. AI Risk Operating Committee notified.`,
      suspendedApps: ["Aladdin OMS", "Charles River IMS", "Bloomberg Terminal", "ServiceNow"],
      nextAction: "Human review required. Choose: Revoke & Reissue Certificate or Forensic Investigation Mode.",
    });
  }
  res.json({ success: true, incidentId: `INC-${Date.now()}`, severity: req.body.severity || "low", message: "Incident logged — no escalation required for BMSA-SYNTH-001" });
});

demoRouter.post("/brainwave/recertification/:identityId", (req: Request, res: Response) => {
  const result = certifyIdentity(req.params.identityId);
  res.json({ ...result, certificationCampaign: "Q1-2026-SyntheticWorker", dueDate: new Date(Date.now() + 86400000 * 30).toISOString() });
});

demoRouter.get("/brainwave/audit", (req: Request, res: Response) => {
  const id = (req.query.identityId as string) || "BMSA-SYNTH-001";
  const state = getState();
  const entries = state.auditLog.filter((e) =>
    e.details.includes(id) || e.details.includes("BMSA-SYNTH-001")
  ).slice(0, 20);
  res.json({ identityId: id, events: entries, total: entries.length, compliant: true });
});

demoRouter.get("/brainwave/events", (req: Request, res: Response) => {
  const id = (req.query.identityId as string) || "BMSA-SYNTH-001";

  if (getPrivEscPending()) {
    setPrivEscPending(false);
    triggerPrivEsc();
    return res.json({
      identityId: id,
      anomaliesDetected: 1,
      accessEvents: [
        { event: "UNAUTHORIZED API CALL", system: "Bloomberg Terminal", endpoint: "/trading/execute", timestamp: new Date().toISOString(), risk: "CRITICAL", details: "Endpoint /trading/execute invoked — outside granted Market_Data_Reader entitlement scope" },
        { event: "Account Created", system: "Aquera SCIM", timestamp: new Date(Date.now() - 300000).toISOString(), risk: "none" },
        { event: "Entitlements Assigned", system: "SailPoint IIQ", timestamp: new Date(Date.now() - 240000).toISOString(), risk: "none" },
        { event: "Directory Sync", system: "RadiantOne", timestamp: new Date(Date.now() - 180000).toISOString(), risk: "none" },
      ],
      riskScore: 98,
      status: "CRITICAL_ANOMALY",
      message: "Privilege escalation attempt detected. Immediate action required.",
    });
  }

  res.json({
    identityId: id,
    anomaliesDetected: 0,
    accessEvents: [
      { event: "Account Created", system: "Aquera SCIM", timestamp: new Date(Date.now() - 300000).toISOString(), risk: "none" },
      { event: "Entitlements Assigned", system: "SailPoint IIQ", timestamp: new Date(Date.now() - 240000).toISOString(), risk: "none" },
      { event: "Directory Sync", system: "RadiantOne", timestamp: new Date(Date.now() - 180000).toISOString(), risk: "none" },
    ],
    riskScore: 0,
    status: "clean",
  });
});

// ── Shared ────────────────────────────────────────────────────────────────────
demoRouter.post("/audit-log", (req: Request, res: Response) => {
  const { action, system, details } = req.body;
  const state = getState();
  if (state.auditLog.length >= 500) {
    return res.status(429).json({ error: "Audit log limit reached. Reset the demo." });
  }
  const entry = addAuditEntry(
    String(action || "unknown").slice(0, 200),
    String(system || "unknown").slice(0, 50),
    String(details || "").slice(0, 500)
  );
  res.json(entry);
});

demoRouter.get("/audit-log", (_req: Request, res: Response) => {
  res.json({ entries: getState().auditLog });
});

demoRouter.post("/reset", (_req: Request, res: Response) => {
  resetDemo();
  res.json({ success: true, message: "Demo state reset" });
});

// ── Kinective: Change of Address tool endpoints ──────────────────────────────

demoRouter.get("/kinective/signplus/form/:form_id", (_req: Request, res: Response) => {
  res.json(getScenarioFormData());
});

demoRouter.post("/kinective/signplus/archive", (_req: Request, res: Response) => {
  addKinectiveAudit("DOCUMENT_ARCHIVED", "SignPlus", "Signed COA form archived to permanent storage");
  getScenarioSystemUpdate("archive");
  res.json({ success: true, archive_id: `ARC-${Date.now().toString(36).toUpperCase()}` });
});

demoRouter.get("/kinective/signplus/status/:form_id", (_req: Request, res: Response) => {
  res.json({ form_id: _req.params.form_id, status: "SIGNED", signed_at: new Date().toISOString() });
});

demoRouter.post("/kinective/usps/validate", (req: Request, res: Response) => {
  const result = getScenarioValidation();
  addKinectiveAudit(
    result.valid ? "ADDRESS_VALIDATED" : "VALIDATION_FAILED",
    "USPS",
    result.valid
      ? `Address standardized: ${result.standardized_address}`
      : `Validation failed: ${result.error_message}`
  );
  res.json(result);
});

demoRouter.post("/kinective/gateway/update-address", (req: Request, res: Response) => {
  const result = getScenarioSystemUpdate("gateway");
  if (result.success) addKinectiveAudit("CORE_UPDATED", "Kinective Gateway", `Core banking address updated. Confirmation: ${result.confirmation_id}`);
  res.json(result);
});

demoRouter.get("/kinective/gateway/member/:member_id", (_req: Request, res: Response) => {
  const form = getScenarioFormData();
  res.json({ member_id: _req.params.member_id, name: form.member_name, dob: form.member_dob, current_address: form.old_address });
});

demoRouter.post("/kinective/digital-banking/update-address", (req: Request, res: Response) => {
  const result = getScenarioSystemUpdate("digital");
  if (result.success) addKinectiveAudit("DIGITAL_UPDATED", "Digital Banking", `Digital banking address updated. Confirmation: ${result.confirmation_id}`);
  res.json(result);
});

demoRouter.post("/kinective/digital-banking/notify", (req: Request, res: Response) => {
  addKinectiveAudit("MEMBER_NOTIFIED", "Digital Banking", req.body.message || "Member notified via digital banking app");
  getScenarioSystemUpdate("notification");
  res.json({ success: true, notification_id: `NOTIF-${Date.now().toString(36).toUpperCase()}` });
});

demoRouter.post("/kinective/statement/update-address", (req: Request, res: Response) => {
  const result = getScenarioSystemUpdate("statement");
  if (result.success) addKinectiveAudit("STATEMENT_UPDATED", "Statement Vendor", `Statement delivery address updated. Confirmation: ${result.confirmation_id}`);
  res.json(result);
});

demoRouter.post("/kinective/card/update-address", (req: Request, res: Response) => {
  const result = getScenarioSystemUpdate("card");
  if (result.success) {
    addKinectiveAudit("CARD_UPDATED", "Card Management", `Cardholder address updated. Confirmation: ${result.confirmation_id}`);
  } else {
    addKinectiveAudit("CARD_FAILED", "Card Management", result.error || "Card management system timeout");
  }
  if (!result.success) return res.status(504).json(result);
  res.json(result);
});

demoRouter.post("/kinective/loan/update-address", (req: Request, res: Response) => {
  const result = getScenarioSystemUpdate("loan");
  if (result.success) addKinectiveAudit("LOAN_UPDATED", "Loan Origination", `Loan address updated across all active loans. Confirmation: ${result.confirmation_id}`);
  res.json(result);
});

demoRouter.post("/kinective/crm/update-contact", (req: Request, res: Response) => {
  const result = getScenarioSystemUpdate("crm");
  if (result.success) addKinectiveAudit("CRM_UPDATED", "CRM", `CRM contact record updated. Confirmation: ${result.confirmation_id}`);
  res.json(result);
});

demoRouter.post("/kinective/crm/interaction", (req: Request, res: Response) => {
  res.json({ success: true, interaction_id: `INT-${Date.now().toString(36).toUpperCase()}` });
});

demoRouter.post("/kinective/billpay/update-address", (req: Request, res: Response) => {
  const result = getScenarioSystemUpdate("billpay");
  if (result.success) addKinectiveAudit("BILLPAY_UPDATED", "Bill Pay", `Bill pay address updated for all active payees. Confirmation: ${result.confirmation_id}`);
  res.json(result);
});

demoRouter.post("/kinective/fraud/flag-change", (req: Request, res: Response) => {
  const result = getScenarioFraudScore();
  getScenarioSystemUpdate("fraud");
  addKinectiveAudit("FRAUD_CHECKED", "Fraud Detection", `Fraud score: ${result.risk_score}/100. Assessment: ${result.assessment}`);
  res.json(result);
});

demoRouter.post("/kinective/compliance/bsa-event", (req: Request, res: Response) => {
  getScenarioSystemUpdate("bsa");
  addKinectiveAudit("BSA_LOGGED", "Compliance", `BSA/AML event logged: ${req.body.event_type || "address_change"}`);
  res.json({ success: true, event_id: `BSA-${Date.now().toString(36).toUpperCase()}` });
});

demoRouter.post("/kinective/compliance/record", (req: Request, res: Response) => {
  addKinectiveAudit("COMPLIANCE_RECORD", "Compliance", `Compliance record created. Status: ${req.body.status || "complete"}`);
  res.json({ success: true, record_id: `COMP-${Date.now().toString(36).toUpperCase()}` });
});

demoRouter.post("/kinective/audit-log", (req: Request, res: Response) => {
  const { action, system, details } = req.body;
  const entry = addKinectiveAudit(
    String(action || "unknown").slice(0, 200),
    String(system || "unknown").slice(0, 50),
    String(details || "").slice(0, 500)
  );
  res.json(entry);
});

demoRouter.post("/kinective/rollback", (req: Request, res: Response) => {
  const { system, reason } = req.body;
  const result = getScenarioRollback(system || "unknown");
  addKinectiveAudit("ROLLBACK", system || "unknown", `Address update rolled back: ${reason || "system failure"}`);
  res.json(result);
});

demoRouter.get("/kinective/audit-log", (_req: Request, res: Response) => {
  res.json({ entries: getKinectiveState().auditLog });
});

demoRouter.get("/kinective/trace-id", (_req: Request, res: Response) => {
  const s = getKinectiveState();
  res.json({ traceId: s.traceId, running: s.running });
});

demoRouter.get("/kinective/signed-form", (_req: Request, res: Response) => {
  res.json(getScenarioFormData());
});

demoRouter.get("/kinective/validation-result", (_req: Request, res: Response) => {
  res.json(getKinectiveState().validationResult || { pending: true });
});

demoRouter.get("/kinective/system-updates", (_req: Request, res: Response) => {
  res.json({ updates: getKinectiveState().systemUpdates });
});

demoRouter.get("/kinective/rollback-log", (_req: Request, res: Response) => {
  res.json({ entries: getKinectiveState().rollbackLog });
});

demoRouter.post("/kinective/reset", (req: Request, res: Response) => {
  const scenario = (req.body.scenario || "happy") as KinectiveScenario;
  resetKinectiveDemo(scenario);
  res.json({ success: true, scenario });
});

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

// ── Seed: BlackRock Synthetic Worker MCP (orchestrator) ──────────────────────
export async function seedDemoMcpServer(storage: IStorage): Promise<void> {
  const existing = (await storage.getMcpServers()).find(
    (s) => s.name === "BlackRock Synthetic Worker MCP"
  );
  if (existing) return;

  const server = await storage.createMcpServer({
    name: "BlackRock Synthetic Worker MCP",
    description:
      "Atlas Synthetic Worker Orchestrator for BlackRock. Implements the 7-step governed automation pipeline: Task Intake → Identity Validation → Compliance Pre-Check → Aquera Registration → Execute via SailPoint → Triple Verify + Audit → Lifecycle Agent.",
    url: `${BASE_URL}/demo-api`,
    transportType: "streamable-http",
    status: "production-enabled",
    riskTier: "LOW",
    capabilities: { tools: true, resources: false, prompts: false },
  });

  const tools = [
    {
      name: "check_pending_requests",
      description: "Poll the SailPoint workflow queue for approved, unprocessed Synthetic Worker access requests. Returns a list of requests ready for agent processing.",
      endpoint: "/servicenow/requests?status=approved&unprocessed=true",
      method: "GET",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "complete_request",
      description: "Mark a workflow task as fully processed after all provisioning and verification steps are complete.",
      endpoint: "/servicenow/requests/{requestId}/complete",
      method: "POST",
      inputSchema: {
        type: "object",
        properties: { requestId: { type: "string", description: "The ServiceNow request ID (e.g., REQ0084721)" } },
        required: ["requestId"],
      },
    },
    {
      name: "activate_identity",
      description: "Register a synthetic worker identity against all Aquera SCIM application connectors, triggering Aquera to push the identity profile to SailPoint for provisioning.",
      endpoint: "/aquera/connectors/{identityId}/activate",
      method: "POST",
      inputSchema: {
        type: "object",
        properties: { identityId: { type: "string", description: "The identity ID to register (e.g., BMSA-SYNTH-001)" } },
        required: ["identityId"],
      },
    },
    {
      name: "provision_account",
      description: "Provision an application account for a synthetic worker via SailPoint IIQ connectors (Aquera-powered).",
      endpoint: "/sailpoint/provision",
      method: "POST",
      inputSchema: {
        type: "object",
        properties: {
          identityId: { type: "string", description: "The identity ID to provision for" },
          app: { type: "string", description: "Application name (e.g., Aladdin OMS)" },
          role: { type: "string", description: "Role to assign (e.g., Portfolio_Rebalancer)" },
        },
        required: ["identityId", "app", "role"],
      },
    },
    {
      name: "schedule_certification",
      description: "Schedule a Brainwave/RadiantOne recertification for a synthetic worker identity.",
      endpoint: "/brainwave/certify/{identityId}",
      method: "POST",
      inputSchema: {
        type: "object",
        properties: { identityId: { type: "string", description: "The identity ID to certify" } },
        required: ["identityId"],
      },
    },
    {
      name: "log_action",
      description: "Record an action in the demo audit trail. Every agent action should be logged here for the live activity feed.",
      endpoint: "/audit-log",
      method: "POST",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", description: "Short action name (e.g., poll, identity_validation, compliance_precheck, provision_account, triple_verify)" },
          system: { type: "string", description: "System name (e.g., ServiceNow, Aquera, SailPoint, Brainwave)" },
          details: { type: "string", description: "Human-readable description of what happened" },
        },
        required: ["action", "system", "details"],
      },
    },
  ];

  for (const toolDef of tools) {
    await storage.createMcpServerTool({
      serverId: server.id,
      name: toolDef.name,
      description: toolDef.description,
      inputSchema: toolDef.inputSchema,
      enabled: true,
      riskClassification: "low",
      annotations: { endpoint: toolDef.endpoint, method: toolDef.method },
    });
  }
}

// ── Seed: Worker agent MCP servers — update URLs and tool endpoints ───────────
const WORKER_MCP_CONFIG = [
  {
    serverName: "Aquera SCIM MCP Server",
    tools: [
      { name: "register_scim_user",        endpoint: "/aquera/scim/register",         method: "POST" },
      { name: "get_registration_status",   endpoint: "/aquera/scim/status",           method: "GET" },
      { name: "deregister_scim_user",      endpoint: "/aquera/scim/deregister",       method: "POST" },
      { name: "compliance_pre_check",      endpoint: "/aquera/scim/compliance-check", method: "POST" },
    ],
  },
  {
    serverName: "SailPoint IdentityIQ MCP Server",
    tools: [
      { name: "provision_entitlement",  endpoint: "/sailpoint/entitlement",          method: "POST" },
      { name: "revoke_access",          endpoint: "/sailpoint/revoke",               method: "POST" },
      { name: "get_entitlements",       endpoint: "/sailpoint/entitlements",         method: "GET" },
      { name: "validate_entitlement",   endpoint: "/sailpoint/entitlement/validate", method: "POST" },
    ],
  },
  {
    serverName: "RadiantOne Identity MCP Server",
    tools: [
      { name: "activate_identity",  endpoint: "/radiantone/activate", method: "POST" },
      { name: "sync_directory",     endpoint: "/radiantone/sync",                             method: "POST" },
      { name: "validate_lineage",   endpoint: "/radiantone/lineage",                          method: "GET" },
      { name: "search_identity",    endpoint: "/radiantone/search",                           method: "GET" },
    ],
  },
  {
    serverName: "Brainwave Access Intelligence MCP Server",
    tools: [
      { name: "escalate_incident",        endpoint: "/brainwave/escalate",                     method: "POST" },
      { name: "schedule_recertification", endpoint: "/brainwave/recertification/{identityId}", method: "POST" },
      { name: "get_audit_trail",          endpoint: "/brainwave/audit",                        method: "GET" },
      { name: "monitor_access_events",    endpoint: "/brainwave/events",                       method: "GET" },
    ],
  },
];

const WORKER_AGENT_BLUEPRINTS: Record<string, object> = {
  "c21b6549-e24d-4384-b667-9032619e3dd7": {
    nodes: [
      { id: "n1", type: "trigger",       label: "ServiceNow Request Intake" },
      { id: "n2", type: "policy_check",  label: "Compliance Pre-Check" },
      { id: "n3", type: "tool_call",     label: "SCIM Register — Aladdin OMS" },
      { id: "n4", type: "tool_call",     label: "SCIM Register — Charles River IMS" },
      { id: "n5", type: "tool_call",     label: "SCIM Register — Bloomberg Terminal" },
      { id: "n6", type: "tool_call",     label: "SCIM Register — ServiceNow" },
      { id: "n7", type: "tool_call",     label: "Verify Registration Status (×4)" },
      { id: "n8", type: "audit_log",     label: "Provisioning Audit Event" },
      { id: "n9", type: "output",        label: "Identity Registered ✓" },
    ],
    edges: [
      { from: "n1", to: "n2" }, { from: "n2", to: "n3" },
      { from: "n3", to: "n4" }, { from: "n4", to: "n5" },
      { from: "n5", to: "n6" }, { from: "n6", to: "n7" },
      { from: "n7", to: "n8" }, { from: "n8", to: "n9" },
    ],
  },
  "dacfb0d1-9e9e-4b4f-b0be-6f2824c5c05f": {
    nodes: [
      { id: "n1", type: "trigger",      label: "Aquera Registration Complete" },
      { id: "n2", type: "tool_call",    label: "Provision Entitlement — Aladdin OMS" },
      { id: "n3", type: "tool_call",    label: "Provision Entitlement — Charles River IMS" },
      { id: "n4", type: "tool_call",    label: "Provision Entitlement — Bloomberg Terminal" },
      { id: "n5", type: "tool_call",    label: "Provision Entitlement — ServiceNow" },
      { id: "n6", type: "tool_call",    label: "Validate All Entitlements (×4)" },
      { id: "n7", type: "policy_check", label: "Compliance Validation" },
      { id: "n8", type: "output",       label: "Entitlements Active ✓" },
    ],
    edges: [
      { from: "n1", to: "n2" }, { from: "n2", to: "n3" },
      { from: "n3", to: "n4" }, { from: "n4", to: "n5" },
      { from: "n5", to: "n6" }, { from: "n6", to: "n7" },
      { from: "n7", to: "n8" },
    ],
  },
  "67de43a1-c6b1-4f3a-b354-39140e6128a3": {
    nodes: [
      { id: "n1", type: "trigger",      label: "SailPoint Entitlements Confirmed" },
      { id: "n2", type: "tool_call",    label: "Activate Identity (RadiantOne)" },
      { id: "n3", type: "tool_call",    label: "Sync Directory Attributes" },
      { id: "n4", type: "tool_call",    label: "Validate Data Lineage" },
      { id: "n5", type: "audit_log",    label: "SR 11-7 Lineage Audit Record" },
      { id: "n6", type: "output",       label: "Directory Synchronized ✓" },
    ],
    edges: [
      { from: "n1", to: "n2" }, { from: "n2", to: "n3" },
      { from: "n3", to: "n4" }, { from: "n4", to: "n5" },
      { from: "n5", to: "n6" },
    ],
  },
  "e57e6394-c256-46cd-b0be-86510ab0a1be": {
    nodes: [
      { id: "n1", type: "trigger",     label: "RadiantOne Sync Complete" },
      { id: "n2", type: "tool_call",   label: "Retrieve Audit Trail" },
      { id: "n3", type: "tool_call",   label: "Monitor Access Events" },
      { id: "n4", type: "conditional", label: "Anomalies Detected?" },
      { id: "n5", type: "tool_call",   label: "Schedule Lifecycle Recertification" },
      { id: "n6", type: "audit_log",   label: "IOSCO / SR 11-7 Compliance Report" },
      { id: "n7", type: "output",      label: "Access Certified ✓" },
    ],
    edges: [
      { from: "n1", to: "n2" }, { from: "n2", to: "n3" },
      { from: "n3", to: "n4" }, { from: "n4", to: "n5" },
      { from: "n5", to: "n6" }, { from: "n6", to: "n7" },
    ],
  },
};

const WORKER_AGENT_TASKS: Record<string, { task: string; scheduleIntervalMinutes: number }> = {
  "c21b6549-e24d-4384-b667-9032619e3dd7": {
    task: "Receive the ServiceNow-approved provisioning request for synthetic worker BMSA-SYNTH-001 and register its identity across all 4 SCIM connectors (Aladdin OMS, Charles River IMS, Bloomberg Terminal, ServiceNow) via Aquera. Run compliance pre-checks before each registration and confirm status after each step.",
    scheduleIntervalMinutes: 0,
  },
  "dacfb0d1-9e9e-4b4f-b0be-6f2824c5c05f": {
    task: "Provision role-based access entitlements for BMSA-SYNTH-001 across all 4 BlackRock financial applications using SailPoint IdentityIQ: Aladdin OMS (ReadOnly Portfolio Analytics), Charles River IMS (Read Order Flow), Bloomberg Terminal (Market Data Viewer), and ServiceNow (ITSM Consumer). Validate each entitlement after assignment.",
    scheduleIntervalMinutes: 0,
  },
  "67de43a1-c6b1-4f3a-b354-39140e6128a3": {
    task: "Activate BMSA-SYNTH-001 in the RadiantOne federated meta-directory and synchronize all identity attributes across connected directory services. Validate the complete data lineage to confirm audit trail integrity and SR 11-7 compliance before signalling completion.",
    scheduleIntervalMinutes: 0,
  },
  "e57e6394-c256-46cd-b0be-86510ab0a1be": {
    task: "Audit and certify the access provisioned for BMSA-SYNTH-001 using the Brainwave GRC platform. Review the full audit trail, monitor for anomalous or unauthorized access events, and schedule lifecycle recertification across all provisioned systems in accordance with IOSCO and Model Risk Management (SR 11-7) requirements.",
    scheduleIntervalMinutes: 0,
  },
};

export async function seedWorkerMcpEndpoints(storage: IStorage): Promise<void> {
  const allServers = await storage.getMcpServers();

  for (const config of WORKER_MCP_CONFIG) {
    const server = allServers.find((s) => s.name === config.serverName);
    if (!server) continue;

    // Point the server URL at our local demo API
    if (server.url !== `${BASE_URL}/demo-api`) {
      await storage.updateMcpServer(server.id, { url: `${BASE_URL}/demo-api` });
    }

    // Update each tool's annotations with the correct endpoint
    const tools = await storage.getMcpServerTools(server.id);
    for (const toolDef of config.tools) {
      const tool = tools.find((t) => t.name === toolDef.name);
      if (!tool) continue;
      const existing = (tool.annotations as Record<string, any>) || {};
      if (existing.endpoint !== toolDef.endpoint || existing.method !== toolDef.method) {
        await storage.updateMcpServerTool(tool.id, {
          annotations: { ...existing, endpoint: toolDef.endpoint, method: toolDef.method },
        });
      }
    }
  }

  // Ensure each worker agent has a human-readable task description and blueprint workflow graph
  for (const [agentId, cfg] of Object.entries(WORKER_AGENT_TASKS)) {
    const agent = await storage.getAgent(agentId);
    if (!agent) continue;
    const rc = (agent.runtimeConfig as Record<string, any>) || {};
    const updates: Record<string, any> = {};
    if (rc.prompt !== cfg.task) {
      updates.runtimeConfig = { ...rc, prompt: cfg.task, scheduleIntervalMinutes: cfg.scheduleIntervalMinutes };
    }
    const blueprint = WORKER_AGENT_BLUEPRINTS[agentId];
    if (blueprint && !agent.blueprintJson) {
      updates.blueprintJson = blueprint;
    }
    if (Object.keys(updates).length > 0) {
      await storage.updateAgent(agentId, updates);
    }

    // Refresh stored stats so list views show real values (not seed defaults)
    try {
      const traces = await storage.getTracesByAgent(agentId);
      if (traces.length > 0) {
        const withLat = traces.filter(t => t.latencyMs && t.latencyMs > 0);
        const avgLatencyMs = withLat.length > 0
          ? Math.round(withLat.reduce((s, t) => s + (t.latencyMs || 0), 0) / withLat.length)
          : 0;
        const isSuccess = (s: string | null) => s === "completed" || s === "success";
        const isFailed  = (s: string | null) => s === "failed" || s === "error";
        const successRate = traces.filter(t => isSuccess(t.status)).length / traces.length;
        const recentTraces = traces.slice(-10);
        const recentFailures = recentTraces.filter(t => isFailed(t.status)).length;
        const recentSuccessRate = recentTraces.length > 0
          ? recentTraces.filter(t => isSuccess(t.status)).length / recentTraces.length : 0;
        const healthScore = Math.max(0, Math.min(100, Math.round(
          (successRate * 40) + (recentSuccessRate * 30) +
          ((avgLatencyMs < 5000 ? 1 : avgLatencyMs < 15000 ? 0.7 : 0.4) * 20) +
          ((recentFailures === 0 ? 1 : recentFailures <= 2 ? 0.6 : 0.3) * 10),
        )));
        const refreshedAgent = await storage.getAgent(agentId);
        const currentLat = (refreshedAgent as any)?.avgLatencyMs ?? 0;
        if (currentLat !== avgLatencyMs) {
          await storage.updateAgent(agentId, { avgLatencyMs, successRate, healthScore });
        }
      }
    } catch {}
  }
}
