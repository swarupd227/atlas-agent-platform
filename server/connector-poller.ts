/**
 * Polling engine for "mcp_resource_change" agent triggers. Real enterprise
 * connectors (Jira, Salesforce, ...) don't push change events, so this fills
 * the gap by periodically re-running a caller-supplied query with a
 * "changed since last poll" bound and firing the trigger when new/changed
 * records are found. Reuses the same RealMcpBase.callTool credential
 * resolution and audit logging every other agent-initiated tool call goes
 * through — no separate credential handling here.
 */
import { storage } from "./storage";
import { getEnterpriseServerById } from "./integrations/register";
import type { AgentTrigger } from "@shared/schema";
import {
  MIN_POLL_INTERVAL_MS,
  DEFAULT_POLL_INTERVAL_MS,
  isPollableIntegration,
  buildJiraArgs,
  buildSalesforceArgs,
} from "./connector-poll-query";

export { MIN_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS, isPollableIntegration };

export async function resolveIntegrationIdForMcpServer(mcpServerId: string): Promise<string | null> {
  const tools = await storage.getMcpServerTools(mcpServerId);
  const withIntegration = tools.find(t => (t.annotations as any)?.enterpriseIntegration);
  return (withIntegration?.annotations as any)?.enterpriseIntegration ?? null;
}

export interface PollOutcome {
  triggerId: string;
  skipped?: string;
  error?: string;
  recordCount?: number;
  fired?: boolean;
}

export async function pollOneResourceChangeTrigger(trigger: AgentTrigger): Promise<PollOutcome> {
  const config = (trigger.config || {}) as Record<string, any>;
  const mcpServerId = config.mcpServerId as string | undefined;
  if (!mcpServerId) return { triggerId: trigger.id, skipped: "missing config.mcpServerId" };

  const integrationId = await resolveIntegrationIdForMcpServer(mcpServerId);
  if (!isPollableIntegration(integrationId)) {
    return { triggerId: trigger.id, skipped: `integration '${integrationId ?? "unknown"}' does not support polling yet` };
  }

  const server = getEnterpriseServerById(integrationId!);
  if (!server) return { triggerId: trigger.id, skipped: `no connector registered for '${integrationId}'` };

  // Worker-initiated, not a request — no authenticated caller to scope by, so this
  // intentionally reads the agent's own org without an orgId filter (system context),
  // mirroring executeScheduledAgentCycle's deployment lookup in worker.ts.
  const agent = await storage.getAgent(trigger.agentId);
  if (!agent) return { triggerId: trigger.id, skipped: "agent not found" };
  const orgId = agent.organizationId as string;

  const cursorIso = (config.lastPolledAt as string | undefined) ?? null;
  const baseQuery = (config.query as string) ?? "";

  let toolName: string;
  let args: Record<string, unknown>;
  try {
    if (integrationId === "jira") {
      toolName = "jira_search";
      args = buildJiraArgs(baseQuery, cursorIso);
    } else {
      toolName = "sf_query";
      args = buildSalesforceArgs(baseQuery, cursorIso);
    }
  } catch (err: any) {
    return { triggerId: trigger.id, error: err.message };
  }

  const result = await server.callTool(toolName, args, orgId);

  if (result.isError) {
    const message = result.content[0]?.text ?? "poll failed";
    console.error(`[connector-poller] Trigger ${trigger.id} (${integrationId}) poll failed: ${message}`);
    return { triggerId: trigger.id, error: message };
  }

  let recordCount = 0;
  try {
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    recordCount = integrationId === "jira" ? (parsed.count ?? parsed.issues?.length ?? 0) : (parsed.records?.length ?? 0);
  } catch {
    // Unparseable result body — treat as zero new records this cycle but still
    // advance the cursor below so we don't reprocess the same window forever.
  }

  const nowIso = new Date().toISOString();
  const isBaseline = !cursorIso;

  if (isBaseline) {
    // First poll establishes the cursor without firing — otherwise every
    // pre-existing record would look like a "change" on trigger creation.
    await storage.updateAgentTrigger(trigger.id, { config: { ...config, lastPolledAt: nowIso } });
    console.log(`[connector-poller] Trigger ${trigger.id} (${integrationId}) established baseline cursor (${recordCount} pre-existing records, not fired)`);
    return { triggerId: trigger.id, recordCount, fired: false };
  }

  if (recordCount > 0) {
    await storage.updateAgentTrigger(trigger.id, {
      lastFiredAt: new Date(),
      fireCount: (trigger.fireCount || 0) + 1,
      config: { ...config, lastPolledAt: nowIso },
    });
    const job = await storage.createJob({
      type: "agent_run",
      agentId: trigger.agentId,
      status: "queued",
      payload: {
        triggeredBy: "mcp_resource_change",
        triggerId: trigger.id,
        integrationId,
        recordCount,
      },
    });
    await storage.createAuditEvent({
      actorType: "system",
      action: "resource_change_detected",
      objectType: "agent_trigger",
      objectId: trigger.id,
      details: `Connector poll detected ${recordCount} changed record(s) via ${integrationId}, job ${job.id} enqueued for agent ${trigger.agentId}`,
    });
    console.log(`[connector-poller] Trigger ${trigger.id} (${integrationId}) fired: ${recordCount} changed record(s), job ${job.id}`);
    return { triggerId: trigger.id, recordCount, fired: true };
  }

  await storage.updateAgentTrigger(trigger.id, { config: { ...config, lastPolledAt: nowIso } });
  return { triggerId: trigger.id, recordCount, fired: false };
}

export async function pollDueResourceChangeTriggers(): Promise<{ checked: number; fired: number; errors: number }> {
  const triggers = await storage.getAgentTriggersByType("mcp_resource_change");
  const now = Date.now();
  let checked = 0, fired = 0, errors = 0;

  for (const trigger of triggers) {
    if (!trigger.enabled) continue;
    const config = (trigger.config || {}) as Record<string, any>;
    const pollIntervalMs = Math.max(Number(config.pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS, MIN_POLL_INTERVAL_MS);
    const lastPolledAt = config.lastPolledAt ? new Date(config.lastPolledAt).getTime() : 0;
    if (now - lastPolledAt < pollIntervalMs) continue;

    checked++;
    try {
      const outcome = await pollOneResourceChangeTrigger(trigger);
      if (outcome.error) errors++;
      if (outcome.fired) fired++;
    } catch (err: any) {
      errors++;
      console.error(`[connector-poller] Unexpected error polling trigger ${trigger.id}:`, err.message);
    }
  }

  return { checked, fired, errors };
}
