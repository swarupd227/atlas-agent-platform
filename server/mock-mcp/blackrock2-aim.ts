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
      "EMP-28834": "employee_transfer",
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

  // ICE Trade Vault — FI repo positions held during employee transfer
  if (hasTrades && (portalName.toLowerCase().includes("ice") || portalName.toLowerCase().includes("trade vault"))) {
    return res.json({
      portalName,
      employeeId: s.empId,
      hasPendingSettlements: true,
      pendingCount: 2,
      totalNotionalUsd: 285000000,
      currency: "USD",
      trades: [
        { tradeId: "ICE-FI-REP-2281", type: "REPO", counterparty: "Barclays Capital", notional: 165000000, settlementDate: new Date(Date.now() + 172800000).toISOString().split("T")[0], status: "PENDING_T2" },
        { tradeId: "ICE-FI-REP-2347", type: "REPO", counterparty: "UBS Securities", notional: 120000000, settlementDate: new Date(Date.now() + 86400000).toISOString().split("T")[0], status: "PENDING_T1" },
      ],
      riskAssessment: {
        riskLevel: "HIGH",
        prematureRemovalImpact: "FI Repo position reporting failure — CFTC Part 45 breach risk. Positions must be reassigned to backup reporter before access change.",
        recommendedAction: "HOLD — defer ICE Trade Vault access removal. Coordinate with Fixed Income Desk to hand over open positions to designated backup reporter.",
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

  // Block: CRITICAL tier SWIFT admin — ALWAYS blocked regardless of any agent-provided approval code.
  // Manager approval must arrive via out-of-band ServiceNow workflow (human-in-the-loop only).
  const isSwiftAdmin = portalNameLower.includes("swift") && s.criticalTier;
  if (isSwiftAdmin) {
    return res.json({
      success: false,
      portalName,
      employeeId: s.empId,
      errorCode: "CRITICAL_TIER_APPROVAL_REQUIRED",
      errorMessage: "SWIFT Alliance admin access is CRITICAL tier. SOX SM-14 policy mandates explicit manager approval via ServiceNow workflow before admin credential revocation. Agent cannot self-approve — human action required.",
      blocked: true,
      requiresApproval: true,
      approvalType: "MANAGER_SOX_CRITICAL",
      policy: "SM-14: Critical System Administrator Access Revocation",
      approvalWorkflow: `APPR-${caseId}-SWIFT-ADMIN`,
      agentProvidedCodeIgnored: !!req.body.managerApprovalCode,
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

// ─── Tool: validate_transfer ─────────────────────────────────────────────────
router.post(["/validate-transfer", "/validate_transfer"], (req: Request, res: Response) => {
  const s = resolveScenario(req.body);
  if (!s) return res.status(400).json({ error: "No active scenario" });

  if (!s.isTransfer) {
    return res.status(400).json({
      success: false,
      error: "Employee is not undergoing a transfer — use validate_termination for offboarding",
    });
  }

  const [oldRole, newRole] = s.role.split("→").map((r) => r.trim());

  return res.json({
    success: true,
    employeeId: s.empId,
    employee: s.employee,
    caseId: s.caseId,
    caseType: "EMPLOYEE_TRANSFER",
    workdayValidation: {
      status: "CONFIRMED",
      effectiveDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
      previousTitle: oldRole,
      newTitle: newRole || s.newRole,
      previousDepartment: "Fixed Income Trading",
      newDepartment: s.newDepartment || "Equities Trading",
      previousCostCenter: "FI-BLK-07",
      newCostCenter: "EQ-BLK-12",
      managerApproved: true,
      hrApproved: true,
    },
    sailpointValidation: {
      status: "CONFIRMED",
      currentEntitlements: s.portals.map((p) => ({ portal: p.name, accountId: p.accountId, role: p.role })),
      requestedEntitlements: (s.newPortals || []).map((p) => ({ portal: p.name, accountId: p.accountId, role: p.role })),
      entitlementConflicts: [],
    },
    portalsToRevoke: s.portals.map((p) => p.name),
    portalsToProvision: (s.newPortals || []).map((p) => p.name),
    handoverRequirements: [
      { portal: "ICE Trade Vault", requirement: "Assign open FI repo positions to backup reporter before access removal", priority: "HIGH", deadline: new Date(Date.now() + 172800000).toISOString().split("T")[0] },
    ],
    complianceNotes: ["MiFID II Article 26 — transfer audit trail required", "SOX IA-07 — dual-role access prohibited during transition"],
    caseConfirmationId: confirmId("TR"),
    validatedAt: new Date().toISOString(),
  });
});

// ─── Tool: provision_access ───────────────────────────────────────────────────
router.post(["/provision-access", "/provision_access"], (req: Request, res: Response) => {
  const s = resolveScenario(req.body);
  if (!s) return res.status(400).json({ error: "No active scenario" });

  const portalName: string = req.body.portalName || req.body.portal || "";
  const newRole: string = req.body.newRole || req.body.role || "";
  const caseId: string = req.body.caseId || s.caseId;

  const matchedPortal = (s.newPortals || []).find(
    (p) => p.name.toLowerCase() === portalName.toLowerCase() || portalName.toLowerCase().includes(p.name.toLowerCase().split(" ")[0])
  );

  if (!matchedPortal && !portalName) {
    return res.status(400).json({ success: false, error: "portalName is required" });
  }

  const portal = matchedPortal || { name: portalName, accountId: `ACC-${confirmId(portalName.slice(0, 4).toUpperCase())}`, role: newRole, authType: "SAML" };

  const authSetupMessages: Record<string, string> = {
    "Bloomberg AIM": "API key generated and injected into Bloomberg terminal profile SC-7734",
    "Fidessa OMS": "SAML assertion configured in IDP — user added to EQ-TRADERS group",
    "DTCC Equities": "SAML assertion configured — Equities Participant entitlement granted in DTCC Member Portal",
    "Morningstar Direct": "SAML SSO configured — Research Analyst seat activated",
  };

  const adGroups: Record<string, string[]> = {
    "Bloomberg AIM": ["EQ-BLOOMBERG-USERS", "AIM-BLOTTER-WRITERS", "BLK-EQUITIES-TRADERS"],
    "Fidessa OMS": ["EQ-FIDESSA-USERS", "EQ-ORDER-MANAGERS", "BLK-EQUITIES-TRADERS"],
    "DTCC Equities": ["EQ-DTCC-PARTICIPANTS", "EQ-SETTLEMENT-USERS", "BLK-EQUITIES-TRADERS"],
    "Morningstar Direct": ["EQ-MORNINGSTAR-USERS", "EQ-RESEARCH-ANALYSTS", "BLK-EQUITIES-TRADERS"],
  };

  const confirmationId = confirmId(portalName.replace(/\s+/g, "").slice(0, 6).toUpperCase());

  res.json({
    success: true,
    portalName: portal.name,
    employeeId: s.empId,
    employee: s.employee,
    caseId,
    status: "provisioned",
    newAccountId: portal.accountId,
    newRole: portal.role || newRole,
    authType: portal.authType,
    authSetup: authSetupMessages[portal.name] || `${portal.authType} authentication configured for ${portal.name}`,
    activeDirectoryGroups: adGroups[portal.name] || [`EQ-${portal.name.toUpperCase().replace(/\s+/g, "-")}-USERS`, "BLK-EQUITIES-TRADERS"],
    sailpointEntitlementStatus: "GRANTED",
    provisionedAt: new Date().toISOString(),
    confirmationId,
    message: `✓ Access provisioned — ${portal.name} (${portal.role || newRole}) — ${s.employee} is now active in the Equities Trading desk.`,
  });
});

// ─── Tool: send_offboarding_summary ──────────────────────────────────────────
router.post(["/send-offboarding-summary", "/send_offboarding_summary"], async (req: Request, res: Response) => {
  const s = resolveScenario(req.body);
  if (!s) return res.status(404).json({ error: "No active scenario" });

  const caseId: string = req.body.caseId || s.caseId;
  const employeeId: string = req.body.employeeId || s.empId;
  const evidencePackageId: string = req.body.evidencePackageId || `AIM-EVP-${caseId}-${Date.now().toString(36).toUpperCase()}`;
  const portalsRemoved: number = req.body.portalsRemoved ?? s.portals.filter((p) => p.reachable && !p.hasPendingTrades).length;
  const openExceptions: any[] = req.body.openExceptions ?? [];
  const recipientEmail: string = req.body.recipientEmail || "j.chen@blackrock.com";

  const managerEmail = recipientEmail;
  const complianceEmail = "sox-compliance@blackrock.com";
  const iamEmail = "iam-team@blackrock.com";

  const hasExceptions = openExceptions.length > 0 || s.portals.some((p) => !p.reachable || p.hasPendingTrades);
  const totalPortals = s.portals.length;
  const deferredPortals = s.portals.filter((p) => !p.reachable || p.hasPendingTrades);
  const status = hasExceptions ? "COMPLETED WITH EXCEPTIONS" : "COMPLETED SUCCESSFULLY";
  const grcArchiveId: string = req.body.grcArchiveId || `GRC-${confirmId("VAULT")}`;
  const messageId = `aim-${caseId.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now().toString(36)}@blackrock.com`;
  const sentAt = new Date().toISOString();

  const exceptionLines = [
    ...deferredPortals.map(p =>
      `  • ${p.name}: ${p.hasPendingTrades ? "DEFERRED — pending trade settlements (T+2)" : "DEFERRED — portal unreachable during maintenance window"}`
    ),
    ...openExceptions
      .filter((e: any) => !deferredPortals.some(p => p.name === e.portal))
      .map((e: any) => `  • ${e.portal}: ${e.reason}`),
  ];

  const subjectLine = `[AIM] ${status} — ${s.employee} (${employeeId}) — Case ${caseId}`;

  const textBody = [
    `BlackRock AIM Portal Offboarding — Completion Summary`,
    `${"=".repeat(55)}`,
    ``,
    `Case ID       : ${caseId}`,
    `Employee      : ${s.employee} (${employeeId})`,
    `Role          : ${s.role}`,
    `Case Status   : ${status}`,
    `Completed At  : ${sentAt}`,
    ``,
    `Portals Summary`,
    `─────────────────────────────────────`,
    `Total portals in scope : ${totalPortals}`,
    `Access removed         : ${portalsRemoved}`,
    `Deferred / exceptions  : ${deferredPortals.length + openExceptions.filter((e: any) => !deferredPortals.some(p => p.name === e.portal)).length}`,
    ``,
    ...(exceptionLines.length > 0 ? [
      `Open Exceptions (require follow-up):`,
      ...exceptionLines,
      ``,
    ] : []),
    `Compliance & Evidence`,
    `─────────────────────────────────────`,
    `Evidence Package ID  : ${evidencePackageId}`,
    `GRC Vault Archive    : ${grcArchiveId}`,
    `SOX Section 404      : Satisfied`,
    `Splunk Rule          : Created`,
    `Retention Policy     : ${s.criticalTier ? "CRITICAL_TIER_IMMUTABLE (10 years)" : "STANDARD_SOX (7 years)"}`,
    ``,
    `This notification was generated automatically by the BlackRock ATLAS Agent Orchestration`,
    `Platform. The evidence package is immutable and timestamped in the GRC vault.`,
    ``,
    `─────────────────────────────────────`,
    `BlackRock AIM | Identity & Access Management`,
    `iam-team@blackrock.com | Ref: ${messageId}`,
  ].join("\n");

  const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; background: #f7f7f7; }
  .wrapper { max-width: 620px; margin: 24px auto; background: #fff; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
  .header { background: #1a1a2e; color: #fff; padding: 20px 28px; }
  .header h2 { margin: 0; font-size: 16px; font-weight: 600; }
  .header p { margin: 4px 0 0; font-size: 12px; opacity: 0.7; }
  .body { padding: 24px 28px; }
  .status { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-bottom: 18px; background: ${hasExceptions ? "#fff3cd" : "#d4edda"}; color: ${hasExceptions ? "#856404" : "#155724"}; border: 1px solid ${hasExceptions ? "#ffc107" : "#28a745"}; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
  td:first-child { color: #666; width: 46%; }
  .section-title { font-size: 12px; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 0.05em; margin: 22px 0 8px; }
  .exception { background: #fff8e1; border-left: 3px solid #f59e0b; padding: 8px 12px; margin: 4px 0; border-radius: 0 4px 4px 0; font-size: 12px; }
  .footer { background: #f7f7f7; padding: 14px 28px; border-top: 1px solid #eee; font-size: 11px; color: #888; }
</style></head>
<body>
<div class="wrapper">
  <div class="header">
    <h2>AIM Portal Offboarding — Completion Summary</h2>
    <p>BlackRock ATLAS Agent Orchestration Platform</p>
  </div>
  <div class="body">
    <div class="status">${status}</div>
    <div class="section-title">Case Details</div>
    <table>
      <tr><td>Case ID</td><td><strong>${caseId}</strong></td></tr>
      <tr><td>Employee</td><td><strong>${s.employee}</strong> (${employeeId})</td></tr>
      <tr><td>Role</td><td>${s.role}</td></tr>
      <tr><td>Completed At</td><td>${sentAt}</td></tr>
    </table>
    <div class="section-title">Portal Summary</div>
    <table>
      <tr><td>Total portals in scope</td><td>${totalPortals}</td></tr>
      <tr><td>Access removed</td><td><strong style="color:#155724">${portalsRemoved}</strong></td></tr>
      <tr><td>Deferred / exceptions</td><td><strong style="color:${exceptionLines.length > 0 ? "#856404" : "#155724"}">${exceptionLines.length}</strong></td></tr>
    </table>
    ${exceptionLines.length > 0 ? `
    <div class="section-title">Open Exceptions — Follow-up Required</div>
    ${deferredPortals.map(p => `<div class="exception"><strong>${p.name}:</strong> ${p.hasPendingTrades ? "DEFERRED — pending trade settlements (T+2)" : "DEFERRED — portal unreachable during maintenance window"}</div>`).join("")}
    ${openExceptions.filter((e: any) => !deferredPortals.some(p => p.name === e.portal)).map((e: any) => `<div class="exception"><strong>${e.portal}:</strong> ${e.reason}</div>`).join("")}
    ` : ""}
    <div class="section-title">Compliance &amp; Evidence</div>
    <table>
      <tr><td>Evidence Package ID</td><td><code style="font-size:11px">${evidencePackageId}</code></td></tr>
      <tr><td>GRC Vault Archive</td><td><code style="font-size:11px">${grcArchiveId}</code></td></tr>
      <tr><td>SOX Section 404</td><td>✓ Satisfied</td></tr>
      <tr><td>Retention Policy</td><td>${s.criticalTier ? "CRITICAL_TIER_IMMUTABLE (10 years)" : "STANDARD_SOX (7 years)"}</td></tr>
    </table>
    <p style="font-size:12px;color:#888;margin-top:18px">This notification was generated automatically by the ATLAS Agent Orchestration Platform. The evidence package is immutable and timestamped in the GRC vault.</p>
  </div>
  <div class="footer">BlackRock AIM | Identity &amp; Access Management &nbsp;·&nbsp; iam-team@blackrock.com &nbsp;·&nbsp; Ref: ${messageId}</div>
</div>
</body></html>`;

  const resendApiKey = process.env.RESEND_API_KEY;
  let delivered = false;
  let deliveryMethod = "mock";
  let providerMessageId: string | null = null;

  if (resendApiKey) {
    try {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "ATLAS AIM <aim-noreply@blackrock.com>",
          to: [managerEmail, complianceEmail, iamEmail],
          subject: subjectLine,
          text: textBody,
          html: htmlBody,
        }),
      });
      if (resendRes.ok) {
        const data: any = await resendRes.json();
        providerMessageId = data?.id ?? null;
        delivered = true;
        deliveryMethod = "resend";
      } else {
        console.warn(`[AIM/send-offboarding-summary] Resend failed ${resendRes.status} — falling back to mock confirmation`);
      }
    } catch (err: any) {
      console.warn(`[AIM/send-offboarding-summary] Resend error: ${err?.message} — falling back to mock confirmation`);
    }
  }

  res.json({
    success: true,
    messageId: providerMessageId || messageId,
    deliveryMethod,
    delivered,
    sentAt,
    recipients: [managerEmail, complianceEmail, iamEmail],
    subject: subjectLine,
    caseId,
    employeeId,
    summaryStats: {
      totalPortals,
      portalsRemoved,
      portalsDeferred: deferredPortals.length,
      openExceptions: exceptionLines.length,
      status,
    },
    evidencePackageId,
    grcArchiveId,
    bodyPreview: textBody.slice(0, 400) + "...",
    message: `✓ Offboarding summary email sent to ${managerEmail}, ${complianceEmail}, and ${iamEmail}. Case ${caseId} — ${s.employee} — ${status}.`,
  });
});

export default router;
