import { Router, type Request, type Response } from "express";
import { getBk2LiveScenario, getBk2ScenarioSpec, type Bk2ScenarioSpec, type Bk2LiveScenario } from "../blackrock2-live-store";

const router = Router();

function uuid4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function confirmId(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

function resolveScenario(body: any): Bk2ScenarioSpec | null {
  const s = getBk2LiveScenario();
  if (s) return s;
  if (body.employeeId || body.empId) {
    const empId = body.employeeId || body.empId;
    const BY_EMP: Record<string, Bk2LiveScenario> = {
      "EMP-29471": "happy_path",
      "EMP-19823": "portal_unreachable",
      "EMP-34102": "pending_trades",
      "EMP-41087": "admin_access",
    };
    const sid = BY_EMP[empId];
    if (sid) return getBk2ScenarioSpec(sid);
  }
  return getBk2ScenarioSpec("happy_path");
}

// ─── Tool: validate_termination ──────────────────────────────────────────────
router.post("/validate-termination", (req: Request, res: Response) => {
  const s = resolveScenario(req.body);
  if (!s) return res.status(404).json({ error: "No active scenario" });

  const now = new Date().toISOString();
  res.json({
    valid: true,
    employee: {
      id: s.empId,
      name: s.employee,
      role: s.role,
      department: s.criticalTier ? "Technology & Operations" : "Investment Management",
      managerEmail: "j.chen@blackrock.com",
      terminationType: "voluntary_resignation",
      lastWorkingDay: new Date(Date.now() - 86400000).toISOString().split("T")[0],
      systemsAccess: s.portals.length,
    },
    workdayConfirmation: {
      employmentStatus: "TERMINATED",
      terminationDate: new Date(Date.now() - 86400000).toISOString(),
      hrisRef: `WD-${Date.now().toString().slice(-8)}`,
    },
    sailpointEvent: {
      eventId: `SP-EVT-${uuid4().slice(0, 8).toUpperCase()}`,
      eventType: "USER_TERMINATION",
      receivedAt: now,
      priority: s.criticalTier ? "CRITICAL" : "STANDARD",
    },
    caseId: s.caseId,
    portalCount: s.portals.length,
    requiresTradeCheck: s.tradeCheck,
    requiresCriticalApproval: s.criticalTier,
    validatedAt: now,
  });
});

// ─── Tool: scan_portal_accounts ──────────────────────────────────────────────
router.post(["/scan-portal-accounts", "/scan-accounts", "/scan_portal_accounts", "/scan_accounts"], (req: Request, res: Response) => {
  const s = resolveScenario(req.body);
  if (!s) return res.status(404).json({ error: "No active scenario" });

  const accounts = s.portals.map((p) => ({
    portalName: p.name,
    accountId: p.accountId,
    role: p.role,
    authType: p.authType,
    status: "active",
    lastLogin: new Date(Date.now() - Math.floor(Math.random() * 7) * 86400000).toISOString(),
    permissions: p.role.includes("Admin") ? ["read", "write", "admin", "configure"] : ["read", "write"],
    sailpointEntitlementId: `SP-ENT-${p.accountId.replace(/[^A-Z0-9]/g, "").slice(0, 8)}`,
    adGroup: `BLK-${p.name.replace(/\s+/g, "-").toUpperCase()}-USERS`,
  }));

  res.json({
    employeeId: s.empId,
    totalAccounts: accounts.length,
    accounts,
    scanTimestamp: new Date().toISOString(),
    sailpointSyncStatus: "IN_SYNC",
    adSyncStatus: "IN_SYNC",
  });
});

// ─── Tool: check_portal_health ───────────────────────────────────────────────
router.post(["/check-portal-health", "/check-health", "/check_portal_health"], (req: Request, res: Response) => {
  const s = resolveScenario(req.body);
  const portalName: string = req.body.portalName || "";

  if (!s) return res.status(404).json({ error: "No active scenario" });

  const matchedPortal = s.portals.find((p) => p.name.toLowerCase() === portalName.toLowerCase());
  const isHkex = portalName.toLowerCase().includes("hkex") || portalName.toLowerCase().includes("ccass");
  const unreachable = s.hkexDown && (isHkex || (matchedPortal && !matchedPortal.reachable));

  if (unreachable) {
    return res.json({
      portalName,
      reachable: false,
      operational: false,
      responseTimeMs: null,
      lastChecked: new Date().toISOString(),
      errorCode: "ECONNREFUSED",
      errorMessage: "Connection refused — HKEX CCASS admin endpoint unreachable (maintenance window 02:00–06:00 HKT)",
      incidents: ["INC-2026-HKEX-0041: CCASS API maintenance — estimated resolution 06:00 HKT"],
      recommendation: "Defer removal to retry queue with 4-hour interval. ServiceNow incident auto-created.",
    });
  }

  res.json({
    portalName,
    reachable: true,
    operational: true,
    responseTimeMs: Math.floor(Math.random() * 120) + 80,
    lastChecked: new Date().toISOString(),
    incidents: [],
    authEndpointStatus: "200 OK",
    adminApiStatus: "200 OK",
  });
});

// ─── Tool: check_pending_settlements ─────────────────────────────────────────
router.post(["/check-pending-settlements", "/check-settlements", "/check_pending_settlements"], (req: Request, res: Response) => {
  const s = resolveScenario(req.body);
  const portalName: string = req.body.portalName || "";

  if (!s) return res.status(404).json({ error: "No active scenario" });

  const matchedPortal = s.portals.find((p) => p.name.toLowerCase().includes(portalName.toLowerCase()));
  const hasTrades = s.tradeCheck && matchedPortal?.hasPendingTrades;

  if (hasTrades && portalName.toLowerCase().includes("euroclear")) {
    return res.json({
      portalName,
      employeeId: s.empId,
      hasPendingSettlements: true,
      pendingCount: 3,
      totalNotionalUsd: 847000000,
      currency: "EUR",
      trades: [
        { tradeId: "EU-REPO-847221", type: "REPO", counterparty: "JPMorgan Chase", notional: 350000000, settlementDate: new Date(Date.now() + 86400000).toISOString().split("T")[0], status: "PENDING_T1" },
        { tradeId: "EU-REPO-847389", type: "REPO", counterparty: "Goldman Sachs", notional: 275000000, settlementDate: new Date(Date.now() + 86400000).toISOString().split("T")[0], status: "PENDING_T1" },
        { tradeId: "EU-REPO-847401", type: "REPO", counterparty: "Deutsche Bank", notional: 222000000, settlementDate: new Date(Date.now() + 172800000).toISOString().split("T")[0], status: "PENDING_T2" },
      ],
      riskAssessment: {
        riskLevel: "HIGH",
        prematureRemovalImpact: "Settlement failure for EUR 847M notional — regulatory breach risk",
        recommendedAction: "HOLD — defer access removal until T+1/T+2 settlement completes",
        thresholdExceeded: true,
        thresholdUsd: 50000000,
        requiresHumanApproval: true,
      },
    });
  }

  if (hasTrades && (portalName.toLowerCase().includes("dtcc") || portalName.toLowerCase().includes("ficc"))) {
    return res.json({
      portalName,
      employeeId: s.empId,
      hasPendingSettlements: true,
      pendingCount: 2,
      totalNotionalUsd: 340000000,
      currency: "USD",
      trades: [
        { tradeId: "DTC-GCF-991022", type: "GCF_REPO", counterparty: "Morgan Stanley", notional: 195000000, settlementDate: new Date(Date.now() + 86400000).toISOString().split("T")[0], status: "PENDING_T1" },
        { tradeId: "DTC-GCF-991087", type: "GCF_REPO", counterparty: "Bank of America", notional: 145000000, settlementDate: new Date(Date.now() + 86400000).toISOString().split("T")[0], status: "PENDING_T1" },
      ],
      riskAssessment: {
        riskLevel: "HIGH",
        prematureRemovalImpact: "DTCC GCF Repo settlement failure — FINRA 4210 breach risk",
        recommendedAction: "HOLD — defer access removal until GCF Repo settlement clears",
        thresholdExceeded: true,
        thresholdUsd: 50000000,
        requiresHumanApproval: true,
      },
    });
  }

  res.json({
    portalName,
    employeeId: s.empId,
    hasPendingSettlements: false,
    pendingCount: 0,
    totalNotionalUsd: 0,
    trades: [],
    riskAssessment: {
      riskLevel: "NONE",
      prematureRemovalImpact: "None — no pending settlements",
      recommendedAction: "CLEAR — proceed with access removal",
      thresholdExceeded: false,
      requiresHumanApproval: false,
    },
  });
});

// ─── Tool: execute_access_removal ────────────────────────────────────────────
router.post(["/execute-access-removal", "/execute-removal", "/execute_access_removal"], (req: Request, res: Response) => {
  const s = resolveScenario(req.body);
  const portalName: string = req.body.portalName || "";
  const authType: string = req.body.authType || "SAML";
  const caseId: string = req.body.caseId || s?.caseId || "AIM-UNKNOWN";

  if (!s) return res.status(404).json({ error: "No active scenario" });

  const portalNameLower = portalName.toLowerCase();
  const isHkex = portalNameLower.includes("hkex") || portalNameLower.includes("ccass");
  const matchedPortal = s.portals.find((p) => p.name.toLowerCase() === portalNameLower);

  // Block: portal unreachable (HKEX CCASS in portal_unreachable scenario)
  if (s.hkexDown && (isHkex || (matchedPortal && !matchedPortal.reachable))) {
    return res.json({
      success: false,
      portalName,
      employeeId: s.empId,
      errorCode: "ECONNREFUSED",
      errorMessage: "HKEX CCASS unreachable — removal deferred to retry queue",
      blocked: true,
      deferred: true,
      deferredQueueId: `DQ-${confirmId("HKEX")}`,
      retryAfterMinutes: 240,
      servicenowTicket: `INC-2026-${Math.floor(Math.random() * 90000 + 10000)}`,
    });
  }

  // Block: pending trade settlements (pending_trades scenario)
  if (s.tradeCheck && matchedPortal?.hasPendingTrades) {
    const settlementDate = new Date(Date.now() + 172800000).toISOString().split("T")[0];
    return res.json({
      success: false,
      portalName,
      employeeId: s.empId,
      errorCode: "PENDING_SETTLEMENTS_BLOCK",
      errorMessage: `Access removal BLOCKED — ${portalName} has unsettled trades above the $50M threshold. Premature removal would cause settlement failure and regulatory breach.`,
      blocked: true,
      deferred: true,
      pendingSettlements: true,
      earliestRemovalDate: settlementDate,
      recommendation: `HOLD — defer access removal until T+2 settlement completes on ${settlementDate}. Human approval required to override.`,
      requiresHumanApproval: true,
      deferredQueueId: `DQ-SETTLE-${confirmId(portalName.slice(0, 4).toUpperCase())}`,
    });
  }

  // Block: CRITICAL tier SWIFT admin — requires explicit manager approval code
  const isSwiftAdmin = portalNameLower.includes("swift") && s.criticalTier;
  if (isSwiftAdmin && !req.body.managerApprovalCode) {
    return res.json({
      success: false,
      portalName,
      employeeId: s.empId,
      errorCode: "CRITICAL_TIER_APPROVAL_REQUIRED",
      errorMessage: "SWIFT Alliance admin access is CRITICAL tier. SOX SM-14 policy mandates explicit manager approval before admin credential revocation. Provide managerApprovalCode to proceed.",
      blocked: true,
      requiresApproval: true,
      approvalType: "MANAGER_SOX_CRITICAL",
      policy: "SM-14: Critical System Administrator Access Revocation",
      approvalWorkflow: `APPR-${caseId}-SWIFT-ADMIN`,
    });
  }

  const adapters: Record<string, string> = {
    SAML: "SamlSsoAdapter",
    PKI_CERT: "PkiCertAdapter",
    SWIFT_TOKEN: "SwiftTokenAdapter",
    API_KEY: "ApiKeyAdapter",
  };

  const steps = isSwiftAdmin
    ? ["admin_role_revoked", "bic_credential_invalidated", "hsm_key_deactivated", "swift_session_terminated"]
    : ["account_deactivated", "session_terminated", "entitlement_removed"];

  res.json({
    success: true,
    portalName,
    employeeId: s.empId,
    accountId: matchedPortal?.accountId || req.body.accountId,
    adapter: adapters[authType] || "SamlSsoAdapter",
    stepsCompleted: steps,
    confirmationId: confirmId(portalName.replace(/\s+/g, "").slice(0, 6).toUpperCase()),
    sailpointEntitlementCleared: true,
    adAccountDisabled: true,
    auditEventId: `AUD-${confirmId("SOX")}`,
    caseId,
    removedAt: new Date().toISOString(),
    ...(isSwiftAdmin && {
      swiftAdminDetails: {
        adminRoleRevoked: true,
        bicCredentialInvalidated: true,
        hsmKeyDeactivated: true,
        hsmKeySerial: `HSM-${Math.floor(Math.random() * 99999 + 10000)}`,
        revocationCert: `REV-CERT-${uuid4().slice(0, 12).toUpperCase()}`,
      },
    }),
  });
});

// ─── Tool: verify_access_removed ─────────────────────────────────────────────
router.post(["/verify-access-removed", "/verify-removal", "/verify_access_removed"], (req: Request, res: Response) => {
  const s = resolveScenario(req.body);
  const portalName: string = req.body.portalName || "";

  if (!s) return res.status(404).json({ error: "No active scenario" });

  const portalNameLower = portalName.toLowerCase();
  const isHkex = portalNameLower.includes("hkex") || portalNameLower.includes("ccass");
  const matchedPortal = s.portals.find((p) => p.name.toLowerCase() === portalNameLower);

  // Portal was unreachable — still deferred
  if (s.hkexDown && (isHkex || (matchedPortal && !matchedPortal.reachable))) {
    return res.json({
      portalName,
      employeeId: s.empId,
      status: "deferred",
      verifiedAt: null,
      confirmationId: null,
      message: "HKEX CCASS still unreachable — removal and verification deferred to retry queue",
      retryQueueId: `DQ-VERIFY-${confirmId("HKEX")}`,
    });
  }

  // Portal had pending trades — was never removed, access still present
  if (s.tradeCheck && matchedPortal?.hasPendingTrades) {
    return res.json({
      portalName,
      employeeId: s.empId,
      status: "deferred",
      verifiedAt: null,
      confirmationId: null,
      accessStillPresent: true,
      message: `Access NOT removed — ${portalName} was deferred due to pending trade settlements. Account remains active until settlement completes.`,
      earliestRemovalDate: new Date(Date.now() + 172800000).toISOString().split("T")[0],
      openExceptionId: `EXC-SETTLE-${confirmId(portalName.slice(0, 4).toUpperCase())}`,
    });
  }

  // CRITICAL tier SWIFT admin — was blocked without approval code, access still present
  const isSwiftAdmin = portalNameLower.includes("swift") && s.criticalTier;
  if (isSwiftAdmin) {
    return res.json({
      portalName,
      employeeId: s.empId,
      status: "pending_approval",
      verifiedAt: null,
      confirmationId: null,
      accessStillPresent: true,
      message: "SWIFT Alliance admin access NOT removed — awaiting manager approval (SOX SM-14 policy). Approval workflow open.",
      approvalWorkflow: `APPR-${s.caseId}-SWIFT-ADMIN`,
      openExceptionId: `EXC-CRIT-${confirmId("SWIFT")}`,
    });
  }

  const authRejectionMessages: Record<string, string> = {
    DTCC: "SAML assertion rejected — account disabled in IDP",
    "Bloomberg TOMS": "Bloomberg authentication failed — account suspended",
    "ICE Trade Vault": "API key invalid — 403 Forbidden",
    MarkitServ: "SAML SSO token invalid — account deprovisioned",
    Euroclear: "Client certificate rejected — revoked in CRL",
    Clearstream: "Client certificate rejected — OCSP status: revoked",
    "DTCC FICC": "SAML assertion rejected — account disabled",
    "SWIFT Alliance": "SWIFT operator certificate invalid — HSM key deactivated",
  };

  const rejection = authRejectionMessages[portalName] || "Authentication rejected — account disabled";

  res.json({
    portalName,
    employeeId: s.empId,
    status: "removed",
    verifiedAt: new Date().toISOString(),
    confirmationId: confirmId(portalName.replace(/\s+/g, "").slice(0, 6).toUpperCase()),
    authProbeResult: rejection,
    sailpointEntitlementStatus: "CLEARED",
    adAccountStatus: "DISABLED",
    message: `Confirmed — ${rejection}`,
  });
});

// ─── Tool: generate_evidence_package ─────────────────────────────────────────
router.post(["/generate-evidence-package", "/generate-evidence", "/generate_evidence_package"], (req: Request, res: Response) => {
  const s = resolveScenario(req.body);
  const caseId: string = req.body.caseId || s?.caseId || "AIM-UNKNOWN";
  const portalsRemoved: number = req.body.portalsRemoved || s?.portals.filter((p) => p.reachable).length || 0;

  if (!s) return res.status(404).json({ error: "No active scenario" });

  const packageId = `${caseId.replace("AIM", "AIM-EVP")}-${Date.now().toString(36).toUpperCase()}`;
  const retentionYears = s.criticalTier ? 10 : 7;

  const deferredPortals = s.portals.filter((p) => !p.reachable || p.hasPendingTrades);
  const swiftAdminBlocked = s.criticalTier && s.portals.some(p => p.name.toLowerCase().includes("swift"));
  const hasOpenExceptions = deferredPortals.length > 0 || swiftAdminBlocked;
  const closureCode = hasOpenExceptions ? "COMPLETED_WITH_EXCEPTIONS" : "COMPLETED_SUCCESSFULLY";

  const openExceptions = [
    ...deferredPortals.map(p => ({
      portal: p.name,
      reason: p.hasPendingTrades ? "PENDING_SETTLEMENTS — deferred until T+2 settlement" : "PORTAL_UNREACHABLE — deferred to retry queue",
      exceptionId: `EXC-${confirmId(p.name.slice(0, 4).toUpperCase())}`,
      requiresFollowUp: true,
    })),
    ...(swiftAdminBlocked ? [{
      portal: "SWIFT Alliance",
      reason: "CRITICAL_TIER_APPROVAL_REQUIRED — awaiting SOX SM-14 manager approval",
      exceptionId: `EXC-CRIT-${confirmId("SWIFT")}`,
      requiresFollowUp: true,
    }] : []),
  ];

  res.json({
    success: true,
    packageId,
    caseId,
    employeeId: s.empId,
    completionStatus: closureCode,
    artifacts: [
      ...s.portals.filter((p) => p.reachable && !p.hasPendingTrades).map((p) => ({
        type: "removal_receipt",
        portal: p.name,
        artifactId: `ART-${confirmId(p.name.slice(0, 4).toUpperCase())}`,
        hash: `sha256:${Buffer.from(p.accountId + Date.now()).toString("base64").slice(0, 43)}=`,
      })),
      { type: "sailpoint_entitlement_diff", artifactId: `ART-SP-DIFF-${Date.now().toString(36).toUpperCase()}`, itemsCleared: portalsRemoved },
      { type: "ad_audit_log", artifactId: `ART-AD-${Date.now().toString(36).toUpperCase()}`, accountsDisabled: portalsRemoved },
      { type: "chain_of_custody_manifest", artifactId: `ART-COC-${Date.now().toString(36).toUpperCase()}` },
    ],
    openExceptions,
    compliance: {
      soxSection404: true,
      retentionYears,
      retentionPolicy: s.criticalTier ? "CRITICAL_TIER_IMMUTABLE" : "STANDARD_SOX",
      grcVaultArchived: true,
      grcArchiveId: `GRC-${confirmId("VAULT")}`,
      splunkRuleCreated: true,
      splunkRuleId: `SPL-RULE-${s.empId}-${Date.now().toString(36).toUpperCase()}`,
      exceptionsDocumented: openExceptions.length,
    },
    servicenow: {
      caseId,
      status: hasOpenExceptions ? "OPEN_EXCEPTIONS" : "CLOSED",
      closureCode,
      closedAt: new Date().toISOString(),
      followUpRequired: hasOpenExceptions,
    },
    ...(s.criticalTier && {
      internalAuditNotification: {
        sent: true,
        recipient: "internal-audit@blackrock.com",
        subject: `CRITICAL: Access Removal Evidence — ${s.employee} (${s.empId}) — ${caseId}`,
      },
    }),
    generatedAt: new Date().toISOString(),
    portalsRemoved,
    portalsDeferred: openExceptions.length,
    totalArtifacts: portalsRemoved + 3,
  });
});

export default router;
