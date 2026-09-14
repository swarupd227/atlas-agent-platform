/**
 * How a proposed agent's connector bindings ({server, tool} named by the
 * model) resolve to the organization's real connectors, and what would stop
 * them working. Pure.
 *
 * resolveBindingServer is the matching rule team builds use to link
 * connectors (server/team-build.ts), so a proposal is judged exactly as it
 * will be built.
 */

/** A connector whose name contains the proposed name, or whose first word the proposed name contains. */
export function resolveBindingServer<T extends { name: string }>(serverName: string, servers: T[]): T | undefined {
  return servers.find(s =>
    s.name.toLowerCase().includes(serverName.toLowerCase()) ||
    serverName.toLowerCase().includes(s.name.toLowerCase().split(" ")[0])
  );
}

export type BindingIssueCode = "server_unresolved" | "server_not_connected" | "tool_not_on_server" | "server_no_tools_discovered";

export interface BindingIssue {
  agent: string;
  server: string;
  tool?: string;
  code: BindingIssueCode;
  message: string;
}

export interface BindingConnector {
  id: string;
  name: string;
  /** null for connectors that aren't enterprise integrations (no connection to check). */
  connected: boolean | null;
}

export interface ProposedAgentBindings {
  name: string;
  mcpToolBindings?: Array<{ server: string; tool: string }>;
}

export function assessProposalBindings(
  agents: ProposedAgentBindings[],
  connectors: BindingConnector[],
  toolNamesByConnectorId: Map<string, string[]>,
): { agents: Array<{ name: string; connectors: string[]; issues: BindingIssue[] }>; issues: BindingIssue[] } {
  const out = agents.map((agent) => {
    const issues: BindingIssue[] = [];
    const linked = new Set<string>();
    const bindings = agent.mcpToolBindings ?? [];
    const byServer = new Map<string, string[]>();
    for (const b of bindings) byServer.set(b.server, [...(byServer.get(b.server) ?? []), b.tool]);

    for (const [serverName, tools] of Array.from(byServer.entries())) {
      const connector = resolveBindingServer(serverName, connectors);
      if (!connector) {
        issues.push({ agent: agent.name, server: serverName, code: "server_unresolved", message: `${agent.name} names "${serverName}", which isn't a connector in this organization.` });
        continue;
      }
      linked.add(connector.name);
      if (connector.connected === false) {
        issues.push({ agent: agent.name, server: connector.name, code: "server_not_connected", message: `${connector.name} isn't connected, so ${agent.name}'s calls to it will fail until it is.` });
      }
      const known = toolNamesByConnectorId.get(connector.id) ?? [];
      if (known.length === 0) {
        issues.push({ agent: agent.name, server: connector.name, code: "server_no_tools_discovered", message: `${connector.name} has no discovered tools, so ${agent.name}'s tool names can't be checked.` });
        continue;
      }
      const knownLower = new Set(known.map((t) => t.toLowerCase()));
      for (const tool of Array.from(new Set(tools))) {
        if (!knownLower.has(tool.toLowerCase())) {
          issues.push({ agent: agent.name, server: connector.name, tool, code: "tool_not_on_server", message: `${agent.name} expects a "${tool}" tool on ${connector.name}, which it doesn't have.` });
        }
      }
    }
    return { name: agent.name, connectors: Array.from(linked), issues };
  });
  return { agents: out, issues: out.flatMap((a) => a.issues) };
}
