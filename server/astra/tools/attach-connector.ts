import { z } from "zod";
import type { AstraTool, AstraToolContext, ConfirmPreview, ConfirmWarning, ProofEnvelope } from "../types";
import { assessConnectorLinkWarnings, type ConnectorLinkWarning } from "../../connector-link";

/**
 * Link a connector to an agent, optionally read-only.
 *
 * Read-only is enforced, not described: an active strict tool_permissions
 * policy scoped to this agent blocks the connector's write tools by name.
 * Every agent run resolves that policy (resolvePolicyBundle) and the tool
 * dispatcher refuses blocked tools, so the agent cannot call them.
 */

interface ConnectorTool {
  id: string;
  name: string;
  description?: string | null;
  riskClassification?: string | null;
  annotations?: unknown;
  /** Computed by the service with the dispatcher's own isSideEffectful rule. */
  sideEffectful: boolean;
}

type Input = { agentId: string; connectorId: string; readOnly?: boolean };

interface Plan {
  agent: { id: string; name: string };
  connector: { id: string; name: string };
  tools: ConnectorTool[];
  warnings: ConnectorLinkWarning[];
  blockedTools: string[];
  /** Write tools also exposed by another connector on the agent -- blocking by name covers both. */
  sharedNames: string[];
}

async function plan(ctx: AstraToolContext, input: Input): Promise<{ refuse: string } | Plan> {
  const agent = await ctx.services.getAgent(ctx.orgId, input.agentId);
  if (!agent) return { refuse: "No agent with that id in this organization. Use get_agent to find it." };
  const connector = await ctx.services.getConnector(ctx.orgId, input.connectorId);
  if (!connector) return { refuse: "No connector with that id is available to this organization. Use find_connectors to find it." };
  if (await ctx.services.isConnectorLinked(ctx.orgId, agent.id, connector.id)) {
    return { refuse: `${connector.name} is already attached to ${agent.name}. Nothing to change.` };
  }
  if (input.readOnly && ctx.can && !ctx.can(ctx.role, "create_modify_policies")) {
    return { refuse: `Read-only is enforced with a policy, and the ${ctx.role} role can't create policies. Ask an admin, or attach it without read-only.` };
  }

  const tools: ConnectorTool[] = await ctx.services.getConnectorTools(ctx.orgId, connector.id);
  if (input.readOnly && tools.length === 0) {
    return { refuse: `${connector.name} has no discovered tools yet, so read-only can't be enforced. Sync its tools first.` };
  }
  const policies = await ctx.services.listPolicies(ctx.orgId);
  const warnings = assessConnectorLinkWarnings(agent, tools, policies);
  const blockedTools = input.readOnly ? Array.from(new Set(tools.filter((t) => t.sideEffectful).map((t) => t.name))).sort() : [];

  let sharedNames: string[] = [];
  if (blockedTools.length > 0) {
    const others: Array<{ serverId: string }> = await ctx.services.listAgentConnectors(ctx.orgId, agent.id);
    const names = new Set<string>();
    for (const other of others) {
      for (const t of (await ctx.services.getConnectorTools(ctx.orgId, other.serverId)) as ConnectorTool[]) names.add(t.name);
    }
    sharedNames = blockedTools.filter((n) => names.has(n));
  }

  return { agent: { id: agent.id, name: agent.name }, connector: { id: connector.id, name: connector.name }, tools, warnings, blockedTools, sharedNames };
}

function cardWarnings(p: Plan): ConfirmWarning[] {
  const out: ConfirmWarning[] = [];
  const highRisk = p.warnings.filter((w) => w.requiredPolicyDomain === "tool_permissions");
  const writes = p.warnings.filter((w) => w.requiredPolicyDomain === "data_handling");
  const names = (ws: ConnectorLinkWarning[]) => ws.slice(0, 5).map((w) => w.toolName).join(", ") + (ws.length > 5 ? ` and ${ws.length - 5} more` : "");
  if (highRisk.length > 0) {
    out.push({
      title: `${highRisk.length} high-risk ${highRisk.length === 1 ? "tool" : "tools"} with no tool permissions policy`,
      detail: `${p.agent.name} has no tool_permissions policy governing ${names(highRisk)}.`,
    });
  }
  if (writes.length > 0) {
    out.push({
      title: `${writes.length} write ${writes.length === 1 ? "tool" : "tools"} with no data handling policy`,
      detail: `${p.agent.name} has no data_handling or tool_permissions policy covering ${names(writes)}.`,
    });
  }
  if (p.sharedNames.length > 0) {
    out.push({
      title: "Read-only also blocks tools on another connector",
      detail: `Policies block tools by name, and ${p.agent.name} already has a connector with ${p.sharedNames.join(", ")}. Those will be blocked there too.`,
    });
  }
  return out;
}

function frozenOf(p: Plan) {
  return { warningToolIds: p.warnings.map((w) => w.toolId).sort(), blockedTools: p.blockedTools };
}

const sameList = (a: unknown, b: string[]) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

export const attachConnectorTool: AstraTool<Input> = {
  name: "attach_connector",
  description:
    "Attach a connector to an agent so the agent can use its tools. Set readOnly to block the connector's write tools for this agent with an enforced policy. Get the ids from get_agent and find_connectors first. The user sees the policy warnings and confirms before anything changes.",
  input: z.object({
    agentId: z.string().min(1).describe("The agent's id."),
    connectorId: z.string().min(1).describe("The connector's id (from find_connectors)."),
    readOnly: z.boolean().optional().describe("Block the connector's write tools for this agent."),
  }),
  permission: "manage_mcp_servers",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const p = await plan(ctx, input);
    if ("refuse" in p) return p;
    const details = [
      `Link ${p.connector.name} (${p.tools.length} ${p.tools.length === 1 ? "tool" : "tools"}) to ${p.agent.name}.`,
    ];
    if (input.readOnly) {
      details.push(
        p.blockedTools.length > 0
          ? `Add a strict policy on ${p.agent.name} blocking ${p.blockedTools.length} write ${p.blockedTools.length === 1 ? "tool" : "tools"}. Tools added to the connector later are not covered.`
          : `${p.connector.name} has no write tools, so no policy is needed.`,
      );
    }
    details.push("Recorded in the audit trail.");
    return {
      summary: `Attach ${p.connector.name} to ${p.agent.name}${input.readOnly ? ", read-only" : ""}`,
      details,
      warnings: cardWarnings(p),
      frozen: frozenOf(p),
    };
  },
  run: async (ctx, input) => {
    const p = await plan(ctx, input);
    if ("refuse" in p) throw new Error(p.refuse);

    // Confirm acknowledges what the card showed. If the connector or the
    // agent's policies changed since, the user hasn't seen the new picture.
    const frozen = ctx.confirmation?.frozen;
    const now = frozenOf(p);
    if (!frozen || !sameList(frozen.warningToolIds, now.warningToolIds) || !sameList(frozen.blockedTools, now.blockedTools)) {
      throw new Error("The connector's tools or the agent's policies changed after the confirm card was shown, so nothing was changed. Ask again to see the current warnings.");
    }

    let policyId: string | null = null;
    if (p.blockedTools.length > 0) {
      const policy = await ctx.services.createPolicy(ctx.orgId, {
        name: `${p.connector.name} read-only for ${p.agent.name}`,
        description: `Blocks the write tools of ${p.connector.name} for this agent. Created in the Astra Workspace.`,
        domain: "tool_permissions",
        scopeType: "agent",
        scopeId: p.agent.id,
        status: "active",
        policyJson: { enforcement: "strict", blockedTools: p.blockedTools, source: "astra_workspace", connectorId: p.connector.id },
      });
      policyId = policy.id;
    }

    let link: { id: string };
    try {
      link = await ctx.services.linkConnector(ctx.orgId, p.agent.id, p.connector.id);
    } catch (err) {
      // Don't leave a policy behind for a link that doesn't exist.
      if (policyId) await ctx.services.deletePolicy(ctx.orgId, policyId).catch(() => {});
      throw err;
    }

    // The same audit events the Integrations page writes, so the fleet audit trail shows it either way.
    for (const w of p.warnings) {
      await ctx.services.recordAudit(ctx.orgId, ctx.userId, {
        action: "agent.mcp_policy_mismatch",
        objectType: "agent",
        objectId: p.agent.id,
        details: { serverId: p.connector.id, serverName: p.connector.name, toolName: w.toolName, toolId: w.toolId, riskClassification: w.riskClassification, requiredPolicyDomain: w.requiredPolicyDomain, issue: w.issue, acknowledged: true, via: "astra_workspace" },
      });
    }
    await ctx.services.recordAudit(ctx.orgId, ctx.userId, {
      action: "agent.mcp_server_linked",
      objectType: "agent",
      objectId: p.agent.id,
      details: { serverId: p.connector.id, serverName: p.connector.name, policyWarningsAcknowledged: p.warnings.length, readOnlyPolicyId: policyId, blockedTools: p.blockedTools.length, via: "astra_workspace" },
    });

    const proof: Partial<ProofEnvelope> = {
      context: { status: "measured", summary: `${p.tools.length} connector tools checked against ${p.agent.name}'s policies` },
    };
    const payload = {
      attached: true,
      agent: p.agent,
      connector: p.connector,
      linkId: link.id,
      readOnly: !!input.readOnly,
      readOnlyPolicyId: policyId,
      blockedTools: p.blockedTools,
      warningsAcknowledged: p.warnings.length,
    };
    return {
      payload,
      artifact: { kind: "agent", title: `${p.connector.name} → ${p.agent.name}`, props: { attach: payload }, fullViewHref: `/agents/${p.agent.id}` },
      proof,
    };
  },
};
