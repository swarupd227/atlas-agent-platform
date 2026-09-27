/**
 * The connector actions, as the service surface Astra's tools call.
 *
 * Thin by design: every one of these is the same function the page's own routes
 * would call, so a health answer in a conversation and a health badge on the page
 * cannot disagree. See server/connector-actions.ts for what each one measures.
 */
import { connectionRequirements, connectorHealth, connectorUsage, findTool, verifyConnectorNow } from "../connector-actions";

async function connectorHealthFor(orgId: string, connector?: string) {
  return connectorHealth(orgId, connector);
}

async function verifyConnectorFor(orgId: string, connector: string, actorLabel: string) {
  return verifyConnectorNow(orgId, connector, actorLabel);
}

async function findToolFor(orgId: string, query: string) {
  return findTool(orgId, query);
}

async function connectorUsageFor(orgId: string, connector: string) {
  return connectorUsage(orgId, connector);
}

async function connectionRequirementsFor(orgId: string, platform: string) {
  return connectionRequirements(orgId, platform);
}

export const connectorServices = {
  connectorHealth: connectorHealthFor,
  verifyConnector: verifyConnectorFor,
  findTool: findToolFor,
  connectorUsage: connectorUsageFor,
  connectionRequirements: connectionRequirementsFor,
};
