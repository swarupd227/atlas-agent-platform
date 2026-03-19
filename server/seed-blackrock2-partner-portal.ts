/**
 * BlackRock Use Case 2 — Partner Portal Registry MCP Server Seeder
 *
 * Creates the "Partner Portal Registry" MCP Server and its 6 tools via
 * the platform storage API (no direct DB writes). Idempotent — checks for
 * existing server by name before creating.
 *
 * Tools (per spec):
 *   scan_accounts       – Low  – Returns all portal accounts for an employee ID
 *   remove_access       – High – Deactivates employee account on a partner portal
 *   revoke_certificate  – High – Revokes PKI/client certificate (Euroclear, SWIFT)
 *   invalidate_token    – High – Invalidates SWIFT token or RSA SecurID token
 *   verify_removal      – Low  – Confirms account disabled; returns status + confirmation ID
 *   get_portal_status   – Low  – Health check: is a partner portal reachable?
 */

import { storage } from "./storage";

export const PARTNER_PORTAL_REGISTRY_SERVER_NAME = "Partner Portal Registry";

export const PARTNER_PORTAL_REGISTRY_TOOLS = [
  {
    name: "scan_accounts",
    riskClassification: "low",
    description:
      "Given an employee ID, returns all partner portal accounts: portal name, account ID, role, auth type, status, and last login timestamp.",
    usedBy: ["IAM-AGT-702"],
    inputSchema: {
      type: "object",
      required: ["employeeId"],
      properties: {
        employeeId: { type: "string", description: "BlackRock employee ID (e.g. BLK-EMP-00491)" },
        includeInactive: { type: "boolean", description: "Whether to include inactive/expired accounts", default: false },
      },
    },
    outputSchema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          portalName:  { type: "string" },
          accountId:   { type: "string" },
          role:        { type: "string" },
          authType:    { type: "string", enum: ["SAML", "PKI_CERT", "SWIFT_TOKEN", "API_KEY", "PASSWORD"] },
          status:      { type: "string", enum: ["active", "inactive", "suspended"] },
          lastLogin:   { type: "string", format: "date-time" },
        },
      },
    },
    annotations: {
      risk: "low",
      humanApprovalRequired: false,
      usedByAgents: ["IAM-AGT-702"],
      portals: ["DTCC", "Euroclear", "Clearstream", "Bloomberg TOMS", "SWIFT", "ICE", "Markitserv"],
      compliance: ["SOX", "FCA SM&CR"],
    },
  },
  {
    name: "remove_access",
    riskClassification: "high",
    description:
      "Deactivates an employee's account on a specific partner portal. Selects the correct adapter based on auth type: SAML SSO deactivation, certificate revocation, token invalidation, or API key disable.",
    usedBy: ["IAM-AGT-704"],
    inputSchema: {
      type: "object",
      required: ["employeeId", "portalName", "accountId", "authType"],
      properties: {
        employeeId:  { type: "string", description: "BlackRock employee ID" },
        portalName:  { type: "string", description: "Target partner portal name" },
        accountId:   { type: "string", description: "Portal-specific account identifier" },
        authType:    { type: "string", enum: ["SAML", "PKI_CERT", "SWIFT_TOKEN", "API_KEY", "PASSWORD"], description: "Auth mechanism to deactivate" },
        reason:      { type: "string", description: "Removal reason (e.g. TERMINATION, ROLE_CHANGE)" },
        caseId:      { type: "string", description: "ServiceNow case ID for audit trail" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        success:       { type: "boolean" },
        adapter:       { type: "string", description: "Adapter used for removal" },
        timestamp:     { type: "string", format: "date-time" },
        confirmationId:{ type: "string" },
        message:       { type: "string" },
      },
    },
    annotations: {
      risk: "high",
      humanApprovalRequired: true,
      approvalTier: "SUPERVISOR",
      usedByAgents: ["IAM-AGT-704"],
      adapters: ["SamlSsoAdapter", "PkiCertAdapter", "SwiftTokenAdapter", "ApiKeyAdapter"],
      compliance: ["SOX", "SEC 17a-4", "FCA SM&CR"],
      auditRequired: true,
    },
  },
  {
    name: "revoke_certificate",
    riskClassification: "high",
    description:
      "Revokes a client certificate or PKI certificate for certificate-based portals such as Euroclear and SWIFT. Calls the portal's CA revocation endpoint and logs to CRL.",
    usedBy: ["IAM-AGT-704"],
    inputSchema: {
      type: "object",
      required: ["employeeId", "portalName", "certificateSerial"],
      properties: {
        employeeId:         { type: "string", description: "BlackRock employee ID" },
        portalName:         { type: "string", description: "Target portal (e.g. Euroclear, SWIFT)" },
        certificateSerial:  { type: "string", description: "X.509 certificate serial number" },
        reason:             { type: "string", enum: ["keyCompromise", "affiliationChanged", "cessationOfOperation", "privilegeWithdrawn"], description: "RFC 5280 revocation reason" },
        caseId:             { type: "string", description: "ServiceNow case ID for audit" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        success:      { type: "boolean" },
        crlUpdated:   { type: "boolean", description: "Whether CRL was updated" },
        ocspStatus:   { type: "string", enum: ["revoked", "unknown"] },
        revokedAt:    { type: "string", format: "date-time" },
        confirmationId:{ type: "string" },
      },
    },
    annotations: {
      risk: "high",
      humanApprovalRequired: true,
      approvalTier: "SUPERVISOR",
      usedByAgents: ["IAM-AGT-704"],
      portals: ["Euroclear", "SWIFT"],
      compliance: ["SOX", "SEC 17a-4"],
      auditRequired: true,
    },
  },
  {
    name: "invalidate_token",
    riskClassification: "high",
    description:
      "Invalidates a SWIFT token or RSA SecurID token for the specified employee. Calls the token management API to immediately expire the token and prevent further authentication.",
    usedBy: ["IAM-AGT-704"],
    inputSchema: {
      type: "object",
      required: ["employeeId", "portalName", "tokenType", "tokenId"],
      properties: {
        employeeId: { type: "string", description: "BlackRock employee ID" },
        portalName: { type: "string", description: "Target portal name" },
        tokenType:  { type: "string", enum: ["SWIFT_TOKEN", "RSA_SECURID", "TOTP", "HARDWARE_TOKEN"], description: "Type of token to invalidate" },
        tokenId:    { type: "string", description: "Token identifier or serial number" },
        caseId:     { type: "string", description: "ServiceNow case ID for audit" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        success:       { type: "boolean" },
        invalidatedAt: { type: "string", format: "date-time" },
        confirmationId:{ type: "string" },
        message:       { type: "string" },
      },
    },
    annotations: {
      risk: "high",
      humanApprovalRequired: true,
      approvalTier: "SUPERVISOR",
      usedByAgents: ["IAM-AGT-704"],
      portals: ["SWIFT", "ICE", "Euroclear"],
      compliance: ["SOX", "FINRA 3110"],
      auditRequired: true,
    },
  },
  {
    name: "verify_removal",
    riskClassification: "low",
    description:
      "Checks a specific partner portal to confirm an employee's account has been disabled or removed. Returns current status, timestamp of change, and a confirmation ID for audit evidence.",
    usedBy: ["IAM-AGT-705"],
    inputSchema: {
      type: "object",
      required: ["employeeId", "portalName"],
      properties: {
        employeeId:  { type: "string", description: "BlackRock employee ID" },
        portalName:  { type: "string", description: "Portal to verify against" },
        accountId:   { type: "string", description: "Portal-specific account ID (optional, for faster lookup)" },
        retryIfPending: { type: "boolean", description: "Retry if portal indicates removal is pending", default: true },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        status:        { type: "string", enum: ["removed", "disabled", "pending", "still_active", "error"] },
        verifiedAt:    { type: "string", format: "date-time" },
        confirmationId:{ type: "string", description: "Portal-issued confirmation reference" },
        message:       { type: "string" },
      },
    },
    annotations: {
      risk: "low",
      humanApprovalRequired: false,
      usedByAgents: ["IAM-AGT-705"],
      compliance: ["SOX"],
      auditRequired: true,
    },
  },
  {
    name: "get_portal_status",
    riskClassification: "low",
    description:
      "Checks if a specific partner portal is reachable and operational. Returns health status, last checked timestamp, and any active incidents that might affect access removal operations.",
    usedBy: ["IAM-AGT-704", "IAM-AGT-705"],
    inputSchema: {
      type: "object",
      required: ["portalName"],
      properties: {
        portalName: { type: "string", description: "Name of the partner portal to health-check" },
        checkDepth:  { type: "string", enum: ["ping", "auth_endpoint", "full"], description: "Depth of health check", default: "auth_endpoint" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        portalName:    { type: "string" },
        reachable:     { type: "boolean" },
        operational:   { type: "boolean" },
        responseTimeMs:{ type: "number" },
        lastChecked:   { type: "string", format: "date-time" },
        incidents:     { type: "array", items: { type: "string" } },
        message:       { type: "string" },
      },
    },
    annotations: {
      risk: "low",
      humanApprovalRequired: false,
      usedByAgents: ["IAM-AGT-704", "IAM-AGT-705"],
      portals: ["DTCC", "Euroclear", "Clearstream", "Bloomberg TOMS", "SWIFT", "ICE", "Markitserv"],
      compliance: ["SOX"],
    },
  },
];

/**
 * Check whether the Partner Portal Registry server already exists in the DB.
 * Returns the existing server record if found, null otherwise.
 */
async function findExistingServer(): Promise<{ id: string; name: string } | null> {
  const servers = await storage.getMcpServers();
  return servers.find((s: any) => s.name === PARTNER_PORTAL_REGISTRY_SERVER_NAME) || null;
}

/**
 * Idempotent seed: creates the Partner Portal Registry MCP server and its 6 tools
 * via the storage API only. Safe to call multiple times — returns the server record
 * (existing or newly created) and the list of tools.
 */
export async function seedPartnerPortalRegistry(): Promise<{
  server: any;
  tools: any[];
  created: boolean;
}> {
  const existing = await findExistingServer();
  if (existing) {
    const tools = await storage.getMcpServerTools(existing.id);
    return { server: existing, tools, created: false };
  }

  const server = await storage.createMcpServer({
    name: PARTNER_PORTAL_REGISTRY_SERVER_NAME,
    description:
      "Unified interface wrapping partner portal admin APIs for the BlackRock Employee Offboarding workflow. " +
      "Provides account scanning, access removal, certificate revocation, token invalidation, removal verification, " +
      "and portal health checks across DTCC, Euroclear, Clearstream, Bloomberg TOMS, SWIFT, ICE, and Markitserv.",
    transportType: "streamable-http",
    url: null,
    status: "registered",
    riskTier: "HIGH",
    allowlisted: true,
    industryId: "financial_services",
    addedBy: "blackrock-demo-setup",
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
      sampling: false,
    },
    serverInfo: {
      vendor: "BlackRock Internal",
      version: "2.1.0",
      portals: ["DTCC", "Euroclear", "Clearstream", "Bloomberg TOMS", "SWIFT", "ICE", "Markitserv"],
      compliance: ["SOX", "FCA SM&CR", "SEC 17a-4", "FINRA 3110"],
      useCases: ["employee-offboarding", "access-removal", "partner-portal-governance"],
    },
  });

  const createdTools: any[] = [];
  for (const toolSpec of PARTNER_PORTAL_REGISTRY_TOOLS) {
    const tool = await storage.createMcpServerTool({
      serverId: server.id,
      name: toolSpec.name,
      description: toolSpec.description,
      inputSchema: toolSpec.inputSchema,
      outputSchema: toolSpec.outputSchema,
      annotations: toolSpec.annotations,
      riskClassification: toolSpec.riskClassification,
      owner: "BlackRock IAM Team",
      enabled: true,
      ontologyTags: toolSpec.usedBy.map(agent => ({ tag: `used_by:${agent}` })),
    });
    createdTools.push(tool);
  }

  return { server, tools: createdTools, created: true };
}
