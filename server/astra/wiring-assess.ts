/**
 * Is a team wired to run? A pure check over a snapshot of the team, its
 * blueprint graph, the agents its nodes use, their connector links and the
 * organization's policies.
 *
 * Blockers stop a run from starting (run_team refuses); warnings are shown
 * but don't; info notes what the run will do (e.g. pause at a gate).
 */
import type { TeamBlueprintEdge, TeamBlueprintNode } from "@shared/schema";
import { validateTeamGraph } from "../team-graph-validate";
import { resolveBindingServer, type BindingConnector } from "../team-bindings";

export type WiringSeverity = "blocker" | "warning" | "info";

export interface WiringIssue {
  severity: WiringSeverity;
  code: string;
  message: string;
  agentId?: string;
  nodeId?: string;
}

export interface WiringAgent {
  id: string;
  name: string;
  status: string;
  agentType: string;
  organizationId: string | null;
  mcpToolBindings: Array<{ server: string; tool: string }>;
  policyBindings: Array<{ policyId?: string; policyName?: string }>;
}

export interface WiringLink {
  serverId: string;
  name: string;
  /** The organization may use this connector. */
  visible: boolean;
  /** null: not an enterprise integration, so there's no connection to check. */
  connected: boolean | null;
  toolNames: string[];
  /** Tools on it that change something (the dispatcher's own rule). */
  writeToolCount?: number;
}

export interface WiringSnapshot {
  orgId: string;
  team: { id: string; name: string; riskTier: string | null; organizationId: string | null; blueprintId: string | null };
  blueprint: { id: string; organizationId: string | null; status: string } | null;
  nodes: TeamBlueprintNode[];
  edges: TeamBlueprintEdge[];
  /** Every agent the team uses (node references and team members), fetched without organization scoping. */
  agents: WiringAgent[];
  /** Connector links per agent id. */
  links: Record<string, WiringLink[]>;
  /** Connectors the organization can use, for resolving named bindings. */
  connectors: BindingConnector[];
  activePolicyIds: string[];
  /** Wave plan result: a cycle makes the graph unrunnable. */
  waves: { totalWaves: number } | { cycleError: string };
}

const RUNNABLE = new Set(["active", "deployed"]);

export function assessTeamWiring(s: WiringSnapshot) {
  const issues: WiringIssue[] = [];
  const add = (severity: WiringSeverity, code: string, message: string, extra: { agentId?: string; nodeId?: string } = {}) =>
    issues.push({ severity, code, message, ...extra });

  if (s.team.organizationId !== s.orgId) add("blocker", "team_other_org", `${s.team.name} doesn't belong to this organization.`);
  if (!s.team.blueprintId || !s.blueprint) {
    add("blocker", "team_blueprint_missing", `${s.team.name} has no team blueprint, so there is nothing to run.`);
  } else {
    if (s.blueprint.organizationId && s.blueprint.organizationId !== s.orgId) {
      add("blocker", "blueprint_other_org", `${s.team.name}'s blueprint belongs to another organization.`);
    }
    if (s.blueprint.status === "draft") add("info", "blueprint_not_compiled", "The team blueprint hasn't been compiled; runs don't require it.");
  }

  const graph = validateTeamGraph({ riskTier: s.team.riskTier }, s.nodes, s.edges);
  for (const e of graph.errors) add("blocker", `graph_${e.type}`, e.message, { nodeId: e.nodeId });
  for (const w of graph.warnings) add("warning", `graph_${w.type}`, w.message, { nodeId: w.nodeId });
  if ("cycleError" in s.waves) add("blocker", "graph_cycle", `The team's steps loop back on themselves, so the run can't be ordered: ${s.waves.cycleError}`);

  const agentsById = new Map(s.agents.map((a) => [a.id, a]));
  const activePolicies = new Set(s.activePolicyIds);
  const usedAgentIds = new Set<string>();

  for (const node of s.nodes) {
    if (node.nodeType === "edge_gate") {
      add("info", "approval_gate", `The run pauses at "${node.label}" for a person to ${node.gateType === "approval" ? "approve" : "decide"}.`, { nodeId: node.id });
      continue;
    }
    if (node.nodeType !== "internal_agent") continue;
    const ref = node.refAgentId ?? node.refTeamAgentId;
    if (!ref) continue; // validateTeamGraph already reports a node with no agent
    const agent = agentsById.get(ref);
    if (!agent) {
      add("blocker", "node_ref_missing", `Step "${node.label}" uses an agent that no longer exists.`, { nodeId: node.id });
      continue;
    }
    usedAgentIds.add(agent.id);
  }
  for (const a of s.agents) usedAgentIds.add(a.id);

  let checks = 0;
  for (const id of Array.from(usedAgentIds)) {
    const agent = agentsById.get(id);
    if (!agent) continue;
    checks++;
    if (agent.organizationId !== s.orgId) {
      add("blocker", "agent_other_org", `${agent.name} belongs to another organization, so it can't run in this team.`, { agentId: agent.id });
      continue;
    }
    if (agent.id !== s.team.id && !RUNNABLE.has(agent.status)) {
      add("warning", "agent_not_runnable_status", `${agent.name} is ${agent.status}.`, { agentId: agent.id });
    }

    const links = s.links[agent.id] ?? [];
    for (const link of links) {
      if (!link.visible) add("blocker", "connector_not_visible", `${agent.name} is linked to "${link.name}", which this organization can't use.`, { agentId: agent.id });
      else if (link.connected === false) add("blocker", "connector_not_connected", `${link.name} isn't connected, so ${agent.name}'s calls to it will fail.`, { agentId: agent.id });
    }

    const byServer = new Map<string, string[]>();
    for (const b of agent.mcpToolBindings) byServer.set(b.server, [...(byServer.get(b.server) ?? []), b.tool]);
    for (const [serverName, tools] of Array.from(byServer.entries())) {
      const connector = resolveBindingServer(serverName, s.connectors);
      if (!connector) {
        add("warning", "binding_server_unresolved", `${agent.name} expects "${serverName}", which isn't a connector here.`, { agentId: agent.id });
        continue;
      }
      const link = links.find((l) => l.serverId === connector.id);
      if (!link) {
        add("warning", "binding_server_not_linked", `${agent.name} expects ${connector.name} but isn't linked to it.`, { agentId: agent.id });
        continue;
      }
      if (link.toolNames.length === 0) {
        add("warning", "server_no_tools_discovered", `${connector.name} has no discovered tools, so ${agent.name}'s tools can't be checked.`, { agentId: agent.id });
        continue;
      }
      const known = new Set(link.toolNames.map((t) => t.toLowerCase()));
      for (const tool of Array.from(new Set(tools))) {
        if (!known.has(tool.toLowerCase())) add("warning", "binding_tool_missing", `${agent.name} expects "${tool}" on ${connector.name}, which it doesn't have.`, { agentId: agent.id });
      }
    }

    for (const p of agent.policyBindings) {
      if (p.policyId && !activePolicies.has(p.policyId)) {
        add("warning", "policy_binding_inactive", `${agent.name} is bound to ${p.policyName ? `"${p.policyName}"` : "a policy"} that isn't active or doesn't exist.`, { agentId: agent.id });
      }
    }
  }

  const count = (sev: WiringSeverity) => issues.filter((i) => i.severity === sev).length;
  return {
    ready: count("blocker") === 0,
    blockers: count("blocker"),
    warnings: count("warning"),
    gates: issues.filter((i) => i.code === "approval_gate").length,
    agentsChecked: checks,
    totalWaves: "totalWaves" in s.waves ? s.waves.totalWaves : null,
    issues,
  };
}

export type WiringReport = ReturnType<typeof assessTeamWiring>;
