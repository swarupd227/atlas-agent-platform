/**
 * Astra services for watching a connected system.
 *
 * The acts are server/agent-watch.ts, over the same mcp_resource_change trigger
 * server/connector-poller.ts polls. Only Jira and Salesforce can be polled, the
 * first poll establishes a cursor rather than firing, and a fire carries the
 * record count but not the records -- the tools say all three, because each one
 * is something a person would otherwise assume the other way.
 */
import { clearWatchAs, planWatch, setWatchAs, watches } from "../agent-watch";

async function listWatches(orgId: string) {
  return watches(orgId);
}

async function planWatchFor(orgId: string, agentId: string, connectorRef: string) {
  return planWatch(orgId, agentId, connectorRef);
}

async function setWatch(orgId: string, agentId: string, connectorRef: string, query: string, everyMinutes: number | undefined, actorLabel: string) {
  return setWatchAs(orgId, agentId, connectorRef, query, everyMinutes, { actorLabel });
}

async function clearWatch(orgId: string, agentId: string, connectorRef: string, actorLabel: string) {
  return clearWatchAs(orgId, agentId, connectorRef, { actorLabel });
}

export const watchServices = {
  listWatches,
  planWatch: planWatchFor,
  setWatchAs: setWatch,
  clearWatchAs: clearWatch,
};
