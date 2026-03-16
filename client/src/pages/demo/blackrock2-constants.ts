/**
 * BlackRock Use Case 2: External Portal Offboarding
 *
 * Agent team for automated termination event detection and
 * multi-portal access revocation across DTCC, Euroclear, Clearstream,
 * Bloomberg TOMS, SWIFT, ICE, Markitserv, and other partner portals.
 *
 * Agents are pre-created in the dev environment via API.
 * MCP servers: SailPoint IdentityIQ (shared with Use Case 1)
 */

export const BLACKROCK2_AGENTS = {
  terminationIntake: {
    id: "b9f26c40-967a-482d-98f1-fa1bfe518aa7",
    name: "Termination Intake Agent",
    description: "Monitors SailPoint for termination events. Validates termination against HR source. Creates removal case.",
    autonomyMode: "autonomous",
    riskTier: "HIGH",
  },
} as const;

export const BLACKROCK2_MCP_SERVERS = {
  sailpoint: {
    id: "1619ef7f-8bee-4d02-8f39-480275397c22",
    name: "SailPoint IdentityIQ MCP Server",
    tools: ["get_pending_tasks", "get_identity_cube", "get_entitlements", "provision_entitlement", "revoke_access", "validate_entitlement"],
  },
} as const;

export const BLACKROCK2_SAILPOINT_TOOLS = {
  get_identity_cube: {
    id: "e8ce43a6-64fd-4dba-8336-088a721ea1a3",
    description: "Retrieves an employee's full identity cube including linked accounts, entitlements, and certifications",
  },
  get_pending_tasks: {
    id: "5e5dda0b-6a27-4c6d-a71c-0fe8d725fcfb",
    description: "Polls SailPoint task queue for pending termination workflow events",
  },
} as const;

export const BLACKROCK2_TRIGGERS = {
  terminationEvent: {
    id: "8412e0ee-7eca-4457-bf60-5b0397b102d3",
    agentId: BLACKROCK2_AGENTS.terminationIntake.id,
    triggerType: "event",
    eventName: "termination_event",
    source: "sailpoint_identityiq",
  },
} as const;
