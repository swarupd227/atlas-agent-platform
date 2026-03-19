/**
 * BlackRock Use Case 2: External Portal Offboarding
 *
 * Agent team for automated termination event detection and
 * multi-portal access revocation across DTCC, Euroclear, Clearstream,
 * Bloomberg TOMS, SWIFT, ICE, Markitserv, and other partner portals.
 *
 * Workflow: Termination Intake → Portal Discovery + Active Trade Check
 * → Access Removal Executor → Removal Verification → Audit & Evidence
 *
 * Agents are pre-created in the dev environment via API.
 */

export const BLACKROCK2_AGENTS = {
  terminationIntake: {
    id: "b9f26c40-967a-482d-98f1-fa1bfe518aa7",
    name: "Termination Intake Agent",
    description: "Monitors SailPoint for termination events. Validates termination against HR source. Creates removal case.",
    autonomyMode: "autonomous",
    riskTier: "HIGH",
  },
  portalDiscovery: {
    id: "ba94fcde-b3b5-4ac5-b78d-3cc72ef0c99e",
    name: "Portal Discovery Agent",
    description: "Scans Partner Portal Registry to identify all external portal accounts for the terminated employee. Cross-references SailPoint entitlements and AD group memberships.",
    autonomyMode: "autonomous",
    riskTier: "HIGH",
  },
  activeTradeCheck: {
    id: "50f18f63-433a-4efd-a844-173a861bc406",
    name: "Active Trade Check Agent",
    description: "Checks settlement systems for pending/unsettled trades. Recommends immediate removal, deferred removal, or escalation. Human approves hold decisions.",
    autonomyMode: "supervised",
    riskTier: "HIGH",
  },
  accessRemovalExecutor: {
    id: "8b363fb5-9406-4b53-86d1-8e58f206e21a",
    name: "Access Removal Executor Agent",
    description: "Executes access removal across partner portals. Handles SAML SSO deactivation, certificate revocation, token invalidation, AD disable. Auto for Low/Medium risk; approval for High/Critical.",
    autonomyMode: "supervised",
    riskTier: "HIGH",
  },
  removalVerification: {
    id: "1c13e7ab-451e-48f5-b315-fe901b071305",
    name: "Removal Verification Agent",
    description: "Verifies removal across all portals post-execution. Checks portal confirmation, SailPoint revocation, RadiantOne reflection. Schedules retry for unreachable portals.",
    autonomyMode: "autonomous",
    riskTier: "HIGH",
  },
  auditEvidence: {
    id: "388b13f6-0e3d-475f-a6b4-67c0c4f98c0d",
    name: "Audit & Evidence Agent",
    description: "Generates SOX-compliant evidence package with removal timestamps, verification results, exception docs, and approval records. Creates Splunk monitoring rules and closes ServiceNow tickets.",
    autonomyMode: "autonomous",
    riskTier: "HIGH",
  },
} as const;

export const BLACKROCK2_MCP_SERVERS = {
  sailpoint: {
    id: "1619ef7f-8bee-4d02-8f39-480275397c22",
    name: "SailPoint IdentityIQ MCP Server",
    tools: ["get_pending_tasks", "get_identity_cube", "get_entitlements", "provision_entitlement", "revoke_access", "validate_entitlement", "check_policy_violations"],
  },
  radiantOne: {
    id: "0910d03b-bbc1-450f-a7e3-a856e30c6906",
    name: "RadiantOne MCP Server",
    tools: ["search_identities", "get_entitlements"],
  },
  activeDirectory: {
    id: "2f648b9c-2b10-4637-9043-ec3ac7476eae",
    name: "Active Directory MCP Server",
    tools: ["get_group_memberships", "disable_account"],
  },
  partnerPortal: {
    id: "7926e189-4b2f-4360-b46c-d2fcaed7a529",
    name: "Partner Portal MCP Server",
    tools: ["scan_accounts", "remove_access", "revoke_certificate", "invalidate_token", "verify_removal"],
  },
  /**
   * Partner Portal Registry — New MCP Server for Use Case 2 (Employee Portal Offboarding).
   * Created lazily via the platform storage API; ID is DB-assigned and resolved at runtime
   * via GET /demo-api/blackrock2/partner-portal-registry.
   * Tools (6): scan_accounts · remove_access · revoke_certificate · invalidate_token ·
   *            verify_removal · get_portal_status
   */
  partnerPortalRegistry: {
    id: null as string | null,
    name: "Partner Portal Registry",
    tools: ["scan_accounts", "remove_access", "revoke_certificate", "invalidate_token", "verify_removal", "get_portal_status"],
    apiRoute: "/demo-api/blackrock2/partner-portal-registry",
  },
  aladdin: {
    id: "ec259ba6-63f3-476a-a572-0ebd18c92706",
    name: "Aladdin MCP Server",
    tools: ["get_trading_permissions"],
  },
  settlement: {
    id: "ff30ca76-6a96-4731-b2d0-ed039a19f4d6",
    name: "Settlement MCP Server",
    tools: ["get_pending_trades"],
  },
  servicenow: {
    id: "afa4e401-7fa8-41ac-a23a-119019e746b2",
    name: "ServiceNow MCP Server",
    tools: ["create_ticket", "update_ticket", "close_ticket"],
  },
  splunk: {
    id: "593cae35-338b-47c9-a696-a85a3bcc1e51",
    name: "Splunk MCP Server",
    tools: ["query_access_logs", "create_monitoring_rule"],
  },
};

export const BLACKROCK2_SAILPOINT_TOOLS = {
  get_identity_cube: {
    id: "e8ce43a6-64fd-4dba-8336-088a721ea1a3",
    description: "Retrieves an employee's full identity cube including linked accounts, entitlements, and certifications",
  },
  get_pending_tasks: {
    id: "5e5dda0b-6a27-4c6d-a71c-0fe8d725fcfb",
    description: "Polls SailPoint task queue for pending termination workflow events",
  },
  check_policy_violations: {
    id: "1c4463ee-026d-44f6-a1a7-a0a689940396",
    description: "Checks for SoD policy violations on entitlement removal",
  },
} as const;

export const BLACKROCK2_RADIANTONE_TOOLS = {
  search_identities: {
    id: "1cd658b6-1f86-485e-8358-44cf7445d44d",
    description: "Searches federated identity directory across AD, LDAP, and cloud IdP",
  },
  get_entitlements: {
    id: "53eb23be-e389-4c86-955d-dbdaaf7af5f2",
    description: "Retrieves all entitlements and access rights from RadiantOne virtual directory",
  },
} as const;

export const BLACKROCK2_AD_TOOLS = {
  get_group_memberships: {
    id: "5d1a72a4-5c0c-49a9-b8e7-da1505e38a73",
    description: "Retrieves AD security and distribution group memberships including nested groups",
  },
  disable_account: {
    id: "f98b8995-ec8f-4947-b426-d6dae92565f3",
    description: "Disables AD account and removes from all security groups",
  },
} as const;

export const BLACKROCK2_PARTNER_PORTAL_TOOLS = {
  scan_accounts: {
    id: "830e17cf-4637-4b4d-9990-0928005683c1",
    description: "Scans Partner Portal Registry for all portal accounts linked to an employee",
  },
  remove_access: {
    id: "403be50f-417f-47d9-bc75-07ad9418034a",
    description: "Executes portal-specific access removal (SAML, API, password)",
  },
  revoke_certificate: {
    id: "a6ffd560-4103-4608-a99e-2a07a4beda19",
    description: "Revokes digital certificates for portal authentication",
  },
  invalidate_token: {
    id: "c83bafda-4041-4a2d-95c3-8c5fc4d9479e",
    description: "Invalidates OAuth tokens, API keys, and session tokens",
  },
  verify_removal: {
    id: "18c9a40d-a281-4bcf-87e2-acecde9c5a4e",
    description: "Verifies access removal by checking portal status APIs",
  },
} as const;

export const BLACKROCK2_ALADDIN_TOOLS = {
  get_trading_permissions: {
    id: "4443c5e1-fdde-4de9-9d9b-b3db60332aa2",
    description: "Retrieves active trading permissions, open orders, and pending allocations from Aladdin",
  },
} as const;

export const BLACKROCK2_SETTLEMENT_TOOLS = {
  get_pending_trades: {
    id: "d0b055e8-1b16-4f51-a291-7d934ac71e96",
    description: "Retrieves pending/unsettled trades across DTCC, Euroclear, Clearstream",
  },
} as const;

export const BLACKROCK2_SERVICENOW_TOOLS = {
  create_ticket: {
    id: "37f5fb2d-4c05-4b0d-a74a-e2359badcf07",
    description: "Creates ServiceNow incident/request ticket for manual portal removal",
  },
  update_ticket: {
    id: "a45a663a-bf0c-40fa-ac8b-f051c11f8806",
    description: "Updates ServiceNow ticket with evidence and work notes",
  },
  close_ticket: {
    id: "cc981b9a-2c3c-44a6-ba41-c90dd7cc26f7",
    description: "Closes ServiceNow ticket with SOX-compliant resolution details",
  },
} as const;

export const BLACKROCK2_SPLUNK_TOOLS = {
  query_access_logs: {
    id: "c81a051f-d30e-412f-8944-36a4ad5972c0",
    description: "Queries Splunk for post-removal authentication attempts",
  },
  create_monitoring_rule: {
    id: "a63536f7-658f-4505-b3c0-90f27283c027",
    description: "Creates 90-day Splunk monitoring rule for terminated employee access detection",
  },
} as const;

/**
 * Partner Portal Registry tool specs — used for UI display and agent prompt generation.
 * Tool IDs are NOT hardcoded; the real DB IDs are fetched from the platform API at runtime
 * via GET /demo-api/blackrock2/partner-portal-registry.
 */
export const BLACKROCK2_PARTNER_PORTAL_REGISTRY_TOOLS = [
  {
    name: "scan_accounts",
    riskClassification: "low",
    usedBy: ["IAM-AGT-702"],
    description:
      "Given an employee ID, returns all partner portal accounts: portal name, account ID, role, auth type, status, and last login timestamp.",
  },
  {
    name: "remove_access",
    riskClassification: "high",
    usedBy: ["IAM-AGT-704"],
    description:
      "Deactivates an employee's account on a specific partner portal. Selects the correct adapter (SAML, cert revoke, token invalidation, API disable).",
  },
  {
    name: "revoke_certificate",
    riskClassification: "high",
    usedBy: ["IAM-AGT-704"],
    description:
      "Revokes a client certificate or PKI certificate for certificate-based portals (Euroclear, SWIFT).",
  },
  {
    name: "invalidate_token",
    riskClassification: "high",
    usedBy: ["IAM-AGT-704"],
    description: "Invalidates a SWIFT token or RSA SecurID token.",
  },
  {
    name: "verify_removal",
    riskClassification: "low",
    usedBy: ["IAM-AGT-705"],
    description:
      "Checks a specific portal to confirm the employee's account is disabled/removed. Returns: status, timestamp, confirmation ID.",
  },
  {
    name: "get_portal_status",
    riskClassification: "low",
    usedBy: ["IAM-AGT-704", "IAM-AGT-705"],
    description: "Checks if a partner portal is reachable and operational (health check).",
  },
] as const;

export const BLACKROCK2_TRIGGERS = {
  terminationEvent: {
    id: "8412e0ee-7eca-4457-bf60-5b0397b102d3",
    agentId: BLACKROCK2_AGENTS.terminationIntake.id,
    triggerType: "event",
    eventName: "termination_event",
    source: "sailpoint_identityiq",
  },
  removalCaseCreated_702: {
    id: "d388481d-a163-4c05-9200-76e2f80e847a",
    agentId: BLACKROCK2_AGENTS.portalDiscovery.id,
    triggerType: "event",
    eventName: "removal_case_created",
    source: "sailpoint_identityiq",
  },
  removalCaseCreated_703: {
    id: "554362ec-c5b5-49fe-bb41-85293da72553",
    agentId: BLACKROCK2_AGENTS.activeTradeCheck.id,
    triggerType: "event",
    eventName: "removal_case_created",
    source: "sailpoint_identityiq",
  },
  portalDiscoveryComplete: {
    id: "f4fe7ddc-596b-4885-800c-f695f58b60fc",
    agentId: BLACKROCK2_AGENTS.accessRemovalExecutor.id,
    triggerType: "event",
    eventName: "portal_discovery_complete",
    source: "blackrock_offboarding_workflow",
  },
  accessRemovalComplete: {
    id: "83c7b654-6049-4ed9-9597-d05e1e879b1a",
    agentId: BLACKROCK2_AGENTS.removalVerification.id,
    triggerType: "event",
    eventName: "access_removal_complete",
    source: "blackrock_offboarding_workflow",
  },
  removalVerified: {
    id: "4fcb8071-1ad8-45cf-953f-2a51b87939db",
    agentId: BLACKROCK2_AGENTS.auditEvidence.id,
    triggerType: "event",
    eventName: "removal_verified",
    source: "blackrock_offboarding_workflow",
  },
} as const;

export const BLACKROCK2_COMMON_CONFIG = {
  department: "Identity & Access Management",
  environment: "production",
  riskTier: "HIGH",
  complianceTags: ["SOX", "FCA SM&CR", "SEC 17a-4", "FINRA 3110"],
} as const;
