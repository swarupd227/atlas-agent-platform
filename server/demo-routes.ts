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
  getMoodysState,
  resetMoodysState,
  addMoodysOverride,
  confirmMoodysPackage,
  logMoodysToolCall,
} from "./moodys-demo-store";
import {
  getKinectiveState,
  resetKinectiveDemo,
  fullResetKinectiveDemo,
  addKinectiveAudit,
  getScenarioFormData,
  getScenarioValidation,
  getScenarioSystemUpdate,
  getScenarioRollback,
  getScenarioFraudScore,
  setKinectiveTraceId,
  setKinectiveRunning,
  getEnabledSystems,
  setEnabledSystems,
  SYSTEMS,
  SYSTEM_TOOLS,
  type KinectiveScenario,
} from "./kinective-demo-store";
import type { IStorage } from "./storage";
import { storage } from "./storage";
import { db } from "./db";
import { runTraces, agentRuntimeRuns } from "@shared/schema";
import { runAgentOnce, runtimeEvents, type RuntimeProgressEvent } from "./agent-runtime";
import { setBk2LiveScenario, clearBk2LiveScenario, type Bk2LiveScenario } from "./blackrock2-live-store";

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

demoRouter.post("/kinective/full-reset", (_req: Request, res: Response) => {
  fullResetKinectiveDemo();
  res.json({ success: true, scenario: "happy" });
});

demoRouter.get("/kinective/config", (_req: Request, res: Response) => {
  res.json({
    enabledSystems: getEnabledSystems(),
    allSystems: SYSTEMS,
    systemTools: SYSTEM_TOOLS,
  });
});

demoRouter.post("/kinective/config", (req: Request, res: Response) => {
  const { enabledSystems } = req.body;
  if (!Array.isArray(enabledSystems)) {
    return res.status(400).json({ error: "enabledSystems must be an array" });
  }
  const valid = enabledSystems.filter((s: string) => SYSTEMS.includes(s));
  setEnabledSystems(valid);
  res.json({ success: true, enabledSystems: valid });
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

// ─────────────────────────────────────────────────────────────────────────────
// MOODYS CREDIT ASSESSMENT DEMO — Tool endpoints + state
// ─────────────────────────────────────────────────────────────────────────────

demoRouter.get("/moodys/state", (_req: Request, res: Response) => {
  res.json(getMoodysState());
});

demoRouter.post("/moodys/reset", (_req: Request, res: Response) => {
  resetMoodysState();
  res.json({ ok: true });
});

demoRouter.post("/moodys/override", (req: Request, res: Response) => {
  const { field, agentValue, analystValue, note, type } = req.body;
  const entry = addMoodysOverride({
    field,
    agentValue,
    analystValue: analystValue ?? agentValue,
    note: note ?? "",
    type: type ?? "overridden",
    timestamp: new Date().toISOString(),
  });
  res.json(entry);
});

demoRouter.post("/moodys/confirm", (_req: Request, res: Response) => {
  confirmMoodysPackage();
  res.json({ ok: true, confirmedAt: new Date().toISOString() });
});

// ─── Tool simulation endpoints ────────────────────────────────────────────────
const FORD_EDGAR = {
  issuer: "Ford Motor Company", ticker: "F",
  filings: [
    { type: "10-K", period: "FY2025", filed: "2026-02-04", url: "https://www.sec.gov/Archives/edgar/data/37996/000003799626000001/f-20251231.htm", pages: 182 },
    { type: "10-Q", period: "Q3-2025", filed: "2025-11-04", url: "https://www.sec.gov/Archives/edgar/data/37996/000003799625000041/f-20250930.htm", pages: 74 },
    { type: "10-Q", period: "Q2-2025", filed: "2025-07-29", url: "https://www.sec.gov/Archives/edgar/data/37996/000003799625000028/f-20250630.htm", pages: 71 },
  ],
  status: "retrieved",
};

const FORD_COA = {
  issuer: "Ford Motor Company", standard: "US-GAAP",
  quarters: ["Q4-2023","Q1-2024","Q2-2024","Q3-2024","Q4-2024","Q1-2025","Q2-2025","Q3-2025"],
  lineItemsMapped: 247,
  anomalies: [
    { type: "non_recurring", description: "Non-recurring restructuring charge of $1.2B in Q4 2024 — EV segment right-sizing. Excluded from adjusted EBITDA calculation.", severity: "yellow" },
    { type: "segment_reclass", description: "Ford Pro segment reclassified in Q1 2025; prior periods restated.", severity: "yellow" },
  ],
  status: "complete",
};

const FORD_METRICS = {
  issuer: "Ford Motor Company",
  metrics: [
    { name: "Debt/EBITDA", value: 3.2, trend: "down", prior: 3.8, unit: "x", direction: "improving", category: "Leverage" },
    { name: "EBIT/Interest", value: 4.1, trend: "up", prior: 3.5, unit: "x", direction: "improving", category: "Coverage" },
    { name: "FCF/Debt", value: 12.4, trend: "stable", prior: 12.1, unit: "%", direction: "stable", category: "Cash Flow" },
    { name: "FFO/Debt", value: 18.2, trend: "up", prior: 16.4, unit: "%", direction: "improving", category: "Cash Flow" },
    { name: "Revenue Growth YoY", value: 4.2, trend: "up", prior: 1.8, unit: "%", direction: "improving", category: "Scale" },
    { name: "EBITDA Margin", value: 8.8, trend: "up", prior: 7.9, unit: "%", direction: "improving", category: "Profitability" },
    { name: "Revenue", value: 178.0, trend: "up", prior: 176.2, unit: "$B", direction: "improving", category: "Scale" },
    { name: "EBITDA", value: 15.7, trend: "up", prior: 13.9, unit: "$B", direction: "improving", category: "Profitability" },
    { name: "Adjusted Debt", value: 50.3, trend: "stable", prior: 53.2, unit: "$B", direction: "improving", category: "Leverage" },
    { name: "Cash & Equivalents", value: 29.0, trend: "up", prior: 25.8, unit: "$B", direction: "improving", category: "Liquidity" },
    { name: "Capex/Revenue", value: 4.8, trend: "up", prior: 4.2, unit: "%", direction: "neutral", category: "Investment" },
    { name: "Gross Margin", value: 11.2, trend: "stable", prior: 11.5, unit: "%", direction: "stable", category: "Profitability" },
  ],
  status: "complete",
};

const FORD_TRANSCRIPTS = {
  issuer: "Ford Motor Company",
  quarters: ["Q4-2025", "Q3-2025"],
  overallSentiment: 0.3,
  sentimentByTopic: [
    { topic: "Leverage targets", score: 0.6, label: "Positive", keyQuote: "CFO: 'We remain firmly committed to our 2.5–3.0x net leverage target. Q4 free cash flow was strong and we expect to remain within that range through 2026.'" },
    { topic: "EV investment", score: 0.0, label: "Neutral", keyQuote: "CEO: 'We're right-sizing our EV capacity investment. The $1.2B restructuring reflects disciplined capital allocation, not a retreat from electrification.'" },
    { topic: "Liquidity", score: 0.5, label: "Positive", keyQuote: "CFO: 'Cash and liquidity position of $29B provides significant buffer. We have no near-term debt maturities of concern.'" },
    { topic: "ICE profitability", score: 0.4, label: "Positive", keyQuote: "CFO: 'F-150 and Super Duty continue to generate industry-leading margins. Ford Pro EBIT margin was 12.4% in Q4 — best ever.'" },
  ],
  creditAnalystQuote: { text: "We expect Ford's EBITDA margin to improve modestly in 2026, supported by Ford Pro growth and ICE pricing strength, partially offset by ongoing EV investment losses.", speaker: "Ford CFO", context: "Q4 2025 Earnings Call, Feb 2026", creditRelevance: "HIGH" },
  status: "complete",
};

const FORD_PEERS = {
  issuer: "Ford Motor Company",
  methodology: "Automobile Manufacturer v2.1",
  peers: ["GM", "Stellantis", "Toyota", "VW", "Hyundai"],
  matrix: [
    { metric: "Debt/EBITDA (x)", ford: 3.2, gm: 2.1, stellantis: 1.8, toyota: 1.2, vw: 2.4, hyundai: 1.9, fordRank: 5, median: 2.1 },
    { metric: "EBIT/Interest (x)", ford: 4.1, gm: 5.8, stellantis: 6.2, toyota: 8.4, vw: 4.4, hyundai: 5.1, fordRank: 5, median: 5.5 },
    { metric: "EBITDA Margin (%)", ford: 8.8, gm: 10.4, stellantis: 11.2, toyota: 13.1, vw: 9.8, hyundai: 10.2, fordRank: 6, median: 10.3 },
    { metric: "FCF/Debt (%)", ford: 12.4, gm: 10.2, stellantis: 14.8, toyota: 22.1, vw: 8.4, hyundai: 11.8, fordRank: 3, median: 11.0 },
    { metric: "Revenue ($B)", ford: 178.0, gm: 187.3, stellantis: 189.2, toyota: 274.5, vw: 298.4, hyundai: 112.4, fordRank: 4, median: 187.3 },
    { metric: "Current Rating", ford: "Ba1", gm: "Baa3", stellantis: "Ba1", toyota: "A1", vw: "A3", hyundai: "Baa1", fordRank: 5, median: "Baa3" },
  ],
  outlierFlags: [
    "Ford EBITDA margin (8.8%) is 140bps below peer median (10.2%) and 320bps below Toyota.",
    "Ford FCF/Debt (12.4%) is above peer median — strong cash conversion despite margin headwinds.",
    "Ford is the only issuer in the peer group with EV segment losses exceeding $2B annually.",
  ],
  status: "complete",
};

const FORD_ESG = {
  issuer: "Ford Motor Company",
  esgIpsScores: { environmental: "E-3", social: "S-2", governance: "G-2", overall: "E-3" },
  cisScore: { score: "CIS-3", label: "Moderately negative", rationale: "EV transition investment risk and regulatory compliance costs are credit-negative, partially offset by strong governance and improving social metrics." },
  materialFactors: [
    { factor: "EV transition capital intensity", direction: "negative", creditRelevance: "HIGH" },
    { factor: "California ZEV regulatory requirements", direction: "negative", creditRelevance: "MEDIUM" },
    { factor: "Supply chain decarbonization costs", direction: "negative", creditRelevance: "LOW" },
  ],
  status: "complete",
};

const FORD_NEWS = {
  issuer: "Ford Motor Company",
  events: [
    { date: "2026-01-15", type: "rating_relevant", headline: "Ford Pro commercial vehicle unit reports record Q4 margin of 12.4%", source: "Reuters", direction: "positive", relevance: "MATERIAL" },
    { date: "2025-12-08", type: "credit_event", headline: "Ford announces $1.2B EV restructuring charge, reduces planned EV production by 20%", source: "Bloomberg", direction: "neutral", relevance: "MATERIAL" },
    { date: "2025-11-22", type: "regulatory", headline: "EPA issues final rule on Phase 3 fuel economy standards; Ford faces incremental compliance costs", source: "Dow Jones", direction: "negative", relevance: "CONTEXTUAL" },
  ],
  legalItems: [
    { case: "In re Ford F-150 Lightning Recall", type: "product_liability", status: "active", exposure: "< $500M", creditImpact: "LOW" },
  ],
  marketData: { creditSpread5Y: 185, cdsMidspread: 142, seniorUnsecuredYield: 6.24, unit: "bps/%" },
  status: "complete",
};

const FORD_SCORECARD = {
  issuer: "Ford Motor Company",
  methodology: "Automobile Manufacturer Methodology v2.1 (March 2024)",
  quantitative: [
    { factor: "Scale (Revenue)", value: "$178B", scorecardInput: "$178B", mappedCategory: "Aaa", source: "Agent 1: compute_credit_metrics" },
    { factor: "Profitability (EBITDA Margin)", value: "8.8%", scorecardInput: "8.8%", mappedCategory: "Ba", source: "Agent 1: compute_credit_metrics" },
    { factor: "Leverage (Debt/EBITDA)", value: "3.2x", scorecardInput: "3.2x", mappedCategory: "Ba", source: "Agent 1: compute_credit_metrics" },
    { factor: "Coverage (EBIT/Interest)", value: "4.1x", scorecardInput: "4.1x", mappedCategory: "Baa", source: "Agent 1: compute_credit_metrics" },
    { factor: "Cash Flow (FCF/Debt)", value: "12.4%", scorecardInput: "12.4%", mappedCategory: "Baa", source: "Agent 1: compute_credit_metrics" },
  ],
  qualitative: [
    { factor: "Business Profile", agentSuggestion: "Baa", agentRationale: "Global scale and brand strength offset by high EV transition risk and below-peer EBITDA margin.", confidence: 0.72 },
    { factor: "Competitive Position", agentSuggestion: "Ba", agentRationale: "Ford's EV market share (~4%) significantly below BYD (20%) and Tesla (18%). ICE strength in F-150 and Super Duty is strong but structural.", confidence: 0.81 },
    { factor: "Financial Policy", agentSuggestion: "Baa", agentRationale: "Management has reaffirmed 2.5–3.0x leverage target. Capital allocation discipline improving post-restructuring.", confidence: 0.68 },
    { factor: "Management Quality", agentSuggestion: "Baa", agentRationale: "CFO demonstrated clear leverage target discipline; EV restructuring reflects pragmatic strategic pivot.", confidence: 0.65 },
  ],
  modelIndicatedOutcome: "Baa3",
  currentRating: "Ba1",
  currentOutlook: "Stable",
  gapAnalysis: { notches: 1, direction: "model above current", interpretation: "Model indicates one notch above current rating. Gap likely explained by EV loss trajectory uncertainty and below-peer margins — both require analyst qualitative judgment." },
  status: "complete",
};

function mkToolHandler(agent: string, tool: string, summary: string, data: any) {
  return (_req: Request, res: Response) => {
    logMoodysToolCall(agent, tool, summary);
    res.json({ ok: true, agent, tool, ...data });
  };
}

demoRouter.post("/moodys/tools/get_edgar_filings", mkToolHandler("earningsAnalyzer", "get_edgar_filings", "Retrieved Ford 10-K (FY2025) and 10-Q filings from SEC EDGAR", FORD_EDGAR));
demoRouter.post("/moodys/tools/get_moody_financials", mkToolHandler("financialDataCollector", "get_moody_financials", "Retrieved Ford standardized financials from internal data estate (8 quarters)", { issuer: "Ford Motor Company", periods: 8, lineItems: 247 }));
demoRouter.post("/moodys/tools/spread_to_chart_of_accounts", mkToolHandler("financialDataCollector", "spread_to_chart_of_accounts", "Spread Ford financials to Chart of Accounts — 247 line items mapped, 2 anomalies flagged", FORD_COA));
demoRouter.post("/moodys/tools/compute_credit_metrics", mkToolHandler("financialDataCollector", "compute_credit_metrics", "Computed 12 credit metrics across 8 quarters for Ford Motor Company", FORD_METRICS));
demoRouter.post("/moodys/tools/get_earnings_transcripts", mkToolHandler("earningsAnalyzer", "get_earnings_transcripts", "Retrieved Q3 and Q4 2025 earnings call transcripts for Ford", FORD_TRANSCRIPTS));
demoRouter.post("/moodys/tools/get_investor_presentations", mkToolHandler("earningsAnalyzer", "get_investor_presentations", "Retrieved Ford Q4 2025 investor day presentation", { issuer: "Ford Motor Company", events: ["Q4-2025 Earnings Deck", "2026 Investor Day Preview"], status: "retrieved" }));
demoRouter.post("/moodys/tools/get_peer_group", mkToolHandler("peerComparisonBuilder", "get_peer_group", "Identified 5 peers: GM, Stellantis, Toyota, VW, Hyundai", { peers: FORD_PEERS.peers, methodology: FORD_PEERS.methodology }));
demoRouter.post("/moodys/tools/get_peer_financials", mkToolHandler("peerComparisonBuilder", "get_peer_financials", "Retrieved 6-metric peer comparison matrix for 5 issuers", FORD_PEERS));
demoRouter.post("/moodys/tools/get_esg_ips_scores", mkToolHandler("esgProfileAgent", "get_esg_ips_scores", "Retrieved Ford ESG IPS scores: E-3, S-2, G-2", FORD_ESG));
demoRouter.post("/moodys/tools/get_cis_score", mkToolHandler("esgProfileAgent", "get_cis_score", "Retrieved Ford CIS-3 (Moderately negative ESG credit impact)", { cisScore: FORD_ESG.cisScore }));
demoRouter.post("/moodys/tools/scan_credit_news", mkToolHandler("newsEventScanner", "scan_credit_news", "Scanned news — 3 material events found (Ford Pro record margin, EV restructuring, EPA rule)", FORD_NEWS));
demoRouter.post("/moodys/tools/get_legal_database", mkToolHandler("newsEventScanner", "get_legal_database", "Retrieved Ford legal database — 1 active case, low credit impact", { legalItems: FORD_NEWS.legalItems }));
demoRouter.post("/moodys/tools/get_market_data", mkToolHandler("newsEventScanner", "get_market_data", "Retrieved Ford credit spreads: 5Y spread 185bps, CDS 142bps", { marketData: FORD_NEWS.marketData }));
demoRouter.post("/moodys/tools/get_rating_scorecard_template", mkToolHandler("scorecardPrePopulation", "get_rating_scorecard_template", "Retrieved Automobile Manufacturer scorecard template v2.1", { methodology: FORD_SCORECARD.methodology, factors: 9, quantitative: 5, qualitative: 4 }));
demoRouter.post("/moodys/tools/get_current_rating", mkToolHandler("scorecardPrePopulation", "get_current_rating", "Retrieved Ford current rating: Ba1, Outlook Stable", { currentRating: "Ba1", outlook: "Stable", ratingDate: "2024-09-18" }));

// ─── BlackRock 2 Scenario Runner ─────────────────────────────────────────────
// Called by the frontend after each scenario animation completes.
// Creates fresh run_traces + agent_runtime_runs so users can see new entries
// in the Runs & Traces tab immediately after each demo run.

const BK2_AGENT_IDS = {
  terminationIntake:    "b9f26c40-967a-482d-98f1-fa1bfe518aa7",
  portalDiscovery:      "ba94fcde-b3b5-4ac5-b78d-3cc72ef0c99e",
  activeTradeCheck:     "50f18f63-433a-4efd-a844-173a861bc406",
  accessRemovalExecutor:"8b363fb5-9406-4b53-86d1-8e58f206e21a",
  removalVerification:  "1c13e7ab-451e-48f5-b315-fe901b071305",
  auditEvidence:        "388b13f6-0e3d-475f-a6b4-67c0c4f98c0d",
};

type Bk2Scenario = "happy_path" | "portal_unreachable" | "pending_trades" | "admin_access";

interface ScenarioSpec {
  employee: string; emp: string; caseId: string;
  portalsRemoved: number; portalsDeferred: number;
  tradeHold: boolean; criticalTier: boolean;
  hkexDown: boolean;
}

const BK2_SCENARIO_DATA: Record<Bk2Scenario, ScenarioSpec> = {
  happy_path: {
    employee: "Robert Kessler", emp: "EMP-29471", caseId: "AIM-2026-0847",
    portalsRemoved: 6, portalsDeferred: 0, tradeHold: false, criticalTier: false, hkexDown: false,
  },
  portal_unreachable: {
    employee: "Karen Nakamura", emp: "EMP-19823", caseId: "AIM-2026-0831",
    portalsRemoved: 4, portalsDeferred: 1, tradeHold: false, criticalTier: false, hkexDown: true,
  },
  pending_trades: {
    employee: "Marcus Thompson", emp: "EMP-34102", caseId: "AIM-2026-0812",
    portalsRemoved: 2, portalsDeferred: 1, tradeHold: true, criticalTier: false, hkexDown: false,
  },
  admin_access: {
    employee: "James Whitfield", emp: "EMP-41087", caseId: "AIM-2026-0798",
    portalsRemoved: 4, portalsDeferred: 0, tradeHold: false, criticalTier: true, hkexDown: false,
  },
};

function bk2Trace(agentId: string, s: ScenarioSpec, role: string, input: string, output: string,
  tools: object[], decisions: object[], policies: object[], latencyMs: number, costUsd: number) {
  const now = new Date();
  return {
    agentId,
    environment: "production" as const,
    status: "completed" as const,
    costUsd,
    latencyMs,
    inputSummary: input,
    outputSummary: output,
    modelId: "claude-3-5-sonnet-20241022",
    toolCalls: tools as any,
    decisions: decisions as any,
    policyChecks: policies as any,
    tokenUsage: { input_tokens: Math.round(latencyMs * 0.3), output_tokens: Math.round(latencyMs * 0.09), total_tokens: Math.round(latencyMs * 0.39) } as any,
    endedAt: now,
  };
}

demoRouter.post("/blackrock2/run-scenario", async (req: Request, res: Response) => {
  const { scenarioId } = req.body as { scenarioId: string };
  const s = BK2_SCENARIO_DATA[scenarioId as Bk2Scenario];
  if (!s) return res.status(400).json({ error: "Unknown scenarioId" });

  const AGENTS = BK2_AGENT_IDS;
  const now = new Date();

  const traces = [
    // 1. Termination Intake
    bk2Trace(AGENTS.terminationIntake, s,
      "Termination Intake Agent",
      `SailPoint termination event: ${s.employee} (${s.emp}) | Case ${s.caseId} | ${s.criticalTier ? "CRITICAL — admin role detected" : "Voluntary resignation"}`,
      `Termination validated. Employment confirmed inactive in Workday. Case ${s.caseId} created${s.criticalTier ? " with CRITICAL priority" : ""}. ${s.portalsRemoved + s.portalsDeferred} portals flagged.`,
      [{ tool: "sailpoint_get_termination_event", status: "success" }, { tool: "workday_validate_employment", status: "success" }, { tool: "servicenow_create_case", status: "success" }],
      [
        { step: "Validate termination", reasoning: `SailPoint event matches Workday HR record for ${s.emp}. Employment confirmed inactive.`, confidence: 0.98 },
        { step: "Create removal case", reasoning: `Case ${s.caseId} created${s.criticalTier ? " at CRITICAL priority — admin role" : ""}. ${s.portalsRemoved + s.portalsDeferred} portals queued.`, confidence: 0.97 },
      ],
      [
        { policy: "HR Validation Required", passed: true, reason: "Employment status confirmed inactive in Workday" },
        { policy: "Case Creation SLA", passed: true, reason: "Case created within SLA window" },
      ],
      3800 + Math.floor(Math.random() * 800), 0.0031
    ),

    // 2. Portal Discovery
    bk2Trace(AGENTS.portalDiscovery, s,
      "Portal Discovery Agent",
      `Case ${s.caseId} | ${s.emp} | Scan all partner portals${s.hkexDown ? " — HKEX CCASS connectivity issue noted" : ""}`,
      `Discovery complete. ${s.portalsRemoved + s.portalsDeferred} portal${s.portalsRemoved + s.portalsDeferred > 1 ? "s" : ""} identified.${s.hkexDown ? " HKEX CCASS unreachable — ServiceNow ticket created." : " All portals reachable."}`,
      [
        { tool: "partner_portal_registry_scan", status: "success" },
        { tool: "sailpoint_get_entitlements", status: "success" },
        { tool: "radiantone_ad_groups", status: "success" },
        ...(s.hkexDown ? [{ tool: "portal_connectivity_check", status: "partial_failure" }] : []),
      ],
      [
        { step: "Scan Partner Portal Registry", reasoning: `${s.portalsRemoved + s.portalsDeferred} portals found for ${s.emp}. ${s.hkexDown ? "HKEX CCASS returned ECONNREFUSED." : "All portals reachable."}`, confidence: 0.97 },
        ...(s.hkexDown ? [{ step: "Handle unreachable portal", reasoning: "HKEX CCASS unreachable. Deferred task created with 4-hour retry.", confidence: 0.94 }] : []),
      ],
      [
        { policy: "Complete Entitlement Discovery", passed: true, reason: "All reachable portals scanned" },
        { policy: "Cross-Reference Validation", passed: true, reason: "SailPoint entitlements match AD groups" },
      ],
      4900 + Math.floor(Math.random() * 600), 0.0046
    ),

    // 3. Active Trade Check
    bk2Trace(AGENTS.activeTradeCheck, s,
      "Active Trade Check Agent",
      `Case ${s.caseId} | ${s.emp} | Check settlement systems${s.tradeHold ? " — Fixed Income Trader, mandatory check" : ""}`,
      s.tradeHold
        ? `CRITICAL hold detected. 3 unsettled REPO trades in Euroclear (EUR 847M notional). DTC FICC: 2 pending GCF Repos (USD 340M). Euroclear access held pending settlement. Other portals cleared. Escalated for human approval.`
        : `Trade check complete. No pending trades across all systems. All ${s.portalsRemoved} portals cleared for immediate removal.`,
      [
        { tool: "euroclear_pending_trades", status: "success" },
        { tool: "dtc_ficc_settlement_check", status: "success" },
        { tool: "clearstream_settlement_check", status: "success" },
        { tool: "dtcc_ctm_open_positions", status: "success" },
        ...(s.tradeHold ? [{ tool: "risk_threshold_evaluator", status: "success" }] : []),
      ],
      s.tradeHold ? [
        { step: "Euroclear settlement check", reasoning: "3 REPO trades with T+1 settlement. EUR 847M notional. Premature removal would cause settlement fails.", confidence: 0.99 },
        { step: "Issue hold recommendation", reasoning: "Exceeds $50M auto-approve threshold. Human approval required. Euroclear access held until settlement clears.", confidence: 0.98 },
      ] : [
        { step: "Check all settlement systems", reasoning: `Zero pending trades for ${s.emp}. Last trade settled 2 days ago.`, confidence: 0.99 },
        { step: "Issue clearance", reasoning: `No settlement risk. All ${s.portalsRemoved} portals auto-cleared.`, confidence: 0.99 },
      ],
      [
        { policy: "Settlement Risk Pre-Check", passed: true, reason: "All settlement systems checked before any removal" },
        ...(s.tradeHold ? [{ policy: "Human Approval for Hold Decisions", passed: true, reason: "Hold escalated — $50M threshold exceeded" }] : [{ policy: "Auto-Approve Clearance", passed: true, reason: "No holds required" }]),
      ],
      5800 + Math.floor(Math.random() * 1200), 0.0051
    ),

    // 4. Access Removal Executor
    bk2Trace(AGENTS.accessRemovalExecutor, s,
      "Access Removal Executor Agent",
      `Case ${s.caseId} | ${s.emp} | Execute access removal${s.criticalTier ? " — CRITICAL tier, post-approval" : ""}${s.hkexDown ? " — HKEX CCASS deferred" : ""}`,
      s.criticalTier
        ? `Removal complete post-approval. SWIFT Alliance: Admin role revoked, BIC credentials invalidated, HSM key deactivated. 3 additional portals removed. ${s.portalsRemoved}/4 cleared.`
        : s.hkexDown
          ? `Partial removal. ${s.portalsRemoved}/${s.portalsRemoved + s.portalsDeferred} portals revoked. HKEX CCASS unreachable — deferred to retry queue. ServiceNow ticket updated.`
          : s.tradeHold
            ? `Removal complete (post-approval). ${s.portalsRemoved} portals revoked. Euroclear OnLine deferred pending settlement clearance.`
            : `Access removal complete. ${s.portalsRemoved}/${s.portalsRemoved} portals successfully revoked. All SAML sessions terminated, tokens invalidated, certs revoked.`,
      [
        ...(s.criticalTier ? [{ tool: "approval_gate_check", status: "success" }, { tool: "swift_admin_revoke", status: "success" }, { tool: "swift_bic_credential_revoke", status: "success" }, { tool: "swift_hsm_key_deactivate", status: "success" }] : []),
        { tool: "dtcc_saml_deactivate", status: "success", latency_ms: 2100 },
        { tool: "bloomberg_session_terminate", status: "success", latency_ms: 3100 },
        { tool: "ice_trade_vault_revoke", status: "success", latency_ms: 2000 },
        { tool: "markitserv_deprovision", status: "success", latency_ms: 2500 },
        ...(s.hkexDown ? [{ tool: "hkex_ccass_revoke", status: "failed", error: "ECONNREFUSED" }, { tool: "deferred_queue_add", status: "success" }] : []),
        ...(!s.hkexDown && !s.criticalTier ? [{ tool: "euroclear_token_invalidate", status: s.tradeHold ? "deferred" : "success", latency_ms: 3400 }, { tool: "clearstream_cert_revoke", status: "success", latency_ms: 1800 }] : []),
        { tool: "sailpoint_update_entitlements", status: "success", latency_ms: 1500 },
      ],
      [
        ...(s.criticalTier ? [{ step: "Verify manager approval", reasoning: `Approval from CISO verified. SWIFT 3-step revocation: Admin role, BIC credential, HSM key.`, confidence: 1.0 }] : []),
        { step: "Execute portal removals", reasoning: `${s.portalsRemoved} portals revoked successfully.${s.hkexDown ? " HKEX timed out — deferred." : ""}`, confidence: 0.98 },
        { step: "Update SailPoint & AD", reasoning: "Entitlements cleared in SailPoint. RadiantOne AD account disabled.", confidence: 0.99 },
      ],
      [
        { policy: "Dual-System Confirmation", passed: true, reason: "Each removal confirmed in portal AND SailPoint/AD" },
        { policy: "SOX Access Removal Audit", passed: true, reason: `Timestamped evidence for ${s.portalsRemoved} portals` },
        ...(s.criticalTier ? [{ policy: "CRITICAL Tier Dual Approval", passed: true, reason: "CISO approval verified before execution" }] : []),
      ],
      10200 + Math.floor(Math.random() * 2400), 0.0088
    ),

    // 5. Removal Verification
    bk2Trace(AGENTS.removalVerification, s,
      "Removal Verification Agent",
      `Case ${s.caseId} | ${s.emp} | Verify removal across ${s.portalsRemoved + s.portalsDeferred} portals`,
      s.hkexDown
        ? `Partial verification. ${s.portalsRemoved} portals confirmed revoked (all return auth rejection). HKEX CCASS still unreachable — verification deferred. SNow ticket updated.`
        : `Verification complete. ${s.portalsRemoved}/${s.portalsRemoved} portals confirmed. All return definitive rejection. SailPoint and AD in sync. Case closed.`,
      [
        { tool: "dtcc_access_probe", status: "success", result: "SAML_INVALID" },
        { tool: "bloomberg_access_probe", status: "success", result: "ACCOUNT_DISABLED" },
        { tool: "ice_access_probe", status: "success", result: "403_FORBIDDEN" },
        { tool: "markitserv_access_probe", status: "success", result: "DEPROVISIONED" },
        ...(s.hkexDown ? [{ tool: "hkex_ccass_probe", status: "failed", result: "ECONNREFUSED" }] : [{ tool: "euroclear_access_probe", status: "success", result: "401_UNAUTHORIZED" }, { tool: "clearstream_access_probe", status: "success", result: "CERT_REJECTED" }]),
        { tool: "sailpoint_entitlement_check", status: "success", result: "CLEARED" },
        { tool: "radiantone_ad_check", status: "success", result: "ACCOUNT_DISABLED" },
      ],
      [
        { step: "Verify portal rejections", reasoning: `${s.portalsRemoved} portals return definitive auth rejections. No grace periods or cached sessions detected.`, confidence: 0.99 },
        { step: "Verify SailPoint + AD sync", reasoning: "Zero active entitlements in SailPoint. AD account disabled and reflected in RadiantOne.", confidence: 0.99 },
      ],
      [
        { policy: "Portal-Level Verification", passed: true, reason: "Each portal probed with actual auth attempt, not just provisioning API" },
        { policy: "Dual-System Sync Verification", passed: true, reason: "SailPoint and AD both confirmed cleared" },
      ],
      7800 + Math.floor(Math.random() * 1000), 0.0058
    ),

    // 6. Audit & Evidence
    bk2Trace(AGENTS.auditEvidence, s,
      "Audit & Evidence Agent",
      `Case ${s.caseId} | ${s.emp} | Generate SOX evidence package${s.criticalTier ? " — CRITICAL tier, 10-year retention" : ""}`,
      `Evidence package ${s.caseId.replace("AIM", "AIM-EVP")}.zip compiled. ${s.portalsRemoved} portal removal receipts, SailPoint diff, AD audit log, chain-of-custody hash. Splunk monitoring rule created. ServiceNow case closed.${s.criticalTier ? " Internal Audit notified." : ""}`,
      [
        { tool: "evidence_collector", status: "success" },
        { tool: "sailpoint_entitlement_diff", status: "success" },
        { tool: "radiantone_audit_export", status: "success" },
        { tool: "evidence_package_zip", status: "success" },
        { tool: "splunk_rule_create", status: "success" },
        { tool: "servicenow_close_case", status: "success" },
        { tool: "grc_vault_archive", status: "success" },
        { tool: "chain_of_custody_hash", status: "success" },
        ...(s.criticalTier ? [{ tool: "internal_audit_notify", status: "success" }] : []),
      ],
      [
        { step: "Compile evidence artifacts", reasoning: `${s.portalsRemoved * 2 + 2} artifacts collected: portal receipts, verification probes, SailPoint diff, AD log. All cryptographically signed.`, confidence: 0.99 },
        { step: "Generate SOX package", reasoning: `SOX Section 404 requirements met. ${s.criticalTier ? "10-year CRITICAL retention" : "7-year standard retention"} applied.`, confidence: 0.99 },
        { step: "Create Splunk monitoring rule", reasoning: `Post-removal monitoring active — any ${s.emp} credential reuse triggers SOC alert.`, confidence: 0.98 },
      ],
      [
        { policy: s.criticalTier ? "CRITICAL Tier 10-Year Retention" : "SOX Section 404 Evidence", passed: true, reason: `Complete audit trail with ${s.criticalTier ? "10-year immutable" : "7-year"} retention` },
        { policy: "Post-Removal Monitoring", passed: true, reason: "Splunk rule active — alerts on any credential reappearance" },
      ],
      9400 + Math.floor(Math.random() * 1200), 0.0070
    ),
  ];

  try {
    const inserted = await db.insert(runTraces).values(traces).returning({ id: runTraces.id, agentId: runTraces.agentId });

    await db.insert(agentRuntimeRuns).values(
      Object.values(AGENTS).map((agentId) => ({
        agentId,
        status: "completed" as const,
        triggerType: "event" as const,
        latencyMs: traces.find((t) => t.agentId === agentId)?.latencyMs ?? 5000,
        resultSummary: { caseId: s.caseId, employee: s.employee, scenarioId } as any,
        completedAt: now,
      }))
    );

    res.json({ success: true, traceCount: inserted.length, caseId: s.caseId, employee: s.employee });
  } catch (err: any) {
    console.error("[bk2-run-scenario] Error creating traces:", err?.message);
    res.status(500).json({ error: "Failed to create traces" });
  }
});

// ─── BlackRock 2 LIVE Execution Engine ───────────────────────────────────────
// Invokes the actual Atlas agent runtime for all 6 BK2 agents.
// Streams real Claude-powered execution events to the frontend via SSE.

const BK2_LIVE_AGENT_IDS = {
  terminationIntake:     "b9f26c40-967a-482d-98f1-fa1bfe518aa7",
  portalDiscovery:       "ba94fcde-b3b5-4ac5-b78d-3cc72ef0c99e",
  activeTradeCheck:      "50f18f63-433a-4efd-a844-173a861bc406",
  accessRemovalExecutor: "8b363fb5-9406-4b53-86d1-8e58f206e21a",
  removalVerification:   "1c13e7ab-451e-48f5-b315-fe901b071305",
  auditEvidence:         "388b13f6-0e3d-475f-a6b4-67c0c4f98c0d",
};

const AIM_MCP_SERVER_NAME = "AIM Offboarding Suite";
const AIM_BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

const AIM_TOOLS = [
  {
    name: "validate_termination",
    description: "Validates a termination event against Workday and SailPoint. Returns employment status, termination details, and case creation parameters.",
    riskClassification: "low",
    endpoint: "/validate-termination",
    method: "POST",
    inputSchema: { type: "object", required: ["employeeId"], properties: { employeeId: { type: "string" } } },
  },
  {
    name: "scan_portal_accounts",
    description: "Scans all partner portal accounts for an employee across DTCC, Bloomberg, ICE, Euroclear, Clearstream, SWIFT, HKEX CCASS, and MarkitServ.",
    riskClassification: "low",
    endpoint: "/scan-portal-accounts",
    method: "POST",
    inputSchema: { type: "object", required: ["employeeId"], properties: { employeeId: { type: "string" } } },
  },
  {
    name: "check_portal_health",
    description: "Checks if a specific partner portal is reachable and operational. Returns connectivity status and any active incidents.",
    riskClassification: "low",
    endpoint: "/check-portal-health",
    method: "POST",
    inputSchema: { type: "object", required: ["portalName"], properties: { portalName: { type: "string" } } },
  },
  {
    name: "check_pending_settlements",
    description: "Checks for pending trade settlements on a specific portal for an employee. Returns trade details, notional amounts, and risk assessment.",
    riskClassification: "low",
    endpoint: "/check-pending-settlements",
    method: "POST",
    inputSchema: { type: "object", required: ["employeeId", "portalName"], properties: { employeeId: { type: "string" }, portalName: { type: "string" } } },
  },
  {
    name: "execute_access_removal",
    description: "Executes access removal for an employee on a specific partner portal using the appropriate adapter (SAML, PKI, SWIFT token, API key).",
    riskClassification: "high",
    endpoint: "/execute-access-removal",
    method: "POST",
    inputSchema: { type: "object", required: ["employeeId", "portalName", "authType", "caseId"], properties: { employeeId: { type: "string" }, portalName: { type: "string" }, accountId: { type: "string" }, authType: { type: "string", enum: ["SAML", "PKI_CERT", "SWIFT_TOKEN", "API_KEY"] }, caseId: { type: "string" } } },
  },
  {
    name: "verify_access_removed",
    description: "Independently verifies that an employee's access has been removed from a portal by probing the auth endpoint. Returns confirmation ID.",
    riskClassification: "low",
    endpoint: "/verify-access-removed",
    method: "POST",
    inputSchema: { type: "object", required: ["employeeId", "portalName"], properties: { employeeId: { type: "string" }, portalName: { type: "string" } } },
  },
  {
    name: "generate_evidence_package",
    description: "Generates SOX Section 404 compliance evidence package. Archives to GRC vault, creates Splunk monitoring rule, closes ServiceNow case.",
    riskClassification: "low",
    endpoint: "/generate-evidence-package",
    method: "POST",
    inputSchema: { type: "object", required: ["caseId", "employeeId"], properties: { caseId: { type: "string" }, employeeId: { type: "string" }, portalsRemoved: { type: "number" } } },
  },
];

async function ensureAimMcpServer(): Promise<string> {
  const servers = await storage.getMcpServers();
  const existing = servers.find((s: any) => s.name === AIM_MCP_SERVER_NAME);
  if (existing) return existing.id;

  const server = await storage.createMcpServer({
    name: AIM_MCP_SERVER_NAME,
    description: "Live execution MCP server for BlackRock AIM Portal Offboarding. Provides validated tools for termination intake, portal discovery, trade settlement checks, access removal, verification, and SOX evidence generation.",
    transportType: "streamable-http",
    url: `${AIM_BASE_URL}/api/mock/bk2-aim`,
    status: "registered",
    riskTier: "HIGH",
    allowlisted: true,
    industryId: "financial_services",
    addedBy: "bk2-live-demo",
    capabilities: { tools: true, resources: false, prompts: false, sampling: false },
    serverInfo: { vendor: "BlackRock AIM", version: "1.0.0", compliance: ["SOX", "FCA SM&CR", "SEC 17a-4"] },
  });

  for (const t of AIM_TOOLS) {
    await storage.createMcpServerTool({
      serverId: server.id,
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      outputSchema: null,
      annotations: { endpoint: t.endpoint, method: t.method, risk: t.riskClassification, compliance: ["SOX"] },
      riskClassification: t.riskClassification,
      owner: "BlackRock IAM Team",
      enabled: true,
    });
  }

  return server.id;
}

async function ensureBk2AgentDeployment(agentId: string, agentName: string, mcpServerId: string): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId);
  let deployment = deps.find((d: any) => d.status === "deployed");

  if (!deployment) {
    deployment = await storage.createDeployment({
      agentId,
      agentName,
      environment: "production",
      status: "deployed",
      version: "1.0.0",
      rolloutStrategy: "canary",
      canaryPercent: 100,
      pipelineComplete: true,
      deployedAt: new Date(),
    });
  }

  const existingLinks = await storage.getAgentMcpServers(agentId);
  const alreadyLinked = existingLinks.some((l: any) => l.serverId === mcpServerId);
  if (!alreadyLinked) {
    await storage.createAgentMcpServer({ agentId, serverId: mcpServerId, assignedBy: "bk2-live-demo" });
  }

  return deployment.id;
}

function buildAgentPrompt(role: keyof typeof BK2_LIVE_AGENT_IDS, s: ReturnType<typeof setBk2LiveScenario>): string {
  const { employee, empId, caseId, role: empRole } = s;
  const base = `You are operating within the BlackRock AIM Portal Offboarding System for case ${caseId}.\nEmployee: ${employee} (${empId}) | Role: ${empRole}\n\n`;

  switch (role) {
    case "terminationIntake":
      return base + `Your task: Intake and validate the termination case.\n1. Call validate_termination with employeeId="${empId}" to confirm the HR event and workday status.\n2. Call scan_portal_accounts with employeeId="${empId}" to inventory all portal accounts.\n3. Summarize: employee details, termination confirmation, list of portals, total count, and any special flags (trade check required, critical tier). This summary will be handed off to the Portal Discovery agent.`;
    case "portalDiscovery":
      return base + `Your task: Discover and validate all portal accounts.\n1. Call scan_portal_accounts with employeeId="${empId}" to get the complete portal list.\n2. For each portal returned, call check_portal_health with that portalName to verify connectivity.\n3. Categorize portals as READY (reachable) or DEFERRED (unreachable, error, or maintenance). List each with its health status.`;
    case "activeTradeCheck":
      return base + `Your task: Check for pending trade settlements before any access removal.\n1. Call scan_portal_accounts with employeeId="${empId}" to identify settlement-linked portals.\n2. For each portal that involves trade settlement (Euroclear, DTCC FICC, Clearstream), call check_pending_settlements with employeeId="${empId}" and that portalName.\n3. Evaluate: if any portal has pendingCount > 0 and notional above $50M, recommend HOLD. Otherwise recommend PROCEED. Output your risk assessment clearly.`;
    case "accessRemovalExecutor":
      return base + `Your task: Execute access removal across all cleared portals.\n1. Call scan_portal_accounts with employeeId="${empId}" to get the portal list with accountIds and authTypes.\n2. For each portal, call execute_access_removal with employeeId="${empId}", portalName, accountId, authType, and caseId="${caseId}".\n3. Log the result for each portal: success/failure, confirmationId, or deferral reason. Collect all confirmation IDs.`;
    case "removalVerification":
      return base + `Your task: Independently verify that access has been removed from every portal.\n1. Call scan_portal_accounts with employeeId="${empId}" to get the portal list.\n2. For each portal, call verify_access_removed with employeeId="${empId}" and portalName.\n3. Report the verification status for each portal (removed, unreachable, still_active) and the auth probe result. Collect all confirmationIds.`;
    case "auditEvidence":
      return base + `Your task: Generate the SOX compliance evidence package and close the case.\n1. Call scan_portal_accounts with employeeId="${empId}" to count total portals processed.\n2. Call generate_evidence_package with caseId="${caseId}", employeeId="${empId}", and portalsRemoved=N.\n3. Confirm: GRC vault archival, SOX Section 404 compliance, Splunk monitoring rule creation, ServiceNow case ${caseId} closed. Summarize all artifact IDs and the package ID.`;
    default:
      return base + `Execute your offboarding task for employee ${empId}, case ${caseId}.`;
  }
}

// SSE: GET /demo-api/blackrock2/live-run?scenarioId=...
demoRouter.get("/blackrock2/live-run", async (req: Request, res: Response) => {
  const scenarioId = (req.query.scenarioId as Bk2LiveScenario) || "happy_path";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sendEvent = (eventType: string, payload: object) => {
    try {
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {}
  };

  let currentAgentName = "unknown";
  let aborted = false;

  const onRuntimeEvent = (evt: { deploymentId: string; agentId: string; runId: string; result: any }) => {
    if (aborted) return;
    const steps: any[] = evt.result?.steps ?? [];
    const toolCallSteps = steps.filter((s: any) => s.type === "api_call");
    for (const step of toolCallSteps) {
      const tool = step.mcpTool || step.name || "unknown_tool";
      const success = step.status === "completed" || step.status === "passed";
      sendEvent("agent_event", {
        agentName: currentAgentName,
        type: "tool_call_result",
        tool,
        data: { tool, success, error: step.error || null },
        success,
      });
    }
    if (toolCallSteps.length === 0) {
      sendEvent("agent_event", {
        agentName: currentAgentName,
        type: "final_analysis",
        data: { steps: steps.length, success: evt.result?.success },
        success: evt.result?.success,
      });
    }
  };

  runtimeEvents.on("agent_execution", onRuntimeEvent);
  req.on("close", () => { aborted = true; runtimeEvents.off("agent_execution", onRuntimeEvent); });

  try {
    sendEvent("run_start", { scenarioId, message: `Starting live run for scenario: ${scenarioId}` });

    const scenarioSpec = setBk2LiveScenario(scenarioId);
    const { employee, empId, caseId } = scenarioSpec;

    sendEvent("setup", { message: `Setting up AIM Offboarding Suite MCP server...` });
    const mcpServerId = await ensureAimMcpServer();
    sendEvent("setup", { message: `AIM MCP server ready (${mcpServerId.slice(0, 8)})` });

    const agentEntries = Object.entries(BK2_LIVE_AGENT_IDS) as [keyof typeof BK2_LIVE_AGENT_IDS, string][];
    const deploymentIds: Record<string, string> = {};

    for (const [role, agentId] of agentEntries) {
      const agent = await storage.getAgent(agentId);
      const agentName = agent?.name || role;
      const depId = await ensureBk2AgentDeployment(agentId, agentName, mcpServerId);
      deploymentIds[role] = depId;
    }

    sendEvent("setup", { message: `All 6 agents configured — starting execution for ${employee} (${empId}), case ${caseId}` });

    for (const [role, agentId] of agentEntries) {
      if (aborted) break;

      const agent = await storage.getAgent(agentId);
      currentAgentName = agent?.name || role;
      const deploymentId = deploymentIds[role];
      const prompt = buildAgentPrompt(role, scenarioSpec);

      sendEvent("agent_start", { agentId, agentName: currentAgentName, role, deploymentId });

      const result = await runAgentOnce(deploymentId, prompt, 6);

      sendEvent("agent_complete", {
        agentId,
        agentName: currentAgentName,
        role,
        success: result.success,
        message: result.message,
      });
    }

    clearBk2LiveScenario();
    sendEvent("run_complete", { scenarioId, caseId, employee, success: true, message: `All 6 agents completed for case ${caseId}` });
  } catch (err: any) {
    console.error("[bk2-live-run] Error:", err?.message);
    sendEvent("error", { message: err?.message || "Live run failed" });
    clearBk2LiveScenario();
  } finally {
    runtimeEvents.off("agent_execution", onRuntimeEvent);
    if (!aborted) res.end();
  }
});
