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
  JIRA_PAGE_SIZE,
  SALESFORCE_PAGE_SIZE,
  resolveNextPollCursor,
  parseGenericPollSpec,
  buildGenericArgs,
  extractGenericRecords,
  type GenericPollSpec,
} from "./connector-poll-query";
import { gatherAvailableTools, dispatchToolCall } from "./tool-dispatcher";
import { resolvePolicyBundle } from "./routes/helpers";

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
  // Two ways to be pollable. Jira and Salesforce have a known "changed since"
  // query primitive, so the builders above speak for them. Any other connector --
  // including an MCP server with no enterprise integration behind it at all --
  // is pollable when the trigger carries a config.poll spec saying how to ask it.
  // Without one it is still skipped and logged rather than guessed at.
  const vendorPollable = isPollableIntegration(integrationId);
  let genericSpec: GenericPollSpec | undefined;
  if (!vendorPollable) {
    if (config.poll === undefined) {
      return {
        triggerId: trigger.id,
        skipped: `integration '${integrationId ?? "unknown"}' has no built-in poll query; give the trigger a config.poll spec saying which tool to call and which argument carries the changed-since bound`,
      };
    }
    try {
      genericSpec = parseGenericPollSpec(config.poll);
    } catch (err: any) {
      return { triggerId: trigger.id, error: err.message };
    }
  }

  const server = vendorPollable ? getEnterpriseServerById(integrationId!) : null;
  if (vendorPollable && !server) return { triggerId: trigger.id, skipped: `no connector registered for '${integrationId}'` };

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
    if (genericSpec) {
      toolName = genericSpec.tool;
      args = buildGenericArgs(genericSpec, cursorIso);
    } else if (integrationId === "jira") {
      toolName = "jira_search";
      args = buildJiraArgs(baseQuery, cursorIso);
    } else {
      toolName = "sf_query";
      args = buildSalesforceArgs(baseQuery, cursorIso);
    }
  } catch (err: any) {
    return { triggerId: trigger.id, error: err.message };
  }

  // Pin the poll to the connection its MCP server was registered against, so a
  // trigger watching the "Support DB" keeps polling that one rather than the
  // org's default connection for the type.
  const mcpServer = await storage.getMcpServer(mcpServerId);

  // Both paths reduce to "did it fail, and what text came back", so everything
  // below this point is shared. The generic path goes through the ordinary tool
  // dispatcher rather than a second call route of its own: a poll is a tool call
  // made on the agent's behalf, and it should be audited, policy-checked and
  // rate-limited exactly like one the agent makes itself.
  let isError: boolean;
  let text: string;
  if (genericSpec) {
    const tools = await gatherAvailableTools([mcpServerId]);
    const tool = tools.find((t) => t.toolName.toLowerCase() === toolName.toLowerCase());
    if (!tool) {
      return { triggerId: trigger.id, error: `connector has no tool named "${toolName}"; config.poll.tool must name one of: ${tools.map((t) => t.toolName).join(", ") || "(none)"}` };
    }
    const bundle = await resolvePolicyBundle(trigger.agentId, orgId ?? undefined).catch(() => null);
    const dispatched = await dispatchToolCall({ agentId: trigger.agentId, orgId, tool, args: args as Record<string, any>, policyBundle: bundle });
    isError = !dispatched.ok;
    text = typeof dispatched.result === "string" ? dispatched.result : JSON.stringify(dispatched.result ?? {});
    if (isError) text = dispatched.error ?? dispatched.reason ?? "poll failed";
  } else {
    const result = await server!.callTool(toolName, args, orgId, undefined, mcpServer?.connectionId || undefined);
    isError = !!result.isError;
    text = result.content[0]?.text ?? "poll failed";
  }

  if (isError) {
    console.error(`[connector-poller] Trigger ${trigger.id} (${integrationId ?? "generic"}) poll failed: ${text}`);
    return { triggerId: trigger.id, error: text };
  }

  let recordCount = 0;
  // Last fetched record's own changed-at timestamp, used by resolveNextPollCursor
  // to avoid advancing the cursor past records that didn't fit in this page (see
  // that function's doc comment for why "always advance to now" silently drops
  // overflow). Jira issues carry `fields.updated`; Salesforce records carry
  // `LastModifiedDate`. Computed as a max over the fetched page since neither
  // query guarantees a particular arrival order (the cursor-bound Jira query
  // does ORDER BY updated ASC, but the baseline query and the Salesforce query
  // do not).
  let lastRecordTimestampIso: string | null = null;
  try {
    const parsed = JSON.parse(text || "{}");
    if (genericSpec) {
      const extracted = extractGenericRecords(parsed, genericSpec);
      // A reply whose records cannot be located is an error, not a quiet zero:
      // zero would advance the cursor past a window nobody ever read.
      if (extracted.error) {
        console.error(`[connector-poller] Trigger ${trigger.id} poll unreadable: ${extracted.error}`);
        return { triggerId: trigger.id, error: extracted.error };
      }
      recordCount = extracted.recordCount;
      lastRecordTimestampIso = extracted.lastRecordTimestampIso;
    } else if (integrationId === "jira") {
      recordCount = parsed.count ?? parsed.issues?.length ?? 0;
      const issues: any[] = Array.isArray(parsed.issues) ? parsed.issues : [];
      for (const issue of issues) {
        const updated = issue?.fields?.updated;
        if (typeof updated === "string" && (!lastRecordTimestampIso || new Date(updated) > new Date(lastRecordTimestampIso))) {
          lastRecordTimestampIso = updated;
        }
      }
    } else {
      const records: any[] = Array.isArray(parsed.records) ? parsed.records : [];
      recordCount = records.length;
      for (const record of records) {
        const modified = record?.LastModifiedDate;
        if (typeof modified === "string" && (!lastRecordTimestampIso || new Date(modified) > new Date(lastRecordTimestampIso))) {
          lastRecordTimestampIso = modified;
        }
      }
    }
  } catch {
    // Unparseable result body — treat as zero new records this cycle but still
    // advance the cursor below so we don't reprocess the same window forever.
  }

  const nowIso = new Date().toISOString();
  // The generic path's cap is whatever the spec asked for. When the spec names no
  // page-size argument the connector decides its own, and a page that happens to
  // equal this number freezes the cursor for one cycle rather than skipping
  // records -- the safe direction of that uncertainty.
  const pageSize = genericSpec ? genericSpec.pageSize : integrationId === "jira" ? JIRA_PAGE_SIZE : SALESFORCE_PAGE_SIZE;
  const isBaseline = !cursorIso;

  if (isBaseline) {
    // First poll establishes the cursor without firing — otherwise every
    // pre-existing record would look like a "change" on trigger creation.
    await storage.updateAgentTrigger(trigger.id, { config: { ...config, lastPolledAt: nowIso } });
    console.log(`[connector-poller] Trigger ${trigger.id} (${integrationId}) established baseline cursor (${recordCount} pre-existing records, not fired)`);
    return { triggerId: trigger.id, recordCount, fired: false };
  }

  // Cursor to persist this cycle. If this page hit its size cap, there may be
  // more matching records beyond it — advancing to "now" would permanently
  // skip them, so the cursor only advances to the last fetched record's own
  // timestamp (or stays put if that's unavailable), letting the next poll's
  // "changed since" filter pick up the overflow. See resolveNextPollCursor.
  const nextCursorIso = resolveNextPollCursor({
    previousCursorIso: cursorIso,
    requestedAtIso: nowIso,
    recordCount,
    pageSize,
    lastRecordTimestampIso,
  });

  if (recordCount > 0) {
    await storage.updateAgentTrigger(trigger.id, {
      lastFiredAt: new Date(),
      fireCount: (trigger.fireCount || 0) + 1,
      config: { ...config, lastPolledAt: nextCursorIso },
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

  await storage.updateAgentTrigger(trigger.id, { config: { ...config, lastPolledAt: nextCursorIso } });
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
