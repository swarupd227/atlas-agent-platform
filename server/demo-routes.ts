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
import { eq } from "drizzle-orm";
import { runTraces, agentRuntimeRuns, agents, mcpServers, deployments } from "@shared/schema";
import { runAgentOnce, stopAgentRuntime, isRuntimeActive, runtimeEvents, type RuntimeProgressEvent } from "./agent-runtime";
import { setBk2LiveScenario, clearBk2LiveScenario, getLastEmailSnapshot, clearLastEmailSnapshot, type Bk2LiveScenario } from "./blackrock2-live-store";

export const demoRouter = Router();

demoRouter.get("/servicenow/requests/:id", (_req: Request, res: Response) => {
  const state = getState();
  if (_req.params.id as string !== state.servicenow.id) {
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
  if (req.params.id as string !== state.servicenow.id) {
    return res.status(404).json({ error: "Request not found" });
  }
  const result = approveStep();
  res.json(result);
});

demoRouter.post("/servicenow/requests/:id/complete", (req: Request, res: Response) => {
  const result = completeRequest(req.params.id as string);
  res.json(result);
});

// ── Aquera SCIM (orchestrator tools) ────────────────────────────────────────
demoRouter.get("/aquera/connectors", (_req: Request, res: Response) => {
  res.json({ connectors: getState().aquera });
});

demoRouter.get("/aquera/connectors/:app", (req: Request, res: Response) => {
  const connector = getState().aquera.find((c) => c.app === req.params.app as string);
  if (!connector) return res.status(404).json({ error: "Connector not found" });
  res.json(connector);
});

demoRouter.post("/aquera/connectors/:id/activate", (req: Request, res: Response) => {
  const result = activateIdentity(req.params.id as string);
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
    status: (c as any).status,
    lastSync: (c as any).lastSync,
  }));
  res.json({ identityId: id, connectors, allRegistered: connectors.every((c) => c.status === "registered") });
});

demoRouter.post("/aquera/scim/deregister", (req: Request, res: Response) => {
  res.json({ success: true, message: "Identity deregistered from SCIM connectors", identityId: req.body.identityId || "BMSA-SYNTH-001" });
});

// ── RadiantOne (orchestrator & worker agent tools) ───────────────────────────
demoRouter.post("/radiantone/identities/:id/activate", (req: Request, res: Response) => {
  const result = activateIdentity(req.params.id as string || req.body.identityId || "BMSA-SYNTH-001");
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
  const result = certifyIdentity(req.params.identityId as string);
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
  const result = certifyIdentity(req.params.identityId as string);
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

demoRouter.get("/kinective/signplus/form", (_req: Request, res: Response) => {
  res.json(getScenarioFormData());
});

demoRouter.get("/kinective/signplus/form/:form_id", (_req: Request, res: Response) => {
  res.json(getScenarioFormData());
});

demoRouter.post("/kinective/signplus/archive", (_req: Request, res: Response) => {
  addKinectiveAudit("DOCUMENT_ARCHIVED", "SignPlus", "Signed COA form archived to permanent storage");
  getScenarioSystemUpdate("archive");
  res.json({ success: true, archive_id: `ARC-${Date.now().toString(36).toUpperCase()}` });
});

demoRouter.get("/kinective/signplus/status", (_req: Request, res: Response) => {
  res.json({ form_id: "COA-2026-00412", status: "SIGNED", signed_at: new Date().toISOString() });
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
  resetKinectiveDemo(scenario as any);
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

// ── Kinective: ensure-agent bootstrap ────────────────────────────────────────

const KINECTIVE_AGENT_ID = "c4b3099f-dfd8-4cce-9cf4-0cbb031f7f73";

const KINECTIVE_MCP_DEFS = [
  {
    id: "342cbdc9-6757-4600-9ca5-abe22aab5212",
    name: "Kinective SignPlus MCP Server",
    tools: [
      { name: "get_form_data", method: "GET", endpoint: "/signplus/form", description: "Retrieve the signed Change of Address form data for form COA-2026-00412" },
      { name: "archive_signed_document", method: "POST", endpoint: "/signplus/archive", description: "Archive the signed COA document to permanent storage" },
      { name: "get_signing_status", method: "GET", endpoint: "/signplus/status", description: "Check the signing status of COA form COA-2026-00412" },
    ],
  },
  {
    id: "ad15b89f-b45a-4eeb-9dc4-86f7769f4451",
    name: "Kinective Gateway Core MCP Server",
    tools: [
      { name: "update_member_address", method: "POST", endpoint: "/gateway/update-address", description: "Update the member's address in the core banking gateway" },
      { name: "get_member_profile", method: "GET", endpoint: "/gateway/member/{member_id}", description: "Retrieve member profile and account details" },
    ],
  },
  {
    id: "b8b0d00d-280e-4d2b-946d-f5611d22473b",
    name: "USPS Address Validation MCP Server",
    tools: [
      { name: "validate_address", method: "POST", endpoint: "/usps/validate", description: "Validate and standardize a mailing address via USPS" },
    ],
  },
  {
    id: "7665f8ba-5162-400b-b2c0-bd2c10ae534c",
    name: "Digital Banking Connector MCP Server",
    tools: [
      { name: "update_digital_address", method: "POST", endpoint: "/digital-banking/update-address", description: "Update address in the digital banking platform" },
      { name: "notify_digital_banking", method: "POST", endpoint: "/digital-banking/notify", description: "Send address change notification to digital banking" },
    ],
  },
  {
    id: "4a33df90-fda6-4d55-b6e0-0f616f8910a4",
    name: "Statement Vendor Connector MCP Server",
    tools: [
      { name: "update_statement_address", method: "POST", endpoint: "/statement/update-address", description: "Update mailing address with the statement print vendor" },
    ],
  },
  {
    id: "10dce6b3-8645-433d-bd2c-fbab17db127f",
    name: "Card Management Connector MCP Server",
    tools: [
      { name: "update_card_address", method: "POST", endpoint: "/card/update-address", description: "Update billing and shipping address for all member cards" },
    ],
  },
  {
    id: "0f821a1d-c46c-4561-bcf7-22558d62099e",
    name: "Loan Origination Connector MCP Server",
    tools: [
      { name: "update_loan_address", method: "POST", endpoint: "/loan/update-address", description: "Update mailing address on all active loan accounts" },
    ],
  },
  {
    id: "d9d2b2ff-0827-4e8c-a19d-2a3efd96d679",
    name: "CRM Connector MCP Server",
    tools: [
      { name: "update_crm_contact", method: "POST", endpoint: "/crm/update-contact", description: "Update member contact record in the CRM system" },
      { name: "create_interaction_record", method: "POST", endpoint: "/crm/interaction", description: "Log the address change as a CRM interaction event" },
    ],
  },
  {
    id: "7600115e-f721-450a-b640-4799c5d9e6eb",
    name: "Bill Pay Connector MCP Server",
    tools: [
      { name: "update_bill_pay_address", method: "POST", endpoint: "/billpay/update-address", description: "Update billing address in the bill pay system" },
    ],
  },
  {
    id: "8dbce5ea-3941-40b2-a2ea-95ee22fbddc4",
    name: "Fraud Detection Connector MCP Server",
    tools: [
      { name: "flag_address_change", method: "POST", endpoint: "/fraud/flag-change", description: "Flag the address change event for fraud monitoring review" },
    ],
  },
  {
    id: "3d5bfe63-df5d-42c0-9dfb-ce4bfcf6b41b",
    name: "Compliance Connector MCP Server",
    tools: [
      { name: "log_bsa_event", method: "POST", endpoint: "/compliance/bsa-event", description: "Log a BSA/AML compliance event for the address change" },
      { name: "create_compliance_record", method: "POST", endpoint: "/compliance/record", description: "Create a permanent compliance record for the change" },
      { name: "log_action", method: "POST", endpoint: "/audit-log", description: "Append an entry to the immutable audit log" },
      { name: "rollback_address_update", method: "POST", endpoint: "/rollback", description: "Roll back address changes for a specific system on failure" },
    ],
  },
] as const;

async function ensureKinectiveAgentSetup(): Promise<{ agentCreated: boolean; serversEnsured: string[] }> {
  const PORT = process.env.PORT || 5000;
  const MCP_BASE_URL = `http://localhost:${PORT}/demo-api/kinective`;

  // 1. Ensure the COA agent exists
  const existingAgent = await storage.getAgent(KINECTIVE_AGENT_ID);
  let agentCreated = false;
  const KINECTIVE_SYSTEM_PROMPT = `You are the Change of Address Agent for Kinective Credit Union. You orchestrate member address changes across all downstream systems, ensuring accuracy, compliance, and a seamless member experience.

Your responsibilities:
1. Retrieve and validate the signed COA form via SignPlus
2. Confirm the new address with USPS address validation
3. Propagate the update to all 11 downstream systems: core banking gateway, digital banking, statement vendor, card management, loan origination, CRM (contact + interaction record), bill pay, compliance (compliance record + BSA event), and fraud detection
4. Archive the signed document to permanent storage
5. Log every action for regulatory audit trails

If address validation fails: halt all updates, log the failure, create a compliance record, and route to human review. Never update systems with an unvalidated address.`;

  const KINECTIVE_TASK_PROMPT = "Process member Change of Address requests end-to-end: validate the signed COA form, confirm the new address with USPS, and propagate the update across all 11 downstream systems including core banking, digital banking, statements, cards, loans, CRM, bill pay, compliance, and fraud detection.";

  if (!existingAgent) {
    await db.insert(agents).values({
      id: KINECTIVE_AGENT_ID,
      name: "Change of Address Agent",
      description:
        "Orchestrates member address changes across all downstream systems including core banking, digital, cards, loans, compliance, and fraud detection.",
      systemPrompt: KINECTIVE_SYSTEM_PROMPT,
      runtimeConfig: { prompt: KINECTIVE_TASK_PROMPT, scheduleIntervalMinutes: 0 },
      agentType: "single",
      status: "active",
      environment: "production",
      modelProvider: "openai",
      modelName: "gpt-4.1",
      riskTier: "MEDIUM",
      autonomyMode: "autonomous",
      currentVersion: "1.0.0",
      maxToolIterations: 30,
      toolAccessClass: "standard",
      department: "Member Services",
      owner: "Kinective Demo",
      healthScore: 95,
      successRate: 0.97,
      maturityFactors: {},
    } as any);
    agentCreated = true;
  } else {
    const needsUpdate =
      (existingAgent as any).modelProvider !== "openai" ||
      (existingAgent as any).modelName !== "gpt-4.1" ||
      !(existingAgent as any).systemPrompt ||
      !(existingAgent as any).runtimeConfig?.prompt;
    if (needsUpdate) {
      await storage.updateAgent(KINECTIVE_AGENT_ID, {
        modelProvider: "openai",
        modelName: "gpt-4.1",
        systemPrompt: KINECTIVE_SYSTEM_PROMPT,
        runtimeConfig: { prompt: KINECTIVE_TASK_PROMPT, scheduleIntervalMinutes: 0 },
      } as any);
    }
  }

  // 2. Ensure each MCP server exists, has the right tools, and is linked to the agent
  const serversEnsured: string[] = [];

  for (const def of KINECTIVE_MCP_DEFS) {
    // Ensure MCP server record with the canonical UUID
    const allServers = await storage.getMcpServers();
    const existing = allServers.find((s: any) => s.id === def.id);

    if (!existing) {
      await db.insert(mcpServers).values({
        id: def.id,
        name: def.name,
        description: `Mock MCP server for the Kinective Change of Address demo — ${def.name}`,
        transportType: "streamable-http",
        url: MCP_BASE_URL,
        status: "production-enabled",
        riskTier: "MEDIUM",
        allowlisted: true,
        industryId: "financial_services",
        addedBy: "kinective-demo",
        capabilities: { tools: true, resources: false, prompts: false, sampling: false },
        serverInfo: { vendor: "Kinective", version: "1.0.0" },
      } as any);
    } else if (existing.url !== MCP_BASE_URL) {
      await storage.updateMcpServer(def.id, { url: MCP_BASE_URL });
    }

    // Ensure tools are registered
    const existingTools = (await storage.getMcpServerTools(def.id)) ?? [];
    const existingToolNames = new Set(existingTools.map((t: any) => t.name));

    for (const tool of def.tools) {
      if (!existingToolNames.has(tool.name)) {
        await storage.createMcpServerTool({
          serverId: def.id,
          name: tool.name,
          description: tool.description,
          inputSchema: { type: "object", properties: {} },
          outputSchema: null,
          annotations: { endpoint: tool.endpoint, method: tool.method },
          riskClassification: "medium",
          owner: "Kinective Demo",
          enabled: true,
        });
      } else {
        const existing = existingTools.find((t: any) => t.name === tool.name);
        const existingEndpoint = (existing as any)?.annotations?.endpoint;
        if (existing && existingEndpoint !== (tool as any).endpoint) {
          await storage.updateMcpServerTool(existing.id, {
            description: tool.description,
            annotations: { endpoint: tool.endpoint, method: tool.method },
          } as any);
        }
      }
    }

    // Link MCP server to agent if not already linked
    const existingLinks = (await storage.getAgentMcpServers(KINECTIVE_AGENT_ID)) ?? [];
    if (!existingLinks.some((l: any) => l.serverId === def.id)) {
      await storage.createAgentMcpServer({
        agentId: KINECTIVE_AGENT_ID,
        serverId: def.id,
        assignedBy: "kinective-demo",
      });
    }

    serversEnsured.push(def.name);
  }

  return { agentCreated, serversEnsured };
}

export async function kinectiveEnsureAgentHandler(_req: Request, res: Response): Promise<void> {
  try {
    const result = await ensureKinectiveAgentSetup();
    res.json({
      success: true,
      agentId: KINECTIVE_AGENT_ID,
      agentCreated: result.agentCreated,
      mcpServersConfigured: result.serversEnsured.length,
      mcpServers: result.serversEnsured,
      message: `Kinective COA agent and all ${result.serversEnsured.length} MCP servers are ready in this environment.`,
    });
  } catch (err: any) {
    console.error("[kinective/ensure-agent] Error:", err?.message, err?.stack);
    res.status(500).json({ success: false, error: err?.message ?? "Setup failed" });
  }
}

demoRouter.post("/kinective/ensure-agent", kinectiveEnsureAgentHandler);

// ── Kinective: SSE live-stream endpoint ──────────────────────────────────────

const KINECTIVE_TOOL_SYSTEM_MAP: Record<string, string> = {
  get_form_data: "SignPlus",
  archive_signed_document: "SignPlus",
  get_signing_status: "SignPlus",
  validate_address: "USPS",
  update_member_address: "Kinective Gateway",
  get_member_profile: "Kinective Gateway",
  update_digital_address: "Digital Banking",
  notify_digital_banking: "Member Notification",
  update_statement_address: "Statement Vendor",
  update_card_address: "Card Management",
  update_loan_address: "Loan Origination",
  update_crm_contact: "CRM",
  create_interaction_record: "CRM",
  update_bill_pay_address: "Bill Pay",
  flag_address_change: "Fraud Detection",
  log_bsa_event: "Compliance",
  create_compliance_record: "Compliance",
  log_action: "ATLAS",
  rollback_address_update: "Rollback",
};

function buildKinectiveAgentPrompt(scenario: string, isEnabled: (key: string) => boolean): string {
  if (scenario === "invalid_address") {
    return `You are the Change of Address Agent for Kinective. Process form COA-2026-00412 for member Sarah Mitchell.

Execute these steps:

1. Call get_form_data with form_id "COA-2026-00412" to retrieve the signed form
2. Call validate_address with street "1847 Lakewod Drve", city "Austin", state "TX", zip ""
3. The validation will return valid=false. When it does:
   - Call log_action with action "VALIDATION_FAILED", system "USPS", details "Address not found in USPS database. Routing to human review."
   - Call create_compliance_record with member_id "MBR-2026-84291", status "pending_review", details "USPS validation failed. Address change routed to manual review."
   - STOP. Do NOT call any system update tools. The member address must remain unchanged.

Log every action.`;
  }

  if (scenario === "system_failure") {
    return `You are the Change of Address Agent for Kinective. Process form COA-2026-00412 for member Sarah Mitchell.

Execute these steps in order:

1. Call get_form_data with form_id "COA-2026-00412"
2. Call validate_address with street "1847 Lakewood Drive", city "Austin", state "TX", zip "78701"
3. Call update_member_address with member_id "MBR-2026-84291" — success
4. Call update_digital_address with member_id "MBR-2026-84291" — success
5. Call update_statement_address with member_id "MBR-2026-84291" — success
6. Call update_bill_pay_address with member_id "MBR-2026-84291" — success
7. Call update_loan_address with member_id "MBR-2026-84291" — success
8. Call update_crm_contact with member_id "MBR-2026-84291" — success
9. Call flag_address_change with member_id "MBR-2026-84291"
10. Call update_card_address with member_id "MBR-2026-84291" — this will return a TIMEOUT error
11. The card update failed. Initiate full rollback across ALL systems updated before the failure:
    - Call log_action with action "SYSTEM_FAILURE", system "Card Management", details "PSCU card management timeout after 3 retries. Initiating full rollback across all updated systems for data consistency."
    - Call rollback_address_update with member_id "MBR-2026-84291", system "kinective-gateway", reason "Card management failure — full rollback for data consistency"
    - Call rollback_address_update with member_id "MBR-2026-84291", system "digital-banking", reason "Card management failure — full rollback for data consistency"
    - Call rollback_address_update with member_id "MBR-2026-84291", system "statement-vendor", reason "Card management failure — full rollback for data consistency"
    - Call rollback_address_update with member_id "MBR-2026-84291", system "bill-pay", reason "Card management failure — full rollback for data consistency"
    - Call rollback_address_update with member_id "MBR-2026-84291", system "fraud-detection", reason "Card management failure — full rollback for data consistency"
    - Call rollback_address_update with member_id "MBR-2026-84291", system "loan-origination", reason "Card management failure — full rollback for data consistency"
    - Call rollback_address_update with member_id "MBR-2026-84291", system "crm", reason "Card management failure — full rollback for data consistency"
12. Call create_compliance_record with member_id "MBR-2026-84291", status "partial_failure"
13. Call log_action with action "RETRY_SCHEDULED", system "ATLAS", details "Card management retry scheduled for next maintenance window. Ops ticket opened."

Log every action.`;
  }

  // Happy path — respects enabled system config
  const happySteps: string[] = [
    `1. Call get_form_data with form_id "COA-2026-00412" to retrieve the signed form`,
    `2. Call validate_address with street "1847 Lakewood Drive", city "Austin", state "TX", zip "78701"`,
  ];
  let stepNum = 3;
  if (isEnabled("Gateway") || isEnabled("Core Banking")) {
    happySteps.push(`${stepNum++}. Call update_member_address with member_id "MBR-2026-84291" and the new address`);
  }
  if (isEnabled("Digital Banking") || isEnabled("Alkami")) {
    happySteps.push(`${stepNum++}. Call update_digital_address with member_id "MBR-2026-84291" and the new address`);
  }
  if (isEnabled("Statement")) {
    happySteps.push(`${stepNum++}. Call update_statement_address with member_id "MBR-2026-84291" and the new address`);
  }
  if (isEnabled("Card")) {
    happySteps.push(`${stepNum++}. Call update_card_address with member_id "MBR-2026-84291" and the new address`);
  }
  if (isEnabled("Loan")) {
    happySteps.push(`${stepNum++}. Call update_loan_address with member_id "MBR-2026-84291" and the new address`);
  }
  if (isEnabled("CRM") || isEnabled("Salesforce")) {
    happySteps.push(`${stepNum++}. Call update_crm_contact with member_id "MBR-2026-84291" and the new address`);
  }
  if (isEnabled("Bill Pay")) {
    happySteps.push(`${stepNum++}. Call update_bill_pay_address with member_id "MBR-2026-84291" and the new address`);
  }
  if (isEnabled("Fraud")) {
    happySteps.push(`${stepNum++}. Call flag_address_change with member_id "MBR-2026-84291", old and new addresses`);
  }
  if (isEnabled("BSA") || isEnabled("Compliance") || isEnabled("AML")) {
    happySteps.push(`${stepNum++}. Call log_bsa_event with member_id "MBR-2026-84291", event_type "address_change"`);
    happySteps.push(`${stepNum++}. Call create_compliance_record with member_id "MBR-2026-84291", status "complete"`);
  }
  if (isEnabled("SignPlus")) {
    happySteps.push(`${stepNum++}. Call archive_signed_document with form_id "COA-2026-00412" and member_id "MBR-2026-84291"`);
  }
  if (isEnabled("Notification") || isEnabled("Member Notification")) {
    happySteps.push(`${stepNum++}. Call notify_digital_banking with member_id "MBR-2026-84291" and confirmation message`);
  }

  return `You are the Change of Address Agent for Kinective. Process form COA-2026-00412 for member Sarah Mitchell.

Execute these steps in order. Call each tool exactly once:

${happySteps.join("\n")}

Complete all steps. Log every action.`;
}

// SSE: GET /demo-api/kinective/stream?scenario=...
demoRouter.get("/kinective/stream", async (req: Request, res: Response) => {
  const scenarioParam = (req.query.scenario as string) || "happy";
  const validScenarios = ["happy", "invalid_address", "system_failure"];
  const scenario = validScenarios.includes(scenarioParam) ? scenarioParam : "happy";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sendEvent = (eventType: string, payload: object) => {
    try { res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`); } catch {}
  };

  let aborted = false;
  let kinectiveDeploymentId: string | null = null;

  req.on("close", () => { aborted = true; });

  // Per-step progress callback — fires in real-time as each tool call completes
  const onProgress = (evt: { type: string; timestamp: string; data: Record<string, any> }) => {
    if (aborted) return;
    const { type, data } = evt;
    if (type === "tool_call_start") {
      const tool = data.tool || "unknown";
      if (data.server === "unknown") return; // skip unresolved tool names
      sendEvent("agent_event", {
        type: "tool_call_start",
        tool,
        system: KINECTIVE_TOOL_SYSTEM_MAP[tool] || "Unknown",
      });
    } else if (type === "tool_call_result") {
      const tool = data.tool || "unknown";
      if (data.server === "unknown") return;
      // Semantic success check — tools like validate_address return valid:false with HTTP 200
      let success = data.success ?? true;
      if (success && data.result !== undefined) {
        if (typeof data.result?.valid === "boolean") success = data.result.valid;
      }
      sendEvent("agent_event", {
        type: "tool_call_result",
        tool,
        system: KINECTIVE_TOOL_SYSTEM_MAP[tool] || "Unknown",
        success,
        error: !success ? (data.result?.error_message || data.error || "failed") : null,
      });
    }
  };

  try {
    const {
      resetKinectiveDemo,
      setKinectiveRunning,
      setKinectiveTraceId,
      isKinectiveRunning,
      getEnabledSystems,
      getRunGeneration,
      finalizeKinectiveSystemUpdates,
    } = await import("./kinective-demo-store");

    if (isKinectiveRunning()) {
      sendEvent("error", { message: "Pipeline already running — wait for it to complete." });
      res.end();
      return;
    }

    sendEvent("run_start", { scenario, message: `COA pipeline starting — scenario: ${scenario}` });
    resetKinectiveDemo(scenario as any);
    setKinectiveRunning(true);
    const thisGeneration = getRunGeneration();

    sendEvent("setup", { message: "Ensuring COA agent and 11 MCP servers..." });
    await ensureKinectiveAgentSetup();
    sendEvent("setup", { message: "Agent ready — 11 MCP servers configured" });

    const allDeployments = await storage.getDeployments();
    let deployment = (allDeployments as any[]).find(
      (d: any) => d.agentId === KINECTIVE_AGENT_ID && d.status !== "rolled_back"
    );
    if (!deployment) {
      deployment = await storage.createDeployment({
        agentId: KINECTIVE_AGENT_ID,
        environment: "staging",
        version: "1.0.0",
        status: "active",
        rolloutStrategy: "direct",
        trafficPercentage: 100,
      } as any);
    }
    kinectiveDeploymentId = deployment.id;

    if (await isRuntimeActive(kinectiveDeploymentId!)) {
      stopAgentRuntime(kinectiveDeploymentId!);
    }

    const enabledSystems = getEnabledSystems();
    const isEnabled = (key: string) => enabledSystems.some((s: string) => s.toLowerCase().includes(key.toLowerCase()));
    const prompt = buildKinectiveAgentPrompt(scenario, isEnabled);
    const maxSteps = scenario === "invalid_address" ? 10 : 25;

    sendEvent("agent_start", { agentId: KINECTIVE_AGENT_ID, agentName: "Change of Address Agent" });

    const result = await runAgentOnce(deployment.id, prompt, maxSteps, onProgress);

    finalizeKinectiveSystemUpdates(scenario as any);

    if (getRunGeneration() !== thisGeneration) {
      setKinectiveRunning(false);
      sendEvent("run_complete", { scenario, success: false, message: "Run superseded by reset" });
      return;
    }

    const traces = await storage.getTracesByAgent(KINECTIVE_AGENT_ID);
    if (traces.length > 0) {
      const sorted = [...traces].sort((a: any, b: any) =>
        new Date((b as any).startedAt || 0).getTime() - new Date((a as any).startedAt || 0).getTime()
      );
      setKinectiveTraceId((sorted[0] as any).id);
    }

    setKinectiveRunning(false);
    sendEvent("run_complete", {
      scenario,
      success: result.success,
      message: result.success
        ? "COA pipeline complete — all systems processed"
        : "COA pipeline completed with errors",
    });
  } catch (err: any) {
    console.error("[kinective/stream] Error:", err?.message);
    sendEvent("error", { message: err?.message || "Pipeline failed" });
    try {
      const { setKinectiveRunning } = await import("./kinective-demo-store");
      setKinectiveRunning(false);
    } catch {}
  } finally {
    if (!aborted) res.end();
  }
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

type Bk2Scenario = "happy_path" | "portal_unreachable" | "pending_trades" | "admin_access" | "employee_transfer";

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
  employee_transfer: {
    employee: "Sarah Chen", emp: "EMP-28834", caseId: "AIM-TR-2026-0912",
    portalsRemoved: 3, portalsDeferred: 1, tradeHold: true, criticalTier: false, hkexDown: false,
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
        ? `CRITICAL hold detected. 3 unsettled REPO trades in Euroclear (EUR 847M notional). DTCC FICC and Clearstream are clear. Euroclear access held pending settlement. Other portals cleared for immediate removal. Escalated for human approval.`
        : `Trade check complete. No pending trades across all systems. All ${s.portalsRemoved} portals cleared for immediate removal.`,
      [
        { tool: "check_pending_settlements", status: "success" },
        { tool: "check_pending_settlements", status: "success" },
        { tool: "check_pending_settlements", status: "success" },
        ...(s.tradeHold ? [{ tool: "risk_threshold_evaluator", status: "success" }] : []),
      ],
      s.tradeHold ? [
        { step: "Euroclear settlement check", reasoning: "3 REPO trades with T+1 settlement. EUR 847M notional. Premature removal would cause settlement fails.", confidence: 0.99 },
        { step: "DTCC FICC settlement check", reasoning: "No pending GCF Repos. Account clear for immediate removal.", confidence: 0.99 },
        { step: "Issue hold recommendation", reasoning: "Euroclear exceeds $50M threshold. Human approval required. All other portals auto-cleared.", confidence: 0.98 },
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

// ─── BlackRock 1 LIVE Execution Engine ───────────────────────────────────────
// Upgrades BK1 to match BK2: real SSE streaming, ensure-agents bootstrap,
// and real agent log_action calls as the sole source of audit entries.

const BK1_AGENT_DEFS = {
  orchestrator: {
    id: "e9507c06-19cf-425f-8b59-fe58ba221121",
    name: "BlackRock Synthetic Worker Orchestrator",
    description: "Governs the 5-step synthetic worker provisioning pipeline for BlackRock AIM: task intake, identity validation, compliance gate, Aquera registration, and lifecycle audit.",
    mcpServerName: "BlackRock Synthetic Worker MCP",
    maxIterations: 12,
    systemPrompt: `You are the BlackRock Synthetic Worker Provisioning Orchestrator.

Your role is to govern the end-to-end provisioning of synthetic AI workers (non-human identities) for BlackRock's AIM division. You enforce the 5-step ATLAS pipeline:

1. TASK INTAKE — Poll ServiceNow for approved provisioning requests.
2. IDENTITY VALIDATION — Verify the synthetic worker identity against the RadiantOne directory.
3. COMPLIANCE PRE-CHECK — Route the request through Aquera for SoD and regulatory validation.
4. PROVISIONING GATE — Authorize worker agents to execute entitlement provisioning.
5. AUDIT — Log all actions and trigger lifecycle certification.

You coordinate Aquera, SailPoint, RadiantOne, and Brainwave worker agents. Never skip compliance checks. Log every significant action via log_action.`,
    taskPrompt: `Execute the full synthetic worker provisioning pipeline for BMSA-SYNTH-001 (request REQ0084721).

1. Call check_pending_requests to retrieve the pending provisioning request.
2. Call log_action with action "identity_validation", system "SailPoint", details confirming BMSA-SYNTH-001 is validated in the RadiantOne directory.
3. Call log_action with action "compliance_precheck", system "SailPoint", details confirming no SoD conflicts detected — routing to Aquera for SCIM registration.
4. Call activate_identity with identityId "BMSA-SYNTH-001" to trigger Aquera SCIM registration across all 4 connectors.
5. Call provision_account for each of the 4 applications: Aladdin OMS (Portfolio_Rebalancer), Charles River IMS (Compliance_Checker), Bloomberg Terminal (Market_Data_Reader), ServiceNow (Workflow_Initiator).
6. Call schedule_certification with identityId "BMSA-SYNTH-001" to trigger Brainwave lifecycle certification.
7. Call log_action with action "pipeline_complete", system "ATLAS Orchestrator", details confirming provisioning pipeline complete for BMSA-SYNTH-001 across all 4 systems.`,
  },
  aquera: {
    id: "c21b6549-e24d-4384-b667-9032619e3dd7",
    name: "Aquera Identity Provisioning Agent",
    description: "Provisions synthetic worker identities across Aquera SCIM connectors with compliance pre-checks before each registration.",
    mcpServerName: "Aquera SCIM MCP Server",
    maxIterations: 15,
    systemPrompt: `You are the Aquera Identity Provisioning Agent in the BlackRock synthetic worker pipeline.

Your role is to register synthetic worker identities across the Aquera SCIM connectors and ensure all compliance checks pass before provisioning. You operate across 4 application connectors: Aladdin OMS, Charles River IMS, Bloomberg Terminal, and ServiceNow. You must run a compliance pre-check before SCIM registration and verify registration status after each step.`,
    taskPrompt: `Provision BMSA-SYNTH-001 in the Aquera SCIM system for the BlackRock synthetic worker access pipeline.

1. Call compliance_pre_check to validate the provisioning request against the full identity fabric.
2. If the compliance check passes, call register_scim_user for each of the 4 SCIM connectors: Aladdin OMS SCIM Connector, Charles River IMS SCIM Connector, Bloomberg Terminal SCIM Connector, and ServiceNow SCIM Connector.
3. After each registration, call get_registration_status to confirm the identity is registered.
4. Log each successful registration via the audit log tool if available.`,
  },
  sailpoint: {
    id: "dacfb0d1-9e9e-4b4f-b0be-6f2824c5c05f",
    name: "SailPoint Entitlement Assignment Agent",
    description: "Provisions role-based entitlements for synthetic workers across financial applications via SailPoint IdentityIQ.",
    mcpServerName: "SailPoint IdentityIQ MCP Server",
    maxIterations: 15,
    systemPrompt: `You are the SailPoint Entitlement Assignment Agent in the BlackRock synthetic worker pipeline.

Your role is to provision role-based access entitlements for synthetic workers using SailPoint IdentityIQ. You handle 4 target applications: Aladdin OMS, Charles River IMS, Bloomberg Terminal, and ServiceNow. For each application, you provision the appropriate entitlement and then validate it is active and compliant.`,
    taskPrompt: `Provision access entitlements for BMSA-SYNTH-001 across all 4 BlackRock financial applications using SailPoint IdentityIQ.

Use provision_entitlement for each:
- Aladdin OMS (role: ReadOnly Portfolio Analytics)
- Charles River IMS (role: Read Order Flow)
- Bloomberg Terminal (role: Market Data Viewer)
- ServiceNow (role: ITSM Consumer)

After each provisioning, use validate_entitlement to confirm the assignment is active and compliant.`,
  },
  radiantone: {
    id: "67de43a1-c6b1-4f3a-b354-39140e6128a3",
    name: "RadiantOne Directory Synchronization Agent",
    description: "Activates and synchronizes synthetic worker identities in the RadiantOne federated meta-directory with full SR 11-7 lineage validation.",
    mcpServerName: "RadiantOne Identity MCP Server",
    maxIterations: 15,
    systemPrompt: `You are the RadiantOne Directory Synchronization Agent in the BlackRock synthetic worker pipeline.

Your role is to activate synthetic worker identities in the RadiantOne federated meta-directory and synchronize all attributes across connected directory services. You must validate the complete data lineage after synchronization to confirm audit trail integrity and SR 11-7 compliance.`,
    taskPrompt: `Synchronize BMSA-SYNTH-001 in the RadiantOne meta-directory for the BlackRock synthetic worker provisioning pipeline.

1. Call activate_identity to activate the identity in RadiantOne.
2. Call sync_directory to propagate all attributes across connected directory services.
3. Call validate_lineage to confirm the full data lineage and audit trail is intact and compliant with SR 11-7 requirements.`,
  },
  brainwave: {
    id: "e57e6394-c256-46cd-b0be-86510ab0a1be",
    name: "Brainwave Access Audit and Compliance Agent",
    description: "Audits and certifies synthetic worker access using Brainwave GRC, monitoring for anomalies and scheduling lifecycle recertification.",
    mcpServerName: "Brainwave Access Intelligence MCP Server",
    maxIterations: 15,
    systemPrompt: `You are the Brainwave Access Audit and Compliance Agent in the BlackRock synthetic worker pipeline.

Your role is to audit and certify synthetic worker access using the Brainwave GRC platform. You review the full access history, monitor for anomalous or unauthorized access events, and schedule lifecycle recertification across all provisioned systems. You enforce IOSCO and Model Risk Management (SR 11-7) requirements.`,
    taskPrompt: `Audit and certify the access provisioned for BMSA-SYNTH-001 using Brainwave.

1. Call get_audit_trail to review the full access history for BMSA-SYNTH-001.
2. Call monitor_access_events to detect any anomalies or unauthorized activity.
3. If no anomalies are detected, call schedule_recertification to trigger lifecycle certification across all provisioned systems.
4. Ensure full compliance with IOSCO and Model Risk Management (SR 11-7) requirements.`,
  },
} as const;

type Bk1Role = keyof typeof BK1_AGENT_DEFS;

const BK1_SOD_ORCHESTRATOR_PROMPT = `You are the BlackRock Synthetic Worker Provisioning Orchestrator handling request REQ0084721.

Execute the following steps:

1. TASK INTAKE: Call check_pending_requests. Log detection of REQ0084721: BMSA-SYNTH-001 requesting Portfolio_Rebalancer entitlement on Aladdin OMS. Worker type: Synthetic AI agent, Portfolio Operations.

2. IDENTITY VALIDATION: Call log_action with:
   {"action": "identity_validation", "system": "SailPoint", "details": "Identity cross-check: BMSA-SYNTH-001 validated in RadiantOne directory. Existing entitlement scan initiated across all connected systems including Active Directory and Aladdin OMS."}

3. COMPLIANCE GATE: Call log_action with:
   {"action": "compliance_precheck", "system": "SailPoint", "details": "Cross-system entitlement scan flagged potential conflict on Aladdin OMS. Routing to Aquera compliance gate for full SoD validation before provisioning proceeds."}

Stop here. Do NOT proceed to Aquera registration. Do NOT call activate_identity or provision_account. The Aquera agent will run its compliance check independently.`;

const BK1_SOD_AQUERA_PROMPT = `You are the Aquera Identity Provisioning Agent. Run the compliance pre-check for BMSA-SYNTH-001 (request REQ0084721: Portfolio_Rebalancer on Aladdin OMS).

Call compliance_pre_check to validate the provisioning request against the full identity fabric.

If the compliance check returns a violation or passed=false:
  - Call log_action with the violation details using system "Aquera"
  - Call log_action with:
    {"action": "POLICY_BLOCKED", "system": "Aquera", "details": "Aladdin OMS connector marked Policy Blocked. Provisioning halted. Incident routed to human review queue."}
  - STOP. Do NOT call register_scim_user. Do NOT call activate_identity.

If the compliance check passes, proceed normally with register_scim_user for each SCIM connector.`;

const BK1_PRIVESC_ORCHESTRATOR_PROMPT = `You are the BlackRock Synthetic Worker Provisioning Orchestrator handling request REQ0084721 — Scenario 3: Privilege Escalation Monitoring.

Execute the following steps:

1. TASK INTAKE: Call check_pending_requests. Log detection of REQ0084721: BMSA-SYNTH-001 requesting Bloomberg Terminal Market_Data_Reader access. Worker type: Synthetic AI agent, Portfolio Operations.

2. IDENTITY VALIDATION: Call log_action with:
   {"action": "identity_validation", "system": "SailPoint", "details": "Identity cross-check: BMSA-SYNTH-001 validated in RadiantOne directory. All entitlements confirmed within approved scope: Market_Data_Reader (Bloomberg), Portfolio_Rebalancer (Aladdin), Compliance_Checker (CRD), Workflow_Initiator (ServiceNow)."}

3. PROVISIONING APPROVED: Call log_action with:
   {"action": "provisioning_approved", "system": "ATLAS Orchestrator", "details": "Full provisioning approved for BMSA-SYNTH-001. All 4 application connectors authorized. Brainwave continuous monitoring enabled post-provisioning."}

Stop here. Worker agents will handle provisioning. Brainwave will run post-provisioning access monitoring.`;

const BK1_PRIVESC_BRAINWAVE_PROMPT = `You are the Brainwave Access Audit and Compliance Agent monitoring BMSA-SYNTH-001 after provisioning completes.

Your task is post-provisioning behavioral monitoring — not standard certification.

1. Call get_audit_trail to retrieve the recent access history for BMSA-SYNTH-001.

2. Call monitor_access_events to check for any behavioral anomalies or out-of-scope API calls.

3. If the response shows anomaliesDetected > 0 OR riskScore > 50 OR status is not "clean":
   - Call log_action with: {"action": "ANOMALY_DETECTED", "system": "Brainwave", "details": "CRITICAL ANOMALY: BMSA-SYNTH-001 invoked Bloomberg Terminal endpoint /trading/execute — outside granted Market_Data_Reader entitlement scope. Risk score: 98/100. Possible credential misuse or privilege escalation attempt detected."}
   - Call escalate_incident with: {"identityId": "BMSA-SYNTH-001", "severity": "CRITICAL", "endpoint": "/trading/execute", "regulation": "IOSCO SR 11-7", "details": "Unauthorized API endpoint invocation detected. /trading/execute is a write-execution endpoint requiring trading_execute entitlement — far beyond Market_Data_Reader scope. Certificate BMSA-SYNTH-001-X509 flagged for forensic review. Immediate session suspension triggered."}
   - Call log_action with: {"action": "IOSCO_SR11-7_FLAGGED", "system": "Brainwave", "details": "IOSCO SR 11-7 model risk incident report initiated. Audit package frozen. Full credential forensic trace enabled. AI Risk Operating Committee notified. Human review required."}
   - STOP. Do NOT call schedule_certification or schedule_recertification.

4. If status is "clean" and riskScore is 0: call schedule_recertification for BMSA-SYNTH-001 and log successful audit completion.`;

function buildBk1AgentPrompt(role: Bk1Role, scenario: "default" | "sod" | "privesc"): string {
  if (scenario === "sod") {
    if (role === "orchestrator") return BK1_SOD_ORCHESTRATOR_PROMPT;
    if (role === "aquera") return BK1_SOD_AQUERA_PROMPT;
  }
  if (scenario === "privesc") {
    if (role === "orchestrator") return BK1_PRIVESC_ORCHESTRATOR_PROMPT;
    if (role === "brainwave") return BK1_PRIVESC_BRAINWAVE_PROMPT;
  }
  return BK1_AGENT_DEFS[role].taskPrompt;
}

async function ensureBk1Agent(role: Bk1Role): Promise<void> {
  const def = BK1_AGENT_DEFS[role];
  const existing = await storage.getAgent(def.id);
  if (existing) {
    const needsUpdate =
      (existing as any).modelProvider !== "openai" ||
      (existing as any).modelName !== "gpt-4.1" ||
      (existing as any).systemPrompt !== def.systemPrompt ||
      (existing as any).runtimeConfig?.prompt !== def.taskPrompt;
    if (needsUpdate) {
      await db.update(agents)
        .set({
          modelProvider: "openai",
          modelName: "gpt-4.1",
          systemPrompt: def.systemPrompt,
          runtimeConfig: { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
        } as any)
        .where(eq(agents.id, def.id));
    }
    return;
  }
  await db.insert(agents).values({
    id: def.id,
    name: def.name,
    description: def.description,
    systemPrompt: def.systemPrompt,
    runtimeConfig: { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
    agentType: "single",
    status: "active",
    environment: "production",
    modelProvider: "openai",
    modelName: "gpt-4.1",
    riskTier: "HIGH",
    autonomyMode: "autonomous",
    currentVersion: "1.0.0",
    maxToolIterations: def.maxIterations,
    toolAccessClass: "standard",
    department: "Operations",
    owner: "BlackRock IAM Team",
    healthScore: 95,
    successRate: 0.97,
    maturityFactors: {},
  } as any).onConflictDoNothing();
}

async function ensureBk1AgentDeployment(role: Bk1Role): Promise<string> {
  const def = BK1_AGENT_DEFS[role];
  const allServers = await storage.getMcpServers();
  const mcpServer = allServers.find((s: any) => s.name === def.mcpServerName);
  const mcpServerId = mcpServer?.id ?? null;

  const deps = await storage.getDeploymentsByAgentId(def.id);
  let deployment = deps[0];
  if (!deployment) {
    deployment = await storage.createDeployment({
      agentId: def.id,
      agentName: def.name,
      environment: "production",
      status: "pending",
      version: "1.0.0",
      rolloutStrategy: "canary",
      canaryPercent: 100,
      pipelineComplete: true,
      deployedAt: new Date(),
    });
  } else if (deployment.status === "deployed") {
    await storage.updateDeployment(deployment.id, { status: "pending" });
  }

  if (mcpServerId) {
    const existingLinks = await storage.getAgentMcpServers(def.id);
    const alreadyLinked = existingLinks.some((l: any) => l.serverId === mcpServerId);
    if (!alreadyLinked) {
      await storage.createAgentMcpServer({ agentId: def.id, serverId: mcpServerId, assignedBy: "bk1-live-demo" });
    }
  }

  return deployment.id;
}

// Ensure each BK1 worker MCP server exists with its tools. Idempotent.
async function ensureBk1WorkerMcpServers(): Promise<void> {
  const BK1_WORKER_URL = `http://localhost:${process.env.PORT || 5000}/demo-api`;

  const BK1_WORKER_MCP_DEFS: Array<{
    name: string;
    description: string;
    tools: Array<{ name: string; description: string; endpoint: string; method: string; inputSchema: object }>;
  }> = [
    {
      name: "Aquera SCIM MCP Server",
      description: "Aquera SCIM provisioning server for the BlackRock Synthetic Worker pipeline. Handles identity registration across SCIM connectors with compliance pre-checks.",
      tools: [
        { name: "register_scim_user",       description: "Register a synthetic worker identity across all Aquera SCIM application connectors.", endpoint: "/aquera/scim/register",          method: "POST", inputSchema: { type: "object", properties: { identityId: { type: "string" } }, required: ["identityId"] } },
        { name: "get_registration_status",  description: "Get registration status for a synthetic worker identity across SCIM connectors.",        endpoint: "/aquera/scim/status",            method: "GET",  inputSchema: { type: "object", properties: { identityId: { type: "string" } } } },
        { name: "deregister_scim_user",     description: "Deregister a synthetic worker identity from all SCIM connectors.",                        endpoint: "/aquera/scim/deregister",        method: "POST", inputSchema: { type: "object", properties: { identityId: { type: "string" } }, required: ["identityId"] } },
        { name: "compliance_pre_check",     description: "Run a compliance pre-check for a synthetic worker provisioning request. Validates SoD rules, risk tier, and regulatory scope before SCIM registration.", endpoint: "/aquera/scim/compliance-check", method: "POST", inputSchema: { type: "object", properties: { identityId: { type: "string" }, requestedRole: { type: "string" } } } },
      ],
    },
    {
      name: "SailPoint IdentityIQ MCP Server",
      description: "SailPoint IdentityIQ MCP server for entitlement provisioning and access governance in the BlackRock Synthetic Worker pipeline.",
      tools: [
        { name: "provision_entitlement",  description: "Provision an entitlement for a synthetic worker identity via SailPoint IIQ.",                        endpoint: "/sailpoint/entitlement",           method: "POST", inputSchema: { type: "object", properties: { identityId: { type: "string" }, entitlement: { type: "string" } }, required: ["identityId", "entitlement"] } },
        { name: "revoke_access",          description: "Revoke access for a synthetic worker identity in SailPoint IIQ.",                                     endpoint: "/sailpoint/revoke",                method: "POST", inputSchema: { type: "object", properties: { identityId: { type: "string" } }, required: ["identityId"] } },
        { name: "get_entitlements",       description: "Get all entitlements for a synthetic worker identity from SailPoint IIQ.",                            endpoint: "/sailpoint/entitlements",          method: "GET",  inputSchema: { type: "object", properties: { identityId: { type: "string" } } } },
        { name: "validate_entitlement",   description: "Validate that an entitlement assignment is correct and compliant with SoD policies in SailPoint IIQ.", endpoint: "/sailpoint/entitlement/validate",  method: "POST", inputSchema: { type: "object", properties: { identityId: { type: "string" }, entitlement: { type: "string" } }, required: ["identityId", "entitlement"] } },
      ],
    },
    {
      name: "RadiantOne Identity MCP Server",
      description: "RadiantOne Identity MCP server for directory sync and lineage validation in the BlackRock Synthetic Worker pipeline.",
      tools: [
        { name: "activate_identity",  description: "Activate a synthetic worker identity in the RadiantOne identity fabric.",                           endpoint: "/radiantone/activate",  method: "POST", inputSchema: { type: "object", properties: { identityId: { type: "string" } }, required: ["identityId"] } },
        { name: "sync_directory",     description: "Trigger a directory synchronization for a synthetic worker identity across connected systems.",     endpoint: "/radiantone/sync",       method: "POST", inputSchema: { type: "object", properties: { identityId: { type: "string" } } } },
        { name: "validate_lineage",   description: "Validate the identity lineage for a synthetic worker in RadiantOne.",                              endpoint: "/radiantone/lineage",    method: "GET",  inputSchema: { type: "object", properties: { identityId: { type: "string" } } } },
        { name: "search_identity",    description: "Search for a synthetic worker identity in the RadiantOne virtual directory.",                       endpoint: "/radiantone/search",     method: "GET",  inputSchema: { type: "object", properties: { identityId: { type: "string" } } } },
      ],
    },
    {
      name: "Brainwave Access Intelligence MCP Server",
      description: "Brainwave Access Intelligence MCP server for audit, certification, and anomaly detection in the BlackRock Synthetic Worker pipeline.",
      tools: [
        { name: "escalate_incident",        description: "Escalate a compliance or security incident detected for a synthetic worker identity.",              endpoint: "/brainwave/escalate",                     method: "POST", inputSchema: { type: "object", properties: { identityId: { type: "string" }, severity: { type: "string" }, details: { type: "string" } }, required: ["identityId", "severity"] } },
        { name: "schedule_recertification", description: "Schedule an access recertification for a synthetic worker identity in Brainwave.",                  endpoint: "/brainwave/recertification/{identityId}", method: "POST", inputSchema: { type: "object", properties: { identityId: { type: "string" } }, required: ["identityId"] } },
        { name: "get_audit_trail",          description: "Retrieve the full audit trail for a synthetic worker identity from Brainwave Access Intelligence.",  endpoint: "/brainwave/audit",                        method: "GET",  inputSchema: { type: "object", properties: { identityId: { type: "string" } } } },
        { name: "monitor_access_events",    description: "Monitor recent access events and behavioral signals for a synthetic worker identity.",              endpoint: "/brainwave/events",                       method: "GET",  inputSchema: { type: "object", properties: { identityId: { type: "string" } } } },
      ],
    },
  ];

  const allServers = await storage.getMcpServers();

  for (const def of BK1_WORKER_MCP_DEFS) {
    const existing = allServers.find((s: any) => s.name === def.name);
    if (existing) {
      if (existing.url !== BK1_WORKER_URL) {
        await db.update(mcpServers).set({ url: BK1_WORKER_URL } as any).where(eq(mcpServers.id, existing.id));
      }
      continue;
    }

    const server = await storage.createMcpServer({
      name: def.name,
      description: def.description,
      url: BK1_WORKER_URL,
      transportType: "streamable-http",
      status: "production-enabled",
      riskTier: "LOW",
      capabilities: { tools: true, resources: false, prompts: false },
    });

    for (const tool of def.tools) {
      await storage.createMcpServerTool({
        serverId: server.id,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        enabled: true,
        riskClassification: "low",
        annotations: { endpoint: tool.endpoint, method: tool.method },
      });
    }

    console.log(`[bk1-ensure-agents] Created MCP server: ${def.name}`);
  }
}

// POST /demo-api/blackrock/ensure-agents — bootstrap all 5 BK1 agents + deployments.
// Safe to call from prod. Idempotent.
export async function bk1EnsureAgentsHandler(_req: Request, res: Response): Promise<void> {
  try {
    await ensureBk1WorkerMcpServers();
    const roles = Object.keys(BK1_AGENT_DEFS) as Bk1Role[];
    const results: Record<string, { agentId: string; deploymentId: string; agentName: string }> = {};
    for (const role of roles) {
      await ensureBk1Agent(role);
      const deploymentId = await ensureBk1AgentDeployment(role);
      results[role] = { agentId: BK1_AGENT_DEFS[role].id, deploymentId, agentName: BK1_AGENT_DEFS[role].name };
    }
    res.json({
      success: true,
      agentsConfigured: roles.length,
      agents: results,
      message: `All 5 BK1 agents are ready in this environment.`,
    });
  } catch (err: any) {
    console.error("[bk1-ensure-agents] Error:", err?.message);
    res.status(500).json({ success: false, error: err?.message || "Setup failed" });
  }
}
demoRouter.post("/blackrock/ensure-agents", bk1EnsureAgentsHandler);

// GET /demo-api/blackrock/live-run/stream?scenario=default|sod|privesc
// SSE endpoint: runs the BK1 agent pipeline and streams runtimeEvents to the frontend.
export async function bk1LiveRunStreamHandler(req: Request, res: Response): Promise<void> {
  const scenarioParam = (req.query.scenario as string) || "default";
  const scenario: "default" | "sod" | "privesc" =
    scenarioParam === "sod" ? "sod" : scenarioParam === "privesc" ? "privesc" : "default";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sendEvent = (eventType: string, payload: object) => {
    try { res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`); } catch {}
  };

  let currentAgentName = "unknown";
  let aborted = false;
  const bk1DeploymentIds = new Set<string>();

  const onRuntimeEvent = (evt: { deploymentId: string; agentId: string; runId: string; result: any }) => {
    if (aborted) return;
    if (!bk1DeploymentIds.has(evt.deploymentId)) return;

    const steps: any[] = evt.result?.steps ?? [];
    const toolCallSteps = steps.filter((s: any) => s.type === "api_call" && s.mcpServer !== "unknown");

    for (const step of toolCallSteps) {
      const tool = step.mcpTool || step.output?.mcpTool || step.name || "unknown_tool";
      const stepCompleted = step.status === "completed" || step.status === "passed";
      const responseData = step.output?.data ?? step.output ?? null;
      const bodySuccess = (() => {
        if (!responseData) return stepCompleted;
        if (typeof responseData.success === "boolean") return responseData.success;
        if (typeof responseData.passed === "boolean") return responseData.passed;
        return stepCompleted;
      })();
      const success = stepCompleted && bodySuccess;
      const errorReason = !success
        ? (responseData?.error || responseData?.errorMessage || responseData?.message || step.error || "blocked")
        : null;

      sendEvent("agent_event", {
        agentName: currentAgentName,
        type: "tool_call_result",
        tool,
        data: { tool, success, error: errorReason },
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
    sendEvent("run_start", { scenario, message: `Starting BK1 live run — scenario: ${scenario}` });

    // Set scenario state before running
    resetDemo();
    if (scenario === "sod") setSodPending(true);
    else if (scenario === "privesc") setPrivEscPending(true);

    // Ensure all 5 agents exist
    sendEvent("setup", { message: "Ensuring all 5 BK1 agents exist in this environment..." });
    const roles = Object.keys(BK1_AGENT_DEFS) as Bk1Role[];
    for (const role of roles) { await ensureBk1Agent(role); }

    // Determine which agents run for this scenario
    const agentsToRun: Bk1Role[] =
      scenario === "sod"     ? ["orchestrator", "aquera"] :
      scenario === "privesc" ? ["orchestrator", "brainwave"] :
      ["orchestrator", "aquera", "sailpoint", "radiantone", "brainwave"];

    const deploymentIds: Record<string, string> = {};
    for (const role of agentsToRun) {
      const depId = await ensureBk1AgentDeployment(role);
      deploymentIds[role] = depId;
      bk1DeploymentIds.add(depId);
    }

    sendEvent("setup", { message: `${agentsToRun.length} agents configured — starting execution` });

    for (const role of agentsToRun) {
      if (aborted) break;
      const def = BK1_AGENT_DEFS[role];
      currentAgentName = def.name;
      const deploymentId = deploymentIds[role];
      const prompt = buildBk1AgentPrompt(role, scenario);

      sendEvent("agent_start", { agentId: def.id, agentName: def.name, role, deploymentId });

      if (await isRuntimeActive(deploymentId)) stopAgentRuntime(deploymentId);

      const maxIter = scenario === "sod" || scenario === "privesc" ? 6 : def.maxIterations;
      const result = await runAgentOnce(deploymentId, prompt, maxIter);

      sendEvent("agent_complete", {
        agentId: def.id,
        agentName: def.name,
        role,
        success: result.success,
        message: result.message,
      });
    }

    sendEvent("run_complete", { scenario, success: true, message: `All ${agentsToRun.length} BK1 agents completed` });
  } catch (err: any) {
    console.error("[bk1-live-run] Error:", err?.message);
    sendEvent("error", { message: err?.message || "Live run failed" });
  } finally {
    runtimeEvents.off("agent_execution", onRuntimeEvent);
    if (!aborted) res.end();
  }
}
demoRouter.get("/blackrock/live-run/stream", bk1LiveRunStreamHandler);

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
  {
    name: "validate_transfer",
    description: "Validates an employee transfer event in Workday and SailPoint. Returns old role, new role, current portal entitlements to revoke, new portal entitlements to provision, and any handover requirements.",
    riskClassification: "low",
    endpoint: "/validate-transfer",
    method: "POST",
    inputSchema: { type: "object", required: ["employeeId"], properties: { employeeId: { type: "string" } } },
  },
  {
    name: "provision_access",
    description: "Provisions new portal access for an employee's new role. Creates account, assigns entitlements, syncs with Active Directory and SailPoint. Returns provision confirmation ID.",
    riskClassification: "medium",
    endpoint: "/provision-access",
    method: "POST",
    inputSchema: { type: "object", required: ["employeeId", "portalName", "caseId"], properties: { employeeId: { type: "string" }, portalName: { type: "string" }, newRole: { type: "string" }, department: { type: "string" }, caseId: { type: "string" }, authType: { type: "string" } } },
  },
  {
    name: "send_offboarding_summary",
    description: "Sends a structured offboarding completion summary email to the employee's manager, SOX compliance team, and IAM team. Includes case details, portals cleared, open exceptions, evidence package ID, and GRC vault reference. If RESEND_API_KEY is configured, delivers a real email; otherwise returns a detailed mock confirmation. Always succeeds — call this as the final step after generate_evidence_package.",
    riskClassification: "low",
    endpoint: "/send-offboarding-summary",
    method: "POST",
    inputSchema: {
      type: "object",
      required: ["caseId", "employeeId", "evidencePackageId", "portalsRemoved"],
      properties: {
        caseId: { type: "string" },
        employeeId: { type: "string" },
        evidencePackageId: { type: "string", description: "The packageId returned by generate_evidence_package" },
        portalsRemoved: { type: "number", description: "Count of portals successfully removed" },
        grcArchiveId: { type: "string", description: "The grcArchiveId returned by generate_evidence_package — pass this to keep evidence references consistent across tools" },
        openExceptions: { type: "array", description: "Array of open exception objects from generate_evidence_package", items: { type: "object" } },
        recipientEmail: { type: "string", description: "Manager email address — defaults to j.chen@blackrock.com" },
      },
    },
  },
];

// Agent definitions for idempotent creation — must match AGENT_NAME_MAP in the frontend
const BK2_AGENT_DEFINITIONS: Record<keyof typeof BK2_LIVE_AGENT_IDS, { name: string; description: string; systemPrompt: string; taskPrompt: string }> = {
  terminationIntake: {
    name: "Termination Intake Agent",
    description: "Validates employee termination events against Workday and SailPoint, creates removal cases, and flags special handling requirements.",
    systemPrompt: `You are the Termination Intake Agent for BlackRock's AIM Portal Offboarding Suite. You are the first agent in a 6-agent pipeline responsible for secure employee offboarding across 47 partner portals.

Your responsibilities:
1. Validate the termination event against Workday HR records
2. Check SailPoint for current entitlements and active access privileges
3. Create a removal case with a unique tracking ID
4. Flag special handling requirements (admin privileges, SWIFT access, elevated risk)
5. Return a structured case summary for downstream agents

Ensure data completeness before the case proceeds to Portal Discovery. All actions must be logged for SOX audit.`,
    taskPrompt: "Validate employee termination events against Workday and SailPoint, create access removal cases, and flag special handling requirements for the 6-agent offboarding pipeline.",
  },
  portalDiscovery: {
    name: "Portal Discovery Agent",
    description: "Scans all partner portals for employee account entitlements and verifies connectivity for each portal before removal.",
    systemPrompt: `You are the Portal Discovery Agent for BlackRock's AIM Portal Offboarding Suite. You run after Termination Intake and before Active Trade Check.

Your responsibilities:
1. Verify connectivity and health status for each partner portal
2. Scan all portals for active accounts linked to the terminated employee's credentials
3. Record account types, entitlement levels, and authentication methods (SAML, PKI, SWIFT token, API key)
4. Flag portals with pending transactions or elevated privilege access
5. Build a complete entitlement map for the Access Removal Executor

Connectivity failures must be documented and escalated. All discovered entitlements must be logged for audit.`,
    taskPrompt: "Scan all 47 partner portals for terminated employee account entitlements, verify portal connectivity, and build a complete access map for downstream offboarding agents.",
  },
  activeTradeCheck: {
    name: "Active Trade Check Agent",
    description: "Checks for pending trade settlements on each portal. Blocks removal for portals with unsettled trades above risk thresholds.",
    systemPrompt: `You are the Active Trade Check Agent for BlackRock's AIM Portal Offboarding Suite. You run after Portal Discovery to prevent premature access removal during active settlement windows.

Your responsibilities:
1. Query pending settlements and open positions for each portal with discovered accounts
2. Evaluate settlement values against risk thresholds ($50K default)
3. Block access removal for portals with unsettled trades above threshold
4. Clear portals with no pending settlements for immediate removal
5. Return a per-portal clearance status to the Access Removal Executor

Blocking a portal does not halt the pipeline — other portals proceed normally. Document all blocking decisions.`,
    taskPrompt: "Check for pending trade settlements on each partner portal. Block access removal where unsettled trades exceed risk thresholds; clear all others for immediate offboarding.",
  },
  accessRemovalExecutor: {
    name: "Access Removal Executor Agent",
    description: "Executes access removal across partner portals using the appropriate authentication adapters (SAML, PKI, SWIFT token, API key).",
    systemPrompt: `You are the Access Removal Executor Agent for BlackRock's AIM Portal Offboarding Suite. You execute the actual access removal after trade clearance is confirmed.

Your responsibilities:
1. For each cleared portal, select the correct authentication adapter (SAML, PKI, SWIFT token, or API key)
2. Execute the removal command via the AIM MCP server
3. Handle portal-specific removal protocols and retry logic
4. Record the outcome for each portal: success, failed, pending, or skipped
5. Produce a complete removal manifest for the Verification Agent

Execute removals sequentially per portal. Never skip a portal without logging the reason. All removal actions are permanent and must be logged for SOX compliance.`,
    taskPrompt: "Execute employee access removal across all cleared partner portals using portal-specific authentication adapters (SAML, PKI, SWIFT token, API key). Produce a complete removal manifest.",
  },
  removalVerification: {
    name: "Removal Verification Agent",
    description: "Independently verifies access removal by probing each portal's auth endpoint. Also provisions new access for employee transfers.",
    systemPrompt: `You are the Removal Verification Agent for BlackRock's AIM Portal Offboarding Suite. You independently verify that the Access Removal Executor succeeded on every portal.

Your responsibilities:
1. Probe each portal's authentication endpoint using the removed employee's credentials
2. Confirm access denial (401/403 response expected — any 200 is a failure requiring escalation)
3. Flag portals where removal was incomplete and trigger re-removal or escalation
4. For employee transfers: provision new access at the appropriate privilege level
5. Return a verified removal report to the Audit & Evidence Agent

Your verification is independent of the executor — do not assume success based on the executor's report alone.`,
    taskPrompt: "Independently verify access removal by probing each portal's authentication endpoint. Flag incomplete removals for escalation, and provision new access for employee transfers.",
  },
  auditEvidence: {
    name: "Audit & Evidence Agent",
    description: "Generates SOX Section 404 compliance evidence packages, archives to GRC vault, closes ServiceNow cases, and sends offboarding summary emails to managers and compliance teams.",
    systemPrompt: `You are the Audit & Evidence Agent for BlackRock's AIM Portal Offboarding Suite. You are the final agent in the pipeline, responsible for regulatory compliance, case closure, and stakeholder notification.

Your responsibilities:
1. Generate a structured SOX Section 404 evidence package (removal timestamps, verification logs, portal-by-portal status)
2. Archive the evidence package to the GRC vault with cryptographic integrity markers
3. Update the ServiceNow case to "Resolved" with a complete completion summary
4. Log the offboarding to the SOX compliance audit trail
5. Flag any unresolved portals for manual review in the compliance record
6. Send the offboarding completion summary email to the employee's manager and compliance team via send_offboarding_summary — include the packageId from step 1, portalsRemoved count, and any openExceptions

Do not close a case with unresolved portals without explicit escalation documentation. All evidence must be immutable and timestamped. Always send the summary email as the final step — this notifies stakeholders and formally closes the communication loop.`,
    taskPrompt: "Generate SOX Section 404 compliance evidence packages for completed access removals, archive to GRC vault, close out ServiceNow cases with full audit trails, and send the offboarding completion summary email to the manager and compliance team.",
  },
};

/**
 * Ensures a BK2 agent exists in the database with the hardcoded UUID.
 * Uses ON CONFLICT DO NOTHING so it is safe to call from both dev and prod — idempotent.
 */
async function ensureBk2Agent(id: string, role: keyof typeof BK2_LIVE_AGENT_IDS): Promise<void> {
  const existing = await storage.getAgent(id);
  const def = BK2_AGENT_DEFINITIONS[role];
  if (existing) {
    const needsUpdate =
      (existing as any).modelProvider !== "openai" ||
      (existing as any).modelName !== "gpt-4.1" ||
      !(existing as any).systemPrompt ||
      !(existing as any).runtimeConfig?.prompt;
    if (needsUpdate) {
      await db.update(agents)
        .set({
          modelProvider: "openai",
          modelName: "gpt-4.1",
          systemPrompt: def.systemPrompt,
          runtimeConfig: { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
        } as any)
        .where(eq(agents.id, id));
    }
    return;
  }

  await db.insert(agents).values({
    id,
    name: def.name,
    description: def.description,
    systemPrompt: def.systemPrompt,
    runtimeConfig: { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
    agentType: "single",
    status: "active",
    environment: "production",
    modelProvider: "openai",
    modelName: "gpt-4.1",
    riskTier: "HIGH",
    autonomyMode: "autonomous",
    currentVersion: "1.0.0",
    maxToolIterations: 6,
    toolAccessClass: "standard",
    department: "Operations",
    owner: "BlackRock IAM Team",
    healthScore: 95,
    successRate: 0.97,
    maturityFactors: {},
  } as any).onConflictDoNothing();
}

async function ensureAimMcpServer(): Promise<string> {
  const servers = await storage.getMcpServers();
  const existing = servers.find((s: any) => s.name === AIM_MCP_SERVER_NAME);

  let serverId: string;
  if (existing) {
    serverId = existing.id;
  } else {
    const server = await storage.createMcpServer({
      name: AIM_MCP_SERVER_NAME,
      description: "Live execution MCP server for BlackRock AIM Portal Offboarding. Provides validated tools for termination intake, portal discovery, trade settlement checks, access removal, verification, evidence generation, and employee transfers.",
      transportType: "streamable-http",
      url: `${AIM_BASE_URL}/api/mock/bk2-aim`,
      status: "registered",
      riskTier: "HIGH",
      allowlisted: true,
      industryId: "financial_services",
      addedBy: "bk2-live-demo",
      capabilities: { tools: true, resources: false, prompts: false, sampling: false },
      serverInfo: { vendor: "BlackRock AIM", version: "1.1.0", compliance: ["SOX", "FCA SM&CR", "SEC 17a-4", "MiFID II"] },
    });
    serverId = server.id;
  }

  // Idempotently register any tools that are not yet recorded — handles newly-added tools
  // (validate_transfer, provision_access) without dropping and re-creating the server.
  const existingTools = await storage.getMcpServerTools(serverId);
  const existingToolNames = new Set((existingTools || []).map((t: any) => t.name));
  for (const t of AIM_TOOLS) {
    if (!existingToolNames.has(t.name)) {
      await storage.createMcpServerTool({
        serverId,
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
  }

  return serverId;
}

async function ensureBk2AgentDeployment(agentId: string, agentName: string, mcpServerId: string): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId);
  // Accept any existing deployment — "pending" prevents auto-resume, "deployed" would trigger it.
  // If existing is "deployed" patch it to "pending" to stop the 20s periodic cycles.
  let deployment = deps[0];

  if (!deployment) {
    deployment = await storage.createDeployment({
      agentId,
      agentName,
      environment: "production",
      status: "pending",
      version: "1.0.0",
      rolloutStrategy: "canary",
      canaryPercent: 100,
      pipelineComplete: true,
      deployedAt: new Date(),
    });
  } else if (deployment.status === "deployed") {
    // Downgrade to "pending" so auto-resume stops picking this up on server restarts.
    await storage.updateDeployment(deployment.id, { status: "pending" });
  }

  const existingLinks = await storage.getAgentMcpServers(agentId);
  // Remove any MCP server links that are NOT the AIM server — stale links cause Claude to see
  // unrelated tools (scan_accounts, revoke_certificate, etc.) and hallucinate or call wrong endpoints.
  for (const link of existingLinks) {
    if (link.serverId !== mcpServerId) {
      await storage.deleteAgentMcpServer(link.id);
    }
  }
  const alreadyLinked = existingLinks.some((l: any) => l.serverId === mcpServerId);
  if (!alreadyLinked) {
    await storage.createAgentMcpServer({ agentId, serverId: mcpServerId, assignedBy: "bk2-live-demo" });
  }

  return deployment.id;
}

function buildAgentPrompt(role: keyof typeof BK2_LIVE_AGENT_IDS, s: ReturnType<typeof setBk2LiveScenario>): string {
  const { employee, empId, caseId, role: empRole, tradeCheck, criticalTier, hkexDown, isTransfer, newPortals, newRole, newDepartment } = s as any;
  const base = `You are operating within the BlackRock AIM Portal Offboarding System for case ${caseId}.\nEmployee: ${employee} (${empId}) | Role: ${empRole}\n\n`;

  switch (role) {
    case "terminationIntake":
      if (isTransfer) {
        const newPortalNames = (newPortals || []).map((p: any) => p.name).join(", ");
        return base + `This is an EMPLOYEE TRANSFER case — NOT a termination. Handle accordingly.\nYour task: Intake and validate the transfer event.\n1. Call validate_transfer with employeeId="${empId}" to confirm the Workday transfer event, SailPoint entitlement delta, portals to revoke, and portals to provision.\n2. Call scan_portal_accounts with employeeId="${empId}" to inventory all current portal accounts.\n3. Note handover requirements from the validate_transfer response — ICE Trade Vault has pending FI repo positions that must be reassigned to a backup reporter before access removal.\n4. Summarize: employee details, transfer confirmation (old role → ${newRole || "new role"}), portals to revoke, portals to provision (${newPortalNames}), and all handover requirements.`;
      }
      return base + `Your task: Intake and validate the termination case.\n1. Call validate_termination with employeeId="${empId}" to confirm the HR event and workday status.\n2. Call scan_portal_accounts with employeeId="${empId}" to inventory all portal accounts.\n3. Note any special flags: requiresTradeCheck=${tradeCheck}, requiresCriticalApproval=${criticalTier}.\n4. Summarize: employee details, termination confirmation, portal list, and all special flags.`;

    case "portalDiscovery":
      if (isTransfer) {
        return base + `This is an EMPLOYEE TRANSFER case.\nYour task: Discover and validate all current portal accounts that must be revoked.\n1. Call scan_portal_accounts with employeeId="${empId}" to get the current FI portal list.\n2. For each portal, call check_portal_health with that portalName to verify connectivity.\n3. If a portal returns reachable=false, mark it DEFERRED.\n4. Also note: ICE Trade Vault has pending FI repo positions — it will need a HOLD pending handover.\n5. Categorize each portal as READY FOR REVOCATION or DEFERRED/HOLD and list all health results.`;
      }
      return base + `Your task: Discover and validate all portal accounts.\n1. Call scan_portal_accounts with employeeId="${empId}" to get the complete portal list.\n2. For each portal, call check_portal_health with that portalName to verify connectivity.\n3. If a portal returns reachable=false, mark it DEFERRED — do not proceed with removal for that portal.\n4. Categorize each portal as READY or DEFERRED and list all health results.${hkexDown ? "\nNOTE: Expect HKEX CCASS to be unreachable in this scenario." : ""}`;

    case "activeTradeCheck":
      if (isTransfer) {
        return base + `This is an EMPLOYEE TRANSFER case.\nYour task: Check for pending FI trade settlements before any access removal — critical for compliance.\n1. For each portal in scope (Bloomberg TOMS, ICE Trade Vault, Clearstream, MarkitServ), call check_pending_settlements with employeeId="${empId}" and that portalName.\n2. ICE Trade Vault is expected to have pending FI repo positions — output: "HOLD — ICE Trade Vault: [trade details]".\n3. For portals with no pending trades, output: "PROCEED — [portalName]: clear for revocation".\n4. Final output: list each portal's settlement status with clear HOLD or PROCEED designation.`;
      }
      return base + `Your task: Check for pending trade settlements before any access removal.\n1. Call scan_portal_accounts with employeeId="${empId}" to identify all portals.\n2. For each settlement-linked portal (Euroclear, Clearstream, DTCC FICC), call check_pending_settlements with employeeId="${empId}" and that portalName.\n3. If hasPendingSettlements=true and riskAssessment.riskLevel is HIGH or CRITICAL, output: "HOLD — [portalName]: [trade details]". If clear, output: "PROCEED — [portalName]: no pending settlements".\n4. Your final output must list each portal's settlement status clearly.${tradeCheck ? "\nNOTE: Only Euroclear has pending trade positions in this case — expect a settlement hold on Euroclear only. DTCC FICC and Clearstream are clear." : ""}`;

    case "accessRemovalExecutor":
      if (isTransfer) {
        return base + `This is an EMPLOYEE TRANSFER case — revoke OLD Fixed Income portal access only.\nYour task: Execute access revocation across all current FI portals.\n1. Call scan_portal_accounts with employeeId="${empId}" to get the portal list with accountIds and authTypes.\n2. For each portal (Bloomberg TOMS, ICE Trade Vault, Clearstream, MarkitServ), call execute_access_removal with employeeId="${empId}", portalName, accountId, authType, and caseId="${caseId}".\n3. IMPORTANT: ICE Trade Vault will return success=false with errorCode PENDING_SETTLEMENTS_BLOCK — do NOT retry. Mark it DEFERRED with note "Pending FI repo positions — handover required before access removal". Move on.\n4. Log all results: REVOKED (with confirmationId) or DEFERRED (with errorCode and reason).\n5. Summarize: portals revoked, portals deferred and why.`;
      }
      return base + `Your task: Execute access removal across all portals. Respect any blocks from the system.\n1. Call scan_portal_accounts with employeeId="${empId}" to get portal list with accountIds and authTypes.\n2. For each portal, call execute_access_removal with employeeId="${empId}", portalName, accountId, authType, and caseId="${caseId}".\n3. IMPORTANT: If the response contains success=false with errorCode PENDING_SETTLEMENTS_BLOCK or CRITICAL_TIER_APPROVAL_REQUIRED or ECONNREFUSED, do NOT retry — document it as a BLOCKED/DEFERRED portal with the reason and move on to the next portal.\n4. Log all results: for each portal state whether it was REMOVED (with confirmationId) or BLOCKED/DEFERRED (with errorCode and reason).\n5. At the end, summarize: portals removed, portals blocked/deferred and why.${tradeCheck ? "\nNOTE: Only Euroclear will be blocked due to pending settlements — treat its PENDING_SETTLEMENTS_BLOCK response as DEFERRED. DTCC FICC and Clearstream are clear and should be removed." : ""}${criticalTier ? "\nNOTE: SWIFT Alliance is CRITICAL tier — expect a CRITICAL_TIER_APPROVAL_REQUIRED block. Document it as requiring manager approval." : ""}${hkexDown ? "\nNOTE: HKEX CCASS will be unreachable — treat as DEFERRED." : ""}`;

    case "removalVerification":
      if (isTransfer) {
        const provisionList = (newPortals || []).map((p: any) => `${p.name} (${p.role}, ${p.authType})`).join(", ");
        return base + `This is an EMPLOYEE TRANSFER case. Your task is ACCESS PROVISIONING — not removal verification.\nYour task: Provision new Equities desk access for ${employee}'s new role as ${newRole || "Equities Trader"} in ${newDepartment || "Equities Trading"}.\n1. For each new portal — ${provisionList} — call provision_access with:\n   - employeeId="${empId}"\n   - portalName (exact name as listed)\n   - newRole (the role listed for that portal)\n   - department="${newDepartment || "Equities Trading"}"\n   - caseId="${caseId}"\n2. For each call, record: provisionedAt, confirmationId, newAccountId, and authSetup details.\n3. Summarize: all portals provisioned, confirmation IDs, and any failures.`;
      }
      return base + `Your task: Independently verify access removal status for every portal.\n1. Call scan_portal_accounts with employeeId="${empId}" to get the portal list.\n2. For each portal, call verify_access_removed with employeeId="${empId}" and portalName.\n3. For each portal, report: status (removed / unreachable / deferred), authProbeResult, and confirmationId if available.\n4. Count: portals confirmed removed, portals deferred/unreachable. Flag any portal showing status other than "removed" or "unreachable".`;

    case "auditEvidence":
      if (isTransfer) {
        return base + `This is an EMPLOYEE TRANSFER case — generate a transfer compliance evidence package.\nYour task: Archive evidence, close the transfer case, and notify stakeholders.\n1. Call generate_evidence_package with caseId="${caseId}", employeeId="${empId}", and portalsRemoved=3 (Bloomberg TOMS, Clearstream, MarkitServ — ICE Trade Vault is deferred).\n2. Confirm: GRC vault archival, MiFID II Article 26 transfer audit trail, SOX IA-07 dual-role prohibition check, Splunk monitoring rules, ServiceNow case ${caseId} status.\n3. Note open exception: ICE Trade Vault access removal deferred — pending FI repo position handover. Include follow-up task reference.\n4. Also confirm: 4 new Equities portals provisioned (Bloomberg AIM, Fidessa OMS, DTCC Equities, Morningstar Direct).\n5. Call send_offboarding_summary with caseId="${caseId}", employeeId="${empId}", evidencePackageId=<packageId from step 1>, grcArchiveId=<grcArchiveId from step 1>, portalsRemoved=3, and openExceptions=[{"portal":"ICE Trade Vault","reason":"DEFERRED — pending FI repo position handover required before access removal"}]. This sends the completion notification to the manager and compliance team.`;
      }
      return base + `Your task: Generate the SOX compliance evidence package, close the case, and notify stakeholders.\n1. Call scan_portal_accounts with employeeId="${empId}" to count all portals in scope.\n2. Call generate_evidence_package with caseId="${caseId}", employeeId="${empId}", and portalsRemoved (count only successfully removed portals — exclude deferred/blocked ones).\n3. Confirm: GRC vault archival, SOX Section 404 compliance, Splunk monitoring rules, ServiceNow case ${caseId} status.\n4. Note any deferred portals in the evidence package summary as open exceptions requiring follow-up.\n5. Call send_offboarding_summary with caseId="${caseId}", employeeId="${empId}", evidencePackageId=<packageId from step 2>, grcArchiveId=<grcArchiveId from step 2>, portalsRemoved=<portalsRemoved count from step 2>, and openExceptions=<openExceptions array from step 2>. This delivers the completion summary email to the employee's manager, SOX compliance team, and IAM team — do not skip this step.`;

    default:
      return base + `Execute your offboarding task for employee ${empId}, case ${caseId}.`;
  }
}

// POST /demo-api/blackrock2/ensure-agents — lightweight setup: creates agents, MCP server,
// and deployments in the current environment without running any Claude cycles.
// Safe to call from prod to bootstrap the demo before first live run.
export async function bk2EnsureAgentsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const mcpServerId = await ensureAimMcpServer();
    const agentEntries = Object.entries(BK2_LIVE_AGENT_IDS) as [keyof typeof BK2_LIVE_AGENT_IDS, string][];
    const results: Record<string, { agentId: string; deploymentId: string; agentName: string }> = {};

    for (const [role, agentId] of agentEntries) {
      await ensureBk2Agent(agentId, role);
      const agent = await storage.getAgent(agentId);
      const agentName = agent?.name || BK2_AGENT_DEFINITIONS[role].name;
      const deploymentId = await ensureBk2AgentDeployment(agentId, agentName, mcpServerId);
      results[role] = { agentId, deploymentId, agentName };
    }

    res.json({
      success: true,
      mcpServerId,
      agentsConfigured: Object.keys(results).length,
      agents: results,
      message: `All 6 BK2 agents and AIM MCP server are ready in this environment.`,
    });
  } catch (err: any) {
    console.error("[bk2-ensure-agents] Error:", err?.message);
    res.status(500).json({ success: false, error: err?.message || "Setup failed" });
  }
}

demoRouter.post("/blackrock2/ensure-agents", bk2EnsureAgentsHandler);

// SSE: GET /demo-api/blackrock2/live-run?scenarioId=...
export async function bk2LiveRunHandler(req: Request, res: Response): Promise<void> {
  return bk2LiveRunHandlerInner(req, res);
}
async function bk2LiveRunHandlerInner(req: Request, res: Response): Promise<void> {
  const scenarioId = (req.query.scenarioId as Bk2LiveScenario) || "happy_path";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sendEvent = (eventType: string, payload: object) => {
    try {
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {}
  };

  // Keepalive ping every 15 s — prevents production reverse-proxy from
  // closing the SSE connection during the ~70s agent pipeline.
  let aborted = false;
  const keepaliveTimer = setInterval(() => {
    if (aborted) { clearInterval(keepaliveTimer); return; }
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepaliveTimer); }
  }, 15_000);

  let currentAgentName = "unknown";
  const bk2DeploymentIds = new Set<string>();

  const onRuntimeEvent = (evt: { deploymentId: string; agentId: string; runId: string; result: any }) => {
    if (aborted) return;
    if (!bk2DeploymentIds.has(evt.deploymentId)) return;

    const steps: any[] = evt.result?.steps ?? [];
    const toolCallSteps = steps.filter((s: any) => s.type === "api_call" && s.mcpServer !== "unknown");
    for (const step of toolCallSteps) {
      const tool = step.mcpTool || step.output?.mcpTool || step.name || "unknown_tool";
      const stepCompleted = step.status === "completed" || step.status === "passed";

      const responseData = step.output?.data ?? step.output ?? null;
      const bodySuccess = (() => {
        if (!responseData) return stepCompleted;
        if (typeof responseData.success === "boolean") return responseData.success;
        if (typeof responseData.reachable === "boolean") return responseData.reachable;
        if (responseData.status === "deferred" || responseData.status === "pending_approval") return false;
        if (responseData.hasPendingSettlements === true) return false;
        return stepCompleted;
      })();

      const success = stepCompleted && bodySuccess;
      const errorReason = !success
        ? (responseData?.errorCode
          || (responseData?.hasPendingSettlements ? "PENDING_SETTLEMENTS_FOUND" : null)
          || responseData?.errorMessage
          || responseData?.message
          || step.error
          || "blocked")
        : null;

      const isSummaryEmail = tool === "send_offboarding_summary";
      sendEvent("agent_event", {
        agentName: currentAgentName,
        type: "tool_call_result",
        tool,
        data: {
          tool,
          success,
          error: errorReason,
          portalName: responseData?.portalName || responseData?.portal || null,
          accountId: responseData?.newAccountId || responseData?.accountId || null,
          ...(isSummaryEmail && success ? {
            emailRecipients: responseData?.recipients ?? null,
            emailSubject:    responseData?.subject    ?? null,
            emailMessageId:  responseData?.messageId  ?? null,
            emailStatus:     responseData?.summaryStats?.status ?? null,
            emailSnapshot: {
              subject:           responseData?.subject           ?? null,
              recipients:        responseData?.recipients        ?? null,
              messageId:         responseData?.messageId         ?? null,
              deliveryMethod:    responseData?.deliveryMethod    ?? "mock",
              sentAt:            responseData?.sentAt            ?? null,
              summaryStats:      responseData?.summaryStats      ?? null,
              evidencePackageId: responseData?.evidencePackageId ?? null,
              grcArchiveId:      responseData?.grcArchiveId      ?? null,
              caseId:            responseData?.caseId            ?? null,
              employeeId:        responseData?.employeeId        ?? null,
              employeeName:      responseData?.employeeName      ?? null,
              employeeRole:      responseData?.employeeRole      ?? null,
              fromAddress:        responseData?.fromAddress        ?? null,
              soxStatus:          responseData?.soxStatus          ?? null,
              retentionPolicy:    responseData?.retentionPolicy    ?? null,
              portalsProvisioned: responseData?.portalsProvisioned ?? null,
              provisionedPortals: responseData?.provisionedPortals ?? null,
              exceptionDetails:   responseData?.exceptionDetails   ?? null,
            },
          } : {}),
        },
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
  req.on("close", () => {
    aborted = true;
    clearInterval(keepaliveTimer);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
  });

  try {
    sendEvent("run_start", { scenarioId, message: `Starting live run for scenario: ${scenarioId}` });

    clearLastEmailSnapshot();
    const scenarioSpec = setBk2LiveScenario(scenarioId);
    const { employee, empId, caseId } = scenarioSpec;

    sendEvent("setup", { message: `Setting up AIM Offboarding Suite MCP server...` });
    const mcpServerId = await ensureAimMcpServer();
    sendEvent("setup", { message: `AIM MCP server ready (${mcpServerId.slice(0, 8)})` });

    const agentEntries = Object.entries(BK2_LIVE_AGENT_IDS) as [keyof typeof BK2_LIVE_AGENT_IDS, string][];
    const deploymentIds: Record<string, string> = {};

    sendEvent("setup", { message: `Ensuring all 6 BK2 agents exist in this environment...` });
    for (const [role, agentId] of agentEntries) {
      await ensureBk2Agent(agentId, role);
    }

    for (const [role, agentId] of agentEntries) {
      const agent = await storage.getAgent(agentId);
      const agentName = agent?.name || BK2_AGENT_DEFINITIONS[role].name;
      const depId = await ensureBk2AgentDeployment(agentId, agentName, mcpServerId);
      deploymentIds[role] = depId;
      bk2DeploymentIds.add(depId);
    }

    sendEvent("setup", { message: `All 6 agents configured — starting execution for ${employee} (${empId}), case ${caseId}` });

    for (const [role, agentId] of agentEntries) {
      if (aborted) break;

      const agent = await storage.getAgent(agentId);
      currentAgentName = agent?.name || role;
      const deploymentId = deploymentIds[role];
      const prompt = buildAgentPrompt(role, scenarioSpec);

      sendEvent("agent_start", { agentId, agentName: currentAgentName, role, deploymentId });

      if (await isRuntimeActive(deploymentId)) {
        stopAgentRuntime(deploymentId);
      }

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
    clearInterval(keepaliveTimer);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
    if (!aborted) res.end();
  }
}

demoRouter.get("/blackrock2/live-run", bk2LiveRunHandler);

// GET /demo-api/blackrock2/email-snapshot
// Fallback poll endpoint: returns the last email snapshot written by the
// send_offboarding_summary mock tool. The frontend calls this once after the
// demo completes (or after an SSE error) in case the SSE event was dropped
// by the production reverse-proxy before it could be delivered.
demoRouter.get("/blackrock2/email-snapshot", (_req: Request, res: Response) => {
  const snap = getLastEmailSnapshot();
  if (!snap) return res.status(404).json({ error: "No email snapshot available" });
  res.json(snap);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Moody's Credit Assessment — ensure-agents bootstrap
// POST /demo-api/moodys/ensure-agents
// Safe to call from production before the first live run. Idempotent.
// Creates both MCP servers (internal + external) and all 6 agent deployments
// with the exact deployment IDs that /demo-api/moodys/run expects.
// ═══════════════════════════════════════════════════════════════════════════════

const MOODYS_TOOL_BASE_URL = `http://localhost:${process.env.PORT || 5000}/demo-api/moodys/tools`;

const MOODYS_AGENT_CONFIG = {
  financialDataCollector: {
    agentId:      "a015f037-7d0f-48fd-9145-0779c9da1681",
    deploymentId: "6066aa6a-f1d4-4d05-b7fd-da2be493e4b7",
    name:         "Financial Data Collector & Spreader",
    description:  "Ingests issuer financial statements from EDGAR, IR portals, and Moody's data estate. Spreads into Chart of Accounts with IFRS/US GAAP auto-detection.",
    modelProvider: "openai" as const,
    modelName:     "gpt-4.1",
    mcpServers:    ["internal", "external"] as const,
    department:    "Credit Research",
  },
  earningsAnalyzer: {
    agentId:      "2cee072c-5471-4023-ad86-d92220068b05",
    deploymentId: "f4bea6d9-e5d5-45de-a2b5-7e841ddeea28",
    name:         "Earnings & Management Signal Analyzer",
    description:  "Analyzes earnings call transcripts and investor presentations. Extracts management tone, forward guidance, and sector risk signals.",
    modelProvider: "openai" as const,
    modelName:     "gpt-4.1",
    mcpServers:    ["external"] as const,
    department:    "Credit Research",
  },
  peerComparisonBuilder: {
    agentId:      "0a816eab-dae7-41e3-b882-a6954ad21783",
    deploymentId: "347d49a5-4124-41d1-96cd-06d2016b2d84",
    name:         "Peer Comparison Builder",
    description:  "Identifies 5–10 peers via Moody's sector classifications. Builds comparison matrix across all key credit metrics with rankings and outlier flags.",
    modelProvider: "openai" as const,
    modelName:     "gpt-4.1",
    mcpServers:    ["internal"] as const,
    department:    "Credit Research",
  },
  esgProfileAgent: {
    agentId:      "6efd7a5a-0e2e-4963-9995-d5ed2a585ad6",
    deploymentId: "cf00b760-cf41-4bb9-892e-b5cca3afffaa",
    name:         "ESG & Sustainability Profile Agent",
    description:  "Pulls ESG IPS scores, CIS score, and sustainability data. Flags ESG factors with material credit impact.",
    modelProvider: "openai" as const,
    modelName:     "gpt-4.1",
    mcpServers:    ["internal", "external"] as const,
    department:    "Credit Research",
  },
  newsEventScanner: {
    agentId:      "248f1d69-9dde-472a-8d41-b5c43c16781b",
    deploymentId: "88738a00-7523-43ff-86c6-8e6d9d007bac",
    name:         "News & Event Scanner",
    description:  "Scans news, regulatory filings, legal databases, and market data for credit-relevant events. Classifies by relevance and potential rating impact.",
    modelProvider: "openai" as const,
    modelName:     "gpt-4.1",
    mcpServers:    ["external"] as const,
    department:    "Credit Research",
  },
  scorecardPrePopulation: {
    agentId:      "c497a037-2ab9-438d-925c-f96b6e86af25",
    deploymentId: "baaaeebf-2b3e-490c-8e41-1b5a440cb857",
    name:         "Scorecard Pre-Population Agent",
    description:  "Pre-populates sector-specific rating scorecard using outputs from Agents 1–5. Computes scorecard-indicated rating and gap vs. current rating.",
    modelProvider: "openai" as const,
    modelName:     "gpt-4.1",
    mcpServers:    ["internal"] as const,
    department:    "Credit Research",
  },
} as const;

const MOODYS_MCP_SERVER_DEFS = {
  internal: {
    id:          "448b894d-2a47-47fe-85eb-cbd29eb8acc2",
    name:        "Moody's Internal Data MCP Server",
    description: "Moody's proprietary data estate: financial statements, chart of accounts spreading, credit metrics, ESG scores, peer groups, and rating scorecards.",
    tools: [
      { name: "get_moody_financials",          description: "Standardized financial statements from Moody's data estate (8-quarter history)" },
      { name: "spread_to_chart_of_accounts",   description: "Maps raw financials to Moody's Chart of Accounts with IFRS/US GAAP auto-detection" },
      { name: "compute_credit_metrics",        description: "Sector-specific credit metrics and financial ratios with 8-quarter trend data" },
      { name: "get_esg_ips_scores",            description: "ESG Issuer Profile Scores: Environmental (E-1 to E-5), Social (S-1 to S-5), Governance (G-1 to G-5)" },
      { name: "get_cis_score",                 description: "Credit Impact Score (CIS-1 through CIS-5) with factor-level rationale" },
      { name: "get_peer_group",                description: "Identifies 5–10 comparable peers via Moody's sector/sub-sector classifications" },
      { name: "get_peer_financials",           description: "Comparable financial data and credit metrics for peer issuers" },
      { name: "get_rating_scorecard_template", description: "Sector-specific Moody's rating scorecard template with scoring criteria and weights" },
      { name: "get_current_rating",            description: "Current assigned credit rating, outlook, watch status, and rating history" },
    ],
  },
  external: {
    id:          "b7a35c0b-5074-415d-b103-881955723318",
    name:        "External Research MCP Server",
    description: "External data sources: SEC EDGAR filings, earnings transcripts, investor presentations, news scanning, legal databases, and market data.",
    tools: [
      { name: "get_edgar_filings",          description: "SEC EDGAR 10-K, 10-Q, 8-K, and proxy filings with XBRL parsing" },
      { name: "get_earnings_transcripts",   description: "Quarterly earnings call transcripts from FactSet/LSEG with speaker attribution" },
      { name: "get_investor_presentations", description: "Investor day and capital markets day presentations from IR portals" },
      { name: "scan_credit_news",           description: "Credit-relevant news from Bloomberg, Reuters, and Dow Jones Newswires" },
      { name: "get_legal_database",         description: "Litigation, regulatory actions, and legal proceedings from LexisNexis" },
      { name: "get_market_data",            description: "Credit spreads, CDS pricing, bond yields, and covenant data from ICE/Bloomberg" },
    ],
  },
} as const;

async function ensureMoodysMcpServer(key: "internal" | "external"): Promise<string> {
  const def = MOODYS_MCP_SERVER_DEFS[key];
  const allServers = await storage.getMcpServers();
  let server = allServers.find((s: any) => s.name === def.name);

  if (!server) {
    server = await storage.createMcpServer({
      name: def.name,
      description: def.description,
      url: MOODYS_TOOL_BASE_URL,
      transportType: "streamable-http",
      status: "production-enabled",
      riskTier: "HIGH",
      allowlisted: true,
      industryId: "financial_services",
      addedBy: "moodys-ensure-agents",
      capabilities: { tools: true, resources: false, prompts: false, sampling: false },
      serverInfo: { vendor: "Moody's Ratings", version: "1.0.0", compliance: ["NRSRO", "SEC Reg AC", "MiFID II", "IOSCO"] },
    });
    console.log(`[moodys-ensure-agents] Created MCP server: ${def.name} (${server.id})`);
  } else {
    // Reconcile: patch URL / transport / status if they have drifted from canonical values.
    const needsPatch =
      (server as any).url !== MOODYS_TOOL_BASE_URL ||
      (server as any).transportType !== "streamable-http" ||
      (server as any).status !== "production-enabled";
    if (needsPatch) {
      await db.update(mcpServers)
        .set({ url: MOODYS_TOOL_BASE_URL, transportType: "streamable-http", status: "production-enabled" } as any)
        .where(eq(mcpServers.id, server.id));
      console.log(`[moodys-ensure-agents] Reconciled MCP server config: ${def.name}`);
    }
  }

  // Idempotently create or reconcile every canonical tool.
  const existingTools = await storage.getMcpServerTools(server.id);
  const existingByName = new Map((existingTools || []).map((t: any) => [t.name, t]));
  for (const tool of def.tools) {
    const canonicalAnnotations = { endpoint: `/${tool.name}`, method: "POST", compliance: ["NRSRO", "SEC Reg AC"] };
    const existing = existingByName.get(tool.name);
    if (!existing) {
      await storage.createMcpServerTool({
        serverId: server.id,
        name: tool.name,
        description: tool.description,
        inputSchema: { type: "object", properties: {} },
        annotations: canonicalAnnotations,
        riskClassification: "low",
        owner: "Moody's Credit Research",
        enabled: true,
      });
    } else {
      // Reconcile annotations/enabled if stale.
      const ann = (existing as any).annotations || {};
      if (ann.endpoint !== canonicalAnnotations.endpoint || ann.method !== canonicalAnnotations.method || !(existing as any).enabled) {
        await storage.updateMcpServerTool(existing.id, {
          annotations: canonicalAnnotations,
          enabled: true,
          description: tool.description,
        } as any);
      }
    }
  }

  return server.id;
}

async function ensureMoodysAgent(role: keyof typeof MOODYS_AGENT_CONFIG): Promise<void> {
  const cfg = MOODYS_AGENT_CONFIG[role];
  const existing = await storage.getAgent(cfg.agentId);

  if (existing) {
    // Reconcile: always ensure GPT-4.1 and a valid system prompt.
    const needsPatch =
      (existing as any).modelProvider !== "openai" ||
      (existing as any).modelName !== "gpt-4.1" ||
      !(existing as any).systemPrompt;
    if (needsPatch) {
      await db.update(agents)
        .set({
          modelProvider: "openai",
          modelName: "gpt-4.1",
          systemPrompt: `You are the ${cfg.name} for Moody's Ratings automated credit assessment pipeline.`,
        } as any)
        .where(eq(agents.id, cfg.agentId));
      console.log(`[moodys-ensure-agents] Reconciled agent model: ${cfg.name}`);
    }
    return;
  }

  await db.insert(agents).values({
    id: cfg.agentId,
    name: cfg.name,
    description: cfg.description,
    agentType: "single",
    status: "active",
    environment: "production",
    modelProvider: "openai",
    modelName: "gpt-4.1",
    systemPrompt: `You are the ${cfg.name} for Moody's Ratings automated credit assessment pipeline.`,
    runtimeConfig: { scheduleIntervalMinutes: 0 },
    riskTier: "HIGH",
    autonomyMode: "supervised",
    currentVersion: "1.0.0",
    maxToolIterations: 8,
    toolAccessClass: "standard",
    department: cfg.department,
    owner: "Moody's Credit Research",
    healthScore: 98,
    successRate: 0.99,
    maturityFactors: {},
  } as any).onConflictDoNothing();
}

async function ensureMoodysDeployment(
  role: keyof typeof MOODYS_AGENT_CONFIG,
  mcpServerIds: Record<"internal" | "external", string>,
): Promise<string> {
  const cfg = MOODYS_AGENT_CONFIG[role];

  // Insert with the exact deployment ID the run handler expects — idempotent.
  await db.insert(deployments).values({
    id: cfg.deploymentId,
    agentId: cfg.agentId,
    agentName: cfg.name,
    environment: "production",
    status: "pending",
    version: "1.0.0",
    rolloutStrategy: "canary",
    canaryPercent: 100,
    pipelineComplete: true,
    deployedAt: new Date(),
  } as any).onConflictDoNothing();

  // Downgrade "deployed" → "pending" so auto-resume doesn't pick it up.
  const existing = await storage.getDeployment(cfg.deploymentId);
  if (existing && (existing as any).status === "deployed") {
    await storage.updateDeployment(cfg.deploymentId, { status: "pending" });
  }

  // Link the appropriate MCP servers to this agent.
  const existingLinks = await storage.getAgentMcpServers(cfg.agentId);
  const linkedServerIds = new Set(existingLinks.map((l: any) => l.serverId));
  for (const serverKey of cfg.mcpServers) {
    const serverId = mcpServerIds[serverKey];
    if (!linkedServerIds.has(serverId)) {
      await storage.createAgentMcpServer({ agentId: cfg.agentId, serverId, assignedBy: "moodys-ensure-agents" });
    }
  }

  return cfg.deploymentId;
}

export async function moodysEnsureAgentsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const internalId = await ensureMoodysMcpServer("internal");
    const externalId = await ensureMoodysMcpServer("external");
    const mcpServerIds = { internal: internalId, external: externalId };

    const results: Record<string, { agentId: string; deploymentId: string; agentName: string }> = {};
    for (const role of Object.keys(MOODYS_AGENT_CONFIG) as (keyof typeof MOODYS_AGENT_CONFIG)[]) {
      await ensureMoodysAgent(role);
      const deploymentId = await ensureMoodysDeployment(role, mcpServerIds);
      results[role] = {
        agentId: MOODYS_AGENT_CONFIG[role].agentId,
        deploymentId,
        agentName: MOODYS_AGENT_CONFIG[role].name,
      };
    }

    res.json({
      success: true,
      mcpServers: { internal: internalId, external: externalId },
      agentsConfigured: Object.keys(results).length,
      agents: results,
      message: "All 6 Moody's Credit Assessment agents and both MCP servers are ready in this environment.",
    });
  } catch (err: any) {
    console.error("[moodys-ensure-agents] Error:", err?.message);
    res.status(500).json({ success: false, error: err?.message || "Setup failed" });
  }
}

demoRouter.post("/moodys/ensure-agents", moodysEnsureAgentsHandler);

